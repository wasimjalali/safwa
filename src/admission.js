/*
 * admission.js - the transport admission coordinator (spec Section 4.3/5).
 * Pure: no DOM, no chrome.*, no logging, no clock except the injected `now`.
 *
 * The DOM observer owns admission. Socket frames are staged as bounded pending
 * candidates; `correlate()` matches them to admitted DOM occurrences by
 * platform + folded handle + normalized text inside WS_LIMITS.correlateMs. A
 * socket-only comment never becomes a record: every record has DOM evidence.
 *
 * Delivery dedupe precedes semantic dedupe. The scoped identity index
 * (broadcastId, platform, commentId) -> sourceId is authoritative; a bounded
 * recent-delivery cache rejects fast repeats before they enter the pending set.
 * Two DISTINCT ids with identical text stay two records - the core's matching
 * pipeline folds them later if the teacher's rules say so.
 *
 * Records use an opaque `src_<seq>` sourceId (never derived from text) and are
 * returned as serializable plain objects. Admission order is the immutable
 * matching order; late socket metadata never moves a row.
 */

import { foldHandle, normalize } from "./normalize.js";

const DIAGNOSTIC_LIMIT = 32;
const DELIVERY_CACHE_LIMIT = 500;

const EVENT_KINDS = new Set(["shownSet", "starred", "commentUpdated"]);

function str(value) {
  return typeof value === "string" ? value : "";
}

function platformKey(value) {
  return str(value).toLowerCase();
}

function finite(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function byteLength(value) {
  const text = typeof value === "string" ? value : "";
  if (typeof TextEncoder === "function") return new TextEncoder().encode(text).length;
  return text.length;
}

function safeAvatar(url) {
  if (typeof url !== "string" || url.length === 0) return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return "";
    if (parsed.username || parsed.password) return "";
    return url;
  } catch {
    return "";
  }
}

function joinContents(contents) {
  if (!Array.isArray(contents)) return "";
  let out = "";
  for (const segment of contents) {
    if (segment && segment.type === "text" && typeof segment.content === "string") {
      out += segment.content;
    }
  }
  return out;
}

/**
 * `(platform, authorPlatformId)` once established, else `platform::foldedHandle`.
 * Same displayed name + different stable id = different people; renamed handle +
 * same stable id = same person.
 */
/**
 * StreamYard's own English example row is studio chrome, not a viewer question.
 * Keep it in the native column; never number it in Ṣafwa.
 */
export function isStreamYardSampleComment(comment) {
  const handle = str(comment?.handle).replace(/^@/, "").trim().toLowerCase();
  if (handle !== "streamyard") return false;
  const text = str(comment?.displayText).replace(/\s+/g, " ").trim();
  return /this is an example/i.test(text) || /live viewer comments show up/i.test(text);
}

export function personKeyFor(record) {
  const platform = record?.platform ?? "?";
  if (typeof record?.authorPlatformId === "string" && record.authorPlatformId.length > 0) {
    return `${platform}::id:${record.authorPlatformId}`;
  }
  return `${platform}::${foldHandle(record?.handle)}`;
}

