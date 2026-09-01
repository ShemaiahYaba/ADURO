import { describe, it, expect, beforeEach } from "vitest";
import { patternMatch, resetPatternMatchCache } from "./pattern-match";

describe("pattern-match", () => {
  beforeEach(() => {
    resetPatternMatchCache();
  });

  it("matches greetings", () => {
    const result = patternMatch("Hi");
    expect(result.matched).toBe(true);
    if (result.matched) expect(result.tag).toBe("greeting");
  });

  it("matches factual depression question", () => {
    const result = patternMatch("What is Depression?");
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.tag).toBe("fact-3");
      expect(result.routeType).toBe("factual");
    }
  });

  it("matches emotional stress", () => {
    const result = patternMatch("I am so stressed out");
    expect(result.matched).toBe(true);
    if (result.matched) expect(result.tag).toBe("stressed");
  });

  it("does not match off-topic as mental health", () => {
    const result = patternMatch("Who won the World Cup?");
    expect(result.matched).toBe(false);
  });
});
