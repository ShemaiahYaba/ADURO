import { generateText, Output } from "ai";
import { z } from "zod";
import { emotionForTag, GENERIC_REFUSAL, ROUTER_MIN_CONFIDENCE } from "./constants";
import { isOpenAiConfigured, routerModel } from "./openai";
import { getAllIntents } from "./intents";
import type { ChatTurn, Emotion, RouteResult } from "./types";

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

const routeSchema = z.object({
  intentTag: z.string(),
  routeType: z.enum(["emotional", "factual", "conversational", "unknown"]),
  emotion: emotionSchema,
  confidence: z.number().min(0).max(1),
});

function buildRouterSystemPrompt(): string {
  const tags = getAllIntents()
    .map((i) => `- ${i.tag}: ${i.patterns.slice(0, 2).join("; ")}`)
    .join("\n");

  return `You are an intent classifier for Aduro, a mental health support chatbot.
Classify the user's latest message into one intent tag from the list below.
Use conversation history to disambiguate short follow-ups like "not really", "yeah you're right", or "I feel better now".

Rules:
- Never diagnose. Never invent facts.
- factual routeType for mental health definition questions (fact-* tags).
- emotional for feelings, stress, anxiety, sadness, grief.
- conversational for greetings, thanks, goodbye, about Aduro.
- unknown if truly unclear.

Intent tags:
${tags}`;
}

function dedupeHistory(
  history: ChatTurn[],
  currentMessage: string,
): ChatTurn[] {
  const trimmed = currentMessage.trim().toLowerCase();
  const filtered = history.filter(
    (t) => !(t.role === "user" && t.content.trim().toLowerCase() === trimmed),
  );
  return filtered.slice(-4).map((t) => ({
    role: t.role,
    content: t.content.slice(0, 300),
  }));
}

export async function classifyRoute(
  message: string,
  history: ChatTurn[],
): Promise<RouteResult | null> {
  if (!isOpenAiConfigured()) {
    return null;
  }

  const recent = dedupeHistory(history, message);

  try {
    const { output } = await generateText({
      model: routerModel(),
      system: buildRouterSystemPrompt(),
      messages: [
        ...recent.map((t) => ({
          role: t.role as "user" | "assistant",
          content: t.content,
        })),
        { role: "user" as const, content: message },
      ],
      output: Output.object({ schema: routeSchema }),
    });

    if (!output) return null;

    if (
      output.confidence < ROUTER_MIN_CONFIDENCE ||
      output.routeType === "unknown"
    ) {
      return {
        intentTag: "default",
        routeType: "unknown",
        emotion: "neutral",
        confidence: output.confidence,
      };
    }

    return {
      intentTag: output.intentTag,
      routeType: output.routeType,
      emotion: output.emotion as Emotion,
      confidence: output.confidence,
    };
  } catch {
    return null;
  }
}

export function routeResultToEmotion(tag: string, fallback: Emotion): Emotion {
  return emotionForTag(tag) !== "neutral" ? emotionForTag(tag) : fallback;
}

export { GENERIC_REFUSAL };