export function createAdmission(config, { now = () => Date.now() } = {}) {
  const cfg = config && typeof config === "object" ? config : {};
  const limits = {
    correlateMs: 1500,
    pendingCandidates: 200,
    pendingBytes: 1048576,
    ...(cfg.WS_LIMITS ?? {}),
  };
  const mode = typeof cfg.WS_MODE === "string" ? cfg.WS_MODE : "off";
  const wsActive = mode === "primary" || mode === "enrich";

  const byId = new Map();
  const order = [];
  const identityIndex = new Map();
  const deliveryCache = new Map();
  const pending = [];
  let pendingBytes = 0;
  let seq = 0;

  function diag(out, code) {
    if (out.diagnostics.length < DIAGNOSTIC_LIMIT) out.diagnostics.push(code);
  }

  function identityKey(broadcastId, platform, commentId) {
    return `${str(broadcastId)}\u0000${platformKey(platform)}\u0000${str(commentId)}`;
  }

  function matchKeyFor(displayText) {
    return normalize(displayText, cfg).matchKey;
  }

  function textsMatch(left, right) {
    const a = str(left);
    const b = str(right);
    if (a === b) return true;
    if (!a || !b) return false;
    return matchKeyFor(a) === matchKeyFor(b);
  }

  function makeIncoming(raw, key, generation) {
    if (!raw || typeof raw !== "object") return null;
    const commentId = str(raw.commentId);
    const handle = str(raw.handle);
    const platform = platformKey(raw.platform);
    const displayText = str(raw.displayText) || joinContents(raw.contents);
    if (!commentId || !handle || !platform || !displayText) return null;
    const avatarLarge = safeAvatar(raw.avatarLarge);
    const avatarSmall = safeAvatar(raw.avatarSmall);
    return {
      commentId,
      handle,
      platform,
      displayText,
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : undefined,
      authorPlatformId: str(raw.authorPlatformId) || undefined,
      broadcastId: str(raw.broadcastId) || undefined,
      destinationId: str(raw.destinationId) || undefined,
      avatarLarge: avatarLarge || undefined,
      avatarSmall: avatarSmall || undefined,
      avatarUrl: avatarLarge || avatarSmall || undefined,
      contents: Array.isArray(raw.contents) ? raw.contents : undefined,
      sourcePos: Number.isSafeInteger(raw.sourcePos) ? raw.sourcePos : undefined,
      sentAt: typeof raw.sentAt === "string" ? raw.sentAt : undefined,
      batchIndex: Number.isSafeInteger(raw.batchIndex) ? raw.batchIndex : undefined,
      receivedAt: now(),
      endpointKey: key ?? null,
      generation: generation ?? null,
    };
  }

  function setIfAbsent(record, field, value) {
    if (value === undefined || value === null || value === "") return false;
    if (record[field] !== undefined && record[field] !== null && record[field] !== "") return false;
    record[field] = value;
    return true;
  }

  function findContradiction(record, candidate) {
    if (record.createdAt && candidate.createdAt && record.createdAt !== candidate.createdAt) {
      return "createdAt";
    }
    if (
      record.authorPlatformId &&
      candidate.authorPlatformId &&
      record.authorPlatformId !== candidate.authorPlatformId
    ) {
      return "authorPlatformId";
    }
    if (record.broadcastId && candidate.broadcastId && record.broadcastId !== candidate.broadcastId) {
      return "broadcastId";
    }
    if (record.commentId && candidate.commentId && record.commentId !== candidate.commentId) {
      return "commentId";
    }
    return null;
  }

  function mergeSocket(record, candidate, mergeMode) {
    let changed = false;
    if (!record.provenance.socket) {
      record.provenance.socket = true;
      changed = true;
    }
    if (!record.provenance.correlated) {
      record.provenance.correlated = true;
      changed = true;
    }
    if (
      record.provenance.generation === null ||
      record.provenance.generation === undefined
    ) {
      if (candidate.generation !== null && candidate.generation !== undefined) {
        record.provenance.generation = candidate.generation;
        changed = true;
      }
    }

    if (mergeMode === "primary") {
      if (candidate.displayText && candidate.displayText !== record.displayText) {
        record.displayText = candidate.displayText;
        changed = true;
      }
      if (candidate.handle && candidate.handle !== record.handle) {
        record.handle = candidate.handle;
        changed = true;
      }
      if (candidate.platform && platformKey(record.platform) !== candidate.platform) {
        record.platform = candidate.platform;
        changed = true;
      }
    }

    const fields = [
      "commentId",
      "broadcastId",
      "destinationId",
      "authorPlatformId",
      "createdAt",
      "avatarLarge",
      "avatarSmall",
      "sourcePos",
      "sentAt",
      "batchIndex",
      "contents",
    ];
    for (const field of fields) {
      if (setIfAbsent(record, field, candidate[field])) changed = true;
    }

    const avatar = record.avatarLarge || record.avatarSmall || "";
    if (avatar && record.avatarUrl !== avatar) {
      record.avatarUrl = avatar;
      changed = true;
    }
    return changed;
  }

  function candidateBytes(candidate) {
    return (
      byteLength(candidate.displayText) +
      byteLength(candidate.handle) +
      byteLength(candidate.platform) +
      (candidate.contents ? byteLength(JSON.stringify(candidate.contents)) : 0)
    );
  }

  function rememberDelivery(key) {
    deliveryCache.set(key, true);
    while (deliveryCache.size > DELIVERY_CACHE_LIMIT) {
      const oldest = deliveryCache.keys().next().value;
      deliveryCache.delete(oldest);
    }
  }

  function enqueuePending(out, candidate) {
    candidate.bytes = candidateBytes(candidate);
    if (candidate.bytes > limits.pendingBytes) {
      diag(out, "pending.oversize");
      return;
    }
    while (
      pending.length > 0 &&
      (pending.length >= limits.pendingCandidates ||
        pendingBytes + candidate.bytes > limits.pendingBytes)
    ) {
      const dropped = pending.shift();
      pendingBytes -= dropped.bytes ?? 0;
      diag(out, "pending.overflow");
    }
    pending.push(candidate);
    pendingBytes += candidate.bytes;
  }

  function findDomMatch(candidate) {
    for (const record of order) {
      if (!record.provenance || record.provenance.dom !== true) continue;
      if (record.commentId && record.commentId !== candidate.commentId) continue;
      if (
        candidate.broadcastId &&
        record.broadcastId &&
        candidate.broadcastId !== record.broadcastId
      ) {
        continue;
      }
      if (platformKey(record.platform) !== platformKey(candidate.platform)) continue;
      if (foldHandle(record.handle) !== foldHandle(candidate.handle)) continue;
      if (!textsMatch(record.displayText, candidate.displayText)) continue;
      const gap = Math.abs(finite(candidate.receivedAt, 0) - finite(record.admittedAt, 0));
      if (gap > limits.correlateMs) continue;
      return record;
    }
    return null;
  }

  function findRecordByIdentity(commentId, broadcastId) {
    const id = str(commentId);
    if (!id) return null;
    const broadcast = str(broadcastId);
    for (const record of order) {
      if (record.commentId !== id) continue;
      if (broadcast && record.broadcastId && record.broadcastId !== broadcast) continue;
      return record;
    }
    return null;
  }

  return {
    /**
     * Admit a DOM occurrence. `comment` is a plain
     * { handle, platform, displayText, timestamp }. Optional commentId /
     * broadcastId / authorPlatformId are honored when the caller has them.
     * Socket correlation is performed later by correlate().
     */
    admitDom(comment, { generation } = {}) {
      const dom = comment && typeof comment === "object" ? comment : {};
      const handle = str(dom.handle);
      const platform = platformKey(dom.platform);
      const displayText = str(dom.displayText);
      const admittedAt = finite(dom.timestamp, now());
      const commentId = str(dom.commentId);
      const broadcastId = str(dom.broadcastId);
      const destinationId = str(dom.destinationId);
      const authorPlatformId = str(dom.authorPlatformId);

      if (commentId) {
        const key = identityKey(broadcastId, platform, commentId);
        const existingId = identityIndex.get(key);
        if (existingId) {
          const existing = byId.get(existingId);
          return {
            sourceId: existingId,
            record: existing,
            isNew: false,
            duplicateOf: existingId,
            rebuilt: false,
          };
        }
      }

      seq += 1;
      const sourceId = `src_${seq}`;
      const record = {
        sourceId,
        admissionSeq: seq,
        admittedAt,
        handle,
        platform,
        displayText,
        provenance: {
          dom: true,
          socket: false,
          correlated: false,
          generation: generation ?? null,
        },
        shown: "unknown",
        starred: "unknown",
        firstAdmissionOrdinal: seq,
      };
      if (commentId) record.commentId = commentId;
      if (broadcastId) record.broadcastId = broadcastId;
      if (destinationId) record.destinationId = destinationId;

      let rebuilt = false;
      if (authorPlatformId) {
        record.authorPlatformId = authorPlatformId;
        const folded = foldHandle(handle);
        rebuilt = order.some(
          (other) =>
            other.provenance?.dom === true &&
            !other.authorPlatformId &&
            platformKey(other.platform) === platform &&
            foldHandle(other.handle) === folded
        );
      }

      byId.set(sourceId, record);
      order.push(record);
      if (record.commentId) {
        identityIndex.set(
          identityKey(record.broadcastId, record.platform, record.commentId),
          sourceId
        );
      }
      return { sourceId, record, isNew: true, duplicateOf: null, rebuilt };
    },

    /**
     * Read a parseWsFrame result defensively. Stages new candidates, merges
     * repeated deliveries of known ids, and hands back validated state events
     * for applyStateEvents(). Never throws, never mutates on a bad result.
     */
    ingestSocket(parseResult, { generation, endpointKey } = {}) {
      const out = { updated: [], events: [], diagnostics: [] };
      if (!parseResult || typeof parseResult !== "object") {
        diag(out, "parse.invalid");
        return out;
      }
      if (mode === "off") return out;

      const comments = Array.isArray(parseResult.comments) ? parseResult.comments : [];
      const events = Array.isArray(parseResult.events) ? parseResult.events : [];
      for (const code of Array.isArray(parseResult.errors) ? parseResult.errors : []) {
        diag(out, `parser.${str(code)}`);
      }
      for (const code of Array.isArray(parseResult.unknown) ? parseResult.unknown : []) {
        diag(out, `parser.${str(code)}`);
      }

      const status = typeof parseResult.status === "string" ? parseResult.status : "ok";
      if (status !== "ok") {
        diag(out, `parse.${status}`);
        return out;
      }

      if (mode === "log") {
        diag(out, `log.comments:${comments.length}`);
        diag(out, `log.events:${events.length}`);
        return out;
      }

      for (const raw of comments) {
        const candidate = makeIncoming(raw, endpointKey, generation);
        if (!candidate) {
          diag(out, "comment.invalid");
          continue;
        }
        const key = identityKey(candidate.broadcastId, candidate.platform, candidate.commentId);
        const existingId = identityIndex.get(key);
        if (existingId) {
          const record = byId.get(existingId);
          const contradiction = findContradiction(record, candidate);
          if (contradiction) {
            diag(out, `contradiction.${contradiction}`);
          } else if (mergeSocket(record, candidate, mode)) {
            out.updated.push(record);
          }
          diag(out, "comment.duplicateDelivery");
          continue;
        }
        if (deliveryCache.has(key)) {
          diag(out, "comment.duplicateDelivery");
          continue;
        }
        rememberDelivery(key);
        enqueuePending(out, candidate);
        diag(out, "comment.pending");
      }

      for (const event of events) {
        if (!event || typeof event !== "object") {
          diag(out, "event.invalid");
          continue;
        }
        if (EVENT_KINDS.has(event.kind)) out.events.push(event);
        else diag(out, "event.unknown");
      }
      return out;
    },

    /**
     * Sweep pending socket candidates: match to admitted DOM occurrences inside
     * the correlation window, drop the ones past the deadline. DOM admission is
     * never delayed - callers invoke this after admitting DOM occurrences.
     */
    correlate() {
      const out = { updated: [], events: [], diagnostics: [] };
      if (!wsActive) return out;
      const at = now();
      for (let index = 0; index < pending.length; ) {
        const candidate = pending[index];
        const record = findDomMatch(candidate);
        if (record) {
          const contradiction = findContradiction(record, candidate);
          if (contradiction) {
            diag(out, `contradiction.${contradiction}`);
          } else {
            if (mergeSocket(record, candidate, mode)) out.updated.push(record);
            identityIndex.set(
              identityKey(candidate.broadcastId, candidate.platform, candidate.commentId),
              record.sourceId
            );
            diag(out, "correlate.matched");
          }
          pendingBytes -= candidate.bytes ?? 0;
          pending.splice(index, 1);
          continue;
        }
        if (at - finite(candidate.receivedAt, at) > limits.correlateMs) {
          pendingBytes -= candidate.bytes ?? 0;
          pending.splice(index, 1);
          diag(out, "correlate.timeout");
          continue;
        }
        index += 1;
      }
      return out;
    },

    /**
     * Apply shownSet / starred / commentUpdated to associated records.
     * shownSet replaces the whole shown set (explicit array only; multiple ids
     * allowed). starred is positive-only. commentUpdated only sets
     * stageUpdated and never implies shown. DOM/log modes leave shown/starred
     * at "unknown".
     */
    applyStateEvents(events) {
      const out = { updated: [] };
      if (!Array.isArray(events) || events.length === 0) return out;
      for (const event of events) {
        if (!event || typeof event !== "object") continue;

        if (event.kind === "shownSet") {
          if (!wsActive) continue;
          if (!Array.isArray(event.shownCommentIds)) continue;
          const shown = new Set(
            event.shownCommentIds.filter((id) => typeof id === "string")
          );
          const broadcastId = str(event.broadcastId);
          for (const record of order) {
            if (!record.commentId) continue;
            if (broadcastId && record.broadcastId && record.broadcastId !== broadcastId) {
              continue;
            }
            let next;
            if (shown.has(record.commentId)) {
              if (typeof record.shownOffUntil === "number" && now() < record.shownOffUntil) {
                // Teacher just took it off air; a lagging snapshot that still
                // lists the id must not flip the icon back on (and invert the
                // next click).
                next = record.shown === "pending" ? "pending" : "unknown";
              } else {
                next = "on";
              }
            } else if (record.shown === "pending") {
              // Sticky latch: a snapshot generated before our validated click
              // must not re-arm the button (measured snapshot lag ~10s).
              next = "pending";
            } else {
              next = "unknown";
            }
            if (record.shown !== next) {
              record.shown = next;
              out.updated.push(record);
            }
          }
        } else if (event.kind === "starred") {
          if (!wsActive) continue;
          const record = findRecordByIdentity(event.commentId, event.broadcastId);
          if (!record) continue;
          if (record.starred !== "on") {
            record.starred = "on";
            out.updated.push(record);
          }
        } else if (event.kind === "commentUpdated") {
          const record = findRecordByIdentity(event.commentId, event.broadcastId);
          if (!record) continue;
          if (record.stageUpdated !== true) {
            record.stageUpdated = true;
            out.updated.push(record);
          }
        }
      }
      return out;
    },

    /** Insertion-ordered admitted records (read-only to callers). */
    records() {
      return order.slice();
    },

    getRecord(sourceId) {
      return byId.get(sourceId) ?? null;
    },

    /** Clear every index, candidate and counter for a fresh session. */
    reset() {
      byId.clear();
      order.length = 0;
      identityIndex.clear();
      deliveryCache.clear();
      pending.length = 0;
      pendingBytes = 0;
      seq = 0;
    },

    /** Highest assigned admission sequence (0 before the first admission). */
    currentSequence() {
      return seq;
    },
  };
}
