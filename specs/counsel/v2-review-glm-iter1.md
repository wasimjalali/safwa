[0m
> build · glm-5.3
[0m
[0m$ [0mgit branch -a --list && git status && git log --oneline -15
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
On branch feat/safwa-v2-sidebar
Your branch is up to date with 'origin/feat/safwa-v2-sidebar'.

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	specs/counsel/v2-review-glm-iter1.md

nothing added to commit but untracked files present (use "git add" to track)
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
2c830d7 Merge pull request #12 from wasimjalali/chore/dom-discovery-console
[0m
[0m$ [0mgit diff main...HEAD --stat
captures/ws-2026-09-11/streamyard-ws-evidence.json | 125 +++
 manifest.json                                      |  40 +-
 manifest.v1.json                                   |  42 +
 package.json                                       |   5 +-
 panel/panel.css                                    | 416 ++++++++++
 panel/panel.html                                   |  52 ++
 panel/panel.js                                     | 517 ++++++++++++
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
 specs/safwa-v2-architecture.md                     | 636 +++++++++++++++
 specs/websocket-counsel-brief.md                   | 346 ++++++++
 src/admission.js                                   | 576 +++++++++++++
 src/config.js                                      |  96 ++-
 src/content-legacy.js                              | 426 ++++++++++
 src/content.js                                     | 347 +-------
 src/dom.js                                         |  82 +-
 src/health.js                                      | 228 ++++++
 src/panel-model.js                                 | 171 ++++
 src/protocol.js                                    | 125 +++
 src/session.js                                     | 790 ++++++++++++++++++
 src/sw.js                                          |  81 ++
 src/ui.js                                          |  83 +-
 src/ws-bridge.js                                   | 283 +++++++
 src/ws-main.js                                     | 293 +++++++
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
 test/fixtures/ws-2026-09-11-events.json            |  50 ++
 test/health-test.js                                | 280 +++++++
 test/panel-model-test.js                           | 153 ++++
 test/protocol-test.js                              | 138 ++++
 test/ui-safety-test.js                             |  15 +
 test/ws-parser-test.js                             | 569 +++++++++++++
 tools/build-manifest.js                            | 187 +++++
 67 files changed, 12937 insertions(+), 372 deletions(-)
[0m
[0m# [0mTodos
[•] Read binding spec + counsel docs (architecture, WS evidence, user directive)
[ ] Run npm test and inspect test coverage of new modules
[ ] Review seam files: session.js, panel.js, sw.js, content.js
[ ] Review WS layer: ws-bridge.js, ws-main.js, ws-parser.js, protocol.js
[ ] Review admission.js, health.js, panel-model.js, config.js, dom.js, ui.js
[ ] Review manifest.json, package.json, tools/build-manifest.js, popup files
[ ] Hunt targeted defect classes (spoofing, desync, leaks, MV3 misuse, a11y)
[ ] Compile findings table + top-5 priorities
[0m
[0m→ [0mRead specs/safwa-v2-architecture.md
[0m→ [0mRead specs/counsel/USER-DIRECTIVE-2026-09-11.md
[0m→ [0mRead specs/safwa-v2-architecture.md[90m [offset=484][0m
[0m→ [0mRead specs/counsel/WS-EVIDENCE-2026-09-11.md
[0m
[0m# [0mTodos
[✓] Read binding spec + counsel docs (architecture, WS evidence, user directive)
[•] Run npm test and inspect test coverage of new modules
[ ] Review seam files: session.js, panel.js, sw.js, content.js
[ ] Review WS layer: ws-bridge.js, ws-main.js, ws-parser.js, protocol.js
[ ] Review admission.js, health.js, panel-model.js, config.js, dom.js, ui.js
[ ] Review manifest.json, package.json, tools/build-manifest.js, popup files
[ ] Hunt targeted defect classes (spoofing, desync, leaks, MV3 misuse, a11y)
[ ] Compile findings table + top-5 priorities
[0m
Spec and counsel docs read. Now running tests and reading the core seam files.
[0m$ [0mnpm test 2>&1 | tail -40
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
[0m$ [0mnpm test 2>&1 | grep -E "(passed|failed|FAIL|PASS.*test)" | grep -E "^[a-zA-Z].*tests?:" ; npm test 2>&1 | grep -cE "PASS" ; cat package.json
ws-parser tests: 35 passed, 0 failed
protocol tests: 12 passed, 0 failed
panel-model tests: 9 passed, 0 failed
189
{
  "name": "safwa",
  "version": "1.0.5",
  "private": true,
  "description": "\u1e62afwa (\u0635\u0641\u0648\u0629) - Chrome MV3 live Q&A filter for Dari/Persian StreamYard comments. Regex plus Gemma 4: collapse duplicates, join split questions, one question per person.",
  "type": "module",
  "scripts": {
    "test": "node test/run-tests.js && node test/ws-parser-test.js && node test/health-test.js && node test/admission-test.js && node test/protocol-test.js && node test/panel-model-test.js && node test/content-retry-test.js && node test/content-virtualization-test.js && node test/content-virtual-anchor-test.js && node test/content-llm-stale-test.js && node test/content-count-recycle-test.js && node test/ui-safety-test.js",
    "build:manifest": "node tools/build-manifest.js",
    "replay": "node test/replay-analysis.js",
    "demo": "python3 -m http.server 8000"
  },
  "license": "MIT"
}
[0m
[0m✱ [0mGlob "test/*.js"[90m 19 matches[0m
[0m→ [0mRead src/session.js
[0m→ [0mRead panel/panel.js
[0m→ [0mRead src/protocol.js
session.js read — several candidate issues noted (LLM scheduler absent, receipt-after-click, sender check). Now reading the panel and protocol.
[0m→ [0mRead src/sw.js
[0m→ [0mRead src/content.js
[0m→ [0mRead panel/panel.html
[0m✱ [0mGrep "platformIcon"[90m 7 matches[0m
[0m✱ [0mGrep "platformLabel"[90m 5 matches[0m
[0m→ [0mRead src/config.js
[0m→ [0mRead src/panel-model.js
Critical find: `platformIcon` is called at panel.js:345 but never defined anywhere. Continuing with the rest of the review.
[0m→ [0mRead src/admission.js
[0m→ [0mRead src/health.js
[0m
[0m$ [0mgit diff main...HEAD -- src/dom.js src/ui.js | head -400
diff --git a/src/dom.js b/src/dom.js
index 3575eb0..2f3a2f2 100644
--- a/src/dom.js
+++ b/src/dom.js
@@ -114,6 +114,70 @@ function extractPlatform(commentNode) {
  * `timestamp` is arrival time (Date.now) because StreamYard exposes no reliable
  * per-comment time; the core only ever compares timestamps, never parses them.
  */
+/**
+ * The row (li.VirtualScroller__ScrollItemWrapper) is the virtual scroller's
+ * slot, not the visible comment card inside it. Absolute-positioned badges must
+ * anchor to the card: against the slot they float under the card or get covered
+ * by the next row. Walk from the text element up to the row's top-level child
+ * that contains it - no extra selectors, no assumptions about card classes.
+ */
+function topChildContaining(commentNode, el) {
+  let cur = el;
+  while (cur?.parentElement && cur.parentElement !== commentNode) cur = cur.parentElement;
+  return cur?.parentElement === commentNode ? cur : null;
+}
+
+/** The inner card element badges anchor to (fallback: the row itself). */
+export function cardAnchor(commentNode) {
+  if (!commentNode) return null;
+  const textEl = commentNode.querySelector?.(SELECTORS.text) ?? null;
+  return topChildContaining(commentNode, textEl) ?? commentNode;
+}
+
+/**
+ * The viewer avatar image (distinct from the platform indicator icon). Returns
+ * an https URL or "" — a missing avatar must never invalidate the comment.
+ */
+export function extractAvatar(commentNode) {
+  try {
+    const img = commentNode?.querySelector?.(SELECTORS.profileAvatar);
+    const src = img?.getAttribute?.("src") ?? img?.src ?? "";
+    const parsed = new URL(src);
+    if (parsed.protocol !== "https:") return "";
+    if (parsed.username || parsed.password) return "";
+    return src;
+  } catch {
+    return "";
+  }
+}
+
+/** The native "show on broadcast" control inside a validated row, or null. */
+export function findShowButton(commentNode) {
+  try {
+    const buttons = commentNode?.querySelectorAll?.(SELECTORS.showCommentButton);
+    if (!buttons || buttons.length !== 1) return null; // exactly one, or refuse
+    return buttons[0];
+  } catch {
+    return null;
+  }
+}
+
+/**
+ * Click the native feature control. Returns true only when a single enabled
+ * button belonging to this row was clicked. Callers MUST have re-validated the
+ * row immediately before calling; nothing here guesses.
+ */
+export function clickShowButton(commentNode) {
+  const button = findShowButton(commentNode);
+  if (!button || button.disabled) return false;
+  try {
+    button.click();
+    return true;
+  } catch {
+    return false;
+  }
+}
+
 export function extractComment(commentNode) {
   if (!commentNode) return null;
 
@@ -124,11 +188,17 @@ export function extractComment(commentNode) {
   const displayText = readText(textEl);
 
   if (!handle || !displayText) {
-    warnOnce(
-      "fields",
-      `found comment node(s) but could not read handle or text. Author/text ` +
-        `selectors are likely stale. Update SELECTORS in config.js.`
-    );
+    // Blank virtual-scroller placeholders have no author/text nodes. Only warn
+    // when the row already shows comment text we cannot parse — that is the
+    // stale-selector case, not an incoming empty row.
+    const raw = readText(commentNode);
+    if (raw.length > 20) {
+      warnOnce(
+        "fields",
+        `found comment node(s) but could not read handle or text. Author/text ` +
+          `selectors are likely stale. Update SELECTORS in config.js.`
+      );
+    }
     return null;
   }
 
@@ -136,7 +206,9 @@ export function extractComment(commentNode) {
     handle,
     platform: extractPlatform(commentNode),
     displayText,
+    avatar: extractAvatar(commentNode),
     timestamp: Date.now(),
     el: commentNode,
+    cardEl: topChildContaining(commentNode, textEl) ?? commentNode,
   };
 }
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
[0m
[0m→ [0mRead src/ws-bridge.js
[0m→ [0mRead src/ws-main.js
[0m→ [0mRead src/ws-parser.js
[0m→ [0mRead manifest.json
[0m→ [0mRead tools/build-manifest.js
[0m
[0m$ [0mgit diff main...HEAD -- popup/popup.js popup/popup.html popup/popup.css | head -320
diff --git a/popup/popup.css b/popup/popup.css
index 8136ede..b86a2ef 100644
--- a/popup/popup.css
+++ b/popup/popup.css
@@ -33,6 +33,12 @@
   box-sizing: border-box;
 }
 
+/* An author `display` rule beats the UA [hidden] rule; keep hidden elements
+ * hidden (the link-status / fix-link recovery UI relies on the attribute). */
+[hidden] {
+  display: none !important;
+}
+
 button:not(:disabled) {
   cursor: pointer;
 }
@@ -214,6 +220,35 @@ body {
   opacity: 0;
 }
 
+.link-status {
+  margin: 0;
+  padding: 8px 14px 0;
+  font-size: 12.5px;
+  font-weight: 500;
+  line-height: 1.75;
+  color: var(--ink);
+}
+
+.fix-link {
+  display: block;
+  width: calc(100% - 28px);
+  min-height: 40px;
+  margin: 8px 14px 0;
+  padding: 8px 12px;
+  border: 1px solid var(--ink);
+  border-radius: 10px;
+  background: var(--ink);
+  color: var(--surface);
+  font-size: 12.5px;
+  font-weight: 550;
+  line-height: 1.5;
+  text-align: center;
+}
+
+.fix-link:hover {
+  background: #2a2a2a;
+}
+
 .setting + .setting {
   border-top: 1px solid var(--border);
 }
diff --git a/popup/popup.html b/popup/popup.html
index 117ee8a..03805ad 100644
--- a/popup/popup.html
+++ b/popup/popup.html
@@ -45,6 +45,8 @@
         </button>
       </div>
       <p id="hint" class="hint"></p>
+      <p id="link-status" class="link-status" hidden></p>
+      <button type="button" id="fix-link" class="fix-link" hidden></button>
 
       <div class="reset-row">
         <button type="button" id="reset" class="reset"></button>
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
[0m
[0m$ [0mgit diff main...HEAD -- src/llm-classifier.js src/normalize.js src/dedup.js src/grouping.js src/state.js --stat && git log --oneline main...HEAD | cat
c6e4672 Ship Ṣafwa v2: sidebar panel on a DOM-authoritative pipeline
[0m
[0m% [0mWebFetch https://developer.chrome.com/docs/extensions/reference/runtime#type-MessageSender
[0m→ [0mRead panel/panel.css
Docs confirm `sender.tab` is only present when the sender is a tab context — the SW-forwarded `tabs.sendMessage` arrives with `sender.tab` undefined, so session.js:75 passes. Now checking panel.css (a11y/contrast), content-legacy, manifest.v1.json, and test diffs.
[0m
[0m$ [0mls fonts/ panel/ 2>&1; git diff main...HEAD -- test/content-retry-test.js test/ui-safety-test.js | head -80; git show HEAD:manifest.v1.json | head -50
fonts/:
OFL.txt
Vazirmatn-Variable.woff2

panel/:
panel.css
panel.html
panel.js
diff --git a/test/content-retry-test.js b/test/content-retry-test.js
index 5c565b4..44312ae 100644
--- a/test/content-retry-test.js
+++ b/test/content-retry-test.js
@@ -71,7 +71,7 @@ globalThis.setTimeout = (callback, delay) => {
 globalThis.setInterval = () => 1;
 globalThis.clearInterval = () => {};
 
-await import(`../src/content.js?retry-test=${Date.now()}`);
+await import(`../src/content-legacy.js?retry-test=${Date.now()}`);
 
 for (let turn = 0; turn < 100; turn++) {
   if (messages.some((message) => message.includes("comments container found"))) break;
diff --git a/test/ui-safety-test.js b/test/ui-safety-test.js
index c1bfdec..2222c71 100644
--- a/test/ui-safety-test.js
+++ b/test/ui-safety-test.js
@@ -147,4 +147,19 @@ assert.equal(
 );
 assert.equal(askedClasses.has("safwa-primary"), true);
 
+const countedBadges = [];
+const countedNode = {
+  classList: {
+    add() {},
+    remove() {},
+  },
+  appendChild: (badge) => countedBadges.push(badge),
+  querySelector: () => null,
+  querySelectorAll: (selector) => (selector === ".safwa-badge" ? [...countedBadges] : []),
+  setAttribute() {},
+};
+render({ type: "primary", count: 3, comment: { el: countedNode } }, CONFIG);
+assert.equal(countedBadges.length, 1, "a re-rendered original must keep its asked-N badge");
+assert.match(countedBadges[0].textContent, /3/);
+
 console.log("ui.js human-in-the-loop safety regression: PASS");
{
  "manifest_version": 3,
  "name": "Ṣafwa - Live Q&A Filter",
  "version": "1.0.5",
  "description": "صفوة - cleans live Dari/Persian Q&A in StreamYard: collapses duplicates, merges splits, flags extra questions.",
  "icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "action": {
    "default_title": "Ṣafwa - Live Q&A Filter",
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "permissions": ["storage", "activeTab"],
  "host_permissions": [
    "https://streamyard.com/*",
    "https://*.streamyard.com/*",
    "https://*.workers.dev/*"
  ],
  "content_scripts": [
    {
      "matches": ["https://streamyard.com/*", "https://*.streamyard.com/*"],
      "js": ["src/content.js"],
      "css": ["styles.css"],
      "run_at": "document_idle"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["src/*.js", "fonts/*"],
      "matches": ["https://streamyard.com/*", "https://*.streamyard.com/*"]
    }
  ]
}
[0m
[0m$ [0mrg -n "content-legacy|PANEL_MODE" src/content-legacy.js | head -20; rg -n "window\.__safwa|localStorage|sessionStorage|indexedDB" src/*.js panel/panel.js | head; rg -n "console\.(log|warn|error)" src/ws-bridge.js src/ws-main.js src/ws-parser.js panel/panel.js src/sw.js
src/ws-bridge.js:19: *   window.__safwaWsBridge            -> singleton with the same API
src/ws-bridge.js:282:  window.__safwaWsBridge = createBridge();
panel/panel.js:516:  console.error("Ṣafwa panel init failed", err);
[0m
[0m→ [0mRead src/content-legacy.js[90m [limit=80][0m
[0m
[0m$ [0mrg -n "needsLlmReview|recentQuestions" src/grouping.js | head; rg -n "classifyComment|llmContextFromDecision" src/llm-classifier.js | head -5; rg -n "PANEL_MODE|WS_MODE" src/content-legacy.js | head
189:  const recentQuestions = collectRecentQuestions(state, config.LLM_MAX_CONTEXT_COMMENTS);
190:  if (recentQuestions.length === 0) return decision;
191:  decision.needsLlmReview = true;
193:  decision.recentQuestions = recentQuestions;
199:  const recentQuestions = collectRecentQuestions(state, config.LLM_MAX_CONTEXT_COMMENTS);
200:  decision.needsLlmReview = true;
202:  decision.recentQuestions = recentQuestions;
216:  const qs = decision.recentQuestions || [];
260: *   needsLlmReview, reviewKind ('room' | 'same_person' | 'courtesy'), recentQuestions,
280:      needsLlmReview: config.LLM_ENABLED !== false,
244:export async function classifyComment(newComment, recentQuestions, config, context = {}) {
316:export function llmContextFromDecision(comment, decision) {
[0m
[0m$ [0mrg -n "token=|jwt|Bearer" captures/ test/fixtures/ | head -10; rg -n "captures/|fixtures/" src/ panel/ | head; rg -n "token|auth" test/ws-parser-test.js | head -12
captures/ws-2026-09-11/streamyard-ws-evidence.json:62:   "url": "wss://videows.streamyard.com/ROOM_ID?clientId=CLIENT_ID&token=REDACTED",
captures/ws-2026-09-11/streamyard-ws-evidence.json:70:   "url": "wss://videows.streamyard.com/ROOM_ID?clientId=CLIENT_ID&token=REDACTED",
captures/ws-2026-09-11/streamyard-ws-evidence.json:86:   "url": "wss://videows.streamyard.com/ROOM_ID?clientId=CLIENT_ID&token=REDACTED",
captures/ws-2026-09-11/streamyard-ws-evidence.json:94:   "url": "wss://videows.streamyard.com/ROOM_ID?clientId=CLIENT_ID&token=REDACTED",
captures/ws-2026-09-11/streamyard-ws-evidence.json:118:   "url": "wss://videows.streamyard.com/ROOM_ID?clientId=CLIENT_ID&token=REDACTED",
test/fixtures/ws-2026-09-11-events.json:4:  "url": "wss://videows.streamyard.com/ROOM_ID?clientId=CLIENT_ID&token=REDACTED",
test/fixtures/ws-2026-09-11-events.json:10:  "url": "wss://videows.streamyard.com/ROOM_ID?clientId=CLIENT_ID&token=REDACTED",
test/fixtures/ws-2026-09-11-events.json:22:  "url": "wss://videows.streamyard.com/ROOM_ID?clientId=CLIENT_ID&token=REDACTED",
test/fixtures/ws-2026-09-11-events.json:28:  "url": "wss://videows.streamyard.com/ROOM_ID?clientId=CLIENT_ID&token=REDACTED",
test/fixtures/ws-2026-09-11-events.json:46:  "url": "wss://videows.streamyard.com/ROOM_ID?clientId=CLIENT_ID&token=REDACTED",
86:    authorPlatformId: "UC_SYNTHETIC_1",
136:test("no live token, JWT, or real handle survives in the fixture file", () => {
140:  const tokenValues = [...fixtureText.matchAll(/token=([^"&\\\s]+)/g)].map((m) => m[1]);
141:  assert.ok(tokenValues.length > 0, "expected token placeholders to be preserved");
142:  for (const value of tokenValues) {
143:    assert.equal(value, "REDACTED", `live token value survived: ${value}`);
173:    authorPlatformId: "UC_SANITIZED_1",
346:    '{"data":{"comments":[{"id":"LCC.BROKEN","name":"@broken","platform":"youtube","authorPlatformId":"UC_BROKEN","createdAt":"2026-09-11T00:05:37.664Z","contents":[{"type":"text","content":"broken "quote" here"}]}],"broadcastId":"BROADCAST_ID"},"type":"platformComments.created"}';
355:      { id: 123, name: {}, platform: [], authorPlatformId: null, createdAt: 123, contents: "nope" },
[0m
[0m$ [0mrg -n "scheduler|inFlight|queued|expire|pause" src/session.js src/llm-classifier.js | head; rg -n "ackTimeout|ACTION_STATUS" panel/panel.js src/session.js src/sw.js | head
src/session.js:638:    if (Date.now() > request.expiresAt) return refuse("featureFindNative");
src/session.js:606:      case protocol.MESSAGE_TYPES.ACTION_STATUS: {
src/session.js:609:          protocol.makeEnvelope(protocol.MESSAGE_TYPES.ACTION_STATUS, {
panel/panel.js:204:    case MESSAGE_TYPES.ACTION_STATUS: {
panel/panel.js:466:  }, CONFIG.FEATURE_PROXY.ackTimeoutMs);
[0m
Review complete. Full branch diff (67 files, ~13k lines) read against `specs/safwa-v2-architecture.md`, WS evidence, user directive, and CLAUDE.md; `npm test` run green (189 assertions); MV3 `sender` semantics verified against Chrome docs.

# Ṣafwa v2 Adversarial Review — feat/safwa-v2-sidebar vs main

## Findings

| # | Severity | Location | Defect | Why it matters | Fix |
|---|---|---|---|---|---|
| 1 | **Critical** | panel/panel.js:345 | `platformIcon(row.primary.platform)` is called but **never defined anywhere** (repo-wide grep: one usage, zero definitions; not in `CONFIG`, panel.html has no inline script). `renderRow` throws `ReferenceError` on the first row. | The sidebar renders **zero questions, ever**. Every `SNAPSHOT_END`/`PATCH` → `render()` throws before `replaceChildren`; the list stays empty and the teacher is silently back on the native panel. The entire v2 deliverable is dead on arrival; untested exactly because spec §12's `panel-render-test.js` was never written. | Define `platformIcon(platform)` returning bundled per-platform SVG (escape unknown → generic icon), or render `platformLabel` text. Add `test/panel-render-test.js` to `npm test`. |
| 2 | **High** | panel/panel.js:426-467 (+ src/session.js:654-657, src/sw.js:64-76) | On ack timeout (1 s) the panel resolves `outcome:"unknown"` and **re-enables the feature button**; the late real result is dropped (`pendingFeature` already deleted). New click = new `requestId`, so session receipts don't dedupe it; the `record.shown === "on"` guard is inert in default `WS_MODE:"off"` builds. | MV3 SW cold start routinely exceeds 1 s, so "unknown" is the *common* path for the first click after idle. The teacher's natural next action is a second click → a second validated native `.click()` → likely **toggles the comment off air**. Violates spec §7 ("ack timeout 1 s → ACTION_STATUS query, never a redispatch") and §8 row 13. | On `unknown`: keep the button disabled and show `featureCheckBroadcast`; implement the spec'd `ACTION_STATUS` port query instead of re-enabling. |
| 3 | **High** | panel/panel.js:319-408 vs src/panel-model.js:123-138 | `panel-model` builds `row.members` for folded duplicates, but `renderRow` **never renders members** — no expansion UI exists. | Violates criterion 11 ("every admitted record stays reachable — visible row, group expansion, or folded view") and §6.1 ("the count expands its members"). The duplicate askers are invisible, and the known same-person LLM mis-hide was specified as recoverable **through exactly this expansion**. | Render members under the count chip (e.g., a `<details>` like the folded view, each with own author + avatar). |
| 4 | **High** | src/session.js:381-410 | `scheduleLlm` has **no scheduler at all**: every `needsLlmReview` fires `llm.classifyComment` immediately — no ≤2-in-flight, no ≤20 queue, no 8 s-from-admission expiry, no 3-failures/60 s pause (spec §5 mandates all four). | A 25/s × 5 s burst (declared load) can fire ~125 concurrent fetches to the paid Cloudflare Worker; failures cost money and the failure-pause safety is absent. Fail-safe holds (regex stands), but the spec budget and cost ceiling are violated. | Add a small token-bucket scheduler in `session.js`: in-flight cap 2, queue cap 20 (drop-oldest with expiry), pause 60 s after 3 failures in 60 s. |
| 5 | **Medium** | tools/build-manifest.js:8-14, 74-99 + src/config.js:156-162 | WS variants (`v2-ws-log/enrich/primary`) package `ws-main.js`/`ws-bridge.js` but **never set `WS_MODE`** (config stays `"off"`), so `session.startWs()` exits and the whole WS rail is a silent no-op; the bridge then needlessly self-demotes on queue overflow. Same trap in reverse: the `legacy` variant runs `src/content.js`, which boots the **v2 session** unless someone also hand-edits `PANEL_MODE` to `"v1-inline"`. | The spec's `--ws=log\|enrich\|primary` interface (§2) is unimplemented as specified; a rehearsal build "passing" Gate A proves nothing, and a "legacy build" silently ships the v2 path with v1's manifest (no SW, no panel). | Emit a paired `config` patch per variant (e.g., write a generated `src/config-mode.js` or post-process `config.js` at package time), or hard-fail the build unless the config matches the variant; document the pairing. |
| 6 | **Medium** | panel/panel.js:154-215 | No **4 s HEALTH-silence watchdog** (spec §8 row 3). If a session-side `postMessage` throws, `session.publish` deletes the port from its set but the panel's `onDisconnect` never fires — the panel keeps stale data with no recovery until reopen. | Silent port failure leaves the teacher acting on a frozen list mid-broadcast with no visual cue beyond staleness. | Track `lastHealthAt`; after 2 missed 2 s beats, mark stale (`panelDisconnected`) and send `RESYNC`/reconnect. |
| 7 | **Medium** | src/session.js:471-510 | Every coalesced `PATCH` sends the **entire row set** as upserts (`upserts: rows`, no dirty-diff), re-serializing up to 5,000 `ViewRow`s per 150 ms tick while comments flow. | At the declared 5,000-record / 10-per-second load this is ~10 MB/s of structured-clone serialization — burns the p95 ≤250 ms paint budget and CPU (spec §10). | Track dirty `sourceId`s per publish (or a per-row content hash) and upsert only changed rows; removals are already diffed. |
| 8 | **Medium** | panel/panel.js:265-279 | `rowEls` eviction only removes ids absent from the model; rows that scroll out of the 150-row window stay as **detached `<article>` elements with live click listeners** forever. | ~5,000 retained elements + listeners over a 3 h session threatens the ≤50 MiB heap budget (§10) even though the *model* must keep everything. | In `render()`, also delete `rowEls` entries not in `visible` (elements rebuild on demand from the model). |
| 9 | **Medium** | panel/panel.css:17-58 vs spec §6.1 | Palette contradicts the binding spec: spec mandates Ṣafwa brand (canvas `#f7f3ea`, ink `#14221c`, primary `#0e6b51`, gold `#d4b36a`); the panel ships the Useful monochrome system (canvas `#f8f8f8`, black accent). User directive #4 requires "styled per the Ṣafwa brand". | Teacher-facing brand regression and a direct contradiction of the binding spec's §6.1 tokens. | Apply the §6.1 palette to the tokens, or record a spec amendment decision. |
| 10 | **Medium** | package.json:7 (test chain) | Spec §12 test files **missing from the repo and the `npm test` chain**: `feature-proxy-test.js` (all zero-click refusals), `native-safety-test.js` (criterion 10 mutation guard), `panel-render-test.js`. | Finding #1 shipped precisely because the renderer path has no test; the proxy's refusal matrix (wrong tab/session, twins, recycled rows, duplicate requestId) is only partially covered by `protocol-test.js`. | Add the three harnesses; at minimum a DOM-mock render test would have caught #1, and a fake-port proxy test would exercise session.js:632-697. |
| 11 | **Medium** | panel/panel.js:40-47 (+ panel.html:35) | The gear/settings view doesn't preserve reading position: `list.hidden` → `display:none` destroys scroll offset, and nothing saves/restores `scrollTop`. Spec §6.3: "بازگشت returns to the same reading position". | Teacher loses their place mid-broadcast every time they open settings — the exact regression §6.3 was written to prevent. Also `panelSettingsBack` label is dead, and the "load older" button reuses `panelFolded` ("نظرهای جمع‌شده") for a different concept. | Save `list.scrollTop` on gear-open and restore on close; give the older-rows control its own label. |
| 12 | **Low** | src/session.js:118-121 | Storage `safwaResetAt` listener calls `resetSession()` in **every** StreamYard tab, while v2 reset is port-scoped to the bound tab (spec §3.1 RESET_SESSION note). | No v2 writer exists today (popup is unpackaged), but any future/legacy writer resets all studios at once — a spec contradiction waiting to fire. | Gate the `resetAt` listener on `PANEL_MODE === "v1-inline"`, or remove it from v2 builds. |
| 13 | **Low** | panel/panel.js:70-74, 111-135 | `bindTab` queries `{ active, lastFocusedWindow }` instead of the panel's own window. On focus loss/switch, the panel transiently disconnects, clears, or rebinds to **another window's** studio tab. | Mostly masked by side-panel visibility semantics, but it churns full snapshots, can briefly show "open the studio" after an alt-tab (e.g., to OBS), and transiently binds two panels to one studio. | Query `{ active: true, windowId: <own windowId> }`; keep `lastFocusedWindow` only for initial bind. |
| 14 | **Low** | src/sw.js:29 | Hard-codes `{ safwaEnabled: true }` instead of `STORAGE_KEYS.enabled`. | Key identity lives only in `config.js` per project convention; a rename drifts silently. `sw.js` is a module and can import `STORAGE_KEYS`. | `import { STORAGE_KEYS } from "./config.js"` and use the constant. |
| 15 | **Low** | src/ws-main.js:249-255, 119-131; src/session.js:51, 719-725 | WS nits: `error` events don't remove sockets from `openSockets` (health beats continue for dead sockets until `close`); ws-main queue overflow **drops silently** (bridge demotion never latches, contra §8 row 18); panel `wsState` can stay `"log"/"enrich"` after health internally demotes (session only flips it on bridge `demote` envelopes). | Misleading health/status in rehearsal builds; a demoted-but-"enrich" status underreports degradation during exactly the drills Gate B/C run. | Delete the socket on `error` too; post a `demote`-style signal (or have `session` derive `wsState` from `health.snapshot()`). |
| 16 | **Low** | panel/panel.html:16-45 vs spec §9.2 / CLAUDE.md | Hard-coded Dari strings in the shell (title, "فیلتر سوال‌ها", gear aria-label, reset + new-items button text) instead of `CONFIG.LABELS`; `aria-live="polite"` sits on the entire list, announcing every patch churn. | Violates "every visible string comes from CONFIG.LABELS" — wording drift is invisible in review; whole-list live region is very chatty at 10 rows/s for screen-reader users. | Populate from `CONFIG.LABELS` on init; move `aria-live` to the status line or use `aria-relevant="additions"` scoped per-row. |
| 17 | **Low** | src/session.js:431-445; panel/panel.js:257; package.json:3; store-assets/ | Assorted: route-change reset doesn't clear the `pending` node set (old-broadcast rows can flush into the fresh session); the "older rows" button grows `windowCount` unboundedly; `package.json` version 1.0.5 vs manifest 2.0.0; store screenshots deleted with no v2 replacements staged. | Minor correctness/hygiene; none feed-visible today. | Clear `pending` in `resetSession`; cap `windowCount`; bump package version; add v2 store screenshots before the unlisted upload. |

**Verified clean (explicitly hunted, no defect):** matching core untouched (`normalize/dedup/grouping/state/llm-classifier` have zero diff); `processComment`/`applyLlmOverride` remain the only authorities; pipeline order intact; `AUTO_HIDE_ANYTHING_AMBIGUOUS: false` intact; plain-copy hygiene (`el`/`cardEl` never enter the core) respected in `session.runPipeline`/`rebuildFromRecords`; v2 path performs **zero native writes** (no `classList`/`data-*`/style anywhere in session.js — only the validated `clickShowButton`, and `styles.css` is not injected by the v2 manifest); delivery dedupe + whole-batch malformed rejection in `admission.js`/`ws-parser.js` fixture-tested (35 parser, 24 admission, 12 protocol, 9 panel-model, health tests green); token hygiene intact (`token=REDACTED` fixtures, fixture-integrity test in `npm test`, no runtime import of `captures/`, endpointKey-only bridging, no URL/avatar logging); bridge spoofing has no authority path (correlation requires DOM admission within 1.5 s; shownSet/starred affect badges only); SW validates sender URL/expiry/active-tab and returns `true` for async `sendResponse`; content-side `sender.tab` refusal is correct (docs: `sender.tab` present only for tab-originated sends, so SW-forwarded `tabs.sendMessage` passes); `sidePanel.open()` called synchronously in the gesture; snapshot revision/base-revision RESYNC discipline sound on both ends.

## Top-5 priorities

1. **Fix `platformIcon` (panel.js:345) and add a render test** — the sidebar never shows a single question; nothing else matters until this ships green.
2. **Stop the feature-proxy double-click path** (panel.js:426-467) — keep the button disabled on `unknown`, implement `ACTION_STATUS` per spec; this is the one path that can touch the live broadcast twice.
3. **Render duplicate-group members** (panel.js renderRow) — restores criterion-11 reachability and the mandated recovery from the known same-person LLM mis-hide.
4. **Add the LLM scheduler** (session.js:381-410) — caps Worker cost and honors the spec's concurrency/queue/expiry/pause contract before the next live session.
5. **Make `build-manifest.js` variants actually function** (pair WS_MODE/PANEL_MODE with the manifest, or fail the build) plus add the missing `feature-proxy`/`native-safety`/`panel-render` test harnesses — otherwise Gate A/B evidence is collected against a no-op rail.
