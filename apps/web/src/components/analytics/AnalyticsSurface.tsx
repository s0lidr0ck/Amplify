"use client";

import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function AnalyticsKpiCard({
  label,
  value,
  delta,
  note,
  gradient = "from-brand to-accent",
}: {
  label: string;
  value: string;
  delta: string;
  note: string;
  gradient?: string;
}) {
  return (
    <Card className="overflow-hidden bg-[linear-gradient(160deg,rgba(255,255,255,0.98),rgba(242,247,248,0.96))]">
      <div className={classNames("mb-5 h-1.5 w-24 rounded-full bg-gradient-to-r", gradient)} />
      <p className="section-label">{label}</p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{value}</p>
        <span className="rounded-full bg-success-soft px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-success">
          {delta}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted">{note}</p>
    </Card>
  );
}

export function AnalyticsSparkline({
  values,
  labels,
  title,
  subtitle,
}: {
  values: number[];
  labels: string[];
  title: string;
  subtitle: string;
}) {
  const width = 320;
  const height = 120;
  const paddedWidth = width - 24;
  const paddedHeight = height - 24;
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? paddedWidth / (values.length - 1) : 0;

  const points = values
    .map((value, index) => {
      const x = 12 + index * step;
      const y = 12 + paddedHeight - (value / max) * paddedHeight;
      return `${x},${y}`;
    })
    .join(" ");

  const linePath = values
    .map((value, index) => {
      const x = 12 + index * step;
      const y = 12 + paddedHeight - (value / max) * paddedHeight;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  const areaPath = `${linePath} L ${12 + paddedWidth} ${height - 12} L 12 ${height - 12} Z`;

  return (
    <Card className="bg-[linear-gradient(165deg,rgba(30,41,59,0.98),rgba(17,24,39,0.92))] text-white shadow-[0_24px_70px_-36px_rgba(15,23,42,0.65)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="section-label text-white/55">{title}</p>
          <p className="mt-2 max-w-xl text-sm leading-6 text-white/70">{subtitle}</p>
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
          Live model preview
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
        <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
          <svg viewBox={`0 0 ${width} ${height}`} className="h-32 w-full" role="img" aria-label={title}>
            <defs>
              <linearGradient id="analytics-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,0.4)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#analytics-fill)" />
            <polyline
              points={points}
              fill="none"
              stroke="rgba(255,255,255,0.9)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {values.map((value, index) => {
              const x = 12 + index * step;
              const y = 12 + paddedHeight - (value / max) * paddedHeight;
              return <circle key={`${labels[index] ?? index}`} cx={x} cy={y} r="3.5" fill="rgba(255,255,255,0.95)" />;
            })}
          </svg>
          <div className="mt-2 flex justify-between gap-2 text-xs uppercase tracking-[0.18em] text-white/55">
            {labels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/55">Brand view</p>
            <p className="mt-2 text-2xl font-semibold text-white">All platforms combined</p>
            <p className="mt-2 text-sm leading-6 text-white/70">
              This is the aggregation layer that will pull viewers, watch time, and engagement into one brand pulse.
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/55">Platform layer</p>
            <p className="mt-2 text-2xl font-semibold text-white">YouTube, Facebook, Instagram, TikTok</p>
            <p className="mt-2 text-sm leading-6 text-white/70">
              Each platform keeps its own performance profile so packaging decisions can stay specific instead of averaged out.
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function AnalyticsProgressRow({
  label,
  value,
  percent,
  note,
}: {
  label: string;
  value: string;
  percent: number;
  note: string;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">{label}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted">{note}</p>
        </div>
        <p className="text-sm font-semibold text-ink">{value}</p>
      </div>
      <ProgressBar value={percent} className="mt-4" />
    </div>
  );
}

export function AnalyticsContentRow({
  title,
  platform,
  format,
  views,
  ctr,
  retention,
  status,
}: {
  title: string;
  platform: string;
  format: string;
  views: string;
  ctr: string;
  retention: string;
  status: ReactNode;
}) {
  return (
    <tr className="border-t border-border/70">
      <td className="py-4 pr-4 align-top">
        <p className="font-semibold text-ink">{title}</p>
        <p className="mt-1 text-sm text-muted">
          {platform} - {format}
        </p>
      </td>
      <td className="py-4 px-4 align-top text-sm text-ink">{views}</td>
      <td className="py-4 px-4 align-top text-sm text-ink">{ctr}</td>
      <td className="py-4 px-4 align-top text-sm text-ink">{retention}</td>
      <td className="py-4 pl-4 align-top text-right">{status}</td>
    </tr>
  );
}
