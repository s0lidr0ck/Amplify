"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clips, getMediaPlaybackUrl, jobs, projects, transcript } from "@/lib/api";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { GenerateModePanel } from "@/components/generate/GenerateModePanel";
import { ActivityDock } from "@/components/workflow/ActivityDock";
import { JobStatusPanel } from "@/components/workflow/JobStatusPanel";
import { StepIntro } from "@/components/workflow/StepIntro";

const DEFAULT_MODEL =
  "arn:aws:bedrock:us-east-1:644190502535:inference-profile/us.anthropic.claude-sonnet-4-6";

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function formatScore(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "n/a";
  return value.toFixed(2);
}

function titleize(key: string) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value == null) return "Unspecified";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => formatValue(item)).join(", ");
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, nested]) => `${titleize(key)}: ${formatValue(nested)}`)
      .join(" | ");
  }
  return String(value);
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
      <path d="M8 6.82v10.36c0 .79.87 1.27 1.54.84l8.14-5.18a1 1 0 0 0 0-1.68L9.54 5.98A1 1 0 0 0 8 6.82Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
      <path d="M7 5h3a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm7 0h3a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

export default function ClipsPage() {
  const params = useParams();
  const projectId = params.id as string;
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [host, setHost] = useState("us-east-1");
  const [candidateLimit, setCandidateLimit] = useState(24);
  const [outputCount, setOutputCount] = useState(10);
  const [analysisJobId, setAnalysisJobId] = useState<string | null>(null);
  const [artifactJobId, setArtifactJobId] = useState<string | null>(null);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [artifactLogMessages, setArtifactLogMessages] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerPanelHeight, setPlayerPanelHeight] = useState<number | null>(null);
  const playerPanelRef = useRef<HTMLDivElement>(null);

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projects.get(projectId),
  });

  const { data: transcriptData } = useQuery({
    queryKey: ["transcript", projectId],
    queryFn: () => transcript.getForProject(projectId),
  });

  const { data: sermonAsset } = useQuery({
    queryKey: ["sermon-asset", projectId],
    queryFn: () => projects.getSermonAsset(projectId),
  });

  const { data: artifactStatus } = useQuery({
    queryKey: ["transcript-artifacts", transcriptData?.id],
    queryFn: () => transcript.getArtifactStatus(transcriptData!.id),
    enabled: !!transcriptData?.id,
  });

  const { data: projectJobs = [] } = useQuery({
    queryKey: ["jobs", projectId],
    queryFn: () => jobs.listForProject(projectId),
    refetchInterval: 2000,
  });

  const latestArtifactJob =
    [...projectJobs]
      .filter((job) => job.job_type === "prepare_clip_artifacts")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;

  useEffect(() => {
    if (!artifactJobId && latestArtifactJob?.id) {
      setArtifactJobId(latestArtifactJob.id);
    }
  }, [artifactJobId, latestArtifactJob?.id]);

  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["clip-candidates", projectId],
    queryFn: () => clips.listCandidates(projectId),
  });

  useEffect(() => {
    if (!selectedCandidateId && candidates[0]?.id) {
      setSelectedCandidateId(candidates[0].id);
    }
    if (selectedCandidateId && !candidates.some((candidate) => candidate.id === selectedCandidateId)) {
      setSelectedCandidateId(candidates[0]?.id ?? null);
    }
  }, [candidates, selectedCandidateId]);

  const selectedCandidate =
    candidates.find((candidate) => candidate.id === selectedCandidateId) ?? candidates[0] ?? null;

  const { data: selectedCandidateDetail } = useQuery({
    queryKey: ["clip-candidate", selectedCandidate?.id],
    queryFn: () => clips.getCandidate(selectedCandidate!.id),
    enabled: !!selectedCandidate?.id,
  });

  const { data: analysisJob } = useQuery({
    queryKey: ["job", analysisJobId],
    queryFn: () => jobs.get(analysisJobId!),
    enabled: !!analysisJobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" || status === "failed" ? false : 2000;
    },
  });

  const { data: analysisEvents = [] } = useQuery({
    queryKey: ["job-events", analysisJobId],
    queryFn: () => jobs.getEvents(analysisJobId!),
    enabled: !!analysisJobId,
    refetchInterval: () => {
      const status = analysisJob?.status;
      return status === "completed" || status === "failed" ? false : 2000;
    },
  });

  const { data: artifactJob } = useQuery({
    queryKey: ["job", artifactJobId],
    queryFn: () => jobs.get(artifactJobId!),
    enabled: !!artifactJobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" || status === "failed" ? false : 2000;
    },
  });

  const { data: artifactEvents = [] } = useQuery({
    queryKey: ["job-events", artifactJobId],
    queryFn: () => jobs.getEvents(artifactJobId!),
    enabled: !!artifactJobId,
    refetchInterval: () => {
      const status = artifactJob?.status;
      return status === "completed" || status === "failed" ? false : 2000;
    },
  });

  useEffect(() => {
    if (analysisJob?.status === "completed") {
      queryClient.invalidateQueries({ queryKey: ["clip-candidates", projectId] });
    }
  }, [analysisJob?.status, projectId, queryClient]);

  useEffect(() => {
    if (artifactJob?.status === "completed" && transcriptData?.id) {
      queryClient.invalidateQueries({ queryKey: ["transcript-artifacts", transcriptData.id] });
    }
  }, [artifactJob?.status, queryClient, transcriptData?.id]);

  useEffect(() => {
    if (analysisEvents.length === 0) return;
    setLogMessages(
      analysisEvents.map((event) =>
        event.progress_percent != null ? `[${event.progress_percent}%] ${event.message}` : event.message
      )
    );
  }, [analysisEvents]);

  useEffect(() => {
    if (artifactEvents.length === 0) return;
    setArtifactLogMessages(
      artifactEvents.map((event) =>
        event.progress_percent != null ? `[${event.progress_percent}%] ${event.message}` : event.message
      )
    );
  }, [artifactEvents]);

  useEffect(() => {
    if (analysisJob?.status === "failed" && analysisJob.error_text) {
      setLogMessages((prev) => {
        const line = `ERROR: ${analysisJob.error_text}`;
        return prev[prev.length - 1] === line ? prev : [...prev, line];
      });
    }
  }, [analysisJob?.error_text, analysisJob?.status]);

  useEffect(() => {
    if (artifactJob?.status === "failed" && artifactJob.error_text) {
      setArtifactLogMessages((prev) => {
        const line = `ERROR: ${artifactJob.error_text}`;
        return prev[prev.length - 1] === line ? prev : [...prev, line];
      });
    }
  }, [artifactJob?.error_text, artifactJob?.status]);

  const analyzeMutation = useMutation({
    mutationFn: clips.analyze,
    onSuccess: (data) => {
      setAnalysisJobId(data.job_id);
      setLogMessages(["Clip analysis queued"]);
      queryClient.invalidateQueries({ queryKey: ["clip-candidates", projectId] });
    },
  });

  const generateArtifactsMutation = useMutation({
    mutationFn: transcript.generateArtifacts,
    onSuccess: (data) => {
      setArtifactJobId(data.job_id);
      setArtifactLogMessages(["Artifact generation queued. Fetching live job progress..."]);
      queryClient.invalidateQueries({ queryKey: ["jobs", projectId] });
    },
    onError: (error) => {
      setArtifactLogMessages([`ERROR: ${error instanceof Error ? error.message : "Artifact generation request failed."}`]);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { title?: string; start_seconds?: number; end_seconds?: number };
    }) => clips.updateCandidate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clip-candidates", projectId] });
    },
  });

  const exportMutation = useMutation({
    mutationFn: clips.exportClip,
  });

  const canAnalyze = Boolean(sermonAsset && transcriptData);
  const artifactsReady = artifactStatus?.ready ?? false;
  const artifactBusy = Boolean(
    generateArtifactsMutation.isPending ||
      (artifactJob && artifactJob.status !== "completed" && artifactJob.status !== "failed")
  );
  const playbackUrl = sermonAsset ? getMediaPlaybackUrl(sermonAsset.id) : null;
  const activeCandidate = selectedCandidateDetail ?? selectedCandidate;
  const editorialScores = activeCandidate?.analysis_payload?.editorial_scores ?? {};
  const featureScores = activeCandidate?.analysis_payload?.feature_scores ?? {};
  const sourceResult = activeCandidate?.analysis_payload?.source_result ?? {};
  const sourceResultEntries = Object.entries(sourceResult).filter(([, value]) =>
    typeof value === "string" || typeof value === "number"
  );

  useEffect(() => {
    if (!videoRef.current || !activeCandidate) return;
    videoRef.current.pause();
    setIsPlaying(false);
    videoRef.current.currentTime = activeCandidate.start_seconds;
  }, [activeCandidate?.id, activeCandidate?.start_seconds]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("ended", handlePause);

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handlePause);
    };
  }, [activeCandidate?.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeCandidate) return;

    const handleTimeUpdate = () => {
      if (video.currentTime < activeCandidate.start_seconds - 0.1) {
        setIsPlaying(false);
        return;
      }
      if (video.currentTime >= activeCandidate.end_seconds) {
        video.pause();
        video.currentTime = activeCandidate.end_seconds;
        setIsPlaying(false);
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, [activeCandidate?.end_seconds, activeCandidate?.start_seconds, activeCandidate?.id]);

  useEffect(() => {
    const panel = playerPanelRef.current;
    if (!panel || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setPlayerPanelHeight(entry.contentRect.height);
    });

    observer.observe(panel);
    return () => observer.disconnect();
  }, [activeCandidate?.id, playbackUrl]);

  async function nudgeBoundary(direction: "start" | "end") {
    if (!activeCandidate || updateMutation.isPending) return;

    const nextStart =
      direction === "start"
        ? Math.max(0, activeCandidate.start_seconds - 5)
        : activeCandidate.start_seconds;
    const nextEnd =
      direction === "end"
        ? activeCandidate.end_seconds + 5
        : activeCandidate.end_seconds;

    if (nextStart >= nextEnd - 0.1) return;

    const previewTime = direction === "start" ? nextStart : activeCandidate.end_seconds;

    await updateMutation.mutateAsync({
      id: activeCandidate.id,
      data: {
        start_seconds: nextStart,
        end_seconds: nextEnd,
      },
    });

    queryClient.invalidateQueries({ queryKey: ["clip-candidate", activeCandidate.id] });

    if (videoRef.current) {
      videoRef.current.currentTime = previewTime;
      void videoRef.current.play();
    }
  }

  return (
    <div className="space-y-8">
      <StepIntro
        eyebrow="Clip Lab"
        title={`Discover short-form moments from ${project?.title ?? "this sermon"}.`}
        description="Run the ranker, review the strongest moments, and shape the final clips from one clear workspace."
        statusItems={[
          {
            label: "Sermon",
            value: sermonAsset ? "Ready" : "Missing",
            tone: sermonAsset ? "success" : "warning",
          },
          {
            label: "Transcript",
            value: transcriptData ? "Ready" : "Missing",
            tone: transcriptData ? "success" : "warning",
          },
          {
            label: "Clip artifacts",
            value: artifactsReady ? "Ready" : artifactBusy ? "Building" : "Missing",
            tone: artifactsReady ? "success" : artifactBusy ? "info" : "warning",
          },
        ]}
      />

      {!canAnalyze ? (
        <Alert tone="warning" title="Transcript required">
          Complete and approve the transcript before running clip analysis.
        </Alert>
      ) : (
        <div className="space-y-6">
            <GenerateModePanel
              eyebrow="Studio"
              title="Clip Lab is one of the core Studio work modes."
              description="Stay here while shaping ranked moments, then move into Visuals and Text once the clip shortlist is clear enough to drive the rest of the package."
              summary={`${candidates.length} ranked moment${candidates.length === 1 ? "" : "s"} currently available for review.`}
              links={[
                {
                  label: "Visuals",
                  detail: "Review sermon and reel art once the strongest clip direction is clear.",
                  href: `/projects/${projectId}/visuals`,
                  state: sermonAsset ? "Assets in motion" : "Needs assets",
                  tone: sermonAsset || artifactsReady ? "success" : "warning",
                  ctaLabel: "Open Visuals",
                },
                {
                  label: "Text",
                  detail: "Tighten transcript-derived titles, descriptions, and reel copy alongside the clip shortlist.",
                  href: `/projects/${projectId}/text`,
                  state: transcriptData ? "Ready for review" : "Transcript needed",
                  tone: transcriptData ? "info" : "warning",
                  ctaLabel: "Open Text Desk",
                },
                {
                  label: "Generate overview",
                  detail: "Return to the grouped Generate hub to see Studio and Deliverables readiness together.",
                  href: `/projects/${projectId}/generate`,
                  state: candidates.length > 0 ? "In progress" : "Needs start",
                  tone: candidates.length > 0 ? "brand" : "neutral",
                  ctaLabel: "Open Generate",
                },
              ]}
            />

            <Card className="overflow-hidden">
              <CardHeader
                eyebrow="Clip Workspace"
                title={activeCandidate ? activeCandidate.title : "Clip editor"}
                description="Keep the playback, active clip details, and ranked candidate rail together so the page reads like one editing surface."
                action={
                  <div className="flex flex-wrap justify-end gap-2">
                    {canAnalyze && !artifactsReady ? (
                      <Button
                        variant="secondary"
                        onClick={() => transcriptData && generateArtifactsMutation.mutate(transcriptData.id)}
                        disabled={artifactBusy || !transcriptData}
                      >
                        {artifactBusy ? "Building Artifacts..." : "Generate Clip Artifacts"}
                      </Button>
                    ) : null}
                    <Button
                      onClick={() =>
                        analyzeMutation.mutate({
                          project_id: projectId,
                          sermon_asset_id: sermonAsset!.id,
                          transcript_id: transcriptData!.id,
                          model,
                          host,
                          candidate_limit: candidateLimit,
                          output_count: outputCount,
                        })
                      }
                      disabled={analyzeMutation.isPending || !artifactsReady || !sermonAsset || !transcriptData}
                    >
                      {analyzeMutation.isPending ? "Starting..." : "Run Clip Analysis"}
                    </Button>
                  </div>
                }
              />
              <div className="mt-6 space-y-6">
                {isLoading ? (
                  <Alert tone="info">Loading clip candidates.</Alert>
                ) : candidates.length === 0 ? (
                  <Alert tone="warning">No clip candidates yet. Run the analysis panel above to populate this list.</Alert>
                ) : (
                  <>
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.42fr)_260px] lg:items-start">
                      <div className="min-w-0">
                        {playbackUrl ? (
                          <div
                            ref={playerPanelRef}
                            className="overflow-hidden rounded-[1.75rem] border border-border/80 bg-background-alt"
                          >
                            <video
                              ref={videoRef}
                              src={playbackUrl}
                              preload="metadata"
                              className="aspect-video w-full bg-black"
                            />
                            {activeCandidate ? (
                              <div className="space-y-4 border-t border-border/70 px-4 py-4">
                                <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
                                  <Badge tone="brand">Score {formatScore(activeCandidate.score)}</Badge>
                                  <Badge tone="info">{Math.round(activeCandidate.duration_seconds)}s</Badge>
                                  <Badge tone="neutral">
                                    {formatTime(activeCandidate.start_seconds)} to {formatTime(activeCandidate.end_seconds)}
                                  </Badge>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    className="inline-flex items-center gap-2"
                                    onClick={() => {
                                      if (!videoRef.current || !activeCandidate) return;
                                      if (isPlaying) {
                                        videoRef.current.pause();
                                      } else {
                                        const currentTime = videoRef.current.currentTime;
                                        if (
                                          currentTime < activeCandidate.start_seconds ||
                                          currentTime >= activeCandidate.end_seconds
                                        ) {
                                          videoRef.current.currentTime = activeCandidate.start_seconds;
                                        }
                                        void videoRef.current.play();
                                      }
                                    }}
                                  >
                                    {isPlaying ? <PauseIcon /> : <PlayIcon />}
                                    {isPlaying ? "Pause Clip" : "Play Clip"}
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    onClick={() => void nudgeBoundary("start")}
                                    disabled={updateMutation.isPending}
                                  >
                                    +5s Start
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    onClick={() => void nudgeBoundary("end")}
                                    disabled={updateMutation.isPending}
                                  >
                                    +5s End
                                  </Button>
                                  <Button
                                    variant="success"
                                    onClick={() => exportMutation.mutate(activeCandidate.id)}
                                    disabled={exportMutation.isPending}
                                  >
                                    Export Clip
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <Alert tone="warning">Sermon playback is not available right now, but clip analysis data is still editable.</Alert>
                        )}
                      </div>

                      <div className="min-w-0 self-start">
                        <div
                          className="flex flex-col overflow-hidden rounded-[1.75rem] border border-border/80 bg-[linear-gradient(180deg,rgba(246,241,235,0.95),rgba(255,255,255,0.98))] p-5"
                        >
                          <p className="section-label">Ranked Clips</p>
                          <p className="mt-2 text-sm leading-6 text-muted">
                            Click a row to load its details into the editor.
                          </p>
                          <div className="mt-4 h-[18rem] space-y-2 overflow-x-hidden overflow-y-auto pr-1 xl:pr-2">
                            {candidates.map((candidate) => {
                              const active = candidate.id === activeCandidate?.id;
                              return (
                                <button
                                  key={candidate.id}
                                  type="button"
                                  onClick={() => setSelectedCandidateId(candidate.id)}
                                  className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                                    active
                                      ? "border-brand bg-surface shadow-soft"
                                      : "border-border/80 bg-surface hover:border-brand/50"
                                  }`}
                                >
                                  <div className="flex items-center gap-4">
                                    <span className="shrink-0 text-sm font-semibold tabular-nums text-brand">
                                      {formatScore(candidate.score)}
                                    </span>
                                    <span className="shrink-0 text-sm font-semibold tabular-nums text-muted">
                                      {Math.round(candidate.duration_seconds)}s
                                    </span>
                                    <span className="shrink-0 text-sm font-medium tabular-nums text-muted">
                                      {formatTime(candidate.start_seconds)}-{formatTime(candidate.end_seconds)}
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>

                    {activeCandidate ? (
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-[1.5rem] border border-border/80 bg-background-alt p-4">
                          <p className="section-label">Ranking</p>
                          <p className="mt-3 text-3xl font-semibold text-ink">#{activeCandidate.analysis_payload?.rank ?? "?"}</p>
                          <p className="mt-2 text-sm text-muted">Position in the final FastCap shortlist.</p>
                        </div>
                        <div className="rounded-[1.5rem] border border-border/80 bg-background-alt p-4">
                          <p className="section-label">Editor Score</p>
                          <p className="mt-3 text-3xl font-semibold text-ink">
                            {formatScore(activeCandidate.analysis_payload?.editorial_scores?.editor)}
                          </p>
                          <p className="mt-2 text-sm text-muted">Primary editorial confidence for this moment.</p>
                        </div>
                        <div className="rounded-[1.5rem] border border-border/80 bg-background-alt p-4">
                          <p className="section-label">Platform Fit</p>
                          <p className="mt-3 text-lg font-semibold text-ink">
                            {activeCandidate.analysis_payload?.best_platform_fit ?? "Unspecified"}
                          </p>
                          <p className="mt-2 text-sm text-muted">Best destination according to the ranker.</p>
                        </div>
                        <div className="rounded-[1.5rem] border border-border/80 bg-background-alt p-4">
                          <p className="section-label">Scroll Stop</p>
                          <p className="mt-3 text-lg font-semibold text-ink">
                            {activeCandidate.analysis_payload?.scroll_stopping_strength ?? "Unspecified"}
                          </p>
                          <p className="mt-2 text-sm text-muted">How aggressively the opening should catch attention.</p>
                        </div>
                      </div>
                    ) : null}

                    {activeCandidate ? (
                      <div className="rounded-[1.75rem] border border-border/80 bg-background-alt p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="section-label">Clip Details</p>
                            <h3 className="mt-2 text-2xl font-semibold text-ink">{activeCandidate.title}</h3>
                          </div>
                        </div>

                        <div className="mt-5 grid gap-4 xl:grid-cols-2">
                          <div className="space-y-3">
                            <div className="rounded-2xl bg-surface p-4">
                              <p className="text-sm font-medium text-ink">Opening hook</p>
                              <p className="mt-2 text-sm leading-7 text-muted">
                                {activeCandidate.hook_text || "No opening hook was captured for this clip."}
                              </p>
                            </div>
                            <div className="rounded-2xl bg-surface p-4">
                              <p className="text-sm font-medium text-ink">Editorial reason</p>
                              <p className="mt-2 text-sm leading-7 text-muted">
                                {activeCandidate.analysis_payload?.editor_reason || "No editor note was stored for this clip."}
                              </p>
                            </div>
                          </div>
                          <div className="rounded-2xl bg-surface p-4">
                            <p className="text-sm font-medium text-ink">Boundary controls</p>
                            <div className="mt-3 space-y-3 text-sm text-muted">
                              <p>
                                Start: <span className="font-semibold text-ink">{formatTime(activeCandidate.start_seconds)}</span>
                              </p>
                              <p>
                                End: <span className="font-semibold text-ink">{formatTime(activeCandidate.end_seconds)}</span>
                              </p>
                              <p>
                                Duration: <span className="font-semibold text-ink">{Math.round(activeCandidate.duration_seconds)} seconds</span>
                              </p>
                              <p className="text-xs leading-6 text-muted">
                                Use the `+5s Start` or `+5s End` controls under the player to adjust this clip and immediately hear the updated cut.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {activeCandidate ? (
                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-[1.75rem] border border-border/80 bg-background-alt p-5">
                          <p className="section-label">Editorial Scores</p>
                          <div className="mt-4 space-y-3">
                            {Object.keys(editorialScores).length > 0 ? (
                              Object.entries(editorialScores).map(([key, value]) => (
                                <div key={key} className="flex items-center justify-between rounded-2xl bg-surface p-3 text-sm">
                                  <span className="text-muted">{titleize(key)}</span>
                                  <span className="font-semibold text-ink">{formatScore(value)}</span>
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-muted">No editorial score breakdown was stored.</p>
                            )}
                          </div>
                        </div>
                        <div className="rounded-[1.75rem] border border-border/80 bg-background-alt p-5">
                          <p className="section-label">Feature Scores</p>
                          <div className="mt-4 space-y-3">
                            {Object.keys(featureScores).length > 0 ? (
                              Object.entries(featureScores).map(([key, value]) => (
                                <div key={key} className="flex items-center justify-between rounded-2xl bg-surface p-3 text-sm">
                                  <span className="text-muted">{titleize(key)}</span>
                                  <span className="font-semibold text-ink">{formatScore(value)}</span>
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-muted">No feature score breakdown was stored.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {activeCandidate ? (
                      <div className="rounded-[1.75rem] border border-border/80 bg-background-alt p-5">
                        <p className="section-label">Analysis Snapshot</p>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <div className="rounded-2xl bg-surface p-4 text-sm">
                            <p className="text-muted">Clip Type</p>
                            <p className="mt-2 font-semibold text-ink">
                              {activeCandidate.analysis_payload?.clip_type ?? "Unknown"}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-surface p-4 text-sm">
                            <p className="text-muted">Cadence Marker</p>
                            <p className="mt-2 font-semibold text-ink">
                              {activeCandidate.analysis_payload?.cadence_marker ?? "None"}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-surface p-4 text-sm">
                            <p className="text-muted">Final Rank Score</p>
                            <p className="mt-2 font-semibold text-ink">
                              {formatScore(activeCandidate.analysis_payload?.final_rank_score)}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-surface p-4 text-sm">
                            <p className="text-muted">Reasoning Consistency</p>
                            <p className="mt-2 font-semibold text-ink">
                              {formatValue(activeCandidate.analysis_payload?.reasoning_consistency)}
                            </p>
                          </div>
                        </div>

                        {sourceResultEntries.length > 0 ? (
                          <div className="mt-5 rounded-2xl bg-surface p-4">
                            <p className="text-sm font-medium text-ink">Stored FastCap fields</p>
                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                              {sourceResultEntries.slice(0, 12).map(([key, value]) => (
                                <div key={key} className="rounded-2xl bg-background px-4 py-3 text-sm">
                                  <p className="text-muted">{titleize(key)}</p>
                                  <p className="mt-1 font-medium text-ink">{String(value)}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </Card>

          <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_320px]">
            <Card>
              <CardHeader
                eyebrow="Readiness"
                title="Clip-lab inputs"
                description="Keep the gating signals compact here instead of repeating another full workspace explainer."
              />
              <div className="mt-6 grid gap-3 md:grid-cols-2">
                <div className="flex items-center justify-between rounded-2xl bg-surface-tint p-4 text-sm">
                  <span className="text-muted">Sermon master</span>
                  <Badge tone={sermonAsset ? "success" : "warning"}>{sermonAsset ? "Ready" : "Missing"}</Badge>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-surface-tint p-4 text-sm">
                  <span className="text-muted">Transcript</span>
                  <Badge tone={transcriptData ? "success" : "warning"}>{transcriptData ? "Ready" : "Missing"}</Badge>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-surface-tint p-4 text-sm">
                  <span className="text-muted">Clip artifacts</span>
                  <Badge tone={artifactsReady ? "success" : artifactBusy ? "info" : "warning"}>
                    {artifactsReady ? "Ready" : artifactBusy ? "Building" : "Missing"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-surface-tint p-4 text-sm">
                  <span className="text-muted">Current candidates</span>
                  <span className="font-semibold text-ink">{candidates.length}</span>
                </div>
              </div>
            </Card>

            <ActivityDock
              eyebrow="Activity"
              title="Clip Lab jobs"
              description="Keep generation progress docked to the side while you continue reviewing candidates."
            >
              {artifactJob ? (
                <JobStatusPanel
                  title="Artifact generation"
                  job={artifactJob}
                  messages={artifactLogMessages}
                  runningHint="This pass rebuilds the FastCap prep bundle from the current transcript and sermon media."
                  compact
                />
              ) : null}

              {analysisJob ? (
                <JobStatusPanel
                  title="Clip analysis"
                  job={analysisJob}
                  messages={logMessages}
                  runningHint="This pass ranks candidate moments from the sermon transcript and can take a bit if the candidate pool is large."
                  compact
                />
              ) : null}

              {!artifactJob && !analysisJob ? (
                <Card className="p-5">
                  <p className="section-label">Background Job</p>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    Run artifact generation or clip analysis and the live activity feed will dock here instead of pushing more content below the editor.
                  </p>
                </Card>
              ) : null}
            </ActivityDock>
          </div>
        </div>
      )}
    </div>
  );
}
