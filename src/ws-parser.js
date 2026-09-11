/*
 * ws-parser.js - the only file that knows WebSocket frame shapes (v2 spec
 * Section 4.2). Pure: no DOM, no chrome.*, no clock, no state, no logging.
 *
 * parseWsFrame(raw, { endpointKey, direction }) ->
 *   {
 *     status: "ok" | "ignored" | "unknown" | "malformed",
 *     comments: NormalizedComment[],   // platformComments.created only
 *     events: NormalizedStateEvent[],  // commentUpdated / shownSet / starred
 *     unknown: DiagnosticCode[],       // unrecognized names, never guessed
 *     errors: DiagnosticCode[]         // recognized schemas that failed
 *   }
 *
 * Never throws on any input. Outbound frames and recognized-unrelated traffic
 * are "ignored"; unrecognized command/subscription names are "unknown" and can
 * never become a delete, edit, or question. A recognized comment batch that
 * fails validation produces no partial output - malformed, whole batch. Binary
 * input is unsupported (a demotion signal), not a reason to add protobuf.
 * Diagnostic codes are stable identifiers and never contain payload text.
 */

const MAX_DIAGNOSTICS = 16;
const SUPPORTED_CONTENT_TYPE = "text";

// Room commands measured in the capture that carry no comment state for Safwa.
const ROOM_IGNORED_COMMANDS = new Set([
  "participantsUpdated",
  "clientList",
  "joined",
  "connect",
  "setRoomSettings",
  "overlayImageStateUpdated",
  "roomSettingsUpdated",
  "setWorkspaceId",
  "workspaceIdUpdated",
  "musicStateUpdated",
  "soundStateUpdated",
  "setAvatar",
  "setBrandId",
  "setDisplayName",
  "participate",
  "participating",
  "updateOverlayImageState",
  "toggleHideAudioOnlyStreams",
  "toggleVideoShifting",
  "setUseSoloLayoutBackground",
  "showComment",
  "streamPlacementsUpdated",
]);

// API frame types that are handshake / liveness only.
const API_IGNORED_TYPES = new Set(["hello", "request", "ping", "pong"]);

function result(status, comments, events) {
  return {
    status,
    comments: comments ?? [],
    events: events ?? [],
    unknown: [],
    errors: [],
  };
}

function ignored() {
  return result("ignored");
}

function unknownResult(codes) {
  return { status: "unknown", comments: [], events: [], unknown: codes, errors: [] };
}

function malformed(codes) {
  return { status: "malformed", comments: [], events: [], unknown: [], errors: codes };
}

