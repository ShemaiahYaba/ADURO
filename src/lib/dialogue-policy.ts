import { lookupRationaleTemplate } from "./responses";
import type {
  BotAct,
  Classification,
  DialogueState,
  Emotion,
  LastBotAct,
  PolicyDecision,
} from "./types";

const STRESS_EMOTIONS = new Set<Emotion>(["stress", "anxiety", "sadness"]);

const AFFIRM_PROGRESS_RE =
  /\b(never\s+thought|that\s+way|makes\s+sense|i\s+see|thank|thanks|helped|feel\s+better)\b/i;

function withCovered(state: DialogueState, act: BotAct): BotAct[] {
  if (state.covered.includes(act)) return state.covered;
  return [...state.covered, act].slice(-12);
}

function decision(
  act: BotAct,
  emotion: Emotion,
  next: {
    activeFlow: DialogueState["activeFlow"];
    phase: string;
    lastBotAct: LastBotAct;
    facts?: string[];
    covered?: BotAct[];
    turnCount?: number;
  },
  base: DialogueState,
  exemplarTemplateId?: string,
  verbatimText?: string,
): PolicyDecision {
  const nextState: DialogueState = {
    activeFlow: next.activeFlow,
    phase: next.phase,
    lastBotAct: next.lastBotAct,
    facts: next.facts ?? base.facts,
    covered: next.covered ?? withCovered(base, act),
    turnCount: next.turnCount ?? base.turnCount + 1,
  };
  return { act, emotion, nextState, exemplarTemplateId, verbatimText };
}

function handleStressFlow(
  classification: Classification,
  state: DialogueState,
): PolicyDecision | null {
  if (state.activeFlow !== "stress_support") return null;

  if (classification.userAct === "elaborate") {
    return decision(
      "explore",
      "stress",
      {
        activeFlow: "stress_support",
        phase: "probe_cause",
        lastBotAct: "asked_cause",
      },
      state,
      "stress_probe",
    );
  }

  if (
    classification.userAct === "decline_offer" &&
    (state.lastBotAct === "offered_learn_more" ||
      state.lastBotAct === "offered_tips")
  ) {
    return decision(
      "offer_coping",
      "stress",
      {
        activeFlow: "stress_support",
        phase: "offered_tips",
        lastBotAct: "offered_tips",
      },
      state,
      "tips_declined",
    );
  }

  if (
    classification.userAct === "accept_offer" &&
    state.lastBotAct === "offered_tips"
  ) {
    return decision(
      "offer_coping",
      "stress",
      {
        activeFlow: "stress_support",
        phase: "offered_tips",
        lastBotAct: "offered_learn_more",
      },
      state,
      "learn_more_offer",
    );
  }

  if (
    classification.userAct === "accept_offer" &&
    state.lastBotAct === "offered_learn_more"
  ) {
    return decision(
      "offer_coping",
      "stress",
      {
        activeFlow: "stress_support",
        phase: "offered_meditation",
        lastBotAct: "offered_meditation",
      },
      state,
      "meditation_offer",
    );
  }

  if (
    classification.userAct === "accept_offer" &&
    (classification.templateId === "meditation_guide" ||
      state.lastBotAct === "offered_meditation")
  ) {
    return decision(
      "offer_coping",
      "stress",
      {
        activeFlow: "stress_support",
        phase: "meditation_active",
        lastBotAct: "guided_meditation",
      },
      state,
      "meditation_guide",
    );
  }

  return null;
}

function startStressFlow(
  state: DialogueState,
  emotion: Emotion,
): PolicyDecision {
  return decision(
    "offer_coping",
    emotion === "anxiety" ? "anxiety" : "stress",
    {
      activeFlow: "stress_support",
      phase: "stressed_disclosed",
      lastBotAct: "suggested_break",
      facts: state.facts,
    },
    state,
    "stressed",
  );
}

function templateToAct(templateId: string): BotAct {
  if (
    templateId === "greeting" ||
    templateId === "morning" ||
    templateId === "afternoon" ||
    templateId === "evening" ||
    templateId === "night"
  ) {
    return "greet";
  }
  if (templateId === "goodbye" || templateId === "done") {
    return "close";
  }
  if (
    templateId === "sad" ||
    templateId === "anxious" ||
    templateId === "stressed" ||
    templateId === "depressed" ||
    templateId === "worthless" ||
    templateId === "scared"
  ) {
    return "validate";
  }
  if (templateId === "prompt_elaborate" || templateId === "default") {
    return "explore";
  }
  if (templateId === "happy" || templateId === "thanks") {
    return "affirm_progress";
  }
  return "validate";
}

/**
 * Rule-based content planner: chooses a BotAct, not a reply string.
 * Never selects `close` after emotional disclosure.
 * Never falls through to NO_INFO in emotional context.
 */
