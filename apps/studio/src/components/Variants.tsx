import { useState } from "react";

/**
 * The thumbnail directions, laid out to be compared.
 *
 * Stacked rather than dealt across a row. Three fitted side by side and five
 * do not — they wrapped to 3 + 2, which reads as "three concepts and two
 * leftovers" rather than five of a set. A column also lets the phrase run at
 * full width, and the phrase is the thing being judged.
 *
 * Lettered from position, not from what the model called it. The letter is
 * how two people refer to the same concept out loud ("go with C"), so it has
 * to be stable and sequential whatever the model puts in `label`.
 *
 * The phrase is what has to work at thumbnail size, so it is set large in
 * the display face. The brief beside it is eight fields of direction for
 * whoever makes the image, and nobody reads it here — it is written to be
 * pasted into an image tool, so what the row owes you is a copy button you
 * cannot miss, and the detail only if you ask.
 *
 * Shared by the sermon thumbnails and the reel covers. They come from two
 * different prompts with slightly different keys, which is why the brief is
 * filtered by what is present rather than listed as required — a reel cover
 * carries no background_style, and demanding one would blank the card.
 */

const LETTERS = "ABCDEFGHIJ";

const BRIEF: [string, string][] = [
  ["scene_concept", "Scene"],
  ["shot_preference", "Shot"],
  ["lighting_description", "Light"],
  ["mood_color_direction", "Colour"],
  ["typography_feel", "Type"],
  ["background_style", "Background"],
  ["framing_guidance", "Framing"],
  ["editor_notes", "Notes"],
];

function briefText(v: Record<string, string>): string {
  const lines = BRIEF.filter(([k]) => v[k]).map(
    ([k, label]) => `${label}: ${v[k]}`,
  );
  return `${v.thumbnail_phrase ?? ""}\n\n${lines.join("\n")}`.trim();
}

function Variant({ v, index }: { v: Record<string, string>; index: number }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const fields = BRIEF.filter(([k]) => v[k]);

  const letter = LETTERS[index] ?? String(index + 1);

  return (
    <article className="flex gap-3.5 rounded-xl border border-border bg-surface p-3.5">
      {/* The letter, in its own gutter. This is the name of the concept as
          far as anybody discussing it is concerned. */}
      <span
        aria-hidden
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-strong font-display text-sm font-bold text-muted"
      >
        {letter}
      </span>

      <div className="grid min-w-0 flex-1 content-start gap-2.5">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          {/* The one thing that must survive being two centimetres wide. */}
          <p className="min-w-0 flex-1 font-display text-lg font-bold leading-tight tracking-tight text-ink">
            {v.thumbnail_phrase}
          </p>
          {v.text_position && (
            <span className="data">text {v.text_position}</span>
          )}
        </div>

        {/* What the model called it, only when that is more than the letter
            it already has. */}
        {v.label && v.label.trim() !== letter && (
          <p className="text-2xs text-faint">{v.label}</p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {/* The action, at full weight. This is what the row is for — the
              brief exists to be pasted somewhere else. */}
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(briefText(v));
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              } catch {
                setCopied(false);
              }
            }}
            className={`rounded-lg px-3 py-1.5 text-2xs font-medium transition-colors ${
              copied ? "bg-ok-soft text-ok" : "bg-ink text-white hover:bg-ink/85"
            }`}
          >
            {copied ? "Copied" : "Copy the brief"}
          </button>

          {fields.length > 0 && (
            <button
              onClick={() => setOpen(!open)}
              className="text-2xs text-muted underline hover:text-ink"
            >
              {open
                ? "Hide the detail"
                : `Read the detail · ${fields.length} notes`}
            </button>
          )}
        </div>

        {open && fields.length > 0 && (
          <dl className="grid gap-1.5 border-t border-border pt-2.5 sm:grid-cols-2">
            {fields.map(([k, label]) => (
              <div key={k}>
                <dt className="text-2xs font-medium uppercase tracking-wide text-faint">
                  {label}
                </dt>
                <dd className="text-[0.8125rem] leading-snug text-muted">
                  {v[k]}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </article>
  );
}

export function Variants({ variants }: { variants: Record<string, string>[] }) {
  return (
    <div className="grid gap-3">
      {variants.map((v, i) => (
        <Variant key={i} v={v} index={i} />
      ))}
    </div>
  );
}
