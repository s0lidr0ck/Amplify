"use client";

import { useQuery } from "@tanstack/react-query";
import { publishing } from "@/lib/api";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";

type SummaryMode = "compact" | "full";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function StatusPill({ configured }: { configured: boolean }) {
  return <Badge tone={configured ? "success" : "warning"}>{configured ? "Connected" : "Needs setup"}</Badge>;
}

function ConfigLine({
  label,
  configured,
  detail,
}: {
  label: string;
  configured: boolean;
  detail: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl bg-surface/80 px-4 py-4 text-sm">
      <div className="min-w-0">
        <p className="font-medium text-ink">{label}</p>
        <p className="mt-1 text-xs leading-5 text-muted">{detail}</p>
      </div>
      <StatusPill configured={configured} />
    </div>
  );
}

export function PublishingConnectionsSummary({ mode = "full" }: { mode?: SummaryMode }) {
  const { data: channels = [], isLoading, isError, error } = useQuery({
    queryKey: ["publishing-settings-channels"],
    queryFn: () => publishing.getChannels(),
  });

  const { data: wixConfig } = useQuery({
    queryKey: ["publishing-settings-wix"],
    queryFn: () => publishing.getWixConfig(),
  });

  const { data: youtubeConfig } = useQuery({
    queryKey: ["publishing-settings-youtube"],
    queryFn: () => publishing.getYoutubeConfig(),
  });

  const { data: tiktokConfig } = useQuery({
    queryKey: ["publishing-settings-tiktok"],
    queryFn: () => publishing.getTikTokConfig(),
  });

  const channelsById = new Map(channels.map((channel) => [channel.id, channel]));
  const connectedCount = channels.filter((channel) => channel.configured).length;

  return (
    <Card>
      <CardHeader
        eyebrow="Publishing"
        title="App-level account and destination control"
        description="This is the shared place for connected accounts, publish defaults, and where each platform pulls from."
      />
      <div className="mt-6 space-y-4">
        {isLoading ? <Alert tone="info">Loading publishing status.</Alert> : null}
        {isError ? (
          <Alert tone="danger">{error instanceof Error ? error.message : "Unable to load publishing status."}</Alert>
        ) : null}

        <div className={classNames("grid gap-4", mode === "compact" ? "lg:grid-cols-2" : "xl:grid-cols-5")}>
          {channels.map((channel) => (
            <div key={channel.id} className="rounded-[1.5rem] border border-border/70 bg-surface/85 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="section-label">{channel.label}</p>
                  <p className="mt-2 text-lg font-semibold text-ink">{channel.kind}</p>
                </div>
                <StatusPill configured={channel.configured} />
              </div>
              <p className="mt-3 text-sm leading-6 text-muted">{channel.summary}</p>
            </div>
          ))}
        </div>

        {mode === "full" ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="grid gap-3 rounded-[1.5rem] border border-border/70 bg-background-alt p-5">
              <ConfigLine
                label="Wix"
                configured={Boolean(wixConfig?.configured)}
                detail="Long-form release and CMS publishing remain connected at the app level."
              />
              <ConfigLine
                label="YouTube"
                configured={Boolean(youtubeConfig?.publish_configured)}
                detail="Sermon and short uploads are controlled by the app OAuth connection."
              />
              <ConfigLine
                label="Facebook"
                configured={Boolean(channelsById.get("facebook")?.configured)}
                detail="Page access and access token are shared across projects."
              />
              <ConfigLine
                label="Instagram"
                configured={Boolean(channelsById.get("instagram")?.configured)}
                detail="Business account publishing uses the app token and linked account."
              />
              <ConfigLine
                label="TikTok"
                configured={Boolean(tiktokConfig?.publish_configured)}
                detail="Creator auth and direct-post credentials are app-level."
              />
            </div>

            <div className="rounded-[1.5rem] border border-border/70 bg-surface/85 p-5">
              <p className="section-label">Quick read</p>
              <div className="mt-4 grid gap-3">
                <div className="rounded-2xl bg-surface px-4 py-4">
                  <p className="text-sm font-medium text-ink">Connected channels</p>
                  <p className="mt-2 text-sm text-muted">
                    {connectedCount} of {channels.length} ready
                  </p>
                </div>
                <div className="rounded-2xl bg-surface px-4 py-4">
                  <p className="text-sm font-medium text-ink">Project release lives elsewhere</p>
                  <p className="mt-2 text-sm text-muted">Release pages stay focused on per-project content and publish actions.</p>
                </div>
                <div className="rounded-2xl bg-surface px-4 py-4">
                  <p className="text-sm font-medium text-ink">Defaults belong here</p>
                  <p className="mt-2 text-sm text-muted">Privacy rules, default destinations, and connection status are app-wide concerns.</p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
