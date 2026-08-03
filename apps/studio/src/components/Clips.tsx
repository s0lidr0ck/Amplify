import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useEffect, useRef, useState } from "react";

import { errorText } from "../lib/errorText";
import { hhmmss, TimeMark } from "./TimeMark";

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
}: {
  clip: Clip;
  projectId: Id<"amplifyProjects">;
  masterAssetId: Id<"amplifyAssets"> | null;
}) {
  const enqueue = useMutation(api.amplifyWorker.enqueue);
  const discard = useMutation(api.amplifyClips.discard);
  const packageReel = useAction(api.amplifyReel.packageReel);
  const [packaging, setPackaging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const analysis = (() => {
    if (!clip.analysisJson) return null;
    try {
      return JSON.parse(clip.analysisJson) as Record<string, string>;
    } catch {
      return null;
    }
  })();

  const exported = Boolean(clip.exportedAssetId);
  const length = clip.endSeconds - clip.startSeconds;

  return (
    <li className="grid gap-2 border-b border-border px-5 py-3.5 last:border-0">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        {/* The hook is the clip. It is the first thing anyone hears and the
            only thing that decides whether they keep watching. */}
        <p className="flex-1 text-[0.9375rem] font-semibold leading-snug text-ink">
          {clip.title || "Untitled moment"}
        </p>
        {clip.score !== null && (
          <span className="data" title="The model's editorial score">
            {Math.round(clip.score)}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="data">
          {hhmmss(clip.startSeconds)}–{hhmmss(clip.endSeconds)} · {Math.round(length)}s
        </span>
        {analysis?.clip_type && (
          <span className="rounded-md bg-surface-strong px-2 py-0.5 text-2xs font-medium text-muted">
            {analysis.clip_type}
          </span>
        )}
        {analysis?.cadence_marker && (
          <span className="text-2xs text-faint">{analysis.cadence_marker}</span>
        )}
        {exported && (
          <span className="rounded-md bg-ok-soft px-2 py-0.5 text-2xs font-medium text-ok">
            cut
          </span>
        )}

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
            className="rounded-lg bg-ink px-3 py-1.5 text-2xs font-medium text-white transition-colors hover:bg-ink/85 disabled:opacity-40"
          >
            {busy ? "Cutting…" : exported ? "Cut again" : "Cut it"}
          </button>
        </div>
      </div>

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
  const findClips = useAction(api.amplifyClipFinder.findClips);
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
          className="ml-auto rounded-lg bg-ink px-3 py-1.5 text-2xs font-medium text-white transition-colors hover:bg-ink/85 disabled:opacity-40"
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
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
