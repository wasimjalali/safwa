/*
 * run-tests.js - Node test runner for the matching core (spec Section 14 +
 * acceptance criteria 1-5), now exercised on Dari/Persian fixtures. Zero deps.
 *
 * The matching core is pure (no DOM, no chrome.*), so it runs here exactly as in
 * the browser. dom.js / ui.js / content.js are browser-only and verified live.
 */

import assert from "node:assert/strict";

import { CONFIG, applyStoredSettings, readStoredSettings } from "../src/config.js";
import { normalize } from "../src/normalize.js";
import { createState, identityKey } from "../src/state.js";
import { jaccard } from "../src/dedup.js";
import { processComment, applyLlmOverride } from "../src/grouping.js";
import { parseLlmResponse } from "../src/llm-classifier.js";
import { STREAMS, comment } from "./mock-comments.js";

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

function runStream(stream) {
  const state = createState();
  const decisions = stream.map((c) => processComment({ ...c }, state, CONFIG));
  return { state, decisions };
}

const key = (s) => normalize(s, CONFIG).matchKey;

// =====================================================================
group("normalize.js - Persian/Dari");

test("folds Arabic yeh/kaf and removes tatweel (same question, two keyboards)", () => {
  const persian = STREAMS.variantSpelling[0].displayText;
  const arabic = STREAMS.variantSpelling[1].displayText;
  assert.notEqual(persian, arabic, "fixtures must differ at the byte level");
  assert.equal(key(arabic), key(persian));
});

test("strips harakat (vowel marks)", () => {
  assert.equal(key("مُحَمَّد"), "محمد");
});

test("normalizes ZWNJ (می‌روم == میروم)", () => {
  assert.equal(key("می‌روم"), key("میروم"));
});

test("folds Persian and Arabic-Indic digits to ASCII", () => {
  assert.equal(key("۱۲۳"), "123");
  assert.equal(key("٤٥٦"), "456");
});

test("strips a leading Dari honorific/greeting", () => {
  assert.equal(key("سلام استاد، وقت نماز صبح چه وقت است؟"), key("وقت نماز صبح چه وقت است؟"));
});

test("still normalizes Latin text (safe fallback)", () => {
  assert.equal(key("Café"), "cafe");
});

// =====================================================================
group("dedup.js (jaccard token-set similarity)");

test("identical token sets => 1.0", () => {
  assert.equal(jaccard(["a", "b", "c"], ["a", "b", "c"]), 1);
});

test("disjoint token sets => 0.0", () => {
  assert.equal(jaccard(["a", "b"], ["c", "d"]), 0);
});

test("reordered Dari question scores at/above the 0.85 threshold", () => {
  const a = key(STREAMS.nearDuplicate[0].displayText).split(" ");
  const b = key(STREAMS.nearDuplicate[1].displayText).split(" ");
  assert.ok(jaccard(a, b) >= CONFIG.FUZZY_THRESHOLD, `jaccard was ${jaccard(a, b)}`);
});

// =====================================================================
group("state.js");

test("identity key is platform + handle (no cross-platform linking)", () => {
  assert.notEqual(
    identityKey({ handle: "احمد", platform: "youtube" }),
    identityKey({ handle: "احمد", platform: "facebook" })
  );
});

test("identity folds the handle: Arabic vs Persian keyboard spelling = same person", () => {
  assert.equal(
    identityKey({ handle: "كريم", platform: "youtube" }), // Arabic kaf + yeh
    identityKey({ handle: "کریم", platform: "youtube" }) // Persian keh + yeh
  );
});

test("identity folds Latin case and spacing: 'Ahmad  Khan' == 'ahmad khan'", () => {
  assert.equal(
    identityKey({ handle: "Ahmad  Khan", platform: "youtube" }),
    identityKey({ handle: "ahmad khan", platform: "youtube" })
  );
});

test("different names stay different people", () => {
  assert.notEqual(
    identityKey({ handle: "احمد", platform: "youtube" }),
    identityKey({ handle: "محمود", platform: "youtube" })
  );
});

// =====================================================================
group("Acceptance criteria (spec Section 15) - Dari");

