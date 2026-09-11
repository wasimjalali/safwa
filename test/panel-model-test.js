/*
 * panel-model-test.js - projection coverage for the sidebar rows
 * (spec Sections 6.1 and 12). Drives synthetic admission records + enriched
 * decisions through buildViewRows and asserts reachability + row anatomy.
 */

import assert from "node:assert/strict";
import { buildViewRows, describeHealth, featureAvailability, platformIcon, PLATFORM_ICONS } from "../src/panel-model.js";
import { CONFIG } from "../src/config.js";

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

const config = Object.assign({}, CONFIG, {
  FEATURE_PROXY_ENABLED: true,
  PANEL_MODE: "sidebar",
});

function record(sourceId, handle, displayText, admittedAt, extra = {}) {
  return {
    sourceId,
    handle,
    platform: "youtube",
    displayText,
    admittedAt,
    avatarUrl: "",
    domAnchor: true,
    shown: "unknown",
    starred: "unknown",
    ...extra,
  };
}

check("primary rows project in admission order with anatomy", () => {
  const records = [
    record("src_1", "@a", "سوال اول", 1000),
    record("src_2", "@b", "سوال دوم", 2000),
  ];
  const decisions = new Map([
    ["src_1", { type: "primary" }],
    ["src_2", { type: "primary" }],
  ]);
  const { rows, folded } = buildViewRows(records, decisions, config);
  assert.equal(rows.length, 2);
  assert.equal(folded.length, 0);
  assert.equal(rows[0].primary.sourceId, "src_1");
  assert.equal(rows[0].primary.handle, "@a");
  assert.equal(rows[0].primary.platformLabel, "Youtube");
  assert.equal(rows[0].feature.available, true);
  assert.equal(rows[0].feature.labelKey, "featureShow");
});

check("duplicate folds onto target with members and count label", () => {
  const records = [
    record("src_1", "@a", "زکات؟", 1000),
    record("src_2", "@b", "زکات؟", 1500),
  ];
  const decisions = new Map([
    ["src_1", { type: "primary" }],
    ["src_2", { type: "duplicate", targetSourceId: "src_1", count: 2 }],
  ]);
  const { rows, folded } = buildViewRows(records, decisions, config);
  assert.equal(rows.length, 1);
  assert.equal(folded.length, 0);
  assert.equal(rows[0].badges.count, 2);
  assert.equal(rows[0].members.length, 2);
  assert.match(rows[0].badges.countLabel, /2/); // Western digits are the configured default
});

check("continuation folds onto the first fragment as one numbered row", () => {
  const records = [
    record("src_1", "@a", "نصف اول", 1000),
    record("src_2", "@a", "نصف دوم", 1500),
  ];
  const fragments = [
    { sourceId: "src_1", handle: "@a", displayText: "نصف اول", admittedAt: 1000 },
    { sourceId: "src_2", handle: "@a", displayText: "نصف دوم", admittedAt: 1500 },
  ];
  const decisions = new Map([
    ["src_1", { type: "primary" }],
    ["src_2", { type: "continuation", joinedFragments: fragments }],
  ]);
  const { rows } = buildViewRows(records, decisions, config);
  assert.equal(rows.length, 1, "two parts are one question");
  assert.equal(rows[0].primary.sourceId, "src_1");
  assert.equal(rows[0].badges.joined, true);
  assert.equal(rows[0].joinedFragments.length, 2);
  assert.equal(rows[0].feature.labelKey, "featureShowFirst");
  assert.equal(rows[0].feature.targetSourceId, "src_1");
  assert.equal(rows[0].index, 1);
  assert.equal(rows[0].indexLabel, "۱");
});

check("a later primary after a split keeps its own number", () => {
  const records = [
    record("src_1", "@a", "نصف اول", 1000),
    record("src_2", "@a", "نصف دوم", 1500),
    record("src_3", "@b", "سوال دیگر", 2000),
  ];
  const fragments = [
    { sourceId: "src_1", handle: "@a", displayText: "نصف اول", admittedAt: 1000 },
    { sourceId: "src_2", handle: "@a", displayText: "نصف دوم", admittedAt: 1500 },
  ];
  const decisions = new Map([
    ["src_1", { type: "primary" }],
    ["src_2", { type: "continuation", joinedFragments: fragments }],
    ["src_3", { type: "primary" }],
  ]);
  const { rows } = buildViewRows(records, decisions, config);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].primary.sourceId, "src_1");
  assert.equal(rows[0].indexLabel, "۱");
  assert.equal(rows[1].primary.sourceId, "src_3");
  assert.equal(rows[1].indexLabel, "۲");
});

check("joined fallback never features the tail when the head row is missing", () => {
  const records = [record("src_2", "@a", "نصف دوم", 1500)];
  const decisions = new Map([
    ["src_2", { type: "continuation", joinedFragments: [
      { sourceId: "src_1", handle: "@a", displayText: "نصف اول", admittedAt: 1000 },
      { sourceId: "src_2", handle: "@a", displayText: "نصف دوم", admittedAt: 1500 },
    ] }],
  ]);
  const { rows } = buildViewRows(records, decisions, config);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].feature.available, false);
  assert.equal(rows[0].feature.targetSourceId, "src_1");
  assert.equal(rows[0].feature.labelKey, "featureShowFirst");
});

