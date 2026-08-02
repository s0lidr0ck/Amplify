import type { HTMLAttributes } from "react";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-surface-strong text-muted",
  brand: "bg-brand-soft text-brand-strong",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

export function Badge({
  className,
  children,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={classNames(
        // There are ~150 of these across the app. Uppercase at 0.2em
        // tracking turned every one into a headline, and a page carrying six
        // status chips read as six announcements rather than six facts.
        // Sentence case, tighter, lighter — still a chip, no longer a shout.
        "inline-flex items-center rounded-md px-2 py-0.5 text-2xs font-medium",
        toneClasses[tone],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
