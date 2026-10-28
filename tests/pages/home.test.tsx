import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ useSession: vi.fn(), replace: vi.fn() }));
vi.mock("../../app/lib/auth-client", () => ({ authClient: { useSession: mocks.useSession } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }), usePathname: () => "/" }));
vi.mock("../../app/components/account/account-menu", () => ({ AccountMenu: () => null }));
import Home from "../../app/page";

afterEach(cleanup);
beforeEach(() => { mocks.useSession.mockReturnValue({ data: null, isPending: false }); });

describe("Arc home", () => {
  it("keeps the homepage reachable for a signed-in learner with a continue action", () => {
    mocks.useSession.mockReturnValue({ data: { user: { id: "learner" } }, isPending: false });
    render(<Home />);
    expect(mocks.replace).not.toHaveBeenCalled();
    const actions = screen.getAllByRole("link", { name: "继续学习" });
    expect(actions).toHaveLength(3);
    for (const action of actions) expect(action).toHaveAttribute("href", "/today");
    expect(screen.queryByRole("link", { name: /建立我的学习路线/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: /Learn only what moves you forward/i })).toBeInTheDocument();
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
      screen.getAllByRole("link", { name: /建立我的学习路线/i })[0],
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
      screen.getByText("从岗位目标出发，找到值得学的技能、做得完的任务，以及能展示的成果。"),
    ).toHaveAttribute("lang", "zh-CN");

    expect(
      screen.getByRole("list", { name: "Arc learning method" }),
    ).toHaveAttribute("lang", "en");
    expect(screen.getByText("看清岗位真正需要什么")).toHaveAttribute(
      "lang",
      "zh-CN",
    );

    expect(screen.getByText("01 · Method")).toHaveAttribute("lang", "en");
    expect(screen.getByRole("link", { name: "了解学习方法 →" })).toHaveAttribute("href", "/method");
    expect(screen.getByRole("link", { name: /先看完整样例/ })).toHaveAttribute("href", "/showcase");
    expect(screen.getByText(/样例每天 45 分钟/)).toBeInTheDocument();
    expect(screen.getByText(/样例展示 18 周/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Start with direction/i }).closest("section"),
    ).toHaveAttribute("lang", "en");
  });
});
