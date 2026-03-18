function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function ProgressBar({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const safeValue = Math.max(0, Math.min(100, value));

  return (
    <div className={classNames("h-2.5 w-full overflow-hidden rounded-full bg-surface-strong", className)}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-brand to-accent transition-all duration-300"
        style={{ width: `${safeValue}%` }}
      />
    </div>
  );
}
