[0m
> build · glm-5.3
[0m
[0m$ [0mgit status && git log --oneline -15 && git branch -a
On branch feat/safwa-v2-sidebar
Your branch is up to date with 'origin/feat/safwa-v2-sidebar'.

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	specs/counsel/v2-review-glm-iter2.md

nothing added to commit but untracked files present (use "git add" to track)
a1f1853 Fix v2 review findings and apply owner UX decisions
c6e4672 Ship Ṣafwa v2: sidebar panel on a DOM-authoritative pipeline
376b687 Merge pull request #17 from wasimjalali/fix/popup-height-and-join-wording
9536e76 Tighten the popup and keep the last help panel readable.
e40d789 Merge pull request #16 from wasimjalali/feat/keep-greeting-plus-question
8fdcc88 Keep questions that start with a greeting visible.
d0159d7 Merge pull request #15 from wasimjalali/feat/llm-confirm-hide-and-count
a99156c Hide Islamic greetings by default so the live panel stays question-focused.
cb8c0f6 Bump the Chrome package to 1.0.2 for the Web Store upload.
23cff64 Give the teacher four Dari settings, each with a short on/off explanation.
b3e9856 Let the LLM confirm hide-and-count where regex is uncertain.
0ee6d5b Merge pull request #14 from wasimjalali/fix/live-dom-selectors
7bef261 fix: restore live comment discovery and recycled-row safety
f8addb2 Merge pull request #13 from wasimjalali/chore/discovery-ground-truth
4b7ad7c chore: discovery tool also dumps the first comment row's HTML as ground truth
  chore/discovery-ground-truth
  chore/dom-discovery-console
  chore/store-assets
  feat/live-chat-replay
  feat/privacy-policy-route
* feat/safwa-v2-sidebar
  fix/live-dom-selectors
  fix/manifest-description-length
  fix/prelaunch-audit
  main
  remotes/origin/HEAD -> origin/main
  remotes/origin/chore/discovery-ground-truth
  remotes/origin/chore/dom-discovery-console
  remotes/origin/chore/store-assets
  remotes/origin/feat/keep-greeting-plus-question
  remotes/origin/feat/live-chat-replay
  remotes/origin/feat/llm-confirm-hide-and-count
  remotes/origin/feat/privacy-policy-route
  remotes/origin/feat/safwa-v2-sidebar
  remotes/origin/fix/live-dom-selectors
  remotes/origin/fix/manifest-description-length
  remotes/origin/fix/popup-height-and-join-wording
  remotes/origin/fix/prelaunch-audit
  remotes/origin/main
[0m
[0m$ [0mgit diff main...HEAD --stat
captures/ws-2026-09-11/streamyard-ws-evidence.json | 125 +++
 manifest.json                                      |  40 +-
 manifest.v1.json                                   |  42 +
 package.json                                       |   7 +-
 panel/panel.css                                    | 416 ++++++++++
 panel/panel.html                                   |  52 ++
 panel/panel.js                                     | 558 +++++++++++++
 popup/popup.css                                    |  35 +
 popup/popup.html                                   |   2 +
 popup/popup.js                                     | 100 ++-
 safwa-debug-handoff.md                             | 218 +++++
 safwa-teacher-brief.html                           | 362 +++++++++
 specs/counsel/SYNTHESIS.md                         | 110 +++
 specs/counsel/USER-DIRECTIVE-2026-09-11.md         |  35 +
 specs/counsel/WS-EVIDENCE-2026-09-11.md            |  92 +++
 specs/counsel/astra-prompt.md                      |  22 +
 specs/counsel/astra-revision-prompt.md             |  14 +
 specs/counsel/fable-prompt.md                      |  25 +
 specs/counsel/glm-5.3-flash.md                     | 138 ++++
 specs/counsel/glm-5.3.md                           | 242 ++++++
 specs/counsel/gpt-5.6-luna.md                      | 447 +++++++++++
 specs/counsel/gpt-6-astra-final-clean.md           | 894 +++++++++++++++++++++
 specs/counsel/gpt-6-astra-revision-clean.md        | 318 ++++++++
 specs/counsel/grok-4.6.md                          | 344 ++++++++
 specs/counsel/hy4-preview.md                       | 249 ++++++
 specs/counsel/kimi-k3.md                           | 164 ++++
 specs/counsel/muse-spark-1.3.md                    | 133 +++
 specs/counsel/qwen3.8-max.md                       | 214 +++++
 specs/counsel/rereview-glm-5.3.md                  | 131 +++
 specs/counsel/review-glm-5.3.md                    | 167 ++++
 specs/counsel/review-grok-4.6.md                   |  46 ++
 specs/counsel/review-muse-spark.md                 | 183 +++++
 specs/counsel/review-prompt.md                     |  39 +
 specs/counsel/v2-review-glm-iter1.md               | 870 ++++++++++++++++++++
 specs/safwa-v2-architecture.md                     | 656 +++++++++++++++
 specs/websocket-counsel-brief.md                   | 346 ++++++++
 src/admission.js                                   | 576 +++++++++++++
 src/config.js                                      | 107 ++-
 src/content-legacy.js                              | 426 ++++++++++
 src/content.js                                     | 347 +-------
 src/dom.js                                         |  82 +-
 src/health.js                                      | 228 ++++++
 src/panel-model.js                                 | 194 +++++
 src/protocol.js                                    | 125 +++
 src/proxy-rules.js                                 |  59 ++
 src/session.js                                     | 859 ++++++++++++++++++++
 src/sw.js                                          |  82 ++
 src/ui.js                                          |  83 +-
 src/ws-bridge.js                                   | 283 +++++++
 src/ws-main.js                                     | 294 +++++++
 src/ws-parser.js                                   | 477 +++++++++++
 store-assets/screenshot-1-teacher.png              | Bin 77003 -> 0 bytes
 store-assets/screenshot-2-regex-dedup.png          | Bin 117890 -> 0 bytes
 store-assets/screenshot-3-semantic.png             | Bin 111330 -> 0 bytes
 styles.css                                         |  38 +-
 test/admission-test.js                             | 634 +++++++++++++++
 test/content-count-recycle-test.js                 | 239 ++++++
 test/content-llm-stale-test.js                     |   2 +-
 test/content-retry-test.js                         |   2 +-
 test/content-virtual-anchor-test.js                |   2 +-
 test/content-virtualization-test.js                |   2 +-
 test/discovery-selftest.html                       |  37 +
 test/feature-proxy-test.js                         | 124 +++
 test/fixtures/ws-2026-09-11-events.json            |  50 ++
 test/health-test.js                                | 280 +++++++
 test/native-safety-test.js                         |  88 ++
 test/panel-model-test.js                           | 173 ++++
 test/panel-render-test.js                          | 163 ++++
 test/protocol-test.js                              | 138 ++++
 test/ui-safety-test.js                             |  15 +
 test/ws-parser-test.js                             | 569 +++++++++++++
 tools/build-manifest.js                            | 217 +++++
 72 files changed, 14453 insertions(+), 378 deletions(-)
[0m
[0m# [0mTodos
[•] Read round-1 review findings (v2-review-glm-iter1.md) + prior commit
[ ] Run npm test
[ ] Verify each round-1 critical/high finding is fixed
[ ] Hunt new defects: session.js (LLM scheduler, dirty PATCH diff)
[ ] Hunt new defects: panel.js (members/ack/health-watchdog/scroll)
[ ] Hunt new defects: proxy-rules.js, ws-main queue-drop, build-manifest pairing, config labels
[ ] Write round-2 findings report
[0m
[0m→ [0mRead specs/counsel/v2-review-glm-iter1.md
[0m
[0m$ [0mnpm test 2>&1
> safwa@2.0.0 test
> node test/run-tests.js && node test/ws-parser-test.js && node test/health-test.js && node test/admission-test.js && node test/protocol-test.js && node test/panel-model-test.js && node test/feature-proxy-test.js && node test/native-safety-test.js && node test/panel-render-test.js && node test/content-retry-test.js && node test/content-virtualization-test.js && node test/content-virtual-anchor-test.js && node test/content-llm-stale-test.js && node test/content-count-recycle-test.js && node test/ui-safety-test.js


normalize.js - Persian/Dari
  PASS  folds Arabic yeh/kaf and removes tatweel (same question, two keyboards)
  PASS  strips harakat (vowel marks)
  PASS  normalizes ZWNJ (می‌روم == میروم)
  PASS  folds Persian and Arabic-Indic digits to ASCII
  PASS  strips a leading Dari honorific/greeting
  PASS  still normalizes Latin text (safe fallback)

dedup.js (jaccard token-set similarity)
  PASS  identical token sets => 1.0
  PASS  disjoint token sets => 0.0
  PASS  reordered Dari question scores at/above the 0.85 threshold

state.js
  PASS  identity key is platform + handle (no cross-platform linking)
  PASS  identity folds the handle: Arabic vs Persian keyboard spelling = same person
  PASS  identity folds Latin case and spacing: 'Ahmad  Khan' == 'ahmad khan'
  PASS  different names stay different people

Acceptance criteria (spec Section 15) - Dari
  PASS  1) same exact question x3 => shown once, count 3
  PASS  KEY: Arabic-keyboard spelling of the same question collapses as an exact duplicate
  PASS  2) reworded/reordered near-duplicate is caught at default threshold
  PASS  3) split question (same handle, in window, with cue) => one merged block
  PASS  4) genuine second question later (outside window) => flagged extra
  PASS  5) two different short questions from two handles => never merged
  PASS  4b) distinct second question INSIDE window, no cue => extra

Cross-platform rules (your requirements)
  PASS  same text from two platforms => collapsed as a duplicate
  PASS  same handle on two platforms, two questions => BOTH primary (no person-linking)
  PASS  duplicate that only matches after a leading honorific is stripped
  PASS  same person, handle typed on two keyboards => second question flagged extra

Continuation cap & greeting pre-filter (new requirements)
  PASS  continuation is capped: question + ONE continuation kept, a third in-window fragment is blocked
  PASS  a clearly separate, later second question is flagged extra, withinWindow=false
  PASS  a quick second comment inside the window is flagged extra, withinWindow=true
  PASS  MAX_COMMENTS_PER_QUESTION is honored as the cap value
  PASS  LLM context window is 30 unique questions
  PASS  a greeting-only comment does not consume the person's one question slot
  PASS  regex greetings hide by default and stay visible when the teacher turns the toggle off
  PASS  blessing-only comments fold to a greeting
  PASS  a courtesy variant waits for the LLM and does not hide or take the question slot
  PASS  hiding greetings off still classifies courtesy and does not take the slot
  PASS  a real short question is not treated as a courtesy maybe
  PASS  double-send: identical re-send inside the window collapses as a duplicate, never merges
  PASS  double-send keeps the block open: a genuine continuation after the re-send still merges
  PASS  a bare greeting normalizes to isGreetingOnly
  PASS  a question that starts with a greeting stays a visible primary
  PASS  thanks in the same line does not hide a leftover question

Real-session regressions (found by replaying a live YouTube chat)
  PASS  real session: greeting «اسلام علیکم ورحمت الله استاد» is fully stripped
  PASS  real session: «ادامه»-announced fragment 36s later still joins the question
  PASS  real session: a fragment ending «...ادامه» announces the next one past the window
  PASS  real session: explicit marker does NOT defeat the fragment cap or the far limit
  PASS  real session: plain second question far later is still an extra (marker changes nothing)

Semantic dedup - LLM escalation flags (regex cannot catch these)
  PASS  semantic duplicate (perfume/fasting): regex says primary, flags for LLM review
  PASS  semantic duplicate (fasting/travel): regex says primary, flags for LLM review
  PASS  semantic distinct (Friday prayer vs fasting, both about travel): both primary, LLM review flagged
  PASS  first comment in a stream has no LLM review (nothing to compare against)
  PASS  exact duplicate is NOT flagged for LLM review (regex already caught it)
  PASS  synonym واجب/فرض: regex leaves both primary for LLM
  PASS  gold jewelry vs coins: regex leaves both primary for LLM

LLM routing (regex-certain vs regex-uncertain)
  PASS  partial-overlap fuzzy is NOT auto-hidden; it waits for the LLM
  PASS  cue-less split (no ادامه / connector) is extra for the LLM, not auto-joined
  PASS  over-cap extra must not be joinable by the LLM
  PASS  announced ادامه continuation still skips the LLM
  PASS  greeting does not go to the LLM
  PASS  JOIN_CONTINUATIONS false: a cued split is not merged
  PASS  readStoredSettings defaults every flag on when storage is empty
  PASS  readStoredSettings honors an explicit false
  PASS  applyStoredSettings writes teacher flags onto a runtime config
  PASS  applyStoredSettings honors hiding greetings off
  PASS  all five teacher flags reach the runtime fields the pipeline reads
  PASS  JOIN_CONTINUATIONS false: LLM continuation does not merge

applyLlmOverride
  PASS  semantic duplicate: LLM hide + count on the original
  PASS  semantic distinct: LLM primary leaves both questions in the store
  PASS  LLM primary on an extra does not hide (fail-safe)
  PASS  LLM timeout / garbage leaves the regex extra visible
  PASS  LLM confirms extra: hide, no join
  PASS  LLM joins a cue-less split as a continuation
  PASS  LLM restatement of the same person's question counts as N
  PASS  LLM cannot join past the fragment cap — leave the fragment visible
  PASS  fuzzy LLM confirm hides like an exact duplicate
  PASS  fuzzy LLM reject promotes a first-time asker to primary
  PASS  LLM duplicate without a match index does not hide when several candidates exist
  PASS  same-person fuzzy + primary stays visible extra, not hidden
  PASS  stale primary LLM duplicate does not close a newer extra block
  PASS  later paraphrase still has the earlier question in the 30-deep context
  PASS  LLM greeting on a courtesy maybe hides and still leaves the next ask as primary
  PASS  LLM primary on a courtesy maybe promotes it to a real question
  PASS  LLM greeting on a real question is ignored
  PASS  LLM greeting on a skipCourtesy leftover frees the person's question slot
  PASS  stale LLM primary on courtesy does not become extra after a later ask

parseLlmResponse
  PASS  accepts duplicate with match index
  PASS  accepts continuation / extra / primary / greeting
  PASS  rejects garbage

86 passed, 0 failed

1. fixture integrity
  PASS  fixture carries the expected eight labeled entries
  PASS  every entry raw parses as JSON and nested body.message parses
  PASS  no live token, JWT, or real handle survives in the fixture file

2. comment.created.first exact mapping
  PASS  status ok, one comment, no diagnostics
  PASS  every mapped field is exact
  PASS  batched broadcastId/destinationId are inherited from the enclosing batch
  PASS  containsQuestion is ignored entirely

3. comment.created.duplicate (pure parser returns it again)
  PASS  status ok with the same normalized comment and sourcePos 13
  PASS  identical identity fields across both deliveries

4. comment.updated.in
  PASS  one event, zero comments, no shown inference

5. broadcast.update.shownCommentIds
  PASS  one shownSet event with the explicit array
  PASS  synthetic broadcast.status without shownCommentIds yields no update

6. comment.starred
  PASS  one starred event, zero comments, positive state only

7. outbound and recognized-unrelated frames are ignored
  PASS  comment.showRequest.out, api.hello.out, heartbeat.ping -> ignored
  PASS  synthetic inbound heartbeats on both endpoints -> ignored
  PASS  recognized unrelated room commands -> ignored

8. synthetic malformed and unknown cases
  PASS  synthetic: truncated outer JSON -> malformed frame.json.parseFailed
  PASS  synthetic: broken inner escaping -> malformed room.innerJson.parseFailed
  PASS  synthetic: wrong field types -> malformed, zero comments
  PASS  synthetic: missing id -> comment.missingId
  PASS  synthetic: missing name -> comment.missingName
  PASS  synthetic: unsafe pos -> room.badPos, whole batch rejected
  PASS  synthetic: one bad item rejects the whole batch (no partial output)
  PASS  synthetic: unsupported content type -> unsupportedContent, no partial comment
  PASS  synthetic: batch/item broadcastId contradiction -> comment.batchIdContradiction
  PASS  synthetic: unknown inner type -> unknown room.appMessage.unknownInnerType
  PASS  synthetic: unknown room command -> unknown room.unknownCommand
  PASS  synthetic: unknown subscription -> unknown api.update.unknownSubscription
  PASS  synthetic: binary input -> malformed unsupportedBinary
  PASS  synthetic: unsupported endpoint -> malformed unsupportedEndpoint
  PASS  synthetic: hostile inputs never throw and always return the full shape

9. synthetic mapping details
  PASS  synthetic: text segments concatenate in order with no invented separator
  PASS  synthetic: platform is lowercased and passed through without per-platform branches
  PASS  synthetic: avatars must be https URLs without credentials, else dropped
  PASS  synthetic: compatible item-level identity is accepted

ws-parser tests: 35 passed, 0 failed

health.js - bridge thresholds
  PASS  bridge starts unknown and turns ok on the handshake
  PASS  missing handshake by handshakeMs demotes the bridge and latches
  PASS  missing bridge health after bridgeHealthMs demotes the bridge
  PASS  inbound frames keep the bridge healthy

health.js - socket failures
  PASS  constructor replacement / close / error demote immediately
  PASS  a malformed recognized frame demotes its endpoint immediately
  PASS  a contradiction demotes the affected endpoint immediately

health.js - unknown-schema thresholds
  PASS  three consecutive unknown schemas demote the endpoint
  PASS  a recognized frame resets the consecutive unknown counter
  PASS  five unknown schemas within 30 seconds demote even when interleaved
  PASS  the unknown-schema window expires after 30 seconds

health.js - traffic silence
  PASS  room silence demotes room at roomSilenceMs and never recovers
  PASS  api silence marks state unknown (stale) without latching; a frame restores ok
  PASS  a new connection generation restarts silence windows without raising latches

health.js - effectiveSource
  PASS  effectiveSource follows mode, bridge health and room demotion only
  PASS  non-primary modes always report dom
  PASS  snapshot returns fresh plain objects

17 passed, 0 failed

admission.js - delivery dedupe (measured fixture pair)
  PASS  fixture duplicate pair yields exactly one admitted occurrence
  PASS  a repeat delivery before admission never enqueues a second candidate
  PASS  two distinct socket ids with identical text stay two records
  PASS  admitDom refuses a second record for an already-admitted transport id

admission.js - correlation window
  PASS  a candidate inside correlateMs correlates and prefers the socket payload
  PASS  a candidate outside correlateMs never correlates and is dropped
  PASS  enrich mode merges socket metadata onto a DOM-first record, keeping DOM text
  PASS  primary mode replaces a fold-equal DOM text with the complete socket text
  PASS  a contradictory repeat is reported, never merged

admission.js - ordering metadata
  PASS  pos scoping, gaps, equal timestamps and generations never move a row
  PASS  the same comment id in two broadcasts is two records (scoped identity)

admission.js - identity
  PASS  personKeyFor prefers authorPlatformId, falls back to the folded handle
  PASS  records expose the stable id and the fallback key through personKeyFor
  PASS  rebuilt signals that a stable author id splits an existing folded-handle identity

admission.js - state events
  PASS  shownSet replaces the whole set, supports multiple ids and rejects a missing field
  PASS  starred sets positive state only and is idempotent
  PASS  commentUpdated marks stageUpdated and never implies shown
  PASS  DOM/log modes never take shown or starred state from socket events

admission.js - modes, bounds and defensive reads
  PASS  log mode is diagnostics-only and mutates no transport state
  PASS  off mode is inert
  PASS  pending candidates are bounded and overflow is reported
  PASS  invalid parse results never throw and never mutate state
  PASS  diagnostics are bounded per call

admission.js - reset and sequence
  PASS  reset clears records, indexes, pending candidates and the sequence

24 passed, 0 failed
  PASS  PORT_NAME is stable
  PASS  makeEnvelope sets version and type
  PASS  valid subscribe message accepted
  PASS  wrong documentToken rejected
  PASS  wrong sessionEpoch rejected
  PASS  unknown type rejected
  PASS  revision gap reported for PATCH
  PASS  non-serializable payload rejected
  PASS  cold handshake accepted only for unbound SUBSCRIBE/RESYNC
  PASS  valid feature request accepted
  PASS  feature request missing target rejected
  PASS  feature result outcome validated
protocol tests: 12 passed, 0 failed
  PASS  primary rows project in admission order with anatomy
  PASS  duplicate folds onto target with members and count label
  PASS  continuation exposes fragments and first-fragment label
  PASS  unconfirmed extra stays visible with the second-question badge
  PASS  confirmed extra is hidden but stays reachable in folded
  PASS  platform icons exist for the measured platforms plus fallback
  PASS  pending review flag preserved
  PASS  hidden greeting stays reachable in folded
  PASS  feature unavailable without dom anchor or when shown
  PASS  duplicate with unknown target stays reachable in folded
  PASS  describeHealth maps states to label keys
panel-model tests: 11 passed, 0 failed
  PASS  fully validated request is allowed exactly once
  PASS  disabled proxy refuses
  PASS  wrong session token refuses
  PASS  wrong epoch refuses
  PASS  expired request refuses
  PASS  missing record or disconnected anchor refuses
  PASS  stale source revision refuses
  PASS  already shown refuses (never toggle off air)
  PASS  recycled row content mismatch refuses
  PASS  indistinguishable twins refuse
  PASS  missing or duplicated button refuses
  PASS  null request refuses without throwing
feature-proxy tests: 12 passed, 0 failed
  PASS  v2 session.js performs no native DOM writes
  PASS  v2 content.js performs no native DOM writes
  PASS  the show-control selector lives only in config.js + dom.js
  PASS  the v2 manifest injects no stylesheet and no UI script
  PASS  the only native action call in session.js is the validated click
native-safety tests: 5 passed, 0 failed
  PASS  renderRow renders without throwing and carries the row id
  PASS  the platform icon element is produced (undefined-helper regression)
  PASS  avatar fallback uses the handle initial
  PASS  duplicate members render a reachable disclosure
  PASS  a row without members renders no disclosure
panel-render tests: 5 passed, 0 failed
content.js late-panel retry regression: PASS
[Ṣafwa] content script loaded (v2.0.0) on streamyard.com/studio
[Ṣafwa] comments container found; observing for new comments.
content.js virtualized-row regression: PASS
[Ṣafwa] content script loaded (v2.0.0) on streamyard.com/studio
[Ṣafwa] comments container found; observing for new comments.
content.js recycled duplicate-anchor regression: PASS
[Ṣafwa] content script loaded (v2.0.0) on streamyard.com/studio
[Ṣafwa] comments container found; observing for new comments.
content.js stale-LLM virtualized-row regression: PASS
[Ṣafwa] content script loaded (v2.0.0) on streamyard.com/studio
[Ṣafwa] comments container found; observing for new comments.
content.js recycled-row count inflation regression: PASS
ui.js human-in-the-loop safety regression: PASS
[0m
[0m$ [0mgit show a1f1853 --stat | cat
commit a1f18533559bdcf412ff96ce6c2d84fb470e6fb2
Author: Wasim Jalali <wasimjalali2004@gmail.com>
Date:   Fri Sep 11 14:15:19 2026 +0200

    Fix v2 review findings and apply owner UX decisions
    
    - panel: define the platform icon (renderer crashed on the first row),
      render duplicate-group members, keep the feature button disabled on an
      unknown ack and ask the session for the recorded outcome, add the health
      silence watchdog, preserve reading position across settings, evict
      off-window row elements, gate resetAt to the legacy build
    - session: LLM scheduler (2 in flight, 20 queued, 8s expiry, 60s pause
      after 3 failures), dirty-diff PATCH payloads, WS state derived from
      health, queue-drop demotion signal, pending/keys cleared on reset
    - pure proxy-rules refusal matrix + feature-proxy, native-safety and
      panel-render test harnesses wired into npm test
    - build-manifest: hard-fail when variant and config modes disagree
    - owner UX: gear toggles settings both ways; confirmed second questions
      hidden (reachable in folded); "پخش" -> "برنامه زنده"; Useful tokens

 package.json                         |   4 +-
 panel/panel.html                     |   4 +-
 panel/panel.js                       |  59 ++-
 specs/counsel/v2-review-glm-iter1.md | 870 +++++++++++++++++++++++++++++++++++
 specs/safwa-v2-architecture.md       |  20 +
 src/config.js                        |  25 +-
 src/panel-model.js                   |  23 +
 src/proxy-rules.js                   |  59 +++
 src/session.js                       | 197 +++++---
 src/sw.js                            |   3 +-
 src/ws-main.js                       |   1 +
 test/feature-proxy-test.js           | 124 +++++
 test/native-safety-test.js           |  88 ++++
 test/panel-model-test.js             |  28 +-
 test/panel-render-test.js            | 163 +++++++
 tools/build-manifest.js              |  32 +-
 16 files changed, 1605 insertions(+), 95 deletions(-)
[0m
[0m→ [0mRead panel/panel.js
Tests are green (all suites, including the three new harnesses). Now reading the fix commit and the changed seam files.
[0m→ [0mRead src/session.js
[0m→ [0mRead src/proxy-rules.js
[0m→ [0mRead src/config.js
[0m→ [0mRead tools/build-manifest.js
[0m→ [0mRead src/panel-model.js
[0m→ [0mRead src/ws-main.js
[0m→ [0mRead src/health.js
[0m→ [0mRead src/sw.js
[0m→ [0mRead test/feature-proxy-test.js
[0m→ [0mRead test/panel-render-test.js
[0m→ [0mRead src/content.js
[0m→ [0mRead src/ws-bridge.js
Now reading the remaining seam files: content.js, ws-bridge.js, protocol.js, panel.html, native-safety-test, and admission.js.
[0m→ [0mRead src/protocol.js
[0m→ [0mRead panel/panel.html
[0m✱ [0mGrep "admittedAt|admissionSeq|nextSeq|correlate\(|updated"[90m in src/admission.js · 32 matches[0m
[0m→ [0mRead test/native-safety-test.js
[0m→ [0mRead manifest.json
[0m→ [0mRead src/admission.js[90m [offset=240, limit=240][0m
[0m→ [0mRead src/llm-classifier.js[90m [limit=120, offset=240][0m
[0m✱ [0mGrep "پخش"[90m in . · 27 matches[0m
[0m✱ [0mGrep "\.list\s*\{|flex-direction|column-reverse"[90m in panel/panel.css · 6 matches[0m
[0m✱ [0mGrep "Useful|brand|palette|§6.1|amendment"[90m in specs/safwa-v2-architecture.md · 32 matches[0m
Two verification greps — leftover label wording and the panel CSS list direction (my scroll analysis depends on it), plus the spec amendment for the palette decision.
[0m✱ [0mGrep "safwa-ping"[90m in . · 3 matches[0m
[0m
[0m$ [0mrg -n "onMessage|sendResponse" src/content-legacy.js | head -10; echo ---; rg -n "PANEL\.|healthIntervalMs|reopenRecoveryMs" panel/panel.js | head
43:    chrome.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
45:      sendResponse({ ok: true, version: VERSION });
---
31:let windowCount = CONFIG.PANEL.maxMountedRows;
93:  }, CONFIG.PANEL.healthIntervalMs);
118:  return list.scrollHeight - list.scrollTop - list.clientHeight < CONFIG.PANEL.autoFollowPx;
277:      windowCount = Math.min(WINDOW_CAP, windowCount + CONFIG.PANEL.maxMountedRows);
[0m
One more targeted check — the popup's liveness ping:
[0m$ [0mrg -n "checkLiveLink|safwa-ping|popupNeedRefresh" popup/popup.js
240:  await checkLiveLink();
277:async function checkLiveLink() {
310:      if (ok) await checkLiveLink();
319:    await chrome.tabs.sendMessage(tab.id, { type: "safwa-ping" });
322:    showLinkFix(L.popupNeedRefresh, L.popupReloadStudio, async () => {
333:if (hasStorage) checkLiveLink();
[0m
I have everything I need. Let me grab exact line numbers for the popup finding, then write the report.
# Ṣafwa v2 Review — Round 2 (feat/safwa-v2-sidebar vs main, fix commit a1f1853)

`npm test` green: 86 core + 35 ws-parser + 17 health + 24 admission + 12 protocol + 11 panel-model + 12 feature-proxy + 5 native-safety + 5 panel-render + all content/ui regressions pass. The three harnesses round 1 demanded are wired into the chain.

## Round-1 critical/high verification

| R1 finding | Status | Evidence |
|---|---|---|
| #1 Critical — `platformIcon` undefined, renderer dead | **Fixed** | Defined in src/panel-model.js:28, imported panel.js:9, covered by panel-render-test |
| #2 High — ack timeout re-enables button → double toggle-off-air | **Partially fixed — residue remains (High R2-1 below)** | Unknown now stays disabled + `ACTION_STATUS` query (panel.js:497-507, session.js:674-687), but the guard is view-only |
| #3 High — duplicate members never rendered | **Fixed** | panel.js:427-442 renders a `<details>` with every member; tested |
| #4 High — no LLM scheduler | **Partially fixed — pause leg inert (Med R2-3 below)** | Caps 2/20/8s/60s in place (session.js:393-467) |
| #5 Med — build variants don't pair with config | **Fixed** | `checkConfigPairing` hard-fails (tools/build-manifest.js:172-191); `content.js:44-46` dispatches v1-inline → content-legacy |
| #6 Med — no health watchdog | **Partially fixed — recovery broken (High R2-2 below)** | Watchdog added (panel.js:88-93) |
| #7 Med — full-row PATCH wire cost | **Fixed for wire cost; introduced revision desync (Med R2-4)** | Dirty diff session.js:540-548 |
| #8, #10, #11, #12, #14, #16 | **Fixed** | rowEls eviction (panel.js:295-298), three test harnesses, scroll save/restore, resetAt gated to v1-inline (session.js:125), `STORAGE_KEYS` in sw.js:10, labels from `CONFIG.LABELS` (panel.js:42-48) |
| #9 Med — Useful palette vs §6.1 | **Resolved by owner amendment** | Recorded in spec §16 (safwa-v2-architecture.md:642) |
| #13, #15, #17 (low) | Partially | bindTab still `lastFocusedWindow` (now the only recovery path for R2-2); ws-main error listener still misses `openCount -= 1`; store screenshots still absent; older-rows control still reuses `panelFolded` label |

## Round-2 findings

| # | Severity | Location | Defect | Why it matters | Fix |
|---|---|---|---|---|---|
| R2-1 | **High** | panel/panel.js:478-507 + src/session.js:514-518, 749-756 | The unknown-ack fix keeps the button disabled, but that state lives only in the DOM. Nothing latches the session's **own validated click** into the record (`receipts` is keyed by requestId; `record.shown` is never set — WS-off builds never learn shown). Any full snapshot (settings toggle, RESYNC, panel reopen — and R2-4 makes RESYNCs frequent) clears `rowEls` and rebuilds the row with `feature.available` still `true` → an enabled «نمایش در برنامه زنده» button on a comment already on air. A second click re-passes the whole refusal matrix (new requestId, `shown === "unknown"`, twins/anchor/content all re-validated) and clicks the native control again — likely toggling the comment **off air**. | This is the residue of round-1 #2: the only path that can damage the live broadcast. The spec §7 rule "already shown refuses (never toggle off air)" consumes `record.shown`, but the one writer that knows a click happened never sets it. | In `finish()`/`handleFeatureRequest`, stamp the record on a validated click (e.g. `record.shown = "pending"` or `record.featureClickedAt = Date.now()`); make `currentProjection` and `checkFeatureRequest` treat a pending/clicked record as unavailable/refused, so the latch survives every resync and rebuild. |
| R2-2 | **High** | panel/panel.js:144, 155-159, 88-93 | After the content script's frame is destroyed (studio F5, hard reload, crash), `onDisconnect` fires but `port` is never nulled. `scheduleRebind → bindTab` hits the guard `if (port && tabId === tab.id) return;` with the **dead** port object and returns — the panel never reconnects to the same tab. Worse, the new watchdog then runs `port.postMessage(RESYNC)` on the disconnected port every 2 s, which **throws** ("Attempting to use a disconnected port object") — an uncaught error every 2 s, forever. | The round-1 #6 fix's recovery half is broken on the most routine failure (page reload). The panel bricks with stale data + «اتصال قطع است» + a console error loop; a non-technical teacher's only undocumented recovery is switching tabs away and back or reopening the side panel. | In the `onDisconnect` listener set `port = null` (and `tabId = null`); the existing bindTab guard then reconnects. Wrap the watchdog's `postMessage` in try/catch (and the two other `port?.postMessage` sites: panel.js:192, 220, 503). |
| R2-3 | **Medium** | src/session.js:427-467 + src/llm-classifier.js:288-310 | The new scheduler's 3-failures/60 s pause is **inert**: `classifyComment` catches every failure mode (timeout, HTTP error, network error, garbage) and returns `null`, and `runLlmJob` treats `null` as success (`if (!result) return;` before the catch) — `llmFailures` only ever accumulates on a thrown exception, which `classifyComment` never lets escape. With the Worker down, every ambiguous comment still fires a doomed request; the mandated 60 s pause never engages. Also the failure-window prune runs only on the success path, so a stale failure can over-count toward the pause. | The pause was mandated for exactly this scenario (cost ceiling during LLM outages). Fail-safe holds (regex stands), but the spec §5 contract is dead code and the Worker is billed per attempt. | Return a discriminated result (e.g. `{ ok: false, reason }`) from `classifyComment`, or have `runLlmJob` count `null` as a failure; prune `llmFailures` by window age on the failure path too. |
| R2-4 | **Medium** | src/session.js:549-559 (+ panel/panel.js:197-201) | The dirty-diff skip advances `port.safwaRevision` (and `revision`) on **no-op publishes** without sending anything. No-op publishes are common: any admitted record that renders no row and removes none — a hidden greeting, a duplicate of a folded target — leaves `rows` unchanged and only grows `folded`, which is **not part of the skip condition**. Two consequences: (a) panel's `bound.revision` diverges from `port.safwaRevision`, so the next genuine PATCH fails `baseRevision !== bound.revision` and is discarded → spurious full RESYNC — with this audience's greeting-heavy cadence, roughly one full snapshot per greeting→question pair, re-incurring the exact wire cost R1#7 was fixed to remove; (b) folded-only records (hidden greetings, dupes-of-folded) never reach the panel until an unrelated row changes — a criterion-11 reachability lag. | Churns full snapshots at the 5,000-record budget (§10) and hides folded records from the recovery view; correctness is preserved only by the resync discipline. | Include `folded` in the change check (compare a folded digest alongside row keys); on a true no-op, do not advance `port.safwaRevision` (and ideally don't burn a `revision` at all). |
| R2-5 | **Medium** | popup/popup.js:319-326 | `checkLiveLink` pings the tab with `{type: "safwa-ping"}`, but only `content-legacy.js:44-45` responds. In the v2 build the session's listener ignores it (session.js:78 `return` on non-FEATURE_REQUEST) → the channel closes → `sendMessage` rejects → on a **healthy** studio the popup always shows «صفوة روی این صفحه ننشسته. استودیو StreamYard را رفرش کنید» with a button that reloads the studio page mid-broadcast. | False alarm on every popup open (and after every master-toggle click); clicking the offered fix reloads the live studio — disruptive for exactly the declared non-technical operator. | Add a `safwa-ping` responder to session.js's `onMessage` (before the FEATURE_REQUEST check) replying `{ok:true, version}`, or probe liveness another way (e.g. the side-panel port state). |
| R2-6 | **Medium** | panel/panel.js:319-324 | Scroll compensation anchors to the **bottom**: `list.scrollTop = prevScroll + (scrollHeight − prevHeight)`. Comments append at the *bottom* (newest last; `.list` is plain `flex-direction: column`), where appended content does not move the viewport — correct preservation is unchanged `scrollTop`. The formula slides the teacher's reading view toward the newest content by the height of every new row on every patch, eroding any off-bottom reading position at live rates. (It is correct only for the prepend case, the "load older" button.) | Defeats the `nearEnd`/auto-follow design and the new-items pill: reading an older question mid-broadcast becomes a treadmill; §6.1 reading-anchor intent. | For appends, keep `scrollTop = prevScroll`; only compensate by delta when content was prepended (window growth). |
| R2-7 | **Low** | src/ws-main.js:249-256 | The error listener now deletes the socket (R1 #15) but does not decrement `openCount`, so the health timer never stops (`openCount === 0` unreachable) and `ensureHealth` keeps it alive with zero sockets. | A stray 2 s timer per errored socket; no false beats (the tick iterates `openSockets` keys), no functional impact. | `openCount -= 1` in the error listener, mirroring the close listener. |
| R2-8 | **Low** | src/session.js:798-810 + src/ws-main.js:119-131 | The queue-drop signal works (drop count → health envelope → `noteParse("malformed")` → demote), but ws-main's queue is shared across sockets while the health envelope is attributed per-endpoint: whichever socket's stats envelope is processed first absorbs the demotion, so a drop can demote `api` for a `room`-side loss (and api-only demotion never flips `wsState`). | Misleading demotion reason in rehearsal builds; impact bounded because DOM admission remains the authority in every mode. | Track `queueDropped` per endpoint key (or post the loss signal as its own bridge `demote`-style event). |
| R2-9 | **Low** | src/session.js:471-486, 447 | `rebuildFromRecords` (settings change) re-runs the pipeline but never re-schedules LLM reviews, and in-flight reviews are discarded by the `settingsRevision` guard — so every currently `pendingReview` row keeps its «شاید تکراری باشد» badge forever after any settings toggle. | Cosmetic, fail-safe direction (rows stay visible); the LLM layer silently degrades for those rows until an unrelated event. | Re-enqueue `needsLlmReview` decisions in `rebuildFromRecords` (subject to the scheduler's caps/TTL). |
| R2-10 | **Low** | panel/panel.js:497-507 | The ack timeout resolves a `pendingFeature` entry but doesn't delete it; if the `ACTION_STATUS` reply never arrives (dead port — compounding R2-2) the entry leaks, and a late SW result re-resolves it (harmless today, but resolve is not idempotent by contract). | Small unbounded map growth over a long session; latent double-resolve. | Delete the entry at timeout and ignore late replies, or make `resolve` one-shot. |
| R2-11 | **Low** | src/admission.js:466-486 + src/session.js:427-449 | `mergeSocket` (WS-primary correlate) mutates the record's text without bumping `admissionSeq`, so an in-flight LLM verdict computed on the pre-merge DOM text still passes the staleness guard and can override the rebuilt decision. | WS-primary rehearsal builds only; default `off` builds unaffected; DOM remains authoritative. | Include a content digest of the record in the LLM job guard, or bump a per-record revision in `mergeSocket`. |
| R2-12 | **Low** | specs/safwa-v2-architecture.md:442-459 vs 652 | Spec §9.2's label block still shows the pre-amendment «پخش» wording while §16 #3 mandates «برنامه زنده» (config.js correctly follows §16). | Doc drift only; a future reader "fixing" config back to §9.2 would regress the owner decision. | Sync the §9.2 example block to the §16 wording. |
| R2-13 | **Low** | panel/panel.js:275, 131; store-assets/ | Carried round-1 lows: older-rows control still reuses `panelFolded` label for a different concept; bindTab still `lastFocusedWindow` (now doubles as the only R2-2 recovery — keep or make deliberate); v2 store screenshots still not staged for the Web Store upload. | Labeling/hygiene; the screenshots one blocks the eventual store resubmission. | Give "load older" its own label; pin bindTab to the panel's own window once R2-2 is fixed; stage v2 screenshots. |

**Verified clean (hunted, no defect):** matching core untouched by the fix commit (`normalize/dedup/grouping/state/llm-classifier` zero diff); pipeline order and `applyLlmOverride` authority intact; `AUTO_HIDE_ANYTHING_AMBIGUOUS: false` intact; proxy-rules refusal matrix pure and complete (12/12, incl. twins, recycled content, shown-state); SW validates sender id/URL/expiry/active-tab and stays async; the double-`requestId` path cannot interleave (synchronous from `receipts.has` to click); reset clears `pending`/anchors/registry/receipts/`publishedKeys`; queue-drop signal wiring (ws-main → bridge → session → health) is structurally sound; build-manifest pairing regex matches the real declarations; label keys all exist and «برنامه زنده» wording is consistent across config/popup/panel; dirty-diff `rowKey` change detection covers count/badge/feature/shown changes.

## Top-5 priorities

1. **R2-1 — Latch the validated click in the record** (`session.js` `finish()` → `record.shown = "pending"`, consumed by `currentProjection` + `proxy-rules`). The never-toggle-off-air invariant must live in the model, not the button; every resync currently re-arms it.
2. **R2-2 — Null the port on disconnect and fix the bindTab guard.** One-line fix for a bricked-panel + 2 s error-loop on the most routine live event (studio reload); the round-1 #6 watchdog is otherwise a cue without a recovery.
3. **R2-4 — Include `folded` in the dirty-diff and stop advancing `port.safwaRevision` on no-ops.** Kills the spurious full-RESYNC churn and restores criterion-11 reachability for hidden greetings/dupes-of-folded.
4. **R2-3 — Make LLM failures count** (`null` ≠ success) so the mandated 60 s pause actually engages during Worker outages; prune the failure window on the failure path too.
5. **R2-5 + R2-6 — Popup liveness responder and scroll-compensation direction.** Both are teacher-visible on every use: one nags to reload a healthy studio, the other erodes reading position at live comment rates.

**Verdict: 2 blocking (High) findings remain** (R2-1, R2-2) — both are narrow, one-to-few-line fixes in the exact areas round 1 targeted; nothing else blocks the branch, and the core matching pipeline, protocol discipline, and safety posture are solid. All round-1 critical/high findings are verified fixed or have their residue explicitly captured above.
