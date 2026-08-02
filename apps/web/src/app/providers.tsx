"use client";

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConvexReactClient, useConvexAuth, useQuery } from "convex/react";
import { usePathname } from "next/navigation";
import { makeFunctionReference } from "convex/server";
import { useEffect, useRef, useState } from "react";

import { ApprovalGate } from "@/auth/ApprovalGate";
import { HubGate } from "@/auth/HubGate";
import { api } from "@/lib/api";

// The shared A1:8 backend — the same deployment Crew, Study and UpScreen
// authenticate against, which is what makes one account work across all of
// them. Amplify keeps its own data in Postgres; Convex is only the identity.
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

const convex = CONVEX_URL ? new ConvexReactClient(CONVEX_URL) : null;

/**
 * The hub's own user record. Referenced by name rather than through generated
 * types: this app has no Convex schema of its own, and adding a codegen step
 * to read one query would be a lot of machinery for two fields.
 */
const currentUser = makeFunctionReference<"query">("auth:currentUser");

type HubUser = { name?: string; email?: string } | null | undefined;

/**
 * Sends the signed-in user's name and email to the API once per session.
 *
 * The hub's token carries a subject and nothing else, so without this a
 * church appears in the approval queue as an opaque id — and deciding whether
 * to approve someone you cannot identify is not a decision anyone can make.
 *
 * Display data only. Identity is the verified token; the API never trusts
 * anything in this body.
 */
function ProfileSync() {
  const { isAuthenticated } = useConvexAuth();
  const user = useQuery(currentUser, isAuthenticated ? {} : "skip") as HubUser;
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current || !user) return;
    const name = user.name ?? null;
    const email = user.email ?? null;
    if (!name && !email) return;
    sent.current = true;
    // Best effort. A failure here costs a label in an admin list; it must
    // never stop someone using the app.
    void api("/api/me", {
      method: "PUT",
      body: JSON.stringify({ name, email }),
    }).catch(() => {
      sent.current = false;
    });
  }, [user]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  // Fail loudly and in one place. Without this the app renders, every request
  // 401s, and the cause — one unset environment variable — is invisible.
  if (!convex) {
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div className="grid max-w-md gap-2">
          <p className="text-sm font-medium text-red-600">
            NEXT_PUBLIC_CONVEX_URL is not set.
          </p>
          <p className="text-xs text-slate-500">
            Amplify signs in through the A1:8 hub and cannot start without it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ConvexAuthProvider client={convex}>
      <QueryClientProvider client={queryClient}>
        <Gated>{children}</Gated>
      </QueryClientProvider>
    </ConvexAuthProvider>
  );
}

/**
 * Sign-in and approval, except on design previews.
 *
 * TEMPORARY exception for /rail-preview, which exists to look at component
 * states without a session or a running API. It renders no real data — it
 * builds its own — so nothing is exposed by letting it through. Remove it and
 * the route together.
 */
function Gated({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/rail-preview")) return <>{children}</>;

  return (
    <HubGate>
      <ProfileSync />
      <ApprovalGate>{children}</ApprovalGate>
    </HubGate>
  );
}
