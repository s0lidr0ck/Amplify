"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { projects } from "@/lib/api";
import { type PublishingDraft } from "@/lib/projectDrafts";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";

export default function PublishResultsPage() {
  const params = useParams();
  const projectId = params.id as string;

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projects.get(projectId),
  });

  const { data: publishingDraft } = useQuery({
    queryKey: ["project-draft", projectId, "publishing"],
    queryFn: () => projects.getDraft<PublishingDraft>(projectId, "publishing"),
  });

  const payload = publishingDraft?.payload;
  const updatedAt = publishingDraft?.updated_at || null;

  const publishedResults = [
    payload?.wix_result
      ? {
          key: "wix",
          label: "Wix article",
          status: payload.wix_result.status,
          detail: payload.wix_result.preview_url || payload.wix_result.post_id,
          href: payload.wix_result.preview_url || null,
        }
      : null,
    payload?.youtube_result
      ? {
          key: "youtube-sermon",
          label: "YouTube sermon",
          status: payload.youtube_result.status,
          detail: payload.youtube_result.watch_url || payload.youtube_result.video_id,
          href: payload.youtube_result.watch_url || null,
        }
      : null,
    payload?.youtube_short_result
      ? {
          key: "youtube-short",
          label: "YouTube Short",
          status: payload.youtube_short_result.status,
          detail: payload.youtube_short_result.watch_url || payload.youtube_short_result.video_id,
          href: payload.youtube_short_result.watch_url || null,
        }
      : null,
    payload?.facebook_post_result
      ? {
          key: "facebook-post",
          label: "Facebook text post",
          status: payload.facebook_post_result.status,
          detail: payload.facebook_post_result.post_url || payload.facebook_post_result.post_id,
          href: payload.facebook_post_result.post_url || null,
        }
      : null,
    payload?.facebook_reel_result
      ? {
          key: "facebook-reel",
          label: "Facebook reel",
          status: payload.facebook_reel_result.status,
          detail: payload.facebook_reel_result.post_url || payload.facebook_reel_result.video_id,
          href: payload.facebook_reel_result.post_url || null,
        }
      : null,
    payload?.instagram_post_result
      ? {
          key: "instagram-post",
          label: "Instagram image post",
          status: payload.instagram_post_result.status,
          detail: payload.instagram_post_result.permalink || payload.instagram_post_result.media_id,
          href: payload.instagram_post_result.permalink || null,
        }
      : null,
    payload?.instagram_reel_result
      ? {
          key: "instagram-reel",
          label: "Instagram reel",
          status: payload.instagram_reel_result.status,
          detail: payload.instagram_reel_result.permalink || payload.instagram_reel_result.media_id,
          href: payload.instagram_reel_result.permalink || null,
        }
      : null,
    payload?.tiktok_photo_result
      ? {
          key: "tiktok-photo",
          label: "TikTok photo post",
          status: payload.tiktok_photo_result.status,
          detail: payload.tiktok_photo_result.publish_id,
          href: null,
        }
      : null,
    payload?.tiktok_short_result
      ? {
          key: "tiktok-short",
          label: "TikTok short",
          status: payload.tiktok_short_result.status,
          detail: payload.tiktok_short_result.publish_id,
          href: null,
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    label: string;
    status: string;
    detail: string;
    href: string | null;
  }>;

  const pendingLanes = [
    { key: "wix", label: "Wix article", done: Boolean(payload?.wix_result) },
    { key: "youtube-sermon", label: "YouTube sermon", done: Boolean(payload?.youtube_result) },
    { key: "youtube-short", label: "YouTube Short", done: Boolean(payload?.youtube_short_result) },
    { key: "facebook-post", label: "Facebook text post", done: Boolean(payload?.facebook_post_result) },
    { key: "facebook-reel", label: "Facebook reel", done: Boolean(payload?.facebook_reel_result) },
    { key: "instagram-post", label: "Instagram image post", done: Boolean(payload?.instagram_post_result) },
    { key: "instagram-reel", label: "Instagram reel", done: Boolean(payload?.instagram_reel_result) },
    { key: "tiktok-photo", label: "TikTok photo post", done: Boolean(payload?.tiktok_photo_result) },
    { key: "tiktok-short", label: "TikTok short", done: Boolean(payload?.tiktok_short_result) },
  ].filter((lane) => !lane.done);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          eyebrow="Publish Results"
          title="Audit what already went out."
          description="This page is the publish ledger for the current project. Release no longer carries these saved outcomes in its side rail."
        />
        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-[1.75rem] border border-border/70 bg-surface/85 p-5">
            <p className="text-sm text-muted">Project</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">{project?.title || project?.id || "Untitled project"}</h2>
            <p className="mt-3 text-sm leading-7 text-muted">
              Saved publish responses are kept here so you can verify what already shipped before rerunning any manual lane.
            </p>
          </div>
          <div className="rounded-[1.75rem] border border-border/70 bg-background-alt p-5 text-sm">
            <p className="section-label">Draft activity</p>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3">
                <span className="text-muted">Published lanes</span>
                <Badge tone={publishedResults.length > 0 ? "success" : "info"}>{publishedResults.length}</Badge>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3">
                <span className="text-muted">Pending lanes</span>
                <Badge tone={pendingLanes.length === 0 ? "success" : "warning"}>{pendingLanes.length}</Badge>
              </div>
              <div className="rounded-2xl bg-surface px-4 py-4 text-muted">
                Last publishing draft save: {updatedAt || "No draft saved yet"}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {publishedResults.length === 0 ? (
        <Alert tone="info">
          No publish results have been saved for this project yet. Start from <Link href={`/projects/${projectId}/publish/release`} className="font-semibold text-brand hover:text-brand-strong">Release</Link> when you are ready to post.
        </Alert>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {publishedResults.map((result) => (
            <Card key={result.key}>
              <CardHeader eyebrow="Saved result" title={result.label} description="Most recent publish response captured for this lane." />
              <div className="mt-6 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-background-alt px-4 py-3">
                  <span className="text-muted">Status</span>
                  <Badge tone="success">{result.status}</Badge>
                </div>
                <div className="rounded-2xl bg-background-alt px-4 py-3 text-muted break-all">{result.detail}</div>
                {result.href ? (
                  <Link href={result.href} target="_blank" rel="noreferrer" className="inline-flex font-semibold text-brand hover:text-brand-strong">
                    Open published result
                  </Link>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader
          eyebrow="Pending"
          title="Lanes without a saved result yet"
          description="This keeps the audit trail honest about what still needs to be manually posted."
        />
        <div className="mt-6 grid gap-3 lg:grid-cols-3">
          {pendingLanes.map((lane) => (
            <div key={lane.key} className="rounded-2xl border border-border/70 bg-surface px-4 py-4 text-sm">
              <p className="font-medium text-ink">{lane.label}</p>
              <p className="mt-2 text-muted">No saved publish response yet.</p>
            </div>
          ))}
        </div>
      </Card>

      <Alert tone="info">
        Use <Link href={`/projects/${projectId}/publish/calendar`} className="font-semibold text-brand hover:text-brand-strong">Calendar</Link> for scheduling and <Link href={`/projects/${projectId}/publish/release`} className="font-semibold text-brand hover:text-brand-strong">Release</Link> for the actual manual publish actions.
      </Alert>
    </div>
  );
}