"use client";

import { useRef } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { publishingWorkspace, getMediaPlaybackUrl, type PublishVariant } from "@/lib/api";
import { AppShell } from "@/components/layout/AppShell";
import { StepIntro } from "@/components/workflow/StepIntro";
import { Card, CardHeader } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { LinkButton } from "@/components/ui/Button";
import { PlatformVariantEditor } from "@/components/publishing/PlatformVariantEditor";

const BUNDLE_TYPE_LABELS: Record<string, string> = {
  sermon_full: "Sermon Full",
  reel_clip: "Reel Clip",
  blog_post: "Blog Post",
  text_post: "Text Post",
};

const BUNDLE_STATUS_TONE: Record<string, "neutral" | "warning" | "info" | "success"> = {
  draft: "neutral",
  scheduled: "warning",
  partially_published: "info",
  published: "success",
};

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function BundleDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const queryClient = useQueryClient();
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const {
    data: bundle,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["publish-bundle", id],
    queryFn: () => publishingWorkspace.getBundle(id),
  });

  const patchMutation = useMutation({
    mutationFn: (data: Parameters<typeof publishingWorkspace.updateBundle>[1]) =>
      publishingWorkspace.updateBundle(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["publish-bundle", id] });
    },
  });

  function handleNotesBlur() {
    if (!notesRef.current) return;
    patchMutation.mutate({ notes: notesRef.current.value });
  }

  function handleVariantSaved(_variant: PublishVariant) {
    void queryClient.invalidateQueries({ queryKey: ["publish-bundle", id] });
  }

  if (isLoading) {
    return (
      <AppShell>
        <div className="page-frame py-16 text-center">
          <span className="text-sm text-muted">Loading bundle…</span>
        </div>
      </AppShell>
    );
  }

  if (isError || !bundle) {
    return (
      <AppShell>
        <div className="page-frame py-10">
          <Alert tone="danger" title="Failed to load bundle">
            {error instanceof Error ? error.message : "Bundle not found."}
          </Alert>
        </div>
      </AppShell>
    );
  }

  const bundleTypeLabel = BUNDLE_TYPE_LABELS[bundle.bundle_type] ?? bundle.bundle_type;
  const statusTone = BUNDLE_STATUS_TONE[bundle.status] ?? "neutral";

  return (
    <AppShell>
      <div className="page-frame space-y-6 py-8 sm:py-10">
        <StepIntro
          eyebrow="Bundle"
          title={bundle.label || bundleTypeLabel}
          description="Edit platform variants and publish content across channels."
          statusItems={[
            { label: "Status", value: bundle.status.replace(/_/g, " "), tone: statusTone },
            { label: "Variants", value: `${bundle.variants.length}` },
            { label: "Week of", value: formatDate(bundle.week_date) },
          ]}
          action={
            <LinkButton href="/publishing" variant="secondary">
              ← Back
            </LinkButton>
          }
        />

        {/* Bundle meta */}
        <Card>
          <CardHeader
            eyebrow="Bundle Details"
            title="Metadata"
            description="Core information about this bundle."
          />
          <div className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
                  Bundle Type
                </p>
                <p className="text-sm font-medium text-ink">{bundleTypeLabel}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
                  Week Date
                </p>
                <p className="text-sm font-medium text-ink">{formatDate(bundle.week_date)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
                  Project ID
                </p>
                <p className="truncate font-mono text-xs text-muted">{bundle.project_id}</p>
              </div>
            </div>

            {bundle.thumbnail_asset_id && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
                  Thumbnail
                </p>
                <img
                  src={getMediaPlaybackUrl(bundle.thumbnail_asset_id)}
                  alt="Bundle thumbnail"
                  className="h-32 w-auto rounded-2xl border border-border object-cover"
                />
              </div>
            )}

            <label className="block space-y-2 text-sm">
              <span className="font-medium text-ink">Notes</span>
              <textarea
                ref={notesRef}
                defaultValue={bundle.notes ?? ""}
                onBlur={handleNotesBlur}
                placeholder="Optional notes for this bundle…"
                className="min-h-[6rem] w-full rounded-[1.5rem] border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
              />
            </label>

            {patchMutation.isError && (
              <Alert tone="danger">
                {patchMutation.error instanceof Error
                  ? patchMutation.error.message
                  : "Failed to save notes."}
              </Alert>
            )}
          </div>
        </Card>

        {/* Platform variant editor */}
        <Card>
          <CardHeader
            eyebrow="Platforms"
            title="Platform Variants"
            description="Edit content for each platform. Changes are saved automatically on blur."
          />
          <div className="mt-6">
            <PlatformVariantEditor
              bundleId={bundle.id}
              variants={bundle.variants}
              onVariantSaved={handleVariantSaved}
            />
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
