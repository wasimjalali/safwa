/*
 * grouping.js - the core rule (spec Section 5) and the fixed processing
 * pipeline (Section 6). Pure: no DOM, no chrome.*.
 *
 * Core rule: one logical question per handle. Continuation fragments fold into
 * that one question; anything beyond it is flagged as an extra question.
 *
 * processComment() is the SINGLE source of truth for pipeline order:
 *   normalize -> continuation check -> duplicate check -> new/extra -> (render).
 * Both content.js (live) and the test runner (mocks) call it, so the order is
 * never duplicated and can never drift.
 *
 * Order is not negotiable. Continuation is checked BEFORE duplicate and BEFORE
 * the extra-question rule, so a split question is never misclassified as either.
 *
 * applyLlmOverride() is the SINGLE source of truth for what happens when the
 * LLM later confirms or rejects a regex-uncertain decision. content.js and the
 * tests call it so hide/count/join cannot drift.
 */

import { normalize } from "./normalize.js";
import { identityKey, getOrCreateHandle } from "./state.js";
import {
  checkDuplicate,
  collapseOnto,
  registerSignature,
  unregisterSignature,
} from "./dedup.js";

function hasCourtesyHint(foldedKey, hints) {
  if (!foldedKey || !hints?.length) return false;
  const padded = ` ${foldedKey} `;
  return hints.some((hint) => padded.includes(` ${hint} `));
}

function leftoverIsBlessingOnly(tokens, config) {
  const allowed = new Set([
    ...(config.COURTESY_HINTS ?? []),
    ...(config.COURTESY_LEFTOVER_WORDS ?? []),
  ]);
  return tokens.length > 0 && tokens.every((token) => allowed.has(token));
}

/**
 * Regex-uncertain courtesy: leftover after honorific strip is only blessing
 * amplifiers (تعالی, خیرا, …), no question mark or question stem. A thanks
 * word in a line that still has real leftover content is a question.
 * Never enough to hide on its own — the LLM must confirm.
 */
export function maybeCourtesy(displayText, config) {
  const { matchKey, isGreetingOnly, foldedKey } = normalize(displayText, config);
  if (isGreetingOnly) return false;
  if (/[؟?]/.test(displayText || "")) return false;
  const leftover = (matchKey || "").split(/\s+/).filter(Boolean);
  if (leftover.length === 0 || leftover.length > (config.COURTESY_MAX_TOKENS ?? 6)) {
    return false;
  }
  const stems = config.QUESTION_STEMS ?? [];
  if (leftover.some((token) => stems.includes(token))) return false;
  if (!leftoverIsBlessingOnly(leftover, config)) return false;
  return hasCourtesyHint(foldedKey || matchKey, config.COURTESY_HINTS);
}

function lastChar(text) {
  return text.length ? text[text.length - 1] : "";
}

