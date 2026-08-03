/**
 * The day a sermon was preached, written the way a person says it.
 *
 * Lived in Projects.tsx, so the sermon list said "Sun, August 2, 2026" while
 * the library and the share page — the one a pastor opens on his phone —
 * showed the raw 2026-08-02 the database happens to store. Same fact, three
 * screens, two of them speaking in ISO.
 */

/** "Sun, August 2, 2026". Returns the input unchanged if it isn't a date. */
export function formatSermonDate(value: string): string {
  // `new Date("2026-08-09")` is parsed as UTC midnight and renders as the 8th
  // for anyone west of Greenwich, which is everyone using this. Split the
  // parts and build a local date instead.
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** "2 August 2026" — no weekday, for places where the row is already busy. */
export function formatSermonDateShort(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Today, as the date input wants it, in the browser's own timezone. */
export function todayLocal(): string {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
