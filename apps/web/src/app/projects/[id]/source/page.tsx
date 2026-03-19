"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, jobs, projects, uploads } from "@/lib/api";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { JobStatusPanel } from "@/components/workflow/JobStatusPanel";

export default function SourcePage() {
  const params = useParams();
  const projectId = params.id as string;
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeJobId, setYoutubeJobId] = useState<string | null>(null);
  const [logMessages, setLogMessages] = useState<string[]>([]);

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projects.get(projectId),
  });

  const { data: sourceAsset, isLoading } = useQuery({
    queryKey: ["source-asset", projectId],
    queryFn: () => projects.getSourceAsset(projectId),
    refetchInterval: (query) => (query.state.data?.status === "pending" ? 2000 : false),
  });

  const { data: projectJobs = [] } = useQuery({
    queryKey: ["jobs", projectId],
    queryFn: () => jobs.listForProject(projectId),
    refetchInterval: 2000,
  });

  const latestYoutubeJob =
    [...projectJobs]
      .filter((job) => job.job_type === "import_youtube_source")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;

  useEffect(() => {
    if (!youtubeJobId && latestYoutubeJob?.id) {
      setYoutubeJobId(latestYoutubeJob.id);
    }
  }, [latestYoutubeJob?.id, youtubeJobId]);

  const { data: youtubeJob } = useQuery({
    queryKey: ["job", youtubeJobId],
    queryFn: () => jobs.get(youtubeJobId!),
    enabled: !!youtubeJobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" || status === "failed" || status === "cancelled" ? false : 2000;
    },
  });

  const { data: youtubeEvents = [] } = useQuery({
    queryKey: ["job-events", youtubeJobId],
    queryFn: () => jobs.getEvents(youtubeJobId!),
    enabled: !!youtubeJobId,
    refetchInterval: () => {
      const status = youtubeJob?.status;
      return status === "completed" || status === "failed" || status === "cancelled" ? false : 2000;
    },
  });

  useEffect(() => {
    if (youtubeEvents.length === 0) return;
    setLogMessages(
      youtubeEvents.map((event) =>
        event.progress_percent != null ? `[${event.progress_percent}%] ${event.message}` : event.message
      )
    );
  }, [youtubeEvents]);

  useEffect(() => {
    if (youtubeJob?.status === "completed") {
      queryClient.invalidateQueries({ queryKey: ["source-asset", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    }
  }, [projectId, queryClient, youtubeJob?.status]);

  const seedMutation = useMutation({
    mutationFn: () =>
      api<{ asset_id: string }>("/api/dev/seed-source", {
        method: "POST",
        body: JSON.stringify({ project_id: projectId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["source-asset", projectId] });
      queryClient.invalidateQueries({ queryKey: ["jobs", projectId] });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploads.upload(projectId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["source-asset", projectId] });
      queryClient.invalidateQueries({ queryKey: ["jobs", projectId] });
    },
  });

  const youtubeMutation = useMutation({
    mutationFn: (sourceUrl: string) => projects.startYoutubeImport(projectId, sourceUrl),
    onMutate: () => {
      setLogMessages(["YouTube import requested. Waiting for the worker to start..."]);
    },
    onSuccess: (data) => {
      setYoutubeJobId(data.job_id);
      setLogMessages([data.message]);
      queryClient.invalidateQueries({ queryKey: ["jobs", projectId] });
      queryClient.invalidateQueries({ queryKey: ["source-asset", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    },
  });

  const visibleYoutubeJob = youtubeJob ?? latestYoutubeJob ?? null;
  const sourceReady = sourceAsset?.status === "ready";

  return (
    <div className="space-y-6">
      <h2 className="mb-4 text-lg font-medium">Source - {project?.title}</h2>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_380px]">
        <div className="space-y-6">
          <div className="rounded-lg border bg-white p-6">
            {isLoading ? (
              <p className="text-gray-500">Loading...</p>
            ) : sourceAsset ? (
              <>
                <p className="text-sm text-gray-600">{sourceReady ? "Source file ready" : "Source intake in progress"}</p>
                <p className="mt-1 font-medium">{sourceAsset.filename}</p>
                {sourceAsset.duration_seconds != null ? (
                  <p className="mt-1 text-sm text-gray-500">
                    Duration: {Math.floor(sourceAsset.duration_seconds / 60)}:
                    {String(Math.floor(sourceAsset.duration_seconds % 60)).padStart(2, "0")}
                  </p>
                ) : null}
                {sourceReady ? (
                  <a
                    href={`/projects/${projectId}/trim`}
                    className="mt-4 inline-block rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    Continue to Trim
                  </a>
                ) : (
                  <div className="mt-4">
                    <Alert tone="info">The newest source asset is still processing. You can leave this page while the worker finishes.</Alert>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="text-gray-500">No source file yet.</p>
                <p className="mt-2 text-sm text-gray-400">
                  Upload a video file or import directly from YouTube.
                </p>
              </>
            )}
          </div>

          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6">
            <h3 className="text-base font-medium text-gray-900">Choose a source</h3>
            <p className="mt-2 text-sm text-gray-500">
              Upload a file from your computer or pull the sermon directly from YouTube. Starting a new source will replace the current source for this project.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadMutation.mutate(file);
                e.target.value = "";
              }}
            />

            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
                {uploadMutation.isPending ? "Uploading..." : sourceAsset ? "Replace with Upload" : "Upload Video"}
              </Button>
              <Button variant="secondary" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
                {seedMutation.isPending ? "Seeding..." : "Seed Source (Dev)"}
              </Button>
            </div>

            <div className="mt-6 rounded-lg border bg-gray-50 p-4">
              <label className="block text-sm font-medium text-gray-700">YouTube URL</label>
              <input
                type="url"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="mt-2 w-full rounded border border-gray-300 px-3 py-2"
                suppressHydrationWarning
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  onClick={() => youtubeMutation.mutate(youtubeUrl)}
                  disabled={youtubeMutation.isPending || !youtubeUrl.trim()}
                >
                  {youtubeMutation.isPending ? "Queueing..." : sourceAsset ? "Replace with YouTube Import" : "Import from YouTube"}
                </Button>
                {sourceReady ? (
                  <a
                    href={`/projects/${projectId}/trim`}
                    className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Go to Trim
                  </a>
                ) : null}
              </div>
            </div>

            {uploadMutation.isError ? (
              <p className="mt-3 text-sm text-red-600">{(uploadMutation.error as Error).message}</p>
            ) : null}
            {youtubeMutation.isError ? (
              <p className="mt-3 text-sm text-red-600">{(youtubeMutation.error as Error).message}</p>
            ) : null}
          </div>
        </div>

        <div className="space-y-6">
          {visibleYoutubeJob ? (
            <JobStatusPanel
              title="YouTube import job"
              job={visibleYoutubeJob}
              messages={logMessages}
              endRef={logEndRef}
              runningHint="Large YouTube videos can take a while to download and mux. The worker keeps going even if you leave this page."
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
