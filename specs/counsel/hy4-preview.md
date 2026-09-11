# Ṣafwa v2 Counsel — Councilor 7 (HY4) · Lens: **live-event semantics**

Repo read: `src/{content,dom,config,state,grouping,dedup,ui,normalize,llm-classifier}.js`, `manifest.json`, `package.json`, `captures/streamyard-live-dom.json`, `qa-screenshots/live-2026-09-10-cli/REPORT.md`.
Verdict below is grounded in those files; line references are to the current working tree.

---

## 1. Executive verdict

**Ship B (DOM observer + custom clean panel) now; do not make the WebSocket the feed's source of truth.** The teacher's complaint is about *badges*, and the DOM path solves that with zero new transport risk. **Adapt C into a narrow form — "DOM-authoritative, socket-enriching" — and only after a 60-second DevTools survey proves the socket even carries comments**: the socket's real prize is not the comment text (we already have it) but **stable per-comment ids and true event timestamps**, which would fix v1's existing recycling/clock fragility (`src/content.js:137` fingerprints on raw `displayText`; `src/dom.js:165` uses `Date.now()`). **Reject A (socket-primary custom panel)** for one structural reason I own as the event-semantics councilor: the socket is **pre-moderation raw transport**, the DOM is **post-moderation rendered truth**. A socket-fed panel will show comments StreamYard deliberately does not render (blocked/held/removed, or a destination the teacher unchecked), and then the teacher's #1 action — feature on broadcast — has no native row to click. Confidence: **high (~80%)** on B-then-C-enrichment; **low (~30%)** that socket capture is feasible at all (transport is an unknown, §11).

---

## 2. Verdict table

| Option / component | Verdict | One-line reason |
|---|---|---|
| **A** — WebSocket capture + custom panel | **Reject** (as primary) | Pre-moderation stream ≠ what the teacher can act on; backfill, duplicate delivery, deletions and moderation must all be invented, and every one of them is a "lose a question" path. |
| **B** — DOM observer + custom panel | **Adopt** | Same proven input, fixes the actual complaint, and inherits StreamYard's own moderation/ordering/dedup for free. Q3's hardest problems (backfill, replay, drift) do not exist. |
| **C** — Hybrid | **Adapt** | Only as *DOM authoritative / socket advisory*: socket supplies ids + timestamps + (maybe) delete/feature events; DOM remains the arbiter. Never both feeding the pipeline at once. |
| **D** — Status quo + polish | **Reject as a destination, keep as the fallback** | Badges are the complaint; but D is exactly what the failure path must degrade to ("worst acceptable outcome is the v1 look", §5.2 of my Q5). |
| Panel host — in-page dock inside the aside | **Adopt for MVP** | Keeps native rows adjacent and mounted → feature proxy stays real; no service worker, no cross-document state, no port. |
| Panel host — `chrome.sidePanel` | **Adapt (phase 2)** | Survives SPA re-render and CSS occlusion, but needs a service worker (or a port to the tab) and moves state out of the content script. |
| Panel host — separate window (`chrome.windows.create`) | **Adapt (optional, later)** | Best for a second monitor; worst for "is it still open?" and for keeping the native comments tab mounted. |
| Service worker | **Reject for MVP / Adapt with sidePanel** | v1 is content-script-only and correct; a SW only earns its cost when the panel is a separate document. |
| Offscreen document | **Reject** | Nothing here needs worker-side DOM (no audio, canvas, clipboard). |
| Declarative Net Request | **Reject** | We never modify, block or redirect requests. Adding `declarativeNetRequest` would also add a scary permission for zero function. |
| `storage.session` | **Adapt (only if the panel becomes a separate document)** | Today's session state is a per-tab closure (`src/state.js:20`) — correct and leak-free. Moving the panel out of the tab is what creates the need. |
| `storage.sync` | **Reject** | One teacher, one machine; sync would also risk settings flipping mid-broadcast. |
| MAIN-world tap (`world:"MAIN"`, `document_start`) | **Adopt for the discovery/enrichment build only** | Read-only tap; must never ship in the Web Store build until §6 flip-evidence exists. |

---

## 3. Q1 — Capture mechanics

