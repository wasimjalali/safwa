## 1. Executive Verdict

Adopt **B: DOM observer + custom panel** first, preferably in `chrome.sidePanel`, because the DOM source is proven and already handles virtualization, retries, and fail-safe behavior. Treat **C** as the eventual architecture and **A** as a gated experiment, not as the default: StreamYard’s protocol, execution context, stable IDs, reconnect behavior, and lifecycle events are currently unknown. Confidence is high in this rollout recommendation and low in any claim about StreamYard’s wire schema until a passive capture session proves it. The current repository remains green: `npm test` reports 86 core assertions plus all browser regression harnesses passing.

## 2. Verdict Table

| Row | Decision | One-line reason |
|---|---|---|
| A. WebSocket capture + custom panel | Adapt | Useful only as a passive, experimentally validated source; too many unknowns to make it authoritative now. |
| B. DOM observer + custom panel | Adopt | Reuses the proven `src/dom.js` and `src/content.js` path while directly solving the teacher’s badge complaint. |
| C. WebSocket primary + DOM fallback | Adapt | Good target architecture, but only after source arbitration, stable IDs, lifecycle coverage, and failover are proven. |
| D. In-place annotation polish | Reject | It does not solve the motivating UX complaint, though the current implementation must remain as rollback/fallback. |
| Panel host: in-page injected panel | Adapt | Fastest prototype, but exposed to StreamYard CSS, SPA replacement, layout conflicts, and virtualization behavior. |
| Panel host: `chrome.sidePanel` | Adopt | Clean isolated surface and better persistence across StreamYard re-renders; requires explicit tab messaging and browser support testing. |
| Panel host: separate popup window | Reject | Easy to lose, focus-sensitive, and adds window lifecycle problems during a live broadcast. |
| Background service worker | Reject for MVP | No current need for cross-tab state, LLM proxying, or transport ownership; introduces restart and state-synchronization risk. |
| Offscreen document | Reject | It cannot solve page-world WebSocket interception or DOM access that the content script does not already have. |
| Declarative Net Request | Reject | Ṣafwa observes data; it does not block, redirect, or modify network requests. |
| `chrome.storage.session` | Adapt later | Suitable for a serializable recovery snapshot, but not for the current DOM-bearing matching state or source of truth. |
| `chrome.storage.sync` | Reject | Teacher settings are local and session-specific; syncing matching state or engineer knobs is unnecessary. |

## 3. Q1 — Capture Mechanics

### Recommended topology

Use two early content scripts and keep the existing bootstrap:

```json
{
  "permissions": ["storage", "activeTab", "sidePanel"],
  "content_scripts": [
    {
      "matches": [
        "https://streamyard.com/*",
        "https://*.streamyard.com/*"
      ],
      "js": ["src/socket-main.js"],
      "run_at": "document_start",
      "world": "MAIN"
    },
    {
      "matches": [
        "https://streamyard.com/*",
        "https://*.streamyard.com/*"
      ],
      "js": ["src/socket-bridge.js"],
      "run_at": "document_start"
    },
    {
      "matches": [
        "https://streamyard.com/*",
        "https://*.streamyard.com/*"
      ],
      "js": ["src/content.js"],
      "css": ["styles.css"],
      "run_at": "document_idle"
    }
  ],
  "side_panel": {
    "default_path": "panel/sidepanel.html"
  }
}
```

The side-panel permission is only needed if that host is selected. WebSocket capture itself does not require `"scripting"` or a service worker.

- `src/socket-main.js` runs in the page’s **MAIN world** and has no usable `chrome.*` APIs.
- `src/socket-bridge.js` runs in the extension’s isolated world at `document_start`, performs the handshake, validates envelopes, and buffers a small early ring.
- `src/content.js` remains the isolated-world owner of state, matching, DOM observation, LLM calls, and fallback.
- `src/transport-parser.js` should be pure and Node-importable. It must never import DOM code or live captures.

