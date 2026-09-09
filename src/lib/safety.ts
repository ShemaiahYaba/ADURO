import {
  CONFIG_LEAK_RESPONSE,
  CRISIS_RESPONSE,
  DIAGNOSIS_REFUSAL,
  KB_LIMIT_RESPONSE,
  OFF_TOPIC_REFUSAL,
} from "./constants";
import { normalizeMisspellings } from "./spell-normalize";
import type { DialogueState, SafetyResult } from "./types";

const CRISIS_PATTERNS: RegExp[] = [
  /\b(kill+\s+myself|killing\s+myself)\b/i,
  /\b(comm+it\s+suicide|end(ing)?\s+my\s+life)\b/i,
  /\b(end(ing)?\s+it\s+all)\b/i,
  /\b(want\s+to\s+die|wanna\s+die|thinking\s+of\s+dying)\b/i,
  /\b(hurt\s+myself|harm\s+myself|cut\s+myself)\b/i,
  /\b(no\s+point\s+in\s+(living|continuing|going\s+on))\b/i,
  /\b(don'?t\s+see\s+(any\s+)?point\s+in\s+continuing)\b/i,
  /\b(do\s+not\s+see\s+(any\s+)?point\s+in\s+continuing)\b/i,
  /\b(better\s+off\s+dead)\b/i,
  /\b(tak(e|ing)\s+my\s+(own\s+)?life)\b/i,
  /\b(don'?t\s+want\s+to\s+(be\s+)?alive|don'?t\s+want\s+to\s+live)\b/i,
  // Normalized spellings (after typo fix) and fuzzy variants
  /\b(suicid(e|al))\b/i,
  /\bs[uoa]+c[i]?d(e|al|le)?\b/i,
];

const CONFIG_LEAK_PATTERNS: RegExp[] = [
  /\b(ignore\s+(all\s+)?(previous|prior)\s+instructions)\b/i,
  /\b(reveal\s+(your\s+)?(prompt|instructions|system\s+message))\b/i,
  /\b(what\s+are\s+your\s+instructions)\b/i,
  /\b(show\s+me\s+your\s+(prompt|config))\b/i,
];

// Kept deliberately narrow: an over-broad pattern here would refuse ordinary
// emotional conversation, which is the failure mode this layer exists to avoid.
const DIAGNOSIS_PATTERNS: RegExp[] = [
  /\b(diagnos(e|is|ing)\s+me)\b/i,
  /\b(do\s+i\s+have\s+(depression|anxiety|bipolar|ptsd|adhd))\b/i,
  /\b(am\s+i\s+(depressed|mentally\s+ill))\b/i,
  /\bcan\s+you\s+tell\s+me\s+if\s+i\s+have\b/i,
  /\bis\s+(this|it|that|what\s+i'?m\s+feeling)\s+(depression|clinical\s+depression|anxiety\s+disorder|bipolar|ptsd|adhd)\b/i,
  /\bdo\s+you\s+think\s+i\s+(have|might\s+have)\s+(depression|anxiety|bipolar|ptsd|adhd)\b/i,
  /\bdo\s+you\s+think\s+i'?m\s+(depressed|bipolar|mentally\s+ill)\b/i,
  /\bcould\s+i\s+(have|be)\s+(depressed|depression|bipolar|mentally\s+ill)\b/i,
];

/** Category-level patterns — refuse clearly out-of-scope requests. */
const OFF_TOPIC_PATTERNS: RegExp[] = [
  // General knowledge / trivia
  /\b(what('s| is)\s+the\s+(capital|population|president|currency|flag)\s+of)\b/i,
  /\b(who\s+(won|invented|discovered|founded|created))\b/i,
  /\bwho\s+(is|was)\s+(the\s+)?(president|ceo|founder|prime\s+minister)\b/i,
  /\b(tell\s+me\s+(a\s+)?(fact|joke)|random\s+fact)\b/i,
  /\b(capital\s+of\s+\w+)\b/i,
  // Technical / coding
  /\b(write|debug|fix|review|build)\s+(me\s+)?(a\s+\w+\s+)?(code|program|script|function|app|website)\b/i,
  /\b(how\s+(do|to)\s+(code|program|debug|deploy))\b/i,
  /\b(explain\s+(the\s+)?(osi\s+model|algorithm|binary|compiler|api\s+design))\b/i,
  // Arithmetic / calculations / math (not emotional support about math anxiety)
  /\b(what('s| is)\s+)?\d+\s*[\+\-\*\/x×÷]\s*\d+\b/i,
  /\b(add|subtract|multiply|divide|calculate)\s+\d+/i,
  /\b(can\s+you\s+)?(add|subtract|multiply|divide|calculate|compute|solve)\b.*\d/i,
  /\bwhat('s| is)\s+\d+\s+(plus|minus|times|divided\s+by)\s+\d+\b/i,
  // Homework / academic tasks (not emotional support about school)
  /\b(do\s+my\s+(homework|assignment|essay|project))\b/i,
  /\b(solve\s+(this|the)\s+(equation|problem|math))\b/i,
  /\bhelp\s+me\s+(with\s+)?(my\s+)?(homework|assignment|essay)\b/i,
  // General knowledge (category-level)
  /\b(what\s+(year|date|time|language|country|continent))\b/i,
  /\b(how\s+(many|much|old|tall|long|far)\s+(is|are|was|were))\b/i,
  /\btranslate\s+(this|the|to)\b/i,
  // Business / finance
  /\b(stock\s+(price|tip|market)|invest(ment)?\s+advice|crypto\s+tip)\b/i,
  /\b(how\s+to\s+start\s+a\s+business|marketing\s+strategy)\b/i,
  // Entertainment recommendations
  /\b(recommend\s+(a|some|me)\s+(movie|show|series|book|game|song|album|podcast))\b/i,
  /\bwhat\s+(movie|show|series|book|game)\s+should\s+i\s+(watch|read|play)\b/i,
  // Cooking / recipes / weather
  /\b(how\s+do\s+i\s+cook|recipe\s+for|jollof\s+rice|ingredients\s+for)\b/i,
  /\b(weather\s+(in|for|today|tomorrow|forecast))\b/i,
  /\b(who\s+won\s+(the\s+)?world\s+cup)\b/i,
];

/** Closing signals — user is ending the conversation. */
export const CLOSING_PATTERNS: RegExp[] = [
  /\b(goodbye|good\s+bye|bye\s+for\s+now|see\s+you(\s+later|\s+soon)?|talk\s+(to\s+you\s+)?later|catch\s+you\s+later)\b/i,
  /\b(that'?s\s+all\s+for\s+now|i'?m\s+done|we'?re\s+done|nothing\s+else\s+to\s+say)\b/i,
  /\b(thanks?[,.\s]+.*(bye|later|goodbye)|thank\s+you[,.\s]+.*(talk\s+later|goodbye))\b/i,
  /\b(gotta\s+go|have\s+to\s+go|signing\s+off)\b/i,
];

const KB_LIMIT_PATTERNS: RegExp[] = [
  /\bwhat\s+(topics?|subjects?)\s+can\s+you\b/i,
  /\bwhat\s+is\s+in\s+your\s+knowledge\s+base\b/i,
  /\bwhat\s+do\s+you\s+know\s+about\b/i,
  /\bwhat\s+can\s+you\s+answer\b/i,
];

/** Emotional wellness cues — off-topic patterns must not override these. */
const EMOTIONAL_WELLNESS_CUES: RegExp[] = [
  /\b(feel(ing)?|felt|emotion|mood|mental\s+health)\b/i,
  /\b(anxi|depress|stress|sad|lonely|overwhelm|hopeless|grief|trauma|therapy|counsel)/i,
  /\b(can'?t\s+cope|breaking\s+down|panic|worried\s+about)\b/i,
];

function hasEmotionalWellnessCue(message: string): boolean {
  return EMOTIONAL_WELLNESS_CUES.some((p) => p.test(message));
}

export function isClosingMessage(message: string): boolean {
  const normalized = normalizeMisspellings(message.trim());
  if (!normalized) return false;
  // "that's all" mid-sentence with more content is usually not a closing
  if (
    /\bthat'?s\s+all\b/i.test(normalized) &&
    /\b(what|should|why|how|cheat|feel|help)\b/i.test(normalized)
  ) {
    return false;
  }
  return CLOSING_PATTERNS.some((p) => p.test(normalized));
}

export function hadEmotionalDistress(state: DialogueState): boolean {
  const emotionalActs = new Set([
    "validate",
    "reflect",
    "offer_coping",
    "normalize_uncertainty",
    "sit_with",
    "answer_directly",
  ]);
  return (
    state.facts.length > 0 ||
    state.covered.some((a) => emotionalActs.has(a)) ||
    ["surfacing", "understanding", "supporting"].includes(state.arc)
  );
}

export function checkSafety(message: string): SafetyResult {
  const trimmed = normalizeMisspellings(message.trim());
  if (!trimmed) {
    return { handled: false };
  }

  for (const pattern of CRISIS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { handled: true, text: CRISIS_RESPONSE, emotion: "crisis" };
    }
  }

  for (const pattern of CONFIG_LEAK_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { handled: true, text: CONFIG_LEAK_RESPONSE, emotion: "neutral" };
    }
  }

  for (const pattern of KB_LIMIT_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { handled: true, text: KB_LIMIT_RESPONSE, emotion: "neutral" };
    }
  }

  for (const pattern of DIAGNOSIS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { handled: true, text: DIAGNOSIS_REFUSAL, emotion: "neutral" };
    }
  }

  // Off-topic is handled by the LLM scope gate (with heuristic fallback).
  // Hard safety stays deterministic: crisis, config, diagnosis, KB limits.

  return { handled: false };
}

/**
 * Cheap regex fallback for off-topic when the LLM scope gate is disabled
 * or unavailable. Emotional wellness cues still win.
 */
export function checkOffTopicHeuristic(message: string): SafetyResult {
  const trimmed = normalizeMisspellings(message.trim());
  if (!trimmed) return { handled: false };

  if (hasEmotionalWellnessCue(trimmed)) {
    return { handled: false };
  }

  for (const pattern of OFF_TOPIC_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { handled: true, text: OFF_TOPIC_REFUSAL, emotion: "off_topic" };
    }
  }

  // Biography / mythology trivia: "who is Oduduwa" but not "who is there for me"
  if (isBiographyQuestion(trimmed)) {
    return { handled: true, text: OFF_TOPIC_REFUSAL, emotion: "off_topic" };
  }

  return { handled: false };
}

const BIOGRAPHY_OBJECT_STOPWORDS = new Set([
  "there",
  "this",
  "that",
  "she",
  "he",
  "it",
  "someone",
  "anyone",
  "everybody",
  "everybody",
  "with",
  "going",
  "coming",
  "next",
  "here",
  "home",
  "left",
  "right",
  "to",
  "for",
  "me",
  "you",
  "we",
  "they",
  "a",
  "an",
  "the",
  "more",
  "feeling",
  "hurting",
  "asking",
  "listening",
]);

/** "who is Oduduwa" / "who was Shakespeare" — not "who is there for me". */
export function isBiographyQuestion(message: string): boolean {
  const match = message.match(/\bwho\s+(?:is|was)\s+([a-z][a-z'\-]{2,})\b/i);
  if (!match?.[1]) return false;
  return !BIOGRAPHY_OBJECT_STOPWORDS.has(match[1].toLowerCase());
}

export function isHopelessnessMessage(message: string): boolean {
  const normalized = normalizeMisspellings(message);
  return /\b(hopeless|no\s+hope|nothing\s+left)\b/i.test(normalized);
}
