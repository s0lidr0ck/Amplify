import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type ModeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

type ModeLink = {
  label: string;
  detail: string;
  href: string;
  state: string;
  tone?: ModeTone;
  ctaLabel?: string;
};

export function GenerateModePanel({
  eyebrow,
  title,
  description,
  summary,
  links,
}: {
  eyebrow: string;
  title: string;
  description: string;
  summary?: string;
  links: ModeLink[];
}) {
  return (
    <Card className="overflow-hidden border border-border/80 bg-[linear-gradient(145deg,rgba(255,250,245,0.98),rgba(255,255,255,0.98))] p-0">
      <div className="border-b border-border/70 px-5 py-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="section-label">{eyebrow}</p>
            <h3 className="mt-2 text-xl font-semibold text-ink">{title}</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{description}</p>
          </div>
          {summary ? (
            <div className="rounded-[1rem] bg-surface px-4 py-3 text-sm text-muted lg:max-w-sm">{summary}</div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-px bg-border/70 lg:grid-cols-3">
        {links.map((link) => (
          <div key={link.href} className="flex h-full flex-col gap-4 bg-white px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-base font-semibold text-ink">{link.label}</p>
              <Badge tone={link.tone ?? "neutral"}>{link.state}</Badge>
            </div>
            <p className="min-h-[3.5rem] text-sm leading-6 text-muted">{link.detail}</p>
            <div className="mt-auto">
              <LinkButton href={link.href} variant="secondary" size="sm">
                {link.ctaLabel ?? `Open ${link.label}`}
              </LinkButton>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
