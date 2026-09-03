"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CrisisBanner } from "@/components/CrisisBanner";
import { EmotionOrb } from "@/components/EmotionOrb";
import { MessageBubble } from "@/components/MessageBubble";
import { TypingIndicator } from "@/components/TypingIndicator";
import type { ChatMessage, DialogueState, Emotion } from "@/lib/types";
import { INITIAL_DIALOGUE_STATE } from "@/lib/types";

const SESSION_KEY = "aduro_session_id";
/** Reduced — real realization latency often replaces the artificial delay. */
const TYPING_DELAY_MS = 300;

function getSessionId(): string {
  if (typeof window === "undefined") return "anonymous";
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

type ChatProps = {
  nickname: string;
};

export function Chat({ nickname }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [emotion, setEmotion] = useState<Emotion>("neutral");
  const [isTyping, setIsTyping] = useState(false);
  const [pendingDelivered, setPendingDelivered] = useState(false);
  const [sessionId, setSessionId] = useState("anonymous");
  const [dialogueState, setDialogueState] = useState<DialogueState>(
    INITIAL_DIALOGUE_STATE,
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messageIndexRef = useRef(0);

  useEffect(() => {
    setSessionId(getSessionId());
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    if (!isTyping) {
      inputRef.current?.focus();
    }
  }, [isTyping, messages.length]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [input]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isTyping) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setPendingDelivered(true);
    setIsTyping(true);
    queueMicrotask(() => {
      const el = inputRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.focus();
    });

    const history = messages.slice(-6).map((m) => ({
      role: m.role,
      content: m.text,
    }));

    const messageIndex = messageIndexRef.current;
    messageIndexRef.current += 1;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          sessionId,
          messageIndex,
          history,
          dialogueState,
        }),
      });

      if (!res.ok) throw new Error("Request failed");

      const data = (await res.json()) as {
        text: string;
        emotion: Emotion;
        dialogueState: DialogueState;
      };

      await new Promise((r) => setTimeout(r, TYPING_DELAY_MS));

      setEmotion(data.emotion);
      setDialogueState(data.dialogueState);
      setPendingDelivered(false);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: data.text,
          timestamp: Date.now(),
        },
      ]);
    } catch {
      setPendingDelivered(false);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "I'm having trouble responding right now. Please try again in a moment.",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  }, [input, isTyping, messages, sessionId, dialogueState]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  const lastUserId = [...messages].reverse().find((m) => m.role === "user")?.id;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[var(--background)]">
      <header className="sticky top-0 z-20 flex shrink-0 items-center gap-3 border-b border-[var(--surface-elevated)] bg-[var(--surface)] px-4 py-3">
        <EmotionOrb emotion={emotion} />
        <div>
          <h1 className="font-semibold">Aduro</h1>
          <p className="text-xs text-[var(--muted)]">Hi, {nickname}</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex max-w-lg flex-col gap-3">
          {messages.length === 0 && (
            <p className="text-center text-sm text-[var(--muted)]">
              How are you feeling today? I&apos;m here to listen.
            </p>
          )}
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              role={m.role}
              text={m.text}
              timestamp={m.timestamp}
              showDelivered={m.role === "user" && m.id === lastUserId && pendingDelivered}
            />
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <TypingIndicator />
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="sticky bottom-0 z-20 shrink-0 border-t border-[var(--surface-elevated)]/80 bg-[var(--surface)]/95 px-4 pt-3 backdrop-blur-md pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-lg">
          <div className="flex items-end gap-2 rounded-2xl border border-[var(--surface-elevated)] bg-[var(--background)] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] focus-within:border-[var(--accent)]/70 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Aduro..."
              rows={1}
              autoFocus
              disabled={isTyping}
              aria-label="Message Aduro"
              className="composer-input min-h-[40px] max-h-32 flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] leading-snug text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={!input.trim() || isTyping}
              aria-label="Send message"
              className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-white transition hover:bg-[var(--accent-soft)] disabled:opacity-35"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M5 12h14" />
                <path d="M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
          <CrisisBanner />
        </div>
      </div>
    </div>
  );
}
