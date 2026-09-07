import { describe, it, expect } from "vitest";
import {
  checkSafety,
  hadEmotionalDistress,
  isClosingMessage,
  isHopelessnessMessage,
} from "./safety";
import { INITIAL_DIALOGUE_STATE } from "./types";

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
    expect(checkSafety("What's the capital of France?").handled).toBe(true);
    expect(checkSafety("How do I cook Jollof rice?").handled).toBe(true);
    expect(checkSafety("Explain the OSI model").handled).toBe(true);
    expect(checkSafety("Write me a Python script").handled).toBe(true);
    expect(checkSafety("Recommend a movie to watch").handled).toBe(true);
  });

  it("refuses arithmetic and calculation requests", () => {
    expect(checkSafety("what's 1+1").handled).toBe(true);
    expect(checkSafety("What is 2+2?").handled).toBe(true);
    expect(checkSafety("can you add 1+1?").handled).toBe(true);
    expect(checkSafety("Add 5 and 3").handled).toBe(true);
    expect(checkSafety("what's 10 times 5").handled).toBe(true);
    expect(checkSafety("Calculate 100 divided by 4").handled).toBe(true);
    expect(checkSafety("multiply 7*8").handled).toBe(true);
    expect(checkSafety("5-2").handled).toBe(true);
  });

  it("catches common crisis misspellings", () => {
    expect(checkSafety("I'm feeling sucidal").handled).toBe(true);
    expect(checkSafety("I want to committ suicide").handled).toBe(true);
    expect(checkSafety("I might killl myself").handled).toBe(true);
  });

  it("detects closing messages", () => {
    expect(isClosingMessage("Thanks, talk to you later")).toBe(true);
    expect(isClosingMessage("That's all for now")).toBe(true);
    expect(isClosingMessage("See you")).toBe(true);
    expect(isClosingMessage("I'm done")).toBe(true);
  });

  it("does not treat emotional that's all as closing", () => {
    expect(
      isClosingMessage("She cheated that's all what should I do?"),
    ).toBe(false);
  });

  it("tracks emotional distress in dialogue state", () => {
    expect(hadEmotionalDistress(INITIAL_DIALOGUE_STATE)).toBe(false);
    expect(
      hadEmotionalDistress({
        ...INITIAL_DIALOGUE_STATE,
        covered: ["validate"],
        arc: "surfacing",
      }),
    ).toBe(true);
  });

  it("detects hopelessness", () => {
    expect(isHopelessnessMessage("I feel completely hopeless.")).toBe(true);
  });

  it("passes normal emotional messages through", () => {
    const result = checkSafety("I feel really anxious about my exams");
    expect(result.handled).toBe(false);
  });

  it("passes emotional wellness context about math through", () => {
    // These contain numbers/arithmetic but have emotional wellness cues
    expect(checkSafety("I'm stressed I can't even add 1+1 anymore").handled).toBe(false);
    expect(checkSafety("I feel dumb because I failed my math test").handled).toBe(false);
    expect(checkSafety("I'm anxious about not understanding math").handled).toBe(false);
  });

  it("passes misspelled emotional wellness messages through", () => {
    expect(checkSafety("I'm feeling anxeity about work").handled).toBe(false);
    expect(checkSafety("I feel hopless lately").handled).toBe(false);
  });
});
