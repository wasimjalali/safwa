/*
 * dom.js - the ONLY fragile layer. Everything StreamYard-specific about reading
 * the page lives here (and the selector strings in config.js). Nothing else in
 * the codebase touches StreamYard's HTML. Spec Sections 4 (Risk 3) and 12.
 *
 * Browser-only module: it uses `document`. It is never imported by the matching
 * core or the Node tests. If selectors stop matching, every function here fails
 * safe (returns null / empty and logs a single clear warning) so the native
 * feed is left untouched.
 */

import { SELECTORS } from "./config.js";

const TAG = "[Ṣafwa]";

// Warn at most once per failure kind so a broken selector cannot spam the
// console hundreds of times under live comment volume.
const warnedOnce = new Set();
function warnOnce(key, message) {
  if (warnedOnce.has(key)) return;
  warnedOnce.add(key);
  console.warn(`${TAG} ${message}`);
}

/** True only when the operator has verified the selectors on a live studio. */
export function selectorsConfirmed() {
  return SELECTORS.CONFIRMED === true;
}

/**
 * Find the element that contains all comments.
 *
 * With the comma-separated container selector, several elements can match
 * (e.g. both a wrapper and the real list). A candidate that already holds
 * comment rows is always preferred over a bare match, so the observer never
 * settles on an empty wrapper that will never see a comment.
 *
 * With `requireRows`, return null unless a candidate holds rows: boot uses
 * this while polling, so a page that matches the container selector but has
 * not rendered its first comment yet does not get latched onto prematurely.
 *
 * Returns null and warns once if nothing matches at all (StreamYard changed,
 * or wrong page).
 */
export function findCommentContainer(root = document, { requireRows = false } = {}) {
  const candidates = Array.from(root.querySelectorAll(SELECTORS.commentContainer));
  if (candidates.length === 0) {
    warnOnce(
      "container",
      `comments container not found (yet?). Doing nothing (fail-safe). If this ` +
        `persists with the comments panel open, update SELECTORS in config.js.`
    );
    return null;
  }
  const withRows = candidates.find((c) => c.querySelector(SELECTORS.commentNode));
  if (withRows) return withRows;
  return requireRows ? null : candidates[0];
}

/** Get every comment node currently in the container (for the initial scan). */
export function collectCommentNodes(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(SELECTORS.commentNode));
}

/**
 * Given any node added to the DOM, return the comment row it belongs to (or
 * null). Handles both "the comment node itself was added" and "a child of it
 * was added" cases that a MutationObserver can surface.
 */
export function closestCommentNode(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return null;
  if (node.matches?.(SELECTORS.commentNode)) return node;
  return node.closest?.(SELECTORS.commentNode) ?? null;
}

/**
 * Comment rows nested INSIDE an added node. Covers the batch case a
 * MutationObserver surfaces as one wrapper element containing several comment
 * rows (virtualized lists and re-renders do this); closestCommentNode alone
 * would miss all of them.
 */
export function commentNodesWithin(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return [];
  return Array.from(node.querySelectorAll(SELECTORS.commentNode));
}

function readText(el) {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Read a platform label (youtube / facebook / ...) from a comment node, or null
 * if StreamYard renders no indicator. Tries an alt/title/aria-label first
 * (icons), then falls back to text content.
 */
function extractPlatform(commentNode) {
  const el = commentNode.querySelector(SELECTORS.platformIndicator);
  if (!el) return null;
  const label =
    el.getAttribute?.("alt") ||
    el.getAttribute?.("title") ||
    el.getAttribute?.("aria-label") ||
    readText(el);
  const cleaned = (label || "").toLowerCase().trim();
  return cleaned.length ? cleaned : null;
}

/**
 * Extract one comment from a comment node into the plain object the matching
 * core expects: { handle, platform, displayText, timestamp, el }.
 *
 * Returns null if the row has no handle or no text (can't be processed safely).
 * `timestamp` is arrival time (Date.now) because StreamYard exposes no reliable
 * per-comment time; the core only ever compares timestamps, never parses them.
 */
/**
 * The row (li.VirtualScroller__ScrollItemWrapper) is the virtual scroller's
 * slot, not the visible comment card inside it. Absolute-positioned badges must
 * anchor to the card: against the slot they float under the card or get covered
 * by the next row. Walk from the text element up to the row's top-level child
 * that contains it - no extra selectors, no assumptions about card classes.
 */
function topChildContaining(commentNode, el) {
  let cur = el;
  while (cur?.parentElement && cur.parentElement !== commentNode) cur = cur.parentElement;
  return cur?.parentElement === commentNode ? cur : null;
}

/** The inner card element badges anchor to (fallback: the row itself). */
export function cardAnchor(commentNode) {
  if (!commentNode) return null;
  const textEl = commentNode.querySelector?.(SELECTORS.text) ?? null;
  return topChildContaining(commentNode, textEl) ?? commentNode;
}

/**
 * The viewer avatar image (distinct from the platform indicator icon). Returns
 * an https URL or "" — a missing avatar must never invalidate the comment.
 */
export function extractAvatar(commentNode) {
  try {
    const img = commentNode?.querySelector?.(SELECTORS.profileAvatar);
    const src = img?.getAttribute?.("src") ?? img?.src ?? "";
    const parsed = new URL(src);
    if (parsed.protocol !== "https:") return "";
    if (parsed.username || parsed.password) return "";
    return src;
  } catch {
    return "";
  }
}

/** The native "show on broadcast" control inside a validated row, or null. */
export function findShowButton(commentNode) {
  try {
    const buttons = commentNode?.querySelectorAll?.(SELECTORS.showCommentButton);
    if (!buttons || buttons.length !== 1) return null; // exactly one, or refuse
    return buttons[0];
  } catch {
    return null;
  }
}

/**
 * Click the native feature control. Returns true only when a single enabled
 * button belonging to this row was clicked. Callers MUST have re-validated the
 * row immediately before calling; nothing here guesses.
 */
export function clickShowButton(commentNode) {
  const button = findShowButton(commentNode);
  if (!button || button.disabled) return false;
  try {
    button.click();
    return true;
  } catch {
    return false;
  }
}

export function extractComment(commentNode) {
  if (!commentNode) return null;

  const handleEl = commentNode.querySelector(SELECTORS.authorHandle);
  const textEl = commentNode.querySelector(SELECTORS.text);

  const handle = readText(handleEl);
  const displayText = readText(textEl);

  if (!handle || !displayText) {
    // Blank virtual-scroller placeholders have no author/text nodes. Only warn
    // when the row already shows comment text we cannot parse — that is the
    // stale-selector case, not an incoming empty row.
    const raw = readText(commentNode);
    if (raw.length > 20) {
      warnOnce(
        "fields",
        `found comment node(s) but could not read handle or text. Author/text ` +
          `selectors are likely stale. Update SELECTORS in config.js.`
      );
    }
    return null;
  }

  return {
    handle,
    platform: extractPlatform(commentNode),
    displayText,
    avatar: extractAvatar(commentNode),
    timestamp: Date.now(),
    el: commentNode,
    cardEl: topChildContaining(commentNode, textEl) ?? commentNode,
  };
}
