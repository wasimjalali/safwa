/*
 * Regression test for delayed StreamYard Comments-panel mounting. The script may load
 * on the broadcasts page before the studio and Comments panel mount. It must
 * continue checking after the initial fast polling budget instead of stopping.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(
  readFileSync(new URL("../manifest.json", import.meta.url), "utf8")
);
const matchedPage = new URL(
  manifest.content_scripts[0].matches[0].replace("*", "broadcasts")
);

const messages = [];
const scheduledDelays = [];
const originalConsole = globalThis.console;
globalThis.console = {
  ...originalConsole,
  log: (...args) => messages.push(args.map(String).join(" ")),
  warn: (...args) => messages.push(args.map(String).join(" ")),
};

let containerQueries = 0;
const container = {
  isConnected: true,
  querySelector: () => null,
  querySelectorAll: () => [],
};

globalThis.location = {
  host: matchedPage.host,
  pathname: matchedPage.pathname,
};
globalThis.document = {
  documentElement: {
    classList: {
      toggle() {},
    },
  },
  querySelectorAll() {
    containerQueries++;
    return containerQueries > 30 ? [container] : [];
  },
};
globalThis.chrome = {
  runtime: {
    getManifest: () => manifest,
    getURL: (path) => new URL(`../${path}`, import.meta.url).href,
  },
  storage: {
    local: {
      get: () => Promise.resolve({}),
    },
    onChanged: {
      addListener() {},
    },
  },
};
globalThis.MutationObserver = class {
  observe() {}
  disconnect() {}
};
globalThis.setTimeout = (callback, delay) => {
  scheduledDelays.push(delay);
  queueMicrotask(callback);
  return 1;
};
globalThis.setInterval = () => 1;
globalThis.clearInterval = () => {};

await import(`../src/content.js?retry-test=${Date.now()}`);

for (let turn = 0; turn < 100; turn++) {
  if (messages.some((message) => message.includes("comments container found"))) break;
  await new Promise((resolve) => setImmediate(resolve));
}

globalThis.console = originalConsole;

assert.ok(
  containerQueries > 30,
  `expected polling to continue after 30 attempts, got ${containerQueries}`
);
assert.ok(
  messages.some((message) => message.includes("comments container found")),
  "expected the content script to attach when the Comments panel mounted later"
);
assert.equal(
  scheduledDelays[28],
  1000,
  "expected the initial polling budget to use the fast interval"
);
assert.equal(
  scheduledDelays[29],
  3000,
  "expected polling after attempt 30 to use the slow interval"
);

console.log("content.js late-panel retry regression: PASS");
