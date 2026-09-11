/*
 * protocol.js - message contracts between the sidebar, the service worker and
 * the content session (spec Sections 3.1/3.2). Pure: no DOM, no chrome.*.
 *
 * Every message is a JSON-serializable plain object. The port carries the
 * sidebar's reading model; the runtime messages carry only validated feature
 * requests/results. Nothing here knows about StreamYard or transports.
 */

export const PORT_NAME = "safwa-panel";

export const MESSAGE_TYPES = Object.freeze({
  SUBSCRIBE: "SUBSCRIBE",
  SNAPSHOT_BEGIN: "SNAPSHOT_BEGIN",
  SNAPSHOT_CHUNK: "SNAPSHOT_CHUNK",
  SNAPSHOT_END: "SNAPSHOT_END",
  PATCH: "PATCH",
  HEALTH: "HEALTH",
  RESYNC: "RESYNC",
  RESET_SESSION: "RESET_SESSION",
  ACTION_STATUS: "ACTION_STATUS",
  FEATURE_REQUEST: "FEATURE_REQUEST",
  FEATURE_RESULT: "FEATURE_RESULT",
});

export const PROTOCOL_VERSION = 2;

/**
 * Is this an unbound handshake request (cold sidebar connect)? The port
 * connection itself authorizes identity discovery for these two types only.
 */
export function isUnboundHandshake(msg) {
  if (!isPlainObject(msg)) return false;
  const isHandshake =
    msg.type === MESSAGE_TYPES.SUBSCRIBE || msg.type === MESSAGE_TYPES.RESYNC;
  return isHandshake && !msg.documentToken && !msg.sessionEpoch;
}

export function makeEnvelope(type, fields = {}) {
  return { v: PROTOCOL_VERSION, type, ...fields };
}

function isPlainObject(value) {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** JSON-serializable plain data only (no Maps, functions, DOM nodes). */
export function isSerializable(value, depth = 0) {
  if (depth > 8) return false;
  if (value === null) return true;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return true;
  if (Array.isArray(value)) return value.every((item) => isSerializable(item, depth + 1));
  if (isPlainObject(value)) {
    return Object.values(value).every((item) => isSerializable(item, depth + 1));
  }
  return false;
}

function validToken(value) {
  return typeof value === "string" && value.length > 0;
}

/**
 * Validate a port message against the bound session.
 * @param {object} msg
 * @param {{documentToken: string, sessionEpoch: number, revision?: number}} session
 * @returns {{ok: boolean, reason?: string}}
 */
export function validatePortMessage(msg, session) {
  if (!isPlainObject(msg)) return { ok: false, reason: "notObject" };
  if (msg.v !== PROTOCOL_VERSION) return { ok: false, reason: "badVersion" };
  if (!Object.values(MESSAGE_TYPES).includes(msg.type)) {
    return { ok: false, reason: "unknownType" };
  }
  if (!validToken(msg.documentToken) || msg.documentToken !== session.documentToken) {
    return { ok: false, reason: "documentTokenMismatch" };
  }
  if (msg.sessionEpoch !== session.sessionEpoch) {
    return { ok: false, reason: "sessionEpochMismatch" };
  }
  if (!isSerializable(msg)) return { ok: false, reason: "notSerializable" };
  if (msg.type === MESSAGE_TYPES.PATCH) {
    if (msg.baseRevision !== session.revision) return { ok: false, reason: "revisionGap" };
  }
  return { ok: true };
}

const FEATURE_OUTCOMES = new Set(["clicked", "refused", "unknown"]);

export function validateFeatureRequest(req) {
  if (!isPlainObject(req)) return { ok: false, reason: "notObject" };
  if (req.v !== PROTOCOL_VERSION || req.type !== MESSAGE_TYPES.FEATURE_REQUEST) {
    return { ok: false, reason: "badType" };
  }
  if (!validToken(req.requestId)) return { ok: false, reason: "badRequestId" };
  if (!Number.isInteger(req.windowId) || !Number.isInteger(req.tabId)) {
    return { ok: false, reason: "badTarget" };
  }
  if (!validToken(req.documentToken)) return { ok: false, reason: "badDocumentToken" };
  if (!Number.isInteger(req.sessionEpoch)) return { ok: false, reason: "badSessionEpoch" };
  if (!validToken(req.sourceId)) return { ok: false, reason: "badSourceId" };
  if (typeof req.sourceRevision !== "number" && req.sourceRevision !== null) {
    return { ok: false, reason: "badSourceRevision" };
  }
  if (typeof req.expiresAt !== "number" || !Number.isFinite(req.expiresAt)) {
    return { ok: false, reason: "badExpiry" };
  }
  return { ok: true };
}

export function validateFeatureResult(res) {
  if (!isPlainObject(res)) return { ok: false, reason: "notObject" };
  if (res.v !== PROTOCOL_VERSION || res.type !== MESSAGE_TYPES.FEATURE_RESULT) {
    return { ok: false, reason: "badType" };
  }
  if (!validToken(res.requestId)) return { ok: false, reason: "badRequestId" };
  if (!FEATURE_OUTCOMES.has(res.outcome)) return { ok: false, reason: "badOutcome" };
  if (res.reasonCode != null && typeof res.reasonCode !== "string") {
    return { ok: false, reason: "badReasonCode" };
  }
  return { ok: true };
}
