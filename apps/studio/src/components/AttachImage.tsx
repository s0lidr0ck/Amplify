import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useEffect, useRef, useState } from "react";

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

/**
 * Numbered, not lettered.
 *
 * The concept cards below are already A, B and C — the model's own labels —
 * and lettering the pictures too implies picture A came out of concept A.
 * Nothing records that; somebody uploads three exports in whatever order
 * their download folder had them. Numbers keep the pictures nameable
 * without inventing a pairing.
 */

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

type Attached = {
  assetId: Id<"amplifyAssets">;
  url: string;
  filename: string;
  width: number | null;
  height: number | null;
};

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
  const attachedImages = useAction(api.amplifyMedia.attachedImages);
  const requestUpload = useAction(api.amplifyMedia.requestUpload);
  const recordAsset = useMutation(api.amplifyMedia.recordAsset);
  const detach = useMutation(api.amplifyMedia.detachImage);
  const playbackUrl = useAction(api.amplifyMedia.playbackUrl);

  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [shown, setShown] = useState<Attached[]>([]);
  const [full, setFull] = useState<Attached | null>(null);

  const spec = WANTED[kind];

  // Which pictures exist comes from the live query; the signed links to look
  // at them come from an action. Keyed on the ids so a new upload or a
  // removal refetches, and nothing else does.
  const ids = (assets ?? [])
    .filter((a) => a.kind === kind && (a.subjectId ?? undefined) === subjectId)
    .map((a) => a._id)
    .join(",");

  useEffect(() => {
    let live = true;
    if (!ids) {
      setShown([]);
      return;
    }
    void attachedImages({ projectId, kind, subjectId }).then((rows) => {
      if (live) setShown(rows);
    });
    return () => {
      live = false;
    };
  }, [ids, projectId, kind, subjectId, attachedImages]);

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
        // coming, or the platform is not the one we assumed.
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

  return (
    <div className="grid gap-3">
      {/* The pictures themselves, not buttons promising pictures. You are
          choosing between three images; the only way to do that is to look
          at all three at once, and a "See it" button per row made that
          three clicks and a lot of scrolling. */}
      {shown.length > 0 && (
        <ul
          className={`grid gap-3 ${
            spec.wide
              ? "sm:grid-cols-2 lg:grid-cols-3"
              : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
          }`}
        >
          {shown.map((img, i) => (
            <li key={img.assetId} className="grid gap-1.5">
              <button
                onClick={() => setFull(img)}
                title="See it full size"
                className="group relative block overflow-hidden rounded-xl border border-border bg-surface-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <img
                  src={img.url}
                  alt={`${spec.one} ${i + 1}`}
                  loading="lazy"
                  className={`w-full object-cover transition-transform duration-200 group-hover:scale-[1.02] ${
                    spec.wide ? "aspect-video" : "aspect-[9/16]"
                  }`}
                />
                {/* The number sits on the picture, because the picture is
                    what somebody points at when they say "go with two". */}
                <span className="absolute left-2 top-2 rounded-md bg-ink/80 px-1.5 py-0.5 font-mono text-2xs font-medium text-white">
                  {i + 1}
                </span>
              </button>

              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                <span className="data">
                  {img.width}×{img.height}
                </span>
                <button
                  onClick={async () => {
                    const url = await playbackUrl({
                      assetId: img.assetId,
                      download: true,
                    });
                    window.location.href = url;
                  }}
                  className="text-2xs text-muted underline hover:text-ink"
                >
                  Download
                </button>
                <button
                  onClick={() => void detach({ assetId: img.assetId })}
                  className="text-2xs text-muted underline hover:text-ink"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

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
            shown.length > 0
              ? "border-border bg-surface text-muted hover:border-border-strong hover:text-ink"
              : "border-transparent bg-ink text-white hover:bg-ink/85"
          }`}
        >
          {busy
            ? "Attaching…"
            : shown.length > 0
              ? `Add another ${spec.one}`
              : `Attach the ${spec.one}`}
        </button>
        {shown.length > 1 && (
          <span className="text-2xs text-muted">
            {shown.length} {spec.many} to test against each other
          </span>
        )}
      </div>

      {error && <p className="text-2xs text-danger">{error}</p>}
      {warning && <p className="text-2xs text-warn">{warning}</p>}

      {/* Full size, for judging a thumbnail at the size it will not be seen
          at. Escape and a click anywhere both close it — a lightbox you
          cannot get out of is worse than no lightbox. */}
      {full && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={full.filename}
          onClick={() => setFull(null)}
          onKeyDown={(e) => e.key === "Escape" && setFull(null)}
          tabIndex={-1}
          ref={(el) => el?.focus()}
          className="fixed inset-0 z-50 grid place-items-center bg-ink/70 p-6"
        >
          <img
            src={full.url}
            alt={full.filename}
            className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}

