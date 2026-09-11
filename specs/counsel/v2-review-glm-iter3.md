[0m
> build · glm-5.3
[0m
[0m$ [0mgit log --oneline -15 && git status && git branch -a
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
f8addb2 Merge pull request #13 from wasimjalali/chore/discovery-ground-truth
On branch feat/safwa-v2-sidebar
Your branch is up to date with 'origin/feat/safwa-v2-sidebar'.

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	specs/counsel/v2-review-glm-iter3.md

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
[0m→ [0mRead specs/counsel/v2-review-glm-iter2.md
[0m
[0m# [0mTodos
[•] Read fix commit 54d0e2c diff in detail
[ ] Run npm test
[ ] Verify R2-1..R2-10 fixes
[ ] Hunt new defects introduced by fixes
[ ] Write round-3 findings report
[0m
[0m$ [0mgit show 54d0e2c --stat | cat
commit 54d0e2c46b6ce99396f8836415bb4999b195f5b8
Author: Wasim Jalali <wasimjalali2004@gmail.com>
Date:   Fri Sep 11 14:27:05 2026 +0200

    Fix round-2 review findings: latch the validated click, reconnect, LLM pause, folded diffs

 panel/panel.js                       |  34 ++-
 specs/counsel/v2-review-glm-iter2.md | 575 +++++++++++++++++++++++++++++++++++
 specs/safwa-v2-architecture.md       |   8 +-
 src/config.js                        |   1 +
 src/panel-model.js                   |   3 +-
 src/proxy-rules.js                   |   4 +-
 src/session.js                       |  35 ++-
 src/ws-main.js                       |  28 +-
 test/feature-proxy-test.js           |   5 +
 9 files changed, 663 insertions(+), 30 deletions(-)
[0m
[0m$ [0mgit show 54d0e2c -- panel/panel.js src/config.js src/panel-model.js src/proxy-rules.js src/session.js src/ws-main.js test/feature-proxy-test.js specs/safwa-v2-architecture.md | cat
commit 54d0e2c46b6ce99396f8836415bb4999b195f5b8
Author: Wasim Jalali <wasimjalali2004@gmail.com>
Date:   Fri Sep 11 14:27:05 2026 +0200

    Fix round-2 review findings: latch the validated click, reconnect, LLM pause, folded diffs

diff --git a/panel/panel.js b/panel/panel.js
index 5a1d684..7028ecc 100644
--- a/panel/panel.js
+++ b/panel/panel.js
@@ -36,6 +36,7 @@ let lastHealthAt = Date.now();
 let savedScrollTop = 0;
 const pendingFeature = new Map();
 const WINDOW_CAP = 1200;
+let lastWindowCount = 0;
 
 app.hidden = false;
 document.getElementById("static-failure").hidden = true;
@@ -88,7 +89,13 @@ async function init() {
   setInterval(() => {
     if (!port || Date.now() - lastHealthAt < 4000) return;
     setStatus(L.panelDisconnected);
-    port.postMessage(makeEnvelope(MESSAGE_TYPES.RESYNC, envelopeFields()));
+    try {
+      port.postMessage(makeEnvelope(MESSAGE_TYPES.RESYNC, envelopeFields()));
+    } catch {
+      port = null;
+      tabId = null;
+      scheduleRebind();
+    }
     lastHealthAt = Date.now();
   }, CONFIG.PANEL.healthIntervalMs);
   chrome.storage?.onChanged?.addListener((changes, area) => {
@@ -153,6 +160,8 @@ async function bindTab() {
   port = chrome.tabs.connect(tab.id, { name: PORT_NAME, frameId: 0 });
   port.onMessage.addListener(onPortMessage);
   port.onDisconnect.addListener(() => {
+    port = null;
+    tabId = null;
     boundTab = false;
     setStatus(L.panelDisconnected);
     scheduleRebind();
@@ -258,6 +267,7 @@ function render() {
   const wasNearEnd = nearEnd();
   const prevScroll = list.scrollTop;
   const prevHeight = list.scrollHeight;
+  const grewWindow = windowCount !== lastWindowCount;
 
   if (rows.length === 0 && folded.length === 0) {
     list.replaceChildren(emptyNode(L.panelWaiting));
@@ -272,7 +282,7 @@ function render() {
     older.style.position = "static";
     older.style.transform = "none";
     older.style.margin = "8px auto";
-    older.textContent = `${L.panelFolded} (${rows.length - windowCount}+)`;
+    older.textContent = `${L.panelOlder} (${rows.length - windowCount}+)`;
     older.addEventListener("click", () => {
       windowCount = Math.min(WINDOW_CAP, windowCount + CONFIG.PANEL.maxMountedRows);
       render();
@@ -318,10 +328,15 @@ function render() {
 
   if (wasNearEnd) {
     list.scrollTop = list.scrollHeight;
-  } else {
+  } else if (grewWindow) {
+    // "load older" prepends rows: compensate by the added height.
     list.scrollTop = prevScroll + (list.scrollHeight - prevHeight);
+  } else {
+    // Comments append at the bottom; the viewport must not move.
+    list.scrollTop = prevScroll;
     if (arrivedNew) newItems.hidden = false;
   }
+  lastWindowCount = windowCount;
 }
 
 function emptyNode(text) {
@@ -496,13 +511,18 @@ function requestFeature(row, button) {
   });
   setTimeout(() => {
     const entry = pendingFeature.get(requestId);
-    if (entry) {
-      // Never re-enable on an unknown outcome: a second click could toggle the
-      // broadcast off. Ask the content session for the recorded outcome.
-      entry.resolve({ outcome: "unknown", reasonCode: "featureCheckBroadcast" });
+    if (!entry) return;
+    pendingFeature.delete(requestId); // one-shot: a late reply is ignored
+    // Never re-enable on an unknown outcome: a second click could toggle the
+    // broadcast off. Ask the content session for the recorded outcome.
+    entry.resolve({ outcome: "unknown", reasonCode: "featureCheckBroadcast" });
+    try {
       port?.postMessage(
         makeEnvelope(MESSAGE_TYPES.ACTION_STATUS, { ...envelopeFields(), requestId })
       );
+    } catch {
+      port = null;
+      tabId = null;
     }
   }, CONFIG.FEATURE_PROXY.ackTimeoutMs);
 }
diff --git a/specs/safwa-v2-architecture.md b/specs/safwa-v2-architecture.md
index 6aacdb2..860ca40 100644
--- a/specs/safwa-v2-architecture.md
+++ b/specs/safwa-v2-architecture.md
@@ -439,7 +439,7 @@ Unchanged and reaffirmed: `AUTO_HIDE_ANYTHING_AMBIGUOUS: false`, pipeline order,
 
 ```js
 // Sidebar chrome
-panelTitle: "صفوة — سوال‌های پخش",                        // "Safwa — broadcast questions"
+panelTitle: "صفوة — سوال‌های برنامه زنده",                        // "Safwa — broadcast questions"
 panelLoading: "در حال آماده شدن…",                          // "getting ready…"
 panelWaiting: "در انتظار سوال‌ها",                          // "waiting for questions"
 panelOpenStudio: "استودیوی StreamYard را باز کنید",         // "open the StreamYard studio"
@@ -452,11 +452,11 @@ panelSettingsBack: "بازگشت",                                 // "back"
 platformUnknown: "نامشخص",                                   // "unknown" (platform chip fallback)
 
 // Feature proxy
-featureShow: "نمایش در پخش",                                // "show on the broadcast"
+featureShow: "نمایش در برنامه زنده",                                // "show on the broadcast"
 featureShowFirst: "نمایش بخش اول",                          // "show the first fragment" (joined rows)
 featureFindNative: "برای نمایش، نظر را در ستون اصلی پیدا کنید", // "to feature it, find the comment in the native column"
-featureCheckBroadcast: "نمایش را در پخش بررسی کنید",        // "check the broadcast to verify"
-featureOnAir: "روی پخش",                                     // "on air" (validated shown state only)
+featureCheckBroadcast: "نمایش را در برنامه زنده بررسی کنید",        // "check the broadcast to verify"
+featureOnAir: "روی برنامه زنده",                                     // "on air" (validated shown state only)
 featureStarred: "ستاره‌دار",                                 // "starred"
 ```
 
diff --git a/src/config.js b/src/config.js
index 162d83d..92a3ec0 100644
--- a/src/config.js
+++ b/src/config.js
@@ -309,6 +309,7 @@ export const CONFIG = {
     panelSimpleMode: "حالت ساده",
     panelNewItems: "سوال‌های تازه",
     panelFolded: "نظرهای جمع‌شده",
+    panelOlder: "سوال‌های قدیمی‌تر",
     panelSettingsBack: "بازگشت",
     platformUnknown: "نامشخص",
 
diff --git a/src/panel-model.js b/src/panel-model.js
index b07a845..f49a3a5 100644
--- a/src/panel-model.js
+++ b/src/panel-model.js
@@ -94,7 +94,8 @@ export function buildViewRows(records, decisions, config) {
   const featureFor = (record, joined) => {
     const enabled =
       config?.FEATURE_PROXY_ENABLED === true && config?.PANEL_MODE === "sidebar";
-    const available = enabled && record.domAnchor === true && record.shown !== "on";
+    const available =
+      enabled && record.domAnchor === true && record.shown !== "on" && record.shown !== "pending";
     return {
       available,
       reasonCode: available ? null : "featureFindNative",
diff --git a/src/proxy-rules.js b/src/proxy-rules.js
index 8783fef..cde53bb 100644
--- a/src/proxy-rules.js
+++ b/src/proxy-rules.js
@@ -48,7 +48,9 @@ export function checkFeatureRequest(facts) {
   ) {
     return { ok: false, reasonCode: REFUSE };
   }
-  if (record.shown === "on") return { ok: false, reasonCode: REFUSE };
+  if (record.shown === "on" || record.shown === "pending") {
+    return { ok: false, reasonCode: REFUSE };
+  }
   if (!liveRow) return { ok: false, reasonCode: REFUSE };
   if ((liveRow.platform ?? "") !== (record.platform ?? "")) return { ok: false, reasonCode: REFUSE };
   if (liveRow.handle !== record.handle) return { ok: false, reasonCode: REFUSE };
diff --git a/src/session.js b/src/session.js
index 1273787..b898918 100644
--- a/src/session.js
+++ b/src/session.js
@@ -65,6 +65,7 @@ export function startSession(deps) {
   let publishTimer = null;
   let pendingSnapshot = false;
   let publishedKeys = new Map();
+  let publishedFoldKey = "";
 
   let container = null;
   let observer = null;
@@ -75,6 +76,10 @@ export function startSession(deps) {
 
   try {
     chrome.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
+      if (message?.type === "safwa-ping") {
+        sendResponse({ ok: true, version: chrome.runtime?.getManifest?.().version ?? "?" });
+        return true;
+      }
       if (message?.type !== "FEATURE_REQUEST") return;
       if (sender?.id !== chrome.runtime.id || sender.tab) {
         sendResponse(refuse("featureFindNative"));
@@ -432,6 +437,7 @@ export function startSession(deps) {
       settingsRevision,
       sourceId,
       contentRevision: admission.getRecord(sourceId)?.admissionSeq ?? 0,
+      contentText: comment.displayText,
     };
     try {
       const result = await llm.classifyComment(
@@ -441,12 +447,20 @@ export function startSession(deps) {
         llm.llmContextFromDecision(comment, decision)
       );
       llmFailures = llmFailures.filter((t) => Date.now() - t < LLM_FAIL_WINDOW_MS);
-      if (!result) return;
+      if (!result) {
+        llmFailures.push(Date.now());
+        if (llmFailures.length >= 3) {
+          llmPausedUntil = Date.now() + LLM_PAUSE_MS;
+          llmFailures = [];
+        }
+        return;
+      }
       if (guard.documentToken !== documentToken) return;
       if (guard.sessionEpoch !== sessionEpoch) return;
       if (guard.settingsRevision !== settingsRevision) return;
       const record = admission.getRecord(sourceId);
       if (!record || record.admissionSeq !== guard.contentRevision) return;
+      if (record.displayText !== guard.contentText) return;
       const next = grouping.applyLlmOverride(decision, result, state, config);
       if (!next || next === decision) return;
       storeDecision(sourceId, next);
@@ -458,6 +472,7 @@ export function startSession(deps) {
       }
       publish(false);
     } catch {
+      llmFailures = llmFailures.filter((t) => Date.now() - t < LLM_FAIL_WINDOW_MS);
       llmFailures.push(Date.now());
       if (llmFailures.length >= 3) {
         llmPausedUntil = Date.now() + LLM_PAUSE_MS;
@@ -482,6 +497,9 @@ export function startSession(deps) {
       objectSource.set(copy, record.sourceId);
       const decision = grouping.processComment(copy, state, config);
       storeDecision(record.sourceId, decision);
+      if (decision.needsLlmReview && config.LLM_ENABLED) {
+        scheduleLlm(copy, decision, record.sourceId);
+      }
     }
   }
 
@@ -515,7 +533,8 @@ export function startSession(deps) {
         config.FEATURE_PROXY_ENABLED &&
         config.PANEL_MODE === "sidebar" &&
         !!anchor?.el?.isConnected &&
-        record?.shown !== "on";
+        record?.shown !== "on" &&
+        record?.shown !== "pending";
       row.feature = {
         available,
         reasonCode: available ? null : "featureFindNative",
@@ -546,17 +565,18 @@ export function startSession(deps) {
       for (const id of publishedKeys.keys()) {
         if (!nextKeys.has(id)) removals.push(id);
       }
+      const foldKey = JSON.stringify(projection.folded);
+      const changed =
+        wantSnapshot || upserts.length > 0 || removals.length > 0 || foldKey !== publishedFoldKey;
+      if (!changed) return; // a true no-op publishes nothing and burns no revision
       publishedKeys = nextKeys;
+      publishedFoldKey = foldKey;
       revision += 1;
       for (const port of ports) {
         try {
           if (wantSnapshot) {
             sendSnapshot(port, rows, projection.folded);
           } else {
-            if (upserts.length === 0 && removals.length === 0) {
-              port.safwaRevision = revision;
-              continue;
-            }
             port.postMessage(
               protocol.makeEnvelope(protocol.MESSAGE_TYPES.PATCH, {
                 documentToken,
@@ -743,6 +763,9 @@ export function startSession(deps) {
     if (!verdict.ok) return finish(request.requestId, refuse(verdict.reasonCode ?? "featureFindNative"));
     const clicked = dom.clickShowButton(anchor.el);
     if (!clicked) return finish(request.requestId, refuse("featureFindNative"));
+    // Latch the one validated click in the model: every later snapshot/rebuild
+    // must keep the button disabled so it can never toggle the comment off air.
+    if (record) record.shown = "pending";
     return finish(request.requestId, FEATURE_OK);
   }
 
diff --git a/src/ws-main.js b/src/ws-main.js
index d391493..f9532c8 100644
--- a/src/ws-main.js
+++ b/src/ws-main.js
@@ -85,6 +85,7 @@
   var openCount = 0;
   var healthTimer = null;
   var counters = { oversize: 0, nonText: 0, queueDropped: 0 };
+  var droppedByKey = Object.create(null); // endpointKey -> drops (attribution)
 
   var LIFECYCLE = {
     constructed: '{"event":"constructed"}',
@@ -128,6 +129,8 @@
       var dropped = queue.shift();
       queueBytes -= dropped.bytes;
       counters.queueDropped += 1;
+      var dropKey = dropped.env && dropped.env.endpointKey;
+      if (dropKey) droppedByKey[dropKey] = (droppedByKey[dropKey] || 0) + 1;
     }
     queue.push({
       bytes: size,
@@ -176,19 +179,19 @@
       stopHealth();
       return;
     }
-    var stats =
-      '{"sockets":' +
-      openCount +
-      ',"oversize":' +
-      counters.oversize +
-      ',"nonText":' +
-      counters.nonText +
-      ',"queueDropped":' +
-      counters.queueDropped +
-      "}";
     var ids = Object.keys(openSockets);
     for (var i = 0; i < ids.length; i++) {
       var socket = openSockets[ids[i]];
+      var stats =
+        '{"sockets":' +
+        openCount +
+        ',"oversize":' +
+        counters.oversize +
+        ',"nonText":' +
+        counters.nonText +
+        ',"queueDropped":' +
+        (droppedByKey[socket.key] || 0) +
+        "}";
       enqueue("health", socket.key, ids[i], socket.gen, ++socket.seq, stats);
     }
   }
@@ -248,7 +251,10 @@
 
     socket.addEventListener("error", function () {
       try {
-        if (openSockets[id]) delete openSockets[id];
+        if (openSockets[id]) {
+          delete openSockets[id];
+          openCount -= 1;
+        }
         if (!stopped) enqueue("lifecycle", key, id, gen, ++state.seq, LIFECYCLE.error);
       } catch (e) {
         // Fail safe.
diff --git a/test/feature-proxy-test.js b/test/feature-proxy-test.js
index 9870d07..cd1e2ca 100644
--- a/test/feature-proxy-test.js
+++ b/test/feature-proxy-test.js
@@ -92,6 +92,11 @@ check("already shown refuses (never toggle off air)", () => {
   assert.equal(checkFeatureRequest({ ...happy, record: shownRecord }).ok, false);
 });
 
+check("a latched click (pending) refuses a second click", () => {
+  const pendingRecord = { ...record, shown: "pending" };
+  assert.equal(checkFeatureRequest({ ...happy, record: pendingRecord }).ok, false);
+});
+
 check("recycled row content mismatch refuses", () => {
   assert.equal(
     checkFeatureRequest({ ...happy, liveRow: { ...liveRow, displayText: "متن دیگر" } }).ok,
[0m
[0m→ [0mRead panel/panel.js
Fix commit mapped. Now let me run the tests and read the current state of the touched files in parallel.
[0m
[0m$ [0mnpm test 2>&1 | tail -60
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
  PASS  a latched click (pending) refuses a second click
  PASS  recycled row content mismatch refuses
  PASS  indistinguishable twins refuse
  PASS  missing or duplicated button refuses
  PASS  null request refuses without throwing
feature-proxy tests: 13 passed, 0 failed
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
Tests are green (13/13 feature-proxy now, including the new pending-latch test). Now reading the core session and model files in full.
[0m→ [0mRead src/session.js
[0m→ [0mRead src/admission.js[90m [offset=1, limit=120][0m
[0m✱ [0mGrep "applyShownSet|shown|starred"[90m in src/admission.js · 39 matches[0m
`npm test` green. Session read — I can see the R2-1 latch, R2-3 failure counting, R2-4 foldKey, R2-5 ping, R2-9 re-enqueue. Now I need the supporting modules to hunt interactions: admission (shown-state ownership vs the new `pending` latch), grouping's `applyLlmOverride` (needsLlmReview on output), llm-classifier's null paths, protocol handshake, ws-main, and popup.
[0m→ [0mRead src/admission.js[90m [limit=120, offset=455][0m
[0m✱ [0mGrep "needsLlmReview|applyLlmOverride|alsoRender"[90m in src/grouping.js · 20 matches[0m
Found the shown-state ownership seam (admission.js:513-530). Now reading the state-event application, grouping's LLM override, and the classifier's null paths.
[0m→ [0mRead src/grouping.js[90m [limit=180, offset=400][0m
[0m✱ [0mGrep "return null|async function classifyComment|LLM_ENABLED|function classifyComment"[90m in src/llm-classifier.js · 44 matches[0m
[0m→ [0mRead src/ws-main.js
The classifier has a benign `null` path (`!config.LLM_ENABLED || !config.LLM_ENDPOINT`, llm-classifier.js:245) that now counts as a failure under the R2-3 fix — noting that. Now reading ws-main, protocol, popup, panel-model, proxy-rules.
[0m→ [0mRead src/protocol.js
[0m→ [0mRead src/proxy-rules.js
ws-main verified for R2-7 (guarded decrement, self-healing timer). Now protocol, popup, panel-model, proxy-rules, sw.
[0m→ [0mRead src/sw.js
[0m→ [0mRead popup/popup.js[90m [limit=80, offset=270][0m
Protocol and proxy-rules verified. Key trace so far: after a content-session restart, the panel's stale `bound.token` rejects the new session's `SNAPSHOT_BEGIN` (panel.js:185), leaving `boundTab=false` — chunks/patches still flow through the `!boundTab` bypass, but every outbound token-bearing action (FEATURE_REQUEST, RESET, RESYNC) hits the new session's token check. Let me confirm the SW forwarding and popup ping, then panel-model.
[0m→ [0mRead src/panel-model.js
[0m✱ [0mGrep "PANEL:|maxMountedRows|autoFollowPx|healthIntervalMs|snapshotChunkRows|ackTimeoutMs|FEATURE_PROXY|LLM_ENDPOINT|WS_MODE"[90m in src/config.js · 28 matches[0m
sw.js and popup verified — the ping round-trip matches the session responder (R2-5 fixed), and the SW→session forward has no `sender.tab` conflict. Now panel-model and the config constants.
[0m→ [0mRead src/llm-classifier.js[90m [limit=80, offset=240][0m
panel-model, config, sw, popup all check out. Let me confirm the classifier's null paths precisely and re-verify the full test suite head + exit code.
[0m
[0m$ [0mnpm test > /tmp/safwa-test-r3.log 2>&1; echo "exit=$?"; grep -E "passed, 0 failed|failed" /tmp/safwa-test-r3.log | sort | uniq -c | sort -rn | head -20
exit=0
   1 ws-parser tests: 35 passed, 0 failed
   1 protocol tests: 12 passed, 0 failed
   1 panel-render tests: 5 passed, 0 failed
   1 panel-model tests: 11 passed, 0 failed
   1 native-safety tests: 5 passed, 0 failed
   1 feature-proxy tests: 13 passed, 0 failed
   1 86 passed, 0 failed
   1 24 passed, 0 failed
   1 17 passed, 0 failed
[0m
All suites green (exit 0). One quick check of the spec's shownCommentIds semantics (for the pending-latch race), then the report.
[0m$ [0mrg -n "shownCommentIds" specs/safwa-v2-architecture.md specs/counsel/WS-EVIDENCE-2026-09-11.md | head -12; echo ---; wc -l specs/counsel/v2-review-glm-iter3.md 2>/dev/null
specs/counsel/WS-EVIDENCE-2026-09-11.md:51:The app-state socket also broadcasts `subscription:"broadcast.status"` updates whose `payload.broadcast` includes **`shownCommentIds`** (the featured-comment ids) — a way to reflect feature state without touching the DOM.
specs/counsel/WS-EVIDENCE-2026-09-11.md:65:5. **Feature state** is observable (`commentUpdated`, `starredComment.starred`, `shownCommentIds`); the panel can reflect it without polling the DOM.
specs/safwa-v2-architecture.md:188:| `api` | `wss:` + host `streamyard.com` + path `/api` | `broadcast.status` (incl. `shownCommentIds`), `starredComment.starred`, 30 s ping/pong. Hello frame carries an auth token — never logged, never persisted, never forwarded. |
specs/safwa-v2-architecture.md:212:| api, `type:"update"`, `subscription:"broadcast.status"` | Read `message.payload.broadcast` → emit `{ kind:"shownSet", broadcastId: broadcast.id, videoRoomId, shownCommentIds, snapshotAt: payload.timestamp }` **only when `shownCommentIds` is explicitly present as an array**. Missing field = no update, never an empty set. |
specs/safwa-v2-architecture.md:251:5. `broadcast.update.shownCommentIds` → one `shownSet` event with `["LCC.SANITIZED_1"]`, correct `broadcastId`/`videoRoomId`; a synthetic `broadcast.status` **without** the field → no event.
specs/safwa-v2-architecture.md:304:  shown:   "unknown" | "on",                // from validated shownCommentIds only
specs/safwa-v2-architecture.md:361:**State reflection (enrich/primary modes, read-only):** `shown` comes only from a validated, fresh `broadcast.status` snapshot's explicit `shownCommentIds` (replace the whole set; preserve all ids — multiple shown comments allowed; missing field = no update). `commentUpdated` marks "stage-related state changed" on the associated record — never an inferred shown flag, edit, or acknowledgement. `starred` comes only from `starredComment.starred` (positive only; no invented unstar). Because the measured snapshot arrived **10.26 s after** the show request, a separate **15 s feature-state observation deadline** governs reflection; the 1 s ack only covers click dispatch. Stale snapshots are rejected by connection generation + receive order + broadcast update timestamp. In DOM/log modes, `shown`/`starred` stay `unknown` and the sidebar simply makes no on-air claim.
specs/safwa-v2-architecture.md:625:| `shownCommentIds` removal semantics (un-show) | Un-feature a comment in rehearsal; verify the snapshot shrinks before enabling negative reflection. |
---
     543 specs/counsel/v2-review-glm-iter3.md
[0m
# Ṣafwa v2 Review — Round 3 (feat/safwa-v2-sidebar vs main, fix commit 54d0e2c)

`npm test` green: 86 core + 35 ws-parser + 17 health + 24 admission + 12 protocol + 11 panel-model + **13 feature-proxy (new pending-latch test)** + 5 native-safety + 5 panel-render + all content/ui regressions, exit 0. Matching core, ws-parser, health, admission, dom, content.js, sw.js, manifest — untouched by the fix commit.

## Round-2 fix verification

| R2 | Status | Evidence |
|---|---|---|
| R2-1 click latched into `record.shown = "pending"` | **Fixed** (2 residues: R3-2, R3-3) | session.js:766-768 latch after validated click; refused in proxy-rules.js:51-53, panel-model.js:98, session.js:536-537; tested feature-proxy-test.js:95-98 |
| R2-2 port nulled on disconnect + safe sends | **Partially fixed — R3-1 (High)** | panel.js:162-168 nulls port/tabId; watchdog wrapped :92-98; ACTION_STATUS send wrapped :519-526 |
| R2-3 null LLM result counts as failure | **Fixed** (residue R3-4) | session.js:449-456 counts `null` (pruned first); catch path prunes :475 |
| R2-4 folded in change check, no revision burn | **Fixed, clean** | session.js:568-573 `foldKey` in `changed`; no-op returns before `revision += 1`; PATCH carries `folded` (:588), panel applies it (panel.js:217) |
| R2-5 safwa-ping responder | **Fixed, clean** | session.js:79-82 replies `{ok, version}`; popup resolve/reject path matches (popup.js:318-321) |
| R2-6 append keeps reading position | **Fixed, clean** | panel.js:270, 329-338 — `grewWindow` (prepend) compensates, appends keep `scrollTop`; `windowCount` never shrinks, so no false positive |
| R2-7 openCount decrement on error | **Fixed, clean** | ws-main.js:252-262, guarded against close double-decrement; timer self-heals via healthTick:178 |
| R2-8 per-endpoint drop attribution | **Partially fixed — R3-5** | ws-main.js:88, 132-133, 193 per-endpoint counters; session consumer not updated |
| R2-9 rebuild re-enqueues LLM | **Fixed** (residue R3-6) | session.js:500-502 re-schedules `needsLlmReview` under `LLM_ENABLED` + scheduler caps |
| R2-10 one-shot resolve | **Fixed** (enables R3-3) | panel.js:512-515 deletes at timeout; late replies ignored :231-237, :505-511 |
| R2-11 (bonus) mergeSocket text staleness | **Fixed** | `contentText` guard session.js:440, 463 |
| R2-12 spec §9.2 label drift | **Fixed** | §9.2 synced to «برنامه زنده» |
| R2-13 carried lows | **Partial** | `panelOlder` label added (config.js:312, panel.js:285); bindTab still `lastFocusedWindow`; store screenshots still unstaged |

## Round-3 findings

| # | Severity | Location | Defect | Why it matters | Fix |
|---|---|---|---|---|---|
| R3-1 | **High** | panel/panel.js:23, 162-168, 137-173, 185 | After a content-session restart (studio F5 — the exact R2-2 scenario), the port now reconnects, but `bound.token`/`bound.epoch` are never cleared on disconnect or rebind. The new session's `SNAPSHOT_BEGIN` is rejected at :185 (`bound.token && documentToken !== bound.token`), so `boundTab` stays false and the tokens stay stale forever. Rows still flow (the `!boundTab` bypass in `isForThisSession` :175-178 accepts chunks/patches/health), so the panel **looks** healthy — but every outbound token-bearing message dies: FEATURE_REQUEST carries the dead token → session refuses (session.js:723-725) → «نمایش در برنامه زنده» silently never works; RESET_SESSION/RESYNC are dropped at `validatePortMessage` (documentTokenMismatch) → the reset button is dead. Only reopening the side panel recovers. | The R2-2 fix repaired the wire but not the identity. Worse than the old hard brick: the panel looks alive while every teacher action fails silently, and the unbound port accepts any session's messages unchecked. | Clear `bound.token`/`bound.epoch`/`bound.revision` in `onDisconnect` (or in `bindTab` before the cold handshake), or accept a token change on `SNAPSHOT_BEGIN` while `boundTab === false`. |
| R3-2 | **Medium** | src/admission.js:513-530 + src/session.js:768 | `shownSet` replaces the whole set: any `broadcast.status` whose `shownCommentIds` lacks the record's id resets `record.shown` from `"pending"` to `"unknown"` — including an in-flight snapshot **generated before the click** (spec §361 notes the measured snapshot lags ~10 s) but arriving after it. The pending latch — R2-1's entire protection — is erased while the comment is going on air; the button re-arms, a second click re-passes the refusal matrix and toggles the comment **off air**. | Re-opens the never-toggle-off-air hole in WS primary/enrich builds (default `off` is unaffected); the spec itself flags un-show semantics as unverified (§625). | Stamp `clickedAt` on the latch; ignore `shownSet`s that predate it (or treat `pending` as sticky until a set containing the id arrives). |
| R3-3 | **Low** | panel/panel.js:512-526 + src/session.js:694-706 | The R2-10 fix deletes the `pendingFeature` entry at timeout **before** the `ACTION_STATUS` reply can arrive, so the reply (session.js:694-706) is always ignored. The "ask the session for the recorded outcome" recovery — the code comment's stated purpose — is structurally dead: a true `refused` outcome can never re-enable the button. | Fail-safe direction, but the mechanism is inert and the comment misleads future maintainers; refused rows stay needlessly locked until an unrelated row change re-renders them. | Keep a separate one-shot consumer for the `ACTION_STATUS` reply (re-enable on `refused`), or delete the query. |
| R3-4 | **Low** | src/llm-classifier.js:245 + src/session.js:449-456 | `classifyComment` returns `null` when `!config.LLM_ENABLED` — no network attempt. Under the R2-3 fix this benign null counts as a failure: toggling LLM off with queued jobs drains them into `llmFailures`, latching the 60 s pause, so re-enabling LLM within a minute silently delays all new reviews. | The pause was mandated for Worker outages, not teacher toggles; a false pause engages on zero real failures. | Return a discriminated result (`disabled` vs `failure`), or skip the failure count when `!config.LLM_ENABLED`. |
| R3-5 | **Low** | src/ws-main.js:193 + src/session.js:55, 825-829 | The R2-8 fix reports **per-endpoint cumulative** drops, but the session still compares against a single **global** `lastQueueDropped` high-water. After `room` reaches N drops, any `api` count ≤ N is invisible — an api-side queue loss never triggers `noteParse`/demotion (room re-signals only on further growth). Detection is now worse than the shared counter it replaced. | Misleading health in rehearsal builds; DOM admission stays authoritative, so impact is bounded. | Track a per-endpoint high-water map in the session, or have ws-main report deltas (reset after each health tick). |
| R3-6 | **Low** | src/session.js:434-441, 486-504, 318, 868 | The LLM job guard captures `settingsRevision` at job **start**, not schedule time — jobs queued before a settings rebuild pass every guard and apply their pre-rebuild decision to the replaced state (mutating orphaned blocks; visible duplication possible). Correlate/WS-ingest rebuilds (:318, :868) don't bump `settingsRevision` at all, so even in-flight jobs apply stale decisions after them. | Bounded visual weirdness in the fail-safe direction; WS rebuilds are non-default builds. | Add a `rebuildEpoch` counter bumped in `rebuildFromRecords`, captured in the guard like `settingsRevision`. |
| R3-7 | **Low** (carried/hardening) | panel/panel.js:138, 350; store-assets/ | bindTab still `lastFocusedWindow` (now the only incidental recovery for R3-1 — keep deliberately once R3-1 is fixed); v2 store screenshots still unstaged; panel's element-reuse `rowKey` omits `joinedFragments`/`members` — safe today only because of the one-fragment cap and count-coupled members, but a future cap change would silently stop re-rendering joined rows. | Hygiene + a fragile coupling waiting to bite. | Own label path done; pin bindTab to the panel's window post-R3-1; stage v2 screenshots; widen `rowKey` or document the coupling. |

**Verified clean (hunted, no defect):** R2-1 latch propagates through projection/panel (rowKey includes `feature`, so the disabled state survives rebuilds; element reuse can't re-arm it); the R2-4 foldKey logic including reset/multi-port/no-op paths (one harmless empty PATCH at foldKey `""→"[]"`); the R2-6 scroll branches including first-render and empty-list early returns; ws-main error/close decrement symmetry and timer self-heal; sw.js sender checks (`sender.tab` is undefined for SW forwards — no conflict with session.js:84); ping responder reachable only in the v2 build (build pairing exclusive); double-`requestId` path still synchronous; publish revision/`port.safwaRevision` lockstep; protocol handshake (`isUnboundHandshake` matches the panel's null-token SUBSCRIBE); proxy-rules matrix 13/13.

## Top-5 priorities

1. **R3-1 — Clear the panel's bound identity on disconnect/rebind.** The R2-2 recovery is half-built: after every studio reload the panel looks alive while the feature proxy and reset silently refuse everything.
2. **R3-2 — Make the `pending` latch sticky against pre-click `shownSet`s** (stamp `clickedAt`). It is the one path left that can re-arm a toggle-off-air click.
3. **R3-3 + R3-4 — Finish the two half-fixes:** let the `ACTION_STATUS` reply actually land (one-shot consumer), and stop counting a disabled LLM as a failure so the 60 s pause means outages only.
4. **R3-5 — Per-endpoint drop high-water in the session** so the attribution fix restores detection instead of masking the second endpoint.
5. **R3-6 — A `rebuildEpoch` in the LLM job guard** to close the stale-decision window across all rebuild paths, not just settings toggles.

**Verdict: 1 blocking finding remains (R3-1, High)** — a narrow, single-block fix in the exact area R2-2 targeted; R3-2 is Medium and WS-build-only. The core matching pipeline, protocol discipline, dirty-diff, and safety posture are otherwise clean; all ten round-2 findings are fixed or have their residue explicitly captured above.
