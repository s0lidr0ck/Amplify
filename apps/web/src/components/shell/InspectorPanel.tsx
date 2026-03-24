import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { classNames } from "./utils";
import type { InspectorStat, ShellTone } from "./types";

export function InspectorPanel({
  eyebrow,
  title,
  description,
  status,
  actions,
  stats,
  children,
  footer,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  status?: string;
  actions?: ReactNode;
  stats?: InspectorStat[];
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <aside
      className={classNames(
        "surface-card space-y-4 p-4 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,242,236,0.94))]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? <p className="section-label">{eyebrow}</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-ink">{title}</h2>
            {status ? <Badge tone="brand">{status}</Badge> : null}
          </div>
          {description ? <p className="mt-2 text-sm leading-6 text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>

      {stats?.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-[1.25rem] border border-border/80 bg-surface px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{stat.label}</p>
                  {stat.helper ? <p className="mt-1 text-xs leading-5 text-muted">{stat.helper}</p> : null}
                </div>
                <Badge tone={stat.tone ?? "neutral"}>{stat.value}</Badge>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {children ? <div className="space-y-3">{children}</div> : null}

      {footer ? <div className="space-y-3 border-t border-border/70 pt-4">{footer}</div> : null}
    </aside>
  );
}
