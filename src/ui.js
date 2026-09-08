/*
 * ui.js - in-place annotation of StreamYard's comments (spec Section 10).
 * Browser-only (uses document). It NEVER reads StreamYard's structure: it only
 * decorates the exact comment node dom.js already located. All StreamYard
 * selector knowledge stays in config.js / dom.js.
 *
 * All visible text comes from CONFIG.LABELS (Dari), and badges render
 * right-to-left so Persian shows correctly. Confidence tiers (Section 10 + the
 * v1 human-in-the-loop rule):
 *   - Greeting             -> left untouched (a salutation, never a question).
 *   - Exact duplicate     -> collapse (hide) + count badge on the original, but
 *                            ONLY if AUTO_COLLAPSE_EXACT_DUPLICATES.
 *   - Fuzzy / near dup     -> marked + dimmed, NEVER hidden.
 *   - Continuation merge   -> "joined" badge, both fragments stay visible.
 *   - Extra (2nd) question -> marked + dimmed, NEVER hidden in v1.
 *
 * Hiding is reversible: collapsed rows keep their data in state and the popup
 * OFF switch restores StreamYard's full native feed. Fuzzy duplicates are still
 * never hidden (AUTO_HIDE_ANYTHING_AMBIGUOUS stays false).
 */

const ANNOTATED_ATTR = "data-safwa-annotated";
const COUNT_CLASS = "safwa-count";
const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const collapsedCopies = new Map();

// Hiding is safe only while another copy remains represented on screen.
export function revealOrphanedDuplicates(changedAnchor = null) {
  for (const [copy, anchor] of collapsedCopies) {
    if (!copy.isConnected || !anchor.isConnected || anchor === changedAnchor) {
      copy.classList.remove("safwa-collapsed");
      collapsedCopies.delete(copy);
    }
  }
}

function digits(n, persian) {
  return persian ? String(n).replace(/[0-9]/g, (d) => FA_DIGITS[d]) : String(n);
}

function ensureBadge(node, kind, text, dir) {
  if (!node) return null;
  let badge = node.querySelector(`.safwa-badge.safwa-badge--${kind}`);
  if (!badge) {
    badge = document.createElement("span");
    badge.className = `safwa-badge safwa-badge--${kind}`;
    node.appendChild(badge);
  }
  badge.setAttribute("dir", dir);
  badge.textContent = text;
  return badge;
}

function setCountBadge(originalNode, count, config) {
  if (!originalNode) return;
  let badge = originalNode.querySelector(`.${COUNT_CLASS}`);
  if (!badge) {
    badge = document.createElement("span");
    badge.className = `safwa-badge ${COUNT_CLASS}`;
    originalNode.appendChild(badge);
  }
  badge.setAttribute("dir", config.UI_DIRECTION);
  badge.textContent = config.LABELS.askedTimes.replace(
    "{n}",
    digits(count, config.USE_PERSIAN_DIGITS_IN_UI)
  );
}

function originalNodeOf(decision) {
  return decision.target?.firstComment?.el ?? null;
}

/**
 * Act on a pipeline decision. Always fail safe: missing node -> do nothing
 * (a throw is also caught upstream in content.js).
 */
export function render(decision, config) {
  const node = decision.comment?.el ?? null;
  if (!node) return;
  const dir = config.UI_DIRECTION;
  revealOrphanedDuplicates(node);
  collapsedCopies.delete(node);

  // Idempotency: a row can be re-annotated after a container re-render, and its
  // new decision may differ (state was rebuilt). Clear previous annotations so a
  // stale class (especially safwa-collapsed) can never hide a now-kept question.
  node.classList.remove("safwa-primary", "safwa-joined", "safwa-dim", "safwa-collapsed");
  for (const b of node.querySelectorAll(".safwa-badge")) b.remove();

  switch (decision.type) {
    case "greeting":
      // A pure greeting/honorific. Not a question: leave the row exactly as
      // StreamYard drew it. No badge, no dim, no hide.
      break;

    case "primary":
      node.classList.add("safwa-primary");
      break;

    case "continuation":
      node.classList.add("safwa-joined");
      ensureBadge(node, "joined", config.LABELS.joined, dir);
      break;

    case "duplicate": {
      const original = originalNodeOf(decision);

      // Cost-asymmetry guard: if the original row is gone from the DOM
      // (virtualized scroll or a re-render pruned it), or this row IS the
      // representative already, it is the only visible copy of the question.
      // Never hide it; adopt it so the count badge lands somewhere visible.
      if (!original || original === node || !original.isConnected) {
        if (decision.target?.firstComment) decision.target.firstComment.el = node;
        setCountBadge(node, decision.count, config);
        break;
      }

      setCountBadge(original, decision.count, config);
      const isExact = decision.kind === "exact";
      if (isExact && config.AUTO_COLLAPSE_EXACT_DUPLICATES && !config.AUTO_HIDE_ANYTHING_AMBIGUOUS) {
        node.classList.add("safwa-collapsed"); // data retained in state; only hidden
        collapsedCopies.set(node, original);
      } else {
        node.classList.add("safwa-dim");
        ensureBadge(node, "dup", config.LABELS.possibleDuplicate, dir);
      }
      break;
    }

    case "extra": {
      // In v1, HIDE_EXTRA_QUESTIONS stays false: every flagged extra remains
      // visible, dimmed and badged because it might be a missed continuation.
      // The window guard remains as defense in depth if that flag changes later.
      const keepVisible =
        !config.HIDE_EXTRA_QUESTIONS ||
        (config.DIM_IN_WINDOW_EXTRAS && decision.withinWindow);
      if (keepVisible) {
        node.classList.add("safwa-dim");
        ensureBadge(node, "extra", config.LABELS.secondQuestion, dir);
      } else {
        // Filter it out of the feed entirely. Data is retained in state; the
        // popup OFF switch reveals StreamYard's full native feed again.
        node.classList.add("safwa-collapsed");
      }
      break;
    }

    default:
      break;
  }

  node.setAttribute(ANNOTATED_ATTR, decision.type);
}
