# Councilor 6 — Smallest MVP vs Over-build

## 1. Executive verdict

Build **B (DOM observer + custom panel)** as the MVP; reject WebSocket capture (A/C) for this release. The teacher's complaint is that the *experience* is not clean — that is a rendering complaint, and the panel alone fixes it; the transport is not implicated in any known failure (the DOM pipeline is live-proven, 86 assertions + 6 harnesses green). Socket capture adds unknown schema risk, unknown id availability, a feature-proxy redesign, and a new invariant fight — none of which the complaint requires. Confidence: high (~0.85) for B; the socket layer is "Unknown" and should stay out of the build until B proves the panel is the actual win.

## 2. Verdict table

| Option | Verdict | One-line reason |
|---|---|---|
| **A. WebSocket capture + custom panel** | **Reject (this release)** | Over-build: schema unknown, ids unknown, zero live evidence transport is the problem; the panel, not the socket, delivers the "clean" the teacher wants. |
| **B. DOM observer + custom panel** | **Adopt (MVP)** | Reuses the proven `dom.extractComment → processComment` spine untouched; only `ui.render` is swapped. One flag, one rollback click. |
| **C. Hybrid WS-primary + DOM fallback** | **Reject (MVP)** | C = A + B; take B alone, and A can be bolted on later behind the same panel only if evidence ever demands it. |
| **D. Status quo + polish** | **Reject as target** | Teacher's stated complaint persists; but keep it fully compiled as the permanent fallback mode. |
| Panel host: in-page overlay | **Adopt** | Zero message-passing, zero new APIs, dies/reboots with the content script; shadow DOM isolates styling. |
| Panel host: `chrome.sidePanel` | **Reject** | Needs a service worker + `sidePanel` permission + a message bus; strictly more parts for no teacher benefit. |
| Panel host: separate popup window | **Defer** | Nice-to-have second-monitor mode; not needed to prove the core experience in one session. |
| Gemini: background service worker | **Reject** | Nothing needs it: LLM fetch already works from the content script (`src/llm-classifier.js`, host permission already in `manifest.json:26`). |
| Gemini: offscreen document | **Reject** | No audio/canvas/clipboard use case exists in Ṣafwa. |
| Gemini: declarativeNetRequest | **Reject** | We never modify requests; adding it is pure permission surface. |
| Gemini: storage.sync | **Reject** | Single machine, single teacher; sync adds failure modes for nothing. |
| Gemini: storage.session | **Reject** | Only valuable to survive service-worker restarts — and we adopt no service worker. Matching state stays in the closure (v1 behavior, `src/content.js:125`). |

## 3. Q1 — Capture mechanics (answered for the record; **not built in MVP**)

If socket work is ever green-lit post-MVP, the concrete plan is:

- **Injection:** a second content script entry, `src/socktap-main.js`, registered in `manifest.json` with `"world": "MAIN"`, `"run_at": "document_start"`, isolated-world listener in a new `src/socktap-bridge.js` (document_start is non-negotiable — the patch must exist before the page's first `new WebSocket(...)`; v1's existing `document_idle` entry stays exactly as is).
- **Patch point:** replace `window.WebSocket` with a subclass whose constructor wraps the instance's `onmessage` setter and `addEventListener("message", …)` so we *tee* frames, never consume or alter them. Constructor-level patching automatically covers reconnects and newly constructed sockets; no instance hunting needed. Never patch `send` (read-only observer).
- **Bridge:** tee → `window.postMessage({ ns: "safwa-sock-tap", v: 1, seq, ts, url, kind: "text"|"binary", frame }, window.location.origin)`; isolated world filters `event.source === window` and `ns` (spoofing surface is negligible — the only thing an attacker could inject is comment-shaped data, which the pipeline treats as a comment anyway; still validate `ns` + `seq` monotonicity and drop non-monotonic).
- **Guards:** drop-frame counter at >50 frames/sec (flood guard); binary frames passed as `ArrayBuffer` byte-length + base64 only in capture mode; everything behind `CONFIG.SOCKET_TAP: false` default so default builds run nothing.
- **MVP verdict:** all of the above is **deferred work, not MVP work**. It proves nothing about cleanliness and delays the only thing the teacher asked for.

