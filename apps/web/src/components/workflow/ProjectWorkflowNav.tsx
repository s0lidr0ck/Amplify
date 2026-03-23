"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/Badge";
import { clips, projects, transcript } from "@/lib/api";
import {
  loadProjectDraft,
  type BlogDraft,
  type FacebookDraft,
  type MetadataDraft,
  type PackagingDraft,
  type PublishingDraft,
  type ReelDraft,
} from "@/lib/projectDrafts";
import { workflowStages } from "@/lib/workflow";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

const stateStyles = {
  done: {
    item: "border-success/30 bg-success-soft/70",
    dot: "bg-success",
    badge: "success" as const,
    label: "Done",
  },
  now: {
    item: "border-brand/40 bg-brand-soft/80 shadow-soft",
    dot: "bg-brand",
    badge: "brand" as const,
    label: "Now",
  },
  ready: {
    item: "border-info/20 bg-info-soft/50",
    dot: "bg-info",
    badge: "info" as const,
    label: "Ready",
  },
  locked: {
    item: "border-border/70 bg-surface/80",
    dot: "bg-border-strong",
    badge: "neutral" as const,
    label: "Locked",
  },
  soon: {
    item: "border-border/70 bg-surface/80 opacity-80",
    dot: "bg-border-strong",
    badge: "neutral" as const,
    label: "Soon",
  },
};

