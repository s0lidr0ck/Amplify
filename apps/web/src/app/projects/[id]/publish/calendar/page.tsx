"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { projects, type Project } from "@/lib/api";
import {
  loadProjectDraft,
  saveProjectDraft,
  type BlogDraft,
  type FacebookDraft,
  type PackagingDraft,
  type PublishingDraft,
  type ReelDraft,
  type ScheduledPublishItem,
} from "@/lib/projectDrafts";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";

type CalendarTemplate = {
  id: string;
  label: string;
  platform: ScheduledPublishItem["platform"];
  postType: ScheduledPublishItem["post_type"];
  assetRef: string;
  ready: boolean;
  detail: string;
};

type UnifiedScheduledItem = ScheduledPublishItem & {
  project_id: string;
  project_title: string;
  source_kind: "scheduled" | "synced";
};

type CalendarData = {
  projects: Project[];
  publishingByProject: Record<string, PublishingDraft>;
  items: UnifiedScheduledItem[];
};

type PublishMetricEntry = {
  platform?: ScheduledPublishItem["platform"];
  post_type?: ScheduledPublishItem["post_type"];
  published_at?: string;
  source?: string;
};

const weekdayLabel = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const slotMinutes = [0, 30] as const;

const emptyPublishingDraft: PublishingDraft = {
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
  schedule_items: [],
  wix_result: null,
  youtube_short_result: null,
  youtube_result: null,
  facebook_post_result: null,
  facebook_reel_result: null,
  instagram_reel_result: null,
  instagram_post_result: null,
  tiktok_short_result: null,
  tiktok_photo_result: null,
};

function toLocalInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function parseLocalDateTime(value: string) {
  return new Date(value);
}

