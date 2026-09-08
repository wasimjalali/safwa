/*
 * Regression test for StreamYard's recycled virtual-scroller rows. A DOM node
 * that previously held one comment can later hold a different comment. Safwa
 * must process the new content without reacting to its own badge mutations.
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

const attributes = new Map();
const classes = new Set();
let authorText = "viewer-one";
let commentText = "first question";
let annotationCount = 0;
let observerCallback = null;

const authorElement = {
  textContent: authorText,
  getAttribute: () => null,
};
const textElement = {
  nodeType: 1,
  textContent: commentText,
  closest: (selector) => (selector === SELECTORS.commentNode ? row : null),
  matches: () => false,
};
const textNode = {
  nodeType: 3,
  parentElement: textElement,
};
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
  setAttribute(name, value) {
    attributes.set(name, value);
    if (name === "data-safwa-annotated") annotationCount++;
  },
  removeAttribute: (name) => attributes.delete(name),
  querySelector(selector) {
    if (selector === SELECTORS.authorHandle) {
      authorElement.textContent = authorText;
      return authorElement;
    }
    if (selector === SELECTORS.text) {
      textElement.textContent = commentText;
      return textElement;
    }
    if (selector === SELECTORS.platformIndicator) return platformElement;
    return null;
  },
  querySelectorAll: () => [],
  matches: (selector) => selector === SELECTORS.commentNode,
  closest: (selector) => (selector === SELECTORS.commentNode ? row : null),
};
const container = {
  isConnected: true,
  querySelector: (selector) => (selector === SELECTORS.commentNode ? row : null),
  querySelectorAll: (selector) => (selector === SELECTORS.commentNode ? [row] : []),
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
  querySelectorAll: () => [container],
};
globalThis.chrome = {
  runtime: {
    getManifest: () => manifest,
    getURL: (path) => new URL(`../${path}`, import.meta.url).href,
  },
  storage: {
    local: {
      get: () => Promise.resolve({ safwaLlmEnabled: false }),
    },
    onChanged: {
      addListener() {},
    },
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

await import(`../src/content.js?virtualization-test=${Date.now()}`);

for (let turn = 0; turn < 20 && annotationCount < 1; turn++) {
  await new Promise((resolve) => setImmediate(resolve));
}

assert.equal(annotationCount, 1, "expected the initial comment to be processed");
assert.equal(typeof observerCallback, "function", "expected the feed observer to attach");

authorText = "viewer-two";
commentText = "a different question in the recycled row";
observerCallback([{ type: "characterData", target: textNode, addedNodes: [] }]);

for (let turn = 0; turn < 20 && annotationCount < 2; turn++) {
  await new Promise((resolve) => setImmediate(resolve));
}

assert.equal(
  annotationCount,
  2,
  "expected changed content in a recycled row to be processed"
);

classes.add("safwa-collapsed");
authorText = "viewer-three";
commentText = "fresh text replacement question";
observerCallback([{ type: "childList", target: textElement, addedNodes: [textNode] }]);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(annotationCount, 3, "expected childList text replacement to be processed");
assert.equal(classes.has("safwa-collapsed"), false, "replacement must not retain hidden state");

console.log("content.js virtualized-row regression: PASS");
