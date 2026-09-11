/*
 * health-test.js - fake-clock coverage of every Section 8 transport threshold
 * and the one-way demotion latch (spec Section 12). The health module is pure,
 * so the whole failure model runs here without a browser.
 */

import assert from "node:assert/strict";

import { CONFIG } from "../src/config.js";
import { createHealth } from "../src/health.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${e.message}`);
    failed++;
  }
}

function clock(start = 0) {
  let current = start;
  return {
    now: () => current,
    set(value) {
      current = value;
    },
    advance(ms) {
      current += ms;
    },
  };
}

function healthFor(mode = "primary") {
  const fake = clock(0);
  return { health: createHealth({ ...CONFIG, WS_MODE: mode }, { now: fake.now }), clock: fake };
}

// =====================================================================
console.log("\nhealth.js - bridge thresholds");

test("bridge starts unknown and turns ok on the handshake", () => {
  const { health, clock: fake } = healthFor();
  assert.deepEqual(health.snapshot().bridge, { state: "unknown", reason: null });
  fake.set(500);
  health.noteBridgeHandshake();
  assert.deepEqual(health.snapshot().bridge, { state: "ok", reason: null });
});

test("missing handshake by handshakeMs demotes the bridge and latches", () => {
  const { health, clock: fake } = healthFor();
  fake.set(CONFIG.WS_LIMITS.handshakeMs - 1);
  health.tick();
  assert.equal(health.snapshot().bridge.state, "unknown");

  fake.set(CONFIG.WS_LIMITS.handshakeMs);
  health.tick();
  assert.deepEqual(health.snapshot().bridge, { state: "demoted", reason: "bridgeNoHandshake" });

  fake.advance(1000);
  health.noteBridgeHandshake();
  health.tick();
  assert.equal(health.snapshot().bridge.state, "demoted", "a late handshake cannot raise a latch");
});

test("missing bridge health after bridgeHealthMs demotes the bridge", () => {
  const { health, clock: fake } = healthFor();
  health.noteBridgeHandshake();
  fake.set(CONFIG.WS_LIMITS.bridgeHealthMs - 1);
  health.tick();
  assert.equal(health.snapshot().bridge.state, "ok");

  fake.set(CONFIG.WS_LIMITS.bridgeHealthMs);
  health.tick();
  assert.deepEqual(health.snapshot().bridge, { state: "demoted", reason: "bridgeNoHealth" });
});

test("inbound frames keep the bridge healthy", () => {
  const { health, clock: fake } = healthFor();
  health.noteBridgeHandshake();
  for (let second = 1; second <= 5; second++) {
    fake.set(second * 3000);
    health.noteBridgeFrame("room");
    health.tick();
    assert.equal(health.snapshot().bridge.state, "ok");
  }
});

// =====================================================================
console.log("\nhealth.js - socket failures");

test("constructor replacement / close / error demote immediately", () => {
  const { health } = healthFor();
  health.noteSocketEnded("room", "replaced");
  assert.deepEqual(health.snapshot().room, { state: "demoted", reason: "socketReplaced" });
  assert.equal(health.snapshot().api.state, "unknown");

  health.noteSocketEnded("api", "close");
  assert.deepEqual(health.snapshot().api, { state: "demoted", reason: "socketClosed" });

  health.noteSocketEnded("api", "error");
  assert.equal(health.snapshot().api.reason, "socketClosed", "the first demotion reason sticks");
});

test("a malformed recognized frame demotes its endpoint immediately", () => {
  const { health } = healthFor();
  health.noteParse("malformed", "room");
  assert.deepEqual(health.snapshot().room, { state: "demoted", reason: "parseMalformed" });
  assert.equal(health.snapshot().api.state, "unknown", "room parsing never demotes the api socket");

  health.noteParse("malformed", "api");
  assert.deepEqual(health.snapshot().api, { state: "demoted", reason: "parseMalformed" });
});

test("a contradiction demotes the affected endpoint immediately", () => {
  const { health } = healthFor();
  health.noteContradiction("room");
  assert.deepEqual(health.snapshot().room, { state: "demoted", reason: "contradiction" });
  assert.equal(health.snapshot().api.state, "unknown");
});

// =====================================================================
console.log("\nhealth.js - unknown-schema thresholds");

test("three consecutive unknown schemas demote the endpoint", () => {
  const { health } = healthFor();
  health.noteUnknownSchema("room");
  health.noteUnknownSchema("room");
  assert.equal(health.snapshot().room.state, "unknown");

  health.noteUnknownSchema("room");
  assert.deepEqual(health.snapshot().room, { state: "demoted", reason: "unknownSchema" });
});

test("a recognized frame resets the consecutive unknown counter", () => {
  const { health } = healthFor();
  health.noteUnknownSchema("room");
  health.noteUnknownSchema("room");
  health.noteParse("ok", "room");
  health.noteUnknownSchema("room");
  health.noteUnknownSchema("room");
  assert.notEqual(
    health.snapshot().room.state,
    "demoted",
    "two more unknowns are not three in a row"
  );
});

