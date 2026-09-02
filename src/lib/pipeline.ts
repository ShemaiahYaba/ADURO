import { classify } from "./classifier";
import { NO_INFO_RESPONSE } from "./constants";
import { retrieveFact } from "./knowledge-base";
import {
  selectResponse,
} from "./dialogue-policy";
import { checkSafety } from "./safety";
import type { ChatTurn, DialogueState, PipelineResult } from "./types";
import { INITIAL_DIALOGUE_STATE } from "./types";

export function normalizeDialogueState(
  state?: DialogueState | null,
): DialogueState {
  if (!state) return { ...INITIAL_DIALOGUE_STATE };
  return {
    activeFlow: state.activeFlow ?? "none",
    phase: state.phase ?? "idle",
    lastBotAct: state.lastBotAct ?? "none",
  };
}

export async function runPipeline(
  message: string,
  sessionId: string,
  messageIndex: number,
  history: ChatTurn[] = [],
  dialogueState: DialogueState = INITIAL_DIALOGUE_STATE,
): Promise<PipelineResult> {
  const state = normalizeDialogueState(dialogueState);

  const safety = checkSafety(message);
  if (safety.handled) {
    return {
      text: safety.text,
      emotion: safety.emotion,
      dialogueState: state,
    };
  }

  const classification = await classify(message, history, state);

  if (
    classification.userAct === "factual_question" &&
    state.activeFlow === "none"
  ) {
    const fact = await retrieveFact(message);
    if (fact) {
      return {
        text: fact.text,
        emotion: fact.emotion,
        dialogueState: state,
      };
    }
    return {
      text: NO_INFO_RESPONSE,
      emotion: "factual",
      dialogueState: state,
    };
  }

  return selectResponse(
    classification,
    state,
    sessionId,
    messageIndex,
    message,
  );
}
