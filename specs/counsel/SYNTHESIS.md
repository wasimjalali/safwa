# SYNTHESIS — Ṣafwa v2 Counsel (8 councilors)

> **BINDING UPDATE (2026-09-11, after this synthesis was drafted): the product owner has fixed the panel-host conflict. Read `USER-DIRECTIVE-2026-09-11.md` first — it overrides Section 2 (panel host = separate browser sidebar, never in-page), adds avatars as a requirement, and reframes WebSocket capture as permitted enrichment with reliability as the deciding factor. The rest of this synthesis (consensus, failure model, feature-proxy, invariant positions, experiments) still stands.**

Written by the orchestrator from the eight councilor answers in `specs/counsel/*.md` (raw logs in `specs/counsel/raw/`). This document is an input to the **finalizer** (GPT-6-Astra), not the decision. It states what the council agrees on, where it conflicts, and what evidence is missing.

Councilors: GLM-5.3, GPT-5.6-Luna, Kimi K3, Qwen3.8-Max, Muse Spark 1.3, GLM-5.3-Flash, HY4, Grok 4.6. Brief: `specs/websocket-counsel-brief.md`.

---

## 1. Unanimous consensus

1. **The teacher's complaint is a rendering problem, not a capture problem.** Every councilor: a custom panel fixes "badges are not clean enough"; WebSocket capture by itself delivers zero teacher-visible benefit.
2. **Ship the custom panel on the proven DOM rail first (Option B).** Reuse `dom.extractComment → grouping.processComment` unchanged; swap only the render target. No councilor recommends A or C as the first build.
3. **Do not ship WebSocket capture as the feed's source of truth for v2.** A is rejected for runtime in this release by all; several allow a passive, off-by-default discovery/experiment instrument; GLM-5.3/Luna/Qwen/Kimi target C only after evidence.
4. **Native panel stays in the DOM.** It is the fail-open fallback and the anchor for the teacher's native featuring action. The worst acceptable outcome is "back to the v1 look."
5. **Feature-proxy is required and has a common shape:** map custom row → native row via the existing `platform\0handle\0displayText` fingerprint (`content.js:137` `liveByFingerprint`/`retargetDecision`) plus a stable id if ever found; click the real `button[data-testid="show-comment-button"]`; keep that selector in `src/config.js`/`src/dom.js` only. Clicking the wrong recycled row is a named hazard; re-validate handle+text immediately before clicking (HY4).
6. **Gemini components mostly rejected:** offscreen (all: reject), declarativeNetRequest (all: reject; it cannot read WS bodies), `storage.sync` (all: reject), `storage.session` (reject for matching state; adapt only if the panel moves out of the tab), service worker (reject for MVP; needed only if `chrome.sidePanel` is adopted), `messaging-bus`/`storage-adapter` abstractions and file-tree reshuffle (reject).
7. **Invariant #1 must not be silently violated.** All eight address it; none propose violating it. Positions split on timing/wording (Section 3).
8. **The matching core and `npm test` stay untouched/green;** new pure modules (parser, if any) get fixture tests in the same style.

---

## 2. The real conflict: panel host

| Host | Councilors | Strongest argument |
|---|---|---|
| **In-page panel (shadow DOM), inside/near the comments aside** | GLM-5.3, Muse Spark, Grok 4.6, HY4, GLM-5.3-Flash, Qwen (open question implies in-page) | Keeps the teacher in one window; native rows adjacent and mounted (feature-proxy trivial); no new permissions/SW; state stays in the content script; existing watchdog re-attaches. Weakness: fights StreamYard CSS/z-index and SPA re-renders; must re-create itself. |
| **`chrome.sidePanel`** | GPT-5.6-Luna, Kimi K3 | Lives outside StreamYard's DOM: immune to SPA re-renders, selector rot and CSS occlusion; genuinely "clean" geometry (no ghosts ever). Weakness: needs a service worker + `sidePanel` permission + tab↔panel messaging; state must move or be mirrored; panel is outside the studio window the teacher watches. |

