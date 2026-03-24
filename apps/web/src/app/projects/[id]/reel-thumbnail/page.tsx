"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE, projects, uploads } from "@/lib/api";
import { loadProjectDraft, saveProjectDraft, type ReelDraft } from "@/lib/projectDrafts";
import { streamNdjson } from "@/lib/streaming";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { GenerateWorkspace } from "@/components/generate/GenerateWorkspace";
import { StepIntro } from "@/components/workflow/StepIntro";

const EMPTY_PLATFORM = { title: "", description: "", tags: [] as string[] };

const EMPTY_REEL_DRAFT: ReelDraft = {
  caption: "",
  thumbnail_prompts: [],
  platforms: {
    youtube: { ...EMPTY_PLATFORM },
    facebook: { ...EMPTY_PLATFORM },
    instagram: { ...EMPTY_PLATFORM },
    tiktok: { ...EMPTY_PLATFORM },
  },
};

function cloneDraft(draft: ReelDraft): ReelDraft {
  return {
    caption: draft.caption,
    thumbnail_prompts: [...draft.thumbnail_prompts],
    platforms: {
      youtube: { ...draft.platforms.youtube, tags: [...draft.platforms.youtube.tags] },
      facebook: { ...draft.platforms.facebook, tags: [...draft.platforms.facebook.tags] },
      instagram: { ...draft.platforms.instagram, tags: [...draft.platforms.instagram.tags] },
      tiktok: { ...draft.platforms.tiktok, tags: [...draft.platforms.tiktok.tags] },
    },
  };
}

