"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ProjectList } from "@/components/dashboard/ProjectList";
import { ResumeWorkCard } from "@/components/dashboard/ResumeWorkCard";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { LinkButton } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { projects } from "@/lib/api";

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { data: projectList, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: projects.list,
  });
  const deleteProject = useMutation({
    mutationFn: (projectId: string) => projects.delete(projectId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  function handleDeleteProject(project: { id: string; title: string }) {
    const confirmed = window.confirm(
      `Delete "${project.title}" and all of its uploaded files, jobs, transcripts, clips, and drafts? This cannot be undone.`
    );
    if (!confirmed) return;
    deleteProject.mutate(project.id);
  }

  return (
    <AppShell>
      <main className="page-frame py-8 lg:py-10">
        <div className="page-stack">
          <PageHeader
            eyebrow="Production Studio"
            title="Move sermons from raw recording to ready-to-publish content."
            description="Track each message through intake, refinement, packaging, and publishing from one shared workspace."
            actions={
              <LinkButton href="/projects/new" size="lg">
                Create Project
              </LinkButton>
            }
          />

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
            <div className="space-y-6">
              <ResumeWorkCard />

              <Card>
                <CardHeader
                  eyebrow="Project Queue"
                  title="Current projects"
                  description="Pick up the next sermon in progress and jump back into the workflow."
                />
                <div className="mt-6">
                  {deleteProject.isError ? (
                    <Alert tone="danger" title="Project deletion failed">
                      {deleteProject.error instanceof Error
                        ? deleteProject.error.message
                        : "The project could not be deleted."}
                    </Alert>
                  ) : null}
                  {isLoading ? (
                    <Alert tone="info">Loading projects from the local API.</Alert>
                  ) : projectList?.length === 0 ? (
                    <Alert tone="warning" title="No projects yet">
                      Create the first sermon project to start building the studio rhythm.
                    </Alert>
                  ) : (
                    <ProjectList
                      projects={projectList ?? []}
                      onDelete={handleDeleteProject}
                      deletingProjectId={deleteProject.isPending ? deleteProject.variables : null}
                    />
                  )}
                </div>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="bg-[linear-gradient(160deg,rgba(255,255,255,0.98),rgba(237,248,250,0.96))]">
                <CardHeader
                  eyebrow="Workflow Model"
                  title="One guided system, nine stages."
                  description="The overhaul is organized around a clear production path so every page can communicate progress, blockers, and next actions."
                />
                <div className="mt-6 space-y-3 text-sm text-muted">
                  <div className="rounded-2xl bg-surface/80 p-4">
                    <p className="font-semibold text-ink">Source to transcript</p>
                    <p className="mt-2 leading-6">Bring in the sermon, trim the usable message, and approve the transcript.</p>
                  </div>
                  <div className="rounded-2xl bg-surface/80 p-4">
                    <p className="font-semibold text-ink">Clips to packaging</p>
                    <p className="mt-2 leading-6">Shape short-form moments and create the long-form presentation assets.</p>
                  </div>
                  <div className="rounded-2xl bg-surface/80 p-4">
                    <p className="font-semibold text-ink">Metadata to publishing</p>
                    <p className="mt-2 leading-6">Finalize downstream data and handoff for release with less guesswork.</p>
                  </div>
                </div>
              </Card>

              <Card>
                <CardHeader
                  eyebrow="Next Build"
                  title="What this first pass upgrades"
                  description="The design foundation, navigation shell, and dashboard now set the tone for the remaining workflow pages."
                />
                <ul className="mt-6 space-y-3 text-sm text-muted">
                  <li className="rounded-2xl bg-surface-strong/60 p-4">Shared tokens for surfaces, type, color, and state styling.</li>
                  <li className="rounded-2xl bg-surface-strong/60 p-4">A workflow rail that explains where the sermon is now and what comes next.</li>
                  <li className="rounded-2xl bg-surface-strong/60 p-4">A dashboard built around resuming work, not just listing records.</li>
                </ul>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
