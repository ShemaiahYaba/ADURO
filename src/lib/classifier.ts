import { generateText, Output } from "ai";
import { z } from "zod";
import { ROUTER_MIN_CONFIDENCE } from "./constants";
import { classifyOffline, inferStressFlowUserAct } from "./classifier-offline";
import { isOpenAiConfigured, routerModel } from "./openai";
import { getAllTemplates } from "./templates";
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
  templateId: z.string().optional(),
  topic: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

function templateHintList(): string {
  return getAllTemplates()
    .filter((t) => t.patterns.length > 0)
    .map((t) => t.id)
    .slice(0, 50)
    .join(", ");
}

function buildSystemPrompt(state: DialogueState): string {
  return `You classify user messages for Aduro, a supportive mental health chatbot.

Infer emotion, userAct, and optionally templateId from the latest user message AND conversation context.
Never diagnose. Never refuse in-scope emotional conversation as off_topic.

userAct meanings:
- social: greetings (including informal "heyyy aduro"), thanks, goodbye, small talk, bot questions
- disclose_feeling: shares or hints at feelings ("there's something", "not great", "on my mind")
- elaborate: explains context when continuing a conversation (work stress, family, etc.)
- accept_offer / decline_offer: yes/no to a bot suggestion
- ask_rationale: asks why (why meditation, why rest)
- express_doubt: skeptical (are you sure, really?)
- factual_question: mental health definition or fact question
- unknown: only when genuinely ambiguous after reading context

Guidelines:
- Read the full thread. Short replies often respond to the bot's last turn.
- "I'm good" after a greeting is social/happy, not off_topic.
- "but there's something though" after small talk is disclose_feeling — user wants to open up.
- Elongated greetings ("heyyy", "hiiii") with or without "aduro" are social.
- In an active support flow, prefer elaborate/accept/decline over unknown.
- Use off_topic only for clearly unrelated topics (sports scores, homework, recipes).
- templateId is optional; suggest one only when a canned template clearly fits (e.g. greeting, stressed, happy).

Dialogue state: flow=${state.activeFlow}, phase=${state.phase}, lastBotAct=${state.lastBotAct}

Known templateIds: ${templateHintList()}`;
}

function dedupeHistory(history: ChatTurn[], currentMessage: string): ChatTurn[] {
  const trimmed = currentMessage.trim().toLowerCase();
  const filtered = history.filter(
    (t) => !(t.role === "user" && t.content.trim().toLowerCase() === trimmed),
  );
  return filtered.slice(-6).map((t) => ({
    role: t.role,
    content: t.content.slice(0, 400),
  }));
}

function normalizeLlmClassification(
  output: z.infer<typeof classificationSchema>,
  state: DialogueState,
  message: string,
): Classification {
  let emotion = output.emotion as Emotion;
  let userAct = output.userAct as UserAct;

  if (state.activeFlow === "stress_support") {
    const flowAct = inferStressFlowUserAct(message, state.lastBotAct);
    if (
      userAct === "factual_question" ||
      userAct === "unknown" ||
      userAct === "social" ||
      emotion === "factual" ||
      emotion === "off_topic"
    ) {
      userAct = flowAct;
      emotion = "stress";
    }
  } else if (state.activeFlow !== "none") {
    if (userAct === "unknown") {
      userAct = "elaborate";
    }
    if (emotion === "off_topic") {
      emotion = "neutral";
    }
  }

  if (userAct === "unknown" && emotion === "off_topic") {
    userAct = "social";
    emotion = "neutral";
  }

  if (
    userAct === "unknown" &&
    (emotion === "neutral" || emotion === "happy" || emotion === "sadness")
  ) {
    userAct = "disclose_feeling";
  }

  return {
    emotion,
    userAct,
    templateId: output.templateId,
    topic: output.topic,
    confidence: output.confidence,
  };
}

async function classifyWithLlm(
  message: string,
  history: ChatTurn[],
  state: DialogueState,
): Promise<Classification> {
  const recent = dedupeHistory(history, message);

  const { output } = await generateText({
    model: routerModel(),
    system: buildSystemPrompt(state),
    messages: [
      ...recent.map((t) => ({
        role: t.role as "user" | "assistant",
        content: t.content,
      })),
      { role: "user" as const, content: message },
    ],
    output: Output.object({ schema: classificationSchema }),
  });

  if (!output || output.confidence < ROUTER_MIN_CONFIDENCE) {
    return classifyOffline(message, state);
  }

  return normalizeLlmClassification(output, state, message);
}

function applyActiveFlowContext(
  classification: Classification,
  message: string,
  state: DialogueState,
): Classification {
  if (state.activeFlow !== "stress_support") {
    return classification;
  }

  const flowAct = inferStressFlowUserAct(message, state.lastBotAct);
  return {
    ...classification,
    emotion: "stress",
    userAct: flowAct,
  };
}

export async function classify(
  message: string,
  history: ChatTurn[],
  state: DialogueState,
): Promise<Classification> {
  let classification: Classification;

  if (isOpenAiConfigured()) {
    try {
      classification = await classifyWithLlm(message, history, state);
    } catch {
      classification = classifyOffline(message, state);
    }
  } else {
    classification = classifyOffline(message, state);
  }

  return applyActiveFlowContext(classification, message, state);
}
