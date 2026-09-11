/*
 * proxy-rules.js - the pure refusal matrix for the feature proxy (spec
 * Section 7). No DOM, no chrome.*; the browser caller supplies the observed
 * facts and acts on the verdict.
 *
 * Rule: never feature the wrong row. Any doubt refuses.
 */

export const REFUSE = "featureFindNative";

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
  if (record.shown === "on") return { ok: false, reasonCode: REFUSE };
  if (!liveRow) return { ok: false, reasonCode: REFUSE };
  if ((liveRow.platform ?? "") !== (record.platform ?? "")) return { ok: false, reasonCode: REFUSE };
  if (liveRow.handle !== record.handle) return { ok: false, reasonCode: REFUSE };
  if (liveRow.displayText !== record.displayText) return { ok: false, reasonCode: REFUSE };
  if (twinCount > 0) return { ok: false, reasonCode: REFUSE };
  if (buttonCount !== 1) return { ok: false, reasonCode: REFUSE };
  return { ok: true, reasonCode: null };
}
