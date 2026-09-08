/*
 * replay.js - push a converted live-chat replay (real comments, real gaps)
 * through the REAL pipeline and annotate the feed live, like the extension
 * would have during the broadcast. The Node twin (with the exact numbers) is
 * test/replay-analysis.js.
 *
 * Controls: speed (x1 real time up to Instant), play/pause, restart, and an
 * opt-in Gemma 4 checkbox (off by default: a full replay would otherwise fire
 * ~90 Worker calls; the regex pipeline is what the replay validates).
 */

import { CONFIG } from "../src/config.js";
import { createState } from "../src/state.js";
import { processComment, applyLlmOverride } from "../src/grouping.js";
import { render } from "../src/ui.js";
import { classifyComment, llmContextFromDecision } from "../src/llm-classifier.js";

const DEFAULT_REPLAYS = [
  "replay-ic2UFFlRtU8.json", // 66 min · 101 comments
  "replay-fL3CUTuML2Q.json", // 87
  "replay-K3VYtVCGLsA.json", // 106
  "replay-wW9StLyzAug.json", // 45
  "replay-IDgILh--PwI.json", // 86
];

const panel = document.getElementById("panel");
const progressEl = document.getElementById("progress");
const statsEl = document.getElementById("stats");
const speedEl = document.getElementById("speed");
const playBtn = document.getElementById("play");
const restartBtn = document.getElementById("restart");
const llmEl = document.getElementById("use-llm");
const sessionEl = document.getElementById("session");

const PLATFORM_GLYPH = { youtube: "YT", facebook: "FB", instagram: "IG", twitch: "TW" };

let comments = [];
let runId = 0; // invalidates an in-flight run when restarting
let playing = false;
let cursor = 0;
let state = createState();
// Resolved logical timestamps of already-rendered comments; replayed sessions
// use a fixed base so the REAL gaps drive the continuation windows.
const T0 = 1700000000000;

const DECISION_LABELS = {
  primary: "kept (new question)",
  continuation: "joined to previous",
  "duplicate (exact)": "collapsed (exact duplicate)",
  "duplicate (fuzzy)": "dimmed (possible duplicate)",
  "duplicate (semantic)": "collapsed (LLM duplicate)",
  "extra (in window)": "dimmed (2nd, awaiting LLM)",
  "extra (out)": "dimmed (2nd, awaiting LLM)",
  "extra (hidden)": "hidden (LLM confirmed 2nd question)",
  greeting: "greeting, untouched",
};

// --- rendering ---------------------------------------------------------------

function buildRow(comment) {
  const row = document.createElement("div");
  row.className = "sy-comment";

  const avatar = document.createElement("span");
  avatar.className = "sy-avatar";
  avatar.textContent = PLATFORM_GLYPH[comment.platform] ?? "??";

  const body = document.createElement("div");
  body.className = "sy-body";

  const head = document.createElement("div");
  const author = document.createElement("span");
  author.className = "sy-author";
  author.textContent = comment.handle;
  const time = document.createElement("span");
  time.className = "sy-time";
  time.textContent = clock(comment.offsetMs);
  head.append(author, time);

  const text = document.createElement("div");
  text.className = "sy-text";
  text.textContent = comment.displayText;

  body.append(head, text);
  row.append(avatar, body);
  return row;
}

