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

  // Diagnosis handling stays fully deterministic, so these phrasings must be
  // caught here rather than relying on the generation layer to decline.
  it.each([
    "is what i'm feeling depression?",
    "do you think i have depression?",
    "could i be depressed?",
    "is this clinical depression",
  ])("refuses softer self-diagnosis phrasing: %s", (message) => {
    expect(checkSafety(message).handled).toBe(true);
  });

  // The inverse matters just as much: refusing these would break the very
  // conversations Aduro exists to hold.
  it.each([
    "i think i'm depressed and i don't know what to do",
    "do you think i should tell her how i feel",
    "do you think i have a chance with her",
    "she cheated that's all what should I do?",
  ])("does not refuse emotional disclosure: %s", (message) => {
    expect(checkSafety(message).handled).toBe(false);
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
