/**
 * What can be worked on, and what genuinely cannot yet.
 *
 * The previous model was one strict line through all thirteen stages, so the
 * blog post was locked until a reel thumbnail existed. That is not a
 * dependency, it is an order somebody had to pick when modelling a fan as a
 * queue — and it told a media person that Thursday's work was forbidden
 * because Tuesday's had not happened.
 *
 * A gate belongs here only when the later thing CONSUMES the earlier thing:
 *
 *   source → trim → transcript    real: each eats the last one's output
 *   the eight outputs            NOT a chain: all they need is the transcript
 *   publish                      real: it has nothing to send until something
 *                                exists to send
 *   results                      real: nothing to measure before publishing
 *
 * Everything in the middle is siblings. Clips on Tuesday and the blog on
 * Thursday is a normal week, and nothing here should call that locked.
 *
 * Pure and React-free so it can be tested directly — the cost of getting this
 * wrong is someone unable to do work they are perfectly entitled to do, and
 * that failure is silent.
 */

export type StageState =
  /** Behind you. */
  | "done"
  /** The stage you are looking at. */
  | "now"
  /** Available — your choice whether to do it next. */
  | "ready"
  /** Genuinely cannot start yet, and `reason` says why. */
  | "blocked";

/** What has actually been produced for this project so far. */
export type StageProgress = {
  source: boolean;
  trim: boolean;
  transcript: boolean;
  titleDesc: boolean;
  sermonThumbnail: boolean;
  clips: boolean;
  reel: boolean;
  reelThumbnail: boolean;
  blog: boolean;
  textPost: boolean;
  metadata: boolean;
  published: boolean;
};

export type StageVerdict = { state: StageState; reason?: string };

/** The strictly ordered opening. Each one eats the last one's output. */
const CHAIN: { href: string; done: keyof StageProgress; needs?: keyof StageProgress; reason?: string }[] = [
  { href: "source", done: "source" },
  { href: "trim", done: "trim", needs: "source", reason: "Add the source video first" },
  { href: "transcript", done: "transcript", needs: "trim", reason: "Trim the sermon first" },
];

/**
 * The fan. Every one of these needs the transcript and nothing else, so they
 * are all offered at once and taken in whatever order suits the week.
 */
const FAN: { href: string; done: keyof StageProgress }[] = [
  { href: "title-desc", done: "titleDesc" },
  { href: "sermon-thumbnail", done: "sermonThumbnail" },
  { href: "clips", done: "clips" },
  { href: "reel", done: "reel" },
  { href: "reel-thumbnail", done: "reelThumbnail" },
  { href: "blog", done: "blog" },
  { href: "text-post", done: "textPost" },
  { href: "metadata", done: "metadata" },
];

/** Anything that counts as "something to publish". */
const PUBLISHABLE: (keyof StageProgress)[] = [
  "clips",
  "reel",
  "blog",
  "textPost",
  "sermonThumbnail",
  "reelThumbnail",
];

export function hasSomethingToPublish(p: StageProgress): boolean {
  return PUBLISHABLE.some((k) => p[k]);
}

export function stageStates(
  progress: StageProgress,
  currentStage: string | null,
): Record<string, StageVerdict> {
  const out: Record<string, StageVerdict> = {};

  const settle = (href: string, done: boolean, blockedReason?: string): void => {
    if (done) {
      // "now" wins over "done" only for the stage being looked at, so the rail
      // shows where you are even on work you have already finished and come
      // back to.
      out[href] = href === currentStage ? { state: "now" } : { state: "done" };
      return;
    }
    if (blockedReason) {
      // A stage you are standing on is never described as blocked — you can
      // see it, and telling someone the page they are reading is unavailable
      // helps nobody.
      out[href] =
        href === currentStage
          ? { state: "now" }
          : { state: "blocked", reason: blockedReason };
      return;
    }
    out[href] = href === currentStage ? { state: "now" } : { state: "ready" };
  };

  for (const step of CHAIN) {
    const blocked = step.needs && !progress[step.needs] ? step.reason : undefined;
    settle(step.href, progress[step.done], blocked);
  }

  for (const step of FAN) {
    settle(
      step.href,
      progress[step.done],
      progress.transcript ? undefined : "Approve the transcript first",
    );
  }

  // Publish gathers. It needs a title to go out under, and at least one thing
  // to send — stated as what is missing rather than as an order to obey.
  const missing: string[] = [];
  if (!progress.titleDesc) missing.push("a title and description");
  if (!hasSomethingToPublish(progress)) missing.push("something to publish");
  settle(
    "publishing",
    progress.published,
    missing.length ? `Needs ${missing.join(", and ")}` : undefined,
  );

  settle(
    "analytics",
    false,
    progress.published ? undefined : "Nothing to measure until this is published",
  );

  return out;
}
