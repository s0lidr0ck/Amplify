import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { classNames } from "./utils";
import type { ShellTone, WorkspaceRailSection } from "./types";

const toneClasses: Record<ShellTone, string> = {
  neutral: "bg-surface-strong text-muted",
  brand: "bg-brand-soft text-brand-strong",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

export function WorkspaceRail({
  title,
  description,
  sections,
  footer,
  className,
}: {
  title?: string;
  description?: string;
  sections: WorkspaceRailSection[];
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <aside className={classNames("space-y-4", className)}>
      {title || description ? (
        <div className="surface-card p-4">
          {title ? <p className="section-label">{title}</p> : null}
          {description ? <p className="mt-2 text-sm leading-6 text-muted">{description}</p> : null}
        </div>
      ) : null}

      {sections.map((section) => (
        <section key={section.label} className="surface-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="section-label">{section.label}</p>
              {section.description ? <p className="mt-2 text-sm leading-6 text-muted">{section.description}</p> : null}
            </div>
            {section.action ? <div className="shrink-0">{section.action}</div> : null}
          </div>

          <div className="mt-4 space-y-2">
            {section.items.map((item) => {
              const body = (
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {item.tone ? (
                      <span className={classNames("h-2.5 w-2.5 shrink-0 rounded-full", toneClasses[item.tone])} />
                    ) : null}
                    <span className="truncate text-sm font-semibold text-ink">{item.label}</span>
                    {item.badge ? (
                      <Badge tone={item.tone ?? (item.active ? "brand" : "neutral")}>{item.badge}</Badge>
                    ) : null}
                  </div>
                  {item.description ? <p className="mt-1 text-xs leading-5 text-muted">{item.description}</p> : null}
                </div>
              );

              const itemClasses = classNames(
                "flex items-start gap-3 rounded-[1.25rem] border px-3 py-3 transition-all duration-200",
                item.active
                  ? "border-brand/35 bg-brand-soft shadow-soft"
                  : "border-border/80 bg-surface hover:border-brand/30 hover:bg-surface-strong"
              );

              return item.href ? (
                <Link key={`${section.label}-${item.label}`} href={item.href} className={itemClasses}>
                  {item.icon ? <span className="mt-0.5 shrink-0">{item.icon}</span> : null}
                  {body}
                </Link>
              ) : (
                <div key={`${section.label}-${item.label}`} className={itemClasses}>
                  {item.icon ? <span className="mt-0.5 shrink-0">{item.icon}</span> : null}
                  {body}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {footer ? <div className="surface-card p-4">{footer}</div> : null}
    </aside>
  );
}