function pushDiag(list, code) {
  if (list.length >= MAX_DIAGNOSTICS) return;
  if (!list.includes(code)) list.push(code);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isIsoTimestamp(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function isBinaryFrame(raw) {
  if (typeof raw === "string") return raw.includes("\u0000");
  if (typeof ArrayBuffer !== "undefined") {
    if (raw instanceof ArrayBuffer) return true;
    if (ArrayBuffer.isView(raw)) return true;
  }
  if (typeof Blob !== "undefined" && raw instanceof Blob) return true;
  return false;
}

function validAvatarUrl(value) {
  if (!isNonEmptyString(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (!url.hostname) return null;
    return value;
  } catch {
    return null;
  }
}

/**
 * Concatenate supported text segments in array order with no invented
 * separators. An unsupported segment type rejects the whole batch.
 */
function decodeContents(contents, errors) {
  if (!Array.isArray(contents)) {
    pushDiag(errors, "comment.badContents");
    return { ok: false, text: null };
  }

  let ok = true;
  let text = "";
  for (const segment of contents) {
    if (!isPlainObject(segment) || segment.type !== SUPPORTED_CONTENT_TYPE) {
      pushDiag(errors, "unsupportedContent");
      ok = false;
      continue;
    }
    if (typeof segment.content !== "string") {
      pushDiag(errors, "comment.badContent");
      ok = false;
      continue;
    }
    text += segment.content;
  }
  return { ok, text };
}

/**
 * Broadcast/destination identity lives on the enclosing batch; an item-level
 * copy is allowed only when it agrees. Contradiction rejects the batch.
 */
function resolveBatchField(batchValue, itemValue, badCode, errors) {
  let ok = true;
  const batch = isNonEmptyString(batchValue) ? batchValue : null;
  const item = isNonEmptyString(itemValue) ? itemValue : null;

  if (batchValue != null && batch === null) {
    pushDiag(errors, badCode);
    ok = false;
  }
  if (itemValue != null && item === null) {
    pushDiag(errors, badCode);
    ok = false;
  }
  if (batch && item && batch !== item) {
    pushDiag(errors, "comment.batchIdContradiction");
    ok = false;
  }
  return { ok, value: batch ?? item };
}

function decodeComment(item, ctx, index, errors) {
  if (!isPlainObject(item)) {
    pushDiag(errors, "comment.notObject");
    return null;
  }

  let valid = true;
  if (!isNonEmptyString(item.id)) {
    pushDiag(errors, "comment.missingId");
    valid = false;
  }
  if (!isNonEmptyString(item.name)) {
    pushDiag(errors, "comment.missingName");
    valid = false;
  }
  if (!isNonEmptyString(item.platform)) {
    pushDiag(errors, "comment.missingPlatform");
    valid = false;
  }
  if (!isNonEmptyString(item.authorPlatformId)) {
    pushDiag(errors, "comment.missingAuthorPlatformId");
    valid = false;
  }
  if (!isIsoTimestamp(item.createdAt)) {
    pushDiag(errors, "comment.badCreatedAt");
    valid = false;
  }

  const display = decodeContents(item.contents, errors);
  if (!display.ok) valid = false;

  const broadcast = resolveBatchField(
    ctx.broadcastId,
    item.broadcastId,
    "comment.badBroadcastId",
    errors
  );
  const destination = resolveBatchField(
    ctx.destinationId,
    item.destinationId,
    "comment.badDestinationId",
    errors
  );
  if (!broadcast.ok || !destination.ok) valid = false;

  if (!valid) return null;

  return {
    commentId: item.id,
    handle: item.name,
    platform: item.platform.toLowerCase(),
    displayText: display.text,
    contents: item.contents,
    createdAt: item.createdAt,
    authorPlatformId: item.authorPlatformId,
    avatarLarge: validAvatarUrl(item.largeImageSrc),
    avatarSmall: validAvatarUrl(item.smallImageSrc),
    broadcastId: broadcast.value,
    destinationId: destination.value,
    sourcePos: ctx.pos,
    sentAt: ctx.sentAt,
    batchIndex: index,
  };
}

function parseAppMessage(parsed, message) {
  const body = message.body;
  if (!isPlainObject(body) || typeof body.message !== "string") {
    return malformed(["room.innerJson.missing"]);
  }

  let inner;
  try {
    inner = JSON.parse(body.message);
  } catch {
    return malformed(["room.innerJson.parseFailed"]);
  }
  if (!isPlainObject(inner)) return malformed(["room.innerJson.notObject"]);
  if (inner.type !== "platformComments.created") {
    return unknownResult(["room.appMessage.unknownInnerType"]);
  }

  const data = inner.data;
  if (!isPlainObject(data) || !Array.isArray(data.comments)) {
    return malformed(["room.comments.missing"]);
  }

  const errors = [];
  const pos = parsed.pos;
  if (pos !== undefined && pos !== null && !Number.isSafeInteger(pos)) {
    pushDiag(errors, "room.badPos");
  }
  const sentAt = message.sentAt;
  if (sentAt !== undefined && sentAt !== null && !isIsoTimestamp(sentAt)) {
    pushDiag(errors, "room.badSentAt");
  }

  const ctx = {
    pos: pos === undefined ? null : pos,
    sentAt: sentAt === undefined ? null : sentAt,
    broadcastId: data.broadcastId,
    destinationId: data.destinationId,
  };

  const comments = [];
  for (let index = 0; index < data.comments.length; index++) {
    const comment = decodeComment(data.comments[index], ctx, index, errors);
    if (comment) comments.push(comment);
  }

  if (errors.length > 0) return malformed(errors);
  return result("ok", comments);
}

function parseCommentUpdated(parsed, message) {
  const body = message.body;
  if (!isPlainObject(body) || !isPlainObject(body.comment)) {
    return malformed(["room.commentUpdated.missingComment"]);
  }

  const comment = body.comment;
  const errors = [];
  let valid = true;

  if (!isNonEmptyString(comment.id)) {
    pushDiag(errors, "comment.missingId");
    valid = false;
  }
  if (!isNonEmptyString(comment.name)) {
    pushDiag(errors, "comment.missingName");
    valid = false;
  }
  if (!isNonEmptyString(comment.platform)) {
    pushDiag(errors, "comment.missingPlatform");
    valid = false;
  }
  const pos = parsed.pos;
  if (pos !== undefined && pos !== null && !Number.isSafeInteger(pos)) {
    pushDiag(errors, "room.badPos");
    valid = false;
  }
  const sentAt = message.sentAt;
  if (sentAt !== undefined && sentAt !== null && !isIsoTimestamp(sentAt)) {
    pushDiag(errors, "room.badSentAt");
    valid = false;
  }

  if (!valid) return malformed(errors);

  return result("ok", [], [
    {
      kind: "commentUpdated",
      commentId: comment.id,
      name: comment.name,
      platform: comment.platform.toLowerCase(),
      contents: Array.isArray(comment.contents) ? comment.contents : null,
      imageSrc: isNonEmptyString(comment.imageSrc) ? comment.imageSrc : null,
      sentAt: sentAt ?? null,
      pos: pos ?? null,
    },
  ]);
}

function parseBroadcastStatus(message) {
  const payload = message.payload;
  if (!isPlainObject(payload)) return malformed(["api.payload.malformed"]);

  const broadcast = payload.broadcast;
  if (!isPlainObject(broadcast)) return malformed(["api.broadcast.missing"]);

  const shown = broadcast.shownCommentIds;
  if (shown === undefined || shown === null) return ignored();
  if (!Array.isArray(shown)) return malformed(["api.shownCommentIds.notArray"]);

  const errors = [];
  let valid = true;
  for (const id of shown) {
    if (!isNonEmptyString(id)) {
      pushDiag(errors, "api.shownCommentIds.badItem");
      valid = false;
    }
  }
  if (!isNonEmptyString(broadcast.id)) {
    pushDiag(errors, "api.broadcast.missingId");
    valid = false;
  }
  if (
    broadcast.videoRoomId !== undefined &&
    broadcast.videoRoomId !== null &&
    !isNonEmptyString(broadcast.videoRoomId)
  ) {
    pushDiag(errors, "api.broadcast.badVideoRoomId");
    valid = false;
  }
  const snapshotAt = payload.timestamp;
  if (snapshotAt !== undefined && snapshotAt !== null && !isIsoTimestamp(snapshotAt)) {
    pushDiag(errors, "api.badTimestamp");
    valid = false;
  }
  if (!valid) return malformed(errors);

  return result("ok", [], [
    {
      kind: "shownSet",
      broadcastId: broadcast.id,
      videoRoomId: broadcast.videoRoomId ?? null,
      shownCommentIds: [...shown],
      snapshotAt: snapshotAt ?? null,
    },
  ]);
}

function parseStarred(message) {
  const payload = message.payload;
  if (!isPlainObject(payload)) return malformed(["api.payload.malformed"]);

  const errors = [];
  let valid = true;
  if (!isNonEmptyString(payload.id)) {
    pushDiag(errors, "comment.missingId");
    valid = false;
  }
  if (!isIsoTimestamp(payload.starredAt)) {
    pushDiag(errors, "comment.badStarredAt");
    valid = false;
  }
  if (payload.broadcastId !== undefined && payload.broadcastId !== null && !isNonEmptyString(payload.broadcastId)) {
    pushDiag(errors, "comment.badBroadcastId");
    valid = false;
  }
  if (!valid) return malformed(errors);

  return result("ok", [], [
    {
      kind: "starred",
      commentId: payload.id,
      broadcastId: payload.broadcastId ?? null,
      starredAt: payload.starredAt,
    },
  ]);
}

function parseRoomFrame(parsed) {
  if (parsed.type === "ping" || parsed.type === "pong") return ignored();
  if (parsed.type !== "message") return unknownResult(["room.unknownType"]);

  const message = parsed.message;
  if (!isPlainObject(message)) return malformed(["room.message.malformed"]);
  const command = message.command;
  if (!isNonEmptyString(command)) return malformed(["room.missingCommand"]);

  if (command === "appMessage") return parseAppMessage(parsed, message);
  if (command === "commentUpdated") return parseCommentUpdated(parsed, message);
  if (ROOM_IGNORED_COMMANDS.has(command)) return ignored();
  return unknownResult(["room.unknownCommand"]);
}

function parseApiFrame(parsed) {
  if (API_IGNORED_TYPES.has(parsed.type)) return ignored();
  if (parsed.type !== "update") return unknownResult(["api.unknownType"]);

  const message = parsed.message;
  if (!isPlainObject(message)) return malformed(["api.message.malformed"]);

  if (message.subscription === "broadcast.status") return parseBroadcastStatus(message);
  if (message.subscription === "starredComment.starred") return parseStarred(message);
  return unknownResult(["api.update.unknownSubscription"]);
}

/**
 * Decode one raw WebSocket frame. Never throws.
 *
 * @param {string|ArrayBuffer|Uint8Array|Blob} raw - inbound frame text; binary
 *   is rejected as unsupported.
 * @param {{ endpointKey?: "room"|"api", direction?: "in"|"out" }} [options]
 * @returns {{
 *   status: "ok"|"ignored"|"unknown"|"malformed",
 *   comments: object[],
 *   events: object[],
 *   unknown: string[],
 *   errors: string[]
 * }}
 */
export function parseWsFrame(raw, options) {
  try {
    const opts = isPlainObject(options) ? options : {};

    if (opts.direction === "out") return ignored();
    if (isBinaryFrame(raw)) return malformed(["unsupportedBinary"]);
    if (typeof raw !== "string") return malformed(["frame.notString"]);

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return malformed(["frame.json.parseFailed"]);
    }
    if (!isPlainObject(parsed)) return malformed(["frame.notObject"]);

    if (opts.endpointKey === "room") return parseRoomFrame(parsed);
    if (opts.endpointKey === "api") return parseApiFrame(parsed);
    return malformed(["unsupportedEndpoint"]);
  } catch {
    return malformed(["internal"]);
  }
}
