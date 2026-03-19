"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { projects, transcript } from "@/lib/api";
import type {
  BlogDraft,
  FacebookDraft,
  MetadataDraft,
  PackagingDraft,
  ReelDraft,
  ReelPlatformDraft,
} from "@/lib/projectDrafts";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { StepIntro } from "@/components/workflow/StepIntro";

type CopyKey =
  | "sermon-transcript"
  | "reel-transcript"
  | "metadata-raw"
  | "metadata-json"
  | "blog"
  | "packaging-title"
  | "packaging-description"
  | "facebook-post"
  | "reel-caption"
  | "platform-youtube"
  | "platform-facebook"
  | "platform-instagram"
  | "platform-tiktok";

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "";
  }
}

function formatBlock(value: string) {
  return value.trim() || "No text available yet.";
}

function buildPlatformCopy(label: string, draft: ReelPlatformDraft | undefined) {
  if (!draft) return "";
  return [
    `${label} Title: ${draft.title || ""}`.trimEnd(),
    "",
    `${label} Description:`,
    draft.description || "",
    "",
    `${label} Tags:`,
    draft.tags?.length ? draft.tags.join(", ") : "None",
  ]
    .join("\n")
    .trim();
}

function CopyCard({
  title,
  value,
  copyKey,
  copiedKey,
  onCopy,
  badge,
  className = "",
}: {
  title: string;
  value: string;
  copyKey: CopyKey;
  copiedKey: string | null;
  onCopy: (key: CopyKey, value: string) => Promise<void>;
  badge?: string;
  className?: string;
}) {
  const hasValue = Boolean(value.trim());

  return (
    <Card className={className}>
      <CardHeader
        title={title}
        action={
          <div className="flex items-center gap-3">
            {badge ? <Badge tone={hasValue ? "success" : "neutral"}>{badge}</Badge> : null}
            <Button type="button" variant="secondary" onClick={() => void onCopy(copyKey, value)} disabled={!hasValue}>
              {copiedKey === copyKey ? "Copied" : "Copy"}
            </Button>
          </div>
        }
      />

      <textarea
        readOnly
        value={formatBlock(value)}
        className="mt-6 min-h-[18rem] w-full rounded-[1.5rem] border border-border bg-surface px-5 py-4 text-sm leading-7 text-ink outline-none"
      />
    </Card>
  );
}

