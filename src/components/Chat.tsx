"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CrisisBanner } from "@/components/CrisisBanner";
import { EmotionOrb } from "@/components/EmotionOrb";
import { MessageBubble } from "@/components/MessageBubble";
import { TypingIndicator } from "@/components/TypingIndicator";
import type { ChatMessage, Emotion } from "@/lib/types";

const SESSION_KEY = "aduro_session_id";
const TYPING_DELAY_MS = 800;

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
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageIndexRef = useRef(0);

  useEffect(() => {
    setSessionId(getSessionId());
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

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
        }),
      });

      if (!res.ok) throw new Error("Request failed");

      const data = (await res.json()) as { text: string; emotion: Emotion };

      await new Promise((r) => setTimeout(r, TYPING_DELAY_MS));

      setEmotion(data.emotion);
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
  }, [input, isTyping, messages, sessionId]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  const lastUserId = [...messages].reverse().find((m) => m.role === "user")?.id;

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--background)]">
      <header className="flex items-center gap-3 border-b border-[var(--surface-elevated)] bg-[var(--surface)] px-4 py-3">
        <EmotionOrb emotion={emotion} />
        <div>
          <h1 className="font-semibold">Aduro</h1>
          <p className="text-xs text-[var(--muted)]">Hi, {nickname}</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
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

      <div className="border-t border-[var(--surface-elevated)] bg-[var(--surface)] px-4 py-3">
        <div className="mx-auto flex max-w-lg gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Aduro..."
            rows={1}
            disabled={isTyping}
            className="max-h-32 flex-1 resize-none rounded-2xl border border-[var(--surface-elevated)] bg-[var(--background)] px-4 py-2.5 text-[15px] outline-none focus:border-[var(--accent)] disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={!input.trim() || isTyping}
            className="rounded-2xl bg-[var(--accent)] px-5 py-2.5 font-medium text-white transition hover:bg-[var(--accent-soft)] disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>

      <CrisisBanner />
    </div>
  );
}
