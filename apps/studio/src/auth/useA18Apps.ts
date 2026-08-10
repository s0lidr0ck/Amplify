import { useAction, useQuery } from "convex/react";
import { useCallback } from "react";
import { api } from "@convex/api";

// CANONICAL A18-APPS KIT — copied per app (Crew is the source of truth).
// The account menu's data: who you are, which of the family you can actually
// walk into, and how to get there. Every copy of this file must stay
// identical; only the markup that consumes it is app-specific.
//
// A hook rather than a component on purpose. The eight apps run three
// different UI stacks — UpScreen and Home have no Tailwind, radix or lucide
// at all — so no shared component could render natively in all of them.
// Shared data can. This is the same line hubAuth.tsx draws.

export type AppKey =
  | "study" | "churchtap" | "sermonsearch" | "talk"
  | "crew" | "upscreen" | "amplify" | "songbook";

export type A18App = { key: AppKey; label: string; url: string; color: string };

const HUB_URL: string =
  (import.meta.env.VITE_HUB_URL as string | undefined) ??
  "https://home.a1-8.com";

// Long enough that a healthy mint always wins, short enough that a hung one
// is not a blank tab somebody stares at. The fallback is not a failure — it
// is exactly what every cross-app link did before codes existed.
const MINT_TIMEOUT_MS = 1500;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("mint timed out")), ms),
    ),
  ]);
}

export function useA18Apps(self: AppKey): {
  user: { name: string; email?: string; avatarUrl: string | null } | undefined;
  apps: A18App[];
  hubUrl: string;
  launch: (url: string) => void;
} {
  const data = useQuery(api.home.myApps);
  const mint = useAction(api.sso.mintCode);

  const launch = useCallback(
    (url: string) => {
      // Synchronous, inside the click: this is what the popup blocker sees.
      // Everything after the first await is too late to open a tab.
      const w = window.open("", "_blank");
      if (!w) return;
      void (async () => {
        try {
          const code = await withTimeout(
            mint({ redirectOrigin: new URL(url).origin }),
            MINT_TIMEOUT_MS,
          );
          w.location.href = `${url}?ssoCode=${code}`;
        } catch {
          // Offline, session just died, or an origin the hub will not mint
          // for (every localhost, unless SSO_EXTRA_ORIGINS says otherwise).
          // HubGate's silent bounce takes it from here.
          w.location.href = url;
        }
      })();
    },
    [mint],
  );

  const raw = data?.user;
  const user = raw
    ? {
        name:
          raw.name ||
          [raw.firstName, raw.lastName].filter(Boolean).join(" ") ||
          raw.email ||
          "Me",
        email: raw.email,
        avatarUrl: raw.avatarUrl,
      }
    : undefined;

  return {
    user,
    // A missing query means no apps band, never a broken menu: eight
    // production apps hang off one query and none of them may hard-fail on it.
    apps: ((data?.apps ?? []) as A18App[]).filter((a) => a.key !== self),
    hubUrl: HUB_URL,
    launch,
  };
}
