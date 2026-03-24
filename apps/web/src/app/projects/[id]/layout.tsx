"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { InspectorPanel, type GlobalRailChildItem } from "@/components/shell";
import { Button, LinkButton } from "@/components/ui/Button";
import { projects } from "@/lib/api";
import {
  getWorkspaceContextFromPathname,
  getWorkspaceNavigation,
  getWorkspaceSectionGroups,
} from "@/lib/workspace";

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useParams();
  const projectId = params.id as string;
  const [mobileRailOpen, setMobileRailOpen] = useState(false);

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projects.get(projectId),
  });

  const routeContext = useMemo(() => getWorkspaceContextFromPathname(pathname ?? `/projects/${projectId}`), [pathname, projectId]);
  const currentWorkspace = routeContext.workspace;
  const currentSubview = routeContext.subview;
  const compactGenerateShell = currentWorkspace?.id === "generate";
  const showDesktopInspector = !compactGenerateShell;

  const projectAreas = getWorkspaceNavigation(projectId).map((workspace) => ({
    label: workspace.label,
    href: workspace.href,
    active: workspace.id === currentWorkspace?.id,
    description: workspace.id === currentWorkspace?.id ? workspace.description : undefined,
    badge: workspace.id === currentWorkspace?.id ? "Open" : undefined,
    tone: workspace.id === currentWorkspace?.id ? ("brand" as const) : undefined,
  }));

  const workspaceGroups = currentWorkspace
    ? getWorkspaceSectionGroups(currentWorkspace.id, projectId).map((group) => ({
        label: group.label,
        children: group.items.map((item) => {
          const tone = !item.availableInCurrentApp
            ? ("neutral" as const)
            : currentSubview?.id === item.id
              ? ("brand" as const)
              : undefined;

          return {
            label: item.label,
            href: item.availableInCurrentApp ? item.href : undefined,
            active: currentSubview?.id === item.id,
            badge: item.availableInCurrentApp ? undefined : "Planned",
            tone,
          };
        }),
      }))
    : [];

  const projectRailItems: GlobalRailChildItem[] = projectAreas.map((area) => ({
    label: area.label,
    href: area.href,
    active: area.active,
    badge: area.badge,
    tone: area.tone,
    children:
      area.active && workspaceGroups.length
        ? workspaceGroups.map((group) => ({
            label: group.label,
            children: group.children,
          }))
        : undefined,
  }));

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

  return (
    <AppShell
      action={
        <>
          <LinkButton href="/" variant="secondary" size="sm">
            Dashboard
          </LinkButton>
          <LinkButton href="/projects/new" size="sm">
            New Project
          </LinkButton>
        </>
      }
      projectRailItems={projectRailItems}
      railContext={
        <div className="rounded-[1.5rem] border border-border/80 bg-surface px-4 py-4 shadow-card">
          <p className="section-label">Active Project</p>
          <h2 className="mt-2 truncate font-display text-2xl font-semibold tracking-tight text-ink">
            {project?.title ?? "Project Workspace"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            {currentSubview?.description ??
              currentWorkspace?.description ??
              "Persistent shell for ingest, generation, publishing, and analytics."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand-strong">
              {currentWorkspace?.label ?? "Overview"}
            </span>
            {project?.status ? (
              <span className="rounded-full bg-info-soft px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-info">
                {project.status}
              </span>
            ) : null}
            <span className="rounded-full bg-surface-strong px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              {project?.speaker_display_name ?? project?.speaker ?? "Speaker pending"}
            </span>
          </div>
        </div>
      }
    >
      <div className="shell-frame py-5 pb-24 xl:pb-8">
        <div
          className={`grid gap-5 ${
            showDesktopInspector ? "xl:grid-cols-[minmax(0,1fr)_292px]" : "xl:grid-cols-[minmax(0,1fr)]"
          }`}
        >
          <section className="min-w-0">{children}</section>

          <aside className={`hidden xl:block ${showDesktopInspector ? "" : "xl:hidden"}`}>
            <InspectorPanel
              eyebrow="Inspector"
              title={currentSubview?.label ?? currentWorkspace?.label ?? "Project"}
              description="Context, status, and shell-level actions stay docked here while the center canvas changes."
              status={project?.status ?? undefined}
              stats={[
                {
                  label: "Speaker",
                  value: project?.speaker_display_name ?? project?.speaker ?? "Pending",
                  tone: "neutral",
                },
                {
                  label: "Workspace",
                  value: currentWorkspace?.label ?? "Overview",
                  tone: "brand",
                },
                {
                  label: "Subview",
                  value: currentSubview?.label ?? "Project summary",
                  tone: "info",
                },
                {
                  label: "Date",
                  value: project?.sermon_date || "Pending",
                  tone: "neutral",
                },
              ]}
              footer={
                <>
                  <LinkButton href={`/projects/${projectId}/publishing`} variant="secondary" className="w-full">
                    Open Release Desk
                  </LinkButton>
                  <LinkButton href={`/projects/${projectId}/analytics`} variant="secondary" className="w-full">
                    Open Analytics
                  </LinkButton>
                </>
              }
            >
              <div className="rounded-[1.25rem] border border-border/80 bg-surface px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Current Focus</p>
                <p className="mt-2 text-sm font-semibold text-ink">
                  {currentSubview?.description ?? currentWorkspace?.description ?? "Project context"}
                </p>
              </div>
              <div className="rounded-[1.25rem] border border-border/80 bg-surface px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Next Shift</p>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Phase 1 keeps existing route content in the center while replacing the shell around it. The next slices will convert each workspace into queue/focus/inspector-native canvases.
                </p>
              </div>
            </InspectorPanel>
          </aside>
        </div>
      </div>

      <div
        className={`fixed inset-0 z-40 xl:hidden ${mobileRailOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!mobileRailOpen}
      >
        <button
          type="button"
          className={`absolute inset-0 bg-ink/35 transition-opacity duration-200 ${mobileRailOpen ? "opacity-100" : "opacity-0"}`}
          onClick={() => setMobileRailOpen(false)}
          aria-label="Close workspace drawer"
        />
        <aside
          className={`absolute inset-y-0 right-0 flex w-full max-w-sm flex-col border-l border-border/80 bg-background-alt shadow-2xl transition-transform duration-300 ${
            mobileRailOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between border-b border-border/80 px-4 py-4">
            <div>
              <p className="section-label">Workspace</p>
              <p className="mt-1 text-sm font-semibold text-ink">{currentWorkspace?.label ?? "Overview"}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setMobileRailOpen(false)}>
              Close
            </Button>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="rounded-[1.5rem] border border-border/80 bg-surface px-4 py-4 shadow-card">
              <p className="section-label">Active Project</p>
              <p className="mt-2 text-lg font-semibold text-ink">{project?.title ?? "Project Workspace"}</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                {currentSubview?.description ??
                  currentWorkspace?.description ??
                  "Persistent shell for ingest, generation, publishing, and analytics."}
              </p>
            </div>
            <div className="space-y-3">
              <LinkButton href={`/projects/${projectId}/publishing`} variant="secondary" className="w-full">
                Release Desk
              </LinkButton>
              <LinkButton href={`/projects/${projectId}/analytics`} variant="secondary" className="w-full">
                Analytics
              </LinkButton>
            </div>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
