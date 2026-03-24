import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";

const lanes = [
  {
    label: "YouTube Sermon",
    asset: "Sermon master video",
    extras: "Generated sermon thumbnail, title, description, and tags flow into this lane by default.",
  },
  {
    label: "YouTube Short",
    asset: "Final reel video",
    extras: "Uses the reel package title, description, tags, and reel thumbnail unless a future override is introduced.",
  },
  {
    label: "Facebook Text Post",
    asset: "Generated Facebook copy",
    extras: "Publishes from the connected Page using the text-post draft rather than a custom per-project mapping.",
  },
  {
    label: "Facebook Reel",
    asset: "Final reel video",
    extras: "Uses the final reel export and Facebook reel description as the shared default mapping.",
  },
  {
    label: "Instagram Image Post",
    asset: "Generated thumbnail image",
    extras: "Defaults to a generated thumbnail plus the Instagram caption lane from the reel package.",
  },
  {
    label: "Instagram Reel",
    asset: "Final reel video",
    extras: "Uses the reel export, Instagram caption, and reel cover image as the shared publish bundle.",
  },
  {
    label: "TikTok Photo Post",
    asset: "Generated thumbnail image",
    extras: "Carries the TikTok title and description against the image-first photo-post flow.",
  },
  {
    label: "TikTok Short",
    asset: "Final reel video",
    extras: "Uses the reel export and TikTok short description as the default short-form mapping.",
  },
];

export default function PublishingDestinationsPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          eyebrow="Destinations"
          title="Shared asset mapping by publish lane"
          description="This page defines how generated assets map into each destination lane by default. Project release pages should execute the post, not explain the mapping every time."
        />
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {lanes.map((lane) => (
            <div key={lane.label} className="rounded-[1.5rem] border border-border/70 bg-surface/85 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-ink">{lane.label}</p>
                  <p className="mt-2 text-sm text-muted">Default asset: {lane.asset}</p>
                </div>
                <Badge tone="info">Mapped</Badge>
              </div>
              <p className="mt-4 text-sm leading-6 text-muted">{lane.extras}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader
          eyebrow="Boundary"
          title="What belongs here versus on a project"
          description="The rule is simple: app-level pages define the lane, project-level pages decide whether the current sermon is ready to use it."
        />
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl bg-background-alt px-4 py-4 text-sm">
            <p className="font-medium text-ink">Belongs here</p>
            <p className="mt-2 text-muted">Which asset family each platform uses, how lanes are categorized, and what each default bundle expects.</p>
          </div>
          <div className="rounded-2xl bg-background-alt px-4 py-4 text-sm">
            <p className="font-medium text-ink">Belongs on the project</p>
            <p className="mt-2 text-muted">Whether this sermon has the required clip, thumbnail, copy, schedule, and readiness to actually post today.</p>
          </div>
        </div>
      </Card>

      <Alert tone="info">
        Destination mapping is now documented as app-wide behavior so Release can stay focused on the current manual publish run.
      </Alert>
    </div>
  );
}