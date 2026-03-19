"use client";

import Image from "next/image";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getMediaPlaybackUrl, projects } from "@/lib/api";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { StepIntro } from "@/components/workflow/StepIntro";

type VisualAsset = Awaited<ReturnType<typeof projects.getSourceAsset>>;

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || Number.isNaN(seconds)) return "Unknown duration";
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function isImageAsset(asset: VisualAsset) {
  return Boolean(asset?.mime_type?.startsWith("image/"));
}

async function downloadAsset(asset: NonNullable<VisualAsset>) {
  const response = await fetch(getMediaPlaybackUrl(asset.id));
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Download failed with status ${response.status}`);
  }
  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = asset.filename || "asset";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(objectUrl);
}

function AssetCard({
  title,
  description,
  asset,
}: {
  title: string;
  description: string;
  asset: VisualAsset;
}) {
  const [downloadError, setDownloadError] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);

  return (
    <Card>
      <CardHeader
        eyebrow="Asset"
        title={title}
        description={description}
        action={
          asset ? (
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                try {
                  setDownloadError("");
                  setIsDownloading(true);
                  await downloadAsset(asset);
                } catch (error) {
                  setDownloadError(error instanceof Error ? error.message : "Asset download failed.");
                } finally {
                  setIsDownloading(false);
                }
              }}
            >
              {isDownloading ? "Downloading..." : "Download"}
            </Button>
          ) : null
        }
      />

      <div className="mt-6 space-y-4">
        {downloadError ? <Alert tone="danger">{downloadError}</Alert> : null}

        {asset ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone="success">{asset.status || "Ready"}</Badge>
              <Badge tone="neutral">{asset.filename}</Badge>
              <Badge tone="info">{formatDuration(asset.duration_seconds)}</Badge>
            </div>

            <div className="overflow-hidden rounded-[1.5rem] border border-border/80 bg-background-alt">
              {isImageAsset(asset) ? (
                <Image
                  src={asset.playback_url ?? getMediaPlaybackUrl(asset.id)}
                  alt={asset.filename}
                  width={960}
                  height={540}
                  className="h-auto w-full object-cover"
                  unoptimized
                />
              ) : (
                <video
                  src={asset.playback_url ?? getMediaPlaybackUrl(asset.id)}
                  controls
                  className="aspect-video w-full bg-black"
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex min-h-[16rem] items-center justify-center rounded-[1.5rem] border border-dashed border-border bg-background-alt px-6 text-center text-sm text-muted">
            No asset available yet.
          </div>
        )}
      </div>
    </Card>
  );
}

export default function VisualAssetsPage() {
  const params = useParams();
  const projectId = params.id as string;

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projects.get(projectId),
  });

  const { data: sourceAsset } = useQuery({
    queryKey: ["source-asset", projectId],
    queryFn: () => projects.getSourceAsset(projectId),
  });

  const { data: sermonAsset } = useQuery({
    queryKey: ["sermon-asset", projectId],
    queryFn: () => projects.getSermonAsset(projectId),
  });

  const { data: sermonThumbnailAsset } = useQuery({
    queryKey: ["sermon-thumbnail-asset", projectId],
    queryFn: () => projects.getSermonThumbnailAsset(projectId),
  });

  const { data: reelAsset } = useQuery({
    queryKey: ["reel-asset", projectId],
    queryFn: () => projects.getReelAsset(projectId),
  });

  const { data: reelThumbnailAsset } = useQuery({
    queryKey: ["reel-thumbnail-asset", projectId],
    queryFn: () => projects.getReelThumbnailAsset(projectId),
  });

  const availableCount = [sourceAsset, sermonAsset, sermonThumbnailAsset, reelAsset, reelThumbnailAsset].filter(Boolean).length;

  return (
    <div className="space-y-6">
      <StepIntro
        eyebrow="Visual Assets"
        title={`Review the visual package for ${project?.title ?? "this sermon"}.`}
        description="See the sermon media and reel media together in one place so the final visual handoff is easier to inspect."
        meta={[
          project?.speaker_display_name ?? project?.speaker ?? "Speaker pending",
          `${availableCount} of 5 assets available`,
          reelAsset ? "Reel uploaded" : "Reel pending",
        ]}
      />

      {!sourceAsset && !sermonAsset && !sermonThumbnailAsset && !reelAsset && !reelThumbnailAsset ? (
        <Alert tone="warning" title="No visual assets yet">
          Upload and generate the sermon/reel assets first, then this page will become the shared review surface.
        </Alert>
      ) : null}

      <div className="grid gap-6 2xl:grid-cols-2">
        <AssetCard
          title="Source video"
          description="The raw uploaded sermon video that started the workflow."
          asset={sourceAsset ?? null}
        />
        <AssetCard
          title="Sermon master"
          description="The trimmed sermon master used for transcript generation and downstream content."
          asset={sermonAsset ?? null}
        />
        <AssetCard
          title="Sermon thumbnail"
          description="The chosen thumbnail image for the full-sermon packaging."
          asset={sermonThumbnailAsset ?? null}
        />
        <AssetCard
          title="Final reel"
          description="The finished reel upload used for short-form distribution."
          asset={reelAsset ?? null}
        />
        <AssetCard
          title="Reel thumbnail"
          description="The chosen cover image for the reel package."
          asset={reelThumbnailAsset ?? null}
        />
      </div>
    </div>
  );
}
