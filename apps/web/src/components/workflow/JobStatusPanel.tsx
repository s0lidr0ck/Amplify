import { ActivityLog } from "@/components/workflow/ActivityLog";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { ProcessingJob } from "@/lib/api";

function getTone(status: string | null | undefined) {
  if (status === "completed") return "success" as const;
  if (status === "failed") return "danger" as const;
  if (status === "running") return "info" as const;
  if (status === "queued") return "warning" as const;
  return "neutral" as const;
}

function getLabel(job: ProcessingJob) {
  if (job.status === "queued") return "Queued";
  if (job.status === "running") return job.current_message || "Processing";
  if (job.status === "completed") return "Completed";
  if (job.status === "failed") return "Failed";
  return job.status;
}

function getProgress(job: ProcessingJob) {
  if (job.progress_percent != null) return job.progress_percent;
  if (job.status === "completed") return 100;
  if (job.status === "running") return 40;
  return 0;
}

export function JobStatusPanel({
  title,
  job,
  messages = [],
  endRef,
  runningHint,
}: {
  title: string;
  job: ProcessingJob;
  messages?: string[];
  endRef?: React.RefObject<HTMLDivElement>;
  runningHint?: string;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="section-label">Background Job</p>
          <h3 className="mt-2 text-lg font-semibold text-ink">{title}</h3>
        </div>
        <Badge tone={getTone(job.status)}>{job.status}</Badge>
      </div>

      <div className="mt-5 space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 text-sm text-muted">
            <span>{getLabel(job)}</span>
            <span>{job.progress_percent != null ? `${job.progress_percent}%` : null}</span>
          </div>
          <ProgressBar value={getProgress(job)} />
        </div>

        {job.status === "running" && runningHint ? <Alert tone="info">{runningHint}</Alert> : null}
        {job.status === "failed" && job.error_text ? <Alert tone="danger">{job.error_text}</Alert> : null}
        {job.status === "queued" ? (
          <Alert tone="warning">The worker has accepted the job and will start processing shortly.</Alert>
        ) : null}

        <ActivityLog messages={messages} endRef={endRef} />
      </div>
    </Card>
  );
}
