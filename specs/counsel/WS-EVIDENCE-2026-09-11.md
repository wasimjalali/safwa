# WS EVIDENCE — Live capture, 2026-09-11 (binding input for Astra + Fable)

Status: **measured, not inferred.** A real StreamYard studio was driven in the Aside Browser against the operator's own unlisted YouTube event ("Safwa WS Capture Test", destination Wasim Jalali15, camera/mic off, broadcast never started). `window.WebSocket` was patched at `document_start` via CDP `Page.addScriptToEvaluateOnNewDocument`; every frame of every socket was recorded. **1,260 frames over ~12 minutes.** Raw capture: `/tmp/safwa-ws-capture/ws-frames-raw2.json` (outside the repo; contains live tokens). Sanitized evidence: `captures/ws-2026-09-11/streamyard-ws-evidence.json`. Parser fixtures: `test/fixtures/ws-2026-09-11-events.json`. Screenshots: `qa-screenshots/ws-2026-09-11/`.

## 1. Transport — two page-owned WebSockets, both plain JSON

| Socket | URL | Role | Envelope |
|---|---|---|---|
| **Room socket** | `wss://videows.streamyard.com/<ROOM_ID>?clientId=<CLIENT_ID>` | realtime room, **comments**, stage placement, participants | `{"message":{"command":"<cmd>","body":{…},"sentAt":"ISO"},"pos":<int>,"type":"message"}` |
| **App-state socket** | `wss://streamyard.com/api` | broadcast state, subscriptions, starred comments | `{"type":"update","message":{"payload":{…},"subscription":"<sub>"}}`; client hello: `{"type":"hello","version":"2","auth":"<REDACTED>"}` |

- Both are text JSON. **No binary/protobuf frames observed anywhere.**
- `pos` is a monotonically increasing per-socket sequence number; server frames carry `sentAt` ISO timestamps.
- Heartbeats: room socket ping/pong ~every 1.5 s; api socket every 30 s.

## 2. Comment event (the decisive finding)

Surface: **room socket**, `command:"appMessage"`, inner `type:"platformComments.created"`. The inner payload is a **JSON string** nested inside `body.message`:

```json
{"message":{"command":"appMessage",
 "body":{"message":"{\"data\":{\"comments\":[{
   \"id\":\"LCC.SANITIZED_1\",
   \"createdAt\":\"2026-09-11T00:05:37.664Z\",
   \"name\":\"@teacher_channel\",
   \"authorPlatformId\":\"UC_SANITIZED_1\",
   \"platform\":\"youtube\",
   \"contents\":[{\"type\":\"text\",\"content\":\"آیا نماز در سفر قصر خوانده می‌شود؟\"}],
   \"largeImageSrc\":\"https://example.invalid/avatar1.jpg\",
   \"smallImageSrc\":\"https://example.invalid/avatar1.jpg\",
   \"isChatModerator\":false,\"isMember\":false,
   \"outputId\":\"OUTPUT_ID\",\"destinationId\":\"DEST_ID\",\"broadcastId\":\"BROADCAST_ID\"
 }],\"broadcastId\":\"BROADCAST_ID\",\"platform\":\"youtube\"},\"type\":\"platformComments.created\"}"},
 "sentAt":"2026-09-11T00:05:39.956Z"},"pos":12,"type":"message"}
```

Fields confirmed present: **stable comment `id`**, **true server `createdAt`**, handle (`name`), **per-platform stable author id** (`authorPlatformId`), `platform`, structured `contents[]` (text today), **avatar URLs** (`largeImageSrc` / `smallImageSrc`), moderation/member flags, output/destination/broadcast ids, `containsQuestion`.

**Duplicate delivery is real:** the identical comment id arrived **twice**, 5 s apart (`pos` 12 and 13). Dedupe by `id` is mandatory.

The same text also appeared in the DOM in the same instant; the native panel rendered it normally.

## 3. Teacher actions on the wire

| Action | What goes over the wire | Direction |
|---|---|---|
| **Feature on stage** (native `button[data-testid="show-comment-button"]`) | room socket `{"command":"showComment","body":{comment…}}` then `streamPlacementsUpdated`; server broadcasts `{"command":"commentUpdated","body":{"comment":{…}}}` | out + in |
| **Star** (native `button[aria-label="Star comment"]`) | app-state socket `{"type":"update","message":{"subscription":"starredComment.starred","payload":{comment…,"starredAt":"ISO"}}}` | in |
| **Comment posted** | `platformComments.created` (above) | in |

The app-state socket also broadcasts `subscription:"broadcast.status"` updates whose `payload.broadcast` includes **`shownCommentIds`** (the featured-comment ids) — a way to reflect feature state without touching the DOM.

## 4. Full event inventory (this session)

