"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, jobs, projects, uploads } from "@/lib/api";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";

export default function SourcePage() {
  const params = useParams();
  const projectId = params.id as string;
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadFilename, setUploadFilename] = useState<string>("");

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
    mutationFn: (file: File) => {
      setUploadFilename(file.name);
      return uploads.upload(projectId, file, "source_video", setUploadProgress);
    },
    onSuccess: () => {
      setUploadProgress(100);
      queryClient.invalidateQueries({ queryKey: ["source-asset", projectId] });
      queryClient.invalidateQueries({ queryKey: ["jobs", projectId] });
    },
    onSettled: () => {
      window.setTimeout(() => {
        setUploadProgress(null);
        setUploadFilename("");
      }, 600);
    },
  });
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
                  Upload a video file to start this sermon workflow.
                </p>
              </>
            )}
          </div>

          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6">
            <h3 className="text-base font-medium text-gray-900">Choose a source</h3>
            <p className="mt-2 text-sm text-gray-500">
              Upload a file from your computer. Starting a new source will replace the current source for this project.
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

            {uploadMutation.isPending && uploadProgress != null ? (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-800">Uploading {uploadFilename || "source file"}</span>
                  <span className="text-slate-500">{uploadProgress}%</span>
                </div>
                <ProgressBar value={uploadProgress} className="mt-3" />
                <p className="mt-2 text-xs text-slate-500">Large files upload in chunks now, so slow connections only retry the current chunk.</p>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
                {uploadMutation.isPending ? `Uploading ${uploadProgress ?? 0}%` : sourceAsset ? "Replace with Upload" : "Upload Video"}
              </Button>
              <Button variant="secondary" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
                {seedMutation.isPending ? "Seeding..." : "Seed Source (Dev)"}
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

            {uploadMutation.isError ? (
              <p className="mt-3 text-sm text-red-600">{(uploadMutation.error as Error).message}</p>
            ) : null}
            <div className="mt-4">
              <Alert tone="info">YouTube import is temporarily hidden while we harden it for production reliability.</Alert>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
