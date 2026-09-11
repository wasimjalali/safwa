# Ṣafwa v2 Counsel — Councilor 4 (Qwen3.8-Max, xhigh) · Lens: testability, maintainability, rollout

Grounding: read `CLAUDE.md`, `specs/websocket-counsel-brief.md`, `manifest.json`, `package.json:8` (test chain), `src/config.js`, `src/content.js`, `src/dom.js`, `src/grouping.js`, `src/ui.js`, `test/run-tests.js`, `test/content-retry-test.js`, `test/ui-safety-test.js`, `captures/streamyard-live-dom.json`, `qa-screenshots/live-2026-09-10-cli/REPORT.md`.

---

## 1. Executive verdict

The teacher's complaint is **presentation** ("in-place badges are not clean enough", brief §2.7), and the fix for presentation needs zero new transport: render the existing, live-proven `processComment` decisions into a `chrome.sidePanel` panel fed by the existing DOM pipeline (Option B), with v1 in-place annotation kept underneath as an automatic, health-monitor-driven fallback. Ship a **passive, log-only WebSocket capture instrument** in the same build — it costs little, answers every schema unknown with evidence instead of inference, and is the only honest road to Option C later; reject Option A as a first build because it makes an unmapped schema a single point of failure for the one unforgivable bug (losing a question). Every new module is either pure (Node-tested in `npm test`) or a thin shell covered by the existing fake-globals harness pattern (`test/content-retry-test.js`). Confidence: **high** on sequencing, rollout, and testability; **explicitly unknown** on StreamYard's transport (gated, not guessed).

## 2. Verdict table

| Item | Verdict | One-line reason |
|---|---|---|
| A — WebSocket capture + custom panel | **Adapt** | Wrong as-built (unknown schema = single point of failure); ship as log-only instrument, promote only on fixture evidence |
| B — DOM observer + custom panel | **Adopt** | Fixes the actual complaint with the proven pipeline (`dom.extractComment` → `processComment`, grouping.js:263); only the render target changes |
| C — Hybrid (WS primary, DOM fallback) | **Adapt** | Correct *destination*, reached through B + promotion gates (Q6), never built directly |
| D — In-place polish as the v2 answer | **Reject** | Doesn't fix the complaint (virtual-scroller ceiling, §2.5); survives only as the automatic runtime fallback via the `RENDER_MODE` interlock (Q5) |
| Panel host: in-page injected panel | **Reject** | CSS/z-index arms race with a SPA that redeploys without notice; squeezes or occludes the native panel that fail-open requires to stay visible |
| Panel host: `chrome.sidePanel` | **Adopt** | Extension-origin document: cannot be occluded or killed by StreamYard, survives SPA teardown, standalone testable surface; costs one permission + one open-gesture |
| Panel host: separate window (`chrome.windows`) | **Reject** (MVP) | Single-laptop teacher assumed; revisit only if the dual-monitor open question (§11) answers yes |
| Service worker | **Reject** | No responsibility needs it; MV3 SW is non-persistent and risks mid-show message loss; `runtime.sendMessage` (content→panel) + `tabs.sendMessage` (panel→content) suffice with zero new permissions |
| Offscreen document | **Reject** | No background DOM need; an offscreen doc's sockets would be *its own*, never the page's — category error |
| Declarative Net Request | **Reject** | DNR cannot see WebSocket frame payloads and we modify no requests |
| `storage.session` for matching state | **Reject** | `processComment` is synchronous; async storage in the hot path adds races and untestable interleavings; the content-script closure (content.js:125) is already correct per-tab |
| `storage.sync` | **Reject** | One operator, one machine; sync adds quota/conflict failure modes for nothing |
| Gemini `messaging-bus`/`storage-adapter` abstractions | **Reject** | Abstraction before need; two message shapes and `chrome.storage.local` (config.js:258) are the whole bus |

## 3. Q1 — Capture mechanics

