import { describe, it, expect } from "vitest";
import { selectDecision } from "./dialogue-policy";
import { INITIAL_DIALOGUE_STATE } from "./types";
import type { Classification, DialogueState } from "./types";

const base = (overrides: Partial<Classification>): Classification => ({
  emotion: "neutral",
  userAct: "unknown",
  facts: [],
  confidence: 0.8,
  ...overrides,
});

function state(partial: Partial<DialogueState> = {}): DialogueState {
  return { ...INITIAL_DIALOGUE_STATE, ...partial };
}

describe("dialogue-policy (discourse)", () => {
  it("validates first feeling disclosure (not advice-first)", () => {
    const decision = selectDecision(
      base({
        emotion: "stress",
        userAct: "disclose_feeling",
        templateId: "stressed",
        facts: ["feeling jaded"],
      }),
      state(),
      "i feel so jaded",
    );
    expect(decision.act).toBe("validate");
    expect(decision.act).not.toBe("offer_coping");
  });

  it("allows question on first validate when budget permits", () => {
    const decision = selectDecision(
      base({ emotion: "sadness", userAct: "disclose_feeling", facts: [] }),
      state(),
      "I'm sad",
    );
    expect(decision.act).toBe("validate");
    expect(decision.allowQuestion).toBe(true);
  });

  it("blocks questions after consecutive questions", () => {
    const decision = selectDecision(
      base({ emotion: "sadness", userAct: "elaborate", facts: ["breakup"] }),
      state({
        arc: "understanding",
        covered: ["validate"],
        consecutiveQuestions: 2,
        lastBotAct: "explore",
      }),
      "she left",
    );
    expect(decision.allowQuestion).toBe(false);
    expect(decision.act).not.toBe("explore");
  });

  it("maps request_advice to answer_directly", () => {
    const decision = selectDecision(
      base({
        emotion: "sadness",
        userAct: "request_advice",
        facts: ["partner was unfaithful"],
      }),
      state({
        arc: "understanding",
        covered: ["validate", "explore"],
        facts: ["partner was unfaithful"],
      }),
      "what do you think i should do?",
    );
    expect(decision.act).toBe("answer_directly");
    expect(decision.allowQuestion).toBe(false);
  });

  it("maps ask_about_situation to reflect", () => {
    const decision = selectDecision(
      base({
        emotion: "sadness",
        userAct: "ask_about_situation",
        facts: ["partner was unfaithful"],
      }),
      state({
        arc: "understanding",
        covered: ["validate"],
        facts: ["partner was unfaithful"],
      }),
      "why exactly she cheated",
    );
    expect(decision.act).toBe("reflect");
    expect(decision.allowQuestion).toBe(false);
  });

  it("maps express_uncertainty to normalize_uncertainty never explore", () => {
    const decision = selectDecision(
      base({ emotion: "sadness", userAct: "express_uncertainty" }),
      state({
        arc: "understanding",
        covered: ["validate", "explore"],
        consecutiveQuestions: 1,
        lastBotAct: "explore",
      }),
      "i'm not exactly sure",
    );
    expect(decision.act).toBe("normalize_uncertainty");
    expect(decision.act).not.toBe("explore");
    expect(decision.allowQuestion).toBe(false);
  });

  it("maps deflect to sit_with", () => {
    const decision = selectDecision(
      base({ emotion: "sadness", userAct: "deflect" }),
      state({
        arc: "understanding",
        covered: ["validate", "explore", "normalize_uncertainty"],
        consecutiveNonAnswers: 1,
        lastBotAct: "normalize_uncertainty",
      }),
      "ice cream i guess",
    );
    expect(decision.act).toBe("sit_with");
    expect(decision.allowQuestion).toBe(false);
  });

  it("never closes after emotional disclosure with that's all", () => {
    const decision = selectDecision(
      base({
        emotion: "sadness",
        userAct: "elaborate",
        facts: ["partner was unfaithful"],
        templateId: "done",
      }),
      state({ arc: "surfacing", covered: ["validate"] }),
      "She cheated that's all what should I do?",
    );
    expect(decision.act).not.toBe("close");
  });

  it("returns break rationale on express_doubt after suggested_break", () => {
    const decision = selectDecision(
      base({ emotion: "stress", userAct: "express_doubt" }),
      state({
        arc: "supporting",
        lastBotAct: "suggested_break",
        covered: ["validate", "offer_coping"],
      }),
      "are you sure?",
    );
    expect(decision.act).toBe("explain_rationale");
    expect(decision.exemplarTemplateId).toBe("break_rationale");
  });

  it("does not offer coping before validate", () => {
    const decision = selectDecision(
      base({
        emotion: "stress",
        userAct: "disclose_feeling",
        templateId: "stressed",
      }),
      state(),
      "I'm so burned out",
    );
    expect(decision.act).toBe("validate");
  });
});
