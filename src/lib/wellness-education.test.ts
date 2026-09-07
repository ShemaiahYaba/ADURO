import { describe, it, expect } from "vitest";
import {
  historySuggestsWellnessThread,
  isShortContinuation,
  isWellnessEducationAsk,
} from "./wellness-education";
import { selectDecision } from "./dialogue-policy";
import { INITIAL_DIALOGUE_STATE } from "./types";

describe("wellness-education detection", () => {
  it.each([
    "CAN YOU DEFINE EMOTION FOR ME?",
    "what is anxiety",
    "explain burnout",
    "tell me about depression",
    "what causes feeling jaded",
  ])("detects education ask: %s", (msg) => {
    expect(isWellnessEducationAsk(msg)).toBe(true);
  });

  it.each([
    "who is Oduduwa",
    "what's 1+1",
    "I'm feeling sad",
    "JUST CURIOUS",
  ])("rejects non-education: %s", (msg) => {
    expect(isWellnessEducationAsk(msg)).toBe(false);
  });

  it("treats short replies as continuations", () => {
    expect(isShortContinuation("JUST CURIOUS")).toBe(true);
    expect(isShortContinuation("yeah")).toBe(true);
    expect(isShortContinuation("my babe broke up with me last week")).toBe(
      false,
    );
  });

  it("detects wellness history", () => {
    expect(
      historySuggestsWellnessThread([
        { role: "user", content: "CAN YOU DEFINE EMOTION FOR ME?" },
        { role: "assistant", content: "Emotions can be complex." },
      ]),
    ).toBe(true);
    expect(
      historySuggestsWellnessThread([
        { role: "user", content: "what's the capital of France" },
      ]),
    ).toBe(false);
  });
});

describe("policy: wellness education answers", () => {
  it("answers define-emotion instead of only exploring", () => {
    const decision = selectDecision(
      {
        emotion: "neutral",
        userAct: "factual_question",
        facts: [],
        confidence: 0.9,
      },
      INITIAL_DIALOGUE_STATE,
      "CAN YOU DEFINE EMOTION FOR ME?",
    );
    expect(decision.act).toBe("answer_fact");
    expect(decision.allowQuestion).toBe(true);
  });
});
