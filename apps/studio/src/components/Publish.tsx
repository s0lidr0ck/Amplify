import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useState } from "react";

/**
 * Everything for one sermon, gathered in the order it goes out.
 *
 * This does not post for you. Posting to YouTube, Instagram, TikTok and
 * Facebook needs an app registration and an OAuth token per platform per
 * church, and those are the church's to obtain — a button here that
 * pretended otherwise would be a lie with a spinner on it.
 *
 * What it does is remove the part that actually wastes the time: hunting for
 * the right caption, the right file, and the right thumbnail brief across
 * six screens on a Monday morning. One place, in publishing order, with the
 * copy one press away and a record of what has already gone out — so the
 * question "did anyone post the reel?" has an answer.
 */

type Target = {
  id: string;
  label: string;
  /** What you need in hand before this one can go out. */
  needs: string[];
  note: string;
};

const TARGETS: Target[] = [
  {
    id: "youtube",
    label: "YouTube",
    needs: ["sermon_master", "youtube_packaging"],
    note: "The full sermon, with its title and description.",
  },
  {
    id: "blog",
    label: "Website",
    needs: ["blog_post"],
    note: "The long-form write-up.",
  },
  {
    id: "reel",
    label: "Reels & Shorts",
    needs: ["clip", "reel"],
    note: "The clip, with a caption per platform.",
  },
  {
    id: "social",
    label: "Text post",
    needs: ["facebook_post"],
    note: "The short version.",
  },
];

export function Publish({ projectId }: { projectId: Id<"amplifyProjects"> }) {
  const drafts = useQuery(api.amplifyDrafts.list, { projectId });
  const assets = useQuery(api.amplifyMedia.listAssets, { projectId });
  const transcript = useQuery(api.amplifyTranscripts.summary, { projectId });
  const publications = useQuery(api.amplifyPublish.list, { projectId });
  const mark = useMutation(api.amplifyPublish.mark);
  const playbackUrl = useAction(api.amplifyMedia.playbackUrl);
  const [busy, setBusy] = useState<string | null>(null);

  if (!drafts || !assets || publications === undefined) return null;

  const have = new Set<string>([
    ...drafts.filter((d) => d.status === "ready").map((d) => d.kind),
    ...assets.map((a) => a.kind),
  ]);
  const done = new Map(publications.map((p) => [p.target, p]));
  const approved = transcript?.approved ?? false;

  const download = async (kind: string) => {
    const asset = assets.find((a) => a.kind === kind);
    if (!asset) return;
    setBusy(kind);
    try {
      const url = await playbackUrl({ assetId: asset._id });
      window.open(url, "_blank", "noopener");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card grid gap-3 p-5">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <p className="card-title">Publishing</p>
        <span className="data">
          {done.size} of {TARGETS.length} out
        </span>
      </div>

      {/* The one gate that is about the church's name rather than about
          convenience, so it is stated once at the top rather than repeated
          on every row. */}
      {!approved && (
        <p className="text-[0.8125rem] text-muted">
          The transcript hasn&rsquo;t been approved yet. Everything below was
          written from it.
        </p>
      )}

      <ul className="-mx-5 -mb-5 border-t border-border">
        {TARGETS.map((target) => {
          const missing = target.needs.filter((n) => !have.has(n));
          const out = done.get(target.id);
          const file = target.needs.find(
            (n) => n === "sermon_master" || n === "clip",
          );

          return (
            <li
              key={target.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-5 py-3.5 last:border-0"
            >
              <div className="flex-1">
                <p className="text-[0.9375rem] font-semibold text-ink">
                  {target.label}
                </p>
                <p className="text-[0.8125rem] text-muted">
                  {missing.length > 0
                    ? // Named, not counted. "Missing 2 things" sends somebody
                      // looking; naming them sends them to the right button.
                      `Still needs the ${missing
                        .map(
                          (m) =>
                            ({
                              sermon_master: "trimmed sermon",
                              youtube_packaging: "title and description",
                              blog_post: "blog post",
                              facebook_post: "text post",
                              clip: "clip cut",
                              reel: "reel captions",
                            })[m] ?? m,
                        )
                        .join(" and the ")}`
                    : out
                      ? `Marked as posted ${new Date(out.publishedAt).toLocaleDateString()}`
                      : target.note}
                </p>
              </div>

              {missing.length === 0 && (
                <div className="flex items-center gap-2.5">
                  {file && have.has(file) && (
                    <button
                      disabled={busy === file}
                      onClick={() => void download(file)}
                      className="text-2xs text-muted underline hover:text-ink disabled:opacity-40"
                    >
                      {busy === file ? "Opening…" : "Open the file"}
                    </button>
                  )}
                  <button
                    onClick={() =>
                      void mark({
                        projectId,
                        target: target.id,
                        posted: !out,
                      })
                    }
                    className={`rounded-lg px-3 py-1.5 text-2xs font-medium transition-colors ${
                      out
                        ? "bg-ok-soft text-ok hover:bg-surface-strong"
                        : "bg-ink text-white hover:bg-ink/85"
                    }`}
                  >
                    {out ? "Posted" : "Mark as posted"}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
