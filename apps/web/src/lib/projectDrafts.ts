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


export interface ScheduledPublishItem {
  id: string;
  starts_at: string;
  platform: "wix" | "youtube" | "facebook" | "instagram" | "tiktok";
  post_type:
    | "wix_article"
    | "youtube_sermon"
    | "youtube_short"
    | "facebook_text"
    | "facebook_reel"
    | "instagram_image"
    | "instagram_reel"
    | "tiktok_photo"
    | "tiktok_short";
  asset_ref: string;
  label: string;
  status: "scheduled" | "posted";
}
export interface PublishingDraft {
  featured_image_source: string;
  featured_image_id: string;
  featured_image_url: string;
  featured_image_filename: string;
  publish_date: string;
  writer_member_id: string;
  excerpt: string;
  title_tag: string;
  meta_description: string;
  og_title: string;
  og_description: string;
  schedule_items?: ScheduledPublishItem[];
  wix_result?: {
    draft_post_id: string;
    post_id: string;
    status: string;
    title: string;
    preview_url: string;
    published_at: string;
  } | null;
  youtube_result?: {
    video_id: string;
    status: string;
    title: string;
    watch_url: string;
    studio_url: string;
    published_at: string;
    channel_id: string;
    channel_title: string;
  } | null;
  youtube_short_result?: {
    video_id: string;
    status: string;
    title: string;
    watch_url: string;
    studio_url: string;
    published_at: string;
    channel_id: string;
    channel_title: string;
  } | null;
  facebook_post_result?: {
    post_id: string;
    status: string;
    message: string;
    post_url: string;
  } | null;
  facebook_reel_result?: {
    video_id: string;
    status: string;
    title: string;
    description: string;
    post_url: string;
  } | null;
  instagram_reel_result?: {
    media_id: string;
    status: string;
    caption: string;
    permalink: string;
  } | null;
  instagram_post_result?: {
    media_id: string;
    status: string;
    caption: string;
    permalink: string;
  } | null;
  tiktok_short_result?: {
    publish_id: string;
    status: string;
    privacy_level: string;
    title: string;
    creator_username?: string | null;
    max_video_post_duration_sec?: number | null;
    status_raw?: Record<string, unknown> | null;
  } | null;
  tiktok_photo_result?: {
    publish_id: string;
    status: string;
    privacy_level: string;
    title: string;
    description?: string;
    creator_username?: string | null;
    status_raw?: Record<string, unknown> | null;
  } | null;
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