test("1) same exact question x3 => shown once, count 3", () => {
  const { state, decisions } = runStream(STREAMS.exactTriplicate);
  assert.equal(decisions[0].type, "primary");
  assert.equal(decisions[1].type, "duplicate");
  assert.equal(decisions[2].type, "duplicate");
  assert.equal(decisions[2].count, 3);
  assert.equal(decisions[1].target, decisions[2].target);
  assert.equal(state.signatures.size, 1);
});

test("KEY: Arabic-keyboard spelling of the same question collapses as an exact duplicate", () => {
  const { state, decisions } = runStream(STREAMS.variantSpelling);
  assert.equal(decisions[0].type, "primary");
  assert.equal(decisions[1].type, "duplicate");
  assert.equal(decisions[1].kind, "exact");
  assert.equal(state.signatures.size, 1);
});

test("2) reworded/reordered near-duplicate is caught at default threshold", () => {
  const { decisions } = runStream(STREAMS.nearDuplicate);
  assert.equal(decisions[0].type, "primary");
  assert.equal(decisions[1].type, "duplicate");
  assert.equal(decisions[1].kind, "exact");
  assert.equal(decisions[1].count, 2);
  assert.equal(decisions[1].needsLlmReview, undefined);
});

test("3) split question (same handle, in window, with cue) => one merged block", () => {
  const { state, decisions } = runStream(STREAMS.splitQuestion);
  assert.equal(decisions[0].type, "primary");
  assert.equal(decisions[1].type, "continuation");
  assert.equal(decisions[1].needsLlmReview, undefined);
  const block = decisions[1].block;
  assert.equal(block.fragmentCount, 2);
  assert.match(block.displayText, /میراث/);
  assert.match(block.displayText, /دارایی/);
  assert.equal(state.signatures.size, 1);
});

test("4) genuine second question later (outside window) => flagged extra", () => {
  const { decisions } = runStream(STREAMS.secondQuestionLater);
  assert.equal(decisions[0].type, "primary");
  assert.equal(decisions[1].type, "extra");
  assert.equal(decisions[1].needsLlmReview, true);
  assert.equal(decisions[1].reviewKind, "same_person");
  assert.equal(decisions[1].hide, undefined);
});

test("5) two different short questions from two handles => never merged", () => {
  const { state, decisions } = runStream(STREAMS.twoDifferentHandles);
  assert.equal(decisions[0].type, "primary");
  assert.equal(decisions[1].type, "primary");
  assert.equal(state.signatures.size, 2);
});

test("4b) distinct second question INSIDE window, no cue => extra", () => {
  const { decisions } = runStream(STREAMS.distinctSecondInsideWindow);
  assert.equal(decisions[0].type, "primary");
  assert.equal(decisions[1].type, "extra");
  assert.equal(decisions[1].needsLlmReview, true);
  assert.equal(decisions[1].reviewKind, "same_person");
});

// =====================================================================
group("Cross-platform rules (your requirements)");

test("same text from two platforms => collapsed as a duplicate", () => {
  const { decisions } = runStream(STREAMS.crossPlatformDuplicate);
  assert.equal(decisions[0].type, "primary");
  assert.equal(decisions[1].type, "duplicate");
  assert.equal(decisions[1].count, 2);
});

test("same handle on two platforms, two questions => BOTH primary (no person-linking)", () => {
  const { state, decisions } = runStream(STREAMS.sameHandleCrossPlatform);
  assert.equal(decisions[0].type, "primary");
  assert.equal(decisions[1].type, "primary");
  assert.equal(state.signatures.size, 2);
});

test("duplicate that only matches after a leading honorific is stripped", () => {
  const { decisions } = runStream(STREAMS.honorificPrefixed);
  assert.equal(decisions[0].type, "primary");
  assert.equal(decisions[1].type, "duplicate");
});

test("same person, handle typed on two keyboards => second question flagged extra", () => {
  const { decisions } = runStream(STREAMS.variantHandleSecondQuestion);
  assert.equal(decisions[0].type, "primary");
  assert.equal(decisions[1].type, "extra");
});

