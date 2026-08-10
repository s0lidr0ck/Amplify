import { describe, it, expect, vi } from "vitest";
// fireEvent, not user-event: this repo has @testing-library/react alone.
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const launch = vi.fn();
vi.mock("../auth/useA18Apps", () => ({
  useA18Apps: () => ({
    user: { name: "Alex S.", email: "alex@x.com", avatarUrl: null },
    apps: [{ key: "crew", label: "Crew", url: "https://crew.a1-8.com", color: "#22c55e" }],
    hubUrl: "https://home.a1-8.com",
    launch,
  }),
}));
vi.mock("@convex-dev/auth/react", () => ({ useAuthActions: () => ({ signOut: vi.fn() }) }));

import { AccountMenu } from "./AccountMenu";

const open = () => {
  render(<MemoryRouter><AccountMenu /></MemoryRouter>);
  fireEvent.click(screen.getByLabelText("Your account"));
};

describe("Amplify's account menu", () => {
  it("stays shut until you ask for it", () => {
    render(<MemoryRouter><AccountMenu /></MemoryRouter>);
    expect(screen.queryByText("Sign out")).toBeNull();
  });

  it("shows who you are, and the way out Amplify never had", () => {
    open();
    expect(screen.getByText("Alex S.")).toBeTruthy();
    expect(screen.getByText("alex@x.com")).toBeTruthy();
    expect(screen.getByText("Sign out")).toBeTruthy();
  });

  it("carries Settings and Help, which moved out of the header nav", () => {
    open();
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByText("Help")).toBeTruthy();
  });

  it("links the hub plainly — it is where codes are minted, so it needs none", () => {
    open();
    expect(screen.getByText("All of A1:8").closest("a")?.getAttribute("href"))
      .toBe("https://home.a1-8.com");
  });

  it("launches the other apps, and closes behind you", () => {
    open();
    fireEvent.click(screen.getByText("Crew"));
    expect(launch).toHaveBeenCalledWith("https://crew.a1-8.com");
    // Closing on the way out matters: the tab opens behind the menu, and a
    // menu still hanging open over the page you left reads as a stuck click.
    expect(screen.queryByText("Sign out")).toBeNull();
  });

  it("closes on Escape", () => {
    open();
    // The listener is on window; a keydown on body bubbles up to it.
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByText("Sign out")).toBeNull();
  });
});
