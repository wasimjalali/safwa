# 1. Executive verdict

Build the custom panel — the teacher's complaint is legitimate and v1's fade-ghosts are a ceiling imposed by StreamYard's virtual scroller, not by our design — but host it in `chrome.sidePanel` fed by the **existing DOM pipeline** (Option B), with WebSocket capture added behind a flag as enrichment and insurance (converging to Option C), never as the sole source (reject Option A as a first build). The DOM pipeline is live-proven and already produces everything the panel needs; the socket's real value is stable ids, delete events, and selector-breakage insurance — none of which the teacher's "not clean enough" complaint requires on day one. The feature-proxy is a fingerprint lookup into `liveByFingerprint` plus a programmatic click on `button[data-testid="show-comment-button"]`; the native panel stays mounted underneath forever as the fail-open fallback. Confidence: high on panel host + source order; honest unknowns on socket schema and on whether the feature button is clickable without hover (both cheap to resolve).

# 2. Verdict table

| Component | Verdict | Reason |
|---|---|---|
| A. WebSocket capture + custom panel | Adapt | Right destination, wrong first step: WS is unproven (schema unknown, Q2) while the UX win needs only the panel. Adopt as flagged enrichment after one capture session. |
| B. DOM observer + custom panel | Adopt | Delivers 100% of the teacher's complaint with zero new fragile surface; reuses `content.js` pipeline and `processComment` unchanged. This is the MVP. |
| C. Hybrid WS primary / DOM fallback | Adapt | Correct end-state, but invert it: DOM primary, WS enrichment, promote WS to primary only after fixture evidence (Q6). |
| D. In-place badges + polish | Reject | The ghost-fade ceiling (config.js `COLLAPSE_MODE: "fade"` comment, lines 121–126) is structural: we cannot own layout geometry inside a virtual scroller. Polish cannot fix "not clean enough." |
| Panel host: in-page injected | Reject (MVP) | Dies with every SPA re-render, fights StreamYard CSS/z-index, and puts a foreign column inside the layout we swore never to corrupt. Revisit only if side-panel width proves unworkable. |
| Panel host: `chrome.sidePanel` | Adopt | Outside StreamYard's DOM entirely: immune to SPA re-renders, occlusion, selector rot. We own geometry, so duplicates truly vanish instead of ghosting — the exact clean experience asked for. |
| Panel host: popup window | Reject | Window-management burden on a non-technical teacher mid-broadcast; focus juggling; lost-behind-windows. Second-monitor desire is real but not worth MVP complexity. |
| Service worker | Adapt | Adopt a *thin* one: side-panel behavior + message router only. No state, no LLM proxy in MVP (content script already fetches the Worker fine). |
| Offscreen document | Reject | No background DOM task exists. Panel has its own DOM. |
| Declarative Net Request | Reject | We modify no requests, and DNR cannot see WebSocket frames anyway. |
| `storage.session` | Reject | Session matching state belongs in the content-script closure (as v1), where the DOM lives; `storage.session` only matters if state moves to the SW, which it must not (suspend risk). |
| `storage.sync` | Reject | Single-machine teacher; settings are device-local; adds quota and sync latency for nothing. |

# 3. Q1 — Capture mechanics

**Manifest diff sketch:**

```jsonc
{
  "permissions": ["storage", "activeTab", "sidePanel"],
  "side_panel": { "default_path": "panel/panel.html" },
  "background": { "service_worker": "src/sw.js", "type": "module" },
  "content_scripts": [
    { "js": ["src/content.js"], "css": ["styles.css"], "run_at": "document_idle", "matches": ["..."] },
    { "js": ["src/ws-sniffer.js"], "run_at": "document_start", "world": "MAIN", "matches": ["https://streamyard.com/*", "https://*.streamyard.com/*"] }
  ]
}
```

**What runs where:**

