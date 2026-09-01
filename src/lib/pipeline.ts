import { contextFollowUpMatch } from "./context-followup";
import {
  GENERIC_REFUSAL,
  NO_INFO_RESPONSE,
} from "./constants";
import { isGatewayConfigured } from "./gateway";
import { isFactTag } from "./intents";
import { retrieveFact } from "./knowledge-base";
import { patternMatch } from "./pattern-match";
import { classifyRoute } from "./router";
import { pickRefusalResponse, pickResponse } from "./responses";
import { checkSafety } from "./safety";
import type { ChatTurn, PipelineResult } from "./types";

async function resolveFromTag(
  tag: string,
  message: string,
  sessionId: string,
  messageIndex: number,
): Promise<PipelineResult> {
  if (isFactTag(tag)) {
    const fact = await retrieveFact(message);
    if (fact) return fact;
    return { text: NO_INFO_RESPONSE, emotion: "factual" };
  }

  const { text, emotion } = pickResponse(tag, sessionId, messageIndex, message);
  return { text, emotion };
}

export async function runPipeline(
  message: string,
  sessionId: string,
  messageIndex: number,
  history: ChatTurn[] = [],
): Promise<PipelineResult> {
  const safety = checkSafety(message);
  if (safety.handled) {
    return { text: safety.text, emotion: safety.emotion };
  }

  const pattern = patternMatch(message);
  if (pattern.matched) {
    return resolveFromTag(pattern.tag, message, sessionId, messageIndex);
  }

  const followUp = contextFollowUpMatch(message, history);
  if (followUp?.matched) {
    return resolveFromTag(followUp.tag, message, sessionId, messageIndex);
  }

  if (!isGatewayConfigured()) {
    const refusal = pickRefusalResponse();
    return { text: refusal.text, emotion: refusal.emotion };
  }

  const route = await classifyRoute(message, history);
  if (!route || route.routeType === "unknown") {
    const hasMhVocab =
      /\b(feel|feeling|anxious|anxiety|stress|sad|depress|mental|therapy|emotion)\b/i.test(
        message,
      );
    if (hasMhVocab) {
      return { text: NO_INFO_RESPONSE, emotion: "neutral" };
    }
    return { text: GENERIC_REFUSAL, emotion: "off_topic" };
  }

  if (route.routeType === "factual") {
    const fact = await retrieveFact(message);
    if (fact) return fact;
    return { text: NO_INFO_RESPONSE, emotion: "factual" };
  }

  return resolveFromTag(route.intentTag, message, sessionId, messageIndex);
}