export function selectDecision(
  classification: Classification,
  state: DialogueState,
  userMessage: string,
): PolicyDecision {
  // Rationale / doubt about previous suggestion
  const rationaleId = lookupRationaleTemplate(
    state.lastBotAct,
    classification.userAct,
  );
  if (rationaleId) {
    return decision(
      "explain_rationale",
      classification.emotion === "neutral" ? "stress" : classification.emotion,
      {
        activeFlow: state.activeFlow,
        phase: state.phase,
        lastBotAct: state.lastBotAct,
        facts: state.facts,
      },
      state,
      rationaleId,
    );
  }

  // Affirm progress when user acknowledges a reframe
  if (
    AFFIRM_PROGRESS_RE.test(userMessage) &&
    state.lastBotAct !== "none" &&
    state.activeFlow !== "none"
  ) {
    return decision(
      "affirm_progress",
      classification.emotion === "neutral" ? "stress" : classification.emotion,
      {
        activeFlow: state.activeFlow,
        phase: state.phase,
        lastBotAct: "affirm_progress",
        facts: state.facts,
      },
      state,
      "prompt_elaborate",
    );
  }

  const stressHandled = handleStressFlow(classification, state);
  if (stressHandled) return stressHandled;

  // Start stress support flow
  if (
    state.activeFlow === "none" &&
    (classification.userAct === "disclose_feeling" ||
      classification.templateId === "stressed" ||
      (STRESS_EMOTIONS.has(classification.emotion) &&
        classification.userAct !== "social" &&
        classification.userAct !== "factual_question"))
  ) {
    if (
      classification.emotion === "stress" ||
      classification.templateId === "stressed"
    ) {
      return startStressFlow(state, classification.emotion);
    }
  }

  // Guard: never close after emotional disclosure (the "that's all" bug)
  const emotionalDisclosure =
    classification.userAct === "disclose_feeling" ||
    classification.userAct === "elaborate" ||
    STRESS_EMOTIONS.has(classification.emotion) ||
    classification.emotion === "grief" ||
    classification.emotion === "anger";

  if (classification.templateId === "done" && emotionalDisclosure) {
    return decision(
      "validate",
      classification.emotion === "neutral" ? "sadness" : classification.emotion,
      {
        activeFlow: state.activeFlow === "none" ? "none" : state.activeFlow,
        phase: state.phase,
        lastBotAct: "validate",
        facts: state.facts,
      },
      state,
      "sad",
    );
  }

  // Social / greeting via template hint
  if (classification.userAct === "social") {
    const tid = classification.templateId ?? "greeting";
    const act = templateToAct(tid);
    if (act === "close" && emotionalDisclosure) {
      return decision(
        "explore",
        "neutral",
        {
          activeFlow: state.activeFlow,
          phase: state.phase,
          lastBotAct: "explore",
          facts: state.facts,
        },
        state,
        "prompt_elaborate",
      );
    }
    return decision(
      act,
      classification.emotion,
      {
        activeFlow: state.activeFlow,
        phase: state.phase,
        lastBotAct: act,
        facts: state.facts,
      },
      state,
      tid,
    );
  }

  // Template hint from classifier
  if (classification.templateId) {
    const act = templateToAct(classification.templateId);
    if (act === "close" && emotionalDisclosure) {
      return decision(
        "validate",
        classification.emotion === "neutral"
          ? "sadness"
          : classification.emotion,
        {
          activeFlow: state.activeFlow,
          phase: state.phase,
          lastBotAct: "validate",
          facts: state.facts,
        },
        state,
        classification.templateId === "done" ? "sad" : classification.templateId,
      );
    }
    return decision(
      act,
      classification.emotion,
      {
        activeFlow: state.activeFlow,
        phase: state.phase,
        lastBotAct: act as LastBotAct,
        facts: state.facts,
      },
      state,
      classification.templateId,
    );
  }

  // Feeling disclosure → validate then explore
  if (classification.userAct === "disclose_feeling") {
    const alreadyValidated = state.covered.includes("validate");
    if (!alreadyValidated) {
      return decision(
        "validate",
        classification.emotion,
        {
          activeFlow: state.activeFlow,
          phase: state.phase === "idle" ? "feeling_disclosed" : state.phase,
          lastBotAct: "validate",
          facts: state.facts,
        },
        state,
        emotionToTemplate(classification.emotion),
      );
    }
    return decision(
      "explore",
      classification.emotion,
      {
        activeFlow: state.activeFlow,
        phase: "exploring",
        lastBotAct: "explore",
        facts: state.facts,
      },
      state,
      "prompt_elaborate",
    );
  }

  // Unknown in emotional / mid-flow context → explore, never NO_INFO
  if (
    classification.userAct === "unknown" ||
    classification.userAct === "elaborate"
  ) {
    return decision(
      "explore",
      classification.emotion === "off_topic" ||
        classification.emotion === "factual"
        ? "neutral"
        : classification.emotion,
      {
        activeFlow: state.activeFlow,
        phase: state.phase === "idle" ? "exploring" : state.phase,
        lastBotAct: "explore",
        facts: state.facts,
      },
      state,
      "prompt_elaborate",
    );
  }

  // Decline / accept outside known flow → explore
  if (
    classification.userAct === "decline_offer" ||
    classification.userAct === "accept_offer"
  ) {
    return decision(
      "explore",
      classification.emotion,
      {
        activeFlow: state.activeFlow,
        phase: state.phase,
        lastBotAct: "explore",
        facts: state.facts,
      },
      state,
      "prompt_elaborate",
    );
  }

  // Final soft fallback — still explore, never knowledge-base refusal
  return decision(
    "explore",
    "neutral",
    {
      activeFlow: state.activeFlow,
      phase: state.phase,
      lastBotAct: "explore",
      facts: state.facts,
    },
    state,
    "prompt_elaborate",
  );
}

function emotionToTemplate(emotion: Emotion): string {
  switch (emotion) {
    case "sadness":
      return "sad";
    case "anxiety":
      return "anxious";
    case "stress":
      return "stressed";
    case "anger":
      return "default";
    case "grief":
      return "death";
    case "happy":
      return "happy";
    default:
      return "prompt_elaborate";
  }
}

/** @deprecated Use selectDecision — kept for gradual test migration. */
export function selectResponse(
  classification: Classification,
  state: DialogueState,
  _sessionId: string,
  _messageIndex: number,
  userMessage: string,
): PolicyDecision {
  return selectDecision(classification, state, userMessage);
}
