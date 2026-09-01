// The Amplify mark.
//
// A quiet cycle goes in and a loud one comes out. The growth carries the
// meaning, not the wave: a waveform alone would say 'audio', and most of
// what Amplify produces is text and images.
//
// GENERATED from Study/brand/marks.ts. Edit that file, then run
// `npm run brand:check` in the Study repo. Editing this one directly is
// reported as drift on the next check.
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
      {/* Sized to the family standard: long axis at 86%
          of the canvas, centred. See Study/brand/bbox.mjs. */}
      <g data-fit="86" transform="translate(50 50) scale(0.9053) translate(-51.000 -43.250)">
        <path d="M8 50 H20" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
        <path d="M20 50 C26 34 32 34 38 50 C44 66 50 66 56 50" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
        <path d="M56 50 C64 12 74 12 82 50 C86 70 90 70 94 50" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/**
 * Small cut, for favicons and 16-20px chrome. A genuinely different
 * drawing, not the master scaled down.
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
      {/* Sized to the family standard: long axis at 86%
          of the canvas, centred. See Study/brand/bbox.mjs. */}
      <g data-fit="86" transform="translate(50 50) scale(0.8687) translate(-51.000 -36.000)">
        <path d="M8 58 C18 58 20 38 30 38 C40 38 42 58 52 58" fill="none" stroke="currentColor" strokeWidth="13" strokeLinecap="round" />
        <path d="M52 58 C64 58 66 14 78 14 C90 14 92 58 94 58" fill="none" stroke="currentColor" strokeWidth="13" strokeLinecap="round" />
      </g>
    </svg>
  );
}
