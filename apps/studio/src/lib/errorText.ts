/**
 * The sentence a person should read, out of what Convex throws.
 *
 * A rejected mutation arrives looking like this:
 *
 *   [CONVEX M(amplifyCredentials:connect)] [Request ID: 439af6e5] Server Error
 *   Uncaught Error: That doesn't look like the JSON the platform gives you.
 *       at handler (../convex/amplifyCredentials.ts:79:8)
 *   Called by client
 *
 * Every screen was trimming that with `/^.*Error:\s*​/`, which silently does
 * nothing: `.` does not cross a newline and `^` is the start of the whole
 * string, so the pattern needs "Error:" on the first line — and the first
 * line ends in "Server Error", without the colon. The regex matched nothing,
 * reported success, and the request id and the file path went on screen.
 *
 * So: find the last "Error:" anywhere, keep what follows, and stop at the
 * stack trace.
 */
export function errorText(e: unknown, fallback: string): string {
  if (!(e instanceof Error)) return fallback;

  const raw = e.message;
  const marker = raw.lastIndexOf("Error:");
  const body = marker === -1 ? raw : raw.slice(marker + "Error:".length);

  const message = body
    // The stack begins at the first indented "at …" line.
    .split(/\n\s+at\s/)[0]
    .replace(/\bCalled by client\b/, "")
    .trim();

  // A thrown error with no message of its own leaves nothing worth showing,
  // and an empty red line is worse than the fallback.
  return message || fallback;
}
