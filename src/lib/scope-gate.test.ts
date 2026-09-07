import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OFF_TOPIC_REFUSAL } from "./constants";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  isConfigured: vi.fn(() => true),
}));

vi.mock("ai", () => ({
  generateText: mocks.generateText,
  Output: { object: (opts: unknown) => opts },
}));

vi.mock("./openai", () => ({
  isOpenAiConfigured: () => mocks.isConfigured(),
  scopeModel: () => "mock-scope-model",
}));

const { checkScope, isScopeGateEnabled, stripSocialOpener } =
  await import("./scope-gate");

describe("scope-gate", () => {
  beforeEach(() => {
    mocks.generateText.mockReset();
    mocks.isConfigured.mockReturnValue(true);
    vi.stubEnv("ADURO_SCOPE_GATE", "enabled");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("strips social openers before judging", () => {
    expect(stripSocialOpener("HEYY ADURO, WHO IS ODUDUWA")).toBe(
      "WHO IS ODUDUWA",
    );
    expect(stripSocialOpener("hey aduro, what's 1+1")).toBe("what's 1+1");
    expect(stripSocialOpener("I'm sad")).toBe("I'm sad");
  });

  it("is enabled by default when configured and not explicitly disabled", () => {
    vi.stubEnv("ADURO_SCOPE_GATE", "");
    expect(isScopeGateEnabled()).toBe(true);
  });

  it("can be disabled via env", () => {
    vi.stubEnv("ADURO_SCOPE_GATE", "disabled");
    expect(isScopeGateEnabled()).toBe(false);
  });

  it("refuses when the LLM marks out of scope with enough confidence", async () => {
    mocks.generateText.mockResolvedValue({
      output: { inScope: false, confidence: 0.92, reason: "pure arithmetic" },
    });

    const result = await checkScope("tell me a random fact");
    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.emotion).toBe("off_topic");
      expect(result.text).toBe(OFF_TOPIC_REFUSAL);
    }
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
  });

  it("refuses via heuristic even if the LLM wrongly marks in-scope", async () => {
    // This is the Oduduwa failure mode: greeting + trivia, soft LLM.
    mocks.generateText.mockResolvedValue({
      output: {
        inScope: true,
        confidence: 0.9,
        reason: "friendly greeting / curiosity",
      },
    });

    const result = await checkScope("HEYY ADURO, WHO IS ODUDUWA");
    expect(result.handled).toBe(true);
  });

  it("lets emotional wellness through even if numbers appear", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        inScope: true,
        confidence: 0.9,
        reason: "math anxiety / stress disclosure",
      },
    });

    const result = await checkScope(
      "I'm stressed I can't even add 1+1 anymore",
    );
    expect(result.handled).toBe(false);
  });

  it("does not refuse wellness vocabulary definitions when LLM says in-scope", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        inScope: true,
        confidence: 0.95,
        reason: "mental health education",
      },
    });

    const result = await checkScope("CAN YOU DEFINE EMOTION");
    expect(result.handled).toBe(false);
  });

  it("falls back to heuristic when the gate is disabled", async () => {
    vi.stubEnv("ADURO_SCOPE_GATE", "disabled");

    const refused = await checkScope("what's 1+1");
    expect(refused.handled).toBe(true);

    const allowed = await checkScope(
      "I'm stressed I can't even add 1+1 anymore",
    );
    expect(allowed.handled).toBe(false);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("falls back to heuristic when the LLM call throws", async () => {
    mocks.generateText.mockRejectedValue(new Error("network"));

    const result = await checkScope("what's 1+1");
    expect(result.handled).toBe(true);
  });

  it("passes recent history into the model for context", async () => {
    mocks.generateText.mockResolvedValue({
      output: { inScope: true, confidence: 0.88 },
    });

    await checkScope("yeah", [
      { role: "user", content: "My babe broke up with me" },
      { role: "assistant", content: "That sounds really heavy." },
    ]);

    const call = mocks.generateText.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string }>;
    };
    // Short wellness continuation short-circuits before LLM
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("allows short continuations of a wellness thread without refusing", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        inScope: false,
        confidence: 0.95,
        reason: "no emotional framing",
      },
    });

    const result = await checkScope("JUST CURIOUS", [
      { role: "user", content: "CAN YOU DEFINE EMOTION FOR ME?" },
      {
        role: "assistant",
        content: "Emotions can be complex. What prompted your interest?",
      },
    ]);

    expect(result.handled).toBe(false);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("still refuses short off-topic asks mid-thread via heuristic", async () => {
    const result = await checkScope("what's 1+1", [
      { role: "user", content: "I'm feeling sad" },
      { role: "assistant", content: "I'm here with you." },
    ]);
    expect(result.handled).toBe(true);
  });
});
