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
import { stageStates, type StageProgress } from "@/lib/stageGating";
import { workflowStages } from "@/lib/workflow";
import { SignalRail } from "./SignalRail";


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

  // Gating lives in lib/stageGating, pure and tested. It used to be a
  // hand-rolled chain right here, and it was one strict line through all
  // thirteen stages — so the blog post was locked until a reel thumbnail
  // existed, which it has never needed. That is an order somebody had to pick
  // when modelling a fan as a queue, not a dependency.
  //
  // This component's only job now is turning what the API says into the
  // plain booleans that module reasons about.
  const progress: StageProgress = {
    source: Boolean(sourceAsset),
    trim: Boolean(sermonAsset),
    transcript: Boolean(transcriptData?.approved_at),
    titleDesc: draftSignals.titleDescReady,
    sermonThumbnail: draftSignals.sermonThumbnailReady || Boolean(sermonThumbnailAsset),
    clips: clipCandidates.length > 0,
    reel: draftSignals.reelPackageReady,
    reelThumbnail: draftSignals.reelThumbnailReady,
    blog: draftSignals.blogReady,
    textPost: draftSignals.textPostReady,
    metadata: draftSignals.metadataReady,
    published: draftSignals.publishingDone,
  };

  const stageStatus = stageStates(progress, currentStageHref);

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
