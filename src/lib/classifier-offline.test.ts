import { describe, it, expect } from "vitest";
import { classifyOffline } from "./classifier-offline";
import { INITIAL_DIALOGUE_STATE } from "./types";

describe("classifier-offline", () => {
  it("maps greetings to social", () => {
    const result = classifyOffline("heyyy aduro", INITIAL_DIALOGUE_STATE);
    expect(result.userAct).toBe("social");
    expect(result.templateId).toBe("greeting");
  });

  it("maps stress disclosure to stress flow entry", () => {
    const result = classifyOffline(
      "I'm feeling a bit stressed",
      INITIAL_DIALOGUE_STATE,
    );
    expect(result.emotion).toBe("stress");
    expect(result.userAct).toBe("disclose_feeling");
  });

  it("infers decline in stress flow", () => {
    const result = classifyOffline("not really", {
      activeFlow: "stress_support",
      phase: "offered_tips",
      lastBotAct: "offered_learn_more",
    });
    expect(result.userAct).toBe("decline_offer");
  });

  it("infers elaborate when asked for cause", () => {
    const result = classifyOffline("just work", {
      activeFlow: "stress_support",
      phase: "probe_cause",
      lastBotAct: "asked_cause",
    });
    expect(result.userAct).toBe("elaborate");
  });
});
