"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { GlobalRail, type GlobalRailChildItem, type ShellTone } from "@/components/shell";
import { LinkButton } from "@/components/ui/Button";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function railIcon(label: string) {
  return label.slice(0, 2).toUpperCase();
}

function shellSectionLabel(pathname: string | null) {
  if (!pathname || pathname === "/") return "Studio Home";
  if (pathname.startsWith("/projects/")) return "Project Workspace";
  if (pathname.startsWith("/library")) return "Library";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/projects")) return "Projects";
  return "Amplify";
}

export function AppShell({
  children,
  action,
  topBar,
  workspaceTabs,
  projectRailItems,
  railContext,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  topBar?: ReactNode;
  workspaceTabs?: ReactNode;
  projectRailItems?: GlobalRailChildItem[];
  railContext?: ReactNode;
}) {
  const pathname = usePathname();
  const showRailFooter = !(pathname?.startsWith("/projects/") ?? false);

  const navItems = [
    {
      href: "/",
      label: "Home",
      description: "Queue, recent changes, and recommended next actions.",
      active: pathname === "/",
    },
    {
      href: "/projects",
      label: "Projects",
      description: "Open active workspaces and resume production quickly.",
      active: pathname?.startsWith("/projects") ?? false,
      children: pathname?.startsWith("/projects") ? projectRailItems : undefined,
    },
    {
      href: "#",
      label: "Calendar",
      description: "Publish planning and release windows.",
      badge: "Soon",
      disabled: true,
      active: false,
    },
    {
      href: "#",
      label: "Publish Queue",
      description: "Release-ready packages and destination health.",
      badge: "Soon",
      disabled: true,
      active: false,
    },
    {
      href: "#",
      label: "Analytics",
      description: "Cross-project performance and reporting.",
      badge: "Soon",
      disabled: true,
      active: false,
    },
    {
      href: "/library",
      label: "Library",
      description: "Search archived sermons, assets, and generated outputs.",
      active: pathname?.startsWith("/library") ?? false,
    },
    {
      href: "/settings",
      label: "Settings",
      description: "Studio defaults, prompts, and speaker configuration.",
      active: pathname?.startsWith("/settings") ?? false,
    },
  ].map((item) => ({
    ...item,
    icon: railIcon(item.label),
  }));

  const mobileItems = navItems.filter((item) => !item.disabled && ["Home", "Projects", "Library", "Settings"].includes(item.label));

  return (
    <div className="min-h-screen bg-background">
      <div className="grid min-h-screen xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="hidden xl:block">
          <GlobalRail
            brand="Amplify"
            tagline="Content operations for sermon ingest, generation, publishing, and analytics."
            items={navItems}
            status={<span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand-strong">Operator</span>}
            action={<LinkButton href="/projects/new" className="w-full">Create Project</LinkButton>}
            context={railContext}
            showBrandCard={false}
            footer={
              showRailFooter ? (
              <div className="rounded-[1.5rem] border border-border/80 bg-surface px-4 py-4">
                <p className="section-label">Current Context</p>
                <p className="mt-2 text-sm font-semibold text-ink">{shellSectionLabel(pathname)}</p>
                <p className="mt-2 text-sm leading-6 text-muted">
                  The shell is now persistent so the workspace can expand without turning into a scrolling maze.
                </p>
              </div>
              ) : null
            }
          />
        </div>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 border-b border-border/80 bg-background-alt/92 backdrop-blur">
            <div className="page-frame flex min-h-[68px] items-center justify-end gap-4 py-3">
              <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                <div className="hidden sm:flex">{action ?? <LinkButton href="/projects/new">Create Project</LinkButton>}</div>
                <div className="sm:hidden">{action ?? <LinkButton href="/projects/new" size="sm">New</LinkButton>}</div>
              </div>
            </div>
          </header>

          {topBar ? <div className="page-frame pt-5">{topBar}</div> : null}
          {workspaceTabs ? <div className={classNames("page-frame", topBar ? "pt-4" : "pt-5")}>{workspaceTabs}</div> : null}

          <div className={workspaceTabs || topBar ? "pt-0" : ""}>{children}</div>
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/80 bg-background-alt/95 px-4 py-3 backdrop-blur xl:hidden">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-2">
          {mobileItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={classNames(
                "flex min-w-0 flex-1 flex-col items-center justify-center rounded-[1.15rem] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors",
                item.active ? "bg-brand-soft text-brand-strong" : "text-muted hover:bg-surface hover:text-ink"
              )}
            >
              <span className="text-xs">{item.icon}</span>
              <span className="mt-1 truncate">{item.label}</span>
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
