"use client";

import { useParams } from "next/navigation";
import { useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { projects, api, uploads } from "@/lib/api";

export default function SourcePage() {
  const params = useParams();
  const projectId = params.id as string;
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projects.get(projectId),
  });

  const { data: sourceAsset, isLoading } = useQuery({
    queryKey: ["source-asset", projectId],
    queryFn: () => projects.getSourceAsset(projectId),
  });

  const seedMutation = useMutation({
    mutationFn: () =>
      api<{ asset_id: string }>("/api/dev/seed-source", {
        method: "POST",
        body: JSON.stringify({ project_id: projectId }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["source-asset", projectId] }),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploads.upload(projectId, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["source-asset", projectId] }),
  });

  return (
    <div>
      <h2 className="mb-4 text-lg font-medium">Source · {project?.title}</h2>
      {isLoading ? (
        <p className="text-gray-500">Loading...</p>
      ) : sourceAsset ? (
        <div className="rounded-lg border bg-white p-6">
          <p className="text-sm text-gray-600">Source file ready</p>
          <p className="mt-1 font-medium">{sourceAsset.filename}</p>
          {sourceAsset.duration_seconds != null && (
            <p className="mt-1 text-sm text-gray-500">
              Duration: {Math.floor(sourceAsset.duration_seconds / 60)}:
              {String(Math.floor(sourceAsset.duration_seconds % 60)).padStart(2, "0")}
            </p>
          )}
          <a
            href={`/projects/${projectId}/trim`}
            className="mt-4 inline-block rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Continue to Trim
          </a>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
          <p className="text-gray-500">No source file yet.</p>
          <p className="mt-2 text-sm text-gray-400">
            Upload a video file or use the dev seed to test the flow.
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
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadMutation.isPending}
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {uploadMutation.isPending ? "Uploading..." : "Upload video"}
            </button>
            <button
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {seedMutation.isPending ? "Seeding..." : "Seed source (dev)"}
            </button>
            <a
              href={`/projects/${projectId}/trim`}
              className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Go to Trim
            </a>
          </div>
          {uploadMutation.isError && (
            <p className="mt-2 text-sm text-red-600">{(uploadMutation.error as Error).message}</p>
          )}
        </div>
      )}
    </div>
  );
}
