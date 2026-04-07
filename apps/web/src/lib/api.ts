export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** URL for streaming a media asset (video/audio playback). */
export function getMediaPlaybackUrl(assetId: string): string {
  return `${API_BASE}/api/media/asset/${assetId}`;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: isFormData
      ? {
          ...init?.headers,
        }
      : {
          "Content-Type": "application/json",
          ...init?.headers,
        },
  });
  if (!res.ok) {
    const text = await res.text();
    try {
      const json = JSON.parse(text) as { detail?: string };
      throw new Error(json.detail ?? `API error ${res.status}`);
    } catch (e) {
      if (e instanceof SyntaxError) throw new Error(`API error ${res.status}: ${text}`);
      throw e;
    }
  }
  return res.json();
}

export async function download(path: string, init?: RequestInit): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    try {
      const json = JSON.parse(text) as { detail?: string };
      throw new Error(json.detail ?? `API error ${res.status}`);
    } catch (e) {
      if (e instanceof SyntaxError) throw new Error(`API error ${res.status}: ${text}`);
      throw e;
    }
  }

  const blob = await res.blob();
  const header = res.headers.get("Content-Disposition") ?? "";
  const nameMatch =
    header.match(/filename\*=UTF-8''([^;]+)/i) ?? header.match(/filename="?([^"]+)"?/i);
  const filename = decodeURIComponent(nameMatch?.[1] ?? "clip-export.mp4");
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

