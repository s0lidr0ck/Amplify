import { useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { Link } from "react-router-dom";

import { PIECES } from "./Outputs";

/**
 * The five pieces of writing, as five places to go.
 *
 * They used to be five rows that expanded in place behind a "Read" link,
 * with a second button beside it. Two consequences: the row was a puzzle —
 * a link-that-is-not-a-link next to a button, neither saying where it went
 * — and an opened piece was nowhere. You could not send it to anyone, come
 * back to it, or use the back button to leave it.
 *
 * So the row is now only a link, and everything you can *do* to a piece
 * lives on the piece's own page. That empties the list of controls
 * entirely, which is the point: this screen answers "what has been written
 * and what has not", and nothing else.
 */

const DOT: Record<string, string> = {
  ready: "bg-ok",
  failed: "bg-danger",
  waiting: "bg-border-strong",
};

export function WritingList({
  projectId,
}: {
  projectId: Id<"amplifyProjects">;
}) {
  const transcript = useQuery(api.amplifyTranscripts.summary, { projectId });
  const notes = useQuery(api.amplifyNotes.summary, { projectId });
  const drafts = useQuery(api.amplifyDrafts.list, { projectId });

  // Notes are a source, but only for one piece. Everything else here needs
  // the recording — there is no video to package and no audio to clip.
  const onNotesAlone = transcript === null && Boolean(notes);
  const needsRecording = (kind: string) =>
    onNotesAlone && kind !== "study_guide";

  const byKind = new Map((drafts ?? []).map((d) => [d.kind, d]));

  if (transcript === null && notes === null) {
    // Says what is missing rather than listing five things that would each
    // fail the same way.
    return (
      <div className="card grid gap-2 p-5">
        <p className="text-sm text-ink">Nothing can be written yet.</p>
        <p className="text-sm text-muted">
          Everything here comes out of the transcript.{" "}
          <Link
            to={`/projects/${projectId}/transcript`}
            className="underline hover:text-ink"
          >
            Transcribe the sermon first
          </Link>
          {" — "}or, if it has not been preached yet, open the study guide and
          give it his notes.
        </p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <p className="border-b border-border px-5 py-3">
        <span className="data">
          {transcript
            ? `${transcript.wordCount.toLocaleString()} words of transcript`
            : `${(notes?.wordCount ?? 0).toLocaleString()} words of his notes`}
        </span>
        {onNotesAlone && (
          <span className="ml-2 text-2xs text-muted">
            The rest is written once the sermon is recorded.
          </span>
        )}
      </p>

      <ul>
        {PIECES.map((piece) => {
          const draft = byKind.get(piece.kind);
          const state =
            draft?.status === "ready"
              ? "ready"
              : draft?.status === "failed"
                ? "failed"
                : "waiting";

          return (
            <li key={piece.kind} className="border-b border-border last:border-0">
              <Link
                to={piece.kind}
                className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-strong focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-brand"
              >
                <span className={`dot ${DOT[state]}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] font-semibold text-ink">
                    {piece.label}
                  </span>
                  <span className="block text-[0.8125rem] text-muted">
                    {piece.blurb}
                  </span>
                </span>

                <span className="shrink-0 text-2xs text-muted">
                  {state === "failed"
                    ? "failed"
                    : state === "ready"
                      ? draft?.editedByHuman
                        ? "written, edited"
                        : "written"
                      : needsRecording(piece.kind)
                        ? "needs the recording"
                        : "not written"}
                </span>
                {/* A chevron rather than the word "Read": the row is the
                    link, and labelling it twice is what made the old one a
                    puzzle. */}
                <span aria-hidden className="shrink-0 text-faint">
                  →
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
