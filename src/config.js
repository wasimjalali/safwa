/*
 * config.js - the single place to tune behavior AND the single place (with
 * dom.js) that knows what StreamYard's HTML looks like. Spec Section 11.
 *
 * This build targets Dari / Persian comments (same script). The word lists,
 * punctuation, and UI labels below are Persian. Everything here is meant to be
 * edited by hand; the matching core reads these values and hard-codes nothing.
 */

export const CONFIG = {
  // --- Continuation grouping (grouping.js, spec Section 8) ---

  // 60s, raised from 25s after replaying five real sessions (425 comments):
  // three genuine continuation fragments arrived 37-60s+ after the person's
  // previous comment ("یعنی توسط پول مونوگراف جور کنند", a mid-word
  // "…یکنید. اما …" tail, a story continuation) and were hidden as second
  // questions at 25s. Real viewers type, edit and resend slowly; the feed
  // cost of a wrong merge is a joined badge on two VISIBLE rows, while the
  // cost of a wrong split here was destroyed questions.
  CONTINUATION_WINDOW_MS: 60000,
  NEAR_LIMIT_CHARS: 200,

  // The most comments a single logical question may occupy: the question itself
  // plus its continuation fragments. 2 = the original + ONE continuation. A
  // further fragment is blocked (treated as an extra question) even if it looks
  // like a continuation, so one person can never flood the teacher with a
  // three-, four-, five-part run. This is the teacher's "one continuation only"
  // rule. Raise it only if real questions routinely arrive in 3+ pieces.
  MAX_COMMENTS_PER_QUESTION: 2,

  // Persian connecting words. Used two ways: a previous fragment ENDING in one
  // is a continuation cue, and a new fragment STARTING with one is a cue too.
  // و (and) که (that) یا (or) اما/ولی (but) چون/زیرا (because) تا (so that)
  // به از برای با در (prepositions) را (object marker) هم/نیز (also)
  // ادامه ("continuation") was added after replaying a real session: viewers
  // literally open fragments with «ادامه سوال ...», and a fragment ending in
  // «ادامه...» announces the next one.
  CONNECTOR_WORDS: [
    "و", "که", "یا", "اما", "ولی", "چون", "زیرا", "تا",
    "به", "از", "برای", "با", "در", "را", "هم", "نیز",
    "ادامه",
  ],

  // Explicit continuation markers stretch the continuation window: a viewer
  // who starts «ادامه سوال...» (or ends «... ادامه») has ANNOUNCED a fragment,
  // so the normal CONTINUATION_WINDOW_MS gap limit is relaxed to this for that
  // pair only. Evidence: a real replayed session had a genuine two-part
  // question arrive 36s apart (outside the 25s window) with the second part
  // starting «ادامه سوال» - without this it was hidden as a second question.
  EXPLICIT_CONTINUATION_WORDS: ["ادامه"],
  EXPLICIT_CONTINUATION_MS: 180000,

  // Terminal punctuation. A previous fragment NOT ending in one of these looks
  // unfinished -> continuation cue. «؟» is the Persian question mark.
  TERMINAL_PUNCTUATION: [".", "?", "!", "؟"],

  // Trailing comma / semicolon -> the sentence is mid-thought (continuation cue).
  // «،» Persian comma, «؛» Persian semicolon.
  SENTENCE_COMMA: ["،", "؛", ","],

  // --- Normalization (normalize.js, spec Section 7) ---

  // Leading honorifics / greetings stripped from the match key (never from the
  // displayed text). Written in folded Persian form (ک not ك, ی not ی), because
  // stripping runs AFTER letter folding. Dari-flavored. Edit freely.
  // Multi-word greetings are matched longest-first automatically.
  // «اسلام علیکم» (people drop the ال), «ورحمت الله/ورحمه الله» (both the ت and
  // ه spellings; ة folds to ه), «وبرکاته» and «مفتی» were added after replaying
  // a real session where a viewer asked the same question 4 times over an hour
  // and the un-stripped greeting kept the copies from matching.
  HONORIFICS_TO_STRIP: [
    "السلام علیکم", "سلام علیکم", "اسلام علیکم", "وعلیکم السلام", "علیکم السلام",
    "ورحمت الله", "ورحمه الله", "وبرکاته", "صبح بخیر",
    "سلام", "استاد", "معلم", "شیخ", "مولوی", "مولانا", "قاری", "حافظ",
    "علامه", "حاجی", "حاج", "جناب", "آقای", "آقا", "خانم", "محترم",
    "برادر", "خواهر", "دوست", "عزیز", "جان", "صاحب", "مفتی",
  ],

  // --- Duplicate detection (dedup.js, spec Section 9) ---

  FUZZY_THRESHOLD: 0.85,
  FUZZY_LENGTH_RATIO: 0.6,
  DEDUP_BUFFER_SIZE: 100,

  // Optional Levenshtein fallback for very short questions (spec 9, off by default).
  ENABLE_LEVENSHTEIN_SHORT: false,
  SHORT_QUESTION_MAX_TOKENS: 3,
  LEVENSHTEIN_THRESHOLD: 0.85,

  // --- UI behavior (ui.js, spec Section 10) ---

  AUTO_COLLAPSE_EXACT_DUPLICATES: true,
  // Must stay false: ambiguous cases are marked, never hidden until confirmed.
  AUTO_HIDE_ANYTHING_AMBIGUOUS: false,

  // Teacher settings (popup). Defaults are the live-show recommendations.
  JOIN_CONTINUATIONS: true,
  HIDE_CONFIRMED_EXTRAS: true,

  // Must stay false in v1: a flagged second question might be a continuation
  // the detector missed, so it remains visible, dimmed and badged.
  HIDE_EXTRA_QUESTIONS: false,

  // Safety lever for the live-test phase. When true, an extra that lands INSIDE
  // the continuation window is only DIMMED, not hidden, because it MIGHT be a
  // continuation the detector missed (hiding a real question is the costliest
  // mistake). FLIPPED TO TRUE after replaying a real session: two of the five
  // in-window extras were plausible continuations (one story setup ending in a
  // full stop, one nudge referencing an earlier ask), and a dimmed row costs
  // the teacher a glance while a hidden fragment costs the question.
  DIM_IN_WINDOW_EXTRAS: true,

  // Right-to-left UI for Persian. Counts use Western digits (3) for legibility,
  // since Persian-Indic digits (۳) are hard to read at badge size. Flip to true
  // if you prefer Persian digits.
  UI_DIRECTION: "rtl",
  USE_PERSIAN_DIGITS_IN_UI: false,

  // --- LLM semantic classifier (combo architecture) ---
  //
  // Regex decides instantly wherever it is certain (exact text, token-set
  // identity, announced continuation, greetings). Everywhere it is only
  // "probably" — semantic duplicates, cue-less splits, extras — regex paints
  // first so the live feed never waits, then the LLM must confirm before we
  // hide or count. Timeout / garbage leaves the regex look (never hide a maybe).
  //
  // Advisory model: Gemma 4 26B on Cloudflare Workers AI.
  // The extension calls a thin Worker so the API token never sits in the
  // unpacked Chrome package. Deploy: deploy/cloudflare.
  LLM_ENABLED: true,
  LLM_ENDPOINT: "https://safwa-llm.karko-ai.workers.dev/v1/chat/completions",
  LLM_MODEL: "@cf/google/gemma-4-26b-a4b-it",
  LLM_TIMEOUT_MS: 8000, // fall back to regex if no response in 8s
  LLM_MAX_CONTEXT_COMMENTS: 30, // unique questions from this session for late paraphrases

  // Dari badge + popup labels. Edit the wording here; nothing else needs to
  // change. {n} in COUNT is replaced with the (optionally Persian) digit count.
  LABELS: {
    joined: "ادامه سوال قبلی",       // "continuation of the previous question"
    askedTimes: "{n} بار پرسیده شد", // "asked {n} times"
    possibleDuplicate: "شاید تکراری باشد", // "it may be a duplicate"
    secondQuestion: "سوال دوم این شخص", // "this person's second question"
    semanticDuplicate: "شاید تکراری باشد", // same wording as possibleDuplicate; teacher sees one idea

    // Popup (the bar that opens when the extension icon is clicked).
    popupTagline: "فلتر سوالات پخش زنده",          // "live stream question filter"
    popupStatusOn: "فعال",                          // "on"
    popupStatusOff: "غیرفعال",                      // "off"
    popupHintOn: "سوال‌های تکراری جمع می‌شوند و سوال دوم پنهان می‌شود",
    popupHintOff: "ستون نظرات بدون هیچ تغییری نمایش داده می‌شود",
    popupFooter: "روی StreamYard کار می‌کند",       // "works on StreamYard"

    settingsHeading: "تنظیمات",
    settingHelp: "توضیح",
    settingOn: "اگر روشن باشد",
    settingOff: "اگر خاموش باشد",
    settingWhat: "چه می‌کند",
    settingNot: "چه نمی‌کند",

    settingCollapse: "جمع کردن سوال‌های تکراری",
    settingCollapseOn: [
      "چند نفر یک سوال را بپرسند، فقط یکی در ستون می‌ماند.",
      "روی همان نوشته می‌شود چند بار پرسیده شد.",
    ],
    settingCollapseOff: [
      "همهٔ همان سوال‌ها در ستون می‌مانند.",
      "هیچ ردیفی به‌خاطر تکرار پنهان نمی‌شود.",
    ],

    settingHideExtra: "پنهان کردن سوال دوم هر نفر",
    settingHideExtraOn: [
      "اگر یک نفر سوال جداگانهٔ دیگری بفرستد، بعد از تأیید از ستون برداشته می‌شود.",
    ],
    settingHideExtraOff: [
      "سوال دوم همان‌جا می‌ماند.",
      "فقط کم‌رنگ می‌شود تا مشخص باشد سوال اول نیست.",
    ],

    settingJoin: "وصل کردن سوال دو تکه",
    settingJoinOn: "اگر یک سوال در دو پیام پشت‌سرهم بیاید، به هم وصل می‌شوند و هر دو دیده می‌شوند.",
    settingJoinOff: "هر پیام جدا می‌ماند، حتی اگر ادامهٔ همان حرف باشد.",

    settingLlm: "فهمیدن معنی یکسان",
    settingLlmOn: [
      "اگر دو نفر یک چیز را با کلمه‌های مختلف بپرسند، یکی شمرده می‌شود.",
      "سوال دو تکه بدون کلمهٔ «ادامه» هم می‌تواند وصل شود.",
    ],
    settingLlmOff: [
      "فقط سوال‌هایی که متن‌شان خیلی شبیه است جمع می‌شوند.",
      "معنی یکسان با کلمه‌های مختلف دیگر با هم مقایسه نمی‌شود.",
    ],

    resetSession: "شروع تازه برای این پخش",
    resetDone: "حافظهٔ این پخش پاک شد.",
    resetWhat: [
      "صفوة سوال‌هایی را که تا حالا در این پخش دیده از یاد می‌برد.",
      "از الان از نو می‌شمارد.",
    ],
    resetNot: [
      "پیام‌های استریم‌یارد پاک نمی‌شوند.",
      "فقط حافظهٔ صفوة صفر می‌شود.",
    ],
  },
};

