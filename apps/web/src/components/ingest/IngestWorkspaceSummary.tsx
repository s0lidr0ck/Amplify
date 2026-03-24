import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

type IngestStep = "source" | "trim" | "transcript";

export function IngestWorkspaceSummary({
  projectId,
  sourceReady,
  sermonReady,
  transcriptApproved,
  currentStep,
}: {
  projectId: string;
  sourceReady: boolean;
  sermonReady: boolean;
  transcriptApproved: boolean;
  currentStep?: IngestStep;
}) {
  const steps = [
    {
      id: "source" as const,
      label: "Source Intake",
      href: `/projects/${projectId}/source`,
      description: "Upload or replace the raw sermon file.",
      status: sourceReady ? "Ready" : "Needed",
      tone: sourceReady ? ("success" as const) : ("warning" as const),
    },
    {
      id: "trim" as const,
      label: "Sermon Master",
      href: `/projects/${projectId}/trim`,
      description: "Set the sermon boundaries and generate the clean master.",
      status: sermonReady ? "Ready" : sourceReady ? "Next" : "Blocked",
      tone: sermonReady ? ("success" as const) : sourceReady ? ("brand" as const) : ("warning" as const),
    },
    {
      id: "transcript" as const,
      label: "Transcript Review",
      href: `/projects/${projectId}/transcript`,
      description: "Generate the text layer and confirm it is usable downstream.",
      status: transcriptApproved ? "Approved" : sermonReady ? "Next" : "Blocked",
      tone: transcriptApproved ? ("success" as const) : sermonReady ? ("brand" as const) : ("warning" as const),
    },
  ];

  const nextStep =
    steps.find((step) => {
      if (step.id === "source") return !sourceReady;
      if (step.id === "trim") return !sermonReady;
      return !transcriptApproved;
    }) ?? null;

  return (
    <Card>
      <CardHeader
        eyebrow="Ingest Workspace"
        title="Keep source, master, and transcript in one loop."
        description="This workspace is the handoff layer for raw media, sermon prep, and transcript readiness."
      />

      <div className="mt-6 grid gap-3">
        {steps.map((step) => {
          const isCurrent = currentStep === step.id;

          return (
            <Link
              key={step.id}
              href={step.href}
              className={classNames(
                "block rounded-[1.5rem] border px-4 py-4 transition hover:border-brand/40 hover:bg-brand-soft/40",
                isCurrent ? "border-brand/40 bg-brand-soft/70" : "border-border/80 bg-surface"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-ink">{step.label}</p>
                    {isCurrent ? <Badge tone="brand">Current</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted">{step.description}</p>
                </div>
                <Badge tone={step.tone}>{step.status}</Badge>
              </div>
            </Link>
          );
        })}
      </div>

      {nextStep ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] bg-background-alt px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Next handoff</p>
            <p className="mt-1 text-sm font-medium text-ink">{nextStep.label}</p>
          </div>
          <LinkButton href={nextStep.href} variant="secondary">
            Open {nextStep.label}
          </LinkButton>
        </div>
      ) : null}
    </Card>
  );
}
