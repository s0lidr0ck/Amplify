"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { API_BASE, projects, transcript } from "@/lib/api";
import { loadProjectDraft, saveProjectDraft, type MetadataDraft, type PackagingDraft } from "@/lib/projectDrafts";
import { streamNdjson } from "@/lib/streaming";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { GenerateWorkspace } from "@/components/generate/GenerateWorkspace";
import { StepIntro } from "@/components/workflow/StepIntro";

const DEFAULT_MODEL =
  "arn:aws:bedrock:us-east-1:644190502535:inference-profile/us.anthropic.claude-sonnet-4-6";
const DEFAULT_HOST = "us-east-1";

export default function TitleDescPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnailPrompts, setThumbnailPrompts] = useState<Array<Record<string, string>>>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [hasHydratedDraft, setHasHydratedDraft] = useState(false);

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

  async function generateTitleAndDescription() {
    setError("");
    setStatus("Connecting...");
    setIsStreaming(true);
    setTitle("");
    setDescription("");

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
        } else if (payload.type === "chunk") {
          if (payload.target === "youtube") {
            setDescription((prev) => prev + payload.delta);
          }
        } else if (payload.type === "done") {
          const nextDraft: PackagingDraft = {
            title: payload.title,
            description: payload.description,
            thumbnail_prompts: payload.thumbnail_prompts || thumbnailPrompts,
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
      setError(streamError instanceof Error ? streamError.message : "Failed to generate title and description.");
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
        eyebrow="Title & Desc"
        title={`Write the YouTube packaging for ${project?.title ?? "this sermon"}.`}
        description="Generate and refine the sermon title and description while keeping the saved thumbnail prompts in the same draft bundle."
        statusItems={[
          {
            label: "Transcript",
            value: transcriptText ? "Ready" : "Missing",
            tone: transcriptText ? "success" : "warning",
          },
          {
            label: "Title",
            value: title.trim() ? "Ready" : "Missing",
            tone: title.trim() ? "brand" : "warning",
          },
          {
            label: "Description",
            value: description.trim() ? "Ready" : "Missing",
            tone: description.trim() ? "info" : "warning",
          },
        ]}
      />

      {!transcriptText ? (
        <Alert tone="warning" title="Transcript required">
          Generate a transcript first to build the YouTube title and description.
        </Alert>
      ) : (
        <GenerateWorkspace
          snapshotItems={[
            {
              label: "Transcript",
              value: transcriptText ? "Ready" : "Missing",
              tone: transcriptText ? "success" : "warning",
            },
            { label: "Title", value: title.trim() ? "Ready" : "Empty", tone: title.trim() ? "brand" : "neutral" },
            {
              label: "Description",
              value: description.trim() ? "Ready" : "Empty",
              tone: description.trim() ? "info" : "neutral",
            },
          ]}
          sections={[
            { label: "Output", detail: "Generate the packaging copy and keep the result editable.", href: "#title-desc-output" },
            { label: "Editor", detail: "Copy or refine the final YouTube fields in place.", href: "#title-desc-editor" },
          ]}
        >
          <Card id="title-desc-output">
            <CardHeader
              eyebrow="Output"
              title="YouTube Title & Description"
              action={
                <Button onClick={generateTitleAndDescription} disabled={isStreaming}>
                  {isStreaming ? "Streaming..." : "Generate Title & Description"}
                </Button>
              }
            />

            <div className="mt-6 space-y-3">
              {error ? <Alert tone="danger">{error}</Alert> : null}
              {status ? <Alert tone="info">{status}</Alert> : null}
            </div>
          </Card>

          <Card id="title-desc-editor">
            <CardHeader
              eyebrow="Editor"
              title="Review and refine"
              description="Keep the title and description visible together so the final packaging reads as one unit."
            />

            <div className="mt-6 space-y-4">
              <label className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-ink">YouTube title</span>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void copyText("youtube-title", title)}
                    disabled={!title.trim()}
                  >
                    {copiedKey === "youtube-title" ? "Copied" : "Copy"}
                  </Button>
                </div>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                />
              </label>
              <label className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-ink">YouTube description</span>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void copyText("youtube-description", description)}
                    disabled={!description.trim()}
                  >
                    {copiedKey === "youtube-description" ? "Copied" : "Copy"}
                  </Button>
                </div>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="min-h-[16rem] w-full rounded-[1.5rem] border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                />
              </label>
            </div>
          </Card>
        </GenerateWorkspace>
      )}
    </div>
  );
}