export function ProjectWorkflowNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const currentStageHref =
    workflowStages.find((stage) => pathname?.endsWith(`/${stage.href}`))?.href ?? null;

  const [draftSignals, setDraftSignals] = useState({
    blogReady: false,
    metadataReady: false,
    sermonThumbnailReady: false,
    titleDescReady: false,
    textPostReady: false,
    reelPackageReady: false,
    reelThumbnailReady: false,
    publishingReady: false,
    publishingDone: false,
  });

  const { data: sourceAsset } = useQuery({
    queryKey: ["source-asset", projectId],
    queryFn: () => projects.getSourceAsset(projectId),
  });

  const { data: sermonAsset } = useQuery({
    queryKey: ["sermon-asset", projectId],
    queryFn: () => projects.getSermonAsset(projectId),
  });

  const { data: transcriptData } = useQuery({
    queryKey: ["transcript", projectId],
    queryFn: () => transcript.getForProject(projectId),
  });

  const { data: clipCandidates = [] } = useQuery({
    queryKey: ["clip-candidates", projectId],
    queryFn: () => clips.listCandidates(projectId),
  });

  const { data: reelAsset } = useQuery({
    queryKey: ["reel-asset", projectId],
    queryFn: () => projects.getReelAsset(projectId),
  });

  const { data: sermonThumbnailAsset } = useQuery({
    queryKey: ["sermon-thumbnail-asset", projectId],
    queryFn: () => projects.getSermonThumbnailAsset(projectId),
  });

  const { data: reelThumbnailAsset } = useQuery({
    queryKey: ["reel-thumbnail-asset", projectId],
    queryFn: () => projects.getReelThumbnailAsset(projectId),
  });

  useEffect(() => {
    const packagingDraft = loadProjectDraft<PackagingDraft>(projectId, "packaging");
    const facebookDraft = loadProjectDraft<FacebookDraft>(projectId, "facebook");
    const reelDraft = loadProjectDraft<ReelDraft>(projectId, "reel");
    const publishingDraft = loadProjectDraft<PublishingDraft>(projectId, "publishing");

    setDraftSignals({
      blogReady: Boolean(loadProjectDraft<BlogDraft>(projectId, "blog")?.markdown?.trim()),
      metadataReady: Boolean(loadProjectDraft<MetadataDraft>(projectId, "metadata")?.metadata),
      sermonThumbnailReady: Boolean(packagingDraft?.thumbnail_prompts?.length),
      titleDescReady: Boolean(packagingDraft?.title?.trim() || packagingDraft?.description?.trim()),
      textPostReady: Boolean(facebookDraft?.post?.trim()),
      reelPackageReady: Boolean(
        reelDraft?.caption?.trim() ||
          reelDraft?.platforms?.youtube?.title?.trim() ||
          reelDraft?.platforms?.facebook?.title?.trim() ||
          reelAsset
      ),
      reelThumbnailReady: Boolean(reelDraft?.thumbnail_prompts?.length || reelThumbnailAsset),
      publishingReady: Boolean(
        publishingDraft?.excerpt?.trim() &&
          publishingDraft?.title_tag?.trim() &&
          publishingDraft?.meta_description?.trim() &&
          publishingDraft?.featured_image_url?.trim()
      ),
      publishingDone: Boolean(publishingDraft?.wix_result?.post_id?.trim()),
    });
  }, [pathname, projectId, reelAsset, reelThumbnailAsset, sermonThumbnailAsset]);

  const sourceDone = Boolean(sourceAsset);
  const trimDone = Boolean(sermonAsset);
  const transcriptDone = Boolean(transcriptData?.approved_at);
  const sermonThumbnailDone = draftSignals.sermonThumbnailReady || Boolean(sermonThumbnailAsset);
  const clipsDone = clipCandidates.length > 0;
  const reelDone = draftSignals.reelPackageReady;
  const reelThumbnailDone = draftSignals.reelThumbnailReady;
  const titleDescDone = draftSignals.titleDescReady;
  const publishingDone = draftSignals.publishingDone;
  const textPostDone = draftSignals.textPostReady;
  const blogDone = draftSignals.blogReady;
  const metadataDone = draftSignals.metadataReady;

  const stageStatus = {
    source: sourceDone ? "done" : currentStageHref === "source" ? "now" : "ready",
    trim: trimDone ? "done" : currentStageHref === "trim" ? "now" : sourceDone ? "ready" : "locked",
    transcript:
      transcriptDone ? "done" : currentStageHref === "transcript" ? "now" : trimDone ? "ready" : "locked",
    "sermon-thumbnail":
      sermonThumbnailDone
        ? "done"
        : currentStageHref === "sermon-thumbnail"
          ? "now"
          : transcriptDone
            ? "ready"
            : "locked",
    clips:
      clipsDone
        ? "done"
        : currentStageHref === "clips"
          ? "now"
          : sermonThumbnailDone
            ? "ready"
            : "locked",
    reel: reelDone ? "done" : currentStageHref === "reel" ? "now" : clipsDone ? "ready" : "locked",
    "reel-thumbnail":
      reelThumbnailDone
        ? "done"
        : currentStageHref === "reel-thumbnail"
          ? "now"
          : reelDone
            ? "ready"
            : "locked",
    "title-desc":
      titleDescDone
        ? "done"
        : currentStageHref === "title-desc"
          ? "now"
          : reelThumbnailDone
            ? "ready"
            : "locked",
    "text-post":
      textPostDone
        ? "done"
        : currentStageHref === "text-post"
          ? "now"
          : titleDescDone
            ? "ready"
            : "locked",
    blog: blogDone ? "done" : currentStageHref === "blog" ? "now" : textPostDone ? "ready" : "locked",
    metadata:
      metadataDone ? "done" : currentStageHref === "metadata" ? "now" : blogDone ? "ready" : "locked",
    publishing:
      publishingDone
        ? "done"
        : currentStageHref === "publishing"
          ? "now"
          : metadataDone || draftSignals.publishingReady
            ? "ready"
            : "locked",
  } as const;

  return (
    <div className="surface-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="section-label">Workflow</p>
          <p className="mt-1 text-sm text-muted">Move one stage at a time and keep the sermon package flowing.</p>
        </div>
        <Badge tone="info">{workflowStages.length} stages</Badge>
      </div>

      <nav className="space-y-2 sm:space-y-3">
        {workflowStages.map((stage, index) => {
          const state = stage.disabled ? "soon" : stageStatus[stage.href as keyof typeof stageStatus];
          const href = `/projects/${projectId}/${stage.href}`;

          const content = (
            <>
              <div className="flex items-start gap-3">
                <div className="mt-1 flex items-center gap-3">
                  <span className={classNames("h-3 w-3 rounded-full", stateStyles[state].dot)} />
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{stage.label}</span>
                    <Badge tone={stateStyles[state].badge}>{stateStyles[state].label}</Badge>
                  </div>
                </div>
              </div>
            </>
          );

          if (stage.disabled) {
            return (
              <div
                key={stage.href}
                aria-disabled="true"
                className={classNames("block cursor-not-allowed rounded-2xl border px-3 py-3 sm:px-4", stateStyles[state].item)}
              >
                {content}
              </div>
            );
          }

          return (
            <Link
              key={stage.href}
              href={href}
              className={classNames(
                "block rounded-2xl border px-3 py-3 transition-transform duration-200 hover:-translate-y-0.5 hover:border-brand/40 sm:px-4",
                stateStyles[state].item
              )}
            >
              {content}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

