import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Mark } from "../brand/Mark";
import { Clips } from "../components/Clips";
import { Outputs } from "../components/Outputs";
import { Publish } from "../components/Publish";
import { SignalRail } from "../components/SignalRail";
import { Transcript } from "../components/Transcript";
import { Trim } from "../components/Trim";
import { shortName } from "../lib/names";
import { stageStates, type StageProgress } from "../lib/stageGating";
import {
  formatBytes,
  uploadInParts,
  type UploadProgress,
} from "../lib/multipart";

/**
 * One sermon: what has been uploaded, and what the worker is doing about it.
 *
 * The job list is a subscription. The progress bar moves because the worker
 * wrote a number into Convex, not because this page asked again — which is
 * the difference the rebuild buys, and the reason there is no polling here.
 */

function SourceUpload({ projectId }: { projectId: Id<"amplifyProjects"> }) {
  const beginUpload = useAction(api.amplifyUpload.begin);
  const completeUpload = useAction(api.amplifyUpload.complete);
  const abandonUpload = useAction(api.amplifyUpload.abandon);
  const recordAsset = useMutation(api.amplifyMedia.recordAsset);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const start = async (file: File) => {
    setError(null);
    setProgress({
      percent: 0,
      loaded: 0,
      total: file.size,
      partsDone: 0,
      partsTotal: 0,
    });

    let began: { uploadId: string; storageKey: string } | null = null;
    try {
      // In parts, not one PUT. A single PUT caps at 5 GB, cannot resume, and
      // gets one connection's throughput — all three of which a two-hour
      // service recording walks straight into.
      const { uploadId, storageKey, partSize, urls } = await beginUpload({
        projectId,
        kind: "source_video",
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      });
      began = { uploadId, storageKey };

      const { promise, abort } = uploadInParts(file, urls, partSize, setProgress);
      abortRef.current = abort;
      const etags = await promise;

      await completeUpload({
        projectId,
        storageKey,
        uploadId,
        etags,
      });

      // Recorded only once S3 has assembled the object. A row written any
      // earlier would claim media that does not exist yet.
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
      // Throw the parts away. Until the completion call they are billed
      // storage that is not yet an object, and a cancelled upload leaving
      // three gigabytes behind is a bill nobody can explain.
      if (began) {
        void abandonUpload({ projectId, ...began }).catch(() => {});
      }
      setError(
        e instanceof Error
          ? e.message.replace(/^.*Error:\s*/, "")
          : "Upload failed",
      );
      setProgress(null);
    } finally {
      abortRef.current = null;
    }
  };

  if (progress) {
    const pct = progress.percent;
    return (
      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-ink">Uploading…</span>
          <span className="font-mono text-2xs text-muted">
            {formatBytes(progress.loaded)} of {formatBytes(progress.total)}
            {/* The part count matters as much as the percentage: a stalled
                percentage looks like a hang, "part 41 of 300" looks like a
                slow connection, which is the truth. */}
            {progress.partsTotal > 1
              ? ` · part ${Math.min(progress.partsDone + 1, progress.partsTotal)} of ${progress.partsTotal}`
              : ""}
            {` · ${pct}%`}
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
      <p className="card-title">Work</p>
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
  const publications = useQuery(api.amplifyPublish.list, { projectId });

  if (!assets || transcript === undefined || !drafts || !publications)
    return null;

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
    published: publications.length > 0,
  };

  return <SignalRail states={stageStates(progress, null)} />;
}

export function ProjectPage() {
  const { id } = useParams();
  const projectId = id as Id<"amplifyProjects">;
  const project = useQuery(api.amplify.getProject, { projectId });
  const assets = useQuery(api.amplifyMedia.listAssets, { projectId });
  const transcriptSummary = useQuery(api.amplifyTranscripts.summary, {
    projectId,
  });
  const enqueue = useMutation(api.amplifyWorker.enqueue);

  // Every hook must run on every render. This one sat below the
  // loading and not-found returns, so the first render called four
  // hooks and the second called five — React error #310.
  const [retrim, setRetrim] = useState(false);

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
  const hasTranscript = transcriptSummary !== null && transcriptSummary !== undefined;

  return (
    <>
      {/* Title block sits on the page ground, above the rail — the sermon is
          the subject and the rail describes it, so the rail comes second. */}
      <div className="mx-auto max-w-4xl px-5 pb-5 pt-8">
        <Link
          to="/projects"
          className="text-xs text-muted transition-colors hover:text-ink"
        >
          ← All sermons
        </Link>
        <h1 className="mt-3 font-display text-[2.125rem] font-bold leading-[1.15] tracking-[-0.02em] text-ink">
          {project.title}
        </h1>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="data">{longDate(project.sermonDate)}</span>
          <span className="h-3 w-px bg-border" aria-hidden />
          <span className="text-sm text-muted">
            {project.speakerDisplayName ?? project.speaker}
          </span>
        </p>
      </div>

      {/* The channel strip: full-bleed, between hairlines, on the ground. */}
      <div className="rail-band">
        <div className="mx-auto max-w-4xl px-5 py-4">
          <Progress projectId={projectId} />
        </div>
      </div>

      <div className="mx-auto grid max-w-4xl gap-5 px-5 py-7">
      <div className="card grid gap-3 p-5">
        <p className="card-title">Source</p>
        {source ? (
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm text-ink" title={source.filename}>
              {shortName(source.filename)}
            </span>
            {source.durationSeconds && (
              <span className="data">{Math.round(source.durationSeconds / 60)} min</span>
            )}
            <button
              onClick={() =>
                void enqueue({
                  projectId,
                  jobType: "transcribe",
                  // The sermon if one has been cut, the whole service
                  // otherwise. Transcribing the source after a trim
                  // describes the whole evening — worship, notices and
                  // all — and every output written from it inherits it.
                  payloadJson: JSON.stringify({
                    assetId: (master ?? source)._id,
                  }),
                })
              }
              className="ml-auto rounded-lg bg-ink px-3 py-1.5 text-2xs font-medium text-white hover:bg-ink/85"
            >
              {master ? "Transcribe the sermon" : "Transcribe"}
            </button>

            {/* Which asset the writing will be built from, said plainly.
                Before this, a sermon that had been trimmed looked exactly
                like one that had not. */}
            {master && (
              <span className="w-full text-[0.8125rem] text-muted">
                Sermon cut out
                {master.durationSeconds
                  ? ` — ${Math.round(master.durationSeconds / 60)} min of ${
                      source.durationSeconds
                        ? `${Math.round(source.durationSeconds / 60)} min`
                        : "the service"
                    }`
                  : ""}
                .{" "}
                <button
                  onClick={() => setRetrim(true)}
                  className="underline hover:text-ink"
                >
                  Trim it again
                </button>
              </span>
            )}
          </div>
        ) : (
          <SourceUpload projectId={projectId} />
        )}
      </div>

      {/* Trim only appears once there is something to trim, and disappears
          once the sermon has been cut — a step that is finished is clutter,
          and the master is on the page above it. */}
      {source && (!master || retrim) && (
        <Trim
          projectId={projectId}
          sourceAssetId={source._id}
          onQueued={() => setRetrim(false)}
        />
      )}

      <Transcript projectId={projectId} />

      <Outputs projectId={projectId} />

      <Clips
        projectId={projectId}
        masterAssetId={master?._id ?? null}
        hasTranscript={hasTranscript}
      />

      <Publish projectId={projectId} />

      <Jobs projectId={projectId} />
      </div>
    </>
  );
}

/** "2 August 2026" reads; "2026-08-02" is a sort key wearing a date's
 *  clothes. The mono face keeps it lining up between rows. */
function longDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
