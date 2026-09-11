# Ṣafwa v2 — Production Architecture Specification

Version: 2.0 (definitive, implementation-ready) · Date: 2026-09-11 · Author: production-spec finalizer (Claude Fable 5)
Status: **binding build spec for v2.** Supersedes the in-place-badge UI of `streamyard-question-filter-spec.md` Section 10 and amends `CLAUDE.md` invariant #1 (Section 16).

Inputs, in precedence order: `specs/counsel/USER-DIRECTIVE-2026-09-11.md` (product owner, binding) → `specs/counsel/WS-EVIDENCE-2026-09-11.md` (measured) → `specs/counsel/gpt-6-astra-revision-clean.md` (supersedes conflicting parts of `gpt-6-astra-final-clean.md`) → `gpt-6-astra-final-clean.md` (sidebar/SW/session architecture, still in force) → `specs/counsel/SYNTHESIS.md` and the eight councilor answers → repo ground truth.

Artifact status note: Astra's revision flagged two blockers in the sanitized artifacts (token-bearing URLs, broken fixture escaping). Both were fixed by structural regeneration before this spec was written — `captures/ws-2026-09-11/streamyard-ws-evidence.json` and `test/fixtures/ws-2026-09-11-events.json` now parse at every JSON layer and carry `token=REDACTED` placeholders (WS-EVIDENCE §9). Gate A's fixture-integrity requirement (Section 15) re-verifies this in `npm test`.

---

## 1. Executive decision (Section A)

**Ship a `chrome.sidePanel` sidebar fed by the proven DOM pipeline, with a read-only WebSocket observer built now and staged behind evidence gates: `off → log → enrich → primary`.**

- The **sidebar** is the teacher's clean view: avatar, handle, platform, full Dari text, and Ṣafwa's filter annotations per row. It is a separate browser surface; it never injects into StreamYard's page.
- The **native StreamYard comments panel is inviolable**: the v2 production path performs zero native writes — no badges, classes, `data-*` attributes, style, scroll, or layout changes. The only permitted native interaction is one validated `.click()` on `button[data-testid="show-comment-button"]` in direct response to a teacher action.
- The **DOM observer is the admission authority in every mode**. "Primary" WS mode means the socket is the preferred *payload* source; the DOM still decides whether a comment is admitted, and validates every feature click. A socket-only comment never enters matching, never increments a count, never hides anything.
- The **matching core is unchanged**: `normalize.js`, `dedup.js`, `grouping.js`, `state.js` stay pure; `processComment` pipeline order and `applyLlmOverride` remain the only decision authorities.
- **Failure in any layer degrades toward the native panel, never toward a corrupted feed.**

### Architecture Decision Records

| ADR | Decision | Rationale / consequences |
|---|---|---|
| **ADR-1 Panel host = `chrome.sidePanel`** | The clean view is a browser sidebar (`side_panel.default_path: panel/panel.html`), one per window, bound to the active StreamYard tab. In-page injection is rejected. | Owner directive #1. Immune to StreamYard CSS, z-index, and SPA re-renders. Costs: service worker + `sidePanel` permission + cross-document messaging (ADR-3/4). Requires Chrome ≥116 (`sidePanel.open`). |
| **ADR-2 Transport = DOM baseline + staged read-only WS observer** | DOM observer runs always and owns admission. The WS observer (MAIN-world constructor tap) ships as v2 code, packaged only in non-`"off"` builds, and progresses `log → enrich → primary` through Gates A/B/C (Section 15). Demotion is one-way per document, silent, and never touches the native panel. | WS-EVIDENCE proved the transport (plain JSON, two sockets, stable ids, avatars, server timestamps, duplicate delivery). Owner directive #5 makes reliability the deciding factor: the DOM rail never stops. |
| **ADR-3 State ownership = content script** | All session matching state (records, `createState()` maps, decisions, anchors, receipts) lives in the isolated content-script realm, in memory. The sidebar is a pure renderer of pushed snapshots/patches over a **direct `chrome.tabs.connect` port**. Nothing session-critical lives in the SW or storage. | MV3 SW sleep is then irrelevant to reading: the port is content↔sidebar. SW restart loses nothing. Hard navigation loses the session (accepted, documented; same as v1). |
| **ADR-4 Service worker scope = activation + privileged routing only** | `src/sw.js` handles exactly: toolbar `action.onClicked` → `sidePanel.open()` + enable; `FEATURE_REQUEST` validation and forwarding via `tabs.sendMessage`. It holds no matching state, no LLM calls, no capture, no keepalive hacks. | Smallest possible privileged surface. Every handler reconstructs context from the message + sender; correctness survives SW termination at any point. |
| **ADR-5 Popup removed; settings move into the sidebar** | `action.default_popup` is removed from the v2 manifest (otherwise `action.onClicked` never fires). The five teacher settings + session reset render inside the sidebar's settings view, reusing the existing `STORAGE_KEYS`. `popup/*` files remain in the repo solely for the legacy v1 regression configuration; they are not part of the v2 package. | One surface for the teacher. Storage keys unchanged → settings survive the migration. |
| **ADR-6 Protocol isolation mirrors selector isolation** | All WebSocket schema knowledge lives in `src/ws-parser.js` (decoding) and `src/config.js` (endpoint allowlist, limits, thresholds). No other file may know a frame shape, just as no file outside `config.js`/`dom.js` may know a selector. Captures/fixtures are inert evidence, never imported by runtime code. | The transport is the second-most-likely layer to rot; isolate it the same way the first one is. |
| **ADR-7 Feature proxy refuses over guessing** | Sidebar → SW → content → validated native row → one `.click()`. Any ambiguity (recycled row, identical twins, disconnected node, stale session) → refuse the action and show the native-lookup hint. No scroll-hunting, no auto-retry, no synthetic `showComment` frames — ever. | "Never feature the wrong row" outranks proxy availability. The socket's `showComment` command is documented native behavior, not an API we call. |
| **ADR-8 Invariant #1 amended now** | Discovery succeeded; the amendment (exact wording in Section 16) is adopted with this spec, before the observer lands. | Astra revision §6. Silent violation was forbidden; explicit amendment is the honest path. |
| **ADR-9 Rejected components** | Offscreen documents, `declarativeNetRequest`, `storage.session`/`storage.sync` for state, options page, generic message-bus/storage-adapter abstractions, separate popup window, per-platform payload branches, deletion/moderation handling. | Council unanimous + owner directive addendum #7–8. No responsibility exists for any of them in this design. |

---

## 2. Module layout and worlds (Section B)

```text
StreamYard tab (top frame)                      Extension surfaces
┌──────────────────────────────────────┐  ┌─────────────────────────────┐
│ MAIN world                           │  │ src/sw.js (service worker)  │
│   src/ws-main.js (WS builds only)    │  │   action → sidePanel.open   │
│     WebSocket constructor tap        │  │   FEATURE_REQUEST routing    │
│        │ window.postMessage          │  └────────────▲────────────────┘
│        ▼                             │               │ runtime.sendMessage
│ ISOLATED world                       │  ┌────────────┴────────────────┐
│   src/ws-bridge.js (WS builds only)  │  │ panel/panel.html|js|css     │
│   src/content.js  (bootstrap)        │◄─┼─ chrome.tabs.connect port   │
│   src/session.js  (session owner)    │  │   snapshots / patches /     │
│   src/dom.js      (extract + click)  │  │   health / resync / reset   │
│   src/admission.js (pure coordinator)│  └─────────────────────────────┘
│   src/ws-parser.js (pure decoder)    │
│   core: normalize/dedup/grouping/    │
│         state (pure, unchanged)      │
│   src/llm-classifier.js (fetch)      │
└──────────────────────────────────────┘
```

