/*
 * content.js - the entry point (spec Section 13). Registered as the content
 * script in manifest.json. It is a classic script that dynamically imports the
 * ES-module core (config / dom / state / grouping / ui), then wires up the
 * MutationObserver and the processing pipeline:
 *
 *     dom.extractComment  ->  grouping.processComment  ->  ui.render
 *
 * Everything here fails safe. If we are not on a studio, if selectors are
 * unconfirmed, or if the comments container never appears, the extension does
 * nothing visible and logs one clear [Ṣafwa] line. It never corrupts the feed.
 */
(function () {
  "use strict";

  const TAG = "[Ṣafwa]";
  const VERSION = chrome.runtime?.getManifest?.().version ?? "?";

  // Process detected comments in small debounced batches so a burst of comments
  // can't thrash layout (spec Risk 4).
  const DEBOUNCE_MS = 80;
  // How long to wait for the comments panel to appear before giving up.
  const CONTAINER_POLL_MS = 1000;
  const CONTAINER_POLL_MAX = 30;
  // How often to check that the observed container is still in the DOM.
  // StreamYard is a SPA: a re-render can replace the comments panel wholesale,
  // which silently kills the MutationObserver. The watchdog notices and re-attaches.
  const CONTAINER_RECHECK_MS = 3000;
  // Marks comment nodes we've already handled so we never reprocess them.
  const SEEN_ATTR = "data-safwa-seen";
  // Marks comment nodes that the LLM re-classified as semantic duplicates.
  const ANNOTATED_ATTR_LLM = "data-safwa-llm";

  if (!/(^|\.)streamyard\.com$/.test(location.host)) {
    console.warn(`${TAG} not a streamyard.com host (${location.host}); doing nothing.`);
    return;
  }

  console.log(`${TAG} content script loaded (v${VERSION}) on ${location.host}${location.pathname}`);

  const url = (p) => chrome.runtime.getURL(p);

  // Dynamically import the ESM core. Extension-origin URLs bypass the page CSP
  // and are declared in web_accessible_resources.
  Promise.all([
    import(url("src/config.js")),
    import(url("src/dom.js")),
    import(url("src/state.js")),
    import(url("src/grouping.js")),
    import(url("src/ui.js")),
    import(url("src/llm-classifier.js")),
  ])
    .then(([configMod, dom, stateMod, grouping, ui, llm]) => {
      wireEnabledToggle(configMod.STORAGE_KEYS);
      boot(configMod.CONFIG, dom, stateMod, grouping, ui, llm);
    })
    .catch((err) => {
      console.warn(`${TAG} failed to load modules; doing nothing (fail-safe).`, err);
    });

  /*
   * The popup's on/off switch. Off is purely VISUAL: styles.css gates every
   * annotation on html:not(.safwa-disabled), so flipping the class restores
   * StreamYard's native feed instantly without touching its own styles. The
   * matching pipeline keeps running underneath, which means no comment is ever
   * missed while off and switching back on restores every annotation intact.
   */
  function wireEnabledToggle(STORAGE_KEYS) {
    const apply = (enabled) => {
      document.documentElement.classList.toggle("safwa-disabled", enabled === false);
    };
    try {
      chrome.storage.local
        .get(STORAGE_KEYS.enabled)
        .then((items) => {
          apply(items[STORAGE_KEYS.enabled] !== false); // default: enabled
        })
        .catch((err) => {
          console.warn(`${TAG} could not read the on/off state; staying enabled.`, err);
        });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local" || !(STORAGE_KEYS.enabled in changes)) return;
        const enabled = changes[STORAGE_KEYS.enabled].newValue !== false;
        apply(enabled);
        console.log(`${TAG} filter ${enabled ? "enabled" : "disabled"} from the popup.`);
      });
    } catch (err) {
      // No storage (e.g. permission missing): fail safe toward enabled.
      console.warn(`${TAG} storage unavailable; the filter stays enabled.`, err);
    }
  }

  function boot(CONFIG, dom, stateMod, grouping, ui, llm) {
    if (!dom.selectorsConfirmed()) {
      console.warn(
        `${TAG} StreamYard selectors are unconfirmed (SELECTORS.CONFIRMED is false ` +
          `in src/config.js). Live DOM wiring is DISABLED so a wrong guess can't ` +
          `touch the feed. Confirm selectors on a live studio (spec Section 12), ` +
          `then set CONFIRMED: true. The matching core is already proven via npm test.`
      );
      return;
    }

    let state = stateMod.createState();
    const pending = new Set();
    let scheduled = false;

    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(flush, DEBOUNCE_MS);
    };

    const flush = () => {
      scheduled = false;
      const nodes = [...pending];
      pending.clear();
      for (const node of nodes) {
        try {
          if (!node.isConnected || node.getAttribute(SEEN_ATTR)) continue;
          const comment = dom.extractComment(node);
          if (!comment) continue; // couldn't read it; leave the node untouched
          node.setAttribute(SEEN_ATTR, "1");
          const decision = grouping.processComment(comment, state, CONFIG);
          ui.render(decision, CONFIG);

          // Combo architecture: if the regex pipeline flagged this as needing
          // LLM review, asynchronously ask the self-hosted LLM whether it's a
          // semantic duplicate. If the LLM says "duplicate", re-annotate the
          // node as a semantic duplicate (dimmed + badged, never hidden). If the
          // LLM is unreachable or says "primary", the regex decision stands.
          if (decision.needsLlmReview && CONFIG.LLM_ENABLED) {
            llmReview(node, comment, decision, CONFIG, llm);
          }
        } catch (err) {
          // One bad node must never break the rest of the feed.
          console.warn(`${TAG} error processing a comment; skipping it.`, err);
        }
      }
    };

    /*
     * Asynchronously ask the LLM if this comment is a semantic duplicate of
     * something already in the feed. This runs AFTER the regex pipeline has
     * already rendered its decision, so the feed is never blocked. If the LLM
     * says "duplicate", we re-annotate the node (dim + badge). If it says
     * "primary" or is unreachable, the regex annotation stays as-is.
     *
     * The node may have been removed from the DOM by the time the LLM responds
     * (StreamYard re-render, virtualized scroll). We check isConnected before
     * touching it.
     */
    function llmReview(node, comment, decision, CONFIG, llm) {
      llm
        .classifyComment(comment, decision.recentQuestions, CONFIG)
        .then((result) => {
          if (!result) return; // LLM unavailable or parse failure; regex stands
          if (result.classification !== "duplicate") return; // LLM says primary

          // LLM says this is a semantic duplicate. Re-annotate: dim + badge,
          // never hide. Only the regex pipeline's exact match can auto-collapse.
          if (!node.isConnected) return; // node left the DOM while we waited
          node.classList.remove("safwa-primary");
          node.classList.add("safwa-dim");
          const dir = CONFIG.UI_DIRECTION;
          let badge = node.querySelector(".safwa-badge.safwa-badge--semantic");
          if (!badge) {
            badge = document.createElement("span");
            badge.className = "safwa-badge safwa-badge--semantic";
            node.appendChild(badge);
          }
          badge.setAttribute("dir", dir);
          badge.textContent = CONFIG.LABELS.semanticDuplicate;
          node.setAttribute(ANNOTATED_ATTR_LLM, "semantic_duplicate");
          console.log(`${TAG} LLM flagged a semantic duplicate.`);
        })
        .catch(() => {
          // Silent: the regex decision already stands. No need to warn.
        });
    }

    const attach = (container) => {
      console.log(`${TAG} comments container found; observing for new comments.`);

      // Seed state from comments already on screen, then watch for new ones.
      // Clearing the seen-marker matters on RE-attach (after a container
      // replacement): rows that survived the re-render must be reprocessed into
      // the fresh state, and ui.render is idempotent so that is safe.
      for (const node of dom.collectCommentNodes(container)) {
        node.removeAttribute(SEEN_ATTR);
        pending.add(node);
      }
      schedule();

      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const added of m.addedNodes) {
            // The added node may BE a comment row, sit INSIDE one, or be a
            // wrapper CONTAINING several rows (batch renders do this).
            const node = dom.closestCommentNode(added);
            if (node) {
              pending.add(node);
            } else {
              for (const inner of dom.commentNodesWithin(added)) pending.add(inner);
            }
          }
        }
        schedule();
      });
      observer.observe(container, { childList: true, subtree: true });

      // Watchdog: if a StreamYard re-render replaces the panel, the observer
      // goes silent forever. Detect it, reset to a fresh state, and re-scan the
      // new panel from scratch (the old annotations died with the old nodes).
      const watchdog = setInterval(() => {
        if (container.isConnected) return;
        clearInterval(watchdog);
        observer.disconnect();
        pending.clear();
        state = stateMod.createState();
        console.warn(`${TAG} comments container left the DOM (StreamYard re-render); re-attaching.`);
        attempts = 0;
        tryFind();
      }, CONTAINER_RECHECK_MS);
    };

    // The comments panel can mount after the page settles, so poll briefly.
    // Early polls REQUIRE a container that already holds comment rows, so we
    // don't latch onto an empty wrapper that matches the container selector by
    // accident. After most of the budget is spent, accept a bare match as a
    // last resort: watching it is never worse than giving up.
    let attempts = 0;
    const ROWS_REQUIRED_UNTIL = Math.floor(CONTAINER_POLL_MAX * 0.7);
    const tryFind = () => {
      const requireRows = attempts < ROWS_REQUIRED_UNTIL;
      const container = dom.findCommentContainer(document, { requireRows });
      if (container) {
        attach(container);
        return;
      }
      if (++attempts < CONTAINER_POLL_MAX) {
        setTimeout(tryFind, CONTAINER_POLL_MS);
      } else {
        console.warn(
          `${TAG} comments container not found after ${CONTAINER_POLL_MAX} tries; ` +
            `giving up (fail-safe). Open the comments panel, or update SELECTORS.`
        );
      }
    };
    tryFind();
  }
})();
