import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { Mark } from "../brand/Mark";
import { errorText } from "../lib/errorText";

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
          // Outlined when there is nothing to save, not a faded solid slab.
          // A grey filled block is what a forbidden control looks like, and
          // this one sits directly under a textarea showing placeholder
          // grey — together they read as a form somebody has locked.
          className="rounded-lg border border-transparent bg-ink px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-ink/85 disabled:border-border disabled:bg-surface disabled:text-faint"
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

const PLATFORMS: Record<string, { label: string; hint: string }> = {
  youtube: {
    label: "YouTube",
    hint: "The OAuth client JSON from Google Cloud, plus the refresh token for the channel.",
  },
  facebook: {
    label: "Facebook",
    hint: "The Page access token from a Meta app with pages_manage_posts.",
  },
  instagram: {
    label: "Instagram",
    hint: "The Instagram Business account id and its long-lived token.",
  },
  tiktok: {
    label: "TikTok",
    hint: "The client key, client secret and refresh token from the TikTok developer portal.",
  },
};

/**
 * Which accounts this church has connected.
 *
 * Nothing here can show you a token — the server has no function that returns
 * one. That is deliberate: a settings page that can display a refresh token
 * is a settings page that can leak one, and "let me just check it's right"
 * is exactly how one ends up in a screenshot.
 *
 * So the only way to tell whether a connection is wrong is to replace it,
 * and the label is there to make that a rare need.
 */
