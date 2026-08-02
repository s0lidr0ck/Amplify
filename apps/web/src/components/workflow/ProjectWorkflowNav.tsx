"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
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
import { SignalRail } from "./SignalRail";

type StepState = "done" | "now" | "ready" | "locked";

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
    "title-desc":
      titleDescDone
        ? "done"
        : currentStageHref === "title-desc"
          ? "now"
          : transcriptDone
            ? "ready"
            : "locked",
    "sermon-thumbnail":
      sermonThumbnailDone
        ? "done"
        : currentStageHref === "sermon-thumbnail"
          ? "now"
          : titleDescDone
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
    blog: blogDone ? "done" : currentStageHref === "blog" ? "now" : reelThumbnailDone ? "ready" : "locked",
    "text-post":
      textPostDone
        ? "done"
        : currentStageHref === "text-post"
          ? "now"
          : blogDone
            ? "ready"
            : "locked",
    metadata:
      metadataDone ? "done" : currentStageHref === "metadata" ? "now" : textPostDone ? "ready" : "locked",
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

  // The state computation above is unchanged; only what it renders is.
  //
  // What was here: a "Workspace Map" card holding three category panels, each
  // listing its stages with a sentence of description apiece — roughly a
  // screen of reading before the operator could pick where to go. The
  // blueprint's own words for what this should be instead are "a studio, a
  // release desk, a monitoring console", and none of those explain themselves
  // every time you look at them.
  return <SignalRail projectId={projectId} stageStatus={stageStatus} />;
}
