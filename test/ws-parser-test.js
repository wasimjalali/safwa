/*
 * ws-parser-test.js - Section 4.4 coverage for src/ws-parser.js.
 *
 * The measured 2026-09-11 fixtures plus labeled synthetic malformed/unknown
 * cases. Pure Node, no dependencies: the parser never throws and never emits
 * payload text in diagnostics. Delivery dedupe is tested elsewhere - the pure
 * parser returns the duplicate fixture twice, by design.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { parseWsFrame } from "../src/ws-parser.js";

const fixtureText = readFileSync(
  new URL("./fixtures/ws-2026-09-11-events.json", import.meta.url),
  "utf8"
);
const fixtures = JSON.parse(fixtureText);
const byName = new Map(fixtures.map((entry) => [entry.name, entry]));

// Measured fixture bytes, escape-coded so no editor can normalize the Persian
// text (U+061F question mark; no ZWNJ in the captured comment).
const EXPECTED_QUESTION =
  "\u0622\u06cc\u0627 \u0646\u0645\u0627\u0632 \u062f\u0631 \u0633\u0641\u0631 \u0642\u0635\u0631 \u062e\u0648\u0627\u0646\u062f\u0647 \u0645\u06cc\u0634\u0648\u062f\u061f";

let passed = 0;
let failed = 0;

function group(name) {
  console.log(`\n${name}`);
}

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

function parseFixture(name) {
  const entry = byName.get(name);
  const endpointKey = entry.url.includes("streamyard.com/api") ? "api" : "room";
  return parseWsFrame(entry.raw, { endpointKey, direction: entry.dir });
}

function assertEmptyOutputs(res) {
  assert.deepEqual(res.comments, [], "expected zero comments");
  assert.deepEqual(res.events, [], "expected zero events");
  assert.deepEqual(res.unknown, [], "expected zero unknown codes");
  assert.deepEqual(res.errors, [], "expected zero error codes");
}

function assertMalformed(res) {
  assert.equal(res.status, "malformed", `expected malformed, got ${res.status}`);
  assert.deepEqual(res.comments, [], "malformed output must have zero comments");
  assert.deepEqual(res.events, [], "malformed output must have zero events");
  assert.deepEqual(res.unknown, [], "malformed output must not carry unknown codes");
  assert.ok(res.errors.length > 0, "malformed output must carry at least one code");
}

function roomFrame(inner, options = {}) {
  const messageText = typeof inner === "string" ? inner : JSON.stringify(inner);
  const frame = {
    type: "message",
    message: {
      command: options.command ?? "appMessage",
      body: { message: messageText },
      sentAt: options.sentAt ?? "2026-09-11T00:05:39.956Z",
    },
  };
  if (options.dropPos !== true) frame.pos = options.pos ?? 1;
  return JSON.stringify(frame);
}

function syntheticComment(overrides = {}) {
  return {
    id: "LCC.SYNTHETIC_1",
    name: "@synthetic_user",
    platform: "youtube",
    authorPlatformId: "UC_SYNTHETIC_1",
    createdAt: "2026-09-11T00:05:37.664Z",
    contents: [{ type: "text", content: "سوال آزمایشی" }],
    ...overrides,
  };
}

function createdInner(comments, dataOverrides = {}) {
  return {
    type: "platformComments.created",
    data: {
      comments,
      broadcastId: "BROADCAST_ID",
      destinationId: "DEST_ID",
      ...dataOverrides,
    },
  };
}

// =====================================================================
group("1. fixture integrity");

test("fixture carries the expected eight labeled entries", () => {
  assert.deepEqual(
    fixtures.map((entry) => entry.name),
    [
      "comment.created.first",
      "comment.created.duplicate",
      "comment.starred",
      "comment.showRequest.out",
      "comment.updated.in",
      "broadcast.update.shownCommentIds",
      "api.hello.out",
      "heartbeat.ping",
    ]
  );
});

test("every entry raw parses as JSON and nested body.message parses", () => {
  for (const entry of fixtures) {
    const outer = JSON.parse(entry.raw);
    assert.ok(outer && typeof outer === "object", `${entry.name} outer is not an object`);
    if (outer?.message && typeof outer.message.body?.message === "string") {
      const inner = JSON.parse(outer.message.body.message);
      assert.ok(inner && typeof inner === "object", `${entry.name} inner is not an object`);
      assert.equal(typeof inner.type, "string", `${entry.name} inner lacks a type`);
    }
  }
});

test("no live token, JWT, or real handle survives in the fixture file", () => {
  assert.equal(/eyJ/.test(fixtureText), false, "fixture must not contain a JWT marker");
  assert.equal(/wasim|jalali/i.test(fixtureText), false, "fixture leaked the operator name");

  const tokenValues = [...fixtureText.matchAll(/token=([^"&\\\s]+)/g)].map((m) => m[1]);
  assert.ok(tokenValues.length > 0, "expected token placeholders to be preserved");
  for (const value of tokenValues) {
    assert.equal(value, "REDACTED", `live token value survived: ${value}`);
  }

  const handles = [...fixtureText.matchAll(/@([A-Za-z0-9_.-]+)/g)].map((m) => m[1]);
  for (const handle of handles) {
    assert.equal(handle, "teacher_channel", `unexpected handle survived: @${handle}`);
  }
});

// =====================================================================
group("2. comment.created.first exact mapping");

const firstRes = parseFixture("comment.created.first");

test("status ok, one comment, no diagnostics", () => {
  assert.equal(firstRes.status, "ok");
  assert.equal(firstRes.comments.length, 1);
  assert.deepEqual(firstRes.events, []);
  assert.deepEqual(firstRes.unknown, []);
  assert.deepEqual(firstRes.errors, []);
});

test("every mapped field is exact", () => {
  assert.deepEqual(firstRes.comments[0], {
    commentId: "LCC.SANITIZED_1",
    handle: "@teacher_channel",
    platform: "youtube",
    displayText: EXPECTED_QUESTION,
    contents: [{ type: "text", content: EXPECTED_QUESTION }],
    createdAt: "2026-09-11T00:05:37.664Z",
    authorPlatformId: "UC_SANITIZED_1",
    avatarLarge: "https://example.invalid/avatar1.jpg",
    avatarSmall: "https://example.invalid/avatar1.jpg",
    broadcastId: "BROADCAST_ID",
    destinationId: "DEST_ID",
    sourcePos: 12,
    sentAt: "2026-09-11T00:05:39.956Z",
    batchIndex: 0,
  });
});

test("batched broadcastId/destinationId are inherited from the enclosing batch", () => {
  const inner = JSON.parse(
    JSON.parse(byName.get("comment.created.first").raw).message.body.message
  );
  assert.equal(inner.data.comments[0].broadcastId, undefined, "fixture is batch-level by design");
  assert.equal(firstRes.comments[0].broadcastId, inner.data.broadcastId);
  assert.equal(firstRes.comments[0].destinationId, inner.data.destinationId);
});

test("containsQuestion is ignored entirely", () => {
  assert.equal(
    Object.prototype.hasOwnProperty.call(firstRes.comments[0], "containsQuestion"),
    false
  );
});

// =====================================================================
group("3. comment.created.duplicate (pure parser returns it again)");

const duplicateRes = parseFixture("comment.created.duplicate");

test("status ok with the same normalized comment and sourcePos 13", () => {
  assert.equal(duplicateRes.status, "ok");
  assert.equal(duplicateRes.comments.length, 1);
  assert.equal(duplicateRes.comments[0].sourcePos, 13);
  assert.equal(duplicateRes.comments[0].sentAt, "2026-09-11T00:05:44.367Z");
});

test("identical identity fields across both deliveries", () => {
  const identity = (comment) => {
    const { sourcePos, sentAt, batchIndex, ...rest } = comment;
    return rest;
  };
  assert.deepEqual(identity(duplicateRes.comments[0]), identity(firstRes.comments[0]));
  assert.equal(duplicateRes.comments[0].commentId, firstRes.comments[0].commentId);
});

// =====================================================================
group("4. comment.updated.in");

const updatedRes = parseFixture("comment.updated.in");
const updatedEntry = byName.get("comment.updated.in");
const updatedComment = JSON.parse(updatedEntry.raw).message.body.comment;

test("one event, zero comments, no shown inference", () => {
  assert.equal(updatedRes.status, "ok");
  assert.equal(updatedRes.comments.length, 0);
  assert.equal(updatedRes.events.length, 1);
  const event = updatedRes.events[0];
  assert.equal(event.kind, "commentUpdated");
  assert.equal(event.commentId, "LCC.SANITIZED_1");
  assert.equal(event.name, "@teacher_channel");
  assert.equal(event.platform, "youtube");
  assert.deepEqual(event.contents, updatedComment.contents);
  assert.equal(event.imageSrc, "https://example.invalid/avatar1.jpg");
  assert.equal(event.sentAt, "2026-09-11T00:07:49.572Z");
  assert.equal(event.pos, 14);
  assert.equal(Object.prototype.hasOwnProperty.call(event, "shown"), false);
  assert.equal(JSON.stringify(updatedRes).includes("shown"), false);
});

// =====================================================================
group("5. broadcast.update.shownCommentIds");

const shownRes = parseFixture("broadcast.update.shownCommentIds");

test("one shownSet event with the explicit array", () => {
  assert.equal(shownRes.status, "ok");
  assert.equal(shownRes.comments.length, 0);
  assert.equal(shownRes.events.length, 1);
  assert.deepEqual(shownRes.events[0], {
    kind: "shownSet",
    broadcastId: "BROADCAST_ID",
    videoRoomId: "ROOM_ID",
    shownCommentIds: ["LCC.SANITIZED_1"],
    snapshotAt: "2026-09-11T00:07:59.586Z",
  });
});

test("synthetic broadcast.status without shownCommentIds yields no update", () => {
  const frame = JSON.stringify({
    type: "update",
    message: {
      subscription: "broadcast.status",
      payload: {
        timestamp: "2026-09-11T00:07:59.586Z",
        broadcast: { id: "BROADCAST_ID", videoRoomId: "ROOM_ID" },
      },
    },
  });
  const res = parseWsFrame(frame, { endpointKey: "api", direction: "in" });
  assert.equal(res.status, "ignored");
  assertEmptyOutputs(res);
});

// =====================================================================
group("6. comment.starred");

test("one starred event, zero comments, positive state only", () => {
  const res = parseFixture("comment.starred");
  assert.equal(res.status, "ok");
  assert.equal(res.comments.length, 0);
  assert.equal(res.events.length, 1);
  assert.deepEqual(res.events[0], {
    kind: "starred",
    commentId: "LCC.SANITIZED_1",
    broadcastId: "BROADCAST_ID",
    starredAt: "2026-09-11T00:07:25.302Z",
  });
});

// =====================================================================
group("7. outbound and recognized-unrelated frames are ignored");

test("comment.showRequest.out, api.hello.out, heartbeat.ping -> ignored", () => {
  for (const name of ["comment.showRequest.out", "api.hello.out", "heartbeat.ping"]) {
    const res = parseFixture(name);
    assert.equal(res.status, "ignored", `${name} should be ignored`);
    assertEmptyOutputs(res);
  }
});

test("synthetic inbound heartbeats on both endpoints -> ignored", () => {
  for (const endpointKey of ["room", "api"]) {
    for (const type of ["ping", "pong"]) {
      const res = parseWsFrame(JSON.stringify({ type, pingSentAt: 1 }), {
        endpointKey,
        direction: "in",
      });
      assert.equal(res.status, "ignored", `${endpointKey} ${type} should be ignored`);
      assertEmptyOutputs(res);
    }
  }
});

test("recognized unrelated room commands -> ignored", () => {
  for (const command of ["participantsUpdated", "clientList", "setRoomSettings"]) {
    const frame = JSON.stringify({
      type: "message",
      message: { command, body: {}, sentAt: "2026-09-11T00:05:39.956Z" },
      pos: 5,
    });
    const res = parseWsFrame(frame, { endpointKey: "room", direction: "in" });
    assert.equal(res.status, "ignored", `${command} should be ignored`);
    assertEmptyOutputs(res);
  }
});

// =====================================================================
group("8. synthetic malformed and unknown cases");

test("synthetic: truncated outer JSON -> malformed frame.json.parseFailed", () => {
  const res = parseWsFrame('{"type":"message","message":{"command":"appMessage"', {
    endpointKey: "room",
    direction: "in",
  });
  assertMalformed(res);
  assert.ok(res.errors.includes("frame.json.parseFailed"));
});

test("synthetic: broken inner escaping -> malformed room.innerJson.parseFailed", () => {
  const brokenInner =
    '{"data":{"comments":[{"id":"LCC.BROKEN","name":"@broken","platform":"youtube","authorPlatformId":"UC_BROKEN","createdAt":"2026-09-11T00:05:37.664Z","contents":[{"type":"text","content":"broken "quote" here"}]}],"broadcastId":"BROADCAST_ID"},"type":"platformComments.created"}';
  const res = parseWsFrame(roomFrame(brokenInner), { endpointKey: "room", direction: "in" });
  assertMalformed(res);
  assert.ok(res.errors.includes("room.innerJson.parseFailed"));
});

test("synthetic: wrong field types -> malformed, zero comments", () => {
  const frame = roomFrame(
    createdInner([
      { id: 123, name: {}, platform: [], authorPlatformId: null, createdAt: 123, contents: "nope" },
    ])
  );
  const res = parseWsFrame(frame, { endpointKey: "room", direction: "in" });
  assertMalformed(res);
  for (const code of [
    "comment.missingId",
    "comment.missingName",
    "comment.missingPlatform",
    "comment.missingAuthorPlatformId",
    "comment.badCreatedAt",
    "comment.badContents",
  ]) {
    assert.ok(res.errors.includes(code), `expected diagnostic ${code}`);
  }
});

test("synthetic: missing id -> comment.missingId", () => {
  const frame = roomFrame(createdInner([syntheticComment({ id: undefined })]));
  const res = parseWsFrame(frame, { endpointKey: "room", direction: "in" });
  assertMalformed(res);
  assert.ok(res.errors.includes("comment.missingId"));
});

test("synthetic: missing name -> comment.missingName", () => {
  const frame = roomFrame(createdInner([syntheticComment({ name: undefined })]));
  const res = parseWsFrame(frame, { endpointKey: "room", direction: "in" });
  assertMalformed(res);
  assert.ok(res.errors.includes("comment.missingName"));
});

test("synthetic: unsafe pos -> room.badPos, whole batch rejected", () => {
  const frame = roomFrame(createdInner([syntheticComment()]), { pos: 1.5 });
  const res = parseWsFrame(frame, { endpointKey: "room", direction: "in" });
  assertMalformed(res);
  assert.ok(res.errors.includes("room.badPos"));
});

test("synthetic: one bad item rejects the whole batch (no partial output)", () => {
  const frame = roomFrame(
    createdInner([syntheticComment(), syntheticComment({ name: undefined })])
  );
  const res = parseWsFrame(frame, { endpointKey: "room", direction: "in" });
  assertMalformed(res);
  assert.equal(res.comments.length, 0);
});

test("synthetic: unsupported content type -> unsupportedContent, no partial comment", () => {
  const frame = roomFrame(
    createdInner([
      syntheticComment({ contents: [{ type: "image", url: "https://example.invalid/x.png" }] }),
    ])
  );
  const res = parseWsFrame(frame, { endpointKey: "room", direction: "in" });
  assertMalformed(res);
  assert.ok(res.errors.includes("unsupportedContent"));
  assert.equal(res.comments.length, 0);
});

test("synthetic: batch/item broadcastId contradiction -> comment.batchIdContradiction", () => {
  const frame = roomFrame(
    createdInner([syntheticComment({ broadcastId: "OTHER_BROADCAST" })], {
      broadcastId: "BROADCAST_ID",
    })
  );
  const res = parseWsFrame(frame, { endpointKey: "room", direction: "in" });
  assertMalformed(res);
  assert.ok(res.errors.includes("comment.batchIdContradiction"));
});

test("synthetic: unknown inner type -> unknown room.appMessage.unknownInnerType", () => {
  const frame = roomFrame({ type: "platformComments.deleted", data: { comments: [] } });
  const res = parseWsFrame(frame, { endpointKey: "room", direction: "in" });
  assert.equal(res.status, "unknown");
  assert.deepEqual(res.unknown, ["room.appMessage.unknownInnerType"]);
  assert.deepEqual(res.comments, []);
  assert.deepEqual(res.events, []);
  assert.deepEqual(res.errors, []);
});

test("synthetic: unknown room command -> unknown room.unknownCommand", () => {
  const frame = JSON.stringify({
    type: "message",
    message: { command: "someFutureCommand", body: {} },
    pos: 6,
  });
  const res = parseWsFrame(frame, { endpointKey: "room", direction: "in" });
  assert.equal(res.status, "unknown");
  assert.ok(res.unknown.includes("room.unknownCommand"));
  assert.equal(res.comments.length, 0);
  assert.equal(res.events.length, 0);
  assert.equal(res.errors.length, 0);
});

test("synthetic: unknown subscription -> unknown api.update.unknownSubscription", () => {
  const frame = JSON.stringify({
    type: "update",
    message: { subscription: "comment.deleted", payload: {} },
  });
  const res = parseWsFrame(frame, { endpointKey: "api", direction: "in" });
  assert.equal(res.status, "unknown");
  assert.ok(res.unknown.includes("api.update.unknownSubscription"));
  assert.equal(res.comments.length, 0);
  assert.equal(res.events.length, 0);
  assert.equal(res.errors.length, 0);
});

test("synthetic: binary input -> malformed unsupportedBinary", () => {
  const inputs = [new ArrayBuffer(8), new Uint8Array([1, 2, 3]), "\u0000\u0001binary"];
  if (typeof Buffer !== "undefined") inputs.push(Buffer.from([4, 5, 6]));
  for (const raw of inputs) {
    const res = parseWsFrame(raw, { endpointKey: "room", direction: "in" });
    assertMalformed(res);
    assert.deepEqual(res.errors, ["unsupportedBinary"]);
  }
});

test("synthetic: unsupported endpoint -> malformed unsupportedEndpoint", () => {
  const res = parseWsFrame("{}", { endpointKey: "other", direction: "in" });
  assertMalformed(res);
  assert.deepEqual(res.errors, ["unsupportedEndpoint"]);
});

test("synthetic: hostile inputs never throw and always return the full shape", () => {
  const hostile = [
    undefined,
    null,
    0,
    1.5,
    NaN,
    true,
    false,
    {},
    [],
    Symbol("x"),
    () => {},
    new Date(),
    new Map(),
    new Set(),
    10n,
    "",
  ];
  const validStatuses = new Set(["ok", "ignored", "unknown", "malformed"]);
  for (const raw of hostile) {
    for (const endpointKey of ["room", "api", "bogus", undefined]) {
      for (const direction of ["in", "out", undefined]) {
        let res;
        assert.doesNotThrow(() => {
          res = parseWsFrame(raw, { endpointKey, direction });
        });
        assert.ok(res && validStatuses.has(res.status), `bad status for ${String(raw)}`);
        assert.ok(Array.isArray(res.comments));
        assert.ok(Array.isArray(res.events));
        assert.ok(Array.isArray(res.unknown));
        assert.ok(Array.isArray(res.errors));
      }
    }
  }
});

// =====================================================================
group("9. synthetic mapping details");

test("synthetic: text segments concatenate in order with no invented separator", () => {
  const segments = [
    { type: "text", content: "بخش اول " },
    { type: "text", content: "بخش دوم؟" },
  ];
  const frame = roomFrame(createdInner([syntheticComment({ contents: segments })]));
  const res = parseWsFrame(frame, { endpointKey: "room", direction: "in" });
  assert.equal(res.status, "ok");
  assert.equal(res.comments[0].displayText, segments.map((s) => s.content).join(""));
});

test("synthetic: platform is lowercased and passed through without per-platform branches", () => {
  const frame = roomFrame(createdInner([syntheticComment({ platform: "YouTube" })]));
  const res = parseWsFrame(frame, { endpointKey: "room", direction: "in" });
  assert.equal(res.status, "ok");
  assert.equal(res.comments[0].platform, "youtube");

  const other = roomFrame(createdInner([syntheticComment({ platform: "facebook" })]));
  const otherRes = parseWsFrame(other, { endpointKey: "room", direction: "in" });
  assert.equal(otherRes.status, "ok");
  assert.equal(otherRes.comments[0].platform, "facebook");
});

test("synthetic: avatars must be https URLs without credentials, else dropped", () => {
  const frame = roomFrame(
    createdInner([
      syntheticComment({
        largeImageSrc: "http://insecure.example.invalid/avatar.jpg",
        smallImageSrc: "https://user:pass@example.invalid/avatar.jpg",
      }),
    ])
  );
  const res = parseWsFrame(frame, { endpointKey: "room", direction: "in" });
  assert.equal(res.status, "ok");
  assert.equal(res.comments.length, 1, "a dropped avatar must not invalidate the comment");
  assert.equal(res.comments[0].avatarLarge, null);
  assert.equal(res.comments[0].avatarSmall, null);
});

test("synthetic: compatible item-level identity is accepted", () => {
  const frame = roomFrame(
    createdInner([syntheticComment({ broadcastId: "BROADCAST_ID", destinationId: "DEST_ID" })])
  );
  const res = parseWsFrame(frame, { endpointKey: "room", direction: "in" });
  assert.equal(res.status, "ok");
  assert.equal(res.comments[0].broadcastId, "BROADCAST_ID");
  assert.equal(res.comments[0].destinationId, "DEST_ID");
});

// =====================================================================
console.log(`\nws-parser tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
