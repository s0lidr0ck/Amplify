import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

type WorkspaceSnapshotItem = {
  label: string;
  value: string;
  tone?: "neutral" | "brand" | "success" | "warning" | "danger" | "info";
};

type WorkspaceSection = {
  label: string;
  detail?: string;
  href?: string;
};

type WorkspaceMode = {
  label: string;
  title: string;
  description: string;
};

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function toneBandClass(tone?: WorkspaceSnapshotItem["tone"]) {
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

export function GenerateWorkspace({
  children,
  snapshotItems,
  sections,
  sectionsTitle = "Sections",
  footer,
  title = "At a glance",
  description = "Use the summary rail to keep the important bits within reach while you edit.",
  mode,
}: {
  children: ReactNode;
  snapshotItems: WorkspaceSnapshotItem[];
  sections?: WorkspaceSection[];
  sectionsTitle?: string;
  footer?: ReactNode;
  title?: string;
  description?: string;
  mode?: WorkspaceMode;
}) {
  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-6">{children}</div>
      <aside className="space-y-4 2xl:sticky 2xl:top-24 2xl:self-start">
        <Card className="workspace-band p-5">
          <p className="section-label">{title}</p>
          <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
          {mode ? (
            <div className="workspace-band-strong mt-4 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{mode.label}</p>
              <p className="mt-2 text-sm font-semibold text-ink">{mode.title}</p>
              <p className="mt-2 text-sm leading-6 text-muted">{mode.description}</p>
            </div>
          ) : null}
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

        {sections?.length ? (
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
                    className={classNames("workspace-band block rounded-2xl px-4 py-3 transition hover:border-brand/40 hover:bg-brand-soft/40")}
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
  );
}
