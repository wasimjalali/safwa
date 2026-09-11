[0m
> build · glm-5.3
[0m
[0m→ [0mRead specs/safwa-v2-architecture.md
[0m→ [0mRead specs/counsel/WS-EVIDENCE-2026-09-11.md
[0m→ [0mRead specs/counsel/USER-DIRECTIVE-2026-09-11.md
[0m→ [0mRead specs/safwa-v2-architecture.md[90m [offset=484][0m
[0m→ [0mRead streamyard-question-filter-spec.md
[0m→ [0mRead src/ws-main.js
[0m→ [0mRead src/ws-bridge.js
[0m→ [0mRead src/ws-parser.js
[0m→ [0mRead src/admission.js
[0m→ [0mRead src/health.js
[0m→ [0mRead src/protocol.js
[0m→ [0mRead src/panel-model.js
[0m→ [0mRead src/session.js
[0m→ [0mRead src/sw.js
[0m→ [0mRead src/content.js
[0m→ [0mRead src/dom.js
[0m→ [0mRead src/config.js
[0m→ [0mRead panel/panel.js
[0m→ [0mRead panel/panel.html
[0m→ [0mRead tools/build-manifest.js
[0m→ [0mRead test/ws-parser-test.js
[0m→ [0mRead test/admission-test.js
[0m→ [0mRead test/health-test.js
[0m→ [0mRead test/protocol-test.js
[0m→ [0mRead test/panel-model-test.js
[0m→ [0mRead src/content-legacy.js
[0m→ [0mRead package.json
[0m→ [0mRead manifest.json
[0m→ [0mRead panel/panel.css
[0m
[0m$ [0mnpm test 2>&1 | tail -60
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
  PASS  valid feature request accepted
  PASS  feature request missing target rejected
  PASS  feature result outcome validated
protocol tests: 11 passed, 0 failed
  PASS  primary rows project in admission order with anatomy
  PASS  duplicate folds onto target with members and count label
  PASS  continuation exposes fragments and first-fragment label
  PASS  extra question is badged and dimmed class path
  PASS  pending review flag preserved
  PASS  hidden greeting stays reachable in folded
  PASS  feature unavailable without dom anchor or when shown
  PASS  duplicate with unknown target stays reachable in folded
  PASS  describeHealth maps states to label keys
panel-model tests: 9 passed, 0 failed
content.js late-panel retry regression: PASS
[Ṣafwa] content script loaded (v1.0.5) on streamyard.com/studio
[Ṣafwa] comments container found; observing for new comments.
content.js virtualized-row regression: PASS
[Ṣafwa] content script loaded (v1.0.5) on streamyard.com/studio
[Ṣafwa] comments container found; observing for new comments.
content.js recycled duplicate-anchor regression: PASS
[Ṣafwa] content script loaded (v1.0.5) on streamyard.com/studio
[Ṣafwa] comments container found; observing for new comments.
content.js stale-LLM virtualized-row regression: PASS
[Ṣafwa] content script loaded (v1.0.5) on streamyard.com/studio
[Ṣafwa] comments container found; observing for new comments.
content.js recycled-row count inflation regression: PASS
ui.js human-in-the-loop safety regression: PASS
[0m
[0m→ [0mRead src/grouping.js
All tests pass. Now let me cross-check the contracts session.js relies on (grouping/normalize/llm) and the fixtures.
[0m✱ [0mGrep "export function (foldHandle|normalize)"[90m in src/normalize.js · 2 matches[0m
[0m✱ [0mGrep "export function|export async function"[90m in src/llm-classifier.js · 44 matches[0m
[0m→ [0mRead test/fixtures/ws-2026-09-11-events.json[90m [limit=40][0m
Now let me verify the remaining contracts (normalize exports, llm-classifier signature, fixtures, and the core test runner).
[0m✱ [0mGrep "domAnchor"[90m in . · 6 matches[0m
[0m✱ [0mGrep "noteBridgeHandshake|noteSocketEnded|noteSocketConstructed|noteConnectionGeneration|kind === "lifecycle"|kind === "health""[90m in src · 4 matches[0m
[0m✱ [0mGrep "folded|newItems.hidden = false|enabled"[90m in panel · 5 matches[0m
[0m✱ [0mGlob "*.js"[90m in test · 19 matches[0m
Let me confirm the key integration defects with targeted searches.
## Findings table

| # | Severity | File:line | Defect | Why it matters | Concrete fix |
|---|---|---|---|---|---|
| 1 | critical | `panel/panel.js:93` + `src/session.js:476-487` + `src/protocol.js:67-72` | **Bootstrap deadlock.** The panel's first `SUBSCRIBE` is sent with `session.documentToken: null` / `sessionEpoch: null` (they are only learned *from* a `SNAPSHOT_BEGIN`, which never arrives). `validatePortMessage` rejects any message whose token/epoch don't match the content session, so the very first `SUBSCRIBE` is silently discarded and no snapshot is ever pushed. `onConnect` (`session.js:76-81`) sends nothing either. | The sidebar can never render anything: it stays on «در حال آماده شدن…» forever. Acceptance criteria 8–14, 20 are all unreachable; the entire v2 MVP is dead on arrival. | Treat the port connection itself as authorization for the handshake: accept `SUBSCRIBE` with a null/absent `documentToken` as "request identity + snapshot" (the panel already connected to this specific tab's frame 0), or have `session.js` push `SNAPSHOT_BEGIN…END` proactively on `onConnect`. Add a protocol test for the cold-connect sequence. |
| 2 | critical | `src/session.js:164-167, 192-204, 213-233` + `src/admission.js:315-339` | **SPA re-render / container replacement re-admits every visible comment.** `attach()` re-seeds `pending` with all current rows and `seenFingerprints` (a per-node WeakMap) can't match the *new* nodes. `admitDom` only dedupes by `(broadcastId, platform, commentId)` — DOM extractions never carry a `commentId` — so every surviving row is admitted again into the **preserved** matching state. | Each StreamYard re-render (spec risk #3: "present × high") increments the duplicate count of every visible question («۲ بار پرسیده شد» for a question asked once, growing on every re-render) and advances continuation windows. Directly violates "never double count" and criterion 14; corrupts the counts the teacher trusts. | On re-attach (not initial attach), correlate re-seeded rows to existing records by fingerprint (platform + foldHandle + matchKey) and *re-anchor* the existing record instead of admitting a new one; only admit rows with no matching record. Add a regression test: re-render fixture → counts unchanged. |
| 3 | critical | `src/panel-model.js:80` vs `src/admission.js:343-359` + `src/session.js:243-251` | **Feature proxy is permanently disabled.** `featureFor` gates availability on `record.domAnchor === true`, but no code ever sets `domAnchor` on an admission record (session tracks anchors in a separate `anchors` Map). `feature.available` is `false` for every row → every «نمایش در پخش» button renders disabled with the native-lookup hint. | The feature proxy — a core v2 deliverable (ADR-7, criteria 15/16/17) — can never fire. `test/panel-model-test.js:38` fabricates `domAnchor: true`, so the suite is green while production is broken. | Have `session.js` stamp `record.domAnchor = anchors.get(sourceId)?.el?.isConnected === true` at publish time (or change `featureFor` to consume an availability flag passed in from the session), and add a projection test built from a real `createAdmission()` record. |
| 4 | high | `src/session.js:377-380` + `panel/panel.js:151-163` + `panel/panel.html:13-37` | **Folded records are dropped entirely.** `currentRows()` returns `projection.rows` only; `buildViewRows`'s `folded` array (hidden greetings, duplicates whose target is missing) never crosses the port, and the panel has no folded disclosure element (`.folded` CSS exists unused). | Criterion 11 ("every admitted record stays reachable") is violated, and the known LLM mis-hide recovery path (spec risk #4) is gone — a wrongly hidden greeting/duplicate is unreachable anywhere in the UI. | Include `folded` in `SNAPSHOT`/`PATCH` payloads and render the compact «نظرهای جمع‌شده» disclosure in `panel.js`; assert reachability in `panel-model-test` through the session projection, not just the pure module. |
| 5 | high | `panel/panel.js:151-167, 56-63` | **Full re-render per patch destroys the reading position; no windowing; the new-questions control never appears.** `render()` calls `list.replaceChildren()` on every PATCH (up to ~7/s during bursts); after that `scrollTop` is 0, so mid-list reading jumps to the top. `CONFIG.PANEL.maxMountedRows` (150) is never used. `newItems.hidden` is only ever set `true` — nothing shows «سوال‌های تازه». | Spec 6.1 ("regrouping and count updates never move the text being read", auto-follow within 48px, pinned reading anchor) and the Section 10 mounted-rows budget are violated. Under 5,000 records the sidebar will jank or freeze; the teacher loses his place every 150 ms during activity. | Keep a keyed row map and patch/mutate existing row elements instead of `replaceChildren`; restore scrollTop by anchor rowId before/after; mount only a window of ~150 rows; show `newItems` when new rows arrive while scrolled > 48px from the end. |
| 6 | high | `src/session.js` (whole file; no navigation/route watch anywhere) | **Studio route change never starts a new session.** The spec (Section 5) requires a new session at an origin+pathname boundary; `session.js` never inspects `location`, history events, or SPA navigation. `documentToken`/`sessionEpoch` and all records survive a within-document switch to a different studio/broadcast. | Old-studio questions remain in the sidebar with stale anchors; matching state (`hasPrimaryQuestion` per handle, signatures) carries into the new broadcast, so a viewer's first question in the new studio can be flagged as their second. Wrong-session data (hunt #5). | Watch `location.pathname` (poll on the existing 1s/3s intervals or hook `pushState` events via a MAIN-world-free heuristic: check `location.href` in the watchdog) and on a boundary: bump `sessionEpoch`, reset admission/state, publish a fresh snapshot. |
| 7 | high | `src/session.js:590-628, 192-195` + `src/health.js:111-197` | **The WS health/demotion model is unwired and masked.** `noteBridgeHandshake`, `noteSocketConstructed`, `noteSocketEnded`, `noteConnectionGeneration` are never called; `lifecycle`/`health` envelope kinds are dropped (`session.js:597`). The DOM watchdog *fakes* room+bridge liveness every 3s (`session.js:194` → `noteBridgeFrame("room")`), which defeats the 6s room-silence and 4s bridge-health thresholds. `noteParse("ok"/"ignored")` is never called, so the consecutive-unknown counter never resets (3 unknowns *ever*, not consecutive, demote). Health demotion is advisory: `onBridgeEnvelope` keeps ingesting after health demotes room, and `admission`'s `mergeMode` follows `WS_MODE` regardless of `effectiveSource`. | In every WS build the bridge latches `bridgeNoHandshake` at 2s (handshake is never observed) → `effectiveSource` is permanently "dom"; socket close/error/reconnect are invisible; a dead socket is reported healthy (except the fake-masked part). Spec Section 8 rows 15/16/20/22 and Gates A/B parity evidence are unimplementable as wired. | Call `noteBridgeHandshake` on the first validated envelope; route `lifecycle` (`constructed`/`close`/`error`) and `health` envelopes into `noteSocketConstructed`/`noteSocketEnded`; delete the synthetic `noteBridgeFrame("room")` in the watchdog; call `health
## Findings table

| # | Severity | File:line | Defect | Why it matters | Concrete fix |
|---|---|---|---|---|---|
| 1 | critical | `panel/panel.js:93` + `src/session.js:476-487` + `src/protocol.js:67-72` | **Bootstrap deadlock.** The panel's first `SUBSCRIBE` is sent with `session.documentToken: null` / `sessionEpoch: null` — identity is only learnable *from* a `SNAPSHOT_BEGIN`, which only a validated `SUBSCRIBE` triggers. `validatePortMessage` rejects the null token (`documentTokenMismatch`), `session.js` silently drops the message (only `revisionGap` gets a reply), and `onConnect` pushes nothing. | The sidebar can never receive a snapshot; it stays on «در حال آماده شدن…» forever. Acceptance criteria 8–14 and 20 are unreachable; the v2 MVP is dead on arrival. | Accept a `SUBSCRIBE` with an absent/null `documentToken` as the handshake request (the `chrome.tabs.connect` to frame 0 of the bound tab is itself the authorization), replying `SNAPSHOT_BEGIN…END`; or push the snapshot proactively on `onConnect`. Add a protocol test for the cold-connect sequence. |
| 2 | critical | `src/session.js:164-167, 192-204, 213-233` + `src/admission.js:315-339` | **SPA re-render re-admits every visible comment.** On re-attach, all mounted rows are re-seeded into `pending`; `seenFingerprints` (per-node WeakMap) can't match the *new* nodes; `admitDom` only dedupes by `(broadcastId, platform, commentId)` and DOM extractions never carry a `commentId` — so every surviving row is admitted again into the **preserved** matching state. | Each StreamYard re-render (spec risk #3: "present × high") increments the duplicate count of every visible question («۲ بار پرسیده شد» for a question asked once, growing per re-render) and advances continuation windows. Violates "never double count" and criterion 14. | On re-attach, correlate re-seeded rows to existing records by fingerprint (platform + foldHandle + matchKey) and *re-anchor* the existing record; admit only rows with no matching record. Add a re-render regression test asserting unchanged counts. |
| 3 | critical | `src/panel-model.js:80` vs `src/admission.js:343-359` + `src/session.js:243-251` | **Feature proxy permanently disabled.** `featureFor` gates availability on `record.domAnchor === true`, but no code ever sets `domAnchor` on an admission record (anchors live in a separate `anchors` Map). Every «نمایش در پخش» button renders disabled with the native-lookup hint. | The feature proxy (ADR-7, criteria 15/16/17) can never fire. `test/panel-model-test.js:38` fabricates `domAnchor: true`, so the suite is green while production is broken. | Stamp `record.domAnchor` from anchor liveness at publish time (or pass availability in from the session); add a projection test built from a real `createAdmission()` record instead of synthetic `domAnchor` fields. |
| 4 | high | `src/session.js:377-380` + `panel/panel.js:151-163` + `panel/panel.html:13-37` | **Folded records are dropped.** `currentRows()` returns `projection.rows` only; `buildViewRows`'s `folded` array (hidden greetings, duplicates with a missing target) never crosses the port, and the panel has no folded-disclosure element (`.folded` CSS is unused). | Criterion 11 ("every admitted record stays reachable") is violated; the LLM-mis-hide recovery path (spec risk #4) is gone — a wrongly folded greeting/duplicate is unreachable anywhere. | Ship `folded` in SNAPSHOT/PATCH payloads and render the «نظرهای جمع‌شده» disclosure; assert reachability through the session projection, not just the pure module. |
| 5 | high | `panel/panel.js:151-167, 56-63` | **Renderer destroys the reading position; no windowing; new-items control never appears.** `render()` does `list.replaceChildren()` per PATCH (up to ~7/s); `scrollTop` resets to 0 so mid-list reading jumps to the top. `CONFIG.PANEL.maxMountedRows` is never used. `newItems.hidden` is only ever set `true` — nothing shows «سوال‌های تازه». | Spec 6.1 ("count updates never move the text being read", 48px auto-follow, pinned anchor) and the Section 10 mounted-rows budget are violated; under load the sidebar janks and the teacher loses his place every 150 ms. | Patch a keyed row map instead of `replaceChildren`; restore scroll by anchor rowId; mount a ~150-row window; show `newItems` when rows arrive while scrolled >48px from the end. |
| 6 | high | `src/session.js` (no route/navigation watch anywhere; `start()` at 90-142) | **Studio route change never starts a new session.** Spec Section 5 requires a new session at an origin+pathname boundary; nothing inspects `location` or navigation events, so `documentToken`/`sessionEpoch`, records, and matching state survive a within-document switch to another studio/broadcast. | Old-studio questions remain in the sidebar; per-handle state (`hasPrimaryQuestion`, signatures) carries over, so a viewer's first question in the new studio can be flagged as their second — wrong-session data (hunt #5). | Check `location.pathname` in the watchdog/health tick; on a boundary bump `sessionEpoch`, reset admission/state, seed the new container, publish a fresh snapshot. |
| 7 | high | `src/session.js:590-628, 192-195` + `src/health.js:111-197` | **WS health/demotion model unwired and masked.** `noteBridgeHandshake`, `noteSocketConstructed`, `noteSocketEnded`, `noteConnectionGeneration` are never called; `lifecycle`/`health` envelope kinds are dropped (`session.js:597`); the DOM watchdog fakes room+bridge liveness every 3s (`session.js:194` → `noteBridgeFrame("room")`), defeating the 6s/4s silence thresholds; `noteParse("ok"/"ignored")` is never called so the consecutive-unknown counter never resets (3 unknowns *ever*, not consecutive, demote); demotion is advisory — `onBridgeEnvelope` keeps ingesting after health demotes, and `admission`'s `mergeMode` follows `WS_MODE` regardless of `effectiveSource`. | In every WS build the bridge latches `bridgeNoHandshake` at 2s → `effectiveSource` is permanently "dom"; socket close/error/reconnect are invisible; a dead or schema-rotted socket keeps feeding admission in primary mode. Spec Section 8 rows 15/16/17/20/22 and Gates A/B evidence are unimplementable as wired. | Wire lifecycle/health envelopes to the `noteSocket*` calls; call `noteBridgeHandshake` on the first validated envelope; delete the synthetic `noteBridgeFrame("room")`; call `health.noteParse("ok"/"ignored")` per frame; gate `ingestSocket`/`correlate` (and `mergeMode`) on the health snapshot so demotion is enforced, not reported. |
| 8 | high | `package.json:8` + `test/` (missing `feature-proxy-test.js`, `native-safety-test.js`, `panel-render-test.js`) | **Spec Section 12 test files absent.** The feature-proxy zero-click matrix, the mutation guard (criterion 10), and the renderer tests were never written; `session.js` — the riskiest integration file — has no test at all, and the panel-model test fabricates the `domAnchor` field production never sets. | Findings 1–7 are exactly what these tests exist to catch; `npm test` green is currently weak evidence for the v2 path. | Add the three missing harnesses (a jsdom/mocked-port harness for session.js covers most of it), and make panel-model tests consume records produced by `createAdmission`. |
| 9 | medium | `src/session.js:336-354, 624-627` | **Rebuilds wipe LLM-confirmed decisions and never re-schedule.** `rebuildFromRecords` clears `decisions` and replays regex-only through a fresh state — `needsLlmReview` results are neither re-applied nor re-queried. Triggered by settings changes and, in WS builds, by *every* correlated socket frame. | A mid-session settings toggle un-folds previously LLM-confirmed semantic duplicates (counts/groups regress — criterion 13); in enrich mode confirmations effectively never persist. | Persist the applied LLM outcome per sourceId (e.g. `llmApplied: classification+match`) and re-apply it after replay, or re-enqueue `needsLlmReview` decisions for review after a rebuild. |
| 10 | medium | `src/session.js:302-331` | **No LLM scheduler.** Every `needsLlmReview` decision fires an unconstrained `fetch`; the spec's ≤2 in flight, ≤20 queued, 8s-from-admission expiry, and 3-failures/60s → 60s pause are absent. | Under burst load (25/s) dozens of concurrent LLM calls run, burning Worker quota and risking out-of-order overrides; a dead endpoint is hammered per comment. | Add the bounded scheduler (in-flight set + queue + admission-time expiry + failure circuit breaker) per spec Section 5. |
| 11 | medium | `src/session.js:526-563` + `src/dom.js:152-158` | **Feature-validation gaps vs spec Section 7.** `sourceRevision` is never verified (spec 7.2); `record.shown === "on"` is not re-checked at the click site, so an already-featured comment can be toggle-clicked (spec 7.6); `findShowButton` returns the *first* match without an exactly-one check (spec 7.6). | A stale panel row can trigger a native click on a comment whose feature state changed; if the show button is a toggle, clicking it again could un-feature a question on air. | Compare `request.sourceRevision` against a per-record content revision; refuse when `record.shown === "on"`; count matching show buttons and refuse unless exactly one enabled button exists. |
| 12 | medium | `src/sw.js:33-59` | **SW forwards without target validation.** Spec 3.2 requires: sender is the sidebar document, and the target tab is the requesting window's *active StreamYard* tab. `sw.js` checks `sender.id` + no `sender.tab` but never verifies `sender.url`, never compares `message.tabId` against `tabs.query` for `message.windowId`. | Cross-tab safety currently rests solely on the content-side `documentToken`; the spec's privileged-surface defense-in-depth is missing. | In the handler, `tabs.query({active:true, windowId: message.windowId})` and require `tab.id === message.tabId` + StreamYard URL before forwarding; also assert `sender.url` starts with the extension's panel URL. |
| 13 | medium | `panel/panel.js:97-143, 123-128` | **Panel trusts everything pushed; master-off not rendered.** `SNAPSHOT_CHUNK/END/PATCH/HEALTH` handlers never verify `documentToken`/`sessionEpoch` against the bound session (spec 3.1 requires it); `HEALTH.enabled` is ignored — no «غیرفعال» state, the filtered list is never hidden when the master switch is off (spec 6.2). | A stale-epoch message (e.g. post-reset race on a second port) could be applied to the new model; the teacher sees filtered rows while the filter is off. | Bind the session identity at `SNAPSHOT_BEGIN` and drop every inbound message whose token/epoch mismatches; render the master-off state (hide the list, show the switch). |
| 14 | medium | `src/session.js:54-55, 245-248` (+ `occurrences` at 52, 249) | **Strong-ref anchor registry + dead occurrences array.** `anchors` holds a strong `el` reference per record forever; virtualized-away rows keep detached `<li>` subtrees alive for the whole session (spec risk 11 explicitly says "weak-anchor registry"); `occurrences` grows unbounded and is never read. | Memory growth over a 3h/5,000-record session (Section 10 heap budget); detached-node accumulation degrades the page. | Use `WeakRef` for anchor elements (revalidate via `isConnected`/`deref()`), prune anchor entries on node death, delete the unused `occurrences` array. |
| 15 | medium | `src/admission.js:275-294` | **`findDomMatch` scans all records per pending candidate**, and `correlate()` runs per socket frame. At 5,000 records × sustained frames this breaks the p95 ≤2ms parser/coordinator budget (spec Section 10). | Degraded enrichment latency under the declared workload; main-thread pressure inside the bridge callback. | Index DOM records by (platform, folded-handle) and only compare texts within the correlate window; sweep candidates on a short timer instead of per frame. |
| 16 | low | `src/session.js:382-416` | `publish(true)` is swallowed when a patch publish is pending (`if (publishTimer) return`), so a requested snapshot degrades to a full-state PATCH with a bumped epoch. | Works only by accident (upserts carry all rows); a future partial-diff PATCH would corrupt the model; epoch changes arrive unannounced. | Queue the snapshot flag: if a timer is pending and a snapshot is requested, upgrade the pending callback to snapshot semantics. |
| 17 | low | `src/admission.js:275-294, 474-486` | **Twin metadata cross-merge.** If candidate B (id2) correlates before candidate A, it can attach to record A (no `commentId` yet); a later candidate A then lands on record B — swapping `authorPlatformId`/avatar between same-handle identical-text twins. | Wrong avatar is cosmetic; a swapped `authorPlatformId` changes person identity and can mis-bucket one-question-per-person. Feature clicks remain safe (live re-extraction compares text/handle). | Require a candidate whose wire id is known to only correlate to a record without a conflicting id, and prefer candidates in `sourcePos`/receive order; or delay identity writes until both twins resolve. |
| 18 | low | `manifest.json:1-42` + `tools/build-manifest.js:74-99, 132` + `src/config.js:162` | Repo-root `manifest.json` is still the v1 legacy manifest (popup, `document_idle`, `styles.css`); `npm run build:manifest` defaults `--out manifest.json`, overwriting the checked-in legacy manifest in place; `--ws=log|enrich|primary` variants package the hooks but `WS_MODE` stays `"off"` in config, so those builds are inert until hand-edited. | Loading unpacked from the repo root ships v1, not v2; the WS rehearsal variants silently do nothing; a careless rebuild destroys the legacy regression manifest. | Emit variants to `dist/<variant>/manifest.json` and have the tool rewrite `WS_MODE` for `--ws` variants (or fail loudly if config disagrees); keep the legacy manifest checked in untouched. |
| 19 | low | `panel/panel.html:15, 19, 26, 30, 33, 36` | Hard-coded Dari strings (title, status, settings header/labels, master row «فیلتر», reset, new-items, static failure) instead of `CONFIG.LABELS`. | Spec: "Every visible sidebar string comes from CONFIG.LABELS; nothing is hard-coded" — editing `config.js` no longer changes the whole UI; drift risk. | Populate these nodes from `CONFIG.LABELS` in `panel.js` at init, keeping only a minimal static fallback in HTML. |
| 20 | low | `src/session.js:112-114` | The legacy `safwaResetAt` storage key still resets the session from any context, and it is not port/tab-scoped. | Any stray write to that key resets every tab's v2 session, violating the spec's port-scoped reset deviation (3.1). | Remove the storage-key reset path in v2 mode (reset only via `RESET_SESSION` on the port), or namespace it per-tab. |
| 21 | low | `panel/panel.js:301-307` | On `outcome: "unknown"` the button is simply re-enabled with the find-native tooltip; spec 7/6.x requires the «نمایش را در پخش بررسی کنید» (`featureCheckBroadcast`) message and no optimistic state. | The teacher may retry immediately without being told to verify the broadcast. | In the resolve handler, show `L.featureCheckBroadcast` for `"unknown"` and keep the button disabled briefly. |

## Top 5 priority fixes (ordered)

1. **Fix the SUBSCRIBE bootstrap handshake (Finding 1)** — without it the sidebar is non-functional; nothing else can even be tested live. Accept a token-less first `SUBSCRIBE` (the tab-scoped port is the authorization) and reply with the snapshot.
2. **Stop re-render double-counting (Finding 2)** — on re-attach, re-anchor existing records by fingerprint instead of re-admitting every visible row; add a re-render regression test. This is a "never double count" invariant break on a known-frequent trigger.
3. **Make the feature proxy actually available (Finding 3)** — set `record.domAnchor` (or derive availability in the session) and add the missing `feature-proxy`/`native-safety` tests so criteria 10/15/16 are verifiable.
4. **Ship folded records + fix the renderer (Findings 4, 5)** — port `folded` to the panel with the disclosure, and replace `replaceChildren()` with keyed patching, scroll-anchoring, windowing, and the «سوال‌های تازه» control. These are the teacher-facing breakages.
5. **Wire the WS health model (Finding 7)** — bridge handshake/lifecycle events into `health.js`, delete the watchdog's synthetic liveness, enforce demotion on the ingest path. Required before any Gate A/B rehearsal is meaningful; also close the missing-test gap (Finding 8) as part of each fix.

## Verdict on production-readiness

Not production-ready. Three blockers make the v2 sidebar non-functional as shipped: the port handshake deadlock means the panel never receives a single row (F1); the feature proxy is disabled for every row because `domAnchor` is never set (F3); and any StreamYard SPA re-render — a known-present event — silently inflates the duplicate counts of every visible question (F2). Behind those sit a dropped `folded` set that makes hidden records unreachable (F4, criterion 11), a renderer that resets the teacher's reading position on every 150 ms patch with no windowing (F5, spec 6.1/10), no studio-route boundary detection (F6), and a WS health/demotion layer that is effectively dead code in the live wiring (F7) — with the spec-mandated proxy/mutation-guard/renderer tests missing (F8), which is exactly why all of this is green under `npm test`. The pure layers (parser, admission, health state machine, protocol, matching core) are genuinely solid and test-covered; the defects are concentrated in the untested integration seams: `session.js`, `panel.js`, and the SW/port wiring. Fix F1–F3 plus F4/F5 and add the three missing harnesses before any live rehearsal; none of this touches the native StreamYard panel, so v1-style rollback (legacy manifest) remains safe in the meantime.

## What you verified as correct

- **Pipeline order and purity intact**: `processComment` remains the single decision authority (continuation → duplicate → one-per-person); session passes plain copies without `el`/`cardEl` into the core (`session.js:236-261`), satisfying the v2 hygiene rule.
- **Zero native writes in the v2 path** (code inspection): `session.js`/`dom.js` never write attributes/classes/style/scroll; the only native interaction is the single validated `.click()` in `clickShowButton`; legacy writes are confined to `content-legacy.js`/`ui.js` behind `PANEL_MODE === "v1-inline"`.
- **Feature-click safety core**: recycled/virtualized rows are refused via live re-extraction of platform/handle/text immediately before the click with no intervening `await` (`session.js:546-560`); `requestId` receipts prevent redispatch double-clicks (533-536); expiry and token/epoch are checked; the SW blocks content-script and external senders (`sender.id` + no `sender.tab`).
- **`ws-parser.js` matches the measured schema exactly**: nested inner JSON, whole-batch rejection (no partial output), batch-level `broadcastId` inheritance with contradiction rejection, https-only credential-free avatars, `containsQuestion` ignored, outbound/heartbeat/unrelated commands ignored, unknown never guessed, never throws on any input (including binary); all Section 4.4 fixture cases pass, fixture integrity holds (no tokens/JWT/PII).
- **`admission.js` delivery dedupe**: the measured duplicate pair (pos 12/13) yields exactly one admitted occurrence and one core invocation; scoped `(broadcastId, platform, commentId)` identity; distinct ids with identical text stay two records; DOM/log modes never take `shown`/`starred` from socket events; socket-only candidates never create records.
- **`ws-main.js` tap discipline**: constructor-only Proxy, real socket always returned, structural URL allowlist with credential rejection, no `send` wrapping, bounded queues, endpoint key (never the URL/token) crosses the bridge, all failures invisible to the page.
- **`ws-bridge.js` validation**: source/origin/ns/version/pageToken/monotonic-sequence/size/rate checks; overflow and violations latch demotion and never truncate into the parser; bridge data cannot authorize anything.
- **`protocol.js` envelope validation** (version, type, token, epoch, serializability, revision gap) is correct for what it covers; `test/protocol-test.js` covers the gap cases.
- **`panel-model.js` projection itself is correct** (fold logic, count labels, joined fragments, extras visible, pendingReview, reachability fallbacks) — the reachability loss happens in `session.js`/`panel.js`, not the pure module.
- **`npm test` is green** (44 core + ws-parser/health/admission/protocol/panel-model + six legacy regression harnesses), and `node --check` passes on all listed files; `CONFIG` limits (`AUTO_HIDE_ANYTHING_AMBIGUOUS: false`, labels, endpoint allowlist, budgets) match the spec.
