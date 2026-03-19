"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE, getMediaPlaybackUrl, jobs, projects, transcript, uploads } from "@/lib/api";
import { loadProjectDraft, saveProjectDraft, type ReelDraft } from "@/lib/projectDrafts";
import { streamNdjson } from "@/lib/streaming";
import { ActivityLog } from "@/components/workflow/ActivityLog";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { JobStatusPanel } from "@/components/workflow/JobStatusPanel";
import { StepIntro } from "@/components/workflow/StepIntro";

const DEFAULT_MODEL =
  "arn:aws:bedrock:us-east-1:644190502535:inference-profile/us.anthropic.claude-sonnet-4-6";

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

const PLATFORM_CONFIG = [
  { key: "instagram", label: "Instagram Reels", bodyLabel: "Caption", tagLabel: "Hashtags" },
  { key: "tiktok", label: "TikTok", bodyLabel: "Caption", tagLabel: "Hashtags" },
  { key: "youtube", label: "YouTube Shorts", bodyLabel: "Description", tagLabel: "Tags" },
  { key: "facebook", label: "Facebook Reels", bodyLabel: "Description", tagLabel: "Hashtags" },
] as const;

function cloneDraft(draft: ReelDraft): ReelDraft {
  return {
    caption: draft.caption,
    thumbnail_prompts: draft.thumbnail_prompts,
    platforms: {
      youtube: { ...draft.platforms.youtube, tags: [...draft.platforms.youtube.tags] },
      facebook: { ...draft.platforms.facebook, tags: [...draft.platforms.facebook.tags] },
      instagram: { ...draft.platforms.instagram, tags: [...draft.platforms.instagram.tags] },
      tiktok: { ...draft.platforms.tiktok, tags: [...draft.platforms.tiktok.tags] },
    },
  };
}

function buildPlatformCopyBlock(
  label: string,
  platformDraft: { title: string; description: string; tags: string[] },
  bodyLabel: string,
  tagLabel: string
) {
  return [
    `${label}`,
    `Title: ${platformDraft.title || ""}`,
    `${bodyLabel}: ${platformDraft.description || ""}`,
    `${tagLabel}: ${platformDraft.tags.join(", ")}`,
  ].join("\n\n");
}

