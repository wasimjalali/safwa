/*
 * panel-render-test.js - exercises the sidebar renderer against a minimal
 * fake DOM. This harness exists because the renderer path previously shipped
 * a call to an undefined helper and no test could see it (it never renders
 * outside a browser). It asserts the row anatomy renders and the platform
 * icon element is produced for every measured platform.
 */

import assert from "node:assert/strict";

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

function element(tag = "div") {
  const el = {
    tagName: String(tag).toUpperCase(),
    children: [],
    attributes: {},
    dataset: {},
    style: {},
    className: "",
    textContent: "",
    innerHTML: "",
    hidden: false,
    disabled: false,
    title: "",
    dir: "",
    scrollTop: 0,
    scrollHeight: 0,
    clientHeight: 0,
    classList: {
      _set: new Set(),
      add(...c) { c.forEach((x) => this._set.add(x)); },
      remove(...c) { c.forEach((x) => this._set.delete(x)); },
      toggle(c, on) { if (on === undefined ? this._set.has(c) : !on) this._set.delete(c); else this._set.add(c); },
      contains(c) { return this._set.has(c); },
    },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k] ?? null; },
    removeAttribute(k) { delete this.attributes[k]; },
    addEventListener() {},
    append(...nodes) { this.children.push(...nodes); },
    appendChild(node) { this.children.push(node); return node; },
    replaceChildren(...nodes) { this.children = nodes; },
    replaceWith() {},
    remove() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    scrollTo() {},
  };
  return el;
}

globalThis.document = {
  documentElement: element("html"),
  getElementById: () => element(),
  querySelector: () => element(),
  createElement: (tag) => element(tag),
  createDocumentFragment: () => element("fragment"),
};

globalThis.chrome = {
  runtime: { getManifest: () => ({ version: "2.0.0" }), sendMessage() {} },
  tabs: {
    query: async () => [],
    connect: () => ({ postMessage() {}, onMessage: { addListener() {} }, onDisconnect: { addListener() {} }, disconnect() {} }),
    onActivated: { addListener() {} },
    onUpdated: { addListener() {} },
  },
  windows: { onFocusChanged: { addListener() {} } },
  storage: {
    local: { get: async () => ({}), set() {} },
    onChanged: { addListener() {} },
  },
};

const { renderRow } = await import(`../panel/panel.js?render-test=${Date.now()}`);

function walk(node, out = []) {
  out.push(node);
  for (const child of node.children ?? []) walk(child, out);
  return out;
}

const row = {
  rowId: "src_1",
  kind: "question",
  primary: {
    sourceId: "src_1",
    handle: "@iamwasim.jalali",
    platform: "youtube",
    platformLabel: "Youtube",
    displayText: "سلام استاد، آیا نماز در سفر قصر خوانده می‌شود؟",
    avatarUrl: "",
    createdAt: null,
    admittedAt: 1000,
  },
  badges: { count: 2, countLabel: "2 بار پرسیده شد" },
  members: [
    { sourceId: "src_1", handle: "@iamwasim.jalali", displayText: "سلام استاد" },
    { sourceId: "src_2", handle: "@hanna", displayText: "سلام استاد" },
  ],
  feature: { available: true, reasonCode: null, labelKey: "featureShow" },
  shown: "unknown",
  starred: "unknown",
};

check("renderRow renders without throwing and carries the row id", () => {
  const el = renderRow(row);
  assert.ok(el.className.includes("row"));
  assert.equal(el.dataset.rowId, "src_1");
});

check("the platform icon element is produced (undefined-helper regression)", () => {
  const el = renderRow(row);
  const icons = walk(el).filter(
    (n) => typeof n.className === "string" && n.className.includes("platform-icon")
  );
  assert.equal(icons.length, 1, "exactly one platform icon per row");
  assert.match(icons[0].innerHTML, /<svg/, "icon markup survives");
  assert.equal(icons[0].getAttribute("aria-label"), "Youtube");
});

check("avatar fallback uses the handle initial", () => {
  const el = renderRow(row);
  const initials = walk(el).filter(
    (n) => typeof n.className === "string" && n.className.includes("row__avatar--fallback")
  );
  assert.equal(initials.length, 1);
  assert.equal(initials[0].textContent, "i");
});

check("duplicate members render a reachable disclosure", () => {
  const el = renderRow(row);
  const text = walk(el).map((n) => n.textContent).join(" | ");
  assert.ok(text.includes("@hanna"), "second member is listed");
  const summaries = walk(el).some(
    (n) => typeof n.className === "string" && n.className.includes("folded")
  );
  assert.ok(summaries, "folded disclosure exists");
});

check("a row without members renders no disclosure", () => {
  const el = renderRow({ ...row, members: undefined, badges: {} });
  const foldeds = walk(el).filter(
    (n) => typeof n.className === "string" && n.className.includes("folded")
  );
  assert.equal(foldeds.length, 0);
});

console.log(`panel-render tests: ${passed} passed, ${failed} failed`);
// panel.js starts a health interval; exit explicitly so the harness exits.
process.exit(failed > 0 ? 1 : 0);
