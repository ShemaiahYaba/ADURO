import { classify, mergeFacts } from "./classifier";
import { selectDecision } from "./dialogue-policy";
import {
  finalizeDiscourseAfterBot,
  normalizeDialogueState,
  updateDiscourseFromUser,
} from "./discourse";
import { retrieveFact } from "./knowledge-base";
import { realize } from "./realize";
import { checkSafety } from "./safety";
import type {
  ChatTurn,
  DialogueState,
  PipelineResult,
  PolicyDecision,
} from "./types";
import { INITIAL_DIALOGUE_STATE } from "./types";

export { normalizeDialogueState } from "./discourse";

function withMergedFacts(
  state: DialogueState,
  incoming: string[],
): DialogueState {
  return {
    ...state,
    facts: mergeFacts(state.facts, incoming),
  };
}

export async function runPipeline(
  message: string,
  sessionId: string,
  messageIndex: number,
  history: ChatTurn[] = [],
  dialogueState: DialogueState = INITIAL_DIALOGUE_STATE,
): Promise<PipelineResult> {
  let state = normalizeDialogueState(dialogueState);

  const safety = checkSafety(message);
  if (safety.handled) {
    return {
      text: safety.text,
      emotion: safety.emotion,
      dialogueState: state,
      source: "safety",
    };
  }

  const classification = await classify(message, history, state);
  const factCountBefore = state.facts.length;
  state = withMergedFacts(state, classification.facts);
  const gotNewFacts = state.facts.length > factCountBefore;
  state = updateDiscourseFromUser(state, classification, gotNewFacts);

  // Factual Q&A early in opening only
  if (
    classification.userAct === "factual_question" &&
    state.arc === "opening"
  ) {
    const fact = await retrieveFact(message);
    if (fact) {
      const next = finalizeDiscourseAfterBot(
        { ...state, lastBotAct: "answer_fact" },
        fact.text,
        "answer_fact",
      );
      return {
        text: fact.text,
        emotion: fact.emotion,
        dialogueState: next,
        source: "kb",
        act: "answer_fact",
        allowQuestion: false,
        factReferenced: false,
      };
    }
    if (!/\b(feel|feeling|sad|anxious|stress|hurt|heart)\b/i.test(message)) {
      const decision = selectDecision(
        { ...classification, userAct: "unknown" },
        state,
        message,
      );
      return finalizeTurn(
        decision,
        state,
        message,
        history,
        sessionId,
        messageIndex,
      );
    }
  }

  const decision = selectDecision(classification, state, message);
  decision.nextState = {
    ...decision.nextState,
    facts: state.facts,
  };

  return finalizeTurn(
    decision,
    state,
    message,
    history,
    sessionId,
    messageIndex,
  );
}

async function finalizeTurn(
  decision: PolicyDecision,
  stateBefore: DialogueState,
  message: string,
  history: ChatTurn[],
  sessionId: string,
  messageIndex: number,
): Promise<PipelineResult> {
  // Realization reads pre-decision covered (without this turn's act)
  const realized = await realize(
    decision,
    stateBefore,
    message,
    history,
    sessionId,
    messageIndex,
  );

  let nextState = finalizeDiscourseAfterBot(
    {
      ...decision.nextState,
      facts: stateBefore.facts,
      // Use pre-realize covered so finalize adds the act once
      covered: stateBefore.covered,
      consecutiveQuestions: stateBefore.consecutiveQuestions,
      consecutiveNonAnswers: stateBefore.consecutiveNonAnswers,
      recentBotTexts: stateBefore.recentBotTexts,
      openQuestion: stateBefore.openQuestion,
      arc: stateBefore.arc,
      stuckTurns: stateBefore.stuckTurns,
    },
    realized.text,
    decision.act,
  );

  // Preserve lastBotAct override for rationale (e.g. suggested_break)
  if (
    decision.nextState.lastBotAct !== decision.act &&
    decision.nextState.lastBotAct !== "none"
  ) {
    nextState = {
      ...nextState,
      lastBotAct: decision.nextState.lastBotAct,
    };
  }

  return {
    text: realized.text,
    emotion: decision.emotion,
    dialogueState: nextState,
    source: realized.source,
    factReferenced: realized.factReferenced,
    act: decision.act,
    allowQuestion: decision.allowQuestion,
  };
}
