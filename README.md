# Ṣafwa (صفوة) - Live Q&A Filter for StreamYard

**Clean up your live stream's Q&A comments as they come in (Persian only).**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
![Chrome Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)

**Ṣafwa** (Arabic/Quranic: *the clear essence, the refined best part after removing the redundant*) is a Chrome (Manifest V3) extension that cleans the live comment feed during a StreamYard Q&A session. It is built for **Dari / Persian** comments: the audience asks questions in Dari, and the teacher answers them orally. It runs while you stream and does three things in real time:

1. Collapses repeated questions into a single entry with a count.
2. Merges a question that got split across two comments back into one block.
3. Flags when one person asks a second, separate question.

You keep using StreamYard exactly as before. The extension only changes how comments look, so you still feature questions through StreamYard's native controls.

## The one hard constraint: there is no API

StreamYard has no public API, no comment webhooks, and no SDK. The only way to read the comment feed is to read the page's DOM in the browser. Everything here is built on that single fact.

Because we read the page instead of an API, a StreamYard layout change can break comment reading. To contain that, **every StreamYard-specific selector lives in exactly two files: `src/config.js` and `src/dom.js`.** Nothing else in the codebase knows what StreamYard's HTML looks like. If selectors stop matching, the extension does nothing visible and logs a clear console warning. It never corrupts the feed.

## Install (load unpacked)

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this project folder (the one with `manifest.json`).
4. Open a StreamYard studio (`https://streamyard.com/...`) with the comments panel visible.
5. Open DevTools (`Cmd+Option+I` on Mac) and check the Console. You should see lines tagged `[Ṣafwa]`.

Click the Ṣafwa icon in the toolbar to open the popup: the mark, صفوة, and one switch, with a one-line hint of what the filter is doing. Off restores StreamYard's native feed exactly. Everything else is configured in `src/config.js`; there is no settings screen in v1.

To see that pair locally: `npm run demo`, then open `http://127.0.0.1:8000/test/teacher.html`.

## Replaying a real broadcast

The strongest test is the teacher's own past session. The audience comments on YouTube, and a YouTube VOD keeps the full live chat - the same comments StreamYard pulled into the studio during the broadcast. Replaying them through the real pipeline (with their real gaps) shows exactly what the teacher would have seen:

```
yt-dlp --skip-download --write-subs --sub-langs live_chat --sub-format json3 \
       -o chat.%(ext)s "<YOUTUBE_VOD_URL>"
node test/convert-live-chat.js chat.live_chat.json test/fixtures/replay-<id>.json
npm run demo   # then open http://127.0.0.1:8000/test/replay.html
```

- `test/replay.html` replays the comments at x1 to instant speed, with the real badges and a live decision tally.
- `node test/replay-analysis.js [fixture]` prints the same session as numbers: what was kept, joined, collapsed, dimmed, hidden - with timestamps, for tuning.

Five real sessions (425 comments over ~5 hours) are committed at `test/fixtures/` and are what tuned the current defaults: the continuation window is 60s (at 25s, three real continuation fragments were hidden as second questions), `ادامه`-announced fragments join past any window (`EXPLICIT_CONTINUATION_MS`), the greeting `اسلام علیکم ورحمت الله استاد` and the title `مفتی` strip before matching, and in-window extras dim instead of vanish (`DIM_IN_WINDOW_EXTRAS: true`).

## Project layout

```
manifest.json          MV3 manifest, content script scoped to streamyard.com
src/
  content.js           entry point: bootstraps the core, runs the MutationObserver + pipeline
  dom.js               ALL StreamYard selectors + comment extraction (the only fragile layer)
  normalize.js         text normalization (matchKey + displayText)
  dedup.js             exact + fuzzy duplicate detection
  grouping.js          continuation detection, one-question-per-person, pipeline order, LLM escalation flags
  state.js             handle map, signature store, recent buffer
  ui.js                in-place annotation, badges, collapsing
  llm-classifier.js    async LLM semantic-duplicate classifier (Cloudflare Gemma 4)
  config.js            all thresholds, lists, feature flags, LLM settings, AND the StreamYard selectors
popup/
  popup.html|css|js    toolbar popup: mark, name, on/off switch
fonts/
  Vazirmatn-Variable   bundled Persian UI font (OFL), used by badges, popup and demo
styles.css             badge + dim styles, @font-face, on/off CSS gating
test/
  mock-comments.js     scripted comment streams for testing without StreamYard
  run-tests.js         Node test runner for the matching core (44 tests)
  demo.html|js         visual simulation harness (npm run demo)
  teacher.html|js      what the teacher sees: popup + annotated comments column
  replay.html|js       replay a real broadcast's live chat through the pipeline
  convert-live-chat.js yt-dlp live-chat json3 -> replay fixture converter
  replay-analysis.js   the same replay as numbers: kept/joined/dimmed/hidden
  fixtures/            committed real-session replay + raw chat dump
deploy/
  cloudflare/          live Gemma 4 Worker (Workers AI binding)
  Dockerfile           leftover vLLM image (not the live path)
  README.md            leftover AWS notes (not the live path)
```

