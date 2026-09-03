import { describe, it, expect } from "vitest";
import { checkOutput } from "./output-guard";

describe("output-guard", () => {
  it("accepts a warm supportive reply", () => {
    const result = checkOutput(
      "That sounds really painful — being cheated on isn't just a breakup, it's a betrayal. Of course you're hurting.",
    );
    expect(result.ok).toBe(true);
  });

  it("accepts short exploratory question", () => {
    expect(checkOutput("What's been weighing on you most about this?").ok).toBe(
      true,
    );
  });

  it("rejects diagnosis frame", () => {
    const result = checkOutput("You have depression and need treatment.");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("diagnosis_frame");
  });

  it("rejects a diagnosis frame with an intervening qualifier", () => {
    expect(checkOutput("You might have a fairly serious disorder.").ok).toBe(
      false,
    );
  });

  it("rejects direct labelling without a frame verb", () => {
    const result = checkOutput("Honestly, you sound depressed to me.");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("diagnosis_label");
  });

  // The frame must require a named condition. Matching "you have ..." alone
  // rejected the most natural validation phrasings in this domain and pushed
  // every such turn down to the template fallback.
  it.each([
    "You have every right to feel hurt by that.",
    "You have a lot on your plate right now.",
    "You have been through something really painful.",
    "It sounds like you have so much weighing on you.",
    "You have people who care about you.",
  ])("accepts supportive validation: %s", (text) => {
    expect(checkOutput(text).ok).toBe(true);
  });

  it("accepts talking about a condition without diagnosing", () => {
    expect(
      checkOutput("Depression is more common than people think.").ok,
    ).toBe(true);
    expect(
      checkOutput("Eating disorders are treatable, and you deserve support.").ok,
    ).toBe(true);
  });

  it("rejects medication mentions", () => {
    const result = checkOutput("You should ask your doctor about Zoloft.");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("medication");
  });

  it("rejects clinical diagnosis language", () => {
    const result = checkOutput("You might be clinically diagnosed with anxiety.");
    expect(result.ok).toBe(false);
  });

  it("rejects persona break", () => {
    const result = checkOutput("As an AI, I can't feel emotions, but I care.");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("persona_break");
  });

  it("rejects unapproved phone numbers", () => {
    const result = checkOutput("Call this helpline at 555-123-4567 right away.");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unapproved_helpline");
  });

  it("allows approved SURPIN number", () => {
    const result = checkOutput(
      "If you're in crisis, please contact SURPIN at 0800 078 7746.",
    );
    expect(result.ok).toBe(true);
  });

  it("rejects markdown lists", () => {
    const result = checkOutput("- First tip\n- Second tip\n- Third tip");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("markdown_format");
  });

  it("rejects too many sentences", () => {
    const result = checkOutput(
      "One. Two. Three. Four. This is too long for a single turn.",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("too_many_sentences");
  });

  it("rejects empty text", () => {
    const result = checkOutput("   ");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("empty");
  });

  it("rejects near-duplicate of a recent bot reply", () => {
    const prev =
      "What's been weighing on your mind the most since the breakup?";
    const result = checkOutput(
      "What's been weighing on your mind the most since the breakup?",
      { recentBotTexts: [prev] },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("repetition");
  });

  it("accepts a different reply after a recent one", () => {
    const result = checkOutput(
      "Being cheated on cuts deep — of course you're hurting.",
      {
        recentBotTexts: [
          "What's been weighing on your mind the most since the breakup?",
        ],
      },
    );
    expect(result.ok).toBe(true);
  });
});
