import { NextResponse } from "next/server";
import { normalizeDialogueState, runPipeline } from "@/lib/pipeline";
import type { ChatTurn, DialogueState } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      message?: string;
      sessionId?: string;
      messageIndex?: number;
      history?: ChatTurn[];
      dialogueState?: DialogueState;
    };

    const message = body.message?.trim();
    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const sessionId = body.sessionId ?? "anonymous";
    const messageIndex = body.messageIndex ?? 0;
    const history = Array.isArray(body.history) ? body.history : [];
    const dialogueState = normalizeDialogueState(body.dialogueState);

    const result = await runPipeline(
      message,
      sessionId,
      messageIndex,
      history,
      dialogueState,
    );

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
