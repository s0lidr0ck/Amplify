import type { Project } from "@/lib/api";
import { ProjectCard } from "@/components/dashboard/ProjectCard";

export function ProjectList({ projects }: { projects: Project[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}
