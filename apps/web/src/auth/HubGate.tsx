"use client";

import { Mark } from "@/brand/Mark";
import { useAuthActions, useAuthToken } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { useEffect, useRef, useState } from "react";

import { setAuthToken } from "@/lib/authToken";

// CANONICAL HUB-AUTH KIT — copied per app (Crew is the source of truth).
// Auth lives at the Home hub; this gate: (1) exchanges one-time ?ssoCode=
// params for a session, (2) silently bounces via the hub when the a18_hint
// cookie says a hub session exists, (3) otherwise shows a single button.
// sessionStorage["a18_bounced"] stops redirect loops: one silent attempt
// per tab, then the user must click.
//
// Ported from Vite to Next.js: import.meta.env -> process.env.NEXT_PUBLIC_*,
// and every window/document read is deferred past the server render.

const HUB_URL: string =
  process.env.NEXT_PUBLIC_HUB_URL ?? "https://home.a1-8.com";

function hasHint(): boolean {
  return document.cookie.split("; ").includes("a18_hint=1");
}

function bounceToHub(): void {
  sessionStorage.setItem("a18_bounced", "1");
  window.location.assign(
    `${HUB_URL}/signin?redirect=${encodeURIComponent(window.location.href)}`,
  );
}

/**
 * Keeps lib/authToken in step with Convex Auth.
 *
 * Separate from the gate because it must run on every token change, not only
 * while the gate is deciding what to render — Convex Auth refreshes the token
 * roughly hourly, and a stale one is a sudden wall of 401s mid-session.
 */
function AuthTokenBridge() {
  const token = useAuthToken();
  useEffect(() => {
    setAuthToken(token);
  }, [token]);
  return null;
}

export function HubGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn } = useAuthActions();
  // Read the URL synchronously, exactly as the Vite original does.
  //
  // This started as "none", corrected to "busy" inside the effect below, on
  // the reasoning that there is no window during the server render. That
  // introduced a race the original does not have: effects in the same commit
  // close over the render's state, so the bounce effect further down saw
  // "none" even though an exchange had just started, and could fire — sending
  // the browser back to the hub mid-exchange and burning the one-time code.
  //
  // The lazy initializer is safe here. `typeof window` guards the server, and
  // useConvexAuth().isLoading is true on the first render either way, so both
  // server and client render "Signing you in…" and there is no mismatch to
  // hydrate around.
  const [exchange, setExchange] = useState<"none" | "busy" | "failed">(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("ssoCode")
      ? "busy"
      : "none",
  );
  const ran = useRef(false);
  // Belt and braces for the same failure. Once a code has been seen in this
  // page load, nothing may bounce — regardless of how the state settles, and
  // after replaceState has already stripped the code from the URL.
  const sawCode = useRef(
    typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("ssoCode"),
  );

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
    // Arrived holding a code: the exchange owns this page load.
    if (sawCode.current) return;
    if (hasHint() && !sessionStorage.getItem("a18_bounced")) bounceToHub();
  }, [isLoading, isAuthenticated, exchange]);

  if (isAuthenticated) {
    return (
      <>
        <AuthTokenBridge />
        {children}
      </>
    );
  }

  if (isLoading || exchange === "busy") {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted">
        Signing you in…
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      <div className="grid w-full max-w-sm gap-4 rounded-2xl border border-border bg-surface p-7 shadow-sm">
        <div className="flex items-center gap-2.5">
          <span className="text-brand">
            <Mark size={26} title="Amplify" />
          </span>
          <span className="font-display text-xl font-semibold tracking-tight text-ink">
            Amplify
          </span>
        </div>
        {exchange === "failed" && (
          <p className="text-sm text-danger">
            That sign-in link expired. Continue below to get a fresh one.
          </p>
        )}
        <button
          onClick={bounceToHub}
          className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-ink/85"
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
