export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** URL for streaming a media asset (video/audio playback). */
export function getMediaPlaybackUrl(assetId: string): string {
  return `${API_BASE}/api/media/asset/${assetId}`;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
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
  sermon_date: string;
  status: string;
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
  get: (id: string) => api<Project>(`/api/projects/${id}`),
  create: (data: { title: string; speaker: string; sermon_date: string; source_type: string; source_url?: string }) =>
    api<Project>("/api/projects", { method: "POST", body: JSON.stringify(data) }),
  getSourceAsset: (projectId: string) =>
    api<
      | {
          id: string;
          filename: string;
          duration_seconds: number | null;
          status: string;
          playback_url: string;
        }
      | null
    >(`/api/projects/${projectId}/source-asset`),
  getReelAsset: async (projectId: string) => {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/reel-asset`);
    if (!res.ok) return null;
    if (res.status === 204) return null;
    return res.json();
  },
  getSermonAsset: async (projectId: string) => {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/sermon-asset`);
    if (!res.ok) return null;
    if (res.status === 204) return null;
    return res.json();
  },
};

export const jobs = {
  get: (jobId: string) => api<ProcessingJob>(`/api/jobs/${jobId}`),
  listForProject: (projectId: string) => api<ProcessingJob[]>(`/api/jobs/project/${projectId}`),
  getEvents: (jobId: string, afterSequence?: number) => {
    const q = afterSequence != null ? `?after_sequence=${afterSequence}` : "";
    return api<Array<{ sequence_no: number; event_type: string; message: string; progress_percent?: number }>>(
      `/api/jobs/${jobId}/events${q}`
    );
  },
};

export const uploads = {
  request: (data: { project_id: string; filename: string; content_type: string; file_size_bytes: number }) =>
    api<{ upload_url: string; asset_id: string; storage_key: string }>("/api/uploads/request", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  upload: async (
    projectId: string,
    file: File,
    assetKind = "source_video"
  ): Promise<{ asset_id: string; filename: string }> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("asset_kind", assetKind);
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const text = await res.text();
      try {
        const json = JSON.parse(text) as { detail?: string };
        throw new Error(json.detail ?? `Upload failed: ${res.status}`);
      } catch (e) {
        if (e instanceof SyntaxError) throw new Error(`Upload failed: ${res.status}`);
        throw e;
      }
    }
    return res.json();
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
