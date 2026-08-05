import { Link, useParams } from "react-router-dom";

import { CHAPTERS, chapterAt, SECTIONS } from "../help/chapters";
import { Markdown } from "../lib/markdown";

/**
 * The manual.
 *
 * Amplify is eight screens that each assume you know why the last one
 * mattered, and until now the only way to learn that was to be told by
 * somebody who already knew. This is that person, written down.
 *
 * Ordered by the work rather than by the interface: the contents are the
 * steps of a week, in the order a week happens, so somebody reading it
 * straight through has done a sermon by the end. Every chapter is its own
 * URL, so a link to one is a link to the answer rather than to the manual.
 */

function Contents({ current }: { current?: string }) {
  return (
    <nav className="grid gap-5">
      {SECTIONS.map((section) => (
        <div key={section.key} className="grid gap-1.5">
          <p className="section-label">{section.title}</p>
          {section.note && (
            <p className="-mt-1 text-2xs text-faint">{section.note}</p>
          )}
          <ul className="grid gap-0.5">
            {section.chapters.map((chapter, i) => {
              const here = chapter.slug === current;
              return (
                <li key={chapter.slug}>
                  <Link
                    to={`/help/${chapter.slug}`}
                    aria-current={here ? "page" : undefined}
                    className={`flex gap-2.5 rounded-lg px-2.5 py-1.5 text-[0.8125rem] leading-snug transition-colors ${
                      here
                        ? "bg-surface-strong font-medium text-ink"
                        : "text-muted hover:bg-surface-strong/60 hover:text-ink"
                    }`}
                  >
                    {/* Numbered only in the first section. The steps of a
                        week are a sequence; the admin chapter is not step
                        eight of anything. */}
                    {section.key === "getting-started" && (
                      <span className="data pt-px">{i + 1}</span>
                    )}
                    <span className="min-w-0 flex-1">{chapter.title}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function HelpPage() {
  const { slug } = useParams();
  const chapter = chapterAt(slug);
  const index = chapter ? CHAPTERS.indexOf(chapter) : -1;
  const next = index >= 0 ? CHAPTERS[index + 1] : CHAPTERS[0];

  return (
    <div className="mx-auto grid max-w-4xl gap-7 px-5 py-9 lg:grid-cols-[15rem_1fr] lg:gap-9">
      <div className="grid content-start gap-5 lg:sticky lg:top-6 lg:self-start">
        <div>
          <h1 className="font-display text-[1.75rem] font-bold leading-tight tracking-[-0.02em] text-ink">
            How Amplify works
          </h1>
          <p className="mt-1 text-[0.8125rem] text-muted">
            One sermon, start to finish.
          </p>
        </div>
        <Contents current={chapter?.slug} />
      </div>

      <div className="min-w-0">
        {chapter ? (
          <article className="grid gap-5">
            <header className="grid gap-1">
              <h2 className="font-display text-[1.625rem] font-bold leading-tight tracking-[-0.02em] text-ink">
                {chapter.title}
              </h2>
              <p className="text-sm text-muted">{chapter.blurb}</p>
            </header>
            <Markdown source={chapter.body} />

            {/* Read straight through, the manual is a week's work in order.
                So the end of a chapter offers the next one rather than
                returning you to a list you have already read. */}
            {next && (
              <Link
                to={`/help/${next.slug}`}
                className="mt-2 flex items-baseline gap-2 border-t border-border pt-4 text-[0.9375rem] text-muted transition-colors hover:text-ink"
              >
                <span className="text-2xs uppercase tracking-wide text-faint">
                  Next
                </span>
                <span className="font-medium">{next.title}</span>
                <span aria-hidden>&rarr;</span>
              </Link>
            )}
          </article>
        ) : (
          // The landing page is the contents, said properly rather than
          // repeated: every chapter with the line explaining what is in it.
          <div className="grid gap-5">
            <p className="text-[0.9375rem] leading-relaxed text-muted">
              Amplify turns one sermon recording into a week of content. These
              chapters follow a single sermon from the moment somebody uploads
              the service to the moment it goes out, in the order the work
              actually happens.
            </p>
            {SECTIONS.map((section) => (
              <div key={section.key} className="grid gap-2">
                <p className="section-label">{section.title}</p>
                <ul className="grid gap-2">
                  {section.chapters.map((chapter) => (
                    <li key={chapter.slug}>
                      <Link
                        to={`/help/${chapter.slug}`}
                        className="group grid gap-0.5 rounded-xl border border-border bg-surface p-3.5 transition-colors hover:border-border-strong"
                      >
                        <span className="font-display text-base font-semibold text-ink">
                          {chapter.title}
                        </span>
                        <span className="text-[0.8125rem] text-muted">
                          {chapter.blurb}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