export interface Project {
  id: string;
  organization_id: string;
  title: string;
  speaker: string;
  speaker_display_name: string | null;
  source_type: string;
  source_url: string | null;
  sermon_date: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Speaker {
  id: string;
  organization_id: string;
  speaker_name: string;
  display_name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PromptSetting {
  key: string;
  label: string;
  category: string;
  description: string;
  template: string;
  default_template: string;
  is_overridden: string;
}

export interface LibraryProject {
  id: string;
  title: string;
  speaker: string;
  speaker_display_name: string | null;
  sermon_date: string;
  status: string;
  updated_at: string;
  source_type: string;
  source_url: string | null;
  search_match: {
    field: string;
    excerpt: string;
    target_href: string;
  } | null;
  preview_asset: {
    id: string;
    filename: string;
    asset_kind: string;
    status: string;
    mime_type: string;
    playback_url: string;
  } | null;
}

export interface ProjectAsset {
  id: string;
  project_id: string;
  asset_kind: string;
  filename: string;
  mime_type?: string;
  duration_seconds: number | null;
  status: string;
  storage_key: string;
  playback_url?: string;
}

export interface ProjectDraft<T = Record<string, unknown>> {
  id: string;
  project_id: string;
  draft_kind: string;
  payload: T;
  created_at: string;
  updated_at: string;
}

export interface ProcessingJob {
  id: string;
  project_id: string;
  job_type: string;
  subject_type: string | null;
  subject_id: string | null;
  status: string;
  progress_percent: number | null;
  current_step: string | null;
  current_message: string | null;
  error_text: string | null;
  created_at: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptData {
  id: string;
  project_id: string;
  asset_id: string;
  status: string;
  raw_text: string;
  cleaned_text: string | null;
  segments: TranscriptSegment[] | null;
  word_timestamps: Array<{ word: string; start: number; end: number }> | null;
  approved_at: string | null;
  created_at: string;
}

export interface WixImageAsset {
  id: string;
  url: string;
  altText: string;
  filename: string;
}

export interface WixPublishResult {
  draft_post_id: string;
  post_id: string;
  status: string;
  title: string;
  preview_url: string;
  published_at: string;
  raw?: {
    draft?: Record<string, unknown>;
    published?: Record<string, unknown>;
    hero_image?: WixImageAsset;
  };
}

export interface WixConfig {
  configured: boolean;
  api_base: string;
  site_id: string;
  default_writer_member_id: string;
}
export interface ArtifactStatus {
  transcript_id: string;
  project_id: string;
  analysis_dir: string;
  ready: boolean;
  missing_files: string[];
  existing_files: string[];
}

export const projects = {
  list: () => api<Project[]>("/api/projects"),
  library: (filters?: {
    q?: string;
    speaker?: string;
    status?: string;
    source_type?: string;
    has_reel?: boolean;
    has_thumbnail?: boolean;
    from_date?: string;
    to_date?: string;
  }) => {
    const params = new URLSearchParams();
    if (filters?.q?.trim()) params.set("q", filters.q.trim());
    if (filters?.speaker?.trim() && filters.speaker !== "all") params.set("speaker", filters.speaker);
    if (filters?.status?.trim() && filters.status !== "all") params.set("status", filters.status);
    if (filters?.source_type?.trim() && filters.source_type !== "all") params.set("source_type", filters.source_type);
    if (filters?.has_reel) params.set("has_reel", "true");
    if (filters?.has_thumbnail) params.set("has_thumbnail", "true");
    if (filters?.from_date?.trim()) params.set("from_date", filters.from_date);
    if (filters?.to_date?.trim()) params.set("to_date", filters.to_date);
    const query = params.toString();
    return api<LibraryProject[]>(`/api/projects/library${query ? `?${query}` : ""}`);
  },
  get: (id: string) => api<Project>(`/api/projects/${id}`),
  getDraft: async <T>(projectId: string, draftKind: string): Promise<ProjectDraft<T> | null> => {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/drafts/${encodeURIComponent(draftKind)}`);
    if (!res.ok) return null;
    if (res.status === 204) return null;
    return res.json();
  },
  saveDraft: <T>(projectId: string, draftKind: string, payload: T) =>
    api<ProjectDraft<T>>(`/api/projects/${projectId}/drafts/${encodeURIComponent(draftKind)}`, {
      method: "PUT",
      body: JSON.stringify({ payload }),
    }),
  delete: async (id: string) => {
    const res = await fetch(`${API_BASE}/api/projects/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const text = await res.text();
      try {
        const json = JSON.parse(text) as { detail?: string };
        throw new Error(json.detail ?? `API error ${res.status}`);
      } catch (e) {
        if (e instanceof SyntaxError) throw new Error(`API error ${res.status}: ${text}`);
        throw e;
      }
    }
  },
  create: (data: {
    title: string;
    speaker: string;
    speaker_display_name?: string;
    sermon_date: string;
    source_type?: string;
    source_url?: string;
  }) =>
    api<Project>("/api/projects", { method: "POST", body: JSON.stringify(data) }),
  startYoutubeImport: (projectId: string, sourceUrl: string) =>
    api<{ job_id: string; asset_id: string; status: string; message: string }>(
      `/api/projects/${projectId}/youtube-import`,
      { method: "POST", body: JSON.stringify({ source_url: sourceUrl }) }
    ),
  getSourceAsset: (projectId: string) =>
    api<ProjectAsset | null>(`/api/projects/${projectId}/source-asset`),
  getReelAsset: async (projectId: string) => {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/reel-asset`);
    if (!res.ok) return null;
    if (res.status === 204) return null;
    return res.json() as Promise<ProjectAsset | null>;
  },
  getSermonAsset: async (projectId: string) => {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/sermon-asset`);
    if (!res.ok) return null;
    if (res.status === 204) return null;
    return res.json() as Promise<ProjectAsset | null>;
  },
  getSermonThumbnailAsset: async (projectId: string) => {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/sermon-thumbnail-asset`);
    if (!res.ok) return null;
    if (res.status === 204) return null;
    return res.json() as Promise<ProjectAsset | null>;
  },
  getReelThumbnailAsset: async (projectId: string) => {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/reel-thumbnail-asset`);
    if (!res.ok) return null;
    if (res.status === 204) return null;
    return res.json() as Promise<ProjectAsset | null>;
  },
};

export const jobs = {
  get: (jobId: string) => api<ProcessingJob>(`/api/jobs/${jobId}`),
  listForProject: (projectId: string) => api<ProcessingJob[]>(`/api/jobs/project/${projectId}`),
  cancel: (jobId: string) =>
    api<{ ok: boolean; status: string }>(`/api/jobs/${jobId}/cancel`, {
      method: "POST",
    }),
  getEvents: (jobId: string, afterSequence?: number) => {
    const q = afterSequence != null ? `?after_sequence=${afterSequence}` : "";
    return api<Array<{ sequence_no: number; event_type: string; message: string; progress_percent?: number }>>(
      `/api/jobs/${jobId}/events${q}`
    );
  },
};

const LOCAL_UPLOAD_CHUNK_SIZE = 5 * 1024 * 1024;
const LOCAL_UPLOAD_MAX_RETRIES = 3;

