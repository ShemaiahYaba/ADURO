import type { Emotion } from "./types";

export const HELPLINES = {
  surpin: {
    name: "SURPIN",
    number: "0800 078 7746",
    note: "Suicide Research and Prevention Initiative Nigeria",
  },
  mani: {
    name: "MANI",
    number: "0800 000 2000",
    note: "Mentally Aware Nigeria Initiative",
  },
} as const;

export const DISCLAIMER =
  "Aduro offers supportive, non-clinical conversation only. It is not a substitute for professional mental health care, diagnosis, or treatment.";

export const CRISIS_RESPONSE = `I'm really concerned about what you're sharing. You deserve support right now. Please reach out immediately:

• ${HELPLINES.surpin.name}: ${HELPLINES.surpin.number}
• ${HELPLINES.mani.name}: ${HELPLINES.mani.number}

If you are in immediate danger, call emergency services or go to the nearest hospital. You are not alone.`;

export const DIAGNOSIS_REFUSAL =
  "I can't diagnose or confirm any mental health condition. Only a qualified professional can do that. If you're worried about how you've been feeling, speaking with a counsellor or doctor would be a good next step.";

export const OFF_TOPIC_REFUSAL =
  "Sorry, I can't help you with that. I'm here for emotional support and general mental health information.";

export const NO_INFO_RESPONSE =
  "I don't have enough information in my knowledge base to answer that accurately. I can help with emotional support or general mental health topics if you'd like.";

export const CONFIG_LEAK_RESPONSE =
  "I'm not able to share my internal instructions or configuration. I'm here to listen and support you — what's on your mind?";

export const KB_LIMIT_RESPONSE =
  "I can offer emotional support and answer general mental health questions from my knowledge base. I can't help with topics outside that scope.";

export const GENERIC_REFUSAL =
  "Sorry, I can't help you with that. I'm here if you want to talk about how you're feeling or learn about mental health.";

export const HOPELESSNESS_CHECKIN =
  " When you say you feel hopeless, I want to check in — are you having thoughts of hurting yourself? If you are, please contact SURPIN at 0800 078 7746 or MANI at 0800 000 2000.";

export const ROUTER_MODEL =
  process.env.ADURO_ROUTER_MODEL ?? "openai/gpt-4o-mini";

export const EMBED_MODEL =
  process.env.ADURO_EMBED_MODEL ?? "openai/text-embedding-3-small";

export const PATTERN_THRESHOLD_EMOTIONAL = 0.55;
export const PATTERN_THRESHOLD_FACTUAL = 0.7;
export const KB_MIN_SCORE = 0.75;
export const ROUTER_MIN_CONFIDENCE = 0.5;

export const TAG_EMOTION_MAP: Record<string, Emotion> = {
  sad: "sadness",
  depressed: "sadness",
  worthless: "sadness",
  anxious: "anxiety",
  stressed: "stress",
  problem: "stress",
  "no-approach": "stress",
  suicide: "crisis",
  scared: "anxiety",
  death: "grief",
  happy: "happy",
  greeting: "neutral",
  morning: "neutral",
  afternoon: "neutral",
  evening: "neutral",
  thanks: "happy",
  help: "support",
};

export function emotionForTag(tag: string): Emotion {
  if (tag.startsWith("fact-") || tag === "mental-health-fact") return "factual";
  return TAG_EMOTION_MAP[tag] ?? "neutral";
}
