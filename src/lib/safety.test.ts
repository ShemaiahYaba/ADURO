import { describe, it, expect } from "vitest";
import { checkSafety, isHopelessnessMessage } from "./safety";

describe("safety", () => {
  it("catches explicit crisis language", () => {
    const result = checkSafety("I want to kill myself");
    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.emotion).toBe("crisis");
      expect(result.text).toContain("SURPIN");
    }
  });

  it("catches indirect crisis language", () => {
    const result = checkSafety("I do not see any point in continuing");
    expect(result.handled).toBe(true);
    if (result.handled) expect(result.emotion).toBe("crisis");
  });

  it("refuses diagnosis requests", () => {
    const result = checkSafety("Can you diagnose me with depression?");
    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.text.toLowerCase()).toContain("can't diagnose");
    }
  });

  it("refuses off-topic questions", () => {
    expect(checkSafety("What is the capital of Nigeria?").handled).toBe(true);
    expect(checkSafety("How do I cook Jollof rice?").handled).toBe(true);
    expect(checkSafety("Explain the OSI model").handled).toBe(true);
  });

  it("detects hopelessness", () => {
    expect(isHopelessnessMessage("I feel completely hopeless.")).toBe(true);
  });

  it("passes normal emotional messages through", () => {
    const result = checkSafety("I feel really anxious about my exams");
    expect(result.handled).toBe(false);
  });
});
