/*
 * demo.js - visual simulation harness (spec Section 12, "a mock comment source").
 *
 * It fakes a StreamYard-style comments panel and feeds scripted comments into it
 * over time, while the REAL matching core (normalize / dedup / grouping / state)
 * and the REAL ui.js annotate them live. Only the comment SOURCE is simulated.
 * This is the visual twin of `npm test`.
 *
 * Must be served over http (ES modules don't load from file://). See README.
 */

import { CONFIG } from "../src/config.js";
import { createState } from "../src/state.js";
import { processComment } from "../src/grouping.js";
import { render } from "../src/ui.js";
import { classifyComment } from "../src/llm-classifier.js";
import { STREAMS } from "./mock-comments.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Visual pacing between rows. The pipeline LOGIC uses each comment's scripted
// timestamp, so continuation windows behave correctly no matter how fast we draw.
const ROW_DELAY_MS = 750;

const PLATFORM_GLYPH = { youtube: "YT", facebook: "FB", instagram: "IG", twitch: "TW" };

/** Build one fake comment row. The returned element becomes comment.el. */
function buildRow(comment) {
  const row = document.createElement("div");
  row.className = "demo-comment";

  const avatar = document.createElement("span");
  avatar.className = "demo-avatar";
  avatar.textContent = PLATFORM_GLYPH[comment.platform] ?? "??";

  const body = document.createElement("div");
  body.className = "demo-body";

  const author = document.createElement("span");
  author.className = "demo-author";
  author.textContent = comment.handle;

  const platform = document.createElement("span");
  platform.className = "demo-platform";
  platform.textContent = comment.platform ?? "";

  const text = document.createElement("div");
  text.className = "demo-text";
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

/** Push one comment through regex, then Gemma 4 if the pipeline asks. */
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
  return decision;
}

// --- Scenario playback ------------------------------------------------------

const SCENARIOS = [
  {
    key: "exactTriplicate",
    title: "1. Same exact question, posted three times",
    expect: "First stays and shows the count badge. The two repeats collapse (hidden).",
  },
  {
    key: "variantSpelling",
    title: "Dari: same question typed on an Arabic vs Persian keyboard",
    expect: "Different bytes (ي/ی, ك/ک, tatweel), same question. The second collapses as an exact duplicate.",
  },
  {
    key: "nearDuplicate",
    title: "2. Reworded / reordered near-duplicate",
    expect: "Same words, reordered. Second is marked “possible duplicate” and dimmed, NOT hidden.",
  },
  {
    key: "splitQuestion",
    title: "3. One long question split across two comments (same person, within window)",
    expect: "Second gets the “joined” badge. Both stay visible as one question. Not flagged, not a duplicate.",
  },
  {
    key: "secondQuestionLater",
    title: "4. A genuine second question, later in the session",
    expect: "Second is filtered out (hidden) so the teacher reads one question per person. Toggle the extension OFF to reveal it.",
  },
  {
    key: "twoDifferentHandles",
    title: "5. Two different people, two different questions",
    expect: "Nothing flagged. Both are clean, separate questions.",
  },
  {
    key: "distinctSecondInsideWindow",
    title: "4b. A separate second question only 5s later (no continuation cue)",
    expect: "Treated as a 2nd question and hidden, so the teacher never reads it. (A safety flag can keep in-window ones dimmed instead, if a real split ever gets hidden.)",
  },
  {
    key: "cappedContinuation",
    title: "6. One person dribbles a question across THREE comments",
    expect: "Question + one continuation are kept and joined. The third piece is over the cap, so it's hidden. One person can't flood the feed as one long question.",
  },
  {
    key: "greetingThenQuestion",
    title: "7. A greeting first, then the real question a minute later",
    expect: "The greeting is left alone and never counts as the person's question, so the real question still comes through clean.",
  },
  {
    key: "doubleSend",
    title: "8. Double-send: the same text sent twice, then the real continuation",
    expect: "The re-send collapses as a duplicate (count badge, no doubled text). The continuation sent after it still joins the question.",
  },
  {
    key: "crossPlatformDuplicate",
    title: "Cross-platform: same text from Instagram then YouTube",
    expect: "Different platforms, different people, same question. The second collapses as a duplicate.",
  },
  {
    key: "sameHandleCrossPlatform",
    title: "Cross-platform: same handle, two platforms, two questions",
    expect: "Both stay as clean questions. We never link the same name across platforms.",
  },
  {
    key: "honorificPrefixed",
    title: "Honorific stripping: “سلام استاد …” + the same question",
    expect: "The greeting is ignored for matching, so the second collapses as a duplicate.",
  },
  {
    key: "semanticPerfumeFasting",
    title: "LLM: same question, completely different words (perfume while fasting)",
    expect: "Regex cannot match these. Gemma 4 should dim the second and badge it as a semantic duplicate.",
  },
  {
    key: "semanticFastingTravel",
    title: "LLM: same question, different phrasing (fasting while traveling)",
    expect: "Regex leaves both primary. Gemma 4 should flag the second as a semantic duplicate.",
  },
  {
    key: "semanticDistinctTravel",
    title: "LLM: related words, different questions (Friday prayer vs fasting in travel)",
    expect: "Both stay primary. Gemma 4 must not merge them.",
  },
  {
    key: "semanticWajibFard",
    title: "LLM: same question, واجب vs فرض (zakat on gold)",
    expect: "Regex leaves both primary. Gemma 4 should flag the second as a duplicate.",
  },
  {
    key: "trapZakatJewelryCoins",
    title: "LLM: same topic, different objects (gold jewelry vs gold coins)",
    expect: "Both stay primary. Worn gold and minted gold are different asks.",
  },
];

