/**
 * The five rooms of a sermon, and how to tell what state each one is in.
 *
 * This is the sermon page's whole information architecture in one file.
 * Before it, the page was a single scroll carrying eight jobs — you could
 * not link to a place, return to a place, or tell finished work from
 * waiting work without reading every card on the way past.
 *
 * The order is real. You cannot transcribe what you have not uploaded, and
 * you cannot write from a transcript that does not exist. The middle is
 * genuinely parallel — the blog post and the clips do not block each other —
 * and publishing needs all of it. That shape was already drawn by the signal
 * rail; here it becomes the navigation, so the thing that describes the work
 * is also the thing you steer by.
 */

export type StageSlug =
  | "source"
  | "transcript"
  | "writing"
  | "clips"
  | "publish";

/**
 * done       behind you
 * running    the worker is on it right now
 * attention  it needs a person before it can go
 * waiting    nothing to do here yet
 * failed     it tried and could not
 */
export type StageState =
  | "done"
  | "running"
  | "attention"
  | "waiting"
  | "failed";

export type Stage = {
  slug: StageSlug;
  label: string;
  /** What this room is for, said in one line for somebody new to it. */
  blurb: string;
  /** Which arm of the shape: the ordered run, the parallel set, the end. */
  group: "trunk" | "fan" | "gather";
};

export const STAGES: Stage[] = [
  {
    slug: "source",
    label: "Source",
    blurb: "The recording, and cutting the sermon out of the service.",
    group: "trunk",
  },
  {
    slug: "transcript",
    label: "Transcript",
    blurb: "Every word, checked and approved. Everything else is written from it.",
    group: "trunk",
  },
  {
    slug: "writing",
    label: "Writing",
    blurb: "The blog post, the packaging, the posts, the thumbnails.",
    group: "fan",
  },
  {
    slug: "clips",
    label: "Clips & reels",
    blurb: "The moments worth cutting, and what goes out with them.",
    group: "fan",
  },
  {
    slug: "publish",
    label: "Publish",
    blurb: "Where it goes, and what has already gone.",
    group: "gather",
  },
];

/** What one room currently is, plus the number worth showing under it. */
export type StageReading = {
  state: StageState;
  /** "3 of 5", "9 found", "approved" — the fact, not a re-labelling. */
  caption: string;
  /** Why it cannot proceed, when that is the useful thing to say. */
  reason?: string;
};

export type SermonFacts = {
  hasSource: boolean;
  hasMaster: boolean;
  transcriptWords: number | null;
  transcriptApproved: boolean;
  writingReady: number;
  writingTotal: number;
  writingFailed: boolean;
  clipsFound: number;
  clipsCut: number;
  reels: number;
  publishedCount: number;
  publishTotal: number;
  publishFailed: boolean;
  /** Job types the worker is running right now. */
  running: Set<string>;
};

/**
 * Read every room at once.
 *
 * Kept in one function rather than each room deciding for itself, because
 * the rail shows all five side by side and two rooms disagreeing about what
 * "done" means is exactly the kind of thing nobody notices until it has been
 * wrong for a month.
 */
export function readStages(f: SermonFacts): Record<StageSlug, StageReading> {
  const source: StageReading = f.running.has("trim")
    ? { state: "running", caption: "cutting the sermon out" }
    : f.running.has("youtube_import")
      ? { state: "running", caption: "fetching the video" }
      : !f.hasSource
        ? { state: "attention", caption: "nothing uploaded" }
        : f.hasMaster
          ? { state: "done", caption: "sermon cut out" }
          : // Usable without trimming — the whole service transcribes fine,
            // it just describes the singing too. Amber rather than done.
            { state: "attention", caption: "not trimmed yet" };

  const transcript: StageReading = f.running.has("transcribe")
    ? { state: "running", caption: "listening to the sermon" }
    : f.transcriptWords === null
      ? {
          state: f.hasSource ? "attention" : "waiting",
          caption: "not transcribed",
          reason: f.hasSource ? undefined : "Upload the recording first.",
        }
      : f.transcriptApproved
        ? { state: "done", caption: `${f.transcriptWords.toLocaleString()} words` }
        : {
            state: "attention",
            caption: "needs a read",
            reason: "Everything else gets written from this.",
          };

  const writingBlocked = f.transcriptWords === null;
  const writing: StageReading = f.writingFailed
    ? { state: "failed", caption: "one of them failed" }
    : writingBlocked
      ? {
          state: "waiting",
          caption: `0 of ${f.writingTotal}`,
          reason: "Transcribe the sermon first.",
        }
      : f.writingReady === 0
        ? { state: "attention", caption: `0 of ${f.writingTotal}` }
        : f.writingReady >= f.writingTotal
          ? { state: "done", caption: `all ${f.writingTotal} written` }
          : {
              state: "attention",
              caption: `${f.writingReady} of ${f.writingTotal}`,
            };

  const clips: StageReading = f.running.has("clip_export")
    ? { state: "running", caption: "cutting a clip" }
    : f.clipsFound === 0
      ? {
          state: writingBlocked ? "waiting" : "attention",
          caption: "none found yet",
          reason: writingBlocked ? "Transcribe the sermon first." : undefined,
        }
      : f.clipsCut === 0
        ? { state: "attention", caption: `${f.clipsFound} found, none cut` }
        : {
            // Not "done" — there is no number of clips that finishes a
            // sermon, so claiming completion here would be inventing a
            // finish line the work does not have.
            state: "attention",
            caption: `${f.clipsCut} cut${f.reels ? `, ${f.reels} reel${f.reels === 1 ? "" : "s"}` : ""}`,
          };

  const publish: StageReading = f.running.has("publish")
    ? { state: "running", caption: "sending it out" }
    : f.publishFailed
      ? { state: "failed", caption: "one didn't go" }
      : f.publishedCount === 0
        ? {
            state: f.writingReady > 0 ? "attention" : "waiting",
            caption: `0 of ${f.publishTotal} out`,
            reason: f.writingReady > 0 ? undefined : "Nothing written yet.",
          }
        : f.publishedCount >= f.publishTotal
          ? { state: "done", caption: "all out" }
          : { state: "attention", caption: `${f.publishedCount} of ${f.publishTotal} out` };

  return { source, transcript, writing, clips, publish };
}

/**
 * Where to send somebody who opened the sermon without saying where.
 *
 * The first room that wants them — which is nearly always the one they came
 * back for. Landing on "Source" every time would mean scrolling past
 * finished work to reach the thing that isn't.
 */
export function firstStageNeeding(
  readings: Record<StageSlug, StageReading>,
): StageSlug {
  const urgent = STAGES.find(
    (s) => readings[s.slug].state === "failed" || readings[s.slug].state === "running",
  );
  if (urgent) return urgent.slug;
  const waiting = STAGES.find((s) => readings[s.slug].state === "attention");
  return waiting?.slug ?? "publish";
}