| File | World / kind | Status | Responsibility |
|---|---|---|---|
| `src/content.js` | ISOLATED, classic, `document_start` | modified | Bootstrap only: host check, dynamic-import the ESM modules, select the sidebar path (or the explicit legacy path in the legacy test build), start `session.js`. **v2 removes** `wireEnabledToggle`, all `ui.render` calls, and every `data-safwa-*` write. |
| `src/session.js` | ISOLATED ESM | **new** | The session owner: MutationObserver wiring, container watchdog, admitted-record store, native-anchor registry, calls into `admission.js` and the core, LLM scheduling, port server for the sidebar, feature-request validation entry, reset/settings listeners. |
| `src/admission.js` | pure ESM | **new** | The admission coordinator, Node-testable: DOM/WS record correlation, transport-delivery dedupe, ordering, identity indexes, enrichment merging, demotion decisions (via `health.js`). No DOM, no `chrome.*`. |
| `src/ws-main.js` | MAIN, classic, `document_start` | **new** (WS builds only) | Read-only `WebSocket` constructor tap (Proxy + `Reflect.construct`). Returns the real socket, attaches passive `message` listeners on allowlisted endpoints, enqueues bounded text frames, posts envelopes + 2 s health beats. Never wraps `send`, never touches prototypes, handlers, heartbeats, or reconnects. On listener failure returns the same socket; on constructor replacement, stops (bridge detects via silence). |
| `src/ws-bridge.js` | ISOLATED, classic, `document_start` | **new** (WS builds only) | Early `window.message` listener: validates envelope (source window, origin, `ns`, version, token, generation, sequence, size, rate), buffers bounded frames until `session.js` subscribes, then hands frames over. Enforces every `WS_LIMITS` budget; any violation latches demotion. |
| `src/ws-parser.js` | pure ESM | **new** | `parseWsFrame` — the only file that knows frame shapes (Section 4). |
| `src/health.js` | pure ESM | **new** | Threshold state machine with injected clock: bridge/socket health, demotion latching, one-way transitions. |
| `src/panel-model.js` | pure ESM | **new** | Projects decisions + source records into serializable `ViewRow`s (Section 5). Node-tested against every `test/mock-comments.js` stream. |
| `src/protocol.js` | pure ESM | **new** | Message type constants + envelope validation for port/runtime messages. Shared by session, sw, panel. |
| `src/sw.js` | extension SW, module | **new** | ADR-4 scope only. |
| `panel/panel.html` / `panel.js` / `panel.css` | extension document | **new** | Sidebar shell (static failure text baked into the HTML), renderer, settings view, feature-request initiation. `panel.js` imports `config.js` (LABELS), `protocol.js`. RTL, `lang="fa-AF"`, bundled Vazirmatn. |
| `src/config.js` | shared config | modified | Adds: `PANEL_MODE`, `WS_MODE`, `WS_ENDPOINTS`, `WS_LIMITS`, `FEATURE_PROXY`, `PANEL` budgets, new `SELECTORS` entries, new `LABELS` (Section 11). |
| `src/dom.js` | ISOLATED ESM | modified | Adds avatar extraction (`profileAvatar`), show-button resolution + final validation + click. Still the only file that touches StreamYard HTML. |
| `src/normalize.js`, `src/dedup.js`, `src/grouping.js`, `src/state.js` | pure ESM | unchanged | Matching core. One required hygiene change: v2 passes **plain copies without `el`/`cardEl`** into `processComment` (the core stores comment objects; DOM refs would leak detached nodes). |
| `src/llm-classifier.js` | ISOLATED ESM | unchanged | Same endpoint/model/timeouts. v2 replaces the native-node staleness guard with the source-record guard (Section 5). |
| `src/ui.js`, `styles.css`, `popup/*` | legacy | frozen | Loaded only by the legacy v1 regression build. Never referenced by the v2 manifest or code path. |
| `tools/build-manifest.js` | Node script | **new** | Emits the packaged manifest: default (no MAIN/bridge entries, `WS_MODE:"off"`) or `--ws=log|enrich|primary` rehearsal variants. `"off"` means the MAIN hook is **not in the package at all**. |

### Manifest diff (production v2 default)

```jsonc
{
  "manifest_version": 3,
  "version": "2.0.0",
  "minimum_chrome_version": "116",
  "background": { "service_worker": "src/sw.js", "type": "module" },
  "side_panel": { "default_path": "panel/panel.html" },
  "permissions": ["storage", "activeTab", "sidePanel"],   // + sidePanel
  "action": {
    "default_title": "Ṣafwa - Live Q&A Filter"            // default_popup REMOVED
  },
  "content_scripts": [
    {
      "matches": ["https://streamyard.com/*", "https://*.streamyard.com/*"],
      "js": ["src/content.js"],
      "run_at": "document_start",                          // was document_idle
      "world": "ISOLATED"
      // styles.css REMOVED from the v2 entry (no native writes)
    }
  ],
  "web_accessible_resources": [
    { "resources": ["src/*.js", "fonts/*"],
      "matches": ["https://streamyard.com/*", "https://*.streamyard.com/*"] }
  ]
  // host_permissions and icons unchanged
}
```

WS rehearsal builds (`tools/build-manifest.js --ws=…`) replace `content_scripts` with:

```jsonc
[
  { "matches": ["https://streamyard.com/*", "https://*.streamyard.com/*"],
    "js": ["src/ws-main.js"], "run_at": "document_start", "world": "MAIN" },
  { "matches": ["https://streamyard.com/*", "https://*.streamyard.com/*"],
    "js": ["src/ws-bridge.js", "src/content.js"],
    "run_at": "document_start", "world": "ISOLATED" }
]
```

No `tabs`, `scripting`, `debugger`, or offscreen permission is added in any build. Page CSP applies in MAIN world: `ws-main.js` is self-contained, no imports, no eval. No remote code anywhere.

---

## 3. Message contracts (Section B)

### 3.1 Content ↔ sidebar: direct port (`chrome.tabs.connect(tabId, {frameId: 0})`, port name `safwa-panel`)

Common envelope (all port messages):

```text
{ v: 2, type, documentToken, sessionEpoch, settingsRevision, revision, requestId?, payload }
```

| Type | Direction | Payload |
|---|---|---|
| `SUBSCRIBE` | panel → content | `{}` — request session identity + full snapshot. |
| `SNAPSHOT_BEGIN` | content → panel | `{ revision, expectedRows, session: { studioLabel, startedAt, wsMode, effectiveSource } }` |
| `SNAPSHOT_CHUNK` | content → panel | `{ rows: ViewRow[] }` — ≤128 rows and ≤256 KiB per chunk. |
| `SNAPSHOT_END` | content → panel | `{ revision, rowCount }` — panel swaps its model only after this validates. |
| `PATCH` | content → panel | `{ baseRevision, revision, upserts: ViewRow[], removals: rowId[] }` — full-row upserts, never partial diffs. |
| `HEALTH` | content → panel | `{ observer: "ok"\|"degraded"\|"unavailable", pendingWork, wsState: "off"\|"log"\|"enrich"\|"primary"\|"demoted" }` — every 2 s while subscribed. |
| `RESYNC` | panel → content | `{}` — after a revision gap, invalid envelope, or 4 s health silence. |
| `RESET_SESSION` | panel → content | `{}` — resets **only the bound tab's** session; content replies `SNAPSHOT_BEGIN…END` with a new `sessionEpoch`. (Deviation from Astra's SW route, deliberate: reset touches nothing native and needs no privileged validation; the port already proves the binding.) |
| `ACTION_STATUS` | content → panel | `{ requestId, outcome: "clicked"\|"refused"\|"unknown", reasonCode }` — also pushed late if a result resolves after the ack timeout. |

Rules: JSON-serializable plain objects only (no Maps, no DOM refs). The panel ignores messages whose `documentToken`/`sessionEpoch` don't match its bound session, and stale `revision`s. A `PATCH` whose `baseRevision` ≠ current model revision triggers `RESYNC`, never a blind apply. Settings do **not** travel on the port: the panel writes `chrome.storage.local` with the existing `STORAGE_KEYS`; `session.js` keeps the existing storage listener, bumps `settingsRevision`, replays the full admitted history through the core, and publishes atomically.

### 3.2 Sidebar ↔ SW ↔ content: feature proxy (`chrome.runtime.sendMessage` + `chrome.tabs.sendMessage`)

```text
FEATURE_REQUEST (panel → SW → content):
{ v: 2, type: "FEATURE_REQUEST", requestId, windowId, tabId,
  documentToken, sessionEpoch, sourceId, sourceRevision, expiresAt }

FEATURE_RESULT (content → SW → panel, as the sendMessage response):
{ v: 2, type: "FEATURE_RESULT", requestId,
  outcome: "clicked" | "refused" | "unknown", reasonCode }
```

