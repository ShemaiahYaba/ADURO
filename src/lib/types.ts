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

export type Classification = {
  emotion: Emotion;
  userAct: UserAct;
  templateId?: string;
  topic?: string;
  confidence: number;
};

export type DialogueState = {
  activeFlow: "none" | "stress_support";
  phase: string;
  lastBotAct: string;
};

export const INITIAL_DIALOGUE_STATE: DialogueState = {
  activeFlow: "none",
  phase: "idle",
  lastBotAct: "none",
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
