import { HELPLINES } from "./constants";

export type GuardResult = { ok: true } | { ok: false; reason: string };

export type GuardContext = {
  recentBotTexts?: string[];
};

const APPROVED_NUMBERS = new Set(
  Object.values(HELPLINES).map((h) => h.number.replace(/\s+/g, "")),
);

const DISORDER = String.raw`(?:depression|depressive\s+disorder|anxiety\s+disorder|generali[sz]ed\s+anxiety|bipolar(?:\s+disorder)?|ptsd|ocd|schizophrenia|adhd|mental\s+illness|disorder)`;

const DIAGNOSIS_FRAME = new RegExp(
  String.raw`\byou\s+(?:have|might\s+have|may\s+have|probably\s+have|likely\s+have|do\s+have|are\s+suffering\s+from|suffer\s+from|'?re\s+dealing\s+with)\s+(?:a\s+|an\s+|some\s+|clinical\s+)?(?:\w+\s+){0,2}` +
    DISORDER,
  "i",
);

const DIAGNOSIS_LABEL =
  /\byou(?:\s+are|'?re|\s+sound|\s+seem|\s+must\s+be)\s+(?:clinically\s+)?(?:depressed|bipolar|schizophrenic|psychotic|mentally\s+ill)\b/i;

const MEDICATION =
  /\b(medication|medications|prescri(be|ption|bed)|dosage|antidepressant|ssri|prozac|zoloft|xanax|valium)\b/i;

const PERSONA_BREAK = /\b(as an ai|language model|i'?m an? (ai|artificial))\b/i;

const PHONE_SHAPE = /(?:\+?\d[\d\s\-()]{7,}\d)/g;

const MARKDOWN_LIST = /^[\s]*[-*+]\s+/m;
const MARKDOWN_HEADING = /^#{1,6}\s+/m;

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "to",
  "of",
  "and",
  "or",
  "is",
  "it",
  "in",
  "on",
  "for",
  "you",
  "your",
  "i",
  "me",
  "my",
  "that",
  "this",
  "with",
  "be",
  "as",
  "at",
  "do",
  "are",
  "was",
  "were",
]);

function sentenceCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const parts = trimmed.split(/[.!?]+/).filter((p) => p.trim().length > 0);
  return Math.max(parts.length, 1);
}

function normalizePhone(raw: string): string {
  return raw.replace(/\s+/g, "").replace(/[()\-]/g, "");
}

/** Tokenize for Jaccard similarity (anti-repetition). */
export function normalizeTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s']/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );
}

export function jaccardSimilarity(a: string, b: string): number {
  const ta = normalizeTokens(a);
  const tb = normalizeTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) {
    if (tb.has(t)) inter += 1;
  }
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

const REPETITION_THRESHOLD = 0.8;

/**
 * Deterministic post-generation safety scan.
 * Rejects clinical language, format violations, unapproved helplines, and near-duplicates.
 */
export function checkOutput(
  text: string,
  ctx?: GuardContext,
): GuardResult {
  const trimmed = text.trim();

  if (!trimmed) {
    return { ok: false, reason: "empty" };
  }

  if (trimmed.length > 400) {
    return { ok: false, reason: "too_long" };
  }

  if (sentenceCount(trimmed) > 3) {
    return { ok: false, reason: "too_many_sentences" };
  }

  if (MARKDOWN_LIST.test(trimmed) || MARKDOWN_HEADING.test(trimmed)) {
    return { ok: false, reason: "markdown_format" };
  }

  if (DIAGNOSIS_FRAME.test(trimmed)) {
    return { ok: false, reason: "diagnosis_frame" };
  }

  if (DIAGNOSIS_LABEL.test(trimmed)) {
    return { ok: false, reason: "diagnosis_label" };
  }

  if (MEDICATION.test(trimmed)) {
    return { ok: false, reason: "medication" };
  }

  if (/\bclinically\b/i.test(trimmed) || /\bdiagnos(e|is|ed|ing)\b/i.test(trimmed)) {
    return { ok: false, reason: "clinical_claim" };
  }

  if (PERSONA_BREAK.test(trimmed)) {
    return { ok: false, reason: "persona_break" };
  }

  const phones = trimmed.match(PHONE_SHAPE) ?? [];
  for (const phone of phones) {
    const normalized = normalizePhone(phone);
    const approved = [...APPROVED_NUMBERS].some(
      (n) => normalized.includes(n) || n.includes(normalized),
    );
    if (!approved) {
      return { ok: false, reason: "unapproved_helpline" };
    }
  }

  const recent = ctx?.recentBotTexts ?? [];
  for (const prev of recent) {
    if (jaccardSimilarity(trimmed, prev) >= REPETITION_THRESHOLD) {
      return { ok: false, reason: "repetition" };
    }
  }

  return { ok: true };
}

/** True if text shares a content token with any fact fragment. */
export function referencesFact(text: string, facts: string[]): boolean {
  if (facts.length === 0) return false;
  const textTokens = normalizeTokens(text);
  for (const fact of facts) {
    const factTokens = normalizeTokens(fact);
    for (const t of factTokens) {
      if (textTokens.has(t)) return true;
    }
  }
  return false;
}

export function containsQuestion(text: string): boolean {
  return text.includes("?");
}