**Mechanism: manifest-declared MAIN-world content script at `document_start`.** Not `chrome.scripting.executeScript` (needs the `scripting` permission, a service worker, and loses the document_start race), not script-tag injection (subject to StreamYard's page CSP, which is unknown).

Manifest diff sketch (alongside the existing entry, manifest.json:28–35):

```json
{
  "matches": ["https://streamyard.com/*", "https://*.streamyard.com/*"],
  "js": ["src/ws-hook.js"],
  "run_at": "document_start",
  "world": "MAIN",
  "all_frames": false
}
```

Requires Chrome 111+ (`world` key); no new permissions for capture itself.

**`src/ws-hook.js` (MAIN world; no `chrome.*`, no imports, logic-minimal by design):**
1. Keep `Native = window.WebSocket`; install `window.WebSocket = new Proxy(Native, { construct })`. In the `construct` trap: `const sock = Reflect.construct(Native, args)`, register it in a module-level `Set` (reconnects and late sockets captured for free — every socket goes through the constructor), attach passive `message`/`open`/`close`/`error` listeners, return the real instance untouched. Returning the real object preserves `instanceof`, `prototype`, and statics — the page cannot distinguish us by identity checks short of `window.WebSocket !== Native`, covered by the watchdog below.
2. **Hard non-goals, enforced in review:** never wrap `send`, never call `send`, never wrap `WebSocket.prototype` methods, never hold or alter a frame, never open our own connection. Read-only by construction.
3. **Batching:** frames accumulate; one `window.postMessage` per 50 ms (≤200 items/batch; frames >64 KB dropped with a counter; binary frames recorded as `{binary:true, byteLength}` only). Adds ≤50 ms latency, keeps page-main-thread cost near zero.
4. **Heartbeat:** every 5 s while any socket is registered: `{type:"heartbeat", sockets:n}`.
5. **Patch watchdog:** every 2 s, if `window.WebSocket !== Patched`, reinstall once and emit `hook-status: "reinstalled"`; second failure emits `"lost"` and stops trying.
6. **URL redaction at the hook:** send origin+pathname only; strip query (auth tokens commonly ride there).

**Bridge envelope** (the only contract between worlds):

```json
{ "__safwa": 1, "v": 1, "type": "frames" | "lifecycle" | "heartbeat" | "hook-status",
  "socketId": 2, "url": "wss://…/path", "t": 1757000000000,
  "items": [ { "kind": "text", "data": "…", "t": 1757000000000 } ] }
```

**`src/ws-listener.js` (ISOLATED world):** `window` message listener; accept only `event.source === window`, matching origin, `__safwa === 1`, `v === 1`; everything else dropped silently. **Trust model:** any page script can spoof these envelopes, so envelope payloads are *untrusted data, never commands* — they flow only into the pure parser (Q2); the parser emits comment/control records or `malformed`, never URLs, never selectors, nothing executed. Spoofing therefore grants the page no power it doesn't already have (it can already fake DOM comments).

**Survival:** SPA soft-navigation keeps the JS context → patch persists (capture confirms `spaNavigationObserved: true`); hard reload re-runs `document_start`. **Hard limit, not a bug:** a socket created before injection, or owned by a Web Worker/SharedWorker, is uncapturable — the parity monitor (Q5) detects it and the system simply never promotes.

**File map:** `src/ws-hook.js` (MAIN, dumb tee) · `src/ws-listener.js` (ISOLATED, validation+gating on `CONFIG.WS_CAPTURE`) · `src/ws-parser.js` (pure) · `src/transport-health.js` (pure). The flag lives **only** in config.js: the hook is always passive; when `WS_CAPTURE === "off"` the isolated side drops envelopes immediately — one flag location, zero MAIN-world flag drift.

## 4. Q2 — Schema discovery + fixtures

**What the transport is: unknown.** The repo has zero socket evidence (`captures/streamyard-live-dom.json` is DOM-only). Plausible candidates: plain JSON over WS, Socket.IO/engine.io string framing, protobuf/binary, GraphQL subscriptions — or **no page-owned WebSocket at all** (SSE, fetch-stream, Worker-owned). I will not guess; the workflow measures:

0. **Pre-build, 5 minutes, zero code:** DevTools → Network → WS filter on a live studio. Does a page-owned WebSocket exist? If no → Option A is dead, the invariant amendment (§9) is void, and the rest of Q2 is moot. *This is the cheapest experiment in the entire brief and it gates everything.*
1. **Log-only capture build** (`WS_CAPTURE:"log"`, `COMMENT_SOURCE:"dom"` — zero behavior change): during one rehearsal broadcast, `ws-listener` keeps a bounded raw ring (last 5,000 envelopes) plus a shape histogram (JSON key paths → value types, frame counts/sizes), dumped via an isolated-world console function and mirrored to a `data-safwa-ws-stats` attribute (same instrumentation pattern the QA run used, REPORT.md §Instrumentation). Nothing raw is committed.
2. **Redaction tool** `test/tools/redact-ws-capture.js`: handles → `@H1…@Hn` (in `foldHandle`-stable form), comment text → synthetic Persian drawn from the `test/mock-comments.js` pool preserving token count and length (parser tests need realistic Perso-Arabic shape), drop query strings/tokens/user-ids/URLs, timestamps → relative offsets. Output: inert `test/fixtures/ws-frame-*.json` / `ws-session-*.jsonl`. Runtime code never imports fixtures (mirrors the `captures/` rule).
3. **Parser contract** — `src/ws-parser.js`, pure, Node-importable:

```
parseWsEnvelope(envelope, ctx) -> {
  events:  [ {kind:"comment", comment:{handle, platform, displayText, id|null, sourceTs|null}}
           | {kind:"control", control:"delete"|"feature"|"star", id?}
           | {kind:"backfill-start"|"backfill-end"}
           | {kind:"lifecycle", event:"open"|"close"|"error"} ],
  ignored: n,   // heartbeats, presence, unknown shapes — with reason codes
  malformed: n  // unparseable/truncated — with reason codes
}
```

   Rules: **never throws** (any input yields a result object); unknown shapes → `ignored`, never heuristically reinterpreted; `ctx` carries the platform fold so socket-derived and DOM-derived comments produce **identical `identityKey`s** (see Q3 platform row). Output comments are field-identical to `dom.extractComment` minus `el/cardEl` (dom.js:161–168), so `processComment` is untouched (constraint §2.9.2).
4. **Tests** — `test/ws-parser-test.js` joins the `npm test` chain (package.json:8): known fixtures → expected events; garbage/binary/truncated → `malformed` counter, no throw; **cross-source identity parity**: `identityKey(parseWsEnvelope(f).events[0].comment) === identityKey(domFixtureComment)`; backfill burst detection. **Gate:** `COMMENT_SOURCE:"websocket"` becomes selectable only after the parser is green on ≥1 full-session fixture set — promotion is a tested code change, never a config flip in the field.

## 5. Q3 — Event semantics

| Event | Detection | Action | Fail-open if absent |
|---|---|---|---|
| New comment | `kind:"comment"` from parser, or DOM extraction | Feed `processComment` — **exactly one source feeds the core per session** (arbitration, Q5); double-feed inflates counts | DOM is the default source; nothing to fail open from |
| Delete / moderation | Socket `control:"delete"` (+id) **only** — DOM removal is indistinguishable from virtual-scroller recycling (content.js:140–151 proves rows are recycled legitimately), so the DOM path must never infer deletion | Remove/strike panel row by id; release signature hold if it was the representative | Row stays in panel until session reset. Stale-visible beats wrongly-vanished; log `ignored:no-delete-events` once per session |
| Featured / starred state | Unknown in both transports until capture; candidates: socket control frame, or a state attribute on `button[data-testid="show-comment-button"]` (captures §rowControls) | Reflect an «در پخش» marker on the panel row | No marker; optimistic marker after our own proxy click only. Never invent state |
| Edit | Socket `control:"update"` with stable id | Replace text by id in place; **never re-run the pipeline** (a re-run could double-count as extra) | Stale text stays; harmless |
| Reconnect / backfill | `lifecycle:close→open` + burst heuristic (>20 frames in <200 ms) or `sourceTs` older than session start; parser emits `backfill-start/end` | Tag frames `backfill`; dedupe by id, else by fingerprint against `recentKeys`; **suppress count increments** during backfill (a replayed comment must not raise N); skip LLM review for backfilled items (they are history) | Without burst/id detection the worst case is LLM volume + inflated counts — the burst rule alone covers the common case |
| Ordering / replay / duplicate delivery | Bridge assigns a per-session monotonic sequence; ids if the schema has them | Panel appends in sequence order; id → idempotent ingest; no id → existing fingerprint + double-send guard (grouping.js) | Arrival order, exactly as v1 (`timestamp: Date.now()`, dom.js:165) |
| Platform metadata | Socket field (unknown name/casing) | **Normalize through one fold in `ws-parser.js`** so `"Youtube"`/`"youtube"` yield the same `identityKey` as DOM extraction (`alt="Youtube"` lowercased, dom.js:97–107). A casing mismatch across sources silently merges/splits identities on failover — the parity fixture test (Q2.4) is the guard | Missing platform → `null`, which v1 already treats as legal; document that `null` platform weakens per-person identity to handle-only |
| Stable comment id | Explicit field in frame, stable across reconnect | Use for ingest idempotency, delete/edit targeting, and panel↔native mapping upgrade | Fingerprint mapping (Q4) — **no id, no WS promotion** (a fingerprint is not an id) |
| Session / room metadata | Room/broadcast id in socket URL or payload | On room change → existing `rebuild("room-change")` path (content.js:290); reject stale frames from a previous route | Content-script lifetime is already per-tab/per-page; reload rebuilds. Acceptable |

## 6. Q4 — Feature-proxy

**Mechanism.** The panel never touches the DOM or the socket to feature. Click → `chrome.tabs.sendMessage({type:"safwa-feature", fingerprint})` → content script (the only context with DOM access) → resolve row → click the real native button.

**Mapping — reuse what exists.** `content.js` already maintains `liveByFingerprint: Map<platform\0handle\0displayText → liveNode>` (content.js:131, 229–231), kept fresh across recycling by `retargetDecision` (content.js:154). That map *is* the custom-row → native-row mapping; no new identity scheme. Resolution order at click time: (1) `liveByFingerprint` hit that passes `isLiveHolder`; (2) one cheap re-scan — `dom.collectCommentNodes(container)` + fingerprint recompute (covers a row remounted into a new node since the last flush); (3) fail with `{ok:false, reason:"not-mounted"}`. If a stable socket id is ever confirmed, it upgrades the map key internally — the panel protocol is unchanged.

**Click.** `row.querySelector(SELECTORS.showCommentButton).click()` — the selector (`button[data-testid="show-comment-button"]`, captures §rowControls) is added to `SELECTORS` in `src/config.js` and the lookup helper lives in `src/dom.js`, preserving the two-file invariant. `scrollIntoView({block:"nearest"})` first so a mounted-but-offscreen row clicks correctly.

**Virtualized-away fallback.** If both lookups miss: panel shows the hint «در ستون اصلی پیدا کنید» (LABELS key) and leaves the native panel — always visible beside the side panel — as the manual path. Exact UX cost: the teacher visually scans ≤10 mounted native rows and clicks the native button, ~5–15 s on air. The cost is bounded by reality: the virtual scroller keeps *recent* rows mounted, and featuring is overwhelmingly for recent questions; the miss case is an old comment. **Rejected alternative:** programmatically scrolling the native scroller to hunt the row — we don't know StreamYard's scroll internals, guessing them violates the two-file rule's spirit, and yanking the teacher's reading position mid-show is worse than the hint.

**Edge cases.**
- *Same fingerprint in two native rows* (verbatim double-send): map holds one live holder; featuring either puts identical content on air — accepted, documented.
- *Socket shows a comment the DOM hasn't rendered* (WS-promoted mode only): feature request enters a pending queue keyed by fingerprint; content.js emits `anchor-available` when the DOM row arrives (it already sees every arrival); retry once, expire after 10 s → hint state. A WS-only comment the DOM never renders gets passive display (teacher reads it aloud — featuring was always secondary).
- *Feature state reflected back*: deferred to capture evidence (Q3 row); MVP shows an optimistic «در پخش» marker on `ok:true` only.
- *Native featuring itself is still human-untested* (REPORT.md scenario 9: NOT TESTED). We are about to automate that exact click — **one rehearsal click by the teacher is a prerequisite** for shipping the proxy.

## 7. Q5 — Failure model (primary lens)

**Structural guarantee first:** in the shipping MVP the DOM pipeline *never stops running*. WS is shadow/instrumentation; promotion (C) keeps DOM in shadow mode for parity + anchor mapping. Failover is therefore a **relabeling, not a rebuild** — no comment can be lost *by* failover, because the losing path was never load-bearing.

**Health monitor — pure module, fake-clock tested.** `src/transport-health.js`: `createHealthMonitor(config, {now})` → `record(event, now)` → `null | {action:"demote", reason}`. Injected clock ⇒ deterministic Node tests (`test/transport-health-test.js`) for every threshold, for one-way demotion (no flapping), and for window expiry. Events: `frame-ok`, `parse-error`, `unknown-frame`, `dom-comment`, `socket-comment`, `patch-lost`, `socket-open/close`, `heartbeat-miss`, `flood`.

| Failure | Signal | Threshold → fallback | Teacher sees |
|---|---|---|---|
| Patch blocked/overwritten by page | `hook-status:"lost"`; or sockets observed in DevTools but zero `open` envelopes | 2 lost/reinstalled within 5 s → **demote** (one-way for the page session) | Nothing; one `[Ṣafwa]` console warn |
| Socket absent (SSE/fetch/Worker-owned) | DOM comments arriving, zero correlated socket frames | 15 s after first live DOM comment → never promote | Nothing (default is already DOM) |
| Schema changed mid-show | `parse-error` rate | ≥5 errors in 30 s, or >20% of a ≥10-frame window → demote | Panel banner «منبع: ستون اصلی»; feed continues |
| Silent schema drift (parses, but wrong) | `unknown-frame` ratio + DOM parity | >50% unknown over 60 s (≥10 frames) **and** ≥1 unmatched DOM comment → demote | Same banner; no data loss (DOM kept parity) |
| **Lost-question canary** (the one that matters) | After WS promotion: DOM comment with no socket counterpart | **2 consecutive unmatched within 3 s of arrival → demote** | Banner; identical panel content (shadow DOM kept state warm) |
| Bridge silent (postMessage dropped) | Heartbeat missing while `sockets > 0` | No heartbeat for 10 s → demote | Banner |
| Frame flood | Hook-side counters | Hook caps at 200 items/50 ms, drops >64 KB (Q1); listener counts-only mode at >200 fps for 2 s; parity break → demote | Nothing |
| Panel stale (side panel alive, content script dead/tab navigated) | Panel tracks last-message age | >10 s → panel banner «اتصال قطع است — ستون اصلی را ببینید» + auto re-enable v1 annotations (below) | Native panel + v1 badges — the literal "back to the v1 look" |
| Worker/LLM down | Existing 8 s timeout (config.js:166) | Unchanged v1: regex decision stands | Dimmed-but-visible rows, exactly as today |

**The RENDER_MODE interlock (teacher-visible failover, automated).** `CONFIG.RENDER_MODE = "annotate" | "panel" | "both"`. Health monitor drives `html.safwa-panel-degraded`; `styles.css` re-enables v1 annotations whenever that class is present, and the panel shows the source/staleness banner. Worst acceptable outcome — "we're back to the v1 look" — is a CSS class flip on machinery already running underneath, with no teacher action and no reload. All banner strings are new `CONFIG.LABELS` keys (Dari, RTL).

**Maintainability rules for the failure path:** demote is one-way per page session (re-arm only on reload — no flapping, no mid-show oscillation to test); every threshold is a config constant in one block; every demote logs exactly one `[Ṣafwa]` line with the reason code (the harness pattern asserts on these strings already, e.g. content-retry-test.js:87).

## 8. Q6 — MVP vs over-build (primary lens)

**Smallest winning MVP — provable in one live session:**

1. **Side panel** `panel/panel.html|css|js` rendering a **pure view-model**: `src/panel-model.js` maps decision lists → row VMs `{fingerprint, displayText, handle, platform, count, state, labelKeys}`. Node-tested against `test/mock-comments.js` STREAMS: same fixtures must yield the same counts/states `run-tests.js` already asserts — panel correctness is proven without a browser.
2. **Messaging, stateless-resync:** content.js broadcasts decision deltas via `runtime.sendMessage` (fire-and-forget, `lastError` swallowed — closed panel is not an error); panel on open requests `{type:"safwa-snapshot"}` and content replies with the full model. Snapshot-resync makes panel reopen/crash recovery trivial and testable; no long-lived connection, no service worker.
3. **Feature proxy** (Q4) + `SELECTORS.showCommentButton`.
4. **Passive WS instrument** (Q1–Q2) in log-only mode: `WS_CAPTURE:"log"`, `COMMENT_SOURCE:"dom"`. Goal of session 1: one sanitized capture.
5. **Flags** (engineer-editable constants; **no new popup knobs** — invariant §3): `COMMENT_SOURCE:"dom"`, `RENDER_MODE:"both"` for session 1 (panel + v1 badges side by side = evidence collection at zero risk), `WS_CAPTURE:"log"`.
6. **Tests** — every new module gets a vehicle, core untouched:

| Module | World | Purity | Test vehicle (joins package.json:8 chain) |
|---|---|---|---|
| `src/ws-parser.js` | — | pure | `test/ws-parser-test.js` + `ws-*` fixtures |
| `src/transport-health.js` | — | pure (clock injected) | `test/transport-health-test.js`, fake clock |
| `src/panel-model.js` | — | pure | `test/panel-model-test.js` on mock STREAMS |
| `src/ws-hook.js` | MAIN | shell | `test/ws-hook-harness.js` — fake `window`/`WebSocket`/`postMessage`, same fake-globals pattern as content-retry-test.js |
| `src/ws-listener.js` | ISOLATED | shell + pure validator | `test/ws-listener-test.js` — spoofed/malformed/oversized envelope rejection |
| content.js additions (proxy, snapshot, broadcast) | ISOLATED | shell | `test/content-feature-proxy-test.js` — fake `liveByFingerprint` map |
| `normalize/dedup/grouping/state` | — | pure | **untouched; the 86 assertions stay byte-identical — that is the regression gate** |

**Defer:** WS promotion/source arbitration beyond the monitor (C), delete/edit/feature-state reflection, id-based mapping, backfill replay beyond burst tagging, service worker, offscreen, DNR, `storage.session`/`sync`, separate-window host, multi-tab coordination, panel theming beyond LABELS/RTL.

**Rollback path:** `RENDER_MODE:"annotate"` restores exact v1 in one config edit (no storage schema changes, no migrations, store-update path unaffected); `WS_CAPTURE:"off"` silences the instrument; master toggle untouched. The hook file stays in the manifest but inert (isolated side drops envelopes) — acceptable, since it is passive by construction.

**Evidence that flips `COMMENT_SOURCE → "websocket"` (all required, two consecutive sessions for c+d):**
(a) sanitized full-session capture: decodable text frames, schema stable across the session, ≥1 observed reconnect;
(b) parser green on that fixture set including cross-source `identityKey` parity and the backfill burst case;
(c) parity log: **zero unmatched DOM comments** (socket saw everything the DOM saw), per-comment socket lag <2 s;
(d) one rehearsal with WS promoted: zero demote events, no count inflation across a forced reconnect, feature proxy exercised including a WS-only row;
(e) a stable id confirmed in frames — **no id, no promotion** (Q3).
One happy session is an anecdote; two is a pattern.

**Evidence that flips `RENDER_MODE → "panel"`:** one full live session on `"both"` with: zero missed questions (panel count == native count, the REPORT.md scenario-1 method), ≥3 teacher-completed features through the panel unaided, staleness banner never fired, and the teacher says the panel is cleaner — ask directly; that sentence *is* the acceptance criterion for the whole v2.

## 9. Invariant #1 decision record

**Amend — conditionally, and never silently.** Socket interception is observation of the page's own transport, not an API/webhook/SDK dependency; the invariant's *intent* (no dependency on unofficial server-side access; fail-safe observation only) survives. The amendment is **void if the Q2 step-0 DevTools check finds no page-owned WebSocket** — in that case Option A dies and the original text stands. Replacement wording for `CLAUDE.md`:

> **1. There is no StreamYard API.** Comments reach Ṣafwa only by observing the page itself: (a) the DOM via a content script and MutationObserver — the proven default feed — and (b) optionally, read-only observation of the page's own WebSocket frames. Do not add code that assumes an official API, webhook, or SDK exists. Transport capture must be **passive** (never `send` on the page's sockets, never modify or delay page handlers), **fail-open** (any capture, parse, or parity failure demotes the page session, one-way, to the DOM feed, which never stops running), and **isolated** (frame-shape knowledge lives only in `src/ws-parser.js` plus inert fixtures — the mirror of the two-file selector rule).

