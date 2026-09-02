import { describe, it, expect, beforeEach } from "vitest";
import { patternMatch, resetPatternMatchCache } from "./pattern-match";

describe("pattern-match", () => {
  beforeEach(() => {
    resetPatternMatchCache();
  });

  it("matches greetings", () => {
    const result = patternMatch("Hi");
    expect(result.matched).toBe(true);
    if (result.matched) expect(result.templateId).toBe("greeting");
  });

  it("matches factual depression question", () => {
    const result = patternMatch("What is Depression?");
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.templateId).toBe("fact-3");
      expect(result.routeType).toBe("factual");
    }
  });

  it("matches emotional stress", () => {
    const result = patternMatch("I am so stressed out");
    expect(result.matched).toBe(true);
    if (result.matched) expect(result.templateId).toBe("stressed");
  });

  it("matches informal stress phrasing", () => {
    const result = patternMatch("I'm feeling a bit stressed");
    expect(result.matched).toBe(true);
    if (result.matched) expect(result.templateId).toBe("stressed");
  });

  it("matches hey aduro greeting", () => {
    const result = patternMatch("Hey Aduro");
    expect(result.matched).toBe(true);
    if (result.matched) expect(result.templateId).toBe("greeting");
  });

  it("matches elongated hi", () => {
    const result = patternMatch("hiiii");
    expect(result.matched).toBe(true);
    if (result.matched) expect(result.templateId).toBe("greeting");
  });

  it("routes type of way to sad not scared", () => {
    const result = patternMatch("I'm feeling a type of way");
    expect(result.matched).toBe(true);
    if (result.matched) expect(result.templateId).toBe("sad");
  });

  it("does not match off-topic as mental health", () => {
    const result = patternMatch("Who won the World Cup?");
    expect(result.matched).toBe(false);
  });

  it("does not classify feel-better as flow transition template", () => {
    const result = patternMatch("I feel better now");
    if (result.matched) {
      expect(result.templateId).not.toBe("meditation_closure");
    }
  });

  it("does not match not really as casual", () => {
    const result = patternMatch("not really");
    if (result.matched) {
      expect(result.templateId).not.toBe("casual");
    }
  });
});
