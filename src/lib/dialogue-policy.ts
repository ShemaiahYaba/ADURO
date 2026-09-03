import { isStuck, shouldAllowQuestion } from "./discourse";
import { lookupRationaleTemplate } from "./responses";
import type {
  BotAct,
  Classification,
  DialogueState,
  Emotion,
  LastBotAct,
  PolicyDecision,
} from "./types";

/** Acts that constitute a suggestion the bot can be asked to justify. */
const SUGGESTION_ACTS = new Set<LastBotAct>([
  "suggested_break",
  "offer_coping",
  "offered_meditation",
]);

/**
 * The suggestion a doubt or rationale question is about. Prefers the immediate
 * previous act, falling back to the last suggestion made — doubt often lands a
 * turn or two later, after an intervening "I don't know".
 */
function resolveSuggestion(state: DialogueState): LastBotAct | null {
  if (SUGGESTION_ACTS.has(state.lastBotAct)) return state.lastBotAct;
  if (state.lastSuggestion && SUGGESTION_ACTS.has(state.lastSuggestion)) {
    return state.lastSuggestion;
  }
  return null;
}

const EMOTIONAL: Set<Emotion> = new Set([
  "sadness",
  "anger",
  "anxiety",
  "stress",
  "grief",
]);

const AFFIRM_PROGRESS_RE =
  /\b(never\s+thought|that\s+way|makes\s+sense|thank|thanks|helped|feel\s+better)\b/i;

/**
 * Default exemplar pool per act. Needed because act rotation can change the
 * act after the caller picked an exemplar — a rotated `sit_with` must not
 * inherit `prompt_elaborate` and fall back to "Tell me more".
 */
const ACT_EXEMPLAR: Partial<Record<BotAct, string>> = {
  normalize_uncertainty: "uncertainty_ok",
  sit_with: "presence",
  answer_directly: "advice_humble",
  explore: "prompt_elaborate",
  offer_coping: "stressed",
  explain_rationale: "break_rationale",
};

function withCovered(state: DialogueState, act: BotAct): BotAct[] {
  if (state.covered.includes(act)) return state.covered;
  return [...state.covered, act].slice(-12);
}

function decide(
  act: BotAct,
  emotion: Emotion,
  state: DialogueState,
  userAct: Classification["userAct"],
  opts: {
    exemplarTemplateId?: string;
    verbatimText?: string;
    lastBotAct?: LastBotAct;
    forceAllowQuestion?: boolean;
  } = {},
): PolicyDecision {
  let chosen = rotateIfRepeating(act, state);
  const allowQuestion =
    opts.forceAllowQuestion ??
    (chosen === "explore"
      ? shouldAllowQuestion(state, userAct)
      : chosen === "validate" || chosen === "reflect" || chosen === "affirm_progress"
        ? shouldAllowQuestion(state, userAct)
        : chosen === "sit_with" ||
            chosen === "normalize_uncertainty" ||
            chosen === "answer_directly" ||
            chosen === "offer_coping" ||
            chosen === "explain_rationale" ||
            chosen === "close" ||
            chosen === "answer_fact"
          ? false
          : shouldAllowQuestion(state, userAct));

  // explore without question budget → sit_with / normalize / reflect
  if (chosen === "explore" && !allowQuestion) {
    chosen = rotateWithoutQuestion(state);
  }

  const exemplarTemplateId =
    chosen === act
      ? (opts.exemplarTemplateId ?? ACT_EXEMPLAR[chosen])
      : (ACT_EXEMPLAR[chosen] ?? opts.exemplarTemplateId);

  return {
    act: chosen,
    allowQuestion: chosen === "explore" ? true : allowQuestion && chosen !== "sit_with",
    emotion,
    exemplarTemplateId,
    verbatimText: opts.verbatimText,
    nextState: {
      ...state,
      lastBotAct: opts.lastBotAct ?? chosen,
      covered: withCovered(state, chosen),
      // turnCount / recentBotTexts / question counters finalized after realize
    },
  };
}

/** Never emit the same act three turns running; rotate on consecutive repeat. */
function rotateIfRepeating(act: BotAct, state: DialogueState): BotAct {
  if (act !== state.lastBotAct) return act;
  if (act === "normalize_uncertainty") return "sit_with";
  if (act === "sit_with") return "normalize_uncertainty";
  if (act === "answer_directly") return "reflect";
  return rotateWithoutQuestion(state);
}

function rotateWithoutQuestion(state: DialogueState): BotAct {
  if (state.facts.length > 0 && state.lastBotAct !== "reflect") {
    return "reflect";
  }
  if (state.lastBotAct !== "normalize_uncertainty") {
    return "normalize_uncertainty";
  }
  return "sit_with";
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
      return "angry";
    case "grief":
      return "death";
    case "happy":
      return "happy";
    default:
      return "prompt_elaborate";
  }
}