function startOfWeek(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  const day = next.getDay();
  const diff = (day + 6) % 7;
  next.setDate(next.getDate() - diff);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isSameHalfHour(date: Date, day: Date, hour: number, minute: number) {
  return (
    date.getFullYear() === day.getFullYear() &&
    date.getMonth() === day.getMonth() &&
    date.getDate() === day.getDate() &&
    date.getHours() === hour &&
    date.getMinutes() >= minute &&
    date.getMinutes() < minute + 30
  );
}

function displayHalfHour(hour: number, minute: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const normalized = hour % 12 === 0 ? 12 : hour % 12;
  return `${normalized}:${minute === 0 ? "00" : "30"} ${suffix}`;
}

function formatWeekRange(weekStartDate: Date) {
  const weekEnd = addDays(weekStartDate, 6);
  return `${weekStartDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })} - ${weekEnd.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

export default function PublishCalendarPage() {
  const params = useParams();
  const currentProjectId = params.id as string;
  const [weekStartDate, setWeekStartDate] = useState(() => startOfWeek(new Date()));
  const [selectedProjectId, setSelectedProjectId] = useState(currentProjectId);
  const [selectedDateTime, setSelectedDateTime] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [allScheduleItems, setAllScheduleItems] = useState<UnifiedScheduledItem[]>([]);

  const allCalendarQuery = useQuery({
    queryKey: ["publishing-calendar-all-projects"],
    queryFn: async (): Promise<CalendarData> => {
      const allProjects = await projects.list();
      const draftRows = await Promise.all(
        allProjects.map(async (project) => ({
          project,
          publishingRow: await projects.getDraft<PublishingDraft>(project.id, "publishing"),
          metricsRow: await projects.getDraft<{ entries?: PublishMetricEntry[] }>(project.id, "publish_metrics"),
        }))
      );

      const publishingByProject: Record<string, PublishingDraft> = {};
      const items: UnifiedScheduledItem[] = [];

      for (const entry of draftRows) {
        const publishingPayload = entry.publishingRow?.payload;
        if (publishingPayload) {
          publishingByProject[entry.project.id] = publishingPayload;
          for (const item of publishingPayload.schedule_items ?? []) {
            items.push({
              ...item,
              project_id: entry.project.id,
              project_title: entry.project.title,
              source_kind: "scheduled",
            });
          }
        }

        const metricEntries = entry.metricsRow?.payload?.entries;
        if (Array.isArray(metricEntries)) {
          for (const metric of metricEntries) {
            const startsAt = typeof metric?.published_at === "string" ? metric.published_at : "";
            if (!startsAt) continue;
            const platform = metric?.platform;
            if (!platform || !["wix", "youtube", "facebook", "instagram", "tiktok"].includes(platform)) continue;
            const postType = (metric?.post_type ?? "post") as ScheduledPublishItem["post_type"];
            const label = `${platform.toUpperCase()} ${postType.replace(/_/g, " ")}`;
            items.push({
              id: `synced-${entry.project.id}-${platform}-${postType}-${startsAt}`,
              starts_at: startsAt,
              platform,
              post_type: postType,
              asset_ref: "history_sync",
              label,
              status: "posted",
              project_id: entry.project.id,
              project_title: entry.project.title,
              source_kind: "synced",
            });
          }
        }
      }

      items.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
      return { projects: allProjects, publishingByProject, items };
    },
  });

  const { data: selectedProject } = useQuery({
    queryKey: ["project", selectedProjectId],
    queryFn: () => projects.get(selectedProjectId),
    enabled: Boolean(selectedProjectId),
  });

  const { data: blogDraftRow } = useQuery({
    queryKey: ["project-draft", selectedProjectId, "blog"],
    queryFn: () => projects.getDraft<BlogDraft>(selectedProjectId, "blog"),
    enabled: Boolean(selectedProjectId),
  });

  const { data: packagingDraftRow } = useQuery({
    queryKey: ["project-draft", selectedProjectId, "packaging"],
    queryFn: () => projects.getDraft<PackagingDraft>(selectedProjectId, "packaging"),
    enabled: Boolean(selectedProjectId),
  });

  const { data: facebookDraftRow } = useQuery({
    queryKey: ["project-draft", selectedProjectId, "facebook"],
    queryFn: () => projects.getDraft<FacebookDraft>(selectedProjectId, "facebook"),
    enabled: Boolean(selectedProjectId),
  });

  const { data: reelDraftRow } = useQuery({
    queryKey: ["project-draft", selectedProjectId, "reel"],
    queryFn: () => projects.getDraft<ReelDraft>(selectedProjectId, "reel"),
    enabled: Boolean(selectedProjectId),
  });

  const { data: sermonAsset } = useQuery({
    queryKey: ["sermon-asset", selectedProjectId],
    queryFn: () => projects.getSermonAsset(selectedProjectId),
    enabled: Boolean(selectedProjectId),
  });

  const { data: reelAsset } = useQuery({
    queryKey: ["reel-asset", selectedProjectId],
    queryFn: () => projects.getReelAsset(selectedProjectId),
    enabled: Boolean(selectedProjectId),
  });

  const { data: sermonThumbnailAsset } = useQuery({
    queryKey: ["sermon-thumbnail-asset", selectedProjectId],
    queryFn: () => projects.getSermonThumbnailAsset(selectedProjectId),
    enabled: Boolean(selectedProjectId),
  });

  const { data: reelThumbnailAsset } = useQuery({
    queryKey: ["reel-thumbnail-asset", selectedProjectId],
    queryFn: () => projects.getReelThumbnailAsset(selectedProjectId),
    enabled: Boolean(selectedProjectId),
  });

  const saveScheduleMutation = useMutation({
    mutationFn: async ({
      targetProjectId,
      items,
      date,
    }: {
      targetProjectId: string;
      items: ScheduledPublishItem[];
      date: string;
    }) => {
      const persisted =
        allCalendarQuery.data?.publishingByProject[targetProjectId] ??
        (await projects.getDraft<PublishingDraft>(targetProjectId, "publishing"))?.payload ??
        loadProjectDraft<PublishingDraft>(targetProjectId, "publishing") ??
        emptyPublishingDraft;

      const nextDraft: PublishingDraft = {
        ...emptyPublishingDraft,
        ...persisted,
        publish_date: date,
        schedule_items: items,
      };
      saveProjectDraft(targetProjectId, "publishing", nextDraft);
      return projects.saveDraft(targetProjectId, "publishing", nextDraft);
    },
    onSuccess: (saved, variables) => {
      const projectTitle =
        allCalendarQuery.data?.projects.find((project) => project.id === variables.targetProjectId)?.title ?? "Project";
      setAllScheduleItems((prev) => {
        const kept = prev.filter((item) => item.project_id !== variables.targetProjectId);
        const mapped = (saved.payload.schedule_items ?? []).map((item) => ({
          ...item,
          project_id: variables.targetProjectId,
          project_title: projectTitle,
          source_kind: "scheduled" as const,
        }));
        return [...kept, ...mapped].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
      });
    },
  });

  useEffect(() => {
    if (allCalendarQuery.data?.items) {
      setAllScheduleItems(allCalendarQuery.data.items);
    }
  }, [allCalendarQuery.data?.items]);

  useEffect(() => {
    if (!selectedDateTime) {
      const now = new Date();
      now.setMinutes(now.getMinutes() < 30 ? 30 : 0, 0, 0);
      if (now.getMinutes() === 0) now.setHours(now.getHours() + 1);
      setSelectedDateTime(toLocalInputValue(now));
    }
  }, [selectedDateTime]);

  const packagingDraft = packagingDraftRow?.payload;
  const facebookDraft = facebookDraftRow?.payload;
  const reelDraft = reelDraftRow?.payload;
  const blogDraft = blogDraftRow?.payload;

  const templates = useMemo<CalendarTemplate[]>(() => {
    const hasAnyThumb = Boolean(sermonThumbnailAsset || reelThumbnailAsset);
    return [
      {
        id: "wix_article",
        label: "Wix Article",
        platform: "wix",
        postType: "wix_article",
        assetRef: "blog_draft",
        ready: Boolean(blogDraft?.markdown?.trim()),
        detail: "Blog draft package",
      },
      {
        id: "youtube_sermon",
        label: "YouTube Sermon",
        platform: "youtube",
        postType: "youtube_sermon",
        assetRef: "sermon_asset",
        ready: Boolean(sermonAsset && packagingDraft?.title?.trim() && packagingDraft?.description?.trim()),
        detail: "Sermon video package",
      },
      {
        id: "youtube_short",
        label: "YouTube Short",
        platform: "youtube",
        postType: "youtube_short",
        assetRef: "reel_asset",
        ready: Boolean(reelAsset && reelDraft?.platforms?.youtube?.description?.trim()),
        detail: "Final reel package",
      },
      {
        id: "facebook_text",
        label: "Facebook Text Post",
        platform: "facebook",
        postType: "facebook_text",
        assetRef: "facebook_copy",
        ready: Boolean(facebookDraft?.post?.trim()),
        detail: "Generated Facebook copy",
      },
      {
        id: "facebook_reel",
        label: "Facebook Reel",
        platform: "facebook",
        postType: "facebook_reel",
        assetRef: "reel_asset",
        ready: Boolean(reelAsset && reelDraft?.platforms?.facebook?.description?.trim()),
        detail: "Final reel package",
      },
      {
        id: "instagram_image",
        label: "Instagram Image",
        platform: "instagram",
        postType: "instagram_image",
        assetRef: "thumbnail_asset",
        ready: Boolean(hasAnyThumb && (reelDraft?.platforms?.instagram?.description?.trim() || packagingDraft?.description?.trim())),
        detail: "Thumbnail plus caption",
      },
      {
        id: "instagram_reel",
        label: "Instagram Reel",
        platform: "instagram",
        postType: "instagram_reel",
        assetRef: "reel_asset",
        ready: Boolean(reelAsset && reelDraft?.platforms?.instagram?.description?.trim()),
        detail: "Final reel package",
      },
      {
        id: "tiktok_photo",
        label: "TikTok Photo",
        platform: "tiktok",
        postType: "tiktok_photo",
        assetRef: "thumbnail_asset",
        ready: Boolean(hasAnyThumb && reelDraft?.platforms?.tiktok?.title?.trim() && reelDraft?.platforms?.tiktok?.description?.trim()),
        detail: "Thumbnail plus title/description",
      },
      {
        id: "tiktok_short",
        label: "TikTok Short",
        platform: "tiktok",
        postType: "tiktok_short",
        assetRef: "reel_asset",
        ready: Boolean(reelAsset && reelDraft?.platforms?.tiktok?.description?.trim()),
        detail: "Final reel package",
      },
    ];
  }, [blogDraft?.markdown, facebookDraft?.post, packagingDraft?.description, packagingDraft?.title, reelAsset, reelDraft?.platforms, reelThumbnailAsset, sermonAsset, sermonThumbnailAsset]);

  useEffect(() => {
    const firstReady = templates.find((template) => template.ready);
    if (firstReady) setSelectedTemplateId(firstReady.id);
  }, [selectedProjectId, templates]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, idx) => addDays(weekStartDate, idx)), [weekStartDate]);
  const halfHourSlots = useMemo(
    () =>
      Array.from({ length: 48 }, (_, index) => ({
        hour: Math.floor(index / 2),
        minute: slotMinutes[index % 2],
      })),
    []
  );

  const templateById = useMemo(() => new Map(templates.map((template) => [template.id, template])), [templates]);
  const selectedTemplate = selectedTemplateId ? templateById.get(selectedTemplateId) : null;

  const scheduledThisWeek = useMemo(
    () =>
      allScheduleItems
        .map((item) => ({ ...item, date: new Date(item.starts_at) }))
        .filter((item) => item.date >= weekStartDate && item.date < addDays(weekStartDate, 7)),
    [allScheduleItems, weekStartDate]
  );

  const openSlotComposer = (dateValue: string) => {
    setSelectedDateTime(dateValue);
    setComposerOpen(true);
  };

  const addScheduledItem = () => {
    if (!selectedDateTime || !selectedTemplate || !selectedTemplate.ready || !selectedProjectId) return;

    const slotDate = parseLocalDateTime(selectedDateTime);
    const projectItems = allScheduleItems
      .filter((item) => item.project_id === selectedProjectId && item.source_kind === "scheduled")
      .map<ScheduledPublishItem>((item) => ({
        id: item.id,
        starts_at: item.starts_at,
        platform: item.platform,
        post_type: item.post_type,
        asset_ref: item.asset_ref,
        label: item.label,
        status: item.status,
      }));

    const nextItem: ScheduledPublishItem = {
      id: `${selectedTemplate.id}-${slotDate.getTime()}-${Math.random().toString(16).slice(2, 7)}`,
      starts_at: slotDate.toISOString(),
      platform: selectedTemplate.platform,
      post_type: selectedTemplate.postType,
      asset_ref: selectedTemplate.assetRef,
      label: selectedTemplate.label,
      status: "scheduled",
    };

    const nextItems = [...projectItems, nextItem].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const dateOnly = selectedDateTime.slice(0, 10);

    saveScheduleMutation.mutate({
      targetProjectId: selectedProjectId,
      items: nextItems,
      date: dateOnly,
    });
    setComposerOpen(false);
  };

  const removeScheduledItem = (itemToRemove: UnifiedScheduledItem) => {
    const nextItemsForProject = allScheduleItems
      .filter((item) => item.project_id === itemToRemove.project_id && item.id !== itemToRemove.id)
      .map<ScheduledPublishItem>((item) => ({
        id: item.id,
        starts_at: item.starts_at,
        platform: item.platform,
        post_type: item.post_type,
        asset_ref: item.asset_ref,
        label: item.label,
        status: item.status,
      }));

    const savedDraft = allCalendarQuery.data?.publishingByProject[itemToRemove.project_id];
    const date = savedDraft?.publish_date ?? itemToRemove.starts_at.slice(0, 10);
    saveScheduleMutation.mutate({
      targetProjectId: itemToRemove.project_id,
      items: nextItemsForProject,
      date,
    });
  };

  const moveWeek = (offset: number) => setWeekStartDate(addDays(weekStartDate, offset * 7));
  const goToThisWeek = () => setWeekStartDate(startOfWeek(new Date()));

  const readyTemplateCount = templates.filter((template) => template.ready).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          eyebrow="Unified Publish Calendar"
          title="One board for every project"
          description="30-minute scheduling across 24 hours. Click any slot to open the quick scheduler popup."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => moveWeek(-1)}>
                Prev week
              </Button>
              <Button size="sm" variant="secondary" onClick={goToThisWeek}>
                This week
              </Button>
              <Button size="sm" variant="secondary" onClick={() => moveWeek(1)}>
                Next week
              </Button>
            </div>
          }
        />
        <div className="mt-4 flex flex-wrap gap-3">
          <Badge tone="info">{formatWeekRange(weekStartDate)}</Badge>
          <Badge tone={readyTemplateCount > 0 ? "success" : "warning"}>{readyTemplateCount} lanes ready for selected project</Badge>
          <Badge tone="brand">{allScheduleItems.length} total scheduled</Badge>
          <Badge tone="info">{allCalendarQuery.data?.projects.length ?? 0} projects tracked</Badge>
        </div>
      </Card>

      {saveScheduleMutation.isSuccess ? <Alert tone="success">Schedule updated.</Alert> : null}
      {saveScheduleMutation.isError ? (
        <Alert tone="danger">{saveScheduleMutation.error instanceof Error ? saveScheduleMutation.error.message : "Unable to update schedule."}</Alert>
      ) : null}

      <Card>
        <CardHeader
          eyebrow="Week Grid"
          title="24-hour weekly view"
          description="Color badges in each slot show what is already booked across all projects."
        />
        <div className="mt-6 overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[74px_repeat(7,minmax(120px,1fr))] gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              <div className="px-2 py-1">Time</div>
              {days.map((day) => (
                <div key={day.toISOString()} className="rounded-xl bg-background-alt px-2 py-1.5 text-center">
                  {weekdayLabel[day.getDay()]} {day.getDate()}
                </div>
              ))}
            </div>
            <div className="mt-1 space-y-1">
              {halfHourSlots.map(({ hour, minute }) => (
                <div key={`${hour}-${minute}`} className="grid grid-cols-[74px_repeat(7,minmax(120px,1fr))] gap-1.5">
                  <div className="px-2 pt-1 text-[11px] text-muted">{minute === 0 ? displayHalfHour(hour, minute) : ""}</div>
                  {days.map((day) => {
                    const slotDate = new Date(day);
                    slotDate.setHours(hour, minute, 0, 0);
                    const slotValue = toLocalInputValue(slotDate);
                    const slotItems = scheduledThisWeek.filter((item) => isSameHalfHour(item.date, day, hour, minute));
                    return (
                      <button
                        key={`${day.toISOString()}-${hour}-${minute}`}
                        type="button"
                        onClick={() => openSlotComposer(slotValue)}
                        className="h-9 rounded-lg border border-border/70 bg-surface px-1.5 text-left transition hover:border-brand/40 hover:bg-background-alt"
                      >
                        {slotItems.length > 0 ? (
                          <div className="flex items-center gap-1 overflow-hidden">
                            <Badge tone="brand">{slotItems.length}</Badge>
                            <span className="truncate text-[11px] text-ink">{slotItems[0].project_title}</span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-muted">+</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          eyebrow="Scheduled Queue"
          title="Upcoming schedule + synced history"
          description="Scheduled items can be removed. Synced history rows are read-only and come from platform metrics."
        />
        {allScheduleItems.length === 0 ? (
          <div className="mt-6 rounded-2xl bg-background-alt px-4 py-6 text-sm text-muted">No scheduled items yet.</div>
        ) : (
          <div className="mt-6 space-y-3">
            {allScheduleItems.map((item) => {
              const when = new Date(item.starts_at);
              return (
                <div key={`${item.project_id}-${item.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-surface px-4 py-4 text-sm">
                  <div>
                    <p className="font-medium text-ink">{item.label}</p>
                    <p className="mt-1 text-muted">
                      {item.project_title} - {when.toLocaleDateString()} at {when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} - {item.platform}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={item.source_kind === "scheduled" ? "info" : "success"}>
                      {item.source_kind === "scheduled" ? item.status : "synced"}
                    </Badge>
                    {item.source_kind === "scheduled" ? (
                      <Button size="sm" variant="secondary" onClick={() => removeScheduledItem(item)} disabled={saveScheduleMutation.isPending}>
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Alert tone="info">
        Use <Link href={`/projects/${currentProjectId}/publish/release`} className="font-semibold text-brand hover:text-brand-strong">Release</Link> to run manual posting actions, and <Link href={`/projects/${currentProjectId}/publish/results`} className="font-semibold text-brand hover:text-brand-strong">Results</Link> to audit publish outcomes.
      </Alert>

      {composerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4">
          <div className="w-full max-w-xl rounded-3xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Schedule Slot</p>
                <h3 className="mt-2 text-xl font-semibold text-ink">Plan this publish slot</h3>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setComposerOpen(false)}>
                Close
              </Button>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="space-y-2 text-sm">
                <span className="font-medium text-ink">Project</span>
                <select
                  value={selectedProjectId}
                  onChange={(event) => setSelectedProjectId(event.target.value)}
                  className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                >
                  {(allCalendarQuery.data?.projects ?? []).map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 text-sm">
                <span className="font-medium text-ink">Time slot</span>
                <input
                  type="datetime-local"
                  value={selectedDateTime}
                  onChange={(event) => setSelectedDateTime(event.target.value)}
                  className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                />
              </label>

              <label className="space-y-2 text-sm">
                <span className="font-medium text-ink">Post lane</span>
                <select
                  value={selectedTemplateId}
                  onChange={(event) => setSelectedTemplateId(event.target.value)}
                  className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.label} - {template.ready ? "Ready" : "Blocked"}
                    </option>
                  ))}
                </select>
              </label>

              {selectedTemplate ? (
                <div className="rounded-2xl bg-background-alt px-4 py-4 text-sm">
                  <p className="font-medium text-ink">{selectedTemplate.label}</p>
                  <p className="mt-2 text-muted">{selectedTemplate.detail}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <Badge tone={selectedTemplate.ready ? "success" : "warning"}>{selectedTemplate.ready ? "Ready" : "Blocked"}</Badge>
                    {selectedProject ? <Badge tone="info">{selectedProject.title}</Badge> : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setComposerOpen(false)}>
                Cancel
              </Button>
              <Button onClick={addScheduledItem} disabled={!selectedTemplate || !selectedTemplate.ready || !selectedDateTime || saveScheduleMutation.isPending}>
                {saveScheduleMutation.isPending ? "Saving..." : "Schedule"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}


