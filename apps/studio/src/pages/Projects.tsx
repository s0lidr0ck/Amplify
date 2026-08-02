import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useState } from "react";

import { Mark } from "../brand/Mark";

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
          <input
            value={speaker}
            onChange={(e) => setSpeaker(e.target.value)}
            placeholder="Who preached it"
            className={field}
          />
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

export function ProjectsPage({
  churchId,
  churches,
  onChooseChurch,
}: {
  churchId: string;
  churches: { churchId: string; name: string }[];
  onChooseChurch: (id: string) => void;
}) {
  const id = churchId as Id<"churches">;
  const projects = useQuery(api.amplify.listProjects, { churchId: id });
  const here = churches.find((c) => c.churchId === churchId);
  const [adding, setAdding] = useState(false);

  return (
    <div className="mx-auto grid max-w-4xl gap-5 px-5 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-brand">
            <Mark size={26} title="Amplify" />
          </span>
          <span className="font-display text-xl font-semibold tracking-tight text-ink">
            Amplify
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          {/* Only when there is a real choice. One church needs no chooser,
              and offering one is a step that never had an answer — but with
              two, silently taking the first files a sermon under the wrong
              church and says nothing, which is how the first one added to
              this rebuild ended up in the wrong place. */}
          {churches.length > 1 ? (
            <label className="flex items-center gap-1.5">
              <span className="sr-only">Church</span>
              <select
                value={churchId}
                onChange={(e) => onChooseChurch(e.target.value)}
                className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
              >
                {churches.map((c) => (
                  <option key={c.churchId} value={c.churchId}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : here ? (
            // One church: state it rather than offering it, so what you are
            // adding to is never a guess.
            <span className="text-2xs text-muted">{here.name}</span>
          ) : null}
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
          {projects.map((p) => (
            <li
              key={p._id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3"
            >
              <span className="font-medium text-ink">{p.title}</span>
              {/* Mono so the dates line up between rows when scanning. */}
              <span className="font-mono text-2xs text-muted">
                {formatSermonDate(p.sermonDate)}
              </span>
              <span className="text-2xs text-muted">
                {p.speakerDisplayName ?? p.speaker}
              </span>
              <span className="ml-auto rounded-md bg-surface-strong px-2 py-0.5 text-2xs font-medium text-muted">
                {p.status.replace(/_/g, " ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
