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

export const PIECES: Piece[] = [
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
export function Preview({ payloadJson }: { payloadJson: string }) {
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
export function isProse(payloadJson: string): boolean {
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
export function DraftEditor({
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

