import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { StudyGuide } from "./StudyGuide";
import { StudyGuideFold } from "./StudyGuideFold";
import { withoutTrailingQuestion } from "./studyGuideParts";

/**
 * The handout is the one output that leaves the screen, so the things worth
 * pinning down are the ones a browser will not complain about: a section
 * that quietly disappears, a table forced onto a sermon that has no
 * contrast, and the class name the print stylesheet hangs off.
 */

const full = {
  title: "Overcoming Our Lack of Faith",
  primaryText: "Mark 9:23–24",
  purpose: "To help believers recognize that faith can be genuine even when it feels weak.",
  centralTruth: "Weak faith can still be real faith.",
  centralQuestion: "Is your faith small, or is it simply young?",
  keyScriptures: [
    { reference: "Romans 10:17", note: "Faith grows by hearing the Word of God." },
    { reference: "James 2:17", note: "Living faith produces action." },
  ],
  mainTruths: [
    { heading: "Faith is not the absence of fear", body: "Faith chooses to trust God even when fear is present." },
    { heading: "Faith grows through the Word", body: "What we repeatedly hear shapes what we believe." },
  ],
  contrast: { leftLabel: "", rightLabel: "", rows: [] },
  reflectionPrompts: [
    "Where is my faith being tested right now?",
    "What step of faith will I take?",
  ],
  weekPlan: [
    { day: "1", read: "Mark 9:14–29", focus: "Pray honestly about your unbelief." },
    { day: "2", read: "Romans 10:17", focus: "Spend extra time in Scripture." },
  ],
  keyTakeaways: ["My faith may be small, but my God is great."],
  memoryVerse: { reference: "Matthew 17:20", text: "If ye have faith as a grain of mustard seed…" },
  closing: "I will pray again, believe again, and stand again.",
};

describe("the printed study handout", () => {
  it("sets every section it was given", () => {
    render(<StudyGuide payload={full} />);

    expect(screen.getByText("Overcoming Our Lack of Faith")).toBeTruthy();
    expect(screen.getByText(/Mark 9:23–24/)).toBeTruthy();
    expect(screen.getByText("Lesson purpose")).toBeTruthy();
    expect(screen.getByText("The central truth")).toBeTruthy();
    expect(screen.getByText("Key scriptures")).toBeTruthy();
    expect(screen.getByText("Main truths")).toBeTruthy();
    expect(screen.getByText("Personal reflection")).toBeTruthy();
    expect(screen.getByText("This week")).toBeTruthy();
    expect(screen.getByText("Key takeaways")).toBeTruthy();
    expect(screen.getByText("Memory verse")).toBeTruthy();
    expect(screen.getByText(/I will pray again/)).toBeTruthy();
  });

  it("leaves out the contrast table when the sermon had no contrast", () => {
    // The one conditional section. A sermon that sets nothing against
    // anything comes back with empty rows, and the sheet has to close up
    // around the gap rather than print an empty two-column table.
    const { container } = render(<StudyGuide payload={full} />);
    expect(container.querySelectorAll("table")).toHaveLength(1); // the week plan only
  });

  it("sets the contrast table, under both its own labels, when there is one", () => {
    render(
      <StudyGuide
        payload={{
          ...full,
          contrast: {
            leftLabel: "Counterfeit influence",
            rightLabel: "The Spirit of God",
            rows: [
              { left: "Draws attention to a manifestation", right: "Glorifies Jesus" },
              { left: "Produces fear and confusion", right: "Produces liberty and a sound mind" },
            ],
          },
        }}
      />,
    );

    expect(screen.getByText("Glorifies Jesus")).toBeTruthy();
    expect(
      screen.getByText("Counterfeit influence"),
    ).toBeTruthy();
  });

  it("leaves ruled space under every reflection prompt", () => {
    // The write-in lines are the reason this is a handout rather than a
    // summary, and nothing else on the page would fail if they vanished.
    const { container } = render(<StudyGuide payload={full} />);
    const rules = container.querySelectorAll('[aria-hidden="true"] > span');
    expect(rules.length).toBe(full.reflectionPrompts.length * 2);
  });

  it("carries the class the print stylesheet hangs off", () => {
    // Renaming this silently prints the nav bar and the buttons with it.
    const { container } = render(<StudyGuide payload={full} />);
    expect(container.querySelector(".print-sheet")).toBeTruthy();
  });

  it("names the preacher and the date when it is given them", () => {
    render(<StudyGuide payload={full} byline="Pastor Chris · 24 Aug 2026" />);
    expect(screen.getByText(/Pastor Chris/)).toBeTruthy();
  });

  it("survives a draft that came back thin", () => {
    // Not hypothetical: an older draft, a half-failed generation, or a
    // church that edited the prompt into producing less. A blank section is
    // better than a blank page.
    render(<StudyGuide payload={{ title: "Something", mainTruths: [], weekPlan: [] }} />);
    expect(screen.getByText("Something")).toBeTruthy();
    expect(screen.queryByText("Key scriptures")).toBeNull();
    expect(screen.queryByText("This week")).toBeNull();
  });
});

