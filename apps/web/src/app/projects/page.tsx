"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ProjectList } from "@/components/dashboard/ProjectList";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { LinkButton } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { projects } from "@/lib/api";

export default function ProjectsIndexPage() {
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
            eyebrow="Projects"
            title="Project queue and active workspaces."
            description="Open the next sermon in progress, jump into a workspace, or start something new."
            actions={
              <LinkButton href="/projects/new" size="lg">
                Create Project
              </LinkButton>
            }
          />

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_360px]">
            <Card>
              <CardHeader
                eyebrow="Active Queue"
                title="Current projects"
                description="This is the operational list behind the Projects item in the rail."
              />
              <div className="mt-6">
                {deleteProject.isError ? (
                  <Alert tone="danger" title="Project deletion failed">
                    {deleteProject.error instanceof Error ? deleteProject.error.message : "The project could not be deleted."}
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

            <div className="space-y-6">
              <Card className="bg-[linear-gradient(160deg,rgba(255,255,255,0.98),rgba(237,248,250,0.96))]">
                <CardHeader
                  eyebrow="Workspace Model"
                  title="One queue, multiple workspaces."
                  description="Projects is now the folder entry point, and each sermon opens into Overview, Ingest, Generate, Publish, and Analytics."
                />
                <div className="mt-6 space-y-3 text-sm text-muted">
                  <div className="rounded-2xl bg-surface/80 p-4">
                    <p className="font-semibold text-ink">Open by project</p>
                    <p className="mt-2 leading-6">Start from the queue, then move through the nested workspace tree in the left rail.</p>
                  </div>
                  <div className="rounded-2xl bg-surface/80 p-4">
                    <p className="font-semibold text-ink">Stay in one shell</p>
                    <p className="mt-2 leading-6">The new nav model keeps project areas and active subviews in one consistent menu.</p>
                  </div>
                </div>
              </Card>

              <Card>
                <CardHeader
                  eyebrow="Quick Start"
                  title="Create a new sermon workspace"
                  description="Spin up another project when the queue is clear or a new message is ready."
                />
                <div className="mt-6">
                  <LinkButton href="/projects/new" className="w-full">
                    Create Project
                  </LinkButton>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
