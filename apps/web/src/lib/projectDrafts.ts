export interface MetadataDraft {
  raw: string;
  metadata: Record<string, unknown>;
  warnings: string[];
}

export interface BlogDraft {
  markdown: string;
}

export interface PackagingDraft {
  title: string;
  description: string;
  thumbnail_prompts: Array<Record<string, string>>;
}

export interface FacebookDraft {
  post: string;
}

export interface ReelPlatformDraft {
  title: string;
  description: string;
  tags: string[];
}

export interface ReelDraft {
  caption: string;
  thumbnail_prompts: Array<Record<string, string>>;
  platforms: {
    youtube: ReelPlatformDraft;
    facebook: ReelPlatformDraft;
    instagram: ReelPlatformDraft;
    tiktok: ReelPlatformDraft;
  };
}

const keyFor = (projectId: string, kind: string) => `amplify:draft:${projectId}:${kind}`;

export function loadProjectDraft<T>(projectId: string, kind: string): T | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(keyFor(projectId, kind));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function saveProjectDraft(projectId: string, kind: string, value: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(keyFor(projectId, kind), JSON.stringify(value));
}
