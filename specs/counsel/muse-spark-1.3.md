# Ṣafwa v2 Counsel — Red-Team (against A)

## 1. Executive verdict

**Ship B: DOM observer + custom panel. Reject A (WebSocket capture) for v2.** The DOM is the rendered truth the teacher already reads; the socket is an unmapped, unversioned upstream that buys no identity advantage (no stable id is documented) while adding a MAIN-world patch, a bridge, a parser, and a second divergence surface — all in front of a live, non-technical operator. Confidence: high that A costs more and risks more than B for zero proven gain.

## 2. Verdict table

| Item | Verdict | One-line reason |
|---|---|---|
| A — WebSocket capture + custom panel | **Reject** (for v2) | Unmapped schema + MAIN-world fragility + divergence risk; solves nothing the DOM doesn't already solve |
| B — DOM observer + custom panel | **Adopt** | Reuses proven `dom.extractComment`, fingerprinting, watchdog, pipeline; only swaps the render target |
| C — Hybrid (socket primary, DOM fallback) | **Reject** (for v2; revisit only on evidence) | Two transports = two failure modes + reconciliation bugs during a live show |
| D — Keep in-place, polish further | **Adapt** (as the permanent fallback) | Keep v1 look as the fail-open path behind a flag, not the product |
| Panel host: in-page docked panel | **Adopt** | Short feature-proxy distance, no new permissions, survives with existing watchdog |
| Panel host: `chrome.sidePanel` | **Reject** (for v2) | Can't touch page DOM; forces service worker + messaging for zero on-air benefit |
| Panel host: separate popup window | **Reject** | Loses context on one screen; worst option for a solo teacher on air |
| Service worker | **Reject** (for v2) | Content-script-only model works; SW sleep/wake risks message loss mid-show |
| Offscreen document | **Reject** | No audio/canvas/clipboard need; pure overhead |
| Declarative Net Request | **Reject** | We never modify requests; irrelevant |
| `storage.session` for matching state | **Reject** | State belongs in the content closure (per-tab, memory-only, already correct); session storage adds async races |
| `storage.sync` | **Reject** | Settings are local-only; sync adds quota/sync-delay failure modes |
| Gemini `messaging-bus` / `storage-adapter` abstractions | **Reject** | No cross-component messaging exists yet; abstraction before need |

## 3. Q1 — Capture mechanics

This is the design I am arguing *against*, specified precisely so the cost is visible.

To intercept the page's socket from MV3 you need a **MAIN-world** script — the isolated world (`src/content.js` today) cannot see the page's `WebSocket` objects.

- New file: `src/bridge-main.js` (MAIN world, no `chrome.*`, no imports).
- Manifest diff sketch (new entry alongside the existing isolated content script):
```json
{ "matches": ["https://streamyard.com/*","https://*.streamyard.com/*"],
  "js": ["src/bridge-main.js"], "run_at": "document_start",
  "world": "MAIN", "all_frames": false }
```
- `bridge-main.js` behavior: on load, save `window.WebSocket`, replace with a subclass/wrapper that wraps every instance: hooks `message`/`addEventListener('message')` and `onmessage` setter, plus `send` for correlation. Must handle sockets constructed *before* injection (missed — unfixable race), reconnects (caught automatically since all constructions go through the patched constructor), and page overwrites of `WebSocket` (re-patch via interval or give up and signal fallback).
- Why each alternative injection is worse: `chrome.scripting.executeScript({world:'MAIN'})` needs the `scripting` permission and an active-tab/service-worker trigger — wrong lifecycle for a patch that must win a race at `document_start`. Script-tag injection (`<script src=chrome-extension://…>`) is subject to the page's CSP and exposes extension URL surface; manifest-declared MAIN script is the only sane vehicle — and even it can lose the race on SPA soft-navigations.
- Bridge to isolated world: `bridge-main.js` → `window.postMessage({source:'SAFWA', v:1, dir, url, tWall, payload}, location.origin)`; isolated listener in `content.js` validates `event.source===window`, `data.source==='SAFWA'`, origin, version, drops anything else (spoofing/tamper: any page script can emit these events — treat frames as untrusted input, never as commands). Size/rate limits: truncate payloads (e.g. 16 KB), drop non-JSON/binary fast, token-bucket (e.g. 20 frames/s sustained, burst 50, then shed with counter) so a frame flood can't jank the studio.
- Net new code for A: MAIN script + bridge validation + parser + reconciliation + health/fallback state machine. B needs none of it.

## 4. Q2 — Schema discovery + fixtures

StreamYard's transport is **unknown**. Candidates: plain JSON over WS, Socket.IO (engine.io framing), GraphQL subscriptions, protobuf/binary. Do not guess — measure, with a logger that never ships:

1. Flag-gated passive logger build (`SAFWA_SNIFF=1`, local console + download button only, never in the store build): logs `url`, `dir`, `size`, first 256 chars / content-type sniff, **never** full payloads by default.
2. One live session of capture. Operator downloads locally.
3. Offline redaction script: drop avatar URLs, ids, emails; replace handles with `H1…Hn` + `foldHandle()` form; keep Persian text shape (needed for parser tests) but strip anything identifying. Nothing raw is committed — only redacted fixtures under `test/fixtures/socket-*.json` (inert, parser-only; runtime never imports fixtures).
4. Parser contract (pure, Node-testable, new file `src/socket-parse.js` if A were built):
```js
parseSocketFrame(raw: string|ArrayBuffer) -> Array<{handle, platform, displayText, timestamp, transportId?}> | null
```
`null` = not-a-comment frame (presence, ping, history-ack). Malformed/unknown → return `[]` or `null`, increment a counter, **never throw**. Comment objects must be field-identical to `dom.extractComment` output minus `el/cardEl` so `grouping.processComment` is untouched (constraint 2).
5. `npm test` gains parser unit tests: known-good fixture → comments; garbage/binary/empty → null without throwing; schema-variant → null + counter bump.

My point: this entire workstream exists only to re-derive what `src/dom.js` (169 lines, live-verified) already yields. That is the red-team cost exhibit.

## 5. Q3 — Event semantics

| Event | How to detect | Action | If absent → fail-open |
|---|---|---|---|
| New comment | WS frame w/ text+author, or DOM row (B) | `processComment` → render | N/A (primary path) |
| Delete / moderation removal | WS delete frame, or DOM row removed | Mark row "removed" in custom panel; release signature hold if it was the representative | If undetectable: stale row stays — acceptable; never auto-delete on timeout |
| Featured/starred state | Native button state change; no socket field known | Reflect as "on air" tick in custom panel via DOM observation only | Don't fake it: absent = no reflection, proxy still works |
| Edit | Unknown in either transport | Treat edited text as new arrival from same handle (runs pipeline) | Same as new — safe direction |
| Reconnect / backfill burst | Socket burst with old timestamps, or watchdog re-attach (B) | B: existing `rebuild()` path in `src/content.js:290` re-seeds; dedup by fingerprint | Cap re-seed (e.g. current DOM only); never replay hours of history into counts |
| Ordering / replay / duplicate delivery | Out-of-order timestamps; same fingerprint twice | Fingerprint (`platform\0handle\0displayText`, `content.js:137`) dedups; `liveByFingerprint` adoption handles recycling | Unknown ts → `Date.now()` at arrival (matches current `dom.js:165` semantics) |
| Platform metadata | `alt="Youtube"` img today (`dom.js:97`) | Socket must supply equivalent string or platform is `null` (identity degrades to handle-only — cross-platform doubles) | `null` platform is legal today; same handling |
| Stable comment id | **Unknown in both transports** | If found: map custom row → native row by id | Absent: fingerprint mapping (Q4) — which B already implements |
| Session/room metadata | Unknown | Ignore; matching state is per-tab memory by design | N/A |

The killer row is the last two: A promises cleaner identity/ordering but **no evidence shows the socket carries stable ids or server timestamps**. Without them, A inherits every heuristic B uses, plus parser risk.

## 6. Q4 — Feature-proxy

The teacher's #1 native action is `button[data-testid="show-comment-button"]` inside the native row. A custom panel must proxy to it. Design (same for A or B — another reason A buys nothing):

- Mapping: custom row stores `{fingerprint, transportId?}`. Resolution order: (1) stable id if ever discovered; (2) else live DOM scan for `platform::foldHandle(handle)::matchKey` match via `dom.collectCommentNodes` + `extractComment` (no new selectors except the already-known show-button, which belongs in `SELECTORS` per the two-file rule).
- Click forwarding: `nativeRow.querySelector(SELECTORS.showButton).click()` from the isolated world — no MAIN-world needed, no synthetic-event spoofing.
- Virtualized-away case (native row not in DOM): do **not** auto-scroll the teacher's native panel mid-show (destroys reading position). Instead: custom row shows "پیدا کردن در ستون" (locate) state; on teacher tap, flash-highlight the native row after a programmatic scroll, teacher presses the native show button themselves. Exact UX cost: one extra tap, only when the row has scrolled out — rare because featuring happens for visible/recent questions.
- Edge cases: two native rows share a fingerprint (verbatim re-send) → proxy targets the first connected row and shows the count badge; socket-before-DOM (A-only race) → pending-feature queue with 10 s expiry, then "not found, kept visible" state; feature-state reflection → DOM-observed only (if the button gains an aria-pressed/active class, mirror a tick; else omit — never invent state).

## 7. Q5 — Failure model

