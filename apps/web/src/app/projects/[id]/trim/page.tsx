"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { jobs, projects, trim, automation, getMediaPlaybackUrl } from "@/lib/api";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { JobStatusPanel } from "@/components/workflow/JobStatusPanel";
import { StepIntro } from "@/components/workflow/StepIntro";

const DEFAULT_MODEL =
  "arn:aws:bedrock:us-east-1:644190502535:inference-profile/us.anthropic.claude-sonnet-4-6";
const DEFAULT_HOST = "us-east-1";
const DEFAULT_CANDIDATE_LIMIT = 24;
const DEFAULT_OUTPUT_COUNT = 10;

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function TrimPage() {
  const params = useParams();
  const projectId = params.id as string;
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const { data: project } = useQuery({
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

  const [startSeconds, setStartSeconds] = useState(0);
  const [endSeconds, setEndSeconds] = useState(60);
  const [currentTime, setCurrentTime] = useState(0);
  const [useFullFile, setUseFullFile] = useState(false);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hasSetStart, setHasSetStart] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [runAllState, setRunAllState] = useState<"idle" | "running" | "completed" | "failed">("idle");
  const [runAllMessages, setRunAllMessages] = useState<string[]>([]);
  const [runAllError, setRunAllError] = useState("");

  const duration = videoDuration ?? sourceAsset?.duration_seconds ?? 60;

  useEffect(() => {
    if (sourceAsset?.duration_seconds != null && videoDuration == null) {
      setEndSeconds(sourceAsset.duration_seconds);
    }
  }, [sourceAsset?.duration_seconds, videoDuration]);

  useEffect(() => {
    if (videoDuration != null && endSeconds > videoDuration) {
      setEndSeconds(videoDuration);
    }
  }, [videoDuration, endSeconds]);

  const trimMutation = useMutation({
    mutationFn: trim.start,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["jobs", projectId] });
      setJobId(data.job_id);
    },
  });

  const appendRunAllMessage = (message: string) => {
    setRunAllMessages((prev) => (prev[prev.length - 1] === message ? prev : [...prev, message]));
  };

  async function waitForJob(jobIdToTrack: string, label: string) {
    let lastStatusKey = "";
    while (true) {
      const currentJob = await jobs.get(jobIdToTrack);
      const statusKey = `${currentJob.status}:${currentJob.progress_percent ?? "x"}:${currentJob.current_message ?? ""}`;
      if (statusKey !== lastStatusKey) {
        lastStatusKey = statusKey;
        appendRunAllMessage(
          `${label}: ${currentJob.current_message || currentJob.status}${
            currentJob.progress_percent != null ? ` (${currentJob.progress_percent}%)` : ""
          }`
        );
      }

      if (currentJob.status === "completed") return currentJob;
      if (currentJob.status === "failed") {
        throw new Error(currentJob.error_text || `${label} failed.`);
      }
      if (currentJob.status === "cancelled") {
        throw new Error(`${label} was cancelled.`);
      }
      await sleep(2000);
    }
  }

  async function runAllProcesses() {
    if (!project || !sourceAsset) return;
    if (!sermonAsset) {
      setRunAllError("Generate the sermon master first before running all processes.");
      setRunAllState("failed");
      setRunAllMessages(["Run all: No sermon master found. Generate it first."]);
      return;
    }

    setRunAllState("running");
    setRunAllError("");
    setRunAllMessages(["Run all: Sending pipeline to server..."]);

    try {
      const response = await automation.runAll(projectId, {
        candidate_limit: DEFAULT_CANDIDATE_LIMIT,
        output_count: DEFAULT_OUTPUT_COUNT,
      });
      setJobId(response.job_id);
      appendRunAllMessage(`Run all: Pipeline started (job ${response.job_id}). You can close this page — it will keep running.`);
      await waitForJob(response.job_id, "Pipeline");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["jobs", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["sermon-asset", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["transcript", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["transcript-artifacts"] }),
        queryClient.invalidateQueries({ queryKey: ["clip-candidates", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["project-draft", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
      ]);
      appendRunAllMessage("Run all: Everything finished successfully.");
      setRunAllState("completed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Run all failed.";
      setRunAllError(message);
      appendRunAllMessage(`Run all: ERROR: ${message}`);
      setRunAllState("failed");
    }
  }

  const { data: job } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => jobs.get(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) =>
      query.state.data?.status === "completed" || query.state.data?.status === "failed" ? false : 2000,
  });

  const safeEnd = useFullFile ? duration : Math.min(endSeconds, duration);
  const safeStart = useFullFile ? 0 : Math.max(0, Math.min(startSeconds, safeEnd - 1));
  const selectedDuration = Math.max(0, safeEnd - safeStart);
  const playbackUrl = sourceAsset ? getMediaPlaybackUrl(sourceAsset.id) : null;

  const seekToTime = (time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
    setCurrentTime(time);
  };

  const getTimeFromClientX = (clientX: number) => {
    const element = timelineRef.current;
    if (!element || duration <= 0) return 0;
    const rect = element.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * duration;
  };

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (event: MouseEvent) => seekToTime(getTimeFromClientX(event.clientX));
    const onUp = () => setIsDragging(false);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [duration, isDragging]);

  return (
    <div className="space-y-6">
      <StepIntro
        eyebrow="Sermon Master"
        title={`Shape the usable sermon for ${project?.title ?? "this project"}.`}
        description="Review the uploaded source, set the sermon boundaries, and generate the clean master asset that the rest of the workflow depends on."
        meta={[
          project?.speaker_display_name ?? project?.speaker ?? "Speaker pending",
          sourceAsset?.filename ?? "Source upload pending",
          useFullFile ? "Using full file" : `${formatTime(selectedDuration)} selected`,
        ]}
      />

      {!sourceAsset ? (
        <Alert tone="warning" title="Source required">
          Upload a source video in the Source step before creating the sermon master.
        </Alert>
      ) : (
        <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.5fr)_360px]">
          <div className="space-y-6">
            <Card>
              <CardHeader
                eyebrow="Preview"
                title="Source review"
                description="Scrub through the uploaded video, choose the exact sermon range, and confirm the master boundaries."
              />

              <div className="mt-6 space-y-5">
                {playbackUrl ? (
                  <>
                    <div className="overflow-hidden rounded-[1.75rem] bg-black shadow-soft">
                      <video
                        ref={videoRef}
                        src={playbackUrl}
                        crossOrigin="anonymous"
                        controls
                        className="aspect-video w-full"
                        onTimeUpdate={() => {
                          const video = videoRef.current;
                          if (video) setCurrentTime(video.currentTime);
                        }}
                        onLoadedMetadata={() => {
                          const video = videoRef.current;
                          if (video && Number.isFinite(video.duration) && video.duration > 0) {
                            setVideoDuration(video.duration);
                            setCurrentTime(video.currentTime);
                            if (endSeconds > video.duration) setEndSeconds(video.duration);
                          }
                        }}
                      />
                    </div>

                    <div className="surface-panel p-5">
                      <div
                        ref={timelineRef}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          seekToTime(getTimeFromClientX(event.clientX));
                          setIsDragging(true);
                        }}
                        className={`relative h-12 overflow-hidden rounded-full bg-surface-strong select-none ${
                          isDragging ? "cursor-grabbing" : "cursor-grab"
                        }`}
                      >
                        <div
                          className="absolute inset-y-0 rounded-full bg-gradient-to-r from-brand to-accent"
                          style={{
                            left: `${(safeStart / duration) * 100}%`,
                            width: `${((safeEnd - safeStart) / duration) * 100}%`,
                          }}
                        />
                        <div
                          className="absolute top-0 h-full w-1 rounded-full bg-white shadow"
                          style={{
                            left: `${duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0}%`,
                          }}
                        />
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <Badge tone="info">Current {formatTime(currentTime)}</Badge>
                        <Badge tone="brand">Start {formatTime(safeStart)}</Badge>
                        <Badge tone="warning">End {formatTime(safeEnd)}</Badge>
                        <Badge tone="neutral">Source {formatTime(duration)}</Badge>
                      </div>
                    </div>
                  </>
                ) : (
                  <Alert tone="warning">
                    Playback is not available for this source yet, but you can still generate the master once the asset is ready.
                  </Alert>
                )}
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader
                eyebrow="Selection"
                title="Boundary controls"
                description="Use the live playhead to mark the sermon start and end, or keep the entire source file."
              />

              <div className="mt-6 space-y-5">
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
                  <Button variant="secondary" onClick={() => seekToTime(Math.max(0, currentTime - 5))}>
                    Back 5s
                  </Button>
                  <Button variant="secondary" onClick={() => seekToTime(Math.min(duration, currentTime + 5))}>
                    Forward 5s
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const video = videoRef.current;
                      if (!video) return;
                      const next = Math.min(video.currentTime, safeEnd - 0.5);
                      setStartSeconds(Math.max(0, next));
                      setHasSetStart(true);
                    }}
                  >
                    Set Start
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const video = videoRef.current;
                      if (!video) return;
                      const next = Math.max(video.currentTime, safeStart + 0.5);
                      setEndSeconds(Math.min(duration, next));
                    }}
                    disabled={!hasSetStart}
                  >
                    Set End
                  </Button>
                </div>

                <label className="flex items-start gap-3 rounded-2xl border border-border/80 bg-background-alt p-4">
                  <input
                    type="checkbox"
                    checked={useFullFile}
                    onChange={(event) => setUseFullFile(event.target.checked)}
                    className="mt-1"
                  />
                  <span className="text-sm text-muted">
                    <span className="block font-semibold text-ink">Use full file</span>
                    Skip manual boundaries and keep the entire uploaded source as the sermon master.
                  </span>
                </label>

                <div className="space-y-3 rounded-2xl bg-surface-tint p-4 text-sm text-muted">
                  <div className="flex items-center justify-between gap-3">
                    <span>Selected range</span>
                    <span className="font-semibold text-ink">
                      {formatTime(safeStart)} to {formatTime(safeEnd)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Total sermon master</span>
                    <span className="font-semibold text-ink">{formatTime(selectedDuration)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Source file</span>
                    <span className="font-semibold text-ink">{sourceAsset.filename}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button
                      onClick={() =>
                        trimMutation.mutate({
                          project_id: projectId,
                          source_asset_id: sourceAsset.id,
                          start_seconds: useFullFile ? 0 : safeStart,
                          end_seconds: useFullFile ? duration : safeEnd,
                          use_full_file: useFullFile,
                        })
                      }
                      disabled={trimMutation.isPending || runAllState === "running"}
                      className="w-full"
                      size="lg"
                    >
                      {trimMutation.isPending ? "Starting..." : "Generate Sermon Master"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => void runAllProcesses()}
                      disabled={trimMutation.isPending || runAllState === "running"}
                      className="w-full"
                      size="lg"
                    >
                      {runAllState === "running" ? "Running Everything..." : "Run All Processes"}
                    </Button>
                  </div>
                  <p className="text-xs leading-6 text-muted">
                    Run All sends the full pipeline to the server. You can close the app and come back later — transcript, title/desc, sermon thumbnail prompts, clip analysis, blog post, text post, and metadata will all be generated in order.
                  </p>
                  {trimMutation.isError ? (
                    <Alert tone="danger">{(trimMutation.error as Error).message}</Alert>
                  ) : null}
                  {runAllError ? <Alert tone="danger">{runAllError}</Alert> : null}
                </div>
              </div>
            </Card>

            {job ? (
              <JobStatusPanel
                title="Trim and sermon-master generation"
                job={job}
                runningHint="This step prepares the master asset used by transcript generation and clip analysis. It can take a little while on larger source files."
              />
            ) : null}

            {runAllMessages.length > 0 ? (
              <Card>
                <CardHeader
                  eyebrow="Automation"
                  title="Run all processes"
                  description="This log follows the downstream workflow from sermon master through content generation and clip analysis."
                  action={
                    <Badge
                      tone={
                        runAllState === "completed"
                          ? "success"
                          : runAllState === "failed"
                            ? "danger"
                            : runAllState === "running"
                              ? "info"
                              : "neutral"
                      }
                    >
                      {runAllState === "completed"
                        ? "Completed"
                        : runAllState === "failed"
                          ? "Failed"
                          : runAllState === "running"
                            ? "Running"
                            : "Idle"}
                    </Badge>
                  }
                />
                <div className="mt-6 max-h-[24rem] space-y-3 overflow-y-auto rounded-[1.5rem] border border-border/80 bg-surface p-5">
                  {runAllMessages.map((message, index) => (
                    <p key={`${index}-${message}`} className="text-sm leading-7 text-ink">
                      {message}
                    </p>
                  ))}
                </div>
              </Card>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
