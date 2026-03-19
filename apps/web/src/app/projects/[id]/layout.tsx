"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { ProjectWorkflowNav } from "@/components/workflow/ProjectWorkflowNav";
import { projects } from "@/lib/api";
import { workflowStages } from "@/lib/workflow";

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useParams();
  const projectId = params.id as string;

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projects.get(projectId),
  });

  const utilityPage = pathname?.endsWith("/visuals")
    ? {
        label: "Visual Assets",
        shortLabel: "Visuals",
        description: "Review the sermon master, thumbnails, and final reel assets together in one shared media hub.",
      }
    : pathname?.endsWith("/text")
      ? {
          label: "Text Assets",
          shortLabel: "Text",
          description: "Review the sermon transcript, generated drafts, and reel copy together in one text-first hub.",
        }
      : null;

  const currentStage =
    utilityPage ?? workflowStages.find((stage) => pathname?.endsWith(`/${stage.href}`)) ?? workflowStages[0];

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
              </>
            }
          />

          <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="space-y-6">
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

            <section className="min-w-0">{children}</section>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
