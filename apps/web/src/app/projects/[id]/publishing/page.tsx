"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { publishing, projects, type ProjectAsset, type PublishMetricsSyncResponse, type PublishRecommendation, type PublishingChannel, type WixImageAsset } from "@/lib/api";
import {
  loadProjectDraft,
  saveProjectDraft,
  type BlogDraft,
  type FacebookDraft,
  type MetadataDraft,
  type PackagingDraft,
  type PublishingDraft,
  type ReelDraft,
} from "@/lib/projectDrafts";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
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

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  wix: "Wix",
};

function formatRecommendationTime(value: string) {
  const date = new Date(value);
  return date.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function confidenceTone(level: "low" | "medium" | "high"): "warning" | "info" | "success" {
  if (level === "high") return "success";
  if (level === "medium") return "info";
  return "warning";
}
function FieldCard({
  label,
  hint,
  children,
  wide = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={classNames("space-y-2 text-sm", wide && "lg:col-span-2")}>
      <div className="flex items-end justify-between gap-3">
        <span className="font-medium text-ink">{label}</span>
        {hint ? <span className="text-xs text-muted">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

function MiniMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "brand" | "success" | "warning" | "danger" | "info";
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-surface/80 px-4 py-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{label}</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink">{value}</p>
        <Badge tone={tone}>{tone === "success" ? "Ready" : tone === "warning" ? "Check" : value}</Badge>
      </div>
    </div>
  );
}

function ChecklistRow({
  label,
  done,
  detail,
}: {
  label: string;
  done: boolean;
  detail: string;
}) {
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

function ModeChip({
  label,
  description,
  active = false,
}: {
  label: string;
  description: string;
  active?: boolean;
}) {
  return (
    <div
      className={classNames(
        "rounded-2xl border px-4 py-3",
        active ? "border-brand/40 bg-brand/10" : "border-border/70 bg-surface/70",
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className="mt-2 text-sm font-medium text-ink">{description}</p>
    </div>
  );
}

function ViewSwitch({
  activeView,
  onChange,
}: {
  activeView: "channels" | "release";
  onChange: (view: "channels" | "release") => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant={activeView === "channels" ? "success" : "secondary"} size="sm" onClick={() => onChange("channels")}>
        Channels
      </Button>
      <Button variant={activeView === "release" ? "success" : "secondary"} size="sm" onClick={() => onChange("release")}>
        Release Desk
      </Button>
    </div>
  );
}

function ChannelCard({
  channel,
  readyCount,
  totalCount,
}: {
  channel: PublishingChannel;
  readyCount: number;
  totalCount: number;
}) {
  return (
    <div className="rounded-[1.5rem] border border-border/70 bg-surface/85 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="section-label">{channel.label}</p>
          <p className="mt-2 text-lg font-semibold text-ink">{channel.kind}</p>
        </div>
        <Badge tone={channel.configured ? "success" : "warning"}>{channel.connection_status}</Badge>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted">{channel.summary}</p>
      <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-background-alt px-4 py-3 text-sm">
        <span className="text-muted">Payload readiness</span>
        <span className="font-semibold text-ink">
          {readyCount}/{totalCount}
        </span>
      </div>
      {!channel.configured ? (
        <div className="mt-4 rounded-2xl bg-warning-soft/60 px-4 py-3 text-xs leading-5 text-muted">
          Needs: {channel.requirements.join(", ")}
        </div>
      ) : null}
    </div>
  );
}

function TargetReadinessRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "brand" | "success" | "warning" | "danger" | "info";
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 text-sm">
      <span className="text-muted">{label}</span>
      <Badge tone={tone}>{value}</Badge>
    </div>
  );
}

export default function PublishingPage() {
  const params = useParams();
  const projectId = params.id as string;
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<"channels" | "release">("channels");
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
  const [youtubeError, setYoutubeError] = useState("");
  const [youtubeSuccess, setYoutubeSuccess] = useState("");
  const [facebookError, setFacebookError] = useState("");
  const [facebookSuccess, setFacebookSuccess] = useState("");
  const [instagramError, setInstagramError] = useState("");
  const [instagramSuccess, setInstagramSuccess] = useState("");
  const [tiktokError, setTikTokError] = useState("");
  const [tiktokSuccess, setTikTokSuccess] = useState("");
  const [metricsSyncError, setMetricsSyncError] = useState("");
  const [metricsSyncSuccess, setMetricsSyncSuccess] = useState("");
  const [metricsSyncDetails, setMetricsSyncDetails] = useState<PublishMetricsSyncResponse | null>(null);
  const [showSyncDetails, setShowSyncDetails] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [hasHydratedDraft, setHasHydratedDraft] = useState(false);

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projects.get(projectId),
  });

  const { data: wixConfig } = useQuery({
    queryKey: ["wix-config"],
    queryFn: () => publishing.getWixConfig(),
  });

  const { data: channels = [] } = useQuery({
    queryKey: ["publishing-channels"],
    queryFn: () => publishing.getChannels(),
  });
  const { data: recommendationsData, isLoading: recommendationsLoading } = useQuery({
    queryKey: ["publish-recommendations", projectId],
    queryFn: () => publishing.getRecommendations(projectId),
    enabled: Boolean(projectId),
  });

  const { data: youtubeConfig } = useQuery({
    queryKey: ["youtube-config"],
    queryFn: () => publishing.getYoutubeConfig(),
  });

  const { data: tiktokConfig } = useQuery({
    queryKey: ["tiktok-config"],
    queryFn: () => publishing.getTikTokConfig(),
  });

  const { data: persistedPublishingDraft } = useQuery({
    queryKey: ["project-draft", projectId, "publishing"],
    queryFn: () => projects.getDraft<PublishingDraft>(projectId, "publishing"),
  });

  const { data: persistedBlogDraft } = useQuery({
    queryKey: ["project-draft", projectId, "blog"],
    queryFn: () => projects.getDraft<BlogDraft>(projectId, "blog"),
  });

  const { data: persistedPackagingDraft } = useQuery({
    queryKey: ["project-draft", projectId, "packaging"],
    queryFn: () => projects.getDraft<PackagingDraft>(projectId, "packaging"),
  });

  const { data: persistedMetadataDraft } = useQuery({
    queryKey: ["project-draft", projectId, "metadata"],
    queryFn: () => projects.getDraft<MetadataDraft>(projectId, "metadata"),
  });

  const { data: persistedFacebookDraft } = useQuery({
    queryKey: ["project-draft", projectId, "facebook"],
    queryFn: () => projects.getDraft<FacebookDraft>(projectId, "facebook"),
  });

  const { data: persistedReelDraft } = useQuery({
    queryKey: ["project-draft", projectId, "reel"],
    queryFn: () => projects.getDraft<ReelDraft>(projectId, "reel"),
  });

  const { data: sermonThumbnailAsset } = useQuery({
    queryKey: ["sermon-thumbnail-asset", projectId],
    queryFn: () => projects.getSermonThumbnailAsset(projectId),
  });

  const { data: reelThumbnailAsset } = useQuery({
    queryKey: ["reel-thumbnail-asset", projectId],
    queryFn: () => projects.getReelThumbnailAsset(projectId),
  });

  const { data: sermonAsset } = useQuery({
    queryKey: ["sermon-asset", projectId],
    queryFn: () => projects.getSermonAsset(projectId),
  });

  const { data: reelAsset } = useQuery({
    queryKey: ["reel-asset", projectId],
    queryFn: () => projects.getReelAsset(projectId),
  });

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const blogDraft = useMemo(() => {
    const persisted = persistedBlogDraft?.payload ?? (hasMounted ? loadProjectDraft<BlogDraft>(projectId, "blog") : null);
    return persisted ?? null;
  }, [hasMounted, persistedBlogDraft, projectId]);

  const packagingDraft = useMemo(() => {
    const persisted =
      persistedPackagingDraft?.payload ?? (hasMounted ? loadProjectDraft<PackagingDraft>(projectId, "packaging") : null);
    return persisted ?? null;
  }, [hasMounted, persistedPackagingDraft, projectId]);

  const metadataDraft = useMemo(() => {
    const persisted =
      persistedMetadataDraft?.payload ?? (hasMounted ? loadProjectDraft<MetadataDraft>(projectId, "metadata") : null);
    return persisted ?? null;
  }, [hasMounted, persistedMetadataDraft, projectId]);

  const facebookDraft = useMemo(() => {
    const persisted =
      persistedFacebookDraft?.payload ?? (hasMounted ? loadProjectDraft<FacebookDraft>(projectId, "facebook") : null);
    return persisted ?? null;
  }, [hasMounted, persistedFacebookDraft, projectId]);

  const reelDraft = useMemo(() => {
    const persisted = persistedReelDraft?.payload ?? (hasMounted ? loadProjectDraft<ReelDraft>(projectId, "reel") : null);
    return persisted ?? null;
  }, [hasMounted, persistedReelDraft, projectId]);

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

  const youtubePublishMutation = useMutation({
    mutationFn: () =>
      publishing.publishYoutubeVideo(projectId, {
        title: packagingDraft?.title?.trim() || project?.title || "",
        description: packagingDraft?.description?.trim() || form.excerpt || "",
        tags: Array.isArray(metadataDraft?.metadata?.keywords)
          ? metadataDraft.metadata.keywords
              .map((tag) => String(tag).trim())
              .filter(Boolean)
          : [],
        privacy_status: "private",
      }),
    onSuccess: async (result) => {
      const nextDraft: PublishingDraft = { ...form, youtube_result: result };
      setForm(nextDraft);
      saveProjectDraft(projectId, "publishing", nextDraft);
      await projects.saveDraft(projectId, "publishing", nextDraft);
      setYoutubeError("");
      setYoutubeSuccess(`YouTube video uploaded successfully as ${result.title}.`);
    },
    onError: (mutationError) => {
      setYoutubeSuccess("");
      setYoutubeError(mutationError instanceof Error ? mutationError.message : "Failed to publish to YouTube.");
    },
  });

  const youtubeShortPublishMutation = useMutation({
    mutationFn: () =>
      publishing.publishYoutubeShort(projectId, {
        title: reelDraft?.platforms?.youtube?.title?.trim() || project?.title || "",
        description: reelDraft?.platforms?.youtube?.description?.trim() || "",
        tags: reelDraft?.platforms?.youtube?.tags ?? [],
        privacy_status: "private",
      }),
    onSuccess: async (result) => {
      const nextDraft: PublishingDraft = { ...form, youtube_short_result: result };
      setForm(nextDraft);
      saveProjectDraft(projectId, "publishing", nextDraft);
      await projects.saveDraft(projectId, "publishing", nextDraft);
      setYoutubeError("");
      setYoutubeSuccess(`YouTube Short uploaded successfully as ${result.title}.`);
    },
    onError: (mutationError) => {
      setYoutubeSuccess("");
      setYoutubeError(mutationError instanceof Error ? mutationError.message : "Failed to publish the YouTube Short.");
    },
  });

  const facebookPostPublishMutation = useMutation({
    mutationFn: () =>
      publishing.publishFacebookPost(projectId, {
        message: facebookDraft?.post?.trim() || "",
      }),
    onSuccess: async (result) => {
      const nextDraft: PublishingDraft = { ...form, facebook_post_result: result };
      setForm(nextDraft);
      saveProjectDraft(projectId, "publishing", nextDraft);
      await projects.saveDraft(projectId, "publishing", nextDraft);
      setFacebookError("");
      setFacebookSuccess("Facebook text post published successfully.");
    },
    onError: (mutationError) => {
      setFacebookSuccess("");
      setFacebookError(mutationError instanceof Error ? mutationError.message : "Failed to publish to Facebook.");
    },
  });

  const facebookReelPublishMutation = useMutation({
    mutationFn: () =>
      publishing.publishFacebookReel(projectId, {
        title: reelDraft?.platforms?.facebook?.title?.trim() || project?.title || "",
        description: reelDraft?.platforms?.facebook?.description?.trim() || "",
      }),
    onSuccess: async (result) => {
      const nextDraft: PublishingDraft = { ...form, facebook_reel_result: result };
      setForm(nextDraft);
      saveProjectDraft(projectId, "publishing", nextDraft);
      await projects.saveDraft(projectId, "publishing", nextDraft);
      setFacebookError("");
      setFacebookSuccess(`Facebook reel published successfully as ${result.title || "Untitled reel"}.`);
    },
    onError: (mutationError) => {
      setFacebookSuccess("");
      setFacebookError(mutationError instanceof Error ? mutationError.message : "Failed to publish the Facebook reel.");
    },
  });

  const instagramReelPublishMutation = useMutation({
    mutationFn: () =>
      publishing.publishInstagramReel(projectId, {
        caption: reelDraft?.platforms?.instagram?.description?.trim() || "",
      }),
    onSuccess: async (result) => {
      const nextDraft: PublishingDraft = { ...form, instagram_reel_result: result };
      setForm(nextDraft);
      saveProjectDraft(projectId, "publishing", nextDraft);
      await projects.saveDraft(projectId, "publishing", nextDraft);
      setInstagramError("");
      setInstagramSuccess("Instagram reel published successfully.");
    },
    onError: (mutationError) => {
      setInstagramSuccess("");
      setInstagramError(mutationError instanceof Error ? mutationError.message : "Failed to publish to Instagram.");
    },
  });

  const instagramPostPublishMutation = useMutation({
    mutationFn: () =>
      publishing.publishInstagramPost(projectId, {
        caption: reelDraft?.platforms?.instagram?.description?.trim() || packagingDraft?.description?.trim() || project?.title || "",
      }),
    onSuccess: async (result) => {
      const nextDraft: PublishingDraft = { ...form, instagram_post_result: result };
      setForm(nextDraft);
      saveProjectDraft(projectId, "publishing", nextDraft);
      await projects.saveDraft(projectId, "publishing", nextDraft);
      setInstagramError("");
      setInstagramSuccess("Instagram image post published successfully.");
    },
    onError: (mutationError) => {
      setInstagramSuccess("");
      setInstagramError(mutationError instanceof Error ? mutationError.message : "Failed to publish the Instagram image post.");
    },
  });

  const tiktokShortPublishMutation = useMutation({
    mutationFn: () =>
      publishing.publishTikTokShort(projectId, {
        title: reelDraft?.platforms?.tiktok?.title?.trim() || project?.title || "",
        description: reelDraft?.platforms?.tiktok?.description?.trim() || "",
      }),
    onSuccess: async (result) => {
      const nextDraft: PublishingDraft = { ...form, tiktok_short_result: result };
      setForm(nextDraft);
      saveProjectDraft(projectId, "publishing", nextDraft);
      await projects.saveDraft(projectId, "publishing", nextDraft);
      setTikTokError("");
      setTikTokSuccess(`TikTok short submitted successfully with publish id ${result.publish_id}.`);
    },
    onError: (mutationError) => {
      setTikTokSuccess("");
      setTikTokError(mutationError instanceof Error ? mutationError.message : "Failed to publish to TikTok.");
    },
  });

  const tiktokPhotoPublishMutation = useMutation({
    mutationFn: () =>
      publishing.publishTikTokPhoto(projectId, {
        title: reelDraft?.platforms?.tiktok?.title?.trim() || project?.title || "",
        description: reelDraft?.platforms?.tiktok?.description?.trim() || "",
      }),
    onSuccess: async (result) => {
      const nextDraft: PublishingDraft = { ...form, tiktok_photo_result: result };
      setForm(nextDraft);
      saveProjectDraft(projectId, "publishing", nextDraft);
      await projects.saveDraft(projectId, "publishing", nextDraft);
      setTikTokError("");
      setTikTokSuccess(`TikTok photo post submitted successfully with publish id ${result.publish_id}.`);
    },
    onError: (mutationError) => {
      setTikTokSuccess("");
      setTikTokError(mutationError instanceof Error ? mutationError.message : "Failed to publish the TikTok photo post.");
    },
  });

  useEffect(() => {
    if (hasHydratedDraft || !hasMounted) return;

    const persisted =
      persistedPublishingDraft?.payload ?? (hasMounted ? loadProjectDraft<PublishingDraft>(projectId, "publishing") : null);
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
      youtube_short_result: persisted?.youtube_short_result ?? null,
      youtube_result: persisted?.youtube_result ?? null,
      facebook_post_result: persisted?.facebook_post_result ?? null,
      facebook_reel_result: persisted?.facebook_reel_result ?? null,
      instagram_reel_result: persisted?.instagram_reel_result ?? null,
      instagram_post_result: persisted?.instagram_post_result ?? null,
      tiktok_short_result: persisted?.tiktok_short_result ?? null,
      tiktok_photo_result: persisted?.tiktok_photo_result ?? null,
    });
    setHasHydratedDraft(true);
  }, [
    blogDraft,
    hasMounted,
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
  const seoReady = Boolean(form.title_tag.trim() && form.meta_description.trim() && form.og_title.trim() && form.og_description.trim());
  const readyCount = [wixConfig?.configured, blogDraft?.markdown?.trim(), hasFeaturedImage, seoReady].filter(Boolean).length;
  const canPublish =
    Boolean(wixConfig?.configured) &&
    Boolean(blogDraft?.markdown?.trim()) &&
    hasFeaturedImage &&
    Boolean(form.excerpt.trim()) &&
    Boolean(form.title_tag.trim()) &&
    Boolean(form.meta_description.trim());

  const youtubeReadyItems = [
    Boolean(sermonAsset),
    Boolean(packagingDraft?.title?.trim()),
    Boolean(packagingDraft?.description?.trim()),
    Boolean(sermonThumbnailAsset),
  ];
  const youtubeSermonReady = youtubeReadyItems.every(Boolean);
  const canPublishToYouTube =
    Boolean(youtubeConfig?.publish_configured) &&
    Boolean(sermonAsset) &&
    Boolean(packagingDraft?.title?.trim()) &&
    Boolean(packagingDraft?.description?.trim());
  const youtubeShortReady =
    Boolean(reelAsset) &&
    Boolean(reelDraft?.platforms?.youtube?.title?.trim()) &&
    Boolean(reelDraft?.platforms?.youtube?.description?.trim()) &&
    Boolean(reelThumbnailAsset);
  const youtubeTextReady = Boolean(packagingDraft?.title?.trim() || packagingDraft?.description?.trim());
  const facebookTextReady = Boolean(facebookDraft?.post?.trim());
  const facebookReelReady = Boolean(reelAsset) && Boolean(reelDraft?.platforms?.facebook?.description?.trim());
  const instagramTextReady =
    Boolean(sermonThumbnailAsset || reelThumbnailAsset) &&
    Boolean(reelDraft?.platforms?.instagram?.description?.trim() || packagingDraft?.description?.trim());
  const instagramReelReady =
    Boolean(reelAsset) && Boolean(reelDraft?.platforms?.instagram?.description?.trim()) && Boolean(reelThumbnailAsset);
  const tiktokPromoReady =
    Boolean(reelDraft?.platforms?.tiktok?.title?.trim()) &&
    Boolean(reelDraft?.platforms?.tiktok?.description?.trim()) &&
    Boolean(reelThumbnailAsset);
  const tiktokShortReady = Boolean(reelAsset) && Boolean(reelDraft?.platforms?.tiktok?.description?.trim());
  const facebookReadyItems = [Boolean(facebookDraft?.post?.trim()) || Boolean(reelDraft?.platforms?.facebook?.description?.trim())];
  const instagramReadyItems = [Boolean(reelAsset), Boolean(reelDraft?.platforms?.instagram?.description?.trim()), Boolean(reelThumbnailAsset)];
  const tiktokReadyItems = [Boolean(reelAsset), Boolean(reelDraft?.platforms?.tiktok?.description?.trim())];

  const channelsById = new Map(channels.map((channel) => [channel.id, channel]));
  const recommendationsByPlatform = useMemo(() => {
    const map = new Map<string, PublishRecommendation>();
    for (const item of recommendationsData?.recommendations ?? []) {
      map.set(item.platform, item);
    }
    return map;
  }, [recommendationsData?.recommendations]);

  const syncMetricsMutation = useMutation({
    mutationFn: () => publishing.syncLast30DaysMetrics(projectId),
    onSuccess: async (result) => {
      setMetricsSyncError("");
      setMetricsSyncDetails(result);
      setShowSyncDetails(true);
      const warningSuffix = result.warnings.length ? ` ${result.warnings[0]}` : "";
      setMetricsSyncSuccess(`Synced ${result.fetched_count} posts from the last 30 days.${warningSuffix}`);
      await queryClient.invalidateQueries({ queryKey: ["publish-recommendations", projectId] });
    },
    onError: (mutationError) => {
      setMetricsSyncSuccess("");
      setMetricsSyncDetails(null);
      setShowSyncDetails(false);
      setMetricsSyncError(mutationError instanceof Error ? mutationError.message : "Failed to sync recent platform posts.");
    },
  });
  async function handleStartYoutubeOAuth() {
    try {
      setYoutubeError("");
      setYoutubeSuccess("");
      const redirectUri = `${window.location.origin}/publish/youtube/callback`;
      const result = await publishing.startYoutubeOAuth(redirectUri);
      window.open(result.auth_url, "_blank", "noopener,noreferrer");
      setYoutubeSuccess("Opened Google OAuth in a new tab. After approval, copy the code from the callback page into the helper script or exchange endpoint.");
    } catch (oauthError) {
      setYoutubeSuccess("");
      setYoutubeError(oauthError instanceof Error ? oauthError.message : "Failed to start YouTube OAuth.");
    }
  }

  async function handleStartTikTokOAuth() {
    try {
      setYoutubeError("");
      setYoutubeSuccess("");
      const redirectUri = "https://amplify-amplify-web.ktfbiu.easypanel.host/publish/tiktok/callback";
      const result = await publishing.startTikTokOAuth(redirectUri);
      window.open(result.auth_url, "_blank", "noopener,noreferrer");
      setYoutubeSuccess(
        "Opened TikTok OAuth in a new tab. Complete the production callback flow, then exchange the returned code for TIKTOK_ACCESS_TOKEN and TIKTOK_OPEN_ID."
      );
    } catch (oauthError) {
      setYoutubeSuccess("");
      setYoutubeError(oauthError instanceof Error ? oauthError.message : "Failed to start TikTok OAuth.");
    }
  }

  return (
    <div className="space-y-6">
      <StepIntro
        eyebrow="Publishing"
        title={`Publish ${project?.title ?? "this project"} without the dashboard pileup.`}
        description="This workspace now splits into a channel board and a focused release desk. Use Channels to see every post type we can ship, then switch to Release Desk when you want the Wix article package only."
        meta={project?.speaker_display_name ? [project.speaker_display_name, project.sermon_date] : [project?.speaker || "Speaker pending"]}
        action={<ViewSwitch activeView={activeView} onChange={setActiveView} />}
        supportingPanel={
          <div className="grid gap-3 lg:grid-cols-3">
            <ModeChip label="Channels" description="Organize YouTube, Facebook, Instagram, TikTok, and Wix by post type." active={activeView === "channels"} />
            <ModeChip label="Release Desk" description="Keep the Wix article launch package focused in one workspace." active={activeView === "release"} />
            <ModeChip label="Results" description="Track live publish outcomes without mixing them into every edit form." />
          </div>
        }
      />

      {activeView === "channels" ? (
        <div className="space-y-6">
      <Card>
        <CardHeader
          eyebrow="Recommended Publish Times"
          title="Platform-specific timing guidance"
          description="Recommendations are account-specific and weighted by audience activity (40%), historical performance (40%), and early velocity (20%)."
          action={
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => syncMetricsMutation.mutate()}
                disabled={syncMetricsMutation.isPending}
              >
                {syncMetricsMutation.isPending ? "Syncing..." : "Sync Last 30 Days"}
              </Button>
              <Link href={`/projects/${projectId}/publish/calendar`} className="text-sm font-semibold text-brand hover:text-brand-strong">
                Open Calendar
              </Link>
            </div>
          }
        />
        {metricsSyncSuccess ? <Alert tone="success">{metricsSyncSuccess}</Alert> : null}
        {metricsSyncError ? <Alert tone="danger">{metricsSyncError}</Alert> : null}
        {metricsSyncDetails ? (
          <div className="mt-4 rounded-2xl border border-border/70 bg-background-alt p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-ink">Sync details</p>
              <Button size="sm" variant="secondary" onClick={() => setShowSyncDetails((current) => !current)}>
                {showSyncDetails ? "Hide details" : "Show details"}
              </Button>
            </div>
            {showSyncDetails ? (
              <div className="mt-4 space-y-3 text-sm">
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(metricsSyncDetails.counts_by_platform ?? {}).map(([platform, count]) => (
                    <div key={platform} className="flex items-center justify-between rounded-xl bg-surface px-3 py-2">
                      <span className="font-medium text-ink">{PLATFORM_LABELS[platform] ?? platform}</span>
                      <Badge tone={count > 0 ? "success" : "warning"}>{count} pulled</Badge>
                    </div>
                  ))}
                </div>
                <div className="space-y-2 rounded-xl bg-surface px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Warnings</p>
                  {Object.entries(metricsSyncDetails.warnings_by_platform ?? {}).map(([platform, messages]) =>
                    messages.length ? (
                      <p key={platform} className="text-xs text-muted">
                        <span className="font-semibold text-ink">{PLATFORM_LABELS[platform] ?? platform}:</span> {messages.join(" ")}
                      </p>
                    ) : null
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        {recommendationsLoading ? (
          <div className="mt-4 text-sm text-muted">Calculating recommendations...</div>
        ) : (
          <div className="mt-6 grid gap-3 xl:grid-cols-2">
            {["facebook", "instagram", "youtube", "tiktok"].map((platformId) => {
              const recommendation = recommendationsByPlatform.get(platformId);
              return (
                <div key={platformId} className="rounded-2xl border border-border/70 bg-surface/85 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="section-label">{PLATFORM_LABELS[platformId] ?? platformId}</p>
                      <p className="mt-2 text-lg font-semibold text-ink">
                        {recommendation ? formatRecommendationTime(recommendation.recommended_at) : "No recommendation yet"}
                      </p>
                    </div>
                    <Badge tone={recommendation ? confidenceTone(recommendation.confidence) : "warning"}>
                      {recommendation ? `${recommendation.confidence} confidence` : "low confidence"}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm text-muted">
                    {recommendation?.reason ?? "Need more publish history or audience activity data for stronger recommendations."}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    <Badge tone={recommendation?.based_on.audience_activity ? "success" : "warning"}>Audience</Badge>
                    <Badge tone={recommendation?.based_on.performance_history ? "success" : "warning"}>History</Badge>
                    <Badge tone={recommendation?.based_on.early_velocity ? "success" : "warning"}>Velocity</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          eyebrow="Publish Lanes"
              title="Manual publish lanes"
              description="Use these lanes for the actual button-triggered posts. Calendar owns timing and Results owns the audit trail."
            />
            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              <div className="rounded-[1.5rem] border border-border/70 bg-surface/85 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="section-label">YouTube</p>
                    <h3 className="mt-2 text-lg font-semibold text-ink">Sermon, short, and text post</h3>
                  </div>
                  <Badge tone={youtubeSermonReady || youtubeShortReady ? "success" : "warning"}>
                    {youtubeSermonReady || youtubeShortReady ? "Lane active" : "Needs pieces"}
                  </Badge>
                </div>
                <div className="mt-4 space-y-2">
                  <TargetReadinessRow label="Sermon video" value={youtubeSermonReady ? "Ready to publish" : "Needs pieces"} tone={youtubeSermonReady ? "success" : "warning"} />
                  <TargetReadinessRow label="YouTube Short" value={youtubeShortReady ? "Ready for wiring" : "Needs reel package"} tone={youtubeShortReady ? "info" : "warning"} />
                  <TargetReadinessRow label="Text post" value={youtubeTextReady ? "Manual in Studio" : "Needs title or description"} tone={youtubeTextReady ? "neutral" : "warning"} />
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      void handleStartYoutubeOAuth();
                    }}
                    disabled={!youtubeConfig?.client_configured}
                  >
                    {youtubeConfig?.publish_configured ? "Reconnect YouTube" : "Connect YouTube"}
                  </Button>
                  <Button
                    variant="success"
                    size="sm"
                    onClick={() => youtubePublishMutation.mutate()}
                    disabled={!canPublishToYouTube || youtubePublishMutation.isPending}
                  >
                    {youtubePublishMutation.isPending ? "Publishing..." : "Publish Sermon"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => youtubeShortPublishMutation.mutate()}
                    disabled={!youtubeConfig?.publish_configured || !youtubeShortReady || youtubeShortPublishMutation.isPending}
                  >
                    {youtubeShortPublishMutation.isPending ? "Publishing..." : "Publish Short"}
                  </Button>
                </div>
                <div className="mt-4 space-y-2 rounded-2xl bg-background-alt px-4 py-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted">OAuth client</span>
                    <Badge tone={youtubeConfig?.client_configured ? "success" : "warning"}>
                      {youtubeConfig?.client_configured ? "Configured" : "Missing"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted">Publish token</span>
                    <Badge tone={youtubeConfig?.publish_configured ? "success" : "warning"}>
                      {youtubeConfig?.publish_configured ? "Ready" : "Needs refresh token"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted">Text post API</span>
                    <Badge tone="neutral">Manual only</Badge>
                  </div>
                  {form.youtube_result?.video_id ? (
                    <div className="rounded-2xl bg-surface px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Last upload</p>
                      <p className="mt-2 font-medium text-ink">{form.youtube_result.title}</p>
                      <div className="mt-3 flex flex-wrap gap-3">
                        <a
                          href={form.youtube_result.watch_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-semibold text-brand hover:text-brand-strong"
                        >
                          Open video
                        </a>
                        <a
                          href={form.youtube_result.studio_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-semibold text-brand hover:text-brand-strong"
                        >
                          Open Studio
                        </a>
                      </div>
                    </div>
                  ) : null}
                  {form.youtube_short_result?.video_id ? (
                    <div className="rounded-2xl bg-surface px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Last short</p>
                      <p className="mt-2 font-medium text-ink">{form.youtube_short_result.title}</p>
                      <div className="mt-3 flex flex-wrap gap-3">
                        <a
                          href={form.youtube_short_result.watch_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-semibold text-brand hover:text-brand-strong"
                        >
                          Open short
                        </a>
                        <a
                          href={form.youtube_short_result.studio_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-semibold text-brand hover:text-brand-strong"
                        >
                          Open Studio
                        </a>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-border/70 bg-surface/85 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="section-label">Facebook</p>
                    <h3 className="mt-2 text-lg font-semibold text-ink">Text post and reel</h3>
                  </div>
                  <Badge tone={facebookTextReady || facebookReelReady ? "success" : "warning"}>
                    {facebookTextReady || facebookReelReady ? "Lane active" : "Needs copy"}
                  </Badge>
                </div>
                <div className="mt-4 space-y-2">
                  <TargetReadinessRow label="Text post" value={facebookTextReady ? "Ready to publish" : "Needs copy"} tone={facebookTextReady ? "success" : "warning"} />
                  <TargetReadinessRow label="Facebook Reel" value={facebookReelReady ? "Ready to publish" : "Needs reel package"} tone={facebookReelReady ? "success" : "warning"} />
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => facebookPostPublishMutation.mutate()}
                    disabled={!channelsById.get("facebook")?.configured || !facebookTextReady || facebookPostPublishMutation.isPending}
                  >
                    {facebookPostPublishMutation.isPending ? "Publishing..." : "Publish Text Post"}
                  </Button>
                  <Button
                    variant="success"
                    size="sm"
                    onClick={() => facebookReelPublishMutation.mutate()}
                    disabled={!channelsById.get("facebook")?.configured || !facebookReelReady || facebookReelPublishMutation.isPending}
                  >
                    {facebookReelPublishMutation.isPending ? "Publishing..." : "Publish Reel"}
                  </Button>
                </div>
                <div className="mt-4 space-y-2 rounded-2xl bg-background-alt px-4 py-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted">Page connection</span>
                    <Badge tone={channelsById.get("facebook")?.configured ? "success" : "warning"}>
                      {channelsById.get("facebook")?.configured ? "Configured" : "Missing"}
                    </Badge>
                  </div>
                  {form.facebook_post_result?.post_id ? (
                    <div className="rounded-2xl bg-surface px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Last text post</p>
                      <p className="mt-2 font-medium text-ink line-clamp-3">{form.facebook_post_result.message}</p>
                      {form.facebook_post_result.post_url ? (
                        <div className="mt-3">
                          <a
                            href={form.facebook_post_result.post_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-semibold text-brand hover:text-brand-strong"
                          >
                            Open post
                          </a>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {form.facebook_reel_result?.video_id ? (
                    <div className="rounded-2xl bg-surface px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Last reel</p>
                      <p className="mt-2 font-medium text-ink">{form.facebook_reel_result.title || "Untitled reel"}</p>
                      {form.facebook_reel_result.post_url ? (
                        <div className="mt-3">
                          <a
                            href={form.facebook_reel_result.post_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-semibold text-brand hover:text-brand-strong"
                          >
                            Open reel
                          </a>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-border/70 bg-surface/85 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="section-label">Instagram</p>
                    <h3 className="mt-2 text-lg font-semibold text-ink">Text post and reel</h3>
                  </div>
                  <Badge tone={instagramTextReady || instagramReelReady ? "success" : "warning"}>
                    {instagramTextReady || instagramReelReady ? "Lane active" : "Needs pieces"}
                  </Badge>
                </div>
                <div className="mt-4 space-y-2">
                  <TargetReadinessRow label="Text post" value={instagramTextReady ? "Ready to publish" : "Needs caption or thumbnail"} tone={instagramTextReady ? "success" : "warning"} />
                  <TargetReadinessRow label="Instagram Reel" value={instagramReelReady ? "Ready to publish" : "Needs reel package"} tone={instagramReelReady ? "success" : "warning"} />
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => instagramPostPublishMutation.mutate()}
                    disabled={!channelsById.get("instagram")?.configured || !instagramTextReady || instagramPostPublishMutation.isPending}
                  >
                    {instagramPostPublishMutation.isPending ? "Publishing..." : "Publish Text Post"}
                  </Button>
                  <Button
                    variant="success"
                    size="sm"
                    onClick={() => instagramReelPublishMutation.mutate()}
                    disabled={!channelsById.get("instagram")?.configured || !instagramReelReady || instagramReelPublishMutation.isPending}
                  >
                    {instagramReelPublishMutation.isPending ? "Publishing..." : "Publish Reel"}
                  </Button>
                </div>
                <div className="mt-4 space-y-2 rounded-2xl bg-background-alt px-4 py-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted">Business account</span>
                    <Badge tone={channelsById.get("instagram")?.configured ? "success" : "warning"}>
                      {channelsById.get("instagram")?.configured ? "Configured" : "Missing"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted">Publish shape</span>
                    <Badge tone="info">Image + reel</Badge>
                  </div>
                  {form.instagram_post_result?.media_id ? (
                    <div className="rounded-2xl bg-surface px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Last image post</p>
                      <p className="mt-2 font-medium text-ink line-clamp-3">{form.instagram_post_result.caption}</p>
                      {form.instagram_post_result.permalink ? (
                        <div className="mt-3">
                          <a
                            href={form.instagram_post_result.permalink}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-semibold text-brand hover:text-brand-strong"
                          >
                            Open post
                          </a>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {form.instagram_reel_result?.media_id ? (
                    <div className="rounded-2xl bg-surface px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Last reel</p>
                      <p className="mt-2 font-medium text-ink line-clamp-3">{form.instagram_reel_result.caption}</p>
                      {form.instagram_reel_result.permalink ? (
                        <div className="mt-3">
                          <a
                            href={form.instagram_reel_result.permalink}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-semibold text-brand hover:text-brand-strong"
                          >
                            Open reel
                          </a>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-border/70 bg-surface/85 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="section-label">TikTok</p>
                    <h3 className="mt-2 text-lg font-semibold text-ink">Promo post and short</h3>
                  </div>
                  <Badge tone={tiktokPromoReady || tiktokShortReady ? "success" : "warning"}>
                    {tiktokPromoReady || tiktokShortReady ? "Lane active" : "Needs pieces"}
                  </Badge>
                </div>
                <div className="mt-4 space-y-2">
                  <TargetReadinessRow label="Text + title + thumb" value={tiktokPromoReady ? "Draft package ready" : "Needs title, copy, or thumb"} tone={tiktokPromoReady ? "info" : "warning"} />
                  <TargetReadinessRow label="TikTok Short" value={tiktokShortReady ? "Ready to publish" : "Needs reel package"} tone={tiktokShortReady ? "success" : "warning"} />
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      void handleStartTikTokOAuth();
                    }}
                    disabled={!tiktokConfig?.client_configured}
                  >
                    {tiktokConfig?.publish_configured ? "Reconnect TikTok" : "Connect TikTok"}
                  </Button>
                  <Button
                    variant="success"
                    size="sm"
                    onClick={() => {
                      tiktokShortPublishMutation.mutate();
                    }}
                    disabled={!tiktokConfig?.publish_configured || !tiktokShortReady || tiktokShortPublishMutation.isPending}
                  >
                    {tiktokShortPublishMutation.isPending ? "Publishing Short..." : "Publish TikTok Short"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      tiktokPhotoPublishMutation.mutate();
                    }}
                    disabled={!tiktokConfig?.publish_configured || !tiktokPromoReady || tiktokPhotoPublishMutation.isPending}
                  >
                    {tiktokPhotoPublishMutation.isPending ? "Publishing Photo..." : "Publish TikTok Photo"}
                  </Button>
                </div>
                <div className="mt-4 space-y-2 rounded-2xl bg-background-alt px-4 py-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted">OAuth client</span>
                    <Badge tone={tiktokConfig?.client_configured ? "success" : "warning"}>
                      {tiktokConfig?.client_configured ? "Configured" : "Missing"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted">Publish token</span>
                    <Badge tone={tiktokConfig?.publish_configured ? "success" : "warning"}>
                      {tiktokConfig?.publish_configured ? "Ready" : "Needs open_id + token"}
                    </Badge>
                  </div>
                </div>
                {form.tiktok_short_result ? (
                  <div className="mt-4 rounded-2xl border border-border/70 bg-surface px-4 py-4 text-sm">
                    <p className="font-medium text-ink">Latest TikTok short</p>
                    <div className="mt-3 space-y-2 text-muted">
                      <div className="flex items-center justify-between gap-3">
                        <span>Status</span>
                        <Badge tone="success">{form.tiktok_short_result.status}</Badge>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Privacy</span>
                        <span className="font-medium text-ink">{form.tiktok_short_result.privacy_level}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Publish ID</span>
                        <span className="font-medium text-ink">{form.tiktok_short_result.publish_id}</span>
                      </div>
                    </div>
                  </div>
                ) : null}
                {form.tiktok_photo_result ? (
                  <div className="mt-4 rounded-2xl border border-border/70 bg-surface px-4 py-4 text-sm">
                    <p className="font-medium text-ink">Latest TikTok photo post</p>
                    <div className="mt-3 space-y-2 text-muted">
                      <div className="flex items-center justify-between gap-3">
                        <span>Status</span>
                        <Badge tone="success">{form.tiktok_photo_result.status}</Badge>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Privacy</span>
                        <span className="font-medium text-ink">{form.tiktok_photo_result.privacy_level}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Publish ID</span>
                        <span className="font-medium text-ink">{form.tiktok_photo_result.publish_id}</span>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </Card>

          {error ? <Alert tone="danger">{error}</Alert> : null}
          {success ? <Alert tone="success">{success}</Alert> : null}
          {youtubeError ? <Alert tone="danger">{youtubeError}</Alert> : null}
          {youtubeSuccess ? <Alert tone="success">{youtubeSuccess}</Alert> : null}
          {facebookError ? <Alert tone="danger">{facebookError}</Alert> : null}
          {facebookSuccess ? <Alert tone="success">{facebookSuccess}</Alert> : null}
          {instagramError ? <Alert tone="danger">{instagramError}</Alert> : null}
          {instagramSuccess ? <Alert tone="success">{instagramSuccess}</Alert> : null}
          {tiktokError ? <Alert tone="danger">{tiktokError}</Alert> : null}
          {tiktokSuccess ? <Alert tone="success">{tiktokSuccess}</Alert> : null}

          <Alert tone="info">
            Wix article publish, YouTube uploads, Facebook posting, Instagram image and reel publishing, plus TikTok short and photo posts are wired. YouTube text posts remain manual because Google does not expose Community posts through the current public API.
          </Alert>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {success ? <Alert tone="success">{success}</Alert> : null}
          {youtubeError ? <Alert tone="danger">{youtubeError}</Alert> : null}
          {youtubeSuccess ? <Alert tone="success">{youtubeSuccess}</Alert> : null}

          <Card>
            <CardHeader
              eyebrow="Publish Desk"
              title="Core release package"
              description="This is the main operator desk for the post package. It groups the source snapshot, schedule controls, and metadata that future desk and calendar subviews will share."
            />
            <div className="mt-6 space-y-6">
              <div className="grid gap-4 rounded-[1.75rem] border border-border/70 bg-surface/65 p-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
                <div className="space-y-4">
                  <div>
                    <p className="section-label">Source Snapshot</p>
                    <h3 className="mt-2 text-xl font-semibold text-ink">{parsedBlog.title || project?.title || "Untitled post"}</h3>
                    <p className="mt-2 text-sm leading-7 text-muted">
                      {form.excerpt || "The excerpt will appear here once the blog draft is loaded."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={blogDraft?.markdown?.trim() ? "info" : "warning"}>
                      {blogDraft?.markdown?.trim() ? "Draft loaded" : "Draft missing"}
                    </Badge>
                    <Badge tone={published ? "success" : "neutral"}>{published ? "Published" : "Release in progress"}</Badge>
                    <Badge tone={seoReady ? "success" : "warning"}>{seoReady ? "Metadata ready" : "Metadata incomplete"}</Badge>
                  </div>
                </div>

                <div className="grid gap-3">
                  <div className="rounded-2xl bg-background-alt px-4 py-3 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Calendar lane</p>
                    <p className="mt-2 font-medium text-ink">{form.publish_date || "No publish date set"}</p>
                    <p className="mt-1 text-muted">Schedule aligns to the sermon date by default and can flex when the release plan changes.</p>
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
                  <FieldCard label="Blog title">
                    <input
                      value={parsedBlog.title || project?.title || ""}
                      readOnly
                      className="w-full rounded-2xl border border-border bg-background-alt px-4 py-3 text-sm text-ink outline-none"
                    />
                  </FieldCard>
                  <FieldCard label="Publish date" hint="Auto-filled from the sermon date">
                    <input
                      type="date"
                      value={form.publish_date}
                      onChange={(event) => setForm((current) => ({ ...current, publish_date: event.target.value }))}
                      className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                    />
                  </FieldCard>
                  <FieldCard label="Writer">
                    <input
                      value={form.writer_member_id}
                      onChange={(event) => setForm((current) => ({ ...current, writer_member_id: event.target.value }))}
                      className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                      placeholder="Wix member ID"
                    />
                  </FieldCard>
                  <FieldCard label="Excerpt" hint={`${form.excerpt.length} chars`}>
                    <textarea
                      value={form.excerpt}
                      onChange={(event) => setForm((current) => ({ ...current, excerpt: event.target.value }))}
                      className="min-h-[8rem] w-full rounded-[1.5rem] border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                      placeholder="Short summary used for the Wix post excerpt."
                    />
                  </FieldCard>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              eyebrow="Distribution Package"
              title="Search and social metadata"
              description="This grouped section holds the outbound metadata bundle so future platform-specific subviews can branch from one shared SEO package."
            />
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <FieldCard label="Title tag" hint={form.title_tag.trim() ? `${form.title_tag.length} chars` : "Required"}>
                <input
                  value={form.title_tag}
                  onChange={(event) => setForm((current) => ({ ...current, title_tag: event.target.value }))}
                  className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                />
              </FieldCard>
              <FieldCard label="Meta description" hint={form.meta_description.trim() ? `${form.meta_description.length} chars` : "Required"}>
                <textarea
                  value={form.meta_description}
                  onChange={(event) => setForm((current) => ({ ...current, meta_description: event.target.value }))}
                  className="min-h-[8rem] w-full rounded-[1.5rem] border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                />
              </FieldCard>
              <FieldCard label="og:title" hint={form.og_title.trim() ? "Ready" : "Required"}>
                <input
                  value={form.og_title}
                  onChange={(event) => setForm((current) => ({ ...current, og_title: event.target.value }))}
                  className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                />
              </FieldCard>
              <FieldCard label="og:description" hint={form.og_description.trim() ? "Ready" : "Required"}>
                <textarea
                  value={form.og_description}
                  onChange={(event) => setForm((current) => ({ ...current, og_description: event.target.value }))}
                  className="min-h-[8rem] w-full rounded-[1.5rem] border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                />
              </FieldCard>
            </div>
          </Card>

          <Card>
            <CardHeader
              eyebrow="Featured Asset"
              title="Hero image for the live post"
              description="The sermon thumbnail auto-loads here, but you can replace it with a dedicated Wix upload before publishing."
            />
            <div className="mt-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink">Featured image source</p>
                  <p className="mt-1 text-sm text-muted">
                    {form.featured_image_id
                      ? `Current Wix image: ${form.featured_image_filename || form.featured_image_id}`
                      : form.featured_image_source
                        ? "Using the auto-loaded sermon thumbnail until you replace it."
                        : "Add or upload a featured image before publishing."}
                  </p>
                </div>
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
                  className="h-64 w-full rounded-[1.75rem] border border-border object-cover"
                />
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
            </div>
          </Card>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <Card className="bg-[linear-gradient(160deg,rgba(255,255,255,0.99),rgba(255,246,240,0.96))]">
            <CardHeader
              eyebrow="Calendar + History"
              title="Release rail"
              description="The side rail keeps readiness, destination context, and the last publish result grouped together until dedicated calendar and history views land."
            />
            <div className="mt-6 space-y-3">
              <ChecklistRow
                label="Wix connection"
                done={Boolean(wixConfig?.configured)}
                detail="The publishing API and site credentials are available."
              />
              <ChecklistRow
                label="Blog draft"
                done={Boolean(blogDraft?.markdown?.trim())}
                detail="The generated blog post exists and can be sent to Wix."
              />
              <ChecklistRow
                label="Featured image"
                done={hasFeaturedImage}
                detail="A hero image is selected for the outbound post."
              />
              <ChecklistRow
                label="SEO fields"
                done={seoReady}
                detail="Title tag, meta description, og:title, and og:description are all filled."
              />
            </div>

            <div className="mt-6 rounded-[1.5rem] bg-surface/85 p-4 text-sm text-muted">
              <p className="font-medium text-ink">Ready to ship: {readyCount}/4</p>
              <p className="mt-2 leading-6">
                Publishing stays disabled until Wix is connected, the blog draft is loaded, an image is chosen, and the SEO package is complete.
              </p>
            </div>
            <div className="mt-6 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-tint px-4 py-3">
                <span className="text-muted">Connection</span>
                <span className="font-medium text-ink">{destinationLabel}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-tint px-4 py-3">
                <span className="text-muted">Writer</span>
                <span className="font-medium text-ink">{form.writer_member_id || "Uses default Wix member"}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-tint px-4 py-3">
                <span className="text-muted">Live site</span>
                <span className="font-medium text-ink">{wixConfig?.site_id ? "Configured" : "Not configured"}</span>
              </div>
            </div>

            <div className="mt-6 rounded-[1.5rem] border border-border/70 bg-surface/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">History lane</p>
              {form.wix_result?.post_id ? (
                <div className="mt-3 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-tint px-4 py-3">
                    <span className="text-muted">Post ID</span>
                    <span className="font-medium text-ink">{form.wix_result.post_id}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-tint px-4 py-3">
                    <span className="text-muted">Published</span>
                    <span className="font-medium text-ink">{form.wix_result.published_at}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-tint px-4 py-3">
                    <span className="text-muted">Status</span>
                    <span className="font-medium text-ink">{form.wix_result.status}</span>
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
                </div>
              ) : (
                <p className="mt-3 text-sm leading-6 text-muted">No Wix publish result has been saved for this project yet.</p>
              )}
            </div>
          </Card>
        </aside>
      </div>
      )}
    </div>
  );
}