- room socket: `platformComments.created` (×2, duplicate delivery), `participantsUpdated` (×3), `clientList` (×2), `joined`, `connect`, `showComment` (out), `commentUpdated` (in), `streamPlacementsUpdated`, plus room/media commands (`setRoomSettings`, `overlayImageStateUpdated`, `musicStateUpdated`, `soundStateUpdated`, `setDisplayName`, `participate`/`participating`, …) and ping/pong (1,112 frames).
- app-state socket: `hello` (out/in), `request` (out/in), `broadcast.status` updates (×28), `brand.updated`, `starredComment.starred`, ping/pong (×74).
- **Not observed** (unknown, not disproven): comment deletion/moderation, edits, reconnect/backfill history dump, platform-mix comments (only YouTube present in this session).

## 5. What this means for the architecture (empirical answers to Q1–Q3)

1. **Q1 capture is feasible and cheap.** MAIN-world patch at `document_start` works (proven via CDP injection in this test; in the extension it is a manifest `world:"MAIN"` content script plus a postMessage bridge). No new permissions. Both sockets are page-owned; read-only wrapping did not disturb the app.
2. **Q2 schema is known and simple.** Pure parser contract: one raw frame string → `{ comments: [{ id, handle: name, platform, displayText, timestamp: createdAt, avatar: largeImageSrc||smallImageSrc, authorPlatformId, contents }], events: [...], unknown: [...] }`. Malformed frames never throw; they increment counters. Fixtures exist at `test/fixtures/ws-2026-09-11-events.json`.
3. **Q3 events have concrete shapes** (table above). Deletion semantics remain unknown; fail-open rule: unknown event → ignore, never hide based on it. Duplicate delivery is proven → id-based dedupe. Ordering can use `pos` + `sentAt`.
4. **Avatars, stable ids, true timestamps** — the three things the DOM cannot reliably give — are all present in the wire payload. This is the enrichment case HY4 predicted.
5. **Feature state** is observable (`commentUpdated`, `starredComment.starred`, `shownCommentIds`); the panel can reflect it without polling the DOM.
6. **Risk that remains:** the socket is pre-moderation in principle; but StreamYard itself renders from the same room stream, and the DOM remains the arbiter per the council's rule. Any id/comment that the DOM never renders must not be counted/hidden on its own.

## 6. Recommended capture plan (for the production spec)

- Dev/flag-gated instrument first (`CONFIG.WS_CAPTURE = "off" | "log"`), default off; parser is pure and fixture-tested; no behavior change until a live session proves parity with the DOM pipeline (two sessions, zero divergence, `npm test` green).
- Parser knowledge lives only in `src/ws-parser.js` (+ protocol constants in `src/config.js`), mirroring the selector-isolation rule.
- Enrichment only at first: stable id, createdAt, avatar, platform, authorPlatformId feeding the same `processComment` objects; DOM remains the ingest that decides. Promote to primary only if the parity evidence is met.
- Dedupe: transport-level id set (bounded), then existing pipeline dedup. Never double-count the duplicate `platformComments.created` deliveries.
- If the socket goes silent/crazy: stop reading it, continue DOM, log `[Ṣafwa]` once. Never touch the native panel.

## 7. Cleanup state

- The broadcast was **never started** (studio only, camera/mic off). The test tab was closed and the Aside REPL session stopped.
- One unlisted YouTube event titled "Safwa WS Capture Test" (destination Wasim Jalali15) remains on the account, status created/unlisted; it can be deleted from the StreamYard dashboard or YouTube Studio.
- Screenshots: `qa-screenshots/ws-2026-09-11/ws01…ws12`.
- Raw (unsanitized, tokens included) capture kept OUTSIDE the repo at `/tmp/safwa-ws-capture/ws-frames-raw2.json`.

## 9. Artifact integrity

Regenerated after review found two defects in the first sanitized pass: (a) the room socket URL carried a live `token=` query parameter (the first pass only redacted `clientId`), and (b) the two `platformComments.created` fixture strings had broken quote escaping around avatar URLs. Both files are now regenerated structurally (parse → sanitize objects → re-serialize), verified: every fixture frame parses as JSON, every nested `body.message` parses, no token/JWT/handle/id residues remain, and the Persian test text is intact. The raw capture outside the repo was scrubbed of tokens in place.

## 10. Chrome/MV3 operational facts learned

- StreamYard runs entirely in the top frame (no comment iframes at runtime; the studio uses two WSS endpoints on different hosts).
- The room socket URL is per-broadcast (`videows.streamyard.com/<roomToken>`); allowlist must match `wss://videows.streamyard.com/*` structurally (host match), not a fixed URL.
- The app-state socket mints `wss://streamyard.com/api` with an auth token in the hello frame — never log or persist that token.
- The comment input is a tipTap/ProseMirror editor plus a hidden controlled textarea; CDP `Input.insertText` + a synthetic Enter keydown posts successfully (useful for future live tests).
