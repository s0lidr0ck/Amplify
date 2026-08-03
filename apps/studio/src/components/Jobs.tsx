import { useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useState } from "react";

/**
 * What the machine is doing, shown where the work belongs.
 *
 * This used to be one log on the Source page listing every job the sermon
 * had ever run. So a transcription kicked off by a trim reported its
 * progress two rooms away from the Transcript page — which is exactly where
 * somebody goes to find out where the transcript has got to.
 *
 * Each room now passes the job types that are its own. A room with nothing
 * running and nothing broken shows no log at all, because a panel that only
 * ever says "completed" is furniture.
 */
export function Jobs({
  projectId,
  types,
}: {
  projectId: Id<"amplifyProjects">;
  /** Which kinds of work belong to this room. */
  types: string[];
}) {
  const everything = useQuery(api.amplifyWorker.listJobs, { projectId });
  const [expanded, setExpanded] = useState(false);

  // Only this room's work. A transcription started by a trim used to report
  // its progress on the Source page, two rooms from where anybody would go
  // looking for it.
  const jobs = (everything ?? []).filter((j) => types.includes(j.jobType));
  if (jobs.length === 0) return null;

  // Anything live or broken, and then a couple of finished ones for
  // context. The full list is every clip ever cut — twenty rows of
  // "completed" that nobody reads and that bury the one that failed.
  const notable = jobs.filter(
    (j) => j.status === "running" || j.status === "queued" || j.status === "failed",
  );
  const rest = jobs.filter((j) => !notable.includes(j));
  const shown = expanded ? jobs : [...notable, ...rest.slice(0, 3)];

  return (
    <div className="card grid gap-2 p-4">
      <div className="flex flex-wrap items-baseline gap-x-2.5">
        <p className="card-title">Work</p>
        {jobs.length > shown.length && (
          <button
            onClick={() => setExpanded(true)}
            className="text-2xs text-muted underline hover:text-ink"
          >
            Show all {jobs.length}
          </button>
        )}
      </div>
      <ul className="grid gap-2">
        {shown.map((job) => (
          <li key={job._id} className="grid gap-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-sm text-ink">
                {job.jobType.replace(/_/g, " ")}
              </span>
              <span
                className={`rounded-md px-2 py-0.5 text-2xs font-medium ${
                  job.status === "running"
                    ? "bg-brand-soft text-brand-strong"
                    : job.status === "failed"
                      ? "bg-danger-soft text-danger"
                      : job.status === "completed"
                        ? "bg-ok-soft text-ok"
                        : "bg-surface-strong text-muted"
                }`}
              >
                {job.status}
              </span>
              {job.message && (
                <span className="text-2xs text-muted">{job.message}</span>
              )}
              {job.attempt > 1 && (
                <span className="text-2xs text-muted">attempt {job.attempt}</span>
              )}
            </div>
            {job.status === "running" && (
              <div className="h-1 overflow-hidden rounded-full bg-surface-strong">
                <div
                  className="h-full rounded-full bg-brand transition-[width] duration-500"
                  style={{ width: `${job.progressPercent ?? 0}%` }}
                />
              </div>
            )}
            {/* The reason, not just the fact — it is the only thing that
                tells anyone what to do next. */}
            {job.error && <p className="text-2xs text-danger">{job.error}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

