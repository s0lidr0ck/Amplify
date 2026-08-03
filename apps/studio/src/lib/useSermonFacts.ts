import { useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";

import { readStages, type SermonFacts, type StageReading, type StageSlug } from "./stages";

/**
 * Everything the rail needs to know about a sermon, in one read.
 *
 * Gathered at the layout rather than in each room, because the rail is on
 * screen in every room and has to be right in all of them. A room that
 * computed its own state would be the one place the rail disagreed with the
 * page underneath it.
 *
 * These are all live subscriptions the rooms subscribe to anyway; Convex
 * dedupes identical queries, so asking here costs nothing extra.
 */

/** The five written pieces, which is what "3 of 5" counts. */
const WRITING_KINDS = [
  "metadata",
  "blog_post",
  "youtube_packaging",
  "facebook_post",
  "thumbnail_concepts",
];

export function useSermonFacts(projectId: Id<"amplifyProjects">) {
  const assets = useQuery(api.amplifyMedia.listAssets, { projectId });
  const transcript = useQuery(api.amplifyTranscripts.summary, { projectId });
  const drafts = useQuery(api.amplifyDrafts.list, { projectId });
  const publications = useQuery(api.amplifyPublish.list, { projectId });
  const readiness = useQuery(api.amplifyPublish.readiness, { projectId });
  const clips = useQuery(api.amplifyClips.list, { projectId });
  const jobs = useQuery(api.amplifyWorker.listJobs, { projectId });

  const loading =
    !assets ||
    transcript === undefined ||
    !drafts ||
    !publications ||
    !readiness ||
    !clips ||
    !jobs;

  const source = assets?.find((a) => a.kind === "source_video") ?? null;
  const master = assets?.find((a) => a.kind === "sermon_master") ?? null;

  const ready = (kind: string) =>
    (drafts ?? []).some((d) => d.kind === kind && d.status === "ready");

  const facts: SermonFacts = {
    hasSource: Boolean(source),
    hasMaster: Boolean(master),
    transcriptWords: transcript ? transcript.wordCount : null,
    transcriptApproved: transcript?.approved ?? false,
    writingReady: WRITING_KINDS.filter(ready).length,
    writingTotal: WRITING_KINDS.length,
    writingFailed: (drafts ?? []).some(
      (d) => WRITING_KINDS.includes(d.kind) && d.status === "failed",
    ),
    clipsFound: (clips ?? []).length,
    clipsCut: (clips ?? []).filter((c) => c.exportedAssetId).length,
    reels: (drafts ?? []).filter(
      (d) => d.kind === "reel" && d.status === "ready",
    ).length,
    publishedCount: (publications ?? []).filter((p) => p.status === "posted")
      .length,
    publishTotal: (readiness ?? []).length || 5,
    publishFailed: (publications ?? []).some((p) => p.status === "failed"),
    // Only what is happening right now. A finished job is history and the
    // rail is not a log.
    running: new Set(
      (jobs ?? [])
        .filter((j) => j.status === "running" || j.status === "queued")
        .map((j) => j.jobType),
    ),
  };

  return {
    loading,
    facts,
    readings: readStages(facts),
    assets: assets ?? [],
    source,
    master,
    hasTranscript: transcript !== null && transcript !== undefined,
  };
}
