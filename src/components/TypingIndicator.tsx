export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-[var(--assistant-bubble)] px-4 py-3">
      <span className="typing-dot h-2 w-2 rounded-full bg-[var(--muted)]" />
      <span className="typing-dot h-2 w-2 rounded-full bg-[var(--muted)]" />
      <span className="typing-dot h-2 w-2 rounded-full bg-[var(--muted)]" />
    </div>
  );
}
