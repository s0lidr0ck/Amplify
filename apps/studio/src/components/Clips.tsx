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
 * Shown as a gallery of the moments themselves. The rows this replaced put
 * seven links and two buttons on every clip and hid the reasoning behind a
 * "Why" toggle, so the screen was mostly controls for work nobody had
 * decided to do yet. Deciding comes first, and deciding is visual: the
 * grid is for picking, and picking one opens everything about it at once —
 * the analysis, the four scores, the trim, and the actions — instead of
 * spreading them across dropdowns that have to be opened one at a time.
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

type Analysis = Record<string, string> & {
  editorial_scores?: Record<string, number>;
};

function parseAnalysis(json: string | null): Analysis | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as Analysis;
  } catch {
    return null;
  }
}

/**
 * The sub-scores, in the order the ranker reasons in rather than whatever
 * order JSON.parse happened to produce. `editor` is left out: it is the same
 * judgement as the headline number.
 */
const SCORE_ORDER = ["hook", "cadence", "standalone", "emotion"];

function subScores(analysis: Analysis | null): [string, number][] {
  return Object.entries(analysis?.editorial_scores ?? {})
    .filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === "number" && entry[0] !== "editor",
    )
    .sort((a, b) => SCORE_ORDER.indexOf(a[0]) - SCORE_ORDER.indexOf(b[0]));
}

const scoreTone = (value: number) =>
  value >= 85 ? "ok" : value >= 70 ? "muted" : "faint";

/**
 * One judgement, as a figure with a bar under it.
 *
 * The number is the score. The bar is only there to make the weak one
 * findable without reading four figures, and it is drawn from 50 rather than
 * 0: these are the ranker's top ten of a whole sermon, so nothing scores
 * below the fifties, and a 0–100 track spent half its width on a range that
 * never occurs. Everything landed in the top third and read as identical
 * grey pills.
 */
function ScoreBar({
  name,
  value,
  wide,
}: {
  name: string;
  value: number;
  wide?: boolean;
}) {
  const tone = scoreTone(value);
  return (
    <span className="grid gap-1">
      <span className="flex items-baseline gap-1.5">
        <span className="text-2xs capitalize text-faint">{name}</span>
        <span
          className={`text-2xs font-semibold tabular-nums ${
            tone === "ok"
              ? "text-ok"
              : tone === "muted"
                ? "text-muted"
                : "text-faint"
          }`}
        >
          {Math.round(value)}
        </span>
      </span>
      <span
        className={`block h-1 overflow-hidden rounded-full bg-surface-strong ${
          wide ? "w-full" : "w-14"
        }`}
      >
        <span
          className={`block h-full rounded-full ${
            tone === "ok" ? "bg-ok" : tone === "muted" ? "bg-muted" : "bg-faint"
          }`}
          style={{ width: `${Math.min(100, Math.max(0, (value - 50) * 2))}%` }}
        />
      </span>
    </span>
  );
}

/**
 * A moment in the gallery.
 *
 * The frame is seeked out of the sermon everybody already has — no render,
 * no second file, no worker. Enough on the face of it to choose between ten
 * of them: what is said, how strong it is, how long it runs, and whether
 * somebody has already dealt with it.
 */
