import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { Mark } from "../brand/Mark";
import { Speakers } from "../components/Speakers";
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

/**
 * What each platform actually needs, field by field.
 *
 * This used to be one textarea wanting hand-written JSON, which asked
 * somebody holding five secrets to also get brace placement and comma
 * placement right, and told them nothing about which keys mattered. A
 * mistyped key does not fail here — it fails weeks later, on a publish,
 * as "the saved connection has no siteId".
 *
 * `env` names the variable it comes from, because that is where these
 * values already live and copying between two names is where they get
 * crossed.
 */
type Field = {
  key: string;
  label: string;
  env?: string;
  /** Skipped when blank rather than saved empty. */
  optional?: boolean;
  placeholder?: string;
  /**
   * Never comes back from the server, so an empty box on a connection that
   * already exists means "keep what's there" rather than "clear it".
   */
  secret?: boolean;
  /** A switch rather than a box. Stored as a real boolean, not "true". */
  toggle?: boolean;
};

const FIELDS: Record<string, Field[]> = {
  youtube: [
    { key: "client_id", label: "Client id", env: "YOUTUBE_CLIENT_ID" },
    { key: "client_secret", label: "Client secret", env: "YOUTUBE_CLIENT_SECRET", secret: true },
    { key: "refresh_token", label: "Refresh token", env: "YOUTUBE_REFRESH_TOKEN", secret: true },
  ],
  facebook: [
    { key: "page_id", label: "Page id", env: "FACEBOOK_PAGE_ID" },
    {
      key: "access_token",
      label: "Page access token",
      env: "FACEBOOK_PAGE_ACCESS_TOKEN",
      secret: true,
    },
  ],
  instagram: [
    {
      key: "ig_user_id",
      label: "Business account id",
      env: "INSTAGRAM_BUSINESS_ACCOUNT_ID",
    },
    { key: "access_token", label: "Access token", env: "INSTAGRAM_ACCESS_TOKEN", secret: true },
  ],
  tiktok: [
    { key: "client_key", label: "Client key", env: "TIKTOK_CLIENT_KEY" },
    { key: "client_secret", label: "Client secret", env: "TIKTOK_CLIENT_SECRET", secret: true },
    { key: "refresh_token", label: "Refresh token", env: "TIKTOK_REFRESH_TOKEN", secret: true },
  ],
  wix: [
    { key: "bearerToken", label: "API key", env: "WIX_BEARER_TOKEN", secret: true },
    { key: "siteId", label: "Site id", env: "WIX_SITE_ID" },
    { key: "collectionId", label: "Collection id", env: "WIX_COLLECTION_ID" },
    { key: "blogMemberId", label: "Blog author member id", env: "WIX_BLOG_MEMBER_ID" },
    {
      key: "apiBase",
      label: "API base",
      env: "WIX_API_BASE",
      optional: true,
      placeholder: "https://www.wixapis.com",
    },
    {
      key: "createCategories",
      label:
        "Create blog categories as sermons need them — ten fixed topics, " +
        "so your blog builds its own filing without you typing them in",
      optional: true,
      toggle: true,
    },
  ],
};

/**
 * Wix only: which field in the church's collection holds each thing.
 *
 * A key the collection does not have makes Wix reject the whole item, so
 * every one of these is optional — leave it blank and Amplify simply does
 * not send that value. "Check it" prints the collection's real keys, which
 * is the intended way to fill this in.
 */
const WIX_MAPPING: { key: string; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "summary", label: "Summary" },
  { key: "topics", label: "Topics" },
  { key: "tags", label: "Tags" },
  { key: "mainPoints", label: "Main points" },
  { key: "teachingStatements", label: "Teaching statements" },
  { key: "propheticStatements", label: "Prophetic statements" },
  { key: "keyMoments", label: "Key moments" },
  { key: "scriptures", label: "Scriptures" },
  { key: "transcript", label: "Transcript" },
  { key: "image", label: "Image" },
  { key: "preachedOn", label: "Date preached" },
  { key: "speaker", label: "Speaker" },
  { key: "blogUrl", label: "Blog post link" },
];

