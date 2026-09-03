import { describe, it, expect, vi, afterEach } from "vitest";
import { classify } from "./classifier";
import { selectDecision } from "./dialogue-policy";
import { INITIAL_DIALOGUE_STATE } from "./types";

describe("classifier", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps skeptical follow-up to express_doubt in stress flow", async () => {
    const state = {
      ...INITIAL_DIALOGUE_STATE,
      activeFlow: "stress_support" as const,
      phase: "stressed_disclosed",
      lastBotAct: "suggested_break" as const,
    };

    const result = await classify("are you sure?", [], state);
    expect(result.userAct).toBe("express_doubt");
    expect(result.facts).toBeDefined();

    const decision = selectDecision(result, state, "are you sure?");
    expect(decision.act).toBe("explain_rationale");
    expect(decision.exemplarTemplateId).toBe("break_rationale");
  });
});
