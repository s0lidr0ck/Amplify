/**
 * Three thumbnail directions, laid out to be compared.
 *
 * The phrase is the thing that has to work at thumbnail size, so it is set
 * large in the display face — everything else is the brief for whoever makes
 * the image, and reads as notes.
 *
 * Shared by the sermon thumbnails and the reel covers. They come from two
 * different prompts with slightly different keys, which is why the brief is
 * filtered by what is present rather than listed as required — a reel cover
 * carries no background_style, and demanding one would blank the card.
 */
export function Variants({ variants }: { variants: Record<string, string>[] }) {
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

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {variants.map((v, i) => (
        <article
          key={i}
          className="grid content-start gap-2.5 rounded-xl border border-border bg-surface p-3.5"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="section-label">{v.label ?? `Variant ${i + 1}`}</span>
            <span className="data">text {v.text_position}</span>
          </div>

          {/* The one thing that must survive being two centimetres wide. */}
          <p className="font-display text-lg font-bold leading-tight tracking-tight text-ink">
            {v.thumbnail_phrase}
          </p>

          <dl className="grid gap-1.5">
            {BRIEF.filter(([k]) => v[k]).map(([k, label]) => (
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

          <button
            onClick={() => {
              const brief = BRIEF.filter(([k]) => v[k])
                .map(([k, label]) => `${label}: ${v[k]}`)
                .join("\n");
              void navigator.clipboard.writeText(
                `${v.thumbnail_phrase}\n\n${brief}`,
              );
            }}
            className="justify-self-start text-2xs text-muted underline hover:text-ink"
          >
            Copy this brief
          </button>
        </article>
      ))}
    </div>
  );
}