function firstWord(text) {
  const m = text.trim().match(/^([\p{L}\p{N}']+)/u);
  return m ? m[1] : "";
}

function endsWithConnector(text, connectors) {
  const words = text.trim().toLowerCase().match(/[\p{L}\p{N}']+/gu);
  if (!words || words.length === 0) return false;
  return connectors.includes(words[words.length - 1]);
}

/**
 * Does either side of the pair carry an EXPLICIT continuation marker
 * (EXPLICIT_CONTINUATION_WORDS, e.g. a fragment starting «ادامه سوال...» or
 * ending «... ادامه»)? Such a pair announces itself, so the normal window can
 * be stretched (see isContinuation).
 */
function hasExplicitMarker(prev, next, config) {
  const markers = config.EXPLICIT_CONTINUATION_WORDS ?? [];
  if (markers.length === 0) return false;
  const first = firstWord(next).toLowerCase();
  if (markers.includes(first)) return true;
  const prevWords = prev.trim().toLowerCase().match(/[\p{L}\p{N}']+/gu);
  const last = prevWords ? prevWords[prevWords.length - 1] : "";
  return markers.includes(last);
}

/**
 * Is `comment` a continuation of the handle's open `block`? Requires BOTH the
 * time condition AND at least one continuation cue (spec Section 8).
 *
 * Time condition: within CONTINUATION_WINDOW_MS of the block's last fragment.
 * One stretch, on purpose: if EITHER side carries an explicit marker
 * («ادامه...»), the pair is allowed up to EXPLICIT_CONTINUATION_MS instead -
 * a viewer who announces a fragment should not lose it to a slow connection.
 * The fragment cap (MAX_COMMENTS_PER_QUESTION) is still enforced upstream.
 *
 * Tuning rule: inside the window, ambiguity resolves toward continuation,
 * because wrongly splitting is cheap and wrongly hiding a real question is not.
 */
export function isContinuation(block, comment, config) {
  if (!block) return false;

  const prev = block.lastDisplayText.trim();
  const next = comment.displayText.trim();

  // Time condition: within the window since the block's last fragment,
  // stretched for announced (explicitly marked) fragment pairs.
  const gap = comment.timestamp - block.lastTimestamp;
  const limit = hasExplicitMarker(prev, next, config)
    ? Math.max(config.EXPLICIT_CONTINUATION_MS, config.CONTINUATION_WINDOW_MS)
    : config.CONTINUATION_WINDOW_MS;
  if (gap > limit) return false;

  const cueNoTerminal = prev.length > 0 && !config.TERMINAL_PUNCTUATION.includes(lastChar(prev));
  const cueConnectorEnd =
    config.SENTENCE_COMMA.includes(lastChar(prev)) || endsWithConnector(prev, config.CONNECTOR_WORDS);
  const cueNearLimit = prev.length >= config.NEAR_LIMIT_CHARS;

  const fw = firstWord(next);
  const startsLowercase = fw.length > 0 && fw[0] === fw[0].toLowerCase() && fw[0] !== fw[0].toUpperCase();
  const startsWithConnector = config.CONNECTOR_WORDS.includes(fw.toLowerCase());
  const cueNewStart = startsLowercase || startsWithConnector;

  return cueNoTerminal || cueConnectorEnd || cueNearLimit || cueNewStart;
}

function openBlock(comment, status) {
  return {
    status, // 'question' (the one allowed) | 'extra' (a flagged extra)
    matchKey: comment.matchKey,
    displayText: comment.displayText,
    lastDisplayText: comment.displayText,
    lastTimestamp: comment.timestamp,
    fragmentCount: 1,
    fragments: [comment],
    hideConfirmed: false,
  };
}

function mergeContinuation(block, comment) {
  block.displayText = `${block.displayText} ${comment.displayText}`.trim();
  block.lastDisplayText = comment.displayText;
  block.lastTimestamp = comment.timestamp;
  block.fragmentCount += 1;
  block.fragments.push(comment);
  return block;
}

function setOpen(record, block) {
  record.open = block;
  if (block) record.lastBlock = block;
}

function canMergeMore(block, config) {
  return !!block && block.fragmentCount < config.MAX_COMMENTS_PER_QUESTION;
}

function collectRecentQuestions(state, max) {
  if (!state.recentKeys || state.recentKeys.length === 0) return [];

  const result = [];
  const seen = new Set();
  for (let i = state.recentKeys.length - 1; i >= 0 && result.length < max; i--) {
    const key = state.recentKeys[i];
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = state.signatures.get(key);
    if (entry && entry.displayText) {
      result.push({
        matchKey: entry.matchKey,
        handle: entry.handle,
        platform: entry.platform,
        displayText: entry.displayText,
      });
    }
  }
  return result;
}

function withRoomReview(decision, state, config) {
  const recentQuestions = collectRecentQuestions(state, config.LLM_MAX_CONTEXT_COMMENTS);
  if (recentQuestions.length === 0) return decision;
  decision.needsLlmReview = true;
  decision.reviewKind = "room";
  decision.recentQuestions = recentQuestions;
  decision.allowContinuation = false;
  return decision;
}

function withSamePersonReview(decision, state, config, previousBlock) {
  const recentQuestions = collectRecentQuestions(state, config.LLM_MAX_CONTEXT_COMMENTS);
  decision.needsLlmReview = true;
  decision.reviewKind = "same_person";
  decision.recentQuestions = recentQuestions;
  decision.previousBlock = previousBlock ?? null;
  decision.allowContinuation = canMergeMore(previousBlock, config);
  return decision;
}

function hideExtraFragments(block, exceptComment) {
  if (!block?.fragments) return [];
  return block.fragments
    .filter((frag) => frag !== exceptComment)
    .map((frag) => ({ type: "extra", comment: frag, block, hide: true, withinWindow: true }));
}

function resolveDuplicateTarget(decision, llmResult, state) {
  const qs = decision.recentQuestions || [];
  const match = Number(llmResult?.match);
  if (Number.isInteger(match) && match >= 1 && match <= qs.length) {
    const picked = qs[match - 1];
    if (picked?.matchKey && state.signatures.has(picked.matchKey)) {
      return state.signatures.get(picked.matchKey);
    }
  }
  if (qs.length === 1) {
    const picked = qs[0];
    if (picked?.matchKey && state.signatures.has(picked.matchKey)) {
      return state.signatures.get(picked.matchKey);
    }
  }
  return null;
}

function collapseAsSemantic(decision, llmResult, state) {
  const target = resolveDuplicateTarget(decision, llmResult, state);
  if (!target) return null;
  if (decision.comment.matchKey && decision.comment.matchKey !== target.matchKey) {
    unregisterSignature(decision.comment.matchKey, state);
  }
  collapseOnto(target, decision.comment);
  return {
    type: "duplicate",
    kind: "semantic",
    comment: decision.comment,
    target,
    count: target.count,
  };
}

/**
 * Run one comment through the full pipeline. Mutates `state`. Returns a decision
 * the UI (and tests) act on:
 *
 *   { type: 'greeting',     comment, hide? }
 *   { type: 'continuation', comment, block }
 *   { type: 'duplicate',    comment, target, count, kind }
 *   { type: 'primary',      comment, block }
 *   { type: 'extra',        comment, block, withinWindow, hide? }
 *
 * Regex-uncertain decisions also carry:
 *   needsLlmReview, reviewKind ('room' | 'same_person' | 'courtesy'), recentQuestions,
 *   previousBlock?, allowContinuation?
 */
export function processComment(comment, state, config, opts = {}) {
  const { matchKey, displayText, isGreetingOnly } = normalize(comment.displayText, config);
  comment.matchKey = matchKey;
  comment.displayText = displayText;

  if (isGreetingOnly) {
    return { type: "greeting", comment, hide: config.HIDE_GREETINGS !== false };
  }

  // Classify courtesy even when the teacher wants greetings shown — hide
  // is the only thing the toggle controls. A leftover blessing must never
  // take the one-question slot just because hiding is off.
  if (!opts.skipCourtesy && maybeCourtesy(displayText, config)) {
    return {
      type: "greeting",
      comment,
      hide: false,
      needsLlmReview: config.LLM_ENABLED !== false,
      reviewKind: "courtesy",
      recentQuestions: collectRecentQuestions(state, config.LLM_MAX_CONTEXT_COMMENTS),
      allowContinuation: false,
    };
  }

  const key = identityKey(comment);
  const record = getOrCreateHandle(state, key);

  const atFragmentCap =
    record.open && record.open.fragmentCount >= config.MAX_COMMENTS_PER_QUESTION;

  if (record.open && comment.matchKey && comment.matchKey === record.open.matchKey) {
    const dup = checkDuplicate(comment.matchKey, state, config);
    if (dup.isDuplicate) {
      collapseOnto(dup.entry, comment);
      return { type: "duplicate", kind: dup.kind, comment, target: dup.entry, count: dup.entry.count };
    }
  }

  if (
    config.JOIN_CONTINUATIONS !== false &&
    !atFragmentCap &&
    isContinuation(record.open, comment, config)
  ) {
    mergeContinuation(record.open, comment);
    record.lastBlock = record.open;
    if (record.open.status === "extra") {
      return {
        type: "extra",
        comment,
        block: record.open,
        withinWindow: true,
        hide: !!record.open.hideConfirmed,
      };
    }
    return { type: "continuation", comment, block: record.open };
  }

  const openAtEntry = record.open;
  const previousBlock = record.lastBlock;
  const withinWindow =
    !!openAtEntry &&
    comment.timestamp - openAtEntry.lastTimestamp <= config.CONTINUATION_WINDOW_MS;

  record.open = null;

  const dup = checkDuplicate(comment.matchKey, state, config);
  if (dup.isDuplicate) {
    const decision = {
      type: "duplicate",
      kind: dup.kind,
      comment,
      target: dup.entry,
      count: dup.entry.count,
    };
    if (dup.kind === "exact") {
      collapseOnto(dup.entry, comment);
      decision.count = dup.entry.count;
      return decision;
    }
    // Partial fuzzy: dim only. Count/hide wait for the LLM.
    if (record.hasPrimaryQuestion) {
      return withSamePersonReview(decision, state, config, previousBlock);
    }
    return withRoomReview(decision, state, config);
  }

  if (!record.hasPrimaryQuestion) {
    record.hasPrimaryQuestion = true;
    const block = openBlock(comment, "question");
    setOpen(record, block);
    const recentQuestions = collectRecentQuestions(state, config.LLM_MAX_CONTEXT_COMMENTS);
    registerSignature(comment, state, config);
    const decision = { type: "primary", comment, block };
    if (recentQuestions.length === 0) return decision;
    decision.needsLlmReview = true;
    decision.reviewKind = "room";
    decision.recentQuestions = recentQuestions;
    decision.allowContinuation = false;
    return decision;
  }

  const block = openBlock(comment, "extra");
  setOpen(record, block);
  const decision = withSamePersonReview(
    { type: "extra", comment, block, withinWindow },
    state,
    config,
    previousBlock
  );
  registerSignature(comment, state, config);
  return decision;
}

/**
 * Apply an LLM classification on top of a regex decision. Mutates `state`.
 * Returns a (possibly new) decision for the UI. If the LLM result is unusable
 * the original decision is returned unchanged — never hide on a maybe.
 *
 * @param {object} decision
 * @param {{ classification: string, match?: number } | null} llmResult
 * @param {object} state
 * @param {object} config
 */
function greetingDecision(comment, config) {
  return { type: "greeting", comment, hide: config.HIDE_GREETINGS !== false };
}

function undoAsGreeting(decision, state, config) {
  const record = getOrCreateHandle(state, identityKey(decision.comment));
  if (decision.comment.matchKey) {
    unregisterSignature(decision.comment.matchKey, state);
  }
  if (decision.type === "primary") {
    if (record.open === decision.block) record.open = null;
    record.hasPrimaryQuestion = false;
  }
  if (decision.type === "extra") {
    if (decision.block) {
      decision.block.hideConfirmed = true;
      decision.block.absorbed = true;
    }
    setOpen(record, decision.previousBlock ?? record.lastBlock ?? null);
  }
  return greetingDecision(decision.comment, config);
}

export function applyLlmOverride(decision, llmResult, state, config) {
  if (!decision || !llmResult || !llmResult.classification) return decision;

  const classification = llmResult.classification;

  if (decision.reviewKind === "courtesy") {
    if (classification === "greeting") return greetingDecision(decision.comment, config);
    const record = getOrCreateHandle(state, identityKey(decision.comment));
    // A later real question already took the slot. Promoting this leftover
    // would mark it extra and risk hiding a blessing. Leave the regex look.
    if (record.hasPrimaryQuestion) return decision;
    return processComment(decision.comment, state, config, { skipCourtesy: true });
  }

  // Room / same-person "greeting" is only safe on leftover courtesy. A real
  // question the model misread as thanks must stay visible (never hide a maybe).
  if (classification === "greeting") {
    if (maybeCourtesy(decision.comment.displayText, config)) {
      return undoAsGreeting(decision, state, config);
    }
    return decision;
  }

  const record = getOrCreateHandle(state, identityKey(decision.comment));
  const previousBlock = decision.previousBlock?.absorbed
    ? record.lastBlock
    : (decision.previousBlock ?? record.lastBlock);

  if (decision.type === "primary") {
    if (classification !== "duplicate") return decision;
    const next = collapseAsSemantic(decision, llmResult, state);
    if (!next) return decision;
    if (record.open === decision.block) record.open = null;
    return next;
  }

  if (decision.type === "duplicate" && decision.kind === "fuzzy") {
    if (classification === "duplicate") {
      const target =
        resolveDuplicateTarget(decision, llmResult, state) ?? decision.target;
      if (!target) return decision;
      collapseOnto(target, decision.comment);
      return {
        type: "duplicate",
        kind: "semantic",
        comment: decision.comment,
        target,
        count: target.count,
      };
    }

    if (classification === "continuation" && config.JOIN_CONTINUATIONS !== false && canMergeMore(previousBlock, config) && !previousBlock?.hideConfirmed) {
      mergeContinuation(previousBlock, decision.comment);
      setOpen(record, previousBlock);
      return { type: "continuation", comment: decision.comment, block: previousBlock };
    }

    if (classification === "extra" && record.hasPrimaryQuestion) {
      const block = openBlock(decision.comment, "extra");
      const hide = config.HIDE_CONFIRMED_EXTRAS !== false;
      block.hideConfirmed = hide;
      setOpen(record, block);
      registerSignature(decision.comment, state, config);
      return { type: "extra", comment: decision.comment, block, hide, withinWindow: true };
    }

    if (record.hasPrimaryQuestion) {
      const block = openBlock(decision.comment, "extra");
      setOpen(record, block);
      return { type: "extra", comment: decision.comment, block, hide: false, withinWindow: true };
    }

    record.hasPrimaryQuestion = true;
    const block = openBlock(decision.comment, "question");
    setOpen(record, block);
    registerSignature(decision.comment, state, config);
    return { type: "primary", comment: decision.comment, block };
  }

  if (decision.type === "extra") {
    if (classification === "continuation") {
      if (
        config.JOIN_CONTINUATIONS === false ||
        previousBlock?.hideConfirmed ||
        !canMergeMore(previousBlock, config)
      ) {
        return decision;
      }
      unregisterSignature(decision.comment.matchKey, state);
      const extraBlock = decision.block;
      extraBlock.absorbed = true;
      extraBlock.hideConfirmed = true;
      const adopted = [];
      const leftover = [];
      for (const frag of extraBlock.fragments) {
        if (canMergeMore(previousBlock, config)) {
          mergeContinuation(previousBlock, frag);
          adopted.push(frag);
        } else {
          leftover.push(frag);
        }
      }
      setOpen(record, previousBlock);
      const alsoRender = [
        ...adopted
          .filter((frag) => frag !== decision.comment)
          .map((frag) => ({ type: "continuation", comment: frag, block: previousBlock })),
        ...leftover
          .filter((frag) => frag !== decision.comment)
          .map((frag) => ({
            type: "extra",
            comment: frag,
            withinWindow: true,
          })),
      ];
      if (leftover.includes(decision.comment)) {
        return {
          type: "extra",
          comment: decision.comment,
          withinWindow: true,
          alsoRender,
        };
      }
      return {
        type: "continuation",
        comment: decision.comment,
        block: previousBlock,
        alsoRender,
      };
    }

    if (classification === "duplicate") {
      const next = collapseAsSemantic(decision, llmResult, state);
      if (!next) return decision;
      decision.block.hideConfirmed = true;
      setOpen(record, previousBlock ?? null);
      next.alsoRender = hideExtraFragments(decision.block, decision.comment);
      return next;
    }

    if (classification === "extra") {
      const entry = state.signatures.get(decision.comment.matchKey);
      if (entry && entry.count > 1) {
        return {
          type: "duplicate",
          kind: "exact",
          comment: decision.comment,
          target: entry,
          count: entry.count,
        };
      }
      const hide = config.HIDE_CONFIRMED_EXTRAS !== false;
      decision.block.hideConfirmed = hide;
      return {
        type: "extra",
        comment: decision.comment,
        block: decision.block,
        hide,
        withinWindow: decision.withinWindow,
        alsoRender: hide ? hideExtraFragments(decision.block, decision.comment) : [],
      };
    }
  }

  return decision;
}
