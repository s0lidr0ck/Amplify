"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { API_BASE, projects, transcript } from "@/lib/api";
import { loadProjectDraft, saveProjectDraft, type BlogDraft } from "@/lib/projectDrafts";
import { streamNdjson } from "@/lib/streaming";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { StepIntro } from "@/components/workflow/StepIntro";

const DEFAULT_MODEL =
  "arn:aws:bedrock:us-east-1:644190502535:inference-profile/us.anthropic.claude-sonnet-4-6";

export default function BlogPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [host, setHost] = useState("us-east-1");
  const [markdown, setMarkdown] = useState("");
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

  const { data: persistedBlogDraft } = useQuery({
    queryKey: ["project-draft", projectId, "blog"],
    queryFn: () => projects.getDraft<BlogDraft>(projectId, "blog"),
  });

  useEffect(() => {
    if (hasHydratedDraft) return;
    const draft = persistedBlogDraft?.payload ?? loadProjectDraft<BlogDraft>(projectId, "blog");
    if (draft?.markdown) setMarkdown(draft.markdown);
    setHasHydratedDraft(true);
  }, [hasHydratedDraft, persistedBlogDraft, projectId]);

  useEffect(() => {
    if (!hasHydratedDraft) return;
    const timeoutId = window.setTimeout(() => {
      const draft = { markdown };
      saveProjectDraft(projectId, "blog", draft);
      void projects.saveDraft(projectId, "blog", draft);
    }, 700);
    return () => window.clearTimeout(timeoutId);
  }, [hasHydratedDraft, markdown, projectId]);

  const transcriptText = transcriptData?.raw_text || transcriptData?.cleaned_text || "";

  async function generateBlogStream() {
    setError("");
    setStreamStatus("Connecting...");
    setMarkdown("");
    setIsStreaming(true);

    try {
      const res = await fetch(`${API_BASE}/api/content/blog/generate-stream`, {
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

      let finalMarkdown = "";
      await streamNdjson<
        | { type: "status"; message: string }
        | { type: "chunk"; delta: string }
        | { type: "done"; markdown: string }
        | { type: "error"; message: string }
      >(res, (payload) => {
        if (payload.type === "status") {
          setStreamStatus(payload.message);
        } else if (payload.type === "chunk") {
          finalMarkdown += payload.delta;
          setMarkdown((prev) => prev + payload.delta);
        } else if (payload.type === "done") {
          finalMarkdown = payload.markdown;
          setMarkdown(payload.markdown);
          setStreamStatus("Done");
          const draft = { markdown: payload.markdown };
          saveProjectDraft(projectId, "blog", draft);
          void projects.saveDraft(projectId, "blog", draft);
        } else if (payload.type === "error") {
          throw new Error(payload.message);
        }
      });

      if (finalMarkdown.trim()) {
        const draft = { markdown: finalMarkdown };
        saveProjectDraft(projectId, "blog", draft);
        void projects.saveDraft(projectId, "blog", draft);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate blog draft.");
      setStreamStatus("");
    } finally {
      setIsStreaming(false);
    }
  }

  return (
    <div className="space-y-6">
      <StepIntro
        eyebrow="Blog Draft"
        title={`Turn ${project?.title ?? "this sermon"} into a long-form article.`}
        description=""
        statusItems={[
          {
            label: "Transcript",
            value: transcriptText ? "Ready" : "Missing",
            tone: transcriptText ? "success" : "warning",
          },
          {
            label: "Speaker",
            value: project?.speaker ? "Set" : "Missing",
            tone: project?.speaker ? "brand" : "warning",
          },
          {
            label: "Draft state",
            value: markdown.trim() ? "Editable" : "Empty",
            tone: markdown.trim() ? "info" : "neutral",
          },
        ]}
      />

      {!transcriptText ? (
        <Alert tone="warning" title="Transcript required">
          Approve or generate a transcript first so Blog can build from the sermon text.
        </Alert>
      ) : (
        <Card>
          <CardHeader
            eyebrow="Blog Draft"
            title="Editable markdown"
            action={
              <Button onClick={generateBlogStream} disabled={isStreaming}>
                {isStreaming ? "Streaming..." : "Generate Blog Draft"}
              </Button>
            }
          />

          <div className="mt-6 space-y-4">
            {error ? <Alert tone="danger">{error}</Alert> : null}
            {streamStatus ? <Alert tone="info">{streamStatus}</Alert> : null}

            <textarea
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              className="min-h-[38rem] w-full rounded-[1.75rem] border border-border bg-surface px-5 py-4 font-mono text-sm text-ink outline-none transition focus:border-brand"
              placeholder="Generated markdown will appear here."
            />
          </div>
        </Card>
      )}
    </div>
  );
}
