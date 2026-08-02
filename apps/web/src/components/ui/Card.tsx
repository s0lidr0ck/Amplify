import type { HTMLAttributes, ReactNode } from "react";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function Card({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={classNames("surface-card p-5", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1.5">
        {eyebrow ? <p className="section-label">{eyebrow}</p> : null}
        <div className="space-y-1">
          {/* Was text-xl. Every card had a 20px heading, so nothing on a page
              was more important than anything else — and the page's own title
              had nothing left to be bigger than. */}
          <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
          {description ? <p className="max-w-2xl text-sm text-muted">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
