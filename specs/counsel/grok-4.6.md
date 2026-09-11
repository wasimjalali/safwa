I'll read the full brief and the repo files it cites so the architecture verdict is grounded, not assumed.I have the spec and invariants. Next I’ll read the live DOM capture, QA report, and the current content/UI wiring so the red-team case is tied to real code.I need the comment object contract, live DOM capture, and debug history so the anti-A case is specific, not generic.I need current Chrome extension docs for MAIN-world scripts and side panels, so capture mechanics stay accurate.# Ṣafwa v2 Architecture Counsel — Red-team #2

Lens: argue the strongest case **against A** (WebSocket capture + custom panel) and against the Gemini MV3 scaffold. Then say what evidence would flip that. Q1–Q6 and the Section 7 contract are answered inside that framing.

---

## 1. Executive verdict

**Reject A as the v2 architecture.** The teacher's complaint is that in-place badges are not clean enough. That is a **render** problem. A custom panel solves it. Tapping StreamYard's sockets does not. v1 already has a live-tested DOM pipeline, a pure matching core, and a spec that named a "Clean Question Queue" as the in-place fallback (`streamyard-question-filter-spec.md` §10). **Adopt B**: keep `dom.extractComment → grouping.processComment`, render a custom in-page queue, leave the native panel in the DOM so featuring stays native. **Adapt D** as a same-week CSS probe (ghosts at 25% opacity are still readable; that may be most of the complaint). **Reject C** as the ship shape: it is A plus B plus a dual-path state machine, which is how you lose a question on air.

Confidence: **high** that A is the wrong v2 bet with current evidence. **Medium** on B's feature-proxy details, because criterion 7 (native featuring) was never live-tested (`qa-screenshots/live-2026-09-10-cli/REPORT.md` scenario 9). **Unknown** whether comments even travel on a WebSocket. That is a 5-minute DevTools check, not a reason to amend invariants or add a MAIN-world hook.

What would change my mind on A is listed at the end of §11. Until those facts exist, A is a category error with a new way to corrupt the studio.

---

## 2. Verdict table

| Item | Decision | Reason |
|---|---|---|
| **A. WS capture + custom panel** | **Reject** | Solves the wrong layer. MAIN-world `WebSocket` patch can see studio control-plane frames (auth, signaling), can throw in the page JS heap, and still cannot feature a comment. Comment schema, ids and even the transport kind are unknown. |
| **B. DOM observer + custom panel** | **Adopt** | Cleanliness is the panel. Source of truth stays the proven pipeline in `src/content.js`. Native `show-comment-button` remains in the tree. Fail-open is the v1 look, not a second parser. Spec §10 already described this fallback. |
| **C. Hybrid WS-primary, DOM fallback** | **Reject** (as ship architecture) | Two ingest paths, two clocks, reconnect backfill vs `Date.now()` in `src/dom.js`, fingerprint collisions, mid-stream UI flip. The "never lose a question" rule becomes a distributed-systems problem the teacher cannot debug on air. |
| **D. In-place polish** | **Adapt** (probe, not destination) | One CSS session may remove most of the dirt (`styles.css` `.safwa-collapsed { opacity: 0.25 }`). If the teacher still wants a logical-question list (joined text as one card, no ghosts), that is B, not more badge tweaking. |
| **Panel host: in-page in the comments aside** | **Adopt** | Teacher reads comments next to StreamYard controls. Panel shares the tab, the session state (`createState()` in `src/content.js`) and the native feature buttons. |
| **Panel host: `chrome.sidePanel`** | **Reject** | Lives outside the studio chrome. Fullscreen/broadcast layout will hide or fight it. Forces matching state out of the tab into messages. First step toward a service worker we do not need. |
| **Panel host: `chrome.windows.create`** | **Reject** | Second window for a non-technical teacher on a live 1–3h show. Featuring still has to jump back into StreamYard. |
| **Service worker** | **Reject** | Matching state is per-tab, per-broadcast, in a content-script closure today. MV3 workers die after idle. Putting session Maps there (or round-tripping them through `storage.session`) adds loss modes v1 does not have. LLM `fetch` already works from the isolated world (`src/llm-classifier.js`). |
| **Offscreen document** | **Reject** | No clipboard, audio, canvas or geolocation job. Gemini listed it because templates list it. |
| **Declarative Net Request** | **Reject** | DNR cannot read WebSocket (or fetch) bodies. It cannot implement capture. Adding `declarativeNetRequest` is permission theater. |
| **`chrome.storage.session`** | **Reject** (for matching state) | Survives worker restarts, not the thing we have. Session Maps in `src/state.js` are already memory-only and correctly die with the tab. |
| **`chrome.storage.sync`** | **Reject** | Settings are local, one machine. Sync quota is tiny. Teacher is not a multi-browser operator. Keep `chrome.storage.local` as today (`STORAGE_KEYS` in `src/config.js`). |
| **Gemini `messaging-bus.js` / `options.html` / file-tree reshuffle** | **Reject** | Cargo-cult MV3. Ṣafwa is one content script, one popup, one Worker. Do not restructure `src/` to look like a template. |
| **`scripting` permission** | **Reject** | Static `content_scripts` with `world: "MAIN"` (Chrome 111+) would be the WS injection path if A were ever built. Do not add `scripting` "just in case." |
| **MAIN-world WS hook (as shipped code)** | **Reject** | See Q1. Allowed only as an operator-gated DevTools/discovery capture, not as runtime. |

