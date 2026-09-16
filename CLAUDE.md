# CLAUDE.md - StreamYard Live Q&A Filter

Project-specific rules for this repo. The global rules in `~/.claude/CLAUDE.md` still apply; this file adds what is specific to this extension. The current authoritative build spec is `specs/safwa-v2-architecture.md`. The original matching requirements remain in `streamyard-question-filter-spec.md`. Read the relevant specification before changing behavior.

## What this is

A Manifest V3 Chrome extension that cleans a StreamYard live Q&A comment feed in real time: collapses duplicates, merges split questions, flags extra questions. The operator is a non-technical teacher running a live stream. The audience comments in **Dari / Persian** and the teacher answers orally; comments are questions only.

## Language invariants (Dari / Persian)

- All matching happens on a folded `matchKey`: Arabic↔Persian letters unified (`ي→ی`, `ك→ک`, alef/hamza forms), harakat + tatweel + ZWNJ stripped, Persian/Arabic-Indic digits folded to ASCII, leading honorifics removed. This lives in `normalize.js`. Do not match on raw text.
- Dari word lists and UI labels are user-editable in `config.js` (`LABELS`, `HONORIFICS_TO_STRIP`, `CONNECTOR_WORDS`). Honorifics must be written in folded Persian (`ک`/`ی`), because stripping runs after folding.
- UI is RTL; visible strings come from `CONFIG.LABELS`, never hard-coded.
- Noto Naskh Arabic is the single font across the Dari UI, including comments and controls. Use the shared `--font-ui` token in the sidebar and bundle its font/license; do not reintroduce older font families.
- Dedup is cross-platform (same text from any platform collapses). The one-question-per-person rule is per `platform::handle` and is NOT linked across platforms.

## Non-negotiable invariants

1. **Do not assume a supported StreamYard API, webhook or SDK.** Production comments are admitted from the DOM. Experimental inbound WebSocket observation requires the v2 evidence gates and never authorizes native actions. Production remains `WS_MODE: "off"`.

2. **Selectors live in two files only.** Every runtime StreamYard-specific selector belongs in `src/config.js` (the selector constants) and `src/dom.js` (extraction logic). No selector, class name, or DOM-shape assumption may appear anywhere else. Sanitized, inert live-capture evidence may be stored under `captures/`, but runtime code must never import it. This is the layer most likely to break, so it is isolated on purpose.

3. **Pipeline order is fixed:** exact/fuzzy duplicate check → one-question-per-person → LLM override. Only exact normalized repeats collapse locally. Possible continuations, greetings, reordered text and fuzzy matches stay visible until the LLM confirms them.

4. **Fail safe, never corrupt the feed.** If selectors stop matching, the extension does nothing visible and logs a clear `[Ṣafwa]` console warning. A `try/catch` that exists to *fail safe around DOM reads* is allowed here (it is spec-mandated); a `try/catch` that silently swallows a logic bug is not.

5. **Do not hide a maybe.** Only exact normalized repeats auto-collapse immediately. Ambiguous extras, continuations, greetings and partial fuzzies stay visible until the LLM confirms. `AUTO_HIDE_ANYTHING_AMBIGUOUS` must stay `false`.

6. **Cost asymmetry.** Wrongly hiding a real question is the costliest failure. Uncertain comments stay visible while classification is pending or unavailable.

## Out of scope (do not build)

- Cross-platform identity linking.
- Engineer knobs in the popup (Jaccard, windows, endpoints). Teacher settings are the five live toggles plus tab-scoped session reset, with explanations in the sidebar.

## v2: LLM semantic layer (combo architecture)

The local pipeline handles exact dedup and provisional new/extra decisions instantly. Every other classification goes to the LLM asynchronously.

Key rules:
- Only exact normalized repeats skip the model. Reordered text, greetings, continuations, extras and semantic matches render first; the LLM must confirm before we hide, join or count.
- If the LLM says duplicate, hide the copy and increment N on the original. If it says extra, hide with no badge. If it says continuation, join.
- Gemma 4 gets 30 seconds. If it times out, fails or returns invalid output, the Worker tries GLM 5.3 Flash once with the same 30-second limit. The extension allows 65 seconds for both attempts. If both fail, the visible local decision stands.
- `LLM_ENABLED: false` in `config.js` reverts to regex-only (ambiguous extras/fuzzies stay visible).
- Primary model: Gemma 4 26B (`@cf/google/gemma-4-26b-a4b-it`). Backup: GLM 5.3 Flash (`@cf/zai-org/glm-5.3-flash`). Both run through the `safwa-llm` Cloudflare Worker, so no API token lives in the extension.

## Architecture notes

- The matching core (`normalize.js`, `dedup.js`, `grouping.js`, `state.js`) is pure: no DOM, no `chrome.*`, no globals. It must stay importable in plain Node so `test/run-tests.js` can prove it on `test/mock-comments.js`.
- `content.js` loads `session.js`, which owns the DOM observer, admission, matching, bounded AI queue and direct panel port. `panel/panel.js` renders snapshots and patches. `content-legacy.js` and `ui.js` are regression-only.
- AI results are replayed in arrival order only against their original context. Master-off cancels pending classification. Reset clears AI jobs and session history, then rereads currently mounted comments.
- `llm-classifier.js` performs browser classification requests; pure task prompts live in `llm-prompts.js`. Three prompts include courtesy, plus `room` (duplicate vs primary) and `same_person` (continuation vs duplicate vs extra). Both Worker models receive a real `system` role, thinking off (`chat_template_kwargs.enable_thinking: false`), few-shot examples and the question last.
- The single source of truth for pipeline order is `processComment` in `grouping.js`. The single source of truth for LLM confirmations is `applyLlmOverride`. Both content.js and the tests call them, so the order is never duplicated.

## How to verify

- Matching core: `npm test` (runs the Node test runner against the mock streams). Must cover acceptance criteria 1-5.
- Browser load: load unpacked at `chrome://extensions`, open a StreamYard studio, check the Console for `[Ṣafwa]` lines. Criteria 6-7 (fail-safe + native featuring still works) are verified live.
- "Done" means `npm test` is green and `npm run build:manifest` succeeds. No TypeScript or lint configuration exists.
- `test/session-test.js` covers v2 lifecycle, settings, remount and asynchronous AI races. `test/worker-test.js` covers bounded requests, rate limiting and error responses.
- Panel changes require browser checks for settings, errors, reading position and keyboard access. Live broadcast output remains a separate rehearsal gate.

## Build phases (spec Section 14)

1. Skeleton (done)
2. DOM discovery (done, selectors confirmed against a live studio)
3. Matching core, tested on mocks (done, 44/44)
4. Wire core to live DOM (done, late-panel retry, virtualized-row, duplicate-anchor, stale-LLM and visible-extra safety regressions)
5. UI layer (done)
6. Tuning pass (ready, needs a live session)
7. LLM semantic layer / combo architecture (done; Gemma 4 primary, GLM 5.3 Flash backup)

## Live LLM

- Models: `@cf/google/gemma-4-26b-a4b-it` primary, `@cf/zai-org/glm-5.3-flash` backup
- Worker: `deploy/cloudflare` (`wrangler deploy`)
- Endpoint: `LLM_ENDPOINT` in `src/config.js`

## Expected workload

- Two sessions per week, on Tuesday and Thursday afternoons.
- Around 150 to 200 incoming questions/comments per session, with roughly 150 questions answered.
- The panel mounts at most 200 question cards per page. Larger sessions retain all captured history through older/newer pages.
- The AI service limit is 120 requests per minute per IP, not a per-session question limit. Rate-limited or unavailable AI leaves uncertain questions visible.
