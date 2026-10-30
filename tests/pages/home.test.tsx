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
    const actions = await within(screen.getByRole("main")).findAllByRole("link", { name: "继续学习" });
    expect(actions).toHaveLength(1);
    for (const action of actions) expect(action).toHaveAttribute("href", "/today");
    expect(document.querySelectorAll('a[href="/today"]')).toHaveLength(1);
    expect(screen.queryByRole("link", { name: /创建学习路线/ })).not.toBeInTheDocument();
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
      (await screen.findAllByRole("link", { name: "创建学习路线" }))[0],
    ).toHaveAttribute("href", "/setup");
    const actions = screen.getAllByRole("link", { name: "创建学习路线" });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toHaveClass("primary-action");
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
    const explanation = screen.getByText("从岗位目标出发，找到值得学的技能、做得完的任务，以及能展示的成果。");
    expect(explanation).toHaveAttribute("lang", "zh-CN");
    expect(document.getElementById("learning-method")).toContainElement(explanation);

    expect(
      screen.getByRole("list", { name: "Arc learning method" }),
    ).toHaveAttribute("lang", "en");
    expect(screen.getByText("看清岗位真正需要什么")).toHaveAttribute(
      "lang",
      "zh-CN",
    );

    expect(screen.getByText("01 · Method")).toHaveAttribute("lang", "en");
    expect(within(screen.getByRole("navigation", { name: "网站导航" })).getByRole("link", { name: "学习方法" })).toHaveAttribute("href", "/method");
    expect(document.querySelectorAll('a[href="/method"]')).toHaveLength(1);
    expect(screen.getByRole("link", { name: "向下浏览" })).toHaveAttribute("href", "#learning-method");
    expect(document.getElementById("learning-method")).toContainElement(screen.getByText("01 · Method"));
    expect(within(screen.getByRole("navigation", { name: "网站导航" })).getByRole("link", { name: "产品样例" })).toHaveAttribute("href", "/showcase");
    expect(document.querySelectorAll('a[href="/showcase"]')).toHaveLength(1);
    expect(screen.getByText(/样例每天 45 分钟/)).toBeInTheDocument();
    expect(screen.getByText(/样例展示 18 周/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Start with direction/i }).closest("section"),
    ).toHaveAttribute("lang", "en");
  });
});
