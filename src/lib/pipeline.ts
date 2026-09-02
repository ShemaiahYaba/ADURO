import { contextFollowUpMatch } from "./context-followup";
import {
  emotionForTag,
  GENERIC_REFUSAL,
  NO_INFO_RESPONSE,
} from "./constants";
import { isOpenAiConfigured } from "./openai";
import { isFactTag } from "./intents";
import { retrieveFact } from "./knowledge-base";
import { patternMatch } from "./pattern-match";
import {
  classifyRoute,
  ROUTER_EMOTION_MIN_CONFIDENCE,
} from "./router";
import { pickRefusalResponse, pickResponse } from "./responses";
import { checkSafety } from "./safety";
import type { ChatTurn, Emotion, PatternMatchResult, PipelineResult } from "./types";

const SHORT_MESSAGE_MAX_WORDS = 20;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function preferContextFollowUpFirst(message: string, history: ChatTurn[]): boolean {
  return history.length > 0 && wordCount(message) <= SHORT_MESSAGE_MAX_WORDS;
}

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

async function resolvePatternMatch(
  pattern: PatternMatchResult & { matched: true },
  message: string,
  sessionId: string,
  messageIndex: number,
): Promise<PipelineResult> {
  return resolveFromTag(pattern.tag, message, sessionId, messageIndex);
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

  const contextFirst = preferContextFollowUpFirst(message, history);

  if (contextFirst) {
    const followUp = contextFollowUpMatch(message, history);
    if (followUp?.matched) {
      return resolveFromTag(followUp.tag, message, sessionId, messageIndex);
    }

    const pattern = patternMatch(message);
    if (pattern.matched) {
      return resolvePatternMatch(pattern, message, sessionId, messageIndex);
    }
  } else {
    const pattern = patternMatch(message);
    if (pattern.matched) {
      return resolvePatternMatch(pattern, message, sessionId, messageIndex);
    }

    const followUp = contextFollowUpMatch(message, history);
    if (followUp?.matched) {
      return resolveFromTag(followUp.tag, message, sessionId, messageIndex);
    }
  }

  if (!isOpenAiConfigured()) {
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

  const resolved = await resolveFromTag(
    route.intentTag,
    message,
    sessionId,
    messageIndex,
  );

  if (route.confidence >= ROUTER_EMOTION_MIN_CONFIDENCE) {
    return { text: resolved.text, emotion: route.emotion };
  }

  return {
    text: resolved.text,
    emotion: emotionForTag(route.intentTag),
  };
}
