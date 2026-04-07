"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { LinkButton } from "@/components/ui/Button";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function AppShell({
  children,
  title = "Amplify",
  subtitle = "Sermon-to-content studio",
  action,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  const pathname = usePathname();
  const navItems = [
    { href: "/", label: "Home", match: pathname === "/" },
    { href: "/library", label: "Library", match: pathname?.startsWith("/library") },
    { href: "/publishing", label: "Publishing", match: pathname?.startsWith("/publishing") },
    { href: "/settings", label: "Settings", match: pathname?.startsWith("/settings") },
  ];

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background-alt/90 backdrop-blur">
        <div className="page-frame flex min-h-[64px] items-center justify-between gap-3 py-3 sm:min-h-[80px]">
          <Link href="/" className="group flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand text-base font-bold text-white shadow-soft sm:h-12 sm:w-12 sm:text-lg">
              A
            </div>
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-semibold tracking-tight text-ink sm:text-2xl">{title}</p>
              <p className="hidden text-sm text-muted sm:block">{subtitle}</p>
            </div>
          </Link>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Link href="/" className="hidden text-sm font-medium text-muted hover:text-ink sm:inline-flex">
              Home
            </Link>
            <Link href="/library" className="hidden text-sm font-medium text-muted hover:text-ink sm:inline-flex">
              Library
            </Link>
            <Link href="/publishing" className="hidden text-sm font-medium text-muted hover:text-ink sm:inline-flex">
              Publishing
            </Link>
            <Link href="/settings" className="hidden text-sm font-medium text-muted hover:text-ink sm:inline-flex">
              Settings
            </Link>
            <div className="hidden sm:flex">{action ?? <LinkButton href="/projects/new">New Project</LinkButton>}</div>
            <div className="sm:hidden">{action ?? <LinkButton href="/projects/new" size="sm">New</LinkButton>}</div>
          </div>
        </div>
      </header>
      {children}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/80 bg-background-alt/95 px-4 py-3 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={classNames(
                "flex min-w-0 flex-1 justify-center rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition-colors",
                item.match ? "bg-brand-soft text-brand-strong" : "text-muted hover:bg-surface hover:text-ink"
              )}
            >
              {item.label}
            </Link>
          ))}
          <LinkButton href="/projects/new" size="sm" className="shrink-0">
            New
          </LinkButton>
        </div>
      </nav>
    </div>
  );
}
