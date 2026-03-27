"use client";

import Image from "next/image";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { getMediaPlaybackUrl, projects, transcript, type ProjectAsset } from "@/lib/api";
import type {
  BlogDraft,
  FacebookDraft,
  MetadataDraft,
  PackagingDraft,
  ReelDraft,
} from "@/lib/projectDrafts";

type NullableAsset = ProjectAsset | null;

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function formatDate(value: string | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Copy button
// ---------------------------------------------------------------------------
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3 text-xs font-semibold text-muted transition-all hover:border-brand/40 hover:text-ink"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Media card
// ---------------------------------------------------------------------------
function MediaCard({
  title,
  hint,
  asset,
}: {
  title: string;
  hint: string;
  asset: NullableAsset;
}) {
  if (!asset) return null;
  const isImage = asset.mime_type?.startsWith("image/");
  const url = asset.playback_url ?? getMediaPlaybackUrl(asset.id);

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-base font-semibold text-ink">{title}</p>
          <p className="mt-0.5 text-sm text-muted">{hint}</p>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 inline-flex h-9 items-center justify-center rounded-full border border-border-strong bg-surface px-4 text-sm font-semibold text-ink transition-all hover:border-brand/40 hover:bg-brand-soft/50"
        >
          Download
        </a>
      </div>
      <div className="mt-4 overflow-hidden rounded-[1.25rem] border border-border/80 bg-background-alt">
        {isImage ? (
          <Image src={url} alt={title} width={960} height={540} className="h-auto w-full object-cover" unoptimized />
        ) : (
          <video src={url} controls className="aspect-video w-full bg-black" />
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Text card
// ---------------------------------------------------------------------------
function TextCard({
  title,
  hint,
  value,
}: {
  title: string;
  hint: string;
  value: string | undefined;
}) {
  const text = value?.trim() ?? "";
  if (!text) return null;
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-base font-semibold text-ink">{title}</p>
          <p className="mt-0.5 text-sm text-muted">{hint}</p>
        </div>
        <CopyButton text={text} />
      </div>
      <textarea
        readOnly
        value={text}
        className="mt-4 min-h-[10rem] w-full rounded-[1.25rem] border border-border bg-surface px-4 py-3 text-sm leading-7 text-ink outline-none resize-none"
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tab nav
// ---------------------------------------------------------------------------
const TABS = ["Videos", "Images", "Written Content", "Social Copy"] as const;
type Tab = (typeof TABS)[number];

function TabBar({ active, onChange, counts }: { active: Tab; onChange: (t: Tab) => void; counts: Record<Tab, number> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={classNames(
            "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all",
            active === tab
              ? "border-brand/40 bg-brand-soft/80 text-brand-strong"
              : "border-border/80 bg-surface text-muted hover:border-brand/30 hover:text-ink"
          )}
        >
          {tab}
          {counts[tab] > 0 ? (
            <span className={classNames(
              "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-xs font-bold",
              active === tab ? "bg-brand/20 text-brand-strong" : "bg-surface-strong text-muted"
            )}>
              {counts[tab]}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ProjectSharePage() {
  const params = useParams();
  const projectId = params.id as string;
  const [activeTab, setActiveTab] = useState<Tab>("Videos");
  const [linkCopied, setLinkCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 1800);
  }

  // Data fetching
  const { data: project, error: projectError, isLoading } = useQuery({
    queryKey: ["shared-project", projectId],
    queryFn: () => projects.get(projectId),
    retry: false,
  });
  const { data: sermonAsset } = useQuery({
    queryKey: ["shared-sermon-asset", projectId],
    queryFn: () => projects.getSermonAsset(projectId),
  });
  const { data: sermonThumbnailAsset } = useQuery({
    queryKey: ["shared-sermon-thumbnail-asset", projectId],
    queryFn: () => projects.getSermonThumbnailAsset(projectId),
  });
  const { data: reelAsset } = useQuery({
    queryKey: ["shared-reel-asset", projectId],
    queryFn: () => projects.getReelAsset(projectId),
  });
  const { data: reelThumbnailAsset } = useQuery({
    queryKey: ["shared-reel-thumbnail-asset", projectId],
    queryFn: () => projects.getReelThumbnailAsset(projectId),
  });
  const { data: sermonTranscript } = useQuery({
    queryKey: ["shared-sermon-transcript", projectId],
    queryFn: () => transcript.getForProject(projectId, "sermon"),
  });
  const { data: blogDraft } = useQuery({
    queryKey: ["shared-draft-blog", projectId],
    queryFn: () => projects.getDraft<BlogDraft>(projectId, "blog"),
  });
  const { data: packagingDraft } = useQuery({
    queryKey: ["shared-draft-packaging", projectId],
    queryFn: () => projects.getDraft<PackagingDraft>(projectId, "packaging"),
  });
  const { data: facebookDraft } = useQuery({
    queryKey: ["shared-draft-facebook", projectId],
    queryFn: () => projects.getDraft<FacebookDraft>(projectId, "facebook"),
  });
  const { data: reelDraft } = useQuery({
    queryKey: ["shared-draft-reel", projectId],
    queryFn: () => projects.getDraft<ReelDraft>(projectId, "reel"),
  });
  const { data: metadataDraft } = useQuery({
    queryKey: ["shared-draft-metadata", projectId],
    queryFn: () => projects.getDraft<MetadataDraft>(projectId, "metadata"),
  });

  // Derived content
  const sermonTitle = packagingDraft?.payload?.title?.trim() || project?.title || "";
  const sermonDescription = packagingDraft?.payload?.description?.trim() || "";
  const transcriptText = (sermonTranscript?.cleaned_text || sermonTranscript?.raw_text || "").trim();
  const blogMarkdown = blogDraft?.payload?.markdown?.trim() || "";
  const facebookPost = facebookDraft?.payload?.post?.trim() || "";
  const reelCaption = reelDraft?.payload?.caption?.trim() || "";

  const ytReel = reelDraft?.payload?.platforms?.youtube;
  const fbReel = reelDraft?.payload?.platforms?.facebook;
  const igReel = reelDraft?.payload?.platforms?.instagram;
  const ttReel = reelDraft?.payload?.platforms?.tiktok;

  const ytReelCopy = ytReel
    ? [`${ytReel.title || ""}`, `${ytReel.description || ""}`, ytReel.tags?.length ? `Tags: ${ytReel.tags.join(", ")}` : ""]
        .filter(Boolean).join("\n\n")
    : "";
  const fbReelCopy = fbReel
    ? [`${fbReel.title || ""}`, `${fbReel.description || ""}`, fbReel.tags?.length ? `Tags: ${fbReel.tags.join(", ")}` : ""]
        .filter(Boolean).join("\n\n")
    : "";
  const igReelCopy = igReel
    ? [`${igReel.title || ""}`, `${igReel.description || ""}`, igReel.tags?.length ? `Tags: ${igReel.tags.join(", ")}` : ""]
        .filter(Boolean).join("\n\n")
    : "";
  const ttReelCopy = ttReel
    ? [`${ttReel.title || ""}`, `${ttReel.description || ""}`, ttReel.tags?.length ? `Tags: ${ttReel.tags.join(", ")}` : ""]
        .filter(Boolean).join("\n\n")
    : "";

  // Metadata as readable summary (no raw JSON exposed)
  const meta = metadataDraft?.payload?.metadata as Record<string, unknown> | undefined;
  const metaSummary = meta
    ? Object.entries(meta)
        .filter(([, v]) => v !== null && v !== undefined && String(v).trim())
        .map(([k, v]) => {
          const label = k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
          const val = Array.isArray(v) ? (v as unknown[]).join(", ") : String(v);
          return `${label}: ${val}`;
        })
        .join("\n")
    : "";

  // Tab counts (only count items that have content)
  const videoCounts = [sermonAsset, reelAsset].filter(Boolean).length;
  const imageCounts = [sermonThumbnailAsset, reelThumbnailAsset].filter(Boolean).length;
  const writtenCounts = [sermonTitle, sermonDescription, transcriptText, blogMarkdown, metaSummary].filter(Boolean).length;
  const socialCounts = [facebookPost, reelCaption, ytReelCopy, fbReelCopy, igReelCopy, ttReelCopy].filter(Boolean).length;

  const tabCounts: Record<Tab, number> = {
    Videos: videoCounts,
    Images: imageCounts,
    "Written Content": writtenCounts,
    "Social Copy": socialCounts,
  };

  const speaker = project?.speaker_display_name || project?.speaker || "";
  const date = formatDate(project?.sermon_date);

  return (
    <main className="page-frame py-8 lg:py-12">
      <div className="page-stack">

        {/* Hero header */}
        <div className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <p className="section-label">Sermon Package</p>
              <h1 className="text-2xl font-bold text-ink sm:text-3xl">
                {project?.title ?? (isLoading ? "Loading..." : "Sermon Package")}
              </h1>
              {(speaker || date) ? (
                <p className="text-sm text-muted">
                  {[speaker, date].filter(Boolean).join(" · ")}
                </p>
              ) : null}
            </div>
            <Button type="button" variant="secondary" onClick={() => void copyLink()}>
              {linkCopied ? "Link copied" : "Share link"}
            </Button>
          </div>

          {/* Tab counts summary badges */}
          <div className="flex flex-wrap gap-2">
            {videoCounts > 0 && <Badge tone="info">{videoCounts} video{videoCounts !== 1 ? "s" : ""}</Badge>}
            {imageCounts > 0 && <Badge tone="brand">{imageCounts} image{imageCounts !== 1 ? "s" : ""}</Badge>}
            {writtenCounts > 0 && <Badge tone="success">{writtenCounts} written piece{writtenCounts !== 1 ? "s" : ""}</Badge>}
            {socialCounts > 0 && <Badge tone="warning">{socialCounts} social caption{socialCounts !== 1 ? "s" : ""}</Badge>}
          </div>
        </div>

        {isLoading ? <Alert tone="info">Loading content...</Alert> : null}
        {projectError ? (
          <Alert tone="danger" title="Not available">
            This link is invalid or the content is no longer available.
          </Alert>
        ) : null}

        {/* Tab navigation */}
        {!isLoading && !projectError ? (
          <div className="space-y-6">
            <TabBar active={activeTab} onChange={setActiveTab} counts={tabCounts} />

            {/* Videos */}
            {activeTab === "Videos" ? (
              <div className="space-y-6">
                {videoCounts === 0 ? (
                  <p className="text-sm text-muted">No videos are ready yet.</p>
                ) : null}
                <MediaCard
                  title="Full Sermon"
                  hint="The complete sermon video, ready to post on YouTube or your website."
                  asset={sermonAsset ?? null}
                />
                <MediaCard
                  title="Short Clip"
                  hint="A short highlight clip for Instagram Reels, TikTok, Facebook Reels, and YouTube Shorts."
                  asset={reelAsset ?? null}
                />
              </div>
            ) : null}

            {/* Images */}
            {activeTab === "Images" ? (
              <div className="space-y-6">
                {imageCounts === 0 ? (
                  <p className="text-sm text-muted">No images are ready yet.</p>
                ) : null}
                <MediaCard
                  title="Sermon Cover Image"
                  hint="Thumbnail for the full sermon post on YouTube or your website."
                  asset={sermonThumbnailAsset ?? null}
                />
                <MediaCard
                  title="Short Clip Cover Image"
                  hint="Cover image for the short clip on social platforms."
                  asset={reelThumbnailAsset ?? null}
                />
              </div>
            ) : null}

            {/* Written Content */}
            {activeTab === "Written Content" ? (
              <div className="grid gap-6 2xl:grid-cols-2">
                {writtenCounts === 0 ? (
                  <p className="text-sm text-muted">No written content is ready yet.</p>
                ) : null}
                <TextCard
                  title="YouTube Title"
                  hint="Suggested title for the full sermon on YouTube or your website."
                  value={sermonTitle}
                />
                <TextCard
                  title="YouTube Description"
                  hint="Full description copy including chapters and links. Paste directly into YouTube Studio."
                  value={sermonDescription}
                />
                <TextCard
                  title="Blog Post"
                  hint="A long-form written version of the sermon, ready to publish on your website or blog."
                  value={blogMarkdown}
                />
                <TextCard
                  title="Sermon Transcript"
                  hint="Full word-for-word transcript. Useful for accessibility, captions, and repurposing."
                  value={transcriptText}
                />
                <TextCard
                  title="Sermon Details"
                  hint="Key information about this sermon — topic, scripture references, themes, and more."
                  value={metaSummary}
                />
              </div>
            ) : null}

            {/* Social Copy */}
            {activeTab === "Social Copy" ? (
              <div className="grid gap-6 2xl:grid-cols-2">
                {socialCounts === 0 ? (
                  <p className="text-sm text-muted">No social copy is ready yet.</p>
                ) : null}
                <TextCard
                  title="Facebook Post"
                  hint="Ready-to-post copy for a standard Facebook feed post. Pair with the sermon cover image."
                  value={facebookPost}
                />
                <TextCard
                  title="Short Clip Caption"
                  hint="General caption for the short clip. Adjust hashtags per platform before posting."
                  value={reelCaption}
                />
                <TextCard
                  title="YouTube Shorts Copy"
                  hint="Title, description, and tags for posting the short clip as a YouTube Short."
                  value={ytReelCopy}
                />
                <TextCard
                  title="Facebook Reels Copy"
                  hint="Title, description, and tags for posting the short clip as a Facebook Reel."
                  value={fbReelCopy}
                />
                <TextCard
                  title="Instagram Reels Copy"
                  hint="Caption and tags for posting the short clip as an Instagram Reel."
                  value={igReelCopy}
                />
                <TextCard
                  title="TikTok Copy"
                  hint="Caption and tags for posting the short clip on TikTok."
                  value={ttReelCopy}
                />
              </div>
            ) : null}
          </div>
        ) : null}

      </div>
    </main>
  );
}
