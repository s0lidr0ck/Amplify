import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Mark } from "../brand/Mark";
import { Outputs } from "../components/Outputs";
import { SignalRail } from "../components/SignalRail";
import { Trim } from "../components/Trim";
import { stageStates, type StageProgress } from "../lib/stageGating";
import { formatBytes, uploadToS3, type UploadProgress } from "../lib/upload";

/**
 * One sermon: what has been uploaded, and what the worker is doing about it.
 *
 * The job list is a subscription. The progress bar moves because the worker
 * wrote a number into Convex, not because this page asked again — which is
 * the difference the rebuild buys, and the reason there is no polling here.
 */

function SourceUpload({ projectId }: { projectId: Id<"amplifyProjects"> }) {
  const requestUpload = useAction(api.amplifyMedia.requestUpload);
  const recordAsset = useMutation(api.amplifyMedia.recordAsset);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const start = async (file: File) => {
    setError(null);
    setProgress({ percent: 0, loaded: 0, total: file.size });
    try {
      // Two steps on purpose. The upload happens between them and might not
      // finish; a row written first would claim media that does not exist.
      const { uploadUrl, storageKey } = await requestUpload({
        projectId,
        kind: "source_video",
        filename: file.name,
        contentType: file.type,
      });

      const { promise, abort } = uploadToS3(uploadUrl, file, setProgress);
      abortRef.current = abort;
      await promise;

      await recordAsset({
        projectId,
        kind: "source_video",
        storageKey,
        filename: file.name,
        mimeType: file.type || "video/mp4",
      });
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*Error:\s*/, "") : "Upload failed");
      setProgress(null);
    } finally {
      abortRef.current = null;
    }
  };

  if (progress) {
    const pct = progress.percent ?? 0;
    return (
      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-ink">Uploading…</span>
          <span className="font-mono text-2xs text-muted">
            {formatBytes(progress.loaded)} of {formatBytes(progress.total)}
            {progress.percent !== null ? ` · ${pct}%` : ""}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-strong">
          {/* Rose, because this is the one thing happening right now. */}
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
        <button
          onClick={() => abortRef.current?.()}
          className="justify-self-start text-2xs text-muted underline hover:text-ink"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void start(file);
        }}
        className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-ink file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-ink/85"
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <p className="text-2xs text-muted">
        The whole service is fine — you&rsquo;ll trim the sermon out next.
      </p>
    </div>
  );
}

function Jobs({ projectId }: { projectId: Id<"amplifyProjects"> }) {
  const jobs = useQuery(api.amplifyWorker.listJobs, { projectId });
  if (!jobs || jobs.length === 0) return null;

  return (
    <div className="card grid gap-2 p-4">
      <p className="section-label">Work</p>
      <ul className="grid gap-2">
        {jobs.map((job) => (
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

/** What has actually been produced, in the shape the gating expects. */
function Progress({ projectId }: { projectId: Id<"amplifyProjects"> }) {
  const assets = useQuery(api.amplifyMedia.listAssets, { projectId });
  const transcript = useQuery(api.amplifyTranscripts.summary, { projectId });
  const drafts = useQuery(api.amplifyDrafts.list, { projectId });

  if (!assets || transcript === undefined || !drafts) return null;

  const has = (kind: string) => assets.some((a) => a.kind === kind);
  const wrote = (kind: string) =>
    drafts.some((d) => d.kind === kind && d.status === "ready");

  const progress: StageProgress = {
    source: has("source_video"),
    trim: has("sermon_master"),
    transcript: transcript !== null,
    transcriptApproved: transcript?.approved ?? false,
    metadata: wrote("metadata"),
    titleDesc: wrote("youtube_packaging"),
    blog: wrote("blog_post"),
    textPost: wrote("facebook_post"),
    published: false,
  };

  return (
    <div className="card p-4">
      <SignalRail states={stageStates(progress, null)} />
    </div>
  );
}

export function ProjectPage() {
  const { id } = useParams();
  const projectId = id as Id<"amplifyProjects">;
  const project = useQuery(api.amplify.getProject, { projectId });
  const assets = useQuery(api.amplifyMedia.listAssets, { projectId });
  const enqueue = useMutation(api.amplifyWorker.enqueue);

  if (project === undefined) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted">
        Loading…
      </div>
    );
  }

  if (project === null) {
    // Indistinguishable from a sermon that never existed — see the access
    // rules; an id that errors differently is an id you can probe with.
    return (
      <div className="mx-auto grid max-w-2xl gap-2 px-5 py-16 text-center">
        <p className="font-display text-lg font-semibold text-ink">Not found</p>
        <Link to="/projects" className="text-sm text-muted underline">
          Back to sermons
        </Link>
      </div>
    );
  }

  const source = assets?.find((a) => a.kind === "source_video");
  const master = assets?.find((a) => a.kind === "sermon_master");

  return (
    <div className="mx-auto grid max-w-3xl gap-5 px-5 py-8">
      <header className="grid gap-3 border-b border-border pb-4">
        <Link to="/projects" className="flex items-center gap-2 text-2xs text-muted hover:text-ink">
          <Mark size={16} /> All sermons
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-display text-[1.7rem] font-bold leading-tight tracking-tight text-ink">
            {project.title}
          </h1>
          <span className="font-mono text-xs text-muted">{project.sermonDate}</span>
          <span className="text-xs text-muted">
            {project.speakerDisplayName ?? project.speaker}
          </span>
        </div>
      </header>

      <div className="card grid gap-3 p-4">
        <p className="section-label">Source</p>
        {source ? (
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm text-ink">{source.filename}</span>
            {source.durationSeconds && (
              <span className="font-mono text-2xs text-muted">
                {Math.round(source.durationSeconds / 60)} min
              </span>
            )}
            <button
              onClick={() =>
                void enqueue({
                  projectId,
                  jobType: "transcribe",
                  payloadJson: JSON.stringify({ assetId: source._id }),
                })
              }
              className="ml-auto rounded-lg bg-ink px-3 py-1.5 text-2xs font-medium text-white hover:bg-ink/85"
            >
              Transcribe
            </button>
          </div>
        ) : (
          <SourceUpload projectId={projectId} />
        )}
      </div>

      {/* Trim only appears once there is something to trim, and disappears
          once the sermon has been cut — a step that is finished is clutter,
          and the master is on the page above it. */}
      {source && !master && (
        <Trim projectId={projectId} sourceAssetId={source._id} />
      )}

      <Outputs projectId={projectId} />

      <Jobs projectId={projectId} />
    </div>
  );
}
