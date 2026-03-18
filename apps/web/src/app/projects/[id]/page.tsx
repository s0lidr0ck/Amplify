"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { projects } from "@/lib/api";

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: () => projects.get(id),
  });

  if (isLoading || !project) {
    return <p className="text-gray-500">Loading...</p>;
  }

  router.replace(`/projects/${id}/source`);
  return null;
}
