[0m
> build · muse-spark-1.3-contributor
[0m
[0m→ [0mRead streamyard-question-filter-spec.md
[0m→ [0mRead CLAUDE.md
[0m→ [0mRead specs/safwa-v2-architecture.md
[0m→ [0mRead specs/counsel/WS-EVIDENCE-2026-09-11.md
[0m→ [0mRead specs/counsel/review-prompt.md
[0m→ [0mRead specs/counsel/USER-DIRECTIVE-2026-09-11.md
[0m→ [0mRead src/ws-main.js
[0m→ [0mRead src/health.js
[0m→ [0mRead src/ws-bridge.js
[0m→ [0mRead src/ws-parser.js
[0m→ [0mRead src/admission.js
[0m→ [0mRead specs/safwa-v2-architecture.md[90m [offset=484][0m
[0m→ [0mRead src/panel-model.js
[0m→ [0mRead src/protocol.js
[0m→ [0mRead src/session.js
[0m→ [0mRead src/sw.js
[0m→ [0mRead src/content.js
[0m→ [0mRead src/content-legacy.js
[0m→ [0mRead src/dom.js
[0m→ [0mRead src/config.js
[0m→ [0mRead panel/panel.js
[0m→ [0mRead panel/panel.html
[0m→ [0mRead panel/panel.css
[0m→ [0mRead tools/build-manifest.js
[0m→ [0mRead package.json
[0m→ [0mRead manifest.json
[0m→ [0mRead test/ws-parser-test.js
[0m→ [0mRead test/protocol-test.js
[0m→ [0mRead test/panel-model-test.js
[0m→ [0mRead test/admission-test.js
[0m→ [0mRead test/health-test.js
[0m
[0m$ [0mnode --check src/session.js && node --check src/sw.js && node --check panel/panel.js && node --check src/ws-main.js && node --check src/ws-bridge.js && node --check src/ws-parser.js && node --check src/admission.js && node --check src/health.js && node --check src/panel-model.js && node --check src/protocol.js && echo ALL_SYNTAX_OK
ALL_SYNTAX_OK
[0m
[0m$ [0mnpm test 2>&1 | tail -100
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
## Findings table
| # | Severity (critical/high/medium/low) | File:line | Defect | Why it matters | Concrete fix |
|---|---|---|---|---|---|
| 1 | critical | `src/session.js:475-488`, `panel/panel.js:93`, `src/protocol.js:67` | First `SUBSCRIBE` can never succeed: panel sends `documentToken:null/sessionEpoch:null` (initial `session`), but `validatePortMessage` requires an exact token match, so `onPortMessage` drops it and never calls `sendSnapshot`. | Sidebar is permanently stuck at loading; no snapshot, no rows, no feature path. Total v2 deadlock. | Special-case `SUBSCRIBE` (and `RESYNC` pre-bind) in `session.js:onPortMessage`: accept a null-token subscribe, reply with `SNAPSHOT_BEGIN…END` carrying the real tokens; keep strict validation for all other types. Add a handshake test. |
| 2 | critical | `src/panel-model.js:80`, `src/admission.js:343-359`, `src/session.js:243-251` | `featureFor` gates availability on `record.domAnchor === true`, but admission records never set `domAnchor` (only `provenance.dom`) and `session.js:admit` never adds it. | `feature.available` is always `false`; every feature button renders disabled with the native-lookup hint. The proxy acceptance criterion (16) can never pass. | Set `record.domAnchor` from anchor liveness in `session.js` (or change `panel-model.js:80` to read `provenance.dom` + anchor presence), and add a panel-model test using a real `admission.records()` record instead of only synthetic `domAnchor:true`. |
| 3 | critical | `src/session.js:526-563` | `handleFeatureRequest` never checks `request.sourceRevision`, never scans for indistinguishable twins, and never checks `record.shown === "on"` / native shown state before clicking. | Violates spec §7 steps 2/6/8: stale-revision replay passes; two live rows with identical platform/handle/text each validate against their own anchor and click ("either twin is harmless" is explicitly forbidden); an already-on-air comment can be toggled off. Wrong-comment-on-air risk. | Compare `sourceRevision` to `record.admissionSeq`; scan `admission.records()`+anchors for a second connected row with the same exact fingerprint and `refuse` on ambiguity; refuse when `record.shown === "on"`; panel must send the per-source `admissionSeq`, not the global revision. |
| 4 | critical | `src/session.js:1-639` (absent) | No studio route-change detection (no `history`/`popstate`/`location` watcher). Spec §5 requires origin+pathname boundary → new session/epoch. | Navigating to a different broadcast in the same tab keeps old records, epoch and tokens; a same-text/handle row in the new studio passes token validation and can be featured into the wrong broadcast. | Track `location.origin+pathname`, on change bump `sessionEpoch`, clear admission/state/decisions/anchors/receipts (same as `resetSession` without reseeding old rows), publish fresh snapshot. |
| 5 | critical | `panel/panel.js:97-143` | Panel `onPortMessage` never validates `documentToken`/`sessionEpoch`/`revision` on `SNAPSHOT_*`/`PATCH`/`HEALTH`, never checks `expectedRows`/`rowCount`/chunk budgets, and applies everything with `v===2`. | Stale messages after reset/SPA re-render/studio switch are applied as current; partial snapshots render as complete; a revision gap is only caught for `PATCH` base, never for snapshots. Wrong-tab/session data shown as actionable. | Validate tokens+epoch on every port message (queue `SNAPSHOT_BEGIN` pre-bind, ignore mismatches post-bind), verify `revision` monotonicity and `rowCount === model.size` after `SNAPSHOT_END` else `RESYNC`; enforce ≤128 rows per chunk. |
| 6 | high | `src/session.js:192-195`, `src/session.js:590-612` | Watchdog calls `health.noteBridgeFrame("room")` every 3 s while the DOM container is connected; `onBridgeEnvelope` only handles `frame`, ignores `lifecycle`/`health`, and never calls `noteBridgeHandshake`/`noteSocketConstructed`/`noteSocketEnded`/`noteConnectionGeneration`. | Room-silence detection is faked alive by the DOM (WS failure masked); bridge stays `unknown` forever so `effectiveSource` can never become `websocket` in primary mode; close/error/replace never demotes (spec §8 rows 15/16/20 violated). | Remove the watchdog `noteBridgeFrame` call; wire `lifecycle` constructed/close/error → `noteSocketConstructed`/`noteSocketEnded`, first frame → `noteBridgeHandshake`, generation change → `noteConnectionGeneration`. |
| 7 | high | `panel/panel.js:123-128`, `panel/panel.js:151-163` | `HEALTH.enabled` is received but ignored and `render()` never checks master state; settings gear writes storage but the list stays visible. | Spec §6.2 master-off ("filtered list hidden, capture stays warm") is unimplemented in the sidebar; teacher cannot turn filtering off from the v2 surface. | In `HEALTH` handler store `enabled`; when false, hide list/show `popupStatusOff` equivalent label and disable all feature buttons without disconnecting the port. |
| 8 | high | `panel/panel.js:151-163` | `render()` mounts every row (`list.replaceChildren()` + append all); `CONFIG.PANEL.maxMountedRows:150` windowing is never applied. | At the 5,000-record budget the sidebar creates thousands of nodes per patch (session already sends full-row upserts), blowing the heap/50 ms long-task budgets and breaking reading-anchor preservation. | Window rendering to ≤150 mounted rows with scrollable access to history (or explicit windowing + `folded` reachability), coalesce renders, preserve anchor per spec §6.1. |
| 9 | high | `src/session.js:52-57`, `src/session.js:245-249` | `anchors` is a strong `Map` holding live DOM nodes and `occurrences` is an append-only array; neither is evicted except on reset. Spec requires a weak-anchor registry. | 3 h / 5,000-comment sessions pin detached nodes and duplicate plain objects; heap budget (≤50 MiB) fails; stale anchors also widen the proxy validation surface. | Use `WeakRef`/`WeakMap` for anchors keyed by sourceId with explicit `delete` when the node disconnects or the record folds, and drop the dead `occurrences` array (rebuild already uses `admission.records()`). |
| 10 | high | `src/session.js:382-416` | `publish()` early-returns when `publishTimer` is pending, discarding the `snapshot` flag: a `publish(true)` (reset/settings/WS-rebuild) coalesced behind a `publish(false)` never sends a snapshot. | After reset or settings replay the panel can sit on a stale model with no snapshot until the next admit; `RESET_SESSION` ack path has no timely snapshot. | Capture `pendingSnapshot \|\|= snapshot` outside the timer guard and honor it when the timer fires. |
| 11 | high | `manifest.json:12-34` | Checked-in `manifest.json` is the legacy v1 manifest (`default_popup`, `document_idle`, `styles.css`, no `sidePanel`/`sw.js`, version 1.0.5). Production v2 requires the `build-manifest.js` output (sidePanel, SW module, `document_start`, no popup, 2.0.0). | Loading the repo unpacked as-is runs the v2 bootstrap under the wrong manifest: no sidebar registered, `action.onClicked` never fires, version mismatch with `content.js` logs. Release blocker. | Generate and check in (or document as the release step) the v2 manifest, or make `manifest.json` itself the v2 default and keep legacy only as a build variant. |
| 12 | high | `src/admission.js:159-177`, `src/session.js:616-627` | `findContradiction` ignores `displayText`/handle drift, and `session.js:onBridgeEnvelope` never forwards `contradiction.*` diagnostics to `health.noteContradiction`. | Same-id text replacement in primary mode silently rewrites the admitted question and triggers a rebuild with no demotion, violating "contradictory identity/content → demote immediately". | Include text/handle contradiction detection for bound identities and call `health.noteContradiction(endpointKey)` + latch demotion on any `contradiction.*` from ingest/correlate. |
| 13 | high | `src/session.js:302-320`, `src/admission.js:199-237` | LLM guard snapshots `admissionSeq`, but `mergeSocket` enrichment never bumps any content revision, so a primary-mode text/handle replacement does not invalidate pending LLM work. | Stale LLM result applies to replaced text; `applyLlmOverride` fires on the wrong content revision. | Bump a per-record content revision inside `mergeSocket` when displayText/handle/platform change, and guard on it (or drop pending LLM for touched records and rebuild atomically). |
| 14 | high | `src/sw.js:46-56` | SW forwards to caller-supplied `message.tabId` with no `tabs.get`/`tabs.query` check that it is the requesting window's active StreamYard tab. | A compromised or buggy sidebar message can direct the click at any tab (including a non-studio tab whose content responds `clicked`), bypassing the active-tab binding in spec §3.2/§6.3. | Before `tabs.sendMessage`, verify `tabId` is active in `windowId` and its URL matches StreamYard; refuse otherwise. Also validate `windowId` is an integer. |
| 15 | medium | `src/session.js:430-440`, `panel/panel.js:100-111` | Snapshot chunking slices by row count only, ignoring `PANEL.snapshotChunkBytes:262144`; panel ignores `expectedRows`/`rowCount` entirely. | Long Dari rows can exceed the 256 KiB port-message budget per chunk; lost chunks render silently as a complete list. | Chunk by both row count and serialized byte size; panel validates `rowCount` vs received rows and `RESYNC`s on mismatch. |
| 16 | medium | `src/session.js:243-244`, `src/admission.js:364-375` | `admitDom` returns `rebuilt` when a stable `authorPlatformId` splits a folded-handle identity, but `session.js:admit` destructures only `{sourceId, isNew}` and never rebuilds. | Late identity enrichment leaves core decisions built on the wrong person key; one-person-per-handle grouping stays stale until the next settings change. | On `rebuilt===true`, call `rebuildFromRecords()` + `publish(true)` and invalidate incompatible pending LLM (per spec §4.3). |
| 17 | medium | `src/admission.js:275-294` | `findDomMatch` returns the first admission-order record matching platform/folded-handle/text, with no ambiguity check for twins. | Socket metadata (commentId/avatar/createdAt/broadcastId + identity index) can attach to the wrong twin; Gate B "zero incorrect associations" cannot hold. | On multiple in-window matches, match none (leave pending until timeout → DOM-fed) and emit an ambiguity diagnostic. |
| 18 | medium | `panel/panel.js:74-95`, `panel/panel.js:276-289` | `bindTab` keeps the old `model` visible on rebind and only disables nothing; `requestFeature` sends `sourceRevision: session.revision` (global publication revision) instead of the per-source revision. | Another studio's actionable list stays visible across tab switches (spec §6.3 violation); even a future session-side revision check could never pass with the wrong value. | Clear model + disable actions on rebind until the new snapshot validates; send `admissionSeq`/content revision per row (requires including it in `ViewRow`). |
| 19 | medium | `panel/panel.html:15-36` | Sidebar chrome strings are hard-coded in HTML (`صفوة — سوال‌های پخش`, `در حال آماده شدن…`, settings labels, reset, `سوال‌های تازه`). | Violates "every visible sidebar string comes from `CONFIG.LABELS`" (spec §9.2/§17); wording diverges from config on the first paint and before `panel.js` loads. | Render chrome text from `CONFIG.LABELS` at init (keep static HTML only as the failure shell), or generate the shell from labels. |
| 20 | medium | `src/ws-main.js:119-131`, `src/session.js:590-628` | MAIN-queue drops (`counters.queueDropped`) are folded into an opaque `health` data string the bridge/session never parse; no demotion signal is raised for MAIN overflow. | Flood behavior differs between MAIN (silent drop) and bridge (latched `queueOverflow`); spec §8 row 18 "demote immediately, never truncate into the parser" is only half-wired. | Surface overflow as a dedicated `lifecycle`/demote envelope or make the health-stats string machine-readable and demote on `queueDropped>0`. |
| 21 | medium | `tools/build-manifest.js:131-162` | CLI only accepts `--variant v2-ws-log|…`; spec §2/§15 documents `--ws=log\|enrich\|primary`. | Rehearsal operators following the spec get `unknown argument` errors at the gate-transition step. | Accept `--ws=` as an alias mapping to the corresponding variant (and update the usage text). |
| 22 | low | `src/sw.js:37-39` | Refusal path for non-sidebar senders embeds a literal `{v:2,…}` instead of `makeEnvelope`, and `PORT_NAME` is referenced only via `void`. | Diverges from the single-envelope contract; future protocol changes desync the refusal shape. | Use `makeEnvelope(MESSAGE_TYPES.FEATURE_RESULT, …)` for refusals. |

## Top 5 priority fixes (ordered)
1. **Subscribe handshake deadlock (#1)** — nothing else matters until the panel can obtain tokens/snapshot; special-case `SUBSCRIBE`, test null→bound→patch flow.
2. **Feature availability + validation (#2, #3)** — set `domAnchor` for real records, send/check per-source revision, refuse twins and already-shown; otherwise the proxy is either dead or unsafe.
3. **Panel trust + tab binding (#5, #18, #14)** — validate tokens/epoch/revision on every port message, clear stale lists on rebind, verify active StreamYard tab in the SW.
4. **WS health wiring (#6, #12)** — remove the watchdog's fake room traffic, wire handshake/constructed/ended/generation and contradiction→demotion; otherwise silence detection and `effectiveSource` are fiction.
5. **Session lifetime + memory (#4, #9, #10)** — route-change reset, weak/evicted anchors, snapshot-coalescing fix; otherwise cross-broadcast contamination and heap growth over a 3 h session.

## Verdict on production-readiness (one paragraph; state the blockers)
Not production-ready. The sidebar can never complete its first subscribe (#1), and even past that the feature proxy is permanently disabled by the missing `domAnchor` (#2) while lacking twin/stale/shown guards (#3); stale/wrong-session data is applicable because the panel trusts everything pushed to it (#5) and route changes never reset the session (#4); WS health is defeated by faked room traffic and unwired lifecycle/contradiction signals (#6, #12); plus unbounded anchors, dropped snapshots, an unwindowed renderer, and a checked-in legacy manifest (#9, #10, #8, #11). Fix the top-5 group and add the missing proxy/sync tests before any live teaching session.

## What you verified as correct (short list, so the orchestrator knows what was checked)
- `ws-parser.js` pure contract: never throws, outbound/heartbeat/known-unrelated → `ignored`, unknown names → `unknown` (never delete/edit), batch failure → whole-batch `malformed`, no payload text in diagnostic codes, avatar HTTPS/credential rules, `shownCommentIds`-absent → ignored.
- `ws-main.js` tap discipline: constructor-only Proxy, `send`/prototypes/handlers untouched, real socket always returned, endpointKey-only envelopes (URL/token never cross the bridge), bounded queue, no payload logging.
- `ws-bridge.js` validation: same-window + same-origin, ns/version, handshake token, monotonic per-generation sequence, size/rate/queue budgets with latched demotion; subscriber-failure isolation.
- `admission.js` delivery dedupe (fixture pos-12/13 → one occurrence), scoped `(broadcastId,platform,commentId)` identity, DOM-never-delayed correlation window, primary/enrich merge semantics, shown-replace/starred-positive/commentUpdated-no-inference, log/off inertness — all covered by green `admission-test.js`.
- `health.js` thresholds and one-way latching (handshake/bridge/room/api-silence-as-staleness/unknown-schema windows/`effectiveSource` derivation) — green `health-test.js`.
- `sw.js` sidebar-only sender gate (`sender.id===runtime.id && !sender.tab`), sync `sidePanel.open` before awaits, `action.onClicked` never disables filtering; `content.js` host gate + fail-safe import chain + legacy branch isolation; `dom.js`/`config.js` selector isolation with no selector leakage elsewhere; panel XSS hygiene (`textContent` only, `dir=auto`, `no-referrer` avatars with fallback); `npm test` green and `node --check` clean on all reviewed files.
