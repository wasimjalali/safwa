[0m
> build · glm-5.3
[0m
[0m$ [0mgit log --oneline -15 && git status
9965cad Polish round-4 nits: refused label restore, rebind on send failure, sticky-latch test
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
On branch feat/safwa-v2-sidebar
Your branch is up to date with 'origin/feat/safwa-v2-sidebar'.

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	specs/counsel/v2-review-glm-iter5.md

nothing added to commit but untracked files present (use "git add" to track)
[0m
[0m$ [0mgit diff main...HEAD --stat
captures/ws-2026-09-11/streamyard-ws-evidence.json | 125 +++
 manifest.json                                      |  40 +-
 manifest.v1.json                                   |  42 +
 package.json                                       |   7 +-
 panel/panel.css                                    | 416 ++++++++++
 panel/panel.html                                   |  52 ++
 panel/panel.js                                     | 591 ++++++++++++++
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
 specs/counsel/v2-review-glm-iter2.md               | 575 +++++++++++++
 specs/counsel/v2-review-glm-iter3.md               | 601 ++++++++++++++
 specs/counsel/v2-review-glm-iter4.md               | 344 ++++++++
 specs/safwa-v2-architecture.md                     | 656 +++++++++++++++
 specs/websocket-counsel-brief.md                   | 346 ++++++++
 src/admission.js                                   | 585 ++++++++++++++
 src/config.js                                      | 108 ++-
 src/content-legacy.js                              | 426 ++++++++++
 src/content.js                                     | 347 +-------
 src/dom.js                                         |  82 +-
 src/health.js                                      | 228 ++++++
 src/panel-model.js                                 | 195 +++++
 src/protocol.js                                    | 125 +++
 src/proxy-rules.js                                 |  61 ++
 src/session.js                                     | 891 ++++++++++++++++++++
 src/sw.js                                          |  82 ++
 src/ui.js                                          |  83 +-
 src/ws-bridge.js                                   | 283 +++++++
 src/ws-main.js                                     | 300 +++++++
 src/ws-parser.js                                   | 477 +++++++++++
 store-assets/screenshot-1-teacher.png              | Bin 77003 -> 0 bytes
 store-assets/screenshot-2-regex-dedup.png          | Bin 117890 -> 0 bytes
 store-assets/screenshot-3-semantic.png             | Bin 111330 -> 0 bytes
 styles.css                                         |  38 +-
 test/admission-test.js                             | 651 +++++++++++++++
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
 75 files changed, 16079 insertions(+), 378 deletions(-)
[0m
[0m$ [0mgit show 9965cad --stat && git show 9965cad
commit 9965cadc4563a58041dbb05fa2973192b6cc0fe5
Author: Wasim Jalali <wasimjalali2004@gmail.com>
Date:   Fri Sep 11 14:45:11 2026 +0200

    Polish round-4 nits: refused label restore, rebind on send failure, sticky-latch test

 panel/panel.js                       |   1 +
 specs/counsel/v2-review-glm-iter4.md | 344 +++++++++++++++++++++++++++++++++++
 src/session.js                       |   5 +-
 test/admission-test.js               |  17 ++
 4 files changed, 363 insertions(+), 4 deletions(-)
commit 9965cadc4563a58041dbb05fa2973192b6cc0fe5
Author: Wasim Jalali <wasimjalali2004@gmail.com>
Date:   Fri Sep 11 14:45:11 2026 +0200

    Polish round-4 nits: refused label restore, rebind on send failure, sticky-latch test

diff --git a/panel/panel.js b/panel/panel.js
index f997e1d..6baa422 100644
--- a/panel/panel.js
+++ b/panel/panel.js
@@ -507,6 +507,7 @@ function requestFeature(row, button) {
       if (result.outcome === "refused") {
         button.disabled = false;
         button.title = L.featureFindNative;
+        button.textContent = L[row.feature.labelKey] ?? L.featureShow;
       } else {
         // clicked or unknown: stay disabled until validated shown state returns.
         button.textContent = L.featureCheckBroadcast;
diff --git a/specs/counsel/v2-review-glm-iter4.md b/specs/counsel/v2-review-glm-iter4.md
new file mode 100644
index 0000000..d35f9c2
--- /dev/null
+++ b/specs/counsel/v2-review-glm-iter4.md
@@ -0,0 +1,344 @@
+[0m
+> build · glm-5.3
+[0m
+[0m$ [0mgit log --oneline -15 && git status && git branch -a
+4117a75 Fix round-3 review findings: panel identity rebind, sticky shown latch, LLM guard epochs
+54d0e2c Fix round-2 review findings: latch the validated click, reconnect, LLM pause, folded diffs
+a1f1853 Fix v2 review findings and apply owner UX decisions
+c6e4672 Ship Ṣafwa v2: sidebar panel on a DOM-authoritative pipeline
+376b687 Merge pull request #17 from wasimjalali/fix/popup-height-and-join-wording
+9536e76 Tighten the popup and keep the last help panel readable.
+e40d789 Merge pull request #16 from wasimjalali/feat/keep-greeting-plus-question
+8fdcc88 Keep questions that start with a greeting visible.
+d0159d7 Merge pull request #15 from wasimjalali/feat/llm-confirm-hide-and-count
+a99156c Hide Islamic greetings by default so the live panel stays question-focused.
+cb8c0f6 Bump the Chrome package to 1.0.2 for the Web Store upload.
+23cff64 Give the teacher four Dari settings, each with a short on/off explanation.
+b3e9856 Let the LLM confirm hide-and-count where regex is uncertain.
+0ee6d5b Merge pull request #14 from wasimjalali/fix/live-dom-selectors
+7bef261 fix: restore live comment discovery and recycled-row safety
+On branch feat/safwa-v2-sidebar
+Your branch is up to date with 'origin/feat/safwa-v2-sidebar'.
+
+Untracked files:
+  (use "git add <file>..." to include in what will be committed)
+	specs/counsel/v2-review-glm-iter4.md
+
+nothing added to commit but untracked files present (use "git add" to track)
+  chore/discovery-ground-truth
+  chore/dom-discovery-console
+  chore/store-assets
+  feat/live-chat-replay
+  feat/privacy-policy-route
+* feat/safwa-v2-sidebar
+  fix/live-dom-selectors
+  fix/manifest-description-length
+  fix/prelaunch-audit
+  main
+  remotes/origin/HEAD -> origin/main
+  remotes/origin/chore/discovery-ground-truth
+  remotes/origin/chore/dom-discovery-console
+  remotes/origin/chore/store-assets
+  remotes/origin/feat/keep-greeting-plus-question
+  remotes/origin/feat/live-chat-replay
+  remotes/origin/feat/llm-confirm-hide-and-count
+  remotes/origin/feat/privacy-policy-route
+  remotes/origin/feat/safwa-v2-sidebar
+  remotes/origin/fix/live-dom-selectors
+  remotes/origin/fix/manifest-description-length
+  remotes/origin/fix/popup-height-and-join-wording
+  remotes/origin/fix/prelaunch-audit
+  remotes/origin/main
+[0m
+[0m→ [0mRead specs/counsel/v2-review-glm-iter3.md
+[0m
+[0m# [0mTodos
+[•] Read fix commit 4117a75 diff in detail
+[ ] Run npm test, confirm green
+[ ] Verify R3-1..R3-7 fixes
+[ ] Hunt for NEW defects in full diff main...HEAD
+[ ] Write round-4 findings report
+[0m
+[0m$ [0mgit show 4117a75 --stat | cat
+commit 4117a75fb1dfd3ffa757bb44e701db23320586e5
+Author: Wasim Jalali <wasimjalali2004@gmail.com>
+Date:   Fri Sep 11 14:38:38 2026 +0200
+
+    Fix round-3 review findings: panel identity rebind, sticky shown latch, LLM guard epochs
+
+ panel/panel.js                       |  16 +-
+ specs/counsel/v2-review-glm-iter3.md | 601 +++++++++++++++++++++++++++++++++++
+ src/admission.js                     |  11 +-
+ src/session.js                       |  30 +-
+ 4 files changed, 646 insertions(+), 12 deletions(-)
+[0m
+[0m$ [0mnpm test > /tmp/safwa-test-r4.log 2>&1; echo "exit=$?"; grep -E "passed, [0-9]+ failed" /tmp/safwa-test-r4.log
+exit=0
+86 passed, 0 failed
+ws-parser tests: 35 passed, 0 failed
+17 passed, 0 failed
+24 passed, 0 failed
+protocol tests: 12 passed, 0 failed
+panel-model tests: 11 passed, 0 failed
+feature-proxy tests: 13 passed, 0 failed
+native-safety tests: 5 passed, 0 failed
+panel-render tests: 5 passed, 0 failed
+[0m
+[0m$ [0mgit show 4117a75 -- panel/panel.js src/admission.js src/session.js | cat
+commit 4117a75fb1dfd3ffa757bb44e701db23320586e5
+Author: Wasim Jalali <wasimjalali2004@gmail.com>
+Date:   Fri Sep 11 14:38:38 2026 +0200
+
+    Fix round-3 review findings: panel identity rebind, sticky shown latch, LLM guard epochs
+
+diff --git a/panel/panel.js b/panel/panel.js
+index 7028ecc..f997e1d 100644
+--- a/panel/panel.js
++++ b/panel/panel.js
+@@ -163,6 +163,9 @@ async function bindTab() {
+     port = null;
+     tabId = null;
+     boundTab = false;
++    bound.token = null;
++    bound.epoch = null;
++    bound.revision = 0;
+     setStatus(L.panelDisconnected);
+     scheduleRebind();
+   });
+@@ -347,7 +350,15 @@ function emptyNode(text) {
+ }
+ 
+ function rowKey(row) {
+-  return JSON.stringify([row.primary.displayText, row.badges, row.feature, row.shown, row.starred]);
++  return JSON.stringify([
++    row.primary.displayText,
++    row.badges,
++    row.feature,
++    row.shown,
++    row.starred,
++    row.joinedFragments ?? null,
++    row.members ?? null,
++  ]);
+ }
+ 
+ export function renderRow(row) {
+@@ -512,7 +523,6 @@ function requestFeature(row, button) {
+   setTimeout(() => {
+     const entry = pendingFeature.get(requestId);
+     if (!entry) return;
+-    pendingFeature.delete(requestId); // one-shot: a late reply is ignored
+     // Never re-enable on an unknown outcome: a second click could toggle the
+     // broadcast off. Ask the content session for the recorded outcome.
+     entry.resolve({ outcome: "unknown", reasonCode: "featureCheckBroadcast" });
+@@ -524,6 +534,8 @@ function requestFeature(row, button) {
+       port = null;
+       tabId = null;
+     }
++    // Keep the entry briefly so a refused ACTION_STATUS can still re-enable.
++    setTimeout(() => pendingFeature.delete(requestId), 5000);
+   }, CONFIG.FEATURE_PROXY.ackTimeoutMs);
+ }
+ 
+diff --git a/src/admission.js b/src/admission.js
+index d29aaf5..2431852 100644
+--- a/src/admission.js
++++ b/src/admission.js
+@@ -522,7 +522,16 @@ export function createAdmission(config, { now = () => Date.now() } = {}) {
+             if (broadcastId && record.broadcastId && record.broadcastId !== broadcastId) {
+               continue;
+             }
+-            const next = shown.has(record.commentId) ? "on" : "unknown";
++            let next;
++            if (shown.has(record.commentId)) {
++              next = "on";
++            } else if (record.shown === "pending") {
++              // Sticky latch: a snapshot generated before our validated click
++              // must not re-arm the button (measured snapshot lag ~10s).
++              next = "pending";
++            } else {
++              next = "unknown";
++            }
+             if (record.shown !== next) {
+               record.shown = next;
+               out.updated.push(record);
+diff --git a/src/session.js b/src/session.js
+index b898918..4522c50 100644
+--- a/src/session.js
++++ b/src/session.js
+@@ -52,7 +52,8 @@ export function startSession(deps) {
+   let health = healthMod.createHealth(config);
+   let wsState = config.WS_MODE === "off" ? "off" : "starting";
+   let bridgeHandshakeSeen = false;
+-  let lastQueueDropped = 0;
++  let rebuildEpoch = 0;
++  const lastQueueDroppedByKey = new Map();
+   let masterEnabled = true;
+   let lastHref = location.origin + location.pathname;
+ 
+@@ -411,6 +412,8 @@ export function startSession(deps) {
+       decision,
+       sourceId,
+       admittedAt: admission.getRecord(sourceId)?.admittedAt ?? Date.now(),
++      settingsRevision,
++      rebuildEpoch,
+     });
+     if (llmQueue.length > LLM_QUEUE_MAX) llmQueue.splice(0, llmQueue.length - LLM_QUEUE_MAX);
+     drainLlm();
+@@ -434,7 +437,8 @@ export function startSession(deps) {
+     const guard = {
+       documentToken,
+       sessionEpoch,
+-      settingsRevision,
++      settingsRevision: job.settingsRevision,
++      rebuildEpoch: job.rebuildEpoch,
+       sourceId,
+       contentRevision: admission.getRecord(sourceId)?.admissionSeq ?? 0,
+       contentText: comment.displayText,
+@@ -448,16 +452,19 @@ export function startSession(deps) {
+       );
+       llmFailures = llmFailures.filter((t) => Date.now() - t < LLM_FAIL_WINDOW_MS);
+       if (!result) {
+-        llmFailures.push(Date.now());
+-        if (llmFailures.length >= 3) {
+-          llmPausedUntil = Date.now() + LLM_PAUSE_MS;
+-          llmFailures = [];
++        if (config.LLM_ENABLED) {
++          llmFailures.push(Date.now());
++          if (llmFailures.length >= 3) {
++            llmPausedUntil = Date.now() + LLM_PAUSE_MS;
++            llmFailures = [];
++          }
+         }
+         return;
+       }
+       if (guard.documentToken !== documentToken) return;
+       if (guard.sessionEpoch !== sessionEpoch) return;
+       if (guard.settingsRevision !== settingsRevision) return;
++      if (guard.rebuildEpoch !== rebuildEpoch) return;
+       const record = admission.getRecord(sourceId);
+       if (!record || record.admissionSeq !== guard.contentRevision) return;
+       if (record.displayText !== guard.contentText) return;
+@@ -484,6 +491,7 @@ export function startSession(deps) {
+   /* ----------------------------------------------------- settings rebuild */
+ 
+   function rebuildFromRecords() {
++    rebuildEpoch += 1;
+     state = stateMod.createState();
+     decisions.clear();
+     const ordered = admission.records().slice().sort((a, b) => a.admissionSeq - b.admissionSeq);
+@@ -765,7 +773,10 @@ export function startSession(deps) {
+     if (!clicked) return finish(request.requestId, refuse("featureFindNative"));
+     // Latch the one validated click in the model: every later snapshot/rebuild
+     // must keep the button disabled so it can never toggle the comment off air.
+-    if (record) record.shown = "pending";
++    if (record) {
++      record.shown = "pending";
++      record.clickedAt = Date.now();
++    }
+     return finish(request.requestId, FEATURE_OK);
+   }
+ 
+@@ -822,8 +833,9 @@ export function startSession(deps) {
+       health.noteBridgeFrame(envelope.endpointKey);
+       try {
+         const stats = JSON.parse(envelope.data || "{}");
+-        if (typeof stats.queueDropped === "number" && stats.queueDropped > lastQueueDropped) {
+-          lastQueueDropped = stats.queueDropped;
++        const prior = lastQueueDroppedByKey.get(envelope.endpointKey) ?? 0;
++        if (typeof stats.queueDropped === "number" && stats.queueDropped > prior) {
++          lastQueueDroppedByKey.set(envelope.endpointKey, stats.queueDropped);
+           // A dropped frame is a loss signal: count it toward demotion (spec §8 row 18).
+           health.noteParse("malformed", envelope.endpointKey);
+         }
+[0m
+[0m→ [0mRead panel/panel.js
+Fix commit mapped and tests green. Now reading the current state of the three fixed files plus the consumers to verify each fix actually works end-to-end.
+[0m→ [0mRead src/session.js
+`npm test` green (exit 0, all 10 suites). Panel read — R3-1 (bound cleared on disconnect), R3-3 (5s retention), R3-7 (rowKey widened) all visible. Now reading session.js and admission.js in full to verify the R3-2/R3-4/R3-5/R3-6 fixes end-to-end.
+[0m✱ [0mGrep "clickedAt"[90m in . · 4 matches[0m
+[0m→ [0mRead src/admission.js[90m [offset=440, limit=130][0m
+[0m✱ [0mGrep "shown"[90m in src/panel-model.js · 30 matches[0m
+Session verified for R3-4/R3-5/R3-6 mechanics. Now the admission sticky latch (R3-2), `clickedAt` usage, panel-model projection of `shown`, and sw.js forwarding for the R3-3 path.
+[0m→ [0mRead src/sw.js
+[0m
+[0m$ [0mgit diff main...HEAD --stat | tail -30
+src/protocol.js                                    | 125 +++
+ src/proxy-rules.js                                 |  61 ++
+ src/session.js                                     | 894 +++++++++++++++++++++
+ src/sw.js                                          |  82 ++
+ src/ui.js                                          |  83 +-
+ src/ws-bridge.js                                   | 283 +++++++
+ src/ws-main.js                                     | 300 +++++++
+ src/ws-parser.js                                   | 477 +++++++++++
+ store-assets/screenshot-1-teacher.png              | Bin 77003 -> 0 bytes
+ store-assets/screenshot-2-regex-dedup.png          | Bin 117890 -> 0 bytes
+ store-assets/screenshot-3-semantic.png             | Bin 111330 -> 0 bytes
+ styles.css                                         |  38 +-
+ test/admission-test.js                             | 634 +++++++++++++++
+ test/content-count-recycle-test.js                 | 239 ++++++
+ test/content-llm-stale-test.js                     |   2 +-
+ test/content-retry-test.js                         |   2 +-
+ test/content-virtual-anchor-test.js                |   2 +-
+ test/content-virtualization-test.js                |   2 +-
+ test/discovery-selftest.html                       |  37 +
+ test/feature-proxy-test.js                         | 129 +++
+ test/fixtures/ws-2026-09-11-events.json            |  50 ++
+ test/health-test.js                                | 280 +++++++
+ test/native-safety-test.js                         |  88 ++
+ test/panel-model-test.js                           | 173 ++++
+ test/panel-render-test.js                          | 163 ++++
+ test/protocol-test.js                              | 138 ++++
+ test/ui-safety-test.js                             |  15 +
+ test/ws-parser-test.js                             | 569 +++++++++++++
+ tools/build-manifest.js                            | 217 +++++
+ 74 files changed, 15720 insertions(+), 378 deletions(-)
+[0m
+[0m✱ [0mGrep "shownSet|pending|rebuildEpoch|lastQueueDropped|bound\.token"[90m in test · 20 matches[0m
+`clickedAt` is write-only (only set, never read — the sticky latch doesn't use it). Panel-model downgrades `pending` to `unknown` in the row projection but the feature checks read the record directly, so behavior is right. Now checking sw.js forwarding, protocol validation, and existing test coverage for the fixed paths.
+[0m→ [0mRead src/protocol.js
+[0m→ [0mRead test/admission-test.js[90m [limit=60, offset=425][0m
+sw.js forward path and store-assets deletion (v1 screenshots removed on this branch) noted. Now protocol.js validation, the admission shownSet test semantics, and config constants to close the loop.
+Protocol and admission tests confirmed. One last check — the FEATURE_PROXY/PANEL timing constants that govern the R3-3 refused-after-timeout path, then the report.
+[0m✱ [0mGrep "ackTimeoutMs|requestExpiryMs|healthIntervalMs|maxMountedRows|snapshotChunkRows|FEATURE_PROXY|LLM_ENDPOINT|LLM_ENABLED"[90m in src/config.js · 21 matches[0m
+[0m
+[0m# [0mTodos
+[✓] Read fix commit 4117a75 diff in detail
+[✓] Run npm test, confirm green
+[✓] Verify R3-1..R3-7 fixes
+[✓] Hunt for NEW defects in full diff main...HEAD
+[✓] Write round-4 findings report
+[0m
+# Ṣafwa v2 Review — Round 4 (final verification, HEAD 4117a75 vs main)
+
+`npm test` green, exit 0: 86 core + 35 ws-parser + 17 health + 24 admission + 12 protocol + 11 panel-model + 13 feature-proxy + 5 native-safety + 5 panel-render + all content.js/ui regressions. Delta since round 3 is exactly commit 4117a75 (panel.js, admission.js, session.js); every other file re-spot-checked against the round-3 record — unchanged.
+
+## Round-3 fix verification
+
+| R3 | Status | Evidence |
+|---|---|---|
+| R3-1 panel identity rebind (High) | **Fixed, clean** | panel.js:162-171 clears `bound.token/epoch/revision` on disconnect; `SNAPSHOT_BEGIN` (panel.js:188) then accepts the new session, cold SUBSCRIBE → `isUnboundHandshake` → snapshot → rebind. FEATURE_REQUEST / RESET / RESYNC all carry fresh tokens afterwards — full chain re-traced through protocol.js:72-88 and session.js:669-718 |
+| R3-2 sticky shown latch (Medium) | **Fixed** | admission.js:525-534 keeps `"pending"` through any `shownSet` lacking the id (promotes only when the id appears); latch + stamp at session.js:776-779. Both panel-model.js:98 and session.js:544-545 refuse on `pending`; projection downgrade at panel-model.js:61 is benign — feature availability reads the record, and the latch propagates via `row.feature` |
+| R3-3 ACTION_STATUS reply lands (Low) | **Fixed** (one new low, below) | panel.js:538 keeps the entry 5s; handler panel.js:234-241 resolves + deletes; session replies from receipts (session.js:702-714). Resolves are plain callbacks, not promise settles — a second call genuinely lands |
+| R3-4 disabled LLM ≠ failure (Low) | **Fixed, clean** | session.js:454-461 counts `null` only under `config.LLM_ENABLED`; misconfigured endpoint (enabled + empty) still counts — correct |
+| R3-5 per-endpoint drop high-water (Low) | **Fixed** | session.js:56, 836-841 per-key map matches ws-main's per-key cumulative report; monotonic, no cross-endpoint masking |
+| R3-6 rebuild epochs (Low) | **Fixed, clean** | `rebuildEpoch` bumped in `rebuildFromRecords` (session.js:494) — all three rebuild paths call it (settings :147, correlate :319, WS ingest :880); guard captures `settingsRevision`/`rebuildEpoch` at schedule time (:415-416, :440-441) and drain checks both (:466-467), also closing the old tautology |
+| R3-7 hardening (Low, carried) | **Partial** | `rowKey` widened with `joinedFragments`/`members` (panel.js:352-362). Still carried: `lastFocusedWindow` bind (panel.js:138); store-assets — the branch **deletes** the v1 screenshots with no v2 replacements staged |
+
+## New-defect hunt
+
+| # | Severity | Location | Defect | Why it matters | Fix |
+|---|---|---|---|---|---|
+| R4-1 | **Low** | panel/panel.js:506-514 | The R3-3 fix re-enables the button on a late `refused` but never restores its label. The refused reply always arrives *after* the ack timeout already set `textContent = featureCheckBroadcast`, so the re-armed button stays labeled «نمایش را در برنامه زنده بررسی کنید» instead of `L[row.feature.labelKey]`. Reachable whenever the session refuses slower than `ackTimeoutMs` (1 s, e.g. twin scan on a busy page) — the main path the fix was built for. | A clickable button telling the teacher to go check the broadcast; confusing but the action itself works and the safety posture is intact. | In the `refused` branch, also set `button.textContent = L[row.feature.labelKey] ?? L.featureShow` |
+| R4-2 | Nit | src/session.js:778 | `record.clickedAt` is stamped but never read anywhere — the sticky latch works without it. | Dead field; misleads future maintainers into thinking a timestamp gate exists. | Drop it, or implement the timestamp alternative it was stamped for. |
+| R4-3 | Nit | panel/panel.js:533-536 | The ACTION_STATUS send's `catch` nulls `port`/`tabId` but, unlike the watchdog catch (:94-98), does not call `scheduleRebind()` — recovery depends on the dead port's `onDisconnect` firing. | If `postMessage` throws without a subsequent `onDisconnect`, the panel stays unbound until a tab/window focus event. | Add `scheduleRebind()` in that catch (and optionally capture the port object in the `onDisconnect` closure so an orphaned old port can't clobber a freshly bound one). |
+| R4-4 | Nit | test/ | No tests cover any R3 fix path: sticky `pending` in `applyStateEvents` (admission-test only exercises on/unknown), `rebuildEpoch` discard, per-endpoint drop map, panel identity clear, refused re-enable. | The fixes are verified by reading, not by the suite; a regression would ship silently. `npm test` remains the "done" gate per CLAUDE.md. | Add one test per fixed branch (all four seams are pure or DOM-free and cheap to cover). |
+| R4-5 | Nit (carried R3-7) | panel/panel.js:138; store-assets/ | `bindTab` still `lastFocusedWindow`: every OS-level focus loss (`WINDOW_ID_NONE`) blanks the panel and drops the port until refocus; and the branch deletes the v1 store screenshots with no v2 replacements staged — merging to main leaves the store listing imageless. | Momentary self-healing disruption mid-stream; store-listing regression at merge time. | Pin the bind to the panel's own `windowId` (already captured at :159); stage v2 screenshots before merge. |
+| R4-6 | Nit (design note) | src/admission.js:528-531 | Sticky-`pending` is forever: a click StreamYard silently dropped leaves the row un-feature-able from the panel until session reset. | Fail-safe direction (never toggles off air; the disabled button's tooltip already points to the native column), but the teacher has no panel retry. | Acceptable as-is given the cost asymmetry; a bounded latch (e.g. 60 s) is the alternative if it ever bothers the owner. |
+
+**Verified clean while hunting:** the latch propagates through projection/rebuild/element-reuse (`row.feature` is in `rowKey`; window churn can re-render a stale enabled button but the session-side refusal matrix backstops it); `on` → set-without-id demotion is spec'd fresh-set semantics, not a re-opened toggle-off hole; panel rebind races (own `disconnect()` doesn't fire own `onDisconnect`; rebind-attempt reset at :175); watchdog/RESYNC/revision-gap recovery loops; sw.js forward `windowId`/`active`/URL checks; receipts idempotency and the 200-receipt cap; R2-9 rebuild re-enqueue vs the 8 s admission TTL (pre-existing, fail-safe, unchanged).
+
+## Verdict
+
+**NO BLOCKING FINDINGS**
+
+All seven round-3 findings are fixed (R3-1 and R3-2 cleanly and completely); the one new defect is low and cosmetic (R4-1), the rest are nits — most useful next: the R4-1 one-line label restore and the R4-4 test coverage for the fixed seams. The branch is sound to merge from a correctness standpoint; stage the v2 store screenshots (R4-5) before merging to main.
diff --git a/src/session.js b/src/session.js
index 4522c50..df46537 100644
--- a/src/session.js
+++ b/src/session.js
@@ -773,10 +773,7 @@ export function startSession(deps) {
     if (!clicked) return finish(request.requestId, refuse("featureFindNative"));
     // Latch the one validated click in the model: every later snapshot/rebuild
     // must keep the button disabled so it can never toggle the comment off air.
-    if (record) {
-      record.shown = "pending";
-      record.clickedAt = Date.now();
-    }
+    if (record) record.shown = "pending";
     return finish(request.requestId, FEATURE_OK);
   }
 
diff --git a/test/admission-test.js b/test/admission-test.js
index 4568fb0..62bc594 100644
--- a/test/admission-test.js
+++ b/test/admission-test.js
@@ -629,6 +629,23 @@ test("reset clears records, indexes, pending candidates and the sequence", () =>
   assert.equal(api.correlate().updated.length, 0, "pending candidates were cleared too");
 });
 
+
+test("sticky pending: a pre-click shownSet cannot re-arm a latched record", () => {
+  const { api } = admissionWith("enrich");
+  const [first] = roomComments("comment.created.first");
+  const admitted = api.admitDom(domFrom(first, { timestamp: 10 }));
+  const rec = api.getRecord(admitted.sourceId);
+  rec.commentId = "c1";
+  rec.broadcastId = "b1";
+  rec.shown = "pending";
+
+  api.applyStateEvents([{ kind: "shownSet", broadcastId: "b1", shownCommentIds: [] }]);
+  assert.equal(rec.shown, "pending", "a set without the id keeps the latch");
+
+  api.applyStateEvents([{ kind: "shownSet", broadcastId: "b1", shownCommentIds: ["c1"] }]);
+  assert.equal(rec.shown, "on", "the id promotes pending to on");
+});
+
 // =====================================================================
 console.log(`\n${passed} passed, ${failed} failed`);
 process.exitCode = failed > 0 ? 1 : 0;
[0m
[0m$ [0mnpm test 2>&1 | tail -40
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
[0m→ [0mRead panel/panel.js
[0m
[0m$ [0mnpm test 2>&1 | grep -E "(passed|failed|PASS.*suites|exit)" | grep -cE "PASS" ; npm test > /tmp/safwa-test-r5.log 2>&1; echo "exit=$?"; grep -E "tests?: [0-9]+ passed" /tmp/safwa-test-r5.log
1
exit=0
ws-parser tests: 35 passed, 0 failed
protocol tests: 12 passed, 0 failed
panel-model tests: 11 passed, 0 failed
feature-proxy tests: 13 passed, 0 failed
native-safety tests: 5 passed, 0 failed
panel-render tests: 5 passed, 0 failed
[0m
[0m→ [0mRead src/session.js
[0m→ [0mRead src/admission.js
R4 fixes mapped in commit 9965cad. Now reading the core runtime files to hunt for new defects.
[0m→ [0mRead src/sw.js
[0m→ [0mRead src/protocol.js
[0m→ [0mRead src/proxy-rules.js
[0m→ [0mRead src/panel-model.js
[0m
[0m$ [0mgrep -E "tests: [0-9]+ passed|regression: (PASS|FAIL)|passed, [0-9]+ failed" /tmp/safwa-test-r5.log
86 passed, 0 failed
ws-parser tests: 35 passed, 0 failed
17 passed, 0 failed
25 passed, 0 failed
protocol tests: 12 passed, 0 failed
panel-model tests: 11 passed, 0 failed
feature-proxy tests: 13 passed, 0 failed
native-safety tests: 5 passed, 0 failed
panel-render tests: 5 passed, 0 failed
content.js late-panel retry regression: PASS
content.js virtualized-row regression: PASS
content.js recycled duplicate-anchor regression: PASS
content.js stale-LLM virtualized-row regression: PASS
content.js recycled-row count inflation regression: PASS
ui.js human-in-the-loop safety regression: PASS
[0m
[0m→ [0mRead src/content.js
[0m→ [0mRead src/config.js
[0m
[0m$ [0mgit show 9965cad | grep -n "scheduleRebind" ; echo "---"; grep -n "scheduleRebind" panel/panel.js; echo "---"; grep -rn "clickedAt" src/ panel/ test/ 2>/dev/null; echo "no-clickedAt-refs=$?"
130:+     scheduleRebind();
357:+| R4-3 | Nit | panel/panel.js:533-536 | The ACTION_STATUS send's `catch` nulls `port`/`tabId` but, unlike the watchdog catch (:94-98), does not call `scheduleRebind()` — recovery depends on the dead port's `onDisconnect` firing. | If `postMessage` throws without a subsequent `onDisconnect`, the panel stays unbound until a tab/window focus event. | Add `scheduleRebind()` in that catch (and optionally capture the port object in the `onDisconnect` closure so an orphaned old port can't clobber a freshly bound one). |
---
97:      scheduleRebind();
129:function scheduleRebind() {
133:    bindTab().catch(() => scheduleRebind());
170:    scheduleRebind();
---
no-clickedAt-refs=1
[0m
[0m→ [0mRead src/ws-bridge.js
[0m→ [0mRead src/health.js
All suites green (admission now 25 with the new latch test). Verifying the R4-3 rebind claim in the fix commit, then scanning the remaining runtime files.
[0m→ [0mRead src/ws-main.js
[0m→ [0mRead src/dom.js
[0m→ [0mRead manifest.json
R4-1/R4-2/R4-4 confirmed in code; R4-3's `scheduleRebind()` appears only in the spec doc, not in panel.js. Continuing the hunt on the remaining runtime files.
[0m→ [0mRead panel/panel.html
[0m→ [0mRead popup/popup.html
[0m→ [0mRead tools/build-manifest.js
[0m
[0m$ [0mgit diff main...HEAD -- src/ui.js popup/popup.js | head -250
diff --git a/popup/popup.js b/popup/popup.js
index ac439cc..d37b6ab 100644
--- a/popup/popup.js
+++ b/popup/popup.js
@@ -8,9 +8,13 @@ import { CONFIG, STORAGE_KEYS, readStoredSettings } from "../src/config.js";
 const L = CONFIG.LABELS;
 const HELP_ICON = `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.25" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 7.6c0-1.15.95-2.05 2.1-2.05S12.2 6.45 12.2 7.6c0 .85-.5 1.4-1.25 1.8-.7.35-1.05.7-1.05 1.45" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="10" cy="14.15" r="0.85" fill="currentColor"/></svg>`;
 
+const STREAMYARD_ORIGINS = ["https://streamyard.com/*", "https://*.streamyard.com/*"];
+
 const toggle = document.getElementById("toggle");
 const masterWord = document.getElementById("master-word");
 const hint = document.getElementById("hint");
+const linkStatus = document.getElementById("link-status");
+const fixLink = document.getElementById("fix-link");
 const list = document.getElementById("settings-list");
 const resetBtn = document.getElementById("reset");
 const resetHelp = document.querySelector('[data-help="reset"]');
@@ -227,13 +231,107 @@ if (hasStorage) {
   paintMaster(enabled);
 }
 
-toggle.addEventListener("click", () => {
+toggle.addEventListener("click", async () => {
   userToggled = true;
   enabled = !enabled;
   paintMaster(enabled);
   if (hasStorage) chrome.storage.local.set({ [STORAGE_KEYS.enabled]: enabled });
+  if (enabled) await ensureSiteAccess();
+  await checkLiveLink();
 });
 
+const STUDIO_HOST = /(^|\.)streamyard\.com$/;
+
+async function ensureSiteAccess() {
+  if (!chrome.permissions?.contains) return true;
+  try {
+    const have = await chrome.permissions.contains({ origins: STREAMYARD_ORIGINS });
+    if (have) return true;
+    return await chrome.permissions.request({ origins: STREAMYARD_ORIGINS });
+  } catch {
+    return false;
+  }
+}
+
+function showLinkFix(message, actionLabel, onClick) {
+  if (!linkStatus || !fixLink) return;
+  linkStatus.hidden = false;
+  linkStatus.textContent = message;
+  if (!actionLabel || !onClick) {
+    fixLink.hidden = true;
+    return;
+  }
+  fixLink.hidden = false;
+  fixLink.textContent = actionLabel;
+  fixLink.onclick = onClick;
+}
+
+function hideLinkFix() {
+  if (linkStatus) linkStatus.hidden = true;
+  if (fixLink) {
+    fixLink.hidden = true;
+    fixLink.onclick = null;
+  }
+}
+
+async function checkLiveLink() {
+  if (!chrome.tabs?.query) {
+    hideLinkFix();
+    return;
+  }
+  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
+  if (!tab?.id) {
+    hideLinkFix();
+    return;
+  }
+  let host = "";
+  try {
+    host = tab.url ? new URL(tab.url).hostname : "";
+  } catch {
+    host = "";
+  }
+  const onStudio = STUDIO_HOST.test(host);
+  if (host && !onStudio) {
+    hideLinkFix();
+    return;
+  }
+
+  let granted = true;
+  if (chrome.permissions?.contains) {
+    try {
+      granted = await chrome.permissions.contains({ origins: STREAMYARD_ORIGINS });
+    } catch {
+      granted = true;
+    }
+  }
+  if (!granted && (onStudio || !host)) {
+    showLinkFix(L.popupNeedAccess, L.popupAllowAccess, async () => {
+      const ok = await ensureSiteAccess();
+      if (ok) await checkLiveLink();
+    });
+    return;
+  }
+  if (!onStudio) {
+    hideLinkFix();
+    return;
+  }
+  try {
+    await chrome.tabs.sendMessage(tab.id, { type: "safwa-ping" });
+    hideLinkFix();
+  } catch {
+    showLinkFix(L.popupNeedRefresh, L.popupReloadStudio, async () => {
+      try {
+        await chrome.tabs.reload(tab.id);
+      } catch {
+        // The teacher can still refresh the tab by hand.
+      }
+      window.close();
+    });
+  }
+}
+
+if (hasStorage) checkLiveLink();
+
 resetBtn.addEventListener("click", () => {
   if (hasStorage) chrome.storage.local.set({ [STORAGE_KEYS.resetAt]: Date.now() });
   resetStatus.hidden = false;
diff --git a/src/ui.js b/src/ui.js
index ede6f40..a7faa38 100644
--- a/src/ui.js
+++ b/src/ui.js
@@ -21,6 +21,13 @@
 
 const ANNOTATED_ATTR = "data-safwa-annotated";
 const COUNT_CLASS = "safwa-count";
+const STATE_CLASSES = [
+  "safwa-primary",
+  "safwa-joined",
+  "safwa-dim",
+  "safwa-collapsed",
+  "safwa-collapse-hide",
+];
 const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
 const collapsedCopies = new Map();
 
@@ -66,8 +73,20 @@ function setCountBadge(originalNode, count, config) {
   );
 }
 
-function originalNodeOf(decision) {
-  return decision.target?.firstComment?.el ?? null;
+/** Badges live on the comment card (cardEl), never on the scroller slot. */
+function anchorOf(comment) {
+  const node = comment?.el ?? null;
+  const card = comment?.cardEl ?? null;
+  return card && card !== node ? card : node;
+}
+
+/** Remove every annotation this extension may have put on a row. */
+function clearAnnotations(node) {
+  if (!node) return;
+  node.classList?.remove?.(...STATE_CLASSES);
+  if (typeof node.querySelectorAll !== "function") return;
+  for (const badge of node.querySelectorAll(".safwa-badge")) badge.remove?.();
+  for (const card of node.querySelectorAll(".safwa-card")) card.classList?.remove?.("safwa-joined");
 }
 
 function isCollapsedAnchor(node) {
@@ -83,69 +102,80 @@ export function render(decision, config) {
   const node = decision.comment?.el ?? null;
   if (!node) return;
   const dir = config.UI_DIRECTION;
+  const card = anchorOf(decision.comment);
   revealOrphanedDuplicates(node);
   collapsedCopies.delete(node);
 
   // Idempotency: a row can be re-annotated after a container re-render, and its
   // new decision may differ (state was rebuilt). Clear previous annotations so a
   // stale class (especially safwa-collapsed) can never hide a now-kept question.
-  node.classList.remove("safwa-primary", "safwa-joined", "safwa-dim", "safwa-collapsed");
-  for (const b of node.querySelectorAll(".safwa-badge")) b.remove();
+  clearAnnotations(node);
+  card?.classList?.add?.("safwa-card");
+
+  const stateClasses = [];
+  const collapse = () => {
+    stateClasses.push("safwa-collapsed");
+    if (config.COLLAPSE_MODE === "hide") stateClasses.push("safwa-collapse-hide");
+  };
 
   switch (decision.type) {
     case "greeting":
-      // Regex-certain greetings hide when the teacher toggle is on. A courtesy
+      // Regex-certain greetings fold when the teacher toggle is on. A courtesy
       // maybe stays visible until the LLM confirms (never hide a maybe).
-      if (decision.hide && config.HIDE_GREETINGS !== false) {
-        node.classList.add("safwa-collapsed");
-      }
+      if (decision.hide && config.HIDE_GREETINGS !== false) collapse();
       break;
 
     case "primary":
-      node.classList.add("safwa-primary");
+      stateClasses.push("safwa-primary");
+      if (decision.count > 1) setCountBadge(card, decision.count, config);
       break;
 
     case "continuation":
-      node.classList.add("safwa-joined");
-      ensureBadge(node, "joined", config.LABELS.joined, dir);
+      stateClasses.push("safwa-joined");
+      if (card !== node) card.classList?.add?.("safwa-joined");
+      ensureBadge(card, "joined", config.LABELS.joined, dir);
       break;
 
     case "duplicate": {
-      const original = originalNodeOf(decision);
+      const originalComment = decision.target?.firstComment ?? null;
+      const original = originalComment?.el ?? null;
 
-      // Cost-asymmetry guard: if the original row is gone, hidden, or this row
-      // IS the representative, it is the only visible copy. Never hide it.
+      // Cost-asymmetry guard: if the original row is gone, folded, or this row
+      // IS the representative, it is the only visible copy. Never fold it.
       if (!original || original === node || !original.isConnected || isCollapsedAnchor(original)) {
-        if (decision.target?.firstComment) decision.target.firstComment.el = node;
-        setCountBadge(node, decision.count, config);
+        if (originalComment) {
+          originalComment.el = node;
+          originalComment.cardEl = card;
+        }
+        setCountBadge(card, decision.count, config);
         break;
       }
 
-      setCountBadge(original, decision.count, config);
+      setCountBadge(anchorOf(originalComment), decision.count, config);
       const hideDup =
         (decision.kind === "exact" || decision.kind === "semantic") &&
         config.AUTO_COLLAPSE_EXACT_DUPLICATES &&
         !config.AUTO_HIDE_ANYTHING_AMBIGUOUS;
       if (hideDup) {
-        node.classList.add("safwa-collapsed");
+        collapse();
         collapsedCopies.set(node, original);
       } else {
-        node.classList.add("safwa-dim");
-        ensureBadge(node, "dup", config.LABELS.possibleDuplicate, dir);
+        stateClasses.push("safwa-dim");
+        ensureBadge(card, "dup", config.LABELS.possibleDuplicate, dir);
[0m
[0m→ [0mRead test/admission-test.js[90m [offset=1, limit=80][0m
Spot-checking the remaining changed files (ui.js, popup.js, ws-parser.js) and verifying the new test's helpers.
[0m
[0m$ [0mgrep -n "function admissionWith\|function domFrom" test/admission-test.js; node test/admission-test.js 2>&1 | grep -i "sticky"
83:function domFrom(source, overrides = {}) {
106:function admissionWith(mode = "primary", limitOverrides = {}) {
  PASS  sticky pending: a pre-click shownSet cannot re-arm a latched record
[0m
[0m$ [0mgit diff main...HEAD -- src/ws-parser.js | grep -cE "^\+" ; node test/ws-parser-test.js 2>&1 | tail -2; node test/panel-model-test.js 2>&1 | tail -2; node test/protocol-test.js 2>&1 | tail -2
478

ws-parser tests: 35 passed, 0 failed
  PASS  describeHealth maps states to label keys
panel-model tests: 11 passed, 0 failed
  PASS  feature result outcome validated
protocol tests: 12 passed, 0 failed
[0m
[0m$ [0mgit diff main...HEAD -- src/ui.js | tail -90; git diff main...HEAD -- package.json
switch (decision.type) {
     case "greeting":
-      // Regex-certain greetings hide when the teacher toggle is on. A courtesy
+      // Regex-certain greetings fold when the teacher toggle is on. A courtesy
       // maybe stays visible until the LLM confirms (never hide a maybe).
-      if (decision.hide && config.HIDE_GREETINGS !== false) {
-        node.classList.add("safwa-collapsed");
-      }
+      if (decision.hide && config.HIDE_GREETINGS !== false) collapse();
       break;
 
     case "primary":
-      node.classList.add("safwa-primary");
+      stateClasses.push("safwa-primary");
+      if (decision.count > 1) setCountBadge(card, decision.count, config);
       break;
 
     case "continuation":
-      node.classList.add("safwa-joined");
-      ensureBadge(node, "joined", config.LABELS.joined, dir);
+      stateClasses.push("safwa-joined");
+      if (card !== node) card.classList?.add?.("safwa-joined");
+      ensureBadge(card, "joined", config.LABELS.joined, dir);
       break;
 
     case "duplicate": {
-      const original = originalNodeOf(decision);
+      const originalComment = decision.target?.firstComment ?? null;
+      const original = originalComment?.el ?? null;
 
-      // Cost-asymmetry guard: if the original row is gone, hidden, or this row
-      // IS the representative, it is the only visible copy. Never hide it.
+      // Cost-asymmetry guard: if the original row is gone, folded, or this row
+      // IS the representative, it is the only visible copy. Never fold it.
       if (!original || original === node || !original.isConnected || isCollapsedAnchor(original)) {
-        if (decision.target?.firstComment) decision.target.firstComment.el = node;
-        setCountBadge(node, decision.count, config);
+        if (originalComment) {
+          originalComment.el = node;
+          originalComment.cardEl = card;
+        }
+        setCountBadge(card, decision.count, config);
         break;
       }
 
-      setCountBadge(original, decision.count, config);
+      setCountBadge(anchorOf(originalComment), decision.count, config);
       const hideDup =
         (decision.kind === "exact" || decision.kind === "semantic") &&
         config.AUTO_COLLAPSE_EXACT_DUPLICATES &&
         !config.AUTO_HIDE_ANYTHING_AMBIGUOUS;
       if (hideDup) {
-        node.classList.add("safwa-collapsed");
+        collapse();
         collapsedCopies.set(node, original);
       } else {
-        node.classList.add("safwa-dim");
-        ensureBadge(node, "dup", config.LABELS.possibleDuplicate, dir);
+        stateClasses.push("safwa-dim");
+        ensureBadge(card, "dup", config.LABELS.possibleDuplicate, dir);
       }
       break;
     }
 
     case "extra": {
       // Regex extras stay visible (dim + badge) until the LLM confirms they
-      // are a genuine second question. Confirmed extras are hidden with no badge.
-      // Timeout leaves the dimmed row in place so a missed continuation is not
-      // deleted.
+      // are a genuine second question. Confirmed extras fold to a ghost and
+      // keep no badge. Timeout leaves the dimmed row in place so a missed
+      // continuation is not lost.
       if (decision.hide && config.HIDE_CONFIRMED_EXTRAS !== false) {
-        node.classList.add("safwa-collapsed");
+        collapse();
       } else {
-        node.classList.add("safwa-dim");
-        ensureBadge(node, "extra", config.LABELS.secondQuestion, dir);
+        stateClasses.push("safwa-dim");
+        ensureBadge(card, "extra", config.LABELS.secondQuestion, dir);
       }
       break;
     }
@@ -154,5 +184,6 @@ export function render(decision, config) {
       break;
   }
 
+  if (stateClasses.length) node.classList.add(...stateClasses);
   node.setAttribute(ANNOTATED_ATTR, decision.type);
 }
diff --git a/package.json b/package.json
index b7376b2..0ecef10 100644
--- a/package.json
+++ b/package.json
@@ -1,11 +1,12 @@
 {
   "name": "safwa",
-  "version": "1.0.5",
+  "version": "2.0.0",
   "private": true,
-  "description": "Ṣafwa (صفوة) - Chrome MV3 live Q&A filter for Dari/Persian StreamYard comments. Regex plus Gemma 4: collapse duplicates, join split questions, one question per person.",
+  "description": "\u1e62afwa (\u0635\u0641\u0648\u0629) - Chrome MV3 live Q&A filter for Dari/Persian StreamYard comments. Regex plus Gemma 4: collapse duplicates, join split questions, one question per person.",
   "type": "module",
   "scripts": {
-    "test": "node test/run-tests.js && node test/content-retry-test.js && node test/content-virtualization-test.js && node test/content-virtual-anchor-test.js && node test/content-llm-stale-test.js && node test/ui-safety-test.js",
+    "test": "node test/run-tests.js && node test/ws-parser-test.js && node test/health-test.js && node test/admission-test.js && node test/protocol-test.js && node test/panel-model-test.js && node test/feature-proxy-test.js && node test/native-safety-test.js && node test/panel-render-test.js && node test/content-retry-test.js && node test/content-virtualization-test.js && node test/content-virtual-anchor-test.js && node test/content-llm-stale-test.js && node test/content-count-recycle-test.js && node test/ui-safety-test.js",
+    "build:manifest": "node tools/build-manifest.js",
     "replay": "node test/replay-analysis.js",
     "demo": "python3 -m http.server 8000"
   },
[0m
[0m$ [0mgit diff 4117a75..HEAD --stat -- . ':(exclude)specs' ':(exclude)captures'
panel/panel.js         |  1 +
 src/session.js         |  5 +----
 test/admission-test.js | 17 +++++++++++++++++
 3 files changed, 19 insertions(+), 4 deletions(-)
[0m
R4 items are now fully verified. Final checks: the rest of the ui.js diff, package.json, and confirming nothing else changed since the round-4 review.
# Ṣafwa v2 — Round 5 Final Verification (HEAD 9965cad vs main)

**Verdict: all four round-4 items verified in code, `npm test` fully green, and no new critical/high/medium defects found in the re-review of the branch — mergeable from a correctness standpoint.**

**NO BLOCKING FINDINGS**

`npm test` exit 0: 86 core + 35 ws-parser + 17 health + **25 admission** (was 24; the new latch test) + 12 protocol + 11 panel-model + 13 feature-proxy + 5 native-safety + 5 panel-render + 6 content/ui regressions. Code delta since the round-4 review (4117a75) is exactly commit 9965cad: panel.js +1, session.js −3/+1, admission-test.js +17 — every other runtime file is byte-identical to what rounds 1–4 reviewed.

## Round-4 fix verification

| R4 | Status | Evidence |
|---|---|---|
| R4-1 refused label restores | **Fixed, clean** | panel.js:507-510 — refused branch now sets `button.textContent = L[row.feature.labelKey] ?? L.featureShow`, matching renderRow's initial label (panel.js:434). Re-traced every resolve ordering (late runtime callback, late ACTION_STATUS, double-resolve, 5s cleanup): the restore fires exactly once and never clobbers the check-broadcast label on clicked/unknown |
| R4-2 dead field removed | **Fixed, clean** | session.js:776 is now `if (record) record.shown = "pending";` — `clickedAt` gone; repo-wide grep returns zero references |
| R4-3 rebind on ACTION_STATUS send failure | **NOT FIXED** | panel.js:534-537 catch still nulls `port`/`tabId` with no `scheduleRebind()`. The only `+ scheduleRebind()` in 9965cad is inside the appended spec doc (v2-review-glm-iter4.md), not code — the commit message's "rebind on send failure" claim is not implemented. Impact stays nit-level (a throwing `postMessage` implies a dead port whose pending `onDisconnect` → rebind fires; tab/window focus listeners backstop), so it does not block |
| R4-4 sticky-latch test added | **Fixed** | admission-test.js:633-647 "sticky pending: a pre-click shownSet cannot re-arm a latched record" — set-without-id keeps `"pending"`, set-with-id promotes to `"on"`; passes. (The other seams round 4 listed — rebuildEpoch discard, per-endpoint drop map, identity clear — remain uncovered; the sticky-latch test the task scoped is present) |

## Hunt notes (non-blocking, none new-in-delta)

- The three changed hunks introduce no defects: label restore is closure-safe on detached buttons; `clickedAt` removal leaves the latch fully functional; the new test is pure and passing.
- Re-traced clean while hunting: feature-proxy chain end-to-end (panel → sw.js sender/URL/active-tab/expiry gates → session sender.id check → refusal matrix → receipt idempotency → ACTION_STATUS reconciliation), LLM guard epochs across all three rebuild paths, patch/revision-gap/resync loops, reset and route-change recovery, remount registry and prune limits, ws-main/ws-bridge (dormant in the shipped `WS_MODE: "off"` build), manifest and variant gating.
- Nits for the record: `port.safwaRowIds` (session.js:610) is write-only dead state, same class as the removed `clickedAt`; `platformIcon("constructor")` would hit `Object.prototype` and put function source into `innerHTML` (inert text, no injection, effectively unreachable in the off-build); carried R4-5 — `lastFocusedWindow` bind and the deleted v1 store screenshots with no v2 replacements staged yet.

Recommend closing R4-3's one-line gap (add `scheduleRebind()` in the panel.js:534 catch) and staging the v2 store screenshots before merging to main; neither blocks.
