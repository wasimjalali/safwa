/*
 * native-restore-test.js — leftover v1 marks must leave the native feed.
 * v2 never paints StreamYard; this only strips marks a previous build left.
 */

import assert from "node:assert/strict";
import {
  hasLegacyMarks,
  restoreRow,
  LEGACY_NATIVE_CLASSES,
} from "../src/native-restore.js";

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

function fakeNode({ classes = [], attrs = {}, children = [] } = {}) {
  const classSet = new Set(classes);
  const attrMap = { ...attrs };
  const node = {
    classList: {
      contains: (name) => classSet.has(name),
      remove: (...names) => names.forEach((name) => classSet.delete(name)),
    },
    hasAttribute: (name) => Object.prototype.hasOwnProperty.call(attrMap, name),
    removeAttribute: (name) => {
      delete attrMap[name];
    },
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] ?? null;
    },
    querySelectorAll(sel) {
      if (sel === ".safwa-badge") return children.filter((c) => c.isBadge);
      return children.filter((c) => c.matches?.(sel));
    },
    _classes: classSet,
    _attrs: attrMap,
    _children: children,
  };
  return node;
}

check("a clean StreamYard row is left untouched", () => {
  const node = fakeNode();
  assert.equal(hasLegacyMarks(node), false);
  assert.equal(restoreRow(node), false);
});

check("v1 dim/collapse classes and badges are stripped", () => {
  const badge = {
    isBadge: true,
    removed: false,
    remove() {
      this.removed = true;
    },
  };
  const node = fakeNode({
    classes: ["safwa-dim", "safwa-collapsed", "VirtualScroller__ScrollItemWrapper"],
    attrs: { "data-safwa-annotated": "duplicate" },
    children: [badge],
  });
  assert.equal(hasLegacyMarks(node), true);
  assert.equal(restoreRow(node), true);
  assert.equal(node._classes.has("safwa-dim"), false);
  assert.equal(node._classes.has("safwa-collapsed"), false);
  assert.equal(node._classes.has("VirtualScroller__ScrollItemWrapper"), true);
  assert.equal(node.hasAttribute("data-safwa-annotated"), false);
  assert.equal(badge.removed, true);
});

check("legacy class list is the v1 paint set only", () => {
  for (const name of [
    "safwa-primary",
    "safwa-joined",
    "safwa-dim",
    "safwa-collapsed",
    "safwa-collapse-hide",
    "safwa-card",
  ]) {
    assert.ok(LEGACY_NATIVE_CLASSES.includes(name), name);
  }
});

console.log(`native-restore tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
