# Ṣafwa v2 — Astra Revision (WS evidence)

**Adopt a staged hybrid: DOM capture remains the working baseline; the socket observer progresses from log-only to enrichment, then to primary comment acquisition after explicit evidence gates. Implementing the observer and parser now belongs in the v2 plan.**

“Primary” means the preferred source of normalized comment data. **The DOM still determines eligibility for admission and validates every native feature action.** This preserves the binding directive and the evidence document’s rule that an unrendered socket comment cannot independently affect questions or counts.

This addendum is based on the [WS evidence report](</Users/wasimjalali/Desktop/Personal Project/safwa/specs/counsel/WS-EVIDENCE-2026-09-11.md>), [capture](</Users/wasimjalali/Desktop/Personal Project/safwa/captures/ws-2026-09-11/streamyard-ws-evidence.json>), [fixtures](</Users/wasimjalali/Desktop/Personal Project/safwa/test/fixtures/ws-2026-09-11-events.json>) and [user directive](</Users/wasimjalali/Desktop/Personal Project/safwa/specs/counsel/USER-DIRECTIVE-2026-09-11.md>). No files were modified.

**What is superseded.** These decisions replace the conflicting parts of the [earlier final](</Users/wasimjalali/Desktop/Personal Project/safwa/specs/counsel/gpt-6-astra-final-clean.md>):

| Earlier sections | Superseded decision |
|---|---|
| §§1–2 | Rejecting socket acquisition because transport evidence does not exist; prohibiting primary acquisition throughout v2. |
| §3 | Omitting MAIN registration from the v2 plan; treating stable IDs and server timestamps as hypothetical. |
| §§4–5 | Unknown transport/schema claims, the generic parser proposal and the earlier event/ordering assumptions. |
| §6 | Treating socket avatars and feature/star reflection as speculative. Native-action safeguards remain. |
| §7 | The socket demotion rules and deferred observer performance requirements, as replaced below. |
| §8 | Excluding the hook/parser from v2, reserving but rejecting `COMMENT_SOURCE: "websocket"` and ending rollout at enrichment. |
| §9 | Conditional amendment pending socket discovery, including the earlier exact replacement wording. |
| §§10–11 | Open questions about page ownership, text framing, comment IDs, avatar fields and the existence of the captured feature/star events. |

The browser sidebar, toolbar behavior, five settings, content-owned session, direct sidebar synchronization, minimal service worker and recoverable folded records remain unchanged. The matching pipeline order remains unchanged. StreamYard’s native panel remains inviolable.

**Evidence qualification.** The capture proves transport feasibility and concrete event shapes. It contains one unique YouTube comment delivered twice, not a broad coverage or reliability test.

Two artifact defects currently block promotion:

- **Both purportedly sanitized JSON files contain authentication tokens in socket URLs.** Treat them as exposed and revoke or rotate them before further sharing. Regenerate the sanitized artifacts without token-bearing URLs.
- Both JSON containers parse, but their `comment.created.first` and `comment.created.duplicate` frame strings contain broken escaping around avatar URLs. Those frame strings fail JSON parsing. Repairing those quotes in memory confirmed the documented nested schema, but the checked-in fixtures remain invalid. Runtime parsing must never compensate for this sanitization defect.

The following gates are requirements, not claims that application tests or live verification passed during this review.

**1. Transport decision and authority**

Use one content-owned admission coordinator for both inputs:

```text
Socket → pure parser → bounded candidates ─┐
                                         ├→ admission coordinator → matching core → sidebar
DOM → settled native occurrences ─────────┘
```

| Responsibility | Authority |
|---|---|
| Preferred comment payload in promoted primary mode | Validated room-socket event, correlated with a native occurrence. |
| Whether a comment becomes an admitted occurrence | Settled DOM evidence. |
| Immediate fallback when socket data is unavailable | DOM extraction, without waiting for the socket. |
| Stable ID, server creation time and author identity | Validated, scoped socket fields associated unambiguously with the occurrence. |
| Confirmed shown-ID set | Fresh, scoped `broadcast.status` snapshot. |
| Native feature target and permission to click | Current DOM row/control validation plus the existing teacher request. |
| Deletion or withdrawal | Independently verified native evidence until deletion/moderation semantics are captured and specified. |

