/*
 * Studio-first sidebar attach: the teacher must not need a refresh after
 * opening Ṣafwa on an already-live studio tab.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CONTENT_SCRIPT_FILE,
  isStreamYardUrl,
  needsContentAttach,
  panelPathForTab,
  readPinnedTabId,
} from "../src/inject.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

assert.equal(isStreamYardUrl("https://streamyard.com/studio/abc"), true);
assert.equal(isStreamYardUrl("https://www.streamyard.com/studio/abc"), true);
assert.equal(isStreamYardUrl("https://mail.google.com/"), false);
assert.equal(isStreamYardUrl(""), false);

assert.equal(
  needsContentAttach({ url: "https://streamyard.com/studio/abc", pingOk: false }),
  true,
  "already-open studio with no session must attach"
);
assert.equal(
  needsContentAttach({ url: "https://streamyard.com/studio/abc", pingOk: true }),
  false,
  "do not inject a second session when ping answers"
);
assert.equal(
  needsContentAttach({ url: "https://mail.google.com/", pingOk: false }),
  false,
  "never attach off StreamYard"
);

assert.equal(panelPathForTab(42), "panel/panel.html?tab=42");
assert.equal(readPinnedTabId("?tab=42"), 42);
assert.equal(readPinnedTabId(""), null);

const sw = read("src/sw.js");
assert.match(sw, /executeScript/, "icon click must attach content.js to the open studio");
assert.ok(
  !/executeScript\(\{[\s\S]*?target:\s*\{[^}]*frameId:/.test(sw),
  "scripting target must not use frameId (Chrome rejects the inject)"
);
assert.match(sw, /safwa-ping/, "ping first so a live session is not started twice");
assert.match(sw, /onInstalled/, "extension reload must re-attach already-open studio tabs");
assert.match(sw, /CONTENT_SCRIPT_FILE/, "the injected file is the v2 bootstrap");
assert.equal(CONTENT_SCRIPT_FILE, "src/content.js");

const manifest = JSON.parse(read("manifest.json"));
assert.ok(
  (manifest.permissions ?? []).includes("scripting"),
  "scripting is required to attach to an already-open studio tab"
);

const content = read("src/content.js");
assert.match(
  content,
  /__safwaContentBooted/,
  "a second inject must not start a second session"
);

const panel = read("panel/panel.js");
assert.match(panel, /readPinnedTabId/, "sidebar must bind the tab that opened it");
assert.match(panel, /tabHasSession/, "do not chrome.tabs.connect before the session answers ping");
assert.match(panel, /safwa-ensure/, "ask the worker to attach if ping misses");
assert.ok(
  !panel.includes("lastFocusedWindow"),
  "lastFocusedWindow is the race that shows «open studio» on a live tab"
);

const session = read("src/session.js");
assert.match(
  session,
  /requireRows:\s*true/,
  "watchdog must retarget to the container that actually holds rows"
);

console.log("inject / studio-first attach: PASS");