export default function ReelThumbnailPage() {
  const params = useParams();
  const projectId = params.id as string;
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ReelDraft>(EMPTY_REEL_DRAFT);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [hasHydratedDraft, setHasHydratedDraft] = useState(false);
  const [thumbnailUploadError, setThumbnailUploadError] = useState("");
  const [thumbnailUploadStatus, setThumbnailUploadStatus] = useState("");
  const [generateError, setGenerateError] = useState("");
  const [generateStatus, setGenerateStatus] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projects.get(projectId),
  });

  const { data: persistedReelDraft } = useQuery({
    queryKey: ["project-draft", projectId, "reel"],
    queryFn: () => projects.getDraft<ReelDraft>(projectId, "reel"),
  });

  const { data: reelThumbnailAsset } = useQuery({
    queryKey: ["reel-thumbnail-asset", projectId],
    queryFn: () => projects.getReelThumbnailAsset(projectId),
  });

  useEffect(() => {
    if (hasHydratedDraft) return;
    const stored = persistedReelDraft?.payload ?? loadProjectDraft<ReelDraft>(projectId, "reel");
    if (stored) {
      setDraft(
        cloneDraft({ ...EMPTY_REEL_DRAFT, ...stored, platforms: { ...EMPTY_REEL_DRAFT.platforms, ...stored.platforms } })
      );
    }
    setHasHydratedDraft(true);
  }, [hasHydratedDraft, persistedReelDraft, projectId]);

  useEffect(() => {
    if (!hasHydratedDraft) return;
    const timeoutId = window.setTimeout(() => {
      saveProjectDraft(projectId, "reel", draft);
      void projects.saveDraft(projectId, "reel", draft);
    }, 700);
    return () => window.clearTimeout(timeoutId);
  }, [draft, hasHydratedDraft, projectId]);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      setThumbnailUploadError("");
      setThumbnailUploadStatus("Uploading reel thumbnail...");
      return uploads.upload(projectId, file, "reel_thumbnail");
    },
    onSuccess: async () => {
      setThumbnailUploadStatus("Reel thumbnail uploaded.");
      await queryClient.invalidateQueries({ queryKey: ["reel-thumbnail-asset", projectId] });
      window.setTimeout(() => setThumbnailUploadStatus(""), 2200);
    },
    onError: (error) => {
      setThumbnailUploadStatus("");
      setThumbnailUploadError(error instanceof Error ? error.message : "Reel thumbnail upload failed.");
    },
  });

  async function copyText(key: string, value: string) {
    if (!value.trim()) return;
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((current) => (current === key ? null : current));
    }, 1800);
  }

  async function generateReelThumbnailPrompts() {
    if (!draft.caption.trim()) {
      setGenerateError("Add or generate the reel caption first so the thumbnail prompts have source material.");
      return;
    }

    setGenerateError("");
    setGenerateStatus("Connecting...");
    setIsGenerating(true);

    try {
      const res = await fetch(`${API_BASE}/api/content/reel/generate-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript_excerpt: draft.caption,
          preacher_name: project?.speaker_display_name || project?.speaker,
          date_preached: project?.sermon_date,
          model: "arn:aws:bedrock:us-east-1:644190502535:inference-profile/us.anthropic.claude-sonnet-4-6",
          host: "us-east-1",
        }),
      });

      await streamNdjson<
        | { type: "status"; message: string }
        | { type: "chunk"; target: "social" | "graphics"; delta: string }
        | { type: "done"; thumbnail_prompts: Array<Record<string, string>> }
        | { type: "error"; message: string }
      >(res, (payload) => {
        if (payload.type === "status") {
          setGenerateStatus(payload.message);
        } else if (payload.type === "done") {
          const nextDraft: ReelDraft = { ...draft, thumbnail_prompts: payload.thumbnail_prompts || [] };
          setGenerateStatus("Done");
          setDraft(nextDraft);
          saveProjectDraft(projectId, "reel", nextDraft);
          void projects.saveDraft(projectId, "reel", nextDraft);
          void queryClient.invalidateQueries({ queryKey: ["project-draft", projectId, "reel"] });
        } else if (payload.type === "error") {
          throw new Error(payload.message);
        }
      });
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : "Failed to generate reel thumbnail prompts.");
      setGenerateStatus("");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <StepIntro
        eyebrow="Reel Thumbnail"
        title={`Finish the reel thumbnail for ${project?.title ?? "this project"}.`}
        description="Review the saved reel thumbnail prompt ideas, adjust them if needed, and upload the selected cover image."
        statusItems={[
          {
            label: "Prompt ideas",
            value: draft.thumbnail_prompts.length ? "Ready" : "Missing",
            tone: draft.thumbnail_prompts.length ? "brand" : "warning",
          },
          {
            label: "Thumbnail asset",
            value: reelThumbnailAsset ? "Uploaded" : "Missing",
            tone: reelThumbnailAsset ? "success" : "warning",
          },
        ]}
      />

      <GenerateWorkspace
        snapshotItems={[
          { label: "Caption", value: draft.caption.trim() ? "Ready" : "Missing", tone: draft.caption.trim() ? "success" : "warning" },
          {
            label: "Prompts",
            value: draft.thumbnail_prompts.length ? "Generated" : "Empty",
            tone: draft.thumbnail_prompts.length ? "brand" : "neutral",
          },
          {
            label: "Asset",
            value: reelThumbnailAsset ? "Uploaded" : "Missing",
            tone: reelThumbnailAsset ? "success" : "warning",
          },
        ]}
        sections={[
          { label: "Prompt ideas", detail: "Generate and compare the three reel thumbnail directions.", href: "#reel-thumbnail-prompts" },
          { label: "Upload", detail: "Store the selected cover image here for later publishing.", href: "#reel-thumbnail-upload" },
        ]}
      >
        <Card id="reel-thumbnail-prompts">
          <CardHeader
            eyebrow="Creative"
            title="Reel Thumbnail Prompt Ideas"
            action={
              <Button onClick={generateReelThumbnailPrompts} disabled={isGenerating}>
                {isGenerating ? "Generating..." : "Generate 3 Prompt Ideas"}
              </Button>
            }
          />
          <div className="mt-6 space-y-3">
            {!draft.caption.trim() ? (
              <Alert tone="warning">Generate the reel package or add caption text first so thumbnail prompts have source material.</Alert>
            ) : null}
            {generateError ? <Alert tone="danger">{generateError}</Alert> : null}
            {generateStatus ? <Alert tone="info">{generateStatus}</Alert> : null}
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {["A", "B", "C"].map((label, index) => {
              const prompt = draft.thumbnail_prompts[index];
              return (
                <div key={label} className="rounded-[1.5rem] border border-border/80 bg-background-alt p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-ink">Prompt {label}</p>
                      <p className="mt-1 text-xs text-muted">{prompt?.title || "Graphic concept"}</p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void copyText(`reel-thumbnail-${label}`, prompt?.prompt || "")}
                      disabled={!prompt?.prompt?.trim()}
                    >
                      {copiedKey === `reel-thumbnail-${label}` ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <textarea
                    value={prompt?.prompt || ""}
                    onChange={(event) => {
                      const next = [...draft.thumbnail_prompts];
                      next[index] = { ...(next[index] || {}), label, prompt: event.target.value };
                      setDraft((current) => ({ ...current, thumbnail_prompts: next }));
                    }}
                    className="min-h-[18rem] w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm leading-7 text-ink outline-none transition focus:border-brand"
                    placeholder={`Thumbnail prompt ${label} will appear here.`}
                  />
                </div>
              );
            })}
          </div>
        </Card>

        <Card id="reel-thumbnail-upload">
          <CardHeader eyebrow="Asset" title="Reel thumbnail upload" description="Upload the chosen reel cover image here." />

          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-ink">Reel thumbnail</p>
                <p className="mt-1 text-xs text-muted">Upload the chosen reel cover image here.</p>
              </div>
              {reelThumbnailAsset ? <Badge tone="success">Uploaded</Badge> : <Badge tone="neutral">Missing</Badge>}
            </div>

            {thumbnailUploadError ? <Alert tone="danger">{thumbnailUploadError}</Alert> : null}
            {thumbnailUploadStatus ? <Alert tone="info">{thumbnailUploadStatus}</Alert> : null}
            <label className="block">
              <span className="sr-only">Choose reel thumbnail</span>
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
            {reelThumbnailAsset ? (
              <div className="space-y-3">
                <p className="text-xs text-muted">{reelThumbnailAsset.filename}</p>
                <div className="overflow-hidden rounded-[1.25rem] border border-border bg-surface">
                  <Image
                    src={reelThumbnailAsset.playback_url ?? `${API_BASE}/api/media/asset/${reelThumbnailAsset.id}`}
                    alt={reelThumbnailAsset.filename}
                    width={640}
                    height={360}
                    className="h-auto w-full object-cover"
                    unoptimized
                  />
                </div>
              </div>
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-[1.25rem] border border-dashed border-border bg-surface px-4 text-center text-sm text-muted">
                No reel thumbnail uploaded yet
              </div>
            )}
          </div>
        </Card>
      </GenerateWorkspace>
    </div>
  );
}
