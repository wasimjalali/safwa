/*
 * session.js - the v2 session owner (spec Section 5). Browser-only: uses
 * document, MutationObserver and chrome.*; the pure modules it wires are tested
 * separately.
 *
 * Responsibilities:
 *   - DOM observer + container watchdog (admission authority, always running)
 *   - occurrence registry: remounts re-anchor an existing record, never re-admit
 *   - admission coordinator + matching core (unchanged pipeline)
 *   - sidebar port server (snapshot / patch / health / resync / reset)
 *   - strict feature proxy (one validated native click, never a guess)
 *   - settings replay, session reset and studio-route change
 *   - read-only WS bridge consumption (log/enrich/primary) with real health
 *
 * The native StreamYard panel is never written to in any mode.
 */

import {
  checkFeatureRequest as checkProxyRequest,
  pickFeatureCandidate,
  pickLiveMatch,
  ownerIdForElement,
  offClickAllowed,
  groupShownState,
  sameFeatureGroup,
} from "./proxy-rules.js";
import { hasLegacyMarks, restoreFeed, restoreRow } from "./native-restore.js";

const TAG = "[Ṣafwa]";
const DEBOUNCE_MS = 80;
const CONTAINER_POLL_MS = 1000;
const CONTAINER_POLL_MAX = 30;
const CONTAINER_RECHECK_MS = 3000;
const PUBLISH_COALESCE_MS = 150;
const REGISTRY_LIMIT = 6000;

