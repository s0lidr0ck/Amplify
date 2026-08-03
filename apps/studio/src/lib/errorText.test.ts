import { describe, expect, it } from "vitest";

import { errorText } from "./errorText";

describe("errorText", () => {
  it("keeps only the sentence out of a Convex mutation rejection", () => {
    // Verbatim shape of what the settings page actually put on screen.
    const e = new Error(
      "[CONVEX M(amplifyCredentials:connect)] [Request ID: 439af6e54ee730e4] Server Error\n" +
        "Uncaught Error: That doesn't look like the JSON the platform gives you — paste the whole thing, including the outer braces.\n" +
        "    at handler (../convex/amplifyCredentials.ts:79:8)\n" +
        "\n" +
        "Called by client",
    );

    expect(errorText(e, "Couldn't save that")).toBe(
      "That doesn't look like the JSON the platform gives you — paste the whole thing, including the outer braces.",
    );
  });

  it("passes a plain message through untouched", () => {
    expect(errorText(new Error("Pick a date first"), "nope")).toBe(
      "Pick a date first",
    );
  });

  it("falls back when the throw is not an Error", () => {
    expect(errorText("something", "Couldn't save that")).toBe(
      "Couldn't save that",
    );
  });

  it("falls back rather than showing an empty line", () => {
    expect(errorText(new Error("Uncaught Error:"), "Couldn't save that")).toBe(
      "Couldn't save that",
    );
  });
});
