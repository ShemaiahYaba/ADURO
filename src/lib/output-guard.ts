import { HELPLINES } from "./constants";

export type GuardResult = { ok: true } | { ok: false; reason: string };

const APPROVED_NUMBERS = new Set(
  Object.values(HELPLINES).map((h) => h.number.replace(/\s+/g, "")),
);

const DIAGNOSIS_FRAME =
  /\byou\s+(have|might\s+have|may\s+have|are\s+suffering\s+from|suffer\s+from)\b/i;

const DISORDER_DIAGNOSTIC =
  /\b(you\s+(have|might\s+have|may\s+have)\s+)?(depression|anxiety\s+disorder|bipolar|ptsd|ocd|schizophrenia|adhd)\b/i;

const MEDICATION =
  /\b(medication|medications|prescri(be|ption|bed)|dosage|antidepressant|ssri|prozac|zoloft|xanax|valium)\b/i;

const CLINICAL_CLAIM = /\b(clinically|diagnos(e|is|ed|ing)|disorder)\b/i;

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

  if (DISORDER_DIAGNOSTIC.test(trimmed) && DIAGNOSIS_FRAME.test(trimmed)) {
    return { ok: false, reason: "disorder_diagnosis" };
  }

  if (MEDICATION.test(trimmed)) {
    return { ok: false, reason: "medication" };
  }

  // "disorder" / "diagnos*" in a diagnostic frame — allow casual mentions
  // like "mental health" but block "clinically diagnosed"
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

  // Soft check: "disorder" alone in diagnostic-ish context
  if (CLINICAL_CLAIM.test(trimmed) && /\byou\b/i.test(trimmed)) {
    if (/\b(disorder|diagnos)/i.test(trimmed)) {
      return { ok: false, reason: "clinical_claim" };
    }
  }

  return { ok: true };
}
