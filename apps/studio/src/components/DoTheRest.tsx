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
  study_guide: "the study guide",
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
  "study_guide",
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
  const drafts = useQuery(api.amplifyDrafts.list, { projectId });
  const everything = useAction(api.amplifyAuto.everything);
  const [error, setError] = useState<string | null>(null);
  const [pressed, setPressed] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (!ready) return null;

  // What a redo would actually destroy, counted from the drafts rather than
  // described in the abstract. "This replaces everything" is a sentence
  // people click past; "replaces 5, two of which you edited by hand" is not.
  const written = (drafts ?? []).filter(
    (d) => ORDER.includes(d.kind) && d.status === "ready",
  );
  const byHand = written.filter((d) => d.editedByHuman).length;

  // A run that stopped existing without saying so.
  //
  // The work happens server-side and survives the page being closed, which
  // is the point — but it means nothing on the client notices if the run
  // dies. Without this the row stays "running" for ever and the button is
  // disabled permanently because of a job that is not there any more.
  //
  // Fifteen minutes: a whole six-step run takes four to six, and every step
  // touches the row on the way past.
  const STALE_MS = 15 * 60 * 1000;
  const live =
    run?.updatedAt === null || run?.updatedAt === undefined
      ? true // Written before the heartbeat existed. Believe it.
      : Date.now() - run.updatedAt < STALE_MS;

  // `pressed` covers the gap between the click and the first run row
  // arriving over the subscription. Without it the button springs back to
  // its resting state for a moment, which reads as a press that missed.
  const running = run?.status === "running" || run?.status === "waiting";
  const stalled = running && !live;
  const busy = pressed || (running && live);
  const finished = run?.status === "done";

  const line = () => {
    if (stalled) {
      return `This run stopped without finishing${
        run.step ? ` on ${LABELS[run.step] ?? run.step}` : ""
      }. Carrying on picks up whatever is missing.`;
    }
    if (run?.status === "waiting") {
      return "Waiting for the transcript. It'll carry on by itself.";
    }
    if (run?.step) {
      const at = ORDER.indexOf(run.step);
      const where = at >= 0 ? ` (${at + 1} of ${ORDER.length})` : "";
      // Said while it is working, because this is the moment somebody
      // wonders whether they are allowed to go and do something else.
      return `Writing ${LABELS[run.step] ?? run.step}${where}… you can close this page, it keeps going.`;
    }
    if (busy) return "Starting…";
    if (run?.status === "failed") return null;
    if (finished) return "All done.";
    return "Transcribes it, then writes all six pieces in order. It keeps going if you close the page, and anything already written is left alone.";
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
          data-role="do-the-rest"
          className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 ${
            finished
              ? // Nothing left to do, so it stops being the loud one.
                "border-border bg-surface text-ink hover:border-border-strong"
              : "border-transparent bg-ink text-white hover:bg-ink/85"
          }`}
        >
          {busy
            ? "Working…"
            : stalled || run?.status === "failed"
              ? "Carry on"
              : finished
                ? "Check for anything missing"
                : "Do the rest for me"}
        </button>
      </div>

      {/* The redo, quiet until it is wanted.
          Outlined and small because the ordinary press is the one almost
          everybody wants; this one exists for the day a prompt changes and
          the archive is still on the old wording. */}
      {!busy && written.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border pt-3">
          {confirming ? (
            <>
              <span className="text-[0.8125rem] text-ink">
                Write all {written.length} again on the current prompts?
                {byHand > 0 && (
                  // Named, not implied. This is the one irreversible thing
                  // in the card, and it is somebody's own writing.
                  <span className="text-warn">
                    {" "}
                    {byHand} {byHand === 1 ? "was" : "were"} edited by hand and{" "}
                    {byHand === 1 ? "that edit goes" : "those edits go"}.
                  </span>
                )}
              </span>
              <button
                onClick={async () => {
                  setConfirming(false);
                  setPressed(true);
                  setError(null);
                  try {
                    await everything({ projectId, force: true });
                  } catch (e) {
                    setError(errorText(e, "It stopped partway"));
                  } finally {
                    setPressed(false);
                  }
                }}
                className="rounded-lg border border-transparent bg-danger px-3 py-1.5 text-2xs font-medium text-white hover:bg-danger/85"
              >
                Yes, write it all again
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="text-2xs text-muted underline hover:text-ink"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="text-2xs text-muted underline hover:text-ink"
            >
              Write it all again on the current prompts
            </button>
          )}
        </div>
      )}

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
