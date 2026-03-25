"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Button, LinkButton } from "@/components/ui/Button";
import { ProjectWorkflowNav } from "@/components/workflow/ProjectWorkflowNav";
import { projects } from "@/lib/api";
import { workflowStages } from "@/lib/workflow";

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useParams();
  const projectId = params.id as string;
  const [mobileRailOpen, setMobileRailOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projects.get(projectId),
  });

  const utilityPage = pathname?.endsWith("/visuals")
    ? {
        href: "reel-thumbnail",
        label: "Visual Assets",
        shortLabel: "Visuals",
        description: "Review the sermon master, thumbnails, and final reel assets together in one shared media hub.",
      }
    : pathname?.endsWith("/text")
      ? {
          href: "text-post",
          label: "Text Assets",
          shortLabel: "Text",
          description: "Review the sermon transcript, generated drafts, and reel copy together in one text-first hub.",
        }
      : null;

  const currentStage =
    utilityPage ?? workflowStages.find((stage) => pathname?.endsWith(`/${stage.href}`)) ?? workflowStages[0];
  const currentStageHref = currentStage.href;
  const currentStageIndex = workflowStages.findIndex((stage) => stage.href === currentStageHref);
  const previousStage = currentStageIndex > 0 ? workflowStages[currentStageIndex - 1] : null;
  const nextStage =
    currentStageIndex >= 0 && currentStageIndex < workflowStages.length - 1
      ? workflowStages[currentStageIndex + 1]
      : null;

  useEffect(() => {
    setMobileRailOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileRailOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileRailOpen]);

  useEffect(() => {
    if (!shareCopied) return;
    const timeoutId = window.setTimeout(() => setShareCopied(false), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [shareCopied]);

  async function copyShareLink() {
    const shareUrl = `${window.location.origin}/share/${projectId}`;
    await navigator.clipboard.writeText(shareUrl);
    setShareCopied(true);
  }

  return (
    <AppShell
      action={
        <Link href="/" className="text-sm font-medium text-muted hover:text-ink">
          Back to dashboard
        </Link>
      }
    >
      <main className="page-frame py-8 lg:py-10">
        <div className="page-stack">
          <PageHeader
            eyebrow="Project Workflow"
            title={project?.title ?? "Project Workspace"}
            description={currentStage.description}
            status={project?.status}
            actions={
              <>
                <Badge tone="info">{currentStage.shortLabel}</Badge>
                <Badge tone="neutral">{project?.speaker_display_name ?? project?.speaker ?? "Speaker pending"}</Badge>
                <LinkButton href={`/projects/${projectId}/text`} variant="secondary" size="sm">
                  Text Assets
                </LinkButton>
                <LinkButton href={`/projects/${projectId}/visuals`} variant="secondary" size="sm">
                  Visual Assets
                </LinkButton>
                <Button type="button" variant="secondary" size="sm" onClick={() => void copyShareLink()}>
                  {shareCopied ? "Share Link Copied" : "Share"}
                </Button>
              </>
            }
          />

          <div className="surface-card space-y-4 p-4 xl:hidden">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">{currentStage.shortLabel}</Badge>
              <Badge tone="neutral">{project?.speaker_display_name ?? project?.speaker ?? "Speaker pending"}</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-surface-tint p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Previous</p>
                <p className="mt-2 text-sm font-semibold text-ink">{previousStage?.shortLabel ?? "Start"}</p>
              </div>
              <div className="rounded-2xl bg-brand-soft p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-strong/80">Current</p>
                <p className="mt-2 text-sm font-semibold text-ink">{currentStage.shortLabel}</p>
              </div>
              <div className="rounded-2xl bg-surface-tint p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Next</p>
                <p className="mt-2 text-sm font-semibold text-ink">{nextStage?.shortLabel ?? "Wrap up"}</p>
              </div>
            </div>
            <Button variant="secondary" className="w-full justify-between rounded-2xl" onClick={() => setMobileRailOpen(true)}>
              <span>Workflow and tools</span>
              <span aria-hidden="true" className="text-lg leading-none">
                ≡
              </span>
            </Button>
          </div>

          <div
            className={`fixed inset-0 z-40 xl:hidden ${mobileRailOpen ? "pointer-events-auto" : "pointer-events-none"}`}
            aria-hidden={!mobileRailOpen}
          >
            <button
              type="button"
              className={`absolute inset-0 bg-ink/35 transition-opacity duration-200 ${mobileRailOpen ? "opacity-100" : "opacity-0"}`}
              onClick={() => setMobileRailOpen(false)}
              aria-label="Close workflow drawer"
            />
            <aside
              className={`absolute inset-y-0 right-0 flex w-full max-w-sm flex-col border-l border-border/80 bg-background-alt shadow-2xl transition-transform duration-300 ${
                mobileRailOpen ? "translate-x-0" : "translate-x-full"
              }`}
            >
              <div className="flex items-center justify-between border-b border-border/80 px-4 py-4">
                <div>
                  <p className="section-label">Workflow</p>
                  <p className="mt-1 text-sm font-semibold text-ink">{currentStage.label}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setMobileRailOpen(false)}>
                  Close
                </Button>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                <ProjectWorkflowNav projectId={projectId} />
                <Card className="p-5">
                  <p className="section-label">Asset Hubs</p>
                  <h2 className="mt-3 text-lg font-semibold text-ink">Review Everything Faster</h2>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    Jump into one shared media hub or one shared text hub instead of chasing files and copy across the workflow.
                  </p>
                  <div className="mt-5 space-y-3">
                    <LinkButton href={`/projects/${projectId}/visuals`} variant="secondary" className="w-full">
                      Open Visual Assets
                    </LinkButton>
                    <LinkButton href={`/projects/${projectId}/text`} variant="secondary" className="w-full">
                      Open Text Assets
                    </LinkButton>
                  </div>
                </Card>
              </div>
            </aside>
          </div>

          <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="order-2 hidden space-y-6 xl:order-1 xl:block">
              <ProjectWorkflowNav projectId={projectId} />
              <Card className="p-5">
                <p className="section-label">Asset Hubs</p>
                <h2 className="mt-3 text-lg font-semibold text-ink">Review Everything Faster</h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Jump into one shared media hub or one shared text hub instead of chasing files and copy across the workflow.
                </p>
                <div className="mt-5 space-y-3">
                  <LinkButton href={`/projects/${projectId}/visuals`} variant="secondary" className="w-full">
                    Open Visual Assets
                  </LinkButton>
                  <LinkButton href={`/projects/${projectId}/text`} variant="secondary" className="w-full">
                    Open Text Assets
                  </LinkButton>
                </div>
              </Card>
              <Card className="p-5">
                <p className="section-label">Current Focus</p>
                <h2 className="mt-3 text-lg font-semibold text-ink">{currentStage.label}</h2>
                <p className="mt-2 text-sm leading-6 text-muted">{currentStage.description}</p>
                <div className="mt-5 rounded-2xl bg-surface-tint p-4 text-sm text-muted">
                  Use this rail as the production map. Earlier steps are treated as completed context, and later steps are lined up as the next handoffs.
                </div>
              </Card>
            </aside>

            <section className="order-1 min-w-0 xl:order-2">{children}</section>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