describe("the central truth and its question", () => {
  const claim =
    "The ark was not comfortable, but it was the only thing between Noah's family and the flood. So which is it in your life right now — is God being unfair to you, or is He holding you?";

  it("drops the question the claim ends on, since the pull quote asks it", () => {
    expect(
      withoutTrailingQuestion(claim, "Is God being unfair to you, or is He holding you?"),
    ).toBe(
      "The ark was not comfortable, but it was the only thing between Noah's family and the flood.",
    );
  });

  it("leaves the claim alone when there is no separate question", () => {
    expect(withoutTrailingQuestion(claim, "")).toBe(claim);
  });

  it("leaves a claim that is only a question alone rather than blanking it", () => {
    const short = "Is God holding you?";
    expect(withoutTrailingQuestion(short, "Is God holding you?")).toBe(short);
  });

  it("leaves a claim that does not end on a question untouched", () => {
    const plain = "The hardest season of your life is often the season God is protecting you.";
    expect(withoutTrailingQuestion(plain, "Will you yield?")).toBe(plain);
  });
});

function renderFoldSides(payload: Record<string, unknown>) {
  const { container } = render(<StudyGuideFold payload={payload} />);
  return [...container.querySelectorAll(".fold-side")].map((side) =>
    [...side.querySelectorAll(".fold-panel")].map((p) => p.textContent ?? ""),
  );
}

describe("the landscape bi-fold booklet", () => {
  const sides = (payload: Record<string, unknown>) => {
    const { container } = render(<StudyGuideFold payload={payload} />);
    return [...container.querySelectorAll(".fold-side")].map((side) =>
      [...side.querySelectorAll(".fold-panel")].map((p) => p.textContent ?? ""),
    );
  };

  it("imposes the panels for folding rather than for reading", () => {
    // The whole point, and the thing that looks like a bug on screen: side
    // one is [back cover | front cover]. Fold it and the order comes right.
    const [side1, side2] = sides(full);

    expect(side1).toHaveLength(2);
    expect(side1[0]).toContain("This week"); // panel 4, the back
    expect(side1[1]).toContain("Overcoming Our Lack of Faith"); // panel 1, the front
    expect(side2[0]).toContain("Key scriptures"); // panel 2
    expect(side2[1]).toContain("Personal reflection"); // panel 3
  });

  it("keeps the cover to the title, the overview and the purpose", () => {
    // A cover carrying the seven-day plan is not a cover.
    const [side1] = sides(full);
    expect(side1[1]).toContain("Lesson purpose");
    expect(side1[1]).not.toContain("Main truths");
    expect(side1[1]).not.toContain("Key scriptures");
  });

  it("moves the central truth off the cover, onto the first inside page", () => {
    // It was on the cover until the logo, the overview and the QR arrived.
    // A panel clips rather than spilling, so something had to give, and the
    // overview is what somebody reads before opening the booklet at all.
    const [side1, side2] = sides(full);
    expect(side1[1]).not.toContain("The central truth");
    expect(side2[0]).toContain("The central truth");
  });

  it("puts every section on exactly one panel", () => {
    const all = sides(full).flat().join(" ");
    for (const heading of [
      "Lesson purpose",
      "The central truth",
      "Key scriptures",
      "Main truths",
      "Personal reflection",
      "This week",
      "Key takeaways",
      "Memory verse",
    ]) {
      expect(all.split(heading)).toHaveLength(2);
    }
  });

  it("asks for landscape paper", () => {
    // Without this the booklet prints portrait and folds into nothing.
    const { container } = render(<StudyGuideFold payload={full} />);
    expect(container.querySelector("style")?.textContent).toContain("11in 8.5in");
  });
});

