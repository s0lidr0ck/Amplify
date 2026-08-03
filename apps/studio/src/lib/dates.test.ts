import { describe, expect, it } from "vitest";

import { formatSermonDate, formatSermonDateShort, todayLocal } from "./dates";

describe("formatSermonDate", () => {
  it("keeps the day the sermon was actually preached", () => {
    // The bug this guards: `new Date("2026-08-09")` is UTC midnight, which
    // renders as the 8th for everyone west of Greenwich — that is every
    // church using this.
    expect(formatSermonDate("2026-08-09")).toContain("9");
    expect(formatSermonDate("2026-08-09")).not.toContain(" 8,");
  });

  it("names the month rather than numbering it", () => {
    expect(formatSermonDate("2026-08-02")).toMatch(/August/);
  });

  it("hands back anything that isn't a date", () => {
    // A project with no date shows an empty cell, not "Invalid Date".
    expect(formatSermonDate("")).toBe("");
    expect(formatSermonDate("soon")).toBe("soon");
  });

  it("drops the weekday in the short form", () => {
    expect(formatSermonDateShort("2026-08-02")).not.toMatch(/Sun/);
    expect(formatSermonDateShort("2026-08-02")).toMatch(/Aug/);
  });
});

describe("todayLocal", () => {
  it("gives the date input the shape it wants", () => {
    expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