This avoids script-tag injection and its page-CSP race. It still cannot capture a socket created before the patch, a socket owned by a Web Worker/SharedWorker, or a non-WebSocket transport.

### Patching rules

1. Capture every future socket by replacing `window.WebSocket` with a transparent `Proxy` around the native constructor.
2. In the proxy `construct` trap, create the real socket with `Reflect.construct`, then attach passive listeners to that instance.
3. Preserve `WebSocket.prototype`, static constants, constructor behavior, and `instanceof` behavior as far as possible.
4. Attach a private `message`, `open`, `close`, and `error` listener. Never modify `event.data`.
5. Do not replace `onmessage` or globally patch `addEventListener`; both can change application behavior.
6. Do not patch `send` in production. During discovery only, an optional transparent `send` wrapper may record outbound subscription frames, using `Reflect.apply` and no payload mutation.
7. Record the socket URL, subprotocol, lifecycle, frame type, byte length, and local receive time. Redact sensitive values before persistence.
8. Detect `window.WebSocket` replacement with a short watchdog. Reinstall only if the property is safely writable/configurable. Otherwise emit `patch_lost` and fall back.
9. Give every socket a local capture ID. This is not a StreamYard comment ID and must never be used as one.
10. On SPA URL changes, increment a transport generation, stop accepting old-generation frames, and require a new room/session handshake.

A page script may retain the original constructor before `socket-main.js` runs. A page-owned Worker may create the socket outside the page’s `window`. Both are hard limits, not bugs that should be hidden with more monkey-patching.

### Bridge envelope

Use `window.postMessage` with structured-clone data:

```js
{
  source: "safwa-ws-bridge-v1",
  nonce: "per-page-random-value",
  sequence: 42,
  socketId: 3,
  kind: "message",
  url: "wss://redacted",
  protocol: "redacted",
  receivedAt: 1760000000000,
  dataType: "text",
  byteLength: 842,
  truncated: false,
  data: "..."
}
```

The isolated bridge must validate:

- `event.source === window`
- exact `source` and protocol version
- current nonce
- valid `kind` and `dataType`
- bounded string/byte sizes
- monotonically increasing bridge sequence
- socket generation and URL/session association

The nonce is a namespace and accidental-spoofing defense, not a security boundary. Page JavaScript can observe and forge `postMessage` traffic. Therefore page-world messages must never authorize a native click, change settings, or invoke a privileged action. Feature requests originate in the side panel and are validated by the isolated content script.

Provisional limits:

- Maximum frame bridged: 256 KiB
- Maximum sustained bridge rate: 200 envelopes/second
- Maximum sustained bridge volume: 2 MiB/second
- Early ring: 200 envelopes or 2 MiB, whichever comes first

Overflow is an explicit failure signal. It must not silently drop frames and continue as if the feed were complete.

## 4. Q2 — Schema Discovery + Fixtures

### What is known

Nothing in the repository identifies StreamYard’s transport schema. The current evidence is DOM-only. `captures/streamyard-live-dom.json` explicitly documents the panel and row structure, but contains no socket payload or comment ID.

Possible protocols include:

- Plain JSON messages
- JSON-RPC or GraphQL subscription messages
- Socket.IO/Engine.IO framing around JSON
- MessagePack or another binary encoding
- Protobuf or a private binary protocol
- Fetch/SSE or a Worker-owned socket instead of a page-owned WebSocket

These are hypotheses, not facts. The parser must not guess that any JSON object containing `text` is a comment.

### Safe discovery workflow

