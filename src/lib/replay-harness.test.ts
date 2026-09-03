/**
 * Replay harness: feed a scripted transcript through the real policy and
 * realization stack (template mode, no network) and assert discourse
 * invariants across the whole conversation.
 *
 * Every failure this exists to catch is a *sequence* failure — repetition,
 * interrogation, advice-before-validation — which per-turn assertions cannot
 * see. Bot text therefore comes from `realize`, never from a stub, so the
 * invariants describe the system rather than the fixture.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { selectDecision } from "./dialogue-policy";
import {
  finalizeDiscourseAfterBot,
  updateDiscourseFromUser,
} from "./discourse";
import { containsQuestion, jaccardSimilarity } from "./output-guard";
import { realize } from "./realize";
import { INITIAL_DIALOGUE_STATE } from "./types";
import type { BotAct, Classification, DialogueState } from "./types";

type Turn = {
  user: string;
  classification: Classification;
};

type Replayed = {
  botTexts: string[];
  acts: BotAct[];
  allowFlags: boolean[];
  state: DialogueState;
};

async function replay(turns: Turn[]): Promise<Replayed> {
  let state: DialogueState = { ...INITIAL_DIALOGUE_STATE };
  const botTexts: string[] = [];
  const acts: BotAct[] = [];
  const allowFlags: boolean[] = [];
  const history: { role: "user" | "assistant"; content: string }[] = [];

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i]!;

    const before = state.facts.length;
    const facts = [
      ...state.facts,
      ...turn.classification.facts.filter((f) => !state.facts.includes(f)),
    ].slice(-8);
    state = { ...state, facts };
    state = updateDiscourseFromUser(
      state,
      turn.classification,
      facts.length > before,
    );

    const decision = selectDecision(turn.classification, state, turn.user);
    const realized = await realize(
      decision,
      state,
      turn.user,
      history,
      "replay-session",
      i,
    );

    acts.push(decision.act);
    allowFlags.push(decision.allowQuestion);
    botTexts.push(realized.text);

    history.push({ role: "user", content: turn.user });
    history.push({ role: "assistant", content: realized.text });

    state = finalizeDiscourseAfterBot(
      { ...decision.nextState, facts: state.facts, covered: state.covered },
      realized.text,
      decision.act,
    );
  }

  return { botTexts, acts, allowFlags, state };
}

function assertInvariants(r: Replayed) {
  const { botTexts, acts, allowFlags } = r;

  for (let i = 1; i < botTexts.length; i++) {
    expect(
      jaccardSimilarity(botTexts[i]!, botTexts[i - 1]!),
      `turns ${i - 1}/${i} too similar:\n  ${botTexts[i - 1]}\n  ${botTexts[i]}`,
    ).toBeLessThan(0.8);
  }

  let run = 0;
  for (let i = 0; i < botTexts.length; i++) {
    if (containsQuestion(botTexts[i]!)) {
      run += 1;
      expect(run, `question run of ${run} ending at turn ${i}`).toBeLessThanOrEqual(2);
    } else {
      run = 0;
    }
  }

  // A disallowed question must never reach the user, on any realization path.
  for (let i = 0; i < botTexts.length; i++) {
    if (!allowFlags[i]) {
      expect(
        containsQuestion(botTexts[i]!),
        `turn ${i} (${acts[i]}) disallowed a question but asked: ${botTexts[i]}`,
      ).toBe(false);
    }
  }

  const validateIdx = acts.findIndex((a) => a === "validate" || a === "reflect");
  const copingIdx = acts.indexOf("offer_coping");
  if (copingIdx !== -1) {
    expect(validateIdx).toBeGreaterThanOrEqual(0);
    expect(validateIdx).toBeLessThan(copingIdx);
  }

  for (let i = 2; i < acts.length; i++) {
    expect(
      !(acts[i] === acts[i - 1] && acts[i - 1] === acts[i - 2]),
      `act ${acts[i]} repeated three times ending at turn ${i}`,
    ).toBe(true);
  }
}

function turn(
  user: string,
  userAct: Classification["userAct"],
  facts: string[] = [],
  extra: Partial<Classification> = {},
): Turn {
  return {
    user,
    classification: {
      emotion: "sadness",
      userAct,
      facts,
      confidence: 0.9,
      ...extra,
    },
  };
}

const BREAKUP: Turn[] = [
  turn("I'm sad", "disclose_feeling", ["feeling sad"], { templateId: "sad" }),
  turn("My babe broke up with me", "elaborate", ["went through a breakup"]),
  turn(
    "She cheated that's most of it, what do you think i should do?",
    "request_advice",
    ["partner was unfaithful"],
  ),
  turn("why exactly she cheated", "ask_about_situation"),
  turn("i'm not exactly sure", "express_uncertainty"),
  turn("I really don't know", "express_uncertainty"),
  turn("ice cream i guess", "deflect"),
];

describe("replay harness — breakup transcript", () => {
  beforeEach(() => {
    vi.stubEnv("ADURO_REALIZATION", "template");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("satisfies discourse invariants end to end", async () => {
    assertInvariants(await replay(BREAKUP));
  });

  it("validates before anything else", async () => {
    const { acts } = await replay(BREAKUP);
    expect(acts[0]).toBe("validate");
  });

  it("answers a request for advice without a question", async () => {
    const { acts, allowFlags, botTexts } = await replay(BREAKUP);
    expect(acts[2]).toBe("answer_directly");
    expect(allowFlags[2]).toBe(false);
    expect(botTexts[2]).not.toContain("?");
  });

  it("reflects rather than probes when asked an unanswerable question", async () => {
    const { acts } = await replay(BREAKUP);
    expect(acts[3]).toBe("reflect");
  });

  it("never explores on uncertainty", async () => {
    const { acts } = await replay(BREAKUP);
    for (const i of [4, 5]) {
      expect(acts[i]).not.toBe("explore");
    }
  });

  it("offers coping once the user is heard but stuck", async () => {
    const { acts } = await replay(BREAKUP);
    expect(acts).toContain("offer_coping");
    const copingIdx = acts.indexOf("offer_coping");
    expect(copingIdx).toBeGreaterThan(2);
  });

  it("leaves a rationale answerable after suggesting coping", async () => {
    const { state } = await replay(BREAKUP.slice(0, 6));
    // Follow-up doubt must find a real suggestion to justify.
    const followUp = await replay([
      ...BREAKUP.slice(0, 6),
      turn("really? how would that help", "express_doubt"),
    ]);
    expect(state.facts.length).toBeGreaterThan(0);
    expect(followUp.acts.at(-1)).toBe("explain_rationale");
  });
});

describe("replay harness — jaded / advice-first regression", () => {
  beforeEach(() => {
    vi.stubEnv("ADURO_REALIZATION", "template");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("validates before any coping on first stress disclosure", async () => {
    const { acts, botTexts } = await replay([
      turn("i feel so jaded", "disclose_feeling", ["feeling jaded"], {
        emotion: "stress",
        templateId: "stressed",
      }),
      turn("yeah ok", "accept_offer", [], { emotion: "stress" }),
    ]);

    expect(acts[0]).toBe("validate");
    expect(acts[0]).not.toBe("offer_coping");
    expect(botTexts[0]).not.toMatch(/take a (short )?break|go for a walk/i);
  });
});
