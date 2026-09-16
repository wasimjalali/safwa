# Ṣafwa (صفوة)

A Chrome extension that turns StreamYard's live Dari/Persian comments into a readable question queue in Chrome's side panel.

## Use

1. Install the extension, or load this folder unpacked from `chrome://extensions`.
2. Open a StreamYard studio and keep its Comments tab open at the live edge.
3. Click the Ṣafwa toolbar icon to open the side panel.
4. Use the display button beside a question to request a native StreamYard show/hide action. Check the broadcast output. If the original comment is unavailable, use StreamYard's own controls.

The master switch pauses new capture and cancels pending AI requests. Existing session history stays in memory. Switching it back on reads the currently mounted comments. The gear opens settings. Each question-mark button explains its toggle. The installed version appears in the footer.

## Five settings

| Setting | On | Off |
| --- | --- | --- |
| Collapse repeated questions | Certain or AI-confirmed copies share one question and count. | Copies remain separate. |
| Hide extra questions | AI-confirmed additional questions from the same platform/handle move to the folded list. | They remain visible with an ordinal badge. |
| Join continuations | The original and one continuation appear together. | Messages remain separate. Other enabled filters still apply. |
| Fold greetings | Greetings, thanks and blessings without a question move to the folded list. | They remain visible. |
| Compare meaning with AI | Ambiguous text and recent question text are sent for classification. | New text is not sent; uncertain questions stay visible. |

Possible duplicates stay visible until confirmed. AI errors, timeouts and rate limits leave uncertain comments visible. All folded comments remain readable through the folded list or duplicate disclosures.

Reset is scoped to the connected studio tab. It clears matching history and pending AI work, then rereads comments currently mounted in StreamYard. Comments in StreamYard are never deleted. The reset button shows progress and a success or failure message.

## Comment-source support

The extension reads StreamYard's common comment layout. It doesn't require a particular social handle or link identities across platforms. Exact text can be deduplicated across platforms; the per-person rule uses the platform and normalized displayed handle.

Actual availability depends on what StreamYard receives:

- YouTube, Facebook Pages/Profiles and other supported comment destinations can use the common DOM path.
- Instagram, Facebook Groups and custom RTMP destinations do not currently supply comments to StreamYard. Ṣafwa cannot retrieve comments that never reach the studio.
- YouTube private streams don't support comments. Facebook Profile streams need suitable public visibility and permissions.
- Unknown platform labels receive a neutral icon and remain readable.

These platform limits come from [StreamYard's destination matrix](https://support.streamyard.com/hc/en-us/articles/4415539271700-StreamYard-s-Supported-Platforms-Destinations) and [Facebook comment guidance](https://support.streamyard.com/hc/en-us/articles/360043726571-I-can-t-see-comments-during-my-Facebook-Stream).

DOM-only capture cannot recover comments that StreamYard never mounts while its Comments tab is closed or scrolled away. Displayed names are not stable account IDs, so identical names on one platform can be indistinguishable. Refreshing or leaving the studio loses session history. StreamYard layout changes can require selector updates. Never refresh a live studio just to troubleshoot Ṣafwa.

## Architecture

- `src/session.js` owns capture, session state, AI scheduling and panel synchronization in the content script.
- `normalize.js`, `state.js`, `dedup.js` and `grouping.js` form the pure matching core. Pipeline order is continuation, duplicate, then new/extra question.
- `src/config.js` and `src/dom.js` contain all runtime StreamYard selectors.
- `panel/` renders the question queue, settings and feedback. It never modifies StreamYard's layout.
- `src/sw.js` activates the panel and validates native-action routing. No matching state depends on service-worker lifetime.
- `deploy/cloudflare/` contains the existing classification Worker. It accepts only the extension's bounded task prompts, limits requests per IP and returns classification JSON. It doesn't return arbitrary model text.
- `src/llm-prompts.js` shares the task prompts between the extension and Worker, preserving existing clients.

The production configuration is `PANEL_MODE: "sidebar"`, `WS_MODE: "off"`. WebSocket code is experimental and requires the evidence gates in [the v2 specification](specs/safwa-v2-architecture.md). Production ZIPs exclude the WebSocket hooks and the legacy inline UI. Native interaction is limited to explicit, validated teacher clicks and cleanup of old Ṣafwa inline marks.

## Verification and packaging

```sh
npm test
npm run build:manifest
```

This is a dependency-free JavaScript project. TypeScript and lint are not configured. Tests cover the matching core, recorded WebSocket fixtures, admission, protocol, native-click refusals, rendering, session lifecycle, asynchronous AI races and Worker validation. The package version is the manifest builder's source of truth.

A store ZIP contains only `manifest.json`, the sidebar, required runtime modules, icons and the bundled fonts/licenses. Never include source captures, test fixtures, backend files, mockups, older ZIPs or local screenshots. The production package must exclude `ws-main.js`, `ws-bridge.js`, `content-legacy.js` and `ui.js`.

For the Worker, use the installed Wrangler CLI from `deploy/cloudflare` and validate with `wrangler deploy --dry-run`. Its `CLASSIFY_LIMITER` binding allows 120 classification requests per minute per IP at each Cloudflare location. This is abuse mitigation, not authentication or a global spending cap. Shared-network users share that limit; excess requests degrade to local filtering. No paid tier or new database is required by these source changes.

## 2.0.5 audit

- Fixed uncertain duplicates being folded before confirmation.
- Fixed duplicate-count inflation when identical comments were revisited or remounted.
- Fixed stale AI decisions, replacement-review scheduling and old review jobs surviving reset.
- Fixed saved-setting startup races and full recovery after temporary storage failures. Master-off stops capture and AI work.
- Fixed stale panel bindings and partial snapshots; published lists update atomically.
- Fixed inactive native controls staying available after removal or remount.
- Fixed Persian/Arabic continuation cues and honorific matching, plus question-slot accounting after a duplicate first question.
- Fixed scrolling ownership, preserved reading position and replaced the 1,200-question history dead end with bounded 200-question pages. All captured history remains reachable.
- Added five settings explanations, visible errors, reset acknowledgement and a manifest-backed version footer.
- Hardened the AI endpoint against arbitrary prompts, oversized input, unrestricted browser origins and bursts of requests.

Verification includes controlled session tests, recorded fixtures, an actual unpacked-extension check with synthetic StreamYard comments and real-browser panel checks at 360px, 390px and 1440px with long text, keyboard focus, settings failures, reset failures and reading-position checks. These are not a live multi-platform broadcast rehearsal. A logged-in StreamYard studio was unavailable during this audit; broadcast output, current native selectors and comment coverage while scrolling must still be checked in a disposable rehearsal before public launch.

## 2.0.6 settings polish

Settings use the bundled Noto Naskh Arabic font for Persian text. Help icons use 20px circles within 40px click targets. The font and its SIL Open Font License must be included in the store ZIP. Filtering behavior is unchanged.

## 2.0.7 consistent Dari typography

Noto Naskh Arabic is the single bundled UI font. Comments, names, badges, counters, headings, settings, buttons, status messages and the version footer all use it. Legacy previews and the self-contained teacher brief use the same font. The old font assets have been removed; store ZIPs include only the Noto font and its license.
