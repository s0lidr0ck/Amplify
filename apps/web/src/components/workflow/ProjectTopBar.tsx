"use client";

import { ProjectWorkflowNav } from "./ProjectWorkflowNav";

/**
 * The stable header for a project: what you are working on, and where in the
 * pipeline you are.
 *
 * The blueprint asks for two things this delivers. "Make the active object
 * obvious" — the sermon's title, date and speaker sit at the top of the
 * canvas rather than in a card down the left rail, where they scrolled away
 * with everything else. And "keep the shell stable; change the canvas" — this
 * strip does not move between stages, so the only thing that changes as you
 * work is the panel beneath it.
 *
 * The rail below the title is the one place rose appears in the chrome. It
 * marks the stage you are on, which is the single question this header is
 * answering.
 */

function formatSermonDate(value: string | null | undefined): string | null {
  if (!value) return null;
  // The API sends a plain date (YYYY-MM-DD). Parsing that with `new Date()`
  // treats it as UTC midnight and can render the day before for anyone west
  // of Greenwich — which is everyone using this.
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
}

export function ProjectTopBar({
  projectId,
  title,
  speaker,
  sermonDate,
  status,
}: {
  projectId: string;
  title?: string | null;
  speaker?: string | null;
  sermonDate?: string | null;
  status?: string | null;
}) {
  const date = formatSermonDate(sermonDate);

  return (
    <div className="grid gap-3 border-b border-border pb-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          {title ?? "Untitled sermon"}
        </h1>
        {/* Mono, because it is a fact rather than a phrase — and it lines up
            between projects when you are scanning a list of them. */}
        {date ? <span className="font-mono text-xs text-muted">{date}</span> : null}
        {speaker ? (
          <span className="text-xs text-muted">
            <span className="text-faint">·</span> {speaker}
          </span>
        ) : null}
        {status ? (
          <span className="ml-auto rounded-full bg-surface-strong px-2.5 py-1 text-2xs font-medium uppercase tracking-[0.14em] text-muted">
            {status.replace(/_/g, " ")}
          </span>
        ) : null}
      </div>

      <ProjectWorkflowNav projectId={projectId} />
    </div>
  );
}
