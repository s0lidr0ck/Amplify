import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useState } from "react";

import { errorText } from "../lib/errorText";

/**
 * Who preaches here, and what the church calls them.
 *
 * Two columns because the two names do two different jobs. The left one is
 * the record — it files the sermon and sorts the library. The right one is
 * what reaches the writing, and it is the whole reason this screen exists:
 * a blog post that says "Chris Tidwell" in every paragraph reads like it
 * was written by somebody who has never been in the building.
 */

const field =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand";

function Row({
  speaker,
}: {
  speaker: { _id: Id<"amplifySpeakers">; name: string; displayName: string };
}) {
  const update = useMutation(api.amplifySpeakers.update);
  const archive = useMutation(api.amplifySpeakers.archive);
  const [name, setName] = useState(speaker.name);
  const [displayName, setDisplayName] = useState(speaker.displayName);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const dirty = name !== speaker.name || displayName !== speaker.displayName;

  return (
    <li className="grid gap-2 px-4 py-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Chris Tidwell"
          className={field}
        />
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Pastor Chris"
          className={field}
        />
        <div className="flex items-center gap-3 sm:justify-end">
          {dirty && (
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setNote(null);
                try {
                  const touched = await update({
                    speakerId: speaker._id,
                    name,
                    displayName,
                  });
                  // Said out loud, because it reached rows this screen is
                  // not showing. A rename that silently rewrote nine
                  // sermons is a surprise worth spending a line on.
                  setNote(
                    touched === 0
                      ? "Saved"
                      : `Saved — and renamed on ${touched} sermon${touched === 1 ? "" : "s"}`,
                  );
                } catch (e) {
                  setNote(errorText(e, "Couldn't save that"));
                } finally {
                  setBusy(false);
                }
              }}
              className="rounded-lg border border-transparent bg-ink px-3 py-1.5 text-2xs font-medium text-white hover:bg-ink/85 disabled:opacity-40"
            >
              Save
            </button>
          )}
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await archive({ speakerId: speaker._id });
              } catch (e) {
                setNote(errorText(e, "Couldn't remove that"));
                setBusy(false);
              }
            }}
            className="text-2xs text-muted underline hover:text-danger"
          >
            Remove
          </button>
        </div>
      </div>
      {note && <p className="text-2xs text-faint">{note}</p>}
    </li>
  );
}

export function Speakers({ churchId }: { churchId: string }) {
  const id = churchId as Id<"churches">;
  const speakers = useQuery(api.amplifySpeakers.list, { churchId: id });
  const unrostered = useQuery(api.amplifySpeakers.unrostered, { churchId: id });
  const add = useMutation(api.amplifySpeakers.add);

  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (n: string, d: string) => {
    setBusy(true);
    setError(null);
    try {
      await add({ churchId: id, name: n, displayName: d });
      setName("");
      setDisplayName("");
    } catch (e) {
      setError(errorText(e, "Couldn't add that"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <p className="section-label">Who preaches here</p>
        <p className="text-2xs text-muted">
          The name on the record, and what your church actually calls them.
          Everything written for people to read uses the second one.
        </p>
      </div>

      {speakers && speakers.length > 0 && (
        <ul className="card divide-y divide-border">
          {speakers.map((s) => (
            <Row key={s._id} speaker={s} />
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(name, displayName);
        }}
        className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-center"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Chris Tidwell"
          aria-label="Name"
          className={field}
        />
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Pastor Chris"
          aria-label="What your church calls them"
          className={field}
        />
        <button
          disabled={busy || !name.trim()}
          className="rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:border-border-strong disabled:opacity-40 sm:justify-self-start"
        >
          Add
        </button>
      </form>

      {error && <p className="text-2xs text-danger">{error}</p>}

      {/* The names already filed. A church arriving here has a history of
          typed names and an empty roster, and retyping what they have
          already entered is the kind of setup step that gets abandoned. */}
      {unrostered && unrostered.length > 0 && (
        <div className="grid gap-1.5">
          <p className="text-2xs text-muted">
            Already used on sermons, not on this list yet:
          </p>
          <div className="flex flex-wrap gap-2">
            {unrostered.map((u) => (
              <button
                key={u.name}
                disabled={busy}
                onClick={() => {
                  // Fills the form rather than adding straight away — the
                  // familiar name is the point, and adding somebody with
                  // both fields the same would quietly defeat it.
                  setName(u.name);
                  setDisplayName("");
                }}
                className="rounded-full border border-border bg-surface px-3 py-1 text-2xs text-ink hover:border-border-strong"
              >
                {u.name}
                <span className="ml-1.5 text-faint">
                  {u.sermons} sermon{u.sermons === 1 ? "" : "s"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
