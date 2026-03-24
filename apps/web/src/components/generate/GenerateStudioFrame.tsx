import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

type StudioSnapshotItem = {
  label: string;
  value: string;
  tone?: "neutral" | "brand" | "success" | "warning" | "danger" | "info";
};

type StudioSection = {
  label: string;
  detail?: string;
  href?: string;
};

type StudioMode = {
  label: string;
  title: string;
  description: string;
};

function toneBandClass(tone?: StudioSnapshotItem["tone"]) {
  switch (tone) {
    case "success":
      return "border-success/15 bg-success-soft/80";
    case "warning":
      return "border-warning/15 bg-warning-soft/80";
    case "info":
      return "border-info/15 bg-info-soft/75";
    case "brand":
      return "border-brand/15 bg-brand-soft/70";
    default:
      return "border-border/70 bg-surface";
  }
}

export function GenerateStudioFrame({
  eyebrow,
  title,
  description,
  mode,
  statusItems = [],
  actions,
  snapshotItems,
  sections = [],
  sectionsTitle = "Sections",
  footer,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  mode?: StudioMode;
  statusItems?: StudioSnapshotItem[];
  actions?: ReactNode;
  snapshotItems: StudioSnapshotItem[];
  sections?: StudioSection[];
  sectionsTitle?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden bg-[linear-gradient(140deg,rgba(255,255,255,0.98),rgba(255,247,242,0.96))]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="section-label">{eyebrow}</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">{title}</h2>
            {description ? <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
        </div>

        {statusItems.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {statusItems.map((item) => (
              <Badge key={`${item.label}-${item.value}`} tone={item.tone ?? "neutral"}>
                {item.label}: {item.value}
              </Badge>
            ))}
          </div>
        ) : null}

        {mode ? (
          <div className="mt-5 rounded-[1.2rem] border border-border/70 bg-surface px-4 py-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{mode.label}</p>
                <p className="mt-2 text-sm font-semibold text-ink">{mode.title}</p>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-muted">{mode.description}</p>
            </div>
          </div>
        ) : null}
      </Card>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">{children}</div>

        <aside className="space-y-4 2xl:sticky 2xl:top-24 2xl:self-start">
          <Card className="workspace-band p-5">
            <p className="section-label">At a glance</p>
            <div className="mt-4 space-y-3">
              {snapshotItems.map((item) => (
                <div
                  key={item.label}
                  className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${toneBandClass(item.tone)}`}
                >
                  <span className="text-muted">{item.label}</span>
                  <Badge tone={item.tone ?? "neutral"}>{item.value}</Badge>
                </div>
              ))}
            </div>
          </Card>

          {sections.length ? (
            <Card className="p-5">
              <p className="section-label">{sectionsTitle}</p>
              <div className="mt-4 space-y-2">
                {sections.map((section) => {
                  const content = (
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-ink">{section.label}</p>
                      {section.detail ? <p className="text-xs leading-5 text-muted">{section.detail}</p> : null}
                    </div>
                  );

                  if (!section.href) {
                    return (
                      <div key={section.label} className="workspace-band rounded-2xl px-4 py-3">
                        {content}
                      </div>
                    );
                  }

                  return (
                    <a
                      key={section.label}
                      href={section.href}
                      className="workspace-band block rounded-2xl px-4 py-3 transition hover:border-brand/40 hover:bg-brand-soft/40"
                    >
                      {content}
                    </a>
                  );
                })}
              </div>
            </Card>
          ) : null}

          {footer ? <Card className="workspace-band-strong p-5">{footer}</Card> : null}
        </aside>
      </div>
    </div>
  );
}
