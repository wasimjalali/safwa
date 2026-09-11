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

export const PLATFORM_ICONS = {
  youtube:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8z" fill="#FF0000"/><path d="M9.6 15.6V8.4L15.8 12l-6.2 3.6z" fill="#fff"/></svg>',
  facebook:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#1877F2"/><path d="M16.7 15.5l.5-3.5h-3.3V9.7c0-.9.5-1.8 1.9-1.8h1.5V5s-1.3-.2-2.6-.2c-2.7 0-4.5 1.6-4.5 4.6V12h-3v3.5h3v8.4a12 12 0 0 0 3.7 0v-8.4h2.8z" fill="#fff"/></svg>',
  instagram:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#E4405F"/><circle cx="12" cy="12" r="4.6" fill="none" stroke="#fff" stroke-width="1.9"/><circle cx="17.4" cy="6.6" r="1.3" fill="#fff"/></svg>',
  fallback:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
};

/** Bundled platform glyph; unknown platforms get the neutral globe. */
export function platformIcon(platform) {
  const key = String(platform || "").toLowerCase();
  return PLATFORM_ICONS[key] || PLATFORM_ICONS.fallback;
}

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
      if (decision?.hide) {
        // The teacher asked for one question per person: a confirmed second
        // question is folded (reachable below), never silently dropped.
        folded.push(memberShape(record));
        continue;
      }
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
