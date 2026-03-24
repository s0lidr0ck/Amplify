import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { PublishingSettingsNav } from "@/components/settings/PublishingSettingsNav";

export default function PublishingSettingsLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <main className="page-frame py-8 lg:py-10">
        <div className="page-stack">
          <PageHeader
            eyebrow="Settings"
            title="Publishing settings"
            description="Manage app-level connections, defaults, and destination rules outside the project release desk."
          />
          <PublishingSettingsNav />
          {children}
        </div>
      </main>
    </AppShell>
  );
}
