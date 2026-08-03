/**
 * The sermon's details, laid out as the different things they are.
 *
 * This was rendered by the generic key-and-value fallback, which treats a
 * one-line title, a paragraph, eleven scripture references and a list of
 * long sentences as the same shape: a small grey label with lines under it.
 * Twelve of those in a column with no separation is a page that has to be
 * read from the top to find anything, which is the opposite of what a
 * details panel is for.
 *
 * So each field is given the form it actually has. References and tags are
 * short and countable, so they are chips you can scan. Points and
 * statements are sentences, so they are a list with room to breathe. A key
 * moment is a timecode, a quote and a reason, so it is laid out as those
 * three things rather than stringified.
 */

type KeyMoment = {
  timestamp?: string;
  quote?: string;
  explanation?: string;
};

/** Short, countable, scannable — a row of chips beats a column of lines. */
function Chips({ items, quiet }: { items: string[]; quiet?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <li
          key={i}
          className={`rounded-md px-2 py-0.5 text-2xs font-medium ${
            quiet
              ? "bg-surface-strong text-muted"
              : "bg-surface-strong text-ink"
          }`}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

/** Sentences. They need a marker and a line's worth of air between them. */
function Points({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-[0.9375rem] leading-relaxed text-ink">
          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-border-strong" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** A field, with a rule above it so twelve of them do not run together. */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-2 border-t border-border pt-4 first:border-0 first:pt-0">
      <h3 className="section-label">{label}</h3>
      {children}
    </section>
  );
}

export function SermonDetails({ payload }: { payload: Record<string, unknown> }) {
  const strings = (key: string): string[] =>
    Array.isArray(payload[key])
      ? (payload[key] as unknown[]).filter(
          (v): v is string => typeof v === "string" && v.trim() !== "",
        )
      : [];

  const moments: KeyMoment[] = Array.isArray(payload.keyMoments)
    ? (payload.keyMoments as KeyMoment[])
    : [];

  const scriptures = strings("scriptures");
  const mainPoints = strings("mainPoints");
  const tags = strings("tags");
  const topics = strings("topics");
  const prophetic = strings("propheticStatements");
  const teaching = strings("teachingStatements");

  return (
    <div className="grid gap-4">
      {typeof payload.title === "string" && (
        <h3 className="font-display text-[1.375rem] font-bold leading-snug tracking-[-0.015em] text-ink">
          {payload.title}
        </h3>
      )}

      {typeof payload.description === "string" && (
        // Capped, because a summary set across a 1200px card is a line the
        // eye loses its place in halfway along.
        <p className="max-w-prose text-[0.9375rem] leading-relaxed text-muted">
          {payload.description}
        </p>
      )}

      {scriptures.length > 0 && (
        <Field label={`Scriptures · ${scriptures.length}`}>
          <Chips items={scriptures} />
        </Field>
      )}

      {mainPoints.length > 0 && (
        <Field label="Main points">
          <Points items={mainPoints} />
        </Field>
      )}

      {moments.length > 0 && (
        <Field label={`Key moments · ${moments.length}`}>
          <ul className="grid gap-3">
            {moments.map((m, i) => (
              <li
                key={i}
                className="grid gap-1 rounded-xl bg-surface-strong p-3.5"
              >
                {m.timestamp && <span className="data">{m.timestamp}</span>}
                {m.quote && (
                  // The words themselves are the thing worth finding on this
                  // page, so they are the only quoted type on it.
                  <p className="font-display text-[1.0625rem] font-semibold leading-snug text-ink">
                    &ldquo;{m.quote}&rdquo;
                  </p>
                )}
                {m.explanation && (
                  <p className="max-w-prose text-[0.8125rem] leading-relaxed text-muted">
                    {m.explanation}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Field>
      )}

      {prophetic.length > 0 && (
        <Field label="Prophetic statements">
          <Points items={prophetic} />
        </Field>
      )}

      {teaching.length > 0 && (
        <Field label="Teaching statements">
          <Points items={teaching} />
        </Field>
      )}

      {topics.length > 0 && (
        <Field label="Topics">
          <Chips items={topics} />
        </Field>
      )}

      {tags.length > 0 && (
        <Field label={`Tags · ${tags.length}`}>
          {/* Quieter than the rest: tags are for a machine to filter on,
              not for a person to read. */}
          <Chips items={tags} quiet />
        </Field>
      )}
    </div>
  );
}
