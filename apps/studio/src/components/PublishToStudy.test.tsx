import { describe, it, expect, vi, beforeEach } from "vitest";
// fireEvent, not user-event: this repo has @testing-library/react alone.
import { fireEvent, render, screen } from "@testing-library/react";

/**
 * Publishing a guide to Study.
 *
 * The control lives on the guide itself rather than beside the Link-page
 * toggle in Publish, because the two look like siblings and are not.
 * Publishing a sermon to the Link page is a decision about the sermon;
 * publishing a guide is a decision about the guide, taken by somebody who has
 * just read it and judged it good enough to go out under the church's name.
 *
 * So the tests that matter are about what the control TELLS you before you
 * press it: that a republish replaces what members are already reading, and
 * which revision is out there now.
 */

let published: { guideId: string; revision: number; publishedAt: number } | null | undefined;
const publish = vi.fn();
const unpublish = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: () => published,
  useMutation: (ref: unknown) =>
    String(ref).includes("unpublish") ? unpublish : publish,
}));

vi.mock("@convex/api", () => ({
  api: {
    studyGuides: {
      publishedFor: "studyGuides:publishedFor",
      publish: "studyGuides:publish",
      unpublish: "studyGuides:unpublish",
    },
  },
}));

import { PublishToStudy } from "./PublishToStudy";

const PROJECT = "proj_1" as never;

beforeEach(() => {
  published = undefined;
  publish.mockReset().mockResolvedValue("guide_1");
  unpublish.mockReset().mockResolvedValue(null);
});

describe("Publish to Study", () => {
  it("says nothing while it does not yet know", () => {
    published = undefined;
    render(<PublishToStudy projectId={PROJECT} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers to publish when nothing is out there", () => {
    published = null;
    render(<PublishToStudy projectId={PROJECT} />);
    expect(screen.getByRole("button", { name: /publish to study/i })).toBeTruthy();
  });

  it("publishes when pressed", () => {
    published = null;
    render(<PublishToStudy projectId={PROJECT} />);
    fireEvent.click(screen.getByRole("button", { name: /publish to study/i }));
    expect(publish).toHaveBeenCalledWith({ projectId: PROJECT });
  });

  it("says it is live, and since when", () => {
    published = { guideId: "g1", revision: 1, publishedAt: Date.parse("2026-09-13T12:00:00Z") };
    render(<PublishToStudy projectId={PROJECT} />);
    expect(screen.getByText(/live in study/i)).toBeTruthy();
  });

  it("WARNS THAT REPUBLISHING REPLACES WHAT MEMBERS ARE READING", () => {
    // The button looks identical in both states. Saying so is the whole
    // point — the same reason PiecePage says "Replaces the edits you made".
    published = { guideId: "g1", revision: 1, publishedAt: Date.now() };
    render(<PublishToStudy projectId={PROJECT} />);
    expect(screen.getByText(/replaces what members are reading/i)).toBeTruthy();
  });

  it("shows the revision once it has been published more than once", () => {
    published = { guideId: "g1", revision: 3, publishedAt: Date.now() };
    render(<PublishToStudy projectId={PROJECT} />);
    expect(screen.getByText(/3/)).toBeTruthy();
  });

  it("offers to withdraw it", () => {
    published = { guideId: "g1", revision: 1, publishedAt: Date.now() };
    render(<PublishToStudy projectId={PROJECT} />);
    fireEvent.click(screen.getByRole("button", { name: /withdraw/i }));
    expect(unpublish).toHaveBeenCalledWith({ guideId: "g1" });
  });

  it("reports a failure rather than looking like it worked", () => {
    published = null;
    publish.mockRejectedValue(new Error("No study guide written for this sermon yet"));
    render(<PublishToStudy projectId={PROJECT} />);
    fireEvent.click(screen.getByRole("button", { name: /publish to study/i }));
    return screen.findByText(/no study guide written/i);
  });
});
