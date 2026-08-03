import { useState } from "react";

/**
 * Three thumbnail directions, laid out to be compared.
 *
 * The phrase is the thing that has to work at thumbnail size, so it is set
 * large in the display face. The brief underneath is eight fields of
 * direction for whoever makes the image — and nobody reads it here. It is
 * written to be pasted into an image tool, so what the card owes you is a
 * copy button you cannot miss, and the detail only if you ask.
 *
 * It used to be the other way round: the whole brief always open, with the
 * copy an underlined link at the bottom of it. Three of those side by side
 * is a wall of grey with the one useful control hidden at the end of it.
 *
 * Shared by the sermon thumbnails and the reel covers. They come from two
 * different prompts with slightly different keys, which is why the brief is
 * filtered by what is present rather than listed as required — a reel cover
 * carries no background_style, and demanding one would blank the card.
 */

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

  return (
    <article className="grid content-start gap-2.5 rounded-xl border border-border bg-surface p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="section-label">{v.label ?? `Variant ${index + 1}`}</span>
        {v.text_position && <span className="data">text {v.text_position}</span>}
      </div>

      {/* The one thing that must survive being two centimetres wide. */}
      <p className="font-display text-lg font-bold leading-tight tracking-tight text-ink">
        {v.thumbnail_phrase}
      </p>

      {/* The action, at full weight. This is what the card is for — the
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
        className={`justify-self-start rounded-lg px-3 py-1.5 text-2xs font-medium transition-colors ${
          copied ? "bg-ok-soft text-ok" : "bg-ink text-white hover:bg-ink/85"
        }`}
      >
        {copied ? "Copied" : "Copy the brief"}
      </button>

      {fields.length > 0 && (
        <>
          <button
            onClick={() => setOpen(!open)}
            className="justify-self-start text-2xs text-muted underline hover:text-ink"
          >
            {open ? "Hide the detail" : `Read the detail · ${fields.length} notes`}
          </button>

          {open && (
            <dl className="grid gap-1.5 border-t border-border pt-2.5">
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
        </>
      )}
    </article>
  );
}

export function Variants({ variants }: { variants: Record<string, string>[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {variants.map((v, i) => (
        <Variant key={i} v={v} index={i} />
      ))}
    </div>
  );
}
