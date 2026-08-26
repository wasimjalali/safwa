/*
 * llm-classifier.js - the LLM semantic layer of the combo architecture.
 *
 * Browser-only: uses fetch(). Called by content.js when the regex pipeline
 * returns an ambiguous result (a comment that might be a semantic duplicate
 * the regex couldn't catch, or a fuzzy match below threshold).
 *
 * The LLM is ADVISORY ONLY. It can mark a comment as "semantic_duplicate"
 * but the UI never hides it (only dims + badges). Auto-collapse is reserved
 * for the regex pipeline's exact matches.
 *
 * Fail-safe: if the LLM is unreachable, times out, or returns garbage, the
 * caller falls back to the regex decision. The feed is never broken.
 * Live path: Cloudflare Worker in deploy/cloudflare (Gemma 4 26B).
 */

const TAG = "[Ṣafwa]";

// Gemma 4 system turn. Official docs: Gemma 4 supports a `system` role;
// do not put `<|think|>` here (thinking is off via chat_template_kwargs);
// do not use `/no_think` (that is llama.cpp, not Google). Few-shot, then
// the live comments in the user turn, question last.
const SYSTEM_PROMPT = `You classify Dari and Persian questions from a live Islamic Q&A.

Decide if the new comment asks the same underlying question as any recent comment.

Reply with only one JSON object and no other text:
{"classification":"duplicate"}
or
{"classification":"primary"}

duplicate: the teacher would give one answer to both. Ignore wording, dialect, greetings and Arabic vs Persian letters (ي/ی, ك/ک). Treat synonyms as the same ask (واجب/فرض/لازم, عطر/ادکلن, موسیقی/آهنگ, روزه/روژه).

primary: a different ask. A shared setting (سفر, روزه) or a shared topic word (زکات, نماز) is not enough. Different acts of worship, different objects (زیورآلات vs سکه, جوراب vs کفش), different times of day or different cities are primary. A follow-up that changes who it applies to ("برای خانم‌ها چطور؟") is primary.

If both readings are reasonable, choose primary.

Examples:
Recent: آیا زکات بر طلا واجب است؟
New: طلا زکات دارد یا نه؟
{"classification":"duplicate"}

Recent: آیا نماز جمعه در حال سفر واجب است؟
New: آیا روزه گرفتن در سفر واجب است؟
{"classification":"primary"}

Recent: نماز تراویح چند رکعت است؟
New: نماز تراويح چند رکعت اسـت؟
{"classification":"duplicate"}

Recent: آیا زکات بر طلای زیورآلات واجب است؟
New: آیا سکه‌های طلا زکات دارند؟
{"classification":"primary"}

Recent: آیا نماز خواندن در حال نشسته جایز است؟
New: برای خانم‌ها چطور؟
{"classification":"primary"}`;

/**
 * Build the user message with the new comment and recent feed context.
 *
 * @param {object} newComment - { handle, platform, displayText }
 * @param {array} recentQuestions - array of { handle, platform, displayText }
 * @returns {string}
 */
function buildUserPrompt(newComment, recentQuestions) {
  const lines = ["Recent comments:"];
  for (const q of recentQuestions) {
    lines.push(`- "${q.displayText}"`);
  }
  lines.push("");
  lines.push(`New comment: "${newComment.displayText}"`);
  lines.push("");
  lines.push("Classify the new comment.");
  return lines.join("\n");
}

/**
 * Parse the LLM response. Extracts the JSON object from the response text,
 * handling markdown fences and thinking-process output.
 *
 * @param {string} raw
 * @returns {{ classification: string } | null}
 */
function parseResponse(raw) {
  if (!raw) return null;
  let text = raw.trim();

  // Strip markdown code fences
  if (text.startsWith("```")) {
    const lines = text.split("\n");
    text = lines.filter((l) => !l.startsWith("```")).join("\n");
  }

  // Find the JSON object
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;

  try {
    const obj = JSON.parse(text.slice(start, end + 1));
    const cls = (obj.classification || "").toLowerCase().trim();
    if (cls === "duplicate" || cls === "primary") {
      return { classification: cls };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Ask the LLM whether a new comment is a semantic duplicate of something
 * already in the feed.
 *
 * @param {object} newComment - { handle, platform, displayText }
 * @param {array} recentQuestions - recent unique questions for comparison
 * @param {object} config - CONFIG (uses LLM_ENDPOINT, LLM_MODEL, LLM_TIMEOUT_MS)
 * @returns {Promise<{ classification: string } | null>} - null means the LLM
 *   was unavailable or returned garbage; caller falls back to regex decision.
 */
export async function classifyComment(newComment, recentQuestions, config) {
  if (!config.LLM_ENABLED || !config.LLM_ENDPOINT) return null;

  const body = JSON.stringify({
    model: config.LLM_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(newComment, recentQuestions) },
    ],
    temperature: 0.0,
    max_tokens: 64,
    chat_template_kwargs: { enable_thinking: false },
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.LLM_TIMEOUT_MS);

  try {
    const res = await fetch(config.LLM_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`${TAG} LLM returned HTTP ${res.status}; falling back to regex.`);
      return null;
    }

    const data = await res.json();
    const message = data?.choices?.[0]?.message ?? {};
    const content = message.content || message.reasoning_content || message.reasoning || "";
    const parsed = parseResponse(content);

    if (!parsed) {
      console.warn(`${TAG} LLM response could not be parsed; falling back to regex.`);
      return null;
    }

    return parsed;
  } catch (err) {
    if (err.name === "AbortError") {
      console.warn(`${TAG} LLM request timed out (${config.LLM_TIMEOUT_MS}ms); falling back to regex.`);
    } else {
      console.warn(`${TAG} LLM request failed; falling back to regex.`, err.message);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