export default function ReelPage() {
  const params = useParams();
  const projectId = params.id as string;
  const queryClient = useQueryClient();
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [host, setHost] = useState("us-east-1");
  const [draft, setDraft] = useState<ReelDraft>(EMPTY_REEL_DRAFT);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [generateError, setGenerateError] = useState("");
  const [generateStatus, setGenerateStatus] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [reelTranscriptJobId, setReelTranscriptJobId] = useState<string | null>(null);
  const [reelTranscriptMessages, setReelTranscriptMessages] = useState<string[]>([]);
  const [generationMessages, setGenerationMessages] = useState<string[]>([]);
  const [hasHydratedDraft, setHasHydratedDraft] = useState(false);
  const reelTranscriptLogEndRef = useRef<HTMLDivElement>(null);
  const generationLogEndRef = useRef<HTMLDivElement>(null);

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projects.get(projectId),
  });

  const { data: transcriptData } = useQuery({
    queryKey: ["transcript", projectId],
    queryFn: () => transcript.getForProject(projectId),
  });

  const { data: reelAsset } = useQuery({
    queryKey: ["reel-asset", projectId],
    queryFn: () => projects.getReelAsset(projectId),
  });

  const { data: persistedReelDraft } = useQuery({
    queryKey: ["project-draft", projectId, "reel"],
    queryFn: () => projects.getDraft<ReelDraft>(projectId, "reel"),
  });

  const { data: reelTranscript } = useQuery({
    queryKey: ["transcript", projectId, "reel"],
    queryFn: () => transcript.getForProject(projectId, "reel"),
    refetchInterval: (query) => {
      if (!reelAsset) return false;
      const currentTranscript = query.state.data;
      if (currentTranscript && currentTranscript.asset_id === reelAsset.id) return false;
      return 3000;
    },
  });

  const { data: projectJobs = [] } = useQuery({
    queryKey: ["jobs", projectId],
    queryFn: () => jobs.listForProject(projectId),
    refetchInterval: 2000,
  });

  const latestReelTranscriptJob =
    [...projectJobs]
      .filter((job) => job.job_type === "transcribe_sermon" && job.subject_id === reelAsset?.id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;

  useEffect(() => {
    if (!reelTranscriptJobId && latestReelTranscriptJob?.id) {
      setReelTranscriptJobId(latestReelTranscriptJob.id);
    }
  }, [latestReelTranscriptJob?.id, reelTranscriptJobId]);

  const trackedReelTranscriptJobId = reelTranscriptJobId ?? latestReelTranscriptJob?.id ?? null;

  const { data: reelTranscriptJob } = useQuery({
    queryKey: ["job", trackedReelTranscriptJobId],
    queryFn: () => jobs.get(trackedReelTranscriptJobId!),
    enabled: !!trackedReelTranscriptJobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" || status === "failed" ? false : 2000;
    },
  });

  const { data: reelTranscriptEvents = [] } = useQuery({
    queryKey: ["job-events", trackedReelTranscriptJobId],
    queryFn: () => jobs.getEvents(trackedReelTranscriptJobId!),
    enabled: !!trackedReelTranscriptJobId,
    refetchInterval: () => {
      const status = reelTranscriptJob?.status;
      return status === "completed" || status === "failed" ? false : 2000;
    },
  });

  useEffect(() => {
    if (hasHydratedDraft) return;
    const stored = persistedReelDraft?.payload ?? loadProjectDraft<ReelDraft>(projectId, "reel");
    if (stored) {
      setDraft(cloneDraft({ ...EMPTY_REEL_DRAFT, ...stored, platforms: { ...EMPTY_REEL_DRAFT.platforms, ...stored.platforms } }));
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
      setUploadError("");
      setUploadStatus("Uploading final reel...");
      return uploads.upload(projectId, file, "final_reel");
    },
    onSuccess: async (data) => {
      setDraft(cloneDraft(EMPTY_REEL_DRAFT));
      setSelectedFile(null);
      setGenerateError("");
      setGenerateStatus("");
      setGenerationMessages([]);
      setReelTranscriptJobId(null);
      setReelTranscriptMessages([]);
      setUploadStatus("Final reel uploaded. Starting transcript...");
      queryClient.setQueryData(["transcript", projectId, "reel"], null);
      queryClient.removeQueries({ queryKey: ["job"] });
      queryClient.removeQueries({ queryKey: ["job-events"] });
      await queryClient.invalidateQueries({ queryKey: ["reel-asset", projectId] });
      try {
        const job = await transcript.start({
          project_id: projectId,
          sermon_asset_id: data.asset_id,
          transcript_scope: "reel",
        });
        setReelTranscriptJobId(job.job_id);
        setReelTranscriptMessages(["[0%] Transcription queued", `[1%] ${job.message}`]);
        setUploadStatus("Final reel uploaded. Reel transcript queued.");
        queryClient.invalidateQueries({ queryKey: ["jobs", projectId] });
        queryClient.invalidateQueries({ queryKey: ["transcript", projectId, "reel"] });
      } catch (error) {
        setUploadStatus("");
        setUploadError(
          error instanceof Error
            ? `Final reel uploaded, but transcript could not be started: ${error.message}`
            : "Final reel uploaded, but transcript could not be started."
        );
      }
    },
    onError: (error) => {
      setUploadStatus("");
      setUploadError(error instanceof Error ? error.message : "Final reel upload failed.");
    },
  });

  const transcriptText = transcriptData?.raw_text || transcriptData?.cleaned_text || "";
  const currentReelTranscript = reelTranscript?.asset_id === reelAsset?.id ? reelTranscript : null;
  const reelTranscriptText = currentReelTranscript?.cleaned_text || currentReelTranscript?.raw_text || "";

  useEffect(() => {
    if (!draft.caption.trim() && reelTranscriptText.trim()) {
      setDraft((current) => ({ ...current, caption: reelTranscriptText }));
    }
  }, [draft.caption, reelTranscriptText]);

  useEffect(() => {
    if (reelTranscriptEvents.length === 0) return;
    setReelTranscriptMessages(
      reelTranscriptEvents.map((event) =>
        event.progress_percent != null ? `[${event.progress_percent}%] ${event.message}` : event.message
      )
    );
  }, [reelTranscriptEvents]);

  useEffect(() => {
    if (reelTranscriptJob?.status === "failed" && reelTranscriptJob.error_text) {
      setReelTranscriptMessages((prev) => {
        const line = `ERROR: ${reelTranscriptJob.error_text}`;
        return prev[prev.length - 1] === line ? prev : [...prev, line];
      });
    }
  }, [reelTranscriptJob?.error_text, reelTranscriptJob?.status]);

  async function generateReelPackage() {
    if (!draft.caption.trim()) {
      setGenerateError("Add a transcript excerpt or caption block first so the reel package has source material.");
      return;
    }

    setGenerateError("");
    setGenerateStatus("Connecting...");
    setGenerationMessages(["Connecting to content generator..."]);
    setIsGenerating(true);

    try {
      const res = await fetch(`${API_BASE}/api/content/reel/generate-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript_excerpt: draft.caption,
          preacher_name: project?.speaker,
          date_preached: project?.sermon_date,
          model,
          host,
        }),
      });

      await streamNdjson<
        | { type: "status"; message: string }
        | { type: "chunk"; target: "social" | "graphics"; delta: string }
        | {
            type: "done";
            platforms: ReelDraft["platforms"];
            thumbnail_prompts: Array<Record<string, string>>;
          }
        | { type: "error"; message: string }
      >(res, (payload) => {
        if (payload.type === "status") {
          setGenerateStatus(payload.message);
          setGenerationMessages((current) =>
            current[current.length - 1] === payload.message ? current : [...current, payload.message]
          );
        } else if (payload.type === "chunk") {
          if (payload.target === "social") {
            setGenerationMessages((current) =>
              current.includes("Receiving platform-specific copy...")
                ? current
                : [...current, "Receiving platform-specific copy..."]
            );
          } else if (payload.target === "graphics") {
            setGenerationMessages((current) =>
              current.includes("Receiving thumbnail prompt ideas...")
                ? current
                : [...current, "Receiving thumbnail prompt ideas..."]
            );
          }
        } else if (payload.type === "done") {
          setDraft((current) => ({
            ...current,
            platforms: {
              youtube: {
                title: payload.platforms.youtube?.title || "",
                description: payload.platforms.youtube?.description || "",
                tags: payload.platforms.youtube?.tags || [],
              },
              facebook: {
                title: payload.platforms.facebook?.title || "",
                description: payload.platforms.facebook?.description || "",
                tags: payload.platforms.facebook?.tags || [],
              },
              instagram: {
                title: payload.platforms.instagram?.title || "",
                description: payload.platforms.instagram?.description || "",
                tags: payload.platforms.instagram?.tags || [],
              },
              tiktok: {
                title: payload.platforms.tiktok?.title || "",
                description: payload.platforms.tiktok?.description || "",
                tags: payload.platforms.tiktok?.tags || [],
              },
            },
            thumbnail_prompts: payload.thumbnail_prompts || [],
          }));
          setGenerateStatus("Done");
          setGenerationMessages((current) => [...current, "Reel package ready."]);
        } else if (payload.type === "error") {
          throw new Error(payload.message);
        }
      });
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Failed to generate reel package.");
      setGenerateStatus("");
      setGenerationMessages((current) => [
        ...current,
        `ERROR: ${err instanceof Error ? err.message : "Failed to generate reel package."}`,
      ]);
    } finally {
      setIsGenerating(false);
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

  function setPlatformField(
    platform: keyof ReelDraft["platforms"],
    field: keyof ReelDraft["platforms"][typeof platform],
    value: string | string[]
  ) {
    setDraft((current) => ({
      ...current,
      platforms: {
        ...current.platforms,
        [platform]: {
          ...current.platforms[platform],
          [field]: value,
        },
      },
    }));
  }

  return (
    <div className="space-y-6">
      <StepIntro
        eyebrow="Final Reel"
        title={`Prepare the finished reel package for ${project?.title ?? "this project"}.`}
        description="Upload the finished reel, finalize the caption text, and generate platform-ready copy plus thumbnail ideas from one workspace."
        statusItems={[
          {
            label: "Final reel",
            value: reelAsset ? "Uploaded" : "Missing",
            tone: reelAsset ? "success" : "warning",
          },
          {
            label: "Caption",
            value: reelTranscriptText ? "Transcript ready" : draft.caption.trim() ? "Ready" : "Missing",
            tone: reelTranscriptText ? "success" : draft.caption.trim() ? "info" : "warning",
          },
          {
            label: "Social package",
            value: draft.platforms.youtube.title.trim() ? "Generated" : "Not started",
            tone: draft.platforms.youtube.title.trim() ? "brand" : "neutral",
          },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <Card>
          <CardHeader
            eyebrow="Asset"
            title="Finished reel upload"
            action={
              <Button
                onClick={() => selectedFile && uploadMutation.mutate(selectedFile)}
                disabled={!selectedFile || uploadMutation.isPending}
              >
                {uploadMutation.isPending ? "Uploading..." : "Upload Final Reel"}
              </Button>
            }
          />

          <div className="mt-6 space-y-4">
            {uploadError ? <Alert tone="danger">{uploadError}</Alert> : null}
            {uploadStatus ? <Alert tone="info">{uploadStatus}</Alert> : null}
            {!reelTranscriptText && reelAsset ? (
              <Alert tone="info">The uploaded reel is ready. Reel transcript generation will populate the caption field once Faster Whisper finishes.</Alert>
            ) : null}

            <label className="block">
              <span className="sr-only">Choose final reel file</span>
              <input
                type="file"
                accept="video/*"
                onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                className="block w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink file:mr-4 file:rounded-full file:border-0 file:bg-brand file:px-4 file:py-2 file:font-semibold file:text-white"
              />
            </label>

            {selectedFile ? (
              <Alert tone="info">{selectedFile.name} is ready to upload as the final reel asset.</Alert>
            ) : null}

            {reelAsset ? (
              <div className="space-y-4 rounded-[1.5rem] border border-border/80 bg-background-alt p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink">Uploaded reel</p>
                    <p className="mt-1 text-sm text-muted">{reelAsset.filename}</p>
                  </div>
                  <Badge tone="success">Ready</Badge>
                </div>
                <video
                  src={getMediaPlaybackUrl(reelAsset.id)}
                  controls
                  className="aspect-video w-full rounded-2xl bg-black"
                />
              </div>
            ) : (
              <Alert tone="warning">Upload the finished reel here once the edit is locked.</Alert>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            eyebrow="Caption"
            title="Transcript excerpt / caption copy"
            action={
              <Button onClick={generateReelPackage} disabled={isGenerating || !draft.caption.trim()}>
                {isGenerating ? "Generating..." : "Generate Reel Package"}
              </Button>
            }
          />

          <div className="mt-6 space-y-4">
            {generateError ? <Alert tone="danger">{generateError}</Alert> : null}
            {generateStatus ? <Alert tone="info">{generateStatus}</Alert> : null}
            {!draft.caption.trim() && transcriptText ? (
              <Alert tone="warning">
                Paste or trim the transcript excerpt that matches the final reel so the generated copy stays specific to this edit.
              </Alert>
            ) : null}

            <textarea
              value={draft.caption}
              onChange={(event) => setDraft((current) => ({ ...current, caption: event.target.value }))}
              className="min-h-[24rem] w-full rounded-[1.5rem] border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
              placeholder="Paste the transcript excerpt or caption copy for the finished reel here."
            />

            <ActivityLog messages={generationMessages} endRef={generationLogEndRef} />
          </div>
        </Card>
      </div>

      {reelTranscriptJob ? (
        <JobStatusPanel
          title="Reel transcript job"
          job={reelTranscriptJob}
          messages={reelTranscriptMessages}
          endRef={reelTranscriptLogEndRef}
          runningHint="Faster Whisper is transcribing the uploaded reel so the caption field can populate automatically."
        />
      ) : null}

      <Card>
        <CardHeader eyebrow="Creative" title="Thumbnail Prompt Ideas" />
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {["A", "B", "C"].map((label, index) => {
            const prompt = draft.thumbnail_prompts[index];
            return (
              <div key={label} className="rounded-[1.5rem] border border-border/80 bg-background-alt p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
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
                  className="min-h-[18rem] w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                  placeholder={`Thumbnail prompt ${label} will appear here.`}
                />
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeader eyebrow="Distribution" title="Platform Copy" />
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {PLATFORM_CONFIG.map((platform) => {
            const platformDraft = draft.platforms[platform.key];
            return (
              <div key={platform.key} className="rounded-[1.5rem] border border-border/80 bg-background-alt p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-ink">{platform.label}</h3>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        void copyText(
                          `${platform.key}-all`,
                          buildPlatformCopyBlock(
                            platform.label,
                            platformDraft,
                            platform.bodyLabel,
                            platform.tagLabel
                          )
                        )
                      }
                      disabled={
                        !platformDraft.title.trim() &&
                        !platformDraft.description.trim() &&
                        platformDraft.tags.length === 0
                      }
                    >
                      {copiedKey === `${platform.key}-all` ? "Copied" : "Copy All"}
                    </Button>
                    <Badge tone={platformDraft.title.trim() ? "success" : "neutral"}>
                      {platformDraft.title.trim() ? "Ready" : "Empty"}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-ink">Title</span>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void copyText(`${platform.key}-title`, platformDraft.title)}
                        disabled={!platformDraft.title.trim()}
                      >
                        {copiedKey === `${platform.key}-title` ? "Copied" : "Copy"}
                      </Button>
                    </div>
                    <input
                      value={platformDraft.title}
                      onChange={(event) => setPlatformField(platform.key, "title", event.target.value)}
                      className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                    />
                  </label>

                  <label className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-ink">{platform.bodyLabel}</span>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void copyText(`${platform.key}-description`, platformDraft.description)}
                        disabled={!platformDraft.description.trim()}
                      >
                        {copiedKey === `${platform.key}-description` ? "Copied" : "Copy"}
                      </Button>
                    </div>
                    <textarea
                      value={platformDraft.description}
                      onChange={(event) => setPlatformField(platform.key, "description", event.target.value)}
                      className="min-h-[10rem] w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                    />
                  </label>

                  <label className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-ink">{platform.tagLabel}</span>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void copyText(`${platform.key}-tags`, platformDraft.tags.join(", "))}
                        disabled={platformDraft.tags.length === 0}
                      >
                        {copiedKey === `${platform.key}-tags` ? "Copied" : "Copy"}
                      </Button>
                    </div>
                    <textarea
                      value={platformDraft.tags.join(", ")}
                      onChange={(event) =>
                        setPlatformField(
                          platform.key,
                          "tags",
                          event.target.value
                            .split(",")
                            .map((tag) => tag.trim())
                            .filter(Boolean)
                        )
                      }
                      className="min-h-[6rem] w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                      placeholder="Separate items with commas."
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
