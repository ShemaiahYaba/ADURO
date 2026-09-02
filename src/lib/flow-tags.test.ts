import { describe, it, expect } from "vitest";
import {
  CLASSIFIER_EXCLUDED_TAGS,
  FLOW_TRANSITION_TAGS,
  isClassifierTag,
  isFlowTransitionTag,
} from "./flow-tags";

describe("flow-tags", () => {
  it("excludes flow transition tags from classifier", () => {
    for (const tag of FLOW_TRANSITION_TAGS) {
      expect(isClassifierTag(tag)).toBe(false);
      expect(isFlowTransitionTag(tag)).toBe(true);
    }
  });

  it("excludes default from classifier", () => {
    expect(isClassifierTag("default")).toBe(false);
    expect(CLASSIFIER_EXCLUDED_TAGS.has("default")).toBe(true);
  });

  it("allows emotional and conversational tags", () => {
    expect(isClassifierTag("stressed")).toBe(true);
    expect(isClassifierTag("greeting")).toBe(true);
    expect(isClassifierTag("fact-3")).toBe(true);
    expect(isClassifierTag("casual")).toBe(true);
  });
});