SW validation before forwarding: sender is this extension's sidebar document (not a content script, not external); target tab is the requesting window's active StreamYard tab; structure and `expiresAt` valid; only the defined command forwarded; nothing retained after responding. The SW registers all listeners synchronously at module top level and uses `return true` + `sendResponse` for async completion.

### 3.3 MAIN ↔ ISOLATED: bridge envelope (`window.postMessage`)

```text
{ ns: "safwa:ws", v: 1, pageToken, generation, socketId, sequence,
  kind: "frame" | "lifecycle" | "health",
  endpointKey: "room" | "api",        // configured key, never a URL
  receivedAt,                          // performance.now() in MAIN
  dataType: "text", data }             // raw frame string, ≤64 KiB
```

`ws-bridge.js` validates source window, `event.origin === location.origin`, namespace, version, `pageToken` (from the first handshake), monotonic `sequence` per `generation`, size and rate. **Bridge traffic is untrusted page data**: it can never authorize a click, change a preference, create/hide/count a question on its own, or invoke any extension API. The room-socket URL (with its token) never crosses the bridge — only `endpointKey`.

---

## 4. WS capture and the parser contract (Section C)

### 4.1 Endpoints (measured, WS-EVIDENCE §1)

Structural allowlist in `CONFIG.WS_ENDPOINTS` — parse with `new URL(...)`, match exactly; never substring-match:

| Key | Match | Carries |
|---|---|---|
| `room` | `wss:` + host `videows.streamyard.com` (any path — the path is the per-broadcast room token) | `platformComments.created` (comments, avatars, ids), `commentUpdated`, placements, participants, 1.5 s ping/pong. |
| `api` | `wss:` + host `streamyard.com` + path `/api` | `broadcast.status` (incl. `shownCommentIds`), `starredComment.starred`, 30 s ping/pong. Hello frame carries an auth token — never logged, never persisted, never forwarded. |

### 4.2 Parser contract

```text
// src/ws-parser.js — pure: no DOM, no chrome.*, no clock, no state, no logging.
parseWsFrame(raw /* string */, { endpointKey /* "room"|"api" */, direction /* "in"|"out" */ })
  → {
      status:   "ok" | "ignored" | "unknown" | "malformed",
      comments: NormalizedComment[],       // from platformComments.created only
      events:   NormalizedStateEvent[],    // commentUpdated / shown-set / starred
      unknown:  DiagnosticCode[],          // e.g. "room.appMessage.unknownInnerType"
      errors:   DiagnosticCode[]           // e.g. "room.innerJson.parseFailed"
    }
```

**Never throws on any input.** Malformed input → `status:"malformed"` + bounded diagnostic codes (codes contain no payload text). Outbound frames → `ignored` (production observation is inbound-only; the captured `showComment`/`hello` document native behavior, nothing more). Heartbeats and recognized unrelated commands (`participantsUpdated`, `clientList`, `setRoomSettings`, …) → `ignored`. Unrecognized command/subscription names → `unknown`; the parser never guesses meaning from generic `text`/`message` properties, and an unknown event can never become a delete, edit, or question. Binary frames → `malformed` code `unsupportedBinary`; that is a demotion signal, not a reason to add protobuf support.

Exact decoding (measured schema):

| Input | Decoding |
|---|---|
| room, `type:"message"`, `message.command:"appMessage"` | Parse outer JSON; parse **`message.body.message` as a nested JSON string**; if inner `type === "platformComments.created"`, decode `data.comments[]` into `NormalizedComment`s. Any other inner type → `unknown`. |
| room, `message.command:"commentUpdated"` | Read `message.body.comment` → emit `{ kind:"commentUpdated", commentId, name, platform, contents, imageSrc, sentAt, pos }`. **Not** a new comment; **no** inferred `shown:true`. |
| api, `type:"update"`, `subscription:"broadcast.status"` | Read `message.payload.broadcast` → emit `{ kind:"shownSet", broadcastId: broadcast.id, videoRoomId, shownCommentIds, snapshotAt: payload.timestamp }` **only when `shownCommentIds` is explicitly present as an array**. Missing field = no update, never an empty set. |
| api, `subscription:"starredComment.starred"` | Payload is the comment itself → emit `{ kind:"starred", commentId: payload.id, broadcastId, starredAt }`. Positive state only; no unstar event exists in evidence, so none is invented. |

Field mapping for each `data.comments[]` item:

