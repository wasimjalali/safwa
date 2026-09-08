/*
 * mock-comments.js - scripted Dari/Persian comment streams for testing the
 * matching core without StreamYard (spec Section 13). Plain data in the same
 * { handle, platform, displayText, timestamp } shape dom.js produces. Fixed
 * timestamps (offsets from T) keep tests deterministic.
 *
 * Dari and Iranian Persian share one script, so these also cover Persian. The
 * questions are realistic Islamic-Q&A Dari sentences.
 */

export const T = 1700000000000;

export function comment(handle, platform, displayText, offsetMs = 0) {
  return { handle, platform, displayText, timestamp: T + offsetMs };
}

// Base question: "How many rakats is the Taraweeh prayer?" (Persian ی + ک).
const TARAWEEH = "نماز تراویح چند رکعت است؟";

// The SAME question typed on an Arabic keyboard: Arabic yeh (U+064A) instead of
// Persian yeh, Arabic kaf (U+0643) instead of Persian kaf, plus a tatweel
// (U+0640) stretch. Built from TARAWEEH so the only differences are these code
// points - which is exactly what normalization must fold away.
const TARAWEEH_ARABIC =
  TARAWEEH.replace(/ی/g, "ي").replace(/ک/g, "ك").replace("است", "اسـت");

