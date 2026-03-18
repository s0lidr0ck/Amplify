"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { API_BASE, projects, transcript } from "@/lib/api";
import { loadProjectDraft, saveProjectDraft, type MetadataDraft } from "@/lib/projectDrafts";
import { streamNdjson } from "@/lib/streaming";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { StepIntro } from "@/components/workflow/StepIntro";

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

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projects.get(projectId),
  });

  const { data: transcriptData } = useQuery({
    queryKey: ["transcript", projectId],
    queryFn: () => transcript.getForProject(projectId),
  });

  useEffect(() => {
    const draft = loadProjectDraft<MetadataDraft>(projectId, "metadata");
    if (draft) {
      setMetadataText(JSON.stringify(draft.metadata, null, 2));
      setWarnings(draft.warnings ?? []);
    }
  }, [projectId]);

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
          preacher_name: project?.speaker,
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
    <div className="space-y-6">
      <StepIntro
        eyebrow="Metadata Studio"
        title={`Extract structured sermon data for ${project?.title ?? "this message"}.`}
        description="Generate the metadata JSON used downstream for packaging, search, and publishing, then correct it locally if anything needs refinement."
        meta={[
          project?.speaker ?? "Speaker pending",
          transcriptText ? "Transcript ready" : "Transcript required",
          warnings.length > 0 ? `${warnings.length} warnings` : "No current warnings",
        ]}
      />

      {!transcriptText ? (
        <Alert tone="warning" title="Transcript required">
          Approve or generate a transcript first to run metadata extraction.
        </Alert>
      ) : (
        <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.25fr)_360px]">
          <div className="space-y-6">
            <Card>
              <CardHeader
                eyebrow="Generation"
                title="Create structured metadata"
                description="Run the metadata extractor on the sermon transcript, then inspect the JSON before saving it locally."
                action={
                  <Button onClick={generateMetadataStream} disabled={isStreaming}>
                    {isStreaming ? "Streaming..." : "Generate Metadata"}
                  </Button>
                }
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

            <Card>
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
                        saveProjectDraft(projectId, "metadata", { raw: metadataText, metadata: parsed, warnings });
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
                  className="min-h-[34rem] w-full rounded-[1.75rem] border border-border bg-surface px-5 py-4 font-mono text-sm text-ink outline-none transition focus:border-brand"
                  placeholder="Generated metadata JSON will appear here."
                />
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader
                eyebrow="Context"
                title="Extraction inputs"
                description="The metadata run uses the sermon transcript plus the project details already stored on the project."
              />
              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between rounded-2xl bg-surface-tint p-4 text-sm">
                  <span className="text-muted">Transcript</span>
                  <Badge tone={transcriptText ? "success" : "warning"}>{transcriptText ? "Ready" : "Missing"}</Badge>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-surface-tint p-4 text-sm">
                  <span className="text-muted">Speaker</span>
                  <Badge tone={project?.speaker ? "brand" : "warning"}>{project?.speaker ? "Set" : "Missing"}</Badge>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-surface-tint p-4 text-sm">
                  <span className="text-muted">Warnings</span>
                  <Badge tone={warnings.length ? "warning" : "success"}>{warnings.length ? "Review needed" : "Clear"}</Badge>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