// =====================================================================
group("Continuation cap & greeting pre-filter (new requirements)");

test("continuation is capped: question + ONE continuation kept, a third in-window fragment is blocked", () => {
  const { decisions } = runStream(STREAMS.cappedContinuation);
  assert.equal(decisions[0].type, "primary");
  assert.equal(decisions[1].type, "continuation");
  assert.equal(decisions[1].block.fragmentCount, 2);
  // The third comment still LOOKS like a continuation but is over the cap, so it
  // must be blocked (flagged extra), not merged into the question.
  assert.equal(decisions[2].type, "extra");
  // It landed inside the window (withinWindow=true). Hidden by default; the
  // DIM_IN_WINDOW_EXTRAS safety flag can keep it dimmed-but-visible instead.
  assert.equal(decisions[2].withinWindow, true);
});

test("a clearly separate, later second question is flagged extra, withinWindow=false", () => {
  const { decisions } = runStream(STREAMS.secondQuestionLater);
  assert.equal(decisions[1].type, "extra");
  // Outside the window: an unambiguous second question. Hidden in every mode.
  assert.equal(decisions[1].withinWindow, false);
});

test("a quick second comment inside the window is flagged extra, withinWindow=true", () => {
  const { decisions } = runStream(STREAMS.distinctSecondInsideWindow);
  assert.equal(decisions[1].type, "extra");
  // Inside the window: hidden by default, but this flag lets DIM_IN_WINDOW_EXTRAS
  // keep it visible-but-dimmed if a live session shows real questions vanishing.
  assert.equal(decisions[1].withinWindow, true);
});

test("MAX_COMMENTS_PER_QUESTION is honored as the cap value", () => {
  assert.equal(CONFIG.MAX_COMMENTS_PER_QUESTION, 2);
});

test("LLM context window is 30 unique questions", () => {
  assert.equal(CONFIG.LLM_MAX_CONTEXT_COMMENTS, 30);
});

test("a greeting-only comment does not consume the person's one question slot", () => {
  const { decisions } = runStream(STREAMS.greetingThenQuestion);
  assert.equal(decisions[0].type, "greeting");
  // The real question, asked later, survives as primary instead of being
  // filtered out as the person's 'second' comment.
  assert.equal(decisions[1].type, "primary");
});

test("double-send: identical re-send inside the window collapses as a duplicate, never merges", () => {
  const { decisions } = runStream(STREAMS.doubleSend);
  assert.equal(decisions[0].type, "primary");
  assert.equal(decisions[1].type, "duplicate");
  assert.equal(decisions[1].kind, "exact");
  assert.equal(decisions[1].count, 2);
  // The re-send must not sit in the block as a fragment. (The block ends the
  // stream with 2 fragments: the question + the GENUINE continuation, not 3.)
  assert.ok(!decisions[0].block.fragments.includes(decisions[1].comment));
});

test("double-send keeps the block open: a genuine continuation after the re-send still merges", () => {
  const { decisions } = runStream(STREAMS.doubleSend);
  assert.equal(decisions[2].type, "continuation");
  assert.equal(decisions[2].block.fragmentCount, 2);
  // The merged text contains the question once, not doubled.
  const hits = decisions[2].block.displayText.match(/سوال من در مورد زکات است که/g) ?? [];
  assert.equal(hits.length, 1);
});

test("a bare greeting normalizes to isGreetingOnly", () => {
  assert.equal(normalize("سلام", CONFIG).isGreetingOnly, true);
  assert.equal(normalize("السلام علیکم", CONFIG).isGreetingOnly, true);
  // a real question is never a greeting, even with a leading honorific
  assert.equal(normalize("سلام استاد، حکم روزه چیست؟", CONFIG).isGreetingOnly, false);
});

// =====================================================================
group("Real-session regressions (found by replaying a live YouTube chat)");

