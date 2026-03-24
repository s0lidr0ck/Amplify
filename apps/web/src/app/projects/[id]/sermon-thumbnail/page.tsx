"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE, projects, transcript, uploads } from "@/lib/api";
import { loadProjectDraft, saveProjectDraft, type MetadataDraft, type PackagingDraft } from "@/lib/projectDrafts";
import { streamNdjson } from "@/lib/streaming";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { GenerateWorkspace } from "@/components/generate/GenerateWorkspace";
import { StepIntro } from "@/components/workflow/StepIntro";

const DEFAULT_MODEL =
  "arn:aws:bedrock:us-east-1:644190502535:inference-profile/us.anthropic.claude-sonnet-4-6";
const DEFAULT_HOST = "us-east-1";

export default function SermonThumbnailPage() {
  const params = useParams();
  const projectId = params.id as string;
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnailPrompts, setThumbnailPrompts] = useState<Array<Record<string, string>>>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [hasHydratedDraft, setHasHydratedDraft] = useState(false);
  const [thumbnailUploadError, setThumbnailUploadError] = useState("");
  const [thumbnailUploadStatus, setThumbnailUploadStatus] = useState("");

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projects.get(projectId),
  });

  const { data: transcriptData } = useQuery({
    queryKey: ["transcript", projectId],
    queryFn: () => transcript.getForProject(projectId),
  });

  const { data: persistedMetadataDraft } = useQuery({
    queryKey: ["project-draft", projectId, "metadata"],
    queryFn: () => projects.getDraft<MetadataDraft>(projectId, "metadata"),
  });

  const { data: persistedPackagingDraft } = useQuery({
    queryKey: ["project-draft", projectId, "packaging"],
    queryFn: () => projects.getDraft<PackagingDraft>(projectId, "packaging"),
  });

  const { data: sermonThumbnailAsset } = useQuery({
    queryKey: ["sermon-thumbnail-asset", projectId],
    queryFn: () => projects.getSermonThumbnailAsset(projectId),
  });

  const transcriptText = transcriptData?.raw_text || transcriptData?.cleaned_text || "";

  useEffect(() => {
    if (hasHydratedDraft) return;
    const packagingDraft = persistedPackagingDraft?.payload ?? loadProjectDraft<PackagingDraft>(projectId, "packaging");
    if (packagingDraft) {
      setTitle(packagingDraft.title || "");
      setDescription(packagingDraft.description || "");
      setThumbnailPrompts(packagingDraft.thumbnail_prompts || []);
    }
    setHasHydratedDraft(true);
  }, [hasHydratedDraft, persistedPackagingDraft, projectId]);

  const storedMetadata = useMemo(
    () => persistedMetadataDraft?.payload ?? loadProjectDraft<MetadataDraft>(projectId, "metadata"),
    [persistedMetadataDraft, projectId]
  );

  useEffect(() => {
    if (!hasHydratedDraft) return;
    const timeoutId = window.setTimeout(() => {
      const draft: PackagingDraft = {
        title,
        description,
        thumbnail_prompts: thumbnailPrompts,
      };
      saveProjectDraft(projectId, "packaging", draft);
      void projects.saveDraft(projectId, "packaging", draft);
    }, 700);
    return () => window.clearTimeout(timeoutId);
  }, [description, hasHydratedDraft, projectId, thumbnailPrompts, title]);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      setThumbnailUploadError("");
      setThumbnailUploadStatus("Uploading sermon thumbnail...");
      return uploads.upload(projectId, file, "sermon_thumbnail");
    },
    onSuccess: async () => {
      setThumbnailUploadStatus("Sermon thumbnail uploaded.");
      await queryClient.invalidateQueries({ queryKey: ["sermon-thumbnail-asset", projectId] });
      window.setTimeout(() => setThumbnailUploadStatus(""), 2200);
    },
    onError: (uploadError) => {
      setThumbnailUploadStatus("");
      setThumbnailUploadError(uploadError instanceof Error ? uploadError.message : "Sermon thumbnail upload failed.");
    },
  });

  async function generateThumbnailPrompts() {
    setError("");
    setStatus("Connecting...");
    setIsStreaming(true);
    setThumbnailPrompts([]);

    try {
      const res = await fetch(`${API_BASE}/api/content/packaging/generate-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: transcriptText,
          preacher_name: project?.speaker_display_name || project?.speaker,
          date_preached: project?.sermon_date,
          model: DEFAULT_MODEL,
          host: DEFAULT_HOST,
          sermon_metadata: (storedMetadata?.metadata as Record<string, unknown>) ?? null,
        }),
      });

      await streamNdjson<
        | { type: "status"; message: string }
        | { type: "chunk"; target: "youtube" | "thumbnail"; delta: string }
        | {
            type: "done";
            title: string;
            description: string;
            thumbnail_prompts: Array<Record<string, string>>;
          }
        | { type: "error"; message: string }
      >(res, (payload) => {
        if (payload.type === "status") {
          setStatus(payload.message);
        } else if (payload.type === "done") {
          const nextDraft: PackagingDraft = {
            title: payload.title || title,
            description: payload.description || description,
            thumbnail_prompts: payload.thumbnail_prompts || [],
          };
          setStatus("Done");
          setTitle(nextDraft.title);
          setDescription(nextDraft.description);
          setThumbnailPrompts(nextDraft.thumbnail_prompts);
          saveProjectDraft(projectId, "packaging", nextDraft);
          void projects.saveDraft(projectId, "packaging", nextDraft);
        } else if (payload.type === "error") {
          throw new Error(payload.message);
        }
      });
    } catch (streamError) {
      setError(streamError instanceof Error ? streamError.message : "Failed to generate sermon thumbnail prompts.");
      setStatus("");
    } finally {
      setIsStreaming(false);
    }
  }

  async function copyText(key: string, value: string) {
    if (!value.trim()) return;
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((current) => (current === key ? null : current));
    }, 1800);
  }

  return (
    <div className="space-y-6">
      <StepIntro
        eyebrow="Sermon Thumbnail"
        title={`Shape the sermon thumbnail for ${project?.title ?? "this sermon"}.`}
        description="Generate the three prompt ideas for the main sermon thumbnail, then upload the version you want to carry through the rest of the workflow."
        statusItems={[
          {
            label: "Transcript",
            value: transcriptText ? "Ready" : "Missing",
            tone: transcriptText ? "success" : "warning",
          },
          {
            label: "Prompt ideas",
            value: thumbnailPrompts.length ? "Generated" : "Not started",
            tone: thumbnailPrompts.length ? "brand" : "neutral",
          },
          {
            label: "Thumbnail asset",
            value: sermonThumbnailAsset ? "Uploaded" : "Missing",
            tone: sermonThumbnailAsset ? "success" : "warning",
          },
        ]}
      />

      {!transcriptText ? (
        <Alert tone="warning" title="Transcript required">
          Generate a transcript first to build sermon thumbnail prompts.
        </Alert>
      ) : (
        <GenerateWorkspace
          snapshotItems={[
            { label: "Transcript", value: transcriptText ? "Ready" : "Missing", tone: transcriptText ? "success" : "warning" },
            {
              label: "Prompts",
              value: thumbnailPrompts.length ? "Generated" : "Empty",
              tone: thumbnailPrompts.length ? "brand" : "neutral",
            },
            {
              label: "Asset",
              value: sermonThumbnailAsset ? "Uploaded" : "Missing",
              tone: sermonThumbnailAsset ? "success" : "warning",
            },
          ]}
          sections={[
            { label: "Prompt ideas", detail: "Generate and compare the three thumbnail directions.", href: "#sermon-thumbnail-prompts" },
            { label: "Upload", detail: "Place the chosen cover image here once the direction is locked.", href: "#sermon-thumbnail-upload" },
          ]}
        >
          <Card id="sermon-thumbnail-prompts">
            <CardHeader
              eyebrow="Creative"
              title="Sermon Thumbnail Prompt Ideas"
              action={
                <Button onClick={generateThumbnailPrompts} disabled={isStreaming}>
                  {isStreaming ? "Generating..." : "Generate 3 Prompt Ideas"}
                </Button>
              }
            />

            <div className="mt-6 space-y-6">
              {error ? <Alert tone="danger">{error}</Alert> : null}
              {status ? <Alert tone="info">{status}</Alert> : null}

              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {["A", "B", "C"].map((label, index) => {
                  const prompt = thumbnailPrompts[index];
                  return (
                    <div key={label} className="rounded-[1.5rem] border border-border/80 bg-background-alt p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <span className="font-semibold text-ink">Prompt {label}</span>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => void copyText(`sermon-thumbnail-${label}`, prompt?.prompt || "")}
                          disabled={!prompt?.prompt?.trim()}
                        >
                          {copiedKey === `sermon-thumbnail-${label}` ? "Copied" : "Copy"}
                        </Button>
                      </div>
                      <textarea
                        value={prompt?.prompt || ""}
                        onChange={(event) => {
                          const next = [...thumbnailPrompts];
                          next[index] = { ...(next[index] || {}), label, prompt: event.target.value };
                          setThumbnailPrompts(next);
                        }}
                        className="min-h-[18rem] w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm leading-7 text-ink outline-none transition focus:border-brand"
                        placeholder={`Prompt ${label} will appear here.`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          <Card id="sermon-thumbnail-upload">
            <CardHeader
              eyebrow="Asset"
              title="Sermon thumbnail upload"
              description="Upload the selected image here so the rest of the workflow can reuse it."
            />

            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">Sermon thumbnail</p>
                  <p className="mt-1 text-xs text-muted">Upload the image selected from these prompt directions.</p>
                </div>
                {sermonThumbnailAsset ? <Badge tone="success">Uploaded</Badge> : <Badge tone="neutral">Missing</Badge>}
              </div>

              {thumbnailUploadError ? <Alert tone="danger">{thumbnailUploadError}</Alert> : null}
              {thumbnailUploadStatus ? <Alert tone="info">{thumbnailUploadStatus}</Alert> : null}
              <label className="block">
                <span className="sr-only">Choose sermon thumbnail</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) uploadMutation.mutate(file);
                    event.currentTarget.value = "";
                  }}
                  className="block w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink file:mr-4 file:rounded-full file:border-0 file:bg-brand file:px-4 file:py-2 file:font-semibold file:text-white"
                />
              </label>
              {sermonThumbnailAsset ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted">{sermonThumbnailAsset.filename}</p>
                  <div className="overflow-hidden rounded-[1.25rem] border border-border bg-surface">
                    <Image
                      src={sermonThumbnailAsset.playback_url ?? `${API_BASE}/api/media/asset/${sermonThumbnailAsset.id}`}
                      alt={sermonThumbnailAsset.filename}
                      width={640}
                      height={360}
                      className="h-auto w-full object-cover"
                      unoptimized
                    />
                  </div>
                </div>
              ) : (
                <div className="flex aspect-video items-center justify-center rounded-[1.25rem] border border-dashed border-border bg-surface px-4 text-center text-sm text-muted">
                  No sermon thumbnail uploaded yet
                </div>
              )}
            </div>
          </Card>
        </GenerateWorkspace>
      )}
    </div>
  );
}
