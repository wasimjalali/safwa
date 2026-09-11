/*
 * proxy-rules.js - the pure refusal matrix for the feature proxy (spec
 * Section 7). No DOM, no chrome.*; the browser caller supplies the observed
 * facts and acts on the verdict.
 *
 * Rule: never feature the wrong row. Any doubt refuses.
 */

export const REFUSE = "featureFindNative";

/** Duplicate copies fold onto one card; they are not ambiguous twins. */
export function featureGroupId(sourceId, decision) {
  if (decision?.type === "duplicate" && typeof decision.targetSourceId === "string" && decision.targetSourceId) {
    return decision.targetSourceId;
  }
  return sourceId;
}

export function sameFeatureGroup(sourceId, otherId, sourceDecision, otherDecision) {
  return featureGroupId(sourceId, sourceDecision) === featureGroupId(otherId, otherDecision);
}

/**
 * Which same-group occurrence to click. A lone row stays that row. Several
 * live copies of one question: put the newest on air — StreamYard often
 * no-ops the first recycled slot. Turning off keeps the requested row.
 * Another author's copy is never a candidate (`sameIdentity` must be true).
 */
export function pickFeatureCandidate(candidates, { requestedId, wantOn = true } = {}) {
  const live = (candidates ?? []).filter(
    (c) => c && c.connected && c.sameIdentity && c.hasButton
  );
  if (live.length === 0) return null;
  if (live.length === 1 || wantOn === false) {
    return live.find((c) => c.id === requestedId)?.id ?? live[0].id;
  }
  return live.slice().sort((a, b) => (b.admissionSeq ?? 0) - (a.admissionSeq ?? 0))[0].id;
}

/**
 * @param {object} facts
 * @param {object} facts.request   validated FEATURE_REQUEST payload
 * @param {{documentToken: string, sessionEpoch: number}} facts.session
 * @param {object|null} facts.record
 * @param {boolean} facts.anchorConnected
 * @param {{platform?: string, handle?: string, displayText?: string}|null} facts.liveRow
 * @param {number} facts.twinCount   other connected rows with the same fingerprint
 * @param {number} facts.buttonCount enabled show-button candidates in the row
 * @param {boolean} facts.enabled    CONFIG.FEATURE_PROXY_ENABLED
 * @param {number} facts.now
 * @returns {{ok: boolean, reasonCode: string|null}}
 */
export function checkFeatureRequest(facts) {
  const {
    request,
    session,
    record,
    anchorConnected,
    liveRow,
    twinCount,
    buttonCount,
    enabled,
    now,
  } = facts;

  if (!enabled) return { ok: false, reasonCode: REFUSE };
  if (!request || typeof request !== "object") return { ok: false, reasonCode: REFUSE };
  if (request.documentToken !== session.documentToken) return { ok: false, reasonCode: REFUSE };
  if (request.sessionEpoch !== session.sessionEpoch) return { ok: false, reasonCode: REFUSE };
  if (typeof request.expiresAt !== "number" || now > request.expiresAt) {
    return { ok: false, reasonCode: REFUSE };
  }
  if (!record || !anchorConnected) return { ok: false, reasonCode: REFUSE };
  if (
    typeof request.sourceRevision === "number" &&
    request.sourceRevision !== record.admissionSeq
  ) {
    return { ok: false, reasonCode: REFUSE };
  }
  if (record.shown === "pending") {
    return { ok: false, reasonCode: REFUSE };
  }
  if (!liveRow) return { ok: false, reasonCode: REFUSE };
  if ((liveRow.platform ?? "") !== (record.platform ?? "")) return { ok: false, reasonCode: REFUSE };
  if (liveRow.handle !== record.handle) return { ok: false, reasonCode: REFUSE };
  if (liveRow.displayText !== record.displayText) return { ok: false, reasonCode: REFUSE };
  if (twinCount > 0) return { ok: false, reasonCode: REFUSE };
  if (buttonCount !== 1) return { ok: false, reasonCode: REFUSE };
  return { ok: true, reasonCode: null };
}