1. Use a dedicated unlisted test broadcast, never the teacher’s production session.
2. Start with Chrome DevTools Network → WS and capture the socket URL, direction, frame type, timing, and close/reconnect behavior without changing the page.
3. Post uniquely marked test comments from every available source, for example `SFW_MARKER_001` through `SFW_MARKER_020`, and correlate each marker with DOM appearance.
4. Run the MAIN-world observer passively with `COMMENT_SOURCE: "dom"` still active. It must not delay, rewrite, acknowledge, or send application frames.
5. Record outbound frames only if needed to identify subscriptions or cursors. Do not send guessed commands to request history.
6. Exercise lifecycle cases in the disposable broadcast: initial load, SPA route change, short network interruption, reconnect, history/backfill, duplicate delivery, comment deletion, moderation, native feature, star, and any visible edit operation.
7. Compare the transport-derived comment set with the DOM-derived set. A socket frame that cannot be correlated must be investigated, not discarded as noise.
8. Store raw captures outside Git, such as `/tmp/safwa-ws-raw`. Raw payloads may contain handles, message text, room IDs, authorization material, URLs, and tokens.
9. Generate sanitized fixtures under a test-only path such as `test/fixtures/transport/`. Runtime code must never import them.
10. Add parser tests before enabling the transport source.

### Redaction requirements

The sanitizer should:

- Remove cookies, authorization headers, query strings, avatar URLs, room IDs, broadcast IDs, user IDs, and opaque tokens.
- Replace handles, names, message text, and comment IDs with deterministic local names such as `handle_1`, `text_1`, and `comment_1`.
- Replace wall-clock timestamps with relative offsets.
- Preserve event names, nesting, field names, array structure, numeric sequence behavior, and protocol framing.
- Preserve platform labels only when they are not identifying.
- Reject fixtures containing raw `@handles`, URLs, Persian free text, or unrecognized long opaque strings.
- Be followed by manual review before commit.

The existing DOM capture uses a sanitization convention that omits session/page identifiers and image URLs. Transport fixtures need to be stricter because payloads can contain authentication and private session data.

### Parser contract

`src/transport-parser.js` should expose a pure function with this contract:

```js
parseFrame(frame, context) -> {
  status: "ok" | "partial" | "ignored" | "unknown" | "malformed",
  protocol: string | null,
  events: TransportEvent[],
  diagnostics: {
    reason: string | null,
    schemaVersion: string | number | null
  }
}
```

Input:

```js
{
  data: string | ArrayBuffer | Uint8Array,
  dataType: "text" | "arraybuffer" | "blob",
  url: string,
  socketId: number,
  receivedAt: number,
  bridgeSequence: number
}
```

A normalized event has this shape:

```js
{
  type:
    "comment.upsert" |
    "comment.update" |
    "comment.delete" |
    "comment.moderation" |
    "comment.feature" |
    "comment.star" |
    "session.sync" |
    "session.cursor" |
    "transport.lifecycle",
  sessionKey: string | null,
  id: string | null,
  version: number | null,
  platform: string | null,
  handle: string | null,
  displayText: string | null,
  serverTime: number | null,
  sequence: number | null,
  receivedAt: number
}
```

Rules:

- `comment.upsert` is emitted only when the parser has sufficient evidence for a comment event and has valid handle/text fields.
- `id` may be `null` during discovery, but a WebSocket source cannot become authoritative without a stable ID.
- `platform` must remain `null` when absent; never guess YouTube.
- `receivedAt` is the timestamp passed to the current core unless server timestamp units and semantics have been proven.
- The parser extracts fields only. Normalization remains in `normalize.js`; classification remains in `grouping.js`.
- `ignored` is for known control frames such as heartbeats.
- `unknown` means the frame is valid but its application meaning is not recognized.
- `malformed` means decoding or required-field validation failed.
- `partial` may return independently valid events from a batch while reporting unknown or malformed siblings.
- Unknown and malformed frames never reach `processComment`.
- The caller counts diagnostics and invokes failover thresholds. It must not silently continue after an apparent schema change.
- Parser errors are caught at the parser boundary and logged without raw payloads. Logic errors in the matching core must remain visible.

The adapter converts a valid event to the existing core shape:

```js
{
  handle,
  platform,
  displayText,
  timestamp: receivedAt,
  transportId: id
}
```

`transportId` is adapter metadata. `processComment()` remains unchanged.

## 5. Q3 — Event Semantics

