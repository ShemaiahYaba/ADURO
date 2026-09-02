import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { embed } from "ai";
import { KB_MIN_SCORE, NO_INFO_RESPONSE } from "./constants";
import { embedModel, isOpenAiConfigured } from "./openai";
import { getAllFactIntents } from "./intents";
import {
  cosineSimilarity,
  meaningfulOverlap,
  tokenize,
} from "./text-utils";
import type { Emotion, KbEntry } from "./types";
import { patternMatch } from "./pattern-match";

let kbCache: KbEntry[] | null = null;

function loadKbEntries(): KbEntry[] {
  if (kbCache) return kbCache;

  const publicPath = join(process.cwd(), "public", "kb-embeddings.json");
  if (existsSync(publicPath)) {
    const raw = JSON.parse(readFileSync(publicPath, "utf-8")) as KbEntry[];
    kbCache = raw;
    return raw;
  }

  kbCache = getAllFactIntents().map((intent) => ({
    tag: intent.tag,
    response: intent.responses[0] ?? NO_INFO_RESPONSE,
    patternText: intent.patterns.join(" | "),
    embedding: null,
  }));
  return kbCache;
}

function lexicalRetrieve(message: string): { text: string; emotion: Emotion } | null {
  const match = patternMatch(message);
  if (match.matched && match.routeType === "factual") {
    const entry = loadKbEntries().find((e) => e.tag === match.tag);
    if (entry) {
      return { text: entry.response, emotion: "factual" };
    }
  }
  return null;
}

export async function retrieveFact(
  message: string,
): Promise<{ text: string; emotion: Emotion } | null> {
  const entries = loadKbEntries();
  const queryTokens = tokenize(message);

  if (!isOpenAiConfigured()) {
    return lexicalRetrieve(message);
  }

  const withEmbeddings = entries.filter((e) => e.embedding && e.embedding.length > 0);

  if (withEmbeddings.length === 0) {
    return lexicalRetrieve(message);
  }

  try {
    const { embedding: queryEmbedding } = await embed({
      model: embedModel(),
      value: message,
    });

    let best: { entry: KbEntry; score: number; overlap: number } | null = null;

    for (const entry of withEmbeddings) {
      const patternTokens = tokenize(entry.patternText);
      const overlap = meaningfulOverlap(queryTokens, patternTokens);
      const score = cosineSimilarity(
        [...queryEmbedding],
        entry.embedding!,
      );

      if (!best || score > best.score) {
        best = { entry, score, overlap };
      }
    }

    if (best && best.score >= KB_MIN_SCORE && best.overlap >= 2) {
      return { text: best.entry.response, emotion: "factual" };
    }
  } catch {
    return lexicalRetrieve(message);
  }

  return lexicalRetrieve(message);
}

export function getKbEntriesForBuild(): KbEntry[] {
  return getAllFactIntents().map((intent) => ({
    tag: intent.tag,
    response: intent.responses[0] ?? NO_INFO_RESPONSE,
    patternText: intent.patterns.join(" | "),
    embedding: null,
  }));
}

export function resetKbCache(): void {
  kbCache = null;
}