## 4. Q2 — Schema discovery + fixtures (deferred with the socket; minimal contract recorded)

Schema is **Unknown** (JSON / Socket.IO / protobuf / compressed binary — no evidence either way; the capture in `captures/streamyard-live-dom.json` documents DOM only). If pursued later:

- **Workflow:** build a *separate capture-only* variant (SOCKET_TAP=true, frames logged to console → file). Run it in a **private rehearsal room** with a co-host account, never during the teacher's real show. Sanitize before committing: replace handles/PII with synthetic Dari fixtures; frames with any participant identity never enter `test/fixtures/`.
- **Parser contract (pure, Node-testable):**
  - In: one captured frame (string or bytes) + prior session context.
  - Out: `{ type: "comment", comment: { handle, platform, displayText, id?, ts? } } | { type: "ignored" } | { type: "unknown", reason }` — array for batch frames.
  - Malformed/unknown frames **never throw** from the parser; the bridge boundary owns the one spec-allowed try/catch and counts failures.
- **Tested in `npm test`** exactly like the current core: fixtures + assertions in `test/run-tests.js` pattern.
- **MVP verdict:** all deferred. The DOM pipeline already produces the exact comment objects the core consumes (`src/dom.js:137-168`) — no parser is needed to ship the panel.

## 5. Q3 — Event semantics

| Event | Detection | Action | If absent (fail-open) |
|---|---|---|---|
| New comment | DOM mutation (existing, `src/content.js:322-344`) | `processComment` → panel row | Already the proven path; N/A |
| Duplicate delivery | Core dedup (existing) | Fold into count | N/A — handled |
| Deletion / moderation | **Not reliably detectable in DOM mode**: virtualized rows recycle, so absence ≠ deletion | Accept a deleted comment may persist in the panel | Panel may show a comment that was removed natively — low harm (it was still asked); documented limitation, not a code path |
| Edits | MutationObserver already re-fires on `characterData` | Re-extract; existing reprocess path | Edited text shows stale briefly; acceptable |
| Featured/starred state | Native only | Not reflected in panel row (MVP) | No action; teacher sees highlight in native panel |
| Reconnect / SPA re-render | Existing watchdog + `rebuild()` (`src/content.js:290-304`, `349-363`) | Full re-seed from native rows + panel reset | Panel re-derives from what's visible; older history already scrolled out of the virtual scroller is gone for *both* native and panel — inherent to StreamYard, not to us |
| Ordering / backfill | Arrival order only | Append-only panel | If a re-render replays old rows, dedup core collapses re-sends (existing fingerprint adoption logic) |
| Stable comment ids | **Unknown** (capture has none; `captures/streamyard-live-dom.json` documents no id) | Use `platform\0handle\0displayText` fingerprint (already built, `src/content.js:137-138`) | Fingerprint is the fallback and it's already battle-tested against recycling |
| Session/room metadata | Not needed | — | Panel resets on `resetAt` storage event (existing) |

Key scope point: **every row of this table is already handled by v1 code except the panel itself.** Nothing new must be discovered for B.

## 6. Q4 — Feature-proxy

- **Mapping:** custom-panel row → native row via the existing fingerprint `platform\0handle\0displayText` extended with `matchKey` (normalize the displayText so honorific-stripped duplicates still match). Scan `dom.collectCommentNodes(observedContainer)` + `dom.extractComment`, match, take the first connected hit.
- **Click forwarding:** new selector in `SELECTORS` (`featureButton: 'button[data-testid="show-comment-button"]'` — selector strings live only in `config.js`, per invariant) and `button.click()` on the matched native card. Featuring the "wrong" twin row is **harmless**: same text + same handle render identically on broadcast.
- **Virtualized-away fallback:** if no connected native row matches (comment scrolled out of the ~10-row scroller), the panel's feature button renders **disabled** with label «به ستون اصلی بروید» ("use the native panel"). The native panel is never destroyed in B, so the teacher can always find the comment there. UX cost: one toggle (hide panel → native visible) + scroll. Acceptable on air; the teacher mostly features *recent* questions, which are the ones the scroller still holds — validate this assumption in the live session (Section 11).
- **Socket-before-DOM:** N/A in B (DOM is the only source of truth — no such state can exist).
- **Feature-state reflected back:** **defer.** Native highlight rendering in the panel is polish, not MVP.

