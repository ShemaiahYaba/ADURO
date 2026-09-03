import { classify, mergeFacts } from "./classifier";
import { selectDecision } from "./dialogue-policy";
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

export function normalizeDialogueState(
  state?: DialogueState | null,
): DialogueState {
  if (!state) return { ...INITIAL_DIALOGUE_STATE };
  return {
    activeFlow: state.activeFlow ?? "none",
    phase: state.phase ?? "idle",
    lastBotAct: state.lastBotAct ?? "none",
    facts: Array.isArray(state.facts) ? state.facts.slice(-8) : [],
    covered: Array.isArray(state.covered) ? state.covered : [],
    turnCount: typeof state.turnCount === "number" ? state.turnCount : 0,
  };
}

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
  state = withMergedFacts(state, classification.facts);

  // Factual Q&A when not mid emotional flow
  if (
    classification.userAct === "factual_question" &&
    state.activeFlow === "none"
  ) {
    const fact = await retrieveFact(message);
    if (fact) {
      const decision: PolicyDecision = {
        act: "answer_fact",
        emotion: fact.emotion,
        nextState: {
          ...state,
          lastBotAct: "answer_fact",
          turnCount: state.turnCount + 1,
        },
        verbatimText: fact.text,
      };
      return {
        text: fact.text,
        emotion: fact.emotion,
        dialogueState: decision.nextState,
        source: "kb",
      };
    }
    // Soft: treat unknown facts as explore if message has feeling words
    if (
      /\b(feel|feeling|sad|anxious|stress|hurt|heart)\b/i.test(message)
    ) {
      // fall through to policy
    } else {
      const decision = selectDecision(
        { ...classification, userAct: "unknown" },
        state,
        message,
      );
      const realized = await realize(
        decision,
        decision.nextState,
        message,
        history,
        sessionId,
        messageIndex,
      );
      return {
        text: realized.text,
        emotion: decision.emotion,
        dialogueState: decision.nextState,
        source: realized.source,
      };
    }
  }

  const decision = selectDecision(classification, state, message);
  // Carry merged facts into next state
  decision.nextState = {
    ...decision.nextState,
    facts: state.facts,
  };

  const realized = await realize(
    decision,
    decision.nextState,
    message,
    history,
    sessionId,
    messageIndex,
  );

  return {
    text: realized.text,
    emotion: decision.emotion,
    dialogueState: decision.nextState,
    source: realized.source,
  };
}
