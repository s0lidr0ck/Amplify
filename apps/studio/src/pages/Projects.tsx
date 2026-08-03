import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Mark } from "../brand/Mark";
import { nextStep, ProgressRail, type Progress } from "../components/Progress";

/**
 * The sermon list, and adding one.
 *
 * Deliberately the whole of stage two. It is the smallest thing that proves
 * the shape end to end — hub identity, church tenancy, app access, and live
 * data — and until it works there is no point building on top of it.
 */

/** A plain date, formatted without a timezone changing the day. */
function formatSermonDate(value: string): string {
  // `new Date("2026-08-09")` is parsed as UTC midnight and renders as the 8th
  // for anyone west of Greenwich, which is everyone using this.
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function todayLocal(): string {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

function NewSermon({
  churchId,
  open,
  setOpen,
}: {
  churchId: Id<"churches">;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const createProject = useMutation(api.amplify.createProject);
  const [title, setTitle] = useState("");
  const [speaker, setSpeaker] = useState("");
  const speakers = useQuery(api.amplifyLibrary.speakers, {
    churchId: churchId as Id<"churches">,
  });
  const [sermonDate, setSermonDate] = useState(todayLocal());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    void createProject({ churchId, title, speaker, sermonDate })
      .then(() => {
        // No refetch: the list is a subscription and already has this row.
        setOpen(false);
        setTitle("");
        setSpeaker("");
        setSermonDate(todayLocal());
      })
      .catch((e: unknown) =>
        setError(
          e instanceof Error
            ? e.message.replace(/^.*Error:\s*/, "")
            : "Couldn't add that",
        ),
      )
      .finally(() => setSaving(false));
  };

  const field =
    "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand";

  return (
    <form onSubmit={submit} className="card grid gap-3 p-4">
      <p className="section-label">New sermon</p>
      <div className="grid gap-2.5 sm:grid-cols-3">
        <label className="grid gap-1">
          <span className="text-2xs text-muted">Title</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Rooted"
            className={field}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-2xs text-muted">Speaker</span>
          {/* Suggestions, not a dropdown. Churches have guests, and a
              required list makes filing a guest sermon a small bureaucratic
              event. But free text drifts — the same preacher becomes
              "Bro. Cory", "Cory Sanders" and "cory", and then no filter
              finds all three. A datalist offers the history and still lets
              anyone type a name that has never been used. */}
          <input
            value={speaker}
            onChange={(e) => setSpeaker(e.target.value)}
            placeholder="Who preached it"
            list="known-speakers"
            className={field}
          />
          <datalist id="known-speakers">
            {(speakers ?? []).map((s) => (
              <option key={s.name} value={s.name} />
            ))}
          </datalist>
        </label>
        <label className="grid gap-1">
          <span className="text-2xs text-muted">Date preached</span>
          <input
            type="date"
            value={sermonDate}
            onChange={(e) => setSermonDate(e.target.value)}
            className={field}
          />
        </label>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-ink px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-ink/85 disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add sermon"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="rounded-lg px-3 py-2 text-sm text-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ProjectsPage({ churchId }: { churchId: string }) {
  const id = churchId as Id<"churches">;
  const projects = useQuery(api.amplify.listProjects, { churchId: id });
  // A second subscription rather than a fatter first one: the list must draw
  // the moment the names arrive. Waiting on five sub-queries per sermon
  // before showing anything would make the fast query as slow as the slow
  // one, and the names are what somebody is looking for.
  const progress = useQuery(api.amplifyProgress.forChurch, { churchId: id });
  const byProject = new Map<string, Progress>(
    (progress ?? []).map((p) => [p.projectId, p]),
  );
  const [adding, setAdding] = useState(false);

  const unfinished = (progress ?? []).filter((p) => !p.out).length;

  return (
    <div className="mx-auto grid max-w-4xl gap-6 px-5 py-9">
      {/* The wordmark and the church picker moved to the shell, which every
          page wears. This header now says what this page is for. */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[2.125rem] font-bold leading-[1.15] tracking-[-0.02em] text-ink">
            Sermons
          </h1>
          <p className="mt-1 text-sm text-muted">
            {projects === undefined
              ? " "
              : projects.length === 0
                ? "Nothing here yet."
                : // What's left, not what exists. A count of sermons is a
                  // fact about the past; a count of unfinished ones is the
                  // reason somebody opened this page.
                  unfinished > 0
                  ? `${unfinished} still ${unfinished === 1 ? "needs" : "need"} work.`
                  : "Everything here has gone out."}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setAdding((v) => !v)}
            className="rounded-lg bg-ink px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-ink/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Add a sermon
          </button>
        </div>
      </header>

      <NewSermon churchId={id} open={adding} setOpen={setAdding} />

      {projects === undefined ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : projects.length === 0 ? (
        // An empty screen is an invitation, not a dead end.
        <div className="card grid gap-1.5 p-8 text-center">
          <p className="font-display text-lg font-semibold text-ink">
            No sermons yet
          </p>
          <p className="text-sm text-muted">
            Add the one you preached on Sunday and Amplify will turn it into a
            week of content.
          </p>
        </div>
      ) : (
        <ul className="card divide-y divide-border">
          {projects.map((p) => {
            const prog = byProject.get(p._id);
            const next = nextStep(prog);

            return (
              <li key={p._id}>
                <Link
                  to={`/projects/${p._id}`}
                  className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-surface-strong focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-brand"
                >
                  <div className="min-w-0 flex-1">
                    {/* The title carries the row. It was the same size and
                        weight as the date and the speaker, so nothing in the
                        list was easier to find than anything else. */}
                    <p className="truncate font-display text-[1.0625rem] font-semibold leading-snug tracking-[-0.01em] text-ink">
                      {p.title}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-muted">
                      {/* Mono so the dates line up down the column. */}
                      <span className="data">
                        {formatSermonDate(p.sermonDate)}
                      </span>
                      {(p.speakerDisplayName ?? p.speaker) && (
                        <>
                          <span
                            className="h-2.5 w-px bg-border"
                            aria-hidden
                          />
                          <span>{p.speakerDisplayName ?? p.speaker}</span>
                        </>
                      )}
                    </p>
                  </div>

                  {/* On a phone the rail is the whole answer; the sentence
                      needs room the row does not have. */}
                  <div className="hidden shrink-0 sm:block sm:w-40 sm:text-right">
                    <p
                      className={`text-2xs ${next ? "text-muted" : "font-medium text-ok"}`}
                    >
                      {prog === undefined ? "" : (next ?? "Out the door")}
                    </p>
                  </div>
                  <ProgressRail progress={prog} className="shrink-0" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
