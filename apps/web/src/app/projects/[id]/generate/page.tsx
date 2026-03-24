"use client";

import { useParams } from "next/navigation";
import { GenerateStudioLanding } from "@/components/generate/GenerateStudioLanding";

export default function GenerateWorkspacePage() {
  const params = useParams();
  const projectId = params.id as string;

  return <GenerateStudioLanding projectId={projectId} />;
}
