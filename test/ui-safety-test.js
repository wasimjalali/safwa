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

const hiddenClasses = new Set();
const hiddenBadges = [];
const hiddenNode = {
  classList: {
    add: (...names) => names.forEach((name) => hiddenClasses.add(name)),
    remove: (...names) => names.forEach((name) => hiddenClasses.delete(name)),
  },
  appendChild: (badge) => hiddenBadges.push(badge),
  querySelector: () => null,
  querySelectorAll: (selector) => (selector === ".safwa-badge" ? [...hiddenBadges] : []),
  setAttribute: () => {},
};
render(
  {
    type: "extra",
    hide: true,
    comment: { el: hiddenNode },
  },
  CONFIG
);
assert.equal(hiddenClasses.has("safwa-collapsed"), true, "expected a confirmed extra to be hidden");
assert.equal(hiddenBadges.length, 0, "expected no second-question badge on a hidden extra");

console.log("ui.js human-in-the-loop safety regression: PASS");