Related sub-conflict — **who owns state if the panel is separate**: content script stays the state owner and the panel is a dumb renderer pushed idempotent snapshots (Kimi/Qwen), vs state lives in the panel/SW (implied by sidePanel-only designs). The brief's constraint (core pure, fail-open) favors content-script ownership.

## 3. Invariant #1 positions

| Councilor | Position |
|---|---|
| GLM-5.3 | Amend — conditional on evidence; read-only tap allowed, schema isolated like selectors. |
| GPT-5.6-Luna | Amend — DOM is correctness source; transport observer allowed only as experimentally validated optimization. |
| Kimi K3 | Amend — passive, fail-open, never `send`, never delay. |
| Qwen3.8-Max | Amend — **void if step-0 DevTools check finds no page-owned WebSocket.** |
| HY4 | Amend — "the socket is a tap, never a mouth"; **the DOM is the arbiter**; socket may annotate/pre-warm, never hide/count/feature alone. |
| Muse Spark 1.3 | Narrow amend — transport interception stays a **dev-time tool**, never the live path unless a later decision record promotes it. |
| GLM-5.3-Flash | **Reject the amendment this release** — B never touches transport; editing an invariant for code we are not shipping is over-build. |
| Grok 4.6 | **Reject the amendment now** — keep `CLAUDE.md` as written; a human DevTools capture + redacted fixtures is research, not product. |

Provisional middle path for the finalizer: **do not amend for the shipping build; record a conditional amendment** that permits only an off-by-default, read-only, dev-only capture instrument and commits to fail-open + DOM-arbiter semantics. This satisfies the mission's "explicitly amend or reject with a decision record" requirement without shipping unproven privilege.

## 4. WebSocket discovery: how far to go in v2.0

