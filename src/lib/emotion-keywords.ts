import { getRouteTypeForTag } from "./intents";
import type { PatternMatchResult } from "./types";

/** Phrases that must win over weak TF-IDF matches. */
const PRIORITY_PHRASES: { tag: string; pattern: RegExp }[] = [
  { tag: "sad", pattern: /\b(type of way|some type of way)\b/i },
  { tag: "stressed", pattern: /\b(fatigue|fatigued|tired|exhausted|worn\s*out)\b/i },
];

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
];

export function normalizeInformalGreeting(message: string): string {
  const trimmed = message.trim();
  if (/^h+i+!*$/i.test(trimmed)) return "Hi";
  if (/^he+y+!*$/i.test(trimmed)) return "Hey";
  if (/^hello+!*$/i.test(trimmed)) return "Hello";
  return message;
}

export function isFuzzyGreeting(message: string): boolean {
  const trimmed = message.trim();
  return /^(hi+|hey+|hello+)[!.?]*$/i.test(trimmed);
}

export function priorityPhraseMatch(message: string): PatternMatchResult | null {
  for (const { tag, pattern } of PRIORITY_PHRASES) {
    if (pattern.test(message)) {
      return {
        matched: true,
        tag,
        routeType: getRouteTypeForTag(tag),
        confidence: 0.9,
      };
    }
  }
  return null;
}

export function emotionKeywordMatch(message: string): PatternMatchResult | null {
  const trimmed = message.trim();
  if (!trimmed) return null;

  if (isFuzzyGreeting(trimmed)) {
    return {
      matched: true,
      tag: "greeting",
      routeType: getRouteTypeForTag("greeting"),
      confidence: 0.9,
    };
  }

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