function ClipCard({
  clip,
  hasReel,
  masterUrl,
  onOpen,
}: {
  clip: Clip;
  hasReel: boolean;
  masterUrl: string | null;
  onOpen: () => void;
}) {
  const analysis = parseAnalysis(clip.analysisJson);
  const exported = Boolean(clip.exportedAssetId);
  const length = clip.endSeconds - clip.startSeconds;

  return (
    <li>
      <button
        onClick={onOpen}
        className="group grid w-full gap-2 rounded-xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
          {masterUrl ? (
            <video
              // The fragment never reaches S3; the browser range-requests
              // around that timestamp and paints the frame.
              src={`${masterUrl}#t=${Math.max(0, Math.floor(clip.startSeconds))}`}
              preload="metadata"
              muted
              playsInline
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="h-full w-full animate-pulse bg-surface-strong" />
          )}

          {/* The score sits on the picture, where the eye already is when
              comparing one tile with the next. */}
          {clip.score !== null && (
            <span
              title="The model's editorial score"
              className={`absolute right-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums backdrop-blur-sm ${
                clip.score >= 85
                  ? "bg-ok/90 text-white"
                  : "bg-black/65 text-white"
              }`}
            >
              {Math.round(clip.score)}
            </span>
          )}
          <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[0.625rem] font-medium tabular-nums text-white">
            {Math.round(length)}s
          </span>

          {/* What has already been done to this moment. Only shown when it
              is true, so an untouched grid carries no badges at all. */}
          {(exported || hasReel) && (
            <span className="absolute bottom-1.5 right-1.5 rounded bg-ok/90 px-1.5 py-0.5 text-[0.625rem] font-medium text-white">
              {hasReel ? "reel ready" : "cut"}
            </span>
          )}
        </div>

        {/* The hook is the clip — the first thing anyone hears and the only
            thing deciding whether they keep watching. Two lines, so the
            tiles stay on a grid. */}
        <p className="line-clamp-2 text-[0.9375rem] font-semibold leading-snug text-ink">
          {clip.title || "Untitled moment"}
        </p>

        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-muted">
          <span className="data">{hhmmss(clip.startSeconds)}</span>
          {analysis?.clip_type && (
            <>
              <span className="h-2.5 w-px bg-border" aria-hidden />
              <span>{analysis.clip_type}</span>
            </>
          )}
          {analysis?.best_platform_fit && (
            <>
              <span className="h-2.5 w-px bg-border" aria-hidden />
              <span className="font-medium text-brand-strong">
                {analysis.best_platform_fit}
              </span>
            </>
          )}
        </p>
      </button>
    </li>
  );
}

/**
 * One moment, entirely.
 *
 * Everything that was behind a toggle is on the page here: the sermon
 * scrubbed to the moment, the two marks that set its edges, the full
 * reasoning, the four judgements behind the headline number, and the things
 * you can do about it. The row this replaced could show one of those at a
 * time, so comparing the reasoning against the trim meant opening one and
 * losing the other.
 */
