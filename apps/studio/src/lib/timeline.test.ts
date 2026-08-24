import { describe, expect, it } from "vitest";

import { timelineAsset } from "./timeline";

/**
 * Which video a clip's timestamps count into.
 *
 * Get this wrong and the clips room has nothing to show: the gallery paints
 * grey rectangles where the frames should be, the trim will not open, and
 * "Cut it" is dead — on a sermon whose moments have already been found and
 * scored. That was the bug. A sermon imported already topped and tailed
 * never gets a master, and everything here assumed one.
 */

const source = { _id: "src", kind: "source_video" };
const master = { _id: "mst", kind: "sermon_master" };
const cover = { _id: "cov", kind: "sermon_thumbnail" };

describe("timelineAsset", () => {
  it("is the file the transcript was read from", () => {
    expect(timelineAsset([source, master, cover], "src")).toBe(source);
    expect(timelineAsset([source, master, cover], "mst")).toBe(master);
  });

  it("is the source recording when a sermon arrived already cut", () => {
    // No master, because nobody trimmed one — the import was the sermon.
    // The clips are still real: they were read off this file.
    expect(timelineAsset([source, cover], "src")).toBe(source);
  });

  it("falls back to the master when the transcript names a replaced file", () => {
    // Re-trimming retires the old master, which then drops out of the asset
    // list while the transcript still points at it. The live file is the
    // better guess than nothing.
    expect(timelineAsset([source, master], "gone")).toBe(master);
  });

  it("falls back to the master, then the source, with no transcript yet", () => {
    expect(timelineAsset([source, master], null)).toBe(master);
    expect(timelineAsset([source], null)).toBe(source);
  });

  it("is nothing when there is no video at all", () => {
    expect(timelineAsset([cover], "src")).toBeNull();
    expect(timelineAsset([], null)).toBeNull();
  });
});