test("real session: greeting «اسلام علیکم ورحمت الله استاد» is fully stripped", () => {
  const a = normalize("اسلام علیکم ورحمت الله استاد درباره قرعه کشی پول پرداخت کنی جواز دارد", CONFIG);
  const b = normalize("درباره قرعه کشی پول پرداخت کنی جواز دارد", CONFIG);
  assert.equal(a.matchKey, b.matchKey);
  // and the title مفتی strips too
  const c = normalize("مفتی صاحب حکم بیمه چیست؟", CONFIG);
  assert.equal(c.matchKey, normalize("حکم بیمه چیست؟", CONFIG).matchKey);
});

test("real session: «ادامه»-announced fragment 36s later still joins the question", () => {
  const stream = [
    comment("جواد", "youtube", "من این کار را کردم، اما", 0),
    comment("جواد", "youtube", "ادامه سوال هنوز برایم مشخص نیست که این ازدواج خیر است یا شر؟", 36000),
  ];
  const { decisions } = runStream(stream);
  assert.equal(decisions[0].type, "primary");
  assert.equal(decisions[1].type, "continuation");
});

test("real session: a fragment ending «...ادامه» announces the next one past the window", () => {
  const stream = [
    comment("کریم", "youtube", "سوال من این است که بیمه شرکتی را حرام میگویید و بیمه حکومتی را جواز میدهید ادامه", 0),
    comment("کریم", "youtube", "در حالیکه حکومت ها وضعی است و دلیل اش را از کجا اوردید؟", 68000),
  ];
  const { decisions } = runStream(stream);
  assert.equal(decisions[1].type, "continuation");
});

test("real session: explicit marker does NOT defeat the fragment cap or the far limit", () => {
  const stream = [
    comment("سارا", "youtube", "سوال اول من درباره میراث است و", 0),
    comment("سارا", "youtube", "ادامه دارایی شامل خانه و پول نقد می‌شود چه باید کرد؟", 36000),
    comment("سارا", "youtube", "ادامه باز هم یک سوال دیگر دارم در همین مورد؟", 60000),
  ];
  const { decisions } = runStream(stream);
  assert.equal(decisions[1].type, "continuation");
  // third piece is over the cap even though it says «ادامه»
  assert.equal(decisions[2].type, "extra");
});

test("real session: plain second question far later is still an extra (marker changes nothing)", () => {
  const stream = [
    comment("عمر", "youtube", "حکم نگاه به زن دوم چگونه است؟", 0),
    comment("عمر", "youtube", "حکم روزه گرفتن در سفر چیست؟", 120000),
  ];
  const { decisions } = runStream(stream);
  assert.equal(decisions[0].type, "primary");
  assert.equal(decisions[1].type, "extra");
});

// =====================================================================
group("Semantic dedup - LLM escalation flags (regex cannot catch these)");

test("semantic duplicate (perfume/fasting): regex says primary, flags for LLM review", () => {
  const { decisions } = runStream(STREAMS.semanticPerfumeFasting);
  assert.equal(decisions[0].type, "primary");
  // Second comment asks the same thing in different words - regex can't catch it
  assert.equal(decisions[1].type, "primary");
  // But it should be flagged for LLM review (there's a prior question to compare)
  assert.equal(decisions[1].needsLlmReview, true);
  assert.ok(decisions[1].recentQuestions.length > 0, "should have recent questions for LLM");
});

test("semantic duplicate (fasting/travel): regex says primary, flags for LLM review", () => {
  const { decisions } = runStream(STREAMS.semanticFastingTravel);
  assert.equal(decisions[0].type, "primary");
  assert.equal(decisions[1].type, "primary");
  assert.equal(decisions[1].needsLlmReview, true);
  assert.ok(decisions[1].recentQuestions.length > 0);
});

test("semantic distinct (Friday prayer vs fasting, both about travel): both primary, LLM review flagged", () => {
  const { decisions } = runStream(STREAMS.semanticDistinctTravel);
  assert.equal(decisions[0].type, "primary");
  assert.equal(decisions[1].type, "primary");
  // The second one is flagged for LLM review - the LLM must say "primary" here
  assert.equal(decisions[1].needsLlmReview, true);
});

