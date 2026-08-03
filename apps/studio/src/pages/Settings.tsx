import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Mark } from "../brand/Mark";

/**
 * How this church sounds, and the prompts it can change.
 *
 * Two dials of deliberately different size. Voice is one paragraph and most
 * churches will want nothing else; rewriting a whole prompt is behind a
 * disclosure, because offering both with equal weight would suggest they are
 * equally good ideas.
 */

const PLACEHOLDER =
  "We're plain-spoken and unhurried. Short sentences, no hype. We write " +
  "like one person talking to another, not like a church advertising itself.";

function Voice({ churchId }: { churchId: string }) {
  const saved = useQuery(api.amplifySettings.voice, {
    churchId: churchId as Id<"churches">,
  });
  const setVoice = useMutation(api.amplifySettings.setVoice);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Only seeds once. Re-seeding on every server change would yank the
  // textarea out from under someone mid-sentence.
  useEffect(() => {
    if (saved !== undefined && draft === null) setDraft(saved ?? "");
  }, [saved, draft]);

  if (draft === null) return <p className="text-sm text-muted">Loading…</p>;

  const dirty = draft !== (saved ?? "");

  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <label htmlFor="voice" className="section-label">
          Voice
        </label>
        <p className="text-2xs text-muted">
          How your church sounds. This shapes the wording of everything
          written for people to read — it never changes the facts.
        </p>
      </div>

      <textarea
        id="voice"
        rows={4}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={PLACEHOLDER}
        className="w-full resize-y rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-ink placeholder:text-faint focus:border-brand focus:outline-none"
      />

      <div className="flex items-center gap-3">
        <button
          disabled={!dirty || saving}
          onClick={async () => {
            setSaving(true);
            try {
              await setVoice({ churchId: churchId as Id<"churches">, voice: draft });
            } finally {
              setSaving(false);
            }
          }}
          className="rounded-lg bg-ink px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-ink/85 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save voice"}
        </button>
        {dirty && !saving && (
          <span className="text-2xs text-muted">Not saved yet</span>
        )}
      </div>
    </div>
  );
}

function PromptRow({
  churchId,
  prompt,
}: {
  churchId: string;
  prompt: {
    key: string;
    label: string;
    category: string;
    description: string;
    tunable: boolean;
    template: string;
    isOverridden: boolean;
  };
}) {
  const setPrompt = useMutation(api.amplifySettings.setPrompt);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(prompt.template);
  const [saving, setSaving] = useState(false);

  return (
    <li className="border-b border-border last:border-0">
      <button
        onClick={() => {
          setDraft(prompt.template);
          setOpen(!open);
        }}
        className="flex w-full flex-wrap items-baseline gap-x-2.5 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-surface-strong"
      >
        <span className="text-sm font-medium text-ink">{prompt.label}</span>
        {prompt.isOverridden && (
          <span className="rounded-md bg-brand-soft px-2 py-0.5 text-2xs font-medium text-brand-strong">
            yours
          </span>
        )}
        {/* Said plainly rather than by a disabled control — "shared" is a
            reason, and a greyed-out box is just a refusal. */}
        {!prompt.tunable && (
          <span className="text-2xs text-muted">shared with every church</span>
        )}
        <span className="ml-auto text-2xs text-muted">{prompt.category}</span>
      </button>

      {open && (
        <div className="grid gap-2 px-4 pb-4">
          <p className="text-2xs text-muted">{prompt.description}</p>
          <textarea
            rows={12}
            readOnly={!prompt.tunable}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className={`w-full resize-y rounded-xl border border-border px-3 py-2.5 font-mono text-2xs leading-relaxed text-ink focus:border-brand focus:outline-none ${
              prompt.tunable ? "bg-surface" : "bg-surface-strong text-muted"
            }`}
          />
          {prompt.tunable ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                disabled={saving || draft === prompt.template}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await setPrompt({
                      churchId: churchId as Id<"churches">,
                      promptKey: prompt.key,
                      template: draft,
                    });
                  } finally {
                    setSaving(false);
                  }
                }}
                className="rounded-lg bg-ink px-3 py-1.5 text-2xs font-medium text-white hover:bg-ink/85 disabled:opacity-40"
              >
                Save
              </button>
              {prompt.isOverridden && (
                <button
                  onClick={() =>
                    void setPrompt({
                      churchId: churchId as Id<"churches">,
                      promptKey: prompt.key,
                      template: "",
                    })
                  }
                  className="text-2xs text-muted underline hover:text-ink"
                >
                  Use the standard wording again
                </button>
              )}
              <span className="text-2xs text-faint">
                {"{{placeholders}}"} get filled in — keep the ones you need.
              </span>
            </div>
          ) : (
            <p className="text-2xs text-muted">
              This one decides how the work is done rather than how it reads,
              so every church shares it. It&rsquo;s here to read, not to edit.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

export function SettingsPage({ churchId }: { churchId: string }) {
  const prompts = useQuery(api.amplifySettings.prompts, {
    churchId: churchId as Id<"churches">,
  });
  const [showPrompts, setShowPrompts] = useState(false);

  return (
    <div className="mx-auto grid max-w-3xl gap-6 px-5 py-8">
      <header className="grid gap-3 border-b border-border pb-4">
        <Link
          to="/projects"
          className="flex items-center gap-2 text-2xs text-muted hover:text-ink"
        >
          <Mark size={16} /> All sermons
        </Link>
        <h1 className="font-display text-[1.7rem] font-bold leading-tight tracking-tight text-ink">
          Settings
        </h1>
      </header>

      <section className="card p-5">
        <Voice churchId={churchId} />
      </section>

      <section className="grid gap-3">
        {/* Behind a disclosure on purpose. Most churches want the voice and
            nothing else; showing both at equal weight would suggest
            rewriting a prompt is an equally good idea. */}
        <button
          onClick={() => setShowPrompts(!showPrompts)}
          className="justify-self-start text-sm text-muted underline hover:text-ink"
        >
          {showPrompts ? "Hide the prompts" : "Show the prompts"}
        </button>

        {showPrompts && (
          <div className="grid gap-2">
            <p className="text-2xs text-muted">
              The instructions behind each piece of writing. You can change the
              ones that decide how your church sounds; the rest are shared.
            </p>
            <ul className="card overflow-hidden">
              {(prompts ?? []).map((p) => (
                <PromptRow key={p.key} churchId={churchId} prompt={p} />
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