export default function TextAssetsPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projects.get(projectId),
  });

  const { data: sermonTranscript } = useQuery({
    queryKey: ["transcript", projectId, "sermon"],
    queryFn: () => transcript.getForProject(projectId, "sermon"),
  });

  const { data: reelTranscript } = useQuery({
    queryKey: ["transcript", projectId, "reel"],
    queryFn: () => transcript.getForProject(projectId, "reel"),
  });

  const { data: metadataDraft } = useQuery({
    queryKey: ["project-draft", projectId, "metadata"],
    queryFn: () => projects.getDraft<MetadataDraft>(projectId, "metadata"),
  });

  const { data: blogDraft } = useQuery({
    queryKey: ["project-draft", projectId, "blog"],
    queryFn: () => projects.getDraft<BlogDraft>(projectId, "blog"),
  });

  const { data: packagingDraft } = useQuery({
    queryKey: ["project-draft", projectId, "packaging"],
    queryFn: () => projects.getDraft<PackagingDraft>(projectId, "packaging"),
  });

  const { data: facebookDraft } = useQuery({
    queryKey: ["project-draft", projectId, "facebook"],
    queryFn: () => projects.getDraft<FacebookDraft>(projectId, "facebook"),
  });

  const { data: reelDraft } = useQuery({
    queryKey: ["project-draft", projectId, "reel"],
    queryFn: () => projects.getDraft<ReelDraft>(projectId, "reel"),
  });

  const sermonTranscriptText = sermonTranscript?.cleaned_text || sermonTranscript?.raw_text || "";
  const reelTranscriptText = reelTranscript?.cleaned_text || reelTranscript?.raw_text || "";
  const metadataRaw = metadataDraft?.payload?.raw || "";
  const metadataJson = prettyJson(metadataDraft?.payload?.metadata);
  const blogMarkdown = blogDraft?.payload?.markdown || "";
  const packagingTitle = packagingDraft?.payload?.title || "";
  const packagingDescription = packagingDraft?.payload?.description || "";
  const facebookPost = facebookDraft?.payload?.post || "";
  const reelCaption = reelDraft?.payload?.caption || "";

  const platformBlocks = useMemo(
    () => ({
      youtube: buildPlatformCopy("YouTube", reelDraft?.payload?.platforms?.youtube),
      facebook: buildPlatformCopy("Facebook", reelDraft?.payload?.platforms?.facebook),
      instagram: buildPlatformCopy("Instagram", reelDraft?.payload?.platforms?.instagram),
      tiktok: buildPlatformCopy("TikTok", reelDraft?.payload?.platforms?.tiktok),
    }),
    [reelDraft]
  );

  const availableCount = [
    sermonTranscriptText,
    reelTranscriptText,
    metadataRaw || metadataJson,
    blogMarkdown,
    packagingTitle || packagingDescription,
    facebookPost,
    reelCaption,
    platformBlocks.youtube,
    platformBlocks.facebook,
    platformBlocks.instagram,
    platformBlocks.tiktok,
  ].filter((value) => value.trim()).length;

  useEffect(() => {
    if (!copiedKey) return undefined;
    const timeoutId = window.setTimeout(() => setCopiedKey(null), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [copiedKey]);

  async function copyText(key: CopyKey, value: string) {
    if (!value.trim()) return;
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
  }

  return (
    <div className="space-y-6">
      <StepIntro
        eyebrow="Text Assets"
        title={`Review the written package for ${project?.title ?? "this sermon"}.`}
        description="See transcripts, metadata, long-form drafts, and reel copy together in one text-first handoff view."
        statusItems={[
          {
            label: "Speaker",
            value: project?.speaker_display_name ?? project?.speaker ?? "Pending",
            tone: project?.speaker_display_name || project?.speaker ? "brand" : "warning",
          },
          {
            label: "Available sections",
            value: `${availableCount} ready`,
            tone: availableCount > 0 ? "success" : "neutral",
          },
          {
            label: "Reel package",
            value: reelCaption || reelTranscriptText ? "Present" : "Pending",
            tone: reelCaption || reelTranscriptText ? "info" : "warning",
          },
        ]}
      />

      {availableCount === 0 ? (
        <Alert tone="warning" title="No text assets yet">
          Generate the transcript and content drafts first, then this page will become the central copy review surface.
        </Alert>
      ) : null}

      <div className="grid gap-6 2xl:grid-cols-2">
        <CopyCard
          title="Sermon transcript"
          value={sermonTranscriptText}
          copyKey="sermon-transcript"
          copiedKey={copiedKey}
          onCopy={copyText}
          badge={sermonTranscript ? sermonTranscript.status || "Ready" : "Missing"}
        />
        <CopyCard
          title="Reel transcript"
          value={reelTranscriptText}
          copyKey="reel-transcript"
          copiedKey={copiedKey}
          onCopy={copyText}
          badge={reelTranscript ? reelTranscript.status || "Ready" : "Missing"}
        />
        <CopyCard
          title="Metadata raw output"
          value={metadataRaw}
          copyKey="metadata-raw"
          copiedKey={copiedKey}
          onCopy={copyText}
          badge={metadataRaw ? "Generated" : "Missing"}
        />
        <CopyCard
          title="Metadata JSON"
          value={metadataJson === "{}" ? "" : metadataJson}
          copyKey="metadata-json"
          copiedKey={copiedKey}
          onCopy={copyText}
          badge={metadataJson !== "{}" ? "Structured" : "Missing"}
        />
        <CopyCard
          title="Blog post"
          value={blogMarkdown}
          copyKey="blog"
          copiedKey={copiedKey}
          onCopy={copyText}
          badge={blogMarkdown ? "Generated" : "Missing"}
          className="2xl:col-span-2"
        />
      </div>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Card>
          <CardHeader title="Title & description" />
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-ink">Title</p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void copyText("packaging-title", packagingTitle)}
                  disabled={!packagingTitle.trim()}
                >
                  {copiedKey === "packaging-title" ? "Copied" : "Copy"}
                </Button>
              </div>
              <textarea
                readOnly
                value={formatBlock(packagingTitle)}
                className="min-h-[12rem] w-full rounded-[1.5rem] border border-border bg-surface px-5 py-4 text-sm leading-7 text-ink outline-none"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-ink">Description</p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void copyText("packaging-description", packagingDescription)}
                  disabled={!packagingDescription.trim()}
                >
                  {copiedKey === "packaging-description" ? "Copied" : "Copy"}
                </Button>
              </div>
              <textarea
                readOnly
                value={formatBlock(packagingDescription)}
                className="min-h-[12rem] w-full rounded-[1.5rem] border border-border bg-surface px-5 py-4 text-sm leading-7 text-ink outline-none"
              />
            </div>
          </div>
        </Card>

        <CopyCard
          title="Text post"
          value={facebookPost}
          copyKey="facebook-post"
          copiedKey={copiedKey}
          onCopy={copyText}
          badge={facebookPost ? "Generated" : "Missing"}
        />
      </div>

      <div className="grid gap-6">
        <CopyCard
          title="Reel caption"
          value={reelCaption}
          copyKey="reel-caption"
          copiedKey={copiedKey}
          onCopy={copyText}
          badge={reelCaption ? "Generated" : "Missing"}
        />

        <div className="grid gap-6 2xl:grid-cols-2">
          <CopyCard
            title="YouTube reel copy"
            value={platformBlocks.youtube}
            copyKey="platform-youtube"
            copiedKey={copiedKey}
            onCopy={copyText}
            badge={platformBlocks.youtube ? "Ready" : "Missing"}
          />
          <CopyCard
            title="Facebook reel copy"
            value={platformBlocks.facebook}
            copyKey="platform-facebook"
            copiedKey={copiedKey}
            onCopy={copyText}
            badge={platformBlocks.facebook ? "Ready" : "Missing"}
          />
          <CopyCard
            title="Instagram reel copy"
            value={platformBlocks.instagram}
            copyKey="platform-instagram"
            copiedKey={copiedKey}
            onCopy={copyText}
            badge={platformBlocks.instagram ? "Ready" : "Missing"}
          />
          <CopyCard
            title="TikTok reel copy"
            value={platformBlocks.tiktok}
            copyKey="platform-tiktok"
            copiedKey={copiedKey}
            onCopy={copyText}
            badge={platformBlocks.tiktok ? "Ready" : "Missing"}
          />
        </div>
      </div>
    </div>
  );
}
