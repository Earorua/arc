import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ useSession: vi.fn(), replace: vi.fn(), load: vi.fn() }));
vi.mock("../../app/lib/auth-client", () => ({ authClient: { useSession: mocks.useSession } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }), usePathname: () => "/" }));
vi.mock("../../app/components/account/account-menu", () => ({ AccountMenu: () => null }));
vi.mock("../../app/lib/cloud-client", async original => ({ ...await original<typeof import("../../app/lib/cloud-client")>(), arcCloudClient: { loadWorkspace: mocks.load } }));
import Home from "../../app/page";

afterEach(cleanup);
beforeEach(() => { localStorage.clear(); mocks.load.mockResolvedValue({ activeGoalId: "goal-current" }); mocks.useSession.mockReturnValue({ data: null, isPending: false }); });

describe("Arc home", () => {
  it("keeps the homepage reachable for a signed-in learner with a continue action", async () => {
    mocks.useSession.mockReturnValue({ data: { user: { id: "learner" } }, isPending: false });
    render(<Home />);
    expect(mocks.replace).not.toHaveBeenCalled();
    const actions = await within(screen.getByRole("main")).findAllByRole("link", { name: "Continue learning" });
    expect(actions).toHaveLength(1);
    for (const action of actions) expect(action).toHaveAttribute("href", "/today");
    expect(document.querySelectorAll('a[href="/today"]')).toHaveLength(1);
    expect(screen.queryByRole("link", { name: /Create your path/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: /Learn only what moves you forward/i })).toBeInTheDocument();
  });

  it("does not redirect an unresolved session", () => {
    mocks.useSession.mockReturnValue({ data: null, isPending: true });
    render(<Home />);
    expect(mocks.replace).not.toHaveBeenCalled();
  });
  it("presents one promise, one primary action, and the product loop", async () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /Learn only what moves you forward/i,
      }),
    ).toBeInTheDocument();
    expect(
      (await screen.findAllByRole("link", { name: "Create your path" }))[0],
    ).toHaveAttribute("href", "/setup");
    const actions = screen.getAllByRole("link", { name: "Create your path" });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toHaveClass("primary-action");
    expect(screen.getByText("Understand")).toBeInTheDocument();
    expect(screen.getByText("Build")).toBeInTheDocument();
    expect(screen.getByText("Prove")).toBeInTheDocument();
  });

  it("marks the public content as English", () => {
    render(<Home />);

    const heroHeading = screen.getByRole("heading", {
      level: 1,
      name: /Learn only what moves you forward/i,
    });
    expect(heroHeading.closest("section")).toHaveAttribute("lang", "en");
    const explanation = screen.getByText("Start with your career goal. Find the skills that matter, tasks you can finish, and work you can show.");
    expect(explanation).toHaveAttribute("lang", "en");
    expect(document.getElementById("learning-method")).toContainElement(explanation);

    expect(
      screen.getByRole("list", { name: "Arc learning method" }),
    ).toHaveAttribute("lang", "en");
    expect(screen.getByText("See what the role really needs")).toHaveAttribute(
      "lang",
      "en",
    );

    expect(screen.getByText("01 · Method")).toHaveAttribute("lang", "en");
    expect(within(screen.getByRole("navigation", { name: "Site navigation" })).getByRole("link", { name: "Method" })).toHaveAttribute("href", "/method");
    expect(document.querySelectorAll('a[href="/method"]')).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Scroll to explore" })).toHaveAttribute("href", "#learning-method");
    expect(document.getElementById("learning-method")).toContainElement(screen.getByText("01 · Method"));
    expect(within(screen.getByRole("navigation", { name: "Site navigation" })).getByRole("link", { name: "Showcase" })).toHaveAttribute("href", "/showcase");
    expect(document.querySelectorAll('a[href="/showcase"]')).toHaveLength(1);
    expect(screen.getByText(/example uses 45 minutes a day/)).toBeInTheDocument();
    expect(screen.getByText(/example spans 18 weeks/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Start with direction/i }).closest("section"),
    ).toHaveAttribute("lang", "en");
  });
});
