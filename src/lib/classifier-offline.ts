import { getTemplateById } from "./templates";
import { patternMatch } from "./pattern-match";
import type { Classification, DialogueState, Emotion, UserAct } from "./types";

/**
 * Degraded classifier used only when OPENAI_API_KEY is not set (e.g. CI).
 * Production traffic should always use the LLM path in classifier.ts.
 */
export function classifyOffline(
  message: string,
  state: DialogueState,
): Classification {
  if (state.activeFlow === "stress_support") {
    return classifyOfflineInStressFlow(message, state);
  }

  const match = patternMatch(message);
  if (match.matched) {
    if (match.routeType === "factual") {
      return {
        emotion: "factual",
        userAct: "factual_question",
        templateId: match.templateId,
        confidence: match.confidence,
      };
    }

    if (match.routeType === "conversational") {
      return {
        emotion: (getTemplateById(match.templateId)?.emotion ?? "neutral") as Emotion,
        userAct: "social",
        templateId: match.templateId,
        confidence: match.confidence,
      };
    }

    return {
      emotion: (getTemplateById(match.templateId)?.emotion ?? "neutral") as Emotion,
      userAct: "disclose_feeling",
      templateId: match.templateId,
      confidence: match.confidence,
    };
  }

  return {
    emotion: "neutral",
    userAct: "unknown",
    confidence: 0.2,
  };
}

function inferStressFlowAct(message: string, lastBotAct: string): UserAct {
  const msg = message.trim().toLowerCase();
  const short = msg.split(/\s+/).length <= 8;

  if (/\b(are you sure|you sure)\b/.test(msg)) {
    return "express_doubt";
  }
  if (/\b(why|how come)\b/.test(msg)) {
    return "ask_rationale";
  }
  if (short && /\b(not really|nah|nope)\b/.test(msg)) {
    return "decline_offer";
  }
  if (short && /^(no|nope)\b/.test(msg)) {
    return "decline_offer";
  }
  if (/\breally\??\b/.test(msg) && short) {
    return "express_doubt";
  }
  if (
    short &&
    /\b(yes|yeah|yep|ok|okay|please|absolutely)\b/.test(msg) &&
    !/\b(sure|really)\b/.test(msg)
  ) {
    return "accept_offer";
  }
  if (lastBotAct === "asked_cause" || lastBotAct === "suggested_break") {
    return "elaborate";
  }
  return "elaborate";
}

export function classifyOfflineInStressFlow(
  message: string,
  state: DialogueState,
): Classification {
  return {
    emotion: "stress",
    userAct: inferStressFlowAct(message, state.lastBotAct),
    confidence: 0.65,
  };
}

export function inferStressFlowUserAct(
  message: string,
  lastBotAct: string,
): UserAct {
  return inferStressFlowAct(message, lastBotAct);
}
