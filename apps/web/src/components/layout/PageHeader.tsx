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
    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-3">
        {eyebrow ? <p className="section-label">{eyebrow}</p> : null}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
              {title}
            </h1>
            {status ? <Badge tone="brand">{status}</Badge> : null}
          </div>
          {description ? <p className="max-w-3xl text-base text-muted sm:text-lg">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-3">{actions}</div> : null}
    </div>
  );
}
