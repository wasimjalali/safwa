[0m
> build · glm-5.3
[0m
[0m$ [0mgit log --oneline -15 && git status && git branch -a
4117a75 Fix round-3 review findings: panel identity rebind, sticky shown latch, LLM guard epochs
54d0e2c Fix round-2 review findings: latch the validated click, reconnect, LLM pause, folded diffs
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
On branch feat/safwa-v2-sidebar
Your branch is up to date with 'origin/feat/safwa-v2-sidebar'.

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	specs/counsel/v2-review-glm-iter4.md

nothing added to commit but untracked files present (use "git add" to track)
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
[0m→ [0mRead specs/counsel/v2-review-glm-iter3.md
[0m
[0m# [0mTodos
[•] Read fix commit 4117a75 diff in detail
[ ] Run npm test, confirm green
[ ] Verify R3-1..R3-7 fixes
[ ] Hunt for NEW defects in full diff main...HEAD
[ ] Write round-4 findings report
[0m
[0m$ [0mgit show 4117a75 --stat | cat
commit 4117a75fb1dfd3ffa757bb44e701db23320586e5
Author: Wasim Jalali <wasimjalali2004@gmail.com>
Date:   Fri Sep 11 14:38:38 2026 +0200

    Fix round-3 review findings: panel identity rebind, sticky shown latch, LLM guard epochs

 panel/panel.js                       |  16 +-
 specs/counsel/v2-review-glm-iter3.md | 601 +++++++++++++++++++++++++++++++++++
 src/admission.js                     |  11 +-
 src/session.js                       |  30 +-
 4 files changed, 646 insertions(+), 12 deletions(-)
[0m
[0m$ [0mnpm test > /tmp/safwa-test-r4.log 2>&1; echo "exit=$?"; grep -E "passed, [0-9]+ failed" /tmp/safwa-test-r4.log
exit=0
86 passed, 0 failed
ws-parser tests: 35 passed, 0 failed
17 passed, 0 failed
24 passed, 0 failed
protocol tests: 12 passed, 0 failed
panel-model tests: 11 passed, 0 failed
feature-proxy tests: 13 passed, 0 failed
native-safety tests: 5 passed, 0 failed
panel-render tests: 5 passed, 0 failed
[0m
[0m$ [0mgit show 4117a75 -- panel/panel.js src/admission.js src/session.js | cat
commit 4117a75fb1dfd3ffa757bb44e701db23320586e5
Author: Wasim Jalali <wasimjalali2004@gmail.com>
Date:   Fri Sep 11 14:38:38 2026 +0200

    Fix round-3 review findings: panel identity rebind, sticky shown latch, LLM guard epochs

diff --git a/panel/panel.js b/panel/panel.js
index 7028ecc..f997e1d 100644
--- a/panel/panel.js
+++ b/panel/panel.js
@@ -163,6 +163,9 @@ async function bindTab() {
     port = null;
     tabId = null;
     boundTab = false;
+    bound.token = null;
+    bound.epoch = null;
+    bound.revision = 0;
     setStatus(L.panelDisconnected);
     scheduleRebind();
   });
@@ -347,7 +350,15 @@ function emptyNode(text) {
 }
 
 function rowKey(row) {
-  return JSON.stringify([row.primary.displayText, row.badges, row.feature, row.shown, row.starred]);
+  return JSON.stringify([
+    row.primary.displayText,
+    row.badges,
+    row.feature,
+    row.shown,
+    row.starred,
+    row.joinedFragments ?? null,
+    row.members ?? null,
+  ]);
 }
 
 export function renderRow(row) {
@@ -512,7 +523,6 @@ function requestFeature(row, button) {
   setTimeout(() => {
     const entry = pendingFeature.get(requestId);
     if (!entry) return;
-    pendingFeature.delete(requestId); // one-shot: a late reply is ignored
     // Never re-enable on an unknown outcome: a second click could toggle the
     // broadcast off. Ask the content session for the recorded outcome.
     entry.resolve({ outcome: "unknown", reasonCode: "featureCheckBroadcast" });
@@ -524,6 +534,8 @@ function requestFeature(row, button) {
       port = null;
       tabId = null;
     }
+    // Keep the entry briefly so a refused ACTION_STATUS can still re-enable.
+    setTimeout(() => pendingFeature.delete(requestId), 5000);
   }, CONFIG.FEATURE_PROXY.ackTimeoutMs);
 }
 
diff --git a/src/admission.js b/src/admission.js
index d29aaf5..2431852 100644
--- a/src/admission.js
+++ b/src/admission.js
@@ -522,7 +522,16 @@ export function createAdmission(config, { now = () => Date.now() } = {}) {
             if (broadcastId && record.broadcastId && record.broadcastId !== broadcastId) {
               continue;
             }
-            const next = shown.has(record.commentId) ? "on" : "unknown";
+            let next;
+            if (shown.has(record.commentId)) {
+              next = "on";
+            } else if (record.shown === "pending") {
+              // Sticky latch: a snapshot generated before our validated click
+              // must not re-arm the button (measured snapshot lag ~10s).
+              next = "pending";
+            } else {
+              next = "unknown";
+            }
             if (record.shown !== next) {
               record.shown = next;
               out.updated.push(record);
diff --git a/src/session.js b/src/session.js
index b898918..4522c50 100644
--- a/src/session.js
+++ b/src/session.js
@@ -52,7 +52,8 @@ export function startSession(deps) {
   let health = healthMod.createHealth(config);
   let wsState = config.WS_MODE === "off" ? "off" : "starting";
   let bridgeHandshakeSeen = false;
-  let lastQueueDropped = 0;
+  let rebuildEpoch = 0;
+  const lastQueueDroppedByKey = new Map();
   let masterEnabled = true;
   let lastHref = location.origin + location.pathname;
 
@@ -411,6 +412,8 @@ export function startSession(deps) {
       decision,
       sourceId,
       admittedAt: admission.getRecord(sourceId)?.admittedAt ?? Date.now(),
+      settingsRevision,
+      rebuildEpoch,
     });
     if (llmQueue.length > LLM_QUEUE_MAX) llmQueue.splice(0, llmQueue.length - LLM_QUEUE_MAX);
     drainLlm();
@@ -434,7 +437,8 @@ export function startSession(deps) {
     const guard = {
       documentToken,
       sessionEpoch,
-      settingsRevision,
+      settingsRevision: job.settingsRevision,
+      rebuildEpoch: job.rebuildEpoch,
       sourceId,
       contentRevision: admission.getRecord(sourceId)?.admissionSeq ?? 0,
       contentText: comment.displayText,
@@ -448,16 +452,19 @@ export function startSession(deps) {
       );
       llmFailures = llmFailures.filter((t) => Date.now() - t < LLM_FAIL_WINDOW_MS);
       if (!result) {
-        llmFailures.push(Date.now());
-        if (llmFailures.length >= 3) {
-          llmPausedUntil = Date.now() + LLM_PAUSE_MS;
-          llmFailures = [];
+        if (config.LLM_ENABLED) {
+          llmFailures.push(Date.now());
+          if (llmFailures.length >= 3) {
+            llmPausedUntil = Date.now() + LLM_PAUSE_MS;
+            llmFailures = [];
+          }
         }
         return;
       }
       if (guard.documentToken !== documentToken) return;
       if (guard.sessionEpoch !== sessionEpoch) return;
       if (guard.settingsRevision !== settingsRevision) return;
+      if (guard.rebuildEpoch !== rebuildEpoch) return;
       const record = admission.getRecord(sourceId);
       if (!record || record.admissionSeq !== guard.contentRevision) return;
       if (record.displayText !== guard.contentText) return;
@@ -484,6 +491,7 @@ export function startSession(deps) {
   /* ----------------------------------------------------- settings rebuild */
 
   function rebuildFromRecords() {
+    rebuildEpoch += 1;
     state = stateMod.createState();
     decisions.clear();
     const ordered = admission.records().slice().sort((a, b) => a.admissionSeq - b.admissionSeq);
@@ -765,7 +773,10 @@ export function startSession(deps) {
     if (!clicked) return finish(request.requestId, refuse("featureFindNative"));
     // Latch the one validated click in the model: every later snapshot/rebuild
     // must keep the button disabled so it can never toggle the comment off air.
-    if (record) record.shown = "pending";
+    if (record) {
+      record.shown = "pending";
+      record.clickedAt = Date.now();
+    }
     return finish(request.requestId, FEATURE_OK);
   }
 
@@ -822,8 +833,9 @@ export function startSession(deps) {
       health.noteBridgeFrame(envelope.endpointKey);
       try {
         const stats = JSON.parse(envelope.data || "{}");
-        if (typeof stats.queueDropped === "number" && stats.queueDropped > lastQueueDropped) {
-          lastQueueDropped = stats.queueDropped;
+        const prior = lastQueueDroppedByKey.get(envelope.endpointKey) ?? 0;
+        if (typeof stats.queueDropped === "number" && stats.queueDropped > prior) {
+          lastQueueDroppedByKey.set(envelope.endpointKey, stats.queueDropped);
           // A dropped frame is a loss signal: count it toward demotion (spec §8 row 18).
           health.noteParse("malformed", envelope.endpointKey);
         }
[0m
[0m→ [0mRead panel/panel.js
Fix commit mapped and tests green. Now reading the current state of the three fixed files plus the consumers to verify each fix actually works end-to-end.
[0m→ [0mRead src/session.js
`npm test` green (exit 0, all 10 suites). Panel read — R3-1 (bound cleared on disconnect), R3-3 (5s retention), R3-7 (rowKey widened) all visible. Now reading session.js and admission.js in full to verify the R3-2/R3-4/R3-5/R3-6 fixes end-to-end.
[0m✱ [0mGrep "clickedAt"[90m in . · 4 matches[0m
[0m→ [0mRead src/admission.js[90m [offset=440, limit=130][0m
[0m✱ [0mGrep "shown"[90m in src/panel-model.js · 30 matches[0m
Session verified for R3-4/R3-5/R3-6 mechanics. Now the admission sticky latch (R3-2), `clickedAt` usage, panel-model projection of `shown`, and sw.js forwarding for the R3-3 path.
[0m→ [0mRead src/sw.js
[0m
[0m$ [0mgit diff main...HEAD --stat | tail -30
src/protocol.js                                    | 125 +++
 src/proxy-rules.js                                 |  61 ++
 src/session.js                                     | 894 +++++++++++++++++++++
 src/sw.js                                          |  82 ++
 src/ui.js                                          |  83 +-
 src/ws-bridge.js                                   | 283 +++++++
 src/ws-main.js                                     | 300 +++++++
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
 test/feature-proxy-test.js                         | 129 +++
 test/fixtures/ws-2026-09-11-events.json            |  50 ++
 test/health-test.js                                | 280 +++++++
 test/native-safety-test.js                         |  88 ++
 test/panel-model-test.js                           | 173 ++++
 test/panel-render-test.js                          | 163 ++++
 test/protocol-test.js                              | 138 ++++
 test/ui-safety-test.js                             |  15 +
 test/ws-parser-test.js                             | 569 +++++++++++++
 tools/build-manifest.js                            | 217 +++++
 74 files changed, 15720 insertions(+), 378 deletions(-)
[0m
[0m✱ [0mGrep "shownSet|pending|rebuildEpoch|lastQueueDropped|bound\.token"[90m in test · 20 matches[0m
`clickedAt` is write-only (only set, never read — the sticky latch doesn't use it). Panel-model downgrades `pending` to `unknown` in the row projection but the feature checks read the record directly, so behavior is right. Now checking sw.js forwarding, protocol validation, and existing test coverage for the fixed paths.
[0m→ [0mRead src/protocol.js
[0m→ [0mRead test/admission-test.js[90m [limit=60, offset=425][0m
sw.js forward path and store-assets deletion (v1 screenshots removed on this branch) noted. Now protocol.js validation, the admission shownSet test semantics, and config constants to close the loop.
Protocol and admission tests confirmed. One last check — the FEATURE_PROXY/PANEL timing constants that govern the R3-3 refused-after-timeout path, then the report.
[0m✱ [0mGrep "ackTimeoutMs|requestExpiryMs|healthIntervalMs|maxMountedRows|snapshotChunkRows|FEATURE_PROXY|LLM_ENDPOINT|LLM_ENABLED"[90m in src/config.js · 21 matches[0m
[0m
[0m# [0mTodos
[✓] Read fix commit 4117a75 diff in detail
[✓] Run npm test, confirm green
[✓] Verify R3-1..R3-7 fixes
[✓] Hunt for NEW defects in full diff main...HEAD
[✓] Write round-4 findings report
[0m
# Ṣafwa v2 Review — Round 4 (final verification, HEAD 4117a75 vs main)

`npm test` green, exit 0: 86 core + 35 ws-parser + 17 health + 24 admission + 12 protocol + 11 panel-model + 13 feature-proxy + 5 native-safety + 5 panel-render + all content.js/ui regressions. Delta since round 3 is exactly commit 4117a75 (panel.js, admission.js, session.js); every other file re-spot-checked against the round-3 record — unchanged.

## Round-3 fix verification

| R3 | Status | Evidence |
|---|---|---|
| R3-1 panel identity rebind (High) | **Fixed, clean** | panel.js:162-171 clears `bound.token/epoch/revision` on disconnect; `SNAPSHOT_BEGIN` (panel.js:188) then accepts the new session, cold SUBSCRIBE → `isUnboundHandshake` → snapshot → rebind. FEATURE_REQUEST / RESET / RESYNC all carry fresh tokens afterwards — full chain re-traced through protocol.js:72-88 and session.js:669-718 |
| R3-2 sticky shown latch (Medium) | **Fixed** | admission.js:525-534 keeps `"pending"` through any `shownSet` lacking the id (promotes only when the id appears); latch + stamp at session.js:776-779. Both panel-model.js:98 and session.js:544-545 refuse on `pending`; projection downgrade at panel-model.js:61 is benign — feature availability reads the record, and the latch propagates via `row.feature` |
| R3-3 ACTION_STATUS reply lands (Low) | **Fixed** (one new low, below) | panel.js:538 keeps the entry 5s; handler panel.js:234-241 resolves + deletes; session replies from receipts (session.js:702-714). Resolves are plain callbacks, not promise settles — a second call genuinely lands |
| R3-4 disabled LLM ≠ failure (Low) | **Fixed, clean** | session.js:454-461 counts `null` only under `config.LLM_ENABLED`; misconfigured endpoint (enabled + empty) still counts — correct |
| R3-5 per-endpoint drop high-water (Low) | **Fixed** | session.js:56, 836-841 per-key map matches ws-main's per-key cumulative report; monotonic, no cross-endpoint masking |
| R3-6 rebuild epochs (Low) | **Fixed, clean** | `rebuildEpoch` bumped in `rebuildFromRecords` (session.js:494) — all three rebuild paths call it (settings :147, correlate :319, WS ingest :880); guard captures `settingsRevision`/`rebuildEpoch` at schedule time (:415-416, :440-441) and drain checks both (:466-467), also closing the old tautology |
| R3-7 hardening (Low, carried) | **Partial** | `rowKey` widened with `joinedFragments`/`members` (panel.js:352-362). Still carried: `lastFocusedWindow` bind (panel.js:138); store-assets — the branch **deletes** the v1 screenshots with no v2 replacements staged |

## New-defect hunt

| # | Severity | Location | Defect | Why it matters | Fix |
|---|---|---|---|---|---|
| R4-1 | **Low** | panel/panel.js:506-514 | The R3-3 fix re-enables the button on a late `refused` but never restores its label. The refused reply always arrives *after* the ack timeout already set `textContent = featureCheckBroadcast`, so the re-armed button stays labeled «نمایش را در برنامه زنده بررسی کنید» instead of `L[row.feature.labelKey]`. Reachable whenever the session refuses slower than `ackTimeoutMs` (1 s, e.g. twin scan on a busy page) — the main path the fix was built for. | A clickable button telling the teacher to go check the broadcast; confusing but the action itself works and the safety posture is intact. | In the `refused` branch, also set `button.textContent = L[row.feature.labelKey] ?? L.featureShow` |
| R4-2 | Nit | src/session.js:778 | `record.clickedAt` is stamped but never read anywhere — the sticky latch works without it. | Dead field; misleads future maintainers into thinking a timestamp gate exists. | Drop it, or implement the timestamp alternative it was stamped for. |
| R4-3 | Nit | panel/panel.js:533-536 | The ACTION_STATUS send's `catch` nulls `port`/`tabId` but, unlike the watchdog catch (:94-98), does not call `scheduleRebind()` — recovery depends on the dead port's `onDisconnect` firing. | If `postMessage` throws without a subsequent `onDisconnect`, the panel stays unbound until a tab/window focus event. | Add `scheduleRebind()` in that catch (and optionally capture the port object in the `onDisconnect` closure so an orphaned old port can't clobber a freshly bound one). |
| R4-4 | Nit | test/ | No tests cover any R3 fix path: sticky `pending` in `applyStateEvents` (admission-test only exercises on/unknown), `rebuildEpoch` discard, per-endpoint drop map, panel identity clear, refused re-enable. | The fixes are verified by reading, not by the suite; a regression would ship silently. `npm test` remains the "done" gate per CLAUDE.md. | Add one test per fixed branch (all four seams are pure or DOM-free and cheap to cover). |
| R4-5 | Nit (carried R3-7) | panel/panel.js:138; store-assets/ | `bindTab` still `lastFocusedWindow`: every OS-level focus loss (`WINDOW_ID_NONE`) blanks the panel and drops the port until refocus; and the branch deletes the v1 store screenshots with no v2 replacements staged — merging to main leaves the store listing imageless. | Momentary self-healing disruption mid-stream; store-listing regression at merge time. | Pin the bind to the panel's own `windowId` (already captured at :159); stage v2 screenshots before merge. |
| R4-6 | Nit (design note) | src/admission.js:528-531 | Sticky-`pending` is forever: a click StreamYard silently dropped leaves the row un-feature-able from the panel until session reset. | Fail-safe direction (never toggles off air; the disabled button's tooltip already points to the native column), but the teacher has no panel retry. | Acceptable as-is given the cost asymmetry; a bounded latch (e.g. 60 s) is the alternative if it ever bothers the owner. |

**Verified clean while hunting:** the latch propagates through projection/rebuild/element-reuse (`row.feature` is in `rowKey`; window churn can re-render a stale enabled button but the session-side refusal matrix backstops it); `on` → set-without-id demotion is spec'd fresh-set semantics, not a re-opened toggle-off hole; panel rebind races (own `disconnect()` doesn't fire own `onDisconnect`; rebind-attempt reset at :175); watchdog/RESYNC/revision-gap recovery loops; sw.js forward `windowId`/`active`/URL checks; receipts idempotency and the 200-receipt cap; R2-9 rebuild re-enqueue vs the 8 s admission TTL (pre-existing, fail-safe, unchanged).

## Verdict

**NO BLOCKING FINDINGS**

All seven round-3 findings are fixed (R3-1 and R3-2 cleanly and completely); the one new defect is low and cosmetic (R4-1), the rest are nits — most useful next: the R4-1 one-line label restore and the R4-4 test coverage for the fixed seams. The branch is sound to merge from a correctness standpoint; stage the v2 store screenshots (R4-5) before merging to main.
