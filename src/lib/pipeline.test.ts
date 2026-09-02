import { describe, it, expect, beforeEach } from "vitest";
import { runPipeline } from "./pipeline";
import { resetPatternMatchCache } from "./pattern-match";
import { resetKbCache } from "./knowledge-base";

describe("pipeline", () => {
  beforeEach(() => {
    resetPatternMatchCache();
    resetKbCache();
  });

  it("handles crisis without gateway", async () => {
    const result = await runPipeline("I want to die", "test-session", 0, []);
    expect(result.emotion).toBe("crisis");
    expect(result.text).toContain("MANI");
  });

  it("handles greeting via pattern-match", async () => {
    const result = await runPipeline("Hello", "test-session", 0, []);
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.emotion).toBe("neutral");
  });

  it("handles informal stress without gateway", async () => {
    const result = await runPipeline(
      "I'm feeling a bit stressed",
      "test-session",
      0,
      [],
    );
    expect(result.emotion).toBe("stress");
    expect(result.text.toLowerCase()).not.toContain("not sure i understood");
  });

  it("handles contextual follow-up without gateway", async () => {
    const history = [
      {
        role: "assistant" as const,
        content: "I am sorry to hear that. What is the reason behind this?",
      },
    ];
    const result = await runPipeline("just work", "test-session", 2, history);
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

  it("routes not really to no-approach when learn-more was offered", async () => {
    const history = [
      {
        role: "assistant" as const,
        content:
          "Would you like to learn more about that?",
      },
    ];
    const result = await runPipeline("not really", "test-session", 1, history);
    expect(result.text.toLowerCase()).toContain("learn more");
    expect(result.text.toLowerCase()).not.toContain("meditation");
  });

  it("does not pitch meditation after skeptical follow-up to break advice", async () => {
    const history = [
      {
        role: "assistant" as const,
        content: "Give yourself a break. Go easy on yourself.",
      },
    ];
    const result = await runPipeline("are you sure?", "test-session", 2, history);
    expect(result.text.toLowerCase()).not.toContain("meditation");
    expect(result.text.toLowerCase()).not.toContain("user-agree");
  });

  it("does not return user-meditation closure for feel-better without flow", async () => {
    const result = await runPipeline(
      "I feel better now",
      "test-session",
      0,
      [],
    );
    expect(result.text.toLowerCase()).not.toContain("within your control");
  });
});
