"use client";

import Image from "next/image";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { getMediaPlaybackUrl, projects, transcript, type ProjectAsset } from "@/lib/api";
import type {
  BlogDraft,
  FacebookDraft,
  MetadataDraft,
  PackagingDraft,
  PublishingDraft,
  ReelDraft,
} from "@/lib/projectDrafts";

type NullableAsset = ProjectAsset | null;

function isImageAsset(asset: NullableAsset) {
  return Boolean(asset?.mime_type?.startsWith("image/"));
}

function formatDate(value: string | undefined) {
  if (!value) return "Date pending";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function textOrFallback(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || "Not generated yet.";
}

function AssetCard({
  title,
  description,
  usage,
  asset,
}: {
  title: string;
  description: string;
  usage: string;
  asset: NullableAsset;
}) {
  return (
    <Card>
      <CardHeader
        title={title}
        description={description}
        action={
          asset ? (
            <a
              href={asset.playback_url ?? getMediaPlaybackUrl(asset.id)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center rounded-full border border-border-strong bg-surface px-4 text-sm font-semibold text-ink transition-all hover:border-brand/40 hover:bg-brand-soft/50"
            >
              Open
            </a>
          ) : null
        }
      />
      <div className="mt-5 space-y-3">
        <div className="rounded-2xl border border-border/70 bg-surface px-4 py-3 text-sm text-muted">
          <span className="font-semibold text-ink">How to use:</span> {usage}
        </div>
        {asset ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="success">{asset.status || "ready"}</Badge>
              <Badge tone="neutral">{asset.filename}</Badge>
            </div>
            <div className="overflow-hidden rounded-[1.25rem] border border-border/80 bg-background-alt">
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
          <div className="rounded-2xl border border-dashed border-border/80 bg-background-alt px-4 py-8 text-center text-sm text-muted">
            Not generated yet.
          </div>
        )}
      </div>
    </Card>
  );
}

function TextCard({
  title,
  description,
  usage,
  value,
}: {
  title: string;
  description: string;
  usage: string;
  value: string | undefined;
}) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <div className="mt-4 rounded-2xl border border-border/70 bg-surface px-4 py-3 text-sm text-muted">
        <span className="font-semibold text-ink">How to use:</span> {usage}
      </div>
      <textarea
        readOnly
        value={textOrFallback(value)}
        className="mt-4 min-h-[14rem] w-full rounded-[1.25rem] border border-border bg-surface px-4 py-3 text-sm leading-7 text-ink outline-none"
      />
    </Card>
  );
}

