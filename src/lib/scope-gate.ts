import { generateText, Output } from "ai";
import { z } from "zod";
import { OFF_TOPIC_REFUSAL } from "./constants";
import { isOpenAiConfigured, scopeModel } from "./openai";
import { checkOffTopicHeuristic } from "./safety";
import type { ChatTurn, SafetyResult } from "./types";

const SCOPE_MIN_CONFIDENCE = 0.55;
const MAX_HISTORY_TURNS = 4;

const scopeSchema = z.object({
  inScope: z.boolean(),
  confidence: z.number().min(0).max(1),
  // OpenAI structured outputs require every property in `required`.
  // Use "" when there is nothing useful to say — do not use .optional().
  reason: z.string().max(160),
});

/**
 * Env:
 *   ADURO_SCOPE_GATE=enabled|disabled  (default: enabled when API key present)
 *   ADURO_SCOPE_MODEL=<model id>       (default: ADURO_ROUTER_MODEL / gpt-4o-mini)
 */
export function isScopeGateEnabled(): boolean {
  const raw = process.env.ADURO_SCOPE_GATE?.toLowerCase();
  if (raw === "disabled" || raw === "off" || raw === "0") return false;
  if (raw === "enabled" || raw === "on" || raw === "1") return true;
  return isOpenAiConfigured();
}

const SYSTEM_PROMPT = `You are the scope gate for Aduro, a supportive non-clinical mental health companion in Nigeria.

Decide whether the LATEST user message is in scope for emotional wellness / mental health support.

IN SCOPE (inScope = true) when the user is seeking:
- Emotional support, coping, relationship talk, mood, stress, grief, loneliness
- Mental-health / emotional education and definitions
  Examples that are IN SCOPE:
  - "can you define emotion"
  - "what is anxiety"
  - "what does burnout mean"
  - "how does stress affect the body"
- Continuing an emotional conversation (short replies like "yeah", "not sure")
- Greetings / thanks / goodbye BY THEMSELVES
- Emotional framing that happens to mention numbers or school
  e.g. "I'm stressed I can't even add 1+1 anymore" → IN SCOPE
  e.g. "Hey, I'm anxious about work" → IN SCOPE

OUT OF SCOPE (inScope = false) when the message is primarily:
- Trivia / history / mythology / biography unrelated to feelings
  ("who is Oduduwa", "who invented X", "who won the world cup")
- Arithmetic, coding, homework solving, recipes, weather, sports, stocks
- General knowledge with NO wellness / emotional / mental-health link
- A greeting PLUS an out-of-scope ask — the ask wins
  Example: "Hey Aduro, who is Oduduwa?" → OUT OF SCOPE
  Example: "Hey Aduro, what's 1+1?" → OUT OF SCOPE

Critical distinction:
- "define emotion" / "what is depression" → IN SCOPE (wellness education)
- "who is Oduduwa" / "capital of France" → OUT OF SCOPE (encyclopedia)

Rules:
1. Strip social openers ("hey", "hi aduro") and judge the REQUEST that remains.
2. If the ask is about feelings, mind, mood, mental health, or coping → IN SCOPE.
3. Prefer OUT OF SCOPE only for clear non-wellness tasks/trivia — not for wellness vocabulary.
4. Never mark crisis / self-harm as out of scope.
5. Be decisive. confidence = how sure you are.`;

function recentHistory(history: ChatTurn[]): ChatTurn[] {
  return history.slice(-MAX_HISTORY_TURNS);
}

/** Strip greeting fluff so "Hey Aduro, who is X" is judged as "who is X". */
export function stripSocialOpener(message: string): string {
  return message
    .replace(
      /^(hey+|hi+|hello|yo|sup|heya)[\s,!.]*(aduro)?[\s,!.]*/i,
      "",
    )
    .trim() || message.trim();
}

async function judgeWithLlm(
  message: string,
  history: ChatTurn[],
): Promise<{ inScope: boolean; confidence: number; reason?: string }> {
  const recent = recentHistory(history);
  const payload = stripSocialOpener(message);

  const { output } = await generateText({
    model: scopeModel(),
    system: SYSTEM_PROMPT,
    messages: [
      ...recent.map((t) => ({
        role: t.role as "user" | "assistant",
        content: t.content,
      })),
      {
        role: "user" as const,
        content: `Original message: ${message}\nRequest to judge (greeting stripped): ${payload}`,
      },
    ],
    output: Output.object({ schema: scopeSchema }),
  });

  if (!output) {
    return { inScope: true, confidence: 0 };
  }

  return {
    inScope: output.inScope,
    confidence: output.confidence,
    reason: output.reason,
  };
}

function refuse(): SafetyResult {
  return {
    handled: true,
    text: OFF_TOPIC_REFUSAL,
    emotion: "off_topic",
  };
}

/**
 * Man-in-the-middle scope check.
 * Runs AFTER hard safety (crisis / diagnosis / config), BEFORE classify.
 *
 * Dual gate: LLM judgment OR heuristic — either may refuse.
 * Heuristic catches clear cases even when the model is soft on compound greetings.
 */
export async function checkScope(
  message: string,
  history: ChatTurn[] = [],
): Promise<SafetyResult> {
  // Always run the cheap heuristic (on the greeting-stripped payload too)
  const stripped = stripSocialOpener(message);
  const heuristic =
    checkOffTopicHeuristic(message).handled ||
    checkOffTopicHeuristic(stripped).handled;

  if (!isScopeGateEnabled() || !isOpenAiConfigured()) {
    return heuristic ? refuse() : { handled: false };
  }

  try {
    const judgment = await judgeWithLlm(message, history);
    const llmRefuse =
      !judgment.inScope && judgment.confidence >= SCOPE_MIN_CONFIDENCE;

    console.info(
      `[aduro:scope] inScope=${judgment.inScope} conf=${judgment.confidence.toFixed(2)} heuristic=${heuristic ? 1 : 0} reason=${judgment.reason || "-"}`,
    );

    if (llmRefuse || heuristic) {
      return refuse();
    }
    return { handled: false };
  } catch (err) {
    console.warn(
      "[aduro:scope] llm failed; heuristic only",
      err instanceof Error ? err.message : "unknown",
    );
    return heuristic ? refuse() : checkOffTopicHeuristic(message);
  }
}
