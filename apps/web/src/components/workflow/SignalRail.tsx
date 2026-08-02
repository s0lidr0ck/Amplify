"use client";

import Link from "next/link";

import { workflowStages, type WorkflowStage } from "@/lib/workflow";

/**
 * The signal rail — Amplify's signature.
 *
 * One sermon enters, is refined in sequence, then fans out into everything
 * derived from it. That shape is the workflow, so the navigation draws it
 * rather than listing it: a straight run for the steps that must happen in
 * order, and a fan for the outputs that do not.
 *
 * This is deliberately NOT the mark. The mark says what the product does —
 * the same message, louder — and this says what today's work looks like.
 * An earlier version made them the same shape, which sounded tidy and meant
 * the logo had to carry a project-management diagram.
 *
 * Why the fan is real and not decoration: the ordered steps genuinely block
 * each other — you cannot transcribe before you trim — while clips, the reel,
 * the blog and the posts are siblings that can be worked in any order. A flat
 * list of twelve tabs said those two facts were the same thing. They are not,
 * and the operator plans their afternoon around the difference.
 *
 * Three states, no colour spent on decoration:
 *   done    solid ink        — behind you
 *   now     rose, the signal — the only rose on the screen
 *   ready   outlined         — reachable
 *   locked  faint            — something upstream is missing
 */

export type StageState = "done" | "now" | "ready" | "locked";

/** Steps that must happen in order, before anything can be derived. */
const TRUNK = ["source", "trim", "transcript"] as const;

function dotClass(state: StageState): string {
  switch (state) {
    case "done":
      return "bg-ink border-ink";
    case "now":
      // The signal. Nothing else on the page may use this colour.
      return "bg-brand border-brand ring-4 ring-brand/15";
    case "ready":
      return "bg-surface border-border-strong";
    case "locked":
      return "bg-surface border-border";
  }
}

function labelClass(state: StageState): string {
  switch (state) {
    case "done":
      return "text-ink";
    case "now":
      return "text-ink font-semibold";
    case "ready":
      return "text-ink/75";
    case "locked":
      return "text-muted/60";
  }
}

function StageLink({
  stage,
  state,
  projectId,
}: {
  stage: WorkflowStage;
  state: StageState;
  projectId: string;
}) {
  const content = (
    <>
      <span
        aria-hidden
        className={`size-2.5 shrink-0 rounded-full border-2 transition-colors ${dotClass(state)}`}
      />
      <span className={`whitespace-nowrap text-xs ${labelClass(state)}`}>
        {stage.shortLabel}
      </span>
    </>
  );

  const shared = "flex items-center gap-2 rounded-full px-2.5 py-1.5 transition-colors";

  // A locked step is not a broken link, it is a step whose turn has not come.
  // Rendering it as a disabled span rather than an anchor keeps it out of the
  // tab order, so keyboard users are not walked through six dead stops.
  if (state === "locked") {
    return (
      <span
        className={`${shared} cursor-default`}
        title={`${stage.label} — finish the steps before it first`}
      >
        {content}
      </span>
    );
  }

  return (
    <Link
      href={`/projects/${projectId}/${stage.href}`}
      className={`${shared} hover:bg-surface-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`}
      aria-current={state === "now" ? "step" : undefined}
    >
      {content}
    </Link>
  );
}

export function SignalRail({
  projectId,
  stageStatus,
}: {
  projectId: string;
  stageStatus: Record<string, StageState>;
}) {
  const trunk = workflowStages.filter((s) => (TRUNK as readonly string[]).includes(s.href));
  const fan = workflowStages.filter((s) => !(TRUNK as readonly string[]).includes(s.href));

  return (
    <nav aria-label="Project workflow" className="w-full overflow-x-auto">
      <div className="flex min-w-max items-start gap-1 py-1">
        {/* The trunk: strictly ordered, drawn as one continuous run. */}
        <ol className="flex items-center gap-1">
          {trunk.map((stage, i) => (
            <li key={stage.href} className="flex items-center">
              <StageLink
                stage={stage}
                state={stageStatus[stage.href] ?? "locked"}
                projectId={projectId}
              />
              {i < trunk.length - 1 && (
                <span aria-hidden className="h-px w-4 bg-border" />
              )}
            </li>
          ))}
        </ol>

        {/* The split, and the fan. Drawn in CSS rather than an SVG so it
            reflows with the labels instead of needing measured coordinates. */}
        <div aria-hidden className="flex items-center self-stretch pl-1 pr-2">
          <span className="size-1.5 rounded-full bg-border-strong" />
          <span className="h-px w-3 bg-border" />
        </div>

        <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 border-l border-border pl-3">
          {fan.map((stage) => (
            <li key={stage.href}>
              <StageLink
                stage={stage}
                state={stageStatus[stage.href] ?? "locked"}
                projectId={projectId}
              />
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}
