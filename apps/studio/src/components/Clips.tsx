import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useEffect, useRef, useState } from "react";

import { errorText } from "../lib/errorText";
import { hhmmss, TimeMark } from "./TimeMark";

/**
 * How long a video is and what shape it is, read in the browser.
 *
 * Recorded with the file because publishing needs the shape to refuse a
 * widescreen clip — posting one to a reel letterboxes it into a strip down
 * the middle of the phone screen, which is the sort of mistake you find out
 * about from the feed rather than from the app.
 *
 * Nothing here is fatal. A container the browser will not decode still
 * uploads; it simply arrives without dimensions, and the guard that needs
 * them steps aside rather than blocking a file that may be perfectly good.
 */
async function measureVideo(
  file: File,
): Promise<{ durationSeconds?: number; width?: number; height?: number }> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      const done = (out: {
        durationSeconds?: number;
        width?: number;
        height?: number;
      }) => resolve(out);
      video.onloadedmetadata = () =>
        done({
          durationSeconds: Number.isFinite(video.duration)
            ? Math.round(video.duration)
            : undefined,
          width: video.videoWidth || undefined,
          height: video.videoHeight || undefined,
        });
      video.onerror = () => done({});
      // Belt and braces: a file that neither loads nor errors would leave
      // the upload button spinning for ever.
      setTimeout(() => done({}), 10_000);
      video.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The moments worth clipping.
 *
 * The model's job here is to read forty minutes so a person does not have to.
 * The person's job is to disagree with it — so every suggestion shows why it
 * was chosen, and discarding one is as easy as keeping it. A list that only
 * offered "export" would be asking for agreement rather than judgement.
 *
 * Ordered best-first, but the score is shown rather than hidden behind the
 * ordering: an 82 next to a 79 says "these are much the same, pick the one
 * you like", which a bare list does not.
 */

type Clip = {
  _id: Id<"amplifyClips">;
  title: string | null;
  startSeconds: number;
  endSeconds: number;
  score: number | null;
  analysisJson: string | null;
  status: string;
  exportedAssetId: Id<"amplifyAssets"> | null;
};

/**
 * Getting a clip's edges exactly right.
 *
 * The same two marks as the trim, on the sermon rather than the service.
 * This matters more here: a sermon that starts two seconds early is untidy,
 * a reel that starts two seconds early has lost its hook, and the hook is
 * the only thing deciding whether anybody watches the rest.
 *
 * The player opens at the clip's start rather than at zero, because the
 * thing being judged is thirty seconds somewhere inside forty minutes and
 * scrubbing to it every time is the tedious part.
 */
function ClipEditor({
  clip,
  masterAssetId,
  onDone,
}: {
  clip: Clip;
  masterAssetId: Id<"amplifyAssets">;
  onDone: () => void;
}) {
  const playbackUrl = useAction(api.amplifyMedia.playbackUrl);
  const adjust = useMutation(api.amplifyClips.adjust);

  const video = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [position, setPosition] = useState(clip.startSeconds);
  const [start, setStart] = useState(clip.startSeconds);
  const [end, setEnd] = useState(clip.endSeconds);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void playbackUrl({ assetId: masterAssetId }).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [playbackUrl, masterAssetId]);

  const seek = (to: number) => {
    if (video.current) video.current.currentTime = to;
  };

  const valid = end > start;

  return (
    <div className="grid gap-2.5 rounded-xl bg-surface-strong p-3.5">
      {url ? (
        <video
          ref={video}
          src={url}
          controls
          preload="metadata"
          // Open where the clip is, not at the top of the sermon.
          onLoadedMetadata={() => seek(clip.startSeconds)}
          onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
          className="w-full rounded-lg bg-black"
        />
      ) : (
        <div className="grid h-40 place-items-center rounded-lg bg-surface text-sm text-muted">
          Loading the sermon…
        </div>
      )}

      <TimeMark
        label="Clip starts"
        value={start}
        onSet={() => setStart(position)}
        onNudge={(by) => {
          const next = Math.max(0, start + by);
          setStart(next);
          seek(next);
        }}
        onSeek={seek}
      />
      <TimeMark
        label="Clip ends"
        value={end}
        onSet={() => setEnd(position)}
        onNudge={(by) => {
          const next = Math.max(0, end + by);
          setEnd(next);
          seek(next);
        }}
        onSeek={seek}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={busy || !valid}
          onClick={async () => {
            setBusy(true);
            try {
              await adjust({
                clipId: clip._id,
                startSeconds: start,
                endSeconds: end,
              });
              onDone();
            } finally {
              setBusy(false);
            }
          }}
          className="rounded-lg bg-ink px-3 py-1.5 text-2xs font-medium text-white hover:bg-ink/85 disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save these times"}
        </button>
        <button
          onClick={onDone}
          className="text-2xs text-muted underline hover:text-ink"
        >
          Cancel
        </button>
        <span className="data">
          {valid ? `${Math.round(end - start)}s` : "the end is before the start"}
        </span>
      </div>
    </div>
  );
}