test("first comment in a stream has no LLM review (nothing to compare against)", () => {
  const { decisions } = runStream(STREAMS.exactTriplicate);
  assert.equal(decisions[0].type, "primary");
  assert.ok(!decisions[0].needsLlmReview);
});

test("exact duplicate is NOT flagged for LLM review (regex already caught it)", () => {
  const { decisions } = runStream(STREAMS.exactTriplicate);
  assert.equal(decisions[1].type, "duplicate");
  // Duplicates don't need LLM review - the regex already handled them
  assert.equal(decisions[1].needsLlmReview, undefined);
});

test("synonym واجب/فرض: regex leaves both primary for LLM", () => {
  const { decisions } = runStream(STREAMS.semanticWajibFard);
  assert.equal(decisions[0].type, "primary");
  assert.equal(decisions[1].type, "primary");
  assert.equal(decisions[1].needsLlmReview, true);
});

test("gold jewelry vs coins: regex leaves both primary for LLM", () => {
  const { decisions } = runStream(STREAMS.trapZakatJewelryCoins);
  assert.equal(decisions[0].type, "primary");
  assert.equal(decisions[1].type, "primary");
  assert.equal(decisions[1].needsLlmReview, true);
});

// =====================================================================
group("LLM routing (regex-certain vs regex-uncertain)");

test("partial-overlap fuzzy is NOT auto-hidden; it waits for the LLM", () => {
  const { decisions } = runStream(STREAMS.fuzzyPartialOverlap);
  assert.equal(decisions[0].type, "primary");
  assert.equal(decisions[1].type, "duplicate");
  assert.equal(decisions[1].kind, "fuzzy");
  assert.equal(decisions[1].needsLlmReview, true);
  assert.equal(decisions[1].reviewKind, "room");
  assert.equal(decisions[1].count, 1);
});

test("cue-less split (no ادامه / connector) is extra for the LLM, not auto-joined", () => {
  const { decisions } = runStream(STREAMS.cueLessSplit);
  assert.equal(decisions[0].type, "primary");
  assert.equal(decisions[1].type, "extra");
  assert.equal(decisions[1].needsLlmReview, true);
  assert.equal(decisions[1].reviewKind, "same_person");
  assert.equal(decisions[1].allowContinuation, true);
});

test("over-cap extra must not be joinable by the LLM", () => {
  const { decisions } = runStream(STREAMS.cappedContinuation);
  assert.equal(decisions[2].type, "extra");
  assert.equal(decisions[2].needsLlmReview, true);
  assert.equal(decisions[2].allowContinuation, false);
});

test("announced ادامه continuation still skips the LLM", () => {
  const stream = [
    comment("جواد", "youtube", "من این کار را کردم، اما", 0),
    comment("جواد", "youtube", "ادامه سوال هنوز برایم مشخص نیست که این ازدواج خیر است یا شر؟", 36000),
  ];
  const { decisions } = runStream(stream);
  assert.equal(decisions[1].type, "continuation");
  assert.equal(decisions[1].needsLlmReview, undefined);
});

test("greeting does not go to the LLM", () => {
  const { decisions } = runStream(STREAMS.greetingThenQuestion);
  assert.equal(decisions[0].type, "greeting");
  assert.equal(decisions[0].needsLlmReview, undefined);
});

test("JOIN_CONTINUATIONS false: a cued split is not merged", () => {
  const config = { ...CONFIG, JOIN_CONTINUATIONS: false };
  const state = createState();
  const decisions = STREAMS.splitQuestion.map((c) => processComment({ ...c }, state, config));
  assert.equal(decisions[0].type, "primary");
  assert.equal(decisions[1].type, "extra");
});

test("readStoredSettings defaults every flag on when storage is empty", () => {
  const settings = readStoredSettings({});
  assert.equal(settings.enabled, true);
  assert.equal(settings.collapseDuplicates, true);
  assert.equal(settings.hideExtras, true);
  assert.equal(settings.joinContinuations, true);
  assert.equal(settings.llmEnabled, true);
});

test("readStoredSettings honors an explicit false", () => {
  const settings = readStoredSettings({ safwaLlmEnabled: false, safwaHideExtras: false });
  assert.equal(settings.llmEnabled, false);
  assert.equal(settings.hideExtras, false);
  assert.equal(settings.collapseDuplicates, true);
});

