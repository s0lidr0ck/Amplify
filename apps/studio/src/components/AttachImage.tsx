import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useRef, useState } from "react";

import { errorText } from "../lib/errorText";

/**
 * Putting the finished pictures back — as many as you want to try.
 *
 * Amplify writes the brief and hands it to an image tool; the images come
 * back somewhere else entirely — a download folder, a Midjourney feed, a
 * designer's export. Until this existed there was nowhere to put them, so
 * the thumbnail a church actually used lived in a Slack thread and the app
 * that planned it never saw it.
 *
 * Several, not one, because one is not a test. A thumbnail is the single
 * biggest lever on whether a sermon gets watched, and the only way to find
 * out which one works is to run two and look at the numbers. An upload that
 * quietly retired the previous picture made that impossible.
 *
 * Straight to S3 from the browser, the same way the sermon upload goes. The
 * bytes never pass through Convex, which has a request size limit a 4MB PNG
 * would sit awkwardly against.
 */

export type CoverKind = "sermon_thumbnail" | "reel_cover";

const WANTED: Record<CoverKind, { one: string; many: string; wide: boolean; hint: string }> = {
  sermon_thumbnail: {
    one: "thumbnail",
    many: "thumbnails",
    wide: true,
    hint: "YouTube thumbnails are landscape — 1280×720 or wider.",
  },
  reel_cover: {
    one: "cover",
    many: "covers",
    wide: false,
    hint: "Reel covers are vertical — 1080×1920.",
  },
};

/** A, B, C… so two pictures can be talked about out loud. */
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Read the picture's own dimensions before it goes anywhere. */
function measure(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    // A file the browser cannot decode is not an image, whatever it is
    // called. Better to say so here than to store it and find out when
    // somebody opens the cover.
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export function AttachImage({
  projectId,
  kind,
  subjectId,
}: {
  projectId: Id<"amplifyProjects">;
  kind: CoverKind;
  /** The clip, for a reel cover. Sermon thumbnails leave it unset. */
  subjectId?: string;
}) {
  const assets = useQuery(api.amplifyMedia.listAssets, { projectId });
  const requestUpload = useAction(api.amplifyMedia.requestUpload);
  const recordAsset = useMutation(api.amplifyMedia.recordAsset);
  const detach = useMutation(api.amplifyMedia.detachImage);
  const playbackUrl = useAction(api.amplifyMedia.playbackUrl);

  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [shown, setShown] = useState<Record<string, string>>({});

  const spec = WANTED[kind];
  // Oldest first, so A stays A when a third is added. Sorting newest-first
  // would renumber every picture each time somebody uploads one, and "try
  // B" would mean a different image by the afternoon.
  const attached = (assets ?? [])
    .filter((a) => a.kind === kind && (a.subjectId ?? undefined) === subjectId)
    .sort((a, b) => a.createdAt - b.createdAt);

  const upload = async (files: File[]) => {
    setBusy(true);
    setError(null);
    setWarning(null);
    try {
      for (const file of files) {
        const size = await measure(file);
        if (!size) {
          setError(`${file.name} isn't an image the browser can read.`);
          continue;
        }
        // A warning, not a refusal. Somebody attaching a landscape cover to
        // a reel usually knows something we don't — a different crop is
        // coming, or the platform is not the one we assumed. Refusing would
        // make the app an obstacle over a guess.
        if (size.width > size.height !== spec.wide) {
          setWarning(`${spec.hint} Attached anyway.`);
        }

        const { uploadUrl, storageKey } = await requestUpload({
          projectId,
          kind,
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
          kind,
          subjectId,
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
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const look = async (assetId: string) => {
    if (shown[assetId]) {
      setShown((s) => {
        const next = { ...s };
        delete next[assetId];
        return next;
      });
      return;
    }
    const url = await playbackUrl({ assetId: assetId as Id<"amplifyAssets"> });
    setShown((s) => ({ ...s, [assetId]: url }));
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <input
          ref={input}
          type="file"
          accept="image/*"
          // Several at once: three exports out of one image tool is one drag,
          // not three round trips through a file picker.
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) void upload(files);
          }}
        />
        <button
          disabled={busy}
          onClick={() => input.current?.click()}
          className={`rounded-lg border px-3 py-1.5 text-2xs font-medium transition-colors disabled:opacity-40 ${
            attached.length > 0
              ? "border-border bg-surface text-muted hover:border-border-strong hover:text-ink"
              : "border-transparent bg-ink text-white hover:bg-ink/85"
          }`}
        >
          {busy
            ? "Attaching…"
            : attached.length > 0
              ? `Attach another ${spec.one}`
              : `Attach the ${spec.one}`}
        </button>
        {attached.length > 1 && (
          <span className="text-2xs text-muted">
            {attached.length} {spec.many} to test against each other
          </span>
        )}
      </div>

      {error && <p className="text-2xs text-danger">{error}</p>}
      {warning && <p className="text-2xs text-warn">{warning}</p>}

      {attached.length > 0 && (
        <ul className="grid gap-1.5">
          {attached.map((a, i) => (
            <li key={a._id} className="grid gap-1.5">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="rounded-md bg-surface-strong px-1.5 py-0.5 font-mono text-2xs font-medium text-ink">
                  {LETTERS[i] ?? i + 1}
                </span>
                <span className="min-w-0 max-w-[16rem] truncate text-2xs text-muted">
                  {a.filename}
                </span>
                <span className="data">
                  {a.width}×{a.height}
                </span>
                <button
                  onClick={() => void look(a._id)}
                  className="text-2xs text-muted underline hover:text-ink"
                >
                  {shown[a._id] ? "Hide it" : "See it"}
                </button>
                <button
                  onClick={async () => {
                    const url = await playbackUrl({
                      assetId: a._id,
                      download: true,
                    });
                    window.location.href = url;
                  }}
                  className="text-2xs text-muted underline hover:text-ink"
                >
                  Download
                </button>
                <button
                  onClick={() => void detach({ assetId: a._id })}
                  className="text-2xs text-muted underline hover:text-ink"
                >
                  Remove
                </button>
              </div>
              {shown[a._id] && (
                <img
                  src={shown[a._id]}
                  alt={`${spec.one} ${LETTERS[i] ?? i + 1}`}
                  // Bounded rather than full width: a 1080×1920 cover
                  // unrolled at full size pushes everything else off screen.
                  className="max-h-72 w-auto justify-self-start rounded-xl border border-border"
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
