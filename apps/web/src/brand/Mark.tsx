// The Amplify mark.
//
// One sermon in, a week of content out. A heavy stem enters, meets a bus, and
// three arms leave it. That IS the product in one glyph, and it is the same
// shape the workflow rail draws at full size — the mark is the rail, shrunk.
//
// The middle arm runs on past the other two. That is not decoration: it says
// the sermon itself keeps going while the derived pieces branch off it, and
// it is also what stops the glyph reading as a rotated capital E, which the
// even-armed version did.
//
// Right angles rather than curves, chosen by drawing both. Curved outputs
// looked better at 96px and merged into a single left-pointing arrow by 26px
// — every version of them did, at every spread and weight tried. Straight
// arms stay countable at 16px, and the patch-bay read suits a studio tool
// better than a flourish would.
//
// Rejected on the way here, so it doesn't get re-tried:
//  - Three curved outputs fanning from a node. The first idea, and the one
//    the small sizes killed; see above.
//  - An op-amp triangle. Correct electronics, wrong read: at small sizes it
//    is a play button, and this app is not a video player.
//  - Rising bars (gain / levels). Every analytics product owns that already,
//    and it says "numbers went up", not "one thing became many".
//  - A waveform. Says audio, and most of Amplify's outputs are text and
//    images; it undersells the product to its own users.
//  - Concentric arcs radiating out (a broadcast tower). A1:8's parent mark
//    owns ring language across the family.
//  - A funnel. Right topology, exactly backwards — funnels are many-to-one.

export function Mark({ size = 32, title }: { size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <g stroke="currentColor" strokeLinecap="round">
        {/* The one input, heaviest stroke — the sermon. */}
        <path d="M8 50 H50" strokeWidth="14" />
        {/* The bus it arrives at. Everything right of this is derived. */}
        <path d="M50 20 V80" strokeWidth="9" />
        <path d="M50 20 H80" strokeWidth="9" />
        {/* The long one: the sermon carries on. */}
        <path d="M50 50 H94" strokeWidth="9" />
        <path d="M50 80 H80" strokeWidth="9" />
      </g>
    </svg>
  );
}

/**
 * Small cut, for favicons and 16–20px chrome.
 *
 * Same geometry — it survives 16px, which was the whole reason for choosing
 * right angles — with heavier strokes and a slightly tighter bus, so it holds
 * up against a browser tab's compression and whatever is beside it.
 */
export function MarkSmall({ size = 16, title }: { size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <g stroke="currentColor" strokeLinecap="round">
        <path d="M8 50 H48" strokeWidth="17" />
        <path d="M48 24 V76" strokeWidth="12" />
        <path d="M48 24 H78" strokeWidth="12" />
        <path d="M48 50 H94" strokeWidth="12" />
        <path d="M48 76 H78" strokeWidth="12" />
      </g>
    </svg>
  );
}