async function uploadChunkWithRetry(uploadId: string, partNumber: number, blob: Blob): Promise<void> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= LOCAL_UPLOAD_MAX_RETRIES; attempt += 1) {
    const formData = new FormData();
    formData.append("chunk", blob, `part-${partNumber}`);
    try {
      const res = await fetch(`${API_BASE}/api/uploads/local/${uploadId}/parts/${partNumber}`, {
        method: "PUT",
        body: formData,
      });
      if (!res.ok) {
        const text = await res.text();
        try {
          const json = JSON.parse(text) as { detail?: string };
          throw new Error(json.detail ?? `Chunk upload failed: ${res.status}`);
        } catch (e) {
          if (e instanceof SyntaxError) {
            throw new Error(`Chunk upload failed: ${res.status}`);
          }
          throw e;
        }
      }
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Chunk upload failed");
      if (attempt < LOCAL_UPLOAD_MAX_RETRIES) {
        await new Promise((resolve) => window.setTimeout(resolve, attempt * 500));
      }
    }
  }
  throw lastError ?? new Error("Chunk upload failed");
}

export const uploads = {
  request: (data: { project_id: string; filename: string; content_type: string; file_size_bytes: number }) =>
    api<{ upload_url: string; asset_id: string; storage_key: string }>("/api/uploads/request", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  upload: async (
    projectId: string,
    file: File,
    assetKind = "source_video",
    onProgress?: (percent: number) => void
  ): Promise<{ asset_id: string; filename: string }> => {
    const totalParts = Math.ceil(file.size / LOCAL_UPLOAD_CHUNK_SIZE);
    onProgress?.(0);
    const start = await api<{ upload_id: string; chunk_size_bytes: number; total_parts: number }>(
      "/api/uploads/local/start",
      {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          filename: file.name,
          content_type: file.type || "application/octet-stream",
          file_size_bytes: file.size,
          chunk_size_bytes: LOCAL_UPLOAD_CHUNK_SIZE,
          total_parts: totalParts,
          asset_kind: assetKind,
        }),
      }
    );

    for (let partIndex = 0; partIndex < totalParts; partIndex += 1) {
      const startByte = partIndex * LOCAL_UPLOAD_CHUNK_SIZE;
      const endByte = Math.min(startByte + LOCAL_UPLOAD_CHUNK_SIZE, file.size);
      const chunk = file.slice(startByte, endByte);
      await uploadChunkWithRetry(start.upload_id, partIndex + 1, chunk);
      onProgress?.(Math.round(((partIndex + 1) / totalParts) * 100));
    }

    const completed = await api<{ asset_id: string; filename: string }>(`/api/uploads/local/${start.upload_id}/complete`, {
      method: "POST",
      body: JSON.stringify({
        project_id: projectId,
        asset_kind: assetKind,
      }),
    });
    onProgress?.(100);
    return completed;
  },
};

