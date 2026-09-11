/*
 * native-restore.js - strip leftover v1 paint from StreamYard's own list.
 * Pure duck-typed DOM: no selectors, no chrome.*, Node-testable.
 *
 * v2 never writes these marks. A previous unpacked build, or a second Ṣafwa
 * still enabled, can leave them. Restoring the native row is the only write
 * besides the validated feature click.
 */

export const LEGACY_NATIVE_CLASSES = [
  "safwa-primary",
  "safwa-joined",
  "safwa-dim",
  "safwa-collapsed",
  "safwa-collapse-hide",
  "safwa-card",
];

const LEGACY_ATTRS = ["data-safwa-annotated", "data-safwa-seen", "data-safwa-llm"];

function classContains(el, name) {
  return typeof el?.classList?.contains === "function" && el.classList.contains(name);
}

export function hasLegacyMarks(node) {
  if (!node) return false;
  if (LEGACY_NATIVE_CLASSES.some((name) => classContains(node, name))) return true;
  if (LEGACY_ATTRS.some((name) => node.hasAttribute?.(name))) return true;
  if (typeof node.querySelector !== "function") return false;
  return !!(
    node.querySelector(".safwa-badge") ||
    node.querySelector(".safwa-dim, .safwa-collapsed, .safwa-card") ||
    node.querySelector("[data-safwa-annotated], [data-safwa-seen], [data-safwa-llm]")
  );
}

function stripMarks(el) {
  if (!el) return false;
  let changed = false;
  if (typeof el.classList?.remove === "function") {
    for (const name of LEGACY_NATIVE_CLASSES) {
      if (classContains(el, name)) {
        el.classList.remove(name);
        changed = true;
      }
    }
  }
  for (const name of LEGACY_ATTRS) {
    if (el.hasAttribute?.(name)) {
      el.removeAttribute(name);
      changed = true;
    }
  }
  return changed;
}

/** Remove leftover v1 classes, attrs, and badges from one row. */
export function restoreRow(node) {
  if (!node) return false;
  let changed = stripMarks(node);
  if (typeof node.querySelectorAll !== "function") return changed;
  for (const badge of node.querySelectorAll(".safwa-badge")) {
    badge.remove?.();
    changed = true;
  }
  for (const marked of node.querySelectorAll(
    ".safwa-card, .safwa-dim, .safwa-collapsed, .safwa-collapse-hide, [data-safwa-annotated], [data-safwa-seen], [data-safwa-llm]"
  )) {
    if (stripMarks(marked)) changed = true;
  }
  return changed;
}

/** Sweep a comments container (or any root) for leftover v1 paint. */
export function restoreFeed(root, collectRows) {
  if (!root) return 0;
  let n = 0;
  const rows =
    typeof collectRows === "function"
      ? collectRows(root)
      : typeof root.querySelectorAll === "function"
        ? [root]
        : [];
  const list = rows.length ? rows : [root];
  for (const node of list) {
    if (hasLegacyMarks(node) && restoreRow(node)) n += 1;
  }
  if (root !== list[0] && hasLegacyMarks(root) && restoreRow(root)) n += 1;
  return n;
}
