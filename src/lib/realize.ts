import { generateText } from "ai";
import { HELPLINES } from "./constants";
import { isOpenAiConfigured, routerModel } from "./openai";
import { checkOutput } from "./output-guard";
import { pickTemplate } from "./responses";
import { getTemplateById } from "./templates";
import type {
  BotAct,
  ChatTurn,
  DialogueState,
  PolicyDecision,
  RealizationSource,
} from "./types";

const ACT_CONTRACTS: Record<BotAct, string> = {
  greet:
    "Greet the user warmly and invite them to share how they feel. Keep it brief.",
  validate:
    "Acknowledge the specific thing they described and normalise the feeling. Do not give advice. Do not ask a question. Do not suggest next steps.",
  reflect:
    "Mirror back the user's specifics in your own words so they feel heard. Do not advise. One optional soft check-in question is allowed only if needed.",
  explore:
    "Ask one gentle, open question to understand more. Do not stack questions. Do not give advice yet.",
  offer_coping:
    "Offer one concrete, non-clinical coping step (rest, breathing, a short break). Keep it optional and humble. Do not diagnose.",
  explain_rationale:
    "Explain briefly why the previous suggestion might help. Stay non-clinical. Do not introduce a new suggestion.",
  affirm_progress:
    "Acknowledge what clicked for them. Affirm without over-praising. Invite them to continue if they want.",
  answer_fact:
    "Not used — facts are returned verbatim from the knowledge base.",
  close:
    "Only use when the user is clearly ending the conversation with no open emotional distress. Wish them well briefly.",
};

export type RealizeResult = {
  text: string;
  source: RealizationSource;
};

function realizationMode(): "generated" | "template" {
  const mode = process.env.ADURO_REALIZATION?.toLowerCase();
  if (mode === "template") return "template";
  return "generated";
}

function buildRealizePrompt(
  decision: PolicyDecision,
  state: DialogueState,
  userMessage: string,
): string {
  const exemplars = decision.exemplarTemplateId
    ? (getTemplateById(decision.exemplarTemplateId)?.responses.slice(0, 3) ?? [])
    : [];

  const factsBlock =
    state.facts.length > 0
      ? state.facts.map((f) => `- ${f}`).join("\n")
      : "(none yet)";

  const coveredBlock =
    state.covered.length > 0 ? state.covered.join(", ") : "(none yet)";

  const exemplarBlock =
    exemplars.length > 0
      ? exemplars.map((e, i) => `${i + 1}. "${e}"`).join("\n")
      : "(none)";

  return `You write one reply for Aduro, a supportive non-clinical mental health companion.

## Your act this turn: ${decision.act}
${ACT_CONTRACTS[decision.act]}

## What the user just said
"${userMessage}"

## Known facts about their situation (reference at least one if any exist)
${factsBlock}

## Acts already covered (do not repeat the same move)
${coveredBlock}

## Style contract (hard rules)
- 1–3 sentences only. No lists, headings, or markdown.
- Second person, plain language, contractions OK.
- Match the user's register; mirror emoji only if they used them.
- Never claim to be human; never say "as an AI" or "language model".
- Never diagnose, name a disorder in a diagnostic frame, or mention medication.
- Never promise outcomes.
- Never invent helpline numbers. Approved only: SURPIN ${HELPLINES.surpin.number}, MANI ${HELPLINES.mani.number}.

## Tone exemplars (style reference ONLY — do not copy verbatim)
${exemplarBlock}

Write only the reply text. No quotes, no preamble.`;
}

async function generateOnce(
  prompt: string,
  history: ChatTurn[],
  stricter = false,
): Promise<string | null> {
  if (!isOpenAiConfigured()) return null;

  try {
    const system = stricter
      ? `${prompt}\n\nIMPORTANT: Your previous draft was rejected for safety/format. Follow the style contract strictly. Shorter is better.`
      : prompt;

    const recent = history.slice(-4).map((t) => ({
      role: t.role as "user" | "assistant",
      content: t.content.slice(0, 300),
    }));

    const { text } = await generateText({
      model: routerModel(),
      system,
      messages: [
        ...recent,
        {
          role: "user" as const,
          content: "Write the reply now.",
        },
      ],
      temperature: 0.7,
    });

    return text?.trim() || null;
  } catch {
    return null;
  }
}

function templateFallback(
  decision: PolicyDecision,
  sessionId: string,
  messageIndex: number,
  userMessage: string,
): string {
  if (decision.verbatimText) return decision.verbatimText;
  const tid = decision.exemplarTemplateId ?? "prompt_elaborate";
  return pickTemplate(tid, sessionId, messageIndex, userMessage).text;
}

/**
 * Surface realization: LLM writes the sentence under policy constraints,
 * with deterministic guard + template fallback ladder.
 */
export function buildRealizeSystemPrompt(
  decision: PolicyDecision,
  state: DialogueState,
  userMessage: string,
): string {
  return buildRealizePrompt(decision, state, userMessage);
}

export async function realize(
  decision: PolicyDecision,
  state: DialogueState,
  userMessage: string,
  history: ChatTurn[],
  sessionId: string,
  messageIndex: number,
): Promise<RealizeResult> {
  // Verbatim paths (KB, pre-set)
  if (decision.verbatimText) {
    return { text: decision.verbatimText, source: "kb" };
  }

  // answer_fact should never generate
  if (decision.act === "answer_fact") {
    return {
      text: templateFallback(decision, sessionId, messageIndex, userMessage),
      source: "kb",
    };
  }

  // Feature flag / offline → templates
  if (realizationMode() === "template" || !isOpenAiConfigured()) {
    return {
      text: templateFallback(decision, sessionId, messageIndex, userMessage),
      source: "template",
    };
  }

  const prompt = buildRealizePrompt(decision, state, userMessage);
  const first = await generateOnce(prompt, history, false);

  if (first) {
    const guard = checkOutput(first);
    if (guard.ok) {
      return { text: first, source: "generated" };
    }

    const second = await generateOnce(prompt, history, true);
    if (second) {
      const guard2 = checkOutput(second);
      if (guard2.ok) {
        return { text: second, source: "regenerated" };
      }
    }

    return {
      text: templateFallback(decision, sessionId, messageIndex, userMessage),
      source: "guard_blocked",
    };
  }

  return {
    text: templateFallback(decision, sessionId, messageIndex, userMessage),
    source: "template_fallback",
  };
}
