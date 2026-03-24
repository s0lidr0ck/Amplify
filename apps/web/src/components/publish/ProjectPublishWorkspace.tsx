"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { StepIntro } from "@/components/workflow/StepIntro";
import { publishing, projects, type WixImageAsset } from "@/lib/api";
import {
  loadProjectDraft,
  saveProjectDraft,
  type BlogDraft,
  type MetadataDraft,
  type PackagingDraft,
  type PublishingDraft,
} from "@/lib/projectDrafts";
import { classNames, isPreviewableImage, plainTextExcerpt, splitBlogMarkdown } from "./publishUtils";

type PublishView = "release" | "calendar" | "results";

function FieldCard({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="space-y-2 text-sm">
      <div className="flex items-end justify-between gap-3">
        <span className="font-medium text-ink">{label}</span>
        {hint ? <span className="text-xs text-muted">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

function ChecklistRow({ label, done, detail }: { label: string; done: boolean; detail: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl bg-surface/80 px-4 py-4 text-sm">
      <div className="min-w-0">
        <p className="font-medium text-ink">{label}</p>
        <p className="mt-1 text-xs leading-5 text-muted">{detail}</p>
      </div>
      <Badge tone={done ? "success" : "warning"}>{done ? "Ready" : "Missing"}</Badge>
    </div>
  );
}

function SubviewPill({ projectId, view, label, description, active }: { projectId: string; view: PublishView; label: string; description: string; active: boolean }) {
  return (
    <Link
      href={`/projects/${projectId}/publish/${view}`}
      className={classNames(
        "rounded-2xl border px-4 py-3 transition",
        active ? "border-brand/40 bg-brand/10" : "border-border/70 bg-surface/80 hover:border-brand/40 hover:bg-brand/5",
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className="mt-2 text-sm font-medium text-ink">{description}</p>
    </Link>
  );
}

function ResultCard({ label, tone, lines, href, actionLabel }: { label: string; tone: "neutral" | "brand" | "success" | "warning" | "danger" | "info"; lines: string[]; href?: string; actionLabel?: string; }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-surface/85 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink">{label}</p>
        <Badge tone={tone}>Saved</Badge>
      </div>
      <div className="mt-3 space-y-1 text-sm text-muted">
        {lines.map((line) => <p key={line}>{line}</p>)}
      </div>
      {href && actionLabel ? <a href={href} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-semibold text-brand hover:text-brand-strong">{actionLabel}</a> : null}
    </div>
  );
}

export function ProjectPublishWorkspace({ projectId, view }: { projectId: string; view: PublishView }) {
  const [form, setForm] = useState<PublishingDraft>({
    featured_image_source: "",
    featured_image_id: "",
    featured_image_url: "",
    featured_image_filename: "",
    publish_date: "",
    writer_member_id: "",
    excerpt: "",
    title_tag: "",
    meta_description: "",
    og_title: "",
    og_description: "",
    wix_result: null,
    youtube_short_result: null,
    youtube_result: null,
    facebook_post_result: null,
    facebook_reel_result: null,
    instagram_reel_result: null,
    instagram_post_result: null,
    tiktok_short_result: null,
    tiktok_photo_result: null,
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [hasMounted, setHasMounted] = useState(false);
  const [hasHydratedDraft, setHasHydratedDraft] = useState(false);

  const { data: project } = useQuery({ queryKey: ["project", projectId], queryFn: () => projects.get(projectId) });
  const { data: wixConfig } = useQuery({ queryKey: ["wix-config"], queryFn: () => publishing.getWixConfig() });
  const { data: blogDraftData } = useQuery({ queryKey: ["draft", projectId, "blog"], queryFn: () => projects.getDraft<BlogDraft>(projectId, "blog") });
  const { data: packagingDraftData } = useQuery({ queryKey: ["draft", projectId, "packaging"], queryFn: () => projects.getDraft<PackagingDraft>(projectId, "packaging") });
  const { data: metadataDraftData } = useQuery({ queryKey: ["draft", projectId, "metadata"], queryFn: () => projects.getDraft<MetadataDraft>(projectId, "metadata") });
  const { data: publishingDraftData } = useQuery({ queryKey: ["draft", projectId, "publishing"], queryFn: () => projects.getDraft<PublishingDraft>(projectId, "publishing") });
  const { data: sermonThumbnailAsset } = useQuery({ queryKey: ["sermon-thumbnail", projectId], queryFn: () => projects.getSermonThumbnailAsset(projectId) });

  const blogDraft = useMemo(() => blogDraftData?.payload ?? (hasMounted ? loadProjectDraft<BlogDraft>(projectId, "blog") : null), [blogDraftData?.payload, hasMounted, projectId]);
  const packagingDraft = useMemo(() => packagingDraftData?.payload ?? (hasMounted ? loadProjectDraft<PackagingDraft>(projectId, "packaging") : null), [hasMounted, packagingDraftData?.payload, projectId]);
  const metadataDraft = useMemo(() => metadataDraftData?.payload ?? (hasMounted ? loadProjectDraft<MetadataDraft>(projectId, "metadata") : null), [hasMounted, metadataDraftData?.payload, projectId]);
  const persistedPublishingDraft = useMemo(() => publishingDraftData?.payload ?? (hasMounted ? loadProjectDraft<PublishingDraft>(projectId, "publishing") : null), [hasMounted, projectId, publishingDraftData?.payload]);

  useEffect(() => { setHasMounted(true); }, []);

  useEffect(() => {
    if (hasHydratedDraft) return;
    setForm({
      featured_image_source: persistedPublishingDraft?.featured_image_source ?? sermonThumbnailAsset?.playback_url ?? "",
      featured_image_id: persistedPublishingDraft?.featured_image_id ?? "",
      featured_image_url: persistedPublishingDraft?.featured_image_url ?? "",
      featured_image_filename: persistedPublishingDraft?.featured_image_filename ?? "",
      publish_date: persistedPublishingDraft?.publish_date ?? project?.sermon_date ?? "",
      writer_member_id: persistedPublishingDraft?.writer_member_id ?? "",
      excerpt: persistedPublishingDraft?.excerpt ?? plainTextExcerpt(blogDraft?.markdown ?? "", 180),
      title_tag: persistedPublishingDraft?.title_tag ?? packagingDraft?.title ?? project?.title ?? "",
      meta_description: persistedPublishingDraft?.meta_description ?? packagingDraft?.description ?? "",
      og_title: persistedPublishingDraft?.og_title ?? packagingDraft?.title ?? project?.title ?? "",
      og_description: persistedPublishingDraft?.og_description ?? packagingDraft?.description ?? metadataDraft?.warnings?.[0] ?? "",
      wix_result: persistedPublishingDraft?.wix_result ?? null,
      youtube_short_result: persistedPublishingDraft?.youtube_short_result ?? null,
      youtube_result: persistedPublishingDraft?.youtube_result ?? null,
      facebook_post_result: persistedPublishingDraft?.facebook_post_result ?? null,
      facebook_reel_result: persistedPublishingDraft?.facebook_reel_result ?? null,
      instagram_reel_result: persistedPublishingDraft?.instagram_reel_result ?? null,
      instagram_post_result: persistedPublishingDraft?.instagram_post_result ?? null,
      tiktok_short_result: persistedPublishingDraft?.tiktok_short_result ?? null,
      tiktok_photo_result: persistedPublishingDraft?.tiktok_photo_result ?? null,
    });
    setHasHydratedDraft(true);
  }, [blogDraft?.markdown, hasHydratedDraft, metadataDraft?.warnings, packagingDraft?.description, packagingDraft?.title, persistedPublishingDraft, project?.sermon_date, project?.title, sermonThumbnailAsset?.playback_url]);

  useEffect(() => {
    if (!hasHydratedDraft) return;
    const timeoutId = window.setTimeout(() => {
      saveProjectDraft(projectId, "publishing", form);
      void projects.saveDraft(projectId, "publishing", form);
    }, 700);
    return () => window.clearTimeout(timeoutId);
  }, [form, hasHydratedDraft, projectId]);

  const imageUploadMutation = useMutation({
    mutationFn: (file: File) => publishing.uploadWixImage(projectId, file),
    onSuccess: async (asset: WixImageAsset) => {
      const nextForm = { ...form, featured_image_source: asset.url, featured_image_id: asset.id, featured_image_url: asset.url, featured_image_filename: asset.filename };
      setForm(nextForm);
      saveProjectDraft(projectId, "publishing", nextForm);
      await projects.saveDraft(projectId, "publishing", nextForm);
      setError("");
      setSuccess("Featured image uploaded to Wix.");
    },
    onError: (mutationError) => {
      setSuccess("");
      setError(mutationError instanceof Error ? mutationError.message : "Failed to upload image.");
    },
  });

  const publishMutation = useMutation({
    mutationFn: () => publishing.publishWixBlog(projectId, {
      blog_title: splitBlogMarkdown(blogDraft?.markdown ?? "").title || project?.title || "",
      blog_markdown: blogDraft?.markdown ?? "",
      featured_image_source: form.featured_image_source || undefined,
      featured_image_id: form.featured_image_id || undefined,
      featured_image_url: form.featured_image_url || undefined,
      publish_date: form.publish_date || undefined,
      writer_member_id: form.writer_member_id || undefined,
      excerpt: form.excerpt,
      title_tag: form.title_tag,
      meta_description: form.meta_description,
      og_title: form.og_title,
      og_description: form.og_description,
    }),
    onSuccess: async (result) => {
      const nextForm = { ...form, wix_result: result };
      setForm(nextForm);
      saveProjectDraft(projectId, "publishing", nextForm);
      await projects.saveDraft(projectId, "publishing", nextForm);
      setError("");
      setSuccess("Wix blog post published successfully.");
    },
    onError: (mutationError) => {
      setSuccess("");
      setError(mutationError instanceof Error ? mutationError.message : "Failed to publish to Wix.");
    },
  });

  const parsedBlog = splitBlogMarkdown(blogDraft?.markdown ?? "");
  const hasFeaturedImage = Boolean(form.featured_image_id.trim() || form.featured_image_source.trim());
  const seoReady = Boolean(form.title_tag.trim() && form.meta_description.trim() && form.og_title.trim() && form.og_description.trim());
  const readyCount = [wixConfig?.configured, blogDraft?.markdown?.trim(), hasFeaturedImage, seoReady].filter(Boolean).length;
  const canPublish = Boolean(wixConfig?.configured) && Boolean(blogDraft?.markdown?.trim()) && hasFeaturedImage && seoReady && !publishMutation.isPending;
  const meta = project?.speaker_display_name ? [project.speaker_display_name, project.sermon_date] : [project?.speaker || "Speaker pending"];
  const previewImage = form.featured_image_url || form.featured_image_source;

  return (
    <div className="space-y-6">
      <StepIntro
        eyebrow="Publishing"
        title={view === "release" ? `Release ${project?.title ?? "this project"}` : view === "calendar" ? `Plan ${project?.title ?? "this project"} on the release calendar` : `Track publish results for ${project?.title ?? "this project"}`}
        description={view === "release" ? "Use the release desk for the Wix article package, featured image, and SEO fields. App-level channel connections stay in the channel board." : view === "calendar" ? "Keep the project schedule in one place while the release package evolves underneath it." : "Review the publish outcomes that have already been saved for this project without mixing them into the release form."}
        meta={meta}
        action={<div className="flex flex-wrap gap-3"><Badge tone={view === "release" ? "success" : "neutral"}>Release</Badge><Badge tone={view === "calendar" ? "success" : "neutral"}>Calendar</Badge><Badge tone={view === "results" ? "success" : "neutral"}>Results</Badge></div>}
        supportingPanel={<div className="grid gap-3 lg:grid-cols-3"><SubviewPill projectId={projectId} view="release" label="Release" description="Wix article package and publish controls." active={view === "release"} /><SubviewPill projectId={projectId} view="calendar" label="Calendar" description="Plan release timing without the publish form." active={view === "calendar"} /><SubviewPill projectId={projectId} view="results" label="Results" description="Saved publish outcomes and links." active={view === "results"} /></div>}
      />

      {view === "release" ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            {error ? <Alert tone="danger">{error}</Alert> : null}
            {success ? <Alert tone="success">{success}</Alert> : null}

            <Card>
              <CardHeader eyebrow="Publish Desk" title="Core release package" description="The source snapshot, schedule, and metadata live together here." />
              <div className="mt-6 space-y-6">
                <div className="grid gap-4 rounded-[1.75rem] border border-border/70 bg-surface/65 p-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
                  <div className="space-y-4">
                    <div>
                      <p className="section-label">Source Snapshot</p>
                      <h3 className="mt-2 text-xl font-semibold text-ink">{parsedBlog.title || project?.title || "Untitled post"}</h3>
                      <p className="mt-2 text-sm leading-7 text-muted">{form.excerpt || "The excerpt will appear here once the blog draft is loaded."}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone={blogDraft?.markdown?.trim() ? "info" : "warning"}>{blogDraft?.markdown?.trim() ? "Draft loaded" : "Draft missing"}</Badge>
                      <Badge tone={form.wix_result?.post_id ? "success" : "neutral"}>{form.wix_result?.post_id ? "Published" : "Release in progress"}</Badge>
                      <Badge tone={seoReady ? "success" : "warning"}>{seoReady ? "Metadata ready" : "Metadata incomplete"}</Badge>
                    </div>
                  </div>
                  <div className="grid gap-3">
                    <div className="rounded-2xl bg-background-alt px-4 py-3 text-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Calendar lane</p>
                      <p className="mt-2 font-medium text-ink">{form.publish_date || "No publish date set"}</p>
                      <p className="mt-1 text-muted">Schedule aligns to the sermon date by default.</p>
                    </div>
                    <div className="rounded-2xl bg-background-alt px-4 py-3 text-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Destination identity</p>
                      <p className="mt-2 font-medium text-ink">{form.writer_member_id || "Uses default Wix member"}</p>
                      <p className="mt-1 text-muted">Writer identity and site connection live here until shared destination controls arrive.</p>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="section-label">Desk Fields</p>
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <FieldCard label="Blog title"><input value={parsedBlog.title || project?.title || ""} readOnly className="w-full rounded-2xl border border-border bg-background-alt px-4 py-3 text-sm text-ink outline-none" /></FieldCard>
                    <FieldCard label="Publish date" hint="Auto-filled from the sermon date"><input type="date" value={form.publish_date} onChange={(event) => setForm((current) => ({ ...current, publish_date: event.target.value }))} className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand" /></FieldCard>
                    <FieldCard label="Writer"><input value={form.writer_member_id} onChange={(event) => setForm((current) => ({ ...current, writer_member_id: event.target.value }))} className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand" placeholder="Wix member ID" /></FieldCard>
                    <FieldCard label="Excerpt" hint={`${form.excerpt.length} chars`}><textarea value={form.excerpt} onChange={(event) => setForm((current) => ({ ...current, excerpt: event.target.value }))} className="min-h-[8rem] w-full rounded-[1.5rem] border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand" placeholder="Short summary used for the Wix post excerpt." /></FieldCard>
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader eyebrow="Distribution Package" title="Search and social metadata" description="This grouped section holds the outbound metadata bundle." />
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <FieldCard label="Title tag" hint={form.title_tag.trim() ? `${form.title_tag.length} chars` : "Required"}><input value={form.title_tag} onChange={(event) => setForm((current) => ({ ...current, title_tag: event.target.value }))} className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand" /></FieldCard>
                <FieldCard label="Meta description" hint={form.meta_description.trim() ? `${form.meta_description.length} chars` : "Required"}><textarea value={form.meta_description} onChange={(event) => setForm((current) => ({ ...current, meta_description: event.target.value }))} className="min-h-[8rem] w-full rounded-[1.5rem] border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand" /></FieldCard>
                <FieldCard label="og:title" hint={form.og_title.trim() ? "Ready" : "Required"}><input value={form.og_title} onChange={(event) => setForm((current) => ({ ...current, og_title: event.target.value }))} className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand" /></FieldCard>
                <FieldCard label="og:description" hint={form.og_description.trim() ? "Ready" : "Required"}><textarea value={form.og_description} onChange={(event) => setForm((current) => ({ ...current, og_description: event.target.value }))} className="min-h-[8rem] w-full rounded-[1.5rem] border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand" /></FieldCard>
              </div>
            </Card>

            <Card>
              <CardHeader eyebrow="Featured Asset" title="Hero image for the live post" description="The sermon thumbnail auto-loads here, but you can replace it before publishing." />
              <div className="mt-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink">Featured image source</p>
                    <p className="mt-1 text-sm text-muted">{form.featured_image_id ? `Current Wix image: ${form.featured_image_filename || form.featured_image_id}` : form.featured_image_source ? "Using the auto-loaded sermon thumbnail until you replace it." : "Add or upload a featured image before publishing."}</p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:border-brand">
                    <input type="file" accept="image/*" className="hidden" onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      imageUploadMutation.mutate(file);
                      event.currentTarget.value = "";
                    }} />
                    {imageUploadMutation.isPending ? "Uploading to Wix..." : "Replace image"}
                  </label>
                </div>

                {previewImage && isPreviewableImage(previewImage) ? (
                  <img src={previewImage} alt={parsedBlog.title || project?.title || "Featured image"} className="h-64 w-full rounded-[1.75rem] border border-border object-cover" />
                ) : (
                  <div className="rounded-[1.75rem] border border-dashed border-border bg-surface px-4 py-8 text-sm text-muted">
                    No image preview is available yet, but the sermon thumbnail or manual source will still be used if present.
                  </div>
                )}

                <FieldCard label="Image source fallback">
                  <input
                    value={form.featured_image_source}
                    onChange={(event) => {
                      const value = event.target.value;
                      setForm((current) => ({
                        ...current,
                        featured_image_source: value,
                        featured_image_id: "",
                        featured_image_filename: "",
                        featured_image_url: isPreviewableImage(value) ? value : current.featured_image_url,
                      }));
                    }}
                    className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                    placeholder="Auto-filled from the sermon thumbnail, or enter a local path / image URL"
                  />
                </FieldCard>

                <div className="flex flex-wrap gap-3">
                  <Button variant="success" size="sm" onClick={() => publishMutation.mutate()} disabled={!canPublish}>{publishMutation.isPending ? "Publishing..." : "Publish to Wix"}</Button>
                </div>
              </div>
            </Card>
          </div>

          <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
            <Card className="bg-[linear-gradient(160deg,rgba(255,255,255,0.99),rgba(255,246,240,0.96))]">
              <CardHeader eyebrow="Release Rail" title="Readiness and history" description="Keep the project release state grouped together." />
              <div className="mt-6 space-y-3">
                <ChecklistRow label="Wix connection" done={Boolean(wixConfig?.configured)} detail="The publishing API and site credentials are available." />
                <ChecklistRow label="Blog draft" done={Boolean(blogDraft?.markdown?.trim())} detail="The generated blog post exists and can be sent to Wix." />
                <ChecklistRow label="Featured image" done={hasFeaturedImage} detail="A hero image is selected for the outbound post." />
                <ChecklistRow label="SEO fields" done={seoReady} detail="Title tag, meta description, og:title, and og:description are all filled." />
              </div>

              <div className="mt-6 rounded-[1.5rem] bg-surface/85 p-4 text-sm text-muted">
                <p className="font-medium text-ink">Ready to ship: {readyCount}/4</p>
                <p className="mt-2 leading-6">Publishing stays disabled until Wix is connected, the blog draft is loaded, an image is chosen, and the SEO package is complete.</p>
              </div>
              <div className="mt-6 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-tint px-4 py-3"><span className="text-muted">Connection</span><span className="font-medium text-ink">{wixConfig?.configured ? "Connected" : "Configuration needed"}</span></div>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-tint px-4 py-3"><span className="text-muted">Writer</span><span className="font-medium text-ink">{form.writer_member_id || "Uses default Wix member"}</span></div>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-tint px-4 py-3"><span className="text-muted">Live site</span><span className="font-medium text-ink">{wixConfig?.site_id ? "Configured" : "Not configured"}</span></div>
              </div>

              <div className="mt-6 rounded-[1.5rem] border border-border/70 bg-surface/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">History lane</p>
                {form.wix_result?.post_id ? (
                  <div className="mt-3 space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-tint px-4 py-3"><span className="text-muted">Post ID</span><span className="font-medium text-ink">{form.wix_result.post_id}</span></div>
                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-tint px-4 py-3"><span className="text-muted">Published</span><span className="font-medium text-ink">{form.wix_result.published_at}</span></div>
                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-tint px-4 py-3"><span className="text-muted">Status</span><span className="font-medium text-ink">{form.wix_result.status}</span></div>
                    {form.wix_result.preview_url ? <a href={form.wix_result.preview_url} target="_blank" rel="noreferrer" className="inline-flex text-sm font-semibold text-brand hover:text-brand-strong">Open published post</a> : null}
                  </div>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-muted">No Wix publish result has been saved for this project yet.</p>
                )}
              </div>
            </Card>
          </aside>
        </div>
      ) : null}

      {view === "calendar" ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <Card>
              <CardHeader eyebrow="Calendar" title="Plan the release without the publish form" description="This view keeps only the timing and handoff details that belong on a schedule surface." />
              <div className="mt-6 grid gap-4 lg:grid-cols-3">
                <div className="rounded-[1.5rem] border border-border/70 bg-surface/85 p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Publish date</p><p className="mt-2 text-lg font-semibold text-ink">{form.publish_date || project?.sermon_date || "Not scheduled"}</p></div>
                <div className="rounded-[1.5rem] border border-border/70 bg-surface/85 p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Writer</p><p className="mt-2 text-lg font-semibold text-ink">{form.writer_member_id || "Default Wix member"}</p></div>
                <div className="rounded-[1.5rem] border border-border/70 bg-surface/85 p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Readiness</p><p className="mt-2 text-lg font-semibold text-ink">{readyCount}/4 ready</p></div>
              </div>
            </Card>
            <Card>
              <CardHeader eyebrow="Timing Path" title="Release milestones" description="A simple schedule lane is enough for now." />
              <div className="mt-6 space-y-3">
                <ChecklistRow label="Blog draft locked" done={Boolean(blogDraft?.markdown?.trim())} detail="The generated blog draft is present and ready for release packaging." />
                <ChecklistRow label="Featured image selected" done={hasFeaturedImage} detail="The hero image will travel with the publish package." />
                <ChecklistRow label="SEO package complete" done={seoReady} detail="Title tag, meta description, og:title, and og:description are all filled." />
                <ChecklistRow label="Wix connection ready" done={Boolean(wixConfig?.configured)} detail="The publish desk can hand off to Wix when the date arrives." />
              </div>
            </Card>
          </div>
          <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
            <Card>
              <CardHeader eyebrow="Quick links" title="Jump to other publish views" description="Move between the focused pages without reopening the full release desk." />
              <div className="mt-6 space-y-3">
                <SubviewPill projectId={projectId} view="release" label="Release" description="Back to the full Wix release package." active={false} />
                <SubviewPill projectId={projectId} view="results" label="Results" description="See saved publish outcomes." active={false} />
              </div>
            </Card>
          </aside>
        </div>
      ) : null}

      {view === "results" ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <Card>
              <CardHeader eyebrow="Results" title="Saved publish outcomes" description="These cards summarize every publish result written back to the project draft." />
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                {form.wix_result ? <ResultCard label="Wix article" tone="success" lines={[form.wix_result.title, `Published at ${form.wix_result.published_at}`]} href={form.wix_result.preview_url} actionLabel="Open published post" /> : null}
                {form.youtube_result ? <ResultCard label="YouTube sermon" tone="info" lines={[form.youtube_result.title, form.youtube_result.channel_title]} href={form.youtube_result.watch_url} actionLabel="Open video" /> : null}
                {form.youtube_short_result ? <ResultCard label="YouTube Short" tone="info" lines={[form.youtube_short_result.title, form.youtube_short_result.channel_title]} href={form.youtube_short_result.watch_url} actionLabel="Open short" /> : null}
                {form.facebook_post_result ? <ResultCard label="Facebook text post" tone="success" lines={[form.facebook_post_result.message]} href={form.facebook_post_result.post_url} actionLabel="Open post" /> : null}
                {form.facebook_reel_result ? <ResultCard label="Facebook reel" tone="success" lines={[form.facebook_reel_result.title || "Untitled reel"]} href={form.facebook_reel_result.post_url} actionLabel="Open reel" /> : null}
                {form.instagram_post_result ? <ResultCard label="Instagram image post" tone="info" lines={[form.instagram_post_result.caption]} href={form.instagram_post_result.permalink} actionLabel="Open post" /> : null}
                {form.instagram_reel_result ? <ResultCard label="Instagram reel" tone="info" lines={[form.instagram_reel_result.caption]} href={form.instagram_reel_result.permalink} actionLabel="Open reel" /> : null}
                {form.tiktok_short_result ? <ResultCard label="TikTok short" tone="brand" lines={[form.tiktok_short_result.title, `Privacy ${form.tiktok_short_result.privacy_level}`]} /> : null}
                {form.tiktok_photo_result ? <ResultCard label="TikTok photo post" tone="brand" lines={[form.tiktok_photo_result.title, `Privacy ${form.tiktok_photo_result.privacy_level}`]} /> : null}
              </div>
            </Card>
          </div>
          <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
            <Card>
              <CardHeader eyebrow="Results Summary" title="What’s already saved" description="These records live in the project draft, so we can review them without regenerating." />
              <div className="mt-6 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-tint px-4 py-3"><span className="text-muted">Wix result</span><span className="font-medium text-ink">{form.wix_result?.post_id ? "Saved" : "None"}</span></div>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-tint px-4 py-3"><span className="text-muted">YouTube sermon</span><span className="font-medium text-ink">{form.youtube_result?.video_id ? "Saved" : "None"}</span></div>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-tint px-4 py-3"><span className="text-muted">YouTube short</span><span className="font-medium text-ink">{form.youtube_short_result?.video_id ? "Saved" : "None"}</span></div>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-tint px-4 py-3"><span className="text-muted">Facebook</span><span className="font-medium text-ink">{form.facebook_post_result?.post_id || form.facebook_reel_result?.video_id ? "Saved" : "None"}</span></div>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-tint px-4 py-3"><span className="text-muted">Instagram</span><span className="font-medium text-ink">{form.instagram_post_result?.media_id || form.instagram_reel_result?.media_id ? "Saved" : "None"}</span></div>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-tint px-4 py-3"><span className="text-muted">TikTok</span><span className="font-medium text-ink">{form.tiktok_short_result?.publish_id || form.tiktok_photo_result?.publish_id ? "Saved" : "None"}</span></div>
              </div>
            </Card>
          </aside>
        </div>
      ) : null}

      <Alert tone="info">Release is focused on the project-level publish package only. App-level channel settings stay in the main publishing setup.</Alert>
    </div>
  );
}
