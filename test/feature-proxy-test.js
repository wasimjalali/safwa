/*
 * feature-proxy-test.js - the pure refusal matrix for the native feature
 * action (spec Section 7). Every "wrong row" path must refuse; only the fully
 * validated case may click.
 */

import assert from "node:assert/strict";
import {
  checkFeatureRequest,
  featureGroupId,
  pickFeatureCandidate,
  pickLiveMatch,
  ownerIdForElement,
  groupShownState,
  sameFeatureGroup,
} from "../src/proxy-rules.js";

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

check("already shown is allowed so the teacher can toggle off", () => {
  const shownRecord = { ...record, shown: "on" };
  assert.equal(checkFeatureRequest({ ...happy, record: shownRecord }).ok, true);
});

check("a latched click (pending) refuses a second click", () => {
  const pendingRecord = { ...record, shown: "pending" };
  assert.equal(checkFeatureRequest({ ...happy, record: pendingRecord }).ok, false);
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

check("collapsed same-person copies are one feature group, not twins", () => {
  assert.equal(featureGroupId("src_2", { type: "duplicate", targetSourceId: "src_1" }), "src_1");
  assert.equal(featureGroupId("src_1", { type: "primary" }), "src_1");
  assert.equal(
    sameFeatureGroup("src_1", "src_2", { type: "primary" }, { type: "duplicate", targetSourceId: "src_1" }),
    true
  );
  assert.equal(
    sameFeatureGroup("src_1", "src_9", { type: "primary" }, { type: "primary" }),
    false
  );
});

function cand(id, extra = {}) {
  return {
    id,
    connected: true,
    sameIdentity: true,
    hasButton: true,
    admissionSeq: Number(String(id).replace(/\D/g, "")) || 0,
    ...extra,
  };
}

check("pickLiveMatch prefers the occurrence's own node over a later copy", () => {
  const own = { id: "own" };
  const newer = { id: "newer" };
  assert.equal(
    pickLiveMatch({ ownEl: own, ownMatches: true, matches: [own, newer], claimed: new Set() }),
    own
  );
});

check("pickLiveMatch falls back to the last unclaimed match", () => {
  const older = { id: "older" };
  const newer = { id: "newer" };
  assert.equal(
    pickLiveMatch({ ownEl: null, ownMatches: false, matches: [older, newer], claimed: new Set([older]) }),
    newer
  );
});

check("shown follows the node that was clicked", () => {
  const a = { id: "a" };
  const b = { id: "b" };
  assert.equal(ownerIdForElement(b, [["src_1", a], ["src_6", b]], "src_1"), "src_6");
});

check("a lone live row is the feature candidate", () => {
  assert.equal(pickFeatureCandidate([cand("src_1", { admissionSeq: 1 })], { requestedId: "src_1" }), "src_1");
});

check("duplicate group features the newest live copy, not the first", () => {
  assert.equal(
    pickFeatureCandidate(
      [cand("src_1", { admissionSeq: 1 }), cand("src_6", { admissionSeq: 6 }), cand("src_3", { admissionSeq: 3 })],
      { requestedId: "src_1", wantOn: true }
    ),
    "src_6"
  );
});

check("group on-air stays on when a later copy is still unknown", () => {
  assert.equal(groupShownState(["unknown", "on", "unknown"]), "on");
  assert.equal(groupShownState(["pending", "unknown"]), "pending");
  assert.equal(groupShownState(["unknown", "unknown"]), "unknown");
  assert.equal(
    pickFeatureCandidate(
      [cand("src_1", { admissionSeq: 1 }), cand("src_6", { admissionSeq: 6 }), cand("src_9", { admissionSeq: 9 })],
      { requestedId: "src_6", wantOn: false }
    ),
    "src_6",
    "a new repeat must not retarget an already-on card"
  );
});

check("turning a comment off keeps the requested row", () => {
  assert.equal(
    pickFeatureCandidate(
      [cand("src_1", { admissionSeq: 1 }), cand("src_6", { admissionSeq: 6 })],
      { requestedId: "src_1", wantOn: false }
    ),
    "src_1"
  );
});

check("disconnected or other-author copies are never substituted", () => {
  assert.equal(
    pickFeatureCandidate(
      [
        cand("src_1", { admissionSeq: 1, connected: false }),
        cand("src_2", { admissionSeq: 2, sameIdentity: false }),
        cand("src_3", { admissionSeq: 3 }),
      ],
      { requestedId: "src_1", wantOn: true }
    ),
    "src_3"
  );
  assert.equal(pickFeatureCandidate([], { requestedId: "src_1" }), null);
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
