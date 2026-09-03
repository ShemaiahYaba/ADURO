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
  | "answer_fact"
  | "close";

/**
 * Flow markers plus BotActs. Flow markers track stress-support phase
 * for rationale lookup; BotActs track what the realization layer did.
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
  activeFlow: "none" | "stress_support";
  phase: string;
  lastBotAct: LastBotAct;
  /** Salient user-disclosed content, max 8, FIFO. */
  facts: string[];
  /** Acts already performed this conversation. */
  covered: BotAct[];
  turnCount: number;
};

export const INITIAL_DIALOGUE_STATE: DialogueState = {
  activeFlow: "none",
  phase: "idle",
  lastBotAct: "none",
  facts: [],
  covered: [],
  turnCount: 0,
};

export type PolicyDecision = {
  act: BotAct;
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
