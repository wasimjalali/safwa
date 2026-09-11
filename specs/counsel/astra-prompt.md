You are the FINALIZER for the Ṣafwa v2 architecture (Chrome MV3 extension). You have read-only access to the repo at the current working directory. Do not modify any files.

Read, in this order:
1. specs/counsel/USER-DIRECTIVE-2026-09-11.md — binding requirements from the product owner; overrides councilor preferences where they conflict.
2. specs/websocket-counsel-brief.md — full product/codebase context, hard constraints, the mandatory questions, and the output contract the council used.
3. specs/counsel/SYNTHESIS.md — orchestrator synthesis: unanimous consensus, conflicts, provisional recommendation, failure model, open questions.
4. All eight councilor answers: specs/counsel/glm-5.3.md, specs/counsel/gpt-5.6-luna.md, specs/counsel/kimi-k3.md, specs/counsel/qwen3.8-max.md, specs/counsel/muse-spark-1.3.md, specs/counsel/glm-5.3-flash.md, specs/counsel/hy4-preview.md, specs/counsel/grok-4.6.md.
5. Repo files cited there (manifest.json, src/config.js, src/content.js, src/dom.js, src/grouping.js, src/normalize.js, src/dedup.js, src/state.js, src/ui.js, src/llm-classifier.js, styles.css, captures/streamyard-live-dom.json, qa-screenshots/live-2026-09-10-cli/REPORT.md, test/run-tests.js, test/mock-comments.js, package.json) as needed for exactness.

Your job: produce THE authoritative v2 architecture decision and implementation blueprint, resolving every conflict in the synthesis. Key hard requirements:

- Panel host is FIXED by the directive: a separate browser sidebar (chrome.sidePanel or equivalent extension sidebar), never injected in-page; the native StreamYard comments panel must remain fully intact and is unconditionally the fail-open fallback.
- The sidebar opens when the teacher turns the extension on. Specify the exact toolbar-icon/popup/sidebar/settings behavior.
- Panel rows show avatar, handle/name, platform, comment text, and filter annotations, in Dari RTL, with the Ṣafwa brand. Avatar is required.
- Capture must be real-time, reliable, stable, smooth. DOM observer is the guaranteed baseline. A read-only tap on the page's own WebSocket is permitted as enrichment (speed, avatars, stable ids, delete/feature events) only under evidence and strict fail-open rules; decide its exact role, gating, demotion triggers, and whether invariant #1 in CLAUDE.md is amended now, amended conditionally, or left as-is — with exact replacement wording if amended, and the decision record either way.
- Decide where session matching state lives (content script vs SW vs storage) with MV3 service-worker sleep in mind, and how the sidebar stays in sync across SPA re-renders.
- Cross-document feature-proxy: sidebar -> SW -> tabs.sendMessage -> content script -> validated native row -> click button[data-testid="show-comment-button"]. Include recycled-row validation and the virtualized-away fallback with its exact UX cost. Never feature the wrong row.
- Failure model with measurable triggers/thresholds and teacher-visible behavior. The worst acceptable outcome is the v1 look; native panel never touched.
- Module layout (files, worlds, message contracts), data flow, config flags (including CONFIG.COMMENT_SOURCE default), perf budget, v2 acceptance criteria (extending v1 criteria 1-7), unit + live test plan (npm test must stay green), rollout/rollback, risks ranked, remaining unknowns each with its cheapest discriminating experiment.
- Smallest winning MVP vs later phases; keep v1 behavior intact behind flags.

Style: decisive, concrete, implementable; cite repo paths; label unknowns as unknowns; no code changes (read-only). Output markdown only, starting with the heading: # Ṣafwa v2 — Final Architecture (GPT-6-Astra)
