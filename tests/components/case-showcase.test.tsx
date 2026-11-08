import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ShowcasePage from "../../app/showcase/page";

vi.mock("next/navigation", () => ({ usePathname: () => "/showcase" }));
vi.mock("../../app/lib/auth-client", () => ({ authClient: { useSession: () => ({ data: null, isPending: false }) } }));

beforeEach(() => { localStorage.clear(); window.history.replaceState(null, "", "/showcase"); });
afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });

describe("public learning sample", () => {
  it("opens directly to a shareable view and makes the sample identity clear", async () => {
    window.history.replaceState(null, "", "/showcase?view=today");
    render(<ShowcasePage />);
    expect(screen.getByRole("heading", { level: 1, name: "A learning path, in motion." })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Today" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Turn a form submission into a verifiable server action");
    expect(screen.getByText("A public example. Your own plan comes next.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Showcase" })).toHaveAttribute("aria-current", "page");
    const intro = screen.getByRole("region", { name: "A learning path, in motion." });
    expect(within(intro).queryByRole("link")).not.toBeInTheDocument();
    expect(await screen.findAllByRole("link", { name: "Create your path" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Create your path" })).toHaveAttribute("href", "/setup");
  });

  it("writes the selected view to the URL and restores it on browser Back and remount", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ShowcasePage />);
    await user.click(screen.getByRole("tab", { name: "Today" }));
    expect(new URLSearchParams(window.location.search).get("view")).toBe("today");
    await user.click(screen.getByRole("tab", { name: "Proof" }));
    expect(new URLSearchParams(window.location.search).get("view")).toBe("proof");
    await act(async () => window.history.back());
    await waitFor(() => expect(screen.getByRole("tab", { name: "Today" })).toHaveAttribute("aria-selected", "true"));
    unmount(); render(<ShowcasePage />);
    expect(screen.getByRole("tab", { name: "Today" })).toHaveAttribute("aria-selected", "true");
  });

  it("keeps keyboard focus, panel relationships, and URL selection aligned", async () => {
    render(<ShowcasePage />);
    const path = screen.getByRole("tab", { name: "Path" });
    path.focus();
    await userEvent.keyboard("{ArrowRight}");
    const today = screen.getByRole("tab", { name: "Today" });
    expect(today).toHaveFocus();
    expect(today).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", today.id);
    expect(new URLSearchParams(window.location.search).get("view")).toBe("today");
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Proof" })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(path).toHaveFocus();
  });

  it("falls back to the route sample for an unknown view without touching device data", () => {
    window.history.replaceState(null, "", "/showcase?view=private-account");
    const save = vi.spyOn(Storage.prototype, "setItem");
    render(<ShowcasePage />);
    expect(screen.getByRole("tab", { name: "Path" })).toHaveAttribute("aria-selected", "true");
    expect(save).not.toHaveBeenCalled();
    save.mockRestore();
  });
});
