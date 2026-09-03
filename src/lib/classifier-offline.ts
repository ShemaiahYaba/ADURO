import { getTemplateById } from "./templates";
import { patternMatch } from "./pattern-match";
import type { Classification, DialogueState, Emotion, UserAct } from "./types";

/**
 * Degraded classifier used only when OPENAI_API_KEY is not set (e.g. CI).
 * Production traffic should always use the LLM path in classifier.ts.
 */
function extractOfflineFacts(message: string): string[] {
  const facts: string[] = [];
  const msg = message.toLowerCase();

  if (/\b(cheat(ed|ing)?|unfaithful|affair)\b/.test(msg)) {
    facts.push("partner was unfaithful");
  }
  if (/\b(broke\s*up|break\s*up|breakup|dumped|left\s+me)\b/.test(msg)) {
    facts.push("went through a breakup");
  }
  if (/\b(babe|girlfriend|boyfriend|partner|wife|husband)\b/.test(msg)) {
    if (!facts.some((f) => f.includes("breakup") || f.includes("unfaithful"))) {
      facts.push("relationship trouble");
    }
  }
  if (/\b(exam|school|study|assignment)\b/.test(msg)) {
    facts.push("academic pressure");
  }
  if (/\b(work|job|overtime|boss|shift)\b/.test(msg)) {
    facts.push("work stress");
  }
  if (/\b(anxious|anxiety|uneasy)\b/.test(msg)) {
    facts.push("feeling anxious");
  }
  if (/\b(sad|lonely|empty|down)\b/.test(msg)) {
    facts.push("feeling sad");
  }

  return facts.slice(0, 3);
}

export function classifyOffline(
  message: string,
  state: DialogueState,
): Classification {
  if (state.activeFlow === "stress_support") {
    return classifyOfflineInStressFlow(message, state);
  }

  const facts = extractOfflineFacts(message);
  const match = patternMatch(message);
  if (match.matched) {
    // Emotional content (breakup, cheat, etc.) must not be swallowed by
    // weak conversational matches like "done" / "that's all".
    const emotionalFacts = facts.some((f) =>
      /unfaithful|breakup|relationship|anxious|sad|work|academic/i.test(f),
    );
    if (
      emotionalFacts &&
      match.routeType === "conversational" &&
      match.templateId !== "greeting" &&
      match.templateId !== "morning" &&
      match.templateId !== "thanks"
    ) {
      return {
        emotion: facts.some((f) => f.includes("anxious"))
          ? "anxiety"
          : facts.some((f) => f.includes("work") || f.includes("academic"))
            ? "stress"
            : "sadness",
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
      userAct: "disclose_feeling",
      facts,
      templateId: match.templateId,
      confidence: match.confidence,
    };
  }

  // Heuristic: emotional disclosure without pattern match
  if (facts.length > 0 || /\b(sad|hurt|pain|heart|cheat|broke)\b/i.test(message)) {
    return {
      emotion: facts.some((f) => f.includes("anxious"))
        ? "anxiety"
        : facts.some((f) => f.includes("work") || f.includes("academic"))
          ? "stress"
          : "sadness",
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
    facts: extractOfflineFacts(message),
    confidence: 0.65,
  };
}

export function inferStressFlowUserAct(
  message: string,
  lastBotAct: string,
): UserAct {
  return inferStressFlowAct(message, lastBotAct);
}
