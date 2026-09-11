# USER DIRECTIVE — 2026-09-11 (binding)

Source: product owner (Wasim), live clarification. This overrides councilor preferences where they conflict. Astra (finalizer) and Fable 5.1 (production spec) must treat this as a hard requirement.

## Fixed decisions

1. **Panel host is a separate browser sidebar, not in-page.**
   The custom clean layout opens as its own sidebar in the browser (e.g. `chrome.sidePanel` or equivalent extension sidebar), beside the StreamYard tab. It must **not** be injected into StreamYard's comments panel and must **not** integrate with it visually. The native StreamYard comments panel remains exactly as it is.

2. **The native comments panel is inviolable.**
   Whatever transport/render path is used, failure must never touch, corrupt, hide, or alter StreamYard's own comments panel or the broadcast. The teacher must always be able to fall back to the native panel and its native controls.

3. **The sidebar opens when the extension is turned on.**
   Teacher flow: open the StreamYard studio → turn Ṣafwa on (extension icon / toggle) → the clean sidebar appears and comments start showing up there, already filtered. The sidebar/action behavior must be specified (what the toolbar icon does, where the on/off and the five settings live).

4. **Each panel row shows: avatar, handle/name, platform, comment text, and the filter annotations** (duplicate count, "joined" state, second-question state), in Dari RTL, styled per the Ṣafwa brand. **Avatar is an explicit requirement** — source it from the DOM (`img[class*="Avatar__Image"]` src) and/or transport payload if available.

5. **Capture must be real-time, reliable, stable, smooth.**
   That is the owner's first priority, above transport choice. The proven DOM observer is the guaranteed baseline; a read-only tap on the page's own WebSocket is **permitted as enrichment** (real-time speed, avatars, stable ids, delete/star events) only under the council's evidence and fail-open rules. If it fails, stalls, or diverges: silently and immediately fall back to the DOM path; the sidebar keeps working; the native panel is untouched. **(The owner is open to WebSocket capture; reliability decides. Do not let the choice of transport compromise reliability.)**

6. **Never lose a question; never corrupt the feed.** Unchanged project invariants (CLAUDE.md) and v1 acceptance criteria 1–7 still apply, plus new panel-side acceptance criteria.

## Implications the finalizer must resolve explicitly

- `chrome.sidePanel` requires a service worker and the `sidePanel` permission; specify the SW's exact, minimal role and what happens if the SW is asleep.
- Decide where session matching state lives (content script remains the suggested owner; the sidebar renders snapshots) and how the sidebar stays in sync across SPA re-renders and SW restarts.
- Feature-proxy becomes cross-document: sidebar → SW → `tabs.sendMessage` → content script → validated native row click. Specify fallback when the native row is virtualized away.
- The existing popup may remain the settings surface, or its content may move into the sidebar; specify the final teacher-facing control layout.
- Avatar extraction: new selector(s) stay in `src/config.js` + `src/dom.js` only; sanitized sample goes to `captures/`.

## Addendum — platform coverage and moderation (owner, 2026-09-11 later)

7. **YouTube is the proven platform; assume the other destinations behave the same.** Facebook/Instagram/other platforms are expected to deliver the same comment event shapes over the same page socket. Do not build per-platform branches: keep the `platform` field generic, pass it through to the panel, and fail open if a platform's payload differs. Live confirmation with other platforms happens naturally during real sessions (the owner cannot test Facebook/Instagram now).
8. **Native deletion/moderation handling is NOT a requirement.** The teacher does not delete or moderate comments in StreamYard. A comment removed natively may remain visible in the sidebar; that is accepted. Do not spend MVP scope on deletion/moderation events, and do not let an unknown event of that kind affect filtering, counts, or hiding.
9. **In scope for "moderation" is only Ṣafwa's own filter state**: duplicate collapse + count, joined continuation, second-question dim/hide, greetings — exactly the v1 decision objects, now rendered in the sidebar instead of in-place badges.
