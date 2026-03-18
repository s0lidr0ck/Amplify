import Link from "next/link";
import type { ReactNode } from "react";
import { LinkButton } from "@/components/ui/Button";

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
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background-alt/90 backdrop-blur">
        <div className="page-frame flex min-h-[80px] items-center justify-between gap-4">
          <Link href="/" className="group flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-lg font-bold text-white shadow-soft">
              A
            </div>
            <div>
              <p className="font-display text-2xl font-semibold tracking-tight text-ink">{title}</p>
              <p className="text-sm text-muted">{subtitle}</p>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/" className="hidden text-sm font-medium text-muted hover:text-ink sm:inline-flex">
              Dashboard
            </Link>
            {action ?? <LinkButton href="/projects/new">New Project</LinkButton>}
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