test("applyStoredSettings writes teacher flags onto a runtime config", () => {
  const config = { ...CONFIG };
  applyStoredSettings(
    config,
    readStoredSettings({ safwaLlmEnabled: false, safwaJoinContinuations: false })
  );
  assert.equal(config.LLM_ENABLED, false);
  assert.equal(config.JOIN_CONTINUATIONS, false);
  assert.equal(config.AUTO_COLLAPSE_EXACT_DUPLICATES, true);
  assert.equal(config.HIDE_CONFIRMED_EXTRAS, true);
});

test("JOIN_CONTINUATIONS false: LLM continuation does not merge", () => {
  const config = { ...CONFIG, JOIN_CONTINUATIONS: false };
  const state = createState();
  const first = processComment(
    comment("علی", "youtube", "حکم نماز برای مسافر چیست؟", 0),
    state,
    config
  );
  const second = processComment(
    comment("علی", "youtube", "و آیا شکسته خواندن واجب است؟", 4000),
    state,
    config
  );
  const next = applyLlmOverride(second, { classification: "continuation" }, state, config);
  assert.equal(first.type, "primary");
  assert.equal(second.type, "extra");
  assert.equal(next.type, "extra");
});

// =====================================================================
group("applyLlmOverride");

test("semantic duplicate: LLM hide + count on the original", () => {
  const { state, decisions } = runStream(STREAMS.semanticPerfumeFasting);
  const next = applyLlmOverride(
    decisions[1],
    { classification: "duplicate", match: 1 },
    state,
    CONFIG
  );
  assert.equal(next.type, "duplicate");
  assert.equal(next.kind, "semantic");
  assert.equal(next.count, 2);
  assert.equal(state.signatures.size, 1);
});

test("semantic distinct: LLM primary leaves both questions in the store", () => {
  const { state, decisions } = runStream(STREAMS.semanticDistinctTravel);
  const next = applyLlmOverride(decisions[1], { classification: "primary" }, state, CONFIG);
  assert.equal(next.type, "primary");
  assert.equal(state.signatures.size, 2);
});

test("LLM primary on an extra does not hide (fail-safe)", () => {
  const { state, decisions } = runStream(STREAMS.secondQuestionLater);
  const next = applyLlmOverride(decisions[1], { classification: "primary" }, state, CONFIG);
  assert.equal(next.type, "extra");
  assert.equal(next.hide, undefined);
});

test("LLM timeout / garbage leaves the regex extra visible", () => {
  const { state, decisions } = runStream(STREAMS.secondQuestionLater);
  const next = applyLlmOverride(decisions[1], null, state, CONFIG);
  assert.equal(next.type, "extra");
  assert.equal(next.hide, undefined);
});

test("LLM confirms extra: hide, no join", () => {
  const { state, decisions } = runStream(STREAMS.secondQuestionLater);
  const next = applyLlmOverride(decisions[1], { classification: "extra" }, state, CONFIG);
  assert.equal(next.type, "extra");
  assert.equal(next.hide, true);
});

test("LLM joins a cue-less split as a continuation", () => {
  const { state, decisions } = runStream(STREAMS.cueLessSplit);
  const next = applyLlmOverride(decisions[1], { classification: "continuation" }, state, CONFIG);
  assert.equal(next.type, "continuation");
  assert.equal(next.block.fragmentCount, 2);
  assert.match(next.block.displayText, /بیمه/);
  assert.match(next.block.displayText, /قسط/);
});

test("LLM restatement of the same person's question counts as N", () => {
  const { state, decisions } = runStream(STREAMS.secondQuestionLater);
  const next = applyLlmOverride(
    decisions[1],
    { classification: "duplicate", match: 1 },
    state,
    CONFIG
  );
  assert.equal(next.type, "duplicate");
  assert.equal(next.kind, "semantic");
  assert.equal(next.count, 2);
});

