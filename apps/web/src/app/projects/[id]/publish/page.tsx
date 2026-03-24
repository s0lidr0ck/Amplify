import { redirect } from "next/navigation";

export default async function PublishWorkspacePage({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/projects/${params.id}/publish/release`);
}