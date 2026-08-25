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
 */

const TAG = "[Ṣafwa]";

const SYSTEM_PROMPT = `/no_think
You are a live Q&A comment filter for an Islamic teacher's StreamYard live stream. The audience asks questions in Dari/Persian. Your job is to classify whether a new comment is a duplicate of a question already in the feed, even if the wording is completely different.

Classify the new comment as exactly one of:
- "duplicate": The same question as one already in the feed, asked in different words. Two comments are duplicates if they ask the same thing, even if no words are shared.
- "primary": A new, distinct question not already in the feed.

Rules:
- "duplicate" means the same underlying question, regardless of wording. "آیا زکات بر طلا واجب است؟" and "آیا پرداخت زکات برای طلا لازم است؟" are duplicates.
- Different questions that share some words are NOT duplicates. "آیا نماز جمعه در حال سفر واجب است؟" and "آیا روزه گرفتن در سفر واجب است؟" are both primary (both about travel, but different topics).
- Identity is per platform + handle. Same handle on different platforms = different people.

Respond with ONLY a JSON object: {"classification": "duplicate"} or {"classification": "primary"}. No explanation, no markdown.`;

/**
 * Build the user message with the new comment and recent feed context.
 *
 * @param {object} newComment - { handle, platform, displayText }
 * @param {array} recentQuestions - array of { handle, platform, displayText }
 * @returns {string}
 */
function buildUserPrompt(newComment, recentQuestions) {
  const lines = ["Recent questions in the feed:"];
  for (const q of recentQuestions) {
    lines.push(`- "${q.displayText}" (from ${q.handle} on ${q.platform ?? "unknown"})`);
  }
  lines.push("");
  lines.push(`New comment: "${newComment.displayText}" (from ${newComment.handle} on ${newComment.platform ?? "unknown"})`);
  lines.push("");
  lines.push('Is this new comment a duplicate of any question already in the feed? Respond with JSON: {"classification": "duplicate"} or {"classification": "primary"}.');
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
    const content = message.content || message.reasoning_content || "";
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