describe("the church's mark and the QR code", () => {
  const brand = {
    churchName: "New Life Church",
    logoUrl: "https://cdn.example/nlc.png",
    qrUrl: "https://link.a1-8.com/new-life-church?c=K7M3QP2",
  };

  it("sets the church's logo at the top of the sheet", () => {
    render(<StudyGuide payload={full} brand={brand} />);
    const logo = screen.getByAltText("New Life Church");
    expect(logo.getAttribute("src")).toBe("https://cdn.example/nlc.png");
  });

  it("sets the logo on the booklet's cover, not on an inside panel", () => {
    const { container } = render(<StudyGuideFold payload={full} brand={brand} />);
    const cover = container.querySelector(".fold-panel--cover");
    expect(cover?.querySelector("img[alt='New Life Church']")).toBeTruthy();
    expect(container.querySelectorAll("img[alt='New Life Church']")).toHaveLength(1);
  });

  it("prints nothing where the brand is unset", () => {
    // The shared read-only view has no church to ask about, and every sheet
    // printed before any of this existed still has to set correctly.
    const { container } = render(<StudyGuide payload={full} />);
    expect(container.querySelector(".sheet-logo")).toBeNull();
    expect(container.querySelector(".sheet-qr")).toBeNull();
  });

  it("prints the logo but no code when the church has no Link page", () => {
    // A QR leading nowhere is worse than no QR, so the code goes and the
    // logo stays.
    const { container } = render(
      <StudyGuide payload={full} brand={{ ...brand, qrUrl: null }} />,
    );
    expect(container.querySelector(".sheet-logo")).toBeTruthy();
    expect(container.querySelector(".sheet-qr")).toBeNull();
  });

  it("draws a scannable code for the address it was given", async () => {
    const { container } = render(<StudyGuide payload={full} brand={brand} />);
    // Drawn in an effect, so it arrives a tick after the first paint.
    await waitFor(() =>
      expect(container.querySelector(".sheet-qr img")).toBeTruthy(),
    );
    const img = container.querySelector(".sheet-qr img") as HTMLImageElement;
    expect(img.getAttribute("src")?.startsWith("data:image/png;base64,")).toBe(
      true,
    );
    expect(img.getAttribute("alt")).toContain(
      "https://link.a1-8.com/new-life-church?c=K7M3QP2",
    );
  });
});

describe("the front-page overview", () => {
  it("sets the paragraph above the columns", () => {
    const { container } = render(
      <StudyGuide payload={{ ...full, overview: "David asks how long, four times." }} />,
    );
    expect(container.querySelector(".sheet-overview")?.textContent).toBe(
      "David asks how long, four times.",
    );
  });

  it("closes up on a guide written before it existed", () => {
    // Every handout generated up to now has no overview at all, and must
    // set exactly as it always did rather than leaving a hole.
    const { container } = render(<StudyGuide payload={full} />);
    expect(container.querySelector(".sheet-overview")).toBeNull();
  });

  it("opens the booklet's cover with it", () => {
    const [side1] = renderFoldSides({ ...full, overview: "What the message dealt with." });
    expect(side1[1]).toContain("What the message dealt with.");
  });
});

describe("sections that were dropped", () => {
  it("sets neither discussion questions nor a prayer, even on a draft that has them", () => {
    // Older drafts still carry both fields. They are not part of the
    // handout any more, and a guide written last month must not print two
    // sections this month's prompt no longer asks for.
    const stale = {
      ...full,
      discussionQuestions: ["Why does the door matter?"],
      prayer: "Lord, I believe; help my unbelief.",
    };
    for (const el of [
      render(<StudyGuide payload={stale} />).container,
      render(<StudyGuideFold payload={stale} />).container,
    ]) {
      expect(el.textContent).not.toContain("Discussion questions");
      expect(el.textContent).not.toContain("Why does the door matter?");
      expect(el.textContent).not.toContain("Prayer focus");
      expect(el.textContent).not.toContain("help my unbelief");
    }
  });
});