test("LLM cannot join past the fragment cap — leave the fragment visible", () => {
  const { state, decisions } = runStream(STREAMS.cappedContinuation);
  const next = applyLlmOverride(decisions[2], { classification: "continuation" }, state, CONFIG);
  assert.equal(next.type, "extra");
  assert.equal(next.hide, undefined);
  assert.equal(decisions[1].block.fragmentCount, 2);
});

test("fuzzy LLM confirm hides like an exact duplicate", () => {
  const { state, decisions } = runStream(STREAMS.fuzzyPartialOverlap);
  const next = applyLlmOverride(
    decisions[1],
    { classification: "duplicate", match: 1 },
    state,
    CONFIG
  );
  assert.equal(next.type, "duplicate");
  assert.equal(next.kind, "semantic");
  assert.equal(next.count, 2);
});

test("fuzzy LLM reject promotes a first-time asker to primary", () => {
  const { state, decisions } = runStream(STREAMS.fuzzyPartialOverlap);
  const next = applyLlmOverride(decisions[1], { classification: "primary" }, state, CONFIG);
  assert.equal(next.type, "primary");
  assert.equal(next.count, undefined);
  assert.equal(state.signatures.size, 2);
});

test("LLM duplicate without a match index does not hide when several candidates exist", () => {
  const stream = [
    comment("بلال", "youtube", "وقت نماز صبح چه وقت است؟", 0),
    comment("هانا", "youtube", "مسجد کجاست؟", 1000),
    comment("رضا", "youtube", "روزه‌دار می‌تواند ادکلن بزند؟", 2000),
  ];
  const { state, decisions } = runStream(stream);
  assert.equal(decisions[2].type, "primary");
  const next = applyLlmOverride(decisions[2], { classification: "duplicate" }, state, CONFIG);
  assert.equal(next.type, "primary");
  assert.equal(state.signatures.size, 3);
});

test("same-person fuzzy + primary stays visible extra, not hidden", () => {
  const stream = [
    comment("عمر", "youtube", "آیا نماز خواندن در حال نشسته جایز است؟", 0),
    comment("عمر", "youtube", "آیا نماز خواندن در حال نشسته جایز است دیگر؟", 90000),
  ];
  const { state, decisions } = runStream(stream);
  assert.equal(decisions[1].type, "duplicate");
  assert.equal(decisions[1].kind, "fuzzy");
  const next = applyLlmOverride(decisions[1], { classification: "primary" }, state, CONFIG);
  assert.equal(next.type, "extra");
  assert.equal(next.hide, false);
});

test("stale primary LLM duplicate does not close a newer extra block", () => {
  const { state, decisions } = runStream(STREAMS.semanticPerfumeFasting);
  const extra = processComment(
    comment("رضا", "youtube", "حکم قهوه چیست؟", 20000),
    state,
    CONFIG
  );
  assert.equal(extra.type, "extra");
  applyLlmOverride(decisions[1], { classification: "duplicate", match: 1 }, state, CONFIG);
  const reza = state.handles.get("youtube::رضا");
  assert.equal(reza.open, extra.block);
});

test("later paraphrase still has the earlier question in the 30-deep context", () => {
  const { decisions } = runStream(STREAMS.semanticPerfumeFasting);
  assert.ok(decisions[1].recentQuestions.length >= 1);
  assert.ok(decisions[1].recentQuestions[0].matchKey);
});

// =====================================================================
group("parseLlmResponse");

test("accepts duplicate with match index", () => {
  const parsed = parseLlmResponse('{"classification":"duplicate","match":2}');
  assert.equal(parsed.classification, "duplicate");
  assert.equal(parsed.match, 2);
});

test("accepts continuation / extra / primary", () => {
  assert.equal(parseLlmResponse('{"classification":"continuation"}').classification, "continuation");
  assert.equal(parseLlmResponse('{"classification":"extra"}').classification, "extra");
  assert.equal(parseLlmResponse('{"classification":"primary"}').classification, "primary");
});

test("rejects garbage", () => {
  assert.equal(parseLlmResponse("not json"), null);
  assert.equal(parseLlmResponse('{"classification":"maybe"}'), null);
});

// =====================================================================
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
