import { describe, it, expect } from "vitest";
import { buildRealizeSystemPrompt } from "./realize";
import { INITIAL_DIALOGUE_STATE } from "./types";
import type { PolicyDecision } from "./types";

describe("realize prompt assembly", () => {
  it("includes act contract, facts, and style rules", () => {
    const decision: PolicyDecision = {
      act: "validate",
      emotion: "sadness",
      exemplarTemplateId: "sad",
      nextState: {
        ...INITIAL_DIALOGUE_STATE,
        facts: ["partner was unfaithful", "went through a breakup"],
        covered: ["greet"],
        turnCount: 2,
      },
    };

    const prompt = buildRealizeSystemPrompt(
      decision,
      decision.nextState,
      "She cheated that's all what should I do?",
    );

    expect(prompt).toContain("validate");
    expect(prompt).toContain("Acknowledge the specific thing");
    expect(prompt).toContain("partner was unfaithful");
    expect(prompt).toContain("went through a breakup");
    expect(prompt).toContain("1–3 sentences");
    expect(prompt).toContain("Never diagnose");
    expect(prompt).toContain("greet");
    expect(prompt).toContain("Tone exemplars");
  });
});
