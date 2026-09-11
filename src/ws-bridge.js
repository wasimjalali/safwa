/*
 * ws-bridge.js - ISOLATED-world front door for ws-main.js (spec Sections 2,
 * 3.3, 8). Classic script; the manifest loads it immediately before
 * content.js in the same content_scripts entry, so no envelope can be missed
 * between the two. No chrome.* APIs.
 *
 * Every safwa:ws window message is validated: same window, same origin,
 * namespace + version, first-envelope pageToken handshake, monotonic sequence
 * per generation, data size, and rolling one-second envelope/byte rates.
 * Valid events are queued (bounded) until a subscriber arrives, then handed
 * over. Rate, size, sequence and queue violations LATCH demotion for the
 * document and notify subscribers once; the DOM path continues untouched.
 *
 * Bridge traffic is untrusted page data: it can never authorize a native
 * action, change a preference, or create/hide/count a question on its own.
 *
 * Exposed API (isolated world):
 *   window.createBridge({ now } = {}) -> { subscribe, state, noteSessionReady }
 *   window.__safwaWsBridge            -> singleton with the same API
 *
 * subscribe(fn) -> unsubscribe; fn receives validated events:
 *   frame    { kind:"frame", endpointKey, socketId, generation, sequence,
 *              receivedAt, dataType:"text", data }
 *   lifecycle/health carry the same shape (data is a small JSON string).
 *   demote   { kind:"demote", reason }
 */
