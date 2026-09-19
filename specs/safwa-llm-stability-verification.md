# LLM stability fix — verification tracking

Companion to `safwa-llm-stability-plan.md` (rev 1, post-Codex). Tracks each
audited finding, the fix that landed, and the measured before/after evidence.
Baseline = replay of live session `LqSlwS3XLGk` (123 comments, 76 handles,
78 min) through the real pipeline + live Worker under the OLD context-keyed
outcome cache; "after" = the same replay driving the patched semantics.

## Scorecard

| # | Finding | Fix | Before | After | Status |
|---|---------|-----|--------|-------|--------|
| 1 | Volatile outcome key → re-review churn | `appliesTo` on stable identity (text + reviewKind + prev-block head sourceId + allowContinuation) + candidate-set validity for negative verdicts | 964 calls / 123 comments (~8x), 14 passes, never converged | **232 calls** (~1.9x), converged in 5 passes | ✅ fixed |
| 2 | Permanent `pendingReview` after TTL/failure/eviction | `scheduleLlm` returns schedulability; refusal/expiry/exhaustion settle the row; bounded retry (4 attempts, 15 s rebuild timer); master-off/on rebuilds | ~10 comments stuck pending; @shaki60/@Da7w7-k classified 14x, never resolved | **0 pending leftovers**; those comments now resolve to hidden extras | ✅ fixed |
| 3 | Inapplicable verdicts consumed but never re-reviewed | consumed-but-still-pending → force re-review while budget lasts, then settle | duplicate-with-dead-target stuck pending forever | re-reviews bounded by cap; regression test added | ✅ fixed |
| 4 | Verdicts bound to volatile list positions | `match` → `targetMatchKey` bound at request time; `state.redirects` tombstones for folded/merged targets; strict binding (no positional fallback once bound) | reorder/unregister invalidated every verdict | tombstone + reorder regression tests pass | ✅ fixed |
| 5 | Master off/on never resumes reviews | `rebuildFromRecords` on re-enable reschedules eligible reviews | reviews cancelled and never rescheduled | reschedules on re-enable | ✅ fixed |
| 6 | Hide→pending→hide flicker during re-review | holdover: candidate-invalidated verdict keeps applying while replacement review runs | extras flickered each rebuild (visible in replay as repeated re-classify) | verdicts hold through re-review; replay shows stable dispositions | ✅ fixed |
| 7 | Continuation over-join risk on genuine 2nd questions | deferred (prompt change needs Worker redeploy; documented in plan F4) | @AWA_Lifestyle judged "continuation" 14x | unchanged this round | ⏸ deferred |
| 8 | First questions folded by cross-person semantic dup | working as designed — folded rows remain in "سوال‌های جمع‌شده"; no change | 3 first-questions folded | same (10 in replay incl. model variance) | ⏸ by design |

## Regression gates

| Gate | Result |
|------|--------|
| `npm test` | ✅ 294 checks green (session suite 21→27, +6 new regression tests) |
| `npm run build:manifest` | ✅ |
| Replay: LLM calls | ✅ 232 vs 964 baseline (-76%) |
| Replay: pending leftovers | ✅ 0 (was ~10 stuck) |
| Replay: hidden/visible | 47 folded (6 greeting, 20 dup, 20 extra, 1 courtesy); 8 continuations joined; 1 settled visible extra |
| Replay: attempt cap | ✅ no comment exceeded 4 attempts (dist: 1×40, 2×48, 3×20, 4×9) |

## Teacher's complaint — direct evidence of fix

- `@shaki60` 76:36 (رفع یدین — genuinely different topic): baseline classified
  "extra" 14× and never resolved → **now hidden as confirmed extra**.
- `@Da7w7-k` 77:33 (found gold sold for a phone): same → **now hidden**.
- `@EzatUllah-f7q` 44:32 ("I asked a question, no answer") — not a question;
  settled as courtesy/greeting fold.

## Notes

- `duplicate`-type decisions never have `pendingReview` stripped: reachability
  + fail-visible requires an unconfirmed fuzzy dup to stay visible.
- Retries: ≤4 attempts/sourceId/epoch cumulative; the 3-consecutive-failures →
  60 s pause is unchanged. All failure kinds are retryable (typed failures
  deferred — bounded waste beats contract churn).
- Candidate-addition invalidation is conservative by design (Codex review):
  a stored negative verdict re-reviews only when a NEW signature enters its
  room context — that is what a missed duplicate requires.
- Known tuning headroom (not done): candidate additions could be filtered to
  plausible-dup candidates only (Jaccard/Levenshtein pre-check), cutting most
  of the remaining ~115 re-reviews; defer until the simple version proves out
  on a real session.
