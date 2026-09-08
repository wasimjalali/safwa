/*
 * ui.js - in-place annotation of StreamYard's comments (spec Section 10).
 * Browser-only (uses document). It NEVER reads StreamYard's structure: it only
 * decorates the exact comment node dom.js already located. All StreamYard
 * selector knowledge stays in config.js / dom.js.
 *
 * All visible text comes from CONFIG.LABELS (Dari), and badges render
 * right-to-left so Persian shows correctly. Confidence tiers:
 *   - Greeting             -> left untouched (a salutation, never a question).
 *   - Exact / token-set / LLM-confirmed duplicate -> collapse (hide) + count
 *                            badge on the original.
 *   - Fuzzy / near dup     -> marked + dimmed until the LLM confirms (then hide).
 *   - Continuation merge   -> "joined" badge, both fragments stay visible.
 *   - Extra (2nd) question -> dimmed + badged until the LLM confirms extra,
 *                            then hidden with no badge. Timeout keeps it visible.
 *
 * Hiding is reversible: collapsed rows keep their data in state and the popup
 * OFF switch restores StreamYard's full native feed. Ambiguous extras/fuzzies
 * are not hidden until the LLM confirms (AUTO_HIDE_ANYTHING_AMBIGUOUS stays false).
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

function isCollapsedAnchor(node) {
  const cl = node?.classList;
  return typeof cl?.contains === "function" && cl.contains("safwa-collapsed");
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

      // Cost-asymmetry guard: if the original row is gone, hidden, or this row
      // IS the representative, it is the only visible copy. Never hide it.
      if (!original || original === node || !original.isConnected || isCollapsedAnchor(original)) {
        if (decision.target?.firstComment) decision.target.firstComment.el = node;
        setCountBadge(node, decision.count, config);
        break;
      }

      setCountBadge(original, decision.count, config);
      const hideDup =
        (decision.kind === "exact" || decision.kind === "semantic") &&
        config.AUTO_COLLAPSE_EXACT_DUPLICATES &&
        !config.AUTO_HIDE_ANYTHING_AMBIGUOUS;
      if (hideDup) {
        node.classList.add("safwa-collapsed");
        collapsedCopies.set(node, original);
      } else {
        node.classList.add("safwa-dim");
        ensureBadge(node, "dup", config.LABELS.possibleDuplicate, dir);
      }
      break;
    }

    case "extra": {
      // Regex extras stay visible (dim + badge) until the LLM confirms they
      // are a genuine second question. Confirmed extras are hidden with no badge.
      // Timeout leaves the dimmed row in place so a missed continuation is not
      // deleted.
      if (decision.hide) {
        node.classList.add("safwa-collapsed");
      } else {
        node.classList.add("safwa-dim");
        ensureBadge(node, "extra", config.LABELS.secondQuestion, dir);
      }
      break;
    }

    default:
      break;
  }

  node.setAttribute(ANNOTATED_ATTR, decision.type);
}
