/**
 * The current hub token, kept where non-React code can reach it.
 *
 * `useAuthToken()` is a hook, and `api()` in lib/api.ts is a plain function
 * called from event handlers, react-query fetchers and effects. Threading a
 * token through every one of those call sites would mean touching every
 * request in the app and getting it right each time.
 *
 * So one component watches the hook and writes the token here, and `api()`
 * reads it. The value is whatever the last render saw: Convex Auth refreshes
 * the token before it expires, and each refresh lands here.
 */

let token: string | null = null;

/** Called by <AuthTokenBridge /> whenever Convex Auth hands out a new token. */
export function setAuthToken(next: string | null): void {
  token = next;
}

export function getAuthToken(): string | null {
  return token;
}

/**
 * `Authorization` header, or nothing.
 *
 * Returns an empty object rather than a header with an empty value: the API
 * treats a malformed Authorization header the same as a forged one, so
 * sending `Bearer null` during the first render would be a 401 rather than
 * the "not signed in yet" the caller actually means.
 */
export function authHeaders(): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