In enrichment mode, DOM records are admitted immediately and subsequently enriched. In primary mode, the coordinator prefers an available socket candidate when its native occurrence becomes eligible. A DOM occurrence that arrives first is still admitted immediately; a later socket event updates that same record.

Socket-only candidates remain outside matching, duplicate counts and the teacher’s question list. They cannot create a second occurrence by repeatedly matching one native row.

This definition explicitly limits primary acquisition: **it does not yet solve capture of comments that never become observable in the DOM.** If ordinary scrolling or native-tab switching prevents eligibility checks, that remains a coverage failure. Passing a transport test does not waive that requirement.

Use the previously specified constructor-only observer, now as planned v2 work:

- Static MAIN script at `document_start`, top frame, plus the early ISOLATED bridge.
- Exact endpoint checks: room traffic on `wss://videows.streamyard.com/<ROOM_ID>` and app-state traffic on `wss://streamyard.com/api`. Parse URLs structurally; never match by substring.
- Return the real socket and observe inbound messages through independent listeners.
- Never wrap `send`, replace page handlers, synthesize heartbeats, reconnect or create another connection.
- Socket callbacks only enqueue bounded data. Parsing happens in subsequent tasks.
- Forward an endpoint key and opaque socket identity, never the socket’s query string.

Static MAIN registration is supported by Chrome; page CSP still applies in MAIN. The actual extension registration and startup must be tested, because the capture used CDP injection. [Chrome content-script documentation](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)

A bridge namespace or token does not authenticate page data. Preserve the existing source/origin, version, sequence, size and session checks. Bridge traffic never authorizes an extension action.

**Demotion replaces waiting or reconnecting.** Keep DOM observation running throughout every mode.

| Signal | Required response |
|---|---|
| Missing bridge handshake after 2 seconds; missing bridge health for 4 seconds | Disable socket consumption. |
| Constructor replacement, listener failure, socket close/error or unexpected parser exception | Disable the affected capability immediately. |
| Bridge sequence gap, overflow or size/rate violation | Disable socket consumption immediately. |
| Invalid required fields in a recognized comment event | Reject the event/batch and demote comment acquisition immediately. |
| Contradictory occurrence identity, immutable content or broadcast association | Demote immediately; preserve DOM records. |
| Expected comment correlation unresolved after 1.5 seconds while DOM observation is available | Demote comment acquisition. Never delay a DOM admission for this deadline. |
| Native observation unavailable | Suspend primary eligibility and retain the existing capture-unavailable behavior. |
| Unknown relevant schema | Demote the affected capability after three consecutive occurrences or five within 30 seconds. Known unrelated traffic does not count. |
| No inbound room traffic for 6 seconds | Demote room acquisition. |
| No inbound app-state traffic for 75 seconds | Mark socket-derived feature/star state stale. |
| Reconnect with unproven recovery boundaries | Continue through DOM for the document; do not admit assumed backfill. |

The heartbeat deadlines are initial engineering thresholds based on the observed approximately 1.5-second and 30-second intervals. Use local monotonic time. A quiet comment feed is healthy when transport heartbeats continue.

Demotion takes effect in the detecting callback and remains latched for the document. A shared hook/bridge failure disables both socket capabilities. An app-state-only failure need not disable healthy room acquisition when its existing broadcast association remains valid.

Preserve admitted records, counts, verified identity mappings and reading position. Discard unconfirmed candidates and mark unsupported live state unknown. Log one redacted `[Ṣafwa]` diagnostic per demotion reason, without a transport toast. Never reinstall a replaced constructor or refresh the studio.

**2. Parser contract, schema and ordering**

Use **`src/ws-parser.js` as the single runtime schema implementation**, replacing the earlier proposed `src/transport/parser.js` path. Protocol constants and budgets belong in `src/config.js`. The coordinator owns association, dedupe and state application.

```text
parseWsFrame(raw, { endpointKey, direction })
  → {
      status: "ok" | "ignored" | "unknown" | "malformed",
      comments: NormalizedComment[],
      events: NormalizedStateEvent[],
      unknown: DiagnosticCode[],
      errors: DiagnosticCode[]
    }
```

