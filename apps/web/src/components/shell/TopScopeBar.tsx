import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { classNames } from "./utils";
import type { ShellTone } from "./types";

export function TopScopeBar({
  eyebrow,
  title,
  subtitle,
  scopes,
  actions,
  status,
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  scopes?: Array<string | { label: string; tone?: ShellTone }>;
  actions?: ReactNode;
  status?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={classNames(
        "surface-card overflow-hidden bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(255,247,240,0.94))] p-5",
        className
      )}
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          {eyebrow ? <p className="section-label">{eyebrow}</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{title}</h1>
            {status ? <div className="shrink-0">{status}</div> : null}
          </div>
          {subtitle ? <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">{subtitle}</p> : null}
          {scopes?.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {scopes.map((scope) =>
                typeof scope === "string" ? (
                  <Badge key={scope} tone="neutral">
                    {scope}
                  </Badge>
                ) : (
                  <Badge key={scope.label} tone={scope.tone ?? "neutral"}>
                    {scope.label}
                  </Badge>
                )
              )}
            </div>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
