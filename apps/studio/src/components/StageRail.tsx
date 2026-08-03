import { NavLink } from "react-router-dom";

import {
  STAGES,
  type StageReading,
  type StageSlug,
  type StageState,
} from "../lib/stages";

/**
 * The channel strip — and now the way you get around.
 *
 * This drawing was already on the sermon page, describing a shape the page
 * itself ignored: a straight run for the steps that block each other, a fan
 * for the work that does not, and a gather where it all leaves. It was
 * decoration above an eight-job scroll.
 *
 * Making it the navigation costs nothing new to learn — it is the same
 * picture — and it turns the one honest map of the work into the thing you
 * steer by. It also means the sermon's whole state is legible from any room:
 * you can be reading the blog post and still see that the worker is cutting
 * a clip two rooms away, because the dot is moving.
 *
 * Sticky, because the answer to "what still needs doing" should never be
 * more than a glance away, and on a long transcript it otherwise scrolls off
 * within a screenful.
 */

const DOT: Record<StageState, string> = {
  done: "bg-ok",
  running: "bg-brand dot-running",
  attention: "bg-warn",
  failed: "bg-danger",
  waiting: "bg-border-strong",
};

/** The room's own hue, at working strength, for the one you are in. */
const MARK: Record<StageSlug, string> = {
  source: "text-mark-source",
  transcript: "text-mark-transcript",
  writing: "text-mark-writing",
  clips: "text-mark-clips",
  publish: "text-mark-publish",
};

export function StageRail({
  readings,
}: {
  readings: Record<StageSlug, StageReading>;
}) {
  return (
    <nav
      aria-label="This sermon, stage by stage"
      className="rail-band sticky top-0 z-20"
    >
      {/* Scrolls sideways rather than wrapping. Five stages wrapped onto two
          lines on a phone put the gather arm on a row of its own, which read
          as a fault rather than a step — and a rail that changes height as
          you move through it makes the page jump. */}
      <ol className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 py-2.5 sm:gap-2 sm:px-5">
        {STAGES.map((stage, i) => {
          const reading = readings[stage.slug];
          const previous = i > 0 ? STAGES[i - 1] : null;

          return (
            <li key={stage.slug} className="flex shrink-0 items-center">
              {/* The connector says which arm this stage is on: a solid rule
                  where one step genuinely blocks the next, a gap where they
                  are siblings. It is the only part of the drawing that
                  carries information rather than rhythm. */}
              {previous && (
                <span
                  aria-hidden
                  className={
                    previous.group === "trunk" && stage.group === "trunk"
                      ? "mr-1 h-px w-4 bg-border-strong sm:w-6"
                      : "mr-1 h-px w-4 bg-border sm:w-6"
                  }
                />
              )}

              <NavLink
                to={stage.slug}
                title={reading.reason ?? stage.blurb}
                className={({ isActive }) =>
                  [
                    "group grid gap-0.5 rounded-lg px-2.5 py-1.5 transition-colors sm:px-3",
                    isActive
                      ? "bg-surface shadow-[inset_0_0_0_1px_var(--color-border)]"
                      : "hover:bg-surface/70",
                  ].join(" ")
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`dot ${DOT[reading.state]}`}
                        aria-hidden
                      />
                      <span
                        className={`whitespace-nowrap text-[0.8125rem] font-medium ${
                          isActive ? MARK[stage.slug] : "text-ink"
                        }`}
                      >
                        {stage.label}
                      </span>
                    </span>
                    {/* The fact, not a re-labelling of the state. "3 of 5" is
                        worth reading; "in progress" is not. */}
                    <span className="whitespace-nowrap pl-3.5 text-2xs text-muted">
                      {reading.caption}
                    </span>
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
