import type { Project } from "@/lib/api";
import { ProjectCard } from "@/components/dashboard/ProjectCard";

export function ProjectList({
  projects,
  onDelete,
  deletingProjectId,
}: {
  projects: Project[];
  onDelete?: (project: Project) => void;
  deletingProjectId?: string | null;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          onDelete={onDelete}
          deleting={deletingProjectId === project.id}
        />
      ))}
    </div>
  );
}