- `src/ws-sniffer.js` (NEW, MAIN world, `document_start`): runs before any page script, so it patches `window.WebSocket` before StreamYard constructs its socket. Patch the constructor with a `Proxy`/subclass wrapper that (a) registers every instance in a module-level set — this captures reconnects and late-constructed sockets for free, since every new socket goes through the patched constructor; (b) on each instance, wraps `addEventListener("message", …)` and re-`defineProperty`s the `onmessage` setter so page handlers keep working while we tee a read-only copy of each frame. Do **not** touch `send` in MVP — featuring is done via the DOM button (Q4), not the socket.
- SPA navigation: the top document survives (capture evidence: `spaNavigationObserved: true`, top-frame only), so the patch persists; on full reload the content script re-runs at `document_start` and re-patches. No per-route work needed.
- Bridge MAIN → isolated: `window.postMessage` with an envelope `{ source: "safwa-ws", v: 1, kind: "frame", url, data, ts, seq }`. The isolated listener verifies `event.source === window && event.data?.source === "safwa-ws"` and drops everything else. Spoofing: any page script can forge this envelope; accept it (the only scripts on the page are StreamYard's own, which already control the comments) and note it as a residual risk, not a blocker. Forward text frames only; drop frames > 64 KB; if > 100 frames/sec sustained, throttle and emit a `kind:"flood"` envelope (feeds Q5's flood trigger).
- `src/content.js` (isolated): gains a `ws-bridge.js` module that receives envelopes, hands `data` to `src/ws-parser.js`, and routes parsed events into `processComment` — behind `CONFIG.COMMENT_SOURCE`.
- `src/sw.js` (NEW): sets `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` and relays a long-lived port between `panel/panel.js` and the tab's content script (`sidePanel → SW → tabs.connect(tabId)`). Nothing else.
- `world: "MAIN"` content scripts are exempt from page CSP; if a future Chrome change breaks that, the fallback is script-tag injection of a `web_accessible_resources` file — but flag it as untested, not designed.

# 4. Q2 — Schema discovery + fixtures

**Unknown, do not guess.** Likelihood ranking (label: inference, not fact): plain JSON frames on one WSS endpoint > Socket.IO/Engine.IO `42[...]` envelopes > protobuf. The discovery workflow resolves it in one live session:

