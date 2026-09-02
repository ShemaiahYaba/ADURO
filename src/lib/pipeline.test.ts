import { describe, it, expect, vi, beforeEach } from "vitest";
import * as classifier from "./classifier";
import { runPipeline } from "./pipeline";
import { resetPatternMatchCache } from "./pattern-match";
import { resetKbCache } from "./knowledge-base";
import { INITIAL_DIALOGUE_STATE } from "./types";

describe("pipeline", () => {
  beforeEach(() => {
    resetPatternMatchCache();
    resetKbCache();
    vi.restoreAllMocks();
  });

  it("handles crisis", async () => {
    const result = await runPipeline("I want to die", "test-session", 0, []);
    expect(result.emotion).toBe("crisis");
    expect(result.text).toContain("MANI");
    expect(result.dialogueState).toEqual(INITIAL_DIALOGUE_STATE);
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
    expect(result.text.toLowerCase()).toMatch(/tell me more|what's on your mind|go on|listening/);
  });

  it("handles informal stress and enters stress flow", async () => {
    const result = await runPipeline(
      "I'm feeling a bit stressed",
      "test-session",
      0,
      [],
    );
    expect(result.emotion).toBe("stress");
    expect(result.dialogueState.activeFlow).toBe("stress_support");
    expect(result.text.toLowerCase()).not.toContain("not sure i understood");
  });

  it("handles elaborate follow-up in stress flow", async () => {
    const state = {
      activeFlow: "stress_support" as const,
      phase: "stressed_disclosed",
      lastBotAct: "asked_cause",
    };
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
      state,
    );
    expect(result.text.toLowerCase()).not.toContain("not sure i understood");
  });

  it("handles factual question via pattern-match", async () => {
    const result = await runPipeline("Define Mental Health", "test-session", 0, []);
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

  it("routes not really in stress flow to tips declined", async () => {
    const state = {
      activeFlow: "stress_support" as const,
      phase: "offered_tips",
      lastBotAct: "offered_learn_more",
    };
    const result = await runPipeline("not really", "test-session", 1, [], state);
    expect(result.text.toLowerCase()).toContain("learn more");
    expect(result.text.toLowerCase()).not.toContain("meditation");
  });

  it("returns break rationale after skeptical follow-up", async () => {
    const state = {
      activeFlow: "stress_support" as const,
      phase: "stressed_disclosed",
      lastBotAct: "suggested_break",
    };
    const result = await runPipeline("are you sure?", "test-session", 2, [], state);
    expect(result.text.toLowerCase()).toMatch(/break|rest|recharge/);
    expect(result.text.toLowerCase()).not.toMatch(/meditation/);
  });

  it("returns meditation rationale when asked why after offer", async () => {
    const state = {
      activeFlow: "stress_support" as const,
      phase: "offered_meditation",
      lastBotAct: "offered_meditation",
    };
    const result = await runPipeline(
      "why meditation",
      "test-session",
      3,
      [],
      state,
    );
    expect(result.text.toLowerCase()).toMatch(/meditation|breath|breathing/);
    expect(result.text.toLowerCase()).not.toContain("within your control");
  });
});
