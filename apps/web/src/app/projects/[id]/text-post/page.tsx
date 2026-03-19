"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { API_BASE, projects } from "@/lib/api";
import { loadProjectDraft, saveProjectDraft, type BlogDraft, type FacebookDraft } from "@/lib/projectDrafts";
import { streamNdjson } from "@/lib/streaming";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { StepIntro } from "@/components/workflow/StepIntro";

const DEFAULT_MODEL =
  "arn:aws:bedrock:us-east-1:644190502535:inference-profile/us.anthropic.claude-sonnet-4-6";
const DEFAULT_HOST = "us-east-1";

export default function TextPostPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [blogMarkdown, setBlogMarkdown] = useState("");
  const [facebookPost, setFacebookPost] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [hasHydratedDraft, setHasHydratedDraft] = useState(false);

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projects.get(projectId),
  });

  const { data: persistedBlogDraft } = useQuery({
    queryKey: ["project-draft", projectId, "blog"],
    queryFn: () => projects.getDraft<BlogDraft>(projectId, "blog"),
  });

  const { data: persistedFacebookDraft } = useQuery({
    queryKey: ["project-draft", projectId, "facebook"],
    queryFn: () => projects.getDraft<FacebookDraft>(projectId, "facebook"),
  });

  useEffect(() => {
    if (hasHydratedDraft) return;
    const blogDraft = persistedBlogDraft?.payload ?? loadProjectDraft<BlogDraft>(projectId, "blog");
    const facebookDraft = persistedFacebookDraft?.payload ?? loadProjectDraft<FacebookDraft>(projectId, "facebook");
    if (blogDraft?.markdown) setBlogMarkdown(blogDraft.markdown);
    if (facebookDraft?.post) setFacebookPost(facebookDraft.post);
    setHasHydratedDraft(true);
  }, [hasHydratedDraft, persistedBlogDraft, persistedFacebookDraft, projectId]);

  useEffect(() => {
    if (!hasHydratedDraft) return;
    const timeoutId = window.setTimeout(() => {
      const draft: FacebookDraft = { post: facebookPost };
      saveProjectDraft(projectId, "facebook", draft);
      void projects.saveDraft(projectId, "facebook", draft);
    }, 700);
    return () => window.clearTimeout(timeoutId);
  }, [facebookPost, hasHydratedDraft, projectId]);

  async function generateTextPost() {
    setError("");
    setStatus("Connecting...");
    setFacebookPost("");
    setIsStreaming(true);

    try {
      const res = await fetch(`${API_BASE}/api/content/facebook/generate-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blog_post_markdown: blogMarkdown,
          model: DEFAULT_MODEL,
          host: DEFAULT_HOST,
        }),
      });

      let finalPost = "";
      await streamNdjson<
        | { type: "status"; message: string }
        | { type: "chunk"; delta: string }
        | { type: "done"; post: string }
        | { type: "error"; message: string }
      >(res, (payload) => {
        if (payload.type === "status") {
          setStatus(payload.message);
        } else if (payload.type === "chunk") {
          finalPost += payload.delta;
          setFacebookPost((prev) => prev + payload.delta);
        } else if (payload.type === "done") {
          finalPost = payload.post;
          setFacebookPost(payload.post);
          setStatus("Done");
          const draft = { post: payload.post };
          saveProjectDraft(projectId, "facebook", draft);
          void projects.saveDraft(projectId, "facebook", draft);
        } else if (payload.type === "error") {
          throw new Error(payload.message);
        }
      });

      if (finalPost.trim()) {
        const draft = { post: finalPost };
        saveProjectDraft(projectId, "facebook", draft);
        void projects.saveDraft(projectId, "facebook", draft);
      }
    } catch (streamError) {
      setError(streamError instanceof Error ? streamError.message : "Failed to generate the text post.");
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
        eyebrow="Text Post"
        title={`Draft the text post for ${project?.title ?? "this sermon"}.`}
        description="Generate the text-only social post as its own workflow step and keep the saved draft editable in place."
        statusItems={[
          {
            label: "Project",
            value: project?.speaker_display_name ?? project?.speaker ?? "Ready",
            tone: "neutral",
          },
          {
            label: "Blog draft",
            value: blogMarkdown.trim() ? "Loaded" : "Missing",
            tone: blogMarkdown.trim() ? "info" : "warning",
          },
          {
            label: "Text post",
            value: facebookPost.trim() ? "Ready" : "Not started",
            tone: facebookPost.trim() ? "brand" : "neutral",
          },
        ]}
      />

      <Card>
        <CardHeader
          eyebrow="Social"
          title="Text Post"
          action={
            <Button variant="secondary" onClick={generateTextPost} disabled={isStreaming || !blogMarkdown.trim()}>
              {isStreaming ? "Streaming..." : "Generate Text Post"}
            </Button>
          }
        />
        <div className="mt-6 space-y-3">
          {!blogMarkdown.trim() ? (
            <Alert tone="warning">Load or save a Blog Post first so the text post has source material.</Alert>
          ) : null}
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {status ? <Alert tone="info">{status}</Alert> : null}
          <label className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-ink">Text post copy</span>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void copyText("facebook-post", facebookPost)}
                disabled={!facebookPost.trim()}
              >
                {copiedKey === "facebook-post" ? "Copied" : "Copy"}
              </Button>
            </div>
            <textarea
              value={facebookPost}
              onChange={(event) => setFacebookPost(event.target.value)}
              className="min-h-[18rem] w-full rounded-[1.5rem] border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
              placeholder="Generated text post will appear here."
            />
          </label>
        </div>
      </Card>
    </div>
  );
}
