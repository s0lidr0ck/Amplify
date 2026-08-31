import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const edit = vi.fn().mockResolvedValue(null);
vi.mock("convex/react", () => ({ useMutation: () => edit }));
vi.mock("@convex/api", () => ({
  api: { amplifyDrafts: { edit: "amplifyDrafts:edit" } },
}));

import { StudyGuideEditor } from "./StudyGuideEditor";

/**
 * The handout is the one structured piece somebody may edit before it goes
 * to a copier, so what matters here is that editing it by hand cannot
 * quietly lose part of the sheet.
 */

const guide = {
  title: "Overcoming Our Lack of Faith",
  primaryText: "Mark 9:23–24",
  purpose: "To help believers recognize weak faith is still faith.",
  centralTruth: "Weak faith can still be real faith.",
  centralQuestion: "Is your faith small, or simply young?",
  keyScriptures: [
    { reference: "Romans 10:17", note: "Faith grows by hearing." },
    { reference: "James 2:17", note: "Living faith produces action." },
  ],
  mainTruths: [{ heading: "Faith is not the absence of fear", body: "It chooses to trust." }],
  contrast: { leftLabel: "", rightLabel: "", rows: [] },
  reflectionPrompts: ["Where is my faith being tested?"],
  weekPlan: [{ day: "1", read: "Mark 9:14–29", focus: "Pray honestly." }],
  keyTakeaways: ["My faith may be small, but my God is great."],
  memoryVerse: { reference: "Matthew 17:20", text: "If ye have faith…" },
  closing: "I will stand again.",
  // Not a field this editor knows about — a draft from an older or newer
  // prompt must survive a round trip through the form.
  somethingTheFormNeverHeardOf: "keep me",
};

const saved = () =>
  JSON.parse(edit.mock.calls.at(-1)![0].payloadJson) as Record<string, unknown>;

const open = (payload: object = guide) =>
  render(
    <StudyGuideEditor
      draftId={"d1" as never}
      payloadJson={JSON.stringify(payload)}
      onDone={() => {}}
    />,
  );

describe("editing the handout by hand", () => {
  beforeEach(() => edit.mockClear());

  it("offers fields rather than JSON", () => {
    open();
    expect(screen.getByDisplayValue("Overcoming Our Lack of Faith")).toBeTruthy();
    expect(screen.getByDisplayValue("Romans 10:17")).toBeTruthy();
    expect(screen.getByDisplayValue("I will stand again.")).toBeTruthy();
  });

  it("edits the front-page overview", async () => {
    open({ ...guide, overview: "Where the message started." });
    const box = screen.getByDisplayValue("Where the message started.");
    fireEvent.change(box, { target: { value: "Where it actually started." } });
    fireEvent.click(screen.getByText("Save"));
    await vi.waitFor(() => expect(edit).toHaveBeenCalled());
    expect(saved().overview).toBe("Where it actually started.");
  });

  it("offers the overview on a guide written before it existed", async () => {
    // The field has to be there and empty, not absent — otherwise the only
    // way to get an overview onto an old handout is to regenerate it.
    open();
    expect(screen.getByText("Overview")).toBeTruthy();
    fireEvent.change(screen.getByText("Overview").closest("section")!.querySelector("textarea")!, {
      target: { value: "Written in by hand." },
    });
    fireEvent.click(screen.getByText("Save"));
    await vi.waitFor(() => expect(edit).toHaveBeenCalled());
    expect(saved().overview).toBe("Written in by hand.");
  });

  it("keeps fields it does not know about", async () => {
    open();
    fireEvent.click(screen.getByText("Save"));
    await vi.waitFor(() => expect(edit).toHaveBeenCalled());
    expect(saved().somethingTheFormNeverHeardOf).toBe("keep me");
  });

  it("treats a blanked line as a deleted item", async () => {
    open();
    const prompts = screen.getByDisplayValue(
      "Where is my faith being tested?",
    );
    fireEvent.change(prompts, {
      target: { value: "First prompt\n\n   \nSecond prompt" },
    });
    fireEvent.click(screen.getByText("Save"));
    await vi.waitFor(() => expect(edit).toHaveBeenCalled());

    // Blank and whitespace-only lines are how somebody deletes one, so they
    // must not reach the sheet as gaps.
    expect(saved().reflectionPrompts).toEqual(["First prompt", "Second prompt"]);
  });

  it("drops a scripture without disturbing the rest", async () => {
    open();
    // The first RowList on the page is the scriptures.
    fireEvent.click(screen.getAllByLabelText("Remove row 1")[0]);
    fireEvent.click(screen.getByText("Save"));
    await vi.waitFor(() => expect(edit).toHaveBeenCalled());

    const out = saved();
    expect(out.keyScriptures).toEqual([
      { reference: "James 2:17", note: "Living faith produces action." },
    ]);
    expect(out.mainTruths).toHaveLength(1);
    expect(out.weekPlan).toHaveLength(1);
  });

  it("lets the contrast table be filled in on a sermon that has one", async () => {
    open();
    fireEvent.change(screen.getByPlaceholderText("Left column"), {
      target: { value: "Counterfeit" },
    });
    fireEvent.change(screen.getByPlaceholderText("Right column"), {
      target: { value: "The Spirit of God" },
    });
    fireEvent.click(screen.getByText("Save"));
    await vi.waitFor(() => expect(edit).toHaveBeenCalled());

    expect(saved().contrast).toMatchObject({
      leftLabel: "Counterfeit",
      rightLabel: "The Spirit of God",
      rows: [],
    });
  });
});
