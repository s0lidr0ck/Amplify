"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { publishingWorkspace } from "@/lib/api";
import { AppShell } from "@/components/layout/AppShell";
import { StepIntro } from "@/components/workflow/StepIntro";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { WeeklyCalendar } from "@/components/publishing/WeeklyCalendar";
import { useAuth } from "@/contexts/AuthContext";
import type { PublishBundle } from "@/lib/api";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function PublishingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [currentWeek, setCurrentWeek] = useState<string>(todayISO);

  const {
    data: bundles,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["publish-bundles", currentWeek],
    queryFn: () => publishingWorkspace.listBundles(currentWeek),
  });

  function handleBundleClick(bundle: PublishBundle) {
    router.push(`/publishing/bundles/${bundle.id}`);
  }

  // Coming Soon overlay for non-NLC orgs
  const isNLC = user?.is_nlc ?? false;

  return (
    <AppShell>
      <div className="page-frame space-y-6 py-8 sm:py-10">
        <StepIntro
          eyebrow="Publishing Workspace"
          title="Weekly content calendar."
          description="Manage and schedule content across YouTube, Instagram, TikTok, Facebook, and Wix Blog. Each week groups your sermon-derived content bundles by publish date."
        />

        {!isNLC && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 text-center">
            <div className="text-4xl mb-3">🚀</div>
            <h2 className="text-xl font-semibold text-amber-900 mb-2">Publishing — Coming Soon</h2>
            <p className="text-sm text-amber-700 max-w-md mx-auto">
              Social platform publishing is being set up for your organization. You'll be able to publish to YouTube, Instagram, TikTok, and Facebook soon. Contact support for early access.
            </p>
          </div>
        )}

        {isNLC && <Card>
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <span className="text-sm text-muted">Loading bundles…</span>
            </div>
          )}

          {isError && (
            <Alert tone="danger" title="Failed to load bundles">
              {error instanceof Error ? error.message : "An unexpected error occurred."}
            </Alert>
          )}

          {!isLoading && !isError && (
            <WeeklyCalendar
              weekDate={currentWeek}
              bundles={bundles ?? []}
              onBundleClick={handleBundleClick}
              onWeekChange={setCurrentWeek}
            />
          )}
        </Card>}
      </div>
    </AppShell>
  );
}
