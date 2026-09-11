/*
 * admission-test.js - pure coordinator coverage (spec Sections 4.3/5 and the
 * Section 12 test plan): delivery dedupe on the measured fixture duplicate
 * pair, distinct-ids-same-text occurrences, correlation windows, ordering
 * metadata, person identity, state events, bounds and reset.
 *
 * The fixtures are inert evidence: this test breaks their `raw` strings out
 * and builds the parseResult shape that src/ws-parser.js will produce.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CONFIG } from "../src/config.js";
import { createAdmission, isStreamYardSampleComment, personKeyFor } from "../src/admission.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = JSON.parse(
  readFileSync(join(HERE, "fixtures", "ws-2026-09-11-events.json"), "utf8")
);

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

function fixture(name) {
  const entry = FIXTURES.find((item) => item.name === name);
  if (!entry) throw new Error(`fixture ${name} missing`);
  return entry;
}

function parseOuter(name) {
  return JSON.parse(fixture(name).raw);
}

/** Break the real room frame open: outer JSON -> nested JSON -> comments. */
function roomComments(name) {
  const outer = parseOuter(name);
  const inner = JSON.parse(outer.message.body.message);
  const data = inner.data ?? {};
  return (Array.isArray(data.comments) ? data.comments : []).map((comment, index) => ({
    commentId: comment.id,
    handle: comment.name,
    platform: String(comment.platform ?? "").toLowerCase(),
    displayText: (Array.isArray(comment.contents) ? comment.contents : [])
      .filter((segment) => segment && segment.type === "text")
      .map((segment) => segment.content)
      .join(""),
    createdAt: comment.createdAt,
    authorPlatformId: comment.authorPlatformId,
    avatarLarge: comment.largeImageSrc,
    avatarSmall: comment.smallImageSrc,
    broadcastId: data.broadcastId,
    destinationId: data.destinationId,
    sourcePos: outer.pos,
    sentAt: outer.message?.sentAt,
    batchIndex: index,
    contents: comment.contents,
  }));
}

