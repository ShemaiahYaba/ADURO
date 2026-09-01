import { emotionForTag, HOPELESSNESS_CHECKIN } from "./constants";
import { getIntentByTag } from "./intents";
import { isHopelessnessMessage } from "./safety";
import { hashString } from "./text-utils";
import type { Emotion } from "./types";

const FALLBACK_RESPONSES = [
  "I'm here to listen. Could you tell me more about how you're feeling?",
  "I want to understand better. What's been on your mind?",
];

export function pickResponse(
  tag: string,
  sessionId: string,
  messageIndex: number,
  userMessage?: string,
): { text: string; emotion: Emotion } {
  const intent = getIntentByTag(tag);
  const pool = intent?.responses?.length ? intent.responses : FALLBACK_RESPONSES;
  const index = hashString(`${sessionId}:${tag}:${messageIndex}`) % pool.length;
  let text = pool[index] ?? pool[0]!;

  if (
    userMessage &&
    isHopelessnessMessage(userMessage) &&
    (tag === "sad" || tag === "worthless" || tag === "depressed")
  ) {
    text += HOPELESSNESS_CHECKIN;
  }

  return { text, emotion: emotionForTag(tag) };
}

export function pickRefusalResponse(): { text: string; emotion: Emotion } {
  return {
    text: "I'm not sure I understood that. I'm here for emotional support or general mental health questions — how can I help?",
    emotion: "neutral",
  };
}
