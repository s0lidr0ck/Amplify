import { Alert } from "@/components/ui/Alert";
import { Card, CardHeader } from "@/components/ui/Card";
import { PublishingConnectionsSummary } from "@/components/settings/PublishingConnectionsSummary";

export default function PublishingOverviewPage() {
  return (
    <div className="space-y-6">
      <PublishingConnectionsSummary mode="full" />

      <Card>
        <CardHeader
          eyebrow="What moved here"
          title="Keep app-wide concerns out of the project release desk."
          description="This hub is the shared control surface for channels, destination mappings, and publishing defaults."
        />
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl bg-background-alt px-4 py-4">
            <p className="text-sm font-medium text-ink">Accounts</p>
            <p className="mt-2 text-sm text-muted">OAuth status, page/channel linkage, and app credentials live here.</p>
          </div>
          <div className="rounded-2xl bg-background-alt px-4 py-4">
            <p className="text-sm font-medium text-ink">Destinations</p>
            <p className="mt-2 text-sm text-muted">Each platform's default asset source and publish shape belongs here.</p>
          </div>
          <div className="rounded-2xl bg-background-alt px-4 py-4">
            <p className="text-sm font-medium text-ink">Defaults</p>
            <p className="mt-2 text-sm text-muted">Privacy, scheduling, and release preferences can be standardized once at the app level.</p>
          </div>
        </div>
      </Card>

      <Alert tone="info">
        Project release pages should stay focused on the current sermon package and publish actions. These app-level
        pages are for shared channel setup and policy.
      </Alert>
    </div>
  );
}