function parseResult(comments = [], events = []) {
  return { status: "ok", comments, events, unknown: [], errors: [] };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function domFrom(source, overrides = {}) {
  return {
    handle: source.handle,
    platform: source.platform,
    displayText: source.displayText,
    timestamp: 0,
    ...overrides,
  };
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

function admissionWith(mode = "primary", limitOverrides = {}) {
  const fake = clock(0);
  const config = {
    ...CONFIG,
    WS_MODE: mode,
    WS_LIMITS: { ...CONFIG.WS_LIMITS, ...limitOverrides },
  };
  return { api: createAdmission(config, { now: fake.now }), clock: fake };
}

// =====================================================================
console.log("\nadmission.js - delivery dedupe (measured fixture pair)");

test("fixture duplicate pair yields exactly one admitted occurrence", () => {
  const { api, clock: fake } = admissionWith("primary");
  const [first] = roomComments("comment.created.first");
  const [duplicate] = roomComments("comment.created.duplicate");

  const staged = api.ingestSocket(parseResult([first]), { generation: 1, endpointKey: "room" });
  assert.equal(staged.updated.length, 0);
  assert.equal(api.records().length, 0, "socket-only candidates never create records");

  fake.set(900);
  const admitted = api.admitDom(domFrom(first, { timestamp: 900 }), { generation: 1 });
  assert.equal(admitted.isNew, true);
  assert.equal(api.records().length, 1);

  const merged = api.correlate();
  assert.equal(merged.updated.length, 1);
  assert.equal(merged.updated[0].sourceId, admitted.sourceId);
  assert.equal(merged.updated[0].commentId, "LCC.SANITIZED_1");
  assert.equal(merged.updated[0].displayText, first.displayText);
  assert.equal(merged.updated[0].createdAt, first.createdAt);
  assert.equal(merged.updated[0].authorPlatformId, first.authorPlatformId);
  assert.equal(merged.updated[0].avatarUrl, first.avatarLarge);
  assert.equal(merged.updated[0].sourcePos, first.sourcePos);
  assert.equal(merged.updated[0].provenance.socket, true);
  assert.equal(merged.updated[0].provenance.correlated, true);

  fake.set(1500);
  const delivery = api.ingestSocket(parseResult([duplicate]), {
    generation: 1,
    endpointKey: "room",
  });
  assert.equal(delivery.updated.length, 0, "a repeat delivery adds no second update signal");
  assert.ok(delivery.diagnostics.includes("comment.duplicateDelivery"));
  assert.equal(api.records().length, 1);
  assert.equal(api.currentSequence(), 1, "the repeat never advances admission order");
});

test("a repeat delivery before admission never enqueues a second candidate", () => {
  const { api, clock: fake } = admissionWith("primary");
  const [first] = roomComments("comment.created.first");
  const [duplicate] = roomComments("comment.created.duplicate");

  api.ingestSocket(parseResult([first]), { generation: 1, endpointKey: "room" });
  fake.set(100);
  const repeat = api.ingestSocket(parseResult([duplicate]), { generation: 1, endpointKey: "room" });
  assert.ok(repeat.diagnostics.includes("comment.duplicateDelivery"));

  fake.set(200);
  api.admitDom(domFrom(first, { timestamp: 200 }), { generation: 1 });
  const merged = api.correlate();
  assert.equal(merged.updated.length, 1);
  assert.equal(api.records().length, 1);
});

test("two distinct socket ids with identical text stay two records", () => {
  const { api, clock: fake } = admissionWith("primary");
  const [first] = roomComments("comment.created.first");
  const second = { ...clone(first), commentId: "LCC.SANITIZED_2", sourcePos: 20 };

  api.ingestSocket(parseResult([first]), { generation: 1, endpointKey: "room" });
  fake.set(200);
  const a = api.admitDom(domFrom(first, { timestamp: 200 }), { generation: 1 });
  fake.set(400);
  api.ingestSocket(parseResult([second]), { generation: 1, endpointKey: "room" });
  fake.set(600);
  const b = api.admitDom(domFrom(second, { timestamp: 600 }), { generation: 1 });
  const merged = api.correlate();

  assert.notEqual(a.sourceId, b.sourceId);
  assert.equal(api.records().length, 2);
  assert.equal(merged.updated.length, 2);
  assert.deepEqual(
    api.records().map((record) => record.commentId).sort(),
    ["LCC.SANITIZED_1", "LCC.SANITIZED_2"]
  );
});

test("admitDom refuses a second record for an already-admitted transport id", () => {
  const { api } = admissionWith("primary");
  const [first] = roomComments("comment.created.first");
  const identity = { commentId: first.commentId, broadcastId: first.broadcastId };

  const a = api.admitDom({ ...domFrom(first), ...identity, timestamp: 10 });
  const b = api.admitDom({ ...domFrom(first), ...identity, timestamp: 20 });
  assert.equal(a.isNew, true);
  assert.equal(b.isNew, false);
  assert.equal(b.duplicateOf, a.sourceId);
  assert.equal(api.records().length, 1);
});

// =====================================================================
console.log("\nadmission.js - correlation window");

test("a candidate inside correlateMs correlates and prefers the socket payload", () => {
  const { api, clock: fake } = admissionWith("primary");
  const [first] = roomComments("comment.created.first");

  api.ingestSocket(parseResult([first]), { generation: 1, endpointKey: "room" });
  fake.set(1200);
  const admitted = api.admitDom(domFrom(first, { timestamp: 1200 }), { generation: 1 });
  const merged = api.correlate();

  assert.equal(merged.updated.length, 1);
  assert.equal(merged.updated[0].sourceId, admitted.sourceId);
  assert.equal(merged.updated[0].commentId, first.commentId);
  assert.equal(merged.updated[0].createdAt, first.createdAt);
  assert.equal(merged.updated[0].avatarUrl, first.avatarLarge);
  assert.equal(merged.updated[0].sentAt, first.sentAt);
});

test("a candidate outside correlateMs never correlates and is dropped", () => {
  const { api, clock: fake } = admissionWith("primary");
  const [first] = roomComments("comment.created.first");

  api.ingestSocket(parseResult([first]), { generation: 1, endpointKey: "room" });
  fake.set(CONFIG.WS_LIMITS.correlateMs + 500);
  const admitted = api.admitDom(domFrom(first, { timestamp: fake.now() }), { generation: 1 });
  const result = api.correlate();

  assert.equal(result.updated.length, 0);
  assert.ok(result.diagnostics.includes("correlate.timeout"));
  const record = api.getRecord(admitted.sourceId);
  assert.equal(record.provenance.socket, false);
  assert.equal(record.commentId, undefined);
});

test("enrich mode merges socket metadata onto a DOM-first record, keeping DOM text", () => {
  const { api, clock: fake } = admissionWith("enrich");
  const [first] = roomComments("comment.created.first");

  fake.set(100);
  const admitted = api.admitDom(domFrom(first, { timestamp: 100 }), { generation: 1 });
  fake.set(400);
  const staged = api.ingestSocket(parseResult([first]), { generation: 1, endpointKey: "room" });
  assert.equal(staged.updated.length, 0, "ingest stages, correlate matches");

  const merged = api.correlate();
  const record = api.getRecord(admitted.sourceId);
  assert.equal(merged.updated.length, 1);
  assert.equal(record.displayText, first.displayText);
  assert.equal(record.commentId, first.commentId);
  assert.equal(record.authorPlatformId, first.authorPlatformId);
  assert.equal(record.provenance.socket, true);
});

test("primary mode replaces a fold-equal DOM text with the complete socket text", () => {
  const { api, clock: fake } = admissionWith("primary");
  const [first] = roomComments("comment.created.first");
  const domText = first.displayText.replace(/\u200c/g, "");

  fake.set(50);
  const admitted = api.admitDom(domFrom(first, { displayText: domText, timestamp: 50 }));
  api.ingestSocket(parseResult([first]), { generation: 1, endpointKey: "room" });
  const merged = api.correlate();

  assert.equal(merged.updated.length, 1);
  assert.equal(api.getRecord(admitted.sourceId).displayText, first.displayText);
});

test("a contradictory repeat is reported, never merged", () => {
  const { api, clock: fake } = admissionWith("primary");
  const [first] = roomComments("comment.created.first");

  fake.set(10);
  const admitted = api.admitDom(domFrom(first, { timestamp: 10 }));
  api.ingestSocket(parseResult([first]), { generation: 1, endpointKey: "room" });
  api.correlate();

  const conflicting = { ...clone(first), createdAt: "2026-09-11T01:00:00.000Z" };
  const result = api.ingestSocket(parseResult([conflicting]), {
    generation: 1,
    endpointKey: "room",
  });
  assert.ok(result.diagnostics.includes("contradiction.createdAt"));
  assert.equal(api.getRecord(admitted.sourceId).createdAt, first.createdAt);
});

// =====================================================================
console.log("\nadmission.js - ordering metadata");

test("pos scoping, gaps, equal timestamps and generations never move a row", () => {
  const { api, clock: fake } = admissionWith("primary");
  const [first] = roomComments("comment.created.first");
  const second = { ...clone(first), commentId: "LCC.SANITIZED_2", sourcePos: 20 };

  api.ingestSocket(parseResult([first]), { generation: 1, endpointKey: "room" });
  api.ingestSocket(parseResult([second]), { generation: 2, endpointKey: "room" });
  fake.set(500);
  const a = api.admitDom(domFrom(first, { timestamp: 500 }), { generation: 1 });
  const b = api.admitDom(domFrom(second, { timestamp: 500 }), { generation: 2 });

  const before = api.records().map((record) => record.sourceId);
  api.correlate();
  const after = api.records().map((record) => record.sourceId);

  assert.deepEqual(after, before, "late metadata never moves an established row");
  assert.deepEqual(after, [a.sourceId, b.sourceId]);
  assert.equal(api.getRecord(a.sourceId).sourcePos, 12);
  assert.equal(api.getRecord(b.sourceId).sourcePos, 20, "a pos gap alone is not loss");
  assert.equal(
    api.getRecord(a.sourceId).sentAt,
    api.getRecord(b.sourceId).sentAt,
    "equal sentAt does not reorder"
  );
  assert.notEqual(
    api.getRecord(a.sourceId).admissionSeq,
    api.getRecord(b.sourceId).admissionSeq
  );
  assert.equal(
    api.getRecord(a.sourceId).firstAdmissionOrdinal,
    api.getRecord(a.sourceId).admissionSeq,
    "first-admission ordinal survives enrichment"
  );
});

test("the same comment id in two broadcasts is two records (scoped identity)", () => {
  const { api, clock: fake } = admissionWith("primary");
  const [first] = roomComments("comment.created.first");
  const other = { ...clone(first), broadcastId: "BROADCAST_ID_2" };

  api.ingestSocket(parseResult([first]), { generation: 1, endpointKey: "room" });
  api.ingestSocket(parseResult([other]), { generation: 1, endpointKey: "room" });
  fake.set(100);
  api.admitDom(domFrom(first, { timestamp: 100 }), { generation: 1 });
  fake.set(200);
  api.admitDom(domFrom(other, { timestamp: 200 }), { generation: 1 });
  api.correlate();

  assert.equal(api.records().length, 2);
  assert.deepEqual(
    api.records().map((record) => record.broadcastId).sort(),
    ["BROADCAST_ID", "BROADCAST_ID_2"]
  );
});

// =====================================================================
console.log("\nadmission.js - identity");

test("personKeyFor prefers authorPlatformId, falls back to the folded handle", () => {
  assert.equal(
    personKeyFor({ platform: "youtube", authorPlatformId: "UC1", handle: "@ali" }),
    "youtube::id:UC1"
  );
  assert.equal(
    personKeyFor({ platform: "youtube", handle: "كريم" }),
    personKeyFor({ platform: "youtube", handle: "کریم" }),
    "Arabic vs Persian keyboard spelling folds to one person"
  );
  assert.equal(
    personKeyFor({ platform: "youtube", authorPlatformId: "UC1", handle: "@old" }),
    personKeyFor({ platform: "youtube", authorPlatformId: "UC1", handle: "@new" }),
    "renamed handle + same stable id = same person"
  );
  assert.notEqual(
    personKeyFor({ platform: "youtube", authorPlatformId: "UC1", handle: "@ali" }),
    personKeyFor({ platform: "youtube", authorPlatformId: "UC2", handle: "@ali" }),
    "same display name + different stable id = different people"
  );
  assert.equal(personKeyFor(null), "?::", "never throws on a missing record");
});

test("records expose the stable id and the fallback key through personKeyFor", () => {
  const { api, clock: fake } = admissionWith("primary");
  const [first] = roomComments("comment.created.first");
  const twin = { ...clone(first), commentId: "LCC.SANITIZED_2", authorPlatformId: "UC_OTHER" };

  fake.set(10);
  api.admitDom(domFrom(first, { timestamp: 10 }));
  fake.set(20);
  api.admitDom(domFrom(twin, { timestamp: 20 }));
  api.ingestSocket(parseResult([first, twin]), { generation: 1, endpointKey: "room" });
  api.correlate();
  assert.equal(api.records().length, 2);
  assert.equal(personKeyFor(api.records()[0]), "youtube::id:UC_SANITIZED_1");
  assert.equal(personKeyFor(api.records()[1]), "youtube::id:UC_OTHER");
  assert.notEqual(personKeyFor(api.records()[0]), personKeyFor(api.records()[1]));
});

test("rebuilt signals that a stable author id splits an existing folded-handle identity", () => {
  const { api } = admissionWith("primary");
  const [first] = roomComments("comment.created.first");

  api.admitDom({
    handle: first.handle,
    platform: first.platform,
    displayText: "سوال اول",
    timestamp: 10,
  });
  const withId = api.admitDom({
    handle: first.handle,
    platform: first.platform,
    displayText: "سوال دوم",
    timestamp: 20,
    authorPlatformId: first.authorPlatformId,
  });
  assert.equal(withId.rebuilt, true);

  const fresh = api.admitDom({
    handle: "@someone_new",
    platform: "youtube",
    displayText: "سوال سوم",
    timestamp: 30,
    authorPlatformId: "UC_NEW",
  });
  assert.equal(fresh.rebuilt, false, "a first-time identity needs no rebuild");
});

// =====================================================================
console.log("\nadmission.js - state events");

test("shownSet replaces the whole set, supports multiple ids and rejects a missing field", () => {
  const { api, clock: fake } = admissionWith("enrich");
  const [first] = roomComments("comment.created.first");
  const second = { ...clone(first), commentId: "LCC.SANITIZED_2" };

  fake.set(100);
  const a = api.admitDom(domFrom(first, { timestamp: 100 }));
  fake.set(200);
  const b = api.admitDom(domFrom(second, { timestamp: 200 }));
  api.ingestSocket(parseResult([first, second]), { generation: 1, endpointKey: "room" });
  api.correlate();
  assert.equal(api.records().length, 2);

  const one = api.applyStateEvents([
    { kind: "shownSet", broadcastId: "BROADCAST_ID", shownCommentIds: ["LCC.SANITIZED_1"] },
  ]);
  assert.equal(one.updated.length, 1);
  assert.equal(api.getRecord(a.sourceId).shown, "on");
  assert.equal(api.getRecord(b.sourceId).shown, "unknown");

  const both = api.applyStateEvents([
    {
      kind: "shownSet",
      broadcastId: "BROADCAST_ID",
      shownCommentIds: ["LCC.SANITIZED_1", "LCC.SANITIZED_2"],
    },
  ]);
  assert.equal(both.updated.length, 1);
  assert.equal(api.getRecord(b.sourceId).shown, "on");

  const cleared = api.applyStateEvents([
    { kind: "shownSet", broadcastId: "BROADCAST_ID", shownCommentIds: [] },
  ]);
  assert.equal(cleared.updated.length, 2);
  assert.equal(api.getRecord(a.sourceId).shown, "unknown");
  assert.equal(api.getRecord(b.sourceId).shown, "unknown");

  const missing = api.applyStateEvents([{ kind: "shownSet", broadcastId: "BROADCAST_ID" }]);
  assert.equal(missing.updated.length, 0, "a missing shownCommentIds field is not an empty set");
});

test("starred sets positive state only and is idempotent", () => {
  const { api } = admissionWith("enrich");
  const [first] = roomComments("comment.created.first");
  const a = api.admitDom(domFrom(first, { timestamp: 10 }));
  api.ingestSocket(parseResult([first]), { generation: 1, endpointKey: "room" });
  api.correlate();

  const payload = parseOuter("comment.starred").message.payload;
  const event = {
    kind: "starred",
    commentId: payload.id,
    broadcastId: payload.broadcastId,
    starredAt: payload.starredAt,
  };
  const applied = api.applyStateEvents([event]);
  assert.equal(applied.updated.length, 1);
  assert.equal(api.getRecord(a.sourceId).starred, "on");
  assert.equal(api.applyStateEvents([event]).updated.length, 0);
  assert.equal(api.getRecord(a.sourceId).shown, "unknown", "starring is not showing");
});

test("commentUpdated marks stageUpdated and never implies shown", () => {
  const { api } = admissionWith("primary");
  const [first] = roomComments("comment.created.first");
  const a = api.admitDom(domFrom(first, { timestamp: 10 }));
  api.ingestSocket(parseResult([first]), { generation: 1, endpointKey: "room" });
  api.correlate();

  const comment = parseOuter("comment.updated.in").message.body.comment;
  const applied = api.applyStateEvents([
    {
      kind: "commentUpdated",
      commentId: comment.id,
      name: comment.name,
      platform: comment.platform,
      contents: comment.contents,
      imageSrc: comment.imageSrc,
    },
  ]);
  assert.equal(applied.updated.length, 1);
  assert.equal(api.getRecord(a.sourceId).stageUpdated, true);
  assert.equal(api.getRecord(a.sourceId).shown, "unknown");
});

test("DOM/log modes never take shown or starred state from socket events", () => {
  const { api } = admissionWith("log");
  const [first] = roomComments("comment.created.first");
  const a = api.admitDom({
    ...domFrom(first),
    commentId: first.commentId,
    broadcastId: first.broadcastId,
    timestamp: 10,
  });

  const applied = api.applyStateEvents([
    { kind: "starred", commentId: first.commentId, broadcastId: first.broadcastId },
    { kind: "shownSet", broadcastId: first.broadcastId, shownCommentIds: [first.commentId] },
  ]);
  assert.equal(applied.updated.length, 0);
  assert.equal(api.getRecord(a.sourceId).starred, "unknown");
  assert.equal(api.getRecord(a.sourceId).shown, "unknown");
});

// =====================================================================
console.log("\nadmission.js - modes, bounds and defensive reads");

test("log mode is diagnostics-only and mutates no transport state", () => {
  const { api } = admissionWith("log");
  const [first] = roomComments("comment.created.first");
  const result = api.ingestSocket(parseResult([first]), { generation: 1, endpointKey: "room" });

  assert.equal(result.updated.length, 0);
  assert.equal(result.events.length, 0);
  assert.ok(result.diagnostics.some((code) => code.startsWith("log.comments:")));
  assert.equal(api.records().length, 0);
  assert.equal(api.correlate().updated.length, 0);
});

test("off mode is inert", () => {
  const { api } = admissionWith("off");
  const [first] = roomComments("comment.created.first");
  const result = api.ingestSocket(parseResult([first]), { generation: 1, endpointKey: "room" });
  assert.deepEqual(result, { updated: [], events: [], diagnostics: [] });
});

test("pending candidates are bounded and overflow is reported", () => {
  const { api, clock: fake } = admissionWith("primary", { pendingCandidates: 2 });
  const [first] = roomComments("comment.created.first");
  const candidates = [1, 2, 3].map((n) => ({ ...clone(first), commentId: `LCC.${n}` }));

  const result = api.ingestSocket(parseResult(candidates), {
    generation: 1,
    endpointKey: "room",
  });
  assert.ok(result.diagnostics.includes("pending.overflow"));

  fake.set(100);
  api.admitDom(domFrom(first, { timestamp: 100 }));
  api.admitDom(domFrom(first, { timestamp: 100 }));
  const correlated = api.correlate();
  assert.equal(correlated.updated.length, 2);
  assert.deepEqual(
    api.records().map((record) => record.commentId).filter(Boolean).sort(),
    ["LCC.2", "LCC.3"],
    "the oldest candidate is the one evicted"
  );
});

test("invalid parse results never throw and never mutate state", () => {
  const { api } = admissionWith("primary");
  const badInputs = [
    null,
    undefined,
    "nope",
    42,
    {},
    { status: "malformed", comments: [{}] },
    { status: "unknown" },
    { status: "ok", comments: "nope", events: "nope" },
  ];
  for (const bad of badInputs) {
    const result = api.ingestSocket(bad, { generation: 1, endpointKey: "room" });
    assert.ok(Array.isArray(result.updated));
    assert.ok(Array.isArray(result.events));
    assert.ok(Array.isArray(result.diagnostics));
  }
  assert.deepEqual(api.records(), []);
  assert.equal(api.currentSequence(), 0);
});

test("diagnostics are bounded per call", () => {
  const { api } = admissionWith("primary", { pendingCandidates: 1 });
  const [first] = roomComments("comment.created.first");
  const many = [];
  for (let i = 0; i < 80; i++) many.push({ ...clone(first), commentId: `LCC.${i}` });
  const result = api.ingestSocket(parseResult(many), { generation: 1, endpointKey: "room" });
  assert.ok(result.diagnostics.length <= 32, `got ${result.diagnostics.length} diagnostics`);
});

// =====================================================================
console.log("\nadmission.js - reset and sequence");

test("reset clears records, indexes, pending candidates and the sequence", () => {
  const { api, clock: fake } = admissionWith("primary");
  const [first] = roomComments("comment.created.first");

  api.ingestSocket(parseResult([first]), { generation: 1, endpointKey: "room" });
  fake.set(100);
  const admitted = api.admitDom(domFrom(first, { timestamp: 100 }));
  assert.equal(api.records().length, 1);
  assert.equal(api.currentSequence(), 1);

  api.reset();
  assert.deepEqual(api.records(), []);
  assert.equal(api.getRecord(admitted.sourceId), null);
  assert.equal(api.currentSequence(), 0);

  const next = api.admitDom(domFrom(first, { timestamp: 200 }));
  assert.equal(next.sourceId, "src_1", "sourceIds restart per session");
  assert.equal(api.correlate().updated.length, 0, "pending candidates were cleared too");
});


test("shownOffUntil blocks a lagging shownSet after the teacher toggles off", () => {
  const { api, clock: fake } = admissionWith("enrich");
  const [first] = roomComments("comment.created.first");
  const admitted = api.admitDom(domFrom(first, { timestamp: 10 }));
  const rec = api.getRecord(admitted.sourceId);
  rec.commentId = "c1";
  rec.broadcastId = "b1";
  rec.shown = "unknown";
  rec.shownOffUntil = 2_000;
  fake.set(1_000);

  api.applyStateEvents([{ kind: "shownSet", broadcastId: "b1", shownCommentIds: ["c1"] }]);
  assert.equal(rec.shown, "unknown", "stale on-air snapshot cannot invert toggle-off");

  fake.set(2_001);
  api.applyStateEvents([{ kind: "shownSet", broadcastId: "b1", shownCommentIds: ["c1"] }]);
  assert.equal(rec.shown, "on", "after the latch, an explicit id is on");
});

test("StreamYard example chrome is not a viewer question", () => {
  assert.equal(
    isStreamYardSampleComment({
      handle: "StreamYard",
      displayText:
        "Live viewer comments show up on StreamYard. This is an example. Clickable on a comment to show it on screen.",
    }),
    true
  );
  assert.equal(
    isStreamYardSampleComment({
      handle: "@iamwasim.jalali",
      displayText: "سلام استاد، آیا نماز در سفر قصر خوانده میشود؟",
    }),
    false
  );
  assert.equal(
    isStreamYardSampleComment({
      handle: "StreamYard",
      displayText: "استاد حکم آن چیست؟",
    }),
    false
  );
});

test("sticky pending: a pre-click shownSet cannot re-arm a latched record", () => {
  const { api } = admissionWith("enrich");
  const [first] = roomComments("comment.created.first");
  const admitted = api.admitDom(domFrom(first, { timestamp: 10 }));
  const rec = api.getRecord(admitted.sourceId);
  rec.commentId = "c1";
  rec.broadcastId = "b1";
  rec.shown = "pending";

  api.applyStateEvents([{ kind: "shownSet", broadcastId: "b1", shownCommentIds: [] }]);
  assert.equal(rec.shown, "pending", "a set without the id keeps the latch");

  api.applyStateEvents([{ kind: "shownSet", broadcastId: "b1", shownCommentIds: ["c1"] }]);
  assert.equal(rec.shown, "on", "the id promotes pending to on");
});

// =====================================================================
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
