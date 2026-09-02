import { GENERIC_REFUSAL, NO_INFO_RESPONSE } from "./constants";
import {
  lookupRationaleTemplate,
  pickRefusalResponse,
  pickTemplate,
} from "./responses";
import { getTemplateById } from "./templates";
import { hashString } from "./text-utils";
import type {
  Classification,
  DialogueState,
  Emotion,
  PipelineResult,
} from "./types";

const STRESS_EMOTIONS = new Set<Emotion>(["stress", "anxiety", "sadness"]);

function pickFromPool(
  pool: string[],
  templateId: string,
  sessionId: string,
  messageIndex: number,
): string {
  const index = hashString(`${sessionId}:${templateId}:${messageIndex}`) % pool.length;
  return pool[index] ?? pool[0]!;
}

function pickStressedBreakResponse(
  sessionId: string,
  messageIndex: number,
  message: string,
): { text: string; emotion: Emotion } {
  const template = getTemplateById("stressed");
  const pool = template?.responses ?? [];
  const breakPool = pool.filter((r) => /\b(break|easy|rest)\b/i.test(r));
  const usePool = breakPool.length > 0 ? breakPool : pool;
  return {
    text: pickFromPool(usePool, "stressed_break", sessionId, messageIndex),
    emotion: "stress",
  };
}

function result(
  templateId: string,
  state: DialogueState,
  sessionId: string,
  messageIndex: number,
  message: string,
): PipelineResult {
  const picked = pickTemplate(templateId, sessionId, messageIndex, message);
  return {
    text: picked.text,
    emotion: picked.emotion,
    dialogueState: state,
  };
}

function handleStressFlow(
  classification: Classification,
  state: DialogueState,
  sessionId: string,
  messageIndex: number,
  message: string,
): PipelineResult | null {
  if (state.activeFlow !== "stress_support") return null;

  if (classification.userAct === "elaborate") {
    return result(
      "stress_probe",
      {
        activeFlow: "stress_support",
        phase: "probe_cause",
        lastBotAct: "asked_cause",
      },
      sessionId,
      messageIndex,
      message,
    );
  }

  if (
    classification.userAct === "decline_offer" &&
    (state.lastBotAct === "offered_learn_more" || state.lastBotAct === "offered_tips")
  ) {
    return result(
      "tips_declined",
      {
        activeFlow: "stress_support",
        phase: "offered_tips",
        lastBotAct: "offered_tips",
      },
      sessionId,
      messageIndex,
      message,
    );
  }

  if (
    classification.userAct === "accept_offer" &&
    state.lastBotAct === "offered_tips"
  ) {
    return result(
      "learn_more_offer",
      {
        activeFlow: "stress_support",
        phase: "offered_tips",
        lastBotAct: "offered_learn_more",
      },
      sessionId,
      messageIndex,
      message,
    );
  }

  if (
    classification.userAct === "accept_offer" &&
    state.lastBotAct === "offered_learn_more"
  ) {
    return result(
      "meditation_offer",
      {
        activeFlow: "stress_support",
        phase: "offered_meditation",
        lastBotAct: "offered_meditation",
      },
      sessionId,
      messageIndex,
      message,
    );
  }

  if (
    classification.userAct === "accept_offer" &&
    (classification.templateId === "meditation_guide" ||
      state.lastBotAct === "offered_meditation")
  ) {
    return result(
      "meditation_guide",
      {
        activeFlow: "stress_support",
        phase: "meditation_active",
        lastBotAct: "guided_meditation",
      },
      sessionId,
      messageIndex,
      message,
    );
  }

  return null;
}

function startStressFlow(
  classification: Classification,
  sessionId: string,
  messageIndex: number,
  message: string,
): PipelineResult {
  const picked = pickStressedBreakResponse(sessionId, messageIndex, message);

  return {
    text: picked.text,
    emotion: picked.emotion,
    dialogueState: {
      activeFlow: "stress_support",
      phase: "stressed_disclosed",
      lastBotAct: "suggested_break",
    },
  };
}

export function selectResponse(
  classification: Classification,
  state: DialogueState,
  sessionId: string,
  messageIndex: number,
  message: string,
): PipelineResult {
  const rationaleId = lookupRationaleTemplate(
    state.lastBotAct,
    classification.userAct,
  );
  if (rationaleId) {
    return result(rationaleId, state, sessionId, messageIndex, message);
  }

  const stressHandled = handleStressFlow(
    classification,
    state,
    sessionId,
    messageIndex,
    message,
  );
  if (stressHandled) return stressHandled;

  if (
    state.activeFlow === "none" &&
    (classification.userAct === "disclose_feeling" ||
      classification.templateId === "stressed" ||
      (STRESS_EMOTIONS.has(classification.emotion) &&
        classification.userAct !== "social" &&
        classification.userAct !== "factual_question"))
  ) {
    if (
      classification.emotion === "stress" ||
      classification.templateId === "stressed" ||
      /\b(tired|stress|overwhelm|burnout)\b/i.test(message)
    ) {
      return startStressFlow(classification, sessionId, messageIndex, message);
    }
  }

  if (classification.templateId) {
    return result(
      classification.templateId,
      state,
      sessionId,
      messageIndex,
      message,
    );
  }

  if (classification.userAct === "unknown") {
    const refusal = pickRefusalResponse();
    return {
      text: refusal.text,
      emotion: refusal.emotion,
      dialogueState: state,
    };
  }

  return {
    text: NO_INFO_RESPONSE,
    emotion: "neutral",
    dialogueState: state,
  };
}

export function selectRefusal(state: DialogueState): PipelineResult {
  const refusal = pickRefusalResponse();
  return {
    text: refusal.text,
    emotion: refusal.emotion,
    dialogueState: state,
  };
}

export function selectOffTopic(state: DialogueState): PipelineResult {
  return {
    text: GENERIC_REFUSAL,
    emotion: "off_topic",
    dialogueState: state,
  };
}
