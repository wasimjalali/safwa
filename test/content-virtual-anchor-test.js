/*
 * Regression test for duplicate anchors in recycled StreamYard rows. Once a
 * row shows different content, it must not remain the representative DOM node
 * for the old question or cause the only visible duplicate to be collapsed.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { CONFIG, SELECTORS } from "../src/config.js";

CONFIG.LLM_ENABLED = false;

const manifest = JSON.parse(
  readFileSync(new URL("../manifest.json", import.meta.url), "utf8")
);
const matchedPage = new URL(
  manifest.content_scripts[0].matches[0].replace("*", "studio")
);

let observerCallback = null;

function makeRow(handle, text) {
  const attributes = new Map();
  const classes = new Set();
  const badges = [];
  let currentHandle = handle;
  let currentText = text;

  const authorElement = { textContent: currentHandle };
  const textElement = {
    nodeType: 1,
    textContent: currentText,
    closest: (selector) => (selector === SELECTORS.commentNode ? row : null),
    matches: () => false,
  };
  const textNode = { nodeType: 3, parentElement: textElement };
  const platformElement = {
    textContent: "",
    getAttribute: (name) => (name === "alt" ? "Youtube" : null),
  };

  const row = {
    nodeType: 1,
    isConnected: true,
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
    },
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
    appendChild: (badge) => badges.push(badge),
    querySelector(selector) {
      if (selector === SELECTORS.authorHandle) {
        authorElement.textContent = currentHandle;
        return authorElement;
      }
      if (selector === SELECTORS.text) {
        textElement.textContent = currentText;
        return textElement;
      }
      if (selector === SELECTORS.platformIndicator) return platformElement;
      if (selector === ".safwa-count") {
        return badges.find((badge) => badge.className.includes("safwa-count")) ?? null;
      }
      return null;
    },
    querySelectorAll: (selector) => (selector === ".safwa-badge" ? [...badges] : []),
    matches: (selector) => selector === SELECTORS.commentNode,
    closest: (selector) => (selector === SELECTORS.commentNode ? row : null),
  };

  return {
    row,
    classes,
    textNode,
    replaceComment(nextHandle, nextText) {
      currentHandle = nextHandle;
      currentText = nextText;
    },
  };
}

const recycled = makeRow("viewer-one", "original question");
const rows = [recycled.row];
const container = {
  isConnected: true,
  querySelector: (selector) => (selector === SELECTORS.commentNode ? rows[0] : null),
  querySelectorAll: (selector) => (selector === SELECTORS.commentNode ? rows : []),
};

globalThis.location = { host: matchedPage.host, pathname: matchedPage.pathname };
globalThis.document = {
  documentElement: { classList: { toggle() {} } },
  querySelectorAll: () => [container],
  createElement() {
    return {
      className: "",
      textContent: "",
      setAttribute() {},
      remove() {},
    };
  },
};
globalThis.chrome = {
  runtime: {
    getManifest: () => manifest,
    getURL: (path) => new URL(`../${path}`, import.meta.url).href,
  },
  storage: {
    local: { get: () => Promise.resolve({ safwaLlmEnabled: false }) },
    onChanged: { addListener() {} },
  },
};
globalThis.Node = { ELEMENT_NODE: 1 };
globalThis.MutationObserver = class {
  constructor(callback) {
    observerCallback = callback;
  }
  observe() {}
  disconnect() {}
};
globalThis.setTimeout = (callback) => {
  queueMicrotask(callback);
  return 1;
};
globalThis.setInterval = () => 1;
globalThis.clearInterval = () => {};

await import(`../src/content-legacy.js?virtual-anchor-test=${Date.now()}`);
await new Promise((resolve) => setImmediate(resolve));

recycled.replaceComment("viewer-two", "different replacement question");
observerCallback([
  { type: "characterData", target: recycled.textNode, addedNodes: [] },
]);
await new Promise((resolve) => setImmediate(resolve));

const visibleDuplicate = makeRow("viewer-three", "original question");
rows.push(visibleDuplicate.row);
observerCallback([
  { type: "childList", target: container, addedNodes: [visibleDuplicate.row] },
]);
await new Promise((resolve) => setImmediate(resolve));

assert.equal(
  visibleDuplicate.classes.has("safwa-collapsed"),
  false,
  "expected the only visible copy of the old question to remain visible"
);

visibleDuplicate.replaceComment("viewer-four", "another replacement question");
observerCallback([
  { type: "characterData", target: visibleDuplicate.textNode, addedNodes: [] },
]);
await new Promise((resolve) => setImmediate(resolve));
const nextDuplicate = makeRow("viewer-five", "original question");
rows.push(nextDuplicate.row);
observerCallback([
  { type: "childList", target: container, addedNodes: [nextDuplicate.row] },
]);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(nextDuplicate.classes.has("safwa-collapsed"), false,
  "expected a recycled adopted anchor not to hide the only remaining copy");

const hiddenCopy = makeRow("viewer-six", "original question");
rows.push(hiddenCopy.row);
observerCallback([{ type: "childList", target: container, addedNodes: [hiddenCopy.row] }]);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(hiddenCopy.classes.has("safwa-collapsed"), true);
nextDuplicate.replaceComment("viewer-seven", "");
observerCallback([{ type: "characterData", target: nextDuplicate.textNode, addedNodes: [] }]);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(hiddenCopy.classes.has("safwa-collapsed"), false,
  "an already collapsed copy must be revealed when its anchor is recycled");

console.log("content.js recycled duplicate-anchor regression: PASS");