function ClipRow({
  clip,
  projectId,
  masterAssetId,
  hasReel,
  masterUrl,
}: {
  clip: Clip;
  projectId: Id<"amplifyProjects">;
  masterAssetId: Id<"amplifyAssets"> | null;
  /** An editor has already built a reel from this moment. */
  hasReel: boolean;
  /** The whole sermon, signed once, seeked per clip. */
  masterUrl: string | null;
}) {
  const enqueue = useMutation(api.amplifyWorker.enqueue);
  const discard = useMutation(api.amplifyClips.discard);
  const packageReel = useAction(api.amplifyReel.packageReel);
  const playbackUrl = useAction(api.amplifyMedia.playbackUrl);
  const requestUpload = useAction(api.amplifyMedia.requestUpload);
  const recordAsset = useMutation(api.amplifyMedia.recordAsset);
  const [packaging, setPackaging] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const analysis = (() => {
    if (!clip.analysisJson) return null;
    try {
      return JSON.parse(clip.analysisJson) as Record<string, string> & {
        editorial_scores?: Record<string, number>;
      };
    } catch {
      return null;
    }
  })();

  // The five sub-scores, in the order the ranker reasons in rather than
  // whatever order JSON.parse happened to produce. `editor` is left out: it
  // is the same judgement as the big number beside the hook.
  const ORDER = ["hook", "cadence", "standalone", "emotion"];
  const scores: [string, number][] = Object.entries(
    analysis?.editorial_scores ?? {},
  )
    .filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === "number" && entry[0] !== "editor",
    )
    .sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]));

  const exported = Boolean(clip.exportedAssetId);
  const length = clip.endSeconds - clip.startSeconds;

  return (
    <li className="grid gap-2 border-b border-border px-5 py-3.5 last:border-0">
      <div className="flex gap-3.5">
        {/* The moment itself, not a description of it.

            A clip is video, and a list that showed only a quote and a
            timecode made a media tool read like a spreadsheet. The frame is
            seeked out of the sermon everybody already has — no render, no
            second file, no worker. */}
        <div className="relative shrink-0 overflow-hidden rounded-lg bg-black">
          {masterUrl ? (
            <video
              // The fragment never reaches S3; the browser range-requests
              // around that timestamp and paints the frame.
              src={`${masterUrl}#t=${Math.max(0, Math.floor(clip.startSeconds))}`}
              preload="metadata"
              muted
              playsInline
              className="h-[4.5rem] w-28 object-cover"
            />
          ) : (
            <div className="h-[4.5rem] w-28 animate-pulse bg-surface-strong" />
          )}
          <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[0.625rem] font-medium text-white">
            {Math.round(length)}s
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-x-2.5">
            {/* The hook is the clip. It is the first thing anyone hears and
                the only thing that decides whether they keep watching. */}
            <p className="min-w-0 flex-1 text-[0.9375rem] font-semibold leading-snug text-ink">
              {clip.title || "Untitled moment"}
            </p>
            {clip.score !== null && (
              <span
                title="The model's editorial score"
                className={`shrink-0 text-lg font-semibold tabular-nums ${
                  clip.score >= 85
                    ? "text-ok"
                    : clip.score >= 70
                      ? "text-ink"
                      : "text-faint"
                }`}
              >
                {Math.round(clip.score)}
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="data">
              {hhmmss(clip.startSeconds)}–{hhmmss(clip.endSeconds)}
            </span>
            {analysis?.clip_type && (
              <span className="rounded-md bg-surface-strong px-2 py-0.5 text-2xs font-medium text-muted">
                {analysis.clip_type}
              </span>
            )}
            {analysis?.cadence_marker && (
              <span className="text-2xs text-faint">
                {analysis.cadence_marker}
              </span>
            )}
            {/* Which feed this one belongs in, and whether it stops a
                thumb. The ranker has judged both on every clip since the
                day it was written; the schema dropped them on the way out
                and nobody ever saw them. */}
            {analysis?.best_platform_fit && (
              <span className="rounded-md bg-brand-soft px-2 py-0.5 text-2xs font-medium text-brand-strong">
                {analysis.best_platform_fit}
              </span>
            )}
            {analysis?.scroll_stopping_strength && (
              <span
                title="How well the first seconds stop a scroll"
                className={`text-2xs font-medium ${
                  analysis.scroll_stopping_strength === "High"
                    ? "text-ok"
                    : analysis.scroll_stopping_strength === "Medium"
                      ? "text-muted"
                      : "text-faint"
                }`}
              >
                {analysis.scroll_stopping_strength} stop
              </span>
            )}
            {exported && (
              <span className="rounded-md bg-ok-soft px-2 py-0.5 text-2xs font-medium text-ok">
                cut
              </span>
            )}
            {hasReel && (
              <span className="rounded-md bg-ok-soft px-2 py-0.5 text-2xs font-medium text-ok">
                reel ready
              </span>
            )}
          </div>

          {/* Four judgements behind one number, so the useful question —
              what is this clip weak at — can be answered at a glance.

              The number is the score. The bar is only there to make the
              weak one findable without reading four figures, and it is
              drawn from 50 rather than 0: these are the ranker's top ten
              of a whole sermon, so nothing scores below the fifties, and a
              0–100 track spent half its width on a range that never
              occurs. Everything landed in the top third and read as four
              identical grey pills. */}
          {scores.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
              {scores.map(([name, value]) => (
                <span key={name} className="grid gap-1">
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-2xs capitalize text-faint">
                      {name}
                    </span>
                    <span
                      className={`text-2xs font-semibold tabular-nums ${
                        value >= 85
                          ? "text-ok"
                          : value >= 70
                            ? "text-muted"
                            : "text-faint"
                      }`}
                    >
                      {Math.round(value)}
                    </span>
                  </span>
                  <span className="block h-1 w-14 overflow-hidden rounded-full bg-surface-strong">
                    <span
                      className={`block h-full rounded-full ${
                        value >= 85
                          ? "bg-ok"
                          : value >= 70
                            ? "bg-muted"
                            : "bg-faint"
                      }`}
                      style={{
                        width: `${Math.min(100, Math.max(0, (value - 50) * 2))}%`,
                      }}
                    />
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">

        <div className="ml-auto flex items-center gap-2.5">
          {analysis?.editor_reason && (
            <button
              onClick={() => setOpen(!open)}
              className="text-2xs text-muted underline hover:text-ink"
            >
              {open ? "Hide" : "Why"}
            </button>
          )}
          {masterAssetId && (
            <button
              onClick={() => setEditing(!editing)}
              className="text-2xs text-muted underline hover:text-ink"
            >
              {editing ? "Done" : "Adjust"}
            </button>
          )}
          {/* Only offered on a clip that exists as a file. Packaging a
              suggestion nobody has cut yet writes captions for a video that
              may never be made. */}
          {exported && (
            <button
              disabled={packaging}
              onClick={async () => {
                setPackaging(true);
                try {
                  await packageReel({ clipId: clip._id });
                } finally {
                  setPackaging(false);
                }
              }}
              className="text-2xs text-muted underline hover:text-ink disabled:opacity-40"
            >
              {packaging ? "Writing…" : "Make it the reel"}
            </button>
          )}
          <button
            onClick={() => void discard({ clipId: clip._id })}
            className="text-2xs text-muted underline hover:text-ink"
          >
            Discard
          </button>
          {/* Once it has actually been cut there is a file, and the only way
              to reach it was the library two screens away. A cut clip is
              something somebody wants in their hands. */}
          {clip.exportedAssetId && (
            <button
              disabled={downloading}
              onClick={async () => {
                setDownloading(true);
                try {
                  const url = await playbackUrl({
                    assetId: clip.exportedAssetId!,
                    download: true,
                  });
                  window.location.href = url;
                } finally {
                  setDownloading(false);
                }
              }}
              className="text-2xs text-muted underline hover:text-ink disabled:opacity-40"
            >
              {downloading ? "Preparing…" : "Download"}
            </button>
          )}
          {/* The finished reel, coming back from an editor.

              Stored against the clip rather than over it. A clip and a reel
              are different things: the clip is the moment cut out of the
              sermon and it stays that, which is what lets an editor work
              from it and what stops two of them building a reel out of the
              same moment. This is the reel — what actually gets posted. */}
          <label
            className={`cursor-pointer rounded-lg border border-border bg-surface px-3 py-1.5 text-2xs font-medium transition-colors ${
              uploading
                ? "text-faint"
                : "text-muted hover:border-border-strong hover:text-ink"
            }`}
          >
            <input
              type="file"
              accept="video/*"
              className="hidden"
              disabled={uploading}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setUploading(true);
                setUploadError(null);
                try {
                  // Measured before sending. Publishing checks the shape to
                  // stop a widescreen clip being letterboxed into a strip
                  // down the middle of a phone screen, and it can only do
                  // that if the dimensions were recorded.
                  const probe = await measureVideo(file);
                  const { uploadUrl, storageKey } = await requestUpload({
                    projectId,
                    kind: "reel_video",
                    filename: file.name,
                    contentType: file.type || "video/mp4",
                  });
                  const put = await fetch(uploadUrl, {
                    method: "PUT",
                    body: file,
                    headers: { "Content-Type": file.type || "video/mp4" },
                  });
                  if (!put.ok) throw new Error(`Upload failed (${put.status})`);

                  // subjectId ties it to the clip it was built from, which
                  // is how publishing finds it and how a second editor can
                  // see the moment is already taken. No second step: the
                  // clip's own cut is left exactly where it was.
                  await recordAsset({
                    projectId,
                    kind: "reel_video",
                    subjectId: clip._id,
                    storageKey,
                    filename: file.name,
                    mimeType: file.type || "video/mp4",
                    ...probe,
                  });
                } catch (err) {
                  setUploadError(errorText(err, "That upload didn't work"));
                } finally {
                  setUploading(false);
                }
              }}
            />
            {uploading
              ? "Uploading…"
              : hasReel
                ? "Replace the reel"
                : "Upload the reel"}
          </label>
          <button
            disabled={busy || !masterAssetId}
            onClick={async () => {
              if (!masterAssetId) return;
              setBusy(true);
              try {
                await enqueue({
                  projectId,
                  jobType: "clip_export",
                  payloadJson: JSON.stringify({
                    clipId: clip._id,
                    assetId: masterAssetId,
                    startSeconds: clip.startSeconds,
                    endSeconds: clip.endSeconds,
                  }),
                });
              } finally {
                setBusy(false);
              }
            }}
            // Same rule as the writing list: a clip already cut gets a
            // quieter button than one waiting to be. Eight suggestions with
            // eight identical solid buttons is a wall, and the wall hides
            // which ones are still outstanding.
            className={`rounded-lg px-3 py-1.5 text-2xs font-medium transition-colors disabled:opacity-40 ${
              exported
                ? "border border-border bg-surface text-muted hover:border-border-strong hover:text-ink"
                : "bg-ink text-white hover:bg-ink/85"
            }`}
          >
            {busy ? "Cutting…" : exported ? "Cut again" : "Cut it"}
          </button>
        </div>
      </div>

      {uploadError && (
        <p className="text-[0.8125rem] text-danger">{uploadError}</p>
      )}

      {/* Why this one — the thing that lets somebody disagree on purpose
          rather than just scrolling past. */}
      {editing && masterAssetId && (
        <ClipEditor
          clip={clip}
          masterAssetId={masterAssetId}
          onDone={() => setEditing(false)}
        />
      )}

      {open && analysis?.editor_reason && (
        <p className="rounded-xl bg-surface-strong p-3 text-[0.8125rem] leading-relaxed text-muted">
          {analysis.editor_reason}
        </p>
      )}
    </li>
  );
}

export function Clips({
  projectId,
  masterAssetId,
  hasTranscript,
}: {
  projectId: Id<"amplifyProjects">;
  masterAssetId: Id<"amplifyAssets"> | null;
  hasTranscript: boolean;
}) {
  const clips = useQuery(api.amplifyClips.list, { projectId });
  const assets = useQuery(api.amplifyMedia.listAssets, { projectId });
  const findClips = useAction(api.amplifyClipFinder.findClips);
  const signMaster = useAction(api.amplifyMedia.playbackUrl);

  // One signed URL for the whole list. Every row shows the frame at its own
  // start time by seeking into the same file, so eight clips cost one
  // signature and one file rather than eight of each.
  const [masterUrl, setMasterUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!masterAssetId) return;
    let alive = true;
    void signMaster({ assetId: masterAssetId }).then((u) => {
      if (alive) setMasterUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [signMaster, masterAssetId]);
  // Which clips already have a finished reel against them — so an editor
  // can see at a glance that a moment is taken, which is the whole reason
  // the two are tied together.
  const reeled = new Set(
    (assets ?? [])
      .filter((a) => a.kind === "reel_video" && a.status === "ready")
      .map((a) => a.subjectId),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const live = (clips ?? []).filter((c) => c.status !== "discarded");

  return (
    <div className="card grid gap-3 p-5">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <p className="card-title">Clips</p>
        {live.length > 0 && (
          <span className="data">{live.length} suggested</span>
        )}
        <button
          disabled={busy || !hasTranscript}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await findClips({ projectId });
            } catch (e) {
              setError(errorText(e, "Could not read the sermon for clips"));
            } finally {
              setBusy(false);
            }
          }}
          // Solid while there is nothing to look at, quiet once there is.
          // Reading forty minutes again is rarely what somebody came here
          // for, and a solid button at the top of a full list draws the eye
          // away from the eight suggestions underneath it.
          className={`ml-auto rounded-lg px-3 py-1.5 text-2xs font-medium transition-colors disabled:opacity-40 ${
            live.length > 0
              ? "border border-border bg-surface text-muted hover:border-border-strong hover:text-ink"
              : "bg-ink text-white hover:bg-ink/85"
          }`}
        >
          {busy
            ? "Reading the sermon…"
            : live.length > 0
              ? "Look again"
              : "Find the moments"}
        </button>
      </div>

      {error && <p className="text-[0.8125rem] text-danger">{error}</p>}

      {!hasTranscript ? (
        <p className="text-sm text-muted">
          Clips are found in the transcript, so transcribe the sermon first.
        </p>
      ) : live.length === 0 ? (
        // An empty state that says what will happen, not just that nothing
        // is here.
        <p className="text-sm text-muted">
          Nothing yet. Reading the sermon takes a minute or two and comes back
          with the moments most likely to work on their own.
        </p>
      ) : (
        <>
          {!masterAssetId && (
            <p className="text-[0.8125rem] text-muted">
              Trim the sermon before cutting clips — clips are cut from the
              sermon, not the whole service.
            </p>
          )}
          <ul className="-mx-5 -mb-5 border-t border-border">
            {live.map((clip) => (
              <ClipRow
                key={clip._id}
                clip={clip}
                projectId={projectId}
                masterAssetId={masterAssetId}
                hasReel={reeled.has(clip._id)}
                masterUrl={masterUrl}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