---

## 3. Q1 — Capture mechanics

A is rejected. If a later experiment forces a hook, this is the **only** MV3-legal shape. It is still a bad product bet.

**Fact:** isolated-world `src/content.js` cannot see the page's `window.WebSocket`. Chrome documents this: content scripts default to `world: "ISOLATED"`; `world: "MAIN"` shares the page heap and has **no** `chrome.*` APIs ([content_scripts manifest](https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts), [isolated worlds](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)). DNR cannot read WS frames. `webRequest` cannot read WS bodies in MV3. `chrome.debugger` would show an infobar on a live show. So the only programmatic capture is a MAIN-world constructor patch at `document_start`.

That is also why A is dangerous: it is the first Ṣafwa code that **shares a JS heap with StreamYard**. v1 cannot throw inside their React runtime. A can.

### If you still built it (do not ship)

**Files (not in `web_accessible_resources` as a page-fetchable hook if you can avoid it):**

| File | World | Role |
|---|---|---|
| `src/page-ws-hook.js` | MAIN, classic, `document_start` | Patch `window.WebSocket` only. No parse. No `chrome.*`. Forward envelopes via `window.postMessage`. |
| `src/content.js` | ISOLATED, existing | Receive, rate-limit, hand to parser. Keep DOM observer as the real ingest. |
| `src/ws-parser.js` | Pure, Node-testable | `parseTransportFrame` → events or `{ok:false}`. Analog of `dom.js`, not of `grouping.js`. |
| `src/config.js` | Existing | `WS_URL_ALLOWLIST`, `BRIDGE_SOURCE`, size/rate caps. Protocol field names live here the way selectors do. |

**Manifest sketch** (illustrative, not a change to make):

```json
"content_scripts": [
  {
    "matches": ["https://streamyard.com/*", "https://*.streamyard.com/*"],
    "js": ["src/page-ws-hook.js"],
    "run_at": "document_start",
    "world": "MAIN"
  },
  {
    "matches": ["https://streamyard.com/*", "https://*.streamyard.com/*"],
    "js": ["src/content.js"],
    "css": ["styles.css"],
    "run_at": "document_idle"
  }
]
```

No `scripting` permission. No service worker. Do **not** inject a `<script src="chrome-extension://…">` tag: page CSP can block it, and it is the older, noisier path. Do **not** use `chrome.scripting.executeScript`.

**Patch rules (MAIN):**

1. Run at `document_start` so the patch beats StreamYard's bundle. If their module does `const WS = window.WebSocket` after we patch, we still wrap instances. If they close over the native constructor **before** our script (extension inject race, or a worker), we miss those sockets. **Unknown until measured.**
2. Wrap the constructor, `WebSocket.prototype.send`, `addEventListener('message')` / `onmessage`, `onclose`, `onerror`. Copy statics (`CONNECTING`, etc.). Use `new Original(url, protocols)` so `instanceof` mostly holds.
3. **Default-deny by URL.** Until discovery names a comment socket path, forward nothing. A blanket hook on `streamyard.com` will see signaling, guest control, possibly tokens. That is a data-scope expansion DOM observation does not have.
4. Ignore binary frames until a fixture proves they are comments. Do not `eval`. Do not `JSON.parse` in MAIN. Pass `{kind:'text'|'binary', url, data, t}` and let isolated parse.
5. Reconnects: a new `WebSocket()` hits the patched constructor. SPA route changes that do **not** reload the document keep the patch (`captures/streamyard-live-dom.json` already notes SPA navigation). A full reload re-injects. A StreamYard **worker** or `RTCDataChannel` carrying comments would be invisible. **Unknown.**
6. Existing sockets opened before the patch: `document_start` is supposed to prevent this. If discovery finds a pre-existing socket, the hook is already too late for that page load.

