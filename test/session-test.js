import assert from "node:assert/strict";
import { CONFIG, STORAGE_KEYS, readStoredSettings, applyStoredSettings } from "../src/config.js";
import { startSession } from "../src/session.js";
import * as stateMod from "../src/state.js";
import * as grouping from "../src/grouping.js";
import * as panelModel from "../src/panel-model.js";
import * as protocol from "../src/protocol.js";
import * as admissionMod from "../src/admission.js";
import * as healthMod from "../src/health.js";
import { llmContextFromDecision } from "../src/llm-classifier.js";

const real = { setTimeout, clearTimeout, setInterval, clearInterval, now: Date.now };
let passed = 0;
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const event = () => ({ listeners: [], addListener(fn) { this.listeners.push(fn); }, fire(...args) { this.listeners.forEach(fn => fn(...args)); } });

async function harness({ ai = false, classify, initial = {}, duringLoad, failFirstRead = false } = {}) {
  let time = 100000;
  let nextTimer = 0;
  const timers = new Map();
  globalThis.setTimeout = (fn, ms) => { const id = ++nextTimer; timers.set(id, { fn, at: time + ms }); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  globalThis.setInterval = (fn, ms) => { const id = ++nextTimer; timers.set(id, { fn, at: time + ms, interval: ms }); return id; };
  globalThis.clearInterval = id => timers.delete(id);
  Date.now = () => time;
  globalThis.location = { origin: "https://streamyard.com", pathname: "/studio/a" };
  globalThis.document = {};
  let observer;
  globalThis.MutationObserver = class {
    constructor(fn) { observer = fn; }
    observe() {}
    disconnect() {}
  };
  const onConnect = event(), onMessage = event(), onChanged = event();
  const prefs = { [STORAGE_KEYS.llmEnabled]: ai, ...initial };
  let storageReads = 0;
  globalThis.chrome = {
    runtime: { id: "test", onConnect, onMessage, getManifest: () => ({ version: "test" }) },
    storage: { local: { get: async () => {
      if (failFirstRead && storageReads++ === 0) throw new Error("temporary storage failure");
      const snapshot = { ...prefs };
      await Promise.resolve();
      duringLoad?.(onChanged);
      return snapshot;
    } }, onChanged },
  };
  const nodes = [];
  const container = { isConnected: true };
  let clicks = 0;
  const matches = (a, b) => a && b && a.handle === b.handle && a.platform === b.platform && a.displayText === b.displayText;
  const extract = node => node?.isConnected ? { ...node.comment, timestamp: time } : null;
  const dom = {
    selectorsConfirmed: () => true,
    findCommentContainer: () => container.isConnected ? container : null,
    collectCommentNodes: () => nodes.filter(n => n.isConnected),
    extractComment: extract,
    closestCommentNode: node => nodes.includes(node) ? node : null,
    commentNodesWithin: () => [],
    commentMatches: matches,
    findMatchingCommentNodes: (_container, record) => nodes.filter(node => node.isConnected && matches(node.comment, record)),
    findShowButton: node => node.button,
    clickShowButton: () => { clicks++; return true; },
  };
  startSession({ CONFIG, STORAGE_KEYS, readStoredSettings, applyStoredSettings, dom, stateMod, grouping,
    panelModel, protocol, admissionMod, healthMod, wsParser: null,
    llm: { llmContextFromDecision, classifyComment: classify ?? (async () => null) } });
  await settle();
  const messages = [];
  const port = { name: protocol.PORT_NAME, onMessage: event(), onDisconnect: event(), postMessage: msg => messages.push(msg) };
  onConnect.fire(port);
  const send = msg => port.onMessage.fire(protocol.makeEnvelope(msg.type, msg));
  const snapshot = () => {
    messages.length = 0;
    send({ type: "SUBSCRIBE", documentToken: null, sessionEpoch: null });
    const begin = messages.find(m => m.type === "SNAPSHOT_BEGIN");
    return { begin, rows: messages.filter(m => m.type === "SNAPSHOT_CHUNK").flatMap(m => m.rows),
      folded: messages.find(m => m.type === "SNAPSHOT_END")?.folded };
  };
  async function tick(ms = 250) {
    const end = time + ms;
    let guard = 0;
    while (true) {
      const due = [...timers].filter(([,t]) => t.at <= end).sort((a,b) => a[1].at - b[1].at)[0];
      if (!due) break;
      if (++guard > 2000) throw new Error("timer runaway");
      const [id, task] = due;
      time = task.at;
      if (task.interval) task.at += task.interval; else timers.delete(id);
      task.fn();
      await settle();
    }
    time = end;
    await settle();
  }
  async function add(handle, text, platform = "youtube") {
    const node = { comment: { handle, platform, displayText: text, avatar: "" }, isConnected: true,
      button: { disabled: false }, classList: { contains: () => false }, querySelector: () => null };
    nodes.push(node);
    observer([{ type: "childList", target: container, addedNodes: [node] }]);
    await tick();
    return node;
  }
  async function mutate(node) {
    observer([{ type: "characterData", target: { parentElement: node }, addedNodes: [] }]);
    await tick();
  }
  async function setting(key, value) {
    prefs[key] = value;
    onChanged.fire({ [key]: { newValue: value } }, "local");
    await tick();
  }
  return { add, mutate, snapshot, send, tick, setting, messages, nodes, container,
    clicks: () => clicks,
    feature: async (row, begin) => {
      let result;
      onMessage.fire({ v: 2, type: "FEATURE_REQUEST", requestId: `req-${time}`, windowId: 1, tabId: 1,
        documentToken: begin.documentToken, sessionEpoch: begin.sessionEpoch, sourceId: row.primary.sourceId,
        sourceRevision: row.feature.contentRevision, expiresAt: time + 2000 },
        { id: "test" }, res => { result = res; });
      await settle();
      return result;
    },
  };
}

async function check(name, fn) {
  try { await fn(); passed++; console.log(`  PASS  ${name}`); }
  finally { Object.assign(globalThis, { setTimeout: real.setTimeout, clearTimeout: real.clearTimeout,
    setInterval: real.setInterval, clearInterval: real.clearInterval }); Date.now = real.now; }
}

await check("pending fuzzy duplicates remain visible when AI is offline", async () => {
  const h = await harness();
  await h.add("@a", "حکم نماز خواندن در حال سفر طولانی با خانواده چیست؟");
  await h.add("@b", "حکم نماز خواندن در حال سفر طولانی با خانواده چیست امروز؟");
  assert.equal(h.snapshot().rows.length, 2);
  assert.equal(h.snapshot().folded.length, 0);
  assert.equal(h.snapshot().rows[1].badges.pendingReview, true);
});
await check("reobserving identical mounted comments does not inflate counts", async () => {
  const h = await harness();
  const a = await h.add("@a", "حکم نماز چیست؟");
  const b = await h.add("@a", "حکم نماز چیست؟");
  await h.mutate(a); await h.mutate(b); await h.mutate(a);
  const { rows } = h.snapshot();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].members.length, 2);
  assert.equal(rows[0].badges.count, 2);
});
await check("remounted rows reuse their question and update feature availability", async () => {
  const h = await harness();
  const a = await h.add("@a", "حکم نماز چیست؟");
  a.isConnected = false;
  await h.mutate(a);
  assert.equal(h.snapshot().rows[0].feature.available, false);
  await h.add("@a", "حکم نماز چیست؟");
  assert.equal(h.snapshot().rows.length, 1);
  assert.equal(h.snapshot().rows[0].feature.available, true);
});
await check("the same handle on different platforms gets separate question slots", async () => {
  const h = await harness();
  for (const platform of ["youtube", "facebook", "instagram", "twitch", "linkedin", "unknown"]) {
    await h.add("@a", `سوال ${platform} چیست؟`, platform);
  }
  const { rows } = h.snapshot();
  assert.equal(rows.length, 6);
  assert(rows.every(row => !row.badges.secondQuestion && !row.badges.joined));
});
await check("cross-platform duplicates share a count and return when collapse is off", async () => {
  const h = await harness();
  await h.add("@a", "حکم نماز چیست؟", "youtube");
  await h.add("@b", "حکم نماز چیست؟", "facebook");
  assert.equal(h.snapshot().rows[0].badges.count, 2);
  await h.setting(STORAGE_KEYS.collapseDuplicates, false);
  assert.equal(h.snapshot().rows.length, 2);
});
await check("all teacher toggles replay existing comments safely", async () => {
  const h = await harness();
  await h.add("@a", "سوال من در مورد میراث است");
  await h.add("@a", "و دارایی شامل خانه است");
  await h.add("@b", "سلام استاد");
  assert.equal(h.snapshot().rows.length, 1);
  await h.setting(STORAGE_KEYS.joinContinuations, false);
  assert.equal(h.snapshot().rows.length, 2);
  await h.setting(STORAGE_KEYS.hideGreetings, false);
  assert.equal(h.snapshot().rows.length, 3);
  await h.setting(STORAGE_KEYS.hideExtras, false);
  assert.equal(h.snapshot().rows.length, 3);
});
await check("reset acknowledges success, rejects stale requests and clears AI queue", async () => {
  const resolvers = [];
  const h = await harness({ ai: true, classify: () => new Promise(resolve => resolvers.push(resolve)) });
  await h.add("@a", "نماز چند رکعت است؟");
  await h.add("@b", "حکم روزه چیست؟");
  await h.add("@c", "حکم زکات چیست؟");
  await h.add("@d", "حکم حج چیست؟");
  const { begin } = h.snapshot();
  h.nodes.forEach(node => { node.isConnected = false; });
  h.send({ ...begin, type: "RESET_SESSION", requestId: "reset-1" });
  assert(h.messages.some(m => m.type === "RESET_RESULT" && m.ok));
  for (const resolve of resolvers) resolve({ classification: "duplicate", match: 1 });
  await h.tick();
  assert.equal(h.snapshot().rows.length, 0);
  h.send({ ...begin, type: "RESET_SESSION", requestId: "stale" });
  assert(h.messages.some(m => m.requestId === "stale" && m.ok === false));
  assert.equal(resolvers.length, 2, "old queued reviews must not start after reset");
});
await check("master off stops admission and cancels pending AI work", async () => {
  let calls = 0, signal;
  const h = await harness({ ai: true, classify: async (_c, _q, _cfg, ctx) => {
    calls++; signal = ctx.signal; return new Promise(() => {});
  } });
  await h.add("@a", "حکم نماز چیست؟");
  await h.add("@b", "حکم حج چیست؟");
  await h.setting(STORAGE_KEYS.enabled, false);
  assert.equal(signal.aborted, true);
  await h.add("@c", "حکم زکات چیست؟");
  assert.equal(calls, 1);
  assert.equal(h.snapshot().rows.length, 2);
  await h.setting(STORAGE_KEYS.enabled, true);
  assert.equal(h.snapshot().rows.length, 3);
});
await check("feature clicks require a live matching row and master on", async () => {
  const h = await harness();
  const node = await h.add("@a", "حکم نماز چیست؟");
  const { rows, begin } = h.snapshot();
  assert.equal((await h.feature(rows[0], begin)).outcome, "clicked");
  assert.equal(h.clicks(), 1);
  await h.setting(STORAGE_KEYS.enabled, false);
  assert.equal((await h.feature(rows[0], begin)).outcome, "refused");
  node.comment.displayText = "حکم روزه چیست؟";
  await h.setting(STORAGE_KEYS.enabled, true);
  assert.equal((await h.feature(rows[0], begin)).outcome, "refused");
  assert.equal(h.clicks(), 1);
});
await check("studio route changes discard old history and reseed the new studio", async () => {
  const h = await harness();
  const old = await h.add("@a", "حکم نماز چیست؟");
  old.isConnected = false;
  location.pathname = "/studio/b";
  await h.add("@b", "حکم روزه چیست؟");
  await h.tick(3500);
  const { rows } = h.snapshot();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].primary.handle, "@b");
});
await check("two-copy remount preserves the original duplicate count", async () => {
  const h = await harness();
  const first = await h.add("@a", "حکم نماز چیست؟");
  await h.add("@a", "حکم نماز چیست؟");
  first.isConnected = false;
  await h.mutate(first);
  await h.add("@a", "حکم نماز چیست؟");
  assert.equal(h.snapshot().rows[0].badges.count, 2);
});
await check("startup setting changes preserve unrelated saved off preferences", async () => {
  const h = await harness({
    initial: { [STORAGE_KEYS.enabled]: false, [STORAGE_KEYS.hideGreetings]: false },
    duringLoad: event => event.fire({ [STORAGE_KEYS.collapseDuplicates]: { newValue: false } }, "local"),
  });
  await h.add("@a", "سلام استاد");
  assert.equal(h.snapshot().rows.length, 0, "saved master off must win");
  await h.setting(STORAGE_KEYS.enabled, true);
  assert.equal(h.snapshot().rows.length, 1, "saved greetings-off must survive startup race");
});
await check("out-of-order AI results re-review changed context without hiding the row", async () => {
  const jobs = [];
  const h = await harness({ ai: true, classify: (comment, context) => new Promise(resolve => jobs.push({ comment, context, resolve })) });
  await h.add("@a", "نماز چند رکعت است؟");
  await h.add("@b", "حکم روزه چیست؟");
  await h.add("@c", "حکم زکات چیست؟");
  assert.equal(jobs.length, 2);
  jobs[0].resolve({ classification: "duplicate", match: 1 });
  await h.tick();
  jobs[1].resolve({ classification: "duplicate", match: 1 });
  await h.tick();
  assert.equal(jobs.length, 3, "changed context receives a replacement review");
  assert(h.snapshot().rows.some(row => row.primary.handle === "@c"));
  jobs[2].resolve({ classification: "primary" });
  await h.tick();
  assert(h.snapshot().rows.some(row => row.primary.handle === "@c"));
});
await check("failed startup preferences recover fully before capture or AI resumes", async () => {
  let classifications = 0;
  const h = await harness({ failFirstRead: true, ai: false,
    initial: { [STORAGE_KEYS.hideGreetings]: false },
    classify: async () => { classifications++; return null; } });
  await h.add("@a", "سلام استاد");
  assert.equal(h.snapshot().rows.length, 0, "storage failure pauses admission");
  await h.setting(STORAGE_KEYS.enabled, true);
  await h.tick();
  assert.equal(h.snapshot().rows.length, 1, "saved greeting preference recovered");
  await h.add("@b", "حکم نماز چیست؟");
  await h.add("@c", "نماز چه حکمی دارد؟");
  assert.equal(classifications, 0, "saved AI-off preference recovered before resuming");
  await h.tick(1500);
  assert.equal(h.messages.filter(m => m.type === "HEALTH").at(-1).settingsError, false);
});
console.log(`session integration tests: ${passed} passed`);
