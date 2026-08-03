import { describe, expect, it } from "vitest";

import { hasSomethingToPublish, stageStates, type StageProgress } from "./stageGating";

/**
 * The failure this guards against is silent: a wrong gate does not error, it
 * tells somebody the work they came to do is unavailable, and they either
 * believe it or go around the app.
 *
 * The model this replaced was one strict line through every stage, so most
 * of these tests are about the middle being free.
 */

const NOTHING: StageProgress = {
  source: false,
  trim: false,
  transcript: false,
  transcriptApproved: false,
  metadata: false,
  titleDesc: false,
  blog: false,
  textPost: false,
  published: false,
};

const TRANSCRIBED: StageProgress = {
  ...NOTHING,
  source: true,
  trim: true,
  transcript: true,
};

const FAN = ["metadata", "title-desc", "blog", "text-post"];

describe("the ordered opening", () => {
  it("offers the upload on an empty sermon", () => {
    expect(stageStates(NOTHING, null).source).toEqual({ state: "ready" });
  });

  it("blocks the trim until there is something to trim, and says so", () => {
    const v = stageStates(NOTHING, null).trim;
    expect(v.state).toBe("blocked");
    expect(v.reason).toMatch(/upload/i);
  });

  it("lets you transcribe an untrimmed service", () => {
    // Wasteful, not wrong. A church that has not trimmed yet should still
    // be able to get text out of what it has.
    const v = stageStates({ ...NOTHING, source: true }, null).transcript;
    expect(v.state).toBe("ready");
  });

  it("marks finished steps done", () => {
    const s = stageStates(TRANSCRIBED, null);
    expect(s.source.state).toBe("done");
    expect(s.trim.state).toBe("done");
    expect(s.transcript.state).toBe("done");
  });
});

describe("the writing is a fan, not a queue", () => {
  it("offers every piece at once once there is a transcript", () => {
    const s = stageStates(TRANSCRIBED, null);
    for (const id of FAN) {
      expect(s[id], `${id} should be ready`).toEqual({ state: "ready" });
    }
  });

  it("does not lock the blog behind the metadata", () => {
    // The exact failure the old model produced: siblings queued behind each
    // other because a list had to be in some order.
    const s = stageStates({ ...TRANSCRIBED, metadata: true }, null);
    expect(s.blog.state).toBe("ready");
    expect(s["text-post"].state).toBe("ready");
  });

  it("keeps the rest open after one is finished", () => {
    const s = stageStates({ ...TRANSCRIBED, blog: true }, null);
    expect(s.blog.state).toBe("done");
    expect(s.metadata.state).toBe("ready");
  });

  it("blocks all of it before the transcript, with one reason", () => {
    const s = stageStates({ ...NOTHING, source: true, trim: true }, null);
    for (const id of FAN) {
      expect(s[id].state, id).toBe("blocked");
      expect(s[id].reason).toMatch(/transcribe/i);
    }
  });
});

describe("where you are standing", () => {
  it("is 'now', even on work already done", () => {
    const s = stageStates(TRANSCRIBED, "trim");
    expect(s.trim.state).toBe("now");
  });

  it("is 'now' rather than blocked", () => {
    // Telling somebody the page they are reading is unavailable helps
    // nobody — they can see it.
    const s = stageStates(NOTHING, "trim");
    expect(s.trim.state).toBe("now");
    expect(s.trim.reason).toBeUndefined();
  });

  it("leaves the other stages alone", () => {
    const s = stageStates(TRANSCRIBED, "blog");
    expect(s.blog.state).toBe("now");
    expect(s.metadata.state).toBe("ready");
    expect(s.source.state).toBe("done");
  });
});

describe("publishing gathers", () => {
  it("names everything missing at once", () => {
    // Two trips to find two problems is how someone gives up on a screen.
    const v = stageStates(TRANSCRIBED, null).publishing;
    expect(v.state).toBe("blocked");
    expect(v.reason).toMatch(/something to publish/i);
    expect(v.reason).toMatch(/approved transcript/i);
  });

  it("still asks for approval once there is something to send", () => {
    const v = stageStates({ ...TRANSCRIBED, blog: true }, null).publishing;
    expect(v.state).toBe("blocked");
    expect(v.reason).toMatch(/approved transcript/i);
    expect(v.reason).not.toMatch(/something to publish/i);
  });

  it("opens when there is something to send and the transcript is approved", () => {
    const v = stageStates(
      { ...TRANSCRIBED, blog: true, transcriptApproved: true },
      null,
    ).publishing;
    expect(v.state).toBe("ready");
  });

  it("does not require approval to draft", () => {
    // Approval matters where something goes out under the church's name,
    // not while somebody is still writing.
    const s = stageStates(TRANSCRIBED, null);
    expect(s.blog.state).toBe("ready");
    expect(TRANSCRIBED.transcriptApproved).toBe(false);
  });
});

describe("what counts as publishable", () => {
  it("is nothing on an empty sermon", () => {
    expect(hasSomethingToPublish(NOTHING)).toBe(false);
  });

  it("is any one written piece", () => {
    expect(hasSomethingToPublish({ ...NOTHING, blog: true })).toBe(true);
    expect(hasSomethingToPublish({ ...NOTHING, textPost: true })).toBe(true);
    expect(hasSomethingToPublish({ ...NOTHING, titleDesc: true })).toBe(true);
  });

  it("is not the transcript on its own", () => {
    // The transcript is an input to the work, not a thing anyone publishes.
    expect(hasSomethingToPublish({ ...NOTHING, transcript: true })).toBe(false);
  });
});
