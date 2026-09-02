/** Flow transition tags — response buckets only, never classifier labels. */
export const FLOW_TRANSITION_TAGS = new Set([
  "problem",
  "no-approach",
  "learn-more",
  "user-agree",
  "meditation",
  "user-meditation",
  "aduro-useful",
]);

/** Tags excluded from pattern-match TF-IDF index and LLM router vocabulary. */
export const CLASSIFIER_EXCLUDED_TAGS = new Set([
  ...FLOW_TRANSITION_TAGS,
  "default",
]);

export function isClassifierTag(tag: string): boolean {
  return !CLASSIFIER_EXCLUDED_TAGS.has(tag);
}

export function isFlowTransitionTag(tag: string): boolean {
  return FLOW_TRANSITION_TAGS.has(tag);
}