**World and injection.** Use a manifest-declared MAIN-world content script — `{"js":["src/transport/ws-main.js"], "world":"MAIN", "run_at":"document_start", "matches":[…streamyard.com…]}` (Chrome 111+). Reject `chrome.scripting.executeScript({world:"MAIN"})` (forces a service worker + `scripting` for no gain) and reject script-tag injection (page CSP). `document_start` guarantees we exist before the app bundle runs, so **no socket can be constructed before the patch**.

**`src/transport/ws-main.js` must be dependency-free** — no `import()`, no `chrome.*`, ~120 lines, one `try/catch` shell. Reason: a dynamic `import()` of a `chrome-extension://` URL from MAIN world is a script load and is exposed to the page's CSP; we cannot afford a dependency on StreamYard's CSP for a tap.

**Patch surface (read-only, never a mouth):**
- Replace `window.WebSocket` with a named `function WebSocket(...args){ const ws = new OrigWS(...args); tap(ws, args[0]); return ws; }`; copy `prototype` and the four `CONNECTING/OPEN/CLOSING/CLOSED` constants onto it. Optionally harden `toString` to `function WebSocket() { [native code] }` so fingerprinting libs see a native-looking constructor.
- **Outgoing**: wrap `send` — subscribe/authenticate frames are the cheapest schema Rosetta Stone (they name the room, the destinations, the platform vocabulary). Never alter the payload.
- **Incoming**: wrap `addEventListener('message'|'open'|'close'|'error')` **and** `Object.defineProperty` an `onmessage`/`onopen`/`onclose` accessor on `WebSocket.prototype` so the common `ws.onmessage = fn` assignment is also seen.
- **Ordering rule**: invoke the page's handler **first**, then tap, both inside `try/catch`. A bug in our tap must never delay or drop a frame for StreamYard's own client — that is the one way this could degrade a live broadcast.
- **Reconnects**: the constructor patch covers every future socket automatically; there is no "new socket" case to handle. **Not covered: sockets opened inside a Dedicated/Shared Worker** (we cannot inject there) and non-WebSocket transports (SSE, WebTransport, long-poll, Firebase/RTDB over its own socket). Both are unknowns with experiments in §11.

**Bridge (MAIN → isolated).** `window.postMessage(envelope, location.origin)`; isolated world listens with `if (e.source !== window) return;` + `if (d?.__safwa !== 1) return;`.

```js
{ __safwa: 1, v: 1, src: "ws-main", seq, socketId, url, dir: "in"|"out",
  ts: Date.now(), kind: "text"|"binary"|"lifecycle",
  bytes: 412, text: "…truncated to WS_MAX_TEXT (8192)…", truncated: false,
  head: "0a1b2c…" /* first 32 bytes hex, binary only */, state: 1 /* lifecycle */ }
```

- **Size**: never post a full frame > 8 KB; binary frames post head-only. **Rate**: token bucket, `MAX_FRAMES_PER_SEC = 100`; over budget → drop and increment `droppedFrames` (a metric, not an error).
- **Spoofing**: the page can forge these envelopes. Therefore bridge data is **advisory**: it may add or annotate, never hide (invariant 5 already forbids hiding on a maybe), and in hybrid mode every comment it yields must be confirmed by a DOM row within `DOM_CONFIRM_MS` (§5) before it can affect a count.
- **Isolated side**: `src/transport/ws-bridge.js` (validate, rate-limit, ring buffer of last 200 frames for diagnostics) → `src/transport/ws-parse.js` (pure) → `src/transport/transport.js` (arbiter). Parsing happens in the isolated world, never in the page.
- **Manifest diff (dev build only)**: add the MAIN-world entry above; **add no permissions**; do **not** add `src/transport/*` to `web_accessible_resources` (nothing is dynamically imported). Ship build keeps today's manifest untouched.

---

## 4. Q2 — Schema, discovery, fixtures

**Schema: UNKNOWN.** Plausible candidates, all unconfirmed: plain JSON frames; Socket.IO/engine.io (`42["event",{…}]`); Phoenix Channels; protobuf/binary; Firebase/RTDB sync protocol; or **no WebSocket at all** (SSE / long-poll). I will not guess — one 60-second observation settles it (below).

