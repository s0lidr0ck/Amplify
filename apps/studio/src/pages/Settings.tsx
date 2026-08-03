import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useEffect, useState } from "react";
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
                      className="rounded-lg bg-ink px-3 py-1.5 text-2xs font-medium text-white hover:bg-ink/85 disabled:opacity-40"
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
