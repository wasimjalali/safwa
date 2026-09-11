/*
 * ws-main.js - MAIN-world, read-only WebSocket constructor tap (spec Sections
 * 2, 3.3, 4.1). Classic script: no imports, no chrome.*, no eval.
 *
 * The tap wraps only the WebSocket CONSTRUCTOR (Proxy + Reflect.construct,
 * prototype/statics/name preserved). It never wraps send(), never touches
 * prototypes or event handlers, and never synthesizes heartbeats, reconnects,
 * or connections. Allowlisted sockets get passive message/close/error
 * listeners; text frames are queued (bounded) and posted to the isolated world
 * as `safwa:ws` envelopes. The socket URL - and therefore the room/auth token
 * - never leaves this file: envelopes carry only the configured endpointKey.
 * Frame bodies (including the api hello auth) travel as untrusted page data
 * and are never logged.
 *
 * Any failure here is invisible to the page: the real constructed socket is
 * always returned and no error escapes the tap. If the page replaces
 * window.WebSocket, this script stops and the bridge notices via silence.
 */
(function () {
  "use strict";

  var MARKER = "__safwaWsTap_v1";
  if (window[MARKER]) return;

  var RealWebSocket = window.WebSocket;
  if (typeof RealWebSocket !== "function") return;

  var NS = "safwa:ws";
  var V = 1;
  var HEALTH_MS = 2000;

  /*
   * Mirrors CONFIG.WS_LIMITS in src/config.js. A MAIN-world classic script
   * cannot import the ESM config, so these protocol constants are the
   * deliberate copy; src/config.js stays the source of truth.
   */
  var LIMITS = {
    frameBytes: 65536,
    queueEnvelopes: 200,
    queueBytes: 1048576,
  };

  /*
   * Mirrors CONFIG.WS_ENDPOINTS. Matching is structural and exact via new
   * URL(); substring matching is never used. The room path is the
   * per-broadcast token, so any path is accepted for `room`; `api` is the
   * fixed /api endpoint.
   */
  var ENDPOINTS = [
    { key: "room", scheme: "wss:", host: "videows.streamyard.com", path: null },
    { key: "api", scheme: "wss:", host: "streamyard.com", path: "/api" },
  ];

  function endpointKeyFor(raw) {
    var parsed;
    try {
      parsed = new URL(String(raw));
    } catch (e) {
      return null;
    }
    for (var i = 0; i < ENDPOINTS.length; i++) {
      var endpoint = ENDPOINTS[i];
      if (parsed.protocol !== endpoint.scheme) continue;
      if (parsed.hostname !== endpoint.host) continue;
      if (endpoint.path !== null && parsed.pathname !== endpoint.path) continue;
      if (parsed.username || parsed.password) continue;
      return endpoint.key;
    }
    return null;
  }

  var encoder = typeof TextEncoder === "function" ? new TextEncoder() : null;
  function byteLength(text) {
    if (encoder) return encoder.encode(text).length;
    return text.length;
  }

  var pageToken = "pt_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  var generationCounter = 0;
  var queue = []; // { env, bytes }
  var queueBytes = 0;
  var flushScheduled = false;
  var stopped = false;
  var openSockets = Object.create(null); // socketId -> { key, gen, seq }
  var openCount = 0;
  var healthTimer = null;
  var counters = { oversize: 0, nonText: 0, queueDropped: 0 };

  var LIFECYCLE = {
    constructed: '{"event":"constructed"}',
    close: '{"event":"close"}',
    error: '{"event":"error"}',
  };

  function post(envelope) {
    try {
      window.postMessage(envelope, location.origin || "*");
    } catch (e) {
      // Fail safe: a dropped envelope never disturbs the page.
    }
  }

  function scheduleFlush() {
    if (flushScheduled || stopped) return;
    flushScheduled = true;
    if (typeof queueMicrotask === "function") queueMicrotask(flush);
    else setTimeout(flush, 0);
  }

  function flush() {
    flushScheduled = false;
    if (stopped) return;
    while (queue.length > 0) {
      post(queue.shift().env);
    }
    queueBytes = 0;
  }

  function enqueue(kind, endpointKey, socketId, generation, sequence, data, bytes) {
    if (stopped) return;
    var size = typeof bytes === "number" ? bytes : byteLength(data);
    while (queue.length >= LIMITS.queueEnvelopes || queueBytes + size > LIMITS.queueBytes) {
      if (queue.length === 0) {
        // Cannot fit even an empty queue: drop + count (never truncate frames).
        counters.queueDropped += 1;
        return;
      }
      var dropped = queue.shift();
      queueBytes -= dropped.bytes;
      counters.queueDropped += 1;
    }
    queue.push({
      bytes: size,
      env: {
        ns: NS,
        v: V,
        pageToken: pageToken,
        generation: generation,
        socketId: socketId,
        sequence: sequence,
        kind: kind,
        endpointKey: endpointKey,
        receivedAt: performance.now(),
        dataType: "text",
        data: data,
      },
    });
    queueBytes += size;
    scheduleFlush();
  }

  function stopHealth() {
    if (healthTimer !== null) {
      clearInterval(healthTimer);
      healthTimer = null;
    }
  }

  function stopAll() {
    stopped = true;
    stopHealth();
    queue.length = 0;
    queueBytes = 0;
    openSockets = Object.create(null);
    openCount = 0;
  }

  function healthTick() {
    if (stopped) return;
    if (window.WebSocket !== Tapped) {
      // The page replaced the constructor: stop; the bridge detects silence.
      stopAll();
      return;
    }
    if (openCount === 0) {
      stopHealth();
      return;
    }
    var stats =
      '{"sockets":' +
      openCount +
      ',"oversize":' +
      counters.oversize +
      ',"nonText":' +
      counters.nonText +
      ',"queueDropped":' +
      counters.queueDropped +
      "}";
    var ids = Object.keys(openSockets);
    for (var i = 0; i < ids.length; i++) {
      var socket = openSockets[ids[i]];
      enqueue("health", socket.key, ids[i], socket.gen, ++socket.seq, stats);
    }
  }

  function ensureHealth() {
    if (healthTimer === null && !stopped) {
      healthTimer = setInterval(healthTick, HEALTH_MS);
    }
  }

  function attach(socket, rawUrl) {
    var key = endpointKeyFor(rawUrl);
    if (key === null) return; // Not a configured endpoint: untouched.

    // generation increments per allowlisted construction; sequence is
    // monotonic per generation from here on.
    generationCounter += 1;
    var gen = generationCounter;
    var id = "ws-" + gen;
    var state = { key: key, gen: gen, seq: 0 };
    openSockets[id] = state;
    openCount += 1;

    enqueue("lifecycle", key, id, gen, ++state.seq, LIFECYCLE.constructed);

    socket.addEventListener("message", function (event) {
      if (stopped) return;
      try {
        var data = event && event.data;
        if (typeof data !== "string") {
          counters.nonText += 1;
          return;
        }
        var size = byteLength(data);
        if (size > LIMITS.frameBytes) {
          counters.oversize += 1;
          return;
        }
        enqueue("frame", key, id, gen, ++state.seq, data, size);
      } catch (e) {
        // Observer-only: listener errors never reach the page.
      }
    });

    socket.addEventListener("close", function () {
      try {
        if (!stopped) enqueue("lifecycle", key, id, gen, ++state.seq, LIFECYCLE.close);
      } catch (e) {
        // Fail safe.
      }
      if (openSockets[id]) {
        delete openSockets[id];
        openCount -= 1;
      }
      if (openCount <= 0) stopHealth();
    });

    socket.addEventListener("error", function () {
      try {
        if (!stopped) enqueue("lifecycle", key, id, gen, ++state.seq, LIFECYCLE.error);
      } catch (e) {
        // Fail safe.
      }
    });

    ensureHealth();
  }

  var Tapped = new Proxy(RealWebSocket, {
    construct: function (target, args, newTarget) {
      var socket = Reflect.construct(target, args, newTarget);
      try {
        attach(socket, args && args.length > 0 ? args[0] : "");
      } catch (e) {
        // Never break the page over the tap; return the real socket.
      }
      return socket;
    },
    apply: function (target, thisArg, args) {
      // WebSocket called without `new` throws natively; preserve that.
      return Reflect.apply(target, thisArg, args);
    },
  });

  try {
    Object.defineProperty(window, "WebSocket", {
      value: Tapped,
      writable: true,
      enumerable: false,
      configurable: true,
    });
  } catch (e) {
    return; // Could not install the tap; the page stays untouched.
  }

  try {
    Object.defineProperty(window, MARKER, { value: true, configurable: true });
  } catch (e) {
    // The install already happened; a failed marker only risks a double tap
    // on re-injection, which the bridge tolerates as duplicate traffic.
  }
})();