**Bridge envelope** (isolated listens; MAIN only posts):

```js
{
  source: "safwa-ws",
  v: 1,
  seq: 1,
  t: 0,
  dir: "in" | "out",
  url: "wss://…",
  kind: "open" | "text" | "binary" | "close" | "error" | "hook-ok" | "hook-lost",
  data: "<string or null>",
  bytes: 0
}
```

Isolated accept rules, matching Chrome's own page-bridge example: `event.source === window`, `event.data.source === "safwa-ws"`, `typeof seq === "number"`. Origin is the page origin either way. **This is not a security boundary against StreamYard.** If StreamYard is XSS'd they can spoof comments into Ṣafwa. They can already paint the DOM. Rate-limit (e.g. 200 envelopes/s, 64 KiB/frame); drop and increment a counter; do not stall the feed.

**What A still fails to do after a perfect hook:** click `button[data-testid="show-comment-button"]`. Capture is not featuring. See Q4.

**Red-team bottom line for Q1:** the mechanics are known. The problem is that doing them is how Ṣafwa stops being a DOM decorator and becomes a studio-protocol parasite. v1's fail-safe ("do nothing visible") does not exist in MAIN. A thrown wrapper can break StreamYard's own comments, guests or go-live. Invariant 4 (`CLAUDE.md`: fail safe, never corrupt the feed) is not compatible with a production MAIN-world prototype patch.

---

## 4. Q2 — Schema discovery + fixtures

**Do not invent StreamYard internals.** There is no public API (`streamyard-question-filter-spec.md` §2). The live DOM capture documents **no comment id** (`captures/streamyard-live-dom.json`). `extractComment` in `src/dom.js` sets `timestamp: Date.now()` because "StreamYard exposes no reliable per-comment time." That is all we know.

Likely transport is **unknown**. Could be JSON over WS, Socket.IO/Engine.IO (text packets with a type prefix), GraphQL subscriptions, SSE/`EventSource`, `fetch` polling, or comments only materializing in the React tree from a non-WS channel. YouTube chat is **not** a direct client WS into the studio. It is merged by StreamYard's servers. A YouTube-side hook would miss Facebook/Instagram and would be the wrong origin.

### Discovery workflow (no shipped hook)

1. One unlisted studio, comments panel open, DevTools → Network → WS **and** Fetch/XHR. This is the cheapest experiment in the brief. If no WS frame contains a posted Dari comment, **A is dead** and invariant #1 stays.
2. Post one known comment from YouTube. Note arrival in the native row (`PlatformCommentShell__ContentSpan`) vs any WS/XHR payload. Measure lag. If DOM lag is <1s, WS buys the teacher nothing.
3. Repeat for: exact duplicate, continuation fragment, extra question, star, feature (`show-comment-button`), delete/hide if the UI has it, reconnect (toggle network), SPA leave-and-reopen comments tab.
4. Capture **in memory** or a local file **outside git**. Do not commit raw frames. Audience questions are PII. Studio frames may include tokens.
5. Redact before anything lands under `captures/`: handles → `@u1`, `@u2`; text → length + script tag (`fa`) or a folded `matchKey` already in `normalize.js`; strip URLs, ids that look like sessions, JWTs, emails. Keep **shape**: keys, types, which fields are stable. Same sanitization policy as `captures/streamyard-live-dom.json`.
6. Promote only redacted fixtures to `test/fixtures/ws-*.json` (inert). `src/ws-parser.js` is tested in `npm test` the way `test/run-tests.js` tests the core. Runtime must never import `captures/`.

### Parser contract (pure)

```text
parseTransportFrame(raw: string | {url, dir, kind, data}, config)
  -> { ok: true, events: SafwaEvent[] }
   | { ok: false, reason: "unknown" | "malformed" | "unsupported" | "not-comment-socket" }

SafwaEvent:
  type: "comment_new" | "comment_edit" | "comment_delete" | "comment_feature"
      | "comment_star" | "backfill" | "room" | "ignored"
  comment?: { handle, platform, displayText, timestamp, id?, el: null }
```

