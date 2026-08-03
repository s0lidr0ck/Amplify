import { useAction, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useState } from "react";

/**
 * What has been written from this sermon, and what can be.
 *
 * Everything here needs the transcript, so when there isn't one the section
 * says that rather than showing four buttons that would all fail. The one
 * ordering that is real — the text post is written from the blog post, not
 * the transcript — is stated where it matters instead of being enforced by
 * a disabled button with no explanation.
 */

type Piece = {
  kind: string;
  label: string;
  blurb: string;
  run: "metadata" | "blogPost" | "youtubePackaging" | "facebookPost";
  needs?: string;
};

const PIECES: Piece[] = [
  {
    kind: "metadata",
    label: "Sermon details",
    blurb: "Title, summary, scriptures, main points, tags.",
    run: "metadata",
  },
  {
    kind: "blog_post",
    label: "Blog post",
    blurb: "The long-form write-up.",
    run: "blogPost",
  },
  {
    kind: "youtube_packaging",
    label: "Title & description",
    blurb: "For the YouTube upload.",
    run: "youtubePackaging",
  },
  {
    kind: "facebook_post",
    label: "Text post",
    blurb: "A shorter version for social.",
    run: "facebookPost",
    needs: "blog_post",
  },
];

/** Renders a draft's payload without pretending to know every shape. */
function Preview({ payloadJson }: { payloadJson: string }) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    return <p className="whitespace-pre-wrap text-sm text-ink">{payloadJson}</p>;
  }

  const obj = parsed as Record<string, unknown>;

  // The prose kinds carry a single string; show it as prose rather than as
  // a field called "markdown".
  const prose = obj.markdown ?? obj.text;
  if (typeof prose === "string") {
    return (
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
        {prose}
      </p>
    );
  }

  return (
    <dl className="grid gap-2">
      {Object.entries(obj).map(([key, value]) => (
        <div key={key} className="grid gap-0.5">
          <dt className="section-label">{key.replace(/([A-Z])/g, " $1")}</dt>
          <dd className="text-sm leading-relaxed text-ink">
            {Array.isArray(value) ? (
              <ul className="grid gap-0.5">
                {value.map((item, i) => (
                  <li key={i}>
                    {typeof item === "string" ? item : JSON.stringify(item)}
                  </li>
                ))}
              </ul>
            ) : (
              String(value)
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function PieceRow({
  piece,
  projectId,
  draft,
  hasBlog,
}: {
  piece: Piece;
  projectId: Id<"amplifyProjects">;
  draft: {
    payloadJson: string;
    status: string;
    error: string | null;
    editedByHuman: boolean;
    updatedAt: number;
  } | undefined;
  hasBlog: boolean;
}) {
  const run = useAction(api.amplifyGenerate[piece.run]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const blocked = piece.needs === "blog_post" && !hasBlog;
  const ready = draft?.status === "ready";

  return (
    <li className="grid gap-2 border-b border-border px-4 py-3 last:border-0">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="text-sm font-medium text-ink">{piece.label}</span>
        {draft?.editedByHuman && (
          <span className="text-2xs text-muted">edited</span>
        )}
        {draft?.status === "failed" && (
          <span className="rounded-md bg-danger-soft px-2 py-0.5 text-2xs font-medium text-danger">
            failed
          </span>
        )}

        <div className="ml-auto flex items-center gap-2.5">
          {ready && (
            <button
              onClick={() => setOpen(!open)}
              className="text-2xs text-muted underline hover:text-ink"
            >
              {open ? "Hide" : "Read"}
            </button>
          )}
          <button
            disabled={busy || blocked}
            onClick={async () => {
              setBusy(true);
              try {
                await run({ projectId });
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-lg bg-ink px-3 py-1.5 text-2xs font-medium text-white transition-colors hover:bg-ink/85 disabled:opacity-40"
          >
            {busy ? "Writing…" : ready ? "Write again" : "Write"}
          </button>
        </div>
      </div>

      <p className="text-2xs text-muted">
        {blocked
          ? "Write the blog post first — this one is written from it."
          : piece.blurb}
      </p>

      {/* The reason, not just the fact. It is the only thing that tells
          anyone whether to retry or fix something. */}
      {draft?.error && (
        <p className="text-2xs text-danger">{draft.error}</p>
      )}

      {open && ready && draft && (
        <div className="rounded-xl bg-surface-strong p-3.5">
          <Preview payloadJson={draft.payloadJson} />
        </div>
      )}
    </li>
  );
}

export function Outputs({ projectId }: { projectId: Id<"amplifyProjects"> }) {
  const transcript = useQuery(api.amplifyTranscripts.summary, { projectId });
  const drafts = useQuery(api.amplifyDrafts.list, { projectId });

  const byKind = new Map((drafts ?? []).map((d) => [d.kind, d]));
  const hasBlog = byKind.get("blog_post")?.status === "ready";

  return (
    <div className="card grid gap-3 p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="section-label">Writing</p>
        {transcript && (
          <span className="text-2xs text-muted">
            from {transcript.wordCount.toLocaleString()} words of transcript
          </span>
        )}
      </div>

      {transcript === null ? (
        // Says what is missing rather than offering four buttons that would
        // each fail the same way.
        <p className="text-sm text-muted">
          Everything here is written from the transcript. Transcribe the
          sermon first.
        </p>
      ) : (
        <ul className="-mx-4 -mb-4 border-t border-border">
          {PIECES.map((piece) => (
            <PieceRow
              key={piece.kind}
              piece={piece}
              projectId={projectId}
              draft={byKind.get(piece.kind)}
              hasBlog={hasBlog}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
