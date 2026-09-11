# Ṣafwa v2 Architecture Counsel Brief — Comment Transport + Custom Panel

Version: 1.0 · Written: 2026-09-11 · Operator: Wasim (non-technical teacher) · Repo: `/Users/wasimjalali/Desktop/Personal Project/safwa`

You are a councilor in an architecture review. This brief is self-contained; you may also read the repo directly for exactness. Answer the mandatory questions in Section 6 and deliver the output contract in Section 7. Be adversarial where warranted. Do not rubber-stamp the user's proposal.

---

## 0. Decision to be made

Ṣafwa v1 reads StreamYard's comments from the **page DOM** (content script + MutationObserver) and annotates them **in place** (badges, dimming, fade-collapse). It works, it is live-tested, and `npm test` is green. The teacher's remaining complaint is that **in-place badges are not a clean enough experience**.

The user's proposal for v2:

> Capture StreamYard's live comments at the **WebSocket** level (the page's own socket), run them through the existing filter pipeline, and render a **custom, clean panel** instead of in-place badges.

This brief asks you to stress-test that proposal against alternatives, and to produce a concrete, buildable architecture decision. The mission is the **best** architecture, not a predetermined one.

---

## 1. The product in one page

- A Manifest V3 Chrome extension that cleans a **live Q&A comment feed** inside a StreamYard studio page.
- Audience comments arrive in **Dari / Persian** (Perso-Arabic script). The teacher answers orally on stream.
- StreamYard **merges comments from every connected platform** (YouTube live chat, Facebook, Instagram, …) into one comments panel. The teacher reads from this panel and uses StreamYard's native controls to **feature/show a comment** on the broadcast.
- v1 does three things in real time:
  1. Collapse repeated questions into one entry with a count.
  2. Merge a question split across two comments (continuation grouping).
  3. Flag a person's second, separate question.
- Operator constraints: non-technical; zero setup beyond installing the extension; runs live for 1–3 hours; must never lose a question; must never corrupt the native feed.

### Hard facts about StreamYard

- **There is no public API, no webhooks, no SDK.** Confirmed by StreamYard's help center. The only access is observing the page (DOM and/or its own transport).
- The studio page is a React SPA with **SPA navigation**, a **virtualized comments scroller** (rows recycled; `display:none` leaves holes because the scroller keeps slot geometry), and no shadow roots/iframes in the comments panel (verified live, see Section 2.8).
- Row controls seen live in the DOM: `button[data-testid="show-comment-button"]` (feature on broadcast), `button[aria-label="Star comment"]`, `button[aria-label="Comment actions"]`.
- The user's own YouTube live chat is the main comment source; comments reach the studio through StreamYard's servers, so they may arrive over StreamYard's own transport rather than directly from YouTube.

---

## 2. Current architecture — Ṣafwa v1.0.5 (as built and live-tested)

### 2.1 Manifest and runtime topology

`manifest.json` (42 lines):
- `manifest_version: 3`, `version: 1.0.5`, no background service worker, no `scripting` permission.
- `permissions: ["storage", "activeTab"]`
- `host_permissions: ["https://streamyard.com/*", "https://*.streamyard.com/*", "https://*.workers.dev/*"]`
- One content script: `src/content.js` (+ `styles.css`), `run_at: document_idle`, matches streamyard.com only, top frame.
- `web_accessible_resources`: `["src/*.js", "fonts/*"]` for StreamYard origins.
- Popup: `popup/popup.html|css|js` — master on/off + five settings toggles + session reset, all in Dari RTL.

Current topology:

```
StreamYard studio tab (top frame)
┌─────────────────────────────────────────────────────────────┐
│ page world (React app, its network stack incl. WebSocket)  │
│ ──────────────────────────────────────────────────────────  │
│ isolated world: src/content.js (classic script)             │
│   dynamic import of ESM core via chrome-extension:// URLs   │
│   MutationObserver on comments container                    │
│   dom.extractComment → grouping.processComment → ui.render  │
│   async fetch → safwa-llm Cloudflare Worker (Gemma 4 26B)   │
│   chrome.storage.local ⇄ popup toggles                      │
└─────────────────────────────────────────────────────────────┘
```

There is **no service worker** today. Session matching state lives in the content script's closure (`createState()`), memory-only, per tab.

### 2.2 Module map