- **Passive instrument now (inside the same development build, flags off by default):** GLM-5.3, GPT-5.6-Luna, Qwen3.8-Max, Kimi K3. Rationale: cheap, answers the schema/ID questions with evidence instead of inference, and keeps the C path honest.
- **Dev-only, never shipped:** HY4, Muse Spark.
- **Defer entirely until after B proves the panel is the win:** GLM-5.3-Flash, Grok 4.6.
- Common mechanics the council converged on (if/when built): manifest `world:"MAIN"` content script at `document_start` (Chrome 111+, no new permissions, CSP-exempt); patch the `WebSocket` constructor + `message`/`onmessage` surface read-only; constructor patching covers reconnects; never `send`; `window.postMessage` envelope with namespace/seq/size cap (8–64 KB) and token-bucket flood guard; treat frames as untrusted (any page script can forge); parse in the isolated world behind a pure `parseTransportFrame` module; unknown frames counted, never guessed; DOM remains arbiter.
- Named unknowns: transport may not be a page-owned WebSocket (SSE/Worker/other); binary/protobuf would make the rail not worth it (GLM-5.3's tripwire); stable comment ids may exist in neither DOM nor frames.
- **Cheapest discriminating experiment (all councilors):** 5–15 minutes in DevTools Network → WS on a studio, inspect frames for comment-shaped payloads, before writing any hook code.

## 5. Feature-proxy details — convergence and split

Converged:
- Fingerprint key = `platform::foldHandle(handle)::matchKey` (HY4's hardening of the raw-text fingerprint) and/or stable id.
- Re-validate a mapped native row immediately before clicking (recycling); prefer connected, currently-valid rows; ambiguity (two rows, same fingerprint) → disable or mark, never guess (Luna).
- Joined questions target the primary/original row, not the continuation fragment (Grok).
- Feature state reflection into the panel: defer (cosmetic).

Split — **virtualized-away fallback**:
- **Honest disable + hint (calm Dari label):** Kimi, GLM-5.3-Flash, Muse (Muse additionally warns: do not auto-scroll the teacher's native panel mid-show).
- **Bounded scroll-hunt / reveal-then-click:** GLM-5.3 (≤20 steps), HY4 (`revealAndClick`, wait 2 frames, validate), Qwen (`scrollIntoView` nearest), Luna (bounded wait for row appearance).
- Zero-regression floor in all variants: the teacher can always fall back to the native panel, which is never destroyed.

## 6. Failure model consensus (for Q5)

| Failure | Signal / threshold | Fallback | Teacher sees |
|---|---|---|---|
| Panel render crash | exception / empty snapshot | v1 in-place annotation (always running) | v1 look, feed intact |
| DOM container gone (SPA re-render) | watchdog (existing 3s recheck) | re-attach, re-seed panel | brief flicker only |
| Feature-proxy row recycled/absent | re-validation mismatch / miss | disable button + hint; native panel manual feature | one extra tap in rare case |
| (If instrument/rail exists) bridge silent | no frames for N seconds | demote to DOM, log `[Ṣafwa]` | nothing changes (DOM already drives) |
| (If rail exists) parse-error spike / unknown-schema ratio | threshold, one-way demotion | DOM rail, flag latched off until reload | nothing changes |
| LLM down (existing) | timeout 8s | regex look stands | unchanged from v1 |

Universal rule restated by every councilor: **the DOM rail never stops running**; the custom panel is a view of its decisions, not a second feed.

## 7. Provisional recommendation (for the finalizer to adopt, amend or overrule)

1. **MVP = B**: custom panel rendered from the existing DOM pipeline; native list untouched; feature-proxy implemented (fingerprint + native click, hint fallback); v1 annotation retained as fail-open.
2. **Panel host:** decide between in-page shadow-DOM panel (provisional lean: lower complexity, state stays in-tab, feature-proxy distance zero) and `chrome.sidePanel` (cleaner geometry, higher plumbing). If sidePanel is chosen, content script remains the state owner and the panel is a pure renderer.
3. **V2.0 scope discipline:** panel + feature-proxy + fail-open + tests only. A dev-only, off-by-default capture instrument may be built to resolve the socket unknowns **only if it does not touch the shipping path**; its output is redacted fixtures, not runtime behavior.
4. **Invariant #1:** keep the shipped build compliant (no runtime tap) and record the conditional amendment + the exact replacement wording (see §3), with the flask of "amendment void if step-0 finds no page-owned WebSocket."
5. **Flip-the-default evidence for C (only if pursued):** socket carries comment frames; stable ids and/or delete events confirmed; two live sessions with zero divergence from DOM; sanitized fixtures in `test/fixtures/`; `npm test` green; no teacher-visible regression in the same-session A/B.

## 8. Open questions and cheapest experiments

| # | Question | Cheapest experiment |
|---|---|---|
| 1 | Does any page-owned WebSocket carry comments at all? | 5–15 min DevTools Network → WS frame inspection on a studio with live comments. |
| 2 | Does `show-comment-button` exist/click without hover? Is `.click()` enough? | 5 min DevTools: `$0.querySelector('button[data-testid="show-comment-button"]').click()` on a live row. |
| 3 | Does a stable comment id exist in DOM (React key/data-attr) or frames? | DevTools `$0` React props + one capture session. |
| 4 | Can the native panel be hidden without starving the DOM observer? | Collapse it for 5 min, watch MutationObserver/event rate and feature-proxy behavior. |
| 5 | Which panel layout does the teacher actually want? | Static design mock (`test/teacher.html`/`popup-designs.html` precedent) shown to the teacher before code. |
| 6 | Does the same-person LLM mis-hide (known v1 bug) persist in panel mode? | Replay fixtures through `applyLlmOverride`; panel shows pre-confirmation dim state, never pre-hides. |
| 7 | Chrome version support for `world:"MAIN"` content scripts in the Aside browser | `chrome.runtime.getManifest()` + feature-detect at runtime (`chrome.scripting` not needed). |

## 9. What the finalizer must produce

A single, unambiguous architecture decision that:
- resolves the panel-host conflict with a rationale tied to `npm test`-able modules and the fail-open constraint;
- resolves the capture-scope question (ship path vs dev-only instrument) and states the invariant #1 disposition with exact `CLAUDE.md`/spec wording;
- specifies module layout, data flow, flags (`CONFIG.COMMENT_SOURCE`, capture flags), failure triggers/thresholds, perf budget, acceptance criteria (v1 criteria 1–7 plus panel-specific ones), unit + live test plan, and the exact rollback path;
- labels every unknown as unknown with the experiment that resolves it;
- keeps v1 behavior intact behind the flag.
