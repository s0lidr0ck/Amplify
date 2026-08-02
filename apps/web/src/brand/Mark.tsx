// The Amplify mark.
//
// A quiet cycle goes in and a loud one comes out. That is what an amplifier
// does and what this product does: the same message, bigger.
//
// The growth carries the meaning, not the wave. A waveform on its own would
// say "audio", and most of what Amplify produces is text and images — it is
// the change in amplitude across the glyph that says amplified.
//
// Drawn at 96, 40, 26 and 16px and judged there rather than at poster size,
// which is where the previous attempt died.
//
// Rejected on the way here, so it doesn't get re-tried:
//  - A signal splitting into three outputs. Shipped briefly and read as a
//    trident, which is a fair description of it.
//  - A gain knob with a sweep arc. Fine at 96px, a spiral at 26 — reads as a
//    camera aperture or a loading spinner.
//  - A chicken-head pointer knob. Reads as a clock at every size, and a pie
//    chart at 16.
//  - A combo amp drawn front-on, grille and all. Unmistakably an amp at
//    96px, unmistakably a browser window by 26.
//  - A solid knob with one notch. The boldest of them, and still only a dot
//    with a nick in it at favicon size.
//  - Rising bars (gain / levels). Every analytics product owns that already,
//    and it says "numbers went up".
//  - Concentric arcs radiating out. A1:8's parent mark owns ring language
//    across the family.

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
      <g stroke="currentColor" strokeWidth="9" strokeLinecap="round">
        {/* Flat line in: silence before the signal. */}
        <path d="M8 50 H20" />
        {/* One quiet cycle. */}
        <path d="M20 50 C26 34 32 34 38 50 C44 66 50 66 56 50" />
        {/* The same cycle, amplified. */}
        <path d="M56 50 C64 12 74 12 82 50 C86 70 90 70 94 50" />
      </g>
    </svg>
  );
}

/**
 * Small cut, for favicons and 16–20px chrome.
 *
 * Two humps instead of two full cycles, and a heavier stroke. At 16px the
 * trailing half of each cycle is roughly a pixel tall and only muddies the
 * shape; what has to survive is one small rise followed by one big one.
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
      <g stroke="currentColor" strokeWidth="13" strokeLinecap="round">
        <path d="M8 58 C18 58 20 38 30 38 C40 38 42 58 52 58" />
        <path d="M52 58 C64 58 66 14 78 14 C90 14 92 58 94 58" />
      </g>
    </svg>
  );
}
