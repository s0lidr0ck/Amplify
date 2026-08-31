import {
  CentralTruth,
  Closing,
  Contrast,
  Masthead,
  MemoryVerse,
  Overview,
  Purpose,
  readGuide,
  Reflection,
  Scriptures,
  Takeaways,
  Truths,
  Week,
} from "./studyGuideParts";
import type { HandoutBrand } from "../lib/useHandoutBrand";

export { withoutTrailingQuestion } from "./studyGuideParts";

/**
 * The study handout as a two-page sheet, set for paper.
 *
 * Every other piece of writing here ends up in somebody's clipboard. This
 * one ends up in somebody's hand, folded, with a pen mark on it — so it is
 * the one place in the product where the layout IS the deliverable rather
 * than a view of it.
 *
 * The styling lives in tokens.css under `.study-sheet`, not in utilities
 * here, because it is a document design: two dozen decisions that only make
 * sense read together. This file decides what goes on the sheet and in what
 * order; that file decides what it looks like. The sections themselves are
 * in studyGuideParts.tsx, shared with the bi-fold booklet.
 *
 * Two columns, with the two tables spanning the full width. Both tables have
 * three or two columns of their own and would be squeezed to nothing in a
 * half measure — and breaking the grid twice gives the sheet a rhythm that a
 * single unbroken column of prose never had.
 */
export function StudyGuide({
  payload,
  /** Who preached it and when — worth having on a sheet people file. */
  byline,
  /**
   * The church's logo and the QR code back to its Link page.
   *
   * Passed in for the same reason the byline is: neither belongs to the
   * draft. The shared read-only view leaves it unset and the sheet sets
   * itself exactly as it did before any of this existed.
   */
  brand,
}: {
  payload: Record<string, unknown>;
  byline?: string;
  brand?: HandoutBrand | null;
}) {
  const g = readGuide(payload, byline);

  return (
    <article className="print-sheet study-sheet">
      <Masthead g={g} brand={brand} />

      {/* Full width, above the columns. The overview is the way into the
          sheet and reads as a paragraph under the title; dropped into the
          first column it became the top of a list instead. */}
      <Overview g={g} />

      {/* Two-column blocks with the tables full width between them, rather
          than one long column-flow with `column-span: all` on the tables.
          The rendered result is identical, and the reason for the split is
          paper: multi-column layout that also has to break across pages AND
          host a spanning element is the corner of print CSS most likely to
          go wrong, and a handout that loses page two is worse than one that
          is slightly harder to read. Plain blocks paginate the way anything
          else does. */}
      <div className="sheet-columns">
        <Purpose g={g} />
        <CentralTruth g={g} />
        <Scriptures g={g} />
        <Truths g={g} />
      </div>

      <Contrast g={g} />

      <Week g={g} />

      {/* The reflection is the tall one — three prompts, each over ruled
          lines — so the short closing sections share its second column
          rather than starting a block of their own and leaving half a page
          of white under three sentences. */}
      <div className="sheet-columns">
        <Reflection g={g} />
        <Takeaways g={g} />
        <MemoryVerse g={g} />
      </div>

      <Closing g={g} />
    </article>
  );
}