**Discovery workflow (no code first, no risk to a real broadcast):**
1. **Experiment 0 (60 s, zero code).** Private test broadcast (no audience). DevTools → Network → **WS** filter. Record: is there a socket? host? `Sec-WebSocket-Protocol`? are frames text or binary? is the payload JSON? does it contain comment text and an `id`? Check the row's **Initiator** to see whether a Worker opened it. **If there is no socket, A and C are dead and B is the answer — decide this before writing a line.**
2. **Experiment 1 (delete/feature/reconnect, 5 min).** On the same test broadcast: post a comment from a second account, delete it, star it, click *show comment*, then DevTools → Network → **Offline for 30 s → back online**. Watch whether delete/star/feature produce distinct frames and whether reconnect produces a history burst. This is the entire evidence base for §5/Q3.
3. **Only then, a dev-only capture build** (`manifest.dev.json`, never published): `WS_CAPTURE_MODE = "shape"`.
4. **Shape-descriptor capture — values never leave the page.** For each frame emit only `{jsonType, keyNames[], arrayLengths, valueClass}` where `valueClass ∈ {num, bool, null, empty, persian_text, latin_text, id_like, ts_like, url, other}`. Buffer in memory; flush to `chrome.storage.local` as JSONL; operator exports from a dev-only popup button. No comment text, no handles, no ids are ever stored at this stage.
5. **Real-text fixtures**: hand-pick ≤ 20 frames; replace every string with synthetic Dari from `test/mock-comments.js`; handles → `@test.user1`; ids → random base64 of identical length; timestamps rebased to a fixed epoch. Commit as `test/fixtures/ws-frames.sanitized.json` with a header `{sanitized:true, source:"private test broadcast", note:"no real viewers; strings replaced"}`. **Human reads the diff before `git add`.** This mirrors the existing precedent `captures/streamyard-live-dom.json` (`"sanitization"` field).
6. Never capture on a real broadcast; never commit anything captured from one.

**Parser contract — `src/transport/ws-parse.js` (PURE: no DOM, no `chrome.*`, Node-importable):**

```js
// IN : raw (string) | { data: string, isBinary: true, head: "hex" }, ctx = { now, platformFold }
// OUT: one of (never throws):
//   { kind:"comment",  comment:{ id|null, handle, platform, displayText, timestamp, source:"ws" } }
//   { kind:"comments", comments:[…], complete:boolean }        // backfill / batch dump
//   { kind:"delete",   id } | { kind:"update", id, comment }
//   { kind:"feature",  id, on:boolean } | { kind:"star", id, on:boolean }
//   { kind:"lifecycle",state:"open"|"close"|"error", url }
//   { kind:"ignore" }                                          // presence, ack, heartbeat, known-noise
//   { kind:"unknown", shape:string, reason:string }            // anything else
```

Rules:
- `platform` must be folded through the same normalizer that produces v1's DOM values (`"Youtube"` alt → `youtube`, `src/dom.js:97`), or `identityKey` (`src/state.js:39`) diverges between sources and every count/one-question decision silently changes when the source flips.
- `timestamp` = server/created-at field if present **and** plausibly in the past 24 h, else `ctx.now`. Then clamp: `ts = Math.min(ts, now)` and **enforce a non-decreasing ingest clock** per stream — `ts = Math.max(ts, lastIngestTs)`. This matters: `isContinuation` (`src/grouping.js:116`) rejects only `gap > limit`, so a **negative gap passes the window test** and a late-arriving older frame would be merged as a continuation. The core stays untouched; the clock discipline lives in the transport.
- A frame is only `kind:"comment"` if **both** handle and text are non-empty — the same contract `dom.extractComment` uses when it returns `null` (`src/dom.js:146`).
- Malformed/truncated/binary-without-a-decoder → `{kind:"unknown"}` with a stable `shape` key (e.g. `"binary:op=2:len>0"`) so the unknown-rate metric is comparable across runs.
- Tests: `test/ws-parse-test.js`, added to `npm test`. Asserts (a) one fixture per event kind, (b) fuzzed/truncated frames never throw and always return `unknown`, (c) an **equivalence test**: replay `test/fixtures/replay-*.json` comments through the parser path and assert `identityKey` + `matchKey` are byte-identical to the DOM path's — this is the machine-checkable form of "the two sources agree".

---

## 5. Q3 — Event semantics (my lens; the core of this review)

