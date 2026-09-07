import { generateText } from "ai";
import { isOpenAiConfigured, routerModel } from "./openai";
import { estimateTokens } from "./spell-normalize";
import type { DialogueState } from "./types";

const MAX_REFINE_TOKENS = 200;

function isRefinementEnabled(): boolean {
  return process.env.ADURO_REFINEMENT?.toLowerCase() === "enabled";
}

function buildRefinePrompt(text: string, state: DialogueState): string {
  const arcHint = state.arc !== "opening" ? `Conversation arc: ${state.arc}.` : "";
  return `Polish this reply for naturalness. Keep it 1-3 sentences. Don't change meaning or add questions if none existed. ${arcHint}

Draft:
"${text}"

Write only the polished reply. No quotes, no preamble.`;
}

/**
 * Single-pass polish for generated replies. Skipped when disabled, over token budget,
 * or when OpenAI is unavailable.
 */
export async function refineReply(
  text: string,
  state: DialogueState,
): Promise<string> {
  if (!isRefinementEnabled() || !isOpenAiConfigured()) {
    return text;
  }

  if (estimateTokens(text) >= MAX_REFINE_TOKENS) {
    return text;
  }

  try {
    const { text: refinedRaw } = await generateText({
      model: routerModel(),
      prompt: buildRefinePrompt(text, state),
      temperature: 0.4,
    });

    const refined = refinedRaw?.trim();
    if (!refined || refined.length < 3) {
      return text;
    }

    return refined;
  } catch {
    return text;
  }
}

export { isRefinementEnabled, MAX_REFINE_TOKENS };