function clock(offsetMs) {
  const m = Math.floor(offsetMs / 60000);
  const s = Math.floor((offsetMs % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function labelOf(decision) {
  if (decision.type === "duplicate") {
    if (decision.kind === "exact") return "duplicate (exact)";
    if (decision.kind === "semantic") return "duplicate (semantic)";
    return "duplicate (fuzzy)";
  }
  if (decision.type === "extra") {
    if (decision.hide) return "extra (hidden)";
    return decision.withinWindow ? "extra (in window)" : "extra (out)";
  }
  return decision.type;
}

const tally = new Map();

function paintStats() {
  statsEl.replaceChildren();
  for (const [key, label] of Object.entries(DECISION_LABELS)) {
    const n = tally.get(key) ?? 0;
    if (n === 0) continue;
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = String(n);
    statsEl.append(dt, dd);
  }
}

function applyOverride(row, comment, decision, run) {
  if (!decision.needsLlmReview || !CONFIG.LLM_ENABLED || !llmEl.checked) return;
  classifyComment(
    comment,
    decision.recentQuestions,
    CONFIG,
    llmContextFromDecision(comment, decision)
  )
    .then((result) => {
      if (run !== runId || !row.isConnected) return;
      const next = applyLlmOverride(decision, result, state, CONFIG);
      if (!next || next === decision) return;
      render(next, CONFIG);
      for (const extra of next.alsoRender || []) {
        if (extra?.comment?.el) render(extra, CONFIG);
      }
    })
    .catch(() => {});
}

function step(comment) {
  const row = buildRow(comment);
  panel.appendChild(row);
  panel.scrollTop = panel.scrollHeight;
  progressEl.textContent = `${cursor + 1} / ${comments.length}`;

  comment.el = row;
  const decision = processComment(comment, state, CONFIG);
  render(decision, CONFIG);
  const key = labelOf(decision);
  tally.set(key, (tally.get(key) ?? 0) + 1);
  paintStats();
  applyOverride(row, comment, decision, runId);
}

// --- playback ----------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Wait `gapMs` of BROADCAST time, re-reading the speed selector every 100ms
   so a mid-replay speed change applies immediately. Speed 0 = instant. */
async function waitGap(gapMs, id) {
  let remaining = gapMs / 1000; // seconds of broadcast left to burn
  while (remaining > 0) {
    if (id !== runId) return false;
    if (!playing) {
      await sleep(100);
      continue;
    }
    const speed = Number(speedEl.value);
    if (speed === 0) return true; // caller renders instantly
    // Burn up to 100ms of wall clock per tick; at speed N that's N*0.1s of
    // broadcast time per tick.
    const stepSec = Math.min(remaining, 0.1 * speed);
    remaining -= stepSec;
    await sleep((stepSec / speed) * 1000);
  }
  return true;
}

async function play(id) {
  while (cursor < comments.length) {
    if (id !== runId) return;
    const speed = Number(speedEl.value);
    const gap =
      cursor === 0 ? 0 : comments[cursor].offsetMs - comments[cursor - 1].offsetMs;
    if (speed === 0) {
      // Instant: drain everything in one go with correct logical timestamps.
      while (cursor < comments.length) {
        step({ ...comments[cursor], timestamp: T0 + comments[cursor].offsetMs });
        cursor++;
      }
      playing = false;
      playBtn.textContent = "Play";
      return;
    }
    const keepGoing = await waitGap(gap, id);
    if (!keepGoing || id !== runId) return;
    while (!playing && id === runId && cursor < comments.length) {
      await sleep(100); // paused
    }
    if (id !== runId) return;
    step({ ...comments[cursor], timestamp: T0 + comments[cursor].offsetMs });
    cursor++;
  }
  playing = false;
  playBtn.textContent = "Play";
}

function restart() {
  runId++;
  playing = false;
  playBtn.textContent = "Play";
  cursor = 0;
  state = createState();
  tally.clear();
  paintStats();
  panel.replaceChildren();
  progressEl.textContent = `0 / ${comments.length}`;
}

playBtn.addEventListener("click", () => {
  if (cursor >= comments.length) restart();
  playing = !playing;
  playBtn.textContent = playing ? "Pause" : "Play";
  if (playing && cursor === 0) play(runId);
});

restartBtn.addEventListener("click", () => {
  restart();
  playing = true;
  playBtn.textContent = "Pause";
  play(runId);
});

// --- popup replica (same on/off as the live extension) ------------------------

document.getElementById("tagline").textContent = CONFIG.LABELS.popupTagline;
document.getElementById("footer-label").textContent = CONFIG.LABELS.popupFooter;
const hint = document.getElementById("hint");
hint.textContent = CONFIG.LABELS.popupHintOn;
document.getElementById("toggle").addEventListener("click", (e) => {
  const btn = e.currentTarget;
  const on = btn.getAttribute("aria-checked") !== "true";
  btn.setAttribute("aria-checked", String(on));
  btn.setAttribute("aria-label", on ? CONFIG.LABELS.popupStatusOn : CONFIG.LABELS.popupStatusOff);
  hint.textContent = on ? CONFIG.LABELS.popupHintOn : CONFIG.LABELS.popupHintOff;
  document.documentElement.classList.toggle("safwa-disabled", !on);
});

// --- load the fixtures --------------------------------------------------------

async function load() {
  if (!sessionEl.options.length) {
    for (const name of DEFAULT_REPLAYS) {
      const opt = document.createElement("option");
      opt.value = `./fixtures/${name}`;
      opt.textContent = name.replace(/^replay-|\.json$/g, "");
      sessionEl.appendChild(opt);
    }
    sessionEl.addEventListener("change", () => load());
  }
  const res = await fetch(sessionEl.value);
  if (!res.ok) throw new Error(`fixture ${res.status}`);
  comments = await res.json();
  restart();
}

load().catch(() => {
  progressEl.textContent = "fixture not found - serve via npm run demo";
});