function Connections({ churchId }: { churchId: string }) {
  const id = churchId as Id<"churches">;
  const rows = useQuery(api.amplifyCredentials.status, { churchId: id });
  const connect = useMutation(api.amplifyCredentials.connect);
  const disconnect = useMutation(api.amplifyCredentials.disconnect);
  const [editing, setEditing] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const close = () => {
    setEditing(null);
    setSecret("");
    setLabel("");
    setError(null);
  };

  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <p className="section-label">Connected accounts</p>
        <p className="text-2xs text-muted">
          Amplify writes everything for you. Connect an account here and it can
          post it too — until then, publishing hands you the file and the
          caption to post yourself.
        </p>
      </div>

      <ul className="card overflow-hidden">
        {(rows ?? []).map((row) => {
          const meta = PLATFORMS[row.platform];
          const open = editing === row.platform;

          return (
            <li key={row.platform} className="border-b border-border last:border-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
                <span className="text-sm font-medium text-ink">
                  {meta?.label ?? row.platform}
                </span>
                {row.connected ? (
                  <span className="rounded-md bg-ok-soft px-2 py-0.5 text-2xs font-medium text-ok">
                    {row.accountLabel || "Connected"}
                  </span>
                ) : (
                  <span className="text-2xs text-muted">Not connected</span>
                )}
                <div className="ml-auto flex items-center gap-3">
                  {row.connected && (
                    <button
                      onClick={() =>
                        void disconnect({ churchId: id, platform: row.platform })
                      }
                      className="text-2xs text-muted underline hover:text-ink"
                    >
                      Disconnect
                    </button>
                  )}
                  <button
                    onClick={() => (open ? close() : setEditing(row.platform))}
                    className="text-2xs text-muted underline hover:text-ink"
                  >
                    {open ? "Cancel" : row.connected ? "Replace" : "Connect"}
                  </button>
                </div>
              </div>

              {open && (
                <div className="grid gap-2.5 px-4 pb-4">
                  <p className="text-2xs text-muted">{meta?.hint}</p>
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Which account is this? e.g. New Life Church"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-brand focus:outline-none"
                  />
                  <textarea
                    rows={5}
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder={'{ "refresh_token": "…", "client_id": "…" }'}
                    spellCheck={false}
                    className="w-full resize-y rounded-xl border border-border bg-surface px-3 py-2.5 font-mono text-2xs leading-relaxed text-ink placeholder:text-faint focus:border-brand focus:outline-none"
                  />
                  {error && <p className="text-2xs text-danger">{error}</p>}
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      disabled={saving || secret.trim() === ""}
                      onClick={async () => {
                        setSaving(true);
                        setError(null);
                        try {
                          await connect({
                            churchId: id,
                            platform: row.platform,
                            accountLabel: label.trim() || undefined,
                            secretJson: secret,
                          });
                          close();
                        } catch (e) {
                          setError(errorText(e, "Couldn't save that"));
                        } finally {
                          setSaving(false);
                        }
                      }}
                      className="rounded-lg border border-transparent bg-ink px-3 py-1.5 text-2xs font-medium text-white transition-colors hover:bg-ink/85 disabled:border-border disabled:bg-surface disabled:text-faint"
                    >
                      {saving ? "Saving…" : "Save connection"}
                    </button>
                    {/* Said once, here, where somebody is about to paste one. */}
                    <span className="text-2xs text-faint">
                      Stored for this church only. It can&rsquo;t be read back.
                    </span>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
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
    editable: boolean;
    scope: string;
    sharedIsCustom: boolean;
    inUse: boolean;
  };
}) {
  const setPrompt = useMutation(api.amplifySettings.setPrompt);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(prompt.template);
  const [saving, setSaving] = useState(false);

  // Follow the saved value when it changes underneath us.
  //
  // `draft` is local, and it used to only ever be seeded when the row was
  // opened. So "use the standard wording again" deleted the override on the
  // server, the query pushed the shipped wording back down — and the
  // textarea went on showing the custom text, with Save lit up ready to
  // write it straight back. It looked exactly like a button that did
  // nothing, and pressing Save afterwards undid the restore.
  //
  // Compared against the last value we took from the server rather than
  // against the draft, so somebody's unsaved typing is only discarded when
  // the saved value actually moved.
  const fromServer = useRef(prompt.template);
  useEffect(() => {
    if (fromServer.current !== prompt.template) {
      fromServer.current = prompt.template;
      setDraft(prompt.template);
    }
  }, [prompt.template]);

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
        {/* A chip, not a trailing sentence. On a phone the old grey words sat
            below the title where nothing draws the eye, so the first sign
            that a prompt could not be edited was tapping it and getting no
            keyboard — which reads as the page being broken. */}
        {!prompt.tunable && (
          <span
            className={`rounded-md px-2 py-0.5 text-2xs font-medium ${
              prompt.editable
                ? // You can change it, and it lands on everybody. Said on the
                  // row rather than only inside, because the consequence is
                  // the thing worth knowing before opening it.
                  "bg-warn-soft text-warn"
                : "bg-surface-strong text-muted"
            }`}
          >
            {prompt.editable ? "Every church" : "Read only"}
          </span>
        )}
        {prompt.sharedIsCustom && (
          <span className="rounded-md bg-brand-soft px-2 py-0.5 text-2xs font-medium text-brand-strong">
            changed
          </span>
        )}
        {/* Louder than the sentence in the description, because the thing
            worth knowing before you spend twenty minutes rewriting a prompt
            is that nothing runs it. */}
        {!prompt.inUse && (
          <span className="rounded-md bg-warn-soft px-2 py-0.5 text-2xs font-medium text-warn">
            not wired up
          </span>
        )}
        <span className="ml-auto text-2xs text-muted">{prompt.category}</span>
      </button>

      {open && (
        <div className="grid gap-2 px-4 pb-4">
          <p className="text-2xs text-muted">{prompt.description}</p>

          {/* Said before the box, not after it. The reason a prompt can't be
              changed is no use underneath the thing somebody has already
              tried to type into. */}
          {!prompt.tunable &&
            (prompt.editable ? (
              // The warning belongs before the box. Somebody who has already
              // typed a paragraph has stopped reading.
              <p className="rounded-lg bg-warn-soft px-3 py-2 text-2xs leading-relaxed text-warn">
                This one decides how the work is done rather than how it
                reads, so every church runs on it. Saving changes it for all
                of them — and several of these have to keep producing the
                exact shape the app reads back. Leave it blank to put the
                standard wording back.
              </p>
            ) : (
              <p className="rounded-lg bg-surface-strong px-3 py-2 text-2xs leading-relaxed text-muted">
                This one decides how the work is done rather than how it
                reads, so every church shares it. Here to read, not to edit.
              </p>
            ))}

          {prompt.editable ? (
            <textarea
              rows={12}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full resize-y rounded-xl border border-border bg-surface px-3 py-2.5 font-mono text-2xs leading-relaxed text-ink focus:border-brand focus:outline-none"
            />
          ) : (
            // Not a read-only textarea. On a phone that is a box you can tap
            // that refuses to raise the keyboard, with no cursor and no
            // explanation — indistinguishable from a broken page. A plain
            // block never makes the offer, and can still be selected and
            // copied.
            <pre className="max-h-80 w-full overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-surface-strong px-3 py-2.5 font-mono text-2xs leading-relaxed text-muted">
              {prompt.template}
            </pre>
          )}

          {prompt.editable ? (
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
                className="rounded-lg border border-transparent bg-ink px-3 py-1.5 text-2xs font-medium text-white transition-colors hover:bg-ink/85 disabled:border-border disabled:bg-surface disabled:text-faint"
              >
                {saving
                  ? "Saving…"
                  : prompt.scope === "everyone"
                    ? // The button says where it lands. "Save" on a control
                      // that changes every church is the same word as "Save"
                      // on one that changes yours, and they are not the same
                      // act.
                      "Save for every church"
                    : "Save"}
              </button>
              {(prompt.isOverridden || prompt.sharedIsCustom) && (
                <button
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      await setPrompt({
                        churchId: churchId as Id<"churches">,
                        promptKey: prompt.key,
                        template: "",
                      });
                    } finally {
                      setSaving(false);
                    }
                  }}
                  className="text-2xs text-muted underline hover:text-ink disabled:opacity-40"
                >
                  Use the standard wording again
                </button>
              )}
              <span className="text-2xs text-faint">
                {"{{placeholders}}"} get filled in — keep the ones you need.
              </span>
            </div>
          ) : null}
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

      <Connections churchId={churchId} />

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
              {/* Counted rather than described. "Some are shared" leaves you
                  to find out which by tapping them, and the ones you can't
                  change give no feedback at all on a phone. */}
              The instructions behind each piece of writing.{" "}
              {!prompts
                ? "Some decide how your church sounds; the rest are shared."
                : prompts.every((p) => p.editable)
                  ? // Signed in as A1:8. Say so, because every save from here
                    // reaches churches this person will never look at.
                    `You can change all ${prompts.length} — the ${prompts.filter((p) => !p.tunable).length} marked "every church" are shared machinery, and edits to those land everywhere.`
                  : `${prompts.filter((p) => p.editable).length} of ${prompts.length} decide how your church sounds and can be changed — the rest are shared machinery, marked read only.`}
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
