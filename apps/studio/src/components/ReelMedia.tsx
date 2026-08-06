import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useEffect, useRef, useState } from "react";

import { errorText } from "../lib/errorText";

/**
 * Everything a moment has produced, in one gallery.
 *
 * The cut, the editor's finished reel, and the covers attached to it were
 * shown three different ways — a player, a download link, and a separate
 * image grid — so answering "what have we actually got for this one" meant
 * scrolling and remembering. They are all just media belonging to this clip,
 * and a person looking at them is doing one thing: looking.
 *
 * A tile that plays says so, with a play mark. A tile that does not is a
 * picture. That is the whole distinction anybody needs at a glance, and it
 * is carried by the tile rather than by a caption under it.
 */

type Item = {
  assetId: Id<"amplifyAssets">;
  role: "cut" | "reel" | "cover";
  url: string;
  filename: string;
  width: number | null;
  height: number | null;
};

const LABEL: Record<Item["role"], string> = {
  cut: "the cut",
  reel: "the reel",
  cover: "cover",
};

const plays = (role: Item["role"]) => role !== "cover";

function Play() {
  return (
    <span className="grid h-9 w-9 place-items-center rounded-full bg-black/55 backdrop-blur-sm transition-transform duration-200 group-hover:scale-110">
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden fill="white">
        <path d="M8 5v14l11-7z" />
      </svg>
    </span>
  );
}

/** Read a video's shape before it goes anywhere, so publishing can refuse a
 *  widescreen reel rather than letterboxing it down a phone screen. */
