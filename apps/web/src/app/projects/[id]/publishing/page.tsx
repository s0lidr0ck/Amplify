"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { publishing, publishingWorkspace, projects, type ProjectAsset, type WixImageAsset } from "@/lib/api";
import { loadProjectDraft, saveProjectDraft, type BlogDraft, type PublishingDraft } from "@/lib/projectDrafts";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { StepIntro } from "@/components/workflow/StepIntro";

function cleanTitleLine(line: string): string {
  return line.replace(/^\s{0,3}#{1,6}\s*/, "").replace(/\*\*/g, "").trim();
}

function splitBlogMarkdown(markdown: string): { title: string; body: string } {
  const normalized = (markdown || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return { title: "", body: "" };
  const [firstLine = "", ...rest] = normalized.split("\n");
  return {
    title: cleanTitleLine(firstLine),
    body: rest.join("\n").replace(/^\s+/, ""),
  };
}

function plainTextExcerpt(markdown: string, maxLength = 180): string {
  const text = (markdown || "")
    .replace(/!\[[^\]]*\]\(([^)]+)\)/g, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/[`#>*_\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function deriveFeaturedImage(assets: Array<ProjectAsset | null | undefined>): string {
  return assets.find((asset) => asset?.playback_url)?.playback_url ?? "";
}

function isPreviewableImage(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export default function PublishingPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const [sendToWorkspaceError, setSendToWorkspaceError] = useState("");

  const sendToWorkspaceMutation = useMutation({
    mutationFn: () => publishingWorkspace.createBundleFromProject(projectId),
    onSuccess: (bundle) => {
      router.push(`/publishing/bundles/${bundle.id}`);
    },
    onError: (err) => {
      setSendToWorkspaceError(err instanceof Error ? err.message : "Failed to create bundle.");
    },
  });

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
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [hasHydratedDraft, setHasHydratedDraft] = useState(false);

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projects.get(projectId),
  });

  const { data: wixConfig } = useQuery({
    queryKey: ["wix-config"],
    queryFn: () => publishing.getWixConfig(),
  });

  const { data: persistedPublishingDraft } = useQuery({
    queryKey: ["project-draft", projectId, "publishing"],
    queryFn: () => projects.getDraft<PublishingDraft>(projectId, "publishing"),
  });

  const { data: persistedBlogDraft } = useQuery({
    queryKey: ["project-draft", projectId, "blog"],
    queryFn: () => projects.getDraft<BlogDraft>(projectId, "blog"),
  });

  const { data: sermonThumbnailAsset } = useQuery({
    queryKey: ["sermon-thumbnail-asset", projectId],
    queryFn: () => projects.getSermonThumbnailAsset(projectId),
  });

  const { data: reelThumbnailAsset } = useQuery({
    queryKey: ["reel-thumbnail-asset", projectId],
    queryFn: () => projects.getReelThumbnailAsset(projectId),
  });

  const blogDraft = useMemo(() => {
    const persisted = persistedBlogDraft?.payload ?? loadProjectDraft<BlogDraft>(projectId, "blog");
    return persisted ?? null;
  }, [persistedBlogDraft, projectId]);

  const publishMutation = useMutation({
    mutationFn: () =>
      publishing.publishWixBlog(projectId, {
        blog_title: splitBlogMarkdown(blogDraft?.markdown ?? "").title || project?.title || "",
        blog_markdown: blogDraft?.markdown ?? "",
        featured_image_source: form.featured_image_source,
        featured_image_id: form.featured_image_id,
        featured_image_url: form.featured_image_url,
        publish_date: form.publish_date,
        writer_member_id: form.writer_member_id,
        excerpt: form.excerpt,
        title_tag: form.title_tag,
        meta_description: form.meta_description,
        og_title: form.og_title,
        og_description: form.og_description,
      }),
    onSuccess: async (result) => {
      const nextDraft: PublishingDraft = { ...form, wix_result: result };
      setForm(nextDraft);
      saveProjectDraft(projectId, "publishing", nextDraft);
      await projects.saveDraft(projectId, "publishing", nextDraft);
      setError("");
      setSuccess("Wix blog post published successfully.");
    },
    onError: (mutationError) => {
      setSuccess("");
      setError(mutationError instanceof Error ? mutationError.message : "Failed to publish to Wix.");
    },
  });

  const imageUploadMutation = useMutation({
    mutationFn: (file: File) => publishing.uploadWixImage(projectId, file),
    onSuccess: (asset: WixImageAsset) => {
      setForm((current) => ({
        ...current,
        featured_image_id: asset.id,
        featured_image_url: asset.url,
        featured_image_source: asset.url || current.featured_image_source,
        featured_image_filename: asset.filename,
      }));
      setError("");
      setSuccess("Featured image uploaded to Wix Media.");
    },
    onError: (mutationError) => {
      setSuccess("");
      setError(mutationError instanceof Error ? mutationError.message : "Failed to upload image to Wix.");
    },
  });

  useEffect(() => {
    if (hasHydratedDraft) return;

    const persisted = persistedPublishingDraft?.payload ?? loadProjectDraft<PublishingDraft>(projectId, "publishing");
    const parsedBlog = splitBlogMarkdown(blogDraft?.markdown ?? "");
    const excerpt = persisted?.excerpt || plainTextExcerpt(parsedBlog.body || blogDraft?.markdown || "");
    const title = parsedBlog.title || project?.title || "";
    const defaultFeaturedImage = deriveFeaturedImage([sermonThumbnailAsset, reelThumbnailAsset]);
    const featuredImageSource = persisted?.featured_image_source || persisted?.featured_image_url || defaultFeaturedImage;
    const featuredImageUrl = persisted?.featured_image_url || defaultFeaturedImage;

    setForm({
      featured_image_source: featuredImageSource,
      featured_image_id: persisted?.featured_image_id || "",
      featured_image_url: featuredImageUrl,
      featured_image_filename: persisted?.featured_image_filename || "",
      publish_date: persisted?.publish_date || project?.sermon_date || "",
      writer_member_id: persisted?.writer_member_id || wixConfig?.default_writer_member_id || "",
      excerpt,
      title_tag: persisted?.title_tag || title,
      meta_description: persisted?.meta_description || excerpt,
      og_title: persisted?.og_title || title,
      og_description: persisted?.og_description || excerpt,
      wix_result: persisted?.wix_result ?? null,
    });
    setHasHydratedDraft(true);
  }, [
    blogDraft,
    hasHydratedDraft,
    persistedPublishingDraft,
    project?.sermon_date,
    project?.title,
    projectId,
    reelThumbnailAsset,
    sermonThumbnailAsset,
    wixConfig?.default_writer_member_id,
  ]);

  useEffect(() => {
    if (!hasHydratedDraft) return;
    const timeoutId = window.setTimeout(() => {
      saveProjectDraft(projectId, "publishing", form);
      void projects.saveDraft(projectId, "publishing", form);
    }, 700);
    return () => window.clearTimeout(timeoutId);
  }, [form, hasHydratedDraft, projectId]);

  const parsedBlog = splitBlogMarkdown(blogDraft?.markdown ?? "");
  const published = Boolean(form.wix_result?.post_id);
  const featuredImagePreview = form.featured_image_url || form.featured_image_source;
  const hasFeaturedImage = Boolean(form.featured_image_id.trim() || form.featured_image_source.trim());
  const destinationLabel = wixConfig?.configured ? "Connected" : "Configuration needed";

  return (
    <div className="space-y-6">
      <StepIntro
        eyebrow="Publishing"
        title={`Publish ${project?.title ?? "this post"} directly to Wix.`}
        description="Use the saved blog draft as the source article, start with the sermon thumbnail as the featured image, and replace it only if you want a different hero image on the live Wix post."
        statusItems={[
          {
            label: "Wix config",
            value: wixConfig?.configured ? "Ready" : "Missing",
            tone: wixConfig?.configured ? "success" : "warning",
          },
          {
            label: "Blog draft",
            value: blogDraft?.markdown?.trim() ? "Loaded" : "Missing",
            tone: blogDraft?.markdown?.trim() ? "info" : "warning",
          },
          {
            label: "Featured image",
            value: form.featured_image_id ? "Uploaded to Wix" : hasFeaturedImage ? "Ready" : "Missing",
            tone: hasFeaturedImage ? "success" : "warning",
          },
          {
            label: "Publish status",
            value: published ? "Published" : "Not published",
            tone: published ? "success" : "neutral",
          },
        ]}
        action={
          <Button
            variant="success"
            onClick={() => publishMutation.mutate()}
            disabled={
              publishMutation.isPending ||
              imageUploadMutation.isPending ||
              !wixConfig?.configured ||
              !blogDraft?.markdown?.trim() ||
              !hasFeaturedImage ||
              !form.excerpt.trim() ||
              !form.title_tag.trim() ||
              !form.meta_description.trim()
            }
          >
            {publishMutation.isPending ? "Publishing..." : "Publish to Wix"}
          </Button>
        }
      />

      <Card>
        <CardHeader
          eyebrow="Destination"
          title="Wix Blog"
          description="This step is the outbound publishing console for Wix. Review the post settings, confirm the SEO package, then publish the saved blog draft to your live site."
        />
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-surface-tint px-4 py-3 text-sm text-muted">
            <div className="font-medium text-ink">Connection</div>
            <div className="mt-1">{destinationLabel}</div>
          </div>
          <div className="rounded-2xl bg-surface-tint px-4 py-3 text-sm text-muted">
            <div className="font-medium text-ink">Writer</div>
            <div className="mt-1">{form.writer_member_id || "Uses default Wix member"}</div>
          </div>
          <div className="rounded-2xl bg-surface-tint px-4 py-3 text-sm text-muted">
            <div className="font-medium text-ink">Live Site</div>
            <div className="mt-1">{wixConfig?.site_id ? "Configured via Wix site credentials" : "Not configured yet"}</div>
          </div>
        </div>
      </Card>

      {!wixConfig?.configured ? (
        <Alert tone="warning" title="Wix config is incomplete">
          The API needs `WIX_API_BASE`, `WIX_SITE_ID`, `WIX_BLOG_MEMBER_ID`, and `WIX_BEARER_TOKEN` loaded before this step can publish.
        </Alert>
      ) : null}

      {!blogDraft?.markdown?.trim() ? (
        <Alert tone="warning" title="Blog draft required">
          Generate and save the Blog Post first so Publishing has article content to send to Wix.
        </Alert>
      ) : null}

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {success ? <Alert tone="success">{success}</Alert> : null}

      <Card>
        <CardHeader
          eyebrow="Post Settings"
          title="Wix post setup"
          description="The saved blog draft is the source article. The sermon thumbnail auto-loads as the featured image, and you can replace it by uploading a different file to Wix."
        />
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <label className="space-y-2 text-sm lg:col-span-2">
            <span className="font-medium text-ink">Blog title</span>
            <input
              value={parsedBlog.title || project?.title || ""}
              readOnly
              className="w-full rounded-2xl border border-border bg-background-alt px-4 py-3 text-sm text-ink outline-none"
            />
          </label>

          <div className="space-y-3 lg:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-ink">Featured Image</span>
              <label className="inline-flex cursor-pointer items-center rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:border-brand">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    imageUploadMutation.mutate(file);
                    event.currentTarget.value = "";
                  }}
                />
                {imageUploadMutation.isPending ? "Uploading to Wix..." : "Replace image"}
              </label>
            </div>

            {featuredImagePreview && isPreviewableImage(featuredImagePreview) ? (
              <img
                src={featuredImagePreview}
                alt={parsedBlog.title || project?.title || "Featured image"}
                className="h-56 w-full rounded-[1.75rem] border border-border object-cover"
              />
            ) : (
              <div className="rounded-[1.75rem] border border-dashed border-border bg-surface px-4 py-6 text-sm text-muted">
                No image preview is available yet, but the sermon thumbnail or manual source will still be used if present.
              </div>
            )}

            <div className="rounded-[1.5rem] bg-surface-tint px-4 py-3 text-sm text-muted">
              {form.featured_image_id ? (
                <span>Current Wix image: {form.featured_image_filename || form.featured_image_id}</span>
              ) : form.featured_image_source ? (
                <span>Using the auto-loaded sermon thumbnail until you replace it.</span>
              ) : (
                <span>Add or upload a featured image before publishing.</span>
              )}
            </div>

            <label className="space-y-2 text-sm">
              <span className="font-medium text-ink">Image source fallback</span>
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
            </label>
          </div>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-ink">Publish Date</span>
            <input
              type="date"
              value={form.publish_date}
              onChange={(event) => setForm((current) => ({ ...current, publish_date: event.target.value }))}
              className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-ink">Writer</span>
            <input
              value={form.writer_member_id}
              onChange={(event) => setForm((current) => ({ ...current, writer_member_id: event.target.value }))}
              className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
              placeholder="Wix member ID"
            />
          </label>
          <label className="space-y-2 text-sm lg:col-span-2">
            <span className="font-medium text-ink">Excerpt</span>
            <textarea
              value={form.excerpt}
              onChange={(event) => setForm((current) => ({ ...current, excerpt: event.target.value }))}
              className="min-h-[8rem] w-full rounded-[1.5rem] border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
              placeholder="Short summary used for the Wix post excerpt."
            />
          </label>
        </div>
      </Card>

      <Card>
        <CardHeader
          eyebrow="SEO"
          title="Settings & SEO"
          description="These values are sent with the post so the live page has the required search and social metadata package."
        />
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="font-medium text-ink">Title Tag</span>
            <input
              value={form.title_tag}
              onChange={(event) => setForm((current) => ({ ...current, title_tag: event.target.value }))}
              className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-ink">Meta Description</span>
            <textarea
              value={form.meta_description}
              onChange={(event) => setForm((current) => ({ ...current, meta_description: event.target.value }))}
              className="min-h-[8rem] w-full rounded-[1.5rem] border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-ink">og:title</span>
            <input
              value={form.og_title}
              onChange={(event) => setForm((current) => ({ ...current, og_title: event.target.value }))}
              className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-ink">og:description</span>
            <textarea
              value={form.og_description}
              onChange={(event) => setForm((current) => ({ ...current, og_description: event.target.value }))}
              className="min-h-[8rem] w-full rounded-[1.5rem] border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
            />
          </label>
        </div>
      </Card>

      <Card>
        <CardHeader eyebrow="Result" title="Latest Wix publish result" />
        <div className="mt-6 space-y-3 text-sm text-muted">
          {form.wix_result?.post_id ? (
            <>
              <div className="flex items-center justify-between rounded-2xl bg-surface-tint px-4 py-3">
                <span>Post ID</span>
                <span className="font-medium text-ink">{form.wix_result.post_id}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-surface-tint px-4 py-3">
                <span>Status</span>
                <span className="font-medium text-ink">{form.wix_result.status}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-surface-tint px-4 py-3">
                <span>Published</span>
                <span className="font-medium text-ink">{form.wix_result.published_at}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-surface-tint px-4 py-3">
                <span>Live URL</span>
                <span className="truncate pl-4 font-medium text-ink">{form.wix_result.preview_url || "Pending lookup"}</span>
              </div>
              {form.wix_result.preview_url ? (
                <a
                  href={form.wix_result.preview_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex text-sm font-semibold text-brand hover:text-brand-strong"
                >
                  Open published post
                </a>
              ) : null}
            </>
          ) : (
            <Alert tone="info">No Wix publish result has been saved for this project yet.</Alert>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          eyebrow="Publishing Workspace"
          title="Send to Publishing Workspace"
          description="Harvest all saved content drafts into a multi-platform bundle ready for scheduling and publishing."
        />
        <div className="mt-6">
          {sendToWorkspaceError ? (
            <div className="mb-4">
              <Alert tone="danger">{sendToWorkspaceError}</Alert>
            </div>
          ) : null}
          <Button
            onClick={() => sendToWorkspaceMutation.mutate()}
            disabled={sendToWorkspaceMutation.isPending}
            variant="primary"
          >
            {sendToWorkspaceMutation.isPending ? "Creating bundle..." : "Send to Publishing Workspace"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
