/**
 * Detect mental-health / emotional education asks so policy can answer
 * instead of only reflecting.
 */

const WELLNESS_TOPIC =
  String.raw`(emotion|emotions|feeling|feelings|mood|anxiety|anxious|stress|stressed|depression|depressed|grief|burnout|trauma|loneliness|lonely|self[- ]?esteem|mental\s+health|coping|wellbeing|well-being|happiness|anger|fear|panic|overwhelm|jaded)`;

const EDUCATION_FRAMES: RegExp[] = [
  new RegExp(
    String.raw`\b(define|definition\s+of|what\s+(is|are|does)|explain|tell\s+me\s+about|meaning\s+of)\s+(${WELLNESS_TOPIC})\b`,
    "i",
  ),
  new RegExp(
    String.raw`\b(can\s+you\s+)?(define|explain)\s+(${WELLNESS_TOPIC})\b`,
    "i",
  ),
  new RegExp(
    String.raw`\bhow\s+does\s+(${WELLNESS_TOPIC})\s+(work|feel|affect)`,
    "i",
  ),
  new RegExp(
    String.raw`\bwhat\s+causes\s+(feeling\s+)?(${WELLNESS_TOPIC})\b`,
    "i",
  ),
];

export function isWellnessEducationAsk(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  return EDUCATION_FRAMES.some((p) => p.test(trimmed));
}

/** Short replies that continue a thread rather than start a new task. */
export function isShortContinuation(message: string): boolean {
  const words = message.trim().split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 6;
}

const WELLNESS_HISTORY_CUES =
  /\b(emotion|feel|feeling|anxiety|depress|stress|mental|burnout|grief|lonely|sad|cope|wellness|mood|define|hurt|heart|breakup|broke\s+up|jaded|heavy|curious)\b/i;

/** Recent turns suggest we are already in a wellness conversation. */
export function historySuggestsWellnessThread(
  history: Array<{ role: string; content: string }>,
): boolean {
  if (history.length === 0) return false;
  const recent = history
    .slice(-4)
    .map((t) => t.content)
    .join(" ");
  return WELLNESS_HISTORY_CUES.test(recent);
}
