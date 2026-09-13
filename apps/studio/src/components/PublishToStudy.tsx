/**
 * Publishing a study guide to Study.
 *
 * This lives on the guide, not beside the Link-page toggle over in Publish.
 * The two look like siblings and are not: publishing a sermon to the Link
 * page is a decision about the sermon, while publishing a guide is a decision
 * about the guide — taken by somebody who has just read it and judged it good
 * enough to go out under the church's name. Putting the control anywhere else
 * invites publishing it unread.
 *
 * Publishing COPIES the guide. Editing or regenerating the draft afterwards
 * leaves what members are reading untouched until somebody publishes again,
 * which is why the republish warning says what it says: the button looks
 * identical in both states, and only the caption tells you one of them
 * replaces a sheet people have already opened.
 */
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";

import { errorText } from "../lib/errorText";

function when(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function PublishToStudy({
  projectId,
}: {
  projectId: Id<"amplifyProjects">;
}) {
  const published = useQuery(api.studyGuides.publishedFor, { projectId });
  const publish = useMutation(api.studyGuides.publish);
  const unpublish = useMutation(api.studyGuides.unpublish);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Undefined is "not loaded yet". Rendering a Publish button before the
  // answer arrives would offer to publish something already published.
  if (published === undefined) return null;

  async function act(run: () => Promise<unknown>, failed: string) {
    setBusy(true);
    setError(null);
    try {
      await run();
    } catch (e) {
      setError(errorText(e, failed));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-2 border-t border-border pt-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="grid gap-1">
          <h3 className="section-label">Study</h3>
          <p className="max-w-prose text-sm text-muted">
            {published
              ? `Live in Study since ${when(published.publishedAt)}${
                  published.revision > 1
                    ? ` · revision ${published.revision}`
                    : ""
                }`
              : "Members of your church read it in Study, with every scripture one tap from its text."}
          </p>
        </div>

        <div className="grid justify-items-end gap-1">
          <button
            disabled={busy}
            onClick={() =>
              void act(
                () => publish({ projectId }),
                "Couldn't publish that",
              )
            }
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 ${
              published
                ? "border-border bg-surface text-ink hover:border-border-strong"
                : "border-transparent bg-ink text-white hover:bg-ink/85"
            }`}
          >
            {busy
              ? "Publishing…"
              : published
                ? "Publish it again"
                : "Publish to Study"}
          </button>

          {/* Said where the finger is. The button looks the same either way. */}
          {!busy && published && (
            <span className="text-2xs text-warn">
              Replaces what members are reading
            </span>
          )}
        </div>
      </div>

      {published && (
        <button
          disabled={busy}
          onClick={() =>
            void act(
              () => unpublish({ guideId: published.guideId }),
              "Couldn't withdraw that",
            )
          }
          className="justify-self-start text-2xs text-muted underline hover:text-ink disabled:opacity-40"
        >
          Withdraw it from Study
        </button>
      )}

      {error && <p className="text-sm text-warn">{error}</p>}
    </section>
  );
}