| Event | Detection | Action | Fail-open behavior if absent or unknown |
|---|---|---|---|
| Socket open/close/error/reconnect | Native WebSocket lifecycle plus recognized protocol control messages | Assign a transport generation; preserve current panel; do not clear state on close; wait for a proven sync after reconnect | A new socket without a proven resume/sync boundary causes fallback to DOM. |
| Room/session/broadcast metadata | Explicit room or broadcast identifier in the socket URL or payload, correlated with the current page session | Reject stale frames from a previous route or broadcast | Without a trustworthy session boundary, WebSocket cannot become primary. |
| Initial history/backfill | Explicit snapshot/history event, batch marker, cursor, or server sequence range | Deduplicate by stable ID, order by validated sequence/time, and feed each historical comment once | If history cannot be distinguished from live delivery, use DOM only. |
| Reconnect recovery | Resume cursor, snapshot, or explicit missed-event range after reconnect | Apply missed events before live events; detect gaps; do not send guessed resume commands | One reconnect without proven recovery falls back to DOM. |
| Ordering | Monotonic server sequence or validated event ordering field | Process comments in server order; buffer only within a bounded known window | Arrival order alone is insufficient for backfill and continuation semantics; fallback if order cannot be proven. |
| Replay/duplicate delivery | Stable `(session, commentId, version)` or equivalent event identity | Make upserts idempotent; never call the core twice for the same delivery | Without stable identity, repeated frames can inflate counts; remain on DOM. |
| Deletion | Explicit delete/tombstone event containing comment ID | Mark the custom item removed; do not silently erase its history or mutate core state without a replay design | If deletion support is absent, the custom view may be stale; fall back rather than claim completeness. |
| Moderation/hide/block | Explicit moderation status or moderation event tied to comment ID | Mark status separately from matching; preserve an audit/tombstone record | If moderation cannot be detected, do not remove custom items based on disappearance. |
| Edit/update | Same comment ID with a newer version or changed content event | Update the panel; rebuild matching state from an event log if edits are supported | The current core has no removal/edit operation. For MVP, an observed edit triggers DOM fallback. |
| Platform metadata | Explicit source platform field, validated against known platform values | Pass the exact platform to the core; preserve cross-platform identity rules | Missing platform is unsafe because `identityKey()` would collapse unknown platforms under `"?"`; fallback. |
| Stable comment ID | Explicit message/comment ID stable across reconnect and backfill | Use it for transport deduplication and DOM mapping | A fingerprint is not an ID. Without a stable ID, do not promote WebSocket source. |
| Native featured/show state | Explicit event or observed native row control state | Update panel state only after confirmation; feature action remains DOM-controlled | If state cannot be observed, display state as unknown, never optimistically “featured.” |
| Native star state | Explicit star event or verified DOM state change | Reflect confirmed state in the panel | If absent, leave star state unknown. |
| Schema/version change | Protocol version field, changed event envelope, or diagnostic spike | Freeze WebSocket source and start DOM fallback | Never reinterpret unknown frames using heuristics. |

The hybrid architecture must use **source arbitration**. DOM and WebSocket events must not both enter `processComment()` for the same session. When WebSocket is healthy, DOM remains a read-only mapping and health oracle. On failover, increment a generation, reset transport state, and rebuild from DOM-visible rows.

## 6. Q4 — Feature-Proxy

### Mapping priority

1. Use a stable transport comment ID if both the socket event and DOM row expose it.
2. If only the socket has an ID, correlate the event to a DOM row when it appears using `platform + foldHandle(handle) + matchKey + bounded arrival time`.
3. Treat that fingerprint as a candidate mapping only. It is not a unique identity.
4. If multiple native rows match, disable the proxy for that custom item rather than choosing the first row.

The current DOM capture says no stable row/comment ID is documented, while the native feature control is `button[data-testid="show-comment-button"]`. The current `content.js` fingerprint is designed for virtual-row recycling, not safe teacher-action identity.

### Click mechanism

The side panel sends an opaque panel-item ID to the content script:

```js
{ type: "safwa-feature-request", panelItemId }
```

The content script:

- Looks up the item in its own mapping table.
- Confirms the mapped native row is connected.
- Re-extracts the row with `dom.extractComment()`.
- Verifies platform, folded handle, and match key still match.
- Finds the feature button through a selector kept in `src/config.js` and `src/dom.js`.
- Confirms the button is enabled.
- Calls the native button’s click behavior.
- Observes the native state afterward instead of assuming success.

The side panel must not query StreamYard DOM directly. The content script is the only component allowed to use native row selectors.

### Virtualized-away row

If the native row is not currently rendered, the proxy must not scroll blindly or click a guessed row. The exact fallback is:

- Keep the custom question visible.
- Disable the feature action for that item.
- Show a localized status from `CONFIG.LABELS` explaining that the native row must be located in StreamYard.
- Leave the teacher to use the native panel and click its normal control manually.

The on-air cost is one extra manual lookup and click. If StreamYard has already pruned the row from its virtualized history, the custom panel cannot safely feature it at all. That limitation must be visible rather than hidden.

### Edge cases

- Same text and handle in two rows: require stable ID; otherwise disable the proxy.
- Same text across platforms: include platform in the mapping.
- Socket comment arrives before DOM rendering: show it as read-only and keep feature disabled until a verified native row appears.
- DOM row is recycled: revalidate the row immediately before clicking.
- Native state cannot be identified: show `unknown`, not `featured`.
- Socket event says featured but native DOM disagrees: trust the native control for the action and mark the panel state stale.
- Native featuring has not yet been human-tested in the repository’s live QA; `qa-screenshots/live-2026-09-10-cli/REPORT.md` explicitly records criterion 7 as not tested.

## 7. Q5 — Failure Model

These are safety defaults, not teacher-facing knobs.

| Failure | Signal | Threshold | Fallback | Teacher sees |
|---|---|---|---|---|
| MAIN patch or bridge unavailable | No handshake acknowledgement | Three handshake attempts over 2 seconds | DOM source | Native StreamYard feed with the existing v1 behavior |
| Socket absent or owned by a Worker | DOM sees two new comments but no usable socket frame | 15 seconds after the first live DOM comment | DOM source | No interruption; custom transport view is not promoted |
| Page overwrote the patch | `window.WebSocket` differs from wrapper or sockets appear outside wrapper | Two detections within 5 seconds | DOM source | Existing native feed remains usable |
| Schema unknown/malformed | Parser diagnostics on candidate application frames | Three consecutive frames, five in 30 seconds, or over 5% of 100 non-control frames | DOM source | Custom panel pauses; native feed becomes authoritative |
| Required capability missing | Missing stable ID, platform, or room association | Any failure during the first 20 candidate comments, or any failure after promotion | DOM source | No guessed deduplication or feature action |
| Bridge sequence gap/overflow | Missing bridge sequence or explicit overflow | One non-recoverable gap | DOM source | Existing questions remain visible; custom view is marked paused |
| Reconnect without recovery | New socket but no proven cursor/snapshot | One reconnect without recovery within 5 seconds | DOM source | Native feed resumes; custom panel is stale/paused |
| Frame flood or oversized binary frame | Rate/size limit exceeded | Over 200 frames/s, 2 MiB/s for 3 seconds, or frame over 256 KiB | DOM source | No page slowdown; native feed remains available |
| DOM and WebSocket disagree | New DOM comments cannot be correlated to transport events | Two consecutive unmatched comments after transport promotion | DOM source | Native feed is authoritative |
| Feature mapping ambiguous | No row or multiple candidate rows | Immediate per item | Disable feature action only | Question remains readable; teacher uses native control |
| Side-panel message port fails | Panel closes or loses its tab connection | Immediate | Keep or restore v1 in-place view | Native feed is still usable |
| LLM worker failure | Timeout or fetch/JSON error | Existing `LLM_TIMEOUT_MS: 8000` behavior | Keep regex decision | Ambiguous questions remain visible; transport does not fail over because of LLM status |

