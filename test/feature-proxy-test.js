/*
 * feature-proxy-test.js - the pure refusal matrix for the native feature
 * action (spec Section 7). Every "wrong row" path must refuse; only the fully
 * validated case may click.
 */

import assert from "node:assert/strict";
import { checkFeatureRequest } from "../src/proxy-rules.js";

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

const session = { documentToken: "doc-1", sessionEpoch: 4 };
const now = 1_700_000_000_000;
const baseRequest = {
  v: 2,
  type: "FEATURE_REQUEST",
  requestId: "r1",
  windowId: 1,
  tabId: 2,
  documentToken: "doc-1",
  sessionEpoch: 4,
  sourceId: "src_1",
  sourceRevision: 7,
  expiresAt: now + 2000,
};
const record = {
  sourceId: "src_1",
  platform: "youtube",
  handle: "@a",
  displayText: "سوال",
  admissionSeq: 7,
  shown: "unknown",
};
const liveRow = { platform: "youtube", handle: "@a", displayText: "سوال" };
const happy = {
  request: baseRequest,
  session,
  record,
  anchorConnected: true,
  liveRow,
  twinCount: 0,
  buttonCount: 1,
  enabled: true,
  now,
};

check("fully validated request is allowed exactly once", () => {
  assert.deepEqual(checkFeatureRequest(happy), { ok: true, reasonCode: null });
});

check("disabled proxy refuses", () => {
  assert.equal(checkFeatureRequest({ ...happy, enabled: false }).ok, false);
});

check("wrong session token refuses", () => {
  const request = { ...baseRequest, documentToken: "other" };
  assert.equal(checkFeatureRequest({ ...happy, request }).ok, false);
});

check("wrong epoch refuses", () => {
  const request = { ...baseRequest, sessionEpoch: 99 };
  assert.equal(checkFeatureRequest({ ...happy, request }).ok, false);
});

check("expired request refuses", () => {
  assert.equal(checkFeatureRequest({ ...happy, now: baseRequest.expiresAt + 1 }).ok, false);
});

check("missing record or disconnected anchor refuses", () => {
  assert.equal(checkFeatureRequest({ ...happy, record: null }).ok, false);
  assert.equal(checkFeatureRequest({ ...happy, anchorConnected: false }).ok, false);
});

check("stale source revision refuses", () => {
  const request = { ...baseRequest, sourceRevision: 6 };
  assert.equal(checkFeatureRequest({ ...happy, request }).ok, false);
});

check("already shown refuses (never toggle off air)", () => {
  const shownRecord = { ...record, shown: "on" };
  assert.equal(checkFeatureRequest({ ...happy, record: shownRecord }).ok, false);
});

check("recycled row content mismatch refuses", () => {
  assert.equal(
    checkFeatureRequest({ ...happy, liveRow: { ...liveRow, displayText: "متن دیگر" } }).ok,
    false
  );
  assert.equal(
    checkFeatureRequest({ ...happy, liveRow: { ...liveRow, handle: "@b" } }).ok,
    false
  );
  assert.equal(
    checkFeatureRequest({ ...happy, liveRow: { ...liveRow, platform: "facebook" } }).ok,
    false
  );
});

check("indistinguishable twins refuse", () => {
  assert.equal(checkFeatureRequest({ ...happy, twinCount: 1 }).ok, false);
});

check("missing or duplicated button refuses", () => {
  assert.equal(checkFeatureRequest({ ...happy, buttonCount: 0 }).ok, false);
  assert.equal(checkFeatureRequest({ ...happy, buttonCount: 2 }).ok, false);
});

check("null request refuses without throwing", () => {
  assert.equal(checkFeatureRequest({ ...happy, request: null }).ok, false);
});

console.log(`feature-proxy tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
