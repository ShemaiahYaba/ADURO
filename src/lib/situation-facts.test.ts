import { describe, it, expect } from "vitest";
import {
  emotionHintFromFacts,
  extractSituationFacts,
  looksLikeEmotionalSituation,
} from "./situation-facts";

describe("situation-facts", () => {
  it("extracts relationship and advice-relevant facts", () => {
    const facts = extractSituationFacts(
      "She cheated and left me on read, what should I do?",
    );
    expect(facts.some((f) => /unfaithful/i.test(f))).toBe(true);
    expect(facts.length).toBeGreaterThan(0);
    expect(facts.length).toBeLessThanOrEqual(3);
  });

  it("captures YA academic and family pressure", () => {
    const facts = extractSituationFacts(
      "My parents keep stressing me about JAMB and school fees",
    );
    expect(facts).toContain("academic pressure");
    expect(facts).toContain("family pressure");
    expect(facts).toContain("money worries");
  });

  it("captures grief and loneliness themes", () => {
    const grief = extractSituationFacts("My dad passed away last month");
    expect(grief).toContain("dealing with loss");

    const lonely = extractSituationFacts("I feel so alone and isolated");
    expect(lonely.some((f) => /lonely/i.test(f))).toBe(true);
  });

  it("maps facts to emotion hints", () => {
    expect(emotionHintFromFacts(["feeling anxious"])).toBe("anxiety");
    expect(emotionHintFromFacts(["dealing with loss"])).toBe("grief");
    expect(emotionHintFromFacts(["academic pressure"])).toBe("stress");
    expect(emotionHintFromFacts(["partner was unfaithful"])).toBe("sadness");
  });

  it("flags emotional situations for routing", () => {
    expect(looksLikeEmotionalSituation(["money worries"])).toBe(true);
    expect(looksLikeEmotionalSituation([])).toBe(false);
  });
});
