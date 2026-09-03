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
});
