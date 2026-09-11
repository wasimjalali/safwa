/*
 * protocol-test.js - port/runtime message contract coverage (spec Section 12).
 */

import assert from "node:assert/strict";
import {
  MESSAGE_TYPES,
  PORT_NAME,
  makeEnvelope,
  validatePortMessage,
  validateFeatureRequest,
  validateFeatureResult,
  isUnboundHandshake,
} from "../src/protocol.js";

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  FAIL  ${name}: ${err.message}`);
  }
}

const session = { documentToken: "doc-1", sessionEpoch: 3, revision: 10 };

check("PORT_NAME is stable", () => assert.equal(PORT_NAME, "safwa-panel"));
check("makeEnvelope sets version and type", () => {
  const env = makeEnvelope("X", { a: 1 });
  assert.equal(env.v, 2);
  assert.equal(env.type, "X");
  assert.equal(env.a, 1);
});

check("valid subscribe message accepted", () => {
  const msg = makeEnvelope(MESSAGE_TYPES.SUBSCRIBE, { documentToken: "doc-1", sessionEpoch: 3 });
  assert.deepEqual(validatePortMessage(msg, session), { ok: true });
});

check("wrong documentToken rejected", () => {
  const msg = makeEnvelope(MESSAGE_TYPES.SUBSCRIBE, { documentToken: "other", sessionEpoch: 3 });
  assert.equal(validatePortMessage(msg, session).reason, "documentTokenMismatch");
});

check("wrong sessionEpoch rejected", () => {
  const msg = makeEnvelope(MESSAGE_TYPES.SUBSCRIBE, { documentToken: "doc-1", sessionEpoch: 99 });
  assert.equal(validatePortMessage(msg, session).reason, "sessionEpochMismatch");
});

check("unknown type rejected", () => {
  const msg = { v: 2, type: "NOPE", documentToken: "doc-1", sessionEpoch: 3 };
  assert.equal(validatePortMessage(msg, session).reason, "unknownType");
});

check("revision gap reported for PATCH", () => {
  const msg = makeEnvelope(MESSAGE_TYPES.PATCH, {
    documentToken: "doc-1",
    sessionEpoch: 3,
    baseRevision: 9,
    revision: 11,
    upserts: [],
    removals: [],
  });
  assert.equal(validatePortMessage(msg, session).reason, "revisionGap");
});

check("non-serializable payload rejected", () => {
  const msg = makeEnvelope(MESSAGE_TYPES.PATCH, {
    documentToken: "doc-1",
    sessionEpoch: 3,
    baseRevision: 10,
    revision: 11,
    upserts: [new Map()],
    removals: [],
  });
  assert.equal(validatePortMessage(msg, session).reason, "notSerializable");
});

check("cold handshake accepted only for unbound SUBSCRIBE/RESYNC", () => {
  assert.equal(
    isUnboundHandshake({ v: 2, type: MESSAGE_TYPES.SUBSCRIBE, documentToken: null, sessionEpoch: null }),
    true
  );
  assert.equal(
    isUnboundHandshake({ v: 2, type: MESSAGE_TYPES.RESYNC, documentToken: null, sessionEpoch: null }),
    true
  );
  assert.equal(
    isUnboundHandshake({ v: 2, type: MESSAGE_TYPES.RESET_SESSION, documentToken: null, sessionEpoch: null }),
    false
  );
  assert.equal(
    isUnboundHandshake({ v: 2, type: MESSAGE_TYPES.SUBSCRIBE, documentToken: "doc-1", sessionEpoch: 3 }),
    false
  );
});

check("valid feature request accepted", () => {
  const req = {
    v: 2,
    type: MESSAGE_TYPES.FEATURE_REQUEST,
    requestId: "r1",
    windowId: 1,
    tabId: 2,
    documentToken: "doc-1",
    sessionEpoch: 3,
    sourceId: "src_1",
    sourceRevision: 10,
    expiresAt: Date.now() + 1000,
  };
  assert.deepEqual(validateFeatureRequest(req), { ok: true });
});

check("feature request missing target rejected", () => {
  assert.equal(
    validateFeatureRequest({ v: 2, type: MESSAGE_TYPES.FEATURE_REQUEST, requestId: "r1" }).reason,
    "badTarget"
  );
});

check("feature result outcome validated", () => {
  assert.deepEqual(
    validateFeatureResult({ v: 2, type: MESSAGE_TYPES.FEATURE_RESULT, requestId: "r1", outcome: "clicked" }),
    { ok: true }
  );
  assert.equal(
    validateFeatureResult({ v: 2, type: MESSAGE_TYPES.FEATURE_RESULT, requestId: "r1", outcome: "boom" }).reason,
    "badOutcome"
  );
});

console.log(`protocol tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