export function startSession(deps) {
  const {
    CONFIG,
    dom,
    stateMod,
    grouping,
    llm,
    panelModel,
    protocol,
    admissionMod,
    healthMod,
    wsParser,
    STORAGE_KEYS,
    readStoredSettings,
    applyStoredSettings,
  } = deps;

  const config = Object.assign({}, CONFIG);
  const documentToken = randomToken();
  let sessionEpoch = 0;
  let settingsRevision = 0;
  let revision = 0;
  let state = stateMod.createState();
  let admission = admissionMod.createAdmission(config);
  let health = healthMod.createHealth(config);
  let wsState = config.WS_MODE === "off" ? "off" : "starting";
  let bridgeHandshakeSeen = false;
  const lastQueueDroppedByKey = new Map();
  let masterEnabled = true;
  let lastHref = location.origin + location.pathname;

  const decisions = new Map();
  const llmOutcomes = new Map();
  const objectSource = new WeakMap();
  const anchors = new Map();
  const occurrenceRegistry = new Map(); // fingerprint -> { sourceId, ref: WeakRef<node> }
  const nodeSources = new WeakMap();
  const receipts = new Map();
  const ports = new Set();
  let publishTimer = null;
  let pendingSnapshot = false;
  let publishedKeys = new Map();
  let publishedFoldKey = "";

  let container = null;
  let observer = null;
  let watchdog = null;
  let attempts = 0;
  let scheduled = false;
  let settingsError = false;
  let settingsRecovery = false;
  let nativeReadWarned = false;
  const changedSettings = {};
  const pending = new Set();

  try {
    chrome.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
      if (message?.type === "safwa-ping") {
        sendResponse({ ok: true, version: chrome.runtime?.getManifest?.().version ?? "?" });
        return true;
      }
      if (message?.type !== "FEATURE_REQUEST") return;
      if (sender?.id !== chrome.runtime.id || sender.tab) {
        sendResponse(refuse("featureFindNative"));
        return true;
      }
      handleFeatureRequest(message)
        .then((result) => sendResponse(result))
        .catch(() => sendResponse(refuse("featureFindNative")));
      return true;
    });
    chrome.runtime?.onConnect?.addListener((port) => {
      if (port.name !== protocol.PORT_NAME) return;
      ports.add(port);
      port.onMessage.addListener((msg) => onPortMessage(port, msg));
      port.onDisconnect.addListener(() => ports.delete(port));
    });
  } catch {
    // Restricted pages have no message bus; the panel simply never connects.
  }


  /* ------------------------------------------------------------------ boot */

  function start() {
    if (!dom.selectorsConfirmed()) {
      console.warn(`${TAG} selectors unconfirmed; v2 sidebar disabled (fail-safe).`);
      return;
    }
    try {
      chrome.storage.local
        .get(null)
        .then((items) => {
          const current = { ...items, ...changedSettings };
          settingsError = false;
          applyStoredSettings(config, readStoredSettings(current));
          masterEnabled = current[STORAGE_KEYS.enabled] !== false;
          tryFind();
        })
        .catch((err) => {
          settingsError = true;
          masterEnabled = false;
          console.error(`${TAG} settings unavailable; filtering paused.`, err);
          tryFind();
        });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        for (const key of Object.values(STORAGE_KEYS)) {
          if (key in changes) changedSettings[key] = changes[key].newValue;
        }
        if (settingsError) {
          recoverSettings();
          return;
        }
        if (STORAGE_KEYS.enabled in changes) {
          settingsRevision += 1;
          masterEnabled = changes[STORAGE_KEYS.enabled].newValue !== false;
          cancelLlm();
          if (masterEnabled) {
            if (container?.isConnected) {
              for (const node of dom.collectCommentNodes(container)) pending.add(node);
              schedule();
            }
            // Reviews cancelled by master-off resume here: rebuilding
            // requeues eligible pending decisions and settles the rest.
            rebuildFromRecords();
          }
          publish(false);
          publishHealth();
        }
        if (STORAGE_KEYS.resetAt in changes) {
          // v2 reset is port-scoped to the bound tab; only the legacy build
          // reacts to the global storage key.
          if (config.PANEL_MODE === "v1-inline") resetSession();
          return;
        }
        const keys = [
          STORAGE_KEYS.collapseDuplicates,
          STORAGE_KEYS.hideExtras,
          STORAGE_KEYS.joinContinuations,
          STORAGE_KEYS.llmEnabled,
          STORAGE_KEYS.hideGreetings,
        ];
        if (!keys.some((key) => key in changes)) return;
        settingsRevision += 1;
        cancelLlm();
        const fields = ["AUTO_COLLAPSE_EXACT_DUPLICATES", "HIDE_CONFIRMED_EXTRAS",
          "JOIN_CONTINUATIONS", "LLM_ENABLED", "HIDE_GREETINGS"];
        keys.forEach((key, i) => {
          if (key in changes) config[fields[i]] = changes[key].newValue !== false;
        });
        rebuildFromRecords();
        publish(true);
      });
    } catch (err) {
      settingsError = true;
      masterEnabled = false;
      console.error(`${TAG} settings unavailable; filtering paused.`, err);
      tryFind();
    }
    startWs();
    setInterval(() => {
      if (config.WS_MODE !== "off") {
        health.tick();
        const snap = health.snapshot();
        if (snap.bridge?.state === "demoted" || snap.room?.state === "demoted") {
          wsState = "demoted";
        } else if (wsState === "starting") {
          wsState = config.WS_MODE;
        }
      }
      publishHealth();
    }, config.PANEL.healthIntervalMs);
  }

  async function recoverSettings() {
    if (settingsRecovery) return;
    settingsRecovery = true;
    try {
      // A partial storage event cannot recover preferences that failed to load.
      // Reread all settings before allowing capture or AI to resume.
      const items = await chrome.storage.local.get(null);
      const current = { ...items, ...changedSettings };
      applyStoredSettings(config, readStoredSettings(current));
      masterEnabled = current[STORAGE_KEYS.enabled] !== false;
      settingsError = false;
      settingsRevision += 1;
      cancelLlm();
      rebuildFromRecords();
      if (masterEnabled && container?.isConnected) {
        for (const node of dom.collectCommentNodes(container)) pending.add(node);
        schedule();
      }
      publish(true);
      publishHealth();
    } catch (err) {
      settingsError = true;
      masterEnabled = false;
      cancelLlm();
      publishHealth();
      console.error(`${TAG} settings still unavailable; filtering remains paused.`, err);
    } finally {
      settingsRecovery = false;
    }
  }

  const ROWS_REQUIRED_UNTIL = Math.floor(CONTAINER_POLL_MAX * 0.7);

  function tryFind() {
    const href = location.origin + location.pathname;
    if (href !== lastHref) {
      lastHref = href;
      resetSession({ reseed: false });
      attempts = 0;
    }
    const requireRows = attempts < ROWS_REQUIRED_UNTIL;
    const found = dom.findCommentContainer(document, { requireRows });
    if (found) {
      attach(found);
      return;
    }
    attempts += 1;
    if (attempts === 1) {
      console.log(`${TAG} waiting for the StreamYard comments panel (fail-safe).`);
    }
    setTimeout(tryFind, attempts < CONTAINER_POLL_MAX ? CONTAINER_POLL_MS : CONTAINER_RECHECK_MS);
  }

  function attach(next) {
    if (container === next) return;
    const reattach = container !== null;
    container = next;
    console.log(`${TAG} comments container found; sidebar session active.`);
    restoreFeed(container, () => dom.collectCommentNodes(container));
    for (const node of dom.collectCommentNodes(container)) pending.add(node);
    schedule();

    observer?.disconnect();
    observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        const row = dom.closestCommentNode(m.target);
        if (row) pending.add(row);
        if (m.type === "characterData") {
          const node = dom.closestCommentNode(m.target.parentElement);
          if (node) pending.add(node);
          continue;
        }
        for (const added of m.addedNodes) {
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
    observer.observe(container, { childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ["disabled", "aria-pressed", "aria-label", "src", "alt"] });

    if (watchdog) clearInterval(watchdog);
    watchdog = setInterval(() => {
      if (location.origin + location.pathname !== lastHref) {
        lastHref = location.origin + location.pathname;
        console.log(`${TAG} studio route changed; starting a fresh session.`);
        resetSession({ reseed: false });
        observer?.disconnect();
        container = null;
        clearInterval(watchdog);
        watchdog = null;
        attempts = 0;
        tryFind();
        return;
      }
      const withRows = dom.findCommentContainer(document, { requireRows: true });
      if (withRows && withRows !== container) {
        attach(withRows);
        return;
      }
      if (container?.isConnected) {
        publish(false);
        return;
      }
      clearInterval(watchdog);
      watchdog = null;
      observer?.disconnect();
      pending.clear();
      container = null;
      publish(false);
      console.warn(`${TAG} comments container left the DOM; re-attaching (state preserved).`);
      attempts = 0;
      tryFind();
    }, CONTAINER_RECHECK_MS);
    void reattach;
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(flush, DEBOUNCE_MS);
  }

  function flush() {
    scheduled = false;
    const nodes = [...pending];
    pending.clear();
    // Release detached nodes even when capture is paused.
    for (const anchor of anchors.values()) {
      if (!anchor.el?.isConnected) anchor.el = null;
    }
    if (!masterEnabled) { publish(false); return; }
    if (location.origin + location.pathname !== lastHref) return;
    for (const node of nodes) {
      try {
        if (!node.isConnected) continue;
        handleRow(node);
      } catch (err) {
        console.warn(`${TAG} error processing a comment; skipping it.`, err);
      }
    }
    // Remounts can change native-action availability without new admission.
    publish(false);
  }

  function fingerprintOf(comment) {
    return `${comment.platform ?? ""}\u0000${comment.handle}\u0000${comment.displayText}`;
  }

  /**
   * Admit or re-anchor one observed row.
   *   - registry hit with the SAME connected node -> already handled, skip
   *   - registry hit with a DISCONNECTED/gone node -> remount: re-anchor the
   *     existing record, never re-run the pipeline (no count inflation)
   *   - registry hit with a DIFFERENT connected node -> a genuine second live
   *     copy: admit it; the core folds it as a duplicate
   *   - no registry hit -> admit a new occurrence
   */
  function handleRow(node) {
    if (hasLegacyMarks(node)) restoreRow(node);
    const comment = dom.extractComment(node);
    if (!comment) return;
    if (admissionMod.isStreamYardSampleComment(comment)) return;
    const fp = fingerprintOf(comment);
    const known = nodeSources.get(node);
    if (known?.epoch === sessionEpoch && known.fp === fp && admission.getRecord(known.sourceId)) {
      const record = admission.getRecord(known.sourceId);
      record.avatarUrl = comment.avatar || record.avatarUrl;
      const anchor = anchors.get(known.sourceId);
      if (anchor) anchor.el = node;
      return;
    }
    let entry = occurrenceRegistry.get(fp);
    // More than one occurrence may share a fingerprint. Prefer a detached
    // occurrence for a remount before treating it as a new viewer submission.
    if (entry?.ref?.deref?.() !== node) {
      for (const [sourceId, anchor] of anchors) {
        if (anchor.fingerprint === fp && (!anchor.el?.isConnected || holderRecycled(anchor.el, fp))) {
          entry = { sourceId, ref: new WeakRef(node) };
          occurrenceRegistry.set(fp, entry);
          anchor.el = node;
          nodeSources.set(node, { sourceId, fp, epoch: sessionEpoch });
          return;
        }
      }
    }
    const holder = entry?.ref?.deref?.() ?? null;

    if (entry && holder === node) return;

    if (entry && (!holder || !holder.isConnected || holderRecycled(holder, fp))) {
      // Remount of an existing occurrence (or its old slot was recycled to
      // other content): re-anchor, keep the decision, never re-run the pipeline.
      entry.ref = new WeakRef(node);
      const anchor = anchors.get(entry.sourceId);
      if (anchor) anchor.el = node;
      const record = admission.getRecord(entry.sourceId);
      if (record) record.domAnchor = true;
      nodeSources.set(node, { sourceId: entry.sourceId, fp, epoch: sessionEpoch });
      return;
    }

    admit(comment, node, fp);
  }

  function admit(comment, node, fp) {
    const plain = {
      handle: comment.handle,
      platform: comment.platform,
      displayText: comment.displayText,
      timestamp: comment.timestamp,
      avatar: comment.avatar || "",
    };
    const { sourceId, isNew } = admission.admitDom(plain, { generation: 0 });
    nodeSources.set(node, { sourceId, fp, epoch: sessionEpoch });
    if (!isNew) {
      // Delivery identity says this is a repeat; re-anchor only.
      const anchor = anchors.get(sourceId);
      if (anchor) anchor.el = node;
      occurrenceRegistry.set(fp, { sourceId, ref: new WeakRef(node) });
      return;
    }
    const record = admission.getRecord(sourceId);
    if (record) {
      if (plain.avatar && !record.avatarUrl) record.avatarUrl = plain.avatar;
      record.domAnchor = true;
    }
    anchors.set(sourceId, { el: node, fingerprint: fp });
    occurrenceRegistry.set(fp, { sourceId, ref: new WeakRef(node) });
    pruneRegistry();
    runPipeline(plain, sourceId);
    const correled = admission.correlate();
    if ((correled.updated?.length ?? 0) > 0) {
      rebuildFromRecords();
      publish(true);
    }
  }

  /** True when a connected holder node no longer carries this fingerprint. */
  function holderRecycled(holder, expected) {
    try {
      const live = dom.extractComment(holder);
      if (!live) return true;
      const current = `${live.platform ?? ""}\u0000${live.handle}\u0000${live.displayText}`;
      return current !== expected;
    } catch {
      return true;
    }
  }

  function pruneRegistry() {
    if (occurrenceRegistry.size <= REGISTRY_LIMIT) return;
    const excess = occurrenceRegistry.size - REGISTRY_LIMIT;
    let removed = 0;
    for (const [fp, entry] of occurrenceRegistry) {
      const holder = entry.ref?.deref?.() ?? null;
      if (!holder || !holder.isConnected) {
        occurrenceRegistry.delete(fp);
        removed += 1;
        if (removed >= excess) break;
      }
    }
  }

  /** Run one plain occurrence through the unchanged pipeline and store the row model. */
  function runPipeline(plain, sourceId) {
    const copy = {
      handle: plain.handle,
      platform: plain.platform,
      displayText: plain.displayText,
      timestamp: admission.getRecord(sourceId).admittedAt,
    };
    objectSource.set(copy, sourceId);
    let decision = grouping.processComment(copy, state, config);
    if (decision.needsLlmReview && !scheduleLlm(copy, decision, sourceId)) {
      decision = settleReview(decision);
    }
    storeDecision(sourceId, decision);
    publish(false);
  }

  function storeDecision(sourceId, decision) {
    decisions.set(sourceId, enrichDecision(decision));
  }

  function enrichDecision(decision) {
    const enriched = {
      type: decision.type,
      hide: decision.hide === true,
      count: decision.count ?? null,
      pendingReview: decision.needsLlmReview === true,
      targetSourceId: sourceOf(decision.target?.firstComment),
      joinedFragments: null,
    };
    if (decision.type === "continuation" && Array.isArray(decision.block?.fragments)) {
      enriched.joinedFragments = decision.block.fragments
        .map((frag) => ({
          sourceId: sourceOf(frag),
          handle: frag.handle,
          displayText: frag.displayText,
          admittedAt: frag.timestamp,
        }))
        .filter((frag) => frag.sourceId);
    }
    if (decision.type === "extra") {
      const frags = decision.block?.fragments;
      enriched.extraHead = !Array.isArray(frags) || frags[0] === decision.comment;
    }
    return enriched;
  }

  function sourceOf(comment) {
    return comment ? objectSource.get(comment) ?? null : null;
  }

  /* ----------------------------------------------------------- LLM review */

  const LLM_MAX_IN_FLIGHT = 2;
  const LLM_QUEUE_MAX = 20;
  const LLM_PAUSE_MS = 60000;
  // Total classification attempts per comment per epoch, counted when an
  // attempt completes. Cumulative across context changes so a drifting
  // context cannot mint a fresh retry budget.
  const LLM_MAX_ATTEMPTS = 4;
  // A failed review produces no rebuild of its own; one delayed pass requeues
  // retryable failures and settles the ones that are out of budget.
  const LLM_RETRY_DELAY_MS = 15000;
  // Allow a full bounded queue to drain at the request deadline, including
  // one outage pause. Queue waiting time is separate from the fetch timeout.
  const LLM_ADMISSION_TTL_MS =
    config.LLM_TIMEOUT_MS * (Math.ceil(LLM_QUEUE_MAX / LLM_MAX_IN_FLIGHT) + 1) + LLM_PAUSE_MS;
  const llmQueue = [];
  const llmJobs = new Map();
  let llmInFlight = 0;
  let consecutiveLlmFailures = 0;
  let llmPausedUntil = 0;
  let llmResumeTimer = null;
  let llmRetryTimer = null;

  function cancelLlm() {
    clearTimeout(llmResumeTimer);
    llmResumeTimer = null;
    clearTimeout(llmRetryTimer);
    llmRetryTimer = null;
    llmQueue.length = 0;
    for (const job of llmJobs.values()) job.controller.abort();
    llmJobs.clear();
  }

  // A verdict's applicability is keyed on stable identity only: the comment
  // text, the review kind, the previous-question block's head comment
  // (same_person) and whether continuations were allowed. The numbered
  // recentQuestions list is deliberately not part of the key: it reorders and
  // unregisters on every applied verdict, and keying on it caused re-review
  // churn measured at ~8x calls on a real-session replay. Room-context
  // validity is checked per outcome by outcomeApplicable instead.
  function prevHeadId(decision) {
    const head = decision.previousBlock?.fragments?.[0];
    return head ? objectSource.get(head) ?? null : null;
  }

  function appliesKey(comment, decision) {
    return JSON.stringify([
      comment.displayText,
      decision.reviewKind,
      prevHeadId(decision),
      decision.allowContinuation === false,
    ]);
  }

  // The candidate set the model compared against, captured at request time.
  // Courtesy reviews see no candidates. Order-independent on purpose: a
  // reorder or removal does not invalidate a stored verdict.
  function candidateSetFor(decision) {
    if (decision.reviewKind === "courtesy") return null;
    return new Set((decision.recentQuestions ?? []).map((q) => q.matchKey));
  }

  // Does a stored outcome still describe this decision? A negative verdict
  // (primary / extra / continuation / greeting) stays valid while no NEW
  // candidate has entered the room context - additions can turn a "primary"
  // into a missed duplicate; removals and reorderings cannot. A "duplicate"
  // verdict depends only on its bound target surviving (tombstones forward).
  function outcomeApplicable(cached, comment, decision) {
    if (!cached?.result) return false;
    if (cached.appliesTo !== appliesKey(comment, decision)) return false;
    if (cached.result.classification === "duplicate") return true;
    if (!cached.candidates) return true;
    for (const q of decision.recentQuestions ?? []) {
      if (!cached.candidates.has(q.matchKey)) return false;
    }
    return true;
  }

  // A review that can never run again must not keep the row flagged pending.
  // Duplicate decisions are exempt: pendingReview is what keeps an
  // unconfirmed fuzzy candidate visible instead of folding it (pass 2 of
  // buildViewRows treats a non-pending duplicate as confirmed).
  function settleStoredDecision(sourceId) {
    const stored = decisions.get(sourceId);
    if (stored?.pendingReview && stored.type !== "duplicate") {
      decisions.set(sourceId, { ...stored, pendingReview: false });
      return true;
    }
    return false;
  }

  function settleReview(decision) {
    if (!decision || decision.type === "duplicate") return decision;
    return grouping.resolvedDecision(decision);
  }

  /**
   * Queue a classification review for a pending decision.
   * @returns {boolean} true while a review is queued, in-flight, or an
   *   applicable verdict already exists - the row may still change. false
   *   means no review will ever run for this context and the caller must
   *   settle the decision instead of leaving it pending.
   */
  function scheduleLlm(comment, decision, sourceId, { force = false } = {}) {
    if (!masterEnabled || !config.LLM_ENABLED) return false;
    if (llmJobs.has(sourceId)) return true;
    const admittedAt = admission.getRecord(sourceId)?.admittedAt;
    if (Date.now() - admittedAt > LLM_ADMISSION_TTL_MS) return false;
    const cached = llmOutcomes.get(sourceId);
    // An applicable verdict already covers this context; a stored outcome
    // that no longer applies (new room candidates, a moved previous block, a
    // consumed-but-inapplicable verdict) must not block a replacement review.
    if (!force && outcomeApplicable(cached, comment, decision)) return true;
    if ((cached?.attempts ?? 0) >= LLM_MAX_ATTEMPTS) return false;
    const job = {
      comment,
      decision,
      sourceId,
      admittedAt,
      sessionEpoch,
      appliesTo: appliesKey(comment, decision),
      candidates: candidateSetFor(decision),
      context: llm.llmContextFromDecision(comment, decision),
      controller: new AbortController(),
      settingsRevision,
    };
    llmJobs.set(sourceId, job);
    llmQueue.push(job);
    if (llmQueue.length > LLM_QUEUE_MAX) {
      const dropped = llmQueue.shift();
      llmJobs.delete(dropped.sourceId);
      console.warn(`${TAG} AI review queue full; comment kept visible.`);
    }
    drainLlm();
    return true;
  }

  function drainLlm() {
    if (!masterEnabled || !config.LLM_ENABLED) return;
    if (Date.now() < llmPausedUntil) {
      if (llmQueue.length > 0 && llmResumeTimer === null) {
        llmResumeTimer = setTimeout(() => {
          llmResumeTimer = null;
          drainLlm();
        }, llmPausedUntil - Date.now());
      }
      return;
    }
    while (llmInFlight < LLM_MAX_IN_FLIGHT && llmQueue.length > 0) {
      const job = llmQueue.shift();
      if (job.sessionEpoch !== sessionEpoch || job.controller.signal.aborted ||
          Date.now() - job.admittedAt > LLM_ADMISSION_TTL_MS) {
        if (llmJobs.get(job.sourceId) === job) llmJobs.delete(job.sourceId);
        if (!job.controller.signal.aborted && job.sessionEpoch === sessionEpoch) {
          console.warn(`${TAG} queued AI review expired; comment kept visible.`);
          if (settleStoredDecision(job.sourceId)) publish(false);
        }
        continue;
      }
      llmInFlight += 1;
      runLlmJob(job).finally(() => {
        if (llmJobs.get(job.sourceId) === job) llmJobs.delete(job.sourceId);
        llmInFlight -= 1;
        drainLlm();
      });
    }
  }

  function recordLlmFailure(job) {
    const prev = llmOutcomes.get(job.sourceId);
    llmOutcomes.set(job.sourceId, {
      result: null,
      appliesTo: job.appliesTo,
      candidates: job.candidates,
      attempts: (prev?.attempts ?? 0) + 1,
      failed: true,
    });
    consecutiveLlmFailures += 1;
    if (consecutiveLlmFailures >= 3) {
      llmPausedUntil = Date.now() + LLM_PAUSE_MS;
      consecutiveLlmFailures = 0;
      console.warn(`${TAG} AI review paused for 60s after repeated failures; queued reviews will resume automatically.`);
    }
    // A failed review produces no rebuild on its own; schedule one delayed
    // pass so bounded retries actually run (and exhausted ones settle)
    // instead of pending forever.
    if (llmRetryTimer === null) {
      llmRetryTimer = setTimeout(() => {
        llmRetryTimer = null;
        if (masterEnabled && config.LLM_ENABLED) {
          rebuildFromRecords();
          publish(false);
        }
      }, LLM_RETRY_DELAY_MS);
    }
  }

  async function runLlmJob(job) {
    const { comment, decision, sourceId } = job;
    const guard = {
      documentToken,
      sessionEpoch: job.sessionEpoch,
      settingsRevision: job.settingsRevision,
      sourceId,
      contentRevision: admission.getRecord(sourceId)?.admissionSeq ?? 0,
      contentText: comment.displayText,
    };
    try {
      let result = await llm.classifyComment(
        comment,
        decision.recentQuestions,
        config,
        { ...job.context, signal: job.controller.signal }
      );
      if (job.controller.signal.aborted || !masterEnabled || !config.LLM_ENABLED) return;
      if (!result) {
        recordLlmFailure(job);
        return;
      }
      consecutiveLlmFailures = 0;
      if (guard.documentToken !== documentToken) return;
      if (guard.sessionEpoch !== sessionEpoch) return;
      const record = admission.getRecord(sourceId);
      if (!record || record.admissionSeq !== guard.contentRevision) return;
      if (record.displayText !== guard.contentText) return;
      if (guard.settingsRevision !== settingsRevision) return;
      // Replay in arrival order. A late response must never mutate a newer
      // open question. A positional match is bound to the signature it named
      // AT REQUEST TIME - the list may have reordered or shrunk since.
      if (result.classification === "duplicate") {
        const snap = job.decision.recentQuestions ?? [];
        const picked = Number.isInteger(result.match) ? snap[result.match - 1] : null;
        result = { ...result, targetMatchKey: picked?.matchKey ?? null };
      }
      llmOutcomes.set(sourceId, {
        result,
        appliesTo: job.appliesTo,
        candidates: job.candidates,
        attempts: (llmOutcomes.get(sourceId)?.attempts ?? 0) + 1,
      });
      if (llmJobs.get(sourceId) === job) llmJobs.delete(sourceId);
      rebuildFromRecords();
      publish(true);
    } catch (err) {
      if (job.controller.signal.aborted) return;
      console.warn(`${TAG} classification failed; question kept visible.`, err);
      recordLlmFailure(job);
    }
  }

  /* ----------------------------------------------------- settings rebuild */

  function rebuildFromRecords() {
    state = stateMod.createState();
    decisions.clear();
    const ordered = admission.records().slice().sort((a, b) => a.admissionSeq - b.admissionSeq);
    for (const record of ordered) {
      const copy = {
        handle: record.handle,
        platform: record.platform,
        displayText: record.displayText,
        timestamp: record.admittedAt,
      };
      objectSource.set(copy, record.sourceId);
      let decision = grouping.processComment(copy, state, config);
      const cached = config.LLM_ENABLED ? llmOutcomes.get(record.sourceId) : null;
      const base = decision;
      const applicable = cached && outcomeApplicable(cached, copy, base);
      // Holdover: the stored verdict's identity still matches but a new room
      // candidate invalidated it. Apply it anyway so the row keeps its current
      // fate (no hide -> pending -> hide flicker) while a replacement review
      // runs against the fresh context.
      const holdover =
        !applicable && !!cached?.result && cached.appliesTo === appliesKey(copy, base);
      let consumed = false;
      if (applicable || holdover) {
        const next = grouping.applyLlmOverride(base, cached.result, state, config);
        if (next) {
          decision = next;
          for (const extra of next.alsoRender ?? []) {
            const extraId = sourceOf(extra?.comment);
            if (extraId && extra?.comment) {
              decisions.set(extraId, enrichDecision({ ...extra, target: null, block: extra.block }));
            }
          }
        }
        consumed = true;
      }
      // Schedule a (re)review when the base decision is still pending and no
      // verdict was consumed, the consumed verdict could not apply (decision
      // still pending), or a holdover verdict needs replacing. The request
      // context always comes from the pre-override pending decision.
      if (base.needsLlmReview && (holdover || !consumed || decision.needsLlmReview)) {
        if (!scheduleLlm(copy, base, record.sourceId, { force: consumed })) {
          decision = settleReview(decision);
        }
      }
      storeDecision(record.sourceId, decision);
    }
  }

  function resetSession({ reseed = true } = {}) {
    sessionEpoch += 1;
    cancelLlm();
    consecutiveLlmFailures = 0;
    llmPausedUntil = 0;
    admission.reset();
    state = stateMod.createState();
    decisions.clear();
    llmOutcomes.clear();
    anchors.clear();
    occurrenceRegistry.clear();
    receipts.clear();
    pending.clear();
    publishedKeys = new Map();
    if (reseed && container?.isConnected) {
      for (const node of dom.collectCommentNodes(container)) pending.add(node);
      schedule();
    }
    publish(true);
    console.log(`${TAG} session reset for this tab.`);
  }

  /* --------------------------------------------------------------- publish */

  function nativeIndex() {
    const byFingerprint = new Map();
    const liveByNode = new Map();
    const claimed = new Set();
    for (const node of container ? dom.collectCommentNodes(container) : []) {
      let live;
      try { live = dom.extractComment(node); }
      catch {
        if (!nativeReadWarned) {
          nativeReadWarned = true;
          console.warn(`${TAG} native comment could not be read; skipping affected display actions.`);
        }
        continue;
      }
      if (!live) continue;
      liveByNode.set(node, live);
      const fp = fingerprintOf(live);
      if (!byFingerprint.has(fp)) byFingerprint.set(fp, []);
      byFingerprint.get(fp).push(node);
    }
    for (const [id, anchor] of anchors) {
      if (!dom.commentMatches(liveByNode.get(anchor.el), admission.getRecord(id))) anchor.el = null;
      else claimed.add(anchor.el);
    }
    return { byFingerprint, liveByNode, claimed };
  }

  function liveElementFor(record, index = nativeIndex()) {
    if (!record) return null;
    const held = anchors.get(record.sourceId);
    const ownEl = held?.el?.isConnected ? held.el : null;
    const ownMatches = dom.commentMatches(index.liveByNode.get(ownEl), record);
    const matches = index.byFingerprint.get(fingerprintOf(record)) ?? [];
    return pickLiveMatch({ ownEl, ownMatches, matches, claimed: index.claimed });
  }

  function bindOwnAnchor(sourceId, el) {
    if (!el) return;
    for (const [id, held] of anchors) {
      if (id !== sourceId && held?.el === el) return;
    }
    const held = anchors.get(sourceId);
    if (held) held.el = el;
  }

  function sourceIdOwning(el, fallbackId) {
    const holdings = [];
    for (const [id, held] of anchors) {
      if (held?.el) holdings.push([id, held.el]);
    }
    return ownerIdForElement(el, holdings, fallbackId);
  }

  function featureCandidateFrom(preferredId, extraIds = [], wantOn, index = nativeIndex()) {
    const prefRec = admission.getRecord(preferredId);
    const ids = [preferredId];
    for (const id of extraIds) {
      if (id && !ids.includes(id)) ids.push(id);
    }
    const candidates = ids.map((id) => {
      const rec = admission.getRecord(id);
      const el = rec ? liveElementFor(rec, index) : null;
      const button = el ? dom.findShowButton(el) : null;
      return {
        id,
        connected: !!el,
        sameIdentity: !!(
          prefRec &&
          rec &&
          rec.handle === prefRec.handle &&
          (rec.platform ?? "") === (prefRec.platform ?? "")
        ),
        hasButton: !!(button && !button.disabled),
        admissionSeq: rec?.admissionSeq ?? 0,
      };
    });
    return pickFeatureCandidate(candidates, {
      requestedId: preferredId,
      wantOn: wantOn ?? prefRec?.shown !== "on",
    });
  }

  function onAirId(ids) {
    return ids.find((id) => {
      const shown = admission.getRecord(id)?.shown;
      return shown === "on" || shown === "pending";
    });
  }

  function currentProjection() {
    const index = nativeIndex();
    const projection = panelModel.buildViewRows(admission.records(), decisions, config);
    for (const row of projection.rows) {
      const groupIds = panelModel.featureIdsForRow(row);
      const groupShown = groupShownState(groupIds.map((id) => admission.getRecord(id)?.shown));
      const sourceId =
        featureCandidateFrom(onAirId(groupIds) ?? groupIds[0], groupIds, groupShown === "unknown", index) ??
        groupIds[0];
      const record = admission.getRecord(sourceId);
      const liveEl = liveElementFor(record, index);
      bindOwnAnchor(sourceId, liveEl);
      const avail = panelModel.featureAvailability({
        enabled: masterEnabled && config.FEATURE_PROXY_ENABLED === true,
        sidebar: config.PANEL_MODE === "sidebar",
        anchorOk: !!liveEl?.isConnected && !!dom.findShowButton(liveEl) && !dom.findShowButton(liveEl).disabled,
        shown: groupShown,
      });
      row.feature = {
        available: avail.available,
        reasonCode: avail.reasonCode,
        labelKey: row.badges?.joined ? "featureShowFirst" : "featureShow",
        targetSourceId: sourceId,
        contentRevision: record?.admissionSeq ?? null,
      };
      if (record) {
        row.shown = groupShown === "on" ? "on" : groupShown === "pending" ? "pending" : "unknown";
        row.starred = record.starred === "on" ? "on" : "unknown";
      }
    }
    return projection;
  }

  function publish(snapshot) {
    if (snapshot) pendingSnapshot = true;
    if (ports.size === 0) return;
    if (publishTimer) return;
    publishTimer = setTimeout(() => {
      publishTimer = null;
      const wantSnapshot = pendingSnapshot;
      pendingSnapshot = false;
      const projection = currentProjection();
      const rows = projection.rows;
      const nextKeys = new Map();
      for (const row of rows) nextKeys.set(row.rowId, JSON.stringify(row));
      const upserts = wantSnapshot
        ? rows
        : rows.filter((row) => publishedKeys.get(row.rowId) !== nextKeys.get(row.rowId));
      const removals = [];
      for (const id of publishedKeys.keys()) {
        if (!nextKeys.has(id)) removals.push(id);
      }
      const foldKey = JSON.stringify(projection.folded);
      const changed =
        wantSnapshot || upserts.length > 0 || removals.length > 0 || foldKey !== publishedFoldKey;
      if (!changed) return; // a true no-op publishes nothing and burns no revision
      publishedKeys = nextKeys;
      publishedFoldKey = foldKey;
      revision += 1;
      for (const port of ports) {
        try {
          if (wantSnapshot) {
            sendSnapshot(port, rows, projection.folded);
          } else {
            port.postMessage(
              protocol.makeEnvelope(protocol.MESSAGE_TYPES.PATCH, {
                documentToken,
                sessionEpoch,
                baseRevision: port.safwaRevision ?? revision - 1,
                revision,
                upserts,
                removals,
                folded: projection.folded,
              })
            );
          }
          port.safwaRevision = revision;
        } catch {
          ports.delete(port);
        }
      }
    }, PUBLISH_COALESCE_MS);
  }

  function sendSnapshot(port, rows, folded) {
    port.safwaRevision = revision;
    port.postMessage(
      protocol.makeEnvelope(protocol.MESSAGE_TYPES.SNAPSHOT_BEGIN, {
        documentToken,
        sessionEpoch,
        revision,
        expectedRows: rows.length,
        session: {
          startedAt: Date.now(),
          wsMode: config.WS_MODE,
          effectiveSource: health.snapshot().effectiveSource,
        },
      })
    );
    const chunkRows = config.PANEL.snapshotChunkRows;
    for (let i = 0; i < rows.length; i += chunkRows) {
      port.postMessage(
        protocol.makeEnvelope(protocol.MESSAGE_TYPES.SNAPSHOT_CHUNK, {
          documentToken,
          sessionEpoch,
          revision,
          rows: rows.slice(i, i + chunkRows),
        })
      );
    }
    port.postMessage(
      protocol.makeEnvelope(protocol.MESSAGE_TYPES.SNAPSHOT_END, {
        documentToken,
        sessionEpoch,
        revision,
        rowCount: rows.length,
        folded,
      })
    );
  }

  function publishHealth() {
    if (ports.size === 0) return;
    const snap = health.snapshot();
    for (const port of ports) {
      try {
        port.postMessage(
          protocol.makeEnvelope(protocol.MESSAGE_TYPES.HEALTH, {
            documentToken,
            sessionEpoch,
            observer: container?.isConnected ? "ok" : "unavailable",
            pendingWork: pending.size,
            wsState,
            effectiveSource: snap.effectiveSource,
            enabled: masterEnabled,
            settingsError,
            llmUnavailable: config.LLM_ENABLED && Date.now() < llmPausedUntil,
          })
        );
      } catch {
        ports.delete(port);
      }
    }
  }

  function onPortMessage(port, message) {
    if (!message || typeof message !== "object") return;
    const type = message.type;
    // The open port is the bind. Reset must not depend on a prior snapshot.
    if (type === protocol.MESSAGE_TYPES.RESET_SESSION && ports.has(port)) {
      const check = protocol.validatePortMessage(message, { documentToken, sessionEpoch });
      if (!check.ok || typeof message.requestId !== "string") {
        port.postMessage(protocol.makeEnvelope(protocol.MESSAGE_TYPES.RESET_RESULT, {
          documentToken, sessionEpoch, requestId: message.requestId ?? null, ok: false,
        }));
        return;
      }
      resetSession();
      port.postMessage(protocol.makeEnvelope(protocol.MESSAGE_TYPES.RESET_RESULT, {
        documentToken, sessionEpoch, requestId: message.requestId, ok: true,
      }));
      return;
    }
    if (protocol.isUnboundHandshake(message)) {
      // The port connection itself authorizes the handshake: reply with the
      // session identity so the panel can bind before anything else.
      const cold = currentProjection();
      sendSnapshot(port, cold.rows, cold.folded);
      return;
    }
    const check = protocol.validatePortMessage(message, {
      documentToken,
      sessionEpoch,
      revision: port.safwaRevision ?? revision,
    });
    if (!check.ok) {
      if (check.reason === "revisionGap") {
        port.postMessage(
          protocol.makeEnvelope(protocol.MESSAGE_TYPES.RESYNC, { documentToken, sessionEpoch, revision })
        );
      }
      return;
    }
    switch (type) {
      case protocol.MESSAGE_TYPES.SUBSCRIBE:
      case protocol.MESSAGE_TYPES.RESYNC: {
        const projection = currentProjection();
        sendSnapshot(port, projection.rows, projection.folded);
        break;
      }
      case protocol.MESSAGE_TYPES.ACTION_STATUS: {
        const receipt = receipts.get(message.requestId);
        port.postMessage(
          protocol.makeEnvelope(protocol.MESSAGE_TYPES.ACTION_STATUS, {
            documentToken,
            sessionEpoch,
            revision,
            requestId: message.requestId,
            outcome: receipt?.outcome ?? "unknown",
            reasonCode: receipt?.reasonCode ?? null,
          })
        );
        break;
      }
      default:
        break;
    }
  }

  /* --------------------------------------------------------- feature proxy */

  const FEATURE_OK = { outcome: "clicked", reasonCode: null };
  function refuse(reasonCode) {
    return { outcome: "refused", reasonCode };
  }

  async function handleFeatureRequest(request) {
    if (!masterEnabled || location.origin + location.pathname !== lastHref) return refuse("featureFindNative");
    const validation = protocol.validateFeatureRequest(request);
    if (!validation.ok) return refuse("featureFindNative");
    if (request.documentToken !== documentToken || request.sessionEpoch !== sessionEpoch) {
      return refuse("featureFindNative");
    }
    if (Date.now() > request.expiresAt) return refuse("featureFindNative");
    if (receipts.has(request.requestId)) {
      const prior = receipts.get(request.requestId);
      return { outcome: prior.outcome, reasonCode: prior.reasonCode };
    }
    let sourceId = request.targetSourceId ?? request.sourceId;
    const requested = admission.getRecord(sourceId);
    if (
      typeof request.sourceRevision === "number" &&
      requested &&
      request.sourceRevision !== requested.admissionSeq
    ) {
      return finish(request.requestId, refuse("featureFindNative"));
    }
    if (container) restoreFeed(container, () => dom.collectCommentNodes(container));
    const { rows } = panelModel.buildViewRows(admission.records(), decisions, config);
    const groupIds = panelModel.featureGroupIdsForClick(sourceId, rows);
    const groupShown = groupShownState(groupIds.map((id) => admission.getRecord(id)?.shown));
    const index = nativeIndex();
    sourceId =
      featureCandidateFrom(onAirId(groupIds) ?? sourceId, groupIds, groupShown === "unknown", index) ??
      sourceId;
    const record = admission.getRecord(sourceId);
    const liveEl = liveElementFor(record, index);
    if (liveEl) restoreRow(liveEl);
    bindOwnAnchor(sourceId, liveEl);
    const ownerId = sourceIdOwning(liveEl, sourceId);
    const clickedRec = admission.getRecord(ownerId) ?? record;
    if (!offClickAllowed(groupShown, clickedRec?.shown)) {
      return finish(request.requestId, refuse("featureFindNative"));
    }
    const anchorConnected = !!liveEl?.isConnected;
    const live = anchorConnected ? index.liveByNode.get(liveEl) : null;
    let twinCount = 0;
    if (live) {
      for (const [otherId, other] of anchors) {
        if (otherId === sourceId || !other?.el?.isConnected) continue;
        if (sameFeatureGroup(sourceId, otherId, decisions.get(sourceId), decisions.get(otherId))) continue;
        const otherLive = index.liveByNode.get(other.el);
        if (
          otherLive &&
          (otherLive.platform ?? "") === (live.platform ?? "") &&
          otherLive.handle === live.handle &&
          otherLive.displayText === live.displayText
        ) {
          twinCount += 1;
        }
      }
    }
    const button = anchorConnected ? dom.findShowButton(liveEl) : null;
    const verdict = checkProxyRequest({
      request: {
        ...request,
        sourceRevision:
          typeof record?.admissionSeq === "number" ? record.admissionSeq : request.sourceRevision,
      },
      session: { documentToken, sessionEpoch },
      record: record ?? null,
      anchorConnected,
      liveRow: live,
      twinCount,
      buttonCount: button && !button.disabled ? 1 : 0,
      enabled: config.FEATURE_PROXY_ENABLED,
      now: Date.now(),
    });
    if (
      (record && Date.now() < (record.featureCoolingUntil ?? 0)) ||
      (clickedRec && clickedRec !== record && Date.now() < (clickedRec.featureCoolingUntil ?? 0))
    ) {
      return finish(request.requestId, refuse("featureFindNative"));
    }
    if (!verdict.ok) return finish(request.requestId, refuse(verdict.reasonCode ?? "featureFindNative"));
    const clicked = dom.clickShowButton(liveEl);
    if (!clicked) return finish(request.requestId, refuse("featureFindNative"));
    // One validated native click, then reflect on/off locally so the sidebar
    // icon stays in sync. A short cool-down blocks a second click (the native
    // control is a toggle). WS shownSet still overrides in enrich/primary.
    if (clickedRec) {
      const wasOn = groupShown === "on";
      const wsReflectsShown = config.WS_MODE === "enrich" || config.WS_MODE === "primary";
      const coolMs = config.FEATURE_PROXY?.ackTimeoutMs ?? 1000;
      const offLatchMs = config.WS_LIMITS?.featureStateMs ?? 15000;
      if (wasOn) {
        for (const id of groupIds) {
          const rec = admission.getRecord(id);
          if (!rec) continue;
          if (rec.shown === "on" || rec.shown === "pending") {
            rec.shown = "unknown";
            rec.shownOffUntil = Date.now() + offLatchMs;
          }
        }
      } else if (wsReflectsShown) {
        clickedRec.shown = "pending";
        clickedRec.shownOffUntil = 0;
      } else {
        clickedRec.shown = "on";
        clickedRec.shownOffUntil = 0;
      }
      // Request-time only: do not bake cooling into the published row or the
      // icon stays disabled until some later comment republishes.
      clickedRec.featureCoolingUntil = Date.now() + coolMs;
    }
    publish(false);
    return finish(request.requestId, FEATURE_OK);
  }

  function finish(requestId, result) {
    receipts.set(requestId, result);
    if (receipts.size > 200) {
      const first = receipts.keys().next().value;
      receipts.delete(first);
    }
    return result;
  }

  /* --------------------------------------------------------------- WS rail */

  function startWs() {
    if (config.WS_MODE === "off") return;
    const bridge = globalThis.__safwaWsBridge;
    if (!bridge || !wsParser) {
      console.warn(`${TAG} WS build without bridge/parser; DOM only (fail-safe).`);
      wsState = "off";
      return;
    }
    bridge.subscribe((envelope) => onBridgeEnvelope(envelope));
    if (bridge.state?.().handshake) {
      bridgeHandshakeSeen = true;
      health.noteBridgeHandshake();
    }
    bridge.noteSessionReady();
    wsState = config.WS_MODE;
    console.log(`${TAG} WS observer active in "${config.WS_MODE}" mode (read-only).`);
  }

  function onBridgeEnvelope(envelope) {
    if (!envelope || typeof envelope !== "object") return;
    if (envelope.kind === "demote") {
      wsState = "demoted";
      console.warn(`${TAG} WS bridge demoted (${envelope.reason ?? "unknown"}); DOM continues.`);
      return;
    }
    if (envelope.kind === "lifecycle") {
      let event = null;
      try {
        event = JSON.parse(envelope.data || "{}").event || null;
      } catch {
        event = null;
      }
      if (event === "constructed") health.noteSocketConstructed(envelope.endpointKey);
      else if (event === "close") health.noteSocketEnded(envelope.endpointKey, "close");
      else if (event === "error") health.noteSocketEnded(envelope.endpointKey, "error");
      if (typeof envelope.generation === "number") health.noteConnectionGeneration(envelope.generation);
      return;
    }
    if (envelope.kind === "health") {
      health.noteBridgeFrame(envelope.endpointKey);
      try {
        const stats = JSON.parse(envelope.data || "{}");
        const prior = lastQueueDroppedByKey.get(envelope.endpointKey) ?? 0;
        if (typeof stats.queueDropped === "number" && stats.queueDropped > prior) {
          lastQueueDroppedByKey.set(envelope.endpointKey, stats.queueDropped);
          // A dropped frame is a loss signal: count it toward demotion (spec §8 row 18).
          health.noteParse("malformed", envelope.endpointKey);
        }
      } catch {
        // Aggregate-only stats; a broken stats frame is not a comment frame.
      }
      return;
    }
    if (envelope.kind !== "frame" || envelope.dataType !== "text") return;
    if (!bridgeHandshakeSeen) {
      bridgeHandshakeSeen = true;
      health.noteBridgeHandshake();
    }
    health.noteBridgeFrame(envelope.endpointKey);

    const result = wsParser.parseWsFrame(envelope.data, {
      endpointKey: envelope.endpointKey,
      direction: "in",
    });
    health.noteParse(result.status, envelope.endpointKey);
    if (result.status === "malformed" || result.status === "unknown") return;
    if (result.status !== "ok") return;
    const snap = health.snapshot();
    if (snap.room?.state === "demoted" || snap.bridge?.state === "demoted") {
      wsState = "demoted";
      return;
    }
    if (config.WS_MODE === "log") return;

    const ingest = admission.ingestSocket(result, {
      generation: envelope.generation,
      endpointKey: envelope.endpointKey,
    });
    for (const diag of ingest.diagnostics ?? []) {
      if (String(diag).startsWith("contradiction")) health.noteContradiction(envelope.endpointKey);
    }
    const correlated = admission.correlate();
    const states = admission.applyStateEvents([...(ingest.events ?? []), ...(correlated.events ?? [])]);
    const touched =
      (ingest.updated?.length ?? 0) + (correlated.updated?.length ?? 0) + (states.updated?.length ?? 0);
    if (touched > 0) {
      rebuildFromRecords();
      publish(true);
    }
  }

  start();
}

function randomToken() {
  try {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return `t${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  }
}
