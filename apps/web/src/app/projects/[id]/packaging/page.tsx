"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { API_BASE, projects, transcript } from "@/lib/api";
import {
  type FacebookDraft,
  loadProjectDraft,
  saveProjectDraft,
  type BlogDraft,
  type MetadataDraft,
  type PackagingDraft,
} from "@/lib/projectDrafts";
import { streamNdjson } from "@/lib/streaming";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { StepIntro } from "@/components/workflow/StepIntro";

const DEFAULT_MODEL =
  "arn:aws:bedrock:us-east-1:644190502535:inference-profile/us.anthropic.claude-sonnet-4-6";

export default function PackagingPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [host, setHost] = useState("us-east-1");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnailPrompts, setThumbnailPrompts] = useState<Array<Record<string, string>>>([]);
  const [blogMarkdown, setBlogMarkdown] = useState("");
  const [facebookPost, setFacebookPost] = useState("");
  const [packagingError, setPackagingError] = useState("");
  const [facebookError, setFacebookError] = useState("");
  const [packagingStatus, setPackagingStatus] = useState("");
  const [facebookStatus, setFacebookStatus] = useState("");
  const [isPackagingStreaming, setIsPackagingStreaming] = useState(false);
  const [isFacebookStreaming, setIsFacebookStreaming] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [hasHydratedDrafts, setHasHydratedDrafts] = useState(false);

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

  const { data: persistedBlogDraft } = useQuery({
    queryKey: ["project-draft", projectId, "blog"],
    queryFn: () => projects.getDraft<BlogDraft>(projectId, "blog"),
  });

  const { data: persistedPackagingDraft } = useQuery({
    queryKey: ["project-draft", projectId, "packaging"],
    queryFn: () => projects.getDraft<PackagingDraft>(projectId, "packaging"),
  });

  const { data: persistedFacebookDraft } = useQuery({
    queryKey: ["project-draft", projectId, "facebook"],
    queryFn: () => projects.getDraft<FacebookDraft>(projectId, "facebook"),
  });

  const transcriptText = transcriptData?.raw_text || transcriptData?.cleaned_text || "";

  useEffect(() => {
    if (hasHydratedDrafts) return;
    const metadataDraft = persistedMetadataDraft?.payload ?? loadProjectDraft<MetadataDraft>(projectId, "metadata");
    const blogDraft = persistedBlogDraft?.payload ?? loadProjectDraft<BlogDraft>(projectId, "blog");
    const packagingDraft = persistedPackagingDraft?.payload ?? loadProjectDraft<PackagingDraft>(projectId, "packaging");
    const facebookDraft = persistedFacebookDraft?.payload ?? loadProjectDraft<FacebookDraft>(projectId, "facebook");
    if (blogDraft?.markdown) setBlogMarkdown(blogDraft.markdown);
    if (packagingDraft) {
      setTitle(packagingDraft.title || "");
      setDescription(packagingDraft.description || "");
      setThumbnailPrompts(packagingDraft.thumbnail_prompts || []);
    }
    if (facebookDraft?.post) setFacebookPost(facebookDraft.post);
    if (!metadataDraft) saveProjectDraft(projectId, "metadata", null);
    setHasHydratedDrafts(true);
  }, [hasHydratedDrafts, persistedBlogDraft, persistedFacebookDraft, persistedMetadataDraft, persistedPackagingDraft, projectId]);

  const storedMetadata = useMemo(
    () => persistedMetadataDraft?.payload ?? loadProjectDraft<MetadataDraft>(projectId, "metadata"),
    [persistedMetadataDraft, projectId]
  );

  useEffect(() => {
    if (!hasHydratedDrafts) return;
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
  }, [description, hasHydratedDrafts, projectId, thumbnailPrompts, title]);

  useEffect(() => {
    if (!hasHydratedDrafts) return;
    const timeoutId = window.setTimeout(() => {
      const draft: FacebookDraft = { post: facebookPost };
      saveProjectDraft(projectId, "facebook", draft);
      void projects.saveDraft(projectId, "facebook", draft);
    }, 700);
    return () => window.clearTimeout(timeoutId);
  }, [facebookPost, hasHydratedDrafts, projectId]);

  async function generatePackagingStream() {
    setPackagingError("");
    setPackagingStatus("Connecting...");
    setIsPackagingStreaming(true);
    setTitle("");
    setDescription("");
    setThumbnailPrompts([]);

    try {
      const res = await fetch(`${API_BASE}/api/content/packaging/generate-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: transcriptText,
          preacher_name: project?.speaker,
          date_preached: project?.sermon_date,
          model,
          host,
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
          setPackagingStatus(payload.message);
        } else if (payload.type === "chunk") {
          if (payload.target === "youtube") {
            setDescription((prev) => prev + payload.delta);
          }
        } else if (payload.type === "done") {
          setPackagingStatus("Done");
          setTitle(payload.title);
          setDescription(payload.description);
          setThumbnailPrompts(payload.thumbnail_prompts || []);
          saveProjectDraft(projectId, "packaging", payload);
          void projects.saveDraft(projectId, "packaging", payload);
        } else if (payload.type === "error") {
          throw new Error(payload.message);
        }
      });
    } catch (err) {
      setPackagingError(err instanceof Error ? err.message : "Failed to generate YouTube packaging.");
      setPackagingStatus("");
    } finally {
      setIsPackagingStreaming(false);
    }
  }

  async function generateFacebookStream() {
    setFacebookError("");
    setFacebookStatus("Connecting...");
    setFacebookPost("");
    setIsFacebookStreaming(true);

    try {
      const res = await fetch(`${API_BASE}/api/content/facebook/generate-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blog_post_markdown: blogMarkdown,
          model,
          host,
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
          setFacebookStatus(payload.message);
        } else if (payload.type === "chunk") {
          finalPost += payload.delta;
          setFacebookPost((prev) => prev + payload.delta);
        } else if (payload.type === "done") {
          finalPost = payload.post;
          setFacebookPost(payload.post);
          setFacebookStatus("Done");
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
    } catch (err) {
      setFacebookError(err instanceof Error ? err.message : "Failed to generate Facebook copy.");
      setFacebookStatus("");
    } finally {
      setIsFacebookStreaming(false);
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
        eyebrow="Packaging"
        title={`Build the release package for ${project?.title ?? "this sermon"}.`}
        description="Generate the long-form YouTube presentation, thumbnail concepts, and a Facebook derivative from the sermon assets you have already created."
        statusItems={[
          {
            label: "Transcript",
            value: transcriptText ? "Ready" : "Missing",
            tone: transcriptText ? "success" : "warning",
          },
          {
            label: "Metadata draft",
            value: storedMetadata?.metadata ? "Loaded" : "Optional",
            tone: storedMetadata?.metadata ? "brand" : "neutral",
          },
          {
            label: "Blog draft",
            value: blogMarkdown.trim() ? "Available" : "Needed",
            tone: blogMarkdown.trim() ? "info" : "warning",
          },
        ]}
      />

      {!transcriptText ? (
        <Alert tone="warning" title="Transcript required">
          Approve or generate a transcript first to build YouTube packaging.
        </Alert>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.25fr)_360px]">
            <div className="space-y-6">
              <Card>
                <CardHeader
                  eyebrow="Output"
                  title="YouTube Title/Description"
                  action={
                    <Button onClick={generatePackagingStream} disabled={isPackagingStreaming}>
                      {isPackagingStreaming ? "Streaming YouTube..." : "Generate YouTube Copy"}
                    </Button>
                  }
                />

                <div className="mt-6 space-y-3">
                  {packagingError ? <Alert tone="danger">{packagingError}</Alert> : null}
                  {packagingStatus ? <Alert tone="info">{packagingStatus}</Alert> : null}
                </div>

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
                      onChange={(e) => setTitle(e.target.value)}
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
                      onChange={(e) => setDescription(e.target.value)}
                      className="min-h-[16rem] w-full rounded-[1.5rem] border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                    />
                  </label>
                </div>
              </Card>
 
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader
                  eyebrow="Facebook"
                  title="Facebook Text Post"
                  action={
                    <Button
                      variant="secondary"
                      onClick={generateFacebookStream}
                      disabled={isFacebookStreaming || !blogMarkdown.trim()}
                    >
                      {isFacebookStreaming ? "Streaming Facebook..." : "Generate Facebook Post"}
                    </Button>
                  }
                />
                <div className="mt-6 space-y-3">
                  {!blogMarkdown.trim() ? (
                    <Alert tone="warning">Load or save a Blog Draft first so Facebook copy has source material.</Alert>
                  ) : null}
                  {facebookError ? <Alert tone="danger">{facebookError}</Alert> : null}
                  {facebookStatus ? <Alert tone="info">{facebookStatus}</Alert> : null}
                  <label className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-ink">Facebook text post</span>
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
                      onChange={(e) => setFacebookPost(e.target.value)}
                      className="min-h-[14rem] w-full rounded-[1.5rem] border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                      placeholder="Generated Facebook post will appear here."
                    />
                  </label>
                </div>
              </Card>
            </div>
          </div>

          <Card>
            <CardHeader
              eyebrow="Creative"
              title="Thumbnail Prompt Ideas"
            />
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              {["A", "B", "C"].map((label, index) => {
                const prompt = thumbnailPrompts[index];
                return (
                  <div key={label} className="rounded-[1.5rem] border border-border/80 bg-background-alt p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="font-semibold text-ink">Thumbnail Prompt {label}</span>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void copyText(`thumbnail-${label}`, prompt?.prompt || "")}
                        disabled={!prompt?.prompt?.trim()}
                      >
                        {copiedKey === `thumbnail-${label}` ? "Copied" : "Copy"}
                      </Button>
                    </div>
                    <textarea
                      value={prompt?.prompt || ""}
                      onChange={(e) => {
                        const next = [...thumbnailPrompts];
                        next[index] = { ...(next[index] || {}), label, prompt: e.target.value };
                        setThumbnailPrompts(next);
                      }}
                      className="min-h-[15rem] w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                      placeholder={`Variant ${label} prompt will appear here.`}
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
