export function ActivityLog({
  messages,
  endRef,
}: {
  messages: string[];
  endRef?: React.RefObject<HTMLDivElement>;
}) {
  if (messages.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border/80 bg-background-alt p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted">Activity Log</div>
      <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl bg-surface p-3 font-mono text-sm text-muted">
        {messages.map((message, index) => (
          <div key={`${message}-${index}`} className={message.startsWith("ERROR:") ? "text-danger" : ""}>
            {message}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
