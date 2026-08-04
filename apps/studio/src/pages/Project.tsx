import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useRef, useState } from "react";
import {
  Link,
  Navigate,
  Outlet,
  useLocation,
  useParams,
} from "react-router-dom";

import { Mark } from "../brand/Mark";
import { DoTheRest } from "../components/DoTheRest";
import { Jobs } from "../components/Jobs";
import { StageRail } from "../components/StageRail";
import { Trim } from "../components/Trim";
import { errorText } from "../lib/errorText";
import { shortName } from "../lib/names";
import { firstStageNeeding, STAGES, type StageSlug } from "../lib/stages";
import { useSermonFacts } from "../lib/useSermonFacts";
import type { RoomContext } from "./project/rooms";
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
      setError(errorText(e, "Upload failed"));
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

/** The room's wash, keyed to the pipeline ramp in tokens.css. */
const TINT: Record<StageSlug, string> = {
  source: "bg-stage-source",
  transcript: "bg-stage-transcript",
  writing: "bg-stage-writing",
  clips: "bg-stage-clips",
  publish: "bg-stage-publish",
};

/**
 * One sermon, five rooms.
 *
 * This was a single scroll carrying eight jobs, which meant there was
 * nowhere to be and nothing to come back to: you re-found your place by
 * reading past everything already finished.
 *
 * The layout now owns three things and nothing else. Which sermon this is,
 * where you are in it, and the wash that says so from the corner of your
 * eye. The work itself lives in the rooms.
 */
export function ProjectPage() {
  const { id } = useParams();
  const projectId = id as Id<"amplifyProjects">;
  const project = useQuery(api.amplify.getProject, { projectId });
  const enqueue = useMutation(api.amplifyWorker.enqueue);
  const location = useLocation();

  // Every hook runs on every render. This one sat below the loading and
  // not-found returns once, so the first render called four hooks and the
  // second called five — React error #310.
  const [retrim, setRetrim] = useState(false);
  const sermon = useSermonFacts(projectId);

  if (project === undefined) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted">
        Loading…
      </div>
    );
  }

  if (project === null) {
    // Indistinguishable from a sermon that never existed. An id that errors
    // differently is an id you can probe with.
    return (
      <div className="mx-auto grid max-w-2xl gap-2 px-5 py-16 text-center">
        <p className="font-display text-lg font-semibold text-ink">Not found</p>
        <Link to="/projects" className="text-sm text-muted underline">
          Back to sermons
        </Link>
      </div>
    );
  }

  // Which room, from anywhere inside it. Taking the last path segment broke
  // the moment a room got a child: /writing/blog_post reads as the room
  // "blog_post", finds no such stage, and bounces you back out of the piece
  // you just opened.
  const segments = location.pathname.split("/");
  const current = STAGES.find((s) => segments.includes(s.slug));
  const slug = current?.slug as StageSlug;

  // Opened without saying where: go to the room that actually wants them.
  // Landing on Source every time means reading past finished work to reach
  // the part that is not.
  if (!current) {
    if (sermon.loading) {
      return (
        <div className="grid min-h-screen place-items-center text-sm text-muted">
          Loading…
        </div>
      );
    }
    return <Navigate to={firstStageNeeding(sermon.readings)} replace />;
  }

  const { source, master } = sermon;

  const sourceRoom = (
    <>
      <div className="card grid gap-3 p-5">
        <p className="card-title">The recording</p>
        {source ? (
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm text-ink" title={source.filename}>
              {shortName(source.filename)}
            </span>
            {source.durationSeconds ? (
              <span className="data">
                {Math.round(source.durationSeconds / 60)} min
              </span>
            ) : null}
            {/* No Transcribe button here any more. Trimming now queues one
                by itself, and when it needs pressing by hand it belongs on
                the Transcript page — which is where somebody goes when they
                are wondering where the transcript is. */}
            {master ? (
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
            ) : null}
          </div>
        ) : (
          <SourceUpload projectId={projectId} />
        )}
      </div>

      {/* Trim appears once there is something to trim and goes once the
          sermon has been cut. A finished step is clutter, and the master is
          named in the card above it. */}
      {source && (!master || retrim) ? (
        <Trim
          projectId={projectId}
          sourceAssetId={source._id}
          onQueued={() => setRetrim(false)}
        />
      ) : null}

      {/* Directly under the recording, because this is where somebody is
          standing the moment they finish trimming, and "what now?" should
          not need looking for. */}
      {/* Or a transcript without one. A sermon can arrive already
          transcribed — an import, a re-file, a trim that was undone — and
          gating purely on the cut would hide the button on exactly the
          sermon that has everything it needs and none of the writing. */}
      <DoTheRest
        projectId={projectId}
        ready={!!master || sermon.hasTranscript}
      />

      {/* Only this room's work. Transcribing reports on the Transcript
          page and cutting reports on Clips, because that is where somebody
          goes when they are wondering how it is getting on. */}
      <Jobs projectId={projectId} types={["trim", "youtube_import"]} />
    </>
  );

  const context: RoomContext = {
    projectId,
    masterAssetId: master?._id ?? null,
    hasTranscript: sermon.hasTranscript,
    source: sourceRoom,
  };

  return (
    // The wash covers the whole page below the header, so moving between
    // rooms is a change of ground rather than a change of card.
    <div className={`min-h-screen transition-colors ${TINT[slug]}`}>
      <div className="mx-auto max-w-5xl px-5 pb-4 pt-7">
        <Link
          to="/projects"
          className="text-xs text-muted transition-colors hover:text-ink"
        >
          ← All sermons
        </Link>
        <h1 className="mt-2.5 font-display text-[2rem] font-bold leading-[1.15] tracking-[-0.02em] text-ink">
          {project.title}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="data">{longDate(project.sermonDate)}</span>
          <span className="h-3 w-px bg-border" aria-hidden />
          {/* Both, when they differ. This is the screen somebody is on when
              they press Write, and the second name is what the writing will
              actually call him — worth seeing before, not after. */}
          <span className="text-sm text-muted">{project.speaker}</span>
          {project.speakerDisplayName &&
          project.speakerDisplayName !== project.speaker ? (
            <span className="text-sm text-faint">
              written as {project.speakerDisplayName}
            </span>
          ) : null}
        </p>
      </div>

      <StageRail readings={sermon.readings} />

      <div className="mx-auto max-w-5xl px-5 py-7">
        <Outlet context={context} />
      </div>
    </div>
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

