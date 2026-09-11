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
const STATE_CLASSES = [
  "safwa-primary",
  "safwa-joined",
  "safwa-dim",
  "safwa-collapsed",
  "safwa-collapse-hide",
];
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

/** Badges live on the comment card (cardEl), never on the scroller slot. */
function anchorOf(comment) {
  const node = comment?.el ?? null;
  const card = comment?.cardEl ?? null;
  return card && card !== node ? card : node;
}

/** Remove every annotation this extension may have put on a row. */
function clearAnnotations(node) {
  if (!node) return;
  node.classList?.remove?.(...STATE_CLASSES);
  if (typeof node.querySelectorAll !== "function") return;
  for (const badge of node.querySelectorAll(".safwa-badge")) badge.remove?.();
  for (const card of node.querySelectorAll(".safwa-card")) card.classList?.remove?.("safwa-joined");
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
  const card = anchorOf(decision.comment);
  revealOrphanedDuplicates(node);
  collapsedCopies.delete(node);

  // Idempotency: a row can be re-annotated after a container re-render, and its
  // new decision may differ (state was rebuilt). Clear previous annotations so a
  // stale class (especially safwa-collapsed) can never hide a now-kept question.
  clearAnnotations(node);
  card?.classList?.add?.("safwa-card");

  const stateClasses = [];
  const collapse = () => {
    stateClasses.push("safwa-collapsed");
    if (config.COLLAPSE_MODE === "hide") stateClasses.push("safwa-collapse-hide");
  };

  switch (decision.type) {
    case "greeting":
      // Regex-certain greetings fold when the teacher toggle is on. A courtesy
      // maybe stays visible until the LLM confirms (never hide a maybe).
      if (decision.hide && config.HIDE_GREETINGS !== false) collapse();
      break;

    case "primary":
      stateClasses.push("safwa-primary");
      if (decision.count > 1) setCountBadge(card, decision.count, config);
      break;

    case "continuation":
      stateClasses.push("safwa-joined");
      if (card !== node) card.classList?.add?.("safwa-joined");
      ensureBadge(card, "joined", config.LABELS.joined, dir);
      break;

    case "duplicate": {
      const originalComment = decision.target?.firstComment ?? null;
      const original = originalComment?.el ?? null;

      // Cost-asymmetry guard: if the original row is gone, folded, or this row
      // IS the representative, it is the only visible copy. Never fold it.
      if (!original || original === node || !original.isConnected || isCollapsedAnchor(original)) {
        if (originalComment) {
          originalComment.el = node;
          originalComment.cardEl = card;
        }
        setCountBadge(card, decision.count, config);
        break;
      }

      setCountBadge(anchorOf(originalComment), decision.count, config);
      const hideDup =
        (decision.kind === "exact" || decision.kind === "semantic") &&
        config.AUTO_COLLAPSE_EXACT_DUPLICATES &&
        !config.AUTO_HIDE_ANYTHING_AMBIGUOUS;
      if (hideDup) {
        collapse();
        collapsedCopies.set(node, original);
      } else {
        stateClasses.push("safwa-dim");
        ensureBadge(card, "dup", config.LABELS.possibleDuplicate, dir);
      }
      break;
    }

    case "extra": {
      // Regex extras stay visible (dim + badge) until the LLM confirms they
      // are a genuine second question. Confirmed extras fold to a ghost and
      // keep no badge. Timeout leaves the dimmed row in place so a missed
      // continuation is not lost.
      if (decision.hide && config.HIDE_CONFIRMED_EXTRAS !== false) {
        collapse();
      } else {
        stateClasses.push("safwa-dim");
        ensureBadge(card, "extra", config.LABELS.secondQuestion, dir);
      }
      break;
    }

    default:
      break;
  }

  if (stateClasses.length) node.classList.add(...stateClasses);
  node.setAttribute(ANNOTATED_ATTR, decision.type);
}
