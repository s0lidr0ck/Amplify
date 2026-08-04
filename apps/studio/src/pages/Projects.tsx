import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Mark } from "../brand/Mark";
import { nextStep, ProgressRail, type Progress } from "../components/Progress";
import { formatSermonDate, todayLocal } from "../lib/dates";
import { errorText } from "../lib/errorText";

/**
 * The sermon list, and adding one.
 *
 * Deliberately the whole of stage two. It is the smallest thing that proves
 * the shape end to end — hub identity, church tenancy, app access, and live
 * data — and until it works there is no point building on top of it.
 */

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
  const addSpeaker = useMutation(api.amplifySpeakers.add);
  const [title, setTitle] = useState("");
  const speakers = useQuery(api.amplifySpeakers.list, {
    churchId: churchId as Id<"churches">,
  });
  // The roster row chosen, or GUEST for somebody who is not on it.
  const [chosen, setChosen] = useState("");
  const [guest, setGuest] = useState("");
  const [guestCalled, setGuestCalled] = useState("");
  const [sermonDate, setSermonDate] = useState(todayLocal());
  // Optional, and worth having: three services on one Sunday are three
  // sermons on one date, and the time is the only thing telling the morning
  // one from the evening one at a glance. It is also what the website's
  // Date-and-Time field wants, instead of Amplify assuming midday.
  const [sermonTime, setSermonTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const GUEST = "__guest__";
  const isGuest = chosen === GUEST;
  const picked = (speakers ?? []).find((s) => s._id === chosen);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const speaker = isGuest ? guest : (picked?.name ?? "");
    const speakerDisplayName = isGuest
      ? guestCalled
      : (picked?.displayName ?? "");

    void (async () => {
      try {
        await createProject({
          churchId,
          title,
          speaker,
          speakerDisplayName,
          sermonDate,
          sermonTime: sermonTime || undefined,
        });
        // A guest who gets written up once usually gets written up again.
        // Adding them here means the roster grows from use rather than
        // from somebody remembering to go and maintain it — and if they
        // never preach again, the roster row costs nothing.
        if (isGuest && guest.trim()) {
          await addSpeaker({
            churchId,
            name: guest,
            displayName: guestCalled,
          }).catch(() => {});
        }
        // No refetch: the list is a subscription and already has this row.
        setOpen(false);
        setTitle("");
        setChosen("");
        setGuest("");
        setGuestCalled("");
        setSermonDate(todayLocal());
        setSermonTime("");
      } catch (e) {
        setError(errorText(e, "Couldn't add that"));
      } finally {
        setSaving(false);
      }
    })();
  };

  const field =
    "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand";

  return (
    <form onSubmit={submit} className="card grid gap-3 p-4">
      <p className="section-label">New sermon</p>
      {/* Four fields now, so two-up on a tablet rather than three squeezed
          into a row with a fourth wrapping alone underneath. */}
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
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
          {/* A real list, because it carries something free text cannot:
              what the church calls this person. That second name is what
              reaches the writing, and typing a name into a box has no way
              to say it. Guests still get through — they just say who they
              are on the way past, which is how the list fills up. */}
          <select
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
            className={field}
          >
            <option value="">Who preached it</option>
            {(speakers ?? []).map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
                {s.displayName !== s.name ? ` — ${s.displayName}` : ""}
              </option>
            ))}
            <option value={GUEST}>Someone else…</option>
          </select>
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
        <label className="grid gap-1">
          <span className="text-2xs text-muted">
            Service time <span className="text-faint">optional</span>
          </span>
          <input
            type="time"
            value={sermonTime}
            onChange={(e) => setSermonTime(e.target.value)}
            className={field}
          />
        </label>
      </div>

      {/* Only when it is needed. Two extra boxes on every sermon, greyed
          out and unexplained, would be worse than the datalist this
          replaced. */}
      {isGuest && (
        <div className="grid gap-2.5 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-2xs text-muted">Their name</span>
            <input
              autoFocus
              value={guest}
              onChange={(e) => setGuest(e.target.value)}
              placeholder="Chris Tidwell"
              className={field}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-2xs text-muted">
              What we call them, in the writing
            </span>
            <input
              value={guestCalled}
              onChange={(e) => setGuestCalled(e.target.value)}
              placeholder="Pastor Chris"
              className={field}
            />
          </label>
          <p className="text-2xs text-faint sm:col-span-2">
            They&rsquo;ll be added to the list, so next time they&rsquo;re one
            tap away.
          </p>
        </div>
      )}

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
                      {/* The name on the record, not the familiar one. This
                          is the filing cabinet; "Pastor Chris" belongs in
                          the writing, and a list mixing both conventions
                          sorts badly and reads worse. */}
                      {p.speaker && (
                        <>
                          <span
                            className="h-2.5 w-px bg-border"
                            aria-hidden
                          />
                          <span>{p.speaker}</span>
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
