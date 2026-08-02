# Amplify inside the A1:8 ecosystem

**Status:** Proposed
**Date:** 2026-08-02
**Decision taken:** start clean. A full Postgres snapshot (22 tables, 6,465 rows)
and schema dump are parked at `backups/amplify/`. Nothing is destroyed; nothing
is imported.

---

## Why

Every problem Amplify hit this week was a boundary problem, not an Amplify
problem:

- Two authentication systems, built in parallel, neither aware of the other
- Two migrations both numbered `007`, one applied to production
- Organisations, roles and members modelled a second time in Postgres when the
  platform already has them
- A `plans` table invented to gate access, when `churchMemberships.appAccess`
  already lists `"amplify"` as a grant
- CORS, split hosting, and a token bridge between two stacks

None of those exist for Crew, Study, UpScreen or ChurchTap. They exist because
Amplify is the only app off the shared backend.

The fix is not another adapter. It is to stop having a boundary.

---

## What moves, and what cannot

Convex cannot run FFmpeg, cannot run faster-whisper, has no GPU, and its
actions time out well short of transcribing an hour of audio. That is a
capability limit, not a preference, and it draws the line:

| Concern | Home | Why |
|---|---|---|
| Identity, churches, members, roles, app access | **Convex (shared)** | Already exists; `appAccess` already lists `amplify` |
| Projects, transcripts, clips, drafts, publications, jobs | **Convex (shared)** | Records, not compute. Reactive for free. |
| Trim, transcribe, YouTube import, clip analysis | **Worker container** | FFmpeg and Whisper. Stays where it is. |
| Media bytes (source video, masters, reels) | **S3** | GB-scale files with byte-range playback |
| Outbound publishing (YouTube, TikTok, Wix, Facebook) | **Convex actions** | Ordinary outbound HTTP |

Roughly: **~5,800 lines of routers and most of the 3,000 lines of libs move.
The 637-line worker stays.**

---

## Shape

```
   browser ──── Convex (shared A1:8 deployment) ──── S3
                  │  projects, transcripts, clips,
                  │  drafts, jobs, publications
                  │  + churches / members / roles
                  │
                  │  HTTP, shared secret
                  ▼
            worker container  ──── FFmpeg · faster-whisper
```

- The browser talks to Convex directly, the way Crew does. No API layer, no
  CORS, no token bridge.
- The worker **polls** Convex for queued jobs over HTTP and writes results
  back. Convex's scheduler cannot reach into a container, so the container
  asks. Guarded by a shared secret — the same pattern already written in
  `services/api/app/lib/worker_auth.py`, which transfers.
- Media never passes through Convex. The browser uploads to S3 with a
  presigned URL minted by a Convex action; playback is a signed S3 URL. The
  reasoning in `media_tokens.py` transfers: a `<video src>` cannot carry an
  Authorization header, so the capability travels in the URL and expires.

---

## Tables

Prefixed `amplify*`, matching `crew*` and `upscreen*` on the shared schema:

| Table | Holds |
|---|---|
| `amplifyProjects` | one sermon: title, speaker, date, status, `churchId` |
| `amplifyAssets` | media records — kind, S3 key, duration, dimensions |
| `amplifyTranscripts` | text, segments, scope, approval |
| `amplifyClips` | candidates, scores, in/out points |
| `amplifyDrafts` | generated outputs keyed by kind (blog, metadata, reel…) |
| `amplifyJobs` | queued work for the worker, and its progress |
| `amplifyPublications` | what went where, and when |

`churchId` replaces `organization_id` throughout. There is no Amplify `users`
or `organizations` table — those are the hub's.

## Access

No `plans` table. Gate on what the platform already has:

- Membership in the church (`churchMemberships`)
- `appAccess` containing `"amplify"`, or an admin role, which implies it

Approving a church becomes an existing A1:8 admin action, not an Amplify one.
`scripts/access.py` is deleted rather than ported.

---

## Frontend

**Recommendation: rebuild the shell in Vite + React Router, matching Crew.**

Not for tidiness. The canonical hub-auth kit is written for Vite, and porting
it to Next cost a real bug this week: deferring a synchronous URL read into an
effect opened a race that bounced the browser back to the hub mid-exchange.
Server rendering buys this app nothing — all 26 of its pages are already
`"use client"`, and it is a private tool with no SEO case.

The 54 source files are mostly components that move unchanged. What changes is
routing and data fetching: `useQuery` from `convex/react` replaces TanStack
Query plus `lib/api.ts`, and loading states largely disappear because Convex
subscriptions arrive with data.

**Kept from the redesign** — all of it is framework-agnostic:

- `brand/Mark.tsx` — the amplifier mark and its small cut
- The palette and type scale in `globals.css` / `tailwind.config.ts`
- `lib/stageGating.ts` and its 20 tests — pure logic, no React
- `SignalRail.tsx`, `ProjectTopBar.tsx` — components, not pages
- The quieted Card / Badge / label vocabulary

---

## Staging

Each stage ends somewhere usable, and nothing is deleted until its replacement
works.

1. **Schema and access.** `amplify*` tables on the shared deployment; gate on
   membership plus `appAccess`. Nothing user-facing.
2. **Projects.** Create, list, open one. Proves identity, tenancy and
   reactivity end to end with the smallest possible surface.
3. **Ingest.** S3 presigned upload, then trim and transcribe through the
   worker's new polling loop. This is the riskiest stage — it is the only one
   crossing the Convex/container boundary — so it comes early, while it is
   cheap to change.
4. **Generate.** Clips, reel, blog, metadata. Mostly moving prompt code into
   Convex actions.
5. **Publish and results.** YouTube, TikTok, Wix, Facebook.
6. **Retire.** Turn off the FastAPI service; drop the Postgres database once a
   month has passed without wanting it.

Stages 1–3 are the migration proper. If it is going to go wrong it goes wrong
there, and stopping after 3 still leaves something that works.

---

## Loose ends this closes

- The `alembic_version` row rewritten on production stops mattering — the
  database is retired rather than deployed onto.
- `feat/hub-auth` and `codex/app-overhaul-2026-03-24` are both abandoned. The
  design commits are cherry-picked forward; the hub-auth-over-FastAPI work is
  not.
- `main`'s email/password auth, `invite_tokens`, `middleware.ts` and
  `AuthContext.tsx` are deleted rather than migrated.
- Amplify gets promoted from a link to a real tile in the Home launcher, which
  it could not be while it had no hub wiring.

## Open

- **Per-church publishing credentials.** YouTube, TikTok, Wix and Facebook
  tokens currently come from environment variables, so every church would
  publish to the same channel. This must be solved before a second church is
  approved; it needs a decision on where per-church secrets live.
- **Prompt overrides** are a single JSON file on disk today. Per-church, with
  or without global defaults, is a product decision.