Companion amendment to invariant #2, one sentence: *"Runtime socket frame-shape knowledge lives only in `src/ws-parser.js`; no other module parses raw frames, and runtime code never imports fixtures or captures."* The v1 spec needs no change (it describes the DOM rail, which remains the default).

## 10. Risks ranked

| # | Risk | L × I | Cheapest mitigation |
|---|---|---|---|
| 1 | Transport is not a page-owned WebSocket (SSE/fetch/Worker) | Med × High | 5-min DevTools WS check **before writing any hook code** (§Q2.0) |
| 2 | Feature proxy misses on air (row virtualized away) | High × Med | Hint state + native panel always visible (Q4); featuring targets recent rows, which stay mounted; teacher rehearsal click before ship |
| 3 | Panel staleness read as "filter lost my questions" | Med × High | Staleness banner + RENDER_MODE interlock auto-restores v1 badges (Q5) |
| 4 | Double-feed inflates counts (both sources into core) | Med × High | One-feeder arbitration + harness assertion: one `processComment` call per fingerprint per session |
| 5 | Cross-source identity mismatch (`"Youtube"` vs `"youtube"`) silently merges/splits on failover | High × Med | Single fold in ws-parser + the identityKey-parity fixture test (Q2.4) |
| 6 | Backfill replay inflates counts / triggers LLM storm | Med × Med | Burst tagging + count suppression + skip-LLM for backfill (Q3) |
| 7 | Schema drift undetected (parses, but wrong) | Med × High | Lost-question canary: 2 consecutive unmatched DOM comments → demote (Q5) |
| 8 | MAIN-world hook breaks the page (throw inside construct trap) | Low × High | Fully try/caught listener bodies (spec-mandated fail-safe per CLAUDE.md #4) + ws-hook harness; Proxy returns the real instance untouched |
| 9 | postMessage spoofing/noise from page | Low × Med | Envelope validation; parser never throws; frames are data, never commands (Q1) |
| 10 | Maintenance surface doubles (6+ new modules/harnesses) | High × Med | Every module pure or harness-tested (Q6 table); one `npm test` command stays the done-gate; deferred list kept deferred |
| 11 | Teacher confused by dual UI in session 1 (`"both"`) | Med × Low | Frame session 1 explicitly as rehearsal; panel is visually primary; flip to `"panel"` on the Q6 evidence |

## 11. What this brief missed / open questions

1. **Does a page-owned WebSocket even exist?** Gates all of A/C. *Experiment: 5-min DevTools Network→WS on a live studio.*
2. **Criterion 7 (native featuring) is still human-untested** (REPORT.md scenario 9) — and v2 proposes to automate that exact click. *Experiment: one teacher click on `show-comment-button` during rehearsal, observed.*
3. **Monitor setup: one screen or two?** Decides sidePanel vs separate-window host; the brief assumes but never asks. *Experiment: ask the teacher.*
4. **Socket-to-DOM latency** — the only potential *teacher-visible* win of WS primacy (questions before StreamYard renders them) is unmeasured. *Experiment: log-only mode timestamps both arrivals for one session.*
5. **Real frame/comment volume** — flood thresholds are guesses; replay fixtures show 425 comments/5 h (low). *Experiment: capture counters from one session.*
6. **`chrome.sidePanel.open()` gesture semantics with the existing popup** (manifest.json:14) — popup button → `sidePanel.open()` should qualify as a user gesture, but is unverified; also decide whether action-click should open the panel directly (v2.1). *Experiment: 10-min prototype.*
7. **Panel auto-scroll policy** (pin-to-bottom only while the teacher is at the bottom; never yank during scroll-up reading) — absent from the brief, and the #1 panel annoyance in practice. *Experiment: prototype with mock STREAMS replay.*
8. **System/example rows** (the «Live viewer comments show up…» row, REPORT.md cosmetic findings) will appear in the panel too. *Experiment: none needed — decision: filter by the same pipeline (it becomes a harmless `primary`) or denylist in config; pick during MVP.*
9. **ToS posture on passive transport observation** — unknown, non-technical but real for a store-listed extension. *Experiment: one read of StreamYard's ToS; note that the shipped default observes only the DOM.*
10. **Whether the side panel or the native scroller starves when the panel is open** (StreamYard may pause rendering when its tab loses focus/width). *Experiment: 5-min live check that MutationObserver rate is unchanged with the side panel docked.*
