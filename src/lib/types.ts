export type Intent = {
  tag: string;
  patterns: string[];
  responses: string[];
};

export type IntentsFile = {
  intents: Intent[];
};

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

export type RouteType = "emotional" | "factual" | "conversational" | "unknown";

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type PatternMatchResult =
  | {
      matched: true;
      tag: string;
      routeType: RouteType;
      confidence: number;
    }
  | { matched: false };

export type RouteResult = {
  intentTag: string;
  routeType: RouteType;
  emotion: Emotion;
  confidence: number;
};

export type SafetyResult =
  | { handled: true; text: string; emotion: Emotion }
  | { handled: false };

export type PipelineResult = {
  text: string;
  emotion: Emotion;
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
