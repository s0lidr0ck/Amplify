/**
 * Long filenames are the norm, not the exception — phones and cameras emit
 * hundred-character names, and one of them will break any row it lands in.
 *
 * Keep both ends: the start says what it is, the extension says what kind.
 * Truncating only the tail loses the extension, which is the single most
 * useful character in the name.
 */
export function shortName(name: string, max = 44): string {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot) : "";
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const keep = Math.max(8, Math.floor((max - ext.length - 1) * 0.75));
  return `${stem.slice(0, keep)}…${stem.slice(-8)}${ext}`;
}
