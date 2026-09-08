# CLAUDE.md - StreamYard Live Q&A Filter

Project-specific rules for this repo. The global rules in `~/.claude/CLAUDE.md` still apply; this file adds what is specific to this extension. The authoritative build spec is `streamyard-question-filter-spec.md` at the repo root. Read it before changing behavior.

## What this is

A Manifest V3 Chrome extension that cleans a StreamYard live Q&A comment feed in real time: collapses duplicates, merges split questions, flags extra questions. The operator is a non-technical teacher running a live stream. The audience comments in **Dari / Persian** and the teacher answers orally; comments are questions only.

## Language invariants (Dari / Persian)

- All matching happens on a folded `matchKey`: Arabic↔Persian letters unified (`ي→ی`, `ك→ک`, alef/hamza forms), harakat + tatweel + ZWNJ stripped, Persian/Arabic-Indic digits folded to ASCII, leading honorifics removed. This lives in `normalize.js`. Do not match on raw text.
- Dari word lists and UI labels are user-editable in `config.js` (`LABELS`, `HONORIFICS_TO_STRIP`, `CONNECTOR_WORDS`). Honorifics must be written in folded Persian (`ک`/`ی`), because stripping runs after folding.
- UI is RTL; visible strings come from `CONFIG.LABELS`, never hard-coded.
- Dedup is cross-platform (same text from any platform collapses). The one-question-per-person rule is per `platform::handle` and is NOT linked across platforms.

## Non-negotiable invariants

1. **There is no StreamYard API.** Comments are read from the page DOM via a content script and a MutationObserver. Do not add code that assumes an API, webhook, or SDK exists.

2. **Selectors live in two files only.** Every runtime StreamYard-specific selector belongs in `src/config.js` (the selector constants) and `src/dom.js` (extraction logic). No selector, class name, or DOM-shape assumption may appear anywhere else. Sanitized, inert live-capture evidence may be stored under `captures/`, but runtime code must never import it. This is the layer most likely to break, so it is isolated on purpose.

3. **Pipeline order is fixed:** continuation check → duplicate check → one-question-per-person. Never reorder. Continuation-first is what stops a split question from being wrongly flagged or wrongly deduplicated. One narrow exception, on purpose: a re-send with a matchKey IDENTICAL to the handle's open block collapses as a duplicate before the continuation check, because a verbatim repeat can never be a genuine split (see the double-send guard in `grouping.js`).

4. **Fail safe, never corrupt the feed.** If selectors stop matching, the extension does nothing visible and logs a clear `[Ṣafwa]` console warning. A `try/catch` that exists to *fail safe around DOM reads* is allowed here (it is spec-mandated); a `try/catch` that silently swallows a logic bug is not.

5. **Human in the loop (v1).** Only high-confidence exact duplicates may auto-collapse (`AUTO_COLLAPSE_EXACT_DUPLICATES`). Everything ambiguous (continuation merges, flagged second questions) is marked visually, never hidden. `AUTO_HIDE_ANYTHING_AMBIGUOUS` must stay `false` in v1.

6. **Cost asymmetry.** Wrongly merging two questions is cheap (a longer block). Wrongly hiding a continuation destroys a real question. Inside the time window, ambiguity resolves toward merging, never toward hiding.

## Out of scope (do not build)

- Cross-platform identity linking.
- A settings UI.

## v2: LLM semantic layer (combo architecture)

The regex pipeline handles exact/fuzzy dedup, continuation, and extra-question detection instantly. Its one gap is **semantic deduplication** (same question, completely different words, zero shared tokens). v2 adds an LLM as an async second opinion for exactly these cases.

Key rules for v2:
- The LLM is **advisory only**. It can dim + badge a comment as "semantic duplicate" but **never hides it**. Only the regex pipeline's exact match can auto-collapse.
- The LLM call is **async and non-blocking**. The regex decision renders first; the LLM re-annotates later if it disagrees. The feed is never delayed.
- If the LLM is unreachable, times out (8s), or returns garbage, the regex decision stands. The feed is never broken.
- `LLM_ENABLED: false` in `config.js` reverts to pure v1 behavior.
- Live model: Gemma 4 26B on Cloudflare Workers AI (`@cf/google/gemma-4-26b-a4b-it`), via the `safwa-llm` Worker in `deploy/cloudflare`. The API token never lives in the extension.

## Architecture notes

- The matching core (`normalize.js`, `dedup.js`, `grouping.js`, `state.js`) is pure: no DOM, no `chrome.*`, no globals. It must stay importable in plain Node so `test/run-tests.js` can prove it on `test/mock-comments.js`.
- `content.js` is the browser bootstrap. It loads the ES-module core, wires the MutationObserver, and connects `dom.js` (extract) -> core (decide) -> `ui.js` (render). Keep browser-only concerns here and in `dom.js`/`ui.js`.
- `llm-classifier.js` is browser-only (uses `fetch`). It calls the Cloudflare Worker, which runs Gemma 4. It is always called async, after the regex pipeline has already rendered its decision. The system prompt follows Gemma 4 docs: a real `system` role, thinking off (`chat_template_kwargs.enable_thinking: false`, no `<|think|>`, no `/no_think`), few-shot, question last. Keep `llm-test/eval.py` in lockstep.
- The single source of truth for pipeline order is the orchestrator in `grouping.js`. Both `content.js` and the tests call it, so the order is never duplicated.

## How to verify

- Matching core: `npm test` (runs the Node test runner against the mock streams). Must cover acceptance criteria 1-5.
- Browser load: load unpacked at `chrome://extensions`, open a StreamYard studio, check the Console for `[Ṣafwa]` lines. Criteria 6-7 (fail-safe + native featuring still works) are verified live.
- "Done" means `npm test` is green. Skipping it is not done.

## Build phases (spec Section 14)

1. Skeleton (done)
2. DOM discovery (done, selectors confirmed against a live studio)
3. Matching core, tested on mocks (done, 44/44)
4. Wire core to live DOM (done, late-panel retry, virtualized-row, duplicate-anchor, stale-LLM and visible-extra safety regressions)
5. UI layer (done)
6. Tuning pass (ready, needs a live session)
7. LLM semantic layer / combo architecture (done, 44/44 tests, Gemma 4 eval 68/68)

## Live LLM

- Model: `@cf/google/gemma-4-26b-a4b-it` (Gemma 4 26B)
- Worker: `deploy/cloudflare` (`wrangler deploy`)
- Endpoint: `LLM_ENDPOINT` in `src/config.js`