Pure core (Node-importable, no DOM, no `chrome.*`, tested):
- `src/normalize.js` — produces `matchKey` / `displayText` / `isGreetingOnly`. Folds Arabic↔Persian letters (`ي→ی`, `ك→ک`, hamza carriers, `ة→ه`), strips harakat/tatweel/ZWNJ/bidi controls, folds Persian+Arabic-Indic digits to ASCII, strips leading honorifics for matching only. `foldHandle()` for identity, no honorific stripping.
- `src/dedup.js` — exact lookup in a signature map; fuzzy token-set Jaccard ≥ `FUZZY_THRESHOLD` (0.85) with a length-ratio guard; optional Levenshtein (off). `collapseOnto` stores slim records (no DOM refs) to avoid leaks.
- `src/grouping.js` — **single source of truth for pipeline order** in `processComment()` and for LLM overrides in `applyLlmOverride()`. Continuation cues (no terminal punctuation, trailing connector/comma, near limit 200 chars, lowercase/connector start), 60s window, `MAX_COMMENTS_PER_QUESTION: 2`, explicit `ادامه` marker stretches window to 180s.
- `src/state.js` — `handles: Map<identityKey, HandleRecord>`, `signatures: Map<matchKey, entry>`, `recentKeys: []` (bounded 100). Identity = `platform::foldHandle(handle)`; never linked across platforms.

Browser-only:
- `src/config.js` — all thresholds, word lists, labels (`CONFIG.LABELS`, Dari), feature flags, `STORAGE_KEYS`, `SELECTORS` (the only selector strings outside `dom.js`), `readStoredSettings`/`applyStoredSettings`.
- `src/dom.js` — the only fragile layer: `findCommentContainer`, `collectCommentNodes`, `closestCommentNode`, `commentNodesWithin`, `cardAnchor`, `extractComment`. Returns `{ handle, platform, displayText, timestamp: Date.now(), el, cardEl }`. Fails safe with one `[Ṣafwa]` warning per failure kind.
- `src/ui.js` — in-place annotation: badge insert, `safwa-*` classes (`primary`, `joined`, `dim`, `collapsed`, `collapse-hide`), count badge, `COLLAPSE_MODE: "fade"` ghosts. Never reads StreamYard structure; only decorates nodes `dom.js` found.
- `src/llm-classifier.js` — browser `fetch` to the Cloudflare Worker; two/three prompt kinds (`room`, `same_person`, `courtesy`); Gemma 4 26B; JSON-only reply; `LLM_TIMEOUT_MS: 8000`; garbage/timeout ⇒ regex decision stands.
- `src/content.js` — classic script bootstrap; debounced flush (80ms); container polling (1s × 30, rows required early); container watchdog (3s) for SPA re-renders; fingerprint = `platform\0handle\0displayText` to survive row recycling; `retargetDecision` for virtual scroller adoption; LLM review after render with stale-row guard; settings/reset listeners; on/off is purely `html.safwa-disabled` CSS gating.

### 2.3 Pipeline semantics (order is fixed)

```
greeting? → (open-block exact re-send duplicate guard) → continuation? → duplicate? → primary/extra?
```

- Only regex-certain cases act immediately: exact text, token-set identity (reorder), announced continuation, greetings.
- Everything uncertain is rendered first and **escalated to the LLM asynchronously**; hide/count waits for confirmation.
- `AUTO_HIDE_ANYTHING_AMBIGUOUS` must stay `false`.
- Cost asymmetry: wrongly merging is cheap; wrongly hiding a real question is the worst failure. Inside the window, ambiguity resolves toward merging.
- `applyLlmOverride` is the single source of truth for applying LLM confirmations (duplicate→hide+count; extra→hide no badge; continuation→join; greeting→fold).

### 2.4 LLM combo layer

- Live: Gemma 4 26B (`@cf/google/gemma-4-26b-a4b-it`) via the `safwa-llm` Worker in `deploy/cloudflare`; the API token never lives in the extension.
- Endpoint in `CONFIG.LLM_ENDPOINT`; host permission for `*.workers.dev` already present.
- v1 live report: LLM eval 68/68 on the room path; one live same-person paraphrase was classified **extra (hidden)** instead of duplicate (partial failure, documented).
- `LLM_ENABLED: false` reverts to regex-only.

### 2.5 UI layer + teacher settings

