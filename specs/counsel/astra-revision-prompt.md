You previously produced the final architecture at specs/counsel/gpt-6-astra-final-clean.md (raw transcript in specs/counsel/raw/gpt-6-astra-final.md). Since then a live WebSocket capture was performed and documented in specs/counsel/WS-EVIDENCE-2026-09-11.md, with sanitized evidence at captures/ws-2026-09-11/streamyard-ws-evidence.json and parser fixtures at test/fixtures/ws-2026-09-11-events.json.

The evidence proves: comments DO travel over a page-owned JSON WebSocket (wss://videows.streamyard.com/<ROOM_ID>?clientId=..., command "appMessage", inner type "platformComments.created") carrying stable comment id, server createdAt, authorPlatformId, platform, structured contents[], and avatar URLs (largeImageSrc/smallImageSrc); duplicate delivery of the same comment id was observed; the feature action emits "showComment" and the server broadcasts "commentUpdated"; starring arrives as "starredComment.starred" on wss://streamyard.com/api; broadcast state includes shownCommentIds; all frames are text JSON (no binary/protobuf); pos sequence numbers and sentAt timestamps are present; both sockets use ping/pong heartbeats.

Read those files now (the evidence file, the sanitized JSON, the fixtures), plus specs/counsel/USER-DIRECTIVE-2026-09-11.md and your earlier final. Then produce a REVISION ADDENDUM that supersedes the conflicting parts of your earlier final. Update explicitly and decisively:
1. The transport decision: exact role of the socket observer (primary vs enrichment), gating, demotion triggers, and what remains DOM-authoritative.
2. The parser contract and fixture/test plan using the real schema (pure parser, malformed handling, duplicate delivery, ordering by pos/sentAt).
3. How stable ids, avatars, createdAt and authorPlatformId change the data model, dedupe, panel rows, and the feature proxy.
4. Feature-state sync via commentUpdated / shownCommentIds / starredComment.starred.
5. Config flags and the rollout evidence gate to promote the socket from log-only to enrichment to primary.
6. Invariant #1 exact replacement wording, now that read-only socket observation is proven viable, with the decision record.
7. Any acceptance criteria, perf budget, and test-plan changes.

State plainly which parts of the earlier final are superseded. Do not modify any files (read-only). Output markdown only, starting with the heading: # Ṣafwa v2 — Astra Revision (WS evidence)
