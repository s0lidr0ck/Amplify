"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { publishingWorkspace, type Platform, type PublishVariant } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

const PLATFORMS: Platform[] = ["youtube", "instagram", "tiktok", "facebook", "wix_blog"];

const PLATFORM_LABELS: Record<Platform, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  wix_blog: "Wix Blog",
};

const DESCRIPTION_LABEL: Record<Platform, string> = {
  youtube: "Description",
  instagram: "Post Caption",
  tiktok: "Post Caption",
  facebook: "Post Caption",
  wix_blog: "Blog Post",
};

const PUBLISH_STATUS_TONE: Record<string, "neutral" | "warning" | "success" | "danger"> = {
  draft: "neutral",
  scheduled: "warning",
  processing: "warning",
  published: "success",
  failed: "danger",
};

const PUBLISH_STATUS_LABEL: Record<string, string> = {
  draft: "draft",
  scheduled: "scheduled",
  processing: "Uploading…",
  published: "published",
  failed: "failed",
};

interface PlatformVariantEditorProps {
  bundleId: string;
  variants: PublishVariant[];
  onVariantSaved?: (variant: PublishVariant) => void;
}

interface VariantFormState {
  title: string;
  description: string;
  tags: string;
  hashtags: string;
  scheduled_at: string;
}

function variantToForm(variant: PublishVariant | undefined): VariantFormState {
  return {
    title: variant?.title ?? "",
    description: variant?.description ?? "",
    tags: (variant?.tags ?? []).join(", "),
    hashtags: (variant?.hashtags ?? []).join(", "),
    scheduled_at: variant?.scheduled_at
      ? variant.scheduled_at.slice(0, 16) // datetime-local format
      : "",
  };
}

