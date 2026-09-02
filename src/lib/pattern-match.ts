import {
  PATTERN_THRESHOLD_EMOTIONAL,
  PATTERN_THRESHOLD_FACTUAL,
} from "./constants";
import { getAllFacts, isFactId } from "./facts";
import { getAllTemplates } from "./templates";
import { getRouteTypeForTemplate } from "./route-types";
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

type ScoredTemplate = {
  templateId: string;
  score: number;
  overlap: number;
  routeType: "emotional" | "factual" | "conversational";
};

let idfCache: Map<string, number> | null = null;
let termOrder: string[] | null = null;
let patternVectors: Map<string, number[][]> | null = null;

type PatternSource = { id: string; patterns: string[] };

function getPatternSources(): PatternSource[] {
  const fromTemplates = getAllTemplates()
    .filter((t) => t.patterns.length > 0)
    .map((t) => ({ id: t.id, patterns: t.patterns }));

  const fromFacts = getAllFacts().map((f) => ({
    id: f.id,
    patterns: f.patterns,
  }));

  return [...fromTemplates, ...fromFacts];
}

function ensureTfidfIndex(): void {
  if (idfCache && termOrder && patternVectors) return;

  const sources = getPatternSources();
  const allDocs: string[][] = [];

  for (const source of sources) {
    for (const pattern of source.patterns) {
      const tokens = tokenize(pattern);
      if (tokens.length === 0 && pattern.trim().length > 0) {
        allDocs.push([pattern.toLowerCase().trim()]);
      } else if (tokens.length > 0) {
        allDocs.push(tokens);
      }
    }
  }

  const { idf } = buildIdf(allDocs);
  idfCache = idf;
  termOrder = [...idf.keys()];

  patternVectors = new Map();
  for (const source of sources) {
    const vectors: number[][] = [];
    for (const pattern of source.patterns) {
      const tokens = tokenize(pattern);
      const t = tokens.length > 0 ? tokens : [pattern.toLowerCase().trim()];
      vectors.push(queryToTfidfVector(t, idf, termOrder));
    }
    patternVectors.set(source.id, vectors);
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

function scoreMessage(message: string): ScoredTemplate | null {
  ensureTfidfIndex();
  if (!idfCache || !termOrder || !patternVectors) return null;

  const normalized = message.trim().toLowerCase();
  const queryTokens = tokenize(message);
  if (queryTokens.length === 0 && normalized.length === 0) return null;

  let best: ScoredTemplate | null = null;

  for (const source of getPatternSources()) {
    for (const pattern of source.patterns) {
      const patternLower = pattern.toLowerCase().trim();

      if (patternLower.length <= 20 && normalized === patternLower) {
        return {
          templateId: source.id,
          score: 1,
          overlap: queryTokens.length || 1,
          routeType: getRouteTypeForTemplate(source.id),
        };
      }

      if (patternLower.length > 3 && normalized.includes(patternLower)) {
        const candidate: ScoredTemplate = {
          templateId: source.id,
          score: 0.95,
          overlap: tokenize(pattern).length,
          routeType: getRouteTypeForTemplate(source.id),
        };
        if (!best || candidate.score > best.score) best = candidate;
      }
    }

    const vectors = patternVectors.get(source.id) ?? [];
    const queryVec = queryToTfidfVector(
      queryTokens.length > 0 ? queryTokens : [normalized],
      idfCache,
      termOrder,
    );

    for (let i = 0; i < vectors.length; i++) {
      const patternTokens = tokenize(source.patterns[i] ?? "");
      const overlap = meaningfulOverlap(
        queryTokens.length > 0 ? queryTokens : [normalized],
        patternTokens.length > 0
          ? patternTokens
          : [source.patterns[i]?.toLowerCase() ?? ""],
      );

      const score = cosineSimilarity(queryVec, vectors[i]!);
      const candidate: ScoredTemplate = {
        templateId: source.id,
        score,
        overlap,
        routeType: getRouteTypeForTemplate(source.id),
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

  const isFactual = isFactId(best.templateId);
  const threshold = isFactual
    ? PATTERN_THRESHOLD_FACTUAL
    : PATTERN_THRESHOLD_EMOTIONAL;

  const minOverlap = best.score >= 0.9 ? 1 : 2;

  if (best.score >= threshold && best.overlap >= minOverlap) {
    if (
      best.templateId === "scared" &&
      best.score < 0.85 &&
      !/\b(scared|afraid|frightened|fear)\b/i.test(message)
    ) {
      return emotionKeywordMatch(message) ?? { matched: false };
    }

    return {
      matched: true,
      templateId: best.templateId,
      routeType: best.routeType,
      confidence: best.score,
    };
  }

  return emotionKeywordMatch(message) ?? { matched: false };
}

export function resetPatternMatchCache(): void {
  idfCache = null;
  termOrder = null;
  patternVectors = null;
}