check("unconfirmed extra stays visible with the second-question badge", () => {
  const records = [record("src_1", "@a", "سوال دوم", 1000)];
  const decisions = new Map([["src_1", { type: "extra", hide: false }]]);
  const { rows, folded } = buildViewRows(records, decisions, config);
  assert.equal(rows[0].badges.secondQuestion, true);
  assert.equal(folded.length, 0);
});

check("confirmed extra is hidden but stays reachable in folded", () => {
  const records = [record("src_1", "@a", "سوال دوم", 1000)];
  const decisions = new Map([["src_1", { type: "extra", hide: true }]]);
  const { rows, folded } = buildViewRows(records, decisions, config);
  assert.equal(rows.length, 0, "hidden means no main row");
  assert.equal(folded.length, 1, "but still reachable");
  assert.equal(folded[0].sourceId, "src_1");
});

check("platform icons exist for the measured platforms plus fallback", () => {
  assert.match(platformIcon("youtube"), /<svg/);
  assert.match(platformIcon("facebook"), /<svg/);
  assert.match(platformIcon("instagram"), /<svg/);
  assert.match(platformIcon("YOUTUBE"), /#FF0000/);
  assert.match(platformIcon("myspace"), /<svg/);
  assert.equal(platformIcon(""), PLATFORM_ICONS.fallback);
  assert.equal(platformIcon(null), PLATFORM_ICONS.fallback);
});

check("pending review flag preserved", () => {
  const records = [record("src_1", "@a", "شاید تکراری", 1000)];
  const decisions = new Map([["src_1", { type: "primary", pendingReview: true }]]);
  const { rows } = buildViewRows(records, decisions, config);
  assert.equal(rows[0].badges.pendingReview, true);
});

check("hidden greeting stays reachable in folded", () => {
  const records = [record("src_1", "@a", "سلام", 1000)];
  const decisions = new Map([["src_1", { type: "greeting", hide: true }]]);
  const { rows, folded } = buildViewRows(records, decisions, config);
  assert.equal(rows.length, 0);
  assert.equal(folded.length, 1);
  assert.equal(folded[0].sourceId, "src_1");
});

check("feature unavailable without dom anchor; on-air stays clickable", () => {
  const records = [
    record("src_1", "@a", "بدون لنگر", 1000, { domAnchor: false }),
    record("src_2", "@b", "روی پخش", 2000, { shown: "on" }),
    record("src_3", "@c", "در انتظار", 3000, { shown: "pending" }),
  ];
  const decisions = new Map([
    ["src_1", { type: "primary" }],
    ["src_2", { type: "primary" }],
    ["src_3", { type: "primary" }],
  ]);
  const { rows } = buildViewRows(records, decisions, config);
  assert.equal(rows.find((r) => r.primary.sourceId === "src_1").feature.available, false);
  assert.equal(rows.find((r) => r.primary.sourceId === "src_2").feature.available, true);
  assert.equal(rows.find((r) => r.primary.sourceId === "src_2").shown, "on");
  assert.equal(rows.find((r) => r.primary.sourceId === "src_3").feature.available, false);
  assert.equal(rows[0].indexLabel, "۱");
  assert.equal(rows[1].indexLabel, "۲");
  assert.equal(rows[2].indexLabel, "۳");
});

check("featureAvailability is the shared gate for session and projection", () => {
  const base = { enabled: true, sidebar: true, anchorOk: true, shown: "unknown" };
  assert.equal(featureAvailability(base).available, true);
  assert.equal(featureAvailability({ ...base, shown: "on" }).available, true);
  assert.equal(featureAvailability({ ...base, shown: "pending" }).available, false);
  assert.equal(featureAvailability({ ...base, coolingUntil: 20, now: 10 }).available, false);
  assert.equal(featureAvailability({ ...base, coolingUntil: 20, now: 21 }).available, true);
  assert.equal(featureAvailability({ ...base, anchorOk: false }).available, false);
});

check("duplicate with unknown target stays reachable in folded", () => {
  const records = [record("src_9", "@x", "یتیم", 1000)];
  const decisions = new Map([["src_9", { type: "duplicate", targetSourceId: "src_missing", count: 2 }]]);
  const { rows, folded } = buildViewRows(records, decisions, config);
  assert.equal(rows.length, 0);
  assert.equal(folded.length, 1);
});

check("describeHealth maps states to label keys", () => {
  assert.equal(describeHealth("off", "unavailable", config), "panelKeepCommentsOpen");
  assert.equal(describeHealth("off", "disconnected", config), "panelDisconnected");
  assert.equal(describeHealth("off", "simple", config), "panelSimpleMode");
  assert.equal(describeHealth("off", "loading", config), "panelLoading");
});

console.log(`panel-model tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
