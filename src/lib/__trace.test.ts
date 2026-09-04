import { describe, it, expect, vi } from "vitest";
import { selectDecision } from "./dialogue-policy";
import { finalizeDiscourseAfterBot, updateDiscourseFromUser } from "./discourse";
import { realize } from "./realize";
import { INITIAL_DIALOGUE_STATE } from "./types";
import type { Classification, DialogueState } from "./types";

const T = (user: string, userAct: Classification["userAct"], facts: string[] = [], extra: Partial<Classification> = {}) =>
  ({ user, c: { emotion: "sadness", userAct, facts, confidence: 0.9, ...extra } as Classification });

describe("trace", () => {
  it("dump", async () => {
    vi.stubEnv("ADURO_REALIZATION", "template");
    const turns = [
      T("I'm sad", "disclose_feeling", ["feeling sad"], { templateId: "sad" }),
      T("My babe broke up with me", "elaborate", ["went through a breakup"]),
      T("She cheated that's most of it, what do you think i should do?", "request_advice", ["partner was unfaithful"]),
      T("why exactly she cheated", "ask_about_situation"),
      T("i'm not exactly sure", "express_uncertainty"),
      T("I really don't know", "express_uncertainty"),
      T("really? how would that help", "express_doubt"),
      T("ice cream i guess", "deflect"),
    ];
    let state: DialogueState = { ...INITIAL_DIALOGUE_STATE };
    const history: { role: "user" | "assistant"; content: string }[] = [];
    for (let i = 0; i < turns.length; i++) {
      const t = turns[i]!;
      const before = state.facts.length;
      const facts = [...state.facts, ...t.c.facts.filter(f => !state.facts.includes(f))].slice(-8);
      state = { ...state, facts };
      state = updateDiscourseFromUser(state, t.c, facts.length > before);
      const d = selectDecision(t.c, state, t.user);
      const r = await realize(d, state, t.user, history, "trace", i);
      console.log(`\nUSER: ${t.user}\n  act=${d.act} q=${d.allowQuestion}\n  ADURO: ${r.text}`);
      history.push({ role: "user", content: t.user }, { role: "assistant", content: r.text });
      state = finalizeDiscourseAfterBot({ ...d.nextState, facts: state.facts, covered: state.covered }, r.text, d.act);
    }
    expect(true).toBe(true);
  });
});
