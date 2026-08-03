import type { StageState, StageVerdict } from "../lib/stageGating";

/**
 * The signal rail — Amplify's signature.
 *
 * One sermon enters, is refined in sequence, then fans out into everything
 * derived from it. That shape IS the workflow, so this draws it rather than
 * listing it: a straight run for the steps that must happen in order, and a
 * fan for the outputs that need not.
 *
 * Deliberately not the mark. The mark says what the product does — the same
 * message, louder. This says what today's work looks like. An earlier
 * version made them the same shape, which sounded tidy and meant the logo
 * had to carry a project-management diagram.
 *
 * Why the fan is real and not decoration: the ordered steps genuinely block
 * each other — you cannot transcribe what you have not uploaded — while the
 * blog, the posts and the packaging are siblings that can be done in any
 * order. A flat list of stages said those two facts were the same thing.
 * They are not, and the operator plans their week around the difference.
 *
 * Four states, one colour:
 *   done     solid ink        — behind you
 *   now      rose, the signal — the only rose on the screen
 *   ready    outlined         — your choice whether to do it next
 *   blocked  faint            — genuinely cannot start, and says why
 *
 * "blocked" is rare on purpose: gating covers real dependencies only, so
 * most of a sermon's middle is available at once rather than queued behind
 * an order somebody invented.
 */

const TRUNK = [
  { id: "source", label: "Upload" },
  { id: "trim", label: "Trim" },
  { id: "transcript", label: "Transcript" },
] as const;

const FAN = [
  { id: "metadata", label: "Details" },
  { id: "title-desc", label: "Title & description" },
  { id: "blog", label: "Blog post" },
  { id: "text-post", label: "Text post" },
] as const;

const GATHER = [{ id: "publishing", label: "Publish" }] as const;

function dotClass(state: StageState): string {
  switch (state) {
    case "done":
      return "bg-ink border-ink";
    case "now":
      // The signal. Nothing else on the screen may use this colour.
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

function Stage({
  label,
  verdict,
  onSelect,
}: {
  label: string;
  verdict: StageVerdict;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!onSelect}
      // The reason travels with the dot rather than living in a legend, so
      // it is there at the moment somebody wonders.
      title={verdict.reason}
      className="flex items-center gap-2 text-left disabled:cursor-default"
    >
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full border-2 transition-colors ${dotClass(
          verdict.state,
        )}`}
      />
      <span className={`text-2xs ${labelClass(verdict.state)}`}>{label}</span>
    </button>
  );
}

export function SignalRail({
  states,
  onSelect,
}: {
  states: Record<string, StageVerdict>;
  onSelect?: (id: string) => void;
}) {
  const at = (id: string): StageVerdict => states[id] ?? { state: "ready" };

  return (
    <nav aria-label="Where this sermon is" className="grid gap-3">
      {/* The trunk: in order, drawn as a line, because it is one. */}
      <ol className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {TRUNK.map((stage, i) => (
          <li key={stage.id} className="flex items-center gap-3">
            {i > 0 && <span className="h-px w-5 bg-border" aria-hidden />}
            <Stage
              label={stage.label}
              verdict={at(stage.id)}
              onSelect={onSelect ? () => onSelect(stage.id) : undefined}
            />
          </li>
        ))}
      </ol>

      {/* The fan: siblings, drawn as a set rather than a sequence.
          A vertical rule that stretches with the group says "all of these
          come off that one thing" — the earlier version used a fixed-height
          bracket, which rendered as a stray stub because a percentage
          height has nothing to be a percentage of inside a flex row. */}
      {/* The fan and the gather share one rule, because they are one
          movement: everything after the transcript hangs off this line, and
          publishing is where the line ends. Drawing them as two detached
          rows left Publish behind a horizontal dash that connected to
          nothing — a stub floating in the margin, which reads as a rendering
          fault rather than a step. */}
      <div className="flex items-stretch gap-3 pl-1">
        <span className="w-px shrink-0 bg-border-strong" aria-hidden />
        <div className="grid gap-2.5 py-0.5">
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {FAN.map((stage) => (
              <li key={stage.id}>
                <Stage
                  label={stage.label}
                  verdict={at(stage.id)}
                  onSelect={onSelect ? () => onSelect(stage.id) : undefined}
                />
              </li>
            ))}
          </ul>

          {/* The hairline is the fan converging. Publishing is not a fifth
              sibling — it is the one thing that needs all of them. */}
          <ol className="flex flex-wrap items-center gap-3 border-t border-border pt-2.5">
            {GATHER.map((stage) => (
              <li key={stage.id}>
                <Stage
                  label={stage.label}
                  verdict={at(stage.id)}
                  onSelect={onSelect ? () => onSelect(stage.id) : undefined}
                />
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* One reason at a time, and only when something is actually blocked.
          A list of every unmet dependency reads as a wall of refusals. */}
      {(() => {
        const blocked = [...TRUNK, ...FAN, ...GATHER]
          .map((s) => at(s.id))
          .find((v) => v.state === "blocked" && v.reason);
        return blocked ? (
          <p className="text-2xs text-muted">{blocked.reason}</p>
        ) : null;
      })()}
    </nav>
  );
}
