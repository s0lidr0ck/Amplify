import { describe, expect, it } from "vitest";

import { stageStates, type StageProgress } from "./stageGating";

/**
 * The failure this guards against is silent: a wrong gate does not error, it
 * just tells someone the work they came to do is unavailable, and they either
 * believe it or go around the app.
 *
 * The old model was one strict line, so these tests are mostly about the
 * middle being free.
 */

const NOTHING: StageProgress = {
  source: false,
  trim: false,
  transcript: false,
  titleDesc: false,
  sermonThumbnail: false,
  clips: false,
  reel: false,
  reelThumbnail: false,
  blog: false,
  textPost: false,
  metadata: false,
  published: false,
};

const TRANSCRIBED: StageProgress = {
  ...NOTHING,
  source: true,
  trim: true,
  transcript: true,
};

const FAN = [
  "title-desc",
  "sermon-thumbnail",
  "clips",
  "reel",
  "reel-thumbnail",
  "blog",
  "text-post",
  "metadata",
];

describe("the opening chain, where order is real", () => {
  it("offers only the source on a brand new project", () => {
    const s = stageStates(NOTHING, null);
    expect(s.source.state).toBe("ready");
    expect(s.trim.state).toBe("blocked");
    expect(s.transcript.state).toBe("blocked");
  });

  it("says what is missing rather than only refusing", () => {
    const s = stageStates(NOTHING, null);
    expect(s.trim.reason).toMatch(/source/i);
    expect(s.transcript.reason).toMatch(/trim/i);
  });

  it("opens each step as the one before it lands", () => {
    const sourced = stageStates({ ...NOTHING, source: true }, null);
    expect(sourced.trim.state).toBe("ready");
    expect(sourced.transcript.state).toBe("blocked");

    const trimmed = stageStates({ ...NOTHING, source: true, trim: true }, null);
    expect(trimmed.transcript.state).toBe("ready");
  });
});

describe("the middle, where order was invented", () => {
  it("opens all eight outputs at once when the transcript lands", () => {
    // The point of the rework. Previously this was a queue: the blog was
    // locked behind a reel thumbnail, which it has never needed.
    const s = stageStates(TRANSCRIBED, null);
    for (const href of FAN) {
      expect(s[href].state, href).toBe("ready");
    }
  });

  it("keeps the others open when one is finished", () => {
    const s = stageStates({ ...TRANSCRIBED, clips: true }, null);
    expect(s.clips.state).toBe("done");
    expect(s.blog.state).toBe("ready");
    expect(s["reel-thumbnail"].state).toBe("ready");
  });

  it("does not require the outputs to be done in any particular order", () => {
    // Blog on Thursday, clips never. A normal week.
    const s = stageStates({ ...TRANSCRIBED, blog: true }, null);
    expect(s.blog.state).toBe("done");
    expect(s.clips.state).toBe("ready");
    expect(s["title-desc"].state).toBe("ready");
  });

  it("holds them all until the transcript is approved", () => {
    const s = stageStates({ ...NOTHING, source: true, trim: true }, null);
    for (const href of FAN) {
      expect(s[href].state, href).toBe("blocked");
      expect(s[href].reason, href).toMatch(/transcript/i);
    }
  });
});

describe("publishing, which gathers", () => {
  it("is blocked with nothing made, and says both things are missing", () => {
    const s = stageStates(TRANSCRIBED, null);
    expect(s.publishing.state).toBe("blocked");
    expect(s.publishing.reason).toMatch(/title/i);
    expect(s.publishing.reason).toMatch(/publish/i);
  });

  it("still refuses with a title but nothing to send", () => {
    const s = stageStates({ ...TRANSCRIBED, titleDesc: true }, null);
    expect(s.publishing.state).toBe("blocked");
    expect(s.publishing.reason).toMatch(/something to publish/i);
    expect(s.publishing.reason).not.toMatch(/title/i);
  });

  it("still refuses with something to send but no title", () => {
    const s = stageStates({ ...TRANSCRIBED, blog: true }, null);
    expect(s.publishing.state).toBe("blocked");
    expect(s.publishing.reason).toMatch(/title/i);
  });

  it("opens as soon as there is a title and one output", () => {
    const s = stageStates({ ...TRANSCRIBED, titleDesc: true, blog: true }, null);
    expect(s.publishing.state).toBe("ready");
    expect(s.publishing.reason).toBeUndefined();
  });

  it("accepts any single output as something to publish", () => {
    for (const key of ["clips", "reel", "blog", "textPost", "sermonThumbnail"] as const) {
      const s = stageStates({ ...TRANSCRIBED, titleDesc: true, [key]: true }, null);
      expect(s.publishing.state, key).toBe("ready");
    }
  });

  it("does not treat metadata alone as something to publish", () => {
    // Metadata describes the other outputs; on its own there is nothing to
    // attach it to.
    const s = stageStates({ ...TRANSCRIBED, titleDesc: true, metadata: true }, null);
    expect(s.publishing.state).toBe("blocked");
  });
});

describe("results", () => {
  it("waits for something to have been published", () => {
    const s = stageStates({ ...TRANSCRIBED, titleDesc: true, blog: true }, null);
    expect(s.analytics.state).toBe("blocked");
    expect(s.analytics.reason).toMatch(/publish/i);
  });

  it("opens once it has", () => {
    const s = stageStates({ ...TRANSCRIBED, titleDesc: true, blog: true, published: true }, null);
    expect(s.analytics.state).toBe("ready");
  });
});

describe("where you are standing", () => {
  it("marks the current stage, including one already finished", () => {
    const s = stageStates({ ...TRANSCRIBED, clips: true }, "clips");
    expect(s.clips.state).toBe("now");
  });

  it("never describes the page you are on as blocked", () => {
    // Reachable by URL, or by finishing something upstream in another tab.
    // Telling someone the screen in front of them is unavailable helps nobody.
    const s = stageStates(NOTHING, "blog");
    expect(s.blog.state).toBe("now");
    expect(s.blog.reason).toBeUndefined();
  });

  it("leaves every other stage judged normally", () => {
    const s = stageStates(TRANSCRIBED, "clips");
    expect(s.blog.state).toBe("ready");
    expect(s.source.state).toBe("done");
  });
});

describe("the shape as a whole", () => {
  it("judges all thirteen stages", () => {
    const s = stageStates(TRANSCRIBED, null);
    expect(Object.keys(s)).toHaveLength(13);
  });

  it("never returns a blocked stage without a reason", () => {
    for (const progress of [NOTHING, TRANSCRIBED, { ...TRANSCRIBED, blog: true }]) {
      for (const [href, verdict] of Object.entries(stageStates(progress, null))) {
        if (verdict.state === "blocked") {
          expect(verdict.reason, href).toBeTruthy();
        }
      }
    }
  });
});
