import { describe, it, expect } from "vitest";
import { classifyOffline } from "./classifier-offline";
import { INITIAL_DIALOGUE_STATE } from "./types";

describe("classifier-offline", () => {
  it("maps greetings to social", () => {
    const result = classifyOffline("heyyy aduro", INITIAL_DIALOGUE_STATE);
    expect(result.userAct).toBe("social");
    expect(result.templateId).toBe("greeting");
    expect(result.facts).toEqual([]);
  });

  it("maps stress disclosure to disclose_feeling", () => {
    const result = classifyOffline(
      "I'm feeling a bit stressed",
      INITIAL_DIALOGUE_STATE,
    );
    expect(result.emotion).toBe("stress");
    expect(result.userAct).toBe("disclose_feeling");
  });

  it("infers decline mid-arc", () => {
    const result = classifyOffline("not really", {
      ...INITIAL_DIALOGUE_STATE,
      arc: "supporting",
      lastBotAct: "suggested_break",
    });
    expect(result.userAct).toBe("decline_offer");
  });

  it("infers elaborate when asked for cause", () => {
    const result = classifyOffline("just work", {
      ...INITIAL_DIALOGUE_STATE,
      arc: "understanding",
      lastBotAct: "explore",
    });
    expect(result.userAct).toBe("elaborate");
  });

  it("extracts breakup/cheat facts offline", () => {
    const result = classifyOffline(
      "She cheated that's all what should I do?",
      INITIAL_DIALOGUE_STATE,
    );
    expect(
      result.facts.some((f) => /unfaithful|breakup|relationship/i.test(f)),
    ).toBe(true);
    expect(result.userAct).toBe("request_advice");
  });

  it("detects express_uncertainty", () => {
    const result = classifyOffline("i'm not exactly sure", {
      ...INITIAL_DIALOGUE_STATE,
      arc: "understanding",
      lastBotAct: "explore",
    });
    expect(result.userAct).toBe("express_uncertainty");
  });

  it("detects deflect", () => {
    const result = classifyOffline("ice cream i guess", {
      ...INITIAL_DIALOGUE_STATE,
      arc: "understanding",
      lastBotAct: "normalize_uncertainty",
    });
    expect(result.userAct).toBe("deflect");
  });
});