On transport failover, the custom panel should not silently continue displaying a live-looking stale queue. It should become explicitly paused, while the native panel and the v1 DOM path remain available. If the DOM selectors also fail, `src/dom.js` retains its current fail-safe behavior: no annotation and no native-feed corruption.

## 8. Q6 — MVP vs Over-Build

### Ship

- Add `CONFIG.COMMENT_SOURCE = "dom" | "websocket"` with `"dom"` as the default.
- Build **B** first: `dom.extractComment()` → unchanged `processComment()` → side-panel queue.
- Keep the native StreamYard comments panel visible and unmodified by the custom view.
- Keep matching state in the content script; the side panel receives serializable snapshots and sends only validated actions.
- Implement feature proxy only for a currently rendered, one-to-one verified native row.
- Add `src/transport-parser.js` as a pure parser, but initially use it only against sanitized fixtures and a developer capture mode.
- Add source arbitration, generation tokens, parser diagnostics, malformed-frame tests, replay/backfill tests, and fallback tests.
- Human-test native featuring before calling the custom panel live-ready.

### Defer

- Making WebSocket the default source.
- Protobuf/MessagePack decoders without captured evidence and a stable schema.
- Automatic scrolling to locate virtualized native rows.
- Supporting edits by mutating existing matching state.
- Cross-tab matching state or a service-worker state authority.
- Offscreen documents, DNR rules, sync storage, and popup windows.
- Sending subscription, resume, or history commands to StreamYard.
- Removing the v1 in-place renderer as a rollback path.

### Rollout and rollback

- `COMMENT_SOURCE: "dom"` is the only production default.
- `"websocket"` is an engineer-only flag, not a popup setting.
- A session uses exactly one authoritative source. DOM may observe and map while WebSocket is active, but it must not feed the core simultaneously.
- Any transport health failure increments a source generation and returns to DOM.
- Rollback is changing the flag to `"dom"`, reloading the unpacked extension, and refreshing the studio. The current v1 path remains intact.

### Evidence required to flip the default

Do not flip after a single happy-path socket capture. Require:

- One dedicated 1–3 hour live session with at least 100 marked comments.
- 100% stable comment IDs, platform metadata, and room/session association.
- Zero missed or duplicated comments against a DOM cross-check.
- Forced reconnect with proven backfill or cursor recovery.
- Verified deletion/moderation behavior.
- No unknown or malformed application frames.
- No bridge overflow or source mismatch.
- Native feature proxy tested on current and recycled rows.
- A second replay or live soak confirming the sanitized fixtures and parser behavior.

If any lifecycle case remains unknown, WebSocket remains experimental and DOM remains the default.

## 9. Invariant #1 Decision Record

**Decision: amend, do not silently violate. Reject WebSocket as the default source for now, but allow a narrowly constrained passive observer.**

Exact replacement for invariant #1 in `CLAUDE.md`:

> **1. StreamYard has no supported public API, webhook, or SDK. Ṣafwa must never assume one. The default and correctness-preserving source is page-DOM observation from the content script and MutationObserver. A feature-flagged passive observer of StreamYard’s own page transport MAY be used only as an experimentally validated optimization; it is not an API, cannot be required for correctness, cannot send control messages, and must be isolated behind a parser/fixture contract. Unknown, malformed, missing, stale, out-of-order, or incomplete transport data immediately falls back to the DOM pipeline and leaves the native feed usable.**

Replace the v1 spec’s current Section 2 conclusion with:

> StreamYard has no public API, no comment webhooks, and no supported SDK. The supported baseline for Ṣafwa is a Chrome content script observing the rendered page DOM with a MutationObserver. Ṣafwa may optionally observe the page’s own transport as a passive, feature-flagged optimization, but that transport is private implementation detail, not an API, and must never be required for correctness. The DOM pipeline remains the fallback and authoritative production path until the transport protocol, lifecycle semantics, and stable identifiers have been proven against sanitized fixtures and live tests.

