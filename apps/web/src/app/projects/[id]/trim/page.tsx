"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clips, content, jobs, projects, transcript, trim, getMediaPlaybackUrl } from "@/lib/api";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { StepIntro } from "@/components/workflow/StepIntro";
import { IngestActivityDock } from "@/components/ingest/IngestActivityDock";

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

  const { data: transcriptData } = useQuery({
    queryKey: ["transcript", projectId],
    queryFn: () => transcript.getForProject(projectId),
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
  const sourceReady = sourceAsset?.status === "ready";

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

  async function waitForCurrentSermonAsset() {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const currentAsset = await projects.getSermonAsset(projectId);
      if (currentAsset) return currentAsset;
      await sleep(1000);
    }
    throw new Error("Sermon master was generated, but the new sermon asset did not appear.");
  }

  async function waitForCurrentTranscript() {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const currentTranscript = await transcript.getForProject(projectId);
      if (currentTranscript) return currentTranscript;
      await sleep(1000);
    }
    throw new Error("Transcript job completed, but the transcript record did not appear.");
  }

  async function ensureTranscriptArtifacts(transcriptId: string) {
    const artifactStatus = await transcript.getArtifactStatus(transcriptId);
    if (artifactStatus.ready) {
      appendRunAllMessage("Clip artifacts: Ready.");
      return;
    }

    appendRunAllMessage("Clip artifacts: Missing pieces detected. Rebuilding artifacts...");
    const artifactJob = await transcript.generateArtifacts(transcriptId);
    await waitForJob(artifactJob.job_id, "Clip artifacts");
  }

  async function runAllProcesses() {
    if (!project || !sourceAsset) return;

    setRunAllState("running");
    setRunAllError("");
    setRunAllMessages(["Run all: Starting full downstream workflow."]);

    try {
      let activeSermonAsset = sermonAsset;

      if (!activeSermonAsset) {
        appendRunAllMessage("Sermon master: No existing master found. Generating one first...");
        const trimResponse = await trimMutation.mutateAsync({
          project_id: projectId,
          source_asset_id: sourceAsset.id,
          start_seconds: useFullFile ? 0 : safeStart,
          end_seconds: useFullFile ? duration : safeEnd,
          use_full_file: useFullFile,
        });
        setJobId(trimResponse.job_id);
        await waitForJob(trimResponse.job_id, "Sermon master");
        activeSermonAsset = await waitForCurrentSermonAsset();
      } else {
        appendRunAllMessage("Sermon master: Using the current sermon master asset.");
      }

      appendRunAllMessage("Transcript: Starting sermon transcription...");
      const transcriptResponse = await transcript.start({
        project_id: projectId,
        sermon_asset_id: activeSermonAsset.id,
      });
      await waitForJob(transcriptResponse.job_id, "Transcript");
      const currentTranscript = await waitForCurrentTranscript();
      const transcriptText = currentTranscript.raw_text || currentTranscript.cleaned_text || "";
      if (!transcriptText.trim()) {
        throw new Error("Transcript finished without any usable text.");
      }

      await ensureTranscriptArtifacts(currentTranscript.id);

      appendRunAllMessage("Metadata: Generating structured sermon metadata...");
      const metadataResult = await content.generateMetadata({
        transcript: transcriptText,
        preacher_name: project.speaker_display_name || project.speaker,
        date_preached: project.sermon_date,
        model: DEFAULT_MODEL,
        host: DEFAULT_HOST,
      });
      await projects.saveDraft(projectId, "metadata", {
        raw: metadataResult.raw,
        metadata: metadataResult.metadata,
        warnings: metadataResult.warnings,
      });
      appendRunAllMessage("Metadata: Saved.");

      appendRunAllMessage("Blog: Generating long-form article draft...");
      const blogResult = await content.generateBlog({
        transcript: transcriptText,
        preacher_name: project.speaker_display_name || project.speaker,
        date_preached: project.sermon_date,
        model: DEFAULT_MODEL,
        host: DEFAULT_HOST,
      });
      await projects.saveDraft(projectId, "blog", { markdown: blogResult.markdown });
      appendRunAllMessage("Blog: Saved.");

      appendRunAllMessage("Sermon Thumbnail / Title & Desc: Generating prompts plus YouTube copy...");
      const packagingResult = await content.generatePackaging({
        transcript: transcriptText,
        preacher_name: project.speaker_display_name || project.speaker,
        date_preached: project.sermon_date,
        model: DEFAULT_MODEL,
        host: DEFAULT_HOST,
        sermon_metadata: metadataResult.metadata,
      });
      await projects.saveDraft(projectId, "packaging", packagingResult);
      appendRunAllMessage("Sermon Thumbnail / Title & Desc: Saved.");

      appendRunAllMessage("Clip Lab: Running clip analysis...");
      const clipAnalysis = await clips.analyze({
        project_id: projectId,
        sermon_asset_id: activeSermonAsset.id,
        transcript_id: currentTranscript.id,
        model: DEFAULT_MODEL,
        host: DEFAULT_HOST,
        candidate_limit: DEFAULT_CANDIDATE_LIMIT,
        output_count: DEFAULT_OUTPUT_COUNT,
      });
      await waitForJob(clipAnalysis.job_id, "Clip analysis");

      appendRunAllMessage("Text Post: Generating social post from the blog draft...");
      const facebookResult = await content.generateFacebook({
        blog_post_markdown: blogResult.markdown,
        model: DEFAULT_MODEL,
        host: DEFAULT_HOST,
      });
      await projects.saveDraft(projectId, "facebook", { post: facebookResult.post });
      appendRunAllMessage("Text Post: Saved.");

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
        statusItems={[
          {
            label: "Source",
            value: sourceReady ? "Ready" : sourceAsset ? "Processing" : "Missing",
            tone: sourceReady ? "success" : sourceAsset ? "info" : "warning",
          },
          {
            label: "Range",
            value: useFullFile ? "Full file" : `${formatTime(safeStart)} - ${formatTime(safeEnd)}`,
            tone: "brand",
          },
          {
            label: "Selection",
            value: sourceReady ? (useFullFile ? "Locked" : "Editable") : "Blocked",
            tone: sourceReady ? (useFullFile ? "neutral" : "info") : "warning",
          },
        ]}
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              onClick={() =>
                trimMutation.mutate({
                  project_id: projectId,
                  source_asset_id: sourceAsset!.id,
                  start_seconds: useFullFile ? 0 : safeStart,
                  end_seconds: useFullFile ? duration : safeEnd,
                  use_full_file: useFullFile,
                })
              }
              disabled={trimMutation.isPending || runAllState === "running" || !sourceReady}
              size="lg"
            >
              {trimMutation.isPending ? "Starting..." : "Generate Sermon Master"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void runAllProcesses()}
              disabled={trimMutation.isPending || runAllState === "running" || !sourceReady}
              size="lg"
            >
              {runAllState === "running" ? "Running everything..." : "Run all processes"}
            </Button>
          </div>
        }
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
                  <p className="text-xs leading-6 text-muted">
                    Run All will use the current sermon master if one already exists. Otherwise it will generate the master first, then run transcript, metadata, blog, sermon thumbnail prompts, title/description, clip analysis, and the text post in sequence.
                  </p>
                  {trimMutation.isError ? (
                    <Alert tone="danger">{(trimMutation.error as Error).message}</Alert>
                  ) : null}
                  {runAllError ? <Alert tone="danger">{runAllError}</Alert> : null}
                </div>
              </div>
            </Card>

            <IngestActivityDock
              title="Trim activity"
              description="Keep the servo controls, master generation, and downstream automation in one shared ingest dock."
              workflowItems={[
                {
                  label: "Source Intake",
                  href: `/projects/${projectId}/source`,
                  status: sourceReady ? "Ready" : "Needed",
                  tone: sourceReady ? "success" : "warning",
                },
                {
                  label: "Sermon Master",
                  href: `/projects/${projectId}/trim`,
                  active: true,
                  status: sermonAsset ? "Ready" : sourceReady ? "Current" : "Blocked",
                  tone: sermonAsset ? "success" : sourceReady ? "brand" : "warning",
                },
                {
                  label: "Transcript Review",
                  href: `/projects/${projectId}/transcript`,
                  status: transcriptData?.approved_at ? "Approved" : sermonAsset ? "Next" : "Blocked",
                  tone: transcriptData?.approved_at ? "success" : sermonAsset ? "brand" : "warning",
                },
              ]}
              statusItems={[
                {
                  label: "Source",
                  value: sourceReady ? "Ready" : sourceAsset ? "Processing" : "Missing",
                  tone: sourceReady ? "success" : sourceAsset ? "info" : "warning",
                  helper: "The uploaded sermon source that drives the preview.",
                },
                {
                  label: "Range",
                  value: useFullFile ? "Full file" : `${formatTime(safeStart)} - ${formatTime(safeEnd)}`,
                  tone: "brand",
                  helper: "The selected sermon master boundaries.",
                },
                {
                  label: "Selection",
                  value: sourceReady ? (useFullFile ? "Locked" : "Editable") : "Blocked",
                  tone: sourceReady ? (useFullFile ? "neutral" : "info") : "warning",
                  helper: "Whether the trim frame can still be adjusted.",
                },
                {
                  label: "Run all",
                  value:
                    runAllState === "completed"
                      ? "Completed"
                      : runAllState === "failed"
                        ? "Failed"
                        : runAllState === "running"
                          ? "Running"
                          : "Idle",
                  tone:
                    runAllState === "completed"
                      ? "success"
                      : runAllState === "failed"
                        ? "danger"
                        : runAllState === "running"
                          ? "info"
                          : "neutral",
                  helper: "Downstream automation from sermon master through clip analysis.",
                },
              ]}
              jobs={job ? [{ title: "Trim and sermon-master generation", job, runningHint: "This step prepares the master asset used by transcript generation and clip analysis. It can take a little while on larger source files." }] : []}
              children={
                runAllMessages.length > 0 ? (
                  <Card>
                    <CardHeader
                      eyebrow="Automation"
                      title="Run all processes"
                      description="This log follows the downstream workflow from sermon master through content generation and clip analysis."
                    />
                    <div className="mt-6 max-h-[24rem] space-y-3 overflow-y-auto rounded-[1.5rem] border border-border/80 bg-surface p-5">
                      {runAllMessages.map((message, index) => (
                        <p key={`${index}-${message}`} className="text-sm leading-7 text-ink">
                          {message}
                        </p>
                      ))}
                    </div>
                  </Card>
                ) : null
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
