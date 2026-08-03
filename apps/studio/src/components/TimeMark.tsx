/**
 * An in or out point, and the controls for moving it.
 *
 * Used by the trim and by every clip, because the problem is the same in
 * both places and getting it exactly right matters more for a clip: a
 * sermon that starts two seconds early is untidy, a reel that starts two
 * seconds early has lost its hook, which is the only thing deciding whether
 * anyone watches the rest.
 *
 * The nudges are ±2 and ±5 because that is the size of the mistake you
 * actually make — the playhead lands a beat before the preacher starts, or
 * a beat after "amen". Anything finer is scrubbing; anything coarser is
 * re-marking. Nudging seeks as well as moves, so you hear the new edge
 * rather than guessing at it.
 */

export function hhmmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

const STEPS = [-5, -2, 2, 5];

export function TimeMark({
  label,
  value,
  onSet,
  onNudge,
  onSeek,
}: {
  label: string;
  value: number | null;
  onSet: () => void;
  onNudge: (by: number) => void;
  onSeek: (to: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <button
        onClick={onSet}
        className="rounded-lg bg-ink px-3 py-1.5 text-2xs font-medium text-white transition-colors hover:bg-ink/85"
      >
        {label} here
      </button>

      {value !== null ? (
        <>
          <button
            onClick={() => onSeek(value)}
            className="data underline hover:text-ink"
            title="Jump to this mark"
          >
            {hhmmss(value)}
          </button>

          {/* One group, in order, so the four read as a dial rather than as
              four separate buttons. */}
          <span className="flex overflow-hidden rounded-lg border border-border">
            {STEPS.map((by) => (
              <button
                key={by}
                onClick={() => onNudge(by)}
                className="border-r border-border px-2 py-1 font-mono text-2xs text-muted transition-colors last:border-r-0 hover:bg-surface-strong hover:text-ink"
                aria-label={`${label} ${by > 0 ? "later" : "earlier"} by ${Math.abs(by)} seconds`}
              >
                {by > 0 ? `+${by}` : by}
              </button>
            ))}
          </span>
        </>
      ) : (
        <span className="text-2xs text-faint">not set</span>
      )}
    </div>
  );
}
