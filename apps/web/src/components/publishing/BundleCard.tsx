"use client";

import { Badge } from "@/components/ui/Badge";
import type { PublishBundle, Platform } from "@/lib/api";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

const BUNDLE_TYPE_LABELS: Record<string, string> = {
  sermon_full: "Sermon Full",
  reel_clip: "Reel Clip",
  blog_post: "Blog Post",
  text_post: "Text Post",
};

const STATUS_TONE: Record<string, "neutral" | "warning" | "info" | "success"> = {
  draft: "neutral",
  scheduled: "warning",
  partially_published: "info",
  published: "success",
};

const PLATFORM_SHORT: Record<Platform, string> = {
  youtube: "YT",
  instagram: "IG",
  tiktok: "TT",
  facebook: "FB",
  wix_blog: "WX",
};

const PLATFORM_TONE: Record<Platform, "danger" | "brand" | "neutral" | "info" | "success"> = {
  youtube: "danger",
  instagram: "brand",
  tiktok: "neutral",
  facebook: "info",
  wix_blog: "success",
};

interface BundleCardProps {
  bundle: PublishBundle;
  onClick?: () => void;
}

export function BundleCard({ bundle, onClick }: BundleCardProps) {
  const title = bundle.label || BUNDLE_TYPE_LABELS[bundle.bundle_type] || bundle.bundle_type;
  const statusTone = STATUS_TONE[bundle.status] ?? "neutral";

  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(
        "w-full rounded-[1.5rem] border border-border/80 bg-surface p-4 text-left shadow-card transition-all duration-150",
        "hover:border-brand/40 hover:bg-brand-soft/30 hover:shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
      )}
    >
      {/* Title + Status */}
      <div className="flex min-w-0 items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold text-ink">{title}</p>
        <Badge tone={statusTone} className="shrink-0">
          {bundle.status.replace("_", " ")}
        </Badge>
      </div>

      {/* Platform indicator dots */}
      {bundle.variants.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {bundle.variants.map((variant) => (
            <Badge
              key={variant.platform}
              tone={PLATFORM_TONE[variant.platform]}
              className="px-2 py-0.5 text-[10px]"
            >
              {PLATFORM_SHORT[variant.platform]}
            </Badge>
          ))}
        </div>
      )}
    </button>
  );
}
