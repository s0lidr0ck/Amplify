"use client";

import Image from "next/image";
import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Button, LinkButton } from "@/components/ui/Button";
import { projects, type LibraryProject } from "@/lib/api";

type SortMode = "newest" | "oldest" | "title" | "speaker";
type SavedView = "all" | "recent" | "ready" | "reels";

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function formatRelative(value: string) {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return value;
  const diff = Date.now() - then;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "Updated recently";
  if (hours < 24) return `Updated ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Updated ${days}d ago`;
}

function normalizeSourceLabel(sourceType: string) {
  return sourceType === "youtube" ? "YouTube" : "Upload";
}

function getPreviewLabel(item: LibraryProject) {
  switch (item.preview_asset?.asset_kind) {
    case "reel_thumbnail":
      return "Reel thumbnail";
    case "final_reel":
      return "Finished reel";
    case "sermon_thumbnail":
      return "Sermon thumbnail";
    case "source_video":
      return "Source preview";
    default:
      return "No preview";
  }
}

function sortItems(items: LibraryProject[], mode: SortMode) {
  const copy = [...items];
  switch (mode) {
    case "oldest":
      copy.sort((a, b) => new Date(a.sermon_date).getTime() - new Date(b.sermon_date).getTime());
      break;
    case "title":
      copy.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "speaker":
      copy.sort((a, b) =>
        (a.speaker_display_name || a.speaker).localeCompare(b.speaker_display_name || b.speaker)
      );
      break;
    case "newest":
    default:
      copy.sort((a, b) => new Date(b.sermon_date).getTime() - new Date(a.sermon_date).getTime());
      break;
  }
  return copy;
}

