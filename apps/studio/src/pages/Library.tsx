import { useAction, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useState } from "react";
import { Link } from "react-router-dom";

import { formatSermonDate } from "../lib/dates";
import { shortName } from "../lib/names";

/**
 * A church's work, across every sermon.
 *
 * The sermon page answers "what is happening to this one". Nobody plans a
 * week from that page — they want last month's clips, or the posts that are
 * finished and still sitting here, and finding those one sermon at a time is
 * how work gets forgotten rather than done.
 *
 * Two questions, in the order they are actually asked: what is ready and not
 * out yet, then where is that file.
 */

const KINDS: [string, string][] = [
  ["", "Everything"],
  ["clip", "Clips"],
  ["sermon_master", "Sermons"],
  ["source_video", "Service recordings"],
];

/** Singular, for the chip on one row — the filter buttons read as plurals. */
const KIND_LABELS: Record<string, string> = {
  clip: "Clip",
  sermon_master: "Sermon",
  source_video: "Recording",
  reel: "Reel",
};

const LABELS: Record<string, string> = {
  metadata: "details",
  blog_post: "blog post",
  youtube_packaging: "title & description",
  facebook_post: "text post",
  reel: "reel",
  thumbnail_concepts: "thumbnails",
  reel_thumbnail: "reel cover",
};

function mins(seconds: number | null): string {
  if (!seconds) return "";
  return seconds < 90
    ? `${Math.round(seconds)}s`
    : `${Math.round(seconds / 60)} min`;
}

export function LibraryPage({ churchId }: { churchId: string }) {
  const id = churchId as Id<"churches">;
  const [kind, setKind] = useState("");
  const waiting = useQuery(api.amplifyLibrary.waiting, { churchId: id });
  const media = useQuery(api.amplifyLibrary.media, {
    churchId: id,
    kind: kind || undefined,
  });
  const playbackUrl = useAction(api.amplifyMedia.playbackUrl);
  const [opening, setOpening] = useState<string | null>(null);

  return (
    <div className="mx-auto grid max-w-4xl gap-7 px-5 py-9">
      <header>
        <h1 className="font-display text-[2.125rem] font-bold leading-[1.15] tracking-[-0.02em] text-ink">
          Library
        </h1>
        <p className="mt-1 text-sm text-muted">
          Everything this church has made.
        </p>
      </header>

      {/* First, because it is the question somebody actually opens this page
          with on a Monday. */}
      <section className="grid gap-3">
        <div className="flex flex-wrap items-baseline gap-x-2.5">
          <h2 className="card-title">Written and not out yet</h2>
          {waiting && (
            <span className="data">
              {waiting.filter((w) => w.published === 0).length} sermons
            </span>
          )}
        </div>

        {waiting === undefined ? null : waiting.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing written yet. Add a sermon and it will show up here.
          </p>
        ) : (
          <ul className="card overflow-hidden">
            {waiting.map((w) => (
              <li key={w.projectId} className="border-b border-border last:border-0">
                <Link
                  to={`/projects/${w.projectId}`}
                  className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-strong focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-brand"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[1.0625rem] font-semibold leading-snug tracking-[-0.01em] text-ink">
                      {w.title}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-muted">
                      <span className="data">
                        {formatSermonDate(w.sermonDate)}
                      </span>
                      <span className="h-2.5 w-px bg-border" aria-hidden />
                      {/* A count, not the list. Six names of pieces of
                          writing is a wall of grey the eye slides off; the
                          number is read at a glance, and the names are one
                          click away on the sermon itself. */}
                      <span title={w.ready.map((k) => LABELS[k] ?? k).join(", ")}>
                        {w.ready.length}{" "}
                        {w.ready.length === 1 ? "piece" : "pieces"} written
                      </span>
                    </p>
                  </div>
                  <span className="shrink-0">
                    {w.published > 0 ? (
                      <span className="rounded-md bg-ok-soft px-2 py-0.5 text-2xs font-medium text-ok">
                        {w.published} out
                      </span>
                    ) : (
                      <span className="text-2xs text-muted">nothing out</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="card-title">Media</h2>
          <span className="flex overflow-hidden rounded-lg border border-border">
            {KINDS.map(([value, label]) => (
              <button
                key={value}
                onClick={() => setKind(value)}
                className={`border-r border-border px-2.5 py-1 text-2xs font-medium transition-colors last:border-r-0 ${
                  kind === value
                    ? "bg-ink text-white"
                    : "text-muted hover:bg-surface-strong hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </span>
          {media && <span className="data">{media.length} files</span>}
        </div>

        {media === undefined ? null : media.length === 0 ? (
          <p className="text-sm text-muted">Nothing of that kind yet.</p>
        ) : (
          <ul className="card overflow-hidden">
            {media.map((m) => (
              <li
                key={m._id}
                className="flex items-center gap-4 border-b border-border px-5 py-3 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2">
                    {/* What kind of file it is, said rather than guessed at.
                        A camera name like 1000132166.mp4 and an S3 key are
                        equally meaningless, and without this the only way to
                        tell a clip from a whole sermon was the duration —
                        which the service recordings don't carry. */}
                    <span className="shrink-0 rounded-md bg-surface-strong px-2 py-0.5 text-2xs font-medium text-muted">
                      {KIND_LABELS[m.kind] ?? m.kind}
                    </span>
                    <span
                      className="truncate text-sm text-ink"
                      title={m.filename}
                    >
                      {shortName(m.filename)}
                    </span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-muted">
                    <Link
                      to={`/projects/${m.projectId}`}
                      className="underline hover:text-ink"
                    >
                      {m.projectTitle}
                    </Link>
                    {mins(m.durationSeconds) && (
                      <>
                        <span className="h-2.5 w-px bg-border" aria-hidden />
                        <span className="data">{mins(m.durationSeconds)}</span>
                      </>
                    )}
                  </p>
                </div>
                <button
                  disabled={opening === m._id}
                  onClick={async () => {
                    setOpening(m._id);
                    try {
                      const url = await playbackUrl({ assetId: m._id });
                      window.open(url, "_blank", "noopener");
                    } finally {
                      setOpening(null);
                    }
                  }}
                  className="shrink-0 text-2xs text-muted underline hover:text-ink disabled:opacity-40"
                >
                  {opening === m._id ? "Opening…" : "Open"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
