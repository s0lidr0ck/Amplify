import { useAction } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { errorText } from "../lib/errorText";

/**
 * Removing a sermon that should not be here.
 *
 * There was no way to do this at all, which is fine right up until somebody
 * adds the same sermon twice — and then the mistake is permanent and sits at
 * the top of the library for ever.
 *
 * Two steps, and the second one says what actually goes. A sermon is not a
 * row: it is the video, the transcript, the writing, the clips, the reels
 * and their covers. "Are you sure?" is not a question anybody can answer
 * without that list.
 *
 * It lives at the bottom of Source, quiet, behind a disclosure. Source is
 * where a sermon begins and the room nobody returns to once it has gone out,
 * which makes it the right place for the one control that cannot be undone.
 */
export function DeleteSermon({
  projectId,
  title,
}: {
  projectId: Id<"amplifyProjects">;
  title: string;
}) {
  const remove = useAction(api.amplifyProjectDelete.deleteProject);
  const navigate = useNavigate();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!asking) {
    return (
      <div className="flex justify-end">
        <button
          onClick={() => setAsking(true)}
          className="text-2xs text-faint underline hover:text-danger"
        >
          Delete this sermon
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-2.5 rounded-xl border border-danger/30 bg-surface p-4">
      <p className="text-sm font-medium text-ink">
        Delete &ldquo;{title}&rdquo;?
      </p>
      {/* Named, not summarised. Somebody about to lose a transcript should
          be told it is a transcript they are losing. */}
      <p className="text-[0.8125rem] leading-relaxed text-muted">
        This removes the sermon video, the transcript, all of the writing, the
        clips and the reels made from them, and their covers. Anything already
        posted stays up on the platform it went to, but Amplify will no longer
        have a record of it. There is no undo.
      </p>
      {error && <p className="text-[0.8125rem] text-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await remove({ projectId });
              navigate("/projects");
            } catch (e) {
              setError(errorText(e, "Couldn't delete that"));
              setBusy(false);
            }
          }}
          className="rounded-lg bg-danger px-3.5 py-2 text-2xs font-medium text-white transition-colors hover:bg-danger/85 disabled:opacity-50"
        >
          {busy ? "Deleting…" : "Yes, delete it"}
        </button>
        <button
          onClick={() => {
            setAsking(false);
            setError(null);
          }}
          className="text-2xs text-muted underline hover:text-ink"
        >
          Keep it
        </button>
      </div>
    </div>
  );
}
