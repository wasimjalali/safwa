export const ROOM_SYSTEM_PROMPT = `You classify Dari and Persian questions from a live Islamic Q&A.

Decide if the new comment asks the same underlying question as any numbered recent comment.

Reply with only one JSON object and no other text:
{"classification":"duplicate","match":1}
or
{"classification":"primary"}
or
{"classification":"greeting"}

match is the 1-based index of the recent comment that is the same ask. Comments are numbered newest first: [1] is the most recent.

duplicate: the teacher would give one answer to both. Ignore wording, dialect, greetings and Arabic vs Persian letters (ي/ی, ك/ک). Treat synonyms as the same ask (واجب/فرض/لازم, عطر/ادکلن, موسیقی/آهنگ, روزه/روژه).

greeting: only a greeting, thanks, blessing, or farewell — not a question the teacher would answer.

primary: a different ask. A shared setting (سفر, روزه) or a shared topic word (زکات, نماز) is not enough. Different acts of worship, different objects (زیورآلات vs سکه, جوراب vs کفش), different times of day or different cities are primary. A follow-up that changes who it applies to ("برای خانم‌ها چطور؟") is primary.

If greeting and primary are both reasonable, choose primary.
If both other readings are reasonable, choose primary.

Examples:
Recent:
[1] آیا زکات بر طلا واجب است؟
New: طلا زکات دارد یا نه؟
{"classification":"duplicate","match":1}

Recent:
[1] آیا نماز جمعه در حال سفر واجب است؟
New: آیا روزه گرفتن در سفر واجب است؟
{"classification":"primary"}

Recent:
[1] نماز تراویح چند رکعت است؟
New: نماز تراويح چند رکعت اسـت؟
{"classification":"duplicate","match":1}

Recent:
[1] آیا زکات بر طلای زیورآلات واجب است؟
New: آیا سکه‌های طلا زکات دارند؟
{"classification":"primary"}

Recent:
[1] آیا نماز خواندن در حال نشسته جایز است؟
New: برای خانم‌ها چطور؟
{"classification":"primary"}

Recent:
[1] حکم روزه در سفر چیست؟
New: جزاکم الله تعالی
{"classification":"greeting"}`;

export const COURTESY_SYSTEM_PROMPT = `You decide if a Dari or Persian live-chat comment is only courtesy, or a real question.

Reply with only one JSON object and no other text:
{"classification":"greeting"}
{"classification":"primary"}

greeting: only a greeting, thanks, blessing, dua, or farewell. The teacher would not answer it.
primary: anything the teacher might need to answer.

If both readings are reasonable, choose primary.

Examples:
New: جزاکم الله تعالی
{"classification":"greeting"}

New: آمین یا رب العالمین
{"classification":"greeting"}

New: حکم روزه در سفر چیست؟
{"classification":"primary"}

New: طلا زکات دارد
{"classification":"primary"}`;

export const SAME_PERSON_SYSTEM_PROMPT = `You classify a follow-up comment from someone who already asked in a live Dari/Persian Islamic Q&A.

Their previous question is given, plus numbered recent questions from the room.

Reply with only one JSON object and no other text:
{"classification":"continuation"}
{"classification":"duplicate","match":1}
{"classification":"extra"}
{"classification":"greeting"}

continuation: more of THIS PERSON's previous question — a split sentence, a missing clause, "I mean…", or the rest of the same ask. Not a new question.
duplicate: the same underlying question as one numbered recent comment (their own restated in new words, or someone else's). match is that 1-based index.
extra: a genuinely different second question from this person.
greeting: only a greeting, thanks, blessing, or farewell — not a question.

If continuation and extra are both reasonable, choose continuation.
If duplicate and extra are both reasonable, choose duplicate.
If greeting and extra are both reasonable, choose extra.
If you are told continuation is not allowed, never choose continuation.

Ignore wording, dialect, greetings and Arabic vs Persian letters (ي/ی, ك/ک).

Examples:
Previous: سوال من در مورد میراث است وقتی که چند وارث وجود دارد
Gap: 8s
New: دارایی شامل خانه و پول نقد می‌شود چه باید کرد؟
{"classification":"continuation"}

Previous: حکم گوش دادن به موسیقی چیست؟
Gap: 5s
New: آیا قهوه حلال است؟
{"classification":"extra"}

Previous: آیا زکات بر طلا واجب است؟
Gap: 90s
Recent:
[1] آیا زکات بر طلا واجب است؟
New: طلا زکات دارد یا نه؟
{"classification":"duplicate","match":1}

Previous: آیا نماز خواندن در حال نشسته جایز است؟
Gap: 90s
New: حکم روزه گرفتن در سفر چیست؟
{"classification":"extra"}

Previous: حکم روزه در سفر چیست؟
Gap: 20s
New: جزاکم الله تعالی
{"classification":"greeting"}`;

function numberedRecent(recentQuestions) {
  if (!recentQuestions || recentQuestions.length === 0) return "(none)";
  const lines = ["(numbered newest first — [1] is the most recent)"];
  recentQuestions.forEach((q, i) => {
    lines.push(`[${i + 1}] ${q.displayText}`);
  });
  return lines.join("\n");
}

function buildRoomPrompt(newComment, recentQuestions) {
  return [
    "Recent comments:",
    numberedRecent(recentQuestions),
    "",
    `New comment: "${newComment.displayText}"`,
    "",
    "Classify the new comment.",
  ].join("\n");
}

function buildSamePersonPrompt(newComment, recentQuestions, context) {
  const gapMs = context.gapMs;
  const gap =
    typeof gapMs === "number" && Number.isFinite(gapMs)
      ? `${Math.max(0, Math.round(gapMs / 1000))}s`
      : "unknown";
  const allowed =
    context.allowContinuation === false
      ? "no (fragment cap reached — never choose continuation)"
      : "yes";
  return [
    `This person's previous question: "${context.previousText || ""}"`,
    `Gap since previous: ${gap}`,
    `Continuation allowed: ${allowed}`,
    "",
    "Recent comments:",
    numberedRecent(recentQuestions),
    "",
    `New comment: "${newComment.displayText}"`,
    "",
    "Classify the new comment.",
  ].join("\n");
}


export function classificationMessages(newComment, recentQuestions, context = {}) {
  const kind = context.reviewKind;
  const system = kind === "same_person" ? SAME_PERSON_SYSTEM_PROMPT : kind === "courtesy" ? COURTESY_SYSTEM_PROMPT : ROOM_SYSTEM_PROMPT;
  const user = kind === "same_person" ? buildSamePersonPrompt(newComment, recentQuestions, context) : kind === "courtesy" ? `New comment: "${newComment.displayText}"\n\nClassify the new comment.` : buildRoomPrompt(newComment, recentQuestions);
  return [{ role: "system", content: system }, { role: "user", content: user }];
}