| Wire field | NormalizedComment field | Rules |
|---|---|---|
| `id` | `commentId` | required, nonempty string. |
| `name` | `handle` | required, nonempty; displayed as-is; folding happens in the core. |
| `platform` | `platform` | required, lowercased; passed through generically (directive #7 — no per-platform branches; an unexpected value is data, not an error). |
| `contents[]` | `displayText` + `contents` | concatenate `type:"text"` segment contents in array order, no invented separators. A batch item containing an **unsupported content type** is not flattened into a partial question: it maps to `unsupportedContent` and that occurrence stays DOM-fed. |
| `createdAt` | `createdAt` | required valid ISO timestamp — the true server creation time. |
| `authorPlatformId` | `authorPlatformId` | required nonempty; stable per-platform author identity. |
| `largeImageSrc` / `smallImageSrc` | `avatarLarge` / `avatarSmall` | optional; kept separately; must be `https:` URLs without credentials, else dropped (dropping an avatar never invalidates the comment). |
| `data.broadcastId` / `data.destinationId` | `broadcastId` / `destinationId` | **batch-level fields** (measured: they live on `data`, not reliably on each item). Inherit from the enclosing batch only; a contradiction between batch- and item-level identity → reject the batch (`malformed`). |
| envelope `pos`, `message.sentAt`, array index | `sourcePos`, `sentAt`, `batchIndex` | ordering metadata only. |
| `containsQuestion` | **ignored** | measured `false` on a real Persian question — never used as a classifier. |
| `publisherPermissionLevel`, `isChatModerator`, `isMember` | optional metadata | absent in the duplicate delivery; never required. |

Validation: required types, nonempty identity fields, `Number.isSafeInteger(pos)`, valid timestamps. A recognized comment batch failing validation produces **no partial output** — `malformed`, whole batch, and the coordinator demotes while DOM capture continues.

### 4.3 Stable ids, duplicate delivery, ordering (coordinator: `src/admission.js`)

- **Identity index:** `(broadcastId, platform, commentId) → sourceId` — a scoped tuple, never a bare `commentId` (no global-uniqueness assumption). The opaque local `sourceId` remains the sidebar/action identifier; late association adds an index entry to the existing record, never a new row or count.
- **Delivery dedupe precedes semantic dedupe.** Measured: the identical comment id arrived twice, 5 s apart (`pos` 12 and 13). A bounded recent-delivery cache rejects fast repeats; the admitted-record identity index is the authoritative check after cache eviction. One admitted occurrence, one classification pass, no continuation-window advance, no second LLM request. Two **distinct** ids with identical text remain two occurrences — the existing pipeline folds them with count 2.
- **Ordering — three separate concepts, never conflated:** (1) room event order = `pos` scoped to socket instance + connection generation, plus `sentAt` (server time) and `batchIndex`; (2) source creation time = `createdAt` (a re-delivery never changes it); (3) **admission order = immutable local sequence + monotonic local time — this is what matching windows and sidebar placement use.** Never compare `pos` across sockets, directions, or reconnect generations (the outbound show request also carried `pos:12`). API frames have no `pos`/`sentAt`; order them by receive sequence + snapshot timestamps. A `pos` gap alone is not proof of loss; a gap in Ṣafwa's own bridge `sequence` is. Late metadata never moves an established sidebar row.
- **Correlation (enrich/primary modes):** a socket candidate correlates to a DOM occurrence when platform matches, `foldHandle` matches, and the normalized `matchKey` (or exact text) matches, within `WS_LIMITS.correlateMs` (1.5 s). DOM admission is **never delayed** waiting for correlation. Uncorrelated socket candidates are held in a bounded pending set (≤200 / ≤1 MiB), then dropped. In primary mode the coordinator prefers the socket payload (complete `contents` text, `createdAt`, avatar, `authorPlatformId`) *when its native occurrence becomes eligible in the DOM*; a DOM-first occurrence is admitted immediately and enriched later. Contradictory identity/content → demote immediately, keep the DOM record.
- **Person identity:** prefer `(platform, authorPlatformId)` once established; retain `platform::foldHandle(handle)` for DOM-only records. Same displayed name + different `authorPlatformId` = different people; renamed handle + same `authorPlatformId` = same person. If late identity enrichment changes a matching input, rebuild decisions atomically from retained occurrences in admission order (invalidate incompatible pending LLM results); a rebuild never adds occurrences.

The plain object handed to `grouping.processComment` remains exactly `{ handle, platform, displayText, timestamp }` (plus core-written fields) — `timestamp` is **local admission time**, because the core only compares timestamps; `createdAt` stays in the source record as metadata. Always pass a fresh copy (the core mutates its input) and never include `el`/`cardEl`/transport metadata.

### 4.4 Unit testing inside `npm test`

`test/ws-parser-test.js` (added to the `npm test` chain) loads `test/fixtures/ws-2026-09-11-events.json` and asserts:

1. **Fixture integrity:** every entry's `raw` parses; for room `appMessage` frames the nested `body.message` string parses too; no `token=`-bearing live URL, JWT, or real handle/id survives in any fixture.
2. `comment.created.first` → `status:"ok"`, one comment, every mapped field exact (`commentId:"LCC.SANITIZED_1"`, `handle:"@teacher_channel"`, `platform:"youtube"`, the Persian question text, `createdAt`, both avatar URLs, `authorPlatformId`, batch-level `broadcastId`, `sourcePos:12`).
3. `comment.created.duplicate` → parses to the identical comment (`sourcePos:13`). **The pure parser returns it both times**; delivery dedupe is proven in `test/admission-test.js` (fixture pair in → exactly one admitted occurrence, one core invocation, count unchanged).
4. `comment.updated.in` → one `commentUpdated` event, zero comments, no shown inference.
5. `broadcast.update.shownCommentIds` → one `shownSet` event with `["LCC.SANITIZED_1"]`, correct `broadcastId`/`videoRoomId`; a synthetic `broadcast.status` **without** the field → no event.
6. `comment.starred` → one `starred` event with `starredAt`; zero comments.
7. `comment.showRequest.out`, `api.hello.out`, `heartbeat.ping` → `ignored`.
8. Synthetic malformed set (labeled synthetic): truncated outer JSON, broken inner escaping (the historical sanitization defect, preserved as a test case), wrong field types, missing `id`/`name`, unsafe `pos`, unknown inner type, unknown subscription, binary marker → correct `malformed`/`unknown` statuses, empty outputs, **no exception escapes**.

---

## 5. Session ownership, sync, and LLM guards

**All session state lives in `src/session.js`'s realm** (ADR-3): `documentToken` (random per content-script lifetime), `sessionEpoch` (bumped by reset or studio change), `settingsRevision`, the immutable admitted-record store, `createState()` matching state, logical-row membership, the native-anchor registry (DOM refs live **only** here), applied/pending LLM identities, action receipts, and a monotonic publication `revision`.

| Event | Behavior |
|---|---|
| Native container replaced (SPA re-render, same route) | **Preserve** records, decisions, counts, matching state. Invalidate anchors, reattach the observer (detachment check every 1 s; the v1 watchdog's fresh-state reset at `content.js:349` is explicitly **not** carried into v2). Sidebar usually sees nothing; a `HEALTH` degraded status if reattachment exceeds 2 s. |
| Sidebar closed/reopened, panel reload | State untouched; reopen → `SUBSCRIBE` → full snapshot (5,000 records within 2 s budget). |
| SW terminated | Nothing lost; next feature request wakes it. |
| Settings changed | Bump `settingsRevision`, invalidate pending LLM work, replay full admitted history through the core, publish atomically. |
| Reset (sidebar) | New `sessionEpoch` + fresh `createState()`; seed currently mounted native rows; StreamYard's own comments untouched. |
| Studio route change (origin+pathname boundary, in-memory) | New session; old-session messages/results rejected by token/epoch. |
| Hard navigation / tab discard / crash | Session memory is lost (accepted): panel shows disconnected state, new session begins when capture returns. No false claim of recovery. |

**DOM admission hygiene** (carried from Astra final): attach at `document_start` to the verified container even while empty; capture immutable candidate values in observer callbacks (never queue only mutable `li` refs); settle partially-populated/recycled rows before admitting (an author from one row version must never pair with another version's text or avatar); 80 ms flush is a maximum wait, not a rolling debounce; monotonic local arrival time for windows.

**Three identifiers, not interchangeable:** `sourceId` (one local occurrence) · exact native fingerprint (platform + raw handle + exact text — candidate finding only) · `matchKey` (core matching). Without a stable id, two simultaneously observed identical comments are separate occurrences; an indistinguishable remount-vs-resend preserves the question, avoids count inflation, and disables proxy actions that would require an unproven mapping.

**LLM staleness guard (replaces the native-node liveness check):** apply a result only if `documentToken`, `sessionEpoch`, `settingsRevision`, and the `sourceId`+content revision all still match and the request wasn't already applied. Native virtualization no longer voids a legitimate result; reset/settings/content changes do. `applyLlmOverride` remains the single application point; `alsoRender` updates publish in the same transaction. Scheduler: ≤2 in flight, ≤20 queued, requests expire 8 s after admission; after three failures in 60 s, pause new calls 60 s.

---

## 6. Sidebar UX (Section D)

### 6.1 Row anatomy

Every source row (main rows, expanded duplicate members, folded items) shows, RTL, `lang="fa-AF"`:

```text
┌────────────────────────────────────────────────┐
│ [avatar]  ‹bdi›handle‹/bdi›  [platform chip]   │  ← 32px avatar, fixed geometry
│ full comment text (~17px, generous line height)│  ← never clamped, never faded
│ [badges: count | joined | second-question |    │
│  pending-review]      [نمایش در پخش] [state]  │  ← ≥40px targets
└────────────────────────────────────────────────┘
```

`ViewRow` (the serialized shape on the port):

```text
{ rowId, kind: "question" | "greeting" | "foldedGroup",
  primary: { sourceId, handle, platform, displayText, avatarUrl, createdAt?, admittedAt },
  badges:  { count?, joined?, secondQuestion?, pendingReview? },
  joinedFragments?: [{ sourceId, handle, displayText, admittedAt }],   // original order
  members?: [ ...source rows... ],          // expandable duplicate-group members
  feature: { available: boolean, reasonCode?, labelKey },              // labelKey: featureShow | featureShowFirst
  shown:   "unknown" | "on",                // from validated shownCommentIds only
  starred: "unknown" | "on" }               // from starredComment.starred only
```

- **Avatar:** prefer validated socket `avatarLarge`, then `avatarSmall`, then the DOM `img[class*="Avatar__Image"]` src; a failed image advances through remaining candidates once, then a bundled neutral avatar/initials in the same fixed space. `referrerpolicy="no-referrer"`, async decoding, HTTPS-only, no credentialed URLs, avatar URLs never logged. Missing images never block admission.
- **Duplicates** fold into a representative with the gold `{n} بار پرسیده شد` count; the count expands its members (each with own author + avatar). **Joined** questions show fragments together in original order with the `ادامه سوال قبلی` badge. **Second questions** show the `سوال دوم این شخص` badge (dimmed presentation, still readable). **Ambiguous** cases (pending LLM) stay fully readable with `شاید تکراری باشد`. Confirmed folds remain reachable in one compact `نظرهای جمع‌شده` disclosure — no raw record is ever unreachable (the live-tested same-person LLM mis-hide must stay recoverable).
- Append chronologically; auto-follow only within 48 px of the end; upward scroll pins the reading anchor and shows the `سوال‌های تازه` control. Regrouping, image loads, and count updates never move the text being read. Digits per `USE_PERSIAN_DIGITS_IN_UI`; visible keyboard focus; respect reduced motion; widths 360–480 px.
- Brand: canvas `#f7f3ea`, text `#14221c`, primary `#0e6b51`, emerald `#0a3d32`, gold `#d4b36a`, secondary `#4a534e`, bundled Vazirmatn (`panel/panel.css` only).

### 6.2 States

| State | Trigger | Panel shows (from `CONFIG.LABELS`) |
|---|---|---|
| Loading | `SUBSCRIBE` sent, snapshot pending ≤2 s | `در حال آماده شدن…` |
| Empty | Valid session, zero admitted comments | `در انتظار سوال‌ها` |
| Not a studio | Active tab isn't StreamYard | `استودیوی StreamYard را باز کنید` |
| Master off | `safwaEnabled === false` | `غیرفعال` + the switch; filtered list hidden, capture stays warm underneath. |
| Disconnected | Port dead > 4 s after retries | last data greyed + `اتصال قطع است؛ ستون اصلی را ببینید` |
| Capture degraded | Selector rot / container unavailable | history retained + `ستون نظرات StreamYard را باز نگه دارید` |
| Simple mode | Projection/renderer exception | raw readable rows + `حالت ساده` badge |
| Static failure | panel.js itself fails | static HTML text in `panel.html`: use the native panel. |

### 6.3 Teacher controls (five settings + reset move into the sidebar; toolbar behavior)

Settings view (gear icon → replaces the list; `بازگشت` returns to the same reading position): master switch, then the five toggles with their existing labels and storage keys — `جمع کردن سوال‌های تکراری` (`collapseDuplicates`), `کم‌رنگ کردن سوال دوم هر نفر` (`hideExtras`), `وصل کردن ادامه‌ی سوال` (`joinContinuations`), `کم‌رنگ کردن سلام و دعا` (`hideGreetings`), `فهمیدن معنی یکسان` (`llmEnabled`) — then `شروع تازه برای این پخش` (reset, port-scoped to the bound tab). Toggles write `chrome.storage.local` (existing keys, explicit-`false` semantics); WS mode is **not** a teacher setting.

Toolbar icon (SW `action.onClicked`; `setPanelBehavior({openPanelOnActionClick:false})`; `sidePanel.open({windowId})` called synchronously **before** any await): on a StreamYard tab → open/focus sidebar + set `safwaEnabled:true` (a repeated click never turns filtering off); elsewhere → open sidebar showing the open-studio prompt. There is no popup. No automatic opening on install/startup (Chrome requires a user gesture).

Tab handling: the panel binds the window's active StreamYard tab; on `tabs.onActivated` to another StreamYard tab it disables actions immediately, rebinds, and requests that tab's snapshot; on an unrelated tab it shows the studio prompt — another studio's actionable list is never left visible.

### 6.4 SPA re-render sync

The sidebar never talks to StreamYard's DOM, so SPA re-renders can't touch it. Sync integrity comes from Section 5's container-watchdog (state preserved, anchors invalidated) plus the port's revision discipline (gap → `RESYNC` → snapshot). Acceptance criterion 12 verifies: container replacement, SW termination, and sidebar reopen all preserve membership and counts.

---

## 7. Feature proxy (Section E)

**Click path:** sidebar trusted click → `runtime.sendMessage(FEATURE_REQUEST)` → SW validates sender/tab/structure/expiry → `tabs.sendMessage(tabId, request, {frameId: 0})` → content validates session + occurrence + current native row → `dom.js` resolves and clicks `button[data-testid="show-comment-button"]` → explicit `FEATURE_RESULT` back through the SW. The sidebar sends an opaque `sourceId` — never a selector, element, URL, or text to search for.

**Content validation, immediately before clicking (the recycled-row revalidation rule):**

1. `documentToken`, `sessionEpoch`, enabled state, and `expiresAt` valid; `requestId` not already receipted.
2. Resolve the source record; verify `sourceRevision`.
3. Native container and anchored row still connected.
4. Resolve through the occurrence-aware anchor registry (a stable transport id helps association but **never substitutes** for DOM proof).
5. **Re-extract platform, exact raw handle, and exact displayed text from the live row and compare with the intended source comment** — the original text, not merged text, not a normalized matchKey. Normalization finds candidates; it never authorizes an on-air action.
6. Exactly one matching, enabled show button belonging to that validated row; if native state already indicates "shown", do not toggle.
7. Recheck the row version and `.click()` in the same synchronous task — no intervening `await`.
8. Any mismatch, ambiguity (two indistinguishable twins), or doubt → `refused` + reason. Never "first", "latest", or "either twin is harmless".

Joined questions feature the **original native fragment** (StreamYard cannot broadcast Ṣafwa's concatenation); their button is labeled `نمایش بخش اول` so the limitation is visible before the click. Duplicate-group members expose their own validated actions when expanded; another author's copy is never substituted silently.

**Virtualized-away fallback (exact teacher UX cost):** no scroll-hunt, no `scrollIntoView`, no highlighting, no delayed auto-click. The row's action disables with `برای نمایش، نظر را در ستون اصلی پیدا کنید`; availability recomputes when the row is observed again, but a fresh teacher click is required. The cost: (1) shift attention to the native panel, (2) manually locate the comment — possibly scrolling; time **not bounded** by current evidence and it may fail if the comment is gone, (3) use StreamYard's own control. This is stated honestly in rehearsal sign-off (criterion 18); "one extra tap" claims are rejected.

**Delivery discipline:** `requestId` receipted in session memory before dispatch; redelivery returns the recorded outcome without another click. Request expiry 2 s; sidebar ack timeout 1 s → `ACTION_STATUS` query, never a redispatch; unknown outcome → `نمایش را در پخش بررسی کنید` and no optimistic "on air". Never auto-retry a native toggle.

**State reflection (enrich/primary modes, read-only):** `shown` comes only from a validated, fresh `broadcast.status` snapshot's explicit `shownCommentIds` (replace the whole set; preserve all ids — multiple shown comments allowed; missing field = no update). `commentUpdated` marks "stage-related state changed" on the associated record — never an inferred shown flag, edit, or acknowledgement. `starred` comes only from `starredComment.starred` (positive only; no invented unstar). Because the measured snapshot arrived **10.26 s after** the show request, a separate **15 s feature-state observation deadline** governs reflection; the 1 s ack only covers click dispatch. Stale snapshots are rejected by connection generation + receive order + broadcast update timestamp. In DOM/log modes, `shown`/`starred` stay `unknown` and the sidebar simply makes no on-air claim.

---

## 8. Failure model (Section F)

The native panel remains untouched in every row of this table. Demotions latch for the document, log one redacted `[Ṣafwa]` line, and never show a transport toast.

| # | Failure | Signal → threshold | Fallback | Teacher-visible result |
|---|---|---|---|---|
| 1 | Sidebar can't connect at open | no valid session reply ≤2 s | keep retrying; source state untouched | `استودیوی StreamYard را باز کنید` / loading, then native panel guidance |
| 2 | Port disconnect | `onDisconnect` | disable actions; reconnect at 100 ms/500 ms/1.5 s then every 5 s | last data marked; recovers silently |
| 3 | Silent port failure | no `HEALTH` for 4 s | mark stale, resubscribe | `اتصال قطع است؛ ستون اصلی را ببینید` |
| 4 | Revision gap / invalid snapshot | first occurrence | reject transaction, `RESYNC` full snapshot | brief action suspension only |
| 5 | Content script lost (hard nav, discard, crash) | port dead + no content on rebind | new session when capture returns | disconnected state; native panel always live |
| 6 | SPA re-render replaces container | detachment event or 1 s watchdog | preserve session, invalidate anchors, reattach | usually nothing; degraded status if >2 s |
| 7 | Selector rot (author/text) | 5 nonempty unextractable rows in 3 s after settling | capture degraded; history + native fallback | `ستون نظرات StreamYard را باز نگه دارید` |
| 8 | Container never found | existing poll exhausted | do nothing visible, log once | sidebar waiting state; native untouched |
| 9 | Core/projection exception | first exception | log loudly; latch simple view, render raw records | `حالت ساده` — readable list |
| 10 | Renderer exception | first exception | minimal raw-row renderer | v1-style readable sidebar list |
| 11 | Whole panel document fails | script error | static HTML shell text | use native panel |
| 12 | SW asleep/terminated | n/a between actions | direct port unaffected; next action wakes SW | nothing |
| 13 | SW dies mid-feature-request | no result ≤1 s | `ACTION_STATUS` query; never redispatch | `نمایش را در پخش بررسی کنید` if unknown |
| 14 | Feature anchor invalid/ambiguous/recycled | validation mismatch | refuse that action only | `برای نمایش، نظر را در ستون اصلی پیدا کنید` |
| 15 | WS bridge silence | no handshake ≤2 s; no health ≤4 s | disable socket consumption (latched) | nothing — DOM already drives |
| 16 | WS constructor replaced / listener failure / socket error-close | first detection | disable affected capability immediately | nothing |
| 17 | Parse-error spike / unknown schema | invalid required fields: first occurrence; unknown relevant schema: 3 consecutive or 5 per 30 s | demote comment acquisition; DOM continues | nothing |
| 18 | Frame flood / oversize | >64 KiB frame, >200 env/s, >1 MiB/s, queue overflow: first occurrence | demote immediately; never truncate into the parser | nothing |
| 19 | Duplicate wire delivery | id match in delivery cache / identity index | one admitted occurrence; no timing/LLM/count effect | correct count |
| 20 | Room silence / API silence | no inbound room traffic 6 s / API 75 s (heartbeats continue on a healthy quiet feed) | demote room acquisition / mark feature-star state stale | nothing / no on-air claims |
| 21 | Correlation timeout | expected correlation unresolved 1.5 s (DOM available) | demote comment acquisition; DOM admission was never delayed | nothing |
| 22 | Reconnect with unproven recovery | reconnect observed | continue through DOM; no assumed backfill | nothing |
| 23 | LLM outage | 8 s timeout / invalid reply; 3 failures per 60 s → 60 s pause | regex decision stands | ambiguous items stay readable |
| 24 | Processing backlog | oldest admitted work >1 s | suspend enrichment + new LLM work; drain with raw rows | simple view if needed |
| 25 | Resource budget exceeded | Section 12 budget breach | reduce rendering, simple view; **never evict questions** | capacity guidance |

Absence of new comments is never treated as failure. A `try/catch` exists to fail safe around DOM/parse boundaries; matching or rendering bugs surface loudly (rows 9–10), they are not swallowed.

---

## 9. Config flags and labels (Section G)

### 9.1 Flags (`src/config.js`)

```js
// --- v2 panel + transport ---
PANEL_MODE: "sidebar",            // "sidebar" | "v1-inline" (legacy test builds only; invalid in production)
WS_MODE: "off",                   // "off" | "log" | "enrich" | "primary" — packaging/release config, NEVER a teacher setting.
                                  // "off" builds contain no ws-main.js/ws-bridge.js at all.
// COMMENT_SOURCE is DERIVED, not set: "websocket" iff WS_MODE === "primary", else "dom".
// Runtime health can only lower the effective source to "dom"; it never raises it.
FEATURE_PROXY_ENABLED: true,      // subject to the live .click() gate (criterion 7/16)

WS_ENDPOINTS: {                   // structural allowlist; parse with URL, exact match
  room: { scheme: "wss:", host: "videows.streamyard.com" },          // any path (per-broadcast token)
  api:  { scheme: "wss:", host: "streamyard.com", path: "/api" },
},
WS_LIMITS: {
  frameBytes: 65536, envelopesPerSec: 200, bytesPerSec: 1048576,
  queueEnvelopes: 200, queueBytes: 1048576,
  handshakeMs: 2000, bridgeHealthMs: 4000,
  roomSilenceMs: 6000, apiSilenceMs: 75000,          // vs measured 1.5 s / 30 s heartbeats
  correlateMs: 1500,
  unknownSchemaConsecutive: 3, unknownSchemaPer30s: 5,
  pendingCandidates: 200, pendingBytes: 1048576,
  featureStateMs: 15000,                             // measured snapshot lag: 10.26 s
},
FEATURE_PROXY: { requestExpiryMs: 2000, ackTimeoutMs: 1000 },
PANEL: {
  snapshotChunkRows: 128, snapshotChunkBytes: 262144,
  patchBatchesPerSec: 20, maxMountedRows: 150,
  autoFollowPx: 48, healthIntervalMs: 2000, reopenRecoveryMs: 2000,
},
```

Unchanged and reaffirmed: `AUTO_HIDE_ANYTHING_AMBIGUOUS: false`, pipeline order, the five stored settings + `STORAGE_KEYS`, `LLM_*`. New selectors (the only additions, in `SELECTORS`): `profileAvatar: 'img[class*="Avatar__Image"]'`, `showCommentButton: 'button[data-testid="show-comment-button"]'`.

### 9.2 New `CONFIG.LABELS` entries (Dari, with English glosses)

```js
// Sidebar chrome
panelTitle: "صفوة — سوال‌های برنامه زنده",                        // "Safwa — broadcast questions"
panelLoading: "در حال آماده شدن…",                          // "getting ready…"
panelWaiting: "در انتظار سوال‌ها",                          // "waiting for questions"
panelOpenStudio: "استودیوی StreamYard را باز کنید",         // "open the StreamYard studio"
panelDisconnected: "اتصال قطع است؛ ستون اصلی را ببینید",   // "connection lost; see the native column"
panelKeepCommentsOpen: "ستون نظرات StreamYard را باز نگه دارید", // "keep the StreamYard comments column open"
panelSimpleMode: "حالت ساده",                               // "simple mode" (raw-list fallback)
panelNewItems: "سوال‌های تازه",                             // "new questions" (scroll-down control)
panelFolded: "نظرهای جمع‌شده",                              // "folded comments" (disclosure)
panelSettingsBack: "بازگشت",                                 // "back"
platformUnknown: "نامشخص",                                   // "unknown" (platform chip fallback)

// Feature proxy
featureShow: "نمایش در برنامه زنده",                                // "show on the broadcast"
featureShowFirst: "نمایش بخش اول",                          // "show the first fragment" (joined rows)
featureFindNative: "برای نمایش، نظر را در ستون اصلی پیدا کنید", // "to feature it, find the comment in the native column"
featureCheckBroadcast: "نمایش را در برنامه زنده بررسی کنید",        // "check the broadcast to verify"
featureOnAir: "روی برنامه زنده",                                     // "on air" (validated shown state only)
featureStarred: "ستاره‌دار",                                 // "starred"
```

Existing labels (`joined`, `askedTimes`, `possibleDuplicate`, `secondQuestion`, the five setting labels, `resetSession`/`resetDone`/`resetWhat`/`resetNot`, `popupStatusOn`/`popupStatusOff` reused as the master-switch states) stay as-is. Every visible sidebar string comes from `CONFIG.LABELS`; nothing is hard-coded.

---

## 10. Performance budget (Section H, first half)

| Area | Budget |
|---|---|
| Supported load | 5,000 admitted comments / 3 h session; sustained 10 comments/s × 60 s; burst 25/s × 5 s |
| DOM eligibility → sidebar paint | p95 ≤250 ms, p99 ≤500 ms (excluding LLM and image downloads) |
| Socket receive → parsed candidate | p95 ≤100 ms (socket→DOM-eligibility delay measured separately) |
| MAIN listener overhead | p95 ≤0.2 ms per eligible event; zero payload parsing in the listener |
| Parser + coordinator work | p95 ≤2 ms per captured-size frame; yield between bounded batches within ~8 ms work slices |
| Bridge/pending limits | as `WS_LIMITS`; exceeding a limit demotes, never truncates |
| Publication | ≤20 patch batches/s, coalesced; snapshot chunks ≤128 rows / ≤256 KiB |
| Sidebar reopen | full 5,000-record recovery ≤2 s |
| Mounted rows | ≤150 logical rows (windowed); older records stay scrollable — rendering limits never evict stored questions |
| Heap | ≤50 MiB after GC at 5,000 records, **including** transport indexes/buffers |
| Long tasks | no extension-caused task >50 ms under the load test |
| LLM scheduler | ≤2 in flight, ≤20 queued, 8 s expiry from admission |

If the supported workload misses a target, fix the bottleneck or shrink the declared envelope — never "solve" memory by evicting history.

---

## 11. Acceptance criteria (Section H)

v1 criteria **1–7** stand unchanged (exact triplicate → count 3; near-duplicate caught; continuation joined; second question flagged; distinct short questions never merged; selector failure leaves the native feed untouched + clear log; native featuring still works).

Sidebar criteria (v2):

8. Toolbar click opens the sidebar with no popup detour; repeated clicks never disable filtering.
9. Every source-row presentation includes avatar, handle, platform, full text, and applicable annotations.
10. The production v2 path performs **zero** native DOM writes (mutation-guard test) except an explicitly requested validated click.
11. Every admitted record stays reachable (visible row, group expansion, or folded view).
12. Container replacement, SW termination, and sidebar reopen preserve membership and counts.
13. All five settings apply across complete history; reset affects only the bound session.
14. Snapshot replay, duplicate messages, and reconnects never inflate counts.
15. Wrong-tab / wrong-session / expired / recycled / ambiguous feature requests produce zero native clicks.
16. A valid feature request dispatches at most one native click.
17. Joined-question actions disclose that they feature the original fragment.
18. The teacher completes the native fallback unaided and accepts its measured cost.
19. All failure thresholds and performance budgets pass at the declared workload.
20. The sidebar passes long Dari text, mixed-direction handles, keyboard use, image failure, 360–480 px widths on the teacher's display.
21. Disabling or omitting every WebSocket component leaves the sidebar fully functional.
22. Live capture coverage passes against known posted comments, including native scrolling and comments-tab switching (release gate: DOM observation cannot capture what StreamYard never materializes).

Transport criteria (WS builds):

23. Log mode changes no behavior; diagnostics are aggregate counts and reason codes only, no payload/token logging.
24. The fixture duplicate pair (pos 12/13) yields one admitted occurrence, one classification pass, unchanged timing and counts.
25. Every demotion drill (bridge kill, flood, malformed spike, constructor replacement, reconnect) leaves the feed uninterrupted, latches for the document, and logs one redacted line.
26. Enrichment (Gate B evidence): two consecutive rehearsals with zero incorrect associations, zero count inflation, zero native disturbance, measured avatar/id/time coverage.
27. Primary (Gate C evidence): exactly-once admission across socket-first, DOM-first, and duplicate-delivery cases; correct behavior under scrolling, tab switching, recycling, identical resends; proven reconnect handling or clean DOM transition; a measured benefit.

## 12. Test plan (Section H)

**Unit (all join the `npm test` chain in `package.json`):** keep the 86 core assertions and six legacy harnesses (legacy harnesses get an explicit legacy configuration where defaults changed). Add:

| Test file | Coverage |
|---|---|
| `test/ws-parser-test.js` | Section 4.4 — the measured fixtures plus labeled synthetic malformed/unknown cases. |
| `test/admission-test.js` | Delivery dedupe (fixture pair → one occurrence), correlation windows, ordering (pos scoping, equal timestamps, gaps, reconnect generations, no row jumps), identity (`authorPlatformId` vs folded handle, renamed author, same-name twins), enrichment rebuild atomicity, demotion via injected clock. |
| `test/panel-model-test.js` | Every `test/mock-comments.js` stream through `processComment` + projection: row anatomy, joined membership, counts, pending fuzzies, confirmed extras, `alsoRender`, all five settings, folded-view reachability. |
| `test/protocol-test.js` | Envelope validation, revision gaps, duplicate/out-of-order patches, partial snapshots, malformed envelopes, resync. |
| `test/feature-proxy-test.js` | Wrong sender/tab/session, expired requests, folded-key collisions, identical twins, disconnected rows, missing/disabled button, recycling immediately before click, duplicate requestId, lost acknowledgement — all zero-click refusals; single-click happy path. |
| `test/native-safety-test.js` | Instrumented DOM mutation/scroll methods; assert zero v2 writes except the explicit requested click. |
| `test/health-test.js` | Fake-clock coverage of every Section 8 threshold and one-way latching. |
| `test/panel-render-test.js` | Reading-anchor preservation, variable heights, fallback renderer, broken avatar, disabled-control accessibility. |

**Live (disposable unlisted rehearsal, never a teaching broadcast):** first resolve the two cheapest blockers — (a) native featuring via manual click then isolated-world `.click()`, verified on broadcast output including without hover; (b) numbered-comment coverage while the native list is at the live edge, scrolled up, and on another tab. Then one 1–3 h teacher-operated session covering the five acceptance streams, the known same-person paraphrase failure (must stay recoverable), avatars, ≥10 proxy actions, twins/recycled/virtualized-away rows, sidebar close/reopen + master toggle + all settings, SW termination, container replacement, two studio tabs, LLM timeout/malformed/offline, renderer failure, and reading-position preservation. Compare source membership, not visible row counts. WS builds add: shadow-mode parity comparison (log), the Gate B/C drills of Section 15, and deliberate demotions mid-session.

---

## 13. MVP and phases (Section J)

**Phase 1 — smallest winning MVP (v2.0.0, `WS_MODE:"off"` package):**

1. Sidebar + toolbar activation + five settings + reset (no popup).
2. Content-owned session surviving container replacement; direct port sync (snapshot/patch/health/resync).
3. Unchanged matching core + LLM with source-record guards.
4. Avatars (DOM source), RTL rows, annotations, folded-view reachability.
5. Strict feature proxy + honest native-lookup fallback.
6. Simple-view/native failure paths; mutation-guard, protocol, panel-model, proxy, health tests green.
7. `src/ws-parser.js` + `src/admission.js` land as **pure, fixture-tested code** in this phase (they run in Node under `npm test`), but no MAIN/bridge file ships in the package.

v1 behavior is preserved behind flags: the legacy build (`PANEL_MODE:"v1-inline"` + legacy manifest) keeps `ui.js`/`styles.css`/`popup/*` fully testable; nothing in the matching core changed.

**Phase 2 — WS log (rehearsal builds only):** package `ws-main.js`/`ws-bridge.js` with `--ws=log`; shadow-mode parity diagnostics; Gate A → Gate B evidence collection.
**Phase 3 — WS enrich (default after Gate B):** stable ids, `createdAt`, socket avatars, `authorPlatformId`, shown/star reflection. DOM remains admission authority.
**Phase 4 — WS primary (optional, after Gate C):** socket-preferred payload with DOM eligibility + instant fallback. Only if Gate C shows a measured benefit.

**Deferred indefinitely:** scroll-hunting, star/moderation proxies, deletion handling (directive #8), "answered" workflow, separate windows, cross-platform identity, hard-navigation state recovery, per-platform payload branches.

---

## 14. Rollout and rollback (Section H)

1. v2.0.0: unpacked rehearsal → acceptance gates 1–22 → unlisted Chrome Web Store update. Legacy v1 stays intact in-repo behind the legacy build.
2. WS phases advance **only** through the gates below; promotion is a recorded release decision between sessions — no runtime counter promotes a live studio.
3. Runtime rollback is automatic and layered: feature failure → refuse + native controls; WS failure → silent demotion to DOM; filtered-view failure → simple list; sidebar/capture failure → native panel; teacher emergency → master off or close the sidebar. Never auto-refresh a studio or reload the extension during a broadcast (refresh destroys session memory); package rollback happens between broadcasts via the store/unpacked swap.

## 15. Evidence gates

**Gate A (off → log):** fixture integrity re-verified in `npm test` (both JSON layers, no tokens/PII — the 2026-09-11 regeneration satisfies this, CI keeps it honest); static MAIN registration verified in the target browser (capture used CDP injection — extension injection must be proven); constructor tap shows zero interference with native traffic; bounded queues/cleanup/startup bridging proven; diagnostics are aggregate-only. The existing capture satisfies discovery, not this gate.

**Gate B (log → enrich):** two consecutive full rehearsals with zero incorrect associations, zero missing expected DOM occurrences, zero count inflation, zero native disturbance; avatar/id/time coverage measured in the sidebar; deliberate socket failure + reconnect + studio change with uninterrupted DOM fallback; corrected fixtures and all `npm test` coverage green. **YouTube qualifies first; other platforms stay DOM-fed until their payloads are observed live** (directive #7: no per-platform branches — pass `platform` through, fail open on differences).

**Gate C (enrich → primary):** two further rehearsals in primary configuration proving criterion 27, correctly scoped feature snapshots, explicit held/hidden-comment coverage with no socket-only admission, all performance targets, successful fault injection, and a measured benefit. Routine fallback that defeats the primary role blocks promotion. Unobserved capabilities (edits, deletion, unstar, backfill formats) remain disabled.

---

## 16. Exact amendments (Section I)

### 16.1 `CLAUDE.md` invariant #1 — replacement wording (decision record)

Decision: **amend now** (ADR-8). Discovery succeeded with measured evidence (`WS-EVIDENCE-2026-09-11.md`, dated capture, 1,260 frames); the conditional-amendment stance of the earlier final is superseded per Astra's revision. Replace invariant #1 with:

> **1. Do not assume a supported StreamYard API, webhook or SDK.** Ṣafwa may observe inbound text messages from the page's own WebSockets through a read-only, separately gated observer. Transport behavior starts in log-only mode, may become enrichment after fixture and live-parity gates, and may become primary comment acquisition only after the documented primary-promotion gate. Primary acquisition does not replace DOM eligibility: every admitted occurrence must have unambiguous native DOM evidence, and socket-only candidates must not enter matching, increase counts or hide questions. The isolated DOM observer remains active and supplies immediate fallback without resetting admitted history or counts. Ṣafwa must never create a StreamYard connection, send or modify frames, replace page handlers or manage the page's heartbeats or reconnections. Transport failures, invalid recognized schemas, loss, overflow, stale context or contradictory association disable the affected capability for the document while DOM processing continues. Unknown events cannot delete or withdraw questions. Socket state never authorizes a native action; each feature request requires a teacher action and current native-row validation. StreamYard's native comments panel, layout and controls remain unmodified and available.

Append to invariant #2 (selector isolation):

> Runtime WebSocket schema logic lives only in `src/ws-parser.js`, with protocol constants and limits in `src/config.js`. Captures and fixtures are inert evidence and must never be imported by runtime code.

### 16.2 Other document changes

- `streamyard-question-filter-spec.md` §2: replace the DOM-only transport sentence with: *"Ṣafwa does not assume a supported StreamYard API, webhook or SDK. Its v2 question feed is admitted from the page DOM through a content script and MutationObserver; an evidence-gated, read-only observer of the page's own WebSocket may supply enrichment or preferred payloads, but the DOM remains the admission authority and the recovery path."* §10: record the browser-sidebar host and the native-panel prohibition; the injected-floating-panel fallback is no longer the v2 design.
- `CLAUDE.md` "How to verify": add the sidebar/WS harness names of Section 12; "Build phases": add phase 8 (v2 sidebar) and 9 (WS gates).
- Decision record file (`specs/counsel/` convention): cite the dated capture, distinguish CDP feasibility from extension verification, and record the chosen rollout mode at each gate promotion.

### 16.3 Risks ranked

| # | Risk | L×I | Cheapest mitigation |
|---|---|---|---|
| 1 | Virtualization/tab-switching hides comments from the DOM observer entirely | unknown × critical | Numbered-comment coverage experiment (criterion 22) before release; WS-primary is the eventual structural fix, gated. |
| 2 | Proxy features the wrong occurrence/recycled row | med × critical | Section 7 revalidation + refusal on ambiguity; proxy tests. |
| 3 | SPA replacement discards session history (v1 behavior) | present × high | Session lifetime decoupled from container lifetime (Section 5); lifecycle tests. |
| 4 | Sidebar makes the known LLM mis-hide unrecoverable | observed × high | Every record reachable (criterion 11); folded view. |
| 5 | v1 native writes leak into the v2 path | existing code × high | Explicit legacy branch; no injected stylesheet; mutation-guard test (criterion 10). |
| 6 | Stale sidebar acts on wrong tab/session | med × critical | documentToken/sessionEpoch + active-tab validation + immediate action suspension on rebind. |
| 7 | Lost ack causes a second native click | med × high | Request receipts + status query, never replay. |
| 8 | MAIN observer disturbs StreamYard | low, unproven in-extension × critical | Constructor-only tap, Gate A verification, latched demotion, `"off"` packages contain no hook. |
| 9 | Socket schema drift produces plausible wrong metadata | unknown × high | DOM corroboration, first-contradiction demotion, parser isolation. |
| 10 | Token/PII leakage via captures or logs | med × high | Structural sanitization (done once, CI-checked), endpointKey-only bridging, no URL/avatar logging. |
| 11 | Memory growth over 3 h (history + transport buffers) | med × high | Plain records, weak-anchor registry, windowed rendering, bounded transport caches, soak test. |
| 12 | Sidebar geometry/lookup cost unacceptable to the teacher | unknown × high | Rehearse on the actual display; measure fallback attempts (criterion 18). |

### 16.4 Remaining unknowns, each with its cheapest experiment

| Unknown | Cheapest experiment |
|---|---|
| Do comments materialize in DOM while the native list is scrolled up / on another tab? | Post ten numbered comments while holding an older scroll position, then with the Comments tab switched away; diff admitted records. |
| Does `.click()` feature without hover/trusted input? | One manual + one isolated-world click in a rehearsal; check the recorded output. |
| Is the show button a toggle, and how does "already featured" render? | Feature one comment; capture native button state before/after. |
| Stable comment id anywhere in the DOM (attribute/React key)? | Inspect two identical comments' rows before/after a remount; production must not depend on React privates. |
| Extension-registered MAIN script parity with the CDP capture (timing, CSP)? | Load a `--ws=log` build in the target browser; verify both sockets observed from `document_start`. |
| Do real provider avatar URLs load inside the sidebar with `no-referrer`? | Render several observed provider images in the panel. |
| Does Aside's Chromium support the full sidePanel lifecycle (116+ APIs)? | Minimal extension: open, tab-switch, close, reopen. |
| Is origin+pathname a reliable broadcast boundary? | Navigate between two rehearsal studios; watch for false session resets/carries. |
| Do Facebook/Instagram comments arrive over the same room socket with the same shape? | Nothing now (owner cannot test); first live session with those destinations, in log mode — fail open meanwhile (directive #7). |
| Reconnect/backfill semantics (history dump? id reuse?) | Force one network interruption in a log-mode rehearsal; capture the reconnect frames. |
| Deletion/moderation event shapes | Out of scope (directive #8); capture opportunistically in log mode, never act on unknowns. |
| `shownCommentIds` removal semantics (un-show) | Un-feature a comment in rehearsal; verify the snapshot shrinks before enabling negative reflection. |

---

## 17. Non-negotiables carried forward (checklist for the implementer)

- Matching core stays pure and Node-importable; `npm test` green is the definition of done.
- Selectors only in `src/config.js` + `src/dom.js`; WS schema only in `src/config.js` + `src/ws-parser.js`.
- Pipeline order fixed; `applyLlmOverride` is the only LLM application point; `AUTO_HIDE_ANYTHING_AMBIGUOUS: false`.
- Cost asymmetry: inside the window, ambiguity merges, never hides. Do not hide a maybe.
- All visible strings from `CONFIG.LABELS`, RTL Dari. No remote code; no tokens in the extension; the api-socket hello auth is never logged or persisted.
- The native panel is inviolable in every mode, including every failure mode.

---

## 18. Amendment record — 2026-09-11 (owner decisions after the live run)

1. **Palette: Useful Design System supersedes the §6.1 brand tokens.** The owner chose the
   Useful monochrome system (canvas `#f8f8f8`, white surfaces, gray ink scale, hairline
   borders, ink accent; status hues only on real state). Persian keeps bundled Vazirmatn.
   The single intentional color exception is the **source-platform logo** on the avatar
   (YouTube/Facebook/Instagram brand marks, mirroring StreamYard), replacing the platform
   text chip.
2. **Second-question semantics.** With the setting on, a confirmed second question is
   **hidden** from the main list and remains reachable in «نظرهای جمع‌شده»; with it off the
   row stays visible with the «سوال دوم این شخص» badge. The label now reads
   «پنهان کردن سوال دوم هر نفر». Duplicates keep folding with the gold count.
3. **Copy:** the word «پخش» is replaced with «برنامه زنده» throughout the UI.
4. **Settings affordance:** the gear toggles the settings view open *and* closed; the
   separate back arrow was removed.
5. **Test plan additions:** `feature-proxy`, `native-safety`, and `panel-render` harnesses
   are now part of `npm test`.
