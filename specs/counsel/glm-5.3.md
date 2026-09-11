# Ṣafwa v2 Architecture Counsel — Councilor 1: Feasibility & Security

## 1. Executive verdict

WebSocket capture is **technically feasible** from MV3 with zero new permissions, but it is the riskiest layer in the whole proposal and delivers **zero teacher-visible benefit by itself** — the complaint being fixed is presentation (badges), not capture. My recommendation: build the custom panel on the **proven DOM rail first** (architecture B), ship the WebSocket hook as a **passive, log-only discovery instrument** in the same build, and promote it to the primary rail (architecture C) only after schema fixtures prove it across two live sessions. The WebSocket rail must be rejected outright if discovery shows binary/protobuf frames. Confidence: high on mechanics (Q1), medium on payoff (depends on unknown schema, Q2).

## 2. Verdict table

| Row | Verdict | One-line reason |
|---|---|---|
| A. WebSocket capture + custom panel | **Adapt** | Buildable read-only, but as a flag-gated secondary rail reached via C, never a one-shot replacement of the DOM rail |
| B. DOM observer + custom panel | **Adopt** | Delivers the actual UX win with zero new capture risk; this is the MVP |
| C. Hybrid (WS primary, DOM fallback) | **Adopt** (target) | Target architecture; the DOM rail doubles as a live notary that makes forged/lost frames detectable |
| D. Status quo + polish | **Reject** | Does not address the teacher's stated complaint |
| Panel host: in-page panel | **Adopt** (MVP) | Same window, no new permissions, reuses the existing container watchdog (content.js:349) |
| Panel host: `chrome.sidePanel` | **Unknown/defer** | Immune to page CSS/SPA, but cramped on one laptop screen and a new UX paradigm for the teacher; decide after MVP session |
| Panel host: popup window | **Defer** | Only wins on a second monitor; extra window-management burden on air |
| Service worker | **Reject** (for MVP) | No cross-tab state, LLM fetch works from the content script today; an MV3 SW's kill/restart cycle adds a failure mode for nothing |
| Offscreen document | **Reject** | No background DOM task exists; an offscreen document would make *its own* sockets, not see the page's — category error for this feature |
| Declarative Net Request | **Reject** | DNR blocks/redirects/rewrites; it cannot read bodies, so it cannot capture frames at all |
| `storage.session` | **Defer** | Candidate for state across hard navigation, but needs `setAccessLevel(TRUSTED_AND_UNTRUSTED_CONTEXTS)`; memory-only closure state is fine today (session reset is a feature) |
| `storage.sync` | **Reject** | One machine, one operator; adds quota and sync-failure paths for no user value |

## 3. Q1 — Capture mechanics (deepest answer, per lens)

### 3.1 Injection mechanism: manifest `world: "MAIN"` at `document_start`

Three candidates exist; only one is right:

| Mechanism | Verdict | Reason |
|---|---|---|
| Manifest-declared content script with `"world": "MAIN"`, `"run_at": "document_start"` (Chrome 111+) | **Adopt** | Browser-injected before any page script runs → race-free constructor patch; exempt from page CSP; **no new permission**; no `web_accessible_resources` exposure |
| `chrome.scripting.executeScript({world: "MAIN"})` | Reject | Requires the new `scripting` permission, a coordinator (service worker), and `registerContentScripts` anyway to get `document_start` timing — strictly worse |
| Script-tag injection of a WAR resource | Reject | Two hops (isolated script injects the tag), ordering race against app JS, exposes `src/*.js` to page fetching (fingerprint/abuse surface), CSP interactions |

Manifest diff sketch (permissions unchanged — this is a security property, not an accident):

```json
"content_scripts": [
  {
    "matches": ["https://streamyard.com/*", "https://*.streamyard.com/*"],
    "js": ["src/ws-hook-main.js"],
    "run_at": "document_start",
    "world": "MAIN"
  },
  {
    "matches": ["https://streamyard.com/*", "https://*.streamyard.com/*"],
    "js": ["src/content.js"],
    "css": ["styles.css"],
    "run_at": "document_idle",
    "world": "ISOLATED"
  }
]
```

File split by world:

- **`src/ws-hook-main.js`** (MAIN, ~120 lines, classic script, no imports of the ESM core): dumb instrument — patches, wraps, posts raw envelopes. No matching logic, no config, no secrets in the page world (page scripts can read MAIN-world state; keep it worthless to them).
- **`src/ws-bridge.js`** (ISOLATED): envelope validation, heartbeat, rate/size caps, bounded queue, emits frames to consumers.
- **`src/ws-parse.js`** (pure, Node-importable): schema → comment objects, tested in `npm test`. Socket-schema knowledge quarantined here + a `WS_SCHEMA` block in `src/config.js`, mirroring the selector-isolation invariant (CLAUDE.md #2).

### 3.2 Patch surface: constructor only — never prototype, never `send`

The minimal, safest patch is a **constructor wrapper**; everything else is unnecessary attack surface:

```js
// src/ws-hook-main.js (sketch)
(() => {
  if (window.__safwaWsHook) return;            // idempotent across reinjection
  const Native = window.WebSocket;
  if (!Native) return;
  let seq = 0;
  const post = (m) => { try {
    window.postMessage(Object.assign({ __safwa: 1, ns: "ws", ts: Date.now() }, m),
                       window.location.origin);
  } catch {} };

  function Patched(url, protocols) {
    const ws = protocols === undefined ? new Native(url) : new Native(url, protocols);
    const id = ++seq;
    post({ kind: "open", id, url: String(url) });
    // Additive, passive listener — runs alongside the page's own
    // .onmessage / addEventListener handlers; cannot suppress or alter them.
    ws.addEventListener("message", (ev) => { try {
      post({ kind: "frame", id, dir: "in", data: describe(ev.data) });
    } catch (e) { post({ kind: "err", id, why: "post" }); } });
    ws.addEventListener("close", (ev) => { try {
      post({ kind: "close", id, code: ev.code });
    } catch {} });
    return ws;                                 // legal: returned object replaces `this`
  }
  Patched.prototype = Native.prototype;        // instanceof stays truthful both ways
  Object.defineProperty(Patched, "name", { value: "WebSocket" });
  window.WebSocket = Patched;
  window.__safwaWsHook = true;

  // Heartbeat: ISOLATED pings, MAIN answers — proves hook liveness (Q5).
  window.addEventListener("message", (ev) => {
    if (ev.source === window && ev.data && ev.data.__safwa === 1 && ev.data.kind === "hello")
      post({ kind: "alive", frames: seq });
  });

  function describe(data) {                    // string passthrough; binary → base64; Blob → async text
    ...
  }
})();
```

Explicit non-goals, enforced in review: **never** wrap `WebSocket.prototype`, **never** wrap `send`, **never** call `send`, **never** modify or hold frames, **never** open our own connection to StreamYard servers (a second client means auth/cookies, ToS exposure, and server-side session weirdness — passive observation of the page's own socket avoids all three). The hook is read-only by construction.

### 3.3 Reconnects, new sockets, SPA survival

- **Reconnects / newly constructed sockets**: every `new WebSocket(...)` after the patch routes through the wrapper, so reconnect sockets are captured with no re-patch logic. Nothing to "survive" per-socket.
- **SPA navigation** (confirmed live, `captures/streamyard-live-dom.json` `spaNavigationObserved`): soft navigation keeps the same JS context, so the patch persists. The bridge heartbeat catches the pathological case where a hard SPA framework teardown clobbers `window.WebSocket` (heartbeat alive but zero `open` events on new sockets → demote rail).
- **Hard navigation / reload**: `document_start` MAIN script re-runs automatically. Same for every streamyard.com page — the hook is inert on dashboard pages (it posts `open` envelopes; the ISOLATED side ignores sockets whose frames never parse as comments).

### 3.4 Bridge envelope, validation, limits

`window.postMessage` MAIN→ISOLATED is the standard bridge (CustomEvent `detail` does **not** cross worlds; DOM-attribute bridges are clunkier and equally forgeable). Envelope: `{__safwa:1, ns:"ws", kind:"open"|"frame"|"close"|"alive"|"err", id, ts, data}` with `targetOrigin = location.origin`.

Spoofing/tamper model, stated honestly: **any page script can forge this envelope** — there is no unforgeable in-page channel. Mitigations that make forgery inert:

1. **Strict validation** in `ws-bridge.js`: kind whitelist, `typeof` checks per field, single-frame data cap (512 KB, drop+count), rate cap (e.g. 200 frames/s sustained → aggregate-count only).
2. **Dual-rail notary** (the payoff of architecture C): WS-rendered comments must correlate with a DOM comment (existing observer) within a window; systemic divergence demotes the WS rail — per-comment suppression is forbidden (it would risk losing a real question; only *rail-level* demotion is allowed).
3. **No privileged action on frame data alone**: the panel renders text as `textContent` only (never `innerHTML` — forged frames must not become XSS), and feature-proxy clicks are teacher-initiated.
4. MAIN-world listener bodies are fully try/caught — a hook bug must never throw into the page's socket handling. This is spec-mandated fail-safe try/catch (CLAUDE.md #4), not bug-swallowing: each `err` envelope increments a visible counter that feeds Q5.

One unknown to keep open: whether StreamYard code has any anti-tamper check on `window.WebSocket !== native`. No evidence today; the read-only wrapper is the cheapest possible posture. Cheapest experiment: one dogfood session with the hook on (Section 11).

## 4. Q2 — Schema discovery + fixtures

**Honest position: the schema is unknown.** Plausible candidates: Socket.IO/engine.io (recognizable `0`/`42[`/`2`/`3` framings), raw JSON envelopes, or binary protobuf. Do not guess further; discover.

Workflow (no live-stream degradation — the hook is passive and sends nothing):

1. **Log-only mode first**: ship the Q1 hook with `CONFIG.COMMENT_SOURCE: "dom"` and `WS_CAPTURE: "log"` (log-only). Behavior change: zero. It collects socket URLs, frame counts/sizes, and envelope-shape histograms into the console (and a `data-safwa-ws-stats` attribute, mirroring the QA-run instrumentation pattern in `qa-screenshots/live-2026-09-10-cli/REPORT.md`).
2. **One dev test broadcast** (the repo already runs these against the operator's own channels): dump raw frames to a file **outside the repo** for developer analysis.
3. **Sanitize before committing**: replace handles with `@user_N`, comment text with same-shape placeholder Persian strings; keep structure, keys, ids, platform fields. Commit as inert fixtures — `captures/ws-frames-sanitized.json` + `test/fixtures/ws-frames-*.json`, extending the existing sanitized-captures convention (CLAUDE.md #2).
4. **Parser as pure function** (`src/ws-parse.js`, Node-importable like the core):

```
parseFrames(rawFrame(s), CONFIG)
  → { comments: [{ handle, platform, displayText, timestamp, id? }],
      events:  [{ kind: "delete"|"featured"|"backfill"|"unrecognized", ... }],
      stats:   { parsed, skipped, unrecognized } }
```

Output comments match the exact contract `processComment` consumes today (`{handle, platform, displayText, timestamp}` — src/grouping.js:263; the core never touches `.el`/`.cardEl`, those are UI-only, so socket comments flow through unchanged). Malformed/unknown frames: **never throw** — return `{kind:"unrecognized"}`, count it; the unrecognized ratio is a Q5 failover signal. `npm test` gains parser cases from the fixtures.

**Flip-down decision**: if discovery shows binary/protobuf frames with no readable schema, **reject the WS rail entirely** (keep B). Reverse-engineering an undocumented protobuf against a live vendor is a maintenance treadmill that the DOM rail already renders pointless.

## 5. Q3 — Event semantics

| Event | Detection | Action | If absent (fail-open) |
|---|---|---|---|
| New comment | parser `comments[]` | feed `processComment`; render in panel | — (this is the baseline) |
| Deletion / moderation | socket `delete` event **or** native row removed (v1 observer already sees this) | remove custom row, log | keep showing; native panel remains ground truth; no data is fabricated |
| Featured / starred state | native row button state (`aria-pressed`/class) or socket event | reflect badge on custom row | no badge — cosmetic only, never blocks |
| Edits | treat as a new comment (live chat edits are rare) | normal pipeline | same |
| Reconnect backfill (history dump) | burst of frames after `close`→`open` with recognizable ids | idempotent by stable id; else fingerprint (`content.js:137` `fingerprintOf`) + arrival window | dedupe by fingerprint — this is already the core's skill (state.js, dedup.js) |
| Duplicate delivery (same frame twice) | identical id / identical fingerprint within window | idempotent ingest | same |
| Ordering | preserve arrival order; ignore embedded timestamps for ordering | arrival order (identical to DOM behavior today) | same |
| Platform metadata | socket field → `platform`; fold via existing `identityKey` (state.js:39) | `"?"` default already supported | same |
| Session/room metadata | ignore unless scoping proves necessary | ignore | ignore |
| Stable comment ids | presence in fixtures | use for idempotency + feature-proxy mapping | fall back to fingerprint (Q4) |

Notable synergy: the DOM rail **detects deletions better than the socket might** (rows physically disappear), which is another argument for C over A.

## 6. Q4 — Feature-proxy

Mechanism (custom row → native `button[data-testid="show-comment-button"]`, capture-verified):

1. **Mapping**: custom row carries `id?` + fingerprint `platform\0handle\0displayText` (the exact identity `content.js:137` already builds). DOM rows expose no id (capture documents none), so fingerprint is the primary mapping; a socket id becomes primary only if the DOM row can also be tied to it.
2. **Click forwarding**: scan current native rows (`dom.collectCommentNodes` + `dom.extractComment` — existing API), match by fingerprint. Found → highlight the row + `scrollIntoView`; **MVP: the teacher clicks the native button himself** (this finally gets criterion 7 a real live test). Auto-click (`btn.click()` — React handlers fire on synthetic clicks) is a v2.1 step, only after the manual path is boring.
3. **Virtualized-away row**: scroll-hunt — step the native scroller's `scrollTop` in bounded increments, rescan per step (≤20 steps), then step 2. UX cost, stated exactly: seconds of visible scrolling in the native panel; on failure the custom row shows a Dari label («در ستون اصلی پیدا نشد») and focus moves to the native panel. That is the worst on-air cost of the whole architecture — a glance, never a lost question.
4. **Edge cases**: same fingerprint in two native rows → prefer the unfeatured/earliest row, mark ambiguity on the custom row; socket comment not yet rendered in DOM → proxy polls up to 10 s for the row's appearance (the row must exist to feature); featured-state reflection via MutationObserver on the row's buttons → badge on the custom row.
5. Selector hygiene: `show-comment-button` joins `SELECTORS` in `src/config.js` + a `dom.js` helper; it appears nowhere else (CLAUDE.md #2).

## 7. Q5 — Failure model

| Failure | Signal | Threshold → fallback | Teacher sees |
|---|---|---|---|
| MAIN script never ran / blocked | no `alive` reply to boot ping | 1 missed heartbeat (30 s) → DOM rail drives panel | v1 in-place look; one `[Ṣafwa]` console line |
| Wrong transport (no WS, or comments not on WS) | heartbeat alive, 0 recognized frames while DOM rail sees comments | ≥3 DOM comments unmatched in 120 s → demote rail | panel keeps working (from DOM); console warn |
| Schema drift | `stats.unrecognized` ratio climbs | >40% unrecognized over 50 frames → demote rail | same as above |
| Frame flood | bridge rate cap tripped | >200 frames/s for 10 s → count-only; sustained → demote | same |
| Bridge silent / spoofed | validation rejects, `err` envelopes spike | >10 rejects/min → demote rail | same |
| Reconnect/backfill burst | frame burst after `close`→`open` | idempotency absorbs; overflow → count-only | brief duplicate rows at worst, self-heals |
| Parse exception | per-frame catch | never propagates; counted into unrecognized | nothing (this is the fail-safe catch, CLAUDE.md #4) |
| LLM down / timeout | existing behavior (llm-classifier.js) | 8 s timeout → regex stands | unchanged from v1 |
| Both rails dead | DOM selectors broken AND WS demoted | native feed untouched, one warning | StreamYard's own panel — the absolute floor, identical to v1 fail-safe |

Core design rule: the panel is **never blank and never stale-frozen** — every failure path lands on "panel driven by DOM rail" or "v1 in-place look", both of which already work and are live-tested. The in-place renderer (`ui.js`) stays in the build as the fallback renderer; failover is a renderer switch plus one console line.

## 8. Q6 — MVP vs over-build

**Smallest winning MVP (provable in one live session):**
1. Custom clean panel (in-page, RTL, all labels from `CONFIG.LABELS`) rendering decisions from the **existing DOM rail** — architecture B. This alone answers the teacher's actual complaint.
2. Feature-proxy: fingerprint match + highlight + scroll-hunt; teacher clicks native feature button.
3. Rail abstraction in `content.js`: `COMMENT_SOURCE: "dom" | "websocket"` in `src/config.js`, default `"dom"`; DOM rail behind the same `onComment(cb)` interface.
4. WS hook shipped in **log-only** mode (`WS_CAPTURE: "log"`) — zero behavior change, collects schema evidence + a WS-vs-DOM divergence meter in the console.

**Defer:** WS-driven rendering (the flag flip), auto-click featuring, deletion/backfill event honoring, `chrome.sidePanel` / popup-window hosts, service worker, `storage.session`, deleting the in-place renderer (it *is* the fallback).

**Rollout + flip evidence:** log-only across test broadcasts → flip `COMMENT_SOURCE: "websocket"` on a dev broadcast → compare rails. Flip the default only after **two consecutive sessions** with: parse rate ≥95%; **zero** comments seen by the DOM rail but missed by WS (the never-lose invariant, measured, not assumed); reconnect/backfill handled with no duplicate rows; feature-proxy success ≥ DOM-rail baseline; zero page-socket errors attributable to the hook. Any miss → default stays `"dom"`, which is a one-line rollback.

## 9. Invariant #1 decision record

**Amend — do not silently violate.** The invariant's intent is "no assumption of an official/public API, webhooks, or SDK." Passive, read-only observation of the page's *own* transport is the same legal and technical posture as reading the page's *own* DOM: no API is assumed, no second client exists, no schema stability is assumed, and it fails open. The amendment keeps the fail-safe character explicit. Proposed replacement wording for `CLAUDE.md` invariant 1:

> **1. There is no StreamYard API.** StreamYard exposes no public API, webhooks, or SDK; all comment data comes from observing the page itself. The primary rail is the page DOM (content script + MutationObserver). A secondary, flag-gated rail (`CONFIG.COMMENT_SOURCE = "websocket"`, default `"dom"`) may passively READ the page's own WebSocket frames via a MAIN-world constructor wrapper (`src/ws-hook-main.js`). It must never call `send`, never modify or suppress frames, never open its own connection to StreamYard servers, and must demote itself to the DOM rail on any doubt (parse failure, divergence, silence). Socket-schema knowledge lives only in `src/ws-parse.js` and the `WS_SCHEMA` block of `src/config.js` (same isolation rule as DOM selectors). No code may assume an official API, webhook, SDK, or a stable socket schema.

Mirror the same paragraph into spec Section 2 ("Hard constraint: no API") with a v2 note. If discovery (Q2) had shown the rail unbuildable, this amendment would be moot — it is conditional on the discovery evidence, and the record should say so.

## 10. Risks ranked (likelihood × impact, cheapest mitigation)

| # | Risk | L × I | Cheapest mitigation |
|---|---|---|---|
| 1 | Comments aren't on the page's WebSocket at all (polling/SSE/other) | High × High | Log-only discovery first; rail demotes itself; architecture B already shipped the win |
| 2 | Frames are binary/protobuf, schema reverse-engineering treadmill | Med × High | Flip-down rule in Q2: reject the WS rail, keep B |
| 3 | Hook bug degrades the page's socket on air | Low × Very High | Constructor-only patch, never-throw bodies, log-only dogfood session before any flag flip |
| 4 | Reconnect/backfill duplicate bursts flood the panel | High × Med | id/fingerprint idempotency + rate caps (core already good at this) |
| 5 | Deletions unobserved → moderated comments shown | Med × Med | Honor delete events if present; DOM rail sees row removals anyway; native panel stays ground truth |
| 6 | Feature-proxy misses virtualized-away rows | High × Med | Scroll-hunt + highlight + teacher-manual fallback (a glance, not a loss) |
| 7 | Bridge spoofing/flood | Low × Med | Envelope validation, caps, textContent-only rendering, dual-rail notary |
| 8 | StreamYard anti-tamper or transport change post-ship | Low × High | Read-only minimal wrapper; DOM rail + one-line flag rollback |
| 9 | Page CSP blocks injection | Very Low × High | Manifest MAIN-world injection is CSP-exempt; heartbeat detects and demotes |

## 11. What this brief missed / open questions

| Open question | Cheapest experiment |
|---|---|
| Is the studio's live transport actually WebSocket (vs SSE/XHR/other)? | One log-only hook session: log `new WebSocket(url)` calls + frame counts; also log whether `EventSource` is constructed at all |
| Do comment frames carry stable ids / deletion events? | Sanitized dump of one test broadcast's frames; answer falls out of the fixtures |
| Are frames text or binary? | Same dump — `describe()` already tags kind |
| Does the Pop-Out Chat window (debug handoff H3) open its own socket — a second capture surface? | Run the same log-only hook in that window during the session |
| Does a second studio tab on the same broadcast get its own socket (rail identity)? | Open two tabs during a test broadcast, compare socket URLs/frames |
| One screen or two for the teacher (panel-host decision)? | Ask him |
| Any StreamYard anti-tamper on patched globals? | Dogfood session with hook on; watch for socket errors / behavior change |
| `same_person` LLM misclassification (live QA scenario 6) — unaddressed by v2 and independent of transport | Fix in the prompt/path layer; it transfers to any rail unchanged |

One structural note to close: the brief frames A vs B as the decision; the feasible-and-secure answer is that **B is the deliverable, and the WS hook is first an instrument, second a rail**. That ordering is what makes every failure in Section 7 cost a glance instead of a question.
