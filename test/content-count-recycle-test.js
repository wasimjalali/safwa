/*
 * Live StreamYard re-renders / recycles virtual-scroller rows. The same comment
 * must not be counted again just because it got a new <li>. That is what made
 * the first question say "asked 9 times" after a 9-comment test, and the last
 * brand-new question say "asked 2 times" before its text had settled.
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
    appendChild(badge) {
      badge.remove = () => {
        const i = badges.indexOf(badge);
        if (i !== -1) badges.splice(i, 1);
      };
      badges.push(badge);
    },
    querySelector(selector) {
      if (selector === SELECTORS.authorHandle) {
        authorElement.textContent = currentHandle;
        return currentHandle ? authorElement : null;
      }
      if (selector === SELECTORS.text) {
        textElement.textContent = currentText;
        return currentText ? textElement : null;
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
    badges,
    textNode,
    get handle() {
      return currentHandle;
    },
    get text() {
      return currentText;
    },
    replaceComment(nextHandle, nextText) {
      currentHandle = nextHandle;
      currentText = nextText;
      authorElement.textContent = nextHandle;
      textElement.textContent = nextText;
    },
    countLabel() {
      const badge = badges.find((b) => b.className.includes("safwa-count"));
      return badge?.textContent ?? "";
    },
  };
}

const rows = [];
const container = {
  isConnected: true,
  querySelector: (selector) => (selector === SELECTORS.commentNode ? rows[0]?.row ?? null : null),
  querySelectorAll: (selector) => (selector === SELECTORS.commentNode ? rows.map((r) => r.row) : []),
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

await import(`../src/content-legacy.js?count-recycle-test=${Date.now()}`);

async function drain(turns = 25) {
  for (let i = 0; i < turns; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function addRow(handle, text) {
  const item = makeRow(handle, text);
  rows.push(item);
  observerCallback?.([{ type: "childList", target: container, addedNodes: [item.row] }]);
  return item;
}

function rerenderAllRows() {
  const snapshot = rows.map((r) => ({ handle: r.handle, text: r.text }));
  for (const r of rows) r.row.isConnected = false;
  rows.length = 0;
  const added = [];
  for (const s of snapshot) {
    const item = makeRow(s.handle, s.text);
    rows.push(item);
    added.push(item.row);
  }
  observerCallback?.([{ type: "childList", target: container, addedNodes: added }]);
}

await drain();
assert.equal(typeof observerCallback, "function", "expected the feed observer to attach");

const questions = Array.from({ length: 9 }, (_, i) => ({
  handle: `viewer-${i + 1}`,
  text: `unique question number ${i + 1} about a different topic`,
}));

for (const q of questions) {
  addRow(q.handle, q.text);
  await drain();
  rerenderAllRows();
  await drain();
}

assert.equal(
  rows[0].countLabel(),
  "",
  "re-rendering the list must not turn the first unique question into 'asked 9 times'"
);
assert.equal(
  rows[8].countLabel(),
  "",
  "a brand-new unique question must not show 'asked 2 times' after one re-render"
);

const original = addRow("alice", "the same prayer question");
await drain();
const copy = addRow("bob", "the same prayer question");
await drain();
assert.match(
  original.countLabel(),
  /2/,
  "two live copies from different people must still count as asked 2 times"
);
assert.equal(copy.classes.has("safwa-collapsed"), true, "the real second copy may collapse");
rerenderAllRows();
await drain();
const alice = rows.find((r) => r.handle === "alice");
assert.match(
  alice?.countLabel() ?? "",
  /2/,
  "a real asked-2 count must survive a list re-render without becoming 3+"
);
assert.doesNotMatch(
  alice?.countLabel() ?? "",
  /[3-9]/,
  "list re-render must not increment an already-counted question"
);

const hydrating = addRow("carol", "already counted prayer question");
await drain();
hydrating.replaceComment("", "");
observerCallback([{ type: "characterData", target: hydrating.textNode, addedNodes: [] }]);
await drain();
assert.equal(
  hydrating.countLabel(),
  "",
  "a blank recycled row must not keep a leftover count badge"
);

console.log("content.js recycled-row count inflation regression: PASS");
