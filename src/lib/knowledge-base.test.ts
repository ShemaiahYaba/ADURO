import { describe, it, expect, beforeEach } from "vitest";
import { retrieveFact, resetKbCache } from "./knowledge-base";

describe("knowledge-base", () => {
  beforeEach(() => {
    resetKbCache();
  });

  it("retrieves depression definition via lexical fallback", async () => {
    const result = await retrieveFact("What is Depression?");
    expect(result).not.toBeNull();
    expect(result!.text.toLowerCase()).toContain("depressed mood");
    expect(result!.emotion).toBe("factual");
  });

  it("retrieves anxiety symptoms from enriched KB", async () => {
    const result = await retrieveFact("What are the symptoms of anxiety?");
    expect(result).not.toBeNull();
    expect(result!.text.toLowerCase()).toContain("racing");
    expect(result!.emotion).toBe("factual");
  });

  it("returns null for unknown factual queries without match", async () => {
    const result = await retrieveFact("What is the capital of Neptune?");
    expect(result).toBeNull();
  });
});
