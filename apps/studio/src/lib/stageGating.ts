/**
 * What can be worked on, and what genuinely cannot yet.
 *
 * Carried across from the first build of this app, and still the same
 * argument. The version before it drew one strict line through every stage,
 * so the blog post was locked until a reel thumbnail existed. That is not a
 * dependency — it is an order somebody picked when modelling a fan as a
 * queue, and it told a media person that Thursday's work was forbidden
 * because Tuesday's had not happened.
 *
 * A gate belongs here only when the later thing CONSUMES the earlier thing:
 *
 *   source → trim → transcript   real: each eats the last one's output
 *   the writing                  NOT a chain: all of it needs the transcript
 *                                and nothing else
 *   publish                      real: nothing to send until something exists
 *
 * Everything in the middle is siblings. Clips on Tuesday and the blog on
 * Thursday is a normal week, and nothing here should call that locked.
 *
 * Pure and React-free so it can be tested directly. The cost of getting this
 * wrong is somebody unable to do work they are perfectly entitled to do, and
 * that failure is silent — they just assume the app knows something they
 * don't.
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

/** What has actually been produced for this sermon so far. */
export type StageProgress = {
  source: boolean;
  trim: boolean;
  transcript: boolean;
  /** Separate from `transcript`: a transcript can exist and be wrong. */
  transcriptApproved: boolean;
  metadata: boolean;
  titleDesc: boolean;
  blog: boolean;
  textPost: boolean;
  published: boolean;
};

export type StageVerdict = { state: StageState; reason?: string };

/** The strictly ordered opening. Each one eats the last one's output. */
const CHAIN: {
  id: string;
  done: keyof StageProgress;
  needs?: keyof StageProgress;
  reason?: string;
}[] = [
  { id: "source", done: "source" },
  {
    id: "trim",
    done: "trim",
    needs: "source",
    reason: "Upload the service recording first",
  },
  {
    id: "transcript",
    done: "transcript",
    needs: "source",
    // Deliberately needs `source`, not `trim`. Transcribing the whole
    // service is wasteful but not wrong, and a church that has not trimmed
    // yet should not be stopped from getting text out of what it has.
    reason: "Upload the service recording first",
  },
];

/**
 * The writing. Every piece needs the transcript and nothing else, so they
 * are all offered at once and taken in whatever order suits the week.
 */
const FAN: { id: string; done: keyof StageProgress }[] = [
  { id: "metadata", done: "metadata" },
  { id: "title-desc", done: "titleDesc" },
  { id: "blog", done: "blog" },
  { id: "text-post", done: "textPost" },
];

/** Anything that counts as "something to publish". */
const PUBLISHABLE: (keyof StageProgress)[] = ["blog", "textPost", "titleDesc"];

export function hasSomethingToPublish(p: StageProgress): boolean {
  return PUBLISHABLE.some((k) => p[k]);
}

export function stageStates(
  progress: StageProgress,
  currentStage: string | null,
): Record<string, StageVerdict> {
  const out: Record<string, StageVerdict> = {};

  const settle = (id: string, done: boolean, blockedReason?: string): void => {
    if (done) {
      // "now" wins over "done" only for the stage being looked at, so the
      // rail shows where you are even on work you have finished and come
      // back to.
      out[id] = id === currentStage ? { state: "now" } : { state: "done" };
      return;
    }
    if (blockedReason) {
      // A stage you are standing on is never described as blocked — you can
      // see it, and telling somebody the page they are reading is
      // unavailable helps nobody.
      out[id] =
        id === currentStage
          ? { state: "now" }
          : { state: "blocked", reason: blockedReason };
      return;
    }
    out[id] = id === currentStage ? { state: "now" } : { state: "ready" };
  };

  for (const step of CHAIN) {
    const blocked = step.needs && !progress[step.needs] ? step.reason : undefined;
    settle(step.id, progress[step.done], blocked);
  }

  for (const step of FAN) {
    settle(
      step.id,
      progress[step.done],
      progress.transcript ? undefined : "Transcribe the sermon first",
    );
  }

  // Publish gathers. Stated as what is missing rather than as an order to
  // obey, because the operator can then go and fix it.
  //
  // Approval is required HERE and not earlier: a rough transcript is fine to
  // draft from, and becomes a problem only when something written from it
  // goes out under the church's name.
  const missing: string[] = [];
  if (!hasSomethingToPublish(progress)) missing.push("something to publish");
  if (!progress.transcriptApproved) missing.push("an approved transcript");
  settle(
    "publishing",
    progress.published,
    missing.length ? `Needs ${missing.join(", and ")}` : undefined,
  );

  return out;
}
