"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

/**
 * Holds back anyone whose church has not been approved.
 *
 * Amplify is invite-only. Without this a signed-in but unapproved visitor
 * would reach the full app and meet a 403 on every single request — a wall of
 * red with nothing to say why, which reads as broken rather than as waiting.
 *
 * `/api/me` is the one route open to them, which is what makes this possible.
 */

type Me = {
  user_id: string;
  organization_id: string;
  organization_name: string | null;
  name: string | null;
  email: string | null;
  plan: string;
  plan_label: string;
  has_access: boolean;
};

export function ApprovalGate({ children }: { children: React.ReactNode }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<Me>("/api/me"),
    // The answer changes when a human approves the church, not on a timer.
    staleTime: 60_000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  // A failure here is not the same as being refused. Showing the waiting
  // screen when the API is merely unreachable would tell an approved user
  // they are not approved, which is worse than an honest error.
  if (isError || !data) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="grid max-w-sm gap-2 text-center">
          <p className="text-sm font-medium text-slate-900">
            Can&rsquo;t reach Amplify right now.
          </p>
          <p className="text-xs text-slate-500">
            This is usually temporary. Refresh in a moment.
          </p>
        </div>
      </div>
    );
  }

  if (data.has_access) return <>{children}</>;

  const suspended = data.plan === "suspended";
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 p-6">
      <div className="grid w-full max-w-md gap-3 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <span className="text-xl font-extrabold tracking-tight text-slate-900">
          Amplify
        </span>
        {suspended ? (
          <>
            <p className="text-sm text-slate-900">
              This account&rsquo;s access has been paused.
            </p>
            <p className="text-sm text-slate-500">
              Get in touch and we&rsquo;ll sort it out.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-900">
              You&rsquo;re signed in — Amplify is invite-only while we get it
              ready.
            </p>
            <p className="text-sm text-slate-500">
              Your request is with us. We&rsquo;ll email{" "}
              {data.email ? (
                <span className="font-medium text-slate-700">{data.email}</span>
              ) : (
                "you"
              )}{" "}
              as soon as your church is set up.
            </p>
          </>
        )}
        <p className="border-t border-slate-100 pt-3 text-xs text-slate-400">
          Signed in as {data.name || data.email || "your A1:8 account"}
        </p>
      </div>
    </div>
  );
}