The parser is pure: no DOM, clocks, storage, network access, logging, dedupe state or calls to `processComment()`. Diagnostic codes contain no raw payloads.

| Input | Exact decoding and output |
|---|---|
| Room `type: "message"`, `message.command: "appMessage"` | Parse the outer JSON, then parse **`message.body.message` as a JSON string**. For inner `type: "platformComments.created"`, decode `data.comments[]`. |
| Room `message.command: "commentUpdated"` | Read `message.body.comment`. Emit a comment/stage update event, not a new occurrence and not an inferred `shown: true`. |
| API `type: "update"`, subscription `broadcast.status` | Read `message.payload.broadcast.id`, `videoRoomId` and an explicitly present `shownCommentIds` array. Preserve available snapshot timestamps. |
| API subscription `starredComment.starred` | Read the comment directly from `message.payload`, including `id`, `broadcastId` and `starredAt`. Emit a positive star-state event. |
| Heartbeats and recognized unrelated traffic | Return `ignored`; transport health is updated separately. |
| Outbound frames | Return `ignored`. The captured `showComment` and authenticated hello document native behavior; production observation does not collect outgoing traffic. |

For created comments:

- `id`, `name`, `platform`, `authorPlatformId`, `createdAt` and supported `contents[]` produce the normalized comment.
- In the actual created-event fixture, **`broadcastId` and `destinationId` belong to `data`**, not necessarily each comment. Inherit only from the defined enclosing fields. Reject contradictions between enclosing and item-level identity.
- Map `name` to the displayed handle/name. Preserve text segments and concatenate supported text contents in array order without invented separators.
- Preserve `largeImageSrc` and `smallImageSrc` separately. Validate URLs before selection.
- Preserve `pos`, `message.sentAt` and the item’s batch index as source metadata.
- Do not require `publisherPermissionLevel`: it is absent in the duplicate delivery.
- Never use `containsQuestion` as Ṣafwa’s classifier. It is `false` for the captured Persian question.

Validate required types, nonempty identity fields, safe integer positions and valid timestamps. Missing optional avatars do not invalidate a question. Unsupported content types are not silently flattened into an incomplete question; retain the DOM path for that occurrence.

Malformed recognized comment batches produce no partial admission output. Return bounded errors and let the coordinator demote while DOM capture continues. Unknown event names never become guessed edits, deletes or questions. Binary input is unsupported, not a reason to add protobuf or Worker interception.

**Ordering uses three separate concepts:**

1. **Room event order:** inbound `pos`, scoped to the socket instance and connection generation. Preserve `sentAt` as server event time. Process a batch’s items in array order.
2. **Source creation time:** the comment’s `createdAt`. A repeated delivery does not change it.
3. **Admission and matching time:** immutable local admission sequence and monotonic observation time. These continue to govern filter windows and stable sidebar placement.

Do not compare positions across sockets, directions or reconnect generations. The outbound show request also has `pos: 12`; it is not the inbound comment at position 12.

A numeric gap in room positions alone does not prove loss. Unrelated messages and selective capture can create apparent gaps. A gap in Ṣafwa’s own contiguous bridge sequence does indicate lost forwarding.

API fixtures have no room-style `pos` or `message.sentAt`. Order their updates using their own receive sequence and available snapshot timestamps. Never fabricate a cross-socket total order.

Late metadata or repeated delivery never moves an established sidebar row or restarts a continuation window. Unexplained position regression or conflicting reuse demotes acquisition; it must not silently discard a newly observed DOM question.

**3. Data model, dedupe, avatars and panel rows**

Keep the opaque local `sourceId` as the stable sidebar/action identifier. Add a secondary identity index:

```text
(broadcastId, platform, commentId) → sourceId
```

Use a structured tuple, scoped to the content session. Do not assume comment IDs are globally unique.

| Field | Revised use |
|---|---|
| `commentId` | Transport occurrence identity and state-event lookup. |
| `authorPlatformId` | Stable author identity within a platform. |
| `createdAt` | Genuine server creation timestamp; nullable for DOM-only records. |
| `contents` | Original supported structured segments alongside complete display text. |
| Avatar candidates | Validated socket large/small URLs and the independently extracted DOM avatar. |
| Source order | Socket generation, position, server send time and batch index. |
| Provenance | Which fields were DOM-observed, socket-observed and successfully correlated. |
| Native anchor | Separate occurrence-aware registry, never serialized into the matching core. |