## The processing pipeline (order is fixed)

For each new comment: **extract → normalize → continuation check → duplicate check → new/extra-question check → render.**

The order is not negotiable. Continuation is checked first, before duplicate and before the one-question rule, so a split question is never wrongly flagged as a second question or wrongly collapsed as a duplicate. See the spec, Section 6.

Cost asymmetry we design around: wrongly merging two questions just gives you a slightly longer block to read. Wrongly hiding a real question destroys it. So inside the time window, ambiguity always resolves toward merging, never toward hiding.

## Human in the loop (v1)

Only high-confidence **exact** duplicates auto-collapse. A confirmed second question from the same person is also hidden by default (`HIDE_EXTRA_QUESTIONS`), because the teacher asked for a strict one-question-per-person feed; flip the flag to keep them visible-but-dimmed, or set `DIM_IN_WINDOW_EXTRAS: true` to keep just the ambiguous in-window ones visible. Everything else that is ambiguous (continuation merges, fuzzy near-duplicates) is marked visually, never hidden. Hiding is reversible: the data stays in state, and the popup OFF switch restores StreamYard's full native feed instantly. You stay the final judge.

## Testing the matching core

The matching logic (normalize, dedup, grouping, state) has zero dependency on StreamYard or the browser DOM. It is proven against scripted streams in `test/mock-comments.js` before it ever touches a real page.

```
npm test
```

## Language: Dari / Persian

Comments are read as Dari/Persian (the two share one script, so both work). Before matching, text is folded so that the same question typed different ways still counts as the same question:

- Arabic vs Persian letters are unified: `ي → ی`, `ك → ک`, alef and hamza forms (`أ إ آ ؤ ئ ة ۀ`) folded, standalone hamza dropped.
- Vowel marks (harakat), the tatweel stretch (`ـ`), and the zero-width non-joiner (so `می‌روم` = `میروم`) are stripped.
- Persian `۰۱۲۳` and Arabic-Indic `٠١٢٣` digits fold to `0123`.
- Leading greetings/honorifics (`سلام`, `سلام علیکم`, `استاد`, `شیخ`, `مولوی`, `صاحب`, ...) are stripped for matching only, never from what's shown.
- The Persian question mark `؟` and comma `،` are understood by the continuation logic.
- Handles are folded the same way for identity (no honorific stripping), so `کریم` typed on an Arabic keyboard (`كريم`) or `Ahmad` vs `ahmad` count as the same person for the one-question rule.

**To change wording or word lists**, edit `src/config.js`:
- `LABELS` - the four Dari badge texts.
- `HONORIFICS_TO_STRIP` - greetings/titles peeled off the front (written in folded Persian: `ک` not `ك`, `ی` not `ي`).
- `CONNECTOR_WORDS` - Persian words that signal a continuation.

The badges render right-to-left. Counts show Western digits by default for legibility at badge size; set `USE_PERSIAN_DIGITS_IN_UI: true` for Persian digits.

## Tuning (Phase 6)

Every knob lives in `src/config.js`. There is no settings UI in v1; you edit the file and reload the extension. Tune against a real or recorded session. Symptom to knob:

| You see... | Turn this knob |
| --- | --- |
| Real continuations getting flagged as a 2nd question | Raise `CONTINUATION_WINDOW_MS` (give the second fragment more time), or add the connector word you keep seeing to `CONNECTOR_WORDS`. |
| Two genuinely separate questions getting merged | Lower `CONTINUATION_WINDOW_MS`. Remember the cost asymmetry: a wrong merge is cheap, so lean conservative here. |
| Obvious repeats not collapsing | Lower `FUZZY_THRESHOLD` (e.g. 0.85 to 0.80). Watch for false merges as you go down. |
| Different questions wrongly called duplicates | Raise `FUZZY_THRESHOLD`, or raise `FUZZY_LENGTH_RATIO` so a short question can't match a long one. |
| Greetings/honorifics splitting otherwise-identical questions | Add the word/phrase to `HONORIFICS_TO_STRIP`. |
| Very short repeats ("when?", "link?") slipping through | Set `ENABLE_LEVENSHTEIN_SHORT: true` and tune `LEVENSHTEIN_THRESHOLD`. |
| Studio feels laggy under heavy volume | Lower `DEDUP_BUFFER_SIZE`. |

`AUTO_HIDE_ANYTHING_AMBIGUOUS` must stay `false` in v1.

## Out of scope for v1

