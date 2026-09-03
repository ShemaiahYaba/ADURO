import { generateText } from "ai";
import { HELPLINES } from "./constants";
import { isOpenAiConfigured, routerModel } from "./openai";
import {
  checkOutput,
  referencesFact,
} from "./output-guard";
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
    "Acknowledge the specific thing they described and normalise the feeling. Do not give advice. Do not suggest next steps or coping strategies.",
  reflect:
    "Mirror back the user's specifics in your own words so they feel heard. Reference at least one known fact about their situation. Do not advise.",
  explore:
    "Ask one gentle, open question to understand more. Do not stack questions. Do not give advice yet.",
  offer_coping:
    "Offer one concrete, non-clinical coping step (rest, breathing, a short break). Keep it optional and humble. Do not diagnose.",
  explain_rationale:
    "Explain briefly why the previous suggestion might help. Stay non-clinical. Do not introduce a new suggestion.",
  affirm_progress:
    "Acknowledge what clicked for them. Affirm without over-praising.",
  answer_directly:
    "Give a bounded, non-clinical response to their request for advice. Be humble — offer a perspective or next step they can choose, not a prescription. Do not ask a question.",
  normalize_uncertainty:
    "Make not-knowing feel acceptable. Stop asking them to figure it out. Do not ask a question.",
  sit_with:
    "Low-demand presence. Stay with them without pushing. Do not ask a question. Do not give advice.",
  answer_fact:
    "Not used — facts are returned verbatim from the knowledge base.",
  close:
    "Only use when the user is clearly ending the conversation with no open emotional distress. Wish them well briefly.",
};

export type RealizeResult = {
  text: string;
  source: RealizationSource;
  factReferenced: boolean;
  hadQuestion: boolean;
};

function realizationMode(): "generated" | "template" {
  const mode = process.env.ADURO_REALIZATION?.toLowerCase();
  if (mode === "template") return "template";
  return "generated";
}

function questionClause(allowQuestion: boolean): string {
  return allowQuestion
    ? "End with one gentle, open invitation to say more (one question max)."
    : "Do not ask a question this turn. Leave space.";
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

  const recentBlock =
    state.recentBotTexts.length > 0
      ? state.recentBotTexts.map((t, i) => `${i + 1}. "${t}"`).join("\n")
      : "(none)";

  const exemplarBlock =
    exemplars.length > 0
      ? exemplars.map((e, i) => `${i + 1}. "${e}"`).join("\n")
      : "(none)";

  const factInstruction =
    decision.act === "reflect" && state.facts.length > 0
      ? "You MUST reference at least one known fact about their situation in your own words."
      : state.facts.length > 0
        ? "If natural, reference at least one known fact about their situation."
        : "No facts yet — respond to what they just said.";

  const openBlock = state.openQuestion
    ? `\n## Your last question, which they did not answer\n"${state.openQuestion}"\nDo not ask it again. Acknowledge that it may be hard to answer.\n`
    : "";

  return `You write one reply for Aduro, a supportive non-clinical mental health companion.

## Your act this turn: ${decision.act}
${ACT_CONTRACTS[decision.act]}

## Question rule
${questionClause(decision.allowQuestion)}
${openBlock}

## What the user just said
"${userMessage}"

## Known facts about their situation
${factsBlock}
${factInstruction}

## Your recent replies (do NOT reuse these sentences or their structure)
${recentBlock}

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
      ? `${prompt}\n\nIMPORTANT: Your previous draft was rejected. Follow the style contract and question rule strictly. Do not repeat your recent replies. Shorter is better.`
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
      temperature: 0.75,
    });

    return text?.trim() || null;
  } catch {
    return null;
  }
}

function templateFallback(
  decision: PolicyDecision,
  state: DialogueState,
  sessionId: string,
  messageIndex: number,
  userMessage: string,
): string {
  if (decision.verbatimText) return decision.verbatimText;
  const tid = decision.exemplarTemplateId ?? "prompt_elaborate";
  return pickTemplate(tid, sessionId, messageIndex, userMessage, {
    avoidQuestion: !decision.allowQuestion,
    avoidTexts: state.recentBotTexts,
  }).text;
}

export function buildRealizeSystemPrompt(
  decision: PolicyDecision,
  state: DialogueState,
  userMessage: string,
): string {
  return buildRealizePrompt(decision, state, userMessage);
}

function acceptDraft(
  text: string,
  decision: PolicyDecision,
  state: DialogueState,
): { ok: true; factReferenced: boolean } | { ok: false; reason: string } {
  const guard = checkOutput(text, { recentBotTexts: state.recentBotTexts });
  if (!guard.ok) return guard;

  const factReferenced = referencesFact(text, state.facts);

  // Soft fact binding for reflect only — regenerate if missing
  if (
    decision.act === "reflect" &&
    state.facts.length > 0 &&
    !factReferenced
  ) {
    return { ok: false, reason: "fact_unbound" };
  }

  // Enforce no-question when disallowed
  if (!decision.allowQuestion && text.includes("?")) {
    return { ok: false, reason: "unexpected_question" };
  }

  return { ok: true, factReferenced };
}

/**
 * Surface realization: LLM writes under policy constraints,
 * with deterministic guard + template fallback ladder.
 */
export async function realize(
  decision: PolicyDecision,
  state: DialogueState,
  userMessage: string,
  history: ChatTurn[],
  sessionId: string,
  messageIndex: number,
): Promise<RealizeResult> {
  if (decision.verbatimText) {
    return {
      text: decision.verbatimText,
      source: "kb",
      factReferenced: false,
      hadQuestion: decision.verbatimText.includes("?"),
    };
  }

  if (decision.act === "answer_fact") {
    const text = templateFallback(
      decision,
      state,
      sessionId,
      messageIndex,
      userMessage,
    );
    return {
      text,
      source: "kb",
      factReferenced: false,
      hadQuestion: text.includes("?"),
    };
  }

  if (realizationMode() === "template" || !isOpenAiConfigured()) {
    const text = templateFallback(
      decision,
      state,
      sessionId,
      messageIndex,
      userMessage,
    );
    return {
      text,
      source: "template",
      factReferenced: referencesFact(text, state.facts),
      hadQuestion: text.includes("?"),
    };
  }

  const prompt = buildRealizePrompt(decision, state, userMessage);
  const first = await generateOnce(prompt, history, false);

  if (first) {
    const check = acceptDraft(first, decision, state);
    if (check.ok) {
      return {
        text: first,
        source: "generated",
        factReferenced: check.factReferenced,
        hadQuestion: first.includes("?"),
      };
    }

    const second = await generateOnce(prompt, history, true);
    if (second) {
      const check2 = acceptDraft(second, decision, state);
      if (check2.ok) {
        return {
          text: second,
          source: "regenerated",
          factReferenced: check2.factReferenced,
          hadQuestion: second.includes("?"),
        };
      }
    }

    const text = templateFallback(
      decision,
      state,
      sessionId,
      messageIndex,
      userMessage,
    );
    return {
      text,
      source: "guard_blocked",
      factReferenced: referencesFact(text, state.facts),
      hadQuestion: text.includes("?"),
    };
  }

  const text = templateFallback(
    decision,
    state,
    sessionId,
    messageIndex,
    userMessage,
  );
  return {
    text,
    source: "template_fallback",
    factReferenced: referencesFact(text, state.facts),
    hadQuestion: text.includes("?"),
  };
}
