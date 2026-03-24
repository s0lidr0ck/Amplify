"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { GenerateModePanel } from "@/components/generate/GenerateModePanel";

type StudioSection = {
  id: string;
  label: string;
  href: string;
  tone: "neutral" | "brand" | "success" | "warning" | "danger" | "info";
  status: string;
  detail: string;
  next: string;
  metrics: string[];
  ctaLabel: string;
};

function sectionTone(ready: boolean, active: boolean) {
  if (ready) return "success" as const;
  if (active) return "info" as const;
  return "warning" as const;
}

export function GenerateStudioLanding({ projectId }: { projectId: string }) {
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

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projects.get(projectId),
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
      sermonThumbnailReady: Boolean(packagingDraft?.thumbnail_prompts?.length || sermonThumbnailAsset),
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

  const sections = useMemo<StudioSection[]>(() => {
    const clipsReady = clipCandidates.length > 0;
    const visualsReady = draftSignals.sermonThumbnailReady || draftSignals.reelThumbnailReady;
    const copyReady = draftSignals.titleDescReady || draftSignals.textPostReady || draftSignals.reelPackageReady;
    const blogReady = draftSignals.blogReady;
    const metadataReady = draftSignals.metadataReady;

    return [
      {
        id: "clips",
        label: "Clips",
        href: `/projects/${projectId}/clips`,
        tone: sectionTone(clipsReady, Boolean(transcriptData?.approved_at)),
        status: clipsReady ? "Ready for review" : transcriptData?.approved_at ? "Needs generation" : "Blocked",
        detail: clipsReady
          ? "Candidate moments are ranked and ready for editorial trimming."
          : transcriptData?.approved_at
            ? "Generate the candidate set so Clip Lab has something to shape."
            : "Transcript approval still blocks clip analysis.",
        next: clipsReady ? "Tighten the strongest moments and promote finalists." : "Run clip analysis from Clip Lab.",
        metrics: [
          `${clipCandidates.length} candidates`,
          transcriptData?.approved_at ? "Transcript approved" : "Transcript pending",
        ],
        ctaLabel: clipsReady ? "Open Clip Lab" : "Generate Clips",
      },
      {
        id: "visuals",
        label: "Visuals",
        href: `/projects/${projectId}/visuals`,
        tone: sectionTone(visualsReady, draftSignals.sermonThumbnailReady || draftSignals.reelPackageReady),
        status: visualsReady ? "Assets present" : "Needs work",
        detail: visualsReady
          ? "Sermon and reel visual assets are ready to compare."
          : "The package still needs cover art and thumbnail direction.",
        next: visualsReady ? "Review the visual set and lock finalists." : "Generate prompts and upload covers.",
        metrics: [
          draftSignals.sermonThumbnailReady ? "Sermon cover ready" : "Sermon cover pending",
          draftSignals.reelThumbnailReady ? "Reel cover ready" : "Reel cover pending",
        ],
        ctaLabel: "Open Visual Review",
      },
      {
        id: "copy",
        label: "Copy",
        href: `/projects/${projectId}/text`,
        tone: sectionTone(copyReady, draftSignals.reelPackageReady || draftSignals.titleDescReady),
        status: copyReady ? "Drafts available" : "Needs generation",
        detail: copyReady
          ? "Titles, descriptions, captions, and text posts can be reviewed together."
          : "The copy package is still thin across key surfaces.",
        next: copyReady ? "Polish the text package side by side." : "Start with title, description, and social drafts.",
        metrics: [
          draftSignals.titleDescReady ? "Title + description ready" : "Title + description pending",
          draftSignals.textPostReady ? "Text post ready" : "Text post pending",
        ],
        ctaLabel: "Open Copy Review",
      },
      {
        id: "blog",
        label: "Blog",
        href: `/projects/${projectId}/blog`,
        tone: sectionTone(blogReady, Boolean(transcriptData?.approved_at)),
        status: blogReady ? "Draft ready" : "Needs generation",
        detail: blogReady
          ? "The long-form article is available for refinement."
          : "The blog draft is not ready yet.",
        next: blogReady ? "Refine the article and publish excerpt." : "Generate the long-form draft.",
        metrics: [
          blogReady ? "Markdown saved" : "No markdown saved",
          draftSignals.publishingReady ? "Publish package moving" : "Not yet in publish prep",
        ],
        ctaLabel: "Open Blog Draft",
      },
      {
        id: "metadata",
        label: "Metadata",
        href: `/projects/${projectId}/metadata`,
        tone: sectionTone(metadataReady, Boolean(transcriptData?.approved_at)),
        status: metadataReady ? "Structured" : "Needs extraction",
        detail: metadataReady
          ? "Structured fields are ready for downstream publishing."
          : "Metadata extraction still needs a final pass.",
        next: metadataReady ? "Validate warnings and downstream fields." : "Extract structured metadata.",
        metrics: [
          metadataReady ? "Metadata ready" : "Metadata pending",
          draftSignals.publishingDone ? "Already published" : "Feeds publishing",
        ],
        ctaLabel: "Open Metadata",
      },
    ];
  }, [clipCandidates.length, draftSignals, projectId, transcriptData?.approved_at]);

  const readyCount = sections.filter((section) => section.tone === "success").length;
  const pendingCount = sections.length - readyCount;
  const blockedCount = sections.filter((section) => section.status === "Blocked").length;
  const recommendedSection =
    sections.find((section) => section.tone === "warning" || section.tone === "info") ?? sections[0];
  const studioSections = sections.filter((section) => ["clips", "visuals", "copy"].includes(section.id));
  const deliverableSections = sections.filter((section) => ["blog", "metadata"].includes(section.id));
  const reelSection: StudioSection = {
    id: "reel",
    label: "Reel",
    href: `/projects/${projectId}/reel`,
    tone: sectionTone(draftSignals.reelPackageReady, Boolean(reelAsset)),
    status: draftSignals.reelPackageReady ? "Package moving" : reelAsset ? "Needs packaging" : "Awaiting final reel",
    detail: draftSignals.reelPackageReady
      ? "The final reel has caption and platform copy support in place."
      : reelAsset
        ? "The final edit is uploaded, but the caption and platform package still need work."
        : "Upload the locked reel so deliverable packaging can start.",
    next: draftSignals.reelPackageReady ? "Polish the platform package and export-ready caption." : "Open the reel desk and finish the delivery package.",
    metrics: [
      reelAsset ? "Final reel uploaded" : "Final reel pending",
      draftSignals.reelPackageReady ? "Platform copy started" : "Platform copy pending",
    ],
    ctaLabel: "Open Reel Desk",
  };

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden p-0">
        <div className="border-b border-border/80 px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="section-label">Generate</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-semibold text-ink">Move through Studio and Deliverables from one Generate hub.</h2>
                <Badge tone="brand">{project?.speaker_display_name ?? project?.speaker ?? "Speaker pending"}</Badge>
              </div>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
                Start in the denser Studio surfaces, then hand the strongest work into the deliverable package without bouncing through a flat route list.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <LinkButton href={recommendedSection.href} size="sm">
                {recommendedSection.ctaLabel}
              </LinkButton>
              <LinkButton href={`/projects/${projectId}/publishing`} variant="secondary" size="sm">
                Release Desk
              </LinkButton>
            </div>
          </div>

          {!transcriptData?.approved_at ? (
            <div className="mt-4 rounded-[1.15rem] border border-warning/25 bg-warning-soft/70 px-4 py-4">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">Transcript still gates most generation work</p>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    Finish the ingest flow first so Generate can build clips, copy, blog, and metadata from a stable transcript.
                  </p>
                </div>
                <LinkButton href={`/projects/${projectId}/transcript`} variant="secondary" size="sm">
                  Open Transcript
                </LinkButton>
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))]">
            <div className="rounded-[1.15rem] border border-border/80 bg-surface px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Ready</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-2xl font-semibold text-ink">{readyCount}/5</p>
                <span className="h-2.5 w-2.5 rounded-full bg-success" />
              </div>
              <p className="mt-1 text-sm text-muted">asset families usable now</p>
            </div>
            <div className="rounded-[1.15rem] border border-border/80 bg-surface px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Pending</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-2xl font-semibold text-ink">{pendingCount}</p>
                <span className={`h-2.5 w-2.5 rounded-full ${pendingCount > 0 ? "bg-warning" : "bg-muted/40"}`} />
              </div>
              <p className="mt-1 text-sm text-muted">families still need work</p>
            </div>
            <div className="rounded-[1.15rem] border border-border/80 bg-surface px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Clip Queue</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-2xl font-semibold text-ink">{clipCandidates.length}</p>
                <span className={`h-2.5 w-2.5 rounded-full ${clipCandidates.length > 0 ? "bg-brand" : "bg-warning"}`} />
              </div>
              <p className="mt-1 text-sm text-muted">ranked moments available</p>
            </div>
            <div className="rounded-[1.15rem] border border-border/80 bg-surface px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Publish</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-2xl font-semibold text-ink">{draftSignals.publishingReady ? "Advancing" : "Not ready"}</p>
                <span className={`h-2.5 w-2.5 rounded-full ${draftSignals.publishingReady ? "bg-success" : "bg-muted/40"}`} />
              </div>
              <p className="mt-1 text-sm text-muted">
                {draftSignals.publishingDone ? "already shipped once" : "release package state"}
              </p>
            </div>
          </div>
        </div>

        <div className="divide-y divide-border/80">
          <div className="grid gap-4 px-5 py-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <div className="rounded-[1.2rem] border border-brand/15 bg-brand-soft/60 px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-semibold text-ink">{recommendedSection.label}</p>
                <Badge tone={recommendedSection.tone}>{recommendedSection.status}</Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted">{recommendedSection.detail}</p>
              <p className="mt-3 text-sm font-medium text-ink">{recommendedSection.next}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <div className="rounded-[1.15rem] border border-border/80 bg-surface px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">Transcript</p>
                  <Badge tone={transcriptData?.approved_at ? "success" : "warning"}>
                    {transcriptData?.approved_at ? "Ready" : "Blocking"}
                  </Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {transcriptData?.approved_at ? "Generate can operate on a stable transcript." : "Approve ingest transcript first."}
                </p>
              </div>
              <div className="rounded-[1.15rem] border border-border/80 bg-surface px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">Clip artifacts</p>
                  <Badge tone={clipCandidates.length > 0 ? "success" : "warning"}>
                    {clipCandidates.length > 0 ? "Present" : "Missing"}
                  </Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {clipCandidates.length > 0 ? "Clip Lab already has ranked moments." : "Clip analysis has not been run yet."}
                </p>
              </div>
              <div className="rounded-[1.15rem] border border-border/80 bg-surface px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">Publish handoff</p>
                  <Badge tone={draftSignals.publishingReady ? "success" : "neutral"}>
                    {draftSignals.publishingReady ? "Advancing" : "Waiting"}
                  </Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {draftSignals.publishingReady
                    ? "Core fields are filled in and the package can move toward release."
                    : "Generate still needs article and metadata work before Publish becomes primary."}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-5 px-5 py-5">
            <GenerateModePanel
              eyebrow="Studio"
              title="Shape the core media package."
              description="These surfaces stay close to the source material so clips, visuals, and copy can be reviewed together before anything gets handed off."
              summary={`${studioSections.filter((section) => section.tone === "success").length}/${studioSections.length} studio areas are immediately usable.`}
              links={studioSections.map((section) => ({
                label: section.label,
                detail: section.next,
                href: section.href,
                state: section.status,
                tone: section.tone,
                ctaLabel: section.ctaLabel,
              }))}
            />

            <GenerateModePanel
              eyebrow="Deliverables"
              title="Package the publishable outputs."
              description="Once the studio work is stable, move into the long-form, structured, and final reel deliverables that feed Publishing and release prep."
              summary={`${[...deliverableSections, reelSection].filter((section) => section.tone === "success").length}/3 deliverables are in a ready state.`}
              links={[...deliverableSections, reelSection].map((section) => ({
                label: section.label,
                detail: section.next,
                href: section.href,
                state: section.status,
                tone: section.tone,
                ctaLabel: section.ctaLabel,
              }))}
            />
          </div>
        </div>
      </Card>

      {blockedCount > 0 ? (
        <div className="rounded-[1.2rem] border border-warning/25 bg-warning-soft/55 px-4 py-4 text-sm text-muted">
          <span className="font-semibold text-ink">{blockedCount} blocked area{blockedCount === 1 ? "" : "s"}.</span>{" "}
          The main blocker is still ingest readiness, so the workspace should route attention there before asking for more generation work.
        </div>
      ) : null}
    </div>
  );
}
