[0m
> build · glm-5.3
[0m
[0m→ [0mRead specs/counsel/review-glm-5.3.md
[0m→ [0mRead src/session.js
[0m→ [0mRead src/panel-model.js
[0m→ [0mRead src/protocol.js
[0m→ [0mRead src/sw.js
[0m→ [0mRead src/dom.js
[0m→ [0mRead panel/panel.js
[0m→ [0mRead src/config.js
[0m→ [0mRead manifest.json
[0m→ [0mRead tools/build-manifest.js
[0m→ [0mRead panel/panel.html
[0m✱ [0mGlob "test/*.js"[90m 19 matches[0m
[0m→ [0mRead src/admission.js
[0m→ [0mRead test/run-tests.js
[0m→ [0mRead src/content.js
[0m→ [0mRead test/protocol-test.js
[0m✱ [0mGrep "kind|handshake|noteSessionReady|state\(|subscribe|generation|endpointKey"[90m in src/ws-bridge.js · 100 matches[0m
[0m✱ [0mGrep "enqueue\(|lifecycle|health|action"[90m in src/ws-main.js · 49 matches[0m
[0m✱ [0mGrep "noteParse|noteBridgeHandshake|noteSocketConstructed|noteSocketEnded|noteConnectionGeneration|noteBridgeFrame|noteContradiction|effectiveSource|function|tick"[90m in src/health.js · 100 matches[0m
[0m→ [0mRead package.json
[0m→ [0mRead src/health.js
[0m→ [0mRead test/panel-model-test.js
[0m→ [0mRead src/ws-bridge.js[90m [offset=100, limit=120][0m
[0m
[0m$ [0mnpm test 2>&1 | tail -40
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
[0m→ [0mRead src/ws-main.js[90m [limit=120, offset=100][0m
[0m✱ [0mGrep "LIFECYCLE"[90m in src/ws-main.js · 4 matches[0m
[0m→ [0mRead src/ws-main.js[90m [limit=15, offset=85][0m
[0m
[0m$ [0mnpm test 2>&1 | grep -E "FAIL|failed [1-9]|passed" 
86 passed, 0 failed
  PASS  synthetic: platform is lowercased and passed through without per-platform branches
ws-parser tests: 35 passed, 0 failed
17 passed, 0 failed
24 passed, 0 failed
protocol tests: 11 passed, 0 failed
panel-model tests: 9 passed, 0 failed
[0m
# Re-review: Ṣafwa v2 (post-fix)

`npm test` green: 86 core + 35 ws-parser + 17 health + 24 admission + 11 protocol + 9 panel-model + 6 legacy regressions, 0 failures. Still no coverage of `session.js`/`panel.js`/`sw.js` — the seams where most findings lived.

## Earlier critical/high findings

| # | Verdict | Evidence |
|---|---|---|
| 1 Bootstrap deadlock (critical) | **FIXED** | Panel cold-connects with null identity (`panel/panel.js:126`); session accepts an unbound SUBSCRIBE/RESYNC as the handshake and pushes identity+snapshot (`src/session.js:562-568`); panel binds on SNAPSHOT_BEGIN (`panel/panel.js:139-148`). No cold-connect protocol test was added (see #8). |
| 2 Re-render double count (critical) | **PARTIALLY FIXED** | Remount/re-attach path fixed: WeakRef `occurrenceRegistry` re-anchors existing records without re-running the pipeline (`src/session.js:238-271`), `admitDom !isNew` re-anchors only (`282-288`). Residual: a registry hit whose old node is still **connected but recycled to other content** is admitted as a "genuine second live copy" (`260-270`) — the fingerprint entry is never invalidated when its node's content changes, so a VirtualScroller slot recycle + scroll-back re-admits the comment (DOM records carry no `commentId`, `src/admission.js:315-339`) → count inflation survives on the recycle path. No re-render regression test. |
| 3 Feature proxy disabled (critical) | **FIXED** | `currentProjection` stamps `row.feature` from anchor liveness + `shown` at publish (`src/session.js:436-456`); `record.domAnchor` also set on admit/remount (`266`, `292`). `src/panel-model.js:77-86` still keys on `domAnchor`, but the session overwrites `row.feature` wholesale, so production availability is session-derived. |
| 4 Folded dropped (high) | **FIXED** | `folded` ships in SNAPSHOT_END and PATCH (`src/session.js:487`, `526-534`); panel renders the «نظرهای جمع‌شده» disclosure (`panel/panel.js:262-276`). Edge case lost instead — see N3. |
| 5 Renderer destroys reading position (high) | **FIXED** | 150-row window (`panel/panel.js:218`), older-rows expander (`231-244`), keyed element reuse (`246-257`), scroll preservation + «سوال‌های تازه» control (`221-223`, `281-287`). Nits: auto-follow threshold is `autoFollowPx*4` = 192px vs spec's 48px (`panel.js:93`); `windowCount` grows unbounded (`240-242`). |
| 6 Route change never resets (high) | **FIXED** | Watchdog href boundary → `resetSession` (`src/session.js:198-204`); epoch bump + full reset + fresh snapshot (`418-432`); panel re-binds on the post-reset SNAPSHOT_BEGIN (`panel/panel.js:139-148`). Residual: see N5. |
| 7 WS health unwired/masked (high) | **PARTIALLY FIXED** | Wired: handshake (`src/session.js:697-700`, `725-728`), `noteParse` per frame (`735`), health-kind → `noteBridgeFrame` (`720-722`), synthetic watchdog liveness deleted (`198-214` has none), demotion enforced before ingest (`738-742`). Broken: the lifecycle branch reads `envelope.action` (`713-716`), a field the bridge never forwards — see N1. Handshake also only noted on `frame` kinds, not lifecycle/health. |
| 8 Missing spec-mandated tests (high) | **STILL OPEN** | No `session` harness, no `feature-proxy`/`native-safety`/`panel-render` tests (`test/` listing); `package.json:8` script unchanged; `test/protocol-test.js` has no cold-connect case; `test/panel-model-test.js:38` still fabricates `domAnchor: true` instead of `createAdmission()` records. None of the F1–F7 fixes is regression-locked. |

## Earlier medium/low findings (compact)

| # | Verdict | Evidence |
|---|---|---|
| 9 Rebuild wipes LLM decisions | **STILL OPEN** | `src/session.js:401-416` regex-only replay, no persistence/re-enqueue; triggered at `135`, `299-302`, `756-759`. |
| 10 No LLM scheduler | **STILL OPEN** | `src/session.js:368-397` unconstrained `fetch` per decision; no caps/expiry/circuit breaker. |
| 11 Feature validation gaps | **FIXED** | `sourceRevision` + `shown` re-check at click (`src/session.js:638-644`); exactly-one button (`src/dom.js:155-163`); twins refusal (`session.js:654-667`). |
| 12 SW target validation | **FIXED** | `sender.url` panel check (`src/sw.js:46-50`); tab windowId+active+StreamYard check (`51-61`). |
| 13 Panel trust / master-off | **PARTIALLY FIXED** | Session binding (`panel/panel.js:130-137,140`); «غیرفعال» status (`176-181`, `202-207`); but list-hiding boolean inverted (`210`) — see N2. |
| 14 Strong anchors + dead `occurrences` | **PARTIALLY FIXED** | `occurrences` gone from admission.js; WeakRef registry + prune (`src/session.js:59`, `305-317`); `anchors` Map still strong-refs `el` forever, never pruned (`58`, `294`). |
| 15 O(n) `findDomMatch` per frame | **STILL OPEN** | `src/admission.js:275-294`; `correlate()` per frame (`session.js:752`) and per admit (`298`); no index. |
| 16 Swallowed snapshot | **FIXED** | `pendingSnapshot` upgrade (`src/session.js:459`, `462-465`, `471`). |
| 17 Twin metadata cross-merge | **STILL OPEN** | `src/admission.js:278` guard only blocks re-attach to the same record; out-of-order twins still swap ids across records. |
| 18 Manifest/build tooling | **PARTIALLY FIXED** | Root `manifest.json:39-63` is now v2-ws matching `WS_MODE:"enrich"` (`src/config.js:162`); legacy embedded (`tools/build-manifest.js:30-72`). But `--out` default still overwrites root (`132`, `177-179`) and the three `--ws` variants emit byte-identical manifests without touching/verifying WS_MODE (`23`, `85-98`) — see N4. |
| 19 Hard-coded panel strings | **STILL OPEN** | `panel/panel.html:6,15,16,19,25,26,29,33,36` still hard-coded; `panel.js` never populates them from `CONFIG.LABELS`. |
| 20 Global `safwaResetAt` reset | **STILL OPEN** | `src/session.js:118-121` resets from any context, not port/tab-scoped. |
| 21 `unknown` outcome message | **STILL OPEN** | `panel/panel.js:420-427` re-enables with find-native tooltip; `result.reasonCode` ignored — `sw.js:68` sends `featureCheckBroadcast` and the panel drops it. |

## NEW defects introduced by the fixes

| # | Severity | Location | Defect |
|---|---|---|---|
| N1 | high (WS builds) | `src/session.js:713-716` vs `src/ws-bridge.js:194-206`, `src/ws-main.js:89-93` | The new lifecycle wiring reads `envelope.action`, but the bridge forwards only kind/endpointKey/socketId/generation/sequence/receivedAt/dataType/data — the event name is inside `data` as `{"event":"constructed"}`. `noteSocketConstructed`/`noteSocketEnded` never fire: socket close/error never demotes, and no fresh silence window is granted on construction; only the 6s room-silence path compensates. |
| N2 | medium | `panel/panel.js:210` | `paintEnabledState`'s `list.hidden = !enabled && !settings.hidden` is inverted: filter off + settings closed still shows the filtered list (spec 6.2); settings open + enabled lets any HEALTH/storage event un-hide the list under the settings sheet. Should be `!enabled \|\| !settings.hidden`. |
| N3 | low | `panel/panel.js:225-228` | Empty-rows render early-returns before the folded disclosure (`262-276`), so a session containing only folded records (e.g. one hidden greeting) shows «در انتظار سوال‌ها» with no way to reach the folded item — criterion 11 broken in that edge. |
| N4 | medium (tooling) | `tools/build-manifest.js:132,174-179` vs `manifest.json:39-63` | `npm run build:manifest` (default variant `v2`) now silently strips `ws-main.js`/`ws-bridge.js` from the checked-in root ws manifest while config keeps `WS_MODE:"enrich"` → the rebuilt root package degrades to DOM-only at runtime (`session.js:691-695` warn). New footgun created by making the root manifest the ws packaging. |
| N5 | low/medium | `src/session.js:426-429` | `resetSession` re-seeds `collectCommentNodes(container)` whenever the container is still connected — on a route change the old studio's container can still be mounted, admitting old-broadcast rows into the fresh session. |
| N6 | nits | `src/session.js:567`; `panel/panel.js:93,436-444` | Handshake builds `currentProjection()` twice; auto-follow is 192px vs spec 48px; a session reset during a pending feature click leaves the button permanently disabled (ACTION_STATUS is dropped by the epoch check and the `pendingFeature` entry never resolves). |

## Verdict

The three blockers are genuinely resolved — the sidebar bootstraps, the feature proxy can fire, and wholesale re-render inflation is stopped — and F4/F5/F6/F11/F12/F16 are solid fixes. But F2's remaining recycle path still breaks "never double count" on a routine trigger (virtualized slot recycling), F7's lifecycle wiring is dead code due to the `action`-field mismatch (N1), the master-off list hiding is inverted (N2), and with F8 still open none of these fixes is protected by a regression test. Not production-ready for a WS rehearsal until N1/N2 and the F2 recycle residual are fixed and the session-seam harness exists.