(function () {
  "use strict";

  var NS = "safwa:ws";
  var V = 1;
  var RATE_WINDOW_MS = 1000;

  /*
   * Mirrors CONFIG.WS_LIMITS in src/config.js; a classic ISOLATED script
   * cannot import the ESM config before content.js runs.
   */
  var LIMITS = {
    frameBytes: 65536,
    envelopesPerSec: 200,
    bytesPerSec: 1048576,
    queueEnvelopes: 200,
    queueBytes: 1048576,
  };

  var encoder = typeof TextEncoder === "function" ? new TextEncoder() : null;
  function byteLength(text) {
    if (encoder) return encoder.encode(text).length;
    return text.length;
  }

  function createBridge(options) {
    var now =
      options && typeof options.now === "function"
        ? options.now
        : function () {
            return Date.now();
          };

    var handshakeToken = null;
    var demoted = false;
    var demoteReason = null;
    var latestGeneration = 0;
    var queue = []; // { event, bytes }
    var queueBytes = 0;
    var subscribers = [];
    var lastSequence = Object.create(null); // generation -> last sequence
    var rateWindow = []; // { at, bytes }
    var windowBytes = 0;

    function notify(event) {
      for (var i = 0; i < subscribers.length; i++) {
        try {
          subscribers[i](event);
        } catch (e) {
          // One subscriber's failure never blocks the others.
        }
      }
    }

    function demote(reason) {
      if (demoted) return;
      demoted = true;
      demoteReason = reason;
      queue = [];
      queueBytes = 0;
      notify({ kind: "demote", reason: reason });
    }

    function deliver(event, bytes) {
      if (demoted) return;
      if (subscribers.length > 0) {
        notify(event);
        return;
      }
      if (queue.length >= LIMITS.queueEnvelopes || queueBytes + bytes > LIMITS.queueBytes) {
        // Never truncate into the parser: overflow latches demotion.
        demote("queueOverflow");
        return;
      }
      queue.push({ event: event, bytes: bytes });
      queueBytes += bytes;
    }

    function pruneRate(at) {
      while (rateWindow.length > 0 && at - rateWindow[0].at >= RATE_WINDOW_MS) {
        windowBytes -= rateWindow.shift().bytes;
      }
    }

    function inspect(envelope) {
      if (!envelope || typeof envelope !== "object") return "envelopeInvalid";
      if (envelope.ns !== NS || envelope.v !== V) return "envelopeInvalid";
      if (
        envelope.kind !== "frame" &&
        envelope.kind !== "lifecycle" &&
        envelope.kind !== "health"
      ) {
        return "envelopeInvalid";
      }
      if (envelope.endpointKey !== "room" && envelope.endpointKey !== "api") {
        return "envelopeInvalid";
      }
      if (typeof envelope.pageToken !== "string" || envelope.pageToken.length === 0) {
        return "envelopeInvalid";
      }
      if (typeof envelope.socketId !== "string" || envelope.socketId.length === 0) {
        return "envelopeInvalid";
      }
      if (!Number.isSafeInteger(envelope.generation) || envelope.generation <= 0) {
        return "envelopeInvalid";
      }
      if (!Number.isSafeInteger(envelope.sequence) || envelope.sequence <= 0) {
        return "envelopeInvalid";
      }
      if (typeof envelope.receivedAt !== "number" || !Number.isFinite(envelope.receivedAt)) {
        return "envelopeInvalid";
      }
      if (envelope.dataType !== "text" || typeof envelope.data !== "string") {
        return "envelopeInvalid";
      }
      return null;
    }

    function onMessage(event) {
      if (demoted) return;
      try {
        if (event.source !== window) return;
        if (event.origin !== location.origin) return;
        var envelope = event.data;
        if (!envelope || typeof envelope !== "object") return;
        if (envelope.ns !== NS || envelope.v !== V) return; // not ours: ignore

        var invalid = inspect(envelope);
        if (invalid !== null) {
          demote(invalid);
          return;
        }

        var bytes = byteLength(envelope.data);
        if (bytes > LIMITS.frameBytes) {
          demote("frameOversize");
          return;
        }

        if (handshakeToken === null) {
          handshakeToken = envelope.pageToken;
        } else if (envelope.pageToken !== handshakeToken) {
          demote("pageTokenMismatch");
          return;
        }

        var last = lastSequence[envelope.generation] || 0;
        if (envelope.sequence <= last) {
          demote("sequenceRegression");
          return;
        }

        var at = now();
        pruneRate(at);
        if (rateWindow.length + 1 > LIMITS.envelopesPerSec) {
          demote("rateEnvelopes");
          return;
        }
        if (windowBytes + bytes > LIMITS.bytesPerSec) {
          demote("rateBytes");
          return;
        }
        rateWindow.push({ at: at, bytes: bytes });
        windowBytes += bytes;
        lastSequence[envelope.generation] = envelope.sequence;
        if (envelope.generation > latestGeneration) latestGeneration = envelope.generation;

        deliver(
          {
            kind: envelope.kind,
            endpointKey: envelope.endpointKey,
            socketId: envelope.socketId,
            generation: envelope.generation,
            sequence: envelope.sequence,
            receivedAt: envelope.receivedAt,
            dataType: "text",
            data: envelope.data,
          },
          bytes
        );
      } catch (e) {
        // Fail safe around page-provided data.
      }
    }

    function drainTo(fn) {
      if (queue.length === 0) return;
      var backlog = queue;
      queue = [];
      queueBytes = 0;
      for (var i = 0; i < backlog.length; i++) {
        try {
          fn(backlog[i].event);
        } catch (e) {
          // Subscriber failures are isolated.
        }
      }
    }

    function subscribe(fn) {
      if (typeof fn !== "function") return function () {};
      drainTo(fn);
      subscribers.push(fn);
      if (demoted) {
        try {
          fn({ kind: "demote", reason: demoteReason });
        } catch (e) {
          // Isolated.
        }
      }
      var active = true;
      return function unsubscribe() {
        if (!active) return;
        active = false;
        var index = subscribers.indexOf(fn);
        if (index >= 0) subscribers.splice(index, 1);
      };
    }

    function state() {
      return {
        handshake: handshakeToken !== null,
        demoted: demoted,
        reason: demoteReason,
        queued: queue.length,
        generation: latestGeneration,
      };
    }

    function noteSessionReady() {
      // The session owner is live; hand over anything buffered (subscribe
      // normally drains already, so this is idempotent and safe to re-call).
      // With no subscriber yet the queue is kept, never dropped.
      if (subscribers.length > 0) {
        drainTo(function (event) {
          notify(event);
        });
      }
      return state();
    }

    try {
      window.addEventListener("message", onMessage);
    } catch (e) {
      // Without a listener the bridge stays quiet; the DOM path continues.
    }

    return {
      subscribe: subscribe,
      state: state,
      noteSessionReady: noteSessionReady,
    };
  }

  window.createBridge = createBridge;
  window.__safwaWsBridge = createBridge();
})();
