import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useState } from "react";

/**
 * Reading the transcript, fixing it, and saying it is right.
 *
 * Everything downstream is built from this. A misheard name does not stay a
 * misheard name — it becomes a blog post, a video title and a social post,
 * all published under the church's name, and by then nobody remembers where
 * it came from. So this is where somebody reads it.
 *
 * Three things, in the order a person actually does them: read it, fix what
 * is wrong, then say it is right. Approval is a separate act from editing on
 * purpose — a transcript nobody has read is not approved just because nobody
 * changed anything.
 *
 * The correction is saved BESIDE the original rather than over it. When an
 * output later looks wrong, the first question is whether the transcript was
 * wrong or the writing was, and that is unanswerable if the original is
 * gone.
 */

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function Transcript({
  projectId,
}: {
  projectId: Id<"amplifyProjects">;
}) {
  const transcript = useQuery(api.amplifyTranscripts.forProject, { projectId });
  const saveCleaned = useMutation(api.amplifyTranscripts.saveCleaned);
  const approve = useMutation(api.amplifyTranscripts.approve);
  const enqueue = useMutation(api.amplifyWorker.enqueue);

  // Which file to transcribe, and whether one is already being read. The
  // sermon if it has been cut, the whole service otherwise — transcribing
  // the source after a trim describes the whole evening, worship and
  // notices included, and every output written from it inherits that.
  const assets = useQuery(api.amplifyMedia.listAssets, { projectId });
  const jobs = useQuery(api.amplifyWorker.listJobs, { projectId });
  const master = (assets ?? []).find((a) => a.kind === "sermon_master");
  const raw = (assets ?? []).find((a) => a.kind === "source_video");
  const source = (master ?? raw)?._id ?? null;
  const trimmed = Boolean(master);
  const running = (jobs ?? []).some(
    (j) =>
      j.jobType === "transcribe" &&
      (j.status === "running" || j.status === "queued"),
  );

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  if (transcript === undefined) return null;

  if (transcript === null) {
    // An empty screen is an invitation, and this is where somebody lands
    // when they are wondering where the transcript has got to — so the
    // button lives here rather than on the Source page, which is about the
    // file. Trimming queues one on its own; this is for the sermon that was
    // never trimmed, or a re-run.
    return (
      <div className="card grid justify-items-start gap-2 p-5">
        <p className="text-sm text-ink">
          {running
            ? "Claude is listening to the sermon now."
            : "No transcript yet."}
        </p>
        <p className="max-w-prose text-sm text-muted">
          {running
            ? "It takes a few minutes on the whole sermon. Everything else gets written from what comes back."
            : source
              ? "Everything else gets written from this, so it comes first."
              : "Upload the recording first."}
        </p>
        {!running && source && (
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await enqueue({
                  projectId,
                  jobType: "transcribe",
                  // The sermon if one has been cut, the whole service
                  // otherwise. Transcribing the source after a trim
                  // describes the whole evening — worship and notices
                  // included — and every output written from it inherits it.
                  payloadJson: JSON.stringify({ assetId: source }),
                });
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-ink/85 disabled:opacity-40"
          >
            {busy ? "Starting…" : trimmed ? "Transcribe the sermon" : "Transcribe the whole service"}
          </button>
        )}
      </div>
    );
  }

  const count = words(transcript.text);
  const approved = transcript.approvedAt !== null;

  return (
    <div className="card grid gap-3 p-4">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        {/* The room heading already says Transcript. */}
        <span className="data">{count.toLocaleString()} words</span>
        {transcript.language && (
          <span className="data uppercase">{transcript.language}</span>
        )}
        {approved ? (
          <span className="rounded-md bg-ok-soft px-2 py-0.5 text-2xs font-medium text-ok">
            approved
          </span>
        ) : (
          // Not styled as an error. An unapproved transcript is the normal
          // state of a transcript that was made ten seconds ago.
          <span className="text-[0.8125rem] text-muted">not approved yet</span>
        )}

        <div className="ml-auto flex items-center gap-2.5">
          {!editing && (
            // Seven thousand words is not something anybody is going to
            // select by dragging, least of all on a phone — and the panel is
            // collapsed, so a drag cannot reach the end of it anyway.
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(transcript.text);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                } catch {
                  // Clipboard access can be refused — an insecure origin, or
                  // a browser that wants a fresher gesture. Say so rather
                  // than leaving the button looking like it worked.
                  setCopied(false);
                  setCopyFailed(true);
                  window.setTimeout(() => setCopyFailed(false), 4000);
                }
              }}
              className="text-2xs text-muted underline hover:text-ink"
            >
              {copied
                ? "Copied"
                : copyFailed
                  ? "Couldn't copy"
                  : `Copy all ${count.toLocaleString()} words`}
            </button>
          )}
          {!editing && (
            <button
              onClick={() => {
                setDraft(transcript.text);
                setEditing(true);
                setExpanded(true);
              }}
              className="text-2xs text-muted underline hover:text-ink"
            >
              Fix something
            </button>
          )}
          {!approved && !editing && (
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await approve({ transcriptId: transcript._id });
                } finally {
                  setBusy(false);
                }
              }}
              className="rounded-lg bg-ink px-3 py-1.5 text-2xs font-medium text-white hover:bg-ink/85 disabled:opacity-40"
            >
              Looks right
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="grid gap-2">
          <textarea
            rows={20}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full resize-y rounded-xl border border-border bg-surface px-3.5 py-3 text-sm leading-relaxed text-ink focus:border-brand focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              disabled={busy || draft === transcript.text}
              onClick={async () => {
                setBusy(true);
                try {
                  await saveCleaned({
                    transcriptId: transcript._id,
                    cleanedText: draft,
                  });
                  setEditing(false);
                } finally {
                  setBusy(false);
                }
              }}
              className="rounded-lg bg-ink px-3.5 py-2 text-sm font-medium text-white hover:bg-ink/85 disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save corrections"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-2xs text-muted underline hover:text-ink"
            >
              Cancel
            </button>
            <span className="text-2xs text-faint">
              The original is kept — this is saved alongside it.
            </span>
          </div>
        </div>
      ) : (
        <>
          {/* Collapsed by default. Ten thousand words unrolled above the
              buttons buries every other thing on the page. */}
          <div
            className={`relative overflow-hidden rounded-xl bg-surface-strong p-3.5 ${
              expanded ? "" : "max-h-40"
            }`}
          >
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
              {transcript.text}
            </p>
            {!expanded && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-surface-strong to-transparent" />
            )}
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="justify-self-start text-2xs text-muted underline hover:text-ink"
          >
            {expanded ? "Collapse" : `Read all ${count.toLocaleString()} words`}
          </button>
        </>
      )}

      {/* Said once, where the decision is, rather than as a banner. */}
      {!approved && (
        <p className="text-[0.8125rem] text-muted">
          Everything else is written from this. Worth a read before it goes
          out under the church&rsquo;s name.
        </p>
      )}
    </div>
  );
}
