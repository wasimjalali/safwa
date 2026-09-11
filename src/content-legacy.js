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
  // Check quickly at first, then continue at the slower recheck interval.
  const CONTAINER_POLL_MS = 1000;
  const CONTAINER_POLL_MAX = 30;
  // How often to check that the observed container is still in the DOM.
  // StreamYard is a SPA: a re-render can replace the comments panel wholesale,
  // which silently kills the MutationObserver. The watchdog notices and re-attaches.
  const CONTAINER_RECHECK_MS = 3000;
  // Marks comment nodes we've handled for diagnostics. The content fingerprint
  // below decides whether a virtualized row represents a new comment.
  const SEEN_ATTR = "data-safwa-seen";
  // Marks comment nodes that the LLM re-classified as semantic duplicates.
  const ANNOTATED_ATTR_LLM = "data-safwa-llm";

  if (!/(^|\.)streamyard\.com$/.test(location.host)) {
    console.warn(`${TAG} not a streamyard.com host (${location.host}); doing nothing.`);
    return;
  }

  console.log(`${TAG} content script loaded (v${VERSION}) on ${location.host}${location.pathname}`);

  try {
    chrome.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
      if (message?.type !== "safwa-ping") return;
      sendResponse({ ok: true, version: VERSION });
    });
  } catch {
    // Tests and restricted pages have no message bus. Ignore.
  }

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
      const runtimeConfig = Object.assign({}, configMod.CONFIG);
      wireEnabledToggle(configMod.STORAGE_KEYS);
      boot(
        runtimeConfig,
        dom,
        stateMod,
        grouping,
        ui,
        llm,
        configMod.STORAGE_KEYS,
        configMod.readStoredSettings,
        configMod.applyStoredSettings
      );
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

  function boot(CONFIG, dom, stateMod, grouping, ui, llm, STORAGE_KEYS, readStoredSettings, applyStoredSettings) {
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
    const seenFingerprints = new WeakMap();
    const seenComments = new WeakMap();
    // platform+handle+text -> the live row that currently represents that ask.
    // StreamYard recreates / recycles <li>s; the same ask must not increment N.
    const liveByFingerprint = new Map();
    const decisionByFingerprint = new Map();
    let scheduled = false;
    let observedContainer = null;
    let sessionGen = 0;

    const fingerprintOf = (comment) =>
      [comment.platform ?? "", comment.handle, comment.displayText].join("\u0000");

    const isLiveHolder = (node, fingerprint) =>
      !!(node && node.isConnected && seenFingerprints.get(node) === fingerprint);

    const rememberDecision = (fingerprint, decision, node) => {
      decisionByFingerprint.set(fingerprint, decision);
      if (!isLiveHolder(liveByFingerprint.get(fingerprint), fingerprint)) {
        liveByFingerprint.set(fingerprint, node);
      }
      if (decision.type === "duplicate" && decision.count > 1 && decision.target?.firstComment) {
        const original = decisionByFingerprint.get(fingerprintOf(decision.target.firstComment));
        if (original) original.count = decision.count;
      }
    };

    const retargetDecision = (decision, node, comment) => {
      comment.el = node;
      comment.cardEl = dom.cardAnchor(node);
      if (decision.comment) {
        decision.comment.el = node;
        decision.comment.cardEl = comment.cardEl;
      }
      // A duplicate decision's target is someone else's original. Do not steal it.
      if (decision.type !== "duplicate" && decision.target?.firstComment) {
        decision.target.firstComment.el = node;
        decision.target.firstComment.cardEl = comment.cardEl;
      }
      return decision;
    };

    const resetSessionMaps = () => {
      liveByFingerprint.clear();
      decisionByFingerprint.clear();
    };

    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(flush, DEBOUNCE_MS);
    };

    const flush = () => {
      scheduled = false;
      const nodes = [...pending];
      pending.clear();
      ui.revealOrphanedDuplicates();
      for (const node of nodes) {
        try {
          if (!node.isConnected) continue;
          const comment = dom.extractComment(node);
          if (!comment) {
            const previous = seenComments.get(node);
            if (previous) {
              previous.el = null;
              seenComments.delete(node);
              seenFingerprints.delete(node);
            }
            node.removeAttribute(SEEN_ATTR);
            // Always strip leftover badges: StreamYard clones / blanks a row
            // before the next comment's text arrives.
            ui.render({ type: "greeting", comment: { el: node } }, CONFIG);
            continue;
          }
          const fingerprint = fingerprintOf(comment);
          if (seenFingerprints.get(node) === fingerprint) continue;

          const holder = liveByFingerprint.get(fingerprint);
          const reappearance = !!(holder && !isLiveHolder(holder, fingerprint));

          const previousComment = seenComments.get(node);
          if (previousComment) previousComment.el = null;
          seenFingerprints.set(node, fingerprint);
          seenComments.set(node, comment);
          node.setAttribute(SEEN_ATTR, "1");

          if (reappearance) {
            const previousDecision = decisionByFingerprint.get(fingerprint);
            if (previousDecision) {
              const adopted = retargetDecision(previousDecision, node, comment);
              ui.render(adopted, CONFIG);
              liveByFingerprint.set(fingerprint, node);
              if (adopted.target?.firstComment?.el === node) {
                seenComments.set(node, adopted.target.firstComment);
              } else if (adopted.comment) {
                seenComments.set(node, adopted.comment);
              }
              continue;
            }
          }

          if (!isLiveHolder(holder, fingerprint)) {
            liveByFingerprint.set(fingerprint, node);
          }

          const decision = grouping.processComment(comment, state, CONFIG);
          rememberDecision(fingerprint, decision, node);
          ui.render(decision, CONFIG);
          // Adoption moves the signature's representative onto this row. Track
          // that actual object so recycling invalidates the adopted anchor too.
          if (decision.target?.firstComment?.el === node) {
            seenComments.set(node, decision.target.firstComment);
          }

          // Regex-uncertain cases: LLM confirms before we hide or count.
          // Timeout leaves the regex look in place (never hide a maybe).
          if (decision.needsLlmReview && CONFIG.LLM_ENABLED) {
            llmReview(node, comment, decision, fingerprint, seenFingerprints, CONFIG, llm, grouping, state, ui, sessionGen);
          }
        } catch (err) {
          // One bad node must never break the rest of the feed.
          console.warn(`${TAG} error processing a comment; skipping it.`, err);
        }
      }
    };

    /*
     * Asynchronously ask the LLM to confirm a regex-uncertain decision.
     * Runs AFTER the regex render so the feed is never blocked. Guard against
     * a recycled virtual-scroller row before mutating state.
     */
    function llmReview(node, comment, decision, fingerprint, seenFingerprints, CONFIG, llm, grouping, state, ui, gen) {
      llm
        .classifyComment(
          comment,
          decision.recentQuestions,
          CONFIG,
          llm.llmContextFromDecision(comment, decision)
        )
        .then((result) => {
          if (!result) return;
          if (gen !== sessionGen) return;
          if (!node.isConnected) return;
          if (seenFingerprints.get(node) !== fingerprint) return;
          const next = grouping.applyLlmOverride(decision, result, state, CONFIG);
          if (!next || next === decision) return;
          rememberDecision(fingerprint, next, node);
          ui.render(next, CONFIG);
          if (next.target?.firstComment?.el === node) {
            seenComments.set(node, next.target.firstComment);
          }
          for (const extra of next.alsoRender || []) {
            if (extra?.comment?.el) ui.render(extra, CONFIG);
          }
          node.setAttribute(ANNOTATED_ATTR_LLM, next.type);
          console.log(`${TAG} LLM overrode regex → ${next.type}${next.hide ? " (hidden)" : ""}.`);
        })
        .catch(() => {
          // Silent: the regex decision already stands. No need to warn.
        });
    }

    function rebuild(reason) {
      sessionGen += 1;
      state = stateMod.createState();
      resetSessionMaps();
      const container = observedContainer;
      if (!container?.isConnected) return;
      for (const node of dom.collectCommentNodes(container)) {
        seenFingerprints.delete(node);
        seenComments.delete(node);
        node.removeAttribute(SEEN_ATTR);
        pending.add(node);
      }
      schedule();
      console.log(`${TAG} rebuilt the feed (${reason}).`);
    }

    const attach = (container) => {
      if (observedContainer === container) return;
      observedContainer = container;
      console.log(`${TAG} comments container found; observing for new comments.`);

      // Seed state from comments already on screen, then watch for new ones.
      // Clearing the seen-marker matters on RE-attach (after a container
      // replacement): rows that survived the re-render must be reprocessed into
      // fresh state, and ui.render is idempotent so that is safe.
      for (const node of dom.collectCommentNodes(container)) {
        seenFingerprints.delete(node);
        node.removeAttribute(SEEN_ATTR);
        pending.add(node);
      }
      schedule();

      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          const changedRow = dom.closestCommentNode(m.target);
          if (changedRow) pending.add(changedRow);
          if (m.type === "characterData") {
            const node = dom.closestCommentNode(m.target.parentElement);
            if (node) pending.add(node);
            continue;
          }
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
      observer.observe(container, { childList: true, subtree: true, characterData: true });

      // Watchdog: if a StreamYard re-render replaces the panel, the observer
      // goes silent forever. Detect it, reset to a fresh state, and re-scan the
      // new panel from scratch (the old annotations died with the old nodes).
      const watchdog = setInterval(() => {
        ui.revealOrphanedDuplicates();
        if (container.isConnected) return;
        clearInterval(watchdog);
        observer.disconnect();
        pending.clear();
        observedContainer = null;
        sessionGen += 1;
        state = stateMod.createState();
        resetSessionMaps();
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
      attempts++;
      if (attempts === CONTAINER_POLL_MAX) {
        console.warn(
          `${TAG} comments container still not found after ${CONTAINER_POLL_MAX} tries; ` +
            `continuing slow checks (fail-safe). Open the comments panel, or update SELECTORS.`
        );
      }
      setTimeout(
        tryFind,
        attempts < CONTAINER_POLL_MAX ? CONTAINER_POLL_MS : CONTAINER_RECHECK_MS
      );
    };
    try {
      chrome.storage.local
        .get(null)
        .then((items) => {
          applyStoredSettings(CONFIG, readStoredSettings(items));
          tryFind();
        })
        .catch((err) => {
          console.warn(`${TAG} could not read settings; using defaults.`, err);
          tryFind();
        });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        if (STORAGE_KEYS.resetAt in changes) {
          rebuild("reset");
          return;
        }
        const settingKeys = [
          STORAGE_KEYS.collapseDuplicates,
          STORAGE_KEYS.hideExtras,
          STORAGE_KEYS.joinContinuations,
          STORAGE_KEYS.llmEnabled,
          STORAGE_KEYS.hideGreetings,
        ];
        if (!settingKeys.some((key) => key in changes)) return;
        chrome.storage.local.get(null).then((items) => {
          applyStoredSettings(CONFIG, readStoredSettings(items));
          rebuild("settings");
        });
      });
    } catch (err) {
      console.warn(`${TAG} settings storage unavailable; using defaults.`, err);
      tryFind();
    }
  }
})();