export const trim = {
  start: (data: {
    project_id: string;
    source_asset_id: string;
    start_seconds: number;
    end_seconds: number;
    use_full_file?: boolean;
  }) =>
    api<{ job_id: string; status: string; message: string }>("/api/trim/start", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

export interface ClipCandidate {
  id: string;
  project_id: string;
  analysis_run_id: string;
  title: string;
  hook_text: string | null;
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
  score: number;
  status: string;
  analysis_payload?: {
    rank?: number;
    strategy?: string;
    clip_type?: string;
    cadence_marker?: string;
    editor_reason?: string | null;
    editorial_scores?: Record<string, number>;
    feature_scores?: Record<string, number>;
    scroll_stopping_strength?: string | null;
    best_platform_fit?: string | null;
    personal_fit_score?: number | null;
    final_rank_score?: number | null;
    reasoning_consistency?: string | null;
    source_result?: Record<string, unknown>;
  };
}

export const clips = {
  analyze: (data: {
    project_id: string;
    sermon_asset_id: string;
    transcript_id: string;
    model?: string;
    host?: string;
    candidate_limit?: number;
    output_count?: number;
  }) =>
    api<{ job_id: string; run_id: string; status: string; message: string }>("/api/clips/analyze", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  listCandidates: (projectId: string, runId?: string) =>
    api<ClipCandidate[]>(`/api/clips/project/${projectId}/candidates${runId ? `?run_id=${runId}` : ""}`),
  getCandidate: (candidateId: string) => api<ClipCandidate>(`/api/clips/candidates/${candidateId}`),
  updateCandidate: (candidateId: string, data: { title?: string; start_seconds?: number; end_seconds?: number }) =>
    api<{ ok: boolean }>(`/api/clips/candidates/${candidateId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  exportClip: (candidateId: string) => download(`/api/clips/candidates/${candidateId}/export`, { method: "POST" }),
};

export const speakers = {
  list: (includeInactive = false) =>
    api<Speaker[]>(`/api/speakers${includeInactive ? "?include_inactive=true" : ""}`),
  create: (data: { speaker_name: string; display_name: string; is_active?: boolean; sort_order?: number }) =>
    api<Speaker>("/api/speakers", { method: "POST", body: JSON.stringify(data) }),
  update: (
    speakerId: string,
    data: { speaker_name: string; display_name: string; is_active?: boolean; sort_order?: number }
  ) => api<Speaker>(`/api/speakers/${speakerId}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: async (speakerId: string) => {
    const res = await fetch(`${API_BASE}/api/speakers/${speakerId}`, { method: "DELETE" });
    if (!res.ok) {
      const text = await res.text();
      try {
        const json = JSON.parse(text) as { detail?: string };
        throw new Error(json.detail ?? `API error ${res.status}`);
      } catch (e) {
        if (e instanceof SyntaxError) throw new Error(`API error ${res.status}: ${text}`);
        throw e;
      }
    }
  },
};

export const settingsApi = {
  listPrompts: () => api<{ items: PromptSetting[] }>("/api/settings/prompts"),
  savePrompts: (overrides: Record<string, string | null>) =>
    api<{ items: PromptSetting[] }>("/api/settings/prompts", {
      method: "PUT",
      body: JSON.stringify({ overrides }),
    }),
};

export const transcript = {
  start: (data: { project_id: string; sermon_asset_id: string; transcript_scope?: string }) =>
    api<{ job_id: string; status: string; message: string }>("/api/transcript/start", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getForProject: async (projectId: string, scope = "sermon"): Promise<TranscriptData | null> => {
    const res = await fetch(`${API_BASE}/api/transcript/project/${projectId}?scope=${encodeURIComponent(scope)}`);
    if (!res.ok) return null;
    if (res.status === 204) return null;
    return res.json();
  },
  approve: (transcriptId: string) =>
    api<{ status: string }>(`/api/transcript/${transcriptId}/approve`, { method: "POST" }),
  generateArtifacts: (transcriptId: string) =>
    api<{ job_id: string; status: string; message: string }>(`/api/transcript/${transcriptId}/artifacts`, {
      method: "POST",
    }),
  getArtifactStatus: (transcriptId: string) =>
    api<ArtifactStatus>(`/api/transcript/${transcriptId}/artifacts/status`),
};

export const content = {
  generateMetadata: (data: {
    transcript: string;
    preacher_name?: string;
    date_preached?: string;
    model: string;
    host?: string;
  }) =>
    api<{ raw: string; metadata: Record<string, unknown>; warnings: string[] }>("/api/content/metadata/generate", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  generateBlog: (data: {
    transcript: string;
    preacher_name?: string;
    date_preached?: string;
    model: string;
    host?: string;
  }) =>
    api<{ markdown: string }>("/api/content/blog/generate", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  generatePackaging: (data: {
    transcript: string;
    preacher_name?: string;
    date_preached?: string;
    model: string;
    host?: string;
    sermon_metadata?: Record<string, unknown> | null;
  }) =>
    api<{
      title: string;
      description: string;
      thumbnail_prompts: Array<Record<string, string>>;
      chapter_count: number;
    }>("/api/content/packaging/generate", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  generateFacebook: (data: { blog_post_markdown: string; model: string; host?: string }) =>
    api<{ post: string }>("/api/content/facebook/generate", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

export const automation = {
  runAll: (
    projectId: string,
    opts?: { model?: string; host?: string; candidate_limit?: number; output_count?: number }
  ) =>
    api<{ job_id: string; status: string; message: string }>(
      `/api/automation/projects/${projectId}/run-all`,
      { method: "POST", body: JSON.stringify(opts ?? {}) }
    ),
};

export const publishing = {
  getWixConfig: () => api<WixConfig>("/api/publishing/wix/config"),
  uploadWixImage: async (projectId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api<WixImageAsset>(`/api/publishing/projects/${projectId}/wix-image`, {
      method: "POST",
      body: formData,
    });
  },
  publishWixBlog: (
    projectId: string,
    data: {
      blog_title: string;
      blog_markdown: string;
      featured_image_source?: string;
      featured_image_id?: string;
      featured_image_url?: string;
      publish_date?: string;
      writer_member_id?: string;
      excerpt: string;
      title_tag: string;
      meta_description: string;
      og_title: string;
      og_description: string;
    }
  ) =>
    api<WixPublishResult>(`/api/publishing/projects/${projectId}/wix-blog`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// ── Publishing Workspace ────────────────────────────────────────────────────

export type BundleType = "sermon_full" | "reel_clip" | "blog_post" | "text_post";
export type BundleStatus = "draft" | "scheduled" | "partially_published" | "published";
export type Platform = "youtube" | "instagram" | "tiktok" | "facebook" | "wix_blog";
export type PublishStatus = "draft" | "scheduled" | "published" | "failed";

export interface PublishVariant {
  id: string;
  bundle_id: string;
  platform: Platform;
  title: string | null;
  description: string | null;
  tags: string[] | null;
  hashtags: string[] | null;
  extra_json: Record<string, unknown> | null;
  media_asset_id: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  publish_status: PublishStatus;
  publish_result_json: Record<string, unknown> | null;
  ai_generated: boolean;
  created_at: string;
  updated_at: string;
}

export interface PublishBundle {
  id: string;
  project_id: string;
  organization_id: string;
  bundle_type: BundleType;
  label: string | null;
  thumbnail_asset_id: string | null;
  status: BundleStatus;
  week_date: string;
  notes: string | null;
  variants: PublishVariant[];
  created_at: string;
  updated_at: string;
}

export const publishingWorkspace = {
  createBundle: (data: {
    project_id: string;
    organization_id: string;
    bundle_type: BundleType;
    label?: string;
    thumbnail_asset_id?: string;
    week_date: string;
    notes?: string;
    status?: BundleStatus;
  }) => api<PublishBundle>("/api/publish/bundles", { method: "POST", body: JSON.stringify(data) }),

  listBundles: (week: string) =>
    api<PublishBundle[]>(`/api/publish/bundles?week=${week}`),

  getBundle: (id: string) => api<PublishBundle>(`/api/publish/bundles/${id}`),

  updateBundle: (id: string, data: Partial<{
    label: string;
    thumbnail_asset_id: string;
    status: BundleStatus;
    notes: string;
    week_date: string;
  }>) => api<PublishBundle>(`/api/publish/bundles/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  deleteBundle: async (id: string) => {
    const res = await fetch(`${API_BASE}/api/publish/bundles/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const text = await res.text();
      try {
        const json = JSON.parse(text) as { detail?: string };
        throw new Error(json.detail ?? `API error ${res.status}`);
      } catch (e) {
        if (e instanceof SyntaxError) throw new Error(`API error ${res.status}: ${text}`);
        throw e;
      }
    }
  },

  upsertVariant: (
    bundleId: string,
    platform: Platform,
    data: Partial<{
      title: string;
      description: string;
      tags: string[];
      hashtags: string[];
      extra_json: Record<string, unknown>;
      media_asset_id: string;
      scheduled_at: string;
      published_at: string;
      publish_status: PublishStatus;
      ai_generated: boolean;
    }>
  ) =>
    api<PublishVariant>(`/api/publish/bundles/${bundleId}/variants/${platform}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  publishVariant: (bundleId: string, platform: Platform) =>
    api<PublishVariant>(`/api/publish/bundles/${bundleId}/variants/${platform}/publish`, {
      method: "POST",
    }),

  createBundleFromProject: (projectId: string, data?: { bundle_type?: BundleType; label?: string }) =>
    api<PublishBundle>(`/api/publish/projects/${projectId}/create-bundle`, {
      method: "POST",
      body: JSON.stringify(data ?? {}),
    }),

  getCalendar: (from: string, to: string) =>
    api<PublishBundle[]>(`/api/publish/calendar?from=${from}&to=${to}`),
};



