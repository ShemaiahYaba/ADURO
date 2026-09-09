/**
 * Lightweight typo normalization for safety and pattern matching.
 * Whole-word replacements only — avoids changing meaning of valid words.
 */
const WORD_FIXES: Array<[RegExp, string]> = [
  [/\bsucidal\b/gi, "suicidal"],
  [/\bsuicidle\b/gi, "suicidal"],
  [/\bsucide\b/gi, "suicide"],
  [/\bkilll+\b/gi, "kill"],
  [/\bcommitt+\b/gi, "commit"],
  [/\banxeity\b/gi, "anxiety"],
  [/\banxity\b/gi, "anxiety"],
  [/\bdepresed\b/gi, "depressed"],
  [/\bdepressd\b/gi, "depressed"],
  [/\bhopless\b/gi, "hopeless"],
  [/\bhopeles\b/gi, "hopeless"],
  [/\bthinkng\b/gi, "thinking"],
  [/\bthiking\b/gi, "thinking"],
];

export function normalizeMisspellings(text: string): string {
  let result = text;
  for (const [pattern, replacement] of WORD_FIXES) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/** Rough token estimate for prompt budgeting (~4 chars per token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
