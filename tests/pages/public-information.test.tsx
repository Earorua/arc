import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import IntelligencePage from "../../app/intelligence/page";
import MethodPage from "../../app/method/page";

const { redirect } = vi.hoisted(() => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("next/navigation", () => ({ redirect, usePathname: () => "/method" }));
vi.mock("../../app/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: null, isPending: false }) },
}));

afterEach(cleanup);

describe("public trust pages", () => {
  it("explains one concrete example from learning decisions through a task to inspectable evidence", () => {
    render(<MethodPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Turn a goal into daily progress." })).toBeInTheDocument();
    expect(screen.getByText("A continuous learning journey").closest("main")).toHaveAttribute("lang", "en");
    expect(screen.getByRole("heading", { name: "Know what to learn" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Make time for today" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Show what you learned" })).toBeInTheDocument();
    const main = within(screen.getByRole("main"));
    expect(main.getByText("AI-Native Full-Stack Engineer")).toBeInTheDocument();
    expect(main.getByText("Turn a form submission into a verifiable server action")).toBeInTheDocument();
    expect(main.getByText(/45 minutes/)).toBeInTheDocument();
    expect(main.getByRole("link", { name: "Explore the full example" })).toHaveAttribute("href", "/showcase?view=path");
    expect(main.queryByRole("link", { name: /Create.*path/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Method" })).toHaveAttribute("aria-current", "page");
  });

  it("redirects the retired public intelligence page to the account skill workspace", () => {
    expect(() => IntelligencePage()).toThrow("redirect:/stack");
    expect(redirect).toHaveBeenCalledWith("/stack");
  });
});
