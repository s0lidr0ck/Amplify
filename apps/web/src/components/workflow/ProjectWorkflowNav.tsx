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
import { workflowCategories, workflowStages } from "@/lib/workflow";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

type StepState = "done" | "now" | "ready" | "locked";
type CategoryState = "done" | "now" | "active" | "planned";

const stepStateStyles = {
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
};

const categoryStateStyles = {
  done: "border-success/25 bg-success-soft/60",
  now: "border-brand/35 bg-brand-soft/75 shadow-soft",
  active: "border-info/20 bg-info-soft/45",
  planned: "border-border/70 bg-surface/85",
};

export function ProjectWorkflowNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const currentStageHref =
    workflowStages.find((stage) => pathname?.endsWith(`/${stage.href}`))?.href ?? "source";

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
  }, [pathname, projectId, reelAsset, reelThumbnailAsset]);

  const sourceDone = Boolean(sourceAsset);
  const trimDone = Boolean(sermonAsset);
  const transcriptDone = Boolean(transcriptData?.approved_at);
  const sermonThumbnailDone = draftSignals.sermonThumbnailReady || Boolean(sermonThumbnailAsset);
  const clipsDone = clipCandidates.length > 0;
  const reelDone = draftSignals.reelPackageReady;
  const reelThumbnailDone = draftSignals.reelThumbnailReady;
  const titleDescDone = draftSignals.titleDescReady;
  const textPostDone = draftSignals.textPostReady;
  const blogDone = draftSignals.blogReady;
  const metadataDone = draftSignals.metadataReady;
  const publishingDone = draftSignals.publishingDone;

  const stageStatus: Record<string, StepState> = {
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
    analytics: currentStageHref === "analytics" ? "now" : publishingDone ? "ready" : "locked",
  };

  const categoryStatus: Record<string, CategoryState> = Object.fromEntries(
    workflowCategories.map((category) => {
      const statuses = category.stageHrefs.map((href) => stageStatus[href] ?? "locked");
      const hasCurrent = category.stageHrefs.includes(currentStageHref);
      const allDone = statuses.every((status) => status === "done");
      const anyProgress = statuses.some((status) => status === "done" || status === "ready");

      return [
        category.id,
        allDone ? "done" : hasCurrent ? "now" : anyProgress ? "active" : "planned",
      ];
    })
  ) as Record<string, CategoryState>;

  return (
    <div className="surface-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="section-label">Workspace Map</p>
          <p className="mt-1 text-sm text-muted">Navigate by product area first, then drill into the exact step.</p>
        </div>
        <Badge tone="info">{workflowCategories.length} areas</Badge>
      </div>

      <div className="space-y-4">
        {workflowCategories.map((category) => {
          const categoryStages = workflowStages.filter((stage) => category.stageHrefs.includes(stage.href));
          const currentCategory = category.stageHrefs.includes(currentStageHref);

          return (
            <div
              key={category.id}
              className={classNames(
                "rounded-[1.5rem] border p-4",
                categoryStateStyles[categoryStatus[category.id]]
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">{category.label}</p>
                    <Badge tone={currentCategory ? "brand" : categoryStatus[category.id] === "done" ? "success" : "neutral"}>
                      {currentCategory ? "Current Area" : categoryStatus[category.id] === "done" ? "Ready" : "Open"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-ink">{category.summary}</p>
                  <p className="mt-1 text-sm leading-6 text-muted">{category.description}</p>
                </div>
                <Link
                  href={`/projects/${projectId}/${category.href}`}
                  className="rounded-full border border-border/80 bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:border-brand/40 hover:text-brand-strong"
                >
                  Open {category.shortLabel}
                </Link>
              </div>

              <div className="mt-4 space-y-2">
                {categoryStages.map((stage, index) => {
                  const state = stepStateStyles[stageStatus[stage.href]];
                  return (
                    <Link
                      key={stage.href}
                      href={`/projects/${projectId}/${stage.href}`}
                      className={classNames(
                        "block rounded-2xl border px-3 py-3 transition-transform duration-200 hover:-translate-y-0.5 hover:border-brand/40",
                        state.item
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-1 flex items-center gap-3">
                          <span className={classNames("h-3 w-3 rounded-full", state.dot)} />
                          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-ink">{stage.label}</span>
                            <Badge tone={state.badge}>{state.label}</Badge>
                          </div>
                          <p className="mt-1 text-sm leading-6 text-muted">{stage.description}</p>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
