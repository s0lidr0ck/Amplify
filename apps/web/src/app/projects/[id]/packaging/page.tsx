import { redirect } from "next/navigation";

export default function PackagingPage({ params }: { params: { id: string } }) {
  redirect(`/projects/${params.id}/title-desc`);
}
