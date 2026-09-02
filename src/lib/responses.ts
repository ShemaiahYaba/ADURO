import flowsData from "@/data/flows.json";
import { HOPELESSNESS_CHECKIN } from "./constants";
import { isHopelessnessMessage } from "./safety";
import { getTemplateById } from "./templates";
import { hashString } from "./text-utils";
import type { Emotion } from "./types";

const FALLBACK_RESPONSES = [
  "I'm here to listen. Could you tell me more about how you're feeling?",
  "I want to understand better. What's been on your mind?",
];

export function pickTemplate(
  templateId: string,
  sessionId: string,
  messageIndex: number,
  userMessage?: string,
): { text: string; emotion: Emotion } {
  const template = getTemplateById(templateId);
  const pool = template?.responses?.length ? template.responses : FALLBACK_RESPONSES;
  const index = hashString(`${sessionId}:${templateId}:${messageIndex}`) % pool.length;
  let text = pool[index] ?? pool[0]!;

  const sadTemplates = new Set(["sad", "worthless", "depressed"]);
  if (
    userMessage &&
    isHopelessnessMessage(userMessage) &&
    sadTemplates.has(templateId)
  ) {
    text += HOPELESSNESS_CHECKIN;
  }

  return {
    text,
    emotion: template?.emotion ?? "neutral",
  };
}

export function pickRefusalResponse(): { text: string; emotion: Emotion } {
  return {
    text: "I'm not sure I understood that. I'm here for emotional support or general mental health questions — how can I help?",
    emotion: "neutral",
  };
}

export function lookupRationaleTemplate(
  lastBotAct: string,
  userAct: string,
): string | null {
  const flows = flowsData as {
    rationaleMap: Array<{ lastBotAct: string; userAct: string; templateId: string }>;
  };
  const hit = flows.rationaleMap.find(
    (r) => r.lastBotAct === lastBotAct && r.userAct === userAct,
  );
  return hit?.templateId ?? null;
}
