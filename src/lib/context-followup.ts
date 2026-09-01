import { getRouteTypeForTag } from "./intents";
import type { ChatTurn, PatternMatchResult } from "./types";

const SHORT_MESSAGE_MAX_WORDS = 20;

function lastAssistantTurn(history: ChatTurn[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "assistant") {
      return history[i]!.content;
    }
  }
  return null;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Offline routing for short follow-ups when the LLM router is unavailable.
 * Uses the last assistant turn only — no model call.
 */
export function contextFollowUpMatch(
  message: string,
  history: ChatTurn[],
): PatternMatchResult | null {
  if (history.length === 0) return null;

  const lastAssistant = lastAssistantTurn(history);
  if (!lastAssistant) return null;

  const msg = message.trim();
  if (!msg || wordCount(msg) > SHORT_MESSAGE_MAX_WORDS) return null;

  const last = lastAssistant.toLowerCase();
  const askedQuestion = last.includes("?");

  if (!askedQuestion && !isAffirmationOrDoubt(msg)) {
    return null;
  }

  if (isStressProbe(last)) {
    return matchStressFollowUp(msg);
  }

  if (isLearnMoreOffer(last)) {
    if (/\b(yes|yeah|sure|ok|please|i would|learn more)\b/i.test(msg)) {
      return tagResult("learn-more");
    }
    if (/\b(no|not really|nah|i guess not)\b/i.test(msg)) {
      return tagResult("no-approach");
    }
  }

  if (isMeditationThread(last)) {
    if (/\b(better|helped|thank|thanks|feel\s+(a\s+)?lot\s+better)\b/i.test(msg)) {
      return tagResult("user-meditation");
    }
    if (/\b(you'?re right|yeah|absolutely|true)\b/i.test(msg)) {
      return tagResult("user-agree");
    }
  }

  if (isAffirmationOrDoubt(msg) && isReassurance(last)) {
    return tagResult("casual");
  }

  if (askedQuestion && wordCount(msg) <= 12) {
    return tagResult("default");
  }

  return null;
}

function tagResult(tag: string): PatternMatchResult {
  return {
    matched: true,
    tag,
    routeType: getRouteTypeForTag(tag),
    confidence: 0.8,
  };
}

function isStressProbe(last: string): boolean {
  return (
    last.includes("reason behind") ||
    last.includes("causing this") ||
    last.includes("what do you think") ||
    last.includes("tell me why") ||
    last.includes("what is the reason")
  );
}

function isLearnMoreOffer(last: string): boolean {
  return last.includes("learn more") || last.includes("would you like");
}

function isMeditationThread(last: string): boolean {
  return last.includes("meditation") || last.includes("give yourself a break");
}

function isReassurance(last: string): boolean {
  return (
    last.includes("all be okay") ||
    last.includes("only momentary") ||
    last.includes("here for you")
  );
}

function isAffirmationOrDoubt(msg: string): boolean {
  return /\b(you sure|sure\??|really\??|ok\??|okay\??)\b/i.test(msg);
}

function matchStressFollowUp(msg: string): PatternMatchResult {
  if (/\b(work|job|overtime|shift|boss|exam|school|study|money|family|relationship|deadline)\b/i.test(msg)) {
    return tagResult("problem");
  }
  if (/\b(not really|i guess not|nah|no)\b/i.test(msg)) {
    return tagResult("no-approach");
  }
  return tagResult("default");
}
