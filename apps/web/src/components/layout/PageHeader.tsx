import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";

export function PageHeader({
  eyebrow,
  title,
  description,
  status,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  status?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-2 sm:space-y-3">
        {eyebrow ? <p className="section-label">{eyebrow}</p> : null}
        <div className="space-y-2 sm:space-y-3">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl lg:text-5xl">
              {title}
            </h1>
            {status ? <Badge tone="brand">{status}</Badge> : null}
          </div>
          {description ? (
            <>
              <p className="hidden max-w-3xl text-base text-muted sm:block sm:text-lg">{description}</p>
              <details className="rounded-2xl border border-border/80 bg-surface/80 p-4 sm:hidden">
                <summary className="cursor-pointer list-none text-sm font-semibold text-ink">
                  Page details
                </summary>
                <p className="mt-3 text-sm leading-6 text-muted">{description}</p>
              </details>
            </>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2 sm:gap-3">{actions}</div> : null}
    </div>
  );
}
