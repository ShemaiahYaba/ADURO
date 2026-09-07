import { isClosingMessage } from "./safety";
import {
  emotionHintFromFacts,
  extractSituationFacts,
  looksLikeEmotionalSituation,
} from "./situation-facts";
import { normalizeMisspellings } from "./spell-normalize";
import { getTemplateById } from "./templates";
import { patternMatch } from "./pattern-match";
import type { Classification, DialogueState, Emotion, UserAct } from "./types";

function extractOfflineFacts(message: string): string[] {
  return extractSituationFacts(message);
}

/** Contextual acts for short mid-conversation replies. */
export function inferContextualUserAct(
  message: string,
  lastBotAct: string,
): UserAct {
  const msg = message.trim().toLowerCase();
  const short = msg.split(/\s+/).length <= 10;

  if (
    /\b(what\s+should\s+i\s+do|what\s+do\s+you\s+think\s+i\s+should|what\s+do\s+i\s+do)\b/.test(
      msg,
    )
  ) {
    return "request_advice";
  }
  if (
    /\bwhy\s+(exactly\s+)?(she|he|they|did|would|wouldn'?t)\b/.test(msg) ||
    /\bwhy\s+exactly\b/.test(msg)
  ) {
    return "ask_about_situation";
  }
  if (
    /\b(i\s+(really\s+)?don'?t\s+know|i'?m\s+not\s+(exactly\s+)?sure|not\s+sure|no\s+idea)\b/.test(
      msg,
    )
  ) {
    return "express_uncertainty";
  }
  if (
    short &&
    /\b(ice\s*cream|pizza|whatever|idk|lol|lmao|haha|nothing)\b/.test(msg)
  ) {
    return "deflect";
  }
  if (/\b(are you sure|you sure)\b/.test(msg)) {
    return "express_doubt";
  }
  if (/\b(why|how come)\b/.test(msg) && short) {
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
  if (
    lastBotAct === "asked_cause" ||
    lastBotAct === "suggested_break" ||
    lastBotAct === "explore" ||
    lastBotAct === "validate" ||
    lastBotAct === "reflect"
  ) {
    return "elaborate";
  }
  return "elaborate";
}

/** @deprecated alias */
export function inferStressFlowUserAct(
  message: string,
  lastBotAct: string,
): UserAct {
  return inferContextualUserAct(message, lastBotAct);
}

export function classifyOffline(
  message: string,
  state: DialogueState,
): Classification {
  const normalized = normalizeMisspellings(message);
  const facts = extractOfflineFacts(normalized);
  const contextual = inferContextualUserAct(normalized, state.lastBotAct);

  if (isClosingMessage(normalized)) {
    return {
      emotion: "neutral",
      userAct: "social",
      facts: [],
      templateId: "goodbye",
      confidence: 0.85,
    };
  }

  // Mid-arc short replies: prefer contextual acts
  if (state.arc !== "opening" && message.trim().split(/\s+/).length <= 12) {
    if (
      [
        "request_advice",
        "ask_about_situation",
        "express_uncertainty",
        "deflect",
        "express_doubt",
        "ask_rationale",
        "accept_offer",
        "decline_offer",
        "elaborate",
      ].includes(contextual)
    ) {
      const pooled = [...state.facts, ...facts];
      return {
        emotion: emotionHintFromFacts(pooled),
        userAct: contextual,
        facts,
        confidence: 0.7,
      };
    }
  }

  const match = patternMatch(normalized);
  if (match.matched) {
    const emotionalFacts = looksLikeEmotionalSituation(facts);
    if (
      emotionalFacts &&
      match.routeType === "conversational" &&
      match.templateId !== "greeting" &&
      match.templateId !== "morning" &&
      match.templateId !== "thanks"
    ) {
      // Check advice request inside emotional message
      if (contextual === "request_advice") {
        return {
          emotion: emotionHintFromFacts(facts),
          userAct: "request_advice",
          facts,
          confidence: 0.75,
        };
      }
      return {
        emotion: emotionHintFromFacts(facts),
        userAct: "disclose_feeling",
        facts,
        confidence: Math.max(match.confidence, 0.6),
      };
    }

    if (match.routeType === "factual") {
      return {
        emotion: "factual",
        userAct: "factual_question",
        facts,
        templateId: match.templateId,
        confidence: match.confidence,
      };
    }

    if (match.routeType === "conversational") {
      return {
        emotion: (getTemplateById(match.templateId)?.emotion ??
          "neutral") as Emotion,
        userAct: "social",
        facts,
        templateId: match.templateId,
        confidence: match.confidence,
      };
    }

    return {
      emotion: (getTemplateById(match.templateId)?.emotion ??
        "neutral") as Emotion,
      userAct:
        contextual === "request_advice" ? "request_advice" : "disclose_feeling",
      facts,
      templateId: match.templateId,
      confidence: match.confidence,
    };
  }

  if (contextual === "request_advice") {
    return {
      emotion: emotionHintFromFacts(facts),
      userAct: "request_advice",
      facts,
      confidence: 0.65,
    };
  }

  if (
    facts.length > 0 ||
    /\b(sad|hurt|pain|heart|cheat|broke|angry|lonely|overwhelmed|jaded)\b/i.test(
      message,
    )
  ) {
    return {
      emotion: emotionHintFromFacts(facts),
      userAct: "disclose_feeling",
      facts: facts.length > 0 ? facts : extractOfflineFacts(message),
      confidence: 0.55,
    };
  }

  return {
    emotion: "neutral",
    userAct: "unknown",
    facts: [],
    confidence: 0.2,
  };
}

/** @deprecated */
export function classifyOfflineInStressFlow(
  message: string,
  state: DialogueState,
): Classification {
  return {
    emotion: "stress",
    userAct: inferContextualUserAct(message, state.lastBotAct),
    facts: extractOfflineFacts(message),
    confidence: 0.65,
  };
}
