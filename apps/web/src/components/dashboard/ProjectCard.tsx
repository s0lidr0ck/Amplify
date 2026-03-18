import Link from "next/link";
import type { Project } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

export function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      href={`/projects/${project.id}/source`}
      className="surface-card group block p-6 transition-transform duration-200 hover:-translate-y-1 hover:border-brand/40"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <p className="section-label">Active Project</p>
          <div>
            <h3 className="text-xl font-semibold text-ink transition-colors group-hover:text-brand-strong">
              {project.title}
            </h3>
            <p className="mt-2 text-sm text-muted">
              {project.speaker} | {formatDate(project.sermon_date)}
            </p>
          </div>
        </div>
        <Badge tone="brand">{project.status}</Badge>
      </div>
      <div className="mt-6 flex items-center justify-between gap-3 border-t border-border/70 pt-5 text-sm">
        <span className="text-muted">Open workflow and continue shaping the sermon package.</span>
        <span className="font-semibold text-brand-strong">Resume</span>
      </div>
    </Link>
  );
}
