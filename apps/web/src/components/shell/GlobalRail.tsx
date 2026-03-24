import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { classNames } from "./utils";
import type { GlobalRailChildItem, GlobalRailItem } from "./types";

function toneDotClass(tone?: GlobalRailChildItem["tone"]) {
  switch (tone) {
    case "brand":
      return "bg-brand";
    case "success":
      return "bg-success";
    case "warning":
      return "bg-warning";
    case "danger":
      return "bg-danger";
    case "info":
      return "bg-info";
    default:
      return "bg-muted/45";
  }
}

function RailTree({
  items,
  depth = 0,
}: {
  items: GlobalRailChildItem[];
  depth?: number;
}) {
  return (
    <div className={classNames("space-y-1.5", depth > 0 ? "mt-2 border-l border-border/70 pl-3" : "")}>
      {items.map((item) => {
        const isGroupLabel = !item.href && Boolean(item.children?.length);
        const content = (
          <>
            {isGroupLabel ? null : <span className={classNames("h-2 w-2 shrink-0 rounded-full", toneDotClass(item.tone))} />}
            <span className={classNames("truncate", isGroupLabel ? "uppercase tracking-[0.18em]" : "")}>{item.label}</span>
            {item.badge ? <Badge tone={item.tone ?? (item.active ? "brand" : "neutral")}>{item.badge}</Badge> : null}
          </>
        );

        const itemClasses = classNames(
          "flex items-center gap-2 rounded-[0.95rem] px-3 py-2 text-xs font-semibold transition-all duration-200",
          isGroupLabel
            ? "cursor-default px-1 py-1 text-[11px] text-muted"
            : item.active
            ? "bg-white text-ink shadow-soft ring-1 ring-brand/20"
            : "text-muted hover:bg-white/70 hover:text-ink"
        );

        return (
          <div key={`${depth}-${item.label}`} className="space-y-1.5">
            {item.href ? (
              <Link href={item.href} className={itemClasses}>
                {content}
              </Link>
            ) : (
              <div className={classNames(itemClasses, "cursor-default")}>{content}</div>
            )}
            {item.children?.length ? <RailTree items={item.children} depth={depth + 1} /> : null}
          </div>
        );
      })}
    </div>
  );
}

export function GlobalRail({
  brand = "Amplify",
  tagline = "Persistent content operations",
  items,
  status,
  action,
  context,
  footer,
  className,
  showBrandCard = true,
}: {
  brand?: string;
  tagline?: string;
  items: GlobalRailItem[];
  status?: ReactNode;
  action?: ReactNode;
  context?: ReactNode;
  footer?: ReactNode;
  className?: string;
  showBrandCard?: boolean;
}) {
  return (
    <aside
      className={classNames(
        "flex min-h-full w-full flex-col border-r border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,245,239,0.92))] px-3 py-4 shadow-[12px_0_40px_-28px_rgba(15,23,42,0.25)]",
        className
      )}
    >
      {showBrandCard ? (
        <div className="rounded-[1.5rem] border border-border/80 bg-surface px-4 py-4 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="section-label">Command Center</p>
              <h1 className="mt-2 truncate font-display text-2xl font-semibold tracking-tight text-ink">{brand}</h1>
              <p className="mt-2 text-sm leading-6 text-muted">{tagline}</p>
            </div>
            {status ? <div className="shrink-0">{status}</div> : null}
          </div>
          {action ? <div className="mt-4">{action}</div> : null}
        </div>
      ) : null}

      {context ? <div className="mt-4">{context}</div> : null}

      <nav className="mt-4 flex-1 space-y-2" aria-label="Global navigation">
        {items.map((item) =>
          item.disabled ? (
            <div
              key={item.label}
              aria-disabled="true"
              className="flex cursor-not-allowed items-start gap-3 rounded-[1.25rem] border border-transparent px-3 py-3 opacity-55"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-border/80 bg-surface text-sm font-semibold text-muted">
                {item.icon ?? item.label.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-ink">{item.label}</span>
                  {item.badge ? <Badge tone="neutral">{item.badge}</Badge> : null}
                </span>
                {item.description ? <span className="mt-1 block text-xs leading-5 text-muted">{item.description}</span> : null}
              </span>
            </div>
          ) : (
            <div
              key={item.href}
              className={classNames(
                "rounded-[1.25rem] border px-3 py-3 transition-all duration-200",
                item.active ? "border-brand/35 bg-brand-soft shadow-soft" : "border-transparent bg-transparent hover:border-border/80 hover:bg-surface"
              )}
            >
              <Link href={item.href} aria-current={item.active ? "page" : undefined} className="group flex items-start gap-3">
                <span
                  className={classNames(
                    "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border text-sm font-semibold transition-colors",
                    item.active
                      ? "border-brand/20 bg-brand text-white"
                      : "border-border/80 bg-surface text-muted group-hover:border-brand/30 group-hover:text-brand-strong"
                  )}
                >
                  {item.icon ?? item.label.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-ink">{item.label}</span>
                    {item.badge ? <Badge tone={item.active ? "brand" : "neutral"}>{item.badge}</Badge> : null}
                  </span>
                  {item.description ? <span className="mt-1 block text-xs leading-5 text-muted">{item.description}</span> : null}
                </span>
              </Link>
              {item.children?.length && item.active ? <div className="mt-3"><RailTree items={item.children} /></div> : null}
            </div>
          )
        )}
      </nav>

      {footer ? <div className="mt-4">{footer}</div> : null}
    </aside>
  );
}