1. **Capture mode (no behavior change).** `CONFIG.WS_CAPTURE_ONLY: true` (dev flag, never shipped `true`). The sniffer + bridge run, but parsed output is *logged, not pipelined*. v1 DOM behavior is 100% intact. Capture is strictly read-only: we never call `send`, never delay handlers.
2. **Ring buffer.** Content script keeps the last ~500 frames in memory; on popup command "download capture" (`LABELS` entry), writes `chrome.storage.local` → file download.
3. **Sanitize before commit.** Extend the existing `captures/` discipline (same as `streamyard-live-dom.json`'s `sanitization` field): a `test/convert-ws-capture.js` script replaces handles with `@user1…@userN` (stable mapping within a session), strips URLs/avatars/session ids, keeps message *keys*, type fields, platform labels, and Dari comment text (text is needed for parser tests; real viewer questions in the existing `replay-*.json` fixtures already set this precedent — keep it to the same five-session scale).
4. **Pure parser.** `src/ws-parser.js` — no DOM, no `chrome.*`, Node-importable. Contract:

   ```js
   parseWsFrame(raw: string, ts: number) => Array<
     | { kind: "comment", id: string|null, handle, platform, displayText, ts }
     | { kind: "delete" | "feature" | "star", id: string }
     | { kind: "backfill", comments: [...] }
     | { kind: "unknown" }
   >
   ```

   Unknown/malformed frames return `[{ kind: "unknown" }]` and increment a `parseErrors` counter — the parser never throws (fail-safe around parse reads is spec-allowed). A frame we cannot classify is *dropped*, never rendered: the DOM pipeline is concurrently running and already covers the comment (hybrid invariant).
5. **Tests.** Sanitized fixtures → `test/fixtures/ws-*.json`; parser unit tests join `npm test` (invariant §2.9.8). Parser proven on fixtures *before* `COMMENT_SOURCE: "websocket"` is selectable.

# 5. Q3 — Event semantics

| Event | Detection | Action | Fail-open if absent |
|---|---|---|---|
| New comment | parser `kind:"comment"` | `processComment` → panel render | DOM pipeline is already running in parallel; nothing lost. |
| Stable comment id | presence of `id` field in fixtures | Use for dedupe, delete/feature mapping, feature-proxy upgrade from fingerprint | Unknown until capture — fingerprint path (Q4) is the baseline and is sufficient. |
| Delete / moderation | `kind:"delete"` w/ id | Remove from panel (we own layout: true removal, no ghost) | Leave the row; native panel still shows truth. Teacher ignores it, as today. |
| Featured state | `kind:"feature"` event, or native-row button state change observed by MutationObserver | Mark panel row "نمایش داده شد" | Don't reflect; click-forwarding still works (MVP default). |
| Star / actions | `kind:"star"` | Ignore in MVP (teacher uses native actions menu) | Native panel covers it. |
| Reconnect / backfill | constructor patch sees new socket; burst of frames (> 20 in 200 ms) marked `backfill` | Dedupe by id, else fingerprint vs `recentKeys`; skip LLM review for backfilled items (they're history, regex-only) | Without backfill detection, worst case is LLM call volume; cap with the same burst rule. |
| Duplicate delivery | id seen before; else fingerprint in `recentKeys` | Drop | `processComment`'s exact-dedup already collapses repeats — double protection. |
| Ordering | insertion sequence number per session | Panel appends in socket order; DOM order is the tiebreak | DOM arrival order, as v1. |
| Platform metadata | parser `platform` field | Same `platform::handle` identity semantics as v1 | DOM `extractPlatform` (dom.js:97) already supplies it. |
| Session/room metadata | envelope `url` / room fields | Tag capture files only; not pipelined | Irrelevant to the feed. |

# 6. Q4 — Feature-proxy (the teacher's #1 action)

**The mechanism.** The custom panel never talks to the socket to feature. It asks the content script to click the *real* native button:

```
panel click "نمایش" → port → sw.js → tabs.sendMessage(tabId, {type:"safwa-feature", fingerprint})
  → content.js: find live native row → row.querySelector('button[data-testid="show-comment-button"]').click()
```

`.click()` dispatches a genuine bubbling `click`; React's root listener handles it identically to a physical click. No synthetic-event internals, no React fiber poking.

**The mapping — reuse what exists.** `content.js` already maintains `liveByFingerprint: Map<platform\0handle\0displayText → liveNode>` (lines 131, 229–231), kept fresh across virtual-scroller recycling by `retargetDecision`. That map *is* the custom-row → native-row mapping; the panel sends the fingerprint and the content script looks it up. No new identity scheme. If socket ids later prove stable (Q3), upgrade the map key to `id` with fingerprint fallback — internal change, panel unaffected.

**Virtualized-away fallback (the hard case).** If `liveByFingerprint` has no connected node, the native row is scrolled out of the ~10 rendered slots. Design, in shipping order:

1. **MVP — honest disable.** The panel's feature button is enabled only while the native row exists. Otherwise it shows a calm Dari hint (new `LABELS.entry`: e.g. «در ستون اصلی اسکرول کنید» — "scroll in the main column"). **UX cost on air: near zero in practice** — teachers feature questions as they arrive or shortly after answering; those rows are always in the rendered window. The fallback path is exactly today's un-extended workflow, so this is a *zero-regression* floor, not a new burden.
2. **Post-MVP — scroll-hunt.** We know each comment's arrival index. On feature of an absent row: set the native scroller's `scrollTop ≈ index × measuredRowHeight`, let the virtual scroller render, re-query the fingerprint for up to ~1.5 s, then click. Show a brief spinner on the panel row while hunting. Build this only if live testing shows the teacher actually featuring old comments.

**Edge cases:**

- *Same text + handle in two native rows* (double-send): `liveByFingerprint` holds the latest live row — the right one to feature (most recent ask). The earlier copy is a collapsed duplicate by pipeline decision anyway.
- *Socket comment before DOM row*: feature button starts disabled (same "not yet available" state); the MutationObserver flips it enabled when the row lands — typically sub-second, invisible to the teacher.
- *Featured-state reflection*: MVP does not reflect. Post-MVP: observe the native row's button (class/aria change) and mark the panel row; do not block the click on it.
- **Untested precondition (from §2.7: criterion 7 was never live-tested):** whether `show-comment-button` exists in the DOM without row hover. If it mounts only on hover, the proxy must first dispatch `pointerover`/`mouseenter` on the row. Cheapest experiment: DevTools, one `document.querySelector('button[data-testid="show-comment-button"]').click()` without touching the mouse — resolves in five minutes and gates the whole Q4 design.

**Panel UX gains vs v1 badges (why this is worth building):** duplicates collapse to one clean row with «۳ بار پرسیده شد» and an expandable "who asked" list — impossible in the scroller; joined fragments render as one continuous question; confirmed extras/greetings *disappear* instead of ghosting at 25% opacity; big RTL tap targets sized for a stressed teacher; v1's `pointer-events:none` badge dance is deleted. Loses: nothing — the native panel remains mounted beside it, untouched.

# 7. Q5 — Failure model

| Failure | Signal | Threshold | Fallback | Teacher sees |
|---|---|---|---|---|
| MAIN-world patch blocked / overwritten | no `kind:"hello"` envelope from sniffer | 5 s after content-script boot | Stay in DOM mode | Nothing. Panel works off DOM. |
| Socket never appears | no `WebSocket` constructed | 30 s after comments panel found | DOM mode | Nothing. |
| Schema changed | `parseErrors / frames` | > 20% over last 50 frames | DOM mode + one `[Ṣafwa]` warn | Panel shows a small status line «حالت ساده»; feed unchanged. |
| Bridge silent (envelopes stop while comments visibly arrive in DOM) | DOM new-comment events with zero frames | 60 s | DOM mode | Status line only. |
| Frame flood | frames/sec | > 100 sustained 5 s | Throttle → if sustained, DOM mode | Nothing. |
| LLM worker down | existing 8 s timeout | existing | regex stands (v1 behavior) | As v1 today. |
| SW suspend / port drop | `port.onDisconnect` | immediate | Panel reconnects; content script re-pushes full session snapshot (it owns state) | Panel list re-renders; ≤ 1 blink. |
| **Panel-side catastrophe (any throw in panel render)** | `try/catch` at panel root | any | Close panel content → v1 in-place badges are *still on* underneath | Worst acceptable outcome: "we're back to the v1 look." The native feed is never touched. |

The structural guarantee: in the shipping architecture the DOM pipeline never stops running, so failover is a *relabeling*, not a rebuild. The feed cannot stall because the feed was never socket-dependent.

# 8. Q6 — MVP vs over-build

**Ship (provable in one live session):**
1. `chrome.sidePanel` + `panel/panel.html|js|css` — own clean RTL list, Vazirmatn font (already bundled), all strings from `CONFIG.LABELS`.
2. `src/sw.js` thin router; content script stays source of truth and pushes decision snapshots over the port.
3. Panel renders the *existing* decision objects from `processComment` — matching core untouched (invariant §2.9.2).
4. Feature-proxy: fingerprint → `liveByFingerprint` → native button click; disabled+hint when virtualized away (Q4).
5. v1 in-place badges remain active and toggleable during proving (belt and suspenders; popup toggle already exists).
6. Flags: `CONFIG.PANEL_ENABLED: true`, `CONFIG.COMMENT_SOURCE: "dom"` (default). Rollback = close the panel / flip the flag — no uninstall, no reload of the session.

**Defer:** WS sniffer + parser + fixtures (build *immediately after* MVP panel, still this milestone, but not blocking); scroll-hunt featuring; featured-state reflection; deletions panel-side; "answered" checkmarks (cheap panel-only win — mention, don't build); window-host option.

**Flip-the-default evidence for `COMMENT_SOURCE: "websocket"`:** (a) one full live session on the DOM-sourced panel with comment-count parity vs the native panel (zero missed); (b) a sanitized capture proving a stable schema + presence/absence of ids; (c) parser fixtures green in `npm test`. Until all three, WS stays capture-only.

# 9. Invariant #1 decision record

**Amend.** Socket interception is passive observation of the page's own transport — the same epistemic category as the MutationObserver — but the invariant's wording currently forbids it, and silently violating a project invariant is worse than any architecture. Replace in `CLAUDE.md` (and mirror in `streamyard-question-filter-spec.md` §risk/invariants):

> **1. There is no StreamYard API.** Comments are read from the page itself: the DOM via a content script and MutationObserver, and optionally the page's own WebSocket transport observed read-only. Do not add code that assumes an official API, webhook, or SDK exists. Transport capture must be passive (never `send`, never block page handlers), fail-open (any capture failure falls back to the DOM pipeline, which always runs), and must never delay or modify what the page does.

The "selectors live in two files" invariant extends by one sentence: **WebSocket frame-shape knowledge lives only in `src/ws-parser.js`**, mirroring the `dom.js` isolation rule.

# 10. Risks ranked (likelihood × impact)

1. **Feature button requires hover to exist** (medium × high) — blocks the proxy's hot path. Mitigation: 5-minute DevTools experiment now; dispatch `pointerover` before click if needed.
2. **WS schema undocumented/changes** (high × medium) — capture-first workflow; parser is fixture-tested; DOM pipeline always runs, so schema rot is a downgrade, never an outage.
3. **Two visible comment lists confuse the teacher** (medium × medium) — panel is *the* reading view; native panel is demoted to fallback-only; one Dari onboarding line in the popup.
4. **Panel↔content-script messaging desync** (medium × medium) — content script owns state, pushes idempotent snapshots; panel is a pure renderer; re-sync on port reconnect.
5. **Side-panel width crowds the studio** (medium × low) — resizable, closable; test on the teacher's actual laptop resolution.
6. **Chrome Web Store scrutiny of WS patching** (low × medium) — unlisted listing; privacy note: passive, same-origin, no exfiltration (LLM Worker payload unchanged).
7. **Forged bridge envelopes** (low × low) — envelope check; worst case cosmetic rows in our own panel, native feed unaffected.

# 11. What this brief missed / open questions

1. **Is `show-comment-button` clickable without hover?** Gates Q4's whole design. Cheapest experiment: one DevTools `.click()` on a live studio, no mouse movement.
2. **Does StreamYard expose featured/on-air state in the DOM?** Needed to reflect "نمایش داده شد" in the panel. Experiment: feature one comment live, diff the row's DOM before/after.
3. **Socket-to-DOM latency.** If the socket beats the DOM by > 500 ms, the panel could show questions *before* StreamYard renders them — a genuinely better experience and a real argument for WS primacy. Experiment: capture mode timestamps both arrivals for one session.
4. **"Answered" clearing.** The panel enables the single biggest workflow upgrade — the teacher dismissing answered questions — for free (panel-local state, zero core changes). Not in the brief, not in MVP; validate with one live show whether the teacher wants it.
5. **Does the teacher's machine have the screen width** for studio + side panel? Experiment: open the side panel on their laptop during the next tuning session — 30 seconds, gates the host decision's only real cost.
6. **Reconnect behavior mid-show** (StreamYard renegotiates; new socket, possible backfill burst). Experiment: capture mode + one forced network drop during a test broadcast; confirms Q3's backfill handling against reality instead of inference.
