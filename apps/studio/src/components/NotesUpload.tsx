import { useAction, useMutation } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useRef, useState } from "react";

import { errorText } from "../lib/errorText";

/**
 * Handing over the preacher's manuscript.
 *
 * Two ways in, on purpose. The file is what he actually has — he writes his
 * sermons out in Word — and the paste box is what always works: the week he
 * sends it in the body of an email, or writes it somewhere that is not Word,
 * the handout should not be blocked on a file format.
 *
 * The upload is a Convex storage URL rather than anything of ours, so the
 * document goes straight from his machine to storage and only the extracted
 * words come back through an action.
 */
export function NotesUpload({
  projectId,
  onDone,
  /** Read the file but do not send it — the new-sermon form has no sermon
   *  to attach it to yet, so it holds the bytes until the form is saved. */
  hold,
}: {
  projectId?: Id<"amplifyProjects">;
  onDone?: (wordCount: number) => void;
  hold?: (file: File | null, pasted: string) => void;
}) {
  const uploadUrl = useMutation(api.amplifyNotes.uploadUrl);
  const fromDocx = useAction(api.amplifyNotesExtract.fromDocx);
  const fromText = useAction(api.amplifyNotesExtract.fromText);

  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const choose = (next: File | null) => {
    setFile(next);
    setError(null);
    hold?.(next, pasted);
  };

  const type = (next: string) => {
    setPasted(next);
    hold?.(file, next);
  };

  const send = async () => {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      if (file) {
        const url = await uploadUrl({ projectId });
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!res.ok) throw new Error("The upload did not go through.");
        const { storageId } = (await res.json()) as { storageId: string };
        const { wordCount } = await fromDocx({
          projectId,
          storageId: storageId as Id<"_storage">,
          filename: file.name,
        });
        onDone?.(wordCount);
      } else {
        const { wordCount } = await fromText({ projectId, text: pasted });
        onDone?.(wordCount);
      }
    } catch (e) {
      setError(errorText(e, "Couldn't read those notes"));
    } finally {
      setBusy(false);
    }
  };

  const ready = Boolean(file) || pasted.trim().length > 0;

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <label className="section-label" htmlFor="notes-file">
          His notes
        </label>
        <input
          id="notes-file"
          ref={input}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => choose(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-ink file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-ink/85"
        />
        <p className="text-2xs text-faint">
          A Word .docx. Older .doc files and PDFs won&rsquo;t read — save it as
          .docx, or paste the text below.
        </p>
      </div>

      {file && (
        <p className="flex flex-wrap items-center gap-2 text-2xs text-muted">
          <span className="data">{file.name}</span>
          <button
            onClick={() => {
              choose(null);
              if (input.current) input.current.value = "";
            }}
            className="underline hover:text-ink"
          >
            Choose a different one
          </button>
        </p>
      )}

      {!file && (
        <div className="grid gap-1.5">
          <label className="section-label" htmlFor="notes-paste">
            Or paste them
          </label>
          <textarea
            id="notes-paste"
            rows={6}
            value={pasted}
            onChange={(e) => type(e.target.value)}
            placeholder="Paste the sermon text…"
            className="w-full resize-y rounded-xl border border-border bg-surface px-3.5 py-3 text-sm leading-relaxed text-ink focus:border-brand focus:outline-none"
          />
        </div>
      )}

      {/* Only when this is attaching to a sermon that already exists. The
          new-sermon form has its own submit and does the sending itself. */}
      {projectId && (
        <button
          disabled={!ready || busy}
          onClick={send}
          className="justify-self-start rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/85 disabled:opacity-40"
        >
          {busy ? "Reading the notes…" : "Use these notes"}
        </button>
      )}

      {error && <p className="text-[0.8125rem] text-danger">{error}</p>}
    </div>
  );
}
