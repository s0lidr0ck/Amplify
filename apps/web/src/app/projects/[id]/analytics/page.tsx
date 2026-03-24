"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { projects } from "@/lib/api";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { StepIntro } from "@/components/workflow/StepIntro";
import {
  AnalyticsContentRow,
  AnalyticsKpiCard,
  AnalyticsProgressRow,
  AnalyticsSparkline,
} from "@/components/analytics/AnalyticsSurface";

const platformRows = [
  {
    label: "YouTube",
    value: "18.4k views",
    percent: 82,
    note: "Long-form reach",
  },
  {
    label: "Facebook",
    value: "11.2k views",
    percent: 55,
    note: "Share-driven reach",
  },
  {
    label: "Instagram",
    value: "6.9k views",
    percent: 37,
    note: "Short-form velocity",
  },
  {
    label: "TikTok",
    value: "9.8k views",
    percent: 61,
    note: "Discovery upside",
  },
];

const contentRows = [
  {
    title: "Sunday reel cut: grace under pressure",
    platform: "Instagram",
    format: "Reel",
    views: "12.4k",
    ctr: "4.8%",
    retention: "72%",
    status: <Badge tone="success">Winning</Badge>,
  },
  {
    title: "Full sermon publish",
    platform: "YouTube",
    format: "Long form",
    views: "8.7k",
    ctr: "7.9%",
    retention: "49%",
    status: <Badge tone="brand">Core</Badge>,
  },
  {
    title: "Facebook caption post",
    platform: "Facebook",
    format: "Text post",
    views: "5.6k",
    ctr: "3.1%",
    retention: "N/A",
    status: <Badge tone="info">Reach</Badge>,
  },
  {
    title: "Blog article publish",
    platform: "Wix",
    format: "Article",
    views: "4.1k",
    ctr: "5.2%",
    retention: "61%",
    status: <Badge tone="neutral">Steady</Badge>,
  },
  {
    title: "Thumbnail-led clip teaser",
    platform: "TikTok",
    format: "Short form",
    views: "9.3k",
    ctr: "6.4%",
    retention: "77%",
    status: <Badge tone="success">Strong</Badge>,
  },
];

const trendValues = [42, 49, 47, 58, 63, 72, 79];
const trendLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function ModeChip({
  label,
  description,
  active = false,
}: {
  label: string;
  description: string;
  active?: boolean;
}) {
  return (
    <div className={active ? "rounded-2xl border border-brand/35 bg-brand/10 px-4 py-3" : "rounded-2xl border border-border/70 bg-surface/70 px-4 py-3"}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className="mt-2 text-sm font-medium text-ink">{description}</p>
    </div>
  );
}

