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

describe("dialogue-policy: earned coping", () => {
  const stuck = (partial: Partial<DialogueState> = {}) =>
    state({
      arc: "understanding",
      covered: ["validate"],
      lastBotAct: "reflect",
      facts: ["partner was unfaithful"],
      stuckTurns: 2,
      ...partial,
    });

  it("offers coping once the user is heard but stuck", () => {
    const decision = selectDecision(
      base({ userAct: "express_uncertainty" }),
      stuck(),
      "i'm not exactly sure",
    );
    expect(decision.act).toBe("offer_coping");
    expect(decision.allowQuestion).toBe(false);
  });

  it("marks the suggestion so a later doubt can be answered", () => {
    const decision = selectDecision(
      base({ userAct: "express_uncertainty" }),
      stuck(),
      "i'm not exactly sure",
    );
    expect(decision.nextState.lastBotAct).toBe("suggested_break");
  });

  it("does not offer coping before the user has been validated", () => {
    const decision = selectDecision(
      base({ userAct: "express_uncertainty" }),
      stuck({ covered: [] }),
      "i'm not exactly sure",
    );
    expect(decision.act).not.toBe("offer_coping");
  });

  it("does not offer coping before the user has disclosed anything", () => {
    const decision = selectDecision(
      base({ userAct: "express_uncertainty" }),
      stuck({ facts: [] }),
      "i'm not exactly sure",
    );
    expect(decision.act).not.toBe("offer_coping");
  });

  it("does not offer coping while the conversation is still moving", () => {
    const decision = selectDecision(
      base({ userAct: "express_uncertainty" }),
      stuck({ stuckTurns: 1 }),
      "i'm not exactly sure",
    );
    expect(decision.act).toBe("normalize_uncertainty");
  });

  it("offers coping at most once per conversation", () => {
    const decision = selectDecision(
      base({ userAct: "express_uncertainty" }),
      stuck({ covered: ["validate", "offer_coping"] }),
      "I really don't know",
    );
    expect(decision.act).not.toBe("offer_coping");
  });
});

describe("dialogue-policy: rationale reachability", () => {
  it("explains a suggestion made on the previous turn", () => {
    const decision = selectDecision(
      base({ userAct: "express_doubt" }),
      state({ lastBotAct: "suggested_break", facts: ["feeling jaded"] }),
      "really? how would that help",
    );
    expect(decision.act).toBe("explain_rationale");
  });

  it("explains a suggestion made a couple of turns back", () => {
    const decision = selectDecision(
      base({ userAct: "express_doubt" }),
      state({
        lastBotAct: "normalize_uncertainty",
        lastSuggestion: "offer_coping",
        facts: ["feeling jaded"],
      }),
      "really? how would that help",
    );
    expect(decision.act).toBe("explain_rationale");
  });

  it("never defends a suggestion it did not make", () => {
    const decision = selectDecision(
      base({ userAct: "express_doubt" }),
      state({ lastBotAct: "validate", facts: ["went through a breakup"] }),
      "really? how does that help",
    );
    expect(decision.act).not.toBe("explain_rationale");
    expect(decision.act).toBe("reflect");
  });
});

describe("dialogue-policy: exemplar coherence", () => {
  it("remaps the exemplar when rotation changes the act", () => {
    const decision = selectDecision(
      base({
        emotion: "sadness",
        userAct: "elaborate",
        facts: ["went through a breakup"],
      }),
      state({
        arc: "understanding",
        lastBotAct: "explore",
        covered: ["validate", "explore"],
        facts: ["went through a breakup"],
        consecutiveQuestions: 2,
      }),
      "she moved out last week",
    );
    expect(decision.act).toBe("reflect");
    expect(decision.exemplarTemplateId).toBe("sad");
  });
});