| Failure | Signal | Threshold → fallback | Teacher sees |
|---|---|---|---|
| MAIN patch blocked/overwritten (A-only) | Heartbeat: frames seen in last N s while DOM rows arrive | DOM rows arrive, 0 frames for 15 s → socket dead | Silent auto-fallback; panel keeps working (B path) |
| Socket absent (transport is SSE/polling, not WS) | No WS to the expected host at all | After 1 session of sniffing with zero comment frames → kill A | Nothing; decision is pre-ship |
| Schema changed mid-show (A-only) | Parse-error rate | >5% of frames unparseable over 60 s → socket untrusted | One `[Ṣafwa]` console warn; custom panel re-seeds from DOM |
| Bridge silent (postMessage dropped/flooded) | Sequence-gap counter | Gap >50 or silence >15 s with DOM activity → bridge dead | Same silent fallback |
| Frame flood | Token bucket shedding | Shed + counter; if sustained 60 s → drop socket for session | Panel stays live on DOM; console note |
| Worker/LLM down | Fetch timeout 8 s (`config.js:166`) | Already handled: regex decision stands | Dimmed-but-visible rows (current v1 semantics) |
| Selectors stale (B's only hard failure) | `findCommentContainer` null / `extractComment` null | Existing fail-safe (`dom.js:47`, `content.js:115`): do nothing visible + one warn | Native feed untouched — the worst acceptable outcome, already built |

A adds four failure rows (patch, schema, bridge, flood) that B simply does not have. C keeps all of them *plus* reconciliation.

## 8. Q6 — MVP vs over-build

**Smallest winning MVP (one live session, shippable): B + in-page panel + feature-proxy.**

Ship list:
1. `CONFIG.COMMENT_SOURCE="dom"` (default; `"websocket"` key reserved but unused — no dead code paths).
2. New `src/panel.js`: read-only custom panel docked beside the native comments (in-page `aside` sibling; CSS only; no new permissions). Renders from the **same** decisions `grouping.processComment` already returns — swap `ui.render` target from in-place badges to panel rows, keep in-place code as the fallback renderer.
3. Feature-proxy (Q4) + "locate" fallback state; show-button selector added to `SELECTORS` in `src/config.js` only.
4. Panel parity: RTL, `CONFIG.LABELS` strings only, count badges, joined/extra/dim states, popup toggles + reset already work (they drive CONFIG, transport-agnostic).
5. Tests: panel render tests on `test/mock-comments.js` streams (counts/grouping identical to in-place); keep `npm test` green.

Defer list: everything socket (MAIN script, bridge, parser, fixtures pipeline), service worker, side panel, offscreen, DNR, `storage.session/sync`, any matching-core change, any new popup knob.

Flag/rollback: `CONFIG.PANEL="custom"|"inplace"`, default `"custom"` only after the live session; rollback is one toggle to the current v1 look with zero data loss (state shape unchanged). Flip-the-default evidence: (a) zero missed comments custom-vs-native count over ≥1 h live; (b) featuring succeeds first-tap ≥95% of attempts; (c) teacher says the panel is cleaner — the actual complaint.

## 9. Invariant #1 decision record

**Amend (narrowly), do not repeal.** The invariant's intent — *no dependency on unofficial access* — survives; DOM observation stays the supported path. Proposed replacement wording for `CLAUDE.md`:

> 1. **There is no StreamYard API.** Comments are read from the page DOM via a content script and a MutationObserver. Do not add code that assumes an API, webhook, or SDK exists, and do not ship transport interception (e.g. WebSocket patching) as a runtime dependency. Passive, local-only traffic observation for diagnosis is allowed; anything that parses page transport must remain a dev-time tool, never the live path, unless a later decision record promotes it after live evidence.

## 10. Risks ranked

1. **Custom panel loses featuring on air (med × catastrophic)** → cheapest mitigation: Q4 proxy + locate-fallback; live-test featuring explicitly (it was *not* tested last run, §2.7).
2. **Socket/DOM divergence shows teacher a wrong feed (med × high)** → mitigation: don't build A; DOM *is* the feed.
3. **Second render path doubles UI bugs (high × med)** → mitigation: B reuses decisions verbatim; panel is a dumb view of `processComment` output.
4. **Schema churn silently blinds A (high × high)** → mitigation: reject A; DOM selectors already have warn-once fail-safe.
5. **CWS review friction from MAIN-world interception (low × high)** → mitigation: no MAIN world in the shipping build.
6. **Same-person paraphrase still mis-hidden (known v1 bug, §2.7) survives the move** → mitigation: unchanged `applyLlmOverride` semantics; panel shows pre-confirmation dim state, never pre-hides.

## 11. What this brief missed / open questions

- **Where exactly should the in-page panel dock?** StreamYard's right-rail width is fixed; a docked panel may squeeze the video. Cheapest experiment: 30-minute dry run with a static mock panel (no logic) in the studio, screenshot at 3 widths.
- **Does the teacher need the native panel visible at all?** If featuring works by proxy, native could collapse — but collapsing may pause its virtual scroller (starving B's DOM source). Cheapest experiment: collapse native panel live for 5 min, watch `MutationObserver` event rate.
- **Is there a stable comment id anywhere (React key, data-attr, socket)?** Cheapest experiment: DevTools `$0` key inspection + one sniff-session frame dump — one hour, settles Q4 mapping forever.
- **What evidence would change my mind on A:** measured DOM miss rate >0 (comments in socket never rendered) across ≥2 sessions, or a stable id + server timestamp in socket frames with schema unchanged across ≥4 weeks. Absent that, A is cost without benefit.
