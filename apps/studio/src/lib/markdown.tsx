import { Fragment, type ReactNode } from "react";

/**
 * Just enough Markdown for a manual.
 *
 * Not a parser for the language — a reader for the handful of shapes the
 * help chapters actually use: headings, paragraphs, both kinds of list, a
 * callout, bold, and code. Pulling in a full Markdown library would add a
 * dependency and a sanitiser to render eight files nobody but us writes.
 *
 * Deliberately literal about what it does not support. An unrecognised line
 * comes through as a paragraph rather than disappearing, because a manual
 * that silently drops a sentence is worse than one that renders it plainly.
 */

type Block =
  | { kind: "h2" | "h3" | "p" | "quote"; text: string }
  | { kind: "ul" | "ol"; items: string[] };

/** Split the source into blocks, gathering runs of list items as one block. */
export function blocksOf(source: string): Block[] {
  const out: Block[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length) {
      out.push({ kind: "p", text: paragraph.join(" ").trim() });
      paragraph = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flush();
      continue;
    }
    if (trimmed.startsWith("### ")) {
      flush();
      out.push({ kind: "h3", text: trimmed.slice(4) });
      continue;
    }
    if (trimmed.startsWith("## ")) {
      flush();
      out.push({ kind: "h2", text: trimmed.slice(3) });
      continue;
    }
    if (trimmed.startsWith("> ")) {
      flush();
      const text = trimmed.slice(2);
      const last = out[out.length - 1];
      // Consecutive quote lines are one callout. The chapters hard-wrap for
      // editing, so a three-line note was rendering as three stacked boxes
      // each holding a third of a sentence.
      if (last && last.kind === "quote") last.text += ` ${text}`;
      else out.push({ kind: "quote", text });
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    const numbered = /^\d+\.\s+(.*)$/.exec(trimmed);
    if (bullet || numbered) {
      flush();
      const kind = bullet ? "ul" : "ol";
      const text = (bullet ?? numbered)![1];
      const last = out[out.length - 1];
      // Consecutive items are one list. Without this every bullet became a
      // list of one and the spacing between them told you nothing.
      if (last && last.kind === kind) last.items.push(text);
      else out.push({ kind, items: [text] });
      continue;
    }

    paragraph.push(trimmed);
  }
  flush();
  return out;
}

/** `**bold**`, `*italic*` and `` `code` ``, left as text everywhere else. */
export function inline(text: string, keyPrefix = ""): ReactNode[] {
  const parts: ReactNode[] = [];
  // Bold before italic, because the alternation is ordered and `**x**`
  // would otherwise match as an italic containing an asterisk.
  const pattern = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let n = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${n++}`;
    if (token.startsWith("**")) {
      parts.push(
        <strong key={key} className="font-semibold text-ink">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("*")) {
      parts.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      parts.push(
        <code
          key={key}
          className="rounded bg-surface-strong px-1 py-0.5 text-[0.8125em] text-ink"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function Markdown({ source }: { source: string }) {
  return (
    <div className="grid gap-4">
      {blocksOf(source).map((block, i) => {
        const key = `b${i}`;
        switch (block.kind) {
          case "h2":
            return (
              <h2
                key={key}
                className="mt-3 font-display text-xl font-bold leading-tight tracking-[-0.01em] text-ink first:mt-0"
              >
                {inline(block.text, key)}
              </h2>
            );
          case "h3":
            return (
              <h3
                key={key}
                className="mt-1 font-display text-base font-semibold text-ink"
              >
                {inline(block.text, key)}
              </h3>
            );
          case "quote":
            // Used for the thing somebody will otherwise learn the hard way.
            return (
              <p
                key={key}
                className="border-l-2 border-brand bg-brand-soft/40 py-2 pl-3.5 pr-3 text-[0.9375rem] leading-relaxed text-ink"
              >
                {inline(block.text, key)}
              </p>
            );
          case "ul":
            return (
              <ul key={key} className="grid gap-1.5 pl-1">
                {block.items.map((item, j) => (
                  <li key={j} className="flex gap-2.5">
                    <span aria-hidden className="pt-[0.4em] text-faint">
                      <span className="block h-1 w-1 rounded-full bg-current" />
                    </span>
                    <span className="flex-1 text-[0.9375rem] leading-relaxed text-muted">
                      {inline(item, `${key}-${j}`)}
                    </span>
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={key} className="grid gap-2">
                {block.items.map((item, j) => (
                  <li key={j} className="flex gap-3">
                    {/* Numbered because these are steps in an order, and the
                        order is the whole point of a walkthrough. */}
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-surface-strong text-2xs font-semibold text-muted">
                      {j + 1}
                    </span>
                    <span className="flex-1 text-[0.9375rem] leading-relaxed text-muted">
                      {inline(item, `${key}-${j}`)}
                    </span>
                  </li>
                ))}
              </ol>
            );
          default:
            return (
              <p
                key={key}
                className="text-[0.9375rem] leading-relaxed text-muted"
              >
                <Fragment>{inline(block.text, key)}</Fragment>
              </p>
            );
        }
      })}
    </div>
  );
}
