"use client";

import { useState, useEffect } from "react";
import { Chat } from "@/components/Chat";

const NICKNAME_KEY = "aduro_nickname";

export default function Home() {
  const [nickname, setNickname] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(NICKNAME_KEY);
    if (stored) setNickname(stored);
    setReady(true);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    localStorage.setItem(NICKNAME_KEY, trimmed);
    setNickname(trimmed);
  }

  if (!ready) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[var(--background)]">
        <p className="text-[var(--muted)]">Loading...</p>
      </main>
    );
  }

  if (!nickname) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-[var(--background)] px-6">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-gradient-to-br from-[#6b9bd1] to-[#4a6fa5] orb-pulse shadow-lg shadow-[#6b9bd1]/20" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Aduro</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              A supportive space to talk. What should we call you?
            </p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Your nickname"
              maxLength={32}
              className="w-full rounded-xl border border-[var(--surface-elevated)] bg-[var(--surface)] px-4 py-3 text-center outline-none focus:border-[var(--accent)]"
              autoFocus
            />
            <button
              type="submit"
              className="w-full rounded-xl bg-[var(--accent)] py-3 font-medium text-white transition hover:bg-[var(--accent-soft)]"
            >
              Continue
            </button>
          </form>
        </div>
      </main>
    );
  }

  return <Chat nickname={nickname} />;
}
