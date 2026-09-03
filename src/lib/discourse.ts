import type {
  BotAct,
  Classification,
  DialogueArc,
  DialogueState,
  UserAct,
} from "./types";
import { INITIAL_DIALOGUE_STATE } from "./types";
import { containsQuestion } from "./output-guard";

const ARCS: DialogueArc[] = [
  "opening",
  "surfacing",
  "understanding",
  "supporting",
  "closing",
];

const ARC_ORDER: Record<DialogueArc, number> = {
  opening: 0,
  surfacing: 1,
  understanding: 2,
  supporting: 3,
  closing: 4,
};

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function isArc(value: unknown): value is DialogueArc {
  return typeof value === "string" && ARCS.includes(value as DialogueArc);
}

/** Advance arc monotonically (never go backwards except explicit closing). */
export function advanceArc(
  current: DialogueArc,
  target: DialogueArc,
): DialogueArc {
  if (target === "closing") return "closing";
  if (current === "closing") return current;
  return ARC_ORDER[target] > ARC_ORDER[current] ? target : current;
}

export function normalizeDialogueState(
  state?: DialogueState | null | Record<string, unknown>,
): DialogueState {
  if (!state || typeof state !== "object") {
    return { ...INITIAL_DIALOGUE_STATE };
  }

  const raw = state as Record<string, unknown>;

  // Migrate Phase 3 clients that still send activeFlow/phase
  let arc: DialogueArc = "opening";
  if (isArc(raw.arc)) {
    arc = raw.arc;
  } else if (raw.activeFlow === "stress_support") {
    arc = "supporting";
  } else if (typeof raw.phase === "string" && raw.phase !== "idle") {
    arc = "surfacing";
  }

  const facts = Array.isArray(raw.facts)
    ? (raw.facts as unknown[])
        .filter((f): f is string => typeof f === "string")
        .map((f) => f.slice(0, 120))
        .slice(-8)
    : [];

  const covered = Array.isArray(raw.covered)
    ? (raw.covered as unknown[]).filter(
        (a): a is BotAct => typeof a === "string",
      )
    : [];

  const recentBotTexts = Array.isArray(raw.recentBotTexts)
    ? (raw.recentBotTexts as unknown[])
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.slice(0, 400))
        .slice(-3)
    : [];

  return {
    arc,
    lastBotAct:
      typeof raw.lastBotAct === "string"
        ? (raw.lastBotAct as DialogueState["lastBotAct"])
        : "none",
    facts,
    covered,
    turnCount: clamp(Number(raw.turnCount ?? 0), 0, 500),
    recentBotTexts,
    openQuestion:
      typeof raw.openQuestion === "string" ? raw.openQuestion.slice(0, 400) : null,
    consecutiveQuestions: clamp(Number(raw.consecutiveQuestions ?? 0), 0, 10),
    consecutiveNonAnswers: clamp(Number(raw.consecutiveNonAnswers ?? 0), 0, 10),
    stuckTurns: clamp(Number(raw.stuckTurns ?? 0), 0, 10),
    lastSuggestion:
      typeof raw.lastSuggestion === "string"
        ? (raw.lastSuggestion as DialogueState["lastSuggestion"])
        : null,
  };
}

const NON_ANSWER_ACTS = new Set<UserAct>([
  "express_uncertainty",
  "deflect",
]);

/**
 * Update discourse counters from the classification *before* policy runs.
 * Does not yet know the bot reply — question counters finalize after realization.
 */
export function updateDiscourseFromUser(
  state: DialogueState,
  classification: Classification,
  gotNewFacts = false,
): DialogueState {
  const nonAnswer = NON_ANSWER_ACTS.has(classification.userAct);
  let consecutiveNonAnswers = nonAnswer
    ? state.consecutiveNonAnswers + 1
    : 0;

  // Stuck = the conversation is turning over without surfacing anything new.
  // Answering the bot's open question with fresh content clears it.
  const stuckTurns = gotNewFacts ? 0 : state.stuckTurns + 1;

  // Clear open question when user elaborates or discloses meaningfully
  let openQuestion = state.openQuestion;
  if (
    classification.userAct === "elaborate" ||
    classification.userAct === "disclose_feeling" ||
    classification.userAct === "request_advice" ||
    classification.userAct === "ask_about_situation"
  ) {
    openQuestion = null;
    consecutiveNonAnswers = 0;
  }

  let arc = state.arc;
  if (
    classification.userAct === "disclose_feeling" ||
    classification.userAct === "elaborate"
  ) {
    arc = advanceArc(arc, state.facts.length > 0 ? "understanding" : "surfacing");
  }
  if (classification.userAct === "social" && arc === "opening") {
    arc = "opening";
  }

  return {
    ...state,
    arc,
    openQuestion,
    consecutiveNonAnswers: clamp(consecutiveNonAnswers, 0, 10),
    stuckTurns: clamp(stuckTurns, 0, 10),
  };
}

/**
 * True when the user has been heard but the conversation has stopped moving.
 * Deliberately not gated on `openQuestion` — the question budget can leave it
 * null for several turns, which would make coping unreachable.
 */
export function isStuck(state: DialogueState): boolean {
  return state.stuckTurns >= 2;
}

/**
 * Finalize discourse after the bot reply is known.
 */
export function finalizeDiscourseAfterBot(
  state: DialogueState,
  botText: string,
  act: BotAct,
): DialogueState {
  const asked = containsQuestion(botText);
  const consecutiveQuestions = asked ? state.consecutiveQuestions + 1 : 0;

  let openQuestion = state.openQuestion;
  if (asked) {
    // Keep the last sentence with a question mark as the open question
    const sentences = botText.split(/(?<=[.!?])\s+/);
    const q = [...sentences].reverse().find((s) => s.includes("?"));
    openQuestion = q?.trim() ?? botText.trim();
  }

  const recentBotTexts = [...state.recentBotTexts, botText.slice(0, 400)].slice(
    -3,
  );

  let arc = state.arc;
  if (act === "validate" || act === "reflect") {
    arc = advanceArc(arc, "surfacing");
  }
  if (act === "explore" || act === "normalize_uncertainty") {
    arc = advanceArc(arc, "understanding");
  }
  if (act === "offer_coping" || act === "answer_directly") {
    arc = advanceArc(arc, "supporting");
  }
  if (act === "close") {
    arc = "closing";
  }

  const covered = state.covered.includes(act)
    ? state.covered
    : [...state.covered, act].slice(-12);

  return {
    ...state,
    arc,
    lastBotAct: act,
    lastSuggestion: act === "offer_coping" ? act : state.lastSuggestion,
    covered,
    turnCount: state.turnCount + 1,
    recentBotTexts,
    openQuestion: asked ? openQuestion : state.openQuestion,
    consecutiveQuestions: clamp(consecutiveQuestions, 0, 10),
  };
}

/** Question budget invariant. */
export function shouldAllowQuestion(
  state: DialogueState,
  userAct: UserAct,
): boolean {
  if (state.consecutiveQuestions >= 2) return false;
  if (state.consecutiveNonAnswers >= 1) return false;
  if (userAct === "deflect") return false;
  if (userAct === "express_uncertainty") return false;
  if (userAct === "request_advice") return false;
  if (userAct === "ask_about_situation") return false;
  return true;
}