export default function ProjectSharePage() {
  const params = useParams();
  const projectId = params.id as string;
  const [copied, setCopied] = useState(false);

  const { data: project, error: projectError, isLoading } = useQuery({
    queryKey: ["shared-project", projectId],
    queryFn: () => projects.get(projectId),
    retry: false,
  });

  const { data: sourceAsset } = useQuery({
    queryKey: ["shared-source-asset", projectId],
    queryFn: () => projects.getSourceAsset(projectId),
  });
  const { data: sermonAsset } = useQuery({
    queryKey: ["shared-sermon-asset", projectId],
    queryFn: () => projects.getSermonAsset(projectId),
  });
  const { data: sermonThumbnailAsset } = useQuery({
    queryKey: ["shared-sermon-thumbnail-asset", projectId],
    queryFn: () => projects.getSermonThumbnailAsset(projectId),
  });
  const { data: reelAsset } = useQuery({
    queryKey: ["shared-reel-asset", projectId],
    queryFn: () => projects.getReelAsset(projectId),
  });
  const { data: reelThumbnailAsset } = useQuery({
    queryKey: ["shared-reel-thumbnail-asset", projectId],
    queryFn: () => projects.getReelThumbnailAsset(projectId),
  });
  const { data: sermonTranscript } = useQuery({
    queryKey: ["shared-sermon-transcript", projectId],
    queryFn: () => transcript.getForProject(projectId, "sermon"),
  });
  const { data: reelTranscript } = useQuery({
    queryKey: ["shared-reel-transcript", projectId],
    queryFn: () => transcript.getForProject(projectId, "reel"),
  });
  const { data: metadataDraft } = useQuery({
    queryKey: ["shared-draft-metadata", projectId],
    queryFn: () => projects.getDraft<MetadataDraft>(projectId, "metadata"),
  });
  const { data: blogDraft } = useQuery({
    queryKey: ["shared-draft-blog", projectId],
    queryFn: () => projects.getDraft<BlogDraft>(projectId, "blog"),
  });
  const { data: packagingDraft } = useQuery({
    queryKey: ["shared-draft-packaging", projectId],
    queryFn: () => projects.getDraft<PackagingDraft>(projectId, "packaging"),
  });
  const { data: facebookDraft } = useQuery({
    queryKey: ["shared-draft-facebook", projectId],
    queryFn: () => projects.getDraft<FacebookDraft>(projectId, "facebook"),
  });
  const { data: reelDraft } = useQuery({
    queryKey: ["shared-draft-reel", projectId],
    queryFn: () => projects.getDraft<ReelDraft>(projectId, "reel"),
  });
  const { data: publishingDraft } = useQuery({
    queryKey: ["shared-draft-publishing", projectId],
    queryFn: () => projects.getDraft<PublishingDraft>(projectId, "publishing"),
  });

  const sermonTranscriptText = sermonTranscript?.cleaned_text || sermonTranscript?.raw_text;
  const reelTranscriptText = reelTranscript?.cleaned_text || reelTranscript?.raw_text;
  const metadataRaw = metadataDraft?.payload?.raw;
  const metadataJson = metadataDraft?.payload?.metadata
    ? JSON.stringify(metadataDraft.payload.metadata, null, 2)
    : "";
  const blogMarkdown = blogDraft?.payload?.markdown;
  const packagingTitle = packagingDraft?.payload?.title;
  const packagingDescription = packagingDraft?.payload?.description;
  const facebookPost = facebookDraft?.payload?.post;
  const reelCaption = reelDraft?.payload?.caption;
  const youtubeReelCopy = reelDraft?.payload?.platforms?.youtube
    ? `Title: ${reelDraft.payload.platforms.youtube.title || ""}\n\nDescription:\n${reelDraft.payload.platforms.youtube.description || ""}\n\nTags:\n${
        reelDraft.payload.platforms.youtube.tags?.join(", ") || ""
      }`
    : "";
  const facebookReelCopy = reelDraft?.payload?.platforms?.facebook
    ? `Title: ${reelDraft.payload.platforms.facebook.title || ""}\n\nDescription:\n${reelDraft.payload.platforms.facebook.description || ""}\n\nTags:\n${
        reelDraft.payload.platforms.facebook.tags?.join(", ") || ""
      }`
    : "";
  const instagramReelCopy = reelDraft?.payload?.platforms?.instagram
    ? `Title: ${reelDraft.payload.platforms.instagram.title || ""}\n\nDescription:\n${reelDraft.payload.platforms.instagram.description || ""}\n\nTags:\n${
        reelDraft.payload.platforms.instagram.tags?.join(", ") || ""
      }`
    : "";
  const tiktokReelCopy = reelDraft?.payload?.platforms?.tiktok
    ? `Title: ${reelDraft.payload.platforms.tiktok.title || ""}\n\nDescription:\n${reelDraft.payload.platforms.tiktok.description || ""}\n\nTags:\n${
        reelDraft.payload.platforms.tiktok.tags?.join(", ") || ""
      }`
    : "";
  const publishPreviewUrl = publishingDraft?.payload?.wix_result?.preview_url;

  async function copyCurrentLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const visualAssetCount = [sourceAsset, sermonAsset, sermonThumbnailAsset, reelAsset, reelThumbnailAsset].filter(Boolean).length;

  return (
    <main className="page-frame py-8 lg:py-10">
      <div className="page-stack">
        <Card>
          <CardHeader
            eyebrow="Shared Project"
            title={project?.title ?? "Project share"}
            description="This is a read-only view for reviewing and posting generated assets."
            action={
              <Button type="button" variant="secondary" onClick={() => void copyCurrentLink()}>
                {copied ? "Link copied" : "Copy link"}
              </Button>
            }
          />
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Badge tone="brand">{project?.status ?? "Loading"}</Badge>
            <Badge tone="neutral">{project?.speaker_display_name ?? project?.speaker ?? "Speaker pending"}</Badge>
            <Badge tone="info">{formatDate(project?.sermon_date)}</Badge>
            <Badge tone="success">{visualAssetCount} visual assets</Badge>
          </div>
        </Card>

        {isLoading ? (
          <Alert tone="info">Loading shared assets...</Alert>
        ) : null}
        {projectError ? (
          <Alert tone="danger" title="Project unavailable">
            This project link is invalid or no longer available.
          </Alert>
        ) : null}

        <div className="grid gap-6 2xl:grid-cols-2">
          <AssetCard
            title="Source video"
            description="Original uploaded source before any edits."
            usage="Use this as archive footage or fallback media if no finished cut is available."
            asset={sourceAsset ?? null}
          />
          <AssetCard
            title="Sermon master"
            description="Primary full-length sermon video prepared for distribution."
            usage="Post this to long-form platforms (YouTube, website, or livestream replay pages)."
            asset={sermonAsset ?? null}
          />
          <AssetCard
            title="Sermon thumbnail"
            description="Thumbnail image designed for the full sermon post."
            usage="Use this as the cover image for the full sermon on YouTube, website, or app."
            asset={sermonThumbnailAsset ?? null}
          />
          <AssetCard
            title="Final reel"
            description="Finished short-form vertical clip export."
            usage="Upload this to Instagram Reels, TikTok, Facebook Reels, and YouTube Shorts."
            asset={reelAsset ?? null}
          />
          <AssetCard
            title="Reel thumbnail"
            description="Cover image optimized for short-form reel posts."
            usage="Set this as the reel cover frame/thumbnail where your platform supports custom covers."
            asset={reelThumbnailAsset ?? null}
          />
        </div>

        <div className="grid gap-6 2xl:grid-cols-2">
          <TextCard
            title="Sermon transcript"
            description="Full transcript of the sermon content."
            usage="Use this for accessibility captions, editing reference, and repurposing into written content."
            value={sermonTranscriptText}
          />
          <TextCard
            title="Reel transcript"
            description="Transcript for the final reel clip."
            usage="Use this to verify hook wording and create on-screen captions or subtitle text."
            value={reelTranscriptText}
          />
          <TextCard
            title="Metadata (raw)"
            description="Unformatted generated metadata output."
            usage="Use as source notes if you need to quickly rebuild a title/description from scratch."
            value={metadataRaw}
          />
          <TextCard
            title="Metadata (JSON)"
            description="Structured metadata fields from the content workflow."
            usage="Use for system imports, CMS fields, or tooling that expects structured content."
            value={metadataJson}
          />
          <TextCard
            title="Blog draft"
            description="Long-form sermon article draft."
            usage="Use this as your website/blog post body, then lightly edit for final voice and formatting."
            value={blogMarkdown}
          />
          <TextCard
            title="Packaging title"
            description="Suggested headline for long-form sermon publishing."
            usage="Use this as the default sermon title on YouTube or your website."
            value={packagingTitle}
          />
          <TextCard
            title="Packaging description"
            description="Suggested long-form description copy."
            usage="Use this in the sermon description field and add links, CTAs, or timestamps."
            value={packagingDescription}
          />
          <TextCard
            title="Facebook post"
            description="Suggested post copy for standard Facebook feed content."
            usage="Paste this into a Facebook post and pair it with the sermon thumbnail or reel."
            value={facebookPost}
          />
          <TextCard
            title="Reel caption"
            description="General short-form caption for reel distribution."
            usage="Use this as your base caption, then tailor hashtags and CTA per platform."
            value={reelCaption}
          />
          <TextCard
            title="YouTube reel copy"
            description="Platform-specific title, description, and tags for YouTube Shorts."
            usage="Use these fields directly when publishing a Short in YouTube Studio."
            value={youtubeReelCopy}
          />
          <TextCard
            title="Facebook reel copy"
            description="Platform-specific title, description, and tags for Facebook Reels."
            usage="Use this copy for Facebook Reel captions and post metadata."
            value={facebookReelCopy}
          />
          <TextCard
            title="Instagram reel copy"
            description="Platform-specific title, description, and tags for Instagram Reels."
            usage="Use this as the Instagram caption and adjust hashtags for your audience."
            value={instagramReelCopy}
          />
          <TextCard
            title="TikTok reel copy"
            description="Platform-specific title, description, and tags for TikTok."
            usage="Use this in TikTok caption fields and trim to fit character limits if needed."
            value={tiktokReelCopy}
          />
        </div>

        {publishPreviewUrl ? (
          <Card>
            <CardHeader title="Published Preview" />
            <div className="mt-4">
              <a
                href={publishPreviewUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-brand hover:text-brand-strong"
              >
                Open Wix preview
              </a>
            </div>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