- UI labels are Dari, RTL, all from `CONFIG.LABELS` (never hard-coded).
- Popup: master on/off, five toggles (`collapseDuplicates`, `hideExtras`, `joinContinuations`, `hideGreetings`, `llmEnabled`), reset session.
- Badges anchor to the inner comment card (`cardAnchor`), absolute positioned, `pointer-events` do not block native row clicks.
- Live finding: duplicate rows are faded to ghosts (not `display:none`) because the virtual scroller keeps slots and hidden rows produced big blank gaps. Ghosts remain readable at ~25% opacity.

### 2.6 Tests and evidence

- `npm test` = `node test/run-tests.js && test/content-retry-test.js && test/content-virtualization-test.js && test/content-virtual-anchor-test.js && test/content-llm-stale-test.js && test/content-count-recycle-test.js && test/ui-safety-test.js`
- Current result: **86 core assertions + 6 browser regression harnesses, all green.**
- `test/mock-comments.js` has scripted streams covering acceptance criteria 1–5 plus semantic/fuzzy/cap/double-send cases.
- `test/fixtures/replay-*.json` = five **real** broadcast sessions (425 comments over ~5h) converted from YouTube live-chat VODs; used for tuning (windows, honorifics, extras).
- `test/replay.html` / `test/replay-analysis.js` replay them visually and as numbers.
- Live QA report: `qa-screenshots/live-2026-09-10-cli/REPORT.md` (StreamYard + YouTube, unpacked extension, ~21 min, 8 scenarios).

### 2.7 Known live findings and failures from the last run

- Comments panel is a virtual scroller; `display:none` leaves holes → fixed by fade ghosts.
- Badges anchored to the card; inside-card verified.
- The teacher's core complaint (motivating v2): **in-place badges are not clean enough**.
- Criterion 7 (native featuring) was **not** live-tested. Badges are `pointer-events:none`, so clicks should pass through, but no human tested it.
- Semantic paraphrase in the same-person path was hidden as extra instead of counted as duplicate (LLM `same_person` misclassification).
- The extension fails safe when the comments container is missing (dashboard/join screens) — verified live.

### 2.8 DOM ground truth (sanitized capture `captures/streamyard-live-dom.json`)

- Panel: `div#broadcast-aside-content-comments[role="tabpanel"][aria-label="broadcast-aside-content-comments"]`; top document, 0 shadow roots, 0 iframes inside the panel; SPA navigation observed.
- List: `ul`, ~10 virtual rows, 9 valid comments, 1 blank placeholder.
- Row: `li[class*="VirtualScroller__ScrollItemWrapper"]`, `position:absolute`, **may be recycled**.
- Author: `span[class*="PlatformCommentShell__NameText"]` (sample `@iamwasim.jalali`).
- Text: `span[class*="PlatformCommentShell__ContentSpan"]` (sample text Persian).
- Platform indicator: `img[class*="DestinationAvatar__StyledPlatformIcon"]`, `alt="Youtube"`; must be distinguished from the profile avatar (`Avatar__Image`, empty alt).
- Row controls: `button[data-testid="show-comment-button"]`, `button[aria-label="Comment actions"]`, `button[aria-label="Star comment"]`.
- **No comment/row id attribute is documented in the capture.** Whether a stable per-comment id exists in DOM or in socket payloads is an unknown the council must resolve (Section 6, Q2/Q3).

### 2.9 Mission-critical properties of v1 that must not regress

1. Never lose a question (missed comment = worst failure).
2. Matching core stays pure; no decision-logic changes to fit a transport.
3. Fail-open: any transport/schema failure falls back to the v1 DOM pipeline; the teacher always has a working feed.
4. Selectors only in `src/config.js` + `src/dom.js`; no DOM-shape assumptions anywhere else.
5. Pipeline order fixed; LLM confirmations only via `applyLlmOverride`.
6. No remote code; MV3 CSP; no secrets in the extension.
7. All visible strings from `CONFIG.LABELS`, RTL.
8. `npm test` stays green; parser/fallback logic gets unit tests.

---

## 3. Hard constraints for v2 (from the project rules)

- **Never lose a question.** A missed comment in the custom view is the worst possible failure.
- **The matching core stays pure.** Do not change decision logic to fit the transport.
- **Fail-open.** Any transport/schema failure falls back to the v1 DOM pipeline; the teacher must always have a working feed.
- **Invariant #1 conflicts with the proposal.** `CLAUDE.md` currently reads:

  > **1. There is no StreamYard API.** Comments are read from the page DOM via a content script and a MutationObserver. Do not add code that assumes an API, webhook, or SDK exists.

  Socket interception is not an official API/webhook/SDK — it observes the page's own transport. **The council must explicitly amend or reject this invariant with a decision record (Section 7, item 9). Never silently violate it.**
