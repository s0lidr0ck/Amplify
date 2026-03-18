import { LinkButton } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";

export function ResumeWorkCard() {
  return (
    <Card className="overflow-hidden bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(255,244,237,0.96))]">
      <CardHeader
        eyebrow="Studio Rhythm"
        title="Keep one sermon moving at a time."
        description="Amplify works best when each project has a clear next action. Jump back into intake, transcript review, or clip shaping without losing context."
        action={<LinkButton href="/projects/new">Start A Fresh Project</LinkButton>}
      />
      <div className="mt-6 grid gap-4 text-sm text-muted md:grid-cols-3">
        <div className="rounded-2xl bg-surface/80 p-4">
          <p className="font-semibold text-ink">Intake</p>
          <p className="mt-2 leading-6">Capture the source and get the sermon master ready for downstream work.</p>
        </div>
        <div className="rounded-2xl bg-surface/80 p-4">
          <p className="font-semibold text-ink">Refine</p>
          <p className="mt-2 leading-6">Approve transcript content, shape clips, and build the message narrative.</p>
        </div>
        <div className="rounded-2xl bg-surface/80 p-4">
          <p className="font-semibold text-ink">Publish</p>
          <p className="mt-2 leading-6">Generate packaging, metadata, and the final content bundle for release.</p>
        </div>
      </div>
    </Card>
  );
}
