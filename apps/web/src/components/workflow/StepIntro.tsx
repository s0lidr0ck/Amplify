import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

type StepIntroStatusItem = {
  label: string;
  value: string;
  tone?: "neutral" | "brand" | "success" | "warning" | "danger" | "info";
};

export function StepIntro({
  eyebrow,
  title,
  description,
  meta,
  statusItems,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  meta?: string[];
  statusItems?: StepIntroStatusItem[];
  action?: ReactNode;
}) {
  return (
    <Card className="overflow-hidden bg-[linear-gradient(140deg,rgba(255,255,255,0.98),rgba(255,247,242,0.96))]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="section-label">{eyebrow}</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {statusItems?.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {statusItems.map((item) => (
            <div key={item.label} className="flex items-center justify-between rounded-2xl bg-surface/80 px-4 py-3 text-sm">
              <span className="text-muted">{item.label}</span>
              <Badge tone={item.tone ?? "neutral"}>{item.value}</Badge>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