- Selectors live in two files only (`src/config.js`, `src/dom.js`).
- Fail safe, never corrupt the feed. A `try/catch` to fail safe around DOM/parse reads is allowed; silently swallowing logic bugs is not.
- Do not hide a maybe. `AUTO_HIDE_ANYTHING_AMBIGUOUS` stays `false`.
- Cost asymmetry: inside the time window, ambiguity resolves toward merging, never hiding.
- Out of scope: cross-platform identity linking; engineer knobs in the popup (teacher sees only the four live toggles + reset).
- Never commit/publish without the user; the ship path is unpacked load + unlisted Chrome Web Store updates.

---

## 4. The user's draft architecture (verbatim, from Gemini) + what the user wants

The user pasted the following generic MV3 architecture from Gemini and said: *"Gemini didn't add the complete context of the codebase. Take the complete context of the codebase and include it… we want to replace the current inline badge with this new architecture."* Treat this draft as the user's intent statement, not a finished design. You must map every component of it onto Ṣafwa or reject it explicitly.

```text
Chrome Extension Architecture (Manifest V3)

1. System Overview
This document defines the structural architecture for a modern Google Chrome Extension using Manifest V3. The architecture uses an event-driven service worker, isolated execution environments for web page interaction, and centralized asynchronous message passing to ensure high performance, security, and resource efficiency.

2. Core Components
Manifest Configuration (manifest.json) The central blueprint of the extension. It declares entry points, permissions, background execution logic, host permissions, content security policies (CSP), and user interface definitions.

Background Service Worker (service-worker.js)
Role: Acts as the main background event coordinator and state manager.
Behavior: Non-persistent and event-driven. It wakes up to handle specific events (e.g., web requests, chrome runtime alarms, message passing) and terminates when idle to optimize browser resources.
Responsibilities: API interaction, managing local/sync storage, global event routing, external communications.

Content Scripts (content.js & content.css)
Role: Executes code directly within the context of targeted web pages.
Behavior: Operates in an Isolated World, sharing DOM access with the host page without exposing script variables or scope to the host page's JavaScript context.
Responsibilities: DOM manipulation, page event listening, extracting on-screen data, relaying user input to the service worker.

User Interface Layer
Action Popup (popup.html / popup.js): Lightweight UI triggered when clicking the toolbar icon. Active only when visible.
Side Panel (sidepanel.html / sidepanel.js): Persistent side-docked interface for multi-step workflows or contextual tools.
Options Interface (options.html / options.js): Full-page configuration UI for managing extension settings and accounts.

Offscreen Documents (offscreen.html / offscreen.js)
Role: Provides DOM access for background tasks.
Behavior: Created on-demand by the service worker for tasks requiring DOM APIs unavailable in worker contexts (e.g., audio playback, canvas image rendering, clipboard manipulation).

3. Data Flow & Communication Channels
One-Time Message Passing
Used for short request-response messaging between components.
chrome.runtime.sendMessage() handles script-to-background calls.
chrome.tabs.sendMessage() sends events from background scripts to specific browser tabs.

Long-Lived Connections
Established via chrome.runtime.connect() or chrome.tabs.connect().
Utilized for real-time streaming, continuous data sync, or maintaining state across UI views.

Storage Architecture
chrome.storage.local: High-capacity key-value storage persisted locally on the user's machine.
chrome.storage.sync: Automatically syncs configuration data across signed-in Chrome browsers (size-limited).
chrome.storage.session: Fast in-memory storage retained for the current browser session duration.

4. Security & Network Protocols
Content Security Policy (CSP): Restricts script execution strictly to bundled extension code. External dynamic scripts (eval, remote JS execution) are strictly prohibited.
Declarative Net Request (declarativeNetRequest API): Modifies, blocks, or redirects network requests securely via browser-managed declarative rules, eliminating the need to expose raw request content to background scripts.
Least Privilege Access: Permissions (activeTab, storage, scripting) are requested explicitly per feature, minimizing user security surface area.

5. File System Hierarchy
extension-root/
├── manifest.json
├── background/
│   └── service-worker.js
├── content/
│   ├── content.js
│   └── content.css
├── ui/
│   ├── popup.html
│   ├── popup.js
│   ├── sidepanel.html
│   ├── sidepanel.js
│   ├── options.html
│   └── options.js
├── offscreen/
│   ├── offscreen.html
│   └── offscreen.js
├── assets/
│   ├── icons/
│   └── styles/
└── utils/
    ├── storage-adapter.js
    └── messaging-bus.js
```