export default function LibraryPage() {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [savedView, setSavedView] = useState<SavedView>("all");
  const [speakerFilter, setSpeakerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [hasReelOnly, setHasReelOnly] = useState(false);
  const [hasThumbnailOnly, setHasThumbnailOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkError, setBulkError] = useState("");

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setQuery(searchInput.trim()), 350);
    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    if (savedView === "all") return;
    if (savedView === "recent") {
      const recent = new Date();
      recent.setDate(recent.getDate() - 30);
      setFromDate(recent.toISOString().slice(0, 10));
      setToDate("");
      setHasReelOnly(false);
      setHasThumbnailOnly(false);
      setStatusFilter("all");
      setSortMode("newest");
      return;
    }
    if (savedView === "ready") {
      setHasReelOnly(true);
      setHasThumbnailOnly(true);
      setStatusFilter("all");
      setFromDate("");
      setToDate("");
      setSortMode("newest");
      return;
    }
    if (savedView === "reels") {
      setHasReelOnly(true);
      setHasThumbnailOnly(false);
      setStatusFilter("all");
      setFromDate("");
      setToDate("");
      setSortMode("newest");
    }
  }, [savedView]);

  function applySavedView(view: SavedView) {
    setSavedView(view);
    if (view === "all") {
      setSearchInput("");
      setSpeakerFilter("all");
      setStatusFilter("all");
      setSourceFilter("all");
      setFromDate("");
      setToDate("");
      setHasReelOnly(false);
      setHasThumbnailOnly(false);
      setSortMode("newest");
    }
  }

  const { data: items = [], isLoading, error } = useQuery({
    queryKey: [
      "library-projects",
      query,
      speakerFilter,
      statusFilter,
      sourceFilter,
      fromDate,
      toDate,
      hasReelOnly,
      hasThumbnailOnly,
    ],
    queryFn: () =>
      projects.library({
        q: query,
        speaker: speakerFilter,
        status: statusFilter,
        source_type: sourceFilter,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        has_reel: hasReelOnly || undefined,
        has_thumbnail: hasThumbnailOnly || undefined,
      }),
  });

  const speakerOptions = useMemo(() => {
    return Array.from(
      new Set(items.map((item) => item.speaker_display_name || item.speaker).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredItems = useMemo(() => sortItems(items, sortMode), [items, sortMode]);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => filteredItems.some((item) => item.id === id)));
  }, [filteredItems]);

  const summary = useMemo(() => {
    return {
      sermons: filteredItems.length,
      withReels: filteredItems.filter(
        (item) =>
          item.preview_asset?.asset_kind === "final_reel" || item.preview_asset?.asset_kind === "reel_thumbnail"
      ).length,
      youtubeSources: filteredItems.filter((item) => item.source_type === "youtube").length,
      withThumbnails: filteredItems.filter((item) =>
        ["sermon_thumbnail", "reel_thumbnail"].includes(item.preview_asset?.asset_kind || "")
      ).length,
      transcriptReady: filteredItems.filter((item) =>
        ["transcript_ready", "transcript_approved", "clips_ready", "package_ready", "reel_ready"].includes(item.status)
      ).length,
      publishReady: filteredItems.filter(
        (item) =>
          (item.preview_asset?.asset_kind === "reel_thumbnail" || item.preview_asset?.asset_kind === "final_reel") &&
          ["sermon_thumbnail", "reel_thumbnail"].includes(item.preview_asset?.asset_kind || "") || false
      ).length,
    };
  }, [filteredItems]);

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await projects.delete(id);
      }
    },
    onSuccess: async () => {
      setSelectedIds([]);
      await queryClient.invalidateQueries({ queryKey: ["library-projects"] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (error) => {
      setBulkError(error instanceof Error ? error.message : "Bulk delete failed.");
    },
  });

  function toggleSelected(projectId: string) {
    setSelectedIds((current) =>
      current.includes(projectId) ? current.filter((id) => id !== projectId) : [...current, projectId]
    );
  }

  function selectAllVisible() {
    setSelectedIds(filteredItems.map((item) => item.id));
  }

  return (
    <AppShell
      action={
        <>
          <Link href="/" className="text-sm font-medium text-muted hover:text-ink">
            Back to Home
          </Link>
          <LinkButton href="/projects/new">New Project</LinkButton>
        </>
      }
    >
      <main className="page-frame py-8 lg:py-10">
        <div className="page-stack">
          <PageHeader
            eyebrow="Library"
            title="Search the sermon library."
            description="Browse sermons as a visual catalog and search across titles, speaker metadata, transcript text, captions, blog drafts, packaging, and reel copy."
            actions={
              <>
                <Badge tone="brand">{summary.sermons} visible</Badge>
                <Badge tone="neutral">{summary.withReels} reel-ready</Badge>
                <Badge tone="neutral">{summary.withThumbnails} with thumbnails</Badge>
                <Badge tone="neutral">{summary.transcriptReady} transcript-ready</Badge>
              </>
            }
          />

          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <SavedViewButton active={savedView === "all"} onClick={() => applySavedView("all")}>
                All sermons
              </SavedViewButton>
              <SavedViewButton active={savedView === "recent"} onClick={() => applySavedView("recent")}>
                Recently preached
              </SavedViewButton>
              <SavedViewButton active={savedView === "ready"} onClick={() => applySavedView("ready")}>
                Ready to publish
              </SavedViewButton>
              <SavedViewButton active={savedView === "reels"} onClick={() => applySavedView("reels")}>
                Reels complete
              </SavedViewButton>
            </div>
          </Card>

          <Card>
            <div className="space-y-5">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_repeat(4,minmax(0,0.52fr))]">
                <label className="block text-sm font-medium text-gray-700">
                  Search everything in the sermon workspace
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Search metadata, captions, blog drafts, transcripts, packaging, reel copy..."
                    className="mt-2 w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm"
                  />
                </label>

                <label className="block text-sm font-medium text-gray-700">
                  Speaker
                  <select
                    value={speakerFilter}
                    onChange={(event) => setSpeakerFilter(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm"
                  >
                    <option value="all">All speakers</option>
                    {speakerOptions.map((speaker) => (
                      <option key={speaker} value={speaker}>
                        {speaker}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm font-medium text-gray-700">
                  Source
                  <select
                    value={sourceFilter}
                    onChange={(event) => setSourceFilter(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm"
                  >
                    <option value="all">All sources</option>
                    <option value="upload">Uploads</option>
                    <option value="youtube">YouTube</option>
                  </select>
                </label>

                <label className="block text-sm font-medium text-gray-700">
                  Status
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm"
                  >
                    <option value="all">All statuses</option>
                    <option value="draft">Draft</option>
                    <option value="source_ready">Source ready</option>
                    <option value="sermon_ready">Sermon ready</option>
                    <option value="transcript_ready">Transcript ready</option>
                    <option value="transcript_approved">Transcript approved</option>
                    <option value="clips_ready">Clips ready</option>
                    <option value="package_ready">Package ready</option>
                    <option value="reel_ready">Reel ready</option>
                  </select>
                </label>

                <label className="block text-sm font-medium text-gray-700">
                  Sort
                  <select
                    value={sortMode}
                    onChange={(event) => setSortMode(event.target.value as SortMode)}
                    className="mt-2 w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm"
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="title">Title A-Z</option>
                    <option value="speaker">Speaker A-Z</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-4 xl:grid-cols-[repeat(2,minmax(0,0.7fr))_repeat(2,minmax(0,0.8fr))]">
                <label className="block text-sm font-medium text-gray-700">
                  From date
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(event) => setFromDate(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm"
                  />
                </label>

                <label className="block text-sm font-medium text-gray-700">
                  To date
                  <input
                    type="date"
                    value={toDate}
                    onChange={(event) => setToDate(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm"
                  />
                </label>

                <label className="flex items-center gap-3 rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={hasReelOnly}
                    onChange={(event) => setHasReelOnly(event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Only sermons with finished reels
                </label>

                <label className="flex items-center gap-3 rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={hasThumbnailOnly}
                    onChange={(event) => setHasThumbnailOnly(event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Only sermons with uploaded thumbnails
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                <span className="rounded-full bg-surface px-3 py-1">{summary.youtubeSources} YouTube sources</span>
                <span className="rounded-full bg-surface px-3 py-1">Search covers transcript + generated drafts</span>
                {(searchInput ||
                  speakerFilter !== "all" ||
                  statusFilter !== "all" ||
                  sourceFilter !== "all" ||
                  fromDate ||
                  toDate ||
                  hasReelOnly ||
                  hasThumbnailOnly) ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSearchInput("");
                      applySavedView("all");
                      setSpeakerFilter("all");
                      setStatusFilter("all");
                      setSourceFilter("all");
                      setFromDate("");
                      setToDate("");
                      setHasReelOnly(false);
                      setHasThumbnailOnly(false);
                      setSortMode("newest");
                    }}
                  >
                    Reset Filters
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Visible sermons" value={summary.sermons} helper="Current filtered view" />
            <MetricCard label="Transcript-ready" value={summary.transcriptReady} helper="Transcript or beyond" />
            <MetricCard label="With reels" value={summary.withReels} helper="Final reel or reel thumbnail" />
            <MetricCard label="With thumbnails" value={summary.withThumbnails} helper="Uploaded cover art" />
            <MetricCard label="YouTube sources" value={summary.youtubeSources} helper="Imported from URL" />
          </div>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="section-label">Bulk Actions</p>
                <p className="text-sm text-muted">{selectedIds.length} selected in this view.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={selectAllVisible} disabled={filteredItems.length === 0}>
                  Select Visible
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setSelectedIds([])}
                  disabled={selectedIds.length === 0}
                >
                  Clear Selection
                </Button>
                <Button
                  onClick={() => {
                    setBulkError("");
                    bulkDeleteMutation.mutate(selectedIds);
                  }}
                  disabled={selectedIds.length === 0 || bulkDeleteMutation.isPending}
                >
                  {bulkDeleteMutation.isPending ? "Deleting..." : "Delete Selected"}
                </Button>
              </div>
            </div>
            {bulkError ? <div className="mt-4"><Alert tone="danger">{bulkError}</Alert></div> : null}
          </Card>

          {error ? <Alert tone="danger">{error instanceof Error ? error.message : "Library search failed."}</Alert> : null}
          {isLoading ? <Alert tone="info">Loading sermon library.</Alert> : null}
          {!isLoading && filteredItems.length === 0 ? (
            <Alert tone="warning" title={query ? "No matches found" : "No sermons yet"}>
              {query ||
              speakerFilter !== "all" ||
              statusFilter !== "all" ||
              sourceFilter !== "all" ||
              fromDate ||
              toDate ||
              hasReelOnly ||
              hasThumbnailOnly
                ? "Try a broader search or clear the filters to widen the catalog."
                : "Create a project and bring in a sermon to start building the library."}
            </Alert>
          ) : null}

          <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
            {filteredItems.map((item) => (
              <LibraryCard
                key={item.id}
                item={item}
                selected={selectedIds.includes(item.id)}
                onToggleSelected={() => toggleSelected(item.id)}
              />
            ))}
          </div>
        </div>
      </main>
    </AppShell>
  );
}

function LibraryCard({
  item,
  selected,
  onToggleSelected,
}: {
  item: LibraryProject;
  selected: boolean;
  onToggleSelected: () => void;
}) {
  const speakerLabel = item.speaker_display_name || item.speaker;
  const previewTone =
    item.preview_asset?.asset_kind === "reel_thumbnail" || item.preview_asset?.asset_kind === "final_reel"
      ? "success"
      : "neutral";

  return (
    <div
      className={`group overflow-hidden rounded-[1.75rem] border bg-white transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[0_24px_64px_rgba(15,23,42,0.08)] ${
        selected ? "border-brand shadow-[0_0_0_2px_rgba(249,115,22,0.15)]" : "border-border/80"
      }`}
    >
      <div className="relative overflow-hidden bg-surface-strong/60">
        <button
          type="button"
          onClick={onToggleSelected}
          className="absolute left-4 top-4 z-10 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-ink shadow"
        >
          {selected ? "Selected" : "Select"}
        </button>
        {item.preview_asset ? (
          item.preview_asset.mime_type?.startsWith("image/") ? (
            <Image
              src={item.preview_asset.playback_url}
              alt={item.preview_asset.filename}
              width={640}
              height={360}
              className="aspect-video h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
              unoptimized
            />
          ) : (
            <video
              src={item.preview_asset.playback_url}
              className="aspect-video h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
              muted
              preload="metadata"
            />
          )
        ) : (
          <div className="flex aspect-video items-center justify-center bg-surface-tint px-4 text-center text-sm text-muted">
            No visual preview yet
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-4">
          <Badge tone={previewTone}>{getPreviewLabel(item)}</Badge>
          <Badge tone="neutral">{normalizeSourceLabel(item.source_type)}</Badge>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="space-y-2">
          <p className="section-label">Sermon Library</p>
          <h2 className="line-clamp-2 text-xl font-semibold text-ink">{item.title}</h2>
          <p className="text-sm text-muted">
            {speakerLabel} | {formatDate(item.sermon_date)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge tone="brand">{item.status}</Badge>
          <Badge tone="neutral">{formatRelative(item.updated_at)}</Badge>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-muted">
          {item.preview_asset?.filename ? (
            <span className="rounded-full bg-surface px-3 py-1">{item.preview_asset.filename}</span>
          ) : null}
          {item.source_url ? <span className="rounded-full bg-surface px-3 py-1">Imported from YouTube</span> : null}
        </div>

        {item.search_match ? (
          <div className="rounded-[1.25rem] border border-border/80 bg-surface p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
                  Match in {item.search_match.field.replace(/_/g, " ")}
                </p>
                <p className="mt-2 text-sm leading-6 text-ink">{item.search_match.excerpt}</p>
              </div>
              <Link
                href={item.search_match.target_href}
                className="shrink-0 rounded-full border border-border bg-white px-3 py-1 text-xs font-semibold text-ink transition hover:border-brand hover:text-brand"
              >
                Open Match
              </Link>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 pt-1">
          <Link
            href={`/projects/${item.id}/source`}
            className="rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-brand hover:text-brand"
          >
            Open Project
          </Link>
          {item.search_match && item.search_match.target_href !== `/projects/${item.id}/source` ? (
            <Link
              href={item.search_match.target_href}
              className="text-sm font-medium text-muted transition hover:text-ink"
            >
              Jump to match
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SavedViewButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
        active ? "bg-brand text-white" : "bg-surface text-ink hover:bg-surface-strong"
      }`}
    >
      {children}
    </button>
  );
}

function MetricCard({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <Card>
      <div className="space-y-2">
        <p className="section-label">{label}</p>
        <p className="text-3xl font-semibold text-ink">{value}</p>
        <p className="text-sm text-muted">{helper}</p>
      </div>
    </Card>
  );
}
