"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { jobs, projects, transcript } from "@/lib/api";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { JobStatusPanel } from "@/components/workflow/JobStatusPanel";
import { StepIntro } from "@/components/workflow/StepIntro";

function formatTimestamp(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export default function TranscriptPage() {
  const params = useParams();
  const projectId = params.id as string;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [transcribeJobId, setTranscribeJobId] = useState<string | null>(null);
  const [artifactJobId, setArtifactJobId] = useState<string | null>(null);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [artifactLogMessages, setArtifactLogMessages] = useState<string[]>([]);
  const [transcriptionRequested, setTranscriptionRequested] = useState(false);
  const [artifactRequested, setArtifactRequested] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const artifactLogEndRef = useRef<HTMLDivElement>(null);

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projects.get(projectId),
  });

  const { data: transcriptData, isLoading } = useQuery({
    queryKey: ["transcript", projectId],
    queryFn: () => transcript.getForProject(projectId),
  });

  const { data: sermonAsset } = useQuery({
    queryKey: ["sermon-asset", projectId],
    queryFn: () => projects.getSermonAsset(projectId),
  });

  const { data: projectJobs = [] } = useQuery({
    queryKey: ["jobs", projectId],
    queryFn: () => jobs.listForProject(projectId),
    refetchInterval: 2000,
  });

  const latestTranscriptionJob =
    [...projectJobs]
      .filter((job) => job.job_type === "transcribe_sermon")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;

  const latestArtifactJob =
    [...projectJobs]
      .filter((job) => job.job_type === "prepare_clip_artifacts")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;

  useEffect(() => {
    if (!transcribeJobId && latestTranscriptionJob?.id) {
      setTranscribeJobId(latestTranscriptionJob.id);
    }
  }, [latestTranscriptionJob?.id, transcribeJobId]);

  useEffect(() => {
    if (!artifactJobId && latestArtifactJob?.id) {
      setArtifactJobId(latestArtifactJob.id);
    }
  }, [artifactJobId, latestArtifactJob?.id]);

  const { data: transcribeJob } = useQuery({
    queryKey: ["job", transcribeJobId],
    queryFn: () => jobs.get(transcribeJobId!),
    enabled: !!transcribeJobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" || status === "failed" || status === "cancelled" ? false : 2000;
    },
  });

  const { data: transcribeEvents = [] } = useQuery({
    queryKey: ["job-events", transcribeJobId],
    queryFn: () => jobs.getEvents(transcribeJobId!),
    enabled: !!transcribeJobId,
    refetchInterval: () => {
      const status = transcribeJob?.status;
      return status === "completed" || status === "failed" || status === "cancelled" ? false : 2000;
    },
  });

  const { data: artifactJob } = useQuery({
    queryKey: ["job", artifactJobId],
    queryFn: () => jobs.get(artifactJobId!),
    enabled: !!artifactJobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" || status === "failed" || status === "cancelled" ? false : 2000;
    },
  });

  const { data: artifactEvents = [] } = useQuery({
    queryKey: ["job-events", artifactJobId],
    queryFn: () => jobs.getEvents(artifactJobId!),
    enabled: !!artifactJobId,
    refetchInterval: () => {
      const status = artifactJob?.status;
      return status === "completed" || status === "failed" || status === "cancelled" ? false : 2000;
    },
  });

  const visibleJob = transcribeJob ?? latestTranscriptionJob ?? null;
  const visibleArtifactJob = artifactJob ?? latestArtifactJob ?? null;

  useEffect(() => {
    if (visibleJob?.status === "completed") {
      queryClient.invalidateQueries({ queryKey: ["transcript", projectId] });
      setTranscriptionRequested(false);
    }
    if (visibleJob?.status === "failed") {
      setTranscriptionRequested(false);
    }
    if (visibleJob?.status === "cancelled") {
      setTranscriptionRequested(false);
    }
  }, [projectId, queryClient, visibleJob?.status]);

  useEffect(() => {
    if (visibleArtifactJob?.status === "completed") {
      setArtifactRequested(false);
    }
    if (visibleArtifactJob?.status === "failed") {
      setArtifactRequested(false);
    }
    if (visibleArtifactJob?.status === "cancelled") {
      setArtifactRequested(false);
    }
  }, [visibleArtifactJob?.status]);

  useEffect(() => {
    if (transcribeEvents.length === 0) return;
    setLogMessages(
      transcribeEvents.map((event) =>
        event.progress_percent != null ? `[${event.progress_percent}%] ${event.message}` : event.message
      )
    );
  }, [transcribeEvents]);

  useEffect(() => {
    if (artifactEvents.length === 0) return;
    setArtifactLogMessages(
      artifactEvents.map((event) =>
        event.progress_percent != null ? `[${event.progress_percent}%] ${event.message}` : event.message
      )
    );
  }, [artifactEvents]);

  useEffect(() => {
    if (visibleJob?.status === "failed" && visibleJob.error_text) {
      setLogMessages((prev) => {
        const line = `ERROR: ${visibleJob.error_text}`;
        return prev[prev.length - 1] === line ? prev : [...prev, line];
      });
    }
  }, [visibleJob?.error_text, visibleJob?.status]);

  useEffect(() => {
    if (visibleArtifactJob?.status === "failed" && visibleArtifactJob.error_text) {
      setArtifactLogMessages((prev) => {
        const line = `ERROR: ${visibleArtifactJob.error_text}`;
        return prev[prev.length - 1] === line ? prev : [...prev, line];
      });
    }
  }, [visibleArtifactJob?.error_text, visibleArtifactJob?.status]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logMessages]);

  useEffect(() => {
    artifactLogEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [artifactLogMessages]);

  const startTranscribe = useMutation({
    mutationFn: transcript.start,
    onMutate: () => {
      setTranscriptionRequested(true);
      setLogMessages(["Transcription requested. Waiting for worker to acknowledge the new job..."]);
    },
    onSuccess: (data) => {
      setTranscribeJobId(data.job_id);
      setTranscriptionRequested(data.status !== "completed");
      setLogMessages([
        data.status === "completed"
          ? "Transcription finished immediately. Refreshing transcript state..."
          : "Transcription queued. Fetching live job progress...",
      ]);
      queryClient.invalidateQueries({ queryKey: ["jobs", projectId] });
      queryClient.invalidateQueries({ queryKey: ["job", data.job_id] });
      queryClient.invalidateQueries({ queryKey: ["transcript", projectId] });
    },
    onError: (error) => {
      setTranscriptionRequested(false);
      setLogMessages([`ERROR: ${error instanceof Error ? error.message : "Transcription request failed."}`]);
    },
  });

  const cancelTranscription = useMutation({
    mutationFn: (jobId: string) => jobs.cancel(jobId),
    onSuccess: async (_, jobId) => {
      setTranscriptionRequested(false);
      setLogMessages((prev) => [...prev, "Job cancelled."]);
      await queryClient.invalidateQueries({ queryKey: ["jobs", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["job", jobId] });
    },
  });

  const generateArtifacts = useMutation({
    mutationFn: transcript.generateArtifacts,
    onMutate: () => {
      setArtifactRequested(true);
      setArtifactLogMessages(["Artifact rebuild requested. Waiting for the background job to start..."]);
    },
    onSuccess: (data) => {
      setArtifactJobId(data.job_id);
      setArtifactRequested(data.status !== "completed");
      setArtifactLogMessages(["Artifact generation queued. Fetching live job progress..."]);
      queryClient.invalidateQueries({ queryKey: ["jobs", projectId] });
      queryClient.invalidateQueries({ queryKey: ["job", data.job_id] });
    },
    onError: (error) => {
      setArtifactRequested(false);
      setArtifactLogMessages([`ERROR: ${error instanceof Error ? error.message : "Artifact generation request failed."}`]);
    },
  });

  const transcriptionBusy =
    startTranscribe.isPending ||
    transcriptionRequested ||
    Boolean(
      visibleJob &&
        visibleJob.status !== "completed" &&
        visibleJob.status !== "failed" &&
        visibleJob.status !== "cancelled"
    );

  const artifactBusy =
    generateArtifacts.isPending ||
    artifactRequested ||
    Boolean(visibleArtifactJob && visibleArtifactJob.status !== "completed" && visibleArtifactJob.status !== "failed");

  const transcriptText = transcriptData?.raw_text ?? transcriptData?.cleaned_text ?? "";
  const filteredSegments =
    transcriptData?.segments?.filter((segment) =>
      search ? segment.text.toLowerCase().includes(search.toLowerCase()) : true
    ) ?? [];

  const startJob = () => {
    if (!sermonAsset) return;
    startTranscribe.mutate({
      project_id: projectId,
      sermon_asset_id: sermonAsset.id,
    });
  };

  const cancelAndRestartJob = async () => {
    if (!sermonAsset) return;
    if (visibleJob && (visibleJob.status === "queued" || visibleJob.status === "running")) {
      await cancelTranscription.mutateAsync(visibleJob.id);
    }
    startJob();
  };

  const startArtifactJob = () => {
    if (!transcriptData) return;
    generateArtifacts.mutate(transcriptData.id);
  };

  return (
    <div className="space-y-6">
      <StepIntro
        eyebrow="Transcript Review"
        title={`Generate and review the transcript for ${project?.title ?? "this sermon"}.`}
        description="This step produces the text layer that drives sermon thumbnails, clip discovery, titles, posts, blog creation, and metadata extraction. Sermon transcripts are auto-approved after generation."
        meta={[
          project?.speaker_display_name ?? project?.speaker ?? "Speaker pending",
          transcriptData?.approved_at ? "Auto-approved transcript" : "Transcript pending",
          sermonAsset ? "Sermon master ready" : "Trim required first",
        ]}
      />

      {!sermonAsset ? (
        <Alert tone="warning" title="Sermon master required">
          Finish the Trim step first so transcription has a clean master asset to process.
        </Alert>
      ) : (
        <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.3fr)_360px]">
          <div className="space-y-6">
            {!transcriptData ? (
              <Card>
                <CardHeader
                  eyebrow="Generate"
                  title="No transcript yet"
                  description={
                    isLoading
                      ? "Checking for an existing transcript."
                      : "Start the transcription job to create the text layer for this sermon."
                  }
                />
                <div className="mt-6 space-y-4">
                  <div className="flex flex-wrap gap-3">
                    <Button onClick={startJob} disabled={transcriptionBusy} size="lg">
                      {startTranscribe.isPending ? "Starting..." : "Start Transcription"}
                    </Button>
                    {visibleJob && (visibleJob.status === "queued" || visibleJob.status === "running") ? (
                      <Button
                        variant="secondary"
                        onClick={cancelAndRestartJob}
                        disabled={cancelTranscription.isPending || startTranscribe.isPending}
                        size="lg"
                      >
                        {cancelTranscription.isPending ? "Cancelling..." : "Cancel and Restart"}
                      </Button>
                    ) : null}
                  </div>
                  <Alert tone="info">
                    Full-sermon transcription on CPU can pause on one step for a while. If the activity log keeps changing, the process is still alive.
                  </Alert>
                </div>
              </Card>
            ) : (
              <Card>
                <CardHeader
                  eyebrow="Review"
                  title="Transcript workspace"
                  action={
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={startJob} disabled={transcriptionBusy}>
                        {transcriptionBusy ? "Transcribing..." : "Re-Transcribe"}
                      </Button>
                      {visibleJob && (visibleJob.status === "queued" || visibleJob.status === "running") ? (
                        <Button
                          variant="secondary"
                          onClick={cancelAndRestartJob}
                          disabled={cancelTranscription.isPending || startTranscribe.isPending}
                        >
                          {cancelTranscription.isPending ? "Cancelling..." : "Cancel and Restart"}
                        </Button>
                      ) : null}
                      <Badge tone="success">{transcriptData.approved_at ? "Auto-approved" : "Ready"}</Badge>
                    </div>
                  }
                />

                <div className="mt-6 space-y-4">
                  {transcriptionRequested && !visibleJob ? (
                    <Alert tone="info">
                      Re-transcription requested. Waiting for the new background job to appear.
                    </Alert>
                  ) : null}
                  {artifactRequested && !visibleArtifactJob ? (
                    <Alert tone="info">
                      Artifact generation requested. Waiting for the new background job to appear.
                    </Alert>
                  ) : null}
                  <div className="rounded-2xl border border-border/80 bg-background-alt p-4">
                    <label className="block text-sm font-medium text-ink" htmlFor="transcript-search">
                      Search transcript
                    </label>
                    <input
                      id="transcript-search"
                      type="text"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search for a phrase, theme, or timestamped moment"
                      className="mt-3 w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                    />
                  </div>

                  <div className="max-h-[34rem] space-y-3 overflow-y-auto rounded-[1.75rem] border border-border/80 bg-surface p-5">
                    {filteredSegments.length > 0 ? (
                      filteredSegments.map((segment, index) => (
                        <div key={`${segment.start}-${index}`} className="flex gap-4 rounded-2xl bg-background-alt p-4">
                          <span className="shrink-0 rounded-full bg-surface px-3 py-1 text-xs font-semibold tracking-[0.16em] text-muted">
                            {formatTimestamp(segment.start)}
                          </span>
                          <p className="text-sm leading-7 text-ink">{segment.text}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted">{transcriptText || "No transcript content is available yet."}</p>
                    )}
                  </div>
                </div>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader
                eyebrow="Status"
                title="Transcript readiness"
                description="Use this panel to track approval state and confirm when the text is ready for the next stages."
              />
                <div className="mt-6 space-y-3">
                  <div className="flex items-center justify-between rounded-2xl bg-surface-tint p-4 text-sm">
                    <span className="text-muted">Transcript state</span>
                    <Badge tone={transcriptData ? "brand" : "warning"}>
                      {transcriptData ? "Generated" : "Missing"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-surface-tint p-4 text-sm">
                  <span className="text-muted">Review state</span>
                  <Badge tone={transcriptionRequested ? "info" : transcriptData?.approved_at ? "success" : "warning"}>
                    {transcriptionRequested ? "Re-running" : transcriptData?.approved_at ? "Auto-approved" : "Generating"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-surface-tint p-4 text-sm">
                  <span className="text-muted">Segments</span>
                  <span className="font-semibold text-ink">{transcriptData?.segments?.length ?? 0}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-surface-tint p-4 text-sm">
                  <span className="text-muted">Clip artifacts</span>
                  <Badge tone={artifactBusy ? "info" : visibleArtifactJob?.status === "completed" ? "success" : "warning"}>
                    {artifactBusy ? "Building" : visibleArtifactJob?.status === "completed" ? "Ready" : "Needs run"}
                  </Badge>
                </div>
              </div>
            </Card>

            {visibleJob ? (
              <JobStatusPanel
                title="Transcription job"
                job={visibleJob}
                messages={logMessages}
                endRef={logEndRef}
                runningHint="Full-sermon transcription can sit on a single step for a while. If the log keeps changing, the process is still making progress."
              />
            ) : null}

            {visibleArtifactJob ? (
              <JobStatusPanel
                title="Artifact generation job"
                job={visibleArtifactJob}
                messages={artifactLogMessages}
                endRef={artifactLogEndRef}
                runningHint="This pass rebuilds the FastCap prep bundle from the saved transcript and sermon media."
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
