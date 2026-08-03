import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Mark } from "../brand/Mark";

// CANONICAL HUB-AUTH KIT — copied per app (Crew is the source of truth).
// Auth lives at the Home hub; this gate: (1) exchanges one-time ?ssoCode=
// params for a session, (2) silently bounces via the hub when the a18_hint
// cookie says a hub session exists, (3) otherwise shows a single button.
// sessionStorage["a18_bounced"] stops redirect loops: one silent attempt
// per tab, then the user must click.

const HUB_URL: string =
  (import.meta.env.VITE_HUB_URL as string | undefined) ??
  "https://home.a1-8.com";

function hasHint(): boolean {
  return document.cookie.split("; ").includes("a18_hint=1");
}

function bounceToHub(): void {
  sessionStorage.setItem("a18_bounced", "1");
  window.location.assign(
    `${HUB_URL}/signin?redirect=${encodeURIComponent(window.location.href)}`,
  );
}

export function HubGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn } = useAuthActions();
  const [exchange, setExchange] = useState<"none" | "busy" | "failed">(() =>
    new URLSearchParams(window.location.search).has("ssoCode")
      ? "busy"
      : "none",
  );
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("ssoCode");
    if (!code) return;
    params.delete("ssoCode");
    const query = params.toString();
    const cleanUrl =
      window.location.pathname +
      (query ? `?${query}` : "") +
      window.location.hash;
    window.history.replaceState(null, "", cleanUrl);
    signIn("sso-code", { code, redirectOrigin: window.location.origin })
      // Success = full reload on the clean URL. A fresh boot reads the new
      // session straight from storage — no waiting on the running page's
      // auth state, which races both ways (re-bounce loop when the guard
      // clears too early; stuck spinner when replacing an existing
      // session never flips isAuthenticated).
      .then(() => {
        sessionStorage.removeItem("a18_bounced");
        window.location.replace(cleanUrl);
      })
      .catch(() => setExchange("failed"));
  }, [signIn]);

  useEffect(() => {
    // A confirmed session also ends the bounce cycle (silent-hint path).
    if (isAuthenticated) sessionStorage.removeItem("a18_bounced");
  }, [isAuthenticated]);

  useEffect(() => {
    if (isLoading || isAuthenticated || exchange !== "none") return;
    if (hasHint() && !sessionStorage.getItem("a18_bounced")) bounceToHub();
  }, [isLoading, isAuthenticated, exchange]);

  if (isAuthenticated) return <>{children}</>;
  if (isLoading || exchange === "busy") {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Signing you in…
      </div>
    );
  }
  // Only the markup below is app-specific — everything above is the shared kit
  // and must stay identical across apps. Ported to Next once and it cost a
  // real bug: deferring the synchronous URL read into an effect opened a race
  // that bounced the browser back to the hub mid-exchange, burning the
  // one-time code. Hence Vite, and hence this file arriving unedited.
  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      <div className="card grid w-full max-w-sm gap-4 p-7">
        <div className="grid gap-2.5">
          <div className="flex items-center gap-2.5">
            <span className="text-brand">
              <Mark size={26} title="Amplify" />
            </span>
            <span className="font-display text-xl font-semibold tracking-tight text-ink">
              Amplify
            </span>
          </div>
          {/* What the product is, on the one screen everybody sees first.
              A wordmark and a sign-in button says only "this is a thing
              with a login" — which is what somebody sent a link by their
              media director is trying to work out. */}
          <p className="font-display text-[1.375rem] font-semibold leading-[1.25] tracking-[-0.015em] text-ink">
            One sermon in.
            <br />A week of content out.
          </p>
          <p className="text-[0.8125rem] leading-relaxed text-muted">
            Amplify watches the whole service, finds the moments worth
            clipping, and writes the posts in your church&rsquo;s own voice.
          </p>
        </div>
        {exchange === "failed" && (
          <p className="text-sm text-danger">
            That sign-in link expired. Continue below to get a fresh one.
          </p>
        )}
        <button
          onClick={bounceToHub}
          className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-ink/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Continue with A1:8 Home
        </button>
        <p className="text-xs text-muted">
          One account for Study, Crew, UpScreen, and the whole A1:8 family.
        </p>
      </div>
    </div>
  );
}
