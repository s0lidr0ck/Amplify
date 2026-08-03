import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useRef, useState } from "react";

import { errorText } from "../lib/errorText";

/**
 * Putting the finished picture back.
 *
 * Amplify writes the brief and hands it to an image tool; the image comes
 * back somewhere else entirely — a download folder, a Midjourney feed, a
 * designer's export. Until this existed there was nowhere to put it, so the
 * cover a church actually used lived in a Slack thread and the app that
 * planned it never saw it.
 *
 * Straight to S3 from the browser, the same way the sermon upload goes. The
 * bytes never pass through Convex, which has a request size limit a 4MB PNG
 * would sit awkwardly against.
 */

/** What the picture is for, which decides its shape and where it belongs. */
export type CoverKind = "sermon_thumbnail" | "reel_cover";

const WANTED: Record<CoverKind, { label: string; wide: boolean; hint: string }> = {
  sermon_thumbnail: {
    label: "thumbnail",
    wide: true,
    hint: "YouTube thumbnails are landscape — 1280×720 or wider.",
  },
  reel_cover: {
    label: "cover",
    wide: false,
    hint: "Reel covers are vertical — 1080×1920.",
  },
};

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
  const [preview, setPreview] = useState<string | null>(null);

  const spec = WANTED[kind];
  const attached = (assets ?? []).find(
    (a) => a.kind === kind && (a.subjectId ?? undefined) === subjectId,
  );

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    setWarning(null);
    try {
      const size = await measure(file);
      if (!size) {
        setError("That file isn't an image the browser can read.");
        return;
      }
      // A warning, not a refusal. Somebody attaching a landscape cover to a
      // reel usually knows something we don't — a different crop is coming,
      // or the platform is not the one we assumed. Refusing would make the
      // app an obstacle over a guess.
      const isWide = size.width > size.height;
      if (isWide !== spec.wide) {
        setWarning(
          `That's ${isWide ? "landscape" : "vertical"} — ${spec.hint} ` +
            "Attached anyway.",
        );
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
      setPreview(null);
    } catch (e) {
      setError(errorText(e, "Couldn't attach that"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const look = async () => {
    if (!attached) return;
    const url = await playbackUrl({ assetId: attached._id });
    setPreview(url);
  };

  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <button
          disabled={busy}
          onClick={() => input.current?.click()}
          className={`rounded-lg border px-3 py-1.5 text-2xs font-medium transition-colors disabled:opacity-40 ${
            attached
              ? "border-border bg-surface text-muted hover:border-border-strong hover:text-ink"
              : "border-transparent bg-ink text-white hover:bg-ink/85"
          }`}
        >
          {busy
            ? "Attaching…"
            : attached
              ? `Replace the ${spec.label}`
              : `Attach the ${spec.label}`}
        </button>

        {attached && (
          <>
            <button
              onClick={() => void (preview ? setPreview(null) : look())}
              className="text-2xs text-muted underline hover:text-ink"
            >
              {preview ? "Hide it" : "See it"}
            </button>
            <span className="data">
              {attached.width}×{attached.height}
            </span>
            <button
              onClick={async () => {
                setPreview(null);
                await detach({ assetId: attached._id });
              }}
              className="text-2xs text-muted underline hover:text-ink"
            >
              Remove
            </button>
          </>
        )}
      </div>

      {error && <p className="text-2xs text-danger">{error}</p>}
      {warning && <p className="text-2xs text-warn">{warning}</p>}

      {preview && (
        <img
          src={preview}
          alt={`The ${spec.label} attached to this sermon`}
          // Bounded rather than full width: a 1080×1920 cover unrolled at
          // full size pushes everything else off the screen.
          className="max-h-72 w-auto justify-self-start rounded-xl border border-border"
        />
      )}
    </div>
  );
}
