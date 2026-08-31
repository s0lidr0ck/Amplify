import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { NotesUpload } from "../components/NotesUpload";
import { todayLocal } from "../lib/dates";
import { errorText } from "../lib/errorText";

/**
 * A study guide before the sermon is preached.
 *
 * Everything else in Amplify starts with a recording. This starts with the
 * preacher's manuscript, so the handout can be printed and folded on the
 * Thursday rather than the Tuesday after.
 *
 * It makes a real sermon rather than converting a document in the abstract.
 * That was the tempting shape — paste in, guide out, nothing kept — and it
 * costs too much: every output in this product hangs off a sermon, which is
 * what makes the library, the share link and printing it again next week
 * work at all. And the sermon is going to exist anyway once it is preached,
 * so making it now is the same work earlier, on a record the recording can
 * land against instead of a second one somebody creates by hand.
 */

/** The steps, so a slow one can say which it is rather than spinning. */
type Step = null | "sermon" | "notes" | "writing";

const SAYING: Record<Exclude<Step, null>, string> = {
  sermon: "Making the sermon…",
  notes: "Reading his notes…",
  writing: "Claude is writing the guide…",
};

export function FromNotesPage({ churchId }: { churchId: string }) {
  const navigate = useNavigate();
  const createProject = useMutation(api.amplify.createProject);
  const addSpeaker = useMutation(api.amplifySpeakers.add);
  const uploadUrl = useMutation(api.amplifyNotes.uploadUrl);
  const fromDocx = useAction(api.amplifyNotesExtract.fromDocx);
  const fromText = useAction(api.amplifyNotesExtract.fromText);
  const write = useAction(api.amplifyGenerate.studyGuide);

  const speakers = useQuery(api.amplifySpeakers.list, {
    churchId: churchId as Id<"churches">,
  });

  const [title, setTitle] = useState("");
  const [chosen, setChosen] = useState("");
  const [guest, setGuest] = useState("");
  const [guestCalled, setGuestCalled] = useState("");
  const [sermonDate, setSermonDate] = useState(todayLocal());
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState("");
  const [step, setStep] = useState<Step>(null);
  const [error, setError] = useState<string | null>(null);

  const isGuest = chosen === "GUEST";
  const speaker = isGuest ? guest.trim() : chosen;
  const called = isGuest ? guestCalled.trim() : "";
  const hasNotes = Boolean(file) || pasted.trim().length > 0;
  const ready = title.trim() && speaker && sermonDate && hasNotes && !step;

  const go = async () => {
    setError(null);
    setStep("sermon");
    let projectId: Id<"amplifyProjects"> | null = null;
    try {
      projectId = await createProject({
        churchId: churchId as Id<"churches">,
        title: title.trim(),
        speaker,
        speakerDisplayName: called || undefined,
        sermonDate,
      });
      // The roster grows from use, exactly as it does on the sermon form.
      if (isGuest && speaker) {
        // Best effort: a roster row that did not save is not a reason to
        // lose the sermon and the guide behind it.
        await addSpeaker({
          churchId: churchId as Id<"churches">,
          name: speaker,
          displayName: called || speaker,
        }).catch(() => {});
      }

      setStep("notes");
      if (file) {
        const url = await uploadUrl({ projectId });
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!res.ok) throw new Error("The upload did not go through.");
        const { storageId } = (await res.json()) as { storageId: string };
        await fromDocx({
          projectId,
          storageId: storageId as Id<"_storage">,
          filename: file.name,
        });
      } else {
        await fromText({ projectId, text: pasted });
      }

      setStep("writing");
      await write({ projectId });

      navigate(`/projects/${projectId}/writing/study_guide`);
    } catch (e) {
      setStep(null);
      // The sermon it got as far as making is named rather than hidden. It
      // is a real row now, and telling somebody it exists is better than
      // leaving them to find it on the list wondering where it came from.
      setError(
        errorText(e, "Couldn't do that") +
          (projectId
            ? " The sermon was created — you can open it and try the notes again."
            : ""),
      );
    }
  };

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <div className="grid gap-1.5">
        <Link
          to="/projects"
          className="justify-self-start text-xs text-muted transition-colors hover:text-ink"
        >
          ← All sermons
        </Link>
        <h1 className="font-display text-[2rem] font-bold leading-[1.15] tracking-[-0.02em] text-ink">
          Study guide from notes
        </h1>
        <p className="max-w-prose text-sm text-muted">
          For a handout that has to be ready before Sunday. Give it his
          manuscript and it writes the guide now; when the recording is
          transcribed later, the guide can be written again from what he
          actually preached.
        </p>
      </div>

      <div className="card grid gap-4 p-5">
        <div className="grid gap-1.5">
          <label className="section-label" htmlFor="notes-title">
            What is it called
          </label>
          <input
            id="notes-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Don't Complain When God Is Protecting"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
          />
        </div>

        <div className="grid gap-1.5">
          <label className="section-label" htmlFor="notes-speaker">
            Who is preaching it
          </label>
          <select
            id="notes-speaker"
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
          >
            <option value="">Choose…</option>
            {(speakers ?? []).map((s: { _id: string; name: string }) => (
              <option key={s._id} value={s.name}>
                {s.name}
              </option>
            ))}
            <option value="GUEST">Somebody else…</option>
          </select>
          {isGuest && (
            <div className="grid gap-1.5 sm:flex">
              <input
                value={guest}
                onChange={(e) => setGuest(e.target.value)}
                placeholder="Their name"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none sm:flex-1"
              />
              <input
                value={guestCalled}
                onChange={(e) => setGuestCalled(e.target.value)}
                placeholder="What the church calls them"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none sm:flex-1"
              />
            </div>
          )}
        </div>

        <div className="grid gap-1.5">
          <label className="section-label" htmlFor="notes-date">
            When
          </label>
          <input
            id="notes-date"
            type="date"
            value={sermonDate}
            onChange={(e) => setSermonDate(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
          />
        </div>

        <div className="border-t border-border pt-4">
          <NotesUpload
            hold={(f, text) => {
              setFile(f);
              setPasted(text);
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <button
            disabled={!ready}
            onClick={go}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/85 disabled:opacity-40"
          >
            {step ? SAYING[step] : "Write the study guide"}
          </button>
          {step === "writing" && (
            <span className="text-2xs text-faint">
              A minute or so. Don&rsquo;t close the tab.
            </span>
          )}
        </div>

        {error && <p className="text-[0.8125rem] text-danger">{error}</p>}
      </div>
    </div>
  );
}
