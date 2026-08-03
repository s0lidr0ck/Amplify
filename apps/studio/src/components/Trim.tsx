import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useEffect, useRef, useState } from "react";

import { hhmmss, TimeMark } from "./TimeMark";

/**
 * Finding the sermon inside the service.
 *
 * A Sunday recording is worship, notices, an offering and then the sermon.
 * Everything downstream is about the sermon, so this is where somebody says
 * where it starts and stops — and the only way to know that is to watch and
 * listen. So this is a real video player with two marks, not two number
 * fields.
 *
 * The marks are set from wherever the player is paused, because that is how
 * a person actually finds the moment: scrub until the preacher opens his
 * Bible, press "start here". Typing 00:14:32 requires already knowing the
 * answer.
 */

export function Trim({
  projectId,
  sourceAssetId,
  onQueued,
}: {
  projectId: Id<"amplifyProjects">;
  sourceAssetId: Id<"amplifyAssets">;
  onQueued?: () => void;
}) {
  const playbackUrl = useAction(api.amplifyMedia.playbackUrl);
  const enqueue = useMutation(api.amplifyWorker.enqueue);

  const video = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void playbackUrl({ assetId: sourceAssetId })
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Could not load the video"),
      );
    return () => {
      cancelled = true;
    };
  }, [playbackUrl, sourceAssetId]);

  const seek = (to: number) => {
    if (video.current) video.current.currentTime = to;
  };

  const ready = start !== null && end !== null && end > start;

  return (
    <div className="card grid gap-3 p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="card-title">Trim</p>
        <span className="text-[0.8125rem] text-muted">
          Find where the sermon starts and ends
        </span>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {url ? (
        <video
          ref={video}
          src={url}
          controls
          preload="metadata"
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
          className="w-full rounded-xl bg-black"
        />
      ) : (
        <div className="grid h-48 place-items-center rounded-xl bg-surface-strong text-sm text-muted">
          Loading the video…
        </div>
      )}

      {/* Two marks, each with its own nudges. Setting a mark from the
          playhead gets you within a second or two; the nudges are how you
          close that gap without scrubbing back and forth, which is the part
          that makes trimming tedious. Nudging seeks as well as moves, so you
          hear the new edge rather than guessing at it. */}
      <div className="grid gap-2.5">
        <TimeMark
          label="Sermon starts"
          value={start}
          onSet={() => setStart(position)}
          onNudge={(by) => {
            const next = Math.max(0, (start ?? position) + by);
            setStart(next);
            seek(next);
          }}
          onSeek={seek}
        />
        <TimeMark
          label="Sermon ends"
          value={end}
          onSet={() => setEnd(position)}
          onNudge={(by) => {
            const next = Math.min(duration || Infinity, (end ?? position) + by);
            setEnd(next);
            seek(next);
          }}
          onSeek={seek}
        />

        {ready && (
          <span className="data">
            {hhmmss(end! - start!)} of sermon
            {duration > 0 && ` — cut from ${hhmmss(duration)}`}
          </span>
        )}
      </div>

      {/* Said rather than enforced by a disabled button with no explanation.
          Marks set in the wrong order is an easy mistake and an easy fix. */}
      {start !== null && end !== null && end <= start && (
        <p className="text-2xs text-danger">
          The end mark is before the start. Set them the other way round.
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          disabled={!ready || busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await enqueue({
                projectId,
                jobType: "trim",
                payloadJson: JSON.stringify({
                  sourceAssetId,
                  startSeconds: start,
                  endSeconds: end,
                }),
              });
              onQueued?.();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not start the trim");
            } finally {
              setBusy(false);
            }
          }}
          className="rounded-lg bg-ink px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-ink/85 disabled:opacity-40"
        >
          {busy ? "Starting…" : "Cut the sermon out"}
        </button>
        {!ready && (
          <span className="text-2xs text-muted">
            Set both marks first.
          </span>
        )}
      </div>
    </div>
  );
}
