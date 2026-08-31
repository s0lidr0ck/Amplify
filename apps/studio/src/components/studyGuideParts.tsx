/**
 * The study handout, in pieces.
 *
 * Two layouts set the same guide: the two-page sheet, and the landscape
 * bi-fold booklet. They differ only in what goes where — the sections
 * themselves are identical, and so is the reading of the draft.
 *
 * That is why they live here rather than in either layout. Two copies of
 * "how a key scripture is set" would agree until somebody improved one of
 * them, and then the booklet and the sheet would quietly be different
 * documents produced by the same button.
 */

import { HandoutQr } from "./HandoutQr";
import type { HandoutBrand } from "../lib/useHandoutBrand";

type Scripture = { reference?: string; note?: string };
type Truth = { heading?: string; body?: string };
type ContrastRow = { left?: string; right?: string };
type Day = { day?: string; read?: string; focus?: string };
type Verse = { reference?: string; text?: string };

/** Present, a string, and not just spaces. */
export function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Drop the question the central truth ends on.
 *
 * The claim and the question are two fields for a reason: the claim is
 * prose, the question is the pull quote set beside it. Claude keeps ending
 * the claim on the same question anyway — "…so which is it, is God being
 * unfair to you, or is He holding you?" immediately above a pull quote
 * asking exactly that. Two prompt revisions did not stop it, and asking a
 * third time would be hoping rather than fixing.
 *
 * Deterministic instead: if the claim's last sentence is a question and
 * there is a separate question to carry it, the claim keeps everything up
 * to that sentence. Guarded on what is left, so a short claim that is
 * *only* a question is left alone rather than blanked.
 */
export function withoutTrailingQuestion(claim: string, question: string): string {
  if (!claim || !question) return claim;
  const trimmed = claim.replace(/\s*[^.!?]*\?\s*$/, "").trim();
  return trimmed.length >= 40 ? trimmed : claim;
}

export type Guide = ReturnType<typeof readGuide>;

/** One reading of the draft, for whichever layout is setting it. */
export function readGuide(payload: Record<string, unknown>, byline?: string) {
  const centralQuestion = text(payload.centralQuestion);
  const contrast = (payload.contrast ?? {}) as {
    leftLabel?: string;
    rightLabel?: string;
    rows?: ContrastRow[];
  };

  return {
    title: text(payload.title),
    primaryText: text(payload.primaryText),
    // The masthead carries what a filed sheet needs to still make sense in
    // a drawer next year, on one line, in the order somebody would say it.
    stamp: [text(payload.primaryText), byline].filter(Boolean).join("  ·  "),
    purpose: text(payload.purpose),
    // Written last by the prompt and read first on the page: the paragraph
    // that says what the lesson is about, in the present tense the rest of
    // the sheet is written in — it opens the lesson rather than reporting on
    // a service that happened. Optional
    // in practice — every guide written before it existed has none, and the
    // front page closes up around the gap rather than printing a heading
    // over nothing.
    overview: text(payload.overview),
    centralQuestion,
    centralTruth: withoutTrailingQuestion(
      text(payload.centralTruth),
      centralQuestion,
    ),
    scriptures: list<Scripture>(payload.keyScriptures).filter((s) =>
      text(s?.reference),
    ),
    truths: list<Truth>(payload.mainTruths).filter((t) => text(t?.heading)),
    reflections: list<unknown>(payload.reflectionPrompts).map(text).filter(Boolean),
    week: list<Day>(payload.weekPlan).filter((d) => text(d?.read)),
    takeaways: list<unknown>(payload.keyTakeaways).map(text).filter(Boolean),
    verse: (payload.memoryVerse ?? {}) as Verse,
    closing: text(payload.closing),
    contrastLeft: text(contrast.leftLabel),
    contrastRight: text(contrast.rightLabel),
    // The one conditional section. A sermon that sets nothing against
    // anything comes back with empty rows rather than a manufactured table,
    // and the sheet closes up around the gap.
    contrastRows: list<ContrastRow>(contrast.rows).filter(
      (r) => text(r?.left) || text(r?.right),
    ),
  };
}

export function Section({
  title,
  whole,
  children,
}: {
  title: string;
  /** Short enough to be worth keeping out of a column break. */
  whole?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`sheet-section ${whole ? "sheet-section--whole" : ""}`}>
      <h2 className="sheet-h">{title}</h2>
      {children}
    </section>
  );
}

/** A numbered entry with the number hanging in the margin. */
export function Numbered({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="sheet-item sheet-numbered">
      <span className="sheet-n">{n}</span>
      <div>{children}</div>
    </div>
  );
}

/** Blank ruled lines, for the person who brought a pen. */
export function WriteIn({ lines }: { lines: number }) {
  return (
    <div aria-hidden className="pt-1">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="sheet-write block" />
      ))}
    </div>
  );
}

/**
 * The church's own mark.
 *
 * Sized in inches rather than rem, because this one is judged on paper: a
 * logo that looks right beside 13.5px type on a screen is a smudge at the
 * top of a photocopy. Contained rather than cropped — most church logos are
 * transparent PNGs of a wordmark, and filling a box with one cuts its ends
 * off.
 */
export function ChurchLogo({
  brand,
  className,
}: {
  brand?: HandoutBrand | null;
  className?: string;
}) {
  if (!brand?.logoUrl) return null;
  return (
    <img
      src={brand.logoUrl}
      alt={brand.churchName}
      className={`sheet-logo ${className ?? ""}`}
    />
  );
}

/**
 * The paragraph that opens the front page.
 *
 * Not a section with a rule over it like the rest — it is the way into the
 * sheet, and giving it the same heading treatment as "Key scriptures" made
 * the front page read as a list of twelve equal things rather than as a
 * page with a top.
 */
