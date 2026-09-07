import { generateText, Output } from "ai";
import { z } from "zod";
import { ROUTER_MIN_CONFIDENCE } from "./constants";
import {
  classifyOffline,
  inferContextualUserAct,
} from "./classifier-offline";
import { isOpenAiConfigured, routerModel } from "./openai";
import { estimateTokens } from "./spell-normalize";
import { getAllTemplates } from "./templates";
import type {
  ChatTurn,
  Classification,
  DialogueState,
  Emotion,
  UserAct,
} from "./types";

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
  "request_advice",
  "ask_about_situation",
  "express_uncertainty",
  "deflect",
  "unknown",
]);

const classificationSchema = z.object({
  emotion: emotionSchema,
  userAct: userActSchema,
  facts: z.array(z.string()).max(3).default([]),
  // OpenAI structured outputs require every key in `required` — use null, not optional.
  templateId: z.string().nullable(),
  topic: z.string().nullable(),
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

Infer emotion, userAct, facts, and optionally templateId from the latest user message AND conversation context.
Never diagnose. Never refuse in-scope emotional conversation as off_topic.

userAct meanings:
- social: greetings, thanks, goodbye, small talk
- disclose_feeling: shares or hints at feelings
- elaborate: explains context (breakup, work, family) — NOT when they ask you something
- request_advice: asks what they should do / what you think they should do
- ask_about_situation: asks why something happened that you cannot know ("why did she cheat")
- express_uncertainty: "i don't know", "not sure", "i'm not exactly sure"
- deflect: humour or topic-shift under pressure ("ice cream i guess")
- accept_offer / decline_offer: yes/no to a bot suggestion
- ask_rationale: asks why the bot suggested something (why meditation, why rest)
- express_doubt: skeptical (are you sure, really?)
- factual_question: mental health definition or fact question
- unknown: only when genuinely ambiguous after reading context

facts:
- Extract at most 3 short factual fragments the user disclosed THIS turn, in third person.
- Prefer concrete situations over vague mood labels when both appear.
- Good examples: "partner was unfaithful", "went through a breakup", "family pressure about school", "money worries about fees", "academic pressure from exams", "feeling ignored or ghosted", "dealing with loss", "work stress from boss", "faith or community pressure", "feeling lonely", "feeling overwhelmed"
- Return [] if none. Do not invent. Keep fragments under ~8 words.

Guidelines:
- Prefer request_advice over elaborate when they ask what to do.
- Prefer ask_about_situation when they ask why someone else did something.
- Prefer express_uncertainty for "i don't know" / "not sure" answers.
- Prefer deflect for joke/non-sequitur answers to serious questions.
- NEVER suggest templateId "done" when the user is still sharing emotional content.
- Use off_topic only for clearly unrelated topics (sports, recipes, homework).

Dialogue state: arc=${state.arc}, lastBotAct=${state.lastBotAct}, consecutiveQuestions=${state.consecutiveQuestions}

Known templateIds: ${templateHintList()}`;
}

const MAX_CLASSIFIER_PROMPT_TOKENS = 2000;
const MAX_HISTORY_TURNS = 10;

function dedupeHistory(history: ChatTurn[], currentMessage: string): ChatTurn[] {
  const trimmed = currentMessage.trim().toLowerCase();
  const filtered = history.filter(
    (t) => !(t.role === "user" && t.content.trim().toLowerCase() === trimmed),
  );
  return filtered.slice(-MAX_HISTORY_TURNS).map((t) => ({
    role: t.role,
    content: t.content.slice(0, 400),
  }));
}

/** Drop oldest turns first if the classification prompt would exceed the token budget. */
export function truncateHistoryForClassifier(
  history: ChatTurn[],
  currentMessage: string,
  state: DialogueState,
): ChatTurn[] {
  const deduped = dedupeHistory(history, currentMessage);
  let budget =
    estimateTokens(currentMessage) + estimateTokens(buildSystemPrompt(state));

  const kept: ChatTurn[] = [];
  for (let i = deduped.length - 1; i >= 0; i--) {
    const turn = deduped[i]!;
    const turnTokens = estimateTokens(turn.content);
    if (budget + turnTokens > MAX_CLASSIFIER_PROMPT_TOKENS && kept.length > 0) {
      break;
    }
    budget += turnTokens;
    kept.unshift(turn);
  }
  return kept;
}

function normalizeFacts(facts: string[] | undefined): string[] {
  if (!facts?.length) return [];
  return facts
    .map((f) => f.trim())
    .filter((f) => f.length > 0 && f.length < 120)
    .slice(0, 3);
}

function normalizeLlmClassification(
  output: z.infer<typeof classificationSchema>,
  state: DialogueState,
  message: string,
): Classification {
  let emotion = output.emotion as Emotion;
  let userAct = output.userAct as UserAct;
  const facts = normalizeFacts(output.facts);

  // Contextual override for short replies mid-conversation
  if (state.arc !== "opening" && message.trim().split(/\s+/).length <= 12) {
    const contextual = inferContextualUserAct(message, state.lastBotAct);
    if (
      contextual !== "elaborate" &&
      (userAct === "unknown" ||
        userAct === "social" ||
        userAct === "factual_question")
    ) {
      userAct = contextual;
    }
  }

  if (userAct === "unknown" && emotion === "off_topic") {
    userAct = "social";
    emotion = "neutral";
  }

  let templateId = output.templateId ?? undefined;
  if (
    templateId === "done" &&
    (userAct === "disclose_feeling" ||
      userAct === "elaborate" ||
      userAct === "request_advice" ||
      emotion === "sadness" ||
      emotion === "stress" ||
      emotion === "anxiety" ||
      emotion === "grief" ||
      emotion === "anger")
  ) {
    templateId = undefined;
  }

  return {
    emotion,
    userAct,
    facts,
    templateId,
    topic: output.topic ?? undefined,
    confidence: output.confidence,
  };
}

async function classifyWithLlm(
  message: string,
  history: ChatTurn[],
  state: DialogueState,
): Promise<Classification> {
  const recent = truncateHistoryForClassifier(history, message, state);

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

export async function classify(
  message: string,
  history: ChatTurn[],
  state: DialogueState,
): Promise<Classification> {
  if (isOpenAiConfigured()) {
    try {
      return await classifyWithLlm(message, history, state);
    } catch {
      return classifyOffline(message, state);
    }
  }
  return classifyOffline(message, state);
}

export function mergeFacts(
  existing: string[],
  incoming: string[],
): string[] {
  const seen = new Set(existing.map((f) => f.toLowerCase()));
  const merged = [...existing];
  for (const fact of incoming) {
    const key = fact.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(fact);
    }
  }
  return merged.slice(-8);
}
