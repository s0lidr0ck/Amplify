import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";

const defaults = [
  {
    label: "Writer identity",
    value: "App default first",
    detail: "Projects should inherit the Wix writer/member identity by default instead of re-entering it on every release.",
  },
  {
    label: "YouTube privacy",
    value: "Private by default",
    detail: "The sermon and short lanes start private so the team can verify uploads before making them public.",
  },
  {
    label: "Release date source",
    value: "Sermon date seeds Calendar",
    detail: "Calendar should inherit the sermon date first, then let the team override it project by project when needed.",
  },
  {
    label: "Short-form posture",
    value: "Conservative first publish",
    detail: "Instagram and TikTok lanes favor cautious, reviewable defaults while the publishing stack matures.",
  },
];

export default function PublishingDefaultsPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          eyebrow="Defaults"
          title="Shared publishing policy"
          description="These are app-level rules and inherited defaults. If a setting should behave the same across projects, it belongs here instead of the project release desk."
        />
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {defaults.map((item) => (
            <div key={item.label} className="rounded-[1.5rem] border border-border/70 bg-surface/85 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-lg font-semibold text-ink">{item.label}</p>
                <Badge tone="brand">{item.value}</Badge>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted">{item.detail}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader
          eyebrow="Inheritance"
          title="What projects should inherit from here"
          description="This is the line we are drawing so Release and Calendar stay focused on the current sermon package."
        />
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl bg-background-alt px-4 py-4 text-sm">
            <p className="font-medium text-ink">Writer / member defaults</p>
            <p className="mt-2 text-muted">Use the connected Wix member as the starting identity for new releases.</p>
          </div>
          <div className="rounded-2xl bg-background-alt px-4 py-4 text-sm">
            <p className="font-medium text-ink">Privacy posture</p>
            <p className="mt-2 text-muted">Set the expected first-publish privacy for video lanes once, then inherit it downstream.</p>
          </div>
          <div className="rounded-2xl bg-background-alt px-4 py-4 text-sm">
            <p className="font-medium text-ink">Scheduling seed rules</p>
            <p className="mt-2 text-muted">Decide which project metadata pre-fills Calendar instead of rebuilding the same logic on every project page.</p>
          </div>
        </div>
      </Card>

      <Alert tone="info">
        This page is intentionally policy-focused. Project pages choose what ships and when; this page defines the shared default behavior those pages inherit.
      </Alert>
    </div>
  );
}