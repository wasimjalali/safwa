/*
 * Regression test for an LLM response that arrives after StreamYard reuses a
 * virtual-scroller row for another comment. The old response must not annotate
 * the new comment now occupying that DOM node.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { CONFIG, SELECTORS } from "../src/config.js";

CONFIG.LLM_ENABLED = true;

const manifest = JSON.parse(
  readFileSync(new URL("../manifest.json", import.meta.url), "utf8")
);
const matchedPage = new URL(
  manifest.content_scripts[0].matches[0].replace("*", "studio")
);

let observerCallback = null;
const fetchResolvers = [];

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
      if (selector === ".safwa-badge.safwa-badge--semantic") {
        return badges.find((badge) => badge.className.includes("safwa-badge--semantic")) ?? null;
      }
      return null;
    },
    querySelectorAll: (selector) => (selector === ".safwa-badge" ? [...badges] : []),
    matches: (selector) => selector === SELECTORS.commentNode,
    closest: (selector) => (selector === SELECTORS.commentNode ? row : null),
  };

  return {
    row,
    textElement,
    replaceComment(nextHandle, nextText) {
      currentHandle = nextHandle;
      currentText = nextText;
    },
  };
}

const first = makeRow("viewer-one", "first unrelated question");
const recycled = makeRow("viewer-two", "question awaiting semantic review");
const rows = [first.row, recycled.row];
const container = {
  isConnected: true,
  querySelector: (selector) => (selector === SELECTORS.commentNode ? rows[0] : null),
  querySelectorAll: (selector) => (selector === SELECTORS.commentNode ? rows : []),
};

globalThis.location = {
  host: matchedPage.host,
  pathname: matchedPage.pathname,
};
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
    local: { get: () => Promise.resolve({}) },
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
globalThis.setTimeout = (callback, delay) => {
  if (delay === 80) queueMicrotask(callback);
  return 1;
};
globalThis.clearTimeout = () => {};
globalThis.setInterval = () => 1;
globalThis.clearInterval = () => {};
globalThis.fetch = () =>
  new Promise((resolve) => {
    fetchResolvers.push(resolve);
  });

await import(`../src/content-legacy.js?llm-stale-test=${Date.now()}`);

for (let turn = 0; turn < 20 && fetchResolvers.length < 1; turn++) {
  await new Promise((resolve) => setImmediate(resolve));
}
assert.equal(fetchResolvers.length, 1, "expected semantic review for the second initial comment");

recycled.replaceComment("viewer-three", "new question in the recycled row");
observerCallback([{ addedNodes: [recycled.textElement] }]);

for (let turn = 0; turn < 20 && fetchResolvers.length < 2; turn++) {
  await new Promise((resolve) => setImmediate(resolve));
}
assert.equal(fetchResolvers.length, 2, "expected semantic review for the replacement comment");

fetchResolvers[0]({
  ok: true,
  json: async () => ({
    choices: [{ message: { content: '{"classification":"duplicate"}' } }],
  }),
});
await new Promise((resolve) => setImmediate(resolve));
await new Promise((resolve) => setImmediate(resolve));

assert.equal(
  recycled.row.getAttribute("data-safwa-llm"),
  null,
  "expected a stale LLM result not to annotate the replacement comment"
);

console.log("content.js stale-LLM virtualized-row regression: PASS");
