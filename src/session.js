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
  let rebuildEpoch = 0;
  const lastQueueDroppedByKey = new Map();
  let masterEnabled = true;
  let lastHref = location.origin + location.pathname;

  const decisions = new Map();
  const llmOutcomes = new Map();
  const objectSource = new WeakMap();
  const anchors = new Map();
  const occurrenceRegistry = new Map(); // fingerprint -> { sourceId, ref: WeakRef<node> }
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

  start();

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
          applyStoredSettings(config, readStoredSettings(items));
          masterEnabled = items[STORAGE_KEYS.enabled] !== false;
          tryFind();
        })
        .catch(() => tryFind());
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        if (STORAGE_KEYS.enabled in changes) {
          masterEnabled = changes[STORAGE_KEYS.enabled].newValue !== false;
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
        chrome.storage.local
          .get(null)
          .then((items) => {
            applyStoredSettings(config, readStoredSettings(items));
            rebuildFromRecords();
            publish(true);
          })
          .catch(() => {});
      });
    } catch {
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

  const ROWS_REQUIRED_UNTIL = Math.floor(CONTAINER_POLL_MAX * 0.7);

  function tryFind() {
    const href = location.origin + location.pathname;
    if (href !== lastHref) {
      lastHref = href;
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
    observer.observe(container, { childList: true, subtree: true, characterData: true });

    if (watchdog) clearInterval(watchdog);
    watchdog = setInterval(() => {
      if (location.origin + location.pathname !== lastHref) {
        lastHref = location.origin + location.pathname;
        console.log(`${TAG} studio route changed; starting a fresh session.`);
        resetSession({ reseed: false });
        return;
      }
      const withRows = dom.findCommentContainer(document, { requireRows: true });
      if (withRows && withRows !== container) {
        attach(withRows);
        return;
      }
      if (container?.isConnected) return;
      clearInterval(watchdog);
      watchdog = null;
      observer?.disconnect();
      pending.clear();
      container = null;
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
    for (const node of nodes) {
      try {
        if (!node.isConnected) continue;
        handleRow(node);
      } catch (err) {
        console.warn(`${TAG} error processing a comment; skipping it.`, err);
      }
    }
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
    const entry = occurrenceRegistry.get(fp);
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
      timestamp: plain.timestamp,
    };
    objectSource.set(copy, sourceId);
    const decision = grouping.processComment(copy, state, config);
    storeDecision(sourceId, decision);
    publish(false);
    if (decision.needsLlmReview && config.LLM_ENABLED) {
      scheduleLlm(copy, decision, sourceId);
    }
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
    return enriched;
  }

  function sourceOf(comment) {
    return comment ? objectSource.get(comment) ?? null : null;
  }

  /* ----------------------------------------------------------- LLM review */

  const LLM_MAX_IN_FLIGHT = 2;
  const LLM_QUEUE_MAX = 20;
  const LLM_ADMISSION_TTL_MS = 8000;
  const LLM_FAIL_WINDOW_MS = 60000;
  const LLM_PAUSE_MS = 60000;
  const llmQueue = [];
  let llmInFlight = 0;
  let llmFailures = [];
  let llmPausedUntil = 0;

  function scheduleLlm(comment, decision, sourceId) {
    llmQueue.push({
      comment,
      decision,
      sourceId,
      admittedAt: admission.getRecord(sourceId)?.admittedAt ?? Date.now(),
      settingsRevision,
      rebuildEpoch,
    });
    if (llmQueue.length > LLM_QUEUE_MAX) llmQueue.splice(0, llmQueue.length - LLM_QUEUE_MAX);
    drainLlm();
  }

  function drainLlm() {
    if (Date.now() < llmPausedUntil) return;
    while (llmInFlight < LLM_MAX_IN_FLIGHT && llmQueue.length > 0) {
      const job = llmQueue.shift();
      if (Date.now() - job.admittedAt > LLM_ADMISSION_TTL_MS) continue;
      llmInFlight += 1;
      runLlmJob(job).finally(() => {
        llmInFlight -= 1;
        drainLlm();
      });
    }
  }

  async function runLlmJob(job) {
    const { comment, decision, sourceId } = job;
    const guard = {
      documentToken,
      sessionEpoch,
      settingsRevision: job.settingsRevision,
      rebuildEpoch: job.rebuildEpoch,
      sourceId,
      contentRevision: admission.getRecord(sourceId)?.admissionSeq ?? 0,
      contentText: comment.displayText,
    };
    try {
      const result = await llm.classifyComment(
        comment,
        decision.recentQuestions,
        config,
        llm.llmContextFromDecision(comment, decision)
      );
      llmFailures = llmFailures.filter((t) => Date.now() - t < LLM_FAIL_WINDOW_MS);
      if (!result) {
        if (config.LLM_ENABLED) {
          llmFailures.push(Date.now());
          if (llmFailures.length >= 3) {
            llmPausedUntil = Date.now() + LLM_PAUSE_MS;
            llmFailures = [];
          }
        }
        return;
      }
      if (guard.documentToken !== documentToken) return;
      if (guard.sessionEpoch !== sessionEpoch) return;
      const record = admission.getRecord(sourceId);
      if (!record || record.admissionSeq !== guard.contentRevision) return;
      if (record.displayText !== guard.contentText) return;
      llmOutcomes.set(sourceId, result);
      if (guard.settingsRevision !== settingsRevision || guard.rebuildEpoch !== rebuildEpoch) {
        rebuildFromRecords();
        publish(true);
        return;
      }
      const next = grouping.applyLlmOverride(decision, result, state, config);
      if (!next || next === decision) return;
      storeDecision(sourceId, next);
      for (const extra of next.alsoRender ?? []) {
        const extraId = sourceOf(extra?.comment);
        if (extraId && extra?.comment) {
          decisions.set(extraId, enrichDecision({ ...extra, target: null, block: extra.block }));
        }
      }
      publish(false);
    } catch {
      llmFailures = llmFailures.filter((t) => Date.now() - t < LLM_FAIL_WINDOW_MS);
      llmFailures.push(Date.now());
      if (llmFailures.length >= 3) {
        llmPausedUntil = Date.now() + LLM_PAUSE_MS;
        llmFailures = [];
      }
    }
  }

  /* ----------------------------------------------------- settings rebuild */

  function rebuildFromRecords() {
    rebuildEpoch += 1;
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
      const prior = config.LLM_ENABLED ? llmOutcomes.get(record.sourceId) : null;
      if (prior) {
        const next = grouping.applyLlmOverride(decision, prior, state, config);
        if (next) {
          decision = next;
          for (const extra of next.alsoRender ?? []) {
            const extraId = sourceOf(extra?.comment);
            if (extraId && extra?.comment) {
              decisions.set(extraId, enrichDecision({ ...extra, target: null, block: extra.block }));
            }
          }
        }
      }
      storeDecision(record.sourceId, decision);
      if (decision.needsLlmReview && config.LLM_ENABLED && !prior) {
        scheduleLlm(copy, decision, record.sourceId);
      }
    }
  }

  function resetSession({ reseed = true } = {}) {
    sessionEpoch += 1;
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

  function liveElementFor(record) {
    if (!record) return null;
    const matches = container ? dom.findMatchingCommentNodes(container, record) : [];
    if (matches.length) return matches[matches.length - 1];
    const anchor = anchors.get(record.sourceId);
    if (!anchor?.el?.isConnected) return null;
    return dom.commentMatches(dom.extractComment(anchor.el), record) ? anchor.el : null;
  }

  function featureCandidateFrom(preferredId, extraIds = []) {
    const prefRec = admission.getRecord(preferredId);
    const ids = [preferredId];
    for (const id of extraIds) {
      if (id && !ids.includes(id)) ids.push(id);
    }
    const candidates = ids.map((id) => {
      const rec = admission.getRecord(id);
      const el = rec ? liveElementFor(rec) : null;
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
      wantOn: prefRec?.shown !== "on",
    });
  }

  function pickConnectedFeatureId(preferredId, row) {
    const extraIds = (row.members ?? []).map((m) => m?.sourceId);
    return featureCandidateFrom(preferredId, extraIds) ?? preferredId;
  }

  function currentProjection() {
    const projection = panelModel.buildViewRows(admission.records(), decisions, config);
    for (const row of projection.rows) {
      const designated = row.feature?.targetSourceId ?? row.primary.sourceId;
      const sourceId = pickConnectedFeatureId(designated, row);
      const anchor = anchors.get(sourceId);
      const record = admission.getRecord(sourceId);
      const avail = panelModel.featureAvailability({
        enabled: config.FEATURE_PROXY_ENABLED === true,
        sidebar: config.PANEL_MODE === "sidebar",
        anchorOk: !!anchor?.el?.isConnected,
        shown: record?.shown,
      });
      row.feature = {
        available: avail.available,
        reasonCode: avail.reasonCode,
        labelKey: row.badges?.joined ? "featureShowFirst" : "featureShow",
        targetSourceId: sourceId,
        contentRevision: record?.admissionSeq ?? null,
      };
      if (record) {
        row.shown = record.shown === "on" ? "on" : record.shown === "pending" ? "pending" : "unknown";
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
      resetSession();
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
    const groupIds = [];
    for (const otherId of decisions.keys()) {
      if (sameFeatureGroup(sourceId, otherId, decisions.get(sourceId), decisions.get(otherId))) {
        groupIds.push(otherId);
      }
    }
    sourceId = featureCandidateFrom(sourceId, groupIds) ?? sourceId;
    const record = admission.getRecord(sourceId);
    const liveEl = liveElementFor(record);
    if (liveEl) {
      restoreRow(liveEl);
      const held = anchors.get(sourceId);
      if (held) held.el = liveEl;
    }
    const anchorConnected = !!liveEl?.isConnected;
    const live = anchorConnected ? dom.extractComment(liveEl) : null;
    let twinCount = 0;
    if (live) {
      for (const [otherId, other] of anchors) {
        if (otherId === sourceId || !other?.el?.isConnected) continue;
        if (sameFeatureGroup(sourceId, otherId, decisions.get(sourceId), decisions.get(otherId))) continue;
        const otherLive = dom.extractComment(other.el);
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
    if (record && Date.now() < (record.featureCoolingUntil ?? 0)) {
      return finish(request.requestId, refuse("featureFindNative"));
    }
    if (!verdict.ok) return finish(request.requestId, refuse(verdict.reasonCode ?? "featureFindNative"));
    const clicked = dom.clickShowButton(liveEl);
    if (!clicked) return finish(request.requestId, refuse("featureFindNative"));
    // One validated native click, then reflect on/off locally so the sidebar
    // icon stays in sync. A short cool-down blocks a second click (the native
    // control is a toggle). WS shownSet still overrides in enrich/primary.
    if (record) {
      const wasOn = record.shown === "on";
      const wsReflectsShown = config.WS_MODE === "enrich" || config.WS_MODE === "primary";
      const coolMs = config.FEATURE_PROXY?.ackTimeoutMs ?? 1000;
      const offLatchMs = config.WS_LIMITS?.featureStateMs ?? 15000;
      if (wasOn) {
        record.shown = "unknown";
        record.shownOffUntil = Date.now() + offLatchMs;
      } else if (wsReflectsShown) {
        record.shown = "pending";
        record.shownOffUntil = 0;
      } else {
        record.shown = "on";
        record.shownOffUntil = 0;
      }
      // Request-time only: do not bake cooling into the published row or the
      // icon stays disabled until some later comment republishes.
      record.featureCoolingUntil = Date.now() + coolMs;
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
