import { useAction, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useState } from "react";

import { errorText } from "../lib/errorText";
import { hhmmss } from "./TimeMark";
import { Variants } from "./Variants";

/**
 * Every reel this sermon has, not the one it used to be limited to.
 *
 * A forty-minute sermon usually holds three or four moments worth cutting,
 * and the old model could only hold one: reels were stored by kind, so
 * packaging a second clip found the first reel and overwrote it. The
 * captions for the first one vanished, and nothing said so.
 *
 * Each reel is its own thing here — its clip, its captions per platform, its
 * cover. They are made from the clip list ("Make it the reel"), because
 * choosing which moment to cut is a decision about the sermon, and this is
 * where you come back to read what was written for it.
 */

type ReelPayload = {
  clipId?: string;
  hook?: string;
  startSeconds?: number;
  endSeconds?: number;
  social?: Record<string, { title?: string; description?: string }>;
  graphics?: { concepts?: { title?: string; main_hook_line?: string }[] };
};

const PLATFORMS: [string, string][] = [
  ["instagram", "Instagram"],
  ["tiktok", "TikTok"],
  ["youtube", "Shorts"],
  ["facebook", "Facebook"],
];

function parse(json: string): ReelPayload {
  try {
    return JSON.parse(json) as ReelPayload;
  } catch {
    return {};
  }
}

/** The three cover concepts, or none if the draft can't be read. */
function coverVariants(json: string): Record<string, string>[] {
  try {
    const parsed = JSON.parse(json) as { variants?: unknown };
    return Array.isArray(parsed.variants)
      ? (parsed.variants as Record<string, string>[])
      : [];
  } catch {
    return [];
  }
}