Framing fact that drives the whole table: **v1's core is a fold over a monotonic, append-only, arrival-ordered stream.** `processComment` (`src/grouping.js:263`) mutates state and has no un-merge, no un-collapse and no removal: `mergeContinuation` concatenates text irreversibly (`:148`), `collapseOnto` only increments (`:122`), `hasPrimaryQuestion` is never cleared except in `undoAsGreeting` (`:397`), `unregisterSignature` refuses whenever `count > 1` (`src/dedup.js:142`). And `state.signatures` is **unbounded** — only `recentKeys` is capped at 100 (`src/dedup.js:176`). Every event below is therefore a request the core *cannot* honour retroactively; the burden lands on the transport/view layer.

| Event | Expected semantics | How to detect | Action in the custom panel | If absent → fail-open rule |
|---|---|---|---|---|
| **New comment** | Append-only, ordered by arrival | Socket frame → `kind:"comment"`; DOM → MutationObserver (v1) | Render at the bottom; run `processComment` **unchanged** | n/a — this is the base case |
| **Backfill / history dump on (re)connect** | A batch of *past* comments, oldest→newest, possibly hundreds | `kind:"comments"` with `complete:false`, or >5 comments inside 250 ms, or the first N frames after `lifecycle:open` | **Ingest, do not announce.** Feed chronologically with real timestamps into `state` so dedup/counts are warm, and mark every resulting decision `render:false`. Bound the seed to `BACKFILL_LOOKBACK_MS` (default 30 min) — older items are discarded entirely | **If we cannot tell a dump from live traffic, treat every comment from a socket that opened >60 s ago as backfill for the first 500 ms.** No detection at all ⇒ stay on DOM (B), which has no backfill by construction |
| **Why the lookback matters** | Seeding is *semantically right* (one question per person← Write specs/counsel/hy4-preview.md
Wrote file successfully.

Answer written to `specs/counsel/hy4-preview.md` (it previously held a truncated transcript from an earlier run of mine, so I replaced it with the deliverable).

**Verdict:** Adopt **B** (DOM observer + custom clean panel) now; **adapt C** only as "DOM-authoritative, socket-enriching"; **reject A** — the socket is pre-moderation raw transport, the DOM is post-moderation rendered truth, so a socket-fed panel shows comments StreamYard deliberately doesn't render and the teacher's #1 action (feature) then has no native row to click.

Q3 highlights (my lens), all grounded in the code you named:
- **Backfill** is the worst hazard: the core is an append-only fold (`grouping.js:263` — no un-merge, no un-collapse, `hasPrimaryQuestion` never cleared), so a reconnect history dump must be **ingested with `render:false`**, chronologically, bounded to a 30-min lookback, or it floods the panel and poisons `recentKeys` (cap 100) and the LLM's 30-comment context.
- **Out-of-order delivery is a real bug path**: `isContinuation` only rejects `gap > limit` (`grouping.js:116`), so a *negative* gap passes — the fix is a monotonic ingest clock in the transport, not a core change.
- **Deletions of the collapsed group's representative** lose the question; survivors already exist in `entry.duplicates` (`dedup.js:124`) for promotion.
- **The socket's real prize isn't the text — it's stable ids and true timestamps**, which would fix v1's raw-text fingerprint (`content.js:137`) and `Date.now()` clock (`dom.js:165`). That's the enrichment worth capturing, and it doesn't require owning the feed.

Two things the brief missed that decide the whole question: nobody has verified a WebSocket exists (60-second DevTools survey, step 0), and **the native comments tab must stay mounted or the feature proxy dies** — the scroller unmounts every row when the aside switches tabs.
d the native row after clicking (unknown attribute — experiment) | Mirror a "روی پخش" pill on the panel row. **Invariant: never hide or collapse the currently-featured row** — hiding it can strand the un-feature control | Cannot read state ⇒ optimistic pill on a *successful* click only, never a permanent claim |
| **Starred** | Pin/bookmark state | `kind:"star"`, or `button[aria-label="Star comment"]` state | Proxy + mirror | Same as feature |
| **Moderation actions** (hide / block / report via `Comment actions`) | Destructive, menu-driven, per-platform | StreamYard menu; likely not a socket event we can replay safely | **Do not proxy in MVP.** The teacher does these in the native panel | Absent by design — the native panel keeps that capability |
| **Duplicate / replayed delivery** | The same comment delivered twice (reconnect replay, at-least-once transport) | Same id (or same `platform::foldHandle::matchKey` within TTL) seen again | Drop the second silently. **Under-deduplicating is the safe direction** (teacher sees two rows); over-deduplicating inflates "asked N times" | No id ⇒ short-TTL fingerprint seen-set (60–120 s). Never *hide* on the basis of a dedupe guess |
| **Out-of-order delivery** | Late frame with an older timestamp | `ts < lastIngestTs` | Clamp to a non-decreasing ingest clock (Q2). Do **not** let a negative gap reach `isContinuation` | Clock is unknown ⇒ use arrival time (`Date.now()`), i.e. today's DOM behaviour |
| **Ordering / replay after reconnect** | Chronology may be violated | Monotonic `seq` if the protocol has one | Sort within a 250 ms coalescing window by `ts` before ingest | No `seq` ⇒ arrival order; accept |
| **Stable per-comment id** | The key that makes everything else reliable | Look for an id field in Experiment 0/1; verify it also appears in the DOM | Key the panel's row registry and v1's `liveByFingerprint`/`decisionByFingerprint` (`src/content.js:131`) on it instead of the raw-text fingerprint at `:137` — this alone fixes real v1 recycling fragility | No id ⇒ keep the fingerprint, and switch it to `platform::foldHandle::matchKey` (ZWNJ/harakat-proof); re-validate before every click (Q4) |
| **Platform / destination metadata** | Feeds `identityKey`; must match the DOM's vocabulary | `platform` field; DOM: `img[alt]` (`src/dom.js:97`) | Fold to the same strings as the DOM path; assert equivalence in tests | Mismatch ⇒ **treat the sources as incompatible and stay on DOM** |
| **Room / broadcast / session metadata** | Which broadcast this socket belongs to; when it ends | Subscribe frame (`dir:"out"`) or a join/room frame | Key session state on broadcast id; reset on change (v1 already rebuilds on container replacement, `src/content.js:290`) | No id ⇒ reset on socket URL change and on SPA route change; when unsure, keep state (losing counts is cosmetic, losing a question is not) |
| **Pre-moderation / held / filtered / destination-off** | Comments the socket carries but StreamYard **does not render** | Socket comment with no DOM row after `DOM_CONFIRM_MS` (1500 ms) | Render it **visibly flagged and non-actionable** ("این نظر در ستون اصلی نیست"), never collapsed, never counted until confirmed | This is the structural argument against A: without DOM authority the teacher reads and tries to feature a comment that does not exist natively |
| **Flood / backpressure** | Bursts (Super Chat, raids) | >500 frames/s sustained 2 s | Coalesce; never block the render loop; DOM stays authoritative | Drop beyond the budget and count `droppedFrames` |
| **Broadcast end / studio close** | Socket closes for good | `lifecycle:close` + route leaves the studio | Freeze the panel; keep the last state readable; no error surfaces | Same as today's missing-container behaviour (fail-safe, one `[Ṣafwa]` warning) |

**Net:** of the fourteen non-trivial events above, **B (DOM) already answers nine correctly by inheritance** (deletion, moderation, ordering, pre-moderation, platform, destination-off, session boundary, flood, lifecycle) and needs no detection logic at all. A/C must invent all nine. That asymmetry is my recommendation.

---

## 6. Q4 — Feature proxy

**Mapping.** Prefer a stable socket id when one exists. Otherwise fingerprint — and note v1's current fingerprint is `platform \0 handle \0 displayText` on **raw** text (`src/content.js:137`); it should become `platform::foldHandle(handle)::matchKey`, which survives ZWNJ/harakat/recycling. Panel rows hold `{ fingerprint, id?, el? (native row, weak), lastSeen }`.

**Click forwarding (B / DOM path — trivially reliable).**
1. If `el` is still connected, **re-read handle + text from that element and compare to the stored fingerprint.** A recycled row now shows a different comment; clicking it would feature the **wrong question on air**. This validation is mandatory, not optional — the scroller recycles (`captures/streamyard-live-dom.json`: `mayBeRecycledByVirtualScroller: true`).
2. On mismatch (or no `el`), search `dom.collectCommentNodes(container)` for a row matching the fingerprint. The DOM path already maintains exactly this machinery (`liveByFingerprint`, `isLiveHolder`, `retargetDecision` — `src/content.js:131-167`).
3. Click `button[data-testid="show-comment-button"]` inside the validated row. Same pattern for `button[aria-label="Star comment"]`. **Do not proxy `Comment actions`.**

**Virtualized-away fallback (the interesting case).** The scroller renders ~10 rows; a comment 200 back is not in the DOM at all. Fallback: **scroll the native scroller to bring it into the window, wait two frames, validate, click** (`revealAndClick(fingerprint)`), bounded to one sweep (~150–400 ms). This is safe because **the native comments panel is studio UI, not broadcast output** — scrolling it cannot appear on air. If a full sweep finds no match, the comment is genuinely absent from the native feed (deleted, held, or from a destination the teacher turned off): **disable the feature button on that panel row and say so in Dari**, rather than failing silently at the worst possible moment.

**Edge cases.**
- *Same text + handle in two native rows*: keep a per-fingerprint queue of candidate rows, consume one per click (newest first), always re-validate text before clicking.
- *Socket shows a comment the DOM hasn't rendered yet*: queue the intent, retry on each container mutation for up to 2 s, then apply the pre-moderation label. Never a silent no-op.
- *Feature state reflected back*: if the click succeeded and the row existed → optimistic "روی پخش" pill; mirror real state once we learn how to read it (experiment); never hide a featured row.
- *The teacher collapses/hides the native aside or switches the tab to Guests*: **all native rows unmount and the proxy dies.** Any custom-panel design must keep the comments tab mounted — another reason the panel should not encourage hiding the native list, and a reason a **separate** window/side panel is safer than an in-page dock for phase 2.

**UX cost, stated honestly:** in B the proxy is ~0 ms and invisible. In the virtualized fallback it costs 150–400 ms and a visible jump in the native list (off-air). In the pre-moderation case the teacher cannot feature at all and is told so. That last cost is exactly why the socket cannot be the sole source.

---

## 7. Q5 — Failure model

Central mechanism (cheap, measurable, and the reason C is safe at all): a **divergence metric** — over a rolling 120 s window compare comments ingested from the socket against new rows the DOM observer saw. `|ws − dom| / max(1, dom) > 0.25` ⇒ demote the socket to enrichment-only.

| Failure | Signal | Threshold → fallback | Teacher sees |
|---|---|---|---|
| Patch blocked / overwritten / CSP | No `lifecycle:open` from any socket | No socket within **45 s** of the studio route → stay on DOM, log one `[Ṣafwa]` line | Nothing; v1 behaviour |
| Socket absent (no WS, or transport is SSE/Firebase) | Same as above | Same | Nothing |
| Schema changed / undecodable | `kind:"unknown"` rate | >60 % of the first 50 comment-ish frames, **or** >30 % over any rolling 100 → demote | Panel switches to the native/DOM look; one dismissible Dari line |
| Parse-error spike | ≥5 consecutive `unknown` frames after a clean period | Demote immediately, keep the last 200 frames in the ring buffer for the operator | Native look |
| Bridge silent while the feed moves | No frames for **30 s** **and** DOM row count grew ≥1 | Demote; socket is not carrying comments | Native look |
| Divergence / pre-moderation drift | Rolling 120 s divergence | >25 % → enrichment-only (ids/timestamps only, no rendering, no counting) | Native look |
| Frame flood | Sustained >500 frames/s for 2 s | Drop to sampling, keep DOM authoritative; count `droppedFrames` | Nothing |
| Duplicate delivery inflating counts | Same id/fingerprint twice within TTL | Drop silently; if ws count for a signature exceeds DOM-observed copies by ≥2, stop trusting ws for hide/count | Counts may be lower (safe direction) |
| Memory growth (3 h + backfill) | `state.signatures.size` | >5000 → stop seeding backfill, keep live ingest; cap/evict oldest | Nothing (note: `signatures` is **already** unbounded in v1 — worth fixing independently) |
| LLM / Worker down | `fetch` timeout | Already handled: `LLM_TIMEOUT_MS: 8000`, regex decision stands | Dimmed rows stay visible |
| Panel document dies (side panel unloaded) | Port disconnect | Re-attach and re-request a snapshot from the content script, which keeps **all** state | Brief repaint, counts intact |
| Everything above at once | — | `html.safwa-disabled` CSS gate (already exists, `src/content.js:89`) | The unmodified native feed |

Rule for every row: **the panel never blocks, never stalls and never goes blank.** The worst acceptable outcome is v1's look.

---

## 8. Q6 — MVP vs over-build

**Ship (provable in one live session):**
1. `src/panel/` — clean custom panel fed by the **existing** observer (`dom.extractComment → grouping.processComment → panel.render`). No change to the core.
2. In-page dock inside the comments aside, **not** inside the virtualized `<ul>`; native list stays mounted, so the feature proxy stays real.
3. Feature + star proxy with mandatory re-validation before every click, plus the `revealAndClick` scroll-sweep fallback.
4. `platform::foldHandle::matchKey` as the row fingerprint (replaces `src/content.js:137`'s raw-text key).
5. A Dari "row missing" state for the no-native-row case, and "never hide the featured row".
6. Tests: `test/panel-render-test.js` + `test/feature-proxy-test.js` (stale-row click must **not** fire) added to `npm test`.

**Defer:** socket capture of any kind; side panel / separate window; service worker; `storage.session`; offscreen; DNR; deletion, edit, moderation and backfill semantics (B inherits or doesn't need them); cross-tab coordination; any `chrome.debugger`-based approach.

**Flags / rollout.**
- `CONFIG.COMMENT_SOURCE = "dom" | "websocket" | "hybrid"`, **default `"dom"`**. This is an engineer knob in `config.js`, not a popup control — the teacher still sees only the four toggles + reset.
- `CONFIG.WS_ENABLED` gates the MAIN-world script's *effect*; the tap itself ships only in `manifest.dev.json`. **The Web Store build must not contain `src/transport/ws-main.js`** — a MAIN-world WebSocket patch reads as surveillance to a store reviewer and is the likeliest path to a rejected update.
- **Rollback without reload:** `chrome.storage.local.safwaSource = "dom"` flips the arbiter; the watchdog auto-demotes on any §7 threshold; master off already restores the native feed via CSS.

**Evidence that flips the default (all four, in order):**
1. Experiment 0 shows a text/JSON socket carrying comment text **with a stable id**, opened by the main frame (not a Worker).
2. A 30-minute dual-run where socket and DOM produce **identical** `(identityKey, matchKey, order)` for ≥99 % of comments, and the socket is never later than the DOM.
3. Zero cases where the socket had a comment the DOM never rendered within 1.5 s (i.e. no pre-moderation drift), and zero cases where the DOM rendered one the socket missed.
4. One live session on `hybrid` with the kill-switch **deliberately exercised** mid-stream, ending on the v1 look with no lost question.

---

## 9. Invariant #1 decision record

**AMEND** (do not reject socket observation outright; do not leave the invariant as-is, because as written it silently forbids the enrichment path that would fix real v1 fragility).

Replacement wording for `CLAUDE.md` invariant #1:

> **1. There is no StreamYard API.** There is no API, webhook or SDK, and we never call StreamYard endpoints. Comments are read from the page: from the **DOM** (`src/dom.js` + MutationObserver) as the authoritative source of what is visible and actionable, and — only when `CONFIG.COMMENT_SOURCE` allows and only in the dev build until the flip-evidence exists — from a **read-only tap on the page's own WebSocket** (`src/transport/ws-main.js`). The tap never sends, never modifies a frame, and never assumes a schema: any frame it cannot parse is `unknown` and is counted, not guessed. **The DOM is the arbiter.** Socket-derived data may annotate, supply ids/timestamps, and pre-warm matching state; it may never hide a comment, increment a count, or drive a feature action unless the DOM agrees. Any sustained disagreement falls back to the DOM path (see §7 of `specs/counsel/hy4-preview.md`).

Add as invariant #1a: **"The socket is a tap, never a mouth."**

Also worth recording in the v1 spec: `state.signatures` is unbounded (pre-existing, independent of v2), and `isContinuation` treats a negative gap as inside the window (`src/grouping.js:116`) — fine for the DOM's monotonic clock, a hazard for any transport that can deliver out of order.

---

## 10. Risks ranked (likelihood × impact → cheapest mitigation)

| # | Risk | L×I | Cheapest mitigation |
|---|---|---|---|
| 1 | **Pre-moderation drift**: socket shows comments StreamYard hides → teacher reads/tries to feature a non-existent comment | M-H × **H** | DOM-authoritative arbiter + `DOM_CONFIRM_MS` (1.5 s) before a socket comment earns a count or a feature button |
| 2 | **Backfill dump** floods the panel with hours-old questions; poisons `recentKeys` and the LLM's 30-comment context | **H** × **H** | Ingest-only backfill, `render:false`, 30-min lookback, seeded chronologically |
| 3 | **Duplicate / out-of-order delivery** → inflated counts, bogus continuation merges | M × M | Monotonic ingest clock + id/fingerprint seen-set with 60–120 s TTL; under-deduplicate on purpose |
| 4 | **No stable id / recycled row** → feature clicks the wrong comment on air | M × **H** | Re-read handle+text from the element and compare before every click; `revealAndClick` sweep when virtualized away |
| 5 | **Transport isn't a usable WebSocket** (binary/protobuf/Firebase/SSE, or a Worker-owned socket) | M × **H** | 60-second DevTools survey before any code is written |
| 6 | Patch blocked/overwritten; studio's real socket disturbed | M × **H** | Page handler invoked first, everything in `try/catch`; 45 s no-socket timeout → DOM |
| 7 | **Web Store review** rejects a MAIN-world WebSocket patch (reads as surveillance) | M × M | Ship DOM-only; socket code lives only in `manifest.dev.json` |
| 8 | Deleting the **representative** row of a collapsed group loses the question | L-M × **H** | Promote a survivor from `entry.duplicates` (`src/dedup.js:124` already stores them) |
| 9 | Unbounded `state.signatures` over 3 h + backfill | L-M × M | Cap at 5000 with oldest-first eviction (fix in v1 regardless) |
| 10 | Panel in a separate document loses session state mid-broadcast | L × M | Keep **all** state in the content script; the panel is a dumb view over a port |
| 11 | Two studio tabs / two sockets double-ingest | L × M | One arbiter per tab, keyed on broadcast id; DOM remains the dedupe point |

---

## 11. What this brief missed / open questions

1. **The brief assumes a WebSocket carries comments at all.** If StreamYard uses SSE, long-polling, or a Firebase/RTDB socket with a proprietary sync protocol, A and C are infeasible and B is the only answer. *Cheapest experiment: 60 s, DevTools → Network → WS, private test broadcast.* **This should have been step 0 of the brief.**
2. **It never frames the socket as pre-moderation vs the DOM as post-moderation.** That single distinction is worth more than the whole capture design, and it is the argument against A. *Experiment: during a test broadcast, block/hide a comment in StreamYard and see whether the socket still delivered it.*
3. **Timestamps.** v1 uses arrival time (`src/dom.js:165`); the brief never says the socket's `createdAt` should replace it, never notes that this changes continuation math (60 s window), and never notes that mixing sources mixes clocks. *Experiment: compare a frame's timestamp field against `Date.now()` at arrival for 20 comments.*
4. **Session boundary for a panel in another document.** A side panel / separate window is a different document that Chrome may unload at any time; today's per-tab closure would have to move, and state must still reset per broadcast. *Experiment: open a side panel, let it idle 20 min, check whether the document survived.*
5. **The teacher must keep the native comments tab mounted** or the feature proxy dies (panel unmounts all rows). Any design that tempts her to collapse the aside breaks the #1 action. *Experiment: switch the aside to Guests and confirm the comment rows leave the DOM.*
6. **Multi-tab / duplicate studio sessions** are not mentioned. *Experiment: open the studio twice, count sockets.*
7. **What else the teacher does in the native panel** — scroll-back history, platform badges, hide/block, starring for later. A custom panel that is not a superset is a regression even if it is prettier. *Cheapest experiment: 10 min of the teacher narrating her last session against a screen recording.*
8. **Chrome Web Store policy and ToS** for re-rendering a private socket are not mentioned (see risk 7). *Cheapest experiment: read the CWS "Limited use"/"data handling" review guidance before writing the patch.*
9. **Backfill vs the LLM context** is not mentioned: seeding history pushes old keys into the 100-key `recentKeys` buffer, so `collectRecentQuestions(30)` would feed Gemma ancient history and degrade the semantic layer that currently scores 68/68. *Experiment: after a simulated 300-comment backfill, assert the last 30 keys are the 30 newest comments.*
10. **Criterion 7 (native featuring still works) is still untested live** (§2.7). Any custom panel makes it *more* central, not less. *Cheapest experiment: one live broadcast, feature three comments through the panel, confirm on the recorded output.*
