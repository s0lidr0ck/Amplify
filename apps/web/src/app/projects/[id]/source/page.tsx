"use client";

import { useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, projects, transcript, uploads } from "@/lib/api";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button, LinkButton } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { IngestActivityDock } from "@/components/ingest/IngestActivityDock";

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || Number.isNaN(seconds)) return "Unknown";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

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

  const { data: sermonAsset } = useQuery({
    queryKey: ["sermon-asset", projectId],
    queryFn: () => projects.getSermonAsset(projectId),
  });

  const { data: transcriptData } = useQuery({
    queryKey: ["transcript", projectId],
    queryFn: () => transcript.getForProject(projectId),
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
  const processingActive = Boolean(sourceAsset && !sourceReady);
  const currentState = sourceAsset ? (sourceReady ? "Ready for trim" : "Processing") : "Waiting for upload";

  return (
    <div className="space-y-6">
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <Card>
          <CardHeader
            eyebrow="Current Asset"
            title={`Bring ${project?.title ?? "this project"} into the workflow.`}
            description="Upload the raw sermon video, watch intake progress in one place, and move to Trim as soon as the source asset is ready."
            action={
              <div className="flex flex-wrap justify-end gap-2">
                <Button onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
                  {uploadMutation.isPending ? `Uploading ${uploadProgress ?? 0}%` : sourceAsset ? "Replace source" : "Upload source"}
                </Button>
                {sourceReady ? (
                  <LinkButton href={`/projects/${projectId}/trim`} variant="secondary">
                    Continue to Trim
                  </LinkButton>
                ) : null}
              </div>
            }
          />

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) uploadMutation.mutate(file);
              event.target.value = "";
            }}
          />

          <div className="mt-6 space-y-4">
            {isLoading ? (
              <Alert tone="info">Loading source state from the local API.</Alert>
            ) : sourceAsset ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={sourceReady ? "success" : "info"}>{sourceReady ? "Ready" : "Processing"}</Badge>
                  <Badge tone="neutral">{sourceAsset.filename}</Badge>
                  <Badge tone="neutral">{project?.speaker_display_name ?? project?.speaker ?? "Speaker pending"}</Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-surface-tint p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Duration</p>
                    <p className="mt-2 text-lg font-semibold text-ink">{formatDuration(sourceAsset.duration_seconds)}</p>
                  </div>
                  <div className="rounded-2xl bg-surface-tint p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">State</p>
                    <p className="mt-2 text-lg font-semibold text-ink">{currentState}</p>
                  </div>
                  <div className="rounded-2xl bg-surface-tint p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Next step</p>
                    <p className="mt-2 text-lg font-semibold text-ink">{sourceReady ? "Trim" : "Blocked"}</p>
                  </div>
                </div>
                {sourceReady ? (
                  <Alert tone="success" title="Trim is ready">
                    The source asset has finished processing. You can move directly into the Sermon Master step.
                  </Alert>
                ) : (
                  <Alert tone="info">
                    The newest source asset is still processing. You can leave this page while the worker finishes.
                  </Alert>
                )}
              </>
            ) : (
              <>
                <Alert tone="warning" title="No source file yet">
                  Upload a video file to start the sermon workflow.
                </Alert>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{project?.speaker_display_name ?? project?.speaker ?? "Speaker pending"}</Badge>
                  <Badge tone="warning">Upload needed</Badge>
                </div>
              </>
            )}

            {uploadMutation.isPending && uploadProgress != null ? (
              <div className="rounded-2xl border border-border/70 bg-background-alt p-4">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-ink">Uploading {uploadFilename || "source file"}</span>
                  <span className="text-muted">{uploadProgress}%</span>
                </div>
                <ProgressBar value={uploadProgress} className="mt-3" />
                <p className="mt-2 text-xs text-muted">
                  Large files upload in chunks, so slow connections only retry the current chunk.
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
                {uploadMutation.isPending ? `Uploading ${uploadProgress ?? 0}%` : sourceAsset ? "Replace with upload" : "Upload video"}
              </Button>
              <Button variant="secondary" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
                {seedMutation.isPending ? "Seeding..." : "Seed source (dev)"}
              </Button>
            </div>

            {uploadMutation.isError ? (
              <p className="text-sm text-danger">{(uploadMutation.error as Error).message}</p>
            ) : null}
          </div>
        </Card>

        <div className="space-y-6">
          <IngestActivityDock
            title="Source activity"
            description="Track the upload state and keep the trim handoff visible without another separate chrome stack."
            workflowItems={[
              {
                label: "Source Intake",
                href: `/projects/${projectId}/source`,
                active: true,
                status: sourceReady ? "Ready" : "Needed",
                tone: sourceReady ? "success" : "warning",
              },
              {
                label: "Sermon Master",
                href: `/projects/${projectId}/trim`,
                status: sermonAsset ? "Ready" : sourceReady ? "Next" : "Blocked",
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
                label: "Upload",
                value: sourceAsset ? (sourceReady ? "Complete" : "Received") : "Needed",
                tone: sourceReady ? "success" : sourceAsset ? "info" : "warning",
              },
              {
                label: "Processing",
                value: sourceReady ? "Finished" : processingActive ? "Running" : "Idle",
                tone: sourceReady ? "success" : processingActive ? "info" : "neutral",
              },
              {
                label: "Next step",
                value: sourceReady ? "Trim" : "Blocked",
                tone: sourceReady ? "brand" : "warning",
              },
            ]}
            note={
              <Alert tone="info">
                YouTube import is temporarily hidden while we harden it for production reliability.
              </Alert>
            }
          />
        </div>
      </div>
    </div>
  );
}
