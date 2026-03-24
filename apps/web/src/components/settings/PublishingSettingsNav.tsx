"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

const items = [
  { href: "/settings/publishing", label: "Overview" },
  { href: "/settings/publishing/accounts", label: "Accounts" },
  { href: "/settings/publishing/destinations", label: "Destinations" },
  { href: "/settings/publishing/defaults", label: "Defaults" },
] as const;

export function PublishingSettingsNav() {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-3 rounded-[1.75rem] border border-border/70 bg-surface/85 p-3">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={classNames(
              "inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition",
              active
                ? "bg-brand text-white shadow-soft"
                : "border border-border bg-surface text-muted hover:border-brand/40 hover:text-ink"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