function templateToAct(templateId: string): BotAct {
  if (
    ["greeting", "morning", "afternoon", "evening", "night"].includes(
      templateId,
    )
  ) {
    return "greet";
  }
  if (templateId === "goodbye" || templateId === "done") {
    return "close";
  }
  if (
    ["sad", "anxious", "stressed", "depressed", "worthless", "scared", "angry"].includes(
      templateId,
    )
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

function hasValidated(state: DialogueState): boolean {
  return state.covered.includes("validate") || state.covered.includes("reflect");
}

function hasElaborated(state: DialogueState, classification: Classification): boolean {
  return (
    classification.userAct === "elaborate" ||
    state.facts.length > 0 ||
    state.arc === "understanding" ||
    state.arc === "supporting"
  );
}

/** Earned advice: offer_coping only after validate + elaborate. */
function canOfferCoping(
  state: DialogueState,
  classification: Classification,
): boolean {
  return hasValidated(state) && hasElaborated(state, classification);
}

/**
 * Rule-based discourse planner constrained by invariants.
 * Chooses a BotAct + allowQuestion — never a reply string.
 */
export function selectDecision(
  classification: Classification,
  state: DialogueState,
  userMessage: string,
): PolicyDecision {
  const emotion =
    classification.emotion === "off_topic" || classification.emotion === "factual"
      ? "neutral"
      : classification.emotion;

  const emotionalDisclosure =
    classification.userAct === "disclose_feeling" ||
    classification.userAct === "elaborate" ||
    classification.userAct === "request_advice" ||
    classification.userAct === "ask_about_situation" ||
    classification.userAct === "express_uncertainty" ||
    EMOTIONAL.has(classification.emotion);

  // --- Reciprocity (highest priority) ---

  if (classification.userAct === "request_advice") {
    return decide("answer_directly", emotion, state, classification.userAct, {
      exemplarTemplateId: "advice_humble",
      forceAllowQuestion: false,
    });
  }

  if (classification.userAct === "ask_about_situation") {
    return decide("reflect", emotion, state, classification.userAct, {
      exemplarTemplateId: emotionToTemplate(emotion),
      forceAllowQuestion: false,
    });
  }

  // Rationale / doubt about previous suggestion
  const rationaleId = lookupRationaleTemplate(
    resolveSuggestion(state) ?? state.lastBotAct,
    classification.userAct,
  );
  if (rationaleId) {
    return decide(
      "explain_rationale",
      emotion === "neutral" ? "stress" : emotion,
      state,
      classification.userAct,
      {
        exemplarTemplateId: rationaleId,
        forceAllowQuestion: false,
        lastBotAct: state.lastBotAct,
      },
    );
  }

  // Express doubt. Only explain a rationale when there was actually a
  // suggestion to justify — otherwise we'd defend advice never given.
  if (classification.userAct === "express_doubt") {
    const suggestion = resolveSuggestion(state);
    if (suggestion) {
      return decide(
        "explain_rationale",
        emotion,
        state,
        classification.userAct,
        {
          exemplarTemplateId: "break_rationale",
          forceAllowQuestion: false,
          lastBotAct: suggestion,
        },
      );
    }
    if (state.facts.length > 0) {
      return decide("reflect", emotion, state, classification.userAct, {
        exemplarTemplateId: emotionToTemplate(emotion),
        forceAllowQuestion: false,
      });
    }
    return decide("validate", emotion, state, classification.userAct, {
      exemplarTemplateId: emotionToTemplate(emotion),
    });
  }

  // --- Earned coping: heard, but the conversation has stopped moving ---
  // Set lastBotAct to the flow marker so the rationale map can answer a
  // follow-up "really? why?" about this specific suggestion.
  if (
    canOfferCoping(state, classification) &&
    isStuck(state) &&
    !state.covered.includes("offer_coping")
  ) {
    return decide("offer_coping", emotion, state, classification.userAct, {
      exemplarTemplateId: "stressed",
      forceAllowQuestion: false,
      lastBotAct: "suggested_break",
    });
  }

  if (classification.userAct === "express_uncertainty") {
    return decide(
      "normalize_uncertainty",
      emotion,
      state,
      classification.userAct,
      {
        exemplarTemplateId: "uncertainty_ok",
        forceAllowQuestion: false,
      },
    );
  }

  if (classification.userAct === "deflect") {
    return decide("sit_with", emotion, state, classification.userAct, {
      exemplarTemplateId: "presence",
      forceAllowQuestion: false,
    });
  }

  // Affirm progress when user acknowledges a reframe
  if (
    AFFIRM_PROGRESS_RE.test(userMessage) &&
    state.lastBotAct !== "none" &&
    state.arc !== "opening"
  ) {
    return decide("affirm_progress", emotion, state, classification.userAct, {
      exemplarTemplateId: "prompt_elaborate",
    });
  }

  // Accept / decline offers after coping was suggested
  if (
    classification.userAct === "accept_offer" &&
    (state.lastBotAct === "suggested_break" ||
      state.lastBotAct === "offer_coping")
  ) {
    return decide("affirm_progress", emotion, state, classification.userAct, {
      exemplarTemplateId: "stressed",
    });
  }

  if (classification.userAct === "decline_offer") {
    return decide("sit_with", emotion, state, classification.userAct, {
      exemplarTemplateId: "presence",
      forceAllowQuestion: false,
    });
  }

  // Never close after emotional disclosure
  if (
    (classification.templateId === "done" ||
      classification.templateId === "goodbye") &&
    emotionalDisclosure
  ) {
    return decide("validate", emotion === "neutral" ? "sadness" : emotion, state, classification.userAct, {
      exemplarTemplateId: "sad",
    });
  }

  // Social / greeting
  if (classification.userAct === "social") {
    const tid = classification.templateId ?? "greeting";
    const act = templateToAct(tid);
    if (act === "close" && emotionalDisclosure) {
      return decide("validate", emotion, state, classification.userAct, {
        exemplarTemplateId: emotionToTemplate(emotion),
      });
    }
    return decide(act, emotion, state, classification.userAct, {
      exemplarTemplateId: tid,
      forceAllowQuestion: act === "greet",
    });
  }

  // First feeling disclosure → validate (with optional invite via allowQuestion)
  if (classification.userAct === "disclose_feeling") {
    if (!hasValidated(state)) {
      return decide("validate", emotion, state, classification.userAct, {
        exemplarTemplateId:
          classification.templateId &&
          ["sad", "anxious", "stressed", "angry", "depressed", "worthless"].includes(
            classification.templateId,
          )
            ? classification.templateId
            : emotionToTemplate(emotion),
      });
    }
    // Already validated — reflect facts or explore under budget
    if (state.facts.length > 0) {
      return decide("reflect", emotion, state, classification.userAct, {
        exemplarTemplateId: emotionToTemplate(emotion),
      });
    }
    return decide("explore", emotion, state, classification.userAct, {
      exemplarTemplateId: "prompt_elaborate",
    });
  }

  // Elaborate with new content → reflect if facts, else explore
  if (classification.userAct === "elaborate") {
    if (state.facts.length > 0 && state.lastBotAct !== "reflect") {
      return decide("reflect", emotion, state, classification.userAct, {
        exemplarTemplateId: emotionToTemplate(emotion),
      });
    }
    return decide("explore", emotion, state, classification.userAct, {
      exemplarTemplateId: "prompt_elaborate",
    });
  }

  // Template hint (non-done)
  if (classification.templateId) {
    const act = templateToAct(classification.templateId);
    if (act === "close" && emotionalDisclosure) {
      return decide("validate", emotion === "neutral" ? "sadness" : emotion, state, classification.userAct, {
        exemplarTemplateId: "sad",
      });
    }
    // Never start with offer_coping from stressed template — validate first
    if (act === "validate" || classification.templateId === "stressed") {
      if (!hasValidated(state)) {
        return decide("validate", emotion, state, classification.userAct, {
          exemplarTemplateId:
            classification.templateId === "stressed"
              ? "sad"
              : classification.templateId,
        });
      }
    }
    return decide(act, emotion, state, classification.userAct, {
      exemplarTemplateId: classification.templateId,
    });
  }

  // Soft emotional unknown → explore under budget, never NO_INFO
  if (
    classification.userAct === "unknown" ||
    EMOTIONAL.has(classification.emotion)
  ) {
    if (!hasValidated(state) && EMOTIONAL.has(classification.emotion)) {
      return decide("validate", emotion, state, classification.userAct, {
        exemplarTemplateId: emotionToTemplate(emotion),
      });
    }
    return decide("explore", emotion, state, classification.userAct, {
      exemplarTemplateId: "prompt_elaborate",
    });
  }

  return decide("explore", "neutral", state, classification.userAct, {
    exemplarTemplateId: "prompt_elaborate",
  });
}

/** @deprecated Use selectDecision */
export function selectResponse(
  classification: Classification,
  state: DialogueState,
  _sessionId: string,
  _messageIndex: number,
  userMessage: string,
): PolicyDecision {
  return selectDecision(classification, state, userMessage);
}
