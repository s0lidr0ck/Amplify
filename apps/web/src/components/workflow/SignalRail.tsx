"use client";

import Link from "next/link";

import type { StageState, StageVerdict } from "@/lib/stageGating";
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
 * Four states, one colour:
 *   done     solid ink        — behind you
 *   now      rose, the signal — the only rose on the screen
 *   ready    outlined         — your choice whether to do it next
 *   blocked  faint            — genuinely cannot start, and says why
 *
 * "blocked" is rare on purpose. Gating lives in lib/stageGating and only
 * covers real dependencies, so most of the middle of a project is "ready" at
 * once rather than queued behind an invented order.
 */

/** Steps that must happen in order, before anything can be derived. */
const TRUNK = ["source", "trim", "transcript"] as const;

/** And the far end, where the outputs come back together. */
const GATHER = ["publishing", "analytics"] as const;

function dotClass(state: StageState): string {
  switch (state) {
    case "done":
      return "bg-ink border-ink";
    case "now":
      // The signal. Nothing else on the page may use this colour.
      return "bg-brand border-brand ring-4 ring-brand/15";
    case "ready":
      return "bg-surface border-border-strong";
    case "blocked":
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
    case "blocked":
      return "text-faint";
  }
}

function StageLink({
  stage,
  verdict,
  projectId,
}: {
  stage: WorkflowStage;
  verdict: StageVerdict;
  projectId: string;
}) {
  const state = verdict.state;
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

  // A blocked step is not a broken link, it is one whose inputs do not exist
  // yet. Rendered as a span rather than an anchor so it stays out of the tab
  // order — keyboard users are not walked through dead stops — and the title
  // says what is actually missing instead of "not available".
  if (state === "blocked") {
    return (
      <span
        className={`${shared} cursor-default`}
        title={verdict.reason ? `${stage.label} — ${verdict.reason}` : stage.label}
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

const UNKNOWN: StageVerdict = { state: "blocked", reason: "Not available yet" };

export function SignalRail({
  projectId,
  stageStatus,
}: {
  projectId: string;
  stageStatus: Record<string, StageVerdict>;
}) {
  const inTrunk = (h: string) => (TRUNK as readonly string[]).includes(h);
  const inGather = (h: string) => (GATHER as readonly string[]).includes(h);

  const trunk = workflowStages.filter((s) => inTrunk(s.href));
  const fan = workflowStages.filter((s) => !inTrunk(s.href) && !inGather(s.href));
  // Ordered by GATHER rather than by the stage list, so publish always
  // precedes results however the list is later rearranged.
  const gather = (GATHER as readonly string[])
    .map((h) => workflowStages.find((s) => s.href === h))
    .filter((s): s is WorkflowStage => Boolean(s));

  return (
    <nav aria-label="Project workflow" className="w-full overflow-x-auto">
      <div className="flex min-w-max items-start gap-1 py-1">
        {/* The trunk: strictly ordered, drawn as one continuous run. */}
        <ol className="flex items-center gap-1">
          {trunk.map((stage, i) => (
            <li key={stage.href} className="flex items-center">
              <StageLink
                stage={stage}
                verdict={stageStatus[stage.href] ?? UNKNOWN}
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
                verdict={stageStatus[stage.href] ?? UNKNOWN}
                projectId={projectId}
              />
            </li>
          ))}
        </ol>

        {/* The gather. Separated because these are not more siblings: they
            consume whatever the fan produced, and publish is the one place
            where waiting is real again. */}
        <div aria-hidden className="flex items-center self-stretch px-1">
          <span className="h-px w-3 bg-border" />
          <span className="size-1.5 rounded-full bg-border-strong" />
        </div>

        <ol className="flex items-center gap-1">
          {gather.map((stage, i) => (
            <li key={stage.href} className="flex items-center">
              <StageLink
                stage={stage}
                verdict={stageStatus[stage.href] ?? UNKNOWN}
                projectId={projectId}
              />
              {i < gather.length - 1 && (
                <span aria-hidden className="h-px w-4 bg-border" />
              )}
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}
