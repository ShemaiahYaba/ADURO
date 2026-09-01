import { describe, it, expect } from "vitest";
import { contextFollowUpMatch } from "./context-followup";

describe("context-followup", () => {
  it("routes work stress explanation after reason probe", () => {
    const history = [
      {
        role: "assistant" as const,
        content: "I am sorry to hear that. What is the reason behind this?",
      },
    ];
    const result = contextFollowUpMatch(
      "Just been working a lot of overtime shifts lately",
      history,
    );
    expect(result?.matched).toBe(true);
    expect(result?.tag).toBe("problem");
  });

  it("routes short work answer", () => {
    const history = [
      {
        role: "assistant" as const,
        content: "What do you think is causing this?",
      },
    ];
    const result = contextFollowUpMatch("just work", history);
    expect(result?.tag).toBe("problem");
  });

  it("routes doubt after reassurance", () => {
    const history = [
      {
        role: "assistant" as const,
        content: "It'll all be okay. This feeling is only momentary.",
      },
    ];
    const result = contextFollowUpMatch("you sure?", history);
    expect(result?.tag).toBe("casual");
  });
});
