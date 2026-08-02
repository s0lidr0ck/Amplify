"use client";

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
  // Starts "none" rather than reading the URL, because this component is
  // rendered on the server first and there is no window there. The effect
  // below corrects it before anything is shown.
  const [exchange, setExchange] = useState<"none" | "busy" | "failed">("none");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("ssoCode");
    if (!code) return;
    setExchange("busy");
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
      <div className="grid min-h-screen place-items-center text-sm text-slate-500">
        Signing you in…
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 p-6">
      <div className="grid w-full max-w-sm gap-4 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-extrabold tracking-tight text-slate-900">
            Amplify
          </span>
          <span className="text-xs text-slate-400">by A1:8</span>
        </div>
        {exchange === "failed" && (
          <p className="text-sm text-red-600">
            That sign-in link expired. Continue below to get a fresh one.
          </p>
        )}
        <button
          onClick={bounceToHub}
          className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          Continue with A1:8 Home
        </button>
        <p className="text-xs text-slate-500">
          One account for Study, Crew, UpScreen, and the whole A1:8 family.
        </p>
      </div>
    </div>
  );
}
