/*
 * teacher.js - what the teacher actually sees.
 * Left: StreamYard-style comments (real core + real badges).
 * Overlay: the real popup (logo, name, switch). The switch is the same
 * on/off the live extension uses (html.safwa-disabled).
 */

import { CONFIG } from "../src/config.js";
import { createState } from "../src/state.js";
import { processComment } from "../src/grouping.js";
import { render } from "../src/ui.js";
import { classifyComment } from "../src/llm-classifier.js";
import { STREAMS, T } from "./mock-comments.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROW_DELAY_MS = 700;
const PLATFORM_GLYPH = { youtube: "YT", facebook: "FB", instagram: "IG", twitch: "TW" };

const LIVE_KEYS = [
  "exactTriplicate",
  "nearDuplicate",
  "splitQuestion",
  "secondQuestionLater",
  "semanticPerfumeFasting",
  "semanticDistinctTravel",
];

function offsetStream(comments, addMs) {
  return comments.map((c) => ({ ...c, timestamp: c.timestamp + addMs }));
}

function buildLive() {
  const live = [];
  let add = 0;
  for (const key of LIVE_KEYS) {
    let stream = STREAMS[key];
    // Omar already used his one-question slot in secondQuestionLater.
    if (key === "semanticDistinctTravel") {
      stream = stream.map((c) =>
        c.handle === "عمر" ? { ...c, handle: "یاسر" } : c
      );
    }
    live.push(...offsetStream(stream, add));
    const last = stream[stream.length - 1].timestamp - T;
    add += last + 20000;
  }
  return live;
}

function buildRow(comment) {
  const row = document.createElement("div");
  row.className = "sy-comment";

  const avatar = document.createElement("span");
  avatar.className = "sy-avatar";
  avatar.textContent = PLATFORM_GLYPH[comment.platform] ?? "??";

  const body = document.createElement("div");
  body.className = "sy-body";

  const author = document.createElement("span");
  author.className = "sy-author";
  author.textContent = comment.handle;

  const platform = document.createElement("span");
  platform.className = "sy-platform";
  platform.textContent = comment.platform ?? "";

  const text = document.createElement("div");
  text.className = "sy-text";
  text.textContent = comment.displayText;

  body.append(author, platform, text);
  row.append(avatar, body);
  return row;
}

function applySemanticBadge(row) {
  row.classList.remove("safwa-primary");
  row.classList.add("safwa-dim");
  let badge = row.querySelector(".safwa-badge.safwa-badge--semantic");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "safwa-badge safwa-badge--semantic";
    row.appendChild(badge);
  }
  badge.setAttribute("dir", CONFIG.UI_DIRECTION);
  badge.textContent = CONFIG.LABELS.semanticDuplicate;
}

async function handle(comment, state, panel) {
  const row = buildRow(comment);
  panel.appendChild(row);
  panel.scrollTop = panel.scrollHeight;
  comment.el = row;
  const decision = processComment(comment, state, CONFIG);
  render(decision, CONFIG);
  if (decision.needsLlmReview && CONFIG.LLM_ENABLED) {
    const result = await classifyComment(comment, decision.recentQuestions, CONFIG);
    if (result?.classification === "duplicate") applySemanticBadge(row);
  }
}

function wireToggle() {
  const btn = document.getElementById("toggle");
  btn.addEventListener("click", () => {
    const on = btn.getAttribute("aria-checked") !== "true";
    btn.setAttribute("aria-checked", String(on));
    btn.setAttribute("aria-label", on ? CONFIG.LABELS.popupStatusOn : CONFIG.LABELS.popupStatusOff);
    document.documentElement.classList.toggle("safwa-disabled", !on);
  });
}

wireToggle();

const panel = document.getElementById("panel");
const state = createState();
for (const c of buildLive()) {
  await handle({ ...c }, state, panel);
  await sleep(ROW_DELAY_MS);
}