Late association adds an index entry to the existing source record. It does not replace its `sourceId`, append another row or increment counts.

**Delivery dedupe precedes semantic dedupe.**

- The same ID at positions 12 and 13 produces one admitted occurrence and one classification pass.
- Optional metadata differences between deliveries are compatible with that identity.
- Two distinct IDs containing the same question remain two occurrences. The existing matching pipeline may fold them with count 2.
- A state update, star event or shown-ID snapshot never creates a question occurrence.
- Repeated delivery must not advance continuation timing, trigger another LLM request or change the first-admission sequence.

Use a bounded recent-delivery cache for fast rejection. The admitted-record identity index remains the authoritative dedupe check after that cache evicts entries. Session history must not be evicted to bound a transport cache.

For person identity, prefer `(platform, authorPlatformId)` once established. Retain the existing platform/folded-handle fallback for DOM-only observations. Two different stable authors sharing a displayed name must remain different people; a renamed handle with the same stable author ID remains the same person.

If late identity enrichment changes a matching input, rebuild decisions atomically from retained occurrences in their original admission order. Invalidate incompatible pending LLM results. That rebuild replaces derived decisions; it never adds occurrences.

Each source row still shows avatar, original handle/name, platform, complete text and applicable duplicate/joined/second-question annotations in the existing Dari RTL design.

Prefer validated `largeImageSrc`, then `smallImageSrc`, then the DOM avatar. A failed image advances through the remaining validated candidates once, then uses the fixed-size neutral fallback. Missing images never block admission. Keep the existing HTTPS validation, no-referrer policy and prohibition on logging avatar URLs. Real provider images still need verification in the extension sidebar.

**Stable socket IDs improve association; they do not prove a DOM anchor.** Identical native twins, remounts and virtualized-away rows still require unambiguous occurrence binding before featuring.

**4. Feature and star synchronization**

Maintain separate per-source states for **shown** and **starred**, each with `unknown`, positive and negative values plus provenance/freshness.

- **`commentUpdated` reports a server update.** Its captured body contains a comment with `id`, text, name, platform and `imageSrc`. It contains no explicit shown flag. Update an existing associated record and record that stage-related state changed. Do not infer that it is the only shown comment, an edit or an action acknowledgement.
- **`shownCommentIds` supplies the shown set.** For a validated snapshot of the current broadcast, replace the previous set with the explicit array. Preserve all IDs; do not assume only one comment can be shown. A missing field means “no update,” not an empty set. Negative/removal behavior needs live fixture coverage before that capability is enabled.
- **`starredComment.starred` supplies positive star state.** Apply it by scoped ID, including `starredAt`. It neither features the comment nor marks it answered. No unstar event was captured, so do not invent one. Negative star state requires verified native evidence or a later fixture-backed event.

Room events lacking a broadcast ID inherit context only from the validated socket-to-broadcast association. Use `broadcast.id` and `videoRoomId` to establish that relationship; do not infer it from whichever sidebar happens to be open.

Reject stale app-state snapshots using their connection generation, receive order and available broadcast update timestamp. Cross-socket uncertainty does not justify overwriting newer verified state. Reconnect or app-state failure makes current socket-derived state unknown until a valid snapshot restores it.

The feature proxy remains:

```text
Sidebar teacher action → SW → tabs.sendMessage → content validation → one native click
```

The request still carries the opaque `sourceId` and revision. Content resolves any transport ID internally. A socket ID is never a substitute for checking the connected native row, exact source text/identity and the current button.

If the native control indicates the comment is already shown, do not toggle it again. If it is absent, ambiguous or recycled, refuse the proxy and retain the native-lookup fallback. There is still no automatic scrolling or direct `showComment` transmission.

Keep the existing one-second action acknowledgement timeout and request receipts. **Add a separate 15-second feature-state observation deadline.** The captured shown-ID snapshot arrived **10.26 seconds after the show request**, so a one-second action timeout cannot establish feature failure.

If confirmation remains unavailable, use the existing check-broadcast outcome and require a fresh teacher action. Never retry automatically. The capture occurred with the broadcast stopped, so stage state is not proof of live viewer output.