## 7. Q5 — Failure model

| Failure | Signal | Threshold | Fallback | Teacher sees |
|---|---|---|---|---|
| Comments container missing (dashboard/join screens) | `findCommentContainer` null | Existing poll logic | Nothing rendered; v1 fail-safe | Normal StreamYard UI |
| Panel mount/render throws | exception in `panel.render` | 2 render errors in one session | `PANEL_MODE` self-flips to `"inline"` for the session + one `[Ṣafwa]` warn | The v1 look, live |
| StreamYard re-render kills observer | watchdog (`src/content.js:349`) | 3s check | Existing re-attach + panel reset | Brief native flash, then panel re-seeds |
| LLM down/timeout | existing 8s timeout | existing | Regex decision stands (existing) | Unchanged feed |
| Frame/comment flood | debounce (80ms) + panel row cap (see below) | >300 panel entries | Prune *oldest* rows from DOM only; counts/state stay in memory and remain scrollable up to cap | Long scroll, nothing lost |
| Duplicate rows / virtual scroller holes | — | — | N/A: the panel doesn't fight the virtual scroller at all — the #1 v1 pain disappears by construction | Cleaner than v1 by default |
| Silent bridge | N/A in B (no bridge) | — | — | — |

Worst acceptable outcome is exactly the contract: **"we're back to the v1 look."** The inline path is never deleted from the build, so this is always one boolean away.

## 8. Q6 — MVP vs over-build (the decision this councilor exists to make)

**Smallest winning MVP — ship list:**

1. **`CONFIG.PANEL_MODE: "inline" | "custom"`** in `src/config.js` (default `"inline"` until live-proven) + one `STORAGE_KEYS.panelMode` override so it can be flipped without editing code between rehearsal builds. Nothing added to the popup (out-of-scope rule holds).
2. **`src/panel.js`** (browser-only, ~250–350 lines): a `position:fixed` right-docked overlay appended to `document.documentElement` (outside StreamYard's React root — SPA re-renders can't remove it), with an `attachShadow` root for CSS isolation both ways. Header: title + a one-click "native panel" toggle (the visible rollback switch). Body: append-only list rendered from the *same decisions* `processComment`/`applyLlmOverride` already emit — rows for primary/joined/dimmed, count-badge updates on the original row, duplicates never create a row. All strings from `CONFIG.LABELS` (add panel labels there), RTL.
3. **`src/content.js` branch only:** identical pipeline, identical `llmReview` wiring and guards; the single change is `ui.render(...)` → `panel.render(...)` when mode is custom. Rebuild/reset paths clear the panel. This is ~30 changed lines, not a rewrite.
4. **Feature-proxy v0** per Section 6 (two new selectors, one disabled-state fallback).
5. **Tests:** new `test/panel-model-test.js` in the Node runner asserting the panel entry list over `test/mock-comments.js` streams (order, no hidden question ever, counts, joins, cap behavior) + one browser harness following the existing six (`content-*-test.js` pattern) for the panel overlay safety.
6. **Keep a pinned v1.0.5 unpacked copy** as the instant rollback artifact.

**Defer list (over-build — cut without mercy):**

