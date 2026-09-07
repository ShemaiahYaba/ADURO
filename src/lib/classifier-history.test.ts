import { describe, it, expect } from "vitest";
import { truncateHistoryForClassifier } from "./classifier";
import { INITIAL_DIALOGUE_STATE } from "./types";
import type { ChatTurn } from "./types";

function turn(role: "user" | "assistant", content: string): ChatTurn {
  return { role, content };
}

describe("truncateHistoryForClassifier", () => {
  it("keeps up to 10 turns when within token budget", () => {
    const history: ChatTurn[] = Array.from({ length: 12 }, (_, i) =>
      turn(i % 2 === 0 ? "user" : "assistant", `message ${i}`),
    );

    const kept = truncateHistoryForClassifier(
      history,
      "hello",
      INITIAL_DIALOGUE_STATE,
    );

    expect(kept).toHaveLength(10);
    expect(kept[0]?.content).toBe("message 2");
    expect(kept[9]?.content).toBe("message 11");
  });

  it("drops oldest turns first when over token budget", () => {
    const history: ChatTurn[] = Array.from({ length: 8 }, (_, i) =>
      turn(i % 2 === 0 ? "user" : "assistant", `Turn ${i} `.repeat(80)),
    );
    const hugeCurrent = "word ".repeat(2500);

    const kept = truncateHistoryForClassifier(
      history,
      hugeCurrent,
      INITIAL_DIALOGUE_STATE,
    );

    expect(kept.length).toBeLessThan(history.length);
    expect(kept[kept.length - 1]?.content).toContain("Turn 7");
  });
});
