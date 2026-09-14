import { describe, it, expect, vi, beforeEach } from "vitest";
// fireEvent, not user-event: this repo has @testing-library/react alone.
import { fireEvent, render, screen } from "@testing-library/react";

/**
 * Correcting who preached a sermon, after the fact.
 *
 * These fields were settable once, on the New sermon form, and never again —
 * updateProject has accepted them all along and nothing in Studio called it.
 * So a sermon entered against the wrong person could only be fixed by renaming
 * that person on the roster, which moves every sermon they have.
 *
 * It reaches further than Amplify: Study copies these onto a published guide
 * and its catalog files guides BY speaker, day and service, so a wrong name
 * here puts the guide under the wrong person for every reader.
 */

const update = vi.fn();
const addSpeaker = vi.fn();
const speakers = [
  { _id: "s1", name: "Chris Tidwell", displayName: "Pastor Chris" },
  { _id: "s2", name: "Bro. Keith", displayName: "Bro. Keith" },
];

vi.mock("convex/react", () => ({
  useQuery: () => speakers,
  useMutation: (ref: unknown) =>
    String(ref).includes("Speakers") ? addSpeaker : update,
}));

vi.mock("@convex/api", () => ({
  api: {
    amplify: { updateProject: "amplify:updateProject" },
    amplifySpeakers: { list: "amplifySpeakers:list", add: "amplifySpeakers:add" },
  },
}));

import { EditSermonDetails } from "./EditSermonDetails";

function renderIt(over: Record<string, unknown> = {}) {
  render(
    <EditSermonDetails
      projectId={"p1" as never}
      churchId={"c1" as never}
      title="One God, One Name"
      speaker="Chris Tidwell"
      sermonDate="2026-09-09"
      {...over}
    />,
  );
}

beforeEach(() => {
  update.mockReset();
  update.mockResolvedValue(null);
  addSpeaker.mockReset();
  addSpeaker.mockResolvedValue(null);
});

describe("editing a sermon's details", () => {
  it("stays out of the way until asked", () => {
    renderIt();
    expect(screen.getByText("Edit details")).toBeTruthy();
    expect(screen.queryByText("Save details")).toBeNull();
  });

  // Reopening on an empty box would invite somebody to reassign a sermon by
  // accident, just by saving.
  it("opens showing who is already on the sermon", () => {
    renderIt();
    fireEvent.click(screen.getByText("Edit details"));
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("s1");
  });

  it("saves the roster name and what the church calls them", async () => {
    renderIt({ speaker: "Bro. Keith" });
    fireEvent.click(screen.getByText("Edit details"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "s1" } });
    fireEvent.click(screen.getByText("Save details"));

    await vi.waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][0]).toMatchObject({
      projectId: "p1",
      speaker: "Chris Tidwell",
      speakerDisplayName: "Pastor Chris",
    });
  });

  it("carries the date and time the catalog files by", async () => {
    renderIt();
    fireEvent.click(screen.getByText("Edit details"));
    fireEvent.change(screen.getByLabelText(/Date preached/), {
      target: { value: "2026-09-13" },
    });
    fireEvent.click(screen.getByText("Save details"));

    await vi.waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][0].sermonDate).toBe("2026-09-13");
  });

  it("REFUSES TO SAVE A SERMON WITH NO SPEAKER", async () => {
    renderIt({ speaker: "Someone Unrostered" });
    fireEvent.click(screen.getByText("Edit details"));
    // Falls to the guest fields; empty the name.
    fireEvent.change(screen.getByLabelText(/Their name/), {
      target: { value: "  " },
    });
    fireEvent.click(screen.getByText("Save details"));

    expect(await screen.findByText(/needs a speaker/)).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
  });

  it("says that a published guide moves with it", () => {
    renderIt();
    fireEvent.click(screen.getByText("Edit details"));
    expect(
      screen.getByText(/published study guide updates with it/),
    ).toBeTruthy();
  });
});
