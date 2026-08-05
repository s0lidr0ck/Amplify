import { describe, expect, it } from "vitest";

import { blocksOf, inline } from "./markdown";

/**
 * The reader behind the help chapters.
 *
 * These pin the shapes the manual actually uses. The one that matters most
 * is the last: a line this does not recognise has to come through as prose,
 * because a manual that silently swallows a sentence is worse than one that
 * renders it plainly.
 */

describe("reading a chapter", () => {
  it("gathers wrapped lines into one paragraph", () => {
    // Markdown files are hard-wrapped for editing; the wrap is not a break.
    const blocks = blocksOf("A sentence that\nruns over two lines.");
    expect(blocks).toEqual([
      { kind: "p", text: "A sentence that runs over two lines." },
    ]);
  });

  it("separates paragraphs on a blank line", () => {
    expect(blocksOf("One.\n\nTwo.")).toHaveLength(2);
  });

  it("knows the two heading levels", () => {
    expect(blocksOf("## Big\n### Small")).toEqual([
      { kind: "h2", text: "Big" },
      { kind: "h3", text: "Small" },
    ]);
  });

  it("makes consecutive bullets one list", () => {
    // Every bullet its own list is the bug this exists to prevent: the
    // spacing between them then says nothing about what belongs together.
    expect(blocksOf("- one\n- two\n- three")).toEqual([
      { kind: "ul", items: ["one", "two", "three"] },
    ]);
  });

  it("keeps steps in their own numbered list", () => {
    expect(blocksOf("1. first\n2. second")).toEqual([
      { kind: "ol", items: ["first", "second"] },
    ]);
  });

  it("does not run a bullet list into a numbered one", () => {
    const blocks = blocksOf("- a\n1. b");
    expect(blocks.map((b) => b.kind)).toEqual(["ul", "ol"]);
  });

  it("starts a new list after a paragraph splits them", () => {
    const blocks = blocksOf("- a\n\nSomething.\n\n- b");
    expect(blocks.map((b) => b.kind)).toEqual(["ul", "p", "ul"]);
  });

  it("takes a quote as its own block", () => {
    expect(blocksOf("> Worth knowing.")).toEqual([
      { kind: "quote", text: "Worth knowing." },
    ]);
  });

  it("joins a callout that wraps over several lines", () => {
    // The chapters hard-wrap for editing, so this rendered as three stacked
    // boxes each holding a third of a sentence.
    expect(blocksOf("> One sentence\n> split across\n> three lines.")).toEqual([
      { kind: "quote", text: "One sentence split across three lines." },
    ]);
  });

  it("keeps two callouts separated by prose apart", () => {
    const blocks = blocksOf("> First.\n\nBetween.\n\n> Second.");
    expect(blocks.map((b) => b.kind)).toEqual(["quote", "p", "quote"]);
  });

  it("renders what it does not understand rather than dropping it", () => {
    // No table support, and a table in a chapter must still say something.
    const blocks = blocksOf("| a | b |");
    expect(blocks).toEqual([{ kind: "p", text: "| a | b |" }]);
  });

  it("survives an empty chapter", () => {
    expect(blocksOf("")).toEqual([]);
  });
});

describe("marking up a line", () => {
  /** What survives as plain text, so a missed token shows up as itself. */
  const plain = (nodes: ReturnType<typeof inline>) =>
    nodes.filter((n) => typeof n === "string").join("");

  it("leaves an unmarked line alone", () => {
    expect(inline("Just words.")).toEqual(["Just words."]);
  });

  it("takes bold before italic", () => {
    // Ordered alternation. Without it "**x**" matches as an italic whose
    // content is "*x*", and the asterisks render on the page.
    const nodes = inline("**bold** and *italic*");
    expect(plain(nodes)).toBe(" and ");
    expect(nodes).toHaveLength(3);
  });

  it("does not eat an asterisk that spans a sentence break", () => {
    // A stray asterisk should stay a stray asterisk rather than italicising
    // everything up to the next one three paragraphs later.
    expect(plain(inline("2 * 3 is six"))).toBe("2 * 3 is six");
  });

  it("marks code up", () => {
    const nodes = inline("press `-5` to nudge");
    expect(plain(nodes)).toBe("press  to nudge");
  });
});
