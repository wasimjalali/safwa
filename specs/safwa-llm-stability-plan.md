# Ṣafwa — LLM review stability fix plan

Date: 2026-09-19 · Basis: full audit of session `LqSlwS3XLGk` (2026-09-18 broadcast,
123 YouTube comments replayed through the real pipeline + live `safwa-llm` worker).

## Evidence summary (measured, not guessed)

- 117/123 comments required an LLM review; only 6 exact duplicates resolved locally.
- Replaying to fixpoint against the live worker took **964 calls (~8× amplification)**
  and still left 17 reviews unresolved after 14 rebuild passes.
- Root cause: `reviewKey`/`contextKey` embeds the *entire volatile context* —
  the numbered `recentQuestions` list (order-sensitive, up to 30 entries),
  `previousBlock` text, `allowContinuation`. Every `rebuildFromRecords` recomputes
  it; one merge/unregister anywhere invalidates every other stored outcome →
  re-review churn, hidden extras flickering back to pending-visible, and queue/TTL
  pressure during the opening burst (48 comments in the first 5 min).
- Terminal pending states: a failed classification is stored and **never retried**;
  `LLM_ADMISSION_TTL_MS` (~13 min) is a hard wall; a "continuation" verdict that
  cannot merge (fragment cap / target hidden / JOIN off) returns the still-pending
  decision. All three leave the "سوال دوم این شخص" badge visible forever — the
  teacher's exact complaint.
- `isContinuation` is exported but dead code: every 2nd+ comment needs the network.

## Fix list (ordered by impact)

### F1 — Stable review-outcome identity (the churn fix)

`session.js` + `grouping.js`:

