/**
 * How far one sermon got, as five segments.
 *
 * The list is scanned, not read — somebody opens it on Monday wanting to know
 * which sermon still needs work, and the answer has to survive being seen
 * from four feet away. Five filled-or-not segments answer that before any of
 * the words are read; the sentence underneath says which one is next, for
 * when the answer is "this one".
 *
 * Deliberately not a percentage. "60% done" invites the question of what the
 * other 40% is, and then you are reading the row anyway.
 */

export const STAGES = [
  { key: "media", label: "Video", next: "Upload the video" },
  { key: "transcript", label: "Transcript", next: "Transcribe it" },
  { key: "writing", label: "Writing", next: "Write the posts" },
  { key: "clips", label: "Clips", next: "Cut the clips" },
  { key: "out", label: "Posted", next: "Send it out" },
] as const;

export type Progress = Record<(typeof STAGES)[number]["key"], boolean>;

/** The first thing not done — which is the only one anybody can act on. */
export function nextStep(p: Progress | undefined): string | null {
  if (!p) return null;
  const stage = STAGES.find((s) => !p[s.key]);
  return stage ? stage.next : null;
}

export function ProgressRail({
  progress,
  className = "",
}: {
  progress: Progress | undefined;
  className?: string;
}) {
  const done = STAGES.filter((s) => progress?.[s.key]).length;

  return (
    <div
      className={`flex items-center gap-1 ${className}`}
      // One label for the whole rail. Five separate ones would be read out
      // as five unlabelled graphics, which is worse than not marking it up.
      role="img"
      aria-label={
        progress
          ? `${done} of ${STAGES.length} stages done`
          : "Progress loading"
      }
    >
      {STAGES.map((stage) => (
        <span
          key={stage.key}
          title={stage.label}
          className={`h-1.5 w-5 rounded-full transition-colors ${
            progress?.[stage.key] ? "bg-brand" : "bg-border"
          }`}
        />
      ))}
    </div>
  );
}
