"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { projects } from "@/lib/api";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { StepIntro } from "@/components/workflow/StepIntro";

export default function PublishingPage() {
  const params = useParams();
  const projectId = params.id as string;

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projects.get(projectId),
  });

  return (
    <div className="space-y-6">
      <StepIntro
        eyebrow="Publishing"
        title={`Publishing is coming soon for ${project?.title ?? "this project"}.`}
        description=""
        statusItems={[
          { label: "Status", value: "Coming soon", tone: "neutral" },
        ]}
      />

      <Card>
        <CardHeader eyebrow="Coming Soon" title="Release tracking is not active yet." />
        <div className="mt-6 space-y-4">
          <Alert tone="info">
            This workflow step is reserved for future release tracking, destination links, and post-publish reporting.
          </Alert>
          <div className="flex items-center justify-between rounded-2xl bg-surface-tint p-4 text-sm">
            <span className="text-muted">Workflow state</span>
            <Badge tone="neutral">Disabled for now</Badge>
          </div>
        </div>
      </Card>
    </div>
  );
}