**5. Flags and promotion gates**

Use one transport mode switch:

| `CONFIG.WS_MODE` | Preferred acquisition source | Effect |
|---|---|---|
| `"off"` | DOM | No MAIN observer registration or execution. |
| `"log"` | DOM | Parse and compare in shadow mode; diagnostics only. |
| `"enrich"` | DOM | Attach verified identity/avatar/time metadata and enabled state capabilities. |
| `"primary"` | WebSocket, with DOM eligibility and fallback | Prefer parsed socket candidates through the shared admission coordinator. |

This replaces the earlier `"observe"` name. Do not introduce an independently configurable `WS_CAPTURE` switch.

`CONFIG.COMMENT_SOURCE` becomes derived: `"websocket"` for configured primary mode, otherwise `"dom"`. Runtime health can only lower the effective source to DOM. It does not independently enable the observer.

Keep `PANEL_MODE: "sidebar"` and `AUTO_HIDE_ANYTHING_AMBIGUOUS: false`. `FEATURE_PROXY_ENABLED` remains subject to its native-action live gate. Transport modes are developer/release configuration, not a sixth teacher setting.

The initial production default remains `"off"`. Non-off packages register the observer before studio sockets are constructed. Turning the teacher’s view on must not attempt a late hook installation or reload the page.

**Gate A, off to log:**

Correct the sanitization and frame escaping, add fixture tests and verify static extension injection in the target browser. Prove constructor behavior, bounded queues, cleanup, startup bridging and zero interference with native traffic. Log only aggregate counts, reason codes and non-identifying timings.

The existing capture satisfies discovery, but not this complete gate.

**Gate B, log to enrichment:**

Require two consecutive full rehearsals with:

- Zero incorrect associations or missing expected DOM occurrences.
- Zero count inflation from repeated delivery or dual-source observation.
- Zero native-panel disturbance.
- Avatar loading and ID/time coverage measured in the sidebar.
- Deliberate socket failure, reconnect and studio-context change with uninterrupted DOM fallback.
- Corrected fixtures and all relevant `npm test` coverage passing.

Compare occurrence membership and field correspondence, not filtered row totals. Initially qualify YouTube only. Other platforms continue through DOM until their schemas and behavior are verified.

**Gate C, enrichment to primary:**

Require two further consecutive rehearsals in the primary configuration. Demonstrate:

- Exactly-once admission across socket-first, DOM-first and duplicate-delivery cases.
- Correct behavior during native scrolling, tab switching, row recycling and identical resends.
- Captured reconnect/replay behavior or a proven transition to DOM without assuming recovery.
- Explicit coverage of held/hidden comments and other available moderation cases, with no socket-only admission.
- Correctly scoped feature snapshots, show/removal behavior and independent star state.
- All performance targets below, successful fault injection and a measured benefit from primary acquisition.

Routine supported use must not cause repeated fallback that defeats the claimed primary role. Unobserved edits, deletion, unstar or history formats remain disabled capabilities.

Promotion is a recorded release decision between sessions. No runtime counter automatically promotes a live studio.

**6. Invariant #1 replacement and decision record**

**Decision: adopt the amendment now in the architecture.** Discovery has succeeded. The earlier “amend conditionally after discovering a useful socket” decision is superseded. The file itself remains unchanged by this read-only task.

Exact replacement wording:

> **1. Do not assume a supported StreamYard API, webhook or SDK.** Ṣafwa may observe inbound text messages from the page’s own WebSockets through a read-only, separately gated observer. Transport behavior starts in log-only mode, may become enrichment after fixture and live-parity gates, and may become primary comment acquisition only after the documented primary-promotion gate. Primary acquisition does not replace DOM eligibility: every admitted occurrence must have unambiguous native DOM evidence, and socket-only candidates must not enter matching, increase counts or hide questions. The isolated DOM observer remains active and supplies immediate fallback without resetting admitted history or counts. Ṣafwa must never create a StreamYard connection, send or modify frames, replace page handlers or manage the page’s heartbeats or reconnections. Transport failures, invalid recognized schemas, loss, overflow, stale context or contradictory association disable the affected capability for the document while DOM processing continues. Unknown events cannot delete or withdraw questions. Socket state never authorizes a native action; each feature request requires a teacher action and current native-row validation. StreamYard’s native comments panel, layout and controls remain unmodified and available.

