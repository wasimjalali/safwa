/*
 * Safety regression for the v1 human-in-the-loop invariant. A flagged extra
 * question may be wrong, so it must remain visible and be marked, never hidden.
 */

import assert from "node:assert/strict";

import { CONFIG } from "../src/config.js";
import { render } from "../src/ui.js";

const classes = new Set();
const badges = [];
const attributes = new Map();

const node = {
  classList: {
    add: (...names) => names.forEach((name) => classes.add(name)),
    remove: (...names) => names.forEach((name) => classes.delete(name)),
  },
  appendChild: (badge) => badges.push(badge),
  querySelector: () => null,
  querySelectorAll: (selector) => (selector === ".safwa-badge" ? [...badges] : []),
  setAttribute: (name, value) => attributes.set(name, value),
};

globalThis.document = {
  createElement() {
    return {
      className: "",
      textContent: "",
      setAttribute() {},
      remove() {},
    };
  },
};

render(
  {
    type: "extra",
    withinWindow: false,
    comment: { el: node },
  },
  CONFIG
);

assert.equal(
  classes.has("safwa-collapsed"),
  false,
  "expected a flagged extra question to remain visible"
);
assert.equal(classes.has("safwa-dim"), true, "expected the extra question to be dimmed");
assert.equal(badges.length, 1, "expected the extra-question badge to be present");

console.log("ui.js human-in-the-loop safety regression: PASS");