## 10. Risks Ranked

| Rank | Risk | Likelihood × impact | Cheapest mitigation |
|---|---|---|---|
| 1 | The comments use a Worker, SSE, fetch stream, or an unknown non-WebSocket protocol | High × Critical | Inspect DevTools Network initiator and run the passive capture during one marked comment. |
| 2 | Reconnect/backfill has no complete cursor or sequence semantics | High × Critical | Disable network briefly in a disposable broadcast and compare post-reconnect transport IDs with DOM comments. |
| 3 | No stable per-comment ID exists | High × Critical | Post identical text twice and inspect whether distinct stable IDs are present in both payloads. |
| 4 | A fingerprint maps a custom row to the wrong native row | High × Critical | Generate two same-handle, same-text comments and require the proxy to refuse ambiguous mapping. |
| 5 | DOM and WebSocket sources double-process the same comment | High × High | Implement one-source arbitration and assert one core call per stable comment ID. |
| 6 | Schema drift produces plausible but wrong fields | Medium × Critical | Reject unknown event versions and use parser fixture tests plus diagnostic thresholds. |
| 7 | Deletes, moderation, or edits are absent from the socket | Medium × High | Perform each native action in a test broadcast and compare socket, DOM, and panel state. |
| 8 | Page code overwrites the WebSocket wrapper or creates sockets before injection | Medium × High | Inject at `document_start`, detect patch loss, and immediately fall back to DOM. |
| 9 | Raw fixtures leak handles, text, room IDs, or tokens | Medium × High | Keep raw captures outside Git and require automated plus manual redaction review. |
| 10 | A busy or binary protocol overwhelms the bridge | Low/Medium × High | Enforce frame/rate caps and treat overflow as an immediate source failure. |
| 11 | Side-panel support or tab messaging differs in the operator’s Chromium build | Medium × Medium | Load a minimal side-panel prototype before coupling the matching UI to it. |

## 11. What This Brief Missed / Open Questions

| Open question | Cheapest experiment |
|---|---|
| Is the relevant transport actually a page-owned WebSocket? | DevTools Network capture while posting one uniquely marked comment; inspect the connection initiator. |
| Is the socket created in a Worker or SharedWorker? | Inspect the Network initiator and compare it with page-world constructor instrumentation. |
| What protocol/framing is used? | Capture one inbound and one outbound frame from the disposable broadcast and classify the envelope before writing a decoder. |
| Does every comment have a stable ID across reconnects? | Post identical text twice, reconnect, and compare IDs and versions. |
| Is there a room/broadcast/session boundary in every frame? | Navigate between two disposable studio routes and check whether old-socket frames can be distinguished. |
| Are history and live events explicitly separated? | Reload the studio after several marked comments and compare initial frames with newly posted frames. |
| Are sequence numbers or cursors present? | Force a short network interruption, then inspect whether the resumed stream reports a gap or cursor. |
| Are deletion and moderation events delivered to the client? | Post a test comment, delete/moderate it through the native UI, and compare the socket with the DOM mutation. |
| Are edits supported? | Edit a test comment if the platform permits it; otherwise record that the event is untestable and keep WebSocket fallback-only. |
| Are feature/star state changes delivered over the same socket? | Click native feature/star on a disposable comment and inspect both socket frames and DOM attributes. |
| Can a socket comment be correlated to a virtualized DOM row safely? | Send two identical comments from one handle, scroll until both rows appear, and test whether the mapping refuses ambiguity. |
| Does the operator’s Chromium support the side panel reliably? | Load a minimal `sidepanel.html`, open it from the extension action, reload the StreamYard SPA, and verify the panel connection. |
| Does the current browser allow programmatic activation of StreamYard’s native feature button? | Manually test one side-panel click against `show-comment-button` and confirm the broadcast output changed. |
| Would the private transport observation be acceptable under StreamYard’s terms and the project’s privacy policy? | Review current terms/privacy language before any store release; keep the feature unpublished and disabled until reviewed. |
