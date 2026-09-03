import { describe, it, expect } from "vitest";
import { selectDecision } from "./dialogue-policy";
import { INITIAL_DIALOGUE_STATE } from "./types";
import type { Classification, DialogueState } from "./types";

const baseClassification = (
  overrides: Partial<Classification>,
): Classification => ({
  emotion: "neutral",
  userAct: "unknown",
  facts: [],
  confidence: 0.8,
  ...overrides,
});

describe("dialogue-policy", () => {
  it("starts stress flow on mental tiredness disclosure", () => {
    const classification = baseClassification({
      emotion: "stress",
      userAct: "disclose_feeling",
      templateId: "stressed",
      facts: ["feeling mentally tired"],
    });

    const decision = selectDecision(
      classification,
      INITIAL_DIALOGUE_STATE,
      "I'm feeling tired mentally",
    );

    expect(decision.nextState.activeFlow).toBe("stress_support");
    expect(decision.nextState.lastBotAct).toBe("suggested_break");
    expect(decision.act).toBe("offer_coping");
    expect(decision.exemplarTemplateId).toBe("stressed");
  });

  it("returns break rationale on express_doubt after break advice", () => {
    const state: DialogueState = {
      ...INITIAL_DIALOGUE_STATE,
      activeFlow: "stress_support",
      phase: "stressed_disclosed",
      lastBotAct: "suggested_break",
    };
    const classification = baseClassification({
      emotion: "stress",
      userAct: "express_doubt",
    });

    const decision = selectDecision(classification, state, "are you sure?");

    expect(decision.act).toBe("explain_rationale");
    expect(decision.exemplarTemplateId).toBe("break_rationale");
    expect(decision.exemplarTemplateId).not.toBe("meditation_rationale");
  });

  it("returns meditation rationale when asked why after meditation offer", () => {
    const state: DialogueState = {
      ...INITIAL_DIALOGUE_STATE,
      activeFlow: "stress_support",
      phase: "offered_meditation",
      lastBotAct: "offered_meditation",
    };
    const classification = baseClassification({
      emotion: "stress",
      userAct: "ask_rationale",
    });

    const decision = selectDecision(classification, state, "why meditation");

    expect(decision.act).toBe("explain_rationale");
    expect(decision.exemplarTemplateId).toBe("meditation_rationale");
  });

  it("never closes after emotional disclosure with that's all", () => {
    const classification = baseClassification({
      emotion: "sadness",
      userAct: "elaborate",
      facts: ["partner was unfaithful", "went through a breakup"],
      templateId: "done",
      confidence: 0.9,
    });

    const decision = selectDecision(
      classification,
      INITIAL_DIALOGUE_STATE,
      "She cheated that's all what should I do?",
    );

    expect(decision.act).not.toBe("close");
    expect(["validate", "reflect", "explore"]).toContain(decision.act);
  });

  it("affirms progress after reframe acknowledgment", () => {
    const state: DialogueState = {
      ...INITIAL_DIALOGUE_STATE,
      activeFlow: "stress_support",
      phase: "stressed_disclosed",
      lastBotAct: "suggested_break",
      covered: ["offer_coping", "explain_rationale"],
    };
    const classification = baseClassification({
      emotion: "stress",
      userAct: "elaborate",
    });

    const decision = selectDecision(
      classification,
      state,
      "wow, i never really thought about it that way",
    );

    expect(decision.act).toBe("affirm_progress");
  });

  it("explores on unknown instead of knowledge-base refusal", () => {
    const state: DialogueState = {
      ...INITIAL_DIALOGUE_STATE,
      activeFlow: "stress_support",
      phase: "probe_cause",
      lastBotAct: "asked_cause",
    };
    const classification = baseClassification({
      emotion: "stress",
      userAct: "unknown",
    });

    const decision = selectDecision(classification, state, "no, not really");

    expect(decision.act).toBe("explore");
    expect(decision.exemplarTemplateId).not.toBeUndefined();
  });

  it("validates sadness disclosure", () => {
    const classification = baseClassification({
      emotion: "sadness",
      userAct: "disclose_feeling",
      facts: ["feeling sad"],
    });

    const decision = selectDecision(
      classification,
      INITIAL_DIALOGUE_STATE,
      "I'm sad",
    );

    expect(decision.act).toBe("validate");
  });
});
