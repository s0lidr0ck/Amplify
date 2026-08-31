import { useQuery } from "convex/react";
import { api } from "@convex/api";
import { useParams } from "react-router-dom";

import { Mark } from "../brand/Mark";
import { StudyGuide } from "../components/StudyGuide";
import { formatSermonDate } from "../lib/dates";

/**
 * What a pastor sees when he opens the link.
 *
 * No sign-in, no navigation, nothing to click into — this is a page for
 * reading on a phone between other things, and every extra control is
 * something to accidentally press.
 *
 * Only the writing. Not the transcript, not the media, not the clip scores.
 * The link will be forwarded — that is what links are for — and everything
 * it can reach should be something the church would not mind a stranger
 * seeing.
 */

const ORDER = [
  ["metadata", "Sermon details"],
  ["youtube_packaging", "Title & description"],
  ["blog_post", "Blog post"],
  ["study_guide", "Study guide"],
  ["facebook_post", "Text post"],
  ["reel", "Reel"],
] as const;

function Body({ payloadJson }: { payloadJson: string }) {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(payloadJson) as Record<string, unknown>;
  } catch {
    return <p className="whitespace-pre-wrap text-[0.9375rem]">{payloadJson}</p>;
  }

  const prose = parsed.markdown ?? parsed.text;
  if (typeof prose === "string") {
    return (
      <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-ink">
        {prose}
      </p>
    );
  }

  // Before the title branch below, which the handout would otherwise fall
  // into — it has a title and no description, so a pastor asked to approve
  // the sheet would be shown its name and nothing else.
  if (Array.isArray(parsed.mainTruths) && Array.isArray(parsed.weekPlan)) {
    return <StudyGuide payload={parsed} />;
  }

  if (typeof parsed.title === "string") {
    return (
      <div className="grid gap-1.5">
        <p className="font-display text-lg font-semibold leading-snug text-ink">
          {parsed.title}
        </p>
        {typeof parsed.description === "string" && (
          <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-muted">
            {parsed.description}
          </p>
        )}
      </div>
    );
  }

  // The reel carries four platform packages; on a review page the Instagram
  // one stands for all of them — the pastor is checking the words, not
  // choosing a platform.
  const social = parsed.social as
    | Record<string, { title?: string; description?: string }>
    | undefined;
  if (social?.instagram) {
    return (
      <div className="grid gap-1.5">
        <p className="font-display text-lg font-semibold leading-snug text-ink">
          {social.instagram.title}
        </p>
        <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-muted">
          {social.instagram.description}
        </p>
      </div>
    );
  }

  const list = (parsed.mainPoints ?? parsed.scriptures) as unknown;
  if (Array.isArray(list)) {
    return (
      <ul className="grid gap-1 text-[0.9375rem] leading-relaxed text-ink">
        {list.map((x, i) => (
          <li key={i}>{String(x)}</li>
        ))}
      </ul>
    );
  }
  return null;
}

export function SharedPage() {
  const { token } = useParams();
  const view = useQuery(api.amplifyShare.publicView, { token: token ?? "" });

  if (view === undefined) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted">
        Loading…
      </div>
    );
  }

  if (view === null) {
    // Deliberately the same answer for a revoked link and one that never
    // existed. Telling somebody "this used to work" is telling them there
    // is something here to keep trying for.
    return (
      <div className="mx-auto grid max-w-xl gap-2 px-5 py-24 text-center">
        <p className="font-display text-xl font-semibold text-ink">
          This link isn&rsquo;t available
        </p>
        <p className="text-sm text-muted">
          Ask whoever sent it for a new one.
        </p>
      </div>
    );
  }

  const byKind = new Map(view.drafts.map((d) => [d.kind, d]));

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto grid max-w-2xl gap-7 px-5 py-10">
        <header className="grid gap-2">
          <div className="flex items-center gap-2 text-muted">
            <span className="text-brand">
              <Mark size={16} />
            </span>
            <span className="text-2xs">{view.church}</span>
          </div>
          <h1 className="font-display text-[2rem] font-bold leading-[1.15] tracking-[-0.02em] text-ink">
            {view.title}
          </h1>
          <p className="flex flex-wrap items-center gap-x-2.5 text-sm text-muted">
            {view.speaker}
            {view.sermonDate && (
              <>
                <span className="h-3 w-px bg-border" aria-hidden />
                {/* Spelled out. This page is read by somebody who did not
                    ask for it, on a phone, and 2026-08-02 is a database
                    talking. */}
                <span>{formatSermonDate(view.sermonDate)}</span>
              </>
            )}
          </p>
        </header>

        {view.drafts.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing has been written for this sermon yet.
          </p>
        ) : (
          ORDER.filter(([kind]) => byKind.has(kind)).map(([kind, label]) => (
            <section key={kind} className="grid gap-2">
              <h2 className="section-label">{label}</h2>
              <div className="card p-5">
                <Body payloadJson={byKind.get(kind)!.payloadJson} />
              </div>
            </section>
          ))
        )}

        <p className="text-2xs text-faint">
          Shared from Amplify. Nothing here has been published yet.
        </p>
      </div>
    </div>
  );
}
