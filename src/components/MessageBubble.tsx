type MessageBubbleProps = {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
  showDelivered?: boolean;
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function MessageBubble({
  role,
  text,
  timestamp,
  showDelivered,
}: MessageBubbleProps) {
  const isUser = role === "user";

  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
          isUser
            ? "rounded-br-md bg-[var(--user-bubble)] text-white"
            : "rounded-bl-md bg-[var(--assistant-bubble)] text-[var(--foreground)]"
        }`}
      >
        {text}
      </div>
      <div className="mt-1 flex items-center gap-2 px-1">
        <span className="text-[10px] text-[var(--muted)]">
          {formatTime(timestamp)}
        </span>
        {showDelivered && (
          <span className="text-[10px] text-[var(--muted)]">Delivered</span>
        )}
      </div>
    </div>
  );
}