- ~~Semantic deduplication (two people asking the same thing in totally different words). Needs an LLM/embedding call. Deferred to v2.~~ **Added in v2 (see below).**
- Cross-platform identity linking. "Ahmad" on YouTube and "Ahmad" on Facebook cannot be reliably confirmed as the same person. The one-question rule applies within the same platform and handle only.
- Any auto-hiding of ambiguous cases. Marking only.
- A settings UI. Config lives in `config.js`.

## v2: LLM Semantic Layer (combo architecture)

The regex pipeline handles 80-90% of comments instantly. Its one gap is **semantic deduplication**: two people asking the same question in completely different words with zero shared tokens.

v2 adds Gemma 4 (Cloudflare Workers AI) as a second opinion for exactly these cases. The architecture is a **combo**, not LLM-alone:

```
New comment -> regex pipeline (instant)
  -> High confidence? -> act immediately
  -> Ambiguous (might be semantic dup)? -> async Gemma 4 call (~300ms p50)
     -> LLM says "duplicate" -> dim + badge (never hide)
     -> LLM unavailable or says "primary" -> regex decision stands
```

### What changed

- **`src/llm-classifier.js`**: calls a Cloudflare Worker that runs Gemma 4 26B. Uses `fetch()` with an 8s timeout. Falls back to the regex decision on any failure.
- **`src/grouping.js`**: `processComment` now sets `needsLlmReview: true` on "primary" decisions when there are prior questions to compare against. The pipeline order and all existing decisions are unchanged.
- **`src/content.js`**: after rendering the regex decision, if `needsLlmReview` is true, asynchronously calls Gemma 4. If it says "duplicate", re-annotates the node (dim + the same "maybe duplicate" badge the regex uses). Never hides.
- **`src/config.js`**: `LLM_ENABLED`, `LLM_ENDPOINT`, `LLM_MODEL`, `LLM_TIMEOUT_MS`, `LLM_MAX_CONTEXT_COMMENTS`.
- **`styles.css`**: `.safwa-badge--semantic` shares the quiet duplicate treatment.
- **`manifest.json`**: `host_permissions` includes `https://*.workers.dev/*` for the Worker.
- **`deploy/cloudflare/`**: the live Worker. The API token stays in Wrangler, not in the Chrome package.

### What did NOT change

- The regex pipeline still runs first and handles all high-confidence cases instantly.
- Only exact duplicates auto-collapse. LLM-flagged semantic dups are dimmed + badged, never hidden.
- `npm test` is 44/44. LLM escalation flags are covered.
- `LLM_ENABLED: false` reverts to pure v1 behavior.

### Self-hosting (data sovereignty)

The live LLM is **Gemma 4 26B** on Cloudflare Workers AI (`@cf/google/gemma-4-26b-a4b-it`). The extension talks to the `safwa-llm` Worker in `deploy/cloudflare` so the API token never sits in the Chrome package. Deploy with `wrangler deploy` from that folder.

## Build status

This project is built in phases (spec Section 14). Current status:

- [x] Phase 1: Skeleton (manifest + content script logging on streamyard.com)
- [x] Phase 2: DOM discovery layer built with research-based selectors, hardened at boot (attach only to a container that holds comment rows)
- [x] Phase 3: Matching core, proven on mocks (`npm test`: 44/44, acceptance criteria 1-5)
- [x] Phase 4: Core wired to the live DOM (observer + pipeline + fail-safe; shipped enabled for v1.0.0)
- [x] Phase 5: UI layer (in-place annotation with confidence tiers)
- [x] Phase 6: Tuning playbook + centralized knobs ready. Live threshold tuning needs a real session (see Tuning above).
- [x] Phase 7: LLM semantic layer (combo architecture). Gemma 4 26B on Cloudflare Workers AI. Dari eval 68/68.
- [x] Dari/Persian localization: script normalization, Dari word lists + labels, RTL UI, proven on Dari fixtures (`npm test`)
- [x] Brand: name **Ṣafwa**, Kufic ṣād mark (`icons/`, master at `icons/logo.svg`)
- [x] Popup: 56px bar, mark + name + on/off (persisted in `chrome.storage.local`; off restores the native feed exactly)
- [x] Bundled Vazirmatn variable font (OFL) for crisp Persian rendering in badges, popup and demo

### To go fully live

The build is complete and the logic is proven. The extension ships **enabled**: `SELECTORS.CONFIRMED` is `true`, and boot-time discovery only attaches to a container that actually holds comment rows. If StreamYard's live layout differs from the researched selectors, the extension logs one clear `[Ṣafwa]` warning and leaves the native feed untouched — it can never corrupt it.

The one operator step that remains is confirmation, not activation:

1. On a live studio, open DevTools and check the Console for `[Ṣafwa]`. If you see `comments container not found` or `could not read handle or text`, paste the real markup into `SELECTORS` in `src/config.js` (spec Section 12). Until then the feed simply runs native.
2. Tune thresholds against a real or recorded session using the table above.

## License

MIT. See [LICENSE](LICENSE).
