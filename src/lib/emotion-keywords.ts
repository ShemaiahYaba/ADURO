import { getRouteTypeForTag } from "./intents";
import type { PatternMatchResult } from "./types";

/** High-signal emotion phrases when TF-IDF misses informal wording. */
const EMOTION_RULES: { tag: string; pattern: RegExp }[] = [
  { tag: "stressed", pattern: /\b(stressed|stress|burned?\s*out|overwhelmed)\b/i },
  { tag: "anxious", pattern: /\b(anxious|anxiety|worried|worry|nervous|panic)\b/i },
  {
    tag: "sad",
    pattern: /\b(sad|lonely|empty|down|miserable|unhappy)\b/i,
  },
  { tag: "depressed", pattern: /\b(depressed|depression)\b/i },
  { tag: "worthless", pattern: /\b(worthless|useless|no\s+one\s+likes\s+me)\b/i },
  { tag: "happy", pattern: /\b(feel\s+great|feel\s+good|i'?m\s+happy|cheerful)\b/i },
  { tag: "scared", pattern: /\b(scared|afraid|frightened)\b/i },
  { tag: "sleep", pattern: /\b(insomnia|can'?t\s+sleep|trouble\s+sleeping)\b/i },
  { tag: "death", pattern: /\b(died|passed\s+away|lost\s+(my|a))\b/i },
  { tag: "greeting", pattern: /^(hi|hey|hello|good\s+(morning|afternoon|evening))\b/i },
];

export function emotionKeywordMatch(message: string): PatternMatchResult | null {
  const trimmed = message.trim();
  if (!trimmed) return null;

  for (const { tag, pattern } of EMOTION_RULES) {
    if (pattern.test(trimmed)) {
      return {
        matched: true,
        tag,
        routeType: getRouteTypeForTag(tag),
        confidence: 0.85,
      };
    }
  }

  return null;
}