async function measureVideo(
  file: File,
): Promise<{ durationSeconds?: number; width?: number; height?: number }> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      const done = (out: {
        durationSeconds?: number;
        width?: number;
        height?: number;
      }) => resolve(out);
      video.onloadedmetadata = () =>
        done({
          durationSeconds: Number.isFinite(video.duration)
            ? Math.round(video.duration)
            : undefined,
          width: video.videoWidth || undefined,
          height: video.videoHeight || undefined,
        });
      video.onerror = () => done({});
      setTimeout(() => done({}), 10_000);
      video.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function measureImage(
  file: File,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export function ReelMedia({
  projectId,
  clipId,
  exportedAssetId,
  hasReel,
}: {
  projectId: Id<"amplifyProjects">;
  clipId: Id<"amplifyClips">;
  /** The cut, which lives on the clip row rather than under a subject. */
  exportedAssetId: Id<"amplifyAssets"> | null;
  /** Whether an edit has already been handed back, for the button's wording. */
  hasReel: boolean;
}) {
  const assets = useQuery(api.amplifyMedia.listAssets, { projectId });
  const clipMedia = useAction(api.amplifyMedia.clipMedia);
  const requestUpload = useAction(api.amplifyMedia.requestUpload);
  const recordAsset = useMutation(api.amplifyMedia.recordAsset);
  const detach = useMutation(api.amplifyMedia.detachImage);
  const playbackUrl = useAction(api.amplifyMedia.playbackUrl);

  const coverInput = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState<Item | null>(null);
  const [busy, setBusy] = useState<"reel" | "cover" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Which media exists comes from the live query; the signed links come from
  // an action. Keyed on the ids so an upload or a removal refetches and
  // nothing else does.
  const mine = (assets ?? []).filter(
    (a) =>
      a.status !== "replaced" &&
      ((a.subjectId ?? undefined) === clipId ||
        a.kind === "clip_video") &&
      (a.kind === "reel_video" ||
        a.kind === "reel_cover" ||
        a.kind === "clip_video"),
  );
  const ids = mine.map((a) => a._id).join(",");

  useEffect(() => {
    let live = true;
    void clipMedia({
      projectId,
      clipId,
      ...(exportedAssetId ? { exportedAssetId } : {}),
    })
      .then((rows) => {
        if (live) setItems(rows);
      })
      .catch(() => {
        if (live) setItems([]);
      });
    return () => {
      live = false;
    };
  }, [clipMedia, projectId, clipId, exportedAssetId, ids]);

  // Escape closes the viewer, the way every other one on the machine does.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const uploadReel = async (file: File) => {
    setBusy("reel");
    setError(null);
    try {
      const probe = await measureVideo(file);
      const { uploadUrl, storageKey } = await requestUpload({
        projectId,
        kind: "reel_video",
        filename: file.name,
        contentType: file.type || "video/mp4",
      });
      const put = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "video/mp4" },
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      // subjectId ties it to the clip it was built from, which is how
      // publishing finds it and how a second editor can see the moment is
      // already taken.
      await recordAsset({
        projectId,
        kind: "reel_video",
        subjectId: clipId,
        storageKey,
        filename: file.name,
        mimeType: file.type || "video/mp4",
        ...probe,
      });
    } catch (e) {
      setError(errorText(e, "That upload didn't work"));
    } finally {
      setBusy(null);
    }
  };

  const uploadCovers = async (files: File[]) => {
    setBusy("cover");
    setError(null);
    try {
      for (const file of files) {
        const size = await measureImage(file);
        if (!size) {
          setError(`${file.name} isn't an image the browser can read.`);
          continue;
        }
        const { uploadUrl, storageKey } = await requestUpload({
          projectId,
          kind: "reel_cover",
          filename: file.name,
          contentType: file.type || "image/png",
        });
        const put = await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "image/png" },
        });
        if (!put.ok) throw new Error(`S3 refused the upload (${put.status})`);
        await recordAsset({
          projectId,
          kind: "reel_cover",
          subjectId: clipId,
          storageKey,
          filename: file.name,
          mimeType: file.type || "image/png",
          width: size.width,
          height: size.height,
        });
      }
    } catch (e) {
      setError(errorText(e, "Couldn't attach that"));
    } finally {
      setBusy(null);
      if (coverInput.current) coverInput.current.value = "";
    }
  };

  return (
    <div className="grid gap-3">
      {items.length > 0 && (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {items.map((item) => (
            <li key={item.assetId} className="grid gap-1">
              <button
                onClick={() => setOpen(item)}
                title={plays(item.role) ? "Play it" : "See it full size"}
                className="group relative block aspect-[9/16] overflow-hidden rounded-xl border border-border bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {plays(item.role) ? (
                  <video
                    // No #t fragment. It looked like a good idea — skip a
                    // black opening frame — and in practice the seek did not
                    // resolve against a presigned URL and every video tile
                    // painted black. The first frame is what plays.
                    src={item.url}
                    preload="metadata"
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <img
                    src={item.url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                  />
                )}

                {/* The one thing that has to be readable at this size: does
                    it play. */}
                {plays(item.role) && (
                  <span className="absolute inset-0 grid place-items-center">
                    <Play />
                  </span>
                )}

                <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[0.625rem] font-medium text-white">
                  {LABEL[item.role]}
                </span>
              </button>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <button
                  onClick={async () => {
                    const url = await playbackUrl({
                      assetId: item.assetId,
                      download: true,
                    });
                    window.location.href = url;
                  }}
                  className="text-2xs text-muted underline hover:text-ink"
                >
                  Download
                </button>
                {/* The cut is not removable here. It belongs to the clip
                    rather than to the reel, and "Cut it again" is what
                    replaces it. */}
                {item.role !== "cut" && (
                  <button
                    onClick={() => void detach({ assetId: item.assetId })}
                    className="text-2xs text-muted underline hover:text-ink"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <label
          className={`cursor-pointer rounded-lg border px-3 py-1.5 text-2xs font-medium transition-colors ${
            busy === "reel"
              ? "border-border bg-surface text-faint"
              : hasReel
                ? "border-border bg-surface text-muted hover:border-border-strong hover:text-ink"
                : "border-transparent bg-ink text-white hover:bg-ink/85"
          }`}
        >
          <input
            type="file"
            accept="video/*"
            className="hidden"
            disabled={busy !== null}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void uploadReel(file);
            }}
          />
          {busy === "reel"
            ? "Uploading…"
            : hasReel
              ? "Replace the reel"
              : "Upload the reel"}
        </label>

        <input
          ref={coverInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) void uploadCovers(files);
          }}
        />
        <button
          disabled={busy !== null}
          onClick={() => coverInput.current?.click()}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-2xs font-medium text-muted transition-colors hover:border-border-strong hover:text-ink disabled:opacity-40"
        >
          {busy === "cover" ? "Attaching…" : "Add a cover"}
        </button>
      </div>

      {error && <p className="text-2xs text-danger">{error}</p>}

      {/* Full size. Escape and a click anywhere both close it — a viewer you
          cannot get out of is worse than no viewer. */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={open.filename}
          onClick={() => setOpen(null)}
          className="fixed inset-0 z-[60] grid place-items-center bg-ink/75 p-6"
        >
          {plays(open.role) ? (
            <video
              src={open.url}
              controls
              autoPlay
              playsInline
              onClick={(e) => e.stopPropagation()}
              className="max-h-full max-w-full rounded-xl bg-black shadow-2xl"
            />
          ) : (
            <img
              src={open.url}
              alt={open.filename}
              className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
            />
          )}
        </div>
      )}
    </div>
  );
}