Operator note added by the user: *"If your architecture has specific unique features (such as WebAssembly integration, WebSocket bridges, or custom authentication flows), reply with those details to integrate them into this document."*

---

## 5. The architecture question, the proposal, and the alternatives

### 5.1 The proposal (user's)

**A. WebSocket capture + custom panel.** Patch the page's `WebSocket` in a page-world (MAIN world) script, capture StreamYard's comment frames, parse them into the same plain comment objects the core consumes, run them through the unchanged `processComment` pipeline, and render a **custom clean panel** (instead of in-place badges). The native comments panel presumably stays underneath.

### 5.2 Alternatives to compare (at minimum)

- **A.** WebSocket capture + custom panel.
- **B.** DOM observer + custom panel (keep reading the DOM exactly as v1 does, but render the clean custom panel instead of annotating in place).
- **C.** Hybrid: WebSocket primary, DOM observer fallback; native panel preserved; custom view is the main panel with a feature-proxy to native rows.
- **D.** Keep in-place annotation and polish further (status quo + polish).

The Gemini draft adds a component dimension the council must decide explicitly:

- **Panel host:** in-page injected panel inside the StreamYard layout vs `chrome.sidePanel` (extension side panel, persists across SPA re-renders, cannot be occluded by StreamYard CSS) vs a separate popup window (`chrome.windows.create`, moveable to a second monitor).
- **Service worker:** adopt one (for LLM proxying, cross-tab coordination, storage) or keep the content-script-only model?
- **Offscreen document:** likely irrelevant for Ṣafwa. Accept or reject with reasoning.
- **Declarative Net Request:** irrelevant (we do not modify network requests). Accept or reject with reasoning.
- **Storage tiers:** `chrome.storage.local` for settings (already), `storage.session` as a candidate for transient matching state (survives service-worker restarts), `sync` probably unnecessary.

---

## 6. Mandatory questions — every councilor answers all six

**Q1. Capture mechanics.** Exactly how to capture the page's WebSocket from a MV3 extension: MAIN-world injection mechanism (manifest `world: "MAIN"` content script at `document_start` vs `chrome.scripting.executeScript` vs script-tag injection), patching `WebSocket`/`WebSocket.prototype`/`send`/`addEventListener`/`onmessage` safely, capturing reconnects and newly constructed sockets, surviving SPA navigation, and bridging frames safely to the isolated world (envelope, namespacing, spoofing/tamper considerations, size/rate limits). Be concrete about manifest changes, file names, and what runs in which world.

**Q2. Schema and discovery.** What is StreamYard's likely transport/schema (JSON, Socket.IO, protobuf, other), and how do we **discover it safely**? Propose a capture + fixture workflow that: (a) does not degrade the live stream, (b) redacts/sanitizes PII before anything is committed, (c) produces inert fixtures for a pure parser function tested in `npm test`. Include the parser's input/output contract and how unknown/malformed frames fail.

**Q3. Events beyond new comments.** Which non-"new comment" events must be honored to avoid a wrong or stale custom panel: deletions, moderation actions, featured/starred state, edits, reconnects/backfill (history dump on reconnect), ordering/replay, duplicate delivery, platform metadata, stable comment ids, session/room metadata? For each: expected semantics, how to detect, and what to do if it is absent (fail-open rules).

**Q4. Feature-proxy — the teacher's #1 native action.** If we render our own panel, how does the teacher still FEATURE a comment on the broadcast? The native control seen live is `button[data-testid="show-comment-button"]` inside each native row (plus `Star comment` and `Comment actions`). Design the mapping from a custom-panel row to its native row (stable id if available; otherwise a fingerprint like `platform::foldHandle(handle)::matchKey`), the click forwarding mechanism, and the case where the native row is **virtualized away** (not in the DOM). Document the fallback and its exact UX cost for the teacher on air. Also consider: what happens when the same text/handle appears in two native rows; what happens when the socket shows a comment the DOM has not rendered yet; whether "feature" state can be reflected back into the custom panel.

