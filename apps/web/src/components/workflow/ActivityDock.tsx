import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";

export function ActivityDock({
  eyebrow = "Activity",
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <aside className="space-y-4 2xl:sticky 2xl:top-24 2xl:self-start">
      <Card className="p-5">
        <p className="section-label">{eyebrow}</p>
        <h3 className="mt-2 text-xl font-semibold text-ink">{title}</h3>
        {description ? <p className="mt-2 text-sm leading-6 text-muted">{description}</p> : null}
      </Card>
      <div className="space-y-4">{children}</div>
    </aside>
  );
}
