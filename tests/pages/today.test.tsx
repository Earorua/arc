import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TodayPage from "../../app/today/page";
import { createDemoState, mergeSetup, saveDemoState } from "../../app/lib/demo-store";
import { flagshipRole } from "../../app/data/flagship-role";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
const { usePlanningWorkspace } = vi.hoisted(() => ({ usePlanningWorkspace: vi.fn(() => ({ workspace: null, source: "local", migration: "none", recovery: "none", generate: vi.fn(), record: vi.fn(), accept: vi.fn(), discard: vi.fn(), importLocal: vi.fn(), dismissMigration: vi.fn(), retry: vi.fn() })) }));
vi.mock("../../app/lib/use-planning-workspace", () => ({ usePlanningWorkspace }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("../../app/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: null, isPending: false }) },
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

    expect(screen.getByRole("status")).toHaveTextContent("Restoring your plan");
    expect(screen.queryByText("45")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("数据产品经理 · 10 weeks")).toBeInTheDocument();
      expect(screen.getByText("45")).toBeInTheDocument();
      expect(screen.getByText(/本单元预计45分钟，超出当前每周30分钟预算15分钟/)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /返回 Setup 调整预算/ })).toHaveAttribute("href", "/setup");
      expect(screen.getByText(/当前内容使用 AI 原生全栈旗舰样本/)).toBeInTheDocument();
      expect(screen.getByText(/Product Intelligence 后续研究并替换/)).toBeInTheDocument();
    });
    expect(screen.getByText("minutes")).toBeInTheDocument();
    expect(usePlanningWorkspace).not.toHaveBeenCalled();
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
    const button = screen.getByRole("button", { name: "Complete & move to Proof" });
    await user.click(button);

    expect(screen.getByRole("alert")).toHaveTextContent("完成记录未能保存");
    expect(push).not.toHaveBeenCalled();
    expect(button).toBeEnabled();

    setItem.mockRestore();
    await user.click(button);

    expect(push).toHaveBeenCalledWith("/proof");
    expect(button).toBeDisabled();
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

    expect(await screen.findByRole("alert")).toHaveTextContent("Plan version unavailable");
    expect(screen.getByRole("alert")).toHaveTextContent("kept this saved plan unchanged");
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

    expect(await screen.findByText(source === "restoring" ? "Restoring adaptive plan." : "Adaptive plan temporarily unavailable.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Complete & move to Proof" })).not.toBeInTheDocument();
    expect(screen.queryByText("45")).not.toBeInTheDocument();
    if (source === "offline-cloud") {
      await userEvent.click(screen.getByRole("button", { name: /retry/i }));
      expect(retry).toHaveBeenCalledTimes(1);
    }
  });
});
