import { useAction, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { AttachImage } from "./AttachImage";
import { DraftEditor, isProse, PIECES, Preview } from "./Outputs";
import { errorText } from "../lib/errorText";

/**
 * One piece of writing, on a page of its own.
 *
 * Everything you can do to a piece is here rather than on the list: write
 * it, write it again, edit it by hand, and for the thumbnails, read the
 * prompt and attach the pictures that came back. Gathering them here is
 * what let the list become five plain rows — the actions were the clutter,
 * and they were clutter mostly because they sat beside four other pieces
 * they had nothing to do with.
 *
 * It also means a blog post is somewhere. You can send the URL to whoever
 * has to approve it, and the back button takes you to the list rather than
 * out of the sermon.
 */
export function PiecePage({
  projectId,
}: {
  projectId: Id<"amplifyProjects">;
}) {
  const { kind } = useParams();
  const piece = PIECES.find((p) => p.kind === kind);

  const drafts = useQuery(api.amplifyDrafts.list, { projectId });
  const run = useAction(api.amplifyGenerate[piece?.run ?? "metadata"]);
  const thumbnailPrompt = useAction(api.amplifyGenerate.thumbnailPrompt);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyNote, setCopyNote] = useState<string | null>(null);

  if (!piece) {
    return (
      <p className="text-sm text-muted">
        No such piece.{" "}
        <Link to=".." relative="path" className="underline hover:text-ink">
          Back to the writing
        </Link>
      </p>
    );
  }

  const draft = (drafts ?? []).find((d) => d.kind === piece.kind);
  const ready = draft?.status === "ready";
  const have = new Set(
    (drafts ?? []).filter((d) => d.status === "ready").map((d) => d.kind),
  );
  const blocked = piece.needs !== undefined && !have.has(piece.needs);
  const needsLabel =
    PIECES.find((p) => p.kind === piece.needs)?.label ?? piece.needs;

  return (
    <div className="grid gap-4">
      {/* The action belongs with the title, not in a card of its own below
          it. A card containing two controls is a box drawn round nothing,
          and it pushed the thing you came to read further down the page. */}
      <div className="grid gap-3">
        <Link
          to=".."
          relative="path"
          className="justify-self-start text-xs text-muted transition-colors hover:text-ink"
        >
          ← All the writing
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="grid gap-1">
            <h2 className="font-display text-[1.5rem] font-bold leading-tight tracking-[-0.02em] text-ink">
              {piece.label}
            </h2>
            <p className="text-sm text-muted">{piece.blurb}</p>
          </div>

          {piece.run === null ? (
            <p className="text-sm text-muted">
              Made from a clip, over in Clips &amp; reels.
            </p>
          ) : blocked ? (
            // The reason rather than a disabled button with no explanation.
            <p className="max-w-xs text-sm text-muted">
              Write the {needsLabel} first — this one is built from it.
            </p>
          ) : (
            <div className="grid justify-items-end gap-1">
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await run({ projectId });
                  } catch (e) {
                    setError(errorText(e, "Couldn't write that"));
                  } finally {
                    setBusy(false);
                  }
                }}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 ${
                  ready
                    ? "border-border bg-surface text-ink hover:border-border-strong"
                    : "border-transparent bg-ink text-white hover:bg-ink/85"
                }`}
              >
                {busy
                  ? "Claude is reading the sermon…"
                  : ready
                    ? "Write it again"
                    : "Write it with Claude"}
              </button>
              {/* What it costs, said where the finger is. "Write it again"
                  does not tell you it throws away what is on the screen —
                  and it matters most in the one case the button looks
                  identical in. */}
              {!busy && ready && (
                <span
                  className={`text-2xs ${
                    draft?.editedByHuman ? "text-warn" : "text-faint"
                  }`}
                >
                  {draft?.editedByHuman
                    ? "Replaces the edits you made"
                    : "Replaces what's below"}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {ready && isProse(draft.payloadJson) && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-2xs text-muted underline hover:text-ink"
            >
              Edit it by hand
            </button>
          )}

          {draft?.editedByHuman && (
            <span className="rounded-md bg-surface-strong px-2 py-0.5 text-2xs font-medium text-muted">
              edited by hand
            </span>
          )}

          {/* Reading the assembled prompt is a tuning tool, so it sits with
              the piece it assembles rather than in a settings screen. */}
          {piece.kind === "thumbnail_concepts" && (
            <>
              <button
                disabled={copying}
                onClick={async () => {
                  setCopying(true);
                  setCopyNote(null);
                  try {
                    const built = await thumbnailPrompt({ projectId });
                    await navigator.clipboard.writeText(built);
                    setCopyNote(
                      `Copied — ${built.length.toLocaleString()} characters`,
                    );
                  } catch (e) {
                    setCopyNote(errorText(e, "Couldn't build the prompt"));
                  } finally {
                    setCopying(false);
                    window.setTimeout(() => setCopyNote(null), 6000);
                  }
                }}
                className="text-2xs text-muted underline hover:text-ink disabled:opacity-40"
              >
                {copying ? "Building…" : "Copy the prompt sent to Claude"}
              </button>
              {copyNote && (
                <span className="text-2xs text-faint">{copyNote}</span>
              )}
            </>
          )}
        </div>

        {error && <p className="text-[0.8125rem] text-danger">{error}</p>}
        {draft?.error && (
          <p className="text-[0.8125rem] text-danger">{draft.error}</p>
        )}
      </div>

      {piece.kind === "thumbnail_concepts" && ready && (
        <div className="card grid gap-3 p-5">
          <p className="card-title">The pictures you made</p>
          <AttachImage projectId={projectId} kind="sermon_thumbnail" />
        </div>
      )}

      {ready && draft && (
        <div className="card p-5">
          {editing ? (
            <DraftEditor
              draftId={draft._id}
              payloadJson={draft.payloadJson}
              onDone={() => setEditing(false)}
            />
          ) : (
            <Preview payloadJson={draft.payloadJson} />
          )}
        </div>
      )}

      {!ready && piece.run !== null && !blocked && (
        // An empty screen is an invitation, not a dead end.
        <div className="card grid gap-1.5 p-8 text-center">
          <p className="font-display text-lg font-semibold text-ink">
            Nothing written yet
          </p>
          <p className="text-sm text-muted">
            Press &ldquo;Write it&rdquo; and Claude reads the sermon.
          </p>
        </div>
      )}
    </div>
  );
}