async function playScenario(scenario, mount) {
  const group = document.createElement("section");
  group.className = "demo-group";

  const h = document.createElement("h3");
  h.textContent = scenario.title;
  const exp = document.createElement("p");
  exp.className = "demo-expect";
  exp.textContent = `Expect: ${scenario.expect}`;

  const panel = document.createElement("div");
  panel.className = "demo-panel";

  group.append(h, exp, panel);
  mount.appendChild(group);

  // Fresh state per scenario so handles/dedup don't bleed across scenarios.
  const state = createState();
  for (const c of STREAMS[scenario.key]) {
    await handle({ ...c }, state, panel);
    await sleep(ROW_DELAY_MS);
  }
}

async function playAll() {
  const mount = document.getElementById("scenarios");
  mount.replaceChildren();
  const btn = document.getElementById("play-all");
  btn.disabled = true;
  for (const scenario of SCENARIOS) {
    await playScenario(scenario, mount);
    await sleep(ROW_DELAY_MS);
  }
  btn.disabled = false;
}

// --- Live sandbox (type comments yourself, real timing) ---------------------

let sandboxState = createState();

function sendSandbox() {
  const handleEl = document.getElementById("sb-handle");
  const platformEl = document.getElementById("sb-platform");
  const textEl = document.getElementById("sb-text");
  const panel = document.getElementById("sb-panel");

  const text = textEl.value.trim();
  if (!text) return;

  const comment = {
    handle: handleEl.value.trim() || "Guest",
    platform: platformEl.value,
    displayText: text,
    timestamp: Date.now(), // real arrival time, so real gaps drive continuation
  };
  handle(comment, sandboxState, panel); // live: regex first, Gemma 4 async on top
  textEl.value = "";
  textEl.focus();
}

function resetSandbox() {
  sandboxState = createState();
  document.getElementById("sb-panel").replaceChildren();
}

// --- extension on/off simulation ---------------------------------------------
// The real popup flips html.safwa-disabled via chrome.storage; here the switch
// flips the same class directly, so the gated CSS behaves exactly like live.

function wireExtToggle() {
  const btn = document.getElementById("ext-toggle");
  btn.addEventListener("click", () => {
    const on = btn.getAttribute("aria-checked") !== "true";
    btn.setAttribute("aria-checked", String(on));
    btn.setAttribute("aria-label", on ? "ON" : "OFF");
    document.documentElement.classList.toggle("safwa-disabled", !on);
  });
}
wireExtToggle();

// --- wire up ---------------------------------------------------------------

document.getElementById("play-all").addEventListener("click", playAll);
document.getElementById("sb-send").addEventListener("click", sendSandbox);
document.getElementById("sb-reset").addEventListener("click", resetSandbox);
document.getElementById("sb-text").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendSandbox();
});

// show the active thresholds so it's clear what's being applied
document.getElementById("config-dump").textContent =
  `window ${CONFIG.CONTINUATION_WINDOW_MS / 1000}s · max ${CONFIG.MAX_COMMENTS_PER_QUESTION} comments/question · ` +
  `fuzzy ≥ ${CONFIG.FUZZY_THRESHOLD} · auto-collapse exact dupes: ${CONFIG.AUTO_COLLAPSE_EXACT_DUPLICATES} · ` +
  `hide extra questions: ${CONFIG.HIDE_EXTRA_QUESTIONS} · dim in-window extras: ${CONFIG.DIM_IN_WINDOW_EXTRAS} · ` +
  `LLM: ${CONFIG.LLM_ENABLED ? CONFIG.LLM_MODEL : "off"}`;