/**
 * Platforms with a Connect button rather than boxes to paste a token into.
 *
 * The rest still take a pasted credential. Wix issues an API key that never
 * expires, so a Connect button would buy nothing; Facebook and Instagram
 * need Meta's review of pages_manage_posts and instagram_content_publish
 * before this can be offered. Grows as each one is registered.
 */
const CONNECTABLE = new Set(["youtube", "tiktok"]);

const PLATFORMS: Record<string, { label: string; hint: string }> = {
  youtube: {
    label: "YouTube",
    hint: "From the OAuth client in Google Cloud, plus a refresh token for the channel.",
  },
  facebook: {
    label: "Facebook",
    hint: "The Page token, not the user one, from a Meta app with pages_manage_posts. Covers the written post and reels.",
  },
  instagram: {
    label: "Instagram",
    hint: "The Business account, not a personal one.",
  },
  tiktok: {
    label: "TikTok",
    hint: "From the TikTok developer portal. The access token isn't needed — it's refreshed at every post.",
  },
  wix: {
    label: "Website (Wix)",
    hint: "Posts the blog post and files the sermon in your collection.",
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
  // Everything about a connection that is not a token. Tokens are never
  // returned by anything, which is why the boxes for them stay blank.
  const savedParts = useQuery(api.amplifyCredentials.editable, {
    churchId: id as Id<"churches">,
  });
  const testConnection = useAction(api.amplifyConnections.test);
  const startConnect = useAction(api.amplifyOAuth.start);
  const [testing, setTesting] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  // Kept per platform rather than one at a time, so checking Instagram
  // does not wipe what you just learned about Facebook.
  const [checked, setChecked] = useState<
    Record<string, { ok: boolean; detail: string }>
  >({});
  const [editing, setEditing] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  // One value per box, assembled into the credential on save. Never seeded
  // from the server: nothing can read a saved token back, which is why
  // "Replace" means typing all of them again rather than editing one.
  const [parts, setParts] = useState<Record<string, string>>({});
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Back from a platform's consent screen. The callback cannot render into
  // the app, so it says what happened in the address bar and this picks it
  // up — then clears it, so a refresh does not repeat a stale verdict.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const platform = params.get("connected");
    if (!platform) return;
    const problem = params.get("problem");
    setChecked((c) => ({
      ...c,
      [platform]: {
        ok: !problem,
        detail: problem ?? "Connected. Press Check it to see which account.",
      },
    }));
    params.delete("connected");
    params.delete("problem");
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (query ? `?${query}` : ""),
    );
  }, []);

  const close = () => {
    setEditing(null);
    setParts({});
    setMapping({});
    setLabel("");
    setError(null);
  };

  /** The credential this platform's boxes add up to. */
  const buildSecret = (platform: string): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const f of FIELDS[platform] ?? []) {
      const value = (parts[f.key] ?? "").trim();
      if (f.toggle) {
        // A real boolean, not the string "on". The server reads it as one,
        // and "false" is truthy.
        out[f.key] = value === "on";
        continue;
      }
      // Blank means absent, not empty-string. An empty value saved under a
      // required key passes the "is it there" check and then fails at the
      // platform, which is the least useful place to find out.
      if (value) out[f.key] = value;
    }
    if (platform === "wix") {
      const fieldMap: Record<string, string> = {};
      for (const m of WIX_MAPPING) {
        const value = (mapping[m.key] ?? "").trim();
        if (value) fieldMap[m.key] = value;
      }
      if (Object.keys(fieldMap).length > 0) out.fieldMap = fieldMap;
    }
    return out;
  };

  /**
   * Enough filled in to save.
   *
   * On a connection that already exists, a blank secret means "keep the
   * saved one", so demanding it would be demanding a token back that
   * nothing can show you.
   */
  const ready = (platform: string, connected: boolean) =>
    (FIELDS[platform] ?? []).every(
      (f) =>
        f.optional ||
        (f.secret && connected) ||
        (parts[f.key] ?? "").trim() !== "",
    );

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
                {/* What the platform says this connection IS. A token that
                    parses but points at the wrong page is the failure
                    nobody catches until a sermon appears on somebody
                    else's wall. */}
                {checked[row.platform] && (
                  <span
                    className={`text-2xs ${
                      checked[row.platform].ok ? "text-ok" : "text-danger"
                    }`}
                  >
                    {checked[row.platform].detail}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-3">
                  {/* The button that replaces going to find a token by hand.
                      Solid when there is nothing connected yet, because that
                      is the work; quiet once there is, because reconnecting
                      is the exception. */}
                  {CONNECTABLE.has(row.platform) && (
                    <button
                      disabled={connecting === row.platform}
                      onClick={async () => {
                        setConnecting(row.platform);
                        try {
                          const url = await startConnect({
                            churchId: id as Id<"churches">,
                            platform: row.platform,
                            returnTo: window.location.href,
                          });
                          // Leaves the app. Nothing after this runs.
                          window.location.href = url;
                        } catch (e) {
                          setChecked((c) => ({
                            ...c,
                            [row.platform]: {
                              ok: false,
                              detail: errorText(e, "Couldn't start that"),
                            },
                          }));
                          setConnecting(null);
                        }
                      }}
                      className={
                        row.connected
                          ? "text-2xs text-muted underline hover:text-ink disabled:opacity-40"
                          : "rounded-lg bg-brand px-2.5 py-1 text-2xs font-medium text-white hover:bg-brand-strong disabled:opacity-40"
                      }
                    >
                      {connecting === row.platform
                        ? "Opening…"
                        : row.connected
                          ? "Reconnect"
                          : `Connect ${meta?.label ?? row.platform}`}
                    </button>
                  )}
                  {row.connected && (
                    <button
                      disabled={testing === row.platform}
                      onClick={async () => {
                        setTesting(row.platform);
                        try {
                          const result = await testConnection({
                            churchId: id as Id<"churches">,
                            platform: row.platform,
                          });
                          setChecked((c) => ({ ...c, [row.platform]: result }));
                        } catch (e) {
                          setChecked((c) => ({
                            ...c,
                            [row.platform]: {
                              ok: false,
                              detail: errorText(e, "Couldn't check that"),
                            },
                          }));
                        } finally {
                          setTesting(null);
                        }
                      }}
                      className="text-2xs text-muted underline hover:text-ink disabled:opacity-40"
                    >
                      {testing === row.platform ? "Checking…" : "Check it"}
                    </button>
                  )}
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
                    onClick={() => {
                      if (open) return close();
                      // Everything that is not a token comes back, so
                      // correcting one field key does not mean retyping an
                      // API key beside it.
                      const saved = (savedParts ?? {})[row.platform] ?? {};
                      const { fieldMap, ...rest } = saved as {
                        fieldMap?: Record<string, string>;
                      } & Record<string, unknown>;
                      setParts(
                        Object.fromEntries(
                          Object.entries(rest).map(([k, v]) => [
                            k,
                            // Booleans come back as booleans; the boxes hold
                            // strings. String(false) is "false", which is
                            // not "on" but is very much not blank either.
                            typeof v === "boolean"
                              ? v
                                ? "on"
                                : ""
                              : String(v ?? ""),
                          ]),
                        ),
                      );
                      setMapping(fieldMap ?? {});
                      // Carried over too. Editing a field key should not
                      // quietly rename the account it belongs to.
                      setLabel(row.accountLabel ?? "");
                      setEditing(row.platform);
                    }}
                    className="text-2xs text-muted underline hover:text-ink"
                  >
                    {open ? "Cancel" : row.connected ? "Edit" : "Connect"}
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
                  {/* One box per value, so nothing has to be assembled by
                      hand. The variable name is on the label because these
                      already exist under those names, and copying between
                      two vocabularies is where they get crossed. */}
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {(FIELDS[row.platform] ?? []).map((f) =>
                      f.toggle ? (
                        <label
                          key={f.key}
                          className="flex items-start gap-2 sm:col-span-2"
                        >
                          <input
                            type="checkbox"
                            checked={parts[f.key] === "on"}
                            onChange={(e) =>
                              setParts((p) => ({
                                ...p,
                                [f.key]: e.target.checked ? "on" : "",
                              }))
                            }
                            className="mt-0.5"
                          />
                          <span className="text-2xs text-muted">{f.label}</span>
                        </label>
                      ) : (
                      <label key={f.key} className="grid gap-1">
                        <span className="text-2xs text-muted">
                          {f.label}{" "}
                          {f.env && (
                            <span className="font-mono text-faint">{f.env}</span>
                          )}
                          {f.optional && (
                            <span className="text-faint"> · optional</span>
                          )}
                          {f.secret && row.connected && (
                            <span className="text-faint">
                              {" "}
                              · blank keeps the saved one
                            </span>
                          )}
                        </span>
                        <input
                          value={parts[f.key] ?? ""}
                          onChange={(e) =>
                            setParts((p) => ({ ...p, [f.key]: e.target.value }))
                          }
                          placeholder={f.placeholder}
                          spellCheck={false}
                          autoComplete="off"
                          className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-2xs text-ink placeholder:text-faint focus:border-brand focus:outline-none"
                        />
                      </label>
                      ),
                    )}
                  </div>

                  {row.platform === "wix" && (
                    <div className="grid gap-2">
                      <p className="text-2xs text-muted">
                        Which field in your Sermons collection holds each
                        thing. Leave any blank that your collection
                        doesn&rsquo;t have &mdash; a key Wix doesn&rsquo;t
                        know makes it reject the whole item. Save this, then
                        press &ldquo;Check it&rdquo; and it prints your
                        collection&rsquo;s real keys.
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {WIX_MAPPING.map((m) => (
                          <label key={m.key} className="grid gap-1">
                            <span className="text-2xs text-muted">{m.label}</span>
                            <input
                              value={mapping[m.key] ?? ""}
                              onChange={(e) =>
                                setMapping((p) => ({
                                  ...p,
                                  [m.key]: e.target.value,
                                }))
                              }
                              placeholder={m.key}
                              spellCheck={false}
                              autoComplete="off"
                              className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-2xs text-ink placeholder:text-faint focus:border-brand focus:outline-none"
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {error && <p className="text-2xs text-danger">{error}</p>}
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      disabled={saving || !ready(row.platform, row.connected)}
                      onClick={async () => {
                        setSaving(true);
                        setError(null);
                        try {
                          await connect({
                            churchId: id,
                            platform: row.platform,
                            accountLabel: label.trim() || undefined,
                            secretJson: JSON.stringify(
                              buildSecret(row.platform),
                            ),
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
                    {/* Said once, here, where somebody is about to paste one.
                        The second sentence matters on Replace: the boxes are
                        blank because nothing can read a saved token back, not
                        because the old one is gone. */}
                    <span className="text-2xs text-faint">
                      Stored for this church only, and never readable again
                      &mdash; replacing means entering all of it afresh.
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
    unfillable: string[];
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
        {/* The loudest chip on the row, because this one is actively
            wrong — the prompt runs, produces a draft, and has a hole in it
            where a name or a date was meant to be. */}
        {prompt.unfillable.length > 0 && (
          <span className="rounded-md bg-danger-soft px-2 py-0.5 text-2xs font-medium text-danger">
            blank {prompt.unfillable.length === 1 ? "gap" : "gaps"}
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

          {/* Before the box, because it is about the text already in it.
              This is the failure the whole thing is built to prevent: a
              placeholder nothing fills renders as nothing, the prompt still
              runs, and the only trace is a sentence in the finished draft
              that stops mid-way. */}
          {prompt.unfillable.length > 0 && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-2xs leading-relaxed text-danger">
              Nothing fills in{" "}
              {prompt.unfillable.map((n, i) => (
                <span key={n}>
                  {i > 0 && ", "}
                  <code className="font-mono">{`{{${n}}}`}</code>
                </span>
              ))}
              , so {prompt.unfillable.length === 1 ? "it comes" : "they come"}{" "}
              out blank. The names that work are{" "}
              <code className="font-mono">{"{{speaker_name}}"}</code>,{" "}
              <code className="font-mono">{"{{speaker_called}}"}</code> (what
              your church calls them),{" "}
              <code className="font-mono">{"{{date_preached}}"}</code>,{" "}
              <code className="font-mono">{"{{transcript}}"}</code> and{" "}
              <code className="font-mono">{"{{context_block}}"}</code>, which
              is all three of the first ones written out for you.
            </p>
          )}

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

      {/* Under Voice, because it is the same kind of dial: both decide how
          the writing sounds rather than what it says. */}
      <section className="card p-5">
        <Speakers churchId={churchId} />
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
