/*
 * panel-model.js - pure projection of admission records + core decisions into
 * the serializable ViewRows the sidebar renders (spec Section 6.1). Pure: no
 * DOM, no chrome.*, no clock, no storage.
 *
 * The session owner builds `decisions` as a Map<sourceId, EnrichedDecision>:
 *   { type: "greeting"|"continuation"|"duplicate"|"primary"|"extra",
 *     hide?, count?, pendingReview?, targetSourceId?,
 *     joinedFragments?: [{ sourceId, handle, displayText, admittedAt }] }
 * This module never knows about comment objects, transports, or selectors.
 *
 * Reachability is a hard requirement (spec criterion 11): every record ends up
 * either as a row, a duplicate member, a joined fragment, or in `folded`.
 */

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

function digits(n, persian) {
  return persian ? String(n).replace(/[0-9]/g, (d) => FA_DIGITS[d]) : String(n);
}

function platformLabel(record, config) {
  const raw = typeof record?.platform === "string" ? record.platform.trim() : "";
  if (!raw) return config?.LABELS?.platformUnknown ?? "?";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function baseRow(record, config) {
  return {
    rowId: record.sourceId,
    kind: "question",
    primary: {
      sourceId: record.sourceId,
      handle: record.handle ?? "",
      platform: record.platform ?? "",
      platformLabel: platformLabel(record, config),
      displayText: record.displayText ?? "",
      avatarUrl: record.avatarUrl || record.avatarLarge || record.avatarSmall || "",
      createdAt: record.createdAt ?? null,
      admittedAt: record.admittedAt ?? null,
    },
    badges: {},
    feature: { available: false, reasonCode: null, labelKey: "featureShow" },
    shown: record.shown === "on" ? "on" : "unknown",
    starred: record.starred === "on" ? "on" : "unknown",
  };
}

/**
 * @param {Array} records admission records in admission order
 * @param {Map<string, object>} decisions sourceId -> enriched decision
 * @param {object} config CONFIG
 * @returns {{ rows: object[], folded: object[] }}
 */
export function buildViewRows(records, decisions, config) {
  const rows = [];
  const folded = [];
  const bySource = new Map();
  const rowBySource = new Map();
  const persian = config?.USE_PERSIAN_DIGITS_IN_UI === true;

  for (const record of records ?? []) {
    if (!record || !record.sourceId) continue;
    bySource.set(record.sourceId, record);
    const decision = decisions?.get?.(record.sourceId) ?? { type: "primary" };
    rowBySource.set(record.sourceId, { record, decision });
  }

  const memberShape = (record) => ({
    sourceId: record.sourceId,
    handle: record.handle ?? "",
    displayText: record.displayText ?? "",
    avatarUrl: record.avatarUrl || record.avatarLarge || record.avatarSmall || "",
    admittedAt: record.admittedAt ?? null,
  });

  const featureFor = (record, joined) => {
    const enabled =
      config?.FEATURE_PROXY_ENABLED === true && config?.PANEL_MODE === "sidebar";
    const available = enabled && record.domAnchor === true && record.shown !== "on";
    return {
      available,
      reasonCode: available ? null : "featureFindNative",
      labelKey: joined ? "featureShowFirst" : "featureShow",
    };
  };

  // Pass 1: rows for non-duplicate, non-hidden records.
  for (const record of bySource.values()) {
    const { decision } = rowBySource.get(record.sourceId);
    const type = decision?.type ?? "primary";

    if (type === "greeting" && decision?.hide) {
      folded.push(memberShape(record));
      continue;
    }
    if (type === "duplicate") continue; // folded onto the target below

    const row = baseRow(record, config);
    row.feature = featureFor(record, Array.isArray(decision?.joinedFragments));

    if (type === "continuation" && Array.isArray(decision.joinedFragments)) {
      row.badges.joined = true;
      row.joinedFragments = decision.joinedFragments.map((f) => ({
        sourceId: f.sourceId,
        handle: f.handle ?? "",
        displayText: f.displayText ?? "",
        admittedAt: f.admittedAt ?? null,
      }));
    }
    if (type === "extra") {
      row.badges.secondQuestion = true;
    }
    if (decision?.pendingReview) {
      row.badges.pendingReview = true;
    }
    rows.push(row);
  }

  const rowIndexBySource = new Map(rows.map((row, i) => [row.primary.sourceId, i]));

  // Pass 2: duplicates fold onto their target representative with a count.
  for (const record of bySource.values()) {
    const { decision } = rowBySource.get(record.sourceId);
    if (decision?.type !== "duplicate") continue;
    const targetId = decision.targetSourceId;
    const targetIndex = aroundIndex(rows, rowIndexBySource, targetId);
    if (targetIndex === -1) {
      // The target is unknown or itself folded: keep the copy reachable in a
      // folded group instead of dropping it (criterion 11).
      folded.push(memberShape(record));
      continue;
    }
    const row = rows[targetIndex];
    row.badges.count = Math.max(row.badges.count ?? 1, decision.count ?? 1);
    row.members = row.members ?? [memberShape(bySource.get(row.primary.sourceId))];
    row.members.push(memberShape(record));
  }

  for (const row of rows) {
    if (row.badges.count) {
      row.badges.countLabel = (config?.LABELS?.askedTimes ?? "{n} بار").replace(
        "{n}",
        digits(row.badges.count, persian)
      );
    }
  }

  return { rows, folded };
}

function aroundIndex(rows, indexBySource, targetId) {
  if (!targetId) return -1;
  if (indexBySource.has(targetId)) return indexBySource.get(targetId);
  for (let i = 0; i < rows.length; i++) {
    const members = rows[i].members ?? [];
    if (members.some((m) => m.sourceId === targetId)) return i;
  }
  return -1;
}

/** Health/observer state -> a LABELS key for the panel's status line. */
export function describeHealth(wsState, observerState, config) {
  const L = config?.LABELS ?? {};
  if (observerState === "unavailable") return "panelKeepCommentsOpen";
  if (observerState === "disconnected") return "panelDisconnected";
  if (observerState === "simple") return "panelSimpleMode";
  if (observerState === "loading") return "panelLoading";
  if (observerState === "waiting") return "panelWaiting";
  return "panelTitle";
}
