import { describe, it, expect } from "vitest";
import { selectResponse } from "./dialogue-policy";
import { INITIAL_DIALOGUE_STATE } from "./types";
import type { Classification, DialogueState } from "./types";

const session = "test-session";

describe("dialogue-policy", () => {
  it("starts stress flow on mental tiredness disclosure", () => {
    const classification: Classification = {
      emotion: "stress",
      userAct: "disclose_feeling",
      templateId: "stressed",
      confidence: 0.85,
    };

    const result = selectResponse(
      classification,
      INITIAL_DIALOGUE_STATE,
      session,
      0,
      "I'm feeling tired mentally",
    );

    expect(result.dialogueState.activeFlow).toBe("stress_support");
    expect(result.dialogueState.lastBotAct).toBe("suggested_break");
    expect(result.text.toLowerCase()).toMatch(/break|easy|rest/);
  });

  it("returns break rationale on express_doubt after break advice", () => {
    const state: DialogueState = {
      activeFlow: "stress_support",
      phase: "stressed_disclosed",
      lastBotAct: "suggested_break",
    };
    const classification: Classification = {
      emotion: "stress",
      userAct: "express_doubt",
      confidence: 0.75,
    };

    const result = selectResponse(
      classification,
      state,
      session,
      1,
      "are you sure?",
    );

    expect(result.text.toLowerCase()).toMatch(/break|rest|recharge/);
    expect(result.text.toLowerCase()).not.toContain("meditation");
    expect(result.dialogueState.lastBotAct).toBe("suggested_break");
  });

  it("returns meditation rationale when asked why after meditation offer", () => {
    const state: DialogueState = {
      activeFlow: "stress_support",
      phase: "offered_meditation",
      lastBotAct: "offered_meditation",
    };
    const classification: Classification = {
      emotion: "stress",
      userAct: "ask_rationale",
      confidence: 0.8,
    };

    const result = selectResponse(
      classification,
      state,
      session,
      2,
      "why meditation",
    );

    expect(result.text.toLowerCase()).toMatch(/meditation|breath|breathing/);
    expect(result.text.toLowerCase()).not.toContain("within your control");
  });
});
