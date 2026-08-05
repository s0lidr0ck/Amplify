import { describe, expect, it } from "vitest";

import { firstStageNeeding, readStages, type SermonFacts } from "./stages";

/**
 * The rail is the navigation now, so what it says about each room is the
 * only orientation anybody gets. A room that claims to be done when it is
 * not sends somebody to publish a sermon that has no transcript.
 */

const EMPTY: SermonFacts = {
  hasSource: false,
  hasMaster: false,
  transcriptWords: null,
  transcriptApproved: false,
  writingReady: 0,
  writingTotal: 4,
  writingFailed: false,
  visualsReady: false,
  hasCover: false,
  clipsFound: 0,
  clipsCut: 0,
  reels: 0,
  publishedCount: 0,
  publishTotal: 5,
  publishFailed: false,
  running: new Set<string>(),
};

const facts = (over: Partial<SermonFacts> = {}): SermonFacts => ({
  ...EMPTY,
  ...over,
});

describe("reading the rooms", () => {
  it("asks for a recording before anything else", () => {
    const r = readStages(facts());
    expect(r.source.state).toBe("attention");
    // Waiting, not attention: there is genuinely nothing a person can do in
    // these rooms yet, and four amber badges would make the one that matters
    // invisible.
    expect(r.transcript.state).toBe("waiting");
    expect(r.writing.state).toBe("waiting");
    expect(r.publish.state).toBe("waiting");
  });

  it("says why a room cannot start yet", () => {
    const r = readStages(facts());
    expect(r.transcript.reason).toMatch(/Upload/);
    expect(r.writing.reason).toMatch(/Transcribe/);
  });

  it("does not call an untrimmed sermon done", () => {
    // The whole service transcribes fine — it just describes the singing
    // too, and every output written from it inherits that.
    const r = readStages(facts({ hasSource: true }));
    expect(r.source.state).toBe("attention");
    expect(r.source.caption).toMatch(/not trimmed/);
  });

  it("live work outranks everything on the rail", () => {
    const r = readStages(
      facts({ hasSource: true, running: new Set(["transcribe"]) }),
    );
    expect(r.transcript.state).toBe("running");
    expect(r.transcript.caption).toMatch(/listening/);
  });

  it("a transcript nobody has read is not done", () => {
    const r = readStages(
      facts({ hasSource: true, hasMaster: true, transcriptWords: 7068 }),
    );
    expect(r.transcript.state).toBe("attention");
    expect(r.transcript.reason).toMatch(/written from this/);
  });

  it("counts the writing rather than calling it started", () => {
    const r = readStages(
      facts({
        hasSource: true,
        hasMaster: true,
        transcriptWords: 7068,
        transcriptApproved: true,
        writingReady: 3,
      }),
    );
    expect(r.writing.caption).toBe("3 of 4");
    expect(r.writing.state).toBe("attention");
  });

  it("never calls clips finished", () => {
    // There is no number of clips that completes a sermon. Claiming
    // completion would invent a finish line the work does not have.
    const r = readStages(
      facts({
        hasSource: true,
        transcriptWords: 7068,
        clipsFound: 9,
        clipsCut: 9,
        reels: 3,
      }),
    );
    expect(r.clips.state).toBe("attention");
    expect(r.clips.caption).toBe("9 cut, 3 reels");
  });

  it("a failure is louder than a count", () => {
    const r = readStages(
      facts({
        hasSource: true,
        transcriptWords: 100,
        writingReady: 4,
        writingFailed: true,
      }),
    );
    expect(r.writing.state).toBe("failed");
  });
});

describe("where to land", () => {
  it("goes to the room that needs a person", () => {
    expect(firstStageNeeding(readStages(facts()))).toBe("source");
    expect(
      firstStageNeeding(
        readStages(facts({ hasSource: true, hasMaster: true })),
      ),
    ).toBe("transcript");
  });

  it("goes to live work ahead of a queue of chores", () => {
    // Something is actually happening; that is where somebody wants to be,
    // even though an earlier room is also asking for attention.
    const where = firstStageNeeding(
      readStages(facts({ running: new Set(["transcribe"]) })),
    );
    expect(where).toBe("transcript");
  });

  it("sends somebody to Visuals when no cover has been picked", () => {
    // Concepts written is not a cover chosen, and the website refuses to
    // publish without one. A room that called itself done here would hide
    // the thing actually blocking the blog post.
    const r = readStages(
      facts({
        hasSource: true,
        hasMaster: true,
        transcriptWords: 7068,
        transcriptApproved: true,
        writingReady: 4,
        visualsReady: true,
        hasCover: false,
      }),
    );
    expect(r.visuals.state).toBe("attention");
    expect(r.visuals.caption).toBe("concepts ready, no cover");
  });

  it("lands on publish when there is nothing left to chase", () => {
    const done = facts({
      hasSource: true,
      hasMaster: true,
      transcriptWords: 7068,
      transcriptApproved: true,
      writingReady: 4,
      visualsReady: true,
      hasCover: true,
      clipsFound: 9,
      clipsCut: 9,
      publishedCount: 5,
    });
    // Clips never report done, so it is the one asking — which is right:
    // there is always another moment worth cutting.
    expect(firstStageNeeding(readStages(done))).toBe("clips");
  });
});
