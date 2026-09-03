import { HELPLINES } from "./constants";

export type GuardResult = { ok: true } | { ok: false; reason: string };

const APPROVED_NUMBERS = new Set(
  Object.values(HELPLINES).map((h) => h.number.replace(/\s+/g, "")),
);

const DISORDER = String.raw`(?:depression|depressive\s+disorder|anxiety\s+disorder|generali[sz]ed\s+anxiety|bipolar(?:\s+disorder)?|ptsd|ocd|schizophrenia|adhd|mental\s+illness|disorder)`;

/**
 * A diagnosis needs a diagnostic frame AND a named condition. Matching the
 * frame alone rejects ordinary validation — "you have every right to feel
 * hurt", "you have been through a lot" — which are the phrasings this domain
 * leans on most.
 */
const DIAGNOSIS_FRAME = new RegExp(
  String.raw`\byou\s+(?:have|might\s+have|may\s+have|probably\s+have|likely\s+have|do\s+have|are\s+suffering\s+from|suffer\s+from|'?re\s+dealing\s+with)\s+(?:a\s+|an\s+|some\s+|clinical\s+)?(?:\w+\s+){0,2}` +
    DISORDER,
  "i",
);

/** Direct labelling: "you're depressed", "you sound bipolar". */
const DIAGNOSIS_LABEL =
  /\byou(?:\s+are|'?re|\s+sound|\s+seem|\s+must\s+be)\s+(?:clinically\s+)?(?:depressed|bipolar|schizophrenic|psychotic|mentally\s+ill)\b/i;

const MEDICATION =
  /\b(medication|medications|prescri(be|ption|bed)|dosage|antidepressant|ssri|prozac|zoloft|xanax|valium)\b/i;

const PERSONA_BREAK = /\b(as an ai|language model|i'?m an? (ai|artificial))\b/i;

const PHONE_SHAPE = /(?:\+?\d[\d\s\-()]{7,}\d)/g;

const MARKDOWN_LIST = /^[\s]*[-*+]\s+/m;
const MARKDOWN_HEADING = /^#{1,6}\s+/m;

function sentenceCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const parts = trimmed.split(/[.!?]+/).filter((p) => p.trim().length > 0);
  return Math.max(parts.length, 1);
}

function normalizePhone(raw: string): string {
  return raw.replace(/\s+/g, "").replace(/[()\-]/g, "");
}

/**
 * Deterministic post-generation safety scan.
 * Rejects clinical language, format violations, and unapproved helplines.
 */
export function checkOutput(text: string): GuardResult {
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

  // Bare condition names are fine ("depression is common"); asserting a
  // clinical judgement is not.
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

  return { ok: true };
}
