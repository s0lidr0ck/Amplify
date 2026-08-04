import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useState } from "react";

import { errorText } from "../lib/errorText";

/**
 * Sending it out.
 *
 * Two ways, one list. Where the church has connected the account, Amplify
 * posts it and records what came back. Where it hasn't, somebody posts it by
 * hand and ticks it off — and that tick stays whether or not anything is
 * connected, because the question a media team cannot answer on a Tuesday is
 * "did anybody put the reel up?", and the usual answer is a group chat.
 *
 * What can go where is decided on the server, not here. It used to be a list
 * of required pieces in this file and a second list in the backend, and the
 * moment those two disagree the button lies about what it is going to post.
 */

/** What each row is, in a sentence, when there is nothing more urgent to say. */
const NOTES: Record<string, string> = {
  youtube: "The full sermon, with its title and description.",
  facebook: "The short written version.",
  instagram: "The clip, as a reel.",
  tiktok: "The clip.",
  blog: "The long-form write-up, for your website.",
};

/**
 * A sensible first offer for "go public at…".
 *
 * Tomorrow morning rather than now: a time already past makes YouTube
 * publish immediately, which is the opposite of scheduling, and an empty
 * box makes somebody do date arithmetic before they can press anything.
 */
function defaultPublishAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  // datetime-local wants local wall-clock with no zone, so the timezone
  // offset has to come off before slicing.
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function Publish({ projectId }: { projectId: Id<"amplifyProjects"> }) {
  const rows = useQuery(api.amplifyPublish.readiness, { projectId });
  const publications = useQuery(api.amplifyPublish.list, { projectId });
  const transcript = useQuery(api.amplifyTranscripts.summary, { projectId });
  const assets = useQuery(api.amplifyMedia.listAssets, { projectId });

  const mark = useMutation(api.amplifyPublish.mark);
  const send = useMutation(api.amplifyPublish.send);
  const playbackUrl = useAction(api.amplifyMedia.playbackUrl);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Null means unlisted; a datetime-local string means schedule it. One
  // piece of state rather than two, because the two are mutually exclusive
  // and separate fields would let the screen ask for "unlisted at 9am",
  // which YouTube refuses.
  const [when, setWhen] = useState<string | null>(null);
  const shareToken = useQuery(api.amplifyShare.linkFor, { projectId });
  const createLink = useMutation(api.amplifyShare.createLink);
  const revokeLink = useMutation(api.amplifyShare.revoke);
  const [copied, setCopied] = useState(false);

  if (!rows || publications === undefined || !assets) return null;

  // Keyed by destination AND reel: Instagram can hold several rows for one
  // sermon now, and keying on destination alone made the last reel's status
  // stand for all of them.
  const key = (target: string, subjectId: string | null) =>
    `${target}::${subjectId ?? ""}`;
  const done = new Map(
    publications.map((p) => [key(p.target, p.subjectId), p]),
  );
  const out = publications.filter((p) => p.status === "posted").length;
  const approved = transcript?.approved ?? false;

  const openFile = async (kind: string) => {
    const asset = assets.find((a) => a.kind === kind && a.status === "ready");
    if (!asset) return;
    setBusy(kind);
    try {
      const url = await playbackUrl({ assetId: asset._id });
      window.open(url, "_blank", "noopener");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card grid gap-3 p-5">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        {/* The room heading already says Publish. */}
        <span className="data">
          {out} of {rows.length} out
        </span>
      </div>

      {/* The one gate that is about the church's name rather than about
          convenience, so it is stated once at the top rather than repeated
          on every row. */}
      {!approved && (
        <p className="text-[0.8125rem] text-muted">
          The transcript hasn&rsquo;t been approved yet. Everything below was
          written from it.
        </p>
      )}

      {/* Before any of it goes out, the person who preached it usually wants
          to read it — and he has no login. Without this the review happens
          by pasting six things into a text message, which is how the wrong
          version gets approved. */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-xl bg-surface-strong px-3.5 py-2.5">
        <span className="text-[0.8125rem] text-muted">
          {shareToken
            ? "Anyone with the link can read the writing. Nothing else."
            : "Send it to the pastor to check first — no login needed."}
        </span>
        {shareToken ? (
          <div className="ml-auto flex items-center gap-2.5">
            <button
              onClick={() => {
                void navigator.clipboard.writeText(
                  `${window.location.origin}/share/${shareToken}`,
                );
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              }}
              className="rounded-lg bg-ink px-3 py-1.5 text-2xs font-medium text-white hover:bg-ink/85"
            >
              {copied ? "Copied" : "Copy the link"}
            </button>
            <button
              onClick={() => void revokeLink({ projectId })}
              className="text-2xs text-muted underline hover:text-ink"
            >
              Turn it off
            </button>
          </div>
        ) : (
          <button
            onClick={() => void createLink({ projectId })}
            className="ml-auto rounded-lg bg-ink px-3 py-1.5 text-2xs font-medium text-white hover:bg-ink/85"
          >
            Make a link
          </button>
        )}
      </div>

      {error && <p className="text-[0.8125rem] text-danger">{error}</p>}

      <ul className="-mx-5 -mb-5 border-t border-border">
        {rows.map((row) => {
          const record = done.get(key(row.destination, row.subjectId));
          const sending = record?.status === "sending";
          const posted = record?.status === "posted";
          const failed = record?.status === "failed";
          const file =
            row.destination === "youtube"
              ? "sermon_master"
              : row.destination === "instagram" || row.destination === "tiktok"
                ? "clip"
                : null;

          return (
            <li
              key={key(row.destination, row.subjectId)}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-5 py-3.5 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.9375rem] font-semibold text-ink">
                  {row.label}
                  {/* Which reel. Four Instagram rows that all say
                      "Instagram" are four rows nobody can act on. */}
                  {row.subjectLabel && (
                    <span className="min-w-0 truncate text-[0.8125rem] font-normal text-muted">
                      {row.subjectLabel}
                    </span>
                  )}
                  {posted && record.automatic && (
                    <span className="rounded-md bg-ok-soft px-2 py-0.5 text-2xs font-medium text-ok">
                      posted by Amplify
                    </span>
                  )}
                  {sending && (
                    // The only rose on this card, and only while something is
                    // genuinely in flight.
                    <span className="rounded-md bg-brand-soft px-2 py-0.5 text-2xs font-medium text-brand-strong">
                      sending
                    </span>
                  )}
                </p>
                <p className="text-[0.8125rem] text-muted">
                  {failed
                    ? // The platform's own words. "Publishing failed" sends
                      // somebody to the wrong place.
                      (record.error ?? "That didn't go through.")
                    : posted
                      ? record.publishedAt
                        ? `Posted ${new Date(record.publishedAt).toLocaleDateString()}`
                        : "Posted"
                      : sending
                        ? "Amplify is uploading it now."
                        : (row.reason ?? NOTES[row.destination] ?? "")}
                </p>
                {/* Not a refusal — said before the press because fixing it
                    afterwards means the same sermon on the channel twice. */}
                {row.warning && !posted && !sending && (
                  <p className="text-[0.8125rem] text-warn">{row.warning}</p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {posted && record.externalUrl && (
                  <a
                    href={record.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-2xs text-muted underline hover:text-ink"
                  >
                    See it
                  </a>
                )}
                {file && assets.some((a) => a.kind === file && a.status === "ready") && (
                  <button
                    disabled={busy === file}
                    onClick={() => void openFile(file)}
                    className="text-2xs text-muted underline hover:text-ink disabled:opacity-40"
                  >
                    {busy === file ? "Opening…" : "Open the file"}
                  </button>
                )}

                {/* Posting for you is the better answer where it is
                    available, so it gets the solid button; the manual tick
                    stays beside it, quiet, for everywhere it isn't. */}
                {/* Unlisted or scheduled, and never both — publishAt only
                    works on a private video, so YouTube itself refuses the
                    combination. Offering it as one choice keeps the browser
                    from asking for something the API will reject. */}
                {row.destination === "youtube" && row.canPost && !posted && !sending && (
                  <>
                    <select
                      value={when === null ? "unlisted" : "scheduled"}
                      onChange={(e) =>
                        setWhen(
                          e.target.value === "unlisted"
                            ? null
                            : // Next Sunday morning is a guess, but a guess
                              // in the right shape beats an empty field.
                              defaultPublishAt(),
                        )
                      }
                      className="rounded-lg border border-border bg-surface px-2 py-1 text-2xs text-ink"
                    >
                      <option value="unlisted">Unlisted</option>
                      <option value="scheduled">Go public at…</option>
                    </select>
                    {when !== null && (
                      <input
                        type="datetime-local"
                        value={when}
                        onChange={(e) => setWhen(e.target.value)}
                        className="rounded-lg border border-border bg-surface px-2 py-1 text-2xs text-ink"
                      />
                    )}
                  </>
                )}

                {row.canPost && !posted && !sending && (
                  <button
                    disabled={busy === row.destination}
                    onClick={async () => {
                      setBusy(row.destination);
                      setError(null);
                      try {
                        await send({
                          projectId,
                          destination: row.destination,
                          subjectId: row.subjectId ?? undefined,
                          ...(row.destination === "youtube" && when !== null
                            ? {
                                visibility: "scheduled",
                                // Read as church-local, which is what
                                // somebody typing into the box means.
                                publishAt: new Date(when).getTime(),
                              }
                            : {}),
                        });
                      } catch (e) {
                        setError(errorText(e, "Couldn't send that"));
                      } finally {
                        setBusy(null);
                      }
                    }}
                    className="rounded-lg bg-ink px-3 py-1.5 text-2xs font-medium text-white transition-colors hover:bg-ink/85 disabled:opacity-40"
                  >
                    {busy === row.destination
                      ? "Sending…"
                      : failed
                        ? "Try again"
                        : "Post it"}
                  </button>
                )}

                {!sending && (
                  <button
                    onClick={() =>
                      void mark({
                        projectId,
                        target: row.destination,
                        posted: !posted,
                        subjectId: row.subjectId ?? undefined,
                      })
                    }
                    className={`rounded-lg px-3 py-1.5 text-2xs font-medium transition-colors ${
                      posted
                        ? "bg-ok-soft text-ok hover:bg-surface-strong"
                        : row.canPost
                          ? "border border-border bg-surface text-muted hover:border-border-strong hover:text-ink"
                          : "bg-ink text-white hover:bg-ink/85"
                    }`}
                  >
                    {posted ? "Posted" : "Mark as posted"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
