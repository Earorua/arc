import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ useSession: vi.fn(), replace: vi.fn() }));
vi.mock("../../app/lib/auth-client", () => ({ authClient: { useSession: mocks.useSession } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("../../app/components/account/account-menu", () => ({ AccountMenu: () => null }));
import Home from "../../app/page";

afterEach(cleanup);
beforeEach(() => { mocks.useSession.mockReturnValue({ data: null, isPending: false }); });

describe("Arc home", () => {
  it("takes a signed-in learner to their existing workspace instead of new setup", () => {
    mocks.useSession.mockReturnValue({ data: { user: { id: "learner" } }, isPending: false });
    render(<Home />);
    expect(mocks.replace).toHaveBeenCalledWith("/today");
    expect(screen.getByRole("link", { name: /Continue learning/i })).toHaveAttribute("href", "/today");
    expect(screen.queryByRole("link", { name: /Build my precise path/i })).not.toBeInTheDocument();
  });

  it("does not redirect an unresolved session", () => {
    mocks.useSession.mockReturnValue({ data: null, isPending: true });
    render(<Home />);
    expect(mocks.replace).not.toHaveBeenCalled();
  });
  it("presents one promise, one primary action, and the product loop", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /Learn only what moves you forward/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Build my precise path/i }),
    ).toHaveAttribute("href", "/setup");
    expect(screen.getByText("Understand")).toBeInTheDocument();
    expect(screen.getByText("Build")).toBeInTheDocument();
    expect(screen.getByText("Prove")).toBeInTheDocument();
  });

  it("marks each bilingual part with its spoken language", () => {
    render(<Home />);

    const heroHeading = screen.getByRole("heading", {
      level: 1,
      name: /Learn only what moves you forward/i,
    });
    expect(heroHeading.closest("section")).toHaveAttribute("lang", "en");
    expect(
      screen.getByText("把任意岗位拆成清晰、可信、每天都能完成的成长路径。"),
    ).toHaveAttribute("lang", "zh-CN");

    expect(
      screen.getByRole("list", { name: "Arc learning method" }),
    ).toHaveAttribute("lang", "en");
    expect(screen.getByText("看清岗位真正需要什么")).toHaveAttribute(
      "lang",
      "zh-CN",
    );

    expect(screen.getByText("01 · Method")).toHaveAttribute("lang", "en");
    expect(screen.getByRole("link", { name: /Explore the method/i })).toHaveAttribute(
      "lang",
      "en",
    );
    expect(screen.getByText("Today")).toHaveAttribute("lang", "en");
    expect(screen.getByText("Path")).toHaveAttribute("lang", "en");
    expect(screen.getByText("Proof")).toHaveAttribute("lang", "en");
    expect(
      screen.getByRole("heading", { name: /Start with direction/i }).closest("section"),
    ).toHaveAttribute("lang", "en");
  });
});