export function Overview({ g }: { g: Guide }) {
  if (!g.overview) return null;
  return <p className="sheet-overview">{g.overview}</p>;
}

export function Masthead({
  g,
  brand,
}: {
  g: Guide;
  /** The church's logo and QR code, when the sheet is being printed by one. */
  brand?: HandoutBrand | null;
}) {
  return (
    <header className="sheet-masthead">
      <div className="sheet-masthead-row">
        <ChurchLogo brand={brand} />
        <div className="sheet-masthead-title">
          <h1 className="sheet-title">{g.title || "Study handout"}</h1>
          {g.stamp && <p className="sheet-byline">{g.stamp}</p>}
        </div>
        {brand?.qrUrl && (
          <HandoutQr url={brand.qrUrl} caption="Scan to stay connected" />
        )}
      </div>
    </header>
  );
}

export function Purpose({ g }: { g: Guide }) {
  if (!g.purpose) return null;
  return (
    <Section title="Lesson purpose" whole>
      <p className="sheet-body">{g.purpose}</p>
    </Section>
  );
}

export function CentralTruth({ g }: { g: Guide }) {
  if (!g.centralTruth && !g.centralQuestion) return null;
  return (
    <Section title="The central truth" whole>
      {g.centralTruth && <p className="sheet-body">{g.centralTruth}</p>}
      {g.centralQuestion && <p className="sheet-pull">{g.centralQuestion}</p>}
    </Section>
  );
}

export function Scriptures({ g }: { g: Guide }) {
  if (g.scriptures.length === 0) return null;
  return (
    <Section title="Key scriptures">
      {g.scriptures.map((s, i) => (
        <div key={i} className="sheet-item">
          <div className="sheet-lead">{s.reference}</div>
          {text(s.note) && <div className="sheet-body">{text(s.note)}</div>}
        </div>
      ))}
    </Section>
  );
}

export function Truths({ g }: { g: Guide }) {
  if (g.truths.length === 0) return null;
  return (
    <Section title="Main truths">
      {g.truths.map((t, i) => (
        <Numbered key={i} n={i + 1}>
          <div className="sheet-lead">{t.heading}</div>
          {text(t.body) && <div className="sheet-body">{text(t.body)}</div>}
        </Numbered>
      ))}
    </Section>
  );
}

export function Contrast({ g }: { g: Guide }) {
  if (g.contrastRows.length === 0) return null;
  return (
    <section className="sheet-span">
      {/* Named generically, because the two sides are named by the table's
          own column heads directly beneath. Putting the same two labels in
          both places read as a stutter. */}
      <h2 className="sheet-h">Compared</h2>
      <table className="sheet-table">
        <thead>
          <tr>
            <th style={{ width: "50%" }}>{g.contrastLeft || "This"}</th>
            <th style={{ width: "50%" }}>{g.contrastRight || "That"}</th>
          </tr>
        </thead>
        <tbody>
          {g.contrastRows.map((r, i) => (
            <tr key={i}>
              <td>{text(r.left)}</td>
              <td className="sheet-lead">{text(r.right)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function Reflection({ g }: { g: Guide }) {
  if (g.reflections.length === 0) return null;
  return (
    <Section title="Personal reflection">
      {g.reflections.map((p, i) => (
        <div key={i} className="sheet-item">
          <div className="sheet-lead">{p}</div>
          <WriteIn lines={2} />
        </div>
      ))}
    </Section>
  );
}

export function Week({ g, narrow }: { g: Guide; narrow?: boolean }) {
  if (g.week.length === 0) return null;

  // A hand's width has no room for three columns, so the booklet sets the
  // week as a list rather than a table: day, reading, then the focus under
  // both. The first attempt kept the table and put the focus lines beneath
  // it, which printed every weekday twice.
  if (narrow) {
    return (
      <section className="sheet-span">
        <h2 className="sheet-h">This week</h2>
        <ul>
          {g.week.map((d, i) => (
            <li key={i} className="sheet-item">
              <div className="sheet-lead">
                {text(d.day) || String(i + 1)}
                {text(d.read) && (
                  <span className="sheet-day-read"> · {text(d.read)}</span>
                )}
              </div>
              {text(d.focus) && (
                <div className="sheet-body">{text(d.focus)}</div>
              )}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="sheet-span">
      <h2 className="sheet-h">This week</h2>
      <table className="sheet-table">
        <thead>
          <tr>
            <th style={{ width: "14%" }}>Day</th>
            <th style={{ width: "22%" }}>Read</th>
            <th>Focus</th>
          </tr>
        </thead>
        <tbody>
          {g.week.map((d, i) => (
            <tr key={i}>
              <td className="sheet-lead whitespace-nowrap">
                {text(d.day) || String(i + 1)}
              </td>
              <td className="whitespace-nowrap">{text(d.read)}</td>
              <td>{text(d.focus)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function Takeaways({ g }: { g: Guide }) {
  if (g.takeaways.length === 0) return null;
  return (
    <Section title="Key takeaways" whole>
      {g.takeaways.map((t, i) => (
        <Numbered key={i} n={i + 1}>
          <span className="sheet-lead">{t}</span>
        </Numbered>
      ))}
    </Section>
  );
}

export function MemoryVerse({ g }: { g: Guide }) {
  if (!text(g.verse.text)) return null;
  return (
    <Section title="Memory verse" whole>
      <blockquote className="sheet-verse">
        &ldquo;{text(g.verse.text)}&rdquo;
        {text(g.verse.reference) && (
          <cite className="sheet-byline block not-italic">
            {text(g.verse.reference)}
          </cite>
        )}
      </blockquote>
    </Section>
  );
}

export function Closing({ g }: { g: Guide }) {
  if (!g.closing) return null;
  return <p className="sheet-closing">{g.closing}</p>;
}