Add to the schema-isolation convention when implemented:

> Runtime WebSocket schema logic lives only in `src/ws-parser.js`, with protocol constants and limits in `src/config.js`. Captures and fixtures are inert evidence and must never be imported by runtime code.

The decision record should cite the dated capture, distinguish CDP feasibility from extension verification and record the chosen rollout mode. Replace the old specification’s DOM-only transport description with this same acquisition/eligibility distinction.

**7. Acceptance, performance and test-plan changes**

Retain v1 acceptance criteria 1–7 and the earlier sidebar criteria. Add these executable requirements:

| Area | Added tests and acceptance |
|---|---|
| Fixture integrity | Every positive fixture must decode at both required JSON layers. No credentials, token-bearing URLs or live identifiers in artifacts. Preserve the broken escaping as an explicitly malformed synthetic case if useful. |
| Real schema | Created-event nesting; parent-level broadcast/destination IDs; multiple text segments; missing optional permission flags; avatar variants; `commentUpdated.imageSrc`; API updates without room positions. |
| Malformed/unknown input | Invalid outer/inner JSON, wrong field types, invalid IDs/timestamps/positions, unknown content types, non-text input and malformed batches. No exception escapes for invalid external input and no partial admission occurs. |
| Delivery identity | Positions 12 and 13 produce one occurrence. Three distinct IDs with identical question text can produce count 3. Repeat delivery changes neither timing nor LLM scheduling. |
| Ordering | Equal timestamps, position gaps, stale positions, separate directions, reconnect generations and late DOM confirmation. Established sidebar order never jumps. |
| Identity and avatars | Same name/different author IDs, renamed author, platform separation, late metadata association, image failure and ambiguous native twins. |
| Feature/star state | Updates do not create comments; `commentUpdated` alone does not assert shown state; full shown sets, missing/empty fields, stale snapshots, multiple IDs, delayed confirmation and star independence. |
| Recovery and safety | Socket loss during a burst, bridge forgery/flood, queue overflow, unknown recovery, stale broadcast events, SW restart and sidebar reopen. Counts/history persist and unauthorized native clicks remain zero. |

Add inbound heartbeat fixtures for both endpoints. The supplied outbound ping does not test production heartbeat observation. Capture real removal, unstar, edit, moderation and replay examples before implementing those semantics; synthetic tests must be labeled as such.

The pure parser returns the duplicate comment on each valid parse. **Coordinator tests**, not parser-local state, prove dedupe.

Promote the earlier “later transport” harnesses into the current v2 test plan. Preserve existing core and legacy regression coverage. New executable tests join `npm test`.

| Performance requirement | Revised budget |
|---|---|
| DOM eligibility to sidebar paint | Retain p95 ≤250 ms and p99 ≤500 ms, excluding LLM and remote image download. |
| Socket receive to parsed candidate | p95 ≤100 ms under the supported load. Measure socket-to-DOM eligibility delay separately. |
| MAIN listener overhead | p95 ≤0.2 ms per eligible event. No payload parsing in the listener. |
| Parser/coordinator work | Target p95 ≤2 ms per captured-size frame; yield between bounded batches within the existing approximately 8 ms work slices. |
| Bridge limits | Retain 64 KiB/frame, 200 envelopes/second, 1 MiB/second and queues bounded by 200 envelopes and 1 MiB. Exceeding a limit demotes; never truncate into a parser. |
| Pending socket candidates | At most 200 candidates and 1 MiB, subject to the correlation deadline. Overflow uses DOM fallback. |
| Retained state | Existing 5,000-comment, three-hour, ≤50 MiB target now includes transport indexes and buffers. No admitted-history eviction. |
| Stress and rendering | Retain 10 comments/second for 60 seconds, 25/second for five seconds, ≤20 publication batches/second and no extension-caused tasks over 50 ms. |

The 1,260-frame capture is predominantly heartbeat traffic. It establishes neither these performance targets nor complete comment coverage. Primary promotion requires measurements from the actual extension, including deliberate demotion and the unchanged native-feature release test.
tokens used
118.803