export default function AnalyticsPage() {
  const params = useParams();
  const projectId = params.id as string;

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projects.get(projectId),
  });

  const totalViews = "46.3k";
  const totalReach = "31.8k";
  const uniqueViewers = "18.9k";
  const avgWatchTime = "3m 24s";

  return (
    <div className="space-y-6">
      <StepIntro
        eyebrow="Analytics"
        title={`Measure what is happening across ${project?.title ?? "this project"}.`}
        description="This first pass is organized like an operator workspace instead of isolated reports: overview for the brand pulse, platform lanes for channel comparison, and content tracking for individual assets."
        meta={[
          project?.speaker_display_name ?? project?.speaker ?? "Speaker pending",
          "Placeholder data model",
          "Brand, platform, and content views",
        ]}
        action={
          <Button variant="secondary" size="sm" disabled>
            Reporting pipeline coming next
          </Button>
        }
        supportingPanel={
          <div className="grid gap-3 lg:grid-cols-3">
            <ModeChip label="Overview" description="Brand-level pulse, totals, and model notes." active />
            <ModeChip label="Platforms" description="Channel comparison lanes for future per-platform views." />
            <ModeChip label="Content" description="Asset-by-asset performance and history tracking." />
          </div>
        }
      />

      <Card className="overflow-hidden bg-[linear-gradient(160deg,rgba(255,255,255,0.99),rgba(244,248,249,0.96))]">
        <CardHeader
          eyebrow="Overview Workspace"
          title="Brand pulse and shared context"
          description="This grouped area is the top-level overview lane. It combines the local-layout notice, the brand trend, and the primary KPIs so future overview subviews stay inside one frame."
        />
        <Alert tone="info" title="Analytics are intentionally local for now">
          We are designing the surface before the data pipelines exist. The numbers below are mock values so the layout can prove out the future operating model.
        </Alert>
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <AnalyticsSparkline
            title="Brand momentum"
            subtitle="This view aggregates viewers from all connected platforms into a single brand pulse."
            values={trendValues}
            labels={trendLabels}
          />

          <div className="space-y-6">
            <Card className="bg-[linear-gradient(160deg,rgba(255,255,255,0.98),rgba(241,247,249,0.96))]">
              <CardHeader
                eyebrow="Future model"
                title="Three layers of analytics"
                description="Brand analytics answers overall audience growth, platform analytics compares channels, and content analytics shows which pieces are pulling the most weight."
              />
              <div className="mt-6 space-y-3">
                <div className="rounded-2xl bg-surface p-4">
                  <p className="text-sm font-semibold text-ink">Brand analytics</p>
                  <p className="mt-1 text-sm leading-6 text-muted">Cross-platform aggregation for total viewers, reach, watch time, and engagement.</p>
                </div>
                <div className="rounded-2xl bg-surface p-4">
                  <p className="text-sm font-semibold text-ink">Platform analytics</p>
                  <p className="mt-1 text-sm leading-6 text-muted">One row per channel so the packaging decisions stay specific to the platform.</p>
                </div>
                <div className="rounded-2xl bg-surface p-4">
                  <p className="text-sm font-semibold text-ink">Content analytics</p>
                  <p className="mt-1 text-sm leading-6 text-muted">Every blog, clip, post, and publishable asset gets its own performance trail.</p>
                </div>
              </div>
            </Card>

            <div className="rounded-[1.75rem] border border-border/70 bg-surface/70 p-5">
              <p className="section-label">Overview prompts</p>
              <div className="mt-4 space-y-3 text-sm text-muted">
                <div className="rounded-2xl bg-background-alt px-4 py-3">
                  <p className="font-semibold text-ink">What is the brand total right now?</p>
                  <p className="mt-2 leading-6">The overview layer should collapse every platform into one audience pulse with a clear growth trend.</p>
                </div>
                <div className="rounded-2xl bg-background-alt px-4 py-3">
                  <p className="font-semibold text-ink">Where should operators dig next?</p>
                  <p className="mt-2 leading-6">The grouped overview should hand off cleanly into platform and content subviews instead of acting like a dead-end dashboard.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          <AnalyticsKpiCard
            label="Total viewers"
            value={totalViews}
            delta="+18% week over week"
            note="All platforms combined into one audience count."
          />
          <AnalyticsKpiCard
            label="Total reach"
            value={totalReach}
            delta="+11% week over week"
            note="How far the content traveled across channels."
            gradient="from-accent to-brand"
          />
          <AnalyticsKpiCard
            label="Unique viewers"
            value={uniqueViewers}
            delta="+8% returning audience"
            note="Distinct people reached by the content mix."
            gradient="from-success to-brand"
          />
          <AnalyticsKpiCard
            label="Avg watch time"
            value={avgWatchTime}
            delta="+0:24 improvement"
            note="How long the audience is staying with the content."
            gradient="from-warning to-brand"
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          eyebrow="Platforms Workspace"
          title="Performance lanes by channel"
          description="This grouped section is the future home for platform subviews. It keeps channel comparison and the operational questions side by side so platform analysis feels like one mode."
        />
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <ModeChip label="Overview" description="Cross-platform comparison board" active />
          <ModeChip label="Channel detail" description="Future drill-down for each platform" />
          <ModeChip label="History" description="Trend windows and time-range comparisons" />
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="space-y-3">
            {platformRows.map((row) => (
              <AnalyticsProgressRow
                key={row.label}
                label={row.label}
                value={row.value}
                percent={row.percent}
                note={row.note}
              />
            ))}
          </div>

          <div className="space-y-3 text-sm text-muted">
            <div className="rounded-2xl bg-surface-tint p-4">
              <p className="font-semibold text-ink">Which platform is growing fastest?</p>
              <p className="mt-2 leading-6">Use platform analytics to compare engagement velocity and discover where the audience is expanding.</p>
            </div>
            <div className="rounded-2xl bg-surface-tint p-4">
              <p className="font-semibold text-ink">Where is packaging underperforming?</p>
              <p className="mt-2 leading-6">Platform lanes should expose when a title, thumbnail, or caption strategy works on one channel and misses on another.</p>
            </div>
            <div className="rounded-2xl bg-surface-tint p-4">
              <p className="font-semibold text-ink">What deserves a deeper drill-down?</p>
              <p className="mt-2 leading-6">This section should route operators into future per-channel panels without losing the cross-platform baseline.</p>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          eyebrow="Content Workspace"
          title="Performance by asset"
          description="This grouped area tracks each publishable piece, with room for future overview, asset detail, and history subviews around the content table."
        />
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <ModeChip label="Overview" description="Top-performing assets and format mix" active />
          <ModeChip label="Asset detail" description="Future content-specific diagnostics" />
          <ModeChip label="History" description="Performance trail across re-cuts and republishes" />
        </div>
        <div className="mt-6 overflow-hidden rounded-[1.5rem] border border-border/70 bg-surface">
          <table className="min-w-full divide-y divide-border/70">
            <thead className="bg-surface-strong/60 text-left text-xs uppercase tracking-[0.18em] text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Content</th>
                <th className="px-4 py-3 font-semibold">Views</th>
                <th className="px-4 py-3 font-semibold">CTR</th>
                <th className="px-4 py-3 font-semibold">Retention</th>
                <th className="px-4 py-3 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {contentRows.map((row) => (
                <AnalyticsContentRow key={row.title} {...row} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
