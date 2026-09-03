import { describe, it, expect, vi, beforeEach } from "vitest";
import * as classifier from "./classifier";
import { runPipeline } from "./pipeline";
import { resetPatternMatchCache } from "./pattern-match";
import { resetKbCache } from "./knowledge-base";
import { INITIAL_DIALOGUE_STATE } from "./types";
import type { DialogueState } from "./types";

function state(partial: Partial<DialogueState>): DialogueState {
  return { ...INITIAL_DIALOGUE_STATE, ...partial };
}

describe("pipeline", () => {
  beforeEach(() => {
    resetPatternMatchCache();
    resetKbCache();
    vi.restoreAllMocks();
    process.env.ADURO_REALIZATION = "template";
  });

  it("handles crisis", async () => {
    const result = await runPipeline("I want to die", "test-session", 0, []);
    expect(result.emotion).toBe("crisis");
    expect(result.text).toContain("MANI");
    expect(result.source).toBe("safety");
  });

  it("handles greeting via pattern-match", async () => {
    const result = await runPipeline("Hello", "test-session", 0, []);
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.emotion).toBe("neutral");
  });

  it("handles informal heyyy aduro greeting", async () => {
    const result = await runPipeline("heyyy aduro", "test-session", 0, []);
    expect(result.emotion).not.toBe("off_topic");
    expect(result.text.toLowerCase()).not.toContain("can't help you with that");
  });

  it("prompts elaboration for vague disclosure", async () => {
    vi.spyOn(classifier, "classify").mockResolvedValueOnce({
      emotion: "neutral",
      userAct: "disclose_feeling",
      facts: [],
      confidence: 0.88,
    });

    const result = await runPipeline(
      "but there's something though",
      "test-session",
      2,
      [
        { role: "user", content: "hey aduro" },
        { role: "assistant", content: "Hi there. What brings you here today?" },
        { role: "user", content: "I'm good" },
        { role: "assistant", content: "Oh I see. That's great." },
      ],
    );
    expect(result.text.toLowerCase()).not.toContain("can't help you with that");
    expect(result.act).toBe("validate");
  });

  it("validates stress disclosure instead of advice-first", async () => {
    const result = await runPipeline(
      "I'm feeling a bit stressed",
      "test-session",
      0,
      [],
    );
    expect(result.emotion).toBe("stress");
    expect(result.act).toBe("validate");
    expect(result.act).not.toBe("offer_coping");
  });

  it("handles elaborate follow-up without KB refusal", async () => {
    const result = await runPipeline(
      "just work",
      "test-session",
      2,
      [
        {
          role: "assistant",
          content: "What is the reason behind this?",
        },
      ],
      state({
        arc: "understanding",
        lastBotAct: "explore",
        covered: ["validate"],
        facts: ["feeling stressed"],
      }),
    );
    expect(result.text.toLowerCase()).not.toContain(
      "don't have enough information",
    );
  });

  it("handles factual question via pattern-match", async () => {
    const result = await runPipeline(
      "Define Mental Health",
      "test-session",
      0,
      [],
    );
    expect(result.emotion).toBe("factual");
    expect(result.text.toLowerCase()).toContain("well-being");
  });

  it("refuses off-topic via safety layer", async () => {
    const result = await runPipeline(
      "What is the capital of Nigeria?",
      "test-session",
      0,
      [],
    );
    expect(result.emotion).toBe("off_topic");
  });

  it("routes not really without KB refusal", async () => {
    const result = await runPipeline(
      "not really",
      "test-session",
      1,
      [],
      state({
        arc: "supporting",
        lastBotAct: "suggested_break",
        covered: ["validate", "offer_coping"],
      }),
    );
    expect(result.text.toLowerCase()).not.toContain(
      "don't have enough information",
    );
    expect(result.text.toLowerCase()).not.toContain("knowledge base");
  });

  it("returns break rationale after skeptical follow-up", async () => {
    const result = await runPipeline(
      "are you sure?",
      "test-session",
      2,
      [],
      state({
        arc: "supporting",
        lastBotAct: "suggested_break",
        covered: ["validate", "offer_coping"],
      }),
    );
    expect(result.text.toLowerCase()).toMatch(/break|rest|recharge/);
    expect(result.text.toLowerCase()).not.toMatch(/meditation/);
  });

  it("returns meditation rationale when asked why after offer", async () => {
    const result = await runPipeline(
      "why meditation",
      "test-session",
      3,
      [],
      state({
        arc: "supporting",
        lastBotAct: "offered_meditation",
        covered: ["validate", "offer_coping"],
      }),
    );
    expect(result.text.toLowerCase()).toMatch(/meditation|breath|breathing/);
  });

  it("never closes on cheated disclosure with that's all", async () => {
    vi.spyOn(classifier, "classify").mockResolvedValueOnce({
      emotion: "sadness",
      userAct: "request_advice",
      facts: ["partner was unfaithful", "went through a breakup"],
      templateId: "done",
      confidence: 0.9,
    });

    const result = await runPipeline(
      "She cheated that's all what should I do?",
      "test-session",
      3,
      [
        { role: "user", content: "I'm sad" },
        {
          role: "assistant",
          content: "Why do you think you feel this way?",
        },
        { role: "user", content: "I broke up with my babe" },
        { role: "assistant", content: "Tell me more about it." },
      ],
      state({
        arc: "understanding",
        facts: ["went through a breakup"],
        covered: ["validate", "explore"],
        turnCount: 3,
      }),
    );

    expect(result.text.toLowerCase()).not.toMatch(
      /done for today|see you later|goodbye/,
    );
    expect(result.act).toBe("answer_directly");
  });

  it("merges facts into dialogue state", async () => {
    vi.spyOn(classifier, "classify").mockResolvedValueOnce({
      emotion: "sadness",
      userAct: "disclose_feeling",
      facts: ["feeling sad"],
      confidence: 0.9,
    });

    const result = await runPipeline("I'm sad", "test-session", 0, []);
    expect(result.dialogueState.facts).toContain("feeling sad");
  });

  it("tracks recentBotTexts after a turn", async () => {
    const result = await runPipeline("Hello", "test-session", 0, []);
    expect(result.dialogueState.recentBotTexts.length).toBeGreaterThan(0);
  });
});