- Split identity into a **stable applicability key** and the request-time context:
  `applicabilityKey = JSON.stringify([displayText, reviewKind, prevBlockKey, allowContinuation])`
  where `prevBlockKey = decision.previousBlock?.matchKey ?? null` (a block's matchKey
  is its head fragment's — `mergeContinuation` never changes it). `recentQuestions`
  is **removed** from the key.
- When a `duplicate` verdict arrives, translate `match` (index into the
  request-time `recentQuestions` snapshot stored on the job) into the target's
  `matchKey` at completion time, and store it on the outcome:
  `outcome = { result: {classification, match, targetMatchKey?}, appliesTo, attempts, failed? }`.
- `applyLlmOverride` learns an optional `llmResult.targetMatchKey`: resolve via
  `state.signatures.get(targetMatchKey)` — order-independent, survives list
  reordering. Falls back to the existing index resolution when absent (pure-core
  tests keep passing index-only results). If the target signature is gone
  (itself merged/collapsed since), the verdict can't apply → local decision stands
  (visible) — same as today.
- `rebuildFromRecords` applies a stored outcome when
  `cached.appliesTo === applicabilityKey(copy, decision)`. Unrelated signature
  churn no longer invalidates reviews; a genuinely different `previousBlock`
  (person's thread moved) still correctly re-reviews.
- Expected effect on the replayed session: ~117 calls instead of ~964, zero
  flicker, extras resolve once and stay resolved.

### F2 — Bounded retry instead of never-retry

- Per-sourceId `attempts` counter inside the outcome record. A failed
  classification (timeout / 502 / 429 / parse) may be re-queued up to
  `LLM_MAX_ATTEMPTS = 3` total, only via the normal bounded queue (still subject
  to in-flight cap, pause-after-3-consecutive-failures, and admission TTL).
- Attempts are cumulative per sourceId per epoch — a context change does not
  grant a fresh budget beyond the cap (prevents storms; preserves the intent of
  "don't retry the same failed request after every other AI result" while allowing
  retries for genuinely transient failures).

### F3 — Terminal pending-state resolution

A comment whose review can never produce an applied verdict must not show
`pendingReview` forever:

- `scheduleLlm` returns whether a job was actually queued. When it refuses
  (TTL expired, LLM disabled, attempts exhausted, master off), the stored decision
  is written with the review fields stripped (`needsLlmReview` etc. removed) —
  visible, badged, but no longer "being checked".
- Same in `rebuildFromRecords`: pending flag survives only while a review is
  queued/in-flight or still schedulable.
- `applyLlmOverride`, `decision.type === "extra"` + `classification ===
  "continuation"` that cannot merge (cap/hideConfirmed/JOIN off): return
  `resolvedDecision(decision)` instead of the still-pending decision — the model
  answered; the row settles as a visible flagged extra.

### F4 — Deliberately NOT changed, with reasons

- **same_person continuation bias** ("tie → continuation"): intentional fail-safe;
  wrongly splitting is cheap, wrongly hiding is the costliest failure. The observed
  over-joins are real but mild (text stays visible inside the first card).
  Changing the prompt also requires a Worker redeploy and a prompt-allowlist
  transition window — deferred, documented.
- **Cross-person semantic-dup folding of first questions**: working as designed;
  folded rows remain reachable in "سوال‌های جمع‌شده". No code change.
- **`isContinuation` local fast-path**: tempting, but a wrong *local* join silently
  drops the second-question flag with no confirmation step — against the v2
  "LLM confirms before we join" invariant. With F1 removing the churn, the LLM
  path is affordable. Not reinstated.

## Tests

`test/session-test.js` additions (harness already stubs DOM/chrome/timers/LLM):

1. Outcome survives unrelated churn: A extra reviewed "extra"; a later merge
   unregisters a signature that was in A's `recentQuestions` → rebuild → A stays
   hidden, `classifyComment` NOT called again for A.
2. `duplicate` verdict with `match` index: after a reordering merge, the verdict
   still collapses onto the *same* question (via stored `targetMatchKey`), not
   whatever now sits at that index.
3. Failed classification is retried (bounded): classify fails once → rebuild →
   second attempt scheduled; after cap, row loses `pendingReview` and stays
   visible.
4. Rejected continuation (fragment cap) clears `pendingReview`.
5. Existing suite stays green (288 tests) — reviewKey/contextKey call sites
   updated consistently.

## Verification

- `npm test` green.
- Re-run the `LqSlwS3XLGk` fixture through the patched outcome logic (Node replay
  harness with a scripted classifier): assert ~1 call per review-needed comment,
  no review re-issued after an unrelated merge, no pending leftovers.
- `npm run build:manifest` succeeds.
- Live smoke (documented gate): load unpacked, open a studio, confirm `[Ṣafwa]`
  lines clean and extras resolve.

## Deploy note

No prompt or Worker change in this round — no redeploy required. All changes are
extension-side (`src/session.js`, `src/grouping.js`, `src/dedup.js`,
`src/state.js`, tests).

---

## Revision 1 — after Codex review (gpt-5.6-sol, xhigh). Verdict: "needs changes".

All eight findings accepted; design revised:

- **Applicability key** = `[displayText, reviewKind, prevHeadSourceId,
  allowContinuation]` where `prevHeadSourceId` is the sourceId of the previous
  block's head fragment (`decision.previousBlock.fragments[0]` via objectSource).
  Unique per block, stable across rebuilds and merges, changes only when the
  person's previous-question identity genuinely changes. `gapMs`/`previousText`
  deliberately excluded (they drift under merges; verdicts are robust to it).
- **Candidate-set validity for negative verdicts**: each stored outcome records
  `candidates` = Set of `recentQuestions` matchKeys at request time
  (null for courtesy — the model never sees them). At rebuild a negative verdict
  (primary/extra/continuation/greeting) applies iff *every current candidate
  matchKey is in the stored set* — additions invalidate, removals/reorders do
  not. Positive `duplicate` verdicts skip the check: they depend only on their
  bound target.
- **Tombstone redirects**: `state.redirects: Map<matchKey, matchKey>`. A
  semantic collapse writes `deadKey → survivingTargetKey`. `checkDuplicate`
  consults it on exact-miss (a later identical text folds onto the surviving
  question without an LLM call). `resolveDuplicateTarget` follows it.
- **Strict binding**: when `targetMatchKey` is present on the result, resolution
  is strict (`signatures.get` → redirect → null). No `decision.target` fallback
  after a provided binding fails. The index path remains only when the property
  is genuinely absent (legacy pure-core callers/tests).
- **Consumed-but-inapplicable verdicts**: if `applyLlmOverride` returns a
  decision that is still `needsLlmReview` after a verdict was consumed, the
  review is re-queued with `force` while `attempts < LLM_MAX_ATTEMPTS` (4);
  otherwise the row settles.
- **Lifecycle**: `scheduleLlm(comment, decision, sourceId, {force})` returns
  whether a live/queued/applicable review exists. Queue evictions leave pending
  (next rebuild reschedules); TTL expiry inside `drainLlm` settles the stored
  decision (`pendingReview=false`, except `duplicate` decisions — stripping
  would let an unconfirmed fuzzy dup fold, violating reachability+fail-visible);
  `recordLlmFailure` schedules a delayed `rebuildFromRecords` (15 s) which
  re-queues retryable failures; master off→on calls `rebuildFromRecords` so
  eligible reviews resume.
- **Retry**: all failure kinds retryable up to 4 total attempts per sourceId per
  epoch (typed failures deferred — bounded waste is cheaper than contract churn);
  the existing 3-consecutive-failures → 60 s pause approximates `Retry-After`.
- **Tests**: the suite's "failed reviews never retry / changed-context re-review
  / offline pending" assertions are intentionally updated; new tests cover
  candidate addition invalidation, removal/reorder stability, head-identity
  change, tombstone redirect, strict binding, eviction, queued-TTL expiry,
  master off/on, and churn (no re-review after unrelated merges).
