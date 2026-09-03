/*
 * convert-live-chat.js - turn a YouTube live-chat replay dump (yt-dlp json3)
 * into the plain comment array the Ṣafwa pipeline replays:
 *
 *     [{ handle, platform: "youtube", displayText, offsetMs }]
 *
 * offsetMs is the position in the broadcast, so replaying preserves the REAL
 * gaps between comments - which is what the continuation window judges.
 *
 * Download a dump with:
 *   yt-dlp --skip-download --write-subs --sub-langs live_chat \
 *          --sub-format json3 -o chat.%(ext)s "<YOUTUBE_VOD_URL>"
 *
 * Usage: node test/convert-live-chat.js <chat.live_chat.json> <out.json>
 * Zero deps. Output goes to test/fixtures/ so replay.html + replay-analysis.js
 * can consume it.
 */

import fs from "node:fs";

const [, , src, dst] = process.argv;
if (!src || !dst) {
  console.error(
    "usage: node test/convert-live-chat.js <chat.live_chat.json> <out.json>"
  );
  process.exit(1);
}

const lines = fs.readFileSync(src, "utf8").split("\n").filter(Boolean);
const comments = [];

for (const line of lines) {
  let item;
  try {
    item = JSON.parse(line);
  } catch {
    continue; // tolerate a truncated fragment line
  }
  const replay = item.replayChatItemAction;
  if (!replay) continue;
  for (const action of replay.actions ?? []) {
    // Only real text messages. Engagement banners, superchats, paid stickers
    // and member milestones use other renderers and are skipped.
    const r = action.addChatItemAction?.item?.liveChatTextMessageRenderer;
    if (!r) continue;
    const displayText = (r.message?.runs ?? [])
      .map((run) => run.text ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (!displayText) continue;
    comments.push({
      handle: r.authorName?.simpleText ?? "؟",
      platform: "youtube",
      displayText,
      offsetMs: Number(replay.videoOffsetTimeMsec ?? 0),
    });
  }
}

// Fragments can arrive marginally out of order; the pipeline assumes a feed
// ordered by arrival time.
comments.sort((a, b) => a.offsetMs - b.offsetMs);

fs.writeFileSync(dst, JSON.stringify(comments, null, 2));
console.log(`wrote ${comments.length} comments to ${dst}`);