function Reel({
  projectId,
  reel,
  cover,
  cutAssetId,
  index,
}: {
  projectId: Id<"amplifyProjects">;
  reel: { _id: string; subjectId: string | null; payloadJson: string };
  cover?: { payloadJson: string; status: string };
  /** The cut file, when this reel's clip has been exported. */
  cutAssetId?: Id<"amplifyAssets">;
  index: number;
}) {
  const reelThumbnail = useAction(api.amplifyReel.reelThumbnail);
  const playbackUrl = useAction(api.amplifyMedia.playbackUrl);
  const [downloading, setDownloading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One panel at a time. Two long briefs unrolled at once turns a list of
  // four reels into a page nobody can scan.
  const [open, setOpen] = useState<"captions" | "cover" | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const p = parse(reel.payloadJson);
  const span =
    p.startSeconds !== undefined && p.endSeconds !== undefined
      ? `${hhmmss(p.startSeconds)}–${hhmmss(p.endSeconds)}`
      : "";

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  };

  return (
    <li className="grid gap-2 border-b border-border px-4 py-3.5 last:border-0">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        {/* Numbered because they are siblings with no natural order and
            "the second one" is how people will refer to them out loud. */}
        <span className="data">{index + 1}</span>
        <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold text-ink">
          {p.hook || "Untitled reel"}
        </span>
        {span && <span className="data">{span}</span>}
        {cover?.status === "ready" ? (
          <span className="rounded-md bg-ok-soft px-2 py-0.5 text-2xs font-medium text-ok">
            cover ready
          </span>
        ) : (
          <span className="text-2xs text-muted">no cover</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <button
          onClick={() => setOpen(open === "captions" ? null : "captions")}
          className="text-2xs text-muted underline hover:text-ink"
        >
          {open === "captions" ? "Hide the captions" : "Read the captions"}
        </button>
        {/* "cover ready" with nothing to open is a status nobody can act on
            — the covers were readable from the Writing list until reels
            moved out of it, and this is where they belong now. */}
        {cover?.status === "ready" && (
          <button
            onClick={() => setOpen(open === "cover" ? null : "cover")}
            className="text-2xs text-muted underline hover:text-ink"
          >
            {open === "cover" ? "Hide the cover" : "Read the cover"}
          </button>
        )}
        {/* Present only once the clip has actually been cut. Before that
            there is no file, and a download button that explains it cannot
            download anything is worse than no button. */}
        {cutAssetId ? (
          <button
            disabled={downloading}
            onClick={async () => {
              setDownloading(true);
              try {
                const url = await playbackUrl({
                  assetId: cutAssetId,
                  download: true,
                  // Named for the reel, not the timecodes it was cut at.
                  // "clip-1237-1270.mp4" tells an editor nothing.
                  filename: `${(p.hook || "reel")
                    .replace(/[^\w\s-]/g, "")
                    .trim()
                    .slice(0, 60)
                    .replace(/\s+/g, "-")
                    .toLowerCase()}.mp4`,
                });
                window.location.href = url;
              } finally {
                setDownloading(false);
              }
            }}
            className="text-2xs text-muted underline hover:text-ink disabled:opacity-40"
          >
            {downloading ? "Preparing…" : "Download the video"}
          </button>
        ) : (
          <span className="text-2xs text-faint">Cut the clip to get a file</span>
        )}
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await reelThumbnail({
                projectId,
                clipId: (reel.subjectId ?? undefined) as
                  | Id<"amplifyClips">
                  | undefined,
              });
            } catch (e) {
              setError(errorText(e, "Couldn't write the cover"));
            } finally {
              setBusy(false);
            }
          }}
          // Solid only while the cover is missing — same rule as everywhere
          // else: the weight goes to what is left to do.
          className={`rounded-lg border px-3 py-1.5 text-2xs font-medium transition-colors disabled:opacity-40 ${
            cover?.status === "ready"
              ? "border-border bg-surface text-muted hover:border-border-strong hover:text-ink"
              : "border-transparent bg-ink text-white hover:bg-ink/85"
          }`}
        >
          {busy
            ? "Writing…"
            : cover?.status === "ready"
              ? "Write the cover again"
              : "Write the cover"}
        </button>
      </div>

      {error && <p className="text-2xs text-danger">{error}</p>}

      {open === "cover" && cover && (
        <div className="rounded-xl bg-surface-strong p-3">
          <Variants variants={coverVariants(cover.payloadJson)} />
        </div>
      )}

      {open === "captions" && (
        <div className="grid gap-2.5 rounded-xl bg-surface-strong p-3">
          {PLATFORMS.filter(([key]) => p.social?.[key]).map(([key, label]) => {
            const one = p.social![key];
            const text = [one.title, one.description].filter(Boolean).join("\n\n");
            return (
              <div key={key} className="grid gap-1">
                <div className="flex items-baseline gap-2">
                  <span className="section-label">{label}</span>
                  <button
                    onClick={() => void copy(key, text)}
                    className="text-2xs text-muted underline hover:text-ink"
                  >
                    {copied === key ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-[0.8125rem] leading-relaxed text-ink">
                  {text}
                </p>
              </div>
            );
          })}
          {!p.social && (
            <p className="text-2xs text-muted">
              This reel has no captions yet. Make it again from the clip.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

export function Reels({ projectId }: { projectId: Id<"amplifyProjects"> }) {
  const drafts = useQuery(api.amplifyDrafts.list, { projectId });
  const clips = useQuery(api.amplifyClips.list, { projectId });
  if (!drafts) return null;

  // The cut file, per clip. A reel whose clip has been exported is a reel
  // somebody can actually hand to an editor, and that was reachable only
  // from the library two screens away.
  const cutFor = new Map(
    (clips ?? [])
      .filter((c) => c.exportedAssetId)
      .map((c) => [c._id as string, c.exportedAssetId!]),
  );

  const reels = drafts
    .filter((d) => d.kind === "reel" && d.status === "ready")
    .sort((a, b) => a.updatedAt - b.updatedAt);
  const covers = new Map(
    drafts
      .filter((d) => d.kind === "reel_thumbnail")
      .map((d) => [d.subjectId ?? "", d]),
  );

  return (
    <div className="card grid gap-3 p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="card-title">Reels</p>
        <span className="data">
          {reels.length === 0
            ? "none yet"
            : `${reels.length} from this sermon`}
        </span>
      </div>

      {reels.length === 0 ? (
        <p className="text-sm text-muted">
          Cut a clip below and press &ldquo;Make it the reel&rdquo;. You can
          make as many as the sermon has moments worth cutting.
        </p>
      ) : (
        <ul className="-mx-4 -mb-4 border-t border-border">
          {reels.map((reel, i) => (
            <Reel
              key={reel._id}
              projectId={projectId}
              reel={reel}
              cover={covers.get(reel.subjectId ?? "")}
              cutAssetId={cutFor.get(reel.subjectId ?? "")}
              index={i}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
