# Safwa v1.0.0: Live StreamYard Studio Debugging Handoff

Written 2026-09-07 by the Hermes agent (session model: GLM via opencode-go) for handoff to a fresh, stronger model for adversarial review. Everything below is from the actual session: verbatim console lines, operator reports, and the repo state. Nothing is reconstructed from memory without evidence.

---

## 1. Purpose and how to use this file

The Safwa Chrome extension (published, unlisted) does not react to comments on the teacher's live StreamYard studio. We debugged it over one long session, fixed one real blocker (site permissions), and reached a precise, evidence-backed fault: **the extension injects and runs, but never finds StreamYard's comments container in the page DOM**. The last missing datum is the ground-truth DOM structure of the live studio's comment feed.

You (the reviewing model) should: (1) audit the reasoning chain, (2) verify or refute each conclusion, (3) find what was missed, (4) give your own ranked root-cause list with the cheapest discriminating experiment per hypothesis. Section 10 is your formal brief.

---

## 2. System facts

- Extension: Safwa (صفوة), Manifest V3, v1.0.0, installed from Chrome Web Store (unlisted).
- Store item ID: `kmabhlppnbgeokjjlepnblnjjjpbefpj`, publisher WasimJ (jalaliwasim15@gmail.com).
- Install link: https://chromewebstore.google.com/detail/kmabhlppnbgeokjjlepnblnjjjpbefpj
- Repo: `/Users/wasimjalali/Desktop/Personal Project/safwa`, branch `main`, tests 44/44 (`npm test`).
- Privacy policy: https://safwa-llm.karko-ai.workers.dev/privacy (served by the safwa-llm Cloudflare Worker).
- LLM endpoint (semantic dedup): https://safwa-llm.karko-ai.workers.dev/v1/chat/completions (Gemma 4 26B on Workers AI).
- Failing page: the teacher's studio at `https://streamyard.com/r4dt5n7vhi` (host confirmed by the extension's own log line and by console context).
- The extension was installed in the SAME Chrome profile that opens the studio (verified by the operator via chrome://extensions in that window).

### Manifest facts that matter (verbatim from manifest.json)

```json
"content_scripts": [
  {
    "matches": ["https://streamyard.com/*", "https://*.streamyard.com/*"],
    "js": ["src/content.js"],
    "css": ["styles.css"],
    "run_at": "document_idle"
  }
]
```

Note: there is NO `"all_frames": true`, so the content script runs in the top frame only (Chromium default).

### Selector facts (verbatim from src/config.js)

```js
export const SELECTORS = {
  CONFIRMED: true,
  commentContainer: '[data-testid="comments-list"], [class*="commentsList"]',
  commentNode: '[data-testid="comment"], [class*="comment_"], li[class*="comment"]',
  authorHandle: '[data-testid="comment-author"], [class*="author"], [class*="name"]',
  text: '[data-testid="comment-text"], [class*="commentText"], [class*="message"]',
  platformIndicator: '[data-testid="comment-platform"], [class*="platform"], [class*="source"] img',
};
```

These were research-based best guesses, never confirmed against a live studio (the project's own CLAUDE.md, build Phase 2, says exactly this: "needs a live studio; placeholders until confirmed", later "shipped ENABLED for launch" with boot-time discovery as the safety net).

### Boot logic facts (src/content.js, src/dom.js)

- After injection, the script polls for the comments container: every 1000 ms, up to 30 attempts.
- For the first 21 polls it requires the matched container to already contain comment rows; polls 22-30 accept a bare container match.
- All queries run against `document` (top frame). `querySelectorAll` does not pierce shadow roots.
- On 30 failures it gives up permanently (until page refresh) and logs the "giving up" line. This is the designed fail-safe: the native feed is never touched.

---

## 3. Timeline with evidence

### Episode 1: no reaction at all

Operator report: extension installed from the store link, popup present and toggled ON, teacher's studio open with the comments panel visible, zero filtering behavior.

First console dump (operator pasted, unfiltered): **zero lines containing `[Ṣafwa]`**. Noise present: StreamYard's own logs (`main.6ffa...js`, an ASCII "We're hiring" banner, `r4dt5n7vhi:1 No available adapters.`, zendesk widget errors) plus many `net::ERR_BLOCKED_BY_CLIENT` failures for stripe.com, sentry.io, fullstory, firstpromoter (an ad blocker on that machine blocks trackers; irrelevant to us).

Diagnosis at that point: the content script had never been injected (signature D of the prepared triage table: nothing at all).

### Episode 2: the paste gate

Attempts to run diagnostics by pasting into the Console kept failing. The dump contained this line repeatedly:

```
Warning: Don't paste code into the DevTools Console that you don't understand or haven't reviewed yourself. This could allow attackers to steal your identity or take control of your computer. Type "allow pasting" below and press Enter to allow pasting.
```

The unlock phrase was never successfully TYPED by hand (it cannot be pasted; Chrome blocks paste in the Console until typed). So the discovery script never actually executed in the Console in any attempt. This was a workflow trap that consumed several rounds.

### Episode 3: site access was off (real blocker, fixed)

`chrome://extensions` (same window/profile): Safwa listed, toggle ON. The Details page "Site access" area showed per-site entries with toggles. Operator screenshots showed the two site toggles:

- `https://*.streamyard.com/*` : off
- `https://*.workers.dev/*` : off

(The exact prior state of the radio group "On click / On specific sites / On all sites" is uncertain; the operator recalls a first toggle already on. Empirically it does not matter: see below.)

Operator toggled BOTH site toggles ON, then hard-refreshed the studio (`Cmd+Shift+R`).

### Episode 4: injection confirmed, container never found (current state)

After the refresh, the console showed (verbatim):

```
content.js:39 [Ṣafwa] content script loaded (v1.0.0) on streamyard.com/r4dt5n7vhi
dom.js:22 [Ṣafwa] comments container not found (yet?). Doing nothing (fail-safe). If this persists with the comments panel open, update SELECTORS in config.js.
content.js:244 [Ṣafwa] comments container not found after 30 tries; giving up (fail-safe). Open the comments panel, or update SELECTORS.
content.js:85 [Ṣafwa] filter disabled from the popup.
content.js:85 [Ṣafwa] filter enabled from the popup.
```

Interpretation: injection works (site-access fix confirmed), the popup wiring works, but `findCommentContainer` never matched anything across all 30 polls, so the pipeline never started and the feed is untouched (fail-safe behaved as designed).

### Episode 5: still blocked at the same wall

The operator attempted the discovery script in the Console several more times; every attempt shows the same paste-gate warning again, and no `[safwa-discovery]` output ever appeared. The script has therefore NEVER produced output on the live page. I redirected to the DevTools Snippets path (Sources > Snippets > paste works there, Cmd+Enter to run), plus two fallback probes:

```js
document.querySelectorAll('[data-safwa-seen]').length
```
(expected 0, since the pipeline never started; would confirm)

```js
[...document.querySelectorAll('iframe')].map(f=>f.src)
```
(to test the iframe hypothesis)

And one structural question to the operator: is the visible comments feed inside the main studio window, or in StreamYard's separate Pop-Out Chat window? Not yet answered.

---

## 4. The live-fire input test (inputs are proven good)

While the studio side was being debugged, an Aside agent posted a scripted comment sequence to the connected YouTube live stream from the operator's channels. All 9 comments appeared in the YouTube live chat (verified from screenshot `live-chat-final.png`). Studio reaction: none (consistent with the container failure above).

| Time UTC | Channel | Text | Appeared |
|---|---|---|---|
| 19:59:24 | A: @iamwasim.jalali | سلام استاد، آیا نماز در سفر قصر خوانده می‌شود؟ | Yes |
| 20:00:16 | A (same) | (identical repeat of the above) | Yes |
| 20:00:55 | A (same) | استاد سلام. در سفر آیا نماز شکسته خوانده می‌شود؟ (reworded dup) | Yes |
| 20:01:31 | B: @Wasim.Jalali | استاد لطفا بفرمایید که اگر خانمی عقد موقت داشته باشد و مدت آن تمام نشده | Yes |
| 20:02:00 | B (same) | ادامه: ولی شوهرش به گفته اطرافیان فوت کرده است، حکم آن چیست؟ (split, 29s gap) | Yes |
| 20:02:32 | C: @Wasimjalali14 | آیا گرفتن اجاره‌ی خانه‌ی مسکونی با پول قرض جایز است؟ | Yes |
| 20:04:31 | C (same) | یک سوال دیگر: نماز تراویح چند رکعت خوانده می‌شود؟ (2nd question, 119s gap) | Yes |
| 20:05:13 | D: @sulimanmomen5211 | آیا زکات بر طلا واجب است؟ | Yes |
| 20:06:52 | A (E substitute) | طلا زکات می‌خواهد یا نه؟ (semantic dup of D) | Yes |

---

## 5. What is RULED OUT (with evidence)

1. Extension not installed or disabled: RULED OUT. The post-fix dump shows our content.js and dom.js log lines executing on the page.
2. Wrong Chrome profile: RULED OUT. Same-window chrome://extensions verified by operator; injection followed.
3. Host mismatch: RULED OUT. `streamyard.com/r4dt5n7vhi` matches the manifest patterns.
4. Site permissions: WAS a real blocker, NOW FIXED (injection began immediately after the toggles + refresh).
5. Extension login requirement: N/A by design (answered: no login needed for the extension).
6. Pipeline/regex/LLM logic: NOT IMPLICATED. The pipeline never started (no container), and the matching core is DOM-independent with 44/44 passing tests. It cannot be the current fault.
7. Ad blocker noise: all ERR_BLOCKED_BY_CLIENT lines are tracker/ad domains, irrelevant.

---

## 6. Current hypotheses (ranked)

H1 (MOST LIKELY): Stale container selector. The guessed selectors (`[data-testid="comments-list"], [class*="commentsList"]`) simply do not exist in StreamYard's current DOM. Evidence for: clean injection + 30 consecutive misses + the selectors were never verified on a live studio (documented project caveat). Discriminator: the discovery JSON (or a right-click Inspect > Copy outerHTML of any comment row).

H2: The feed lives inside an IFRAME on the studio page. The content script runs top-frame only (no `all_frames: true`), so top-level queries cannot see it. Discriminator: the iframe src listing; a streamyard.com iframe would confirm.

H3: The feed is in StreamYard's POP-OUT CHAT window (separate OS window, own top frame). The extension would inject there too (same origin), but all diagnostics were run on the main studio window. Discriminator: is the visible feed a separate window? If yes, run discovery in that window's own DevTools.

H4: Shadow DOM. If StreamYard renders comments inside shadow roots, `querySelectorAll` cannot see them at all; the failure signature would be identical to H1. The previous agent did NOT explicitly consider this during the session (see self-assessment). Discriminator: right-click Inspect on a comment: a `#shadow-root` node in the tree confirms it.

H5: Timing/lazy mount. The Comments panel mounted after the 30 s poll window expired (give-up is permanent until refresh). Less likely (poll window is generous and the refresh was done with the panel intended visible) but cheap to rule out: refresh with the Comments tab already active and populated, watch for the container-found line within 30 s.

---

## 7. Honest self-assessment by the previous agent

Judged correct (validated by outcomes): the injection diagnosis; the site-permission root cause and fix; the no-login answer; the fail-safe explanation; declaring the YouTube-side input test valid.

Judged weak or late:

1. The console-paste workflow was a known trap (Chrome's paste gate) and consumed multiple rounds before I switched the operator to DevTools Snippets. Should have led with Snippets.
2. I suggested searching the console filter for "safwa", which is case-sensitive and would HIDE the dotted `[Ṣafwa]` lines. I corrected it, but it was a self-inflicted footgun.
3. I raised the iframe hypothesis (H2) and pop-out hypothesis (H3) late, only after the container-miss was confirmed twice.
4. I never explicitly considered shadow DOM (H4) during the session. The reviewer should weight it seriously: it produces an identical signature to H1 and is common in modern React apps.
5. I never saw the studio visually. Every claim about "comments panel visible with rows" rests on the operator's word. The operator did screen-share the console, but no screenshot of the studio layout itself was ever captured and analyzed.
6. The exact pre-fix site-permission state (radio selection vs individual toggles) is murky. The empirical outcome (injection began after the toggles were enabled) is solid; the precise UI history is not.

---

## 8. Pending data (operator asks, in flight)

A. The discovery JSON, to be produced via DevTools Snippets (Sources > Snippets > paste > Cmd+Enter). Output starts with `{"rowCount":` and includes `container`, `commentNode`, `text`, `author`, `platformIndicator`, `secondRowMatches`, and `firstRowHTML` (1200 chars of ground-truth markup).
B. If it prints "no repeated rows found": the output of `[...document.querySelectorAll('iframe')].map(f=>f.src)`.
C. The answer to: main-window panel or Pop-Out Chat window?
D. Optional but valuable: one screenshot of the studio with the Comments panel open (the agent never saw the layout).

---

## 9. Fix plan once the data arrives

- H1 confirmed: update the five `SELECTORS` strings in `src/config.js` from the discovery output (keep the data-testid-first, comma-separated multi-candidate style). `npm test` must stay 44/44 (the matching core is DOM-independent). Bump `manifest.json` to 1.0.1, rebuild the store ZIP per `store-assets/README.md`, upload as a new version in the Developer Dashboard (auto-updates users within hours). Interim same-day option: load-unpacked from the repo with fixed selectors.
- H2 confirmed: add `"all_frames": true` to the content_scripts entry (plus selector fixes from the same discovery pass), same ship path.
- H3 confirmed: no code change may be needed (the pop-out is same-origin and should receive the content script); run discovery in the pop-out window, adjust selectors for the compact layout if they differ.
- H4 confirmed: extend `src/dom.js` with a shadow-root-piercing query helper (or per-root queries); this is the only hypothesis requiring a spec-relevant change (selector knowledge stays confined to config.js/dom.js per the project invariants).
- Constraints on any fix: selectors live ONLY in src/config.js and src/dom.js; fail-safe must be preserved; no assumption of a StreamYard API; `AUTO_HIDE_ANYTHING_AMBIGUOUS` stays false.

Tooling already committed at `main` for this recovery: `test/dom-discovery-console.js` (the discovery script; outputs selectors plus first-row HTML ground truth) and `test/discovery-selftest.html` (self-test that passed against a mocked page with completely different class names, recovering all five selectors from raw DOM shape).

---

## 10. CRITICAL ANALYSIS BRIEF (for the reviewing model)

You are reviewing another agent's debugging session. Be adversarial: the goal is to find the flaw, not to approve.

1. Audit the reasoning chain section by section (Sections 3, 5, 6). For each conclusion give a verdict: CORRECT / INCORRECT / UNSUPPORTED / MISSING, with one line of justification grounded in the quoted evidence.
2. Identify anything the previous agent missed, misread, or prioritized badly. Consider at minimum: the shadow-DOM possibility (H4), whether the 30-poll give-up could have raced a lazily-mounted panel, whether `run_at: document_idle` matters here, whether the pop-out chat is a `streamyard.com` page at all, and whether any console noise was wrongly dismissed.
3. Give YOUR ranked root-cause list with probabilities, and for each hypothesis the single cheapest discriminating experiment the field operator can run (the operator can use the DevTools console, Snippets, and can screenshot anything).
4. Judge the fix plan (Section 9) against the project's stated invariants (selector isolation in config.js/dom.js, fail-safe behavior, no StreamYard API assumption, human-in-the-loop hiding rules). Flag any violation or risk.
5. State clearly: was the previous agent's overall analysis correct or not, and what is the single most likely root cause?

The operator (Wasim) will run field steps for you and paste results back. The repo is at `/Users/wasimjalali/Desktop/Personal Project/safwa` if you have file access; this document is otherwise self-contained.
