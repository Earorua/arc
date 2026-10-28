import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TodayPage from "../../app/today/page";
import { createDemoState, mergeSetup, saveDemoState } from "../../app/lib/demo-store";
import { flagshipRole } from "../../app/data/flagship-role";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
const { usePlanningWorkspace } = vi.hoisted(() => ({ usePlanningWorkspace: vi.fn(() => ({ workspace: null, source: "local", migration: "none", recovery: "none", generate: vi.fn(), record: vi.fn(), accept: vi.fn(), discard: vi.fn(), importLocal: vi.fn(), dismissMigration: vi.fn(), retry: vi.fn() })) }));
vi.mock("../../app/lib/use-planning-workspace", () => ({ usePlanningWorkspace }));
vi.mock("../../app/lib/use-arc-state", async (original) => {
  const actual = await original<typeof import("../../app/lib/use-arc-state")>();
  return { ...actual, useArcState: () => actual.useArcState({ useSession: () => ({ data: null, isPending: false }) }) };
});
vi.mock("../../app/components/account/account-menu", () => ({ AccountMenu: () => <span>账号</span> }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }), usePathname: () => window.location.pathname,
}));

vi.mock("../../app/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "local-owner", name: "Learner", email: "learner@example.test" } }, isPending: false }) },
}));

beforeEach(() => {
  window.localStorage.clear();
  push.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TodayPage", () => {
  it("keeps the honest unit estimate and explains a weekly budget shortfall", async () => {
    usePlanningWorkspace.mockClear();
    saveDemoState(mergeSetup(createDemoState(), {
      roleId: "数据产品经理",
      level: "beginner",
      weeklyMinutes: 30,
      targetWeeks: 10,
    }));

    render(<TodayPage />);

    expect(screen.getByRole("status")).toHaveTextContent("正在恢复你的学习计划");
    expect(screen.queryByText("45")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("数据产品经理 · 10 周")).toBeInTheDocument();
      expect(screen.getByText("45")).toBeInTheDocument();
      expect(screen.getByText(/本单元预计45分钟，超出当前每周30分钟预算15分钟/)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /调整学习时间/ })).toHaveAttribute("href", "/setup?mode=edit&section=time");
      expect(screen.getByText(/当前内容使用 AI 原生全栈旗舰样本/)).toBeInTheDocument();
      expect(screen.getByText(/Product Intelligence 后续研究并替换/)).toBeInTheDocument();
    });
    expect(screen.getByText("分钟")).toBeInTheDocument();
    expect(usePlanningWorkspace).toHaveBeenCalled();
  });

  it("does not show sample or budget disclosures for the fitting flagship role", async () => {
    render(<TodayPage />);

    await screen.findByText("45");
    expect(screen.queryByText(/当前内容使用 AI 原生全栈旗舰样本/)).not.toBeInTheDocument();
    expect(screen.queryByText(/超出当前每周/)).not.toBeInTheDocument();
  });

  it("stays on Today and restores retry when completion cannot be saved", async () => {
    const user = userEvent.setup();
    render(<TodayPage />);
    await screen.findByText("45");
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    for (const step of flagshipRole.today.steps) {
      await user.click(screen.getByRole("checkbox", { name: step.label }));
    }
    const button = screen.getByRole("button", { name: "完成任务" });
    await user.click(button);

    expect(screen.getByRole("alert")).toHaveTextContent("完成记录未能保存");
    expect(push).not.toHaveBeenCalled();
    expect(button).toBeEnabled();

    setItem.mockRestore();
    await user.click(button);

    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /添加作品证据/ }).getAttribute("href")).toContain("compose=1");
    expect(button).toBeDisabled();
    const stored = JSON.parse(window.localStorage.getItem("arc-demo-state-v1") ?? "{}") as {
      proofs?: Array<{ verified?: boolean }>;
    };
    expect(stored.proofs?.[0]?.verified).toBe(false);
  });

  it("does not fall back to a legacy lesson when the adaptive catalogue version is unavailable", async () => {
    usePlanningWorkspace.mockReturnValue({
      workspace: null,
      source: "offline-cloud",
      migration: "none",
      recovery: "version-unavailable",
      generate: vi.fn(),
      record: vi.fn(),
      accept: vi.fn(),
      discard: vi.fn(),
      importLocal: vi.fn(),
      dismissMigration: vi.fn(),
      retry: vi.fn(),
    });

    render(<TodayPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("暂时无法读取这个计划");
    expect(screen.getByRole("alert")).toHaveTextContent("原有计划与学习记录已保留");
    expect(screen.queryByText("45")).not.toBeInTheDocument();
  });

  it.each([
    ["restoring", "none"],
    ["offline-cloud", "unavailable"],
  ] as const)("does not expose legacy completion while adaptive cloud state is %s", async (source, recovery) => {
    const retry = vi.fn();
    usePlanningWorkspace.mockReturnValue({
      workspace: null,
      source,
      migration: "none",
      recovery,
      generate: vi.fn(),
      record: vi.fn(),
      accept: vi.fn(),
      discard: vi.fn(),
      importLocal: vi.fn(),
      dismissMigration: vi.fn(),
      retry,
    });

    render(<TodayPage />);

    expect(await screen.findByText(source === "restoring" ? "正在读取学习计划" : "学习计划暂不可用")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "完成任务" })).not.toBeInTheDocument();
    expect(screen.queryByText("45")).not.toBeInTheDocument();
    if (source === "offline-cloud") {
      await userEvent.click(screen.getByRole("button", { name: /重新读取计划/ }));
      expect(retry).toHaveBeenCalledTimes(1);
    }
  });
});
