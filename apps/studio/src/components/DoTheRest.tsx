import { useAction, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useState } from "react";

import { errorText } from "../lib/errorText";

/**
 * One press, and the sermon writes itself up.
 *
 * Everything after the trim used to be six presses in three rooms, each
 * waiting on the last, in an order that only made sense if you knew the
 * text post is written from the blog post and the thumbnails from the
 * title. Getting it wrong gave you an error rather than a queue.
 *
 * It lives here, under the recording, because here is where somebody is
 * standing the moment they finish trimming — and the answer to "what now?"
 * should be visible without going looking for it.
 */

/** Said the way the rooms say them, not the way the database spells them. */
const LABELS: Record<string, string> = {
  transcript: "the transcript",
  metadata: "the sermon details",
  blog_post: "the blog post",
  youtube_packaging: "the title and description",
  facebook_post: "the text post",
  thumbnail_concepts: "the thumbnail concepts",
  clips: "the clips worth cutting",
};

/**
 * The order the steps actually run in, so the counter can say where in the
 * whole list it is rather than how many it has done this time round.
 *
 * A run that skipped five finished pieces and went straight to the clips
 * was reporting "1 of 6" — true of the run, and wrong about everything
 * somebody would use it for.
 */
const ORDER = [
  "metadata",
  "blog_post",
  "youtube_packaging",
  "facebook_post",
  "thumbnail_concepts",
  "clips",
];

export function DoTheRest({
  projectId,
  ready,
}: {
  projectId: Id<"amplifyProjects">;
  /**
   * Is there anything to write from yet? True once the sermon has been cut
   * out — or once a transcript exists, which can happen without a cut.
   */
  ready: boolean;
}) {
  const run = useQuery(api.amplifyAutoRuns.forProject, { projectId });
  const everything = useAction(api.amplifyAuto.everything);
  const [error, setError] = useState<string | null>(null);
  const [pressed, setPressed] = useState(false);

  if (!ready) return null;

  // `pressed` covers the gap between the click and the first run row
  // arriving over the subscription. Without it the button springs back to
  // its resting state for a moment, which reads as a press that missed.
  const busy =
    pressed || run?.status === "running" || run?.status === "waiting";
  const finished = run?.status === "done";

  const line = () => {
    if (run?.status === "waiting") {
      return "Waiting for the transcript. It'll carry on by itself.";
    }
    if (run?.step) {
      const at = ORDER.indexOf(run.step);
      const where = at >= 0 ? ` — ${at + 1} of ${ORDER.length}` : "";
      return `Writing ${LABELS[run.step] ?? run.step}…${where}`;
    }
    if (busy) return "Starting…";
    if (run?.status === "failed") return null;
    if (finished) return "All done.";
    return "Transcribes it, then writes all six pieces in order. Anything already written is left alone.";
  };

  return (
    <div className="card grid gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="grid gap-1">
          <p className="card-title">The rest of it</p>
          <p className="max-w-md text-[0.8125rem] text-muted">{line()}</p>
        </div>

        <button
          disabled={busy}
          onClick={async () => {
            setPressed(true);
            setError(null);
            try {
              await everything({ projectId });
            } catch (e) {
              setError(errorText(e, "It stopped partway"));
            } finally {
              setPressed(false);
            }
          }}
          className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 ${
            finished
              ? // Nothing left to do, so it stops being the loud one.
                "border-border bg-surface text-ink hover:border-border-strong"
              : "border-transparent bg-ink text-white hover:bg-ink/85"
          }`}
        >
          {busy
            ? "Working…"
            : run?.status === "failed"
              ? "Carry on"
              : finished
                ? "Check for anything missing"
                : "Do the rest for me"}
        </button>
      </div>

      {/* Progress as a list of what is finished rather than a bar. A bar
          says how far; this says what you can already go and read. */}
      {run && run.done.length > 0 && !finished && (
        <p className="text-2xs text-faint">
          Done: {run.done.map((d) => LABELS[d] ?? d).join(", ")}
        </p>
      )}

      {(run?.status === "failed" || error) && (
        <div className="grid gap-1">
          <p className="text-[0.8125rem] text-danger">{run?.error ?? error}</p>
          {/* Which pieces survived. A run that stopped on step five still
              wrote four things, and "it failed" hides that. */}
          {run && run.done.length > 0 && (
            <p className="text-2xs text-muted">
              {run.done.map((d) => LABELS[d] ?? d).join(", ")} came through —
              &ldquo;Carry on&rdquo; picks up from there.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
