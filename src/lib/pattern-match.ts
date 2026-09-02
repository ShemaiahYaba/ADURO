import {
  PATTERN_THRESHOLD_EMOTIONAL,
  PATTERN_THRESHOLD_FACTUAL,
} from "./constants";
import { isClassifierTag } from "./flow-tags";
import { getAllIntents, getRouteTypeForTag, isFactTag } from "./intents";
import {
  cosineSimilarity,
  meaningfulOverlap,
  queryToTfidfVector,
  tokenize,
} from "./text-utils";
import {
  emotionKeywordMatch,
  normalizeInformalGreeting,
  priorityPhraseMatch,
} from "./emotion-keywords";
import type { PatternMatchResult } from "./types";

type ScoredIntent = {
  tag: string;
  score: number;
  overlap: number;
  routeType: "emotional" | "factual" | "conversational";
};

let idfCache: Map<string, number> | null = null;
let termOrder: string[] | null = null;
let patternVectors: Map<string, number[][]> | null = null;

function ensureTfidfIndex(): void {
  if (idfCache && termOrder && patternVectors) return;

  const intents = getAllIntents();
  const allDocs: string[][] = [];
  const intentPatternTokens: { tag: string; tokens: string[] }[] = [];

  for (const intent of intents) {
    if (!isClassifierTag(intent.tag)) continue;
    for (const pattern of intent.patterns) {
      const tokens = tokenize(pattern);
      if (tokens.length === 0 && pattern.trim().length > 0) {
        allDocs.push([pattern.toLowerCase().trim()]);
        intentPatternTokens.push({ tag: intent.tag, tokens: [pattern.toLowerCase().trim()] });
      } else if (tokens.length > 0) {
        allDocs.push(tokens);
        intentPatternTokens.push({ tag: intent.tag, tokens });
      }
    }
  }

  const { idf } = buildIdf(allDocs);
  idfCache = idf;
  termOrder = [...idf.keys()];

  patternVectors = new Map();
  for (const intent of intents) {
    if (!isClassifierTag(intent.tag)) continue;
    const vectors: number[][] = [];
    for (const pattern of intent.patterns) {
      const tokens = tokenize(pattern);
      const t = tokens.length > 0 ? tokens : [pattern.toLowerCase().trim()];
      vectors.push(queryToTfidfVector(t, idf, termOrder));
    }
    patternVectors.set(intent.tag, vectors);
  }
}

function buildIdf(documents: string[][]): { idf: Map<string, number> } {
  const df = new Map<string, number>();
  for (const doc of documents) {
    const unique = new Set(doc);
    for (const term of unique) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }
  const n = documents.length;
  const idf = new Map<string, number>();
  for (const [term, count] of df) {
    idf.set(term, Math.log((n + 1) / (count + 1)) + 1);
  }
  return { idf };
}

function scoreMessage(message: string): ScoredIntent | null {
  ensureTfidfIndex();
  if (!idfCache || !termOrder || !patternVectors) return null;

  const normalized = message.trim().toLowerCase();
  const queryTokens = tokenize(message);
  if (queryTokens.length === 0 && normalized.length === 0) return null;

  let best: ScoredIntent | null = null;

  for (const intent of getAllIntents()) {
    if (!isClassifierTag(intent.tag)) continue;
    for (const pattern of intent.patterns) {
      const patternLower = pattern.toLowerCase().trim();

      if (patternLower.length <= 20 && normalized === patternLower) {
        return {
          tag: intent.tag,
          score: 1,
          overlap: queryTokens.length || 1,
          routeType: getRouteTypeForTag(intent.tag),
        };
      }

      if (patternLower.length > 3 && normalized.includes(patternLower)) {
        const candidate: ScoredIntent = {
          tag: intent.tag,
          score: 0.95,
          overlap: tokenize(pattern).length,
          routeType: getRouteTypeForTag(intent.tag),
        };
        if (!best || candidate.score > best.score) best = candidate;
      }
    }

    const vectors = patternVectors.get(intent.tag) ?? [];
    const queryVec = queryToTfidfVector(
      queryTokens.length > 0 ? queryTokens : [normalized],
      idfCache,
      termOrder,
    );

    for (let i = 0; i < vectors.length; i++) {
      const patternTokens = tokenize(intent.patterns[i] ?? "");
      const overlap = meaningfulOverlap(
        queryTokens.length > 0 ? queryTokens : [normalized],
        patternTokens.length > 0 ? patternTokens : [intent.patterns[i]?.toLowerCase() ?? ""],
      );

      const score = cosineSimilarity(queryVec, vectors[i]!);
      const candidate: ScoredIntent = {
        tag: intent.tag,
        score,
        overlap,
        routeType: getRouteTypeForTag(intent.tag),
      };

      if (!best || score > best.score) {
        best = candidate;
      }
    }
  }

  return best;
}

export function patternMatch(message: string): PatternMatchResult {
  const priority = priorityPhraseMatch(message);
  if (priority) return priority;

  const normalized = normalizeInformalGreeting(message);
  const best = scoreMessage(normalized);
  if (!best) return emotionKeywordMatch(message) ?? { matched: false };

  const isFactual = isFactTag(best.tag);
  const threshold = isFactual
    ? PATTERN_THRESHOLD_FACTUAL
    : PATTERN_THRESHOLD_EMOTIONAL;

  const minOverlap = best.score >= 0.9 ? 1 : 2;

  if (best.score >= threshold && best.overlap >= minOverlap) {
    // Reject weak scared matches unless the user explicitly names fear.
    if (
      best.tag === "scared" &&
      best.score < 0.85 &&
      !/\b(scared|afraid|frightened|fear)\b/i.test(message)
    ) {
      return emotionKeywordMatch(message) ?? { matched: false };
    }

    return {
      matched: true,
      tag: best.tag,
      routeType: best.routeType,
      confidence: best.score,
    };
  }

  return emotionKeywordMatch(message) ?? { matched: false };
}

/** Reset cached TF-IDF index (for tests). */
export function resetPatternMatchCache(): void {
  idfCache = null;
  termOrder = null;
  patternVectors = null;
}