/*
 * chrome.storage keys shared by the popup and the content script. The popup
 * writes, the content script reads + listens. Default is enabled; only an
 * explicit `false` turns a flag off.
 */
export const STORAGE_KEYS = {
  enabled: "safwaEnabled",
  collapseDuplicates: "safwaCollapseDuplicates",
  hideExtras: "safwaHideExtras",
  joinContinuations: "safwaJoinContinuations",
  llmEnabled: "safwaLlmEnabled",
  resetAt: "safwaResetAt",
};

/** Read teacher settings from chrome.storage.local items. Missing keys default on. */
export function readStoredSettings(items = {}) {
  return {
    enabled: items[STORAGE_KEYS.enabled] !== false,
    collapseDuplicates: items[STORAGE_KEYS.collapseDuplicates] !== false,
    hideExtras: items[STORAGE_KEYS.hideExtras] !== false,
    joinContinuations: items[STORAGE_KEYS.joinContinuations] !== false,
    llmEnabled: items[STORAGE_KEYS.llmEnabled] !== false,
  };
}

/** Overlay teacher settings onto a runtime CONFIG object. */
export function applyStoredSettings(config, settings) {
  config.AUTO_COLLAPSE_EXACT_DUPLICATES = settings.collapseDuplicates;
  config.HIDE_CONFIRMED_EXTRAS = settings.hideExtras;
  config.JOIN_CONTINUATIONS = settings.joinContinuations;
  config.LLM_ENABLED = settings.llmEnabled;
}

/*
 * StreamYard DOM selectors (spec Section 12). Confirmed against a live studio
 * comment feed. Boot-time discovery validates that the container it attaches
 * to actually holds comment rows (dom.js) and every read fails safe. If
 * StreamYard's layout changes, the extension logs
 * one clear [Ṣafwa] warning and leaves the native feed untouched - it can
 * never corrupt it. To re-disable, set CONFIRMED: false.
 * Selectors are language-agnostic, so Dari support does not affect this block.
 */
export const SELECTORS = {
  CONFIRMED: true,
  commentContainer:
    '#broadcast-aside-content-comments, [role="tabpanel"][aria-label="broadcast-aside-content-comments"]',
  commentNode: 'li[class*="VirtualScroller__ScrollItemWrapper"]',
  authorHandle: '[class*="PlatformCommentShell__NameText"]',
  text: '[class*="PlatformCommentShell__ContentSpan"]',
  platformIndicator: 'img[class*="DestinationAvatar__StyledPlatformIcon"]',
};