**Q5. Failure model and fallback.** Define the failure taxonomy (page-world patch blocked by page CSP or overwritten; socket absent; schema changed; parse-error spike; bridge silent; frame flood; worker/LLM down), measurable fallback triggers (thresholds, windows), and the exact teacher-visible behavior during and after failover. The feed must never break or stall; the worst acceptable outcome is "we're back to the v1 look."

**Q6. MVP vs over-build.** Define the **smallest winning MVP** that can be proven in one live session, and list what must be deferred. Include the feature flag story (`CONFIG.COMMENT_SOURCE = "websocket" | "dom"`, default `"dom"` until live-proven), rollback path, and what evidence flips the default.

---

## 7. Output contract — deliver exactly these sections, in this order

1. **Executive verdict** — 2–5 sentences. State your recommendation and your confidence.
2. **Verdict table** — one row each for A, B, C, D, plus panel-host and Gemini-component rows (service worker, offscreen, DNR, side panel, storage.session, storage.sync). Columns: `Adopt / Adapt / Reject / Unknown`, one-line reason.
3. **Q1 — Capture mechanics** (concrete; file names; manifest diff sketch; bridge envelope).
4. **Q2 — Schema discovery + fixtures** (workflow steps; parser contract; malformed handling; redaction).
5. **Q3 — Event semantics** (table: event → detection → action → fail-open behavior).
6. **Q4 — Feature-proxy** (mechanism; id/fingerprint mapping; virtualized-away fallback; UX cost; edge cases).
7. **Q5 — Failure model** (table: failure → signal → threshold → fallback → teacher sees).
8. **Q6 — MVP vs over-build** (ship list; defer list; flag rollout; flip-the-default evidence).
9. **Invariant #1 decision record** — amend or reject, with the exact replacement wording for `CLAUDE.md` (and the v1 spec if needed). If you reject the WebSocket proposal entirely, say so here.
10. **Risks ranked** — likelihood × impact, with the cheapest mitigation for each.
11. **What this brief missed / open questions** — including the single cheapest experiment to resolve each one.

Rules for your answer:
- Do not invent StreamYard internals. Label unknowns as unknowns and name the experiment that resolves them.
- Ground claims in this brief or in the repo; cite files/paths when you reference code.
- Be specific enough that an implementer can start from your section without guessing.
- Keep the whole answer focused; depth over volume.

---

## 8. Repo pointers (read for exactness if you can)

- `CLAUDE.md` — project invariants and constraints.
- `streamyard-question-filter-spec.md` — the v1 spec (219 lines).
- `safwa-debug-handoff.md` — the DOM debugging history (how selectors were found).
- `captures/streamyard-live-dom.json` — sanitized live DOM ground truth.
- `qa-screenshots/live-2026-09-10-cli/REPORT.md` — latest live run results.
- `src/config.js` — flags, labels, selectors (306 lines).
- `src/content.js` — bootstrap, observer, LLM wiring (426 lines).
- `src/dom.js` — the only fragile layer (169 lines).
- `src/grouping.js` — pipeline order + LLM overrides (574 lines).
- `src/normalize.js`, `src/dedup.js`, `src/state.js` — pure matching core.
- `src/ui.js` + `styles.css` — in-place annotation (the thing v2 wants to replace).
- `src/llm-classifier.js` — the Gemma 4 combo layer.
- `test/mock-comments.js`, `test/run-tests.js`, `test/fixtures/replay-*.json` — tests and real-session evidence.
- `manifest.json`, `package.json` — wiring and test command.

## 9. Lens assignments (operator reference; councilors may ignore)

| Councilor | Model | Lens |
|---|---|---|
| 1 | GLM-5.3 (max) | Feasibility & security (Q1 focus) |
| 2 | GPT-5.6-Luna (max) | Reverse-engineering risk (Q2/Q3 focus) |
| 3 | Kimi K3 (max) | UX/interaction (Q4 focus) |
| 4 | Qwen3.8-Max (xhigh) | Testability/maintainability/rollout (Q5/Q6 focus) |
| 5 | Muse Spark 1.3 (xhigh) | Red-team/alternatives (argue against A) |
| 6 | GLM-5.3-Flash (max) | Smallest MVP vs over-build (trade-off focus) |
| 7 | HY4 (high) | Live-event semantics (Q3 focus) |
| 8 | Grok 4.6 (xhigh) | Red-team #2, different lineage |
| 9 | GPT-6-Astra (max) | Architecture critique + synthesis red-team |
| 10 | Claude Fable 5.1 (xhigh) | Drafts the final final spec |
