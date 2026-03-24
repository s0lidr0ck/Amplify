import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { classNames } from "./utils";
import type { WorkspaceTabItem } from "./types";

export function WorkspaceTabs({
  items,
  ariaLabel = "Workspace tabs",
  className,
}: {
  items: WorkspaceTabItem[];
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className={classNames(
        "surface-card flex items-center gap-2 overflow-x-auto p-3 shadow-card",
        className
      )}
    >
      {items.map((item) => {
        const content = (
          <>
            <span className="truncate text-sm font-semibold">{item.label}</span>
            {item.badge ? <Badge tone={item.active ? "brand" : "neutral"}>{item.badge}</Badge> : null}
          </>
        );

        const baseClasses = classNames(
          "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 transition-all duration-200",
          item.active
            ? "border-brand/35 bg-brand-soft text-brand-strong shadow-soft"
            : "border-border/80 bg-surface text-muted hover:border-brand/30 hover:bg-surface-strong hover:text-ink",
          item.disabled ? "pointer-events-none opacity-50" : ""
        );

        return item.disabled ? (
          <div key={item.href} className={baseClasses}>
            {content}
          </div>
        ) : (
          <Link key={item.href} href={item.href} aria-current={item.active ? "page" : undefined} className={baseClasses}>
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
