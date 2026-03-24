"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { IngestWorkspaceSummary } from "@/components/ingest/IngestWorkspaceSummary";
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
import { workflowCategories } from "@/lib/workflow";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export default function ProjectPage() {
  const params = useParams();
  const projectId = params.id as string;
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

  const { data: project, isLoading } = useQuery({
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

  const { data: transcriptData } = useQuery({
    queryKey: ["transcript", projectId],
    queryFn: () => transcript.getForProject(projectId),
  });

  const { data: clipCandidates = [] } = useQuery({
    queryKey: ["clip-candidates", projectId],
    queryFn: () => clips.listCandidates(projectId),
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

  useEffect(() => {
    const packagingDraft = loadProjectDraft<PackagingDraft>(projectId, "packaging");
    const facebookDraft = loadProjectDraft<FacebookDraft>(projectId, "facebook");
    const reelDraft = loadProjectDraft<ReelDraft>(projectId, "reel");
    const publishingDraft = loadProjectDraft<PublishingDraft>(projectId, "publishing");

    setDraftSignals({
      blogReady: Boolean(loadProjectDraft<BlogDraft>(projectId, "blog")?.markdown?.trim()),
      metadataReady: Boolean(loadProjectDraft<MetadataDraft>(projectId, "metadata")?.metadata),
      sermonThumbnailReady: Boolean(packagingDraft?.thumbnail_prompts?.length) || Boolean(sermonThumbnailAsset),
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
  }, [projectId, reelAsset, reelThumbnailAsset, sermonThumbnailAsset]);

  if (isLoading || !project) {
    return <Alert tone="info">Loading project overview.</Alert>;
  }

  const categoryCards = [
    {
      ...workflowCategories[0],
      href: `/projects/${projectId}/source`,
      tone: sourceAsset && sermonAsset && transcriptData?.approved_at ? "success" : sourceAsset ? "info" : "warning",
      status:
        sourceAsset && sermonAsset && transcriptData?.approved_at
          ? "Ready"
          : sourceAsset
            ? "In progress"
            : "Needs source",
      next:
        !sourceAsset ? "Upload the sermon source." : !sermonAsset ? "Generate the sermon master." : "Approve the transcript foundation.",
      facts: [
        `Source ${sourceAsset ? "loaded" : "missing"}`,
        `Master ${sermonAsset ? "ready" : "pending"}`,
        `Transcript ${transcriptData?.approved_at ? "approved" : "not ready"}`,
      ],
    },
    {
      ...workflowCategories[1],
      href: `/projects/${projectId}/generate`,
      tone:
        draftSignals.metadataReady && draftSignals.blogReady && draftSignals.reelPackageReady
          ? "success"
          : clipCandidates.length > 0 || draftSignals.sermonThumbnailReady
            ? "info"
            : "warning",
      status:
        draftSignals.metadataReady && draftSignals.blogReady && draftSignals.reelPackageReady
          ? "Ready"
          : clipCandidates.length > 0 || draftSignals.sermonThumbnailReady
            ? "Active"
            : "Not started",
      next:
        !clipCandidates.length
          ? "Run clip analysis and select moments."
          : !draftSignals.blogReady
            ? "Finish the blog and supporting copy."
            : "Finalize metadata and packaging.",
      facts: [
        `${clipCandidates.length} clip candidates`,
        `Blog ${draftSignals.blogReady ? "saved" : "pending"}`,
        `Metadata ${draftSignals.metadataReady ? "saved" : "pending"}`,
      ],
    },
    {
      ...workflowCategories[2],
      href: `/projects/${projectId}/publishing`,
      tone: draftSignals.publishingDone ? "success" : draftSignals.publishingReady ? "info" : "warning",
      status: draftSignals.publishingDone ? "Published" : draftSignals.publishingReady ? "Ready" : "Blocked",
      next: draftSignals.publishingDone ? "Review the live result." : "Confirm SEO, hero image, and destination settings.",
      facts: [
        `SEO ${draftSignals.publishingReady ? "assembled" : "pending"}`,
        `Blog ${draftSignals.blogReady ? "ready" : "missing"}`,
        `Live ${draftSignals.publishingDone ? "published" : "not live"}`,
      ],
    },
    {
      ...workflowCategories[3],
      href: `/projects/${projectId}/analytics`,
      tone: "brand",
      status: "New",
      next: "Use the first dashboard to shape the reporting model before the pipelines are wired in.",
      facts: ["Brand rollup", "Platform comparisons", "Per-content tracking"],
    },
  ] as const;

  const nextActionHref = !sourceAsset
    ? `/projects/${projectId}/source`
    : !sermonAsset
      ? `/projects/${projectId}/trim`
      : !transcriptData?.approved_at
        ? `/projects/${projectId}/transcript`
        : !clipCandidates.length
          ? `/projects/${projectId}/generate`
          : !draftSignals.blogReady
            ? `/projects/${projectId}/blog`
            : !draftSignals.metadataReady
              ? `/projects/${projectId}/metadata`
              : `/projects/${projectId}/publishing`;

  const nextActionLabel = !sourceAsset
    ? "Upload Source"
    : !sermonAsset
      ? "Cut Sermon Master"
      : !transcriptData?.approved_at
      ? "Review Transcript"
      : !clipCandidates.length
        ? "Open Generate Studio"
        : !draftSignals.blogReady
          ? "Write Blog Post"
            : !draftSignals.metadataReady
              ? "Generate Metadata"
              : "Open Publishing";

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(255,246,239,0.95))]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="section-label">Project Overview</p>
            <h2 className="mt-2 text-3xl font-semibold text-ink">Run the workspace by category, not by scroll depth.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
              This control center gives you one place to see where Ingest, Generate, Publish, and Analytics stand before you dive into any single page.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone="brand">{project.speaker_display_name ?? project.speaker}</Badge>
              <Badge tone="neutral">{project.sermon_date || "Date pending"}</Badge>
              <Badge tone="info">{project.status}</Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <LinkButton href={nextActionHref}>{nextActionLabel}</LinkButton>
            <LinkButton href={`/projects/${projectId}/analytics`} variant="secondary">
              Open Analytics
            </LinkButton>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.7fr)]">
        <div className="grid gap-4 md:grid-cols-2">
          {categoryCards.map((category) => (
            <Card key={category.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="section-label">{category.label}</p>
                  <h3 className="mt-2 text-xl font-semibold text-ink">{category.summary}</h3>
                </div>
                <Badge tone={category.tone}>{category.status}</Badge>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted">{category.description}</p>
              <div className="mt-4 space-y-2">
                {category.facts.map((fact) => (
                  <div key={fact} className="rounded-2xl bg-surface-tint px-4 py-3 text-sm text-muted">
                    {fact}
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-2xl bg-background-alt px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Next</p>
                <p className="mt-2 text-sm font-medium text-ink">{category.next}</p>
              </div>
              <LinkButton href={category.href} variant="secondary" className="mt-4 w-full">
                Open {category.label}
              </LinkButton>
            </Card>
          ))}
        </div>

        <div className="space-y-6">
          <IngestWorkspaceSummary
            projectId={projectId}
            sourceReady={Boolean(sourceAsset)}
            sermonReady={Boolean(sermonAsset)}
            transcriptApproved={Boolean(transcriptData?.approved_at)}
          />

          <Card>
            <CardHeader
              eyebrow="Current Signals"
              title="Cross-workspace readiness"
              description="These are the high-signal checkpoints that usually determine what can move next."
            />
            <div className="mt-6 space-y-3">
              {[
                {
                  label: "Source asset",
                  value: sourceAsset ? "Ready" : "Missing",
                  tone: sourceAsset ? ("success" as const) : ("warning" as const),
                },
                {
                  label: "Sermon master",
                  value: sermonAsset ? "Ready" : "Missing",
                  tone: sermonAsset ? ("success" as const) : ("warning" as const),
                },
                {
                  label: "Transcript",
                  value: transcriptData?.approved_at ? "Approved" : "Pending",
                  tone: transcriptData?.approved_at ? ("success" as const) : ("warning" as const),
                },
                {
                  label: "Clip candidates",
                  value: clipCandidates.length ? `${clipCandidates.length} ready` : "None yet",
                  tone: clipCandidates.length ? ("info" as const) : ("warning" as const),
                },
                {
                  label: "Blog draft",
                  value: draftSignals.blogReady ? "Saved" : "Pending",
                  tone: draftSignals.blogReady ? ("success" as const) : ("warning" as const),
                },
                {
                  label: "Publishing package",
                  value: draftSignals.publishingDone ? "Published" : draftSignals.publishingReady ? "Ready" : "Blocked",
                  tone: draftSignals.publishingDone
                    ? ("success" as const)
                    : draftSignals.publishingReady
                      ? ("info" as const)
                      : ("warning" as const),
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-2xl bg-surface-tint px-4 py-3 text-sm"
                >
                  <span className="text-muted">{item.label}</span>
                  <Badge tone={item.tone}>{item.value}</Badge>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <p className="section-label">Quick Routes</p>
            <div className="mt-4 space-y-2">
              {[
                { label: "Generate Studio", href: `/projects/${projectId}/generate`, detail: "Move from readiness into clips, visuals, and copy from one grouped workspace." },
                { label: "Generate Deliverables", href: `/projects/${projectId}/blog`, detail: "Refine the blog, metadata, and reel package as outbound deliverables." },
                { label: "Publish Desk", href: `/projects/${projectId}/publishing`, detail: "Finalize destination, SEO, release readiness, and publish controls." },
                { label: "Analytics Overview", href: `/projects/${projectId}/analytics`, detail: "Use the brand view now and expand into platform and content breakdowns next." },
              ].map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className={classNames(
                    "block rounded-2xl border border-border/80 bg-surface px-4 py-3 transition hover:border-brand/40 hover:bg-brand-soft/40"
                  )}
                >
                  <p className="text-sm font-semibold text-ink">{item.label}</p>
                  <p className="mt-1 text-sm text-muted">{item.detail}</p>
                </a>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
