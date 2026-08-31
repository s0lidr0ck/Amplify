import {
  CentralTruth,
  ChurchLogo,
  Closing,
  Contrast,
  MemoryVerse,
  Overview,
  Purpose,
  readGuide,
  Reflection,
  Scriptures,
  Takeaways,
  Truths,
  Week,
  type Guide,
} from "./studyGuideParts";
import { HandoutQr } from "./HandoutQr";
import type { HandoutBrand } from "../lib/useHandoutBrand";

/**
 * The study handout as a landscape bi-fold booklet.
 *
 * One sheet of letter paper, landscape, printed both sides and folded once
 * down the middle. That gives four 5.5 × 8.5in panels: a real front cover,
 * two inside pages, and a back.
 *
 * THE IMPOSITION
 * --------------
 * This is the part that looks wrong until you fold it. Panels do not print
 * in reading order — they print in the order the fold puts them in:
 *
 *     side one   [ panel 4 | panel 1 ]     ← back cover, front cover
 *     side two   [ panel 2 | panel 3 ]     ← the inside spread
 *
 * Fold that down the middle and you get 1, 2, 3, 4 in order, with panel 1
 * facing out. Anyone opening the PDF on screen will think the first page is
 * back to front. It is meant to be.
 *
 * WHY THE PANELS ARE ASSIGNED RATHER THAN FLOWED
 * ----------------------------------------------
 * The sheet layout lets content flow and paginate wherever it lands, which
 * is right when pages are just pages. A booklet cannot do that: content
 * that overflows onto a fifth page destroys the imposition, and a "page 5"
 * of a folded sheet does not exist. So each section is placed on a named
 * panel, deliberately, and the panels are fixed to the paper size.
 *
 * The cost is honest and worth stating: a very long sermon can overrun a
 * panel. In print the panel clips rather than spilling, because a clipped
 * line is recoverable — you shorten the guide and print again — while a
 * fifth page silently turns a booklet into loose paper. On screen it is
 * allowed to overflow visibly, so the person about to press Print can see
 * that it does not fit.
 */

/** One panel of the folded sheet. */
function Panel({
  children,
  cover,
}: {
  children: React.ReactNode;
  /** The front panel is a cover, and is set like one. */
  cover?: boolean;
}) {
  return (
    <div className={`fold-panel ${cover ? "fold-panel--cover" : ""}`}>
      {children}
    </div>
  );
}

/**
 * The front of the booklet: the church's mark, the title, and just enough to
 * open the lesson.
 *
 * The central truth used to be here and is now on the first inside page. A
 * cover panel is 5.5 × 8.5in and clips rather than spilling, and the logo,
 * the overview and the QR code together are more than it can carry with the
 * central truth as well. The overview earns the place: it is what somebody
 * reads before deciding to open the thing at all, where the central truth is
 * the lesson itself and belongs with the scriptures that carry it.
 */
function Cover({ g, brand }: { g: Guide; brand?: HandoutBrand | null }) {
  return (
    <Panel cover>
      <div className="fold-cover-top">
        <ChurchLogo brand={brand} className="fold-logo" />
        <p className="sheet-byline">Study handout</p>
        <h1 className="fold-title">{g.title || "Study handout"}</h1>
        {g.stamp && <p className="fold-stamp">{g.stamp}</p>}
      </div>
      <div className="fold-cover-body">
        <Overview g={g} />
        <Purpose g={g} />
      </div>
      {brand?.qrUrl && (
        <div className="fold-cover-foot">
          <HandoutQr
            url={brand.qrUrl}
            caption={`Scan to find everything from ${brand.churchName}`}
          />
        </div>
      )}
    </Panel>
  );
}

export function StudyGuideFold({
  payload,
  byline,
  /** The church's logo and the QR code back to its Link page. */
  brand,
}: {
  payload: Record<string, unknown>;
  byline?: string;
  brand?: HandoutBrand | null;
}) {
  const g = readGuide(payload, byline);

  return (
    <article className="print-sheet fold-book">
      {/* Landscape paper, declared here rather than in the stylesheet.
          `@page` is document-level and cannot be switched by a class, and
          the two layouts need different paper — so the layout that needs
          landscape asks for it while it is the one on screen. Rendered
          after the stylesheet, so it wins. */}
      <style>{`@page { size: 11in 8.5in; margin: 0; }`}</style>

      <div className="fold-side">
        {/* Back cover on the left, front cover on the right. Folded, they
            become the outside of the booklet. */}
        <Panel>
          <Week g={g} narrow />
          <Takeaways g={g} />
          <Closing g={g} />
        </Panel>
        <Cover g={g} brand={brand} />
      </div>

      <div className="fold-side fold-side--two">
        <Panel>
          {/* Off the cover, which now opens with the overview. This is the
              first page somebody sees on unfolding it, so the lesson's own
              claim is the right thing to meet them there. */}
          <CentralTruth g={g} />
          <Scriptures g={g} />
          <Truths g={g} />
        </Panel>
        {/* The memory verse moved here from the back panel when the
            discussion questions came out. It belongs beside the reflection
            anyway — you think it through, then you take one line with you —
            and it keeps the two inside panels from being one full and one
            half empty. */}
        <Panel>
          <Contrast g={g} />
          <Reflection g={g} />
          <MemoryVerse g={g} />
        </Panel>
      </div>
    </article>
  );
}
