import { generateText, Output } from "ai";
import { z } from "zod";
import { ROUTER_MIN_CONFIDENCE } from "./constants";
import { isOpenAiConfigured, routerModel } from "./openai";
import { patternMatch } from "./pattern-match";
import { getTemplateById } from "./templates";
import type { ChatTurn, Classification, DialogueState, Emotion, UserAct } from "./types";

const emotionSchema = z.enum([
  "sadness",
  "anger",
  "anxiety",
  "stress",
  "support",
  "neutral",
  "crisis",
  "factual",
  "off_topic",
  "happy",
  "grief",
]);

const userActSchema = z.enum([
  "disclose_feeling",
  "elaborate",
  "accept_offer",
  "decline_offer",
  "ask_rationale",
  "express_doubt",
  "factual_question",
  "social",
  "unknown",
]);

const classificationSchema = z.object({
  emotion: emotionSchema,
  userAct: userActSchema,
  topic: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

function detectUserAct(message: string, state: DialogueState): UserAct {
  const msg = message.trim().toLowerCase();

  if (/\b(why|how come|what do you mean|explain)\b/i.test(msg)) {
    if (/\b(meditation|break|rest)\b/i.test(msg)) return "ask_rationale";
    if (state.lastBotAct !== "none") return "ask_rationale";
  }

  if (/\b(no|not really|nah|i guess not|nope)\b/i.test(msg)) {
    return "decline_offer";
  }

  if (/\b(are you sure|you sure|really\??|sure\??)\b/i.test(msg)) {
    return "express_doubt";
  }

  if (
    /\b(yes|yeah|yep|ok|okay|please|i would|learn more|absolutely|you'?re right)\b/i.test(
      msg,
    ) &&
    msg.split(/\s+/).length <= 12
  ) {
    return "accept_offer";
  }

  if (
    /\b(work|job|overtime|shift|boss|exam|school|study|money|family|relationship|deadline|because)\b/i.test(
      msg,
    )
  ) {
    return "elaborate";
  }

  if (/\b(feel|feeling|felt|stress|anxious|sad|tired|overwhelm)\b/i.test(msg)) {
    return "disclose_feeling";
  }

  return "unknown";
}

function classificationFromPattern(
  message: string,
  state: DialogueState,
): Classification | null {
  const match = patternMatch(message);
  if (!match.matched) return null;

  const act = detectUserAct(message, state);
  let userAct: UserAct = act;

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
      emotion: getTemplateById(match.templateId)?.emotion ?? "neutral",
      userAct: "social",
      templateId: match.templateId,
      confidence: match.confidence,
    };
  }

  if (userAct === "unknown") {
    userAct = "disclose_feeling";
  }

  return {
    emotion: getTemplateById(match.templateId)?.emotion ?? "neutral",
    userAct,
    templateId: match.templateId,
    confidence: match.confidence,
  };
}

function classificationFromHeuristics(
  message: string,
  state: DialogueState,
): Classification {
  const userAct = detectUserAct(message, state);
  const hasMh =
    /\b(feel|feeling|stress|anxious|anxiety|sad|tired|mental|overwhelm)\b/i.test(
      message,
    );

  if (userAct === "ask_rationale" || userAct === "express_doubt") {
    return {
      emotion: "stress",
      userAct,
      confidence: 0.75,
    };
  }

  if (userAct === "decline_offer" || userAct === "accept_offer") {
    return {
      emotion: "stress",
      userAct,
      confidence: 0.7,
    };
  }

  if (userAct === "elaborate") {
    return {
      emotion: "stress",
      userAct: "elaborate",
      confidence: 0.7,
    };
  }

  if (hasMh) {
    return {
      emotion: "stress",
      userAct: userAct === "unknown" ? "disclose_feeling" : userAct,
      confidence: 0.6,
    };
  }

  return {
    emotion: "neutral",
    userAct: "unknown",
    confidence: 0.3,
  };
}

function dedupeHistory(history: ChatTurn[], currentMessage: string): ChatTurn[] {
  const trimmed = currentMessage.trim().toLowerCase();
  const filtered = history.filter(
    (t) => !(t.role === "user" && t.content.trim().toLowerCase() === trimmed),
  );
  return filtered.slice(-4).map((t) => ({
    role: t.role,
    content: t.content.slice(0, 300),
  }));
}

async function classifyOnline(
  message: string,
  history: ChatTurn[],
  state: DialogueState,
): Promise<Classification | null> {
  const recent = dedupeHistory(history, message);

  try {
    const { output } = await generateText({
      model: routerModel(),
      system: `You classify user messages for Aduro, a mental health support chatbot.
Return emotion and userAct only. Never diagnose.

userAct meanings:
- disclose_feeling: shares emotional state
- elaborate: explains cause/context (work, exams, etc.)
- accept_offer: agrees to a suggestion
- decline_offer: declines (not really, no)
- ask_rationale: asks why (why meditation, why rest)
- express_doubt: skeptical (are you sure, really)
- factual_question: mental health definition/fact question
- social: greeting, thanks, goodbye, about bot
- unknown: unclear

Current dialogue: flow=${state.activeFlow}, phase=${state.phase}, lastBotAct=${state.lastBotAct}`,
      messages: [
        ...recent.map((t) => ({
          role: t.role as "user" | "assistant",
          content: t.content,
        })),
        { role: "user" as const, content: message },
      ],
      output: Output.object({ schema: classificationSchema }),
    });

    if (!output || output.confidence < ROUTER_MIN_CONFIDENCE) return null;

    return {
      emotion: output.emotion as Emotion,
      userAct: output.userAct as UserAct,
      topic: output.topic,
      confidence: output.confidence,
    };
  } catch {
    return null;
  }
}

export async function classify(
  message: string,
  history: ChatTurn[],
  state: DialogueState,
): Promise<Classification> {
  const act = detectUserAct(message, state);
  const strongActs: UserAct[] = [
    "decline_offer",
    "accept_offer",
    "ask_rationale",
    "express_doubt",
    "elaborate",
  ];
  if (strongActs.includes(act)) {
    const heuristic = classificationFromHeuristics(message, state);
    heuristic.userAct = act;
    return heuristic;
  }

  const fromPattern = classificationFromPattern(message, state);
  if (fromPattern && fromPattern.confidence >= 0.55) {
    const act = detectUserAct(message, state);
    if (act !== "unknown") {
      fromPattern.userAct = act;
    }
    return fromPattern;
  }

  if (isOpenAiConfigured()) {
    const online = await classifyOnline(message, history, state);
    if (online) {
      if (fromPattern?.templateId) {
        online.templateId = fromPattern.templateId;
      }
      return online;
    }
  }

  if (fromPattern) return fromPattern;

  return classificationFromHeuristics(message, state);
}
