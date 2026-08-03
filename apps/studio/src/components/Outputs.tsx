import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useState } from "react";

import { AttachImage } from "./AttachImage";
import { Variants } from "./Variants";

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
  /** null when the piece is produced elsewhere — the reel is made from a
   *  clip, so its button lives beside the clip rather than here. */
  run:
    | null
    | "metadata"
    | "blogPost"
    | "youtubePackaging"
    | "facebookPost"
    | "thumbnailConcepts"
;
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
  {
    kind: "thumbnail_concepts",
    label: "Thumbnail concepts",
    blurb: "Three directions to take to an image tool.",
    run: "thumbnailConcepts",
    needs: "youtube_packaging",
  },
];


/**
 * The reel package: one clip, written for four different places.
 *
 * Per platform rather than as one document, because that is how it gets
 * used — somebody has Instagram open, copies the caption, moves on. A single
 * blob would make them hunt for the right paragraph four times.
 */
function ReelPackage({ payload }: { payload: Record<string, unknown> }) {
  const social = (payload.social ?? {}) as Record<
    string,
    { title?: string; description?: string; tags?: string[] }
  >;
  const graphics = (payload.graphics ?? {}) as {
    concepts?: { punch_phrase?: string; visual_theme?: string; overlay_style?: string; notes?: string }[];
  };
  const PLATFORMS: [string, string][] = [
    ["instagram", "Instagram"],
    ["tiktok", "TikTok"],
    ["youtube", "YouTube Shorts"],
    ["facebook", "Facebook"],
  ];
  const [tab, setTab] = useState("instagram");
  const current = social[tab];

  return (
    <div className="grid gap-3">
      {typeof payload.hook === "string" && (
        <p className="font-display text-base font-semibold leading-snug text-ink">
          {payload.hook}
        </p>
      )}

      <div className="flex flex-wrap gap-1">
        {PLATFORMS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-lg px-2.5 py-1 text-2xs font-medium transition-colors ${
              tab === key
                ? "bg-ink text-white"
                : "text-muted hover:bg-surface-strong hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {current ? (
        <div className="grid gap-2 rounded-xl bg-surface p-3.5">
          <p className="text-[0.9375rem] font-semibold leading-snug text-ink">
            {current.title}
          </p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">
            {current.description}
          </p>
          {current.tags && current.tags.length > 0 && (
            <p className="text-[0.8125rem] text-faint">
              {current.tags.join("  ")}
            </p>
          )}
          <button
            onClick={() =>
              void navigator.clipboard.writeText(
                `${current.title}

${current.description}

${(current.tags ?? []).join(" ")}`,
              )
            }
            className="justify-self-start text-2xs text-muted underline hover:text-ink"
          >
            Copy for {PLATFORMS.find(([k]) => k === tab)?.[1]}
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted">Nothing written for this one.</p>
      )}

      {graphics.concepts && graphics.concepts.length > 0 && (
        <div className="grid gap-2">
          <p className="section-label">Graphics</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {graphics.concepts.map((c, i) => (
              <div key={i} className="grid gap-1 rounded-xl bg-surface p-3">
                <p className="font-display text-sm font-bold leading-tight text-ink">
                  {c.punch_phrase}
                </p>
                <p className="text-[0.8125rem] leading-snug text-muted">
                  {c.visual_theme}
                </p>
                {c.overlay_style && (
                  <p className="text-2xs text-faint">{c.overlay_style}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Renders a draft's payload without pretending to know every shape. */
function Preview({ payloadJson }: { payloadJson: string }) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    return <p className="whitespace-pre-wrap text-sm text-ink">{payloadJson}</p>;
  }

  const obj = parsed as Record<string, unknown>;

  // Three competing briefs, not one document. Side by side, because the only
  // useful thing to do with three directions is compare them — stacked in a
  // list they read as a sequence, and someone works down it instead of
  // choosing.
  // The reel carries a clip and four platform packages.
  if (obj.social && typeof obj.social === "object") {
    return <ReelPackage payload={obj} />;
  }

  if (Array.isArray(obj.variants)) {
    return <Variants variants={obj.variants as Record<string, string>[]} />;
  }

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

/** Only the prose kinds are worth a plain textarea; the structured ones
 *  would turn into hand-edited JSON, which is a worse tool than the button
 *  that regenerates them. */
function isProse(payloadJson: string): boolean {
  try {
    const o = JSON.parse(payloadJson) as Record<string, unknown>;
    return typeof o.markdown === "string" || typeof o.text === "string";
  } catch {
    return false;
  }
}

/**
 * Fixing a draft by hand.
 *
 * Regenerating to change one sentence throws away the nine hundred words
 * that were already right, so the obvious thing has to be possible. Saving
 * marks the draft as edited, which is what makes the warning before a
 * regeneration honest.
 */
function DraftEditor({
  draftId,
  payloadJson,
  onDone,
}: {
  draftId: Id<"amplifyDrafts">;
  payloadJson: string;
  onDone: () => void;
}) {
  const edit = useMutation(api.amplifyDrafts.edit);
  const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
  const field = typeof parsed.markdown === "string" ? "markdown" : "text";
  const [body, setBody] = useState(String(parsed[field] ?? ""));
  const [busy, setBusy] = useState(false);

  return (
    <div className="grid gap-2">
      <textarea
        rows={16}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="w-full resize-y rounded-xl border border-border bg-surface px-3.5 py-3 text-sm leading-relaxed text-ink focus:border-brand focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await edit({
                draftId,
                payloadJson: JSON.stringify({ ...parsed, [field]: body }),
              });
              onDone();
            } finally {
              setBusy(false);
            }
          }}
          className="rounded-lg bg-ink px-3 py-1.5 text-2xs font-medium text-white hover:bg-ink/85 disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          onClick={onDone}
          className="text-2xs text-muted underline hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function PieceRow({
  piece,
  projectId,
  draft,
  have,
}: {
  piece: Piece;
  projectId: Id<"amplifyProjects">;
  draft: {
    _id: Id<"amplifyDrafts">;
    payloadJson: string;
    status: string;
    error: string | null;
    editedByHuman: boolean;
    updatedAt: number;
  } | undefined;
  /** Which kinds already exist, for the pieces built on other pieces. */
  have: Set<string>;
}) {
  // Hooks cannot be conditional, so a piece with no generator of its own
  // still names one — it just never calls it. The reel is made beside the
  // clip it comes from, which is the only place the choice makes sense.
  // Two modules produce these, so the row resolves its own action. The
  // alternative — one module re-exporting everything — would make every
  // generation import every other one.
  const run = useAction(api.amplifyGenerate[piece.run ?? "metadata"]);
  const thumbnailPrompt = useAction(api.amplifyGenerate.thumbnailPrompt);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyNote, setCopyNote] = useState<string | null>(null);

  const blocked = piece.needs !== undefined && !have.has(piece.needs);
  const ready = draft?.status === "ready";

  return (
    <li className="grid gap-2 border-b border-border px-4 py-3 last:border-0">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="text-[0.9375rem] font-semibold text-ink">{piece.label}</span>
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
          {piece.run === null ? null : (
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
            // Weight follows what is left to do. Every row carried the same
            // solid button, so seven pieces of writing meant seven identical
            // black rectangles down the page — and the one thing that had
            // not been written yet looked exactly like the six that had.
            // Rewriting something finished is a second thought; it gets a
            // second thought's weight.
            className={`rounded-lg px-3 py-1.5 text-2xs font-medium transition-colors disabled:opacity-40 ${
              ready
                ? "border border-border bg-surface text-muted hover:border-border-strong hover:text-ink"
                : "bg-ink text-white hover:bg-ink/85"
            }`}
          >
            {busy ? "Writing…" : ready ? "Write again" : "Write"}
          </button>
          )}
        </div>
      </div>

      {/* An instruction that stays after it has been followed reads as a
          complaint. Once the piece exists, the row says what it is. */}
      <p className="text-[0.8125rem] text-muted">
        {blocked
          ? `Write the ${
              piece.needs === "blog_post" ? "blog post" : "title and description"
            } first — this one is built from it.`
          : ready && piece.run === null
            ? "Made from a clip. Pick a different one to replace it."
            : piece.blurb}
      </p>

      {/* The reason, not just the fact. It is the only thing that tells
          anyone whether to retry or fix something. */}
      {draft?.error && (
        <p className="text-[0.8125rem] text-danger">{draft.error}</p>
      )}

      {piece.kind === "thumbnail_concepts" && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {/* Tuning a prompt without seeing the filled-in version is
              guesswork: the template is a third of it, and the rest is the
              voice block, the church's wording, and six substitutions whose
              sizes are capped in ways the template never mentions. */}
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
                setCopyNote(
                  e instanceof Error
                    ? e.message.slice(0, 140)
                    : "Couldn't build the prompt",
                );
              } finally {
                setCopying(false);
                window.setTimeout(() => setCopyNote(null), 6000);
              }
            }}
            className="text-2xs text-muted underline hover:text-ink disabled:opacity-40"
          >
            {copying ? "Building…" : "Copy the prompt sent to Claude"}
          </button>
          {copyNote && <span className="text-2xs text-faint">{copyNote}</span>}
        </div>
      )}

      {/* The concepts are a brief for an image tool; this is where the
          finished picture comes back, beside the sermon it was made for
          rather than in a download folder. */}
      {piece.kind === "thumbnail_concepts" && ready && (
        <AttachImage projectId={projectId} kind="sermon_thumbnail" />
      )}

      {open && ready && draft && (
        <div className="rounded-xl bg-surface-strong p-3.5">
          {editing ? (
            <DraftEditor
              draftId={draft._id}
              payloadJson={draft.payloadJson}
              onDone={() => setEditing(false)}
            />
          ) : (
            <>
              <Preview payloadJson={draft.payloadJson} />
              {isProse(draft.payloadJson) && (
                <button
                  onClick={() => setEditing(true)}
                  className="mt-2.5 text-2xs text-muted underline hover:text-ink"
                >
                  Edit this
                </button>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

export function Outputs({ projectId }: { projectId: Id<"amplifyProjects"> }) {
  const transcript = useQuery(api.amplifyTranscripts.summary, { projectId });
  const drafts = useQuery(api.amplifyDrafts.list, { projectId });

  const byKind = new Map((drafts ?? []).map((d) => [d.kind, d]));
  const have = new Set(
    (drafts ?? []).filter((d) => d.status === "ready").map((d) => d.kind),
  );

  return (
    <div className="card grid gap-3 p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        {/* No title. The room is called Writing; saying it twice in fourteen
            vertical pixels of each other is the page talking to itself. */}
        {transcript && (
          <span className="data">
            {transcript.wordCount.toLocaleString()} words of transcript
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
              have={have}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
