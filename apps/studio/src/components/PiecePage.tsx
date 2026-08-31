import { useAction, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { AttachImage } from "./AttachImage";
import { DraftEditor, isProse, PIECES, Preview, VISUAL_PIECE } from "./Outputs";
import { NotesUpload } from "./NotesUpload";
import { StudyGuideEditor } from "./StudyGuideEditor";
import { formatSermonDateShort } from "../lib/dates";
import { useHandoutBrand } from "../lib/useHandoutBrand";
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
  /**
   * Fixed instead of read from the URL, for a room that is about one piece.
   * Visuals is the thumbnail concepts and nothing else, so making somebody
   * click a list of one to reach them would be a step that exists only
   * because the component used to live behind a route.
   */
  kind: fixedKind,
}: {
  projectId: Id<"amplifyProjects">;
  kind?: string;
}) {
  const params = useParams();
  const kind = fixedKind ?? params.kind;
  const piece = [...PIECES, VISUAL_PIECE].find((p) => p.kind === kind);

  const drafts = useQuery(api.amplifyDrafts.list, { projectId });
  // Already loaded by the sermon page above this one; Convex dedupes
  // identical subscriptions, so asking again here costs nothing.
  const project = useQuery(api.amplify.getProject, { projectId });
  // Only the study guide can be written from either source, so only it asks.
  const isGuide = piece?.kind === "study_guide";
  const transcript = useQuery(
    api.amplifyTranscripts.summary,
    isGuide ? { projectId } : "skip",
  );
  const notes = useQuery(
    api.amplifyNotes.summary,
    isGuide ? { projectId } : "skip",
  );
  // The church's logo and the QR code back to its Link page — asked for
  // only once there is a handout to put them on, because asking is what
  // mints the campaign the QR encodes.
  const guideReady = (drafts ?? []).some(
    (d) => d.kind === "study_guide" && d.status === "ready",
  );
  const brand = useHandoutBrand(projectId, isGuide && guideReady);
  const run = useAction(api.amplifyGenerate[piece?.run ?? "metadata"]);
  const promptFor = useAction(api.amplifyGenerate.promptFor);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  // Which shape the handout takes on paper. Remembered per browser, because
  // a church that folds its handouts folds all of them, and re-choosing on
  // every sermon would be a chore rather than a choice.
  const [fold, setFold] = useState(() => {
    try {
      return localStorage.getItem("studyGuideLayout") === "fold";
    } catch {
      return false;
    }
  });
  const chooseLayout = (next: boolean) => {
    setFold(next);
    try {
      localStorage.setItem("studyGuideLayout", next ? "fold" : "sheet");
    } catch {
      // A private window, or site data turned off. The choice still holds
      // for this visit; it just will not be here next time.
    }
  };

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

  // The study guide has two possible sources and may have neither yet. Its
  // own page is where somebody would go looking, so the way in is here
  // rather than only on the From notes screen.
  const noSource = isGuide && transcript === null && notes === null;

  // Written from his manuscript, and the recording has since been
  // transcribed. Offered rather than done automatically: the sheet may
  // already have been printed and handed out, and whether Sunday went off
  // script is not something this page can know.
  const canUpgrade =
    isGuide && draft?.source === "notes" && Boolean(transcript);
  // Prose has always been editable. The handout is structured but editable
  // too, because it is the one piece that leaves the building.
  const editable =
    draft !== undefined &&
    (piece.kind === "study_guide" || isProse(draft.payloadJson));
  const needsLabel =
    PIECES.find((p) => p.kind === piece.needs)?.label ?? piece.needs;

  // "Pastor Chris · 24 Aug 2026" — what a sheet needs on it to still make
  // sense in a drawer a year later. The familiar form the congregation uses
  // rather than the full name on the record, which is the same choice the
  // prompts make.
  const byline = [
    project?.speakerDisplayName || project?.speaker,
    project?.sermonDate ? formatSermonDateShort(project.sermonDate) : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="grid gap-4">
      {/* The action belongs with the title, not in a card of its own below
          it. A card containing two controls is a box drawn round nothing,
          and it pushed the thing you came to read further down the page.

          print-hide, because none of it means anything on paper — and
          collapsing it rather than merely hiding it is what keeps the sheet
          from starting halfway down page one. */}
      <div className="grid gap-3 print-hide">
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
          ) : noSource ? (
            <p className="max-w-xs text-sm text-muted">
              Nothing to write this from yet — give it his notes below, or
              transcribe the sermon.
            </p>
          ) : (
            <div className="grid justify-items-end gap-1">
              <div className="flex flex-wrap items-center justify-end gap-2">
                {/* The payoff action for the one piece that leaves the
                    screen, and the loud one once there is something to
                    print — writing it again is the rarer thing to want by
                    then. The print stylesheet drops everything that is not
                    the sheet itself, so this needs no print view of its
                    own. */}
                {piece.kind === "study_guide" && ready && (
                  <button
                    onClick={() => window.print()}
                    className="rounded-lg border border-transparent bg-ink px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-ink/85"
                  >
                    Print / Save as PDF
                  </button>
                )}
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
              </div>
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
          {/* Which paper it is going onto. Beside the piece rather than in
              settings, because it is a decision somebody makes with the
              handout in front of them and the printer down the hall. */}
          {piece.kind === "study_guide" && ready && !editing && (
            <span className="flex items-center gap-1 rounded-lg bg-surface-strong p-0.5">
              {[
                [false, "Two-page sheet"],
                [true, "Bi-fold booklet"],
              ].map(([value, label]) => (
                <button
                  key={String(value)}
                  onClick={() => chooseLayout(value as boolean)}
                  aria-pressed={fold === value}
                  className={`rounded-md px-2 py-0.5 text-2xs font-medium transition-colors ${
                    fold === value
                      ? "bg-surface text-ink shadow-sm"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {label as string}
                </button>
              ))}
            </span>
          )}

          {ready && editable && !editing && (
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
              the piece it assembles rather than in a settings screen. Every
              piece that runs a prompt gets one — tuning the blog post is the
              same job as tuning the thumbnails, and it was only on the
              thumbnails because that is where the question first came up.

              Hidden while blocked: the text post's prompt is built out of
              the blog post, so before there is one there is no prompt to
              read, only the same error the write button would give. */}
          {piece.run !== null && !blocked && (
            <>
              <button
                disabled={copying}
                onClick={async () => {
                  setCopying(true);
                  setCopyNote(null);
                  try {
                    const built = await promptFor({
                      projectId,
                      kind: piece.kind,
                    });
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

        {canUpgrade && !busy && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-warn-soft px-3 py-2 text-[0.8125rem] text-warn">
            <span>
              This was written from his notes, and the transcript is ready now.
            </span>
            <button
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
              className="font-medium underline hover:text-ink"
            >
              Write it again from what he preached
            </button>
            {/* Said plainly, because the sheet may already be in a hundred
                hands and this replaces the one on screen, not those. */}
            <span className="text-2xs opacity-80">
              Replaces what&rsquo;s below — the printed copies are unaffected.
            </span>
          </p>
        )}

        {error && <p className="text-[0.8125rem] text-danger">{error}</p>}
        {draft?.error && (
          <p className="text-[0.8125rem] text-danger">{draft.error}</p>
        )}
      </div>

      {noSource && (
        <div className="card grid gap-3 p-5">
          <p className="card-title">Write it from his notes</p>
          <p className="max-w-prose text-sm text-muted">
            For a handout that has to be ready before the sermon is preached.
            Give it his manuscript and the guide gets written from that; once
            the recording is transcribed you can write it again from what he
            actually said.
          </p>
          <NotesUpload projectId={projectId} />
        </div>
      )}

      {piece.kind === "thumbnail_concepts" && ready && (
        <div className="card grid gap-3 p-5">
          <p className="card-title">The pictures you made</p>
          <AttachImage projectId={projectId} kind="sermon_thumbnail" />
        </div>
      )}

      {ready && draft && (
        // The handout draws its own page — a letter sheet with its own
        // border — so a card around it would be a second frame inside the
        // first. Everything else, the editor included, is app UI and keeps
        // the card it has always had.
        <div
          className={
            piece.kind === "study_guide" && !editing ? "" : "card p-5"
          }
        >
          {editing ? (
            // The handout is structured, so the plain textarea would hand
            // somebody raw JSON. It gets fields instead — and it is the one
            // piece that earns them, because it goes to a copier and then
            // to a congregation, where one badly worded question should not
            // cost the other thirteen sections.
            piece.kind === "study_guide" ? (
              <StudyGuideEditor
                draftId={draft._id}
                payloadJson={draft.payloadJson}
                onDone={() => setEditing(false)}
              />
            ) : (
              <DraftEditor
                draftId={draft._id}
                payloadJson={draft.payloadJson}
                onDone={() => setEditing(false)}
              />
            )
          ) : (
            <Preview
              payloadJson={draft.payloadJson}
              byline={byline}
              fold={fold}
              brand={brand}
            />
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
