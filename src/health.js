/*
 * health.js - transport health and one-way demotion (spec Sections 8 and 9.1).
 * Pure: no DOM, no chrome.*, no logging. The clock is injected so every
 * threshold is deterministic in Node tests.
 *
 * Three capabilities are tracked independently:
 *   bridge - the MAIN-world observer / postMessage path (handshake + health)
 *   room   - the videows socket, which carries comment acquisition
 *   api    - the streamyard.com/api socket, which carries shown/starred state
 *
 * A demotion is terminal for the document: once a capability is demoted, later
 * traffic never raises it. The one deliberate exception is api silence, which
 * is staleness, not demotion - it marks the state "unknown" (no on-air claims)
 * and a later inbound frame restores "ok". Room silence does demote, because
 * comment acquisition is the path being protected by the rail.
 *
 * effectiveSource is derived, never set: "websocket" only in primary mode with
 * a healthy bridge and a room that has not been demoted; otherwise "dom". The
 * runtime can only lower it.
 */

const DEFAULT_LIMITS = {
  handshakeMs: 2000,
  bridgeHealthMs: 4000,
  roomSilenceMs: 6000,
  apiSilenceMs: 75000,
  unknownSchemaConsecutive: 3,
  unknownSchemaPer30s: 5,
};

const UNKNOWN_WINDOW_MS = 30000;

function endpointKey(value) {
  return value === "room" || value === "api" ? value : null;
}

export function createHealth(config, { now = () => Date.now() } = {}) {
  const limits = { ...DEFAULT_LIMITS, ...(config?.WS_LIMITS ?? {}) };
  const wsMode = config?.WS_MODE ?? "off";
  const createdAt = now();

  function makeCapability() {
    return {
      state: "unknown",
      reason: null,
      latched: false,
      lastTraffic: createdAt,
      unknownConsecutive: 0,
      unknownWindow: [],
    };
  }

  const caps = { room: makeCapability(), api: makeCapability() };
  const bridge = {
    state: "unknown",
    reason: null,
    latched: false,
    handshakeSeen: false,
    lastHealth: createdAt,
  };

  function demote(target, reason) {
    if (!target || target.latched) return;
    target.latched = true;
    target.state = "demoted";
    target.reason = reason;
  }

  function markLive(cap) {
    if (!cap || cap.latched) return;
    cap.state = "ok";
    cap.reason = null;
  }

  function pruneWindow(cap, at) {
    while (cap.unknownWindow.length > 0 && at - cap.unknownWindow[0] > UNKNOWN_WINDOW_MS) {
      cap.unknownWindow.shift();
    }
  }

  function countUnknown(key, at) {
    const cap = caps[key];
    if (!cap || cap.latched) return;
    cap.unknownConsecutive += 1;
    cap.unknownWindow.push(at);
    pruneWindow(cap, at);
    if (
      cap.unknownConsecutive >= limits.unknownSchemaConsecutive ||
      cap.unknownWindow.length >= limits.unknownSchemaPer30s
    ) {
      demote(cap, "unknownSchema");
    }
  }

  function snapshot() {
    const roomDemoted = caps.room.state === "demoted";
    return {
      room: { state: caps.room.state, reason: caps.room.reason },
      api: { state: caps.api.state, reason: caps.api.reason },
      bridge: { state: bridge.state, reason: bridge.reason },
      effectiveSource:
        wsMode === "primary" && bridge.state === "ok" && !roomDemoted
          ? "websocket"
          : "dom",
      demoted: roomDemoted || caps.api.state === "demoted" || bridge.state === "demoted",
    };
  }

  return {
    /** The bridge handshake was observed. */
    noteBridgeHandshake() {
      const at = now();
      bridge.handshakeSeen = true;
      bridge.lastHealth = at;
      markLive(bridge);
    },

    /** An inbound frame reached the bridge/session. meta is reserved. */
    noteBridgeFrame(key, meta) {
      void meta;
      const at = now();
      bridge.lastHealth = at;
      const cap = caps[endpointKey(key)];
      if (!cap) return;
      cap.lastTraffic = at;
      markLive(cap);
    },

    /** A page socket was constructed; give it a fresh silence window. */
    noteSocketConstructed(key) {
      const cap = caps[endpointKey(key)];
      if (!cap) return;
      cap.lastTraffic = now();
    },

    /** kind: "close" | "error" | "replaced" - demote the affected socket now. */
    noteSocketEnded(key, kind) {
      const cap = caps[endpointKey(key)];
      if (!cap) return;
      const reason =
        kind === "replaced" ? "socketReplaced" : kind === "error" ? "socketError" : "socketClosed";
      demote(cap, reason);
    },

    /** Parser outcome for one frame. "malformed" demotes that endpoint now. */
    noteParse(status, key) {
      const at = now();
      bridge.lastHealth = at;
      const cap = caps[endpointKey(key)];
      if (cap) cap.lastTraffic = at;
      switch (status) {
        case "ok":
        case "ignored":
          if (cap) {
            cap.unknownConsecutive = 0;
            markLive(cap);
          }
          break;
        case "unknown":
          if (cap) countUnknown(endpointKey(key), at);
          break;
        case "malformed":
          if (cap) demote(cap, "parseMalformed");
          break;
        default:
          break;
      }
    },

    /** An unrecognized but relevant schema was seen on the endpoint. */
    noteUnknownSchema(key) {
      const cap = caps[endpointKey(key)];
      if (!cap) return;
      countUnknown(endpointKey(key), now());
    },

    /** Contradictory identity/content on the endpoint demotes it now. */
    noteContradiction(key) {
      const cap = caps[endpointKey(key)];
      if (!cap) return;
      demote(cap, "contradiction");
    },

    /**
     * A reconnect/new generation was observed. Per-generation counters and
     * silence baselines restart; no state is raised and latches are untouched.
     */
    noteConnectionGeneration(generation) {
      void generation;
      const at = now();
      for (const key of ["room", "api"]) {
        const cap = caps[key];
        cap.lastTraffic = at;
        cap.unknownConsecutive = 0;
        cap.unknownWindow = [];
      }
    },

    /** Evaluate time-based thresholds; returns the current snapshot. */
    tick() {
      const at = now();
      if (!bridge.latched) {
        if (!bridge.handshakeSeen && at - createdAt >= limits.handshakeMs) {
          demote(bridge, "bridgeNoHandshake");
        } else if (at - bridge.lastHealth >= limits.bridgeHealthMs) {
          demote(bridge, "bridgeNoHealth");
        }
      }

      if (!caps.room.latched && at - caps.room.lastTraffic >= limits.roomSilenceMs) {
        demote(caps.room, "roomSilence");
      }

      if (!caps.api.latched && at - caps.api.lastTraffic >= limits.apiSilenceMs) {
        if (caps.api.state !== "unknown" || caps.api.reason !== "apiSilence") {
          caps.api.state = "unknown";
          caps.api.reason = "apiSilence";
        }
      }

      pruneWindow(caps.room, at);
      pruneWindow(caps.api, at);
      return snapshot();
    },

    snapshot,
  };
}
