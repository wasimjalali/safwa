/*
 * replay-analysis.js - run a converted live-chat replay (real comments, real
 * gaps) through the REAL pipeline in Node and print what the teacher would
 * have seen. The visual twin is test/replay.html.
 *
 * Usage: node test/replay-analysis.js [test/fixtures/replay-<id>.json]
 *
 * This is the tuning instrument for a real session: the histogram and the
 * printed examples tell you whether the continuation window, fuzzy threshold,
 * and honorific list behaved, or whether real questions were hidden that
 * shouldn't have been.
 */

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { CONFIG } from "../src/config.js";
import { createState } from "../src/state.js";
import { processComment } from "../src/grouping.js";

const arg = process.argv[2];
const file =
  arg ??
  fileURLToPath(new URL("./fixtures/replay-ic2UFFlRtU8.json", import.meta.url));

const raw = JSON.parse(fs.readFileSync(file, "utf8"));
const T0 = 1700000000000; // fixed base; only gaps matter to the pipeline

const state = createState();
const rows = [];
for (const c of raw) {
  const comment = { ...c, timestamp: T0 + c.offsetMs };
  const decision = processComment(comment, state, CONFIG);
  rows.push({ comment, decision });
}

// --- histogram ---------------------------------------------------------------

const tally = {};
for (const { decision } of rows) {
  const key =
    decision.type === "duplicate" ? `duplicate (${decision.kind})` : decision.type;
  tally[key] = (tally[key] ?? 0) + 1;
}

console.log(`replay: ${file}`);
console.log(`comments: ${rows.length}  (session span ${(
  (rows.at(-1).comment.offsetMs - rows[0].comment.offsetMs) / 60000
).toFixed(1)} min)\n`);
for (const [k, n] of Object.entries(tally)) console.log(`  ${k.padEnd(24)} ${n}`);

// --- what the teacher would NOT see fully ------------------------------------

const isHidden = (decision) => {
  if (decision.type === "extra") {
    if (!CONFIG.HIDE_EXTRA_QUESTIONS) return false;
    if (CONFIG.DIM_IN_WINDOW_EXTRAS && decision.withinWindow) return false;
    return true;
  }
  return decision.type === "duplicate" && decision.kind === "exact";
};
const isDimmed = ({ decision }) =>
  (decision.type === "extra" &&
    ((CONFIG.HIDE_EXTRA_QUESTIONS && CONFIG.DIM_IN_WINDOW_EXTRAS && decision.withinWindow) ||
      !CONFIG.HIDE_EXTRA_QUESTIONS)) ||
  (decision.type === "duplicate" && decision.kind === "fuzzy");

const hidden = rows.filter(({ decision }) => isHidden(decision));
const dimmed = rows.filter(isDimmed);
console.log(
  `\nremoved from the feed (${hidden.length})` +
    (dimmed.length ? `  +  ${dimmed.length} visible but dimmed` : "") +
    `:`
);
for (const { comment, decision } of hidden) {
  const extra =
    decision.type === "extra"
      ? decision.withinWindow
        ? "extra, IN window"
        : "extra, out of window"
      : `exact dup x${decision.count}`;
  console.log(`  [${min(comment.offsetMs)}] ${comment.handle}: ${truncate(comment.displayText, 58)}  (${extra})`);
}
if (dimmed.length) {
  console.log(`\ndimmed (visible, flagged):`);
  for (const { comment, decision } of dimmed) {
    const why = decision.type === "extra" ? "extra, IN window" : decision.kind;
    console.log(`  [${min(comment.offsetMs)}] ${comment.handle}: ${truncate(comment.displayText, 58)}  (${why})`);
  }
}

// --- what was MERGED as continuations ---------------------------------------

const joined = rows.filter(({ decision }) => decision.type === "continuation");
console.log(`\nmerged as continuations (${joined.length}):`);
for (const { comment } of joined) {
  console.log(`  [${min(comment.offsetMs)}] ${comment.handle}: ${truncate(comment.displayText, 58)}`);
}

// --- greetings ---------------------------------------------------------------

const greetings = rows.filter(({ decision }) => decision.type === "greeting");
if (greetings.length) {
  console.log(`\ngreetings left untouched (${greetings.length}):`);
  for (const { comment } of greetings) {
    console.log(`  [${min(comment.offsetMs)}] ${comment.handle}: ${truncate(comment.displayText, 48)}`);
  }
}

function min(offsetMs) {
  const m = Math.floor(offsetMs / 60000);
  const s = Math.floor((offsetMs % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function truncate(text, n) {
  return text.length > n ? `${text.slice(0, n)}…` : text;
}
