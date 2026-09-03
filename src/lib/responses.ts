import flowsData from "@/data/flows.json";
import { HOPELESSNESS_CHECKIN } from "./constants";
import { jaccardSimilarity } from "./output-guard";
import { isHopelessnessMessage } from "./safety";
import { getTemplateById } from "./templates";
import { hashString } from "./text-utils";
import type { Emotion } from "./types";

const FALLBACK_RESPONSES = [
  "I'm here to listen. Could you tell me more about how you're feeling?",
  "I want to understand better. What's been on your mind?",
];

export type PickOptions = {
  /** Reject pool entries containing a question mark. */
  avoidQuestion?: boolean;
  /** Reject pool entries near-identical to these (the bot's recent replies). */
  avoidTexts?: string[];
};

/**
 * Used when an act forbids questions but the exemplar pool is entirely
 * questions (most emotional pools are). Needs several variants, or it becomes
 * a repetition source itself on consecutive no-question turns.
 */
const NO_QUESTION_FALLBACKS = [
  "I'm here with you. There's no rush to make sense of it right now.",
  "That's a lot to carry. I'm not going anywhere.",
  "You don't have to have this figured out. I'm still listening.",
  "Take whatever time you need. I'm right here.",
];

/**
 * Rotate from the hashed start index and take the first entry satisfying the
 * constraints. Template paths skip the output guard, so the question budget
 * and anti-repetition have to be honoured during selection instead.
 */
function selectFromPool(
  pool: string[],
  start: number,
  options: PickOptions,
): string | null {
  for (let offset = 0; offset < pool.length; offset++) {
    const candidate = pool[(start + offset) % pool.length]!;
    if (options.avoidQuestion && candidate.includes("?")) continue;
    const repeats = (options.avoidTexts ?? []).some(
      (prev) => jaccardSimilarity(candidate, prev) >= 0.8,
    );
    if (repeats) continue;
    return candidate;
  }
  return null;
}

export function pickTemplate(
  templateId: string,
  sessionId: string,
  messageIndex: number,
  userMessage?: string,
  options: PickOptions = {},
): { text: string; emotion: Emotion } {
  const template = getTemplateById(templateId);
  const pool = template?.responses?.length ? template.responses : FALLBACK_RESPONSES;
  const index = hashString(`${sessionId}:${templateId}:${messageIndex}`) % pool.length;

  let text = selectFromPool(pool, index, options);

  if (text === null && options.avoidQuestion) {
    const fbIndex =
      hashString(`${sessionId}:noq:${messageIndex}`) %
      NO_QUESTION_FALLBACKS.length;
    text =
      selectFromPool(NO_QUESTION_FALLBACKS, fbIndex, options) ??
      NO_QUESTION_FALLBACKS[fbIndex]!;
  }

  text ??= pool[index] ?? pool[0]!;

  const sadTemplates = new Set(["sad", "worthless", "depressed"]);
  if (
    userMessage &&
    isHopelessnessMessage(userMessage) &&
    sadTemplates.has(templateId)
  ) {
    text += HOPELESSNESS_CHECKIN;
  }

  return {
    text,
    emotion: template?.emotion ?? "neutral",
  };
}

export function pickRefusalResponse(): { text: string; emotion: Emotion } {
  return {
    text: "I'm not sure I understood that. I'm here for emotional support or general mental health questions — how can I help?",
    emotion: "neutral",
  };
}

export function lookupRationaleTemplate(
  lastBotAct: string,
  userAct: string,
): string | null {
  const flows = flowsData as {
    rationaleMap: Array<{ lastBotAct: string; userAct: string; templateId: string }>;
  };
  const hit = flows.rationaleMap.find(
    (r) => r.lastBotAct === lastBotAct && r.userAct === userAct,
  );
  return hit?.templateId ?? null;
}
