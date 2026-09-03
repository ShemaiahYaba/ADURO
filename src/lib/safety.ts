import {
  CONFIG_LEAK_RESPONSE,
  CRISIS_RESPONSE,
  DIAGNOSIS_REFUSAL,
  KB_LIMIT_RESPONSE,
  OFF_TOPIC_REFUSAL,
} from "./constants";
import type { SafetyResult } from "./types";

const CRISIS_PATTERNS: RegExp[] = [
  /\b(kill\s+myself|killing\s+myself)\b/i,
  /\b(commit\s+suicide|end\s+my\s+life)\b/i,
  /\b(want\s+to\s+die|wanna\s+die)\b/i,
  /\b(hurt\s+myself|harm\s+myself)\b/i,
  /\b(no\s+point\s+in\s+(living|continuing|going\s+on))\b/i,
  /\b(don'?t\s+see\s+(any\s+)?point\s+in\s+continuing)\b/i,
  /\b(do\s+not\s+see\s+(any\s+)?point\s+in\s+continuing)\b/i,
  /\b(better\s+off\s+dead)\b/i,
  /\b(suicid)/i,
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

const OFF_TOPIC_PATTERNS: RegExp[] = [
  /\b(capital\s+of\s+(nigeria|france|ghana|kenya|the\s+world))\b/i,
  /\b(who\s+won\s+(the\s+)?world\s+cup)\b/i,
  /\b(how\s+do\s+i\s+cook|jollof\s+rice|recipe\s+for)\b/i,
  /\b(explain\s+(the\s+)?osi\s+model)\b/i,
  /\b(write\s+(me\s+)?(code|a\s+program))\b/i,
  /\b(weather\s+in|stock\s+price)\b/i,
];

const KB_LIMIT_PATTERNS: RegExp[] = [
  /\bwhat\s+(topics?|subjects?)\s+can\s+you\b/i,
  /\bwhat\s+is\s+in\s+your\s+knowledge\s+base\b/i,
  /\bwhat\s+do\s+you\s+know\s+about\b/i,
  /\bwhat\s+can\s+you\s+answer\b/i,
];

export function checkSafety(message: string): SafetyResult {
  const trimmed = message.trim();
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

  for (const pattern of OFF_TOPIC_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { handled: true, text: OFF_TOPIC_REFUSAL, emotion: "off_topic" };
    }
  }

  return { handled: false };
}

export function isHopelessnessMessage(message: string): boolean {
  return /\b(hopeless|no\s+hope|nothing\s+left)\b/i.test(message);
}