export const STREAMS = {
  // Criterion 1: same exact question x3, three people. Cross-platform on purpose.
  exactTriplicate: [
    comment("بلال", "youtube", TARAWEEH, 0),
    comment("هانا", "youtube", TARAWEEH, 1000),
    comment("زید", "facebook", TARAWEEH, 2000),
  ],

  // The key Dari proof: the same question typed with Arabic letters + tatweel
  // must collapse onto the Persian-typed one as an EXACT duplicate after folding.
  variantSpelling: [
    comment("سارا", "youtube", TARAWEEH, 0),
    comment("کریم", "instagram", TARAWEEH_ARABIC, 1500),
  ],

  // Criterion 2: a reworded near-duplicate. Same words, reordered -> token-set
  // Jaccard is 1.0, well above the 0.85 threshold.
  nearDuplicate: [
    comment("نادیه", "youtube", "آیا زکات بر طلا واجب است؟", 0),
    comment("فرید", "youtube", "آیا بر طلا زکات واجب است؟", 1500),
  ],

  // Criterion 3: one long question split across two comments by the SAME handle,
  // second within the window. First ends on the connector «و» with no «؟»; the
  // second also starts with «و». Strong continuation cues.
  splitQuestion: [
    comment(
      "عایشه",
      "youtube",
      "سوال من در مورد میراث است وقتی که چند وارث وجود دارد و",
      0
    ),
    comment(
      "عایشه",
      "youtube",
      "و دارایی شامل خانه و پول نقد می‌شود، چه باید کرد؟",
      5000
    ),
  ],

  // Criterion 4: a genuine second, separate question later (outside the window).
  secondQuestionLater: [
    comment("عمر", "youtube", "آیا نماز خواندن در حال نشسته جایز است؟", 0),
    comment("عمر", "youtube", "حکم روزه گرفتن در سفر چیست؟", 90000),
  ],

  // Criterion 5: two different short questions from two handles. Never merge.
  twoDifferentHandles: [
    comment("بلال", "youtube", "وقت نماز صبح چه وقت است؟", 0),
    comment("هانا", "youtube", "مسجد کجاست؟", 500),
  ],

  // 4b: a separate second question only 5s later, no continuation cue (first
  // ends with «؟», second starts with «آیا»). Must be flagged extra, not merged.
  distinctSecondInsideWindow: [
    comment("یوسف", "youtube", "حکم گوش دادن به موسیقی چیست؟", 0),
    comment("یوسف", "youtube", "آیا قهوه حلال است؟", 5000),
  ],

  // Cross-platform DUPLICATE text: same question from Instagram then YouTube,
  // different people. Must collapse (text-based dedup is cross-platform).
  crossPlatformDuplicate: [
    comment("سمیرا", "instagram", "حکم نماز در سفر چیست؟", 0),
    comment("رضا", "youtube", "حکم نماز در سفر چیست؟", 3000),
  ],

  // Same handle, DIFFERENT platforms, two different questions. Identity is not
  // linked across platforms, so BOTH are primary (neither flagged extra).
  sameHandleCrossPlatform: [
    comment("احمد", "youtube", "آیا زکات بر طلا واجب است؟", 0),
    comment("احمد", "facebook", "وقت نماز صبح چه وقت است؟", 1000),
  ],

  // A duplicate that only matches AFTER a leading honorific/greeting is stripped.
  honorificPrefixed: [
    comment("مریم", "youtube", "وقت نماز صبح چه وقت است؟", 0),
    comment("داوود", "youtube", "سلام استاد، وقت نماز صبح چه وقت است؟", 1500),
  ],

  // The SAME person, but their display name arrives spelled with Arabic letters
  // the second time (different keyboard: ك/ي instead of ک/ی). Identity folding
  // must recognize them as one person, so the second distinct question (well
  // outside the window, no dedup match) is flagged extra, not treated as a new
  // person's first question.
  variantHandleSecondQuestion: [
    comment("کریم", "youtube", "آیا نماز خواندن در حال نشسته جایز است؟", 0),
    comment("كريم", "youtube", "حکم روزه گرفتن در سفر چیست؟", 60000),
  ],

  // Continuation CAP: one question dribbled across THREE in-window comments, each
  // with a continuation cue. Only the FIRST continuation may merge (question + 1).
  // The third comment is blocked (flagged extra) even though it still looks like a
  // continuation, so one person can't turn a question into a 3+ part run.
  cappedContinuation: [
    comment("حلیمه", "youtube", "سوال من در مورد روزه است که اگر کسی", 0),
    comment("حلیمه", "youtube", "در ماه رمضان مریض شود و نتواند روزه بگیرد", 4000),
    comment("حلیمه", "youtube", "و بعد از رمضان هم وقت نکند که قضایش را بگیرد چه باید بکند؟", 8000),
  ],

  // Double-send: the same person sends the SAME text twice inside the window
  // (impatient double-tap on send). The first fragment ends on the connector
  // «که» with no terminal punctuation - the strongest continuation cue - but an
  // identical re-send must collapse as a duplicate, never merge (that would
  // double the text and burn the one continuation slot). A genuine continuation
  // sent AFTER the re-send must still merge.
  doubleSend: [
    comment("طاهر", "youtube", "سوال من در مورد زکات است که", 0),
    comment("طاهر", "youtube", "سوال من در مورد زکات است که", 2000),
    comment("طاهر", "youtube", "آیا بر پول کاغذی هم زکات واجب است؟", 6000),
  ],

  // A greeting-only comment first, then the person's real question well outside
  // the merge window. The greeting must NOT consume the question slot, so the
  // real question stays primary instead of being filtered out as an extra.
  greetingThenQuestion: [
    comment("یونس", "youtube", "السلام علیکم", 0),
    comment("یونس", "youtube", "حکم نماز قضا چیست؟", 60000),
  ],

  // --- Semantic dedup cases (regex CANNOT catch these; the LLM's job) ---
  //
  // The regex pipeline should classify both as "primary" (different words, no
  // shared tokens), but the second one should carry needsLlmReview=true so the
  // LLM can catch the semantic match.

  // "Is using perfume while fasting a problem?" vs "Can a fasting person wear
  // cologne?" - same question, zero shared tokens.
  semanticPerfumeFasting: [
    comment("فاطمه", "youtube", "آیا استفاده از عطر در حال روزه‌داری اشکالی دارد؟", 0),
    comment("رضا", "youtube", "روزه‌دار می‌تواند ادکلن بزند؟", 5000),
  ],

  // "If I'm traveling, do I need to fast?" vs "What's the ruling on fasting
  // for someone who is traveling?" - same question, different phrasing.
  semanticFastingTravel: [
    comment("علی", "youtube", "اگر مسافر باشم آیا باید روزه بگیرم؟", 0),
    comment("حسن", "facebook", "حکم روزه برای شخصی که در سفر است چیست؟", 8000),
  ],

  // Different questions that share the word "سفر" (travel) - must NOT be
  // merged by either regex or LLM. One is about Friday prayer, the other about
  // fasting. Used to verify the LLM doesn't over-merge.
  semanticDistinctTravel: [
    comment("خالد", "youtube", "آیا نماز جمعه در حال سفر واجب است؟", 0),
    comment("عمر", "youtube", "آیا روزه گرفتن در سفر واجب است؟", 5000),
  ],

  semanticWajibFard: [
    comment("نادیه", "youtube", "آیا زکات بر طلا واجب است؟", 0),
    comment("سمیه", "youtube", "آیا زکات طلا فرض است؟", 4000),
  ],

  trapZakatJewelryCoins: [
    comment("نادیه", "youtube", "آیا زکات بر طلای زیورآلات واجب است؟", 0),
    comment("طاهر", "youtube", "آیا سکه‌های طلا زکات دارند؟", 4000),
  ],

  // Partial token overlap (Jaccard ~0.86): regex fuzzy, not token-set identity.
  // Must stay visible and wait for the LLM — unlike a pure reorder.
  fuzzyPartialOverlap: [
    comment("نادیه", "youtube", "آیا زکات بر طلا واجب است دیگر؟", 0),
    comment("فرید", "youtube", "آیا زکات بر طلا واجب است؟", 1500),
  ],

  // Same person, inside the window, first line ends with «؟» so regex has no
  // continuation cue. Must go to the LLM as an extra (not auto-joined).
  cueLessSplit: [
    comment("نرگس", "youtube", "حکم بیمه چیست؟", 0),
    comment("نرگس", "youtube", "منظورم بیمه دولتی است که قسط ماهانه دارد چه می‌شود؟", 8000),
  ],
};