Output comments must be the **same plain object** `processComment` already consumes (`src/grouping.js`): `{ handle, platform, displayText, timestamp, el, cardEl }`. `el`/`cardEl` stay `null` until a DOM row is adopted. **Do not change decision logic to fit a frame.** If the socket has a server timestamp, still record `Date.now()` as `timestamp` until a fixture proves server time is monotonic **and** comparable across reconnects. Continuation windows (`CONTINUATION_WINDOW_MS: 60000`, `EXPLICIT_CONTINUATION_MS: 180000` in `src/config.js`) will fire wrongly on a history dump stamped as "now."

**Malformed handling:** one `[Ṣafwa]` warning per reason (same `warnOnce` pattern as `src/dom.js`). Count `unknown`/`malformed` in a sliding window (Q5). Never throw into MAIN. Never hide a comment because a frame failed. Fail-open = DOM pipeline.

**Red-team:** a parser written before one redacted fixture is fiction. Gemini's architecture assumes a schema exists. It does not, in this repo.

---

## 5. Q3 — Event semantics

Until discovery, every row except "new comment appearing in the DOM" is **unknown**. Fail-open is "DOM is truth; custom panel is a view of `processComment` decisions."

| Event | Expected? | Detection (if it exists) | Action | If absent / fail-open |
|---|---|---|---|---|
| **New comment** | Yes (product) | DOM: MutationObserver in `src/content.js` (proven). WS: unknown. | `extractComment` → `processComment` → render. | DOM already does this. WS not required. |
| **Stable comment id** | Unknown. Not in live DOM capture. | Attribute on `li` or payload field. Experiment: inspect one live row + one WS frame. | Use as map key for feature-proxy **in addition to** fingerprint `platform\0handle\0displayText` (`src/content.js`). | Keep fingerprint. Collisions: exact same ask from same handle is already a duplicate in `dedup.js`. |
| **Delete / moderate / hide** | Unknown | WS type, or row leaving DOM without recycle. Recycle is **not** delete (`test/content-virtualization-test.js`). | If a real delete is proven, drop from custom panel only when native is gone **and** not a virtualization blank. | Do not remove from the queue because a virtual `li` was reused. Prefer stale-visible over lost. |
| **Edit** | Unknown | CharacterData observer already exists in `src/content.js`. | Re-extract; current fingerprint change looks like a new comment. Do not special-case until a fixture shows in-place edits. | Treat as new text on that row (today's behavior). |
| **Featured / starred** | Partial. Buttons exist (`show-comment-button`, `Star comment`). State in DOM/WS unknown. | Observe `aria-pressed` / class on those buttons (selectors in `config.js` + `dom.js` only). | Reflect a badge on the custom row **after** native state is seen. | Custom panel does not claim featured state. Teacher looks at the broadcast. |
| **Reconnect / backfill** | Unknown, high impact | Burst of "new" comments with old ids/text after `close`+`open`. | Dedup by id or fingerprint **before** `processComment`. Do not stamp backfill as `Date.now()` if that would merge unrelated fragments. | DOM re-attach already rebuilds (`watchdog` in `src/content.js`). WS backfill without this guard poisons continuation. **This alone is enough to reject WS-primary.** |
| **Ordering / replay** | Unknown | Seq numbers vs arrival order. | Render in `processComment` arrival order, same as v1. | Do not sort the teacher's queue by a guessed server clock. |
| **Duplicate delivery** | Likely on any retry | Same id or same fingerprint twice. | `liveByFingerprint` already suppresses reappearance. WS+DOM hybrid **must not** call `processComment` twice. | Another reason C is rejected: double ingest increments `count` (acceptance criterion 1 would lie). |
| **Platform metadata** | Yes in DOM (`img[class*="DestinationAvatar__StyledPlatformIcon"]`, alt `"Youtube"`). | Same as `extractPlatform` in `src/dom.js`. WS field unknown. | Identity is `platform::foldHandle(handle)` (`src/state.js`). Wrong platform splits one person into two. | If WS omits platform, **do not ingest from WS**. DOM has it. |
| **Session / room metadata** | Unknown | Studio id in URL path (debug handoff used `/r4dt5n7vhi`). | Reset on studio change the way `rebuild("reset")` already does. | Do not persist matching state across broadcasts. |

**Red-team:** A custom panel that is WS-primary will go stale the first time StreamYard sends a non-new event we did not implement. The native list will be right. The teacher will be reading the wrong list. B cannot have that bug, because it is a view of the same rows the teacher can still see.

---

## 6. Q4 — Feature-proxy

This is the argument that kills **A as a replacement UI**, even if capture were free.

The teacher's #1 native action is **feature on broadcast**: `button[data-testid="show-comment-button"]` inside each native row (`captures/streamyard-live-dom.json`). Star and "Comment actions" are secondary. There is no StreamYard API to feature. Criterion 7 is in the spec and **was not live-tested**. Badges are `pointer-events: none` (`styles.css`), so v1 *should* pass clicks through. Nobody confirmed a human featured a comment with Ṣafwa on.

If the custom panel **replaces** the native list, featuring becomes our problem. The native list is a virtual scroller: ~10 `li` slots, `position:absolute`, recycled (`captures/streamyard-live-dom.json`, `src/content.js` `retargetDecision`). A comment the teacher wants is often **not in the DOM**.

### Mapping

1. **Preferred key (unknown):** stable comment id, if discovery finds one, stored when `extractComment` runs.
2. **Shipped key (exists):** fingerprint `platform + "\0" + handle + "\0" + displayText` (`src/content.js`). Same map as `liveByFingerprint`.
3. **Joined questions:** custom panel shows **one** card (merged `displayText`). Feature target is `decision.target.firstComment` / the primary row, not the continuation fragment. `ui.js` already treats the original as the representative for duplicates.
4. **Selector isolation:** `SELECTORS.featureButton = 'button[data-testid="show-comment-button"]'` in `src/config.js`. `dom.findFeatureButton(row)` in `src/dom.js`. Panel code must not hard-code that string.

### Click path (B, native panel still in the tree)

1. Teacher clicks Feature on the custom card.
2. Look up `liveByFingerprint` (or id map). If `node.isConnected`, `dom.findFeatureButton(node).click()`.
3. If the row is virtualized away: **do not** invent a scroll-into-view protocol for StreamYard's scroller (scroll parent is unknown). MVP fallback: leave the native panel visible, flash it, Dari label from `CONFIG.LABELS` (new key, not hard-coded), teacher features from the native row they already know. Exact UX cost: **one glance and one native click**, on air, for comments outside the ~10-row window.
4. Do not queue a delayed click for when the row later appears. That can feature the wrong recycled `li`.

### Edge cases

| Case | Behavior |
|---|---|
| Same text/handle in two native rows | Pipeline already collapsed them. Feature the primary. |
| Socket (or panel) shows a comment DOM has not rendered | Feature button **disabled** until a live native row exists. Featuring a ghost is how you put the wrong comment on the broadcast. |
| Feature state reflected back | Only if native button state is observable. Otherwise omit. |
| Star / Comment actions | Defer. Not the #1 action. |
| Custom panel as the only visible list (A's usual sketch) | **Reject.** Virtualized-away comments become unfeaturable without a reverse-engineered scroller. That is a new fragile layer on top of selectors. |

**Red-team:** A that "replaces inline badges" without a proven feature-proxy is a product that can **clean questions the teacher cannot put on screen**. That is worse than dirty badges. B keeps native featuring as the default path and treats proxy as a convenience when the row is already mounted.

**Cheapest experiment for Q4:** with v1 loaded, feature a comment by clicking the native button (criterion 7). Then, in a throwaway console snippet in the **isolated** world, `document.querySelector('button[data-testid="show-comment-button"]').click()` and confirm the broadcast shows it. Then scroll until that row is recycled and try a fingerprint lookup. That is the whole feature-proxy risk, without WebSockets.

---

## 7. Q5 — Failure model

v1 fail-safe is "do nothing visible; native feed untouched" (`src/dom.js`, spec criterion 6, live-verified). Any v2 that **hides** the native list makes a transport miss into a **lost question**. That is the worst failure in the brief. Therefore the native panel stays in the DOM. The worst acceptable outcome is the v1 look (ghosts + badges), which is also the master-toggle path (`html.safwa-disabled` in `src/content.js`).

| Failure | Signal | Threshold | Fallback | Teacher sees |
|---|---|---|---|---|
| MAIN patch missing / overwritten | No `hook-ok` within 2s of load; later `hook-lost`; `WebSocket !==` wrapper | 1 miss at boot, or 1 lost after having been ok | Do not ingest WS. DOM continues. | v1 or B-from-DOM. No toast required at boot. Console `[Ṣafwa]`. |
| No comment socket / comments on fetch/SSE | Discovery: 0 comment frames. Runtime: 0 parsed `comment_new` while DOM extracts ≥1 | 1 DOM comment with 0 WS comment | Disable WS for the session | Native/DOM path. If someone shipped A-primary, this is already a lost-question incident. **Do not ship A-primary.** |
| Schema change | `ok:false` reasons `unknown`/`malformed` | ≥5 in 30s **or** ≥3 consecutive unparsed text frames on the allowlisted socket | Stop WS ingest. DOM continues. Parser tests fail on next fixture refresh. | Same as v1. |
| Bridge silent | Isolated `seq` gap or 0 envelopes while DOM is live | 10s with DOM comments arriving | Stop waiting on WS | v1/B. |
| Frame flood | Envelope rate or bytes | >200/s or >64KiB/frame | Drop WS envelopes, keep DOM | v1/B. Studio stays up because MAIN wrapper must be try/catch around **postMessage only**, never around the native `onmessage` dispatch. |
| Worker / LLM down | Existing `LLM_TIMEOUT_MS: 8000` | Unchanged | Regex decision stands (`applyLlmOverride` never called) | Uncertain rows stay visible. `AUTO_HIDE_ANYTHING_AMBIGUOUS` stays false. **A custom panel must not hide those rows more aggressively than `ui.js`.** |
| Feature button missing | `findFeatureButton` null | 1 click | Dari: feature from native list | Native panel still visible. |
| Selectors stale | Existing `warnOnce` in `dom.js` | Unchanged | Extension does nothing visible | Native StreamYard feed. Custom panel unmounts. |
| Panel throw | try/catch around panel render only | 1 throw | Unmount panel, keep `ui.render` | v1 look. |

Do not add try/catch to swallow matching-core bugs. Spec and `CLAUDE.md` already distinguish fail-safe DOM reads from silenced logic bugs.

**Red-team on C's "fail-open":** a mid-show flip from a clean queue to ghosted native rows is not fail-open. It is a UI crash the teacher has to interpret while answering. Fail-open only works if the native list was **never hidden**.

---

## 8. Q6 — MVP vs over-build

### Smallest winning MVP (one live session)

Ship **B**, flag-gated, default off.

- `CONFIG.PANEL_MODE = "inplace" | "queue"`, default `"inplace"`.
- New `src/panel.js` (browser): render a RTL queue from existing decisions. Labels only from `CONFIG.LABELS`.
- New `dom.findFeatureButton` + selector in `config.js`.
- Native comments panel **stays fully visible and usable**. Queue is an overlay/sibling in the comments aside (`#broadcast-aside-content-comments`), not a replacement.
- Custom card click: feature-proxy if the native row is mounted; otherwise the native row is still on screen.
- Master off (`html.safwa-disabled`) hides the queue **and** the v1 badges, same as today.
- `processComment` / `applyLlmOverride` / matching core **untouched**.
- Tests: view-model function (decision list → queue rows) in `npm test` using `test/mock-comments.js`. No WS parser in the MVP.
- Same-week **D probe**: drop `.safwa-collapsed` opacity (e.g. 0.08) and/or clip ghost text. If the teacher says "this is fine," **stop**. Do not build the queue.

Do **not** put `COMMENT_SOURCE = "websocket"` in the MVP. That flag is how A sneaks in through config. If you need a name for ingest, it stays `"dom"` until the Q2 experiment produces fixtures.

### Defer

WebSocket hook, MAIN world, schema parser, service worker, offscreen, DNR, side panel, extra window, `storage.sync` / `storage.session` for Maps, star/actions proxy, featured-state sync, scroll-into-virtualized-row, hiding the native list, Gemini file-tree, engineer knobs in the popup (already five teacher toggles in `popup/popup.html`, not four).

### Rollback

Flip `PANEL_MODE` to `"inplace"` or master off. No new permissions to unwind. Unlisted store update only after a live pass, and not without the user (project rule).

### Evidence that flips the **panel** default to `"queue"`

One real 1–3h session (not a 21-minute CLI run): teacher prefers the queue; no lost question vs native count; criterion 7 works from native; feature-proxy convenience clicks succeed when the row is on screen; `npm test` green.

### Evidence that would justify a **WS spike** (not a default flip)

See §11. Even then, ingest stays DOM-primary. WS is at most an early-warning, not the feed.

**Red-team:** Gemini's "modern MV3" tree is the over-build. Ṣafwa v1.0.5 is 42 lines of manifest, no worker, tests green, live-tested. v2 should add a view, not a platform.

---

## 9. Invariant #1 decision record

**Reject the WebSocket proposal as runtime architecture. Do not amend invariant #1 for v2.**

Socket interception is "not an official API," but it is still **assuming a private protocol**. That is what the invariant exists to forbid. The live-tested source is the comments panel DOM. The spec is explicit: "the only viable approach is a Chrome extension with a content script that reads StreamYard's comment panel directly from the page DOM" (`streamyard-question-filter-spec.md` §2). A MAIN-world hook is a silent violation if we "just add it" and then tidy `CLAUDE.md` afterwards.

**Keep `CLAUDE.md` invariant 1 as written:**

> **1. There is no StreamYard API.** Comments are read from the page DOM via a content script and a MutationObserver. Do not add code that assumes an API, webhook, or SDK exists.

**Allowed without an amend:** a human DevTools capture during a test studio, redacted fixtures, no runtime hook. That is research, not product.

**If** (and only if) the §11 evidence pack lands, amend later with this wording, not with a vague "we observe the page":

> **1. There is no StreamYard API, webhook, or SDK.** Runtime comment ingest is the comments-panel DOM (`src/dom.js` + MutationObserver). A page-world observation of the page's own transport is not an API and is **not** the primary source. It may exist only behind an explicit off-by-default flag, with a URL allowlist, a pure parser (`src/ws-parser.js`) covered by `npm test`, and mandatory fail-open to the DOM pipeline. Protocol field names live in `src/config.js` the way selectors do. Do not ingest a frame that cannot be mapped onto `{ handle, platform, displayText, timestamp }`.

Also update spec §2 if that amend ever happens. **Do not update it now.**

Invariant 2 stays: feature-button selectors in `config.js` + `dom.js` only. A WS parser would be the transport analog of `dom.js`, not a license to sprinkle payload keys through `content.js`.

---

## 10. Risks ranked

Likelihood × impact, cheapest mitigation. A-specific risks are why A loses.

| Rank | Risk | L × I | Cheapest mitigation |
|---|---|---|---|
| 1 | MAIN-world WS hook observes non-comment studio traffic (signaling, guests, possible tokens). A log or greedy parser leaks it. | Med × **Critical** | Do not ship the hook. Discovery in DevTools only. If ever built: URL allowlist, default-deny, no raw logs, no persistence. |
| 2 | Custom panel becomes the only feed; a missed comment is silent. | Med × **Critical** | Native panel stays visible. Queue is a view. |
| 3 | Feature-proxy clicks a recycled `li` or a not-yet-rendered row → wrong comment on broadcast. | Med × **High** | Proxy only if `node.isConnected` and fingerprint matches. No queued clicks. Criterion 7 live test first. |
| 4 | Reconnect backfill + `Date.now()` poisons continuation (`grouping.js` 60s/180s windows). | High **if WS-primary** × High | Do not make WS primary. If parsing backfill, dedup before `processComment`. |
| 5 | Comments are not on WebSocket (SSE/fetch/worker). Months of A work miss the bus. | **Unknown, prior high** × High | 5-minute Network tab experiment before any code. |
| 6 | MAIN wrapper throws; StreamYard comments or go-live break. v1 cannot do this. | Low–med × **High** | Do not patch page prototypes. |
| 7 | Schema churn on a StreamYard deploy. Second fragile layer beside selectors. | High if A ships × High | Keep one fragile layer (`dom.js`). |
| 8 | Hybrid double-ingest increments duplicate counts / hides a real extra. | High if C ships × High | Reject C. One `processComment` call per real comment. |
| 9 | LLM `same_person` already hid a paraphrase as extra (live report). A "clean" panel that only shows primaries **amplifies** that. Ghosts at least keep text readable. | **Seen live** × High | Queue must show dimmed extras until LLM confirms, same as `ui.js`. Do not make clean mean "hide harder." |
| 10 | CWS / StreamYard ToS: intercepting first-party realtime. Unlisted is still policy-bound. ToS text **unread** (unknown). | Low–med × High (takedown) | Stay on DOM observation. Read ToS before any hook. Privacy policy already covers LLM text; a hook would need a data-scope update. |
| 11 | `chrome.sidePanel` / extra window: teacher loses the queue in fullscreen. | Med × Med | In-page panel only. |
| 12 | Service worker idle kills session Maps mid-broadcast. | High if SW holds state × High | No SW. State stays in the content-script closure. |
| 13 | Invariant 2 leak: panel or hook file copies class names / payload keys. | Med × Med | Selectors and protocol keys only in `config.js` + `dom.js` / parser. |
| 14 | Ghosts at 25% opacity **are** the cleanliness bug. Building a transport to fix CSS. | **High** × wasted weeks | D probe this week. |

---

## 11. What this brief missed / open questions

The brief treats "WebSocket + custom panel" as one proposal. They are two proposals. **Unbundle them.** The panel is the product. The socket is a research hypothesis.

| Gap | Why it matters | Cheapest experiment |
|---|---|---|
| **Do comments travel on a WebSocket at all?** | If no, A is void. | Live studio, DevTools Network, post one YouTube comment, 5 minutes. |
| **DOM lag vs WS lag** | If DOM is <1s, WS has no teacher-facing value. | Same session: timestamp WS frame vs `extractComment`. |
| **Is the cleanliness complaint ghosts, badges, or two-row joins?** | D vs B. Joined questions as **one** card is the real panel win, and it does not need a socket. | Show the teacher (1) opacity 0.08 ghosts, (2) a static mock queue of logical questions (`test/replay.html` is already a visual replay). Ask which they would read on air. |
| **Criterion 7** | Feature-proxy is speculation until a human features with Ṣafwa on. | Teacher click on `show-comment-button` during a 10-minute unlisted stream. Then isolated-world `.click()` on that button. |
| **Stable comment id** | Feature-proxy and delete/backfill. | Inspect one live `li` attributes + any WS payload. Capture currently shows none. |
| **Scroll parent of the virtual list** | Needed only if we later hide native and must scroll-to-row. | DevTools: overflow ancestor of `ul` inside `#broadcast-aside-content-comments`. Do not build it for MVP. |
| **StreamYard ToS / CWS "unexpected network interception"** | Legal/store, not just taste. | Read current StreamYard terms and CWS program policies before any MAIN hook. |
| **Page CSP** | Script-tag injection may be blocked; `world: "MAIN"` content_scripts usually is not. | `document.querySelector('meta[http-equiv=Content-Security-Policy"]')` plus response headers on `streamyard.com`. |
| **Worker / `EventSource` / `fetch` as the real bus** | A WS-only patch misses them. | Network tab: WS vs EventStream vs XHR while a comment arrives. |
| **Does StreamYard already close over native `WebSocket` in a bundle?** | `document_start` may still lose the race. | MAIN probe that only logs `hook-ok` and constructor calls. **Not a parser. Not shipped.** Only after the Network tab proves a WS exists. |
| **Popup copy vs "four toggles"** | Popup already has five (`collapseDuplicates`, `hideExtras`, `joinContinuations`, `hideGreetings`, `llmEnabled`). | Do not add a sixth engineer flag for transport. |

### Evidence that would change my mind on A

All of the following, not one:

1. Network tab: comments arrive on **one** allowlisted WS (or documented Engine.IO namespace), JSON (or a fully fixture-covered Socket.IO envelope), with **stable ids**, handle, platform, text.
2. DOM lag is consistently worse than WS in a way the teacher can feel (seconds, not ms), **or** comments appear on the socket that never appear in the virtual list (today: if it is not in the DOM, v1 also misses it; prove that happens).
3. MAIN constructor patch survives a 1–3h session, SPA tab switches, reconnect, **zero** StreamYard console errors, **zero** non-comment frames forwarded.
4. Feature-proxy: teacher features from the queue including a virtualized-away row, <1s, no wrong-comment events. (This is actually a B problem. If you cannot do it on DOM rows, WS does not help.)
5. Parser fixtures from **two** StreamYard deploys (schema stable).
6. Written ToS + CWS read: hook is acceptable for this unlisted item; privacy policy updated for extra frame scope.
7. Dual-path tests: a dropped WS frame **never** drops a question that the DOM has, which means DOM is still primary, which means you built C's ingest and called it A.

If 1–7 all land, I would still not make WS the feed. I would allow an **off-by-default, DOM-primary, allowlisted sniffer** as an engineering aid. The teacher-facing v2 would still be **B**.

Until then: **do not rubber-stamp Gemini.** It described a generic MV3 app. Ṣafwa is a single-tab, fail-open, DOM-bound live instrument for one non-technical operator. The matching core is the asset. The badges are the complaint. The socket is a distraction.
