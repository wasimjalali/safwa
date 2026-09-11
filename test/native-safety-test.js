/*
 * native-safety-test.js - criterion 10 as a static guard: the v2 production
 * path must never write to StreamYard's DOM. The only permitted native
 * interaction is the validated click in dom.js.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  FAIL  ${name}: ${err.message}`);
  }
}

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const sessionSrc = read("src/session.js");
const contentSrc = read("src/content.js");
const panelSrc = read("panel/panel.js");
const manifest = JSON.parse(read("manifest.json"));

check("sendSnapshot has no leftover dbg() that would drop every reopen", () => {
  assert.equal(sessionSrc.includes("dbg("), false, "dbg() throws and the sidebar gets no snapshot");
});

check("the StreamYard example card is rejected before admission", () => {
  assert.ok(
    sessionSrc.includes("isStreamYardSampleComment"),
    "sample chrome must not enter the matching pipeline"
  );
});

check("on-air state is shared across collapsed copies", () => {
  assert.ok(sessionSrc.includes("groupShownState"), "repeats of one card share one on-air lamp");
});

check("a click does not steal another copy's native node", () => {
  assert.ok(sessionSrc.includes("pickLiveMatch"), "own connected anchor wins over last text match");
  assert.ok(sessionSrc.includes("bindOwnAnchor"), "one occurrence must not adopt another copy's node");
  assert.ok(sessionSrc.includes("sourceIdOwning"), "shown is written on the row that was clicked");
  assert.ok(sessionSrc.includes("offClickAllowed"), "off-air must refuse a node another copy owns");
});

check("feature availability follows the live native row, not a stale cache", () => {
  assert.ok(sessionSrc.includes("liveElementFor(record)"), "projection must use the live match");
  const availBlock = sessionSrc.slice(sessionSrc.indexOf("function currentProjection"));
  assert.ok(
    availBlock.includes("anchorOk: !!liveEl?.isConnected"),
    "the sidebar button must not key off a disconnected cached anchor"
  );
});

check("v2 never loads the in-place annotation layer", () => {
  assert.equal(sessionSrc.includes("ui.js"), false, "session.js must not import ui.js");
  assert.ok(sessionSrc.includes("restoreFeed"), "session.js must strip leftover v1 paint");
  assert.ok(sessionSrc.includes("native-restore.js"), "restore lives outside session writes");
});

check("v2 session.js performs no native DOM writes", () => {
  for (const forbidden of [
    ".classList.add",
    ".classList.remove",
    ".classList.toggle",
    ".setAttribute(",
    ".removeAttribute(",
    ".style.",
    ".innerHTML",
    ".appendChild(",
    ".removeChild(",
    ".scrollIntoView",
  ]) {
    assert.ok(
      !sessionSrc.includes(forbidden),
      `session.js must not contain ${forbidden}`
    );
  }
});

check("v2 content.js performs no native DOM writes", () => {
  for (const forbidden of [".classList", ".setAttribute(", ".innerHTML", ".style."]) {
    assert.ok(!contentSrc.includes(forbidden), `content.js must not contain ${forbidden}`);
  }
});

check("the show-control selector lives only in config.js + dom.js", () => {
  const literal = 'data-testid=\"show-comment-button\"';
  assert.ok(read("src/config.js").includes(literal), "config.js owns the selector string");
  assert.ok(read("src/dom.js").includes("SELECTORS.showCommentButton"), "dom.js consumes it");
  assert.ok(!sessionSrc.includes("show-comment-button"), "session.js must call dom.js instead");
  assert.ok(!panelSrc.includes("show-comment-button"), "panel.js must never query StreamYard");
  assert.ok(!contentSrc.includes("show-comment-button"), "content.js must never query StreamYard");
});

check("the v2 manifest injects no stylesheet and no UI script", () => {
  const entries = manifest.content_scripts ?? [];
  for (const entry of entries) {
    assert.ok(!entry.css || entry.css.length === 0, "v2 injects no CSS");
    assert.ok(
      !entry.js.includes("src/ui.js"),
      "v2 must not inject the in-place annotation layer"
    );
  }
});

check("the only native action call in session.js is the validated click", () => {
  const calls = sessionSrc.match(/dom\.\w+/g) ?? [];
  const writeCalls = calls.filter((c) =>
    ["dom.clickShowButton", "dom.findShowButton", "dom.extractComment", "dom.collectCommentNodes",
     "dom.commentNodesWithin", "dom.closestCommentNode", "dom.findCommentContainer", "dom.cardAnchor",
     "dom.selectorsConfirmed", "dom.findMatchingCommentNodes", "dom.commentMatches"].includes(c)
  );
  assert.equal(writeCalls.length, calls.length, "no unknown dom write API is used");
  assert.ok(sessionSrc.includes("dom.clickShowButton"), "the click goes through dom.js");
});

console.log(`native-safety tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