function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function PlatformVariantEditor({
  bundleId,
  variants,
  onVariantSaved,
}: PlatformVariantEditorProps) {
  const [activeTab, setActiveTab] = useState<Platform>("youtube");
  const [formStates, setFormStates] = useState<Record<Platform, VariantFormState>>(() => {
    const initial = {} as Record<Platform, VariantFormState>;
    for (const platform of PLATFORMS) {
      const existing = variants.find((v) => v.platform === platform);
      initial[platform] = variantToForm(existing);
    }
    return initial;
  });
  const [saveState, setSaveState] = useState<Record<Platform, "idle" | "saving" | "saved" | "error">>(
    () => {
      const initial = {} as Record<Platform, "idle" | "saving" | "saved" | "error">;
      for (const platform of PLATFORMS) {
        initial[platform] = "idle";
      }
      return initial;
    }
  );

  const currentVariant = variants.find((v) => v.platform === activeTab);
  const currentForm = formStates[activeTab];

  const saveMutation = useMutation({
    mutationFn: ({ platform, data }: { platform: Platform; data: Parameters<typeof publishingWorkspace.upsertVariant>[2] }) =>
      publishingWorkspace.upsertVariant(bundleId, platform, data),
    onMutate: ({ platform }) => {
      setSaveState((s) => ({ ...s, [platform]: "saving" }));
    },
    onSuccess: (variant, { platform }) => {
      setSaveState((s) => ({ ...s, [platform]: "saved" }));
      onVariantSaved?.(variant);
      setTimeout(() => setSaveState((s) => ({ ...s, [platform]: "idle" })), 2000);
    },
    onError: (_err, { platform }) => {
      setSaveState((s) => ({ ...s, [platform]: "error" }));
    },
  });

  const publishMutation = useMutation({
    mutationFn: (platform: Platform) =>
      publishingWorkspace.publishVariant(bundleId, platform),
    onSuccess: (variant) => {
      onVariantSaved?.(variant);
    },
  });

  function handleBlur(platform: Platform) {
    const form = formStates[platform];
    saveMutation.mutate({
      platform,
      data: {
        title: form.title || undefined,
        description: form.description || undefined,
        tags: platform === "youtube" ? parseTags(form.tags) : undefined,
        hashtags: ["instagram", "tiktok", "facebook"].includes(platform)
          ? parseTags(form.hashtags)
          : undefined,
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : undefined,
      },
    });
  }

  function updateField(platform: Platform, field: keyof VariantFormState, value: string) {
    setFormStates((s) => ({ ...s, [platform]: { ...s[platform], [field]: value } }));
  }

  const state = saveState[activeTab];

  return (
    <div>
      {/* Tab Bar */}
      <div className="mb-6 flex flex-wrap gap-2">
        {PLATFORMS.map((platform) => {
          const hasVariant = variants.some((v) => v.platform === platform);
          return (
            <button
              key={platform}
              type="button"
              onClick={() => setActiveTab(platform)}
              className={classNames(
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                activeTab === platform
                  ? "bg-brand-soft text-brand-strong"
                  : "text-muted hover:text-ink hover:bg-surface"
              )}
            >
              {PLATFORM_LABELS[platform]}
              {hasVariant && (
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Panel */}
      <div className="space-y-5">
        {/* Status row */}
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={PUBLISH_STATUS_TONE[currentVariant?.publish_status ?? "draft"]}>
            {PUBLISH_STATUS_LABEL[currentVariant?.publish_status ?? "draft"] ?? currentVariant?.publish_status ?? "draft"}
          </Badge>
          {currentVariant?.ai_generated && (
            <Badge tone="info">✓ AI generated</Badge>
          )}
          {state === "saving" && (
            <span className="text-xs text-muted">Saving…</span>
          )}
          {state === "saved" && (
            <span className="text-xs text-success">Saved ✓</span>
          )}
          {state === "error" && (
            <span className="text-xs text-danger">Save failed</span>
          )}
        </div>

        {/* Title — not shown for wix_blog */}
        {activeTab !== "wix_blog" && (
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-ink">Title</span>
            <input
              value={currentForm.title}
              onChange={(e) => updateField(activeTab, "title", e.target.value)}
              onBlur={() => handleBlur(activeTab)}
              placeholder={`${PLATFORM_LABELS[activeTab]} title`}
              className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
            />
          </label>
        )}

        {/* Description / Caption / Blog Post */}
        <label className="block space-y-2 text-sm">
          <span className="font-medium text-ink">{DESCRIPTION_LABEL[activeTab]}</span>
          <textarea
            value={currentForm.description}
            onChange={(e) => updateField(activeTab, "description", e.target.value)}
            onBlur={() => handleBlur(activeTab)}
            placeholder={
              activeTab === "wix_blog"
                ? "Full blog post content…"
                : `Write a ${PLATFORM_LABELS[activeTab]} caption…`
            }
            className="min-h-[12rem] w-full rounded-[1.5rem] border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
          />
        </label>

        {/* Tags — YouTube only */}
        {activeTab === "youtube" && (
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-ink">Tags (comma-separated)</span>
            <input
              value={currentForm.tags}
              onChange={(e) => updateField(activeTab, "tags", e.target.value)}
              onBlur={() => handleBlur(activeTab)}
              placeholder="sermon, church, faith"
              className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
            />
          </label>
        )}

        {/* Hashtags — Instagram, TikTok, Facebook */}
        {["instagram", "tiktok", "facebook"].includes(activeTab) && (
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-ink">Hashtags (comma-separated)</span>
            <input
              value={currentForm.hashtags}
              onChange={(e) => updateField(activeTab, "hashtags", e.target.value)}
              onBlur={() => handleBlur(activeTab)}
              placeholder="#church, #faith, #sermon"
              className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
            />
          </label>
        )}

        {/* Scheduled At */}
        <label className="block space-y-2 text-sm">
          <span className="font-medium text-ink">Scheduled At</span>
          <input
            type="datetime-local"
            value={currentForm.scheduled_at}
            onChange={(e) => updateField(activeTab, "scheduled_at", e.target.value)}
            onBlur={() => handleBlur(activeTab)}
            className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
          />
        </label>

        {/* Publish Now button */}
        {currentVariant?.publish_status !== "published" && currentVariant?.publish_status !== "processing" && (
          <div className="pt-2">
            <Button
              variant="primary"
              onClick={() => publishMutation.mutate(activeTab)}
              disabled={publishMutation.isPending}
            >
              {publishMutation.isPending && publishMutation.variables === activeTab
                ? "Queuing…"
                : `Publish Now on ${PLATFORM_LABELS[activeTab]}`}
            </Button>
            {publishMutation.isError && publishMutation.variables === activeTab && (
              <p className="mt-2 text-xs text-danger">
                {publishMutation.error instanceof Error
                  ? publishMutation.error.message
                  : "Publish failed"}
              </p>
            )}
          </div>
        )}
        {currentVariant?.publish_status === "processing" && (
          <div className="pt-2 flex items-center gap-2 text-sm text-muted">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            Upload queued — you'll get a Slack approval request shortly
          </div>
        )}
      </div>
    </div>
  );
}
