import type { ReactNode, RefObject } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { JobStatusPanel } from "@/components/workflow/JobStatusPanel";
import type { ProcessingJob } from "@/lib/api";

type IngestTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

function toneBandClass(tone?: IngestTone) {
  switch (tone) {
    case "success":
      return "border-success/15 bg-success-soft/80";
    case "warning":
      return "border-warning/15 bg-warning-soft/80";
    case "info":
      return "border-info/15 bg-info-soft/75";
    case "brand":
      return "border-brand/15 bg-brand-soft/70";
    case "danger":
      return "border-danger/15 bg-danger-soft/75";
    default:
      return "border-border/70 bg-surface";
  }
}

export type IngestStatusItem = {
  label: string;
  value: string;
  tone?: IngestTone;
  helper?: string;
};

export type IngestJobItem = {
  title: string;
  job?: ProcessingJob | null;
  messages?: string[];
  endRef?: RefObject<HTMLDivElement>;
  runningHint?: string;
  emptyMessage?: string;
};

export type IngestWorkflowItem = {
  label: string;
  href: string;
  active?: boolean;
  status: string;
  tone?: IngestTone;
};

export function IngestActivityDock({
  eyebrow = "Ingest Activity",
  title,
  description,
  workflowItems = [],
  statusItems = [],
  note,
  jobs = [],
  footer,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  workflowItems?: IngestWorkflowItem[];
  statusItems?: IngestStatusItem[];
  note?: ReactNode;
  jobs?: IngestJobItem[];
  footer?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card className="workspace-band space-y-5">
      <CardHeader eyebrow={eyebrow} title={title} description={description} />

      {workflowItems.length ? (
        <div className="space-y-3">
          <div>
            <p className="section-label">Workspace Flow</p>
            <p className="mt-2 text-sm leading-6 text-muted">Keep source, sermon master, and transcript together in one compact dock.</p>
          </div>
          <div className="space-y-2">
            {workflowItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition hover:border-brand/40 hover:bg-brand-soft/40 ${
                  item.active ? "border-brand/30 bg-brand-soft/75" : "border-border/80 bg-surface"
                }`}
              >
                <span className="text-sm font-semibold text-ink">{item.label}</span>
                <div className="flex items-center gap-2">
                  {item.active ? <Badge tone="brand">Current</Badge> : null}
                  <Badge tone={item.tone ?? "neutral"}>{item.status}</Badge>
                </div>
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {statusItems.length ? (
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
          {statusItems.map((item) => (
            <div key={item.label} className={`rounded-2xl border p-4 text-sm ${toneBandClass(item.tone)}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">{item.label}</span>
                <Badge tone={item.tone ?? "neutral"}>{item.value}</Badge>
              </div>
              {item.helper ? <p className="mt-2 text-xs leading-5 text-muted">{item.helper}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {note ? <div>{note}</div> : null}
      {children ? <div className="space-y-4">{children}</div> : null}

      {jobs.length ? (
        <div className="space-y-3">
          <div>
            <p className="section-label">Background Jobs</p>
            <p className="mt-2 text-sm leading-6 text-muted">Keep long-running ingest work docked here instead of stretching the main canvas.</p>
          </div>
          {jobs.map((jobItem) =>
            jobItem.job ? (
              <JobStatusPanel
                key={jobItem.title}
                title={jobItem.title}
                job={jobItem.job}
                messages={jobItem.messages}
                endRef={jobItem.endRef}
                runningHint={jobItem.runningHint}
                compact
                inline
              />
            ) : (
              <div key={jobItem.title} className="workspace-band rounded-2xl px-4 py-4">
                <p className="section-label">{jobItem.title}</p>
                <p className="mt-3 text-sm leading-6 text-muted">{jobItem.emptyMessage ?? "No background job is active right now."}</p>
              </div>
            )
          )}
        </div>
      ) : null}

      {footer ? <div className="border-t border-border/70 pt-4">{footer}</div> : null}
    </Card>
  );
}
