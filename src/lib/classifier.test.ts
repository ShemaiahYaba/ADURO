import { describe, it, expect, vi, afterEach } from "vitest";
import { classify } from "./classifier";
import { selectResponse } from "./dialogue-policy";

describe("classifier", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps skeptical follow-up to express_doubt in stress flow", async () => {
    const state = {
      activeFlow: "stress_support" as const,
      phase: "stressed_disclosed",
      lastBotAct: "suggested_break",
    };

    const result = await classify("are you sure?", [], state);
    expect(result.userAct).toBe("express_doubt");

    const response = selectResponse(
      result,
      state,
      "session",
      1,
      "are you sure?",
    );
    expect(response.text.toLowerCase()).toMatch(/break|rest|recharge/);
  });
});