function ClipDetail({
  clip,
  projectId,
  masterAssetId,
  hasReel,
  onClose,
}: {
  clip: Clip;
  projectId: Id<"amplifyProjects">;
  masterAssetId: Id<"amplifyAssets"> | null;
  hasReel: boolean;
  onClose: () => void;
}) {
  const playbackUrl = useAction(api.amplifyMedia.playbackUrl);
  const adjust = useMutation(api.amplifyClips.adjust);
  const enqueue = useMutation(api.amplifyWorker.enqueue);
  const discard = useMutation(api.amplifyClips.discard);
  const packageReel = useAction(api.amplifyReel.packageReel);
  const requestUpload = useAction(api.amplifyMedia.requestUpload);
  const recordAsset = useMutation(api.amplifyMedia.recordAsset);

  const video = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [position, setPosition] = useState(clip.startSeconds);
  const [start, setStart] = useState(clip.startSeconds);
  const [end, setEnd] = useState(clip.endSeconds);

  const [saving, setSaving] = useState(false);
  const [cutting, setCutting] = useState(false);
  const [packaging, setPackaging] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analysis = parseAnalysis(clip.analysisJson);
  const scores = subScores(analysis);
  const exported = Boolean(clip.exportedAssetId);
  const edited = start !== clip.startSeconds || end !== clip.endSeconds;
  const valid = end > start;

  useEffect(() => {
    if (!masterAssetId) return;
    let cancelled = false;
    void playbackUrl({ assetId: masterAssetId }).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [playbackUrl, masterAssetId]);

  // Escape closes it, the way every other dialog on the machine does.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const seek = (to: number) => {
    if (video.current) video.current.currentTime = to;
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={clip.title || "Clip"}
        onClick={(e) => e.stopPropagation()}
        className="my-auto grid w-full max-w-4xl gap-4 rounded-2xl bg-surface p-5 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-semibold leading-snug tracking-[-0.01em] text-ink">
              {clip.title || "Untitled moment"}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-muted">
              <span className="data">
                {hhmmss(clip.startSeconds)}–{hhmmss(clip.endSeconds)}
              </span>
              <span>{Math.round(clip.endSeconds - clip.startSeconds)}s</span>
              {analysis?.clip_type && (
                <span className="rounded-md bg-surface-strong px-2 py-0.5 font-medium">
                  {analysis.clip_type}
                </span>
              )}
              {analysis?.cadence_marker && (
                <span className="text-faint">{analysis.cadence_marker}</span>
              )}
              {analysis?.best_platform_fit && (
                <span className="rounded-md bg-brand-soft px-2 py-0.5 font-medium text-brand-strong">
                  {analysis.best_platform_fit}
                </span>
              )}
              {analysis?.scroll_stopping_strength && (
                <span
                  title="How well the first seconds stop a scroll"
                  className={`font-medium ${
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
                <span className="rounded-md bg-ok-soft px-2 py-0.5 font-medium text-ok">
                  cut
                </span>
              )}
              {hasReel && (
                <span className="rounded-md bg-ok-soft px-2 py-0.5 font-medium text-ok">
                  reel ready
                </span>
              )}
            </p>
          </div>
          {clip.score !== null && (
            <span
              title="The model's editorial score"
              className={`shrink-0 text-2xl font-semibold tabular-nums ${
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
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg px-2 py-1 text-lg leading-none text-faint hover:bg-surface-strong hover:text-ink"
          >
            &times;
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          {/* The moment, and its edges. Trimming is the one thing here that
              needs to be watched while it is done, so it sits with the
              player rather than in a panel that covers it. */}
          <div className="grid content-start gap-2.5">
            {!masterAssetId ? (
              <p className="rounded-xl bg-surface-strong p-3 text-[0.8125rem] text-muted">
                Trim the sermon first — clips are cut from the sermon, not the
                whole service.
              </p>
            ) : url ? (
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
              <div className="grid aspect-video place-items-center rounded-lg bg-surface-strong text-sm text-muted">
                Loading the sermon…
              </div>
            )}

            {masterAssetId && (
              <>
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
                  {/* Only once the marks have actually moved. A save button
                      on an untouched clip invites a save that changes
                      nothing and then has to be undone. */}
                  <button
                    disabled={saving || !valid || !edited}
                    onClick={async () => {
                      setSaving(true);
                      try {
                        await adjust({
                          clipId: clip._id,
                          startSeconds: start,
                          endSeconds: end,
                        });
                      } catch (e) {
                        setError(errorText(e, "Couldn't save those times"));
                      } finally {
                        setSaving(false);
                      }
                    }}
                    className="rounded-lg bg-ink px-3 py-1.5 text-2xs font-medium text-white hover:bg-ink/85 disabled:opacity-40"
                  >
                    {saving ? "Saving…" : "Save these times"}
                  </button>
                  <span className="data">
                    {valid
                      ? `${Math.round(end - start)}s`
                      : "the end is before the start"}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Why this one, and what it is weak at. The reasoning is the
              thing that lets somebody disagree on purpose rather than just
              scrolling past, so it is never hidden. */}
          <div className="grid content-start gap-4">
            {scores.length > 0 && (
              <div className="grid gap-3">
                <p className="section-label">The judgement</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {scores.map(([name, value]) => (
                    <ScoreBar key={name} name={name} value={value} wide />
                  ))}
                </div>
              </div>
            )}

            {analysis?.editor_reason && (
              <div className="grid gap-2">
                <p className="section-label">Why this moment</p>
                <p className="text-[0.8125rem] leading-relaxed text-muted">
                  {analysis.editor_reason}
                </p>
              </div>
            )}
          </div>
        </div>

        {error && <p className="text-[0.8125rem] text-danger">{error}</p>}

        {/* What you can do about it, all in one row at the bottom rather
            than seven links strung across the corner of a list. */}
        <div className="flex flex-wrap items-center gap-2.5 border-t border-border pt-4">
          <button
            onClick={() => {
              void discard({ clipId: clip._id });
              onClose();
            }}
            className="text-2xs text-muted underline hover:text-ink"
          >
            Discard
          </button>
          {exported && (
            <button
              disabled={packaging}
              onClick={async () => {
                setPackaging(true);
                try {
                  await packageReel({ clipId: clip._id });
                } catch (e) {
                  setError(errorText(e, "Couldn't write the captions"));
                } finally {
                  setPackaging(false);
                }
              }}
              className="text-2xs text-muted underline hover:text-ink disabled:opacity-40"
            >
              {packaging ? "Writing…" : "Make it the reel"}
            </button>
          )}
          {/* Once it has actually been cut there is a file, and the only way
              to reach it was the library two screens away. */}
          {clip.exportedAssetId && (
            <button
              disabled={downloading}
              onClick={async () => {
                setDownloading(true);
                try {
                  const link = await playbackUrl({
                    assetId: clip.exportedAssetId!,
                    download: true,
                  });
                  window.location.href = link;
                } finally {
                  setDownloading(false);
                }
              }}
              className="text-2xs text-muted underline hover:text-ink disabled:opacity-40"
            >
              {downloading ? "Preparing…" : "Download"}
            </button>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2.5">
            {/* The finished reel, coming back from an editor.

                Stored against the clip rather than over it. A clip and a
                reel are different things: the clip is the moment cut out of
                the sermon and it stays that, which is what lets an editor
                work from it and what stops two of them building a reel out
                of the same moment. This is the reel — what actually gets
                posted. */}
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
                  setError(null);
                  try {
                    // Measured before sending. Publishing checks the shape
                    // to stop a widescreen clip being letterboxed into a
                    // strip down the middle of a phone screen, and it can
                    // only do that if the dimensions were recorded.
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
                    if (!put.ok)
                      throw new Error(`Upload failed (${put.status})`);

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
                    setError(errorText(err, "That upload didn't work"));
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
              disabled={cutting || !masterAssetId}
              onClick={async () => {
                if (!masterAssetId) return;
                setCutting(true);
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
                } catch (e) {
                  setError(errorText(e, "Couldn't queue that cut"));
                } finally {
                  setCutting(false);
                }
              }}
              // Same rule as the writing list: a clip already cut gets a
              // quieter button than one waiting to be.
              className={`rounded-lg px-3.5 py-1.5 text-2xs font-medium transition-colors disabled:opacity-40 ${
                exported
                  ? "border border-border bg-surface text-muted hover:border-border-strong hover:text-ink"
                  : "bg-ink text-white hover:bg-ink/85"
              }`}
            >
              {cutting ? "Cutting…" : exported ? "Cut again" : "Cut it"}
            </button>
          </div>
        </div>
      </div>
    </div>
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

  // One signed URL for the whole gallery. Every tile shows the frame at its
  // own start time by seeking into the same file, so ten clips cost one
  // signature and one file rather than ten of each.
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
  const [openId, setOpenId] = useState<Id<"amplifyClips"> | null>(null);

  const live = (clips ?? []).filter((c) => c.status !== "discarded");
  // Read from the live list rather than held in state, so the panel redraws
  // itself when a cut finishes or a reel lands while it is open.
  const open = live.find((c) => c._id === openId) ?? null;

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
          // for, and a solid button at the top of a full gallery draws the
          // eye away from the suggestions underneath it.
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
          {/* The moments, not a description of them. Ordered best-first,
              with the score on the picture so the ordering is legible
              rather than merely true. */}
          <ul className="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {live.map((clip) => (
              <ClipCard
                key={clip._id}
                clip={clip}
                hasReel={reeled.has(clip._id)}
                masterUrl={masterUrl}
                onOpen={() => setOpenId(clip._id)}
              />
            ))}
          </ul>
        </>
      )}

      {open && (
        <ClipDetail
          // Remounted per clip, so the trim marks start from the clip you
          // opened rather than the one you opened before it.
          key={open._id}
          clip={open}
          projectId={projectId}
          masterAssetId={masterAssetId}
          hasReel={reeled.has(open._id)}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}
