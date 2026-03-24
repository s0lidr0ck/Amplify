"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { API_BASE, projects, transcript } from "@/lib/api";
import { loadProjectDraft, saveProjectDraft, type MetadataDraft } from "@/lib/projectDrafts";
import { streamNdjson } from "@/lib/streaming";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { GenerateStudioFrame } from "@/components/generate/GenerateStudioFrame";

const DEFAULT_MODEL =
  "arn:aws:bedrock:us-east-1:644190502535:inference-profile/us.anthropic.claude-sonnet-4-6";

export default function MetadataPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [host, setHost] = useState("us-east-1");
  const [metadataText, setMetadataText] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [streamStatus, setStreamStatus] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
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

  useEffect(() => {
    if (hasHydratedDraft) return;
    const draft = persistedMetadataDraft?.payload ?? loadProjectDraft<MetadataDraft>(projectId, "metadata");
    if (draft?.metadata) {
      setMetadataText(JSON.stringify(draft.metadata, null, 2));
      setWarnings(draft.warnings ?? []);
    }
    setHasHydratedDraft(true);
  }, [hasHydratedDraft, persistedMetadataDraft, projectId]);

  useEffect(() => {
    if (!hasHydratedDraft) return;
    const timeoutId = window.setTimeout(() => {
      try {
        const parsed = metadataText.trim() ? JSON.parse(metadataText) : {};
        const nextDraft: MetadataDraft = { raw: metadataText, metadata: parsed, warnings };
        saveProjectDraft(projectId, "metadata", nextDraft);
        void projects.saveDraft(projectId, "metadata", nextDraft);
      } catch {
        // Keep invalid in-progress JSON locally until it is corrected.
      }
    }, 700);
    return () => window.clearTimeout(timeoutId);
  }, [hasHydratedDraft, metadataText, projectId, warnings]);

  const transcriptText = transcriptData?.raw_text || transcriptData?.cleaned_text || "";

  async function generateMetadataStream() {
    setError("");
    setWarnings([]);
    setMetadataText("");
    setStreamStatus("Connecting...");
    setIsStreaming(true);

    try {
      const res = await fetch(`${API_BASE}/api/content/metadata/generate-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: transcriptText,
          preacher_name: project?.speaker_display_name || project?.speaker,
          date_preached: project?.sermon_date,
          model,
          host,
        }),
      });

      await streamNdjson<
        | { type: "status"; message: string }
        | { type: "chunk"; delta: string }
        | { type: "done"; raw: string; metadata: Record<string, unknown>; warnings: string[] }
        | { type: "error"; message: string }
      >(res, (payload) => {
        if (payload.type === "status") {
          setStreamStatus(payload.message);
        } else if (payload.type === "chunk") {
          setMetadataText((prev) => prev + payload.delta);
        } else if (payload.type === "done") {
          setStreamStatus("Done");
          setWarnings(payload.warnings ?? []);
          setMetadataText(JSON.stringify(payload.metadata, null, 2));
          saveProjectDraft(projectId, "metadata", {
            raw: payload.raw,
            metadata: payload.metadata,
            warnings: payload.warnings,
          });
        } else if (payload.type === "error") {
          throw new Error(payload.message);
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate metadata.");
      setStreamStatus("");
    } finally {
      setIsStreaming(false);
    }
  }

  return (
    <GenerateStudioFrame
      eyebrow="Metadata Studio"
      title={`Extract structured sermon data for ${project?.title ?? "this message"}.`}
      description="Generate the metadata JSON used downstream for titles, posts, search, and publishing, then correct it locally if anything needs refinement."
      mode={{
        label: "Deliverables Mode",
        title: "Metadata turns Studio work into structured release inputs.",
        description:
          "Keep this page close to Blog and Reel so the publishable package can be validated together before the release handoff.",
      }}
      statusItems={[
        {
          label: "Transcript",
          value: transcriptText ? "Ready" : "Required",
          tone: transcriptText ? "success" : "warning",
        },
        {
          label: "Speaker",
          value: project?.speaker_display_name ?? project?.speaker ?? "Pending",
          tone: project?.speaker_display_name || project?.speaker ? "brand" : "warning",
        },
        {
          label: "Warnings",
          value: warnings.length > 0 ? `${warnings.length}` : "Clear",
          tone: warnings.length > 0 ? "warning" : "success",
        },
      ]}
      actions={transcriptText ? <Button onClick={generateMetadataStream} disabled={isStreaming}>{isStreaming ? "Streaming..." : "Generate Metadata"}</Button> : null}
      snapshotItems={[
        { label: "Transcript", value: transcriptText ? "Ready" : "Missing", tone: transcriptText ? "success" : "warning" },
        {
          label: "Speaker",
          value: project?.speaker_display_name || project?.speaker ? "Set" : "Missing",
          tone: project?.speaker_display_name || project?.speaker ? "brand" : "warning",
        },
        {
          label: "Warnings",
          value: warnings.length ? `${warnings.length}` : "Clear",
          tone: warnings.length ? "warning" : "success",
        },
      ]}
      sections={[
        { label: "Generation", detail: "Run extraction and watch the JSON stream in real time.", href: "#metadata-generation" },
        { label: "Editor", detail: "Fix the structured data before saving the local draft.", href: "#metadata-editor" },
        { label: "Blog", detail: "Refine the article that will use these fields downstream.", href: `/projects/${projectId}/blog` },
        { label: "Publishing", detail: "Move into release prep after metadata is clean.", href: `/projects/${projectId}/publishing` },
      ]}
      sectionsTitle="Deliverable Links"
    >
      {!transcriptText ? (
        <Alert tone="warning" title="Transcript required">
          Generate a transcript first to run metadata extraction.
        </Alert>
      ) : (
        <>
          <Card id="metadata-generation">
            <CardHeader
              eyebrow="Generation"
              title="Create structured metadata"
              description="Run the metadata extractor on the sermon transcript, then inspect the JSON before saving it locally."
            />

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="font-medium text-ink">Model</span>
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-medium text-ink">Host or region</span>
                <input
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                />
              </label>
            </div>

            <div className="mt-6 space-y-3">
              {error ? <Alert tone="danger">{error}</Alert> : null}
              {streamStatus ? <Alert tone="info">{streamStatus}</Alert> : null}
              {warnings.length > 0 ? <Alert tone="warning">{warnings.join(" ")}</Alert> : null}
            </div>
          </Card>

          <Card id="metadata-editor">
            <CardHeader
              eyebrow="Editor"
              title="Editable JSON"
              description="Validate and store the metadata draft locally once it matches the sermon."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    try {
                      const parsed = JSON.parse(metadataText);
                      const draft = { raw: metadataText, metadata: parsed, warnings };
                      saveProjectDraft(projectId, "metadata", draft);
                      void projects.saveDraft(projectId, "metadata", draft);
                      setError("");
                    } catch {
                      setError("Metadata JSON is not valid. Fix it before saving locally.");
                    }
                  }}
                >
                  Save Local Draft
                </Button>
              }
            />
            <div className="mt-6">
              <textarea
                value={metadataText}
                onChange={(e) => setMetadataText(e.target.value)}
                className="min-h-[30rem] w-full rounded-[1.75rem] border border-border bg-surface px-5 py-4 font-mono text-sm text-ink outline-none transition focus:border-brand"
                placeholder="Generated metadata JSON will appear here."
                />
              </div>
            </Card>
        </>
      )}
    </GenerateStudioFrame>
  );
}
