import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { INITIAL_DIALOGUE_STATE } from "./types";
import type { DialogueState, PolicyDecision } from "./types";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  isConfigured: vi.fn(() => true),
}));

vi.mock("ai", () => ({ generateText: mocks.generateText }));
vi.mock("./openai", () => ({
  isOpenAiConfigured: mocks.isConfigured,
  routerModel: () => "mock-model",
}));

const { buildRealizeSystemPrompt, realize } = await import("./realize");

/** Rejected by output-guard via the diagnosis frame. */
const BLOCKED = "You have depression.";
const CLEAN = "That sounds really painful, and it makes sense that you're reeling.";

function decision(overrides: Partial<PolicyDecision> = {}): PolicyDecision {
  return {
    act: "validate",
    emotion: "sadness",
    exemplarTemplateId: "sad",
    nextState: { ...INITIAL_DIALOGUE_STATE },
    ...overrides,
  };
}

function state(overrides: Partial<DialogueState> = {}): DialogueState {
  return { ...INITIAL_DIALOGUE_STATE, ...overrides };
}

function run(d: PolicyDecision, s: DialogueState = state()) {
  return realize(d, s, "She cheated that's all what should I do?", [], "s1", 0);
}

describe("realize prompt assembly", () => {
  it("includes act contract, facts, and style rules", () => {
    const d = decision({
      nextState: state({
        facts: ["partner was unfaithful", "went through a breakup"],
        covered: ["greet"],
        turnCount: 2,
      }),
    });

    const prompt = buildRealizeSystemPrompt(d, d.nextState, "She cheated.");

    expect(prompt).toContain("validate");
    expect(prompt).toContain("Acknowledge the specific thing");
    expect(prompt).toContain("partner was unfaithful");
    expect(prompt).toContain("went through a breakup");
    expect(prompt).toContain("1–3 sentences");
    expect(prompt).toContain("Never diagnose");
    expect(prompt).toContain("greet");
    expect(prompt).toContain("Tone exemplars");
  });

  it("does not list the current act as already covered", () => {
    const prompt = buildRealizeSystemPrompt(
      decision({ act: "validate" }),
      state({ covered: ["greet"] }),
      "She cheated.",
    );

    const coveredSection = prompt.split("Acts already covered")[1] ?? "";
    const upToNextHeading = coveredSection.split("## ")[0] ?? "";
    expect(upToNextHeading).not.toContain("validate");
  });
});

describe("realize fallback ladder", () => {
  beforeEach(() => {
    mocks.generateText.mockReset();
    mocks.isConfigured.mockReset();
    mocks.isConfigured.mockReturnValue(true);
    vi.stubEnv("ADURO_REALIZATION", "generated");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns verbatim text without generating", async () => {
    const result = await run(decision({ verbatimText: "Depression is..." }));

    expect(result.source).toBe("kb");
    expect(result.text).toBe("Depression is...");
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("never generates for answer_fact", async () => {
    const result = await run(decision({ act: "answer_fact" }));

    expect(result.source).toBe("kb");
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("uses templates when ADURO_REALIZATION=template", async () => {
    vi.stubEnv("ADURO_REALIZATION", "template");

    const result = await run(decision());

    expect(result.source).toBe("template");
    expect(result.text.length).toBeGreaterThan(0);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("uses templates when no API key is configured", async () => {
    mocks.isConfigured.mockReturnValue(false);

    const result = await run(decision());

    expect(result.source).toBe("template");
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("returns generated text when the guard passes", async () => {
    mocks.generateText.mockResolvedValue({ text: CLEAN });

    const result = await run(decision());

    expect(result.source).toBe("generated");
    expect(result.text).toBe(CLEAN);
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
  });

  it("regenerates once when the first draft is blocked", async () => {
    mocks.generateText
      .mockResolvedValueOnce({ text: BLOCKED })
      .mockResolvedValueOnce({ text: CLEAN });

    const result = await run(decision());

    expect(result.source).toBe("regenerated");
    expect(result.text).toBe(CLEAN);
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
  });

  it("falls back to a template when both drafts are blocked", async () => {
    mocks.generateText.mockResolvedValue({ text: BLOCKED });

    const result = await run(decision());

    expect(result.source).toBe("guard_blocked");
    expect(result.text).not.toBe(BLOCKED);
    expect(result.text.length).toBeGreaterThan(0);
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
  });

  it("falls back to a template when generation throws", async () => {
    mocks.generateText.mockRejectedValue(new Error("network"));

    const result = await run(decision());

    expect(result.source).toBe("template_fallback");
    expect(result.text.length).toBeGreaterThan(0);
  });
});
