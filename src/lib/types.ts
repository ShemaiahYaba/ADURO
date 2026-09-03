export type Emotion =
  | "sadness"
  | "anger"
  | "anxiety"
  | "stress"
  | "support"
  | "neutral"
  | "crisis"
  | "factual"
  | "off_topic"
  | "happy"
  | "grief";

export type UserAct =
  | "disclose_feeling"
  | "elaborate"
  | "accept_offer"
  | "decline_offer"
  | "ask_rationale"
  | "express_doubt"
  | "factual_question"
  | "social"
  | "request_advice"
  | "ask_about_situation"
  | "express_uncertainty"
  | "deflect"
  | "unknown";

/** Policy decision — what the bot should do this turn. */
export type BotAct =
  | "greet"
  | "validate"
  | "reflect"
  | "explore"
  | "offer_coping"
  | "explain_rationale"
  | "affirm_progress"
  | "answer_directly"
  | "normalize_uncertainty"
  | "sit_with"
  | "answer_fact"
  | "close";

export type DialogueArc =
  | "opening"
  | "surfacing"
  | "understanding"
  | "supporting"
  | "closing";

/**
 * Flow markers retained for rationale lookup when offering coping,
 * plus BotActs.
 */
export type LastBotAct =
  | BotAct
  | "none"
  | "suggested_break"
  | "asked_cause"
  | "offered_tips"
  | "offered_learn_more"
  | "offered_meditation"
  | "guided_meditation";

export type RealizationSource =
  | "generated"
  | "regenerated"
  | "template_fallback"
  | "template"
  | "guard_blocked"
  | "kb"
  | "safety";

export type Classification = {
  emotion: Emotion;
  userAct: UserAct;
  facts: string[];
  templateId?: string;
  topic?: string;
  confidence: number;
};

export type DialogueState = {
  arc: DialogueArc;
  lastBotAct: LastBotAct;
  facts: string[];
  covered: BotAct[];
  turnCount: number;
  /** Bot's own recent replies, newest last, cap 3. */
  recentBotTexts: string[];
  /** A question the bot asked that the user has not answered. */
  openQuestion: string | null;
  /** Consecutive bot turns containing a question. */
  consecutiveQuestions: number;
  /** Consecutive user non-answers (uncertainty or deflection). */
  consecutiveNonAnswers: number;
  /** Consecutive turns that surfaced no new facts. Gates earned coping. */
  stuckTurns: number;
  /**
   * The last suggestion the bot made, if any. Separate from `lastBotAct`
   * because doubt often arrives a turn or two after the suggestion.
   */
  lastSuggestion: LastBotAct | null;
};

export const INITIAL_DIALOGUE_STATE: DialogueState = {
  arc: "opening",
  lastBotAct: "none",
  facts: [],
  covered: [],
  turnCount: 0,
  recentBotTexts: [],
  openQuestion: null,
  consecutiveQuestions: 0,
  consecutiveNonAnswers: 0,
  stuckTurns: 0,
  lastSuggestion: null,
};

export type PolicyDecision = {
  act: BotAct;
  /** Whether realization may end with one gentle question. */
  allowQuestion: boolean;
  exemplarTemplateId?: string;
  emotion: Emotion;
  nextState: DialogueState;
  /** Verbatim text for KB / safety paths that skip realization. */
  verbatimText?: string;
};

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type PatternMatchResult =
  | {
      matched: true;
      templateId: string;
      routeType: "emotional" | "factual" | "conversational";
      confidence: number;
    }
  | { matched: false };

export type SafetyResult =
  | { handled: true; text: string; emotion: Emotion }
  | { handled: false };

export type PipelineResult = {
  text: string;
  emotion: Emotion;
  dialogueState: DialogueState;
  source?: RealizationSource;
  /** Whether the reply referenced a known fact (metric). */
  factReferenced?: boolean;
  /** Policy act chosen this turn (for logs / harness). */
  act?: BotAct;
  allowQuestion?: boolean;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
};

export type KbEntry = {
  tag: string;
  response: string;
  patternText: string;
  embedding: number[] | null;
};

export type ResponseTemplate = {
  emotion: Emotion;
  responses: string[];
  patterns: string[];
};

export type FactsFile = {
  facts: Array<{
    id: string;
    patterns: string[];
    response: string;
  }>;
};

export type TemplatesFile = {
  templates: Record<string, ResponseTemplate & { emotion: string }>;
};

export type FlowsFile = {
  stress_support: {
    description: string;
    phases: string[];
  };
  rationaleMap: Array<{
    lastBotAct: string;
    userAct: UserAct;
    templateId: string;
  }>;
};
