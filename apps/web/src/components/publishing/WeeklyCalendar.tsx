"use client";

import { BundleCard } from "@/components/publishing/BundleCard";
import { Button } from "@/components/ui/Button";
import type { PublishBundle } from "@/lib/api";

// ── Date helpers ──────────────────────────────────────────────────────────────

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDays(isoDate: string): string[] {
  const monday = getMonday(new Date(isoDate));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function formatDayHeader(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatWeekRange(days: string[]): string {
  const first = days[0];
  const last = days[6];
  const [fy, fm, fd] = first.split("-").map(Number);
  const [_ly, lm, ld] = last.split("-").map(Number);
  const firstDate = new Date(fy, fm - 1, fd);
  const lastDate = new Date(fy, lm - 1, ld);
  const firstStr = firstDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const lastStr = lastDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${firstStr} – ${lastStr}`;
}

function addWeeks(isoDate: string, weeks: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ── Component ─────────────────────────────────────────────────────────────────

interface WeeklyCalendarProps {
  weekDate: string;
  bundles: PublishBundle[];
  onBundleClick?: (bundle: PublishBundle) => void;
  onWeekChange?: (newWeekDate: string) => void;
}

export function WeeklyCalendar({
  weekDate,
  bundles,
  onBundleClick,
  onWeekChange,
}: WeeklyCalendarProps) {
  const days = getWeekDays(weekDate);
  const weekRange = formatWeekRange(days);

  // Group bundles by their week_date
  const byDay: Record<string, PublishBundle[]> = {};
  for (const day of days) {
    byDay[day] = [];
  }
  for (const bundle of bundles) {
    if (byDay[bundle.week_date]) {
      byDay[bundle.week_date].push(bundle);
    }
  }

  function handlePrev() {
    onWeekChange?.(addWeeks(weekDate, -1));
  }
  function handleNext() {
    onWeekChange?.(addWeeks(weekDate, 1));
  }

  return (
    <div>
      {/* Week navigation */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <Button variant="secondary" size="sm" onClick={handlePrev}>
          ← Prev
        </Button>
        <span className="text-sm font-semibold text-ink">{weekRange}</span>
        <Button variant="secondary" size="sm" onClick={handleNext}>
          Next →
        </Button>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {days.map((day, index) => (
          <div key={day} className="flex flex-col gap-3">
            {/* Day header */}
            <div className="rounded-2xl border border-border/60 bg-surface-tint px-3 py-2 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                {DAY_LABELS[index]}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-ink">{formatDayHeader(day)}</p>
            </div>

            {/* Bundles for this day */}
            <div className="flex flex-col gap-2">
              {byDay[day].map((bundle) => (
                <BundleCard
                  key={bundle.id}
                  bundle={bundle}
                  onClick={() => onBundleClick?.(bundle)}
                />
              ))}

              {byDay[day].length === 0 && (
                <div className="rounded-[1.5rem] border border-dashed border-border/60 px-3 py-4 text-center">
                  <span className="text-xs text-muted/60">—</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