test("five unknown schemas within 30 seconds demote even when interleaved", () => {
  const { health, clock: fake } = healthFor();
  for (let i = 0; i < 4; i++) {
    fake.set(i * 1000);
    health.noteUnknownSchema("room");
    health.noteParse("ok", "room");
  }
  fake.set(4000);
  health.noteUnknownSchema("room");
  assert.deepEqual(health.snapshot().room, { state: "demoted", reason: "unknownSchema" });
});

test("the unknown-schema window expires after 30 seconds", () => {
  const { health, clock: fake } = healthFor();
  for (let i = 0; i < 4; i++) {
    fake.set(i * 1000);
    health.noteUnknownSchema("room");
    health.noteParse("ok", "room");
  }
  fake.set(31000);
  health.noteBridgeFrame("room");
  health.tick();
  health.noteUnknownSchema("room");
  assert.notEqual(
    health.snapshot().room.state,
    "demoted",
    "old unknowns must fall out of the window"
  );
});

// =====================================================================
console.log("\nhealth.js - traffic silence");

test("room silence demotes room at roomSilenceMs and never recovers", () => {
  const { health, clock: fake } = healthFor();
  health.noteBridgeHandshake();
  health.noteSocketConstructed("room");
  fake.set(CONFIG.WS_LIMITS.roomSilenceMs - 1);
  health.tick();
  assert.equal(health.snapshot().room.state, "unknown");

  fake.set(CONFIG.WS_LIMITS.roomSilenceMs);
  health.tick();
  assert.deepEqual(health.snapshot().room, { state: "demoted", reason: "roomSilence" });

  fake.advance(10000);
  health.noteBridgeFrame("room");
  assert.equal(health.snapshot().room.state, "demoted", "silence demotion latches for the document");
});

test("api silence marks state unknown (stale) without latching; a frame restores ok", () => {
  const { health, clock: fake } = healthFor();
  health.noteBridgeHandshake();
  health.noteBridgeFrame("api");
  assert.equal(health.snapshot().api.state, "ok");

  for (let at = 3000; at <= CONFIG.WS_LIMITS.apiSilenceMs; at += 3000) {
    fake.set(at);
    health.noteBridgeFrame("room");
    health.tick();
  }
  assert.deepEqual(health.snapshot().api, { state: "unknown", reason: "apiSilence" });
  assert.equal(health.snapshot().demoted, false, "staleness is not a demotion");

  fake.set(CONFIG.WS_LIMITS.apiSilenceMs + 1000);
  health.noteBridgeFrame("api");
  assert.deepEqual(health.snapshot().api, { state: "ok", reason: null });
});

test("a new connection generation restarts silence windows without raising latches", () => {
  const { health, clock: fake } = healthFor();
  health.noteSocketConstructed("room");
  fake.set(5000);
  health.noteConnectionGeneration(2);

  fake.set(5000 + CONFIG.WS_LIMITS.roomSilenceMs - 1);
  health.tick();
  assert.equal(health.snapshot().room.state, "unknown");

  fake.set(5000 + CONFIG.WS_LIMITS.roomSilenceMs);
  health.tick();
  assert.equal(health.snapshot().room.state, "demoted");
  health.noteConnectionGeneration(3);
  assert.equal(health.snapshot().room.state, "demoted", "a reconnect never resurrects a demotion");
});

// =====================================================================
console.log("\nhealth.js - effectiveSource");

test("effectiveSource follows mode, bridge health and room demotion only", () => {
  const { health, clock: fake } = healthFor("primary");
  assert.equal(health.snapshot().effectiveSource, "dom", "no handshake yet");

  health.noteBridgeHandshake();
  health.noteBridgeFrame("room");
  assert.equal(health.snapshot().effectiveSource, "websocket");

  health.noteContradiction("room");
  assert.equal(health.snapshot().effectiveSource, "dom");
  fake.advance(5000);
  health.noteBridgeFrame("room");
  health.tick();
  assert.equal(health.snapshot().effectiveSource, "dom", "runtime can only lower the source");
});

test("non-primary modes always report dom", () => {
  for (const mode of ["off", "log", "enrich"]) {
    const { health } = healthFor(mode);
    health.noteBridgeHandshake();
    health.noteBridgeFrame("room");
    assert.equal(health.snapshot().effectiveSource, "dom", `mode ${mode}`);
  }
});

test("snapshot returns fresh plain objects", () => {
  const { health } = healthFor();
  const snap = health.snapshot();
  snap.room.state = "mutated";
  snap.bridge.reason = "mutated";
  assert.equal(health.snapshot().room.state, "unknown");
  assert.equal(health.snapshot().bridge.reason, null);
});

// =====================================================================
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
