import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useState } from "react";

/**
 * Who preached it, when, and what it is called — after the fact.
 *
 * These were settable once, on the New sermon form, and never again:
 * `amplify.updateProject` has accepted them all along and nothing in Studio
 * called it. So a sermon entered against the wrong person could only be fixed
 * by renaming that person on the roster, which moves every sermon they have.
 *
 * It matters more than a typo. Study copies these onto a published guide, and
 * its catalog now files guides BY speaker, day and service — so a wrong name
 * here puts the guide under the wrong person for every reader. The Convex side
 * pushes corrections through to a published guide; this is the door.
 */
const field =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand";

const GUEST = "__guest__";

export function EditSermonDetails({
  projectId,
  churchId,
  title,
  speaker,
  speakerDisplayName,
  sermonDate,
  sermonTime,
}: {
  projectId: Id<"amplifyProjects">;
  churchId: Id<"churches">;
  title: string;
  speaker: string;
  speakerDisplayName?: string;
  sermonDate: string;
  sermonTime?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const speakers = useQuery(api.amplifySpeakers.list, { churchId });
  const update = useMutation(api.amplify.updateProject);
  const addSpeaker = useMutation(api.amplifySpeakers.add);

  const [t, setT] = useState(title);
  const [date, setDate] = useState(sermonDate);
  const [time, setTime] = useState(sermonTime ?? "");
  // The roster row whose name matches, so reopening the form shows who is on
  // the sermon rather than an empty box.
  const matching = (speakers ?? []).find(
    s => s.name.trim().toLowerCase() === speaker.trim().toLowerCase(),
  );
  const [chosen, setChosen] = useState<string>(matching?._id ?? GUEST);
  const [guest, setGuest] = useState(matching ? "" : speaker);
  const [guestCalled, setGuestCalled] = useState(
    matching ? "" : (speakerDisplayName ?? ""),
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-muted underline-offset-2 transition-colors hover:text-ink hover:underline"
      >
        Edit details
      </button>
    );
  }

  const isGuest = chosen === GUEST;
  const picked = (speakers ?? []).find(s => s._id === chosen);

  async function save() {
    setError(null);
    const name = (isGuest ? guest : (picked?.name ?? "")).trim();
    if (!t.trim()) return setError("A sermon needs a title.");
    if (!name) return setError("A sermon needs a speaker.");

    setBusy(true);
    try {
      await update({
        projectId,
        title: t.trim(),
        speaker: name,
        speakerDisplayName: isGuest
          ? guestCalled.trim()
          : (picked?.displayName ?? ""),
        sermonDate: date,
        sermonTime: time || undefined,
      });
      // A guest corrected onto a sermon is usually a guest who will preach
      // again — the roster grows from use, exactly as it does on the New
      // sermon form.
      if (isGuest && name) {
        await addSpeaker({
          churchId,
          name,
          displayName: guestCalled.trim() || name,
        }).catch(() => {});
      }
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mt-3 grid gap-3 p-4">
      <p className="section-label">Sermon details</p>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1">
          <span className="text-2xs text-muted">Title</span>
          <input value={t} onChange={e => setT(e.target.value)} className={field} />
        </label>
        <label className="grid gap-1">
          <span className="text-2xs text-muted">Speaker</span>
          <select
            value={chosen}
            onChange={e => setChosen(e.target.value)}
            className={field}
          >
            {(speakers ?? []).map(s => (
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
            value={date}
            onChange={e => setDate(e.target.value)}
            className={field}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-2xs text-muted">
            Service time <span className="text-faint">optional</span>
          </span>
          <input
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
            className={field}
          />
        </label>
      </div>

      {isGuest && (
        <div className="grid gap-2.5 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-2xs text-muted">Their name</span>
            <input
              value={guest}
              onChange={e => setGuest(e.target.value)}
              placeholder="Chris Tidwell"
              className={field}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-2xs text-muted">
              What the church calls them
            </span>
            <input
              value={guestCalled}
              onChange={e => setGuestCalled(e.target.value)}
              placeholder="Pastor Chris"
              className={field}
            />
          </label>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="btn btn-primary text-sm disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save details"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted transition-colors hover:text-ink"
        >
          Cancel
        </button>
        {/* Said out loud, because the consequence reaches another product. */}
        <span className="ml-auto text-2xs text-faint">
          A published study guide updates with it.
        </span>
      </div>
    </div>
  );
}
