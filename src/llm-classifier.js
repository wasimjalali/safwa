/*
 * llm-classifier.js - the LLM semantic layer of the combo architecture.
 *
 * Browser-only: uses fetch(). Called by content.js after the regex pipeline
 * has already rendered, so the live feed never waits. Two review kinds:
 *
 *   room         — first question from this handle: duplicate vs primary vs greeting
 *   same_person  — cue-less extra / fuzzy after they already asked:
 *                  continuation vs duplicate vs extra vs greeting
 *   courtesy     — leftover blessing/thanks: greeting vs primary
 *
 * Regex-certain cases never get here. If the LLM is unreachable, times out, or
 * returns garbage, the caller keeps the regex decision (never hide on a maybe).
 * Live path: Cloudflare Worker in deploy/cloudflare (Gemma 4 26B).
 */

const TAG = "[Ṣafwa]";

import { classificationMessages } from "./llm-prompts.js";

/**
 * Parse the LLM response. Extracts the JSON object from the response text,
 * handling markdown fences.
 *
 * @param {string} raw
 * @returns {{ classification: string, match?: number } | null}
 */
export function parseLlmResponse(raw) {
  if (typeof raw !== "string" || !raw) return null;
  let text = raw.trim();

  if (text.startsWith("```")) {
    const lines = text.split("\n");
    text = lines.filter((l) => !l.startsWith("```")).join("\n");
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;

  try {
    const obj = JSON.parse(text.slice(start, end + 1));
    const cls = (obj.classification || "").toLowerCase().trim();
    if (
      cls !== "duplicate" &&
      cls !== "primary" &&
      cls !== "continuation" &&
      cls !== "extra" &&
      cls !== "greeting"
    ) {
      return null;
    }
    const result = { classification: cls };
    const match = Number(obj.match ?? obj.match_index ?? obj.index);
    if (Number.isInteger(match) && match >= 1) result.match = match;
    return result;
  } catch {
    return null;
  }
}

/**
 * Ask the LLM to classify a regex-uncertain comment.
 *
 * @param {object} newComment - { handle, platform, displayText, timestamp }
 * @param {array} recentQuestions - recent unique questions for comparison
 * @param {object} config
 * @param {object} [context]
 * @param {"room"|"same_person"} [context.reviewKind]
 * @param {string} [context.previousText]
 * @param {number} [context.gapMs]
 * @param {boolean} [context.allowContinuation]
 * @returns {Promise<{ classification: string, match?: number } | null>}
 */
export async function classifyComment(newComment, recentQuestions, config, context = {}) {
  if (!config.LLM_ENABLED || !config.LLM_ENDPOINT) return null;

  const body = JSON.stringify({
    model: config.LLM_MODEL,
    messages: classificationMessages(newComment, recentQuestions, context),
    temperature: 0,
    max_tokens: 96,
    chat_template_kwargs: { enable_thinking: false },
  });

  const controller = new AbortController();
  const abort = () => controller.abort();
  if (context.signal?.aborted) return null;
  context.signal?.addEventListener("abort", abort, { once: true });
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
    const parsed = parseLlmResponse(content);

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
    context.signal?.removeEventListener("abort", abort);
    clearTimeout(timeoutId);
  }
}

export function llmContextFromDecision(comment, decision) {
  const previous = decision.previousBlock;
  return {
    reviewKind:
      decision.reviewKind === "same_person"
        ? "same_person"
        : decision.reviewKind === "courtesy"
          ? "courtesy"
          : "room",
    previousText: previous?.displayText ?? "",
    gapMs:
      previous && typeof comment.timestamp === "number" && typeof previous.lastTimestamp === "number"
        ? comment.timestamp - previous.lastTimestamp
        : null,
    allowContinuation: decision.allowContinuation !== false,
  };
}
