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

function cleanTitleLine(line: string): string {
  return line.replace(/^\s{0,3}#{1,6}\s*/, "").replace(/\*\*/g, "").trim();
}

function splitBlogMarkdown(markdown: string): { title: string; body: string } {
  const normalized = (markdown || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return { title: "", body: "" };
  const [firstLine = "", ...rest] = normalized.split("\n");
  return {
    title: cleanTitleLine(firstLine),
    body: rest.join("\n").replace(/^\s+/, ""),
  };
}

function joinBlogMarkdown(title: string, body: string): string {
  const cleanTitle = title.trim();
  const cleanBody = body.trim();
  if (!cleanTitle && !cleanBody) return "";
  if (!cleanBody) return cleanTitle;
  if (!cleanTitle) return cleanBody;
  return `${cleanTitle}\n\n${cleanBody}`;
}

export default function BlogPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [host, setHost] = useState("us-east-1");
  const [blogTitle, setBlogTitle] = useState("");
  const [blogBody, setBlogBody] = useState("");
  const [error, setError] = useState("");
  const [streamStatus, setStreamStatus] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasHydratedDraft, setHasHydratedDraft] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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
    if (draft?.markdown) {
      const parsed = splitBlogMarkdown(draft.markdown);
      setBlogTitle(parsed.title);
      setBlogBody(parsed.body);
    }
    setHasHydratedDraft(true);
  }, [hasHydratedDraft, persistedBlogDraft, projectId]);

  useEffect(() => {
    if (!hasHydratedDraft) return;
    const timeoutId = window.setTimeout(() => {
      const draft = { markdown: joinBlogMarkdown(blogTitle, blogBody) };
      saveProjectDraft(projectId, "blog", draft);
      void projects.saveDraft(projectId, "blog", draft);
    }, 700);
    return () => window.clearTimeout(timeoutId);
  }, [blogBody, blogTitle, hasHydratedDraft, projectId]);

  const transcriptText = transcriptData?.raw_text || transcriptData?.cleaned_text || "";

  async function copyText(key: string, value: string) {
    if (!value.trim()) return;
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((current) => (current === key ? null : current));
    }, 1800);
  }

  async function generateBlogStream() {
    setError("");
    setStreamStatus("Connecting...");
    setBlogTitle("");
    setBlogBody("");
    setIsStreaming(true);

    try {
      const res = await fetch(`${API_BASE}/api/content/blog/generate-stream`, {
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
          const parsed = splitBlogMarkdown(finalMarkdown);
          setBlogTitle(parsed.title);
          setBlogBody(parsed.body);
        } else if (payload.type === "done") {
          finalMarkdown = payload.markdown;
          const parsed = splitBlogMarkdown(payload.markdown);
          setBlogTitle(parsed.title);
          setBlogBody(parsed.body);
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
        eyebrow="Blog Post"
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
            value: project?.speaker_display_name || project?.speaker ? "Set" : "Missing",
            tone: project?.speaker_display_name || project?.speaker ? "brand" : "warning",
          },
          {
            label: "Draft state",
            value: joinBlogMarkdown(blogTitle, blogBody).trim() ? "Editable" : "Empty",
            tone: joinBlogMarkdown(blogTitle, blogBody).trim() ? "info" : "neutral",
          },
        ]}
      />

      {!transcriptText ? (
        <Alert tone="warning" title="Transcript required">
          Generate a transcript first so Blog can build from the sermon text.
        </Alert>
      ) : (
        <Card>
          <CardHeader
                  eyebrow="Blog Post"
            title="Editable blog post"
            action={
              <Button onClick={generateBlogStream} disabled={isStreaming}>
                  {isStreaming ? "Streaming..." : "Generate Blog Post"}
              </Button>
            }
          />

          <div className="mt-6 space-y-4">
            {error ? <Alert tone="danger">{error}</Alert> : null}
            {streamStatus ? <Alert tone="info">{streamStatus}</Alert> : null}

            <label className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-ink">Blog title</span>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void copyText("blog-title", blogTitle)}
                  disabled={!blogTitle.trim()}
                >
                  {copiedKey === "blog-title" ? "Copied" : "Copy"}
                </Button>
              </div>
              <input
                value={blogTitle}
                onChange={(e) => setBlogTitle(e.target.value)}
                className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                placeholder="Generated title will appear here."
              />
            </label>

            <label className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-ink">Blog markdown</span>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void copyText("blog-body", blogBody)}
                  disabled={!blogBody.trim()}
                >
                  {copiedKey === "blog-body" ? "Copied" : "Copy"}
                </Button>
              </div>
            <textarea
              value={blogBody}
              onChange={(e) => setBlogBody(e.target.value)}
              className="min-h-[38rem] w-full rounded-[1.75rem] border border-border bg-surface px-5 py-4 font-mono text-sm text-ink outline-none transition focus:border-brand"
              placeholder="Generated markdown will appear here."
            />
            </label>
          </div>
        </Card>
      )}
    </div>
  );
}