- Everything socket: tap, patch, bridge, schema discovery, fixtures, parser, hybrid mode. (Sections 3–4 keep the designs so the work isn't lost, but it ships nothing.)
- `chrome.sidePanel`, popup-window host, draggable/resizeable panel, font/size settings, second-monitor mode.
- Feature-state reflection back into the panel; deletion/moderation sync; starring sync.
- Any service worker, offscreen document, DNR, `storage.session`, `storage.sync`.
- Any change to `processComment`, `applyLlmOverride`, normalize, dedup, state — **zero core diffs** is the definition of done for this MVP.

**Flag/rollout story:**

- Default stays `PANEL_MODE: "inline"` (v1 behavior byte-identical).
- Rehearsal build flips to `"custom"`; one **private rehearsal** validates mount, fallback trips, and the feature-proxy.
- **One live session** is the proof window. Flip-the-default evidence, all four required: (a) zero missed questions across the full 1–3h (spot-checker or teacher confirms), (b) zero automatic fallback trips in the `[Ṣafwa]` log, (c) ≥3 successful feature-proxy uses on air, (d) teacher says unprompted that the panel is cleaner than badges. Any miss → default stays `inline`, fix, repeat session.
- Rollback at every layer: config flag (one line), storage override (no rebuild), session auto-fallback (render errors), pinned v1.0.5 (unloaded). No layer requires the teacher to understand anything.

## 9. Invariant #1 decision record

**Decision: REJECT the amendment for this release. Do not edit `CLAUDE.md` now.** The MVP (B) never touches the transport, so invariant #1 remains true of everything that ships. Editing an invariant to permit code we are also deciding *not to build* is the definition of over-build.

Contingency draft, held unapplied — if a future release green-lights socket work, invariant #1 is replaced verbatim with:

> **1. Comments are read from the page's own surfaces only — never an official API.** There is no StreamYard API, webhook, or SDK, and none may be assumed. The DOM pipeline (content script + MutationObserver) is the canonical source and permanent fallback. A page-world WebSocket *observer* (read-only, patched constructor, fail-open to DOM on any anomaly) is permitted as an optional enhancement behind `CONFIG.SOCKET_TAP` and may never delay, block, or replace the DOM pipeline's output. Any change to this requires a live-proven fixture set under `test/fixtures/` and a green `npm test`.

Until that evidence exists, this paragraph stays in the council record, not in `CLAUDE.md`.

## 10. Risks ranked

| # | Risk | L | I | Cheapest mitigation |
|---|---|---|---|---|
| 1 | Building the "wrong clean panel" — teacher dislikes the layout after we build it | M | H | 30-minute design mock (`test/teacher.html`/`popup-designs.html` precedent) shown to the teacher *before* any panel code |
| 2 | StreamYard CSS bleeds into / crushes the overlay (z-index, RTL) | M | M | Shadow DOM root + `all: initial` reset in the shadow; ~20 lines |
| 3 | Panel grows stale rows (deletions undetectable) | M | L | Document as limitation; zero code |
| 4 | Feature-proxy misfires (clipped/hidden native button) | L | M | Disabled-state design + teacher already has native panel; kill switch = remove 2 selectors |
| 5 | Session-length memory bloat (1–3h) | M | M | Reuse v1's slim-record discipline (`src/dedup.js` `collapseOnto`); panel row cap |
| 6 | Scope creep back toward WebSocket mid-build | H | M | Section 9 record + this MVP's "zero core diffs" gate |
| 7 | Continuation joins wrong across a panel rebuild | L | M | `rebuild()` already re-seeds from visible rows; add one panel test for it |

## 11. What this brief missed / open questions

1. **Does the teacher feature mostly recent comments?** Determines whether feature-proxy v0's "disabled when scrolled out" fallback ever bites. *Cheapest experiment: ask the teacher, then count in the rehearsal log.*
2. **Screen real estate:** does the teacher want native panel + panel visible simultaneously? *Cheapest experiment: the design mock in Risk 1 with two layout variants — 10 minutes of the teacher's time, no code.*
3. **Does the comments panel survive SPA navigation with history intact?** Affects how often `rebuild()` churns the panel. *Cheapest experiment: next live session's existing watchdog logs — no new instrumentation.*
4. **Native deletion behavior** (does a moderated comment vanish from the DOM or just gray out?) — grounds Section 5's deletion row in fact. *Cheapest experiment: rehearsal room, delete one comment, screenshot.*
5. **The one de-risking move for the entire v2 debate:** run `test/replay.html` with a static mock of the proposed panel rendered over the replayed decisions and screenshot it. This resolves Risk 1 and open question 2 *before* a single line of panel.js is written — the cheapest possible experiment in this whole brief, and the one I'd run first.
