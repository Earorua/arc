import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SetupPage from "../../app/setup/page";
import { flagshipRole } from "../../app/data/flagship-role";
import { completeDemoUnit, createDemoState, loadDemoState, mergeSetup, saveDemoState } from "../../app/lib/demo-store";

const { push, planningGenerate } = vi.hoisted(() => ({ push: vi.fn(), planningGenerate: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("../../app/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: null, isPending: false }) },
}));

vi.mock("../../app/lib/use-planning-workspace", () => ({
  usePlanningWorkspace: () => ({ generate: planningGenerate }),
}));

vi.mock("../../app/components/setup/adaptive-setup-flow", () => ({
  AdaptiveSetupFlow: ({ generate, navigate }: {
    generate: (request: unknown) => Promise<boolean>;
    navigate: (path: string) => void;
  }) => <button onClick={() => void generate({
    roleId: "ai-native-full-stack-engineer",
    availability: { weeklyMinutes: 840 },
    target: { targetWeeks: 12 },
  }).then((saved) => { if (saved) navigate("/path?created=1"); })} type="button">Finish adaptive setup</button>,
}));

beforeEach(() => {
  window.history.replaceState(null, "", "/setup");
  window.localStorage.clear();
  push.mockClear();
  planningGenerate.mockReset();
  planningGenerate.mockResolvedValue(true);
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});

describe("SetupPage", () => {
  it.each(["legacy", "adaptive"])("preserves the original operation after %s setup succeeds", async (flow) => {
    const destination = "/proof?compose=1&unit=old-unit&returnTo=%2Ftoday#draft";
    window.history.replaceState(null, "", `/setup?returnTo=${encodeURIComponent(destination)}`);
    const user = userEvent.setup();
    render(<SetupPage />);
    await screen.findByRole("heading", { name: "你想学习哪个岗位或方向？" });
    if (flow === "legacy") await user.type(screen.getByRole("textbox", { name: "自定义岗位" }), "数据产品经理");
    await user.click(screen.getByRole("button", { name: "继续" }));
    if (flow === "legacy") {
      await user.click(screen.getByRole("button", { name: "继续" }));
      await user.click(screen.getByRole("button", { name: "继续" }));
      await user.click(screen.getByRole("button", { name: "生成学习路径" }));
    } else await user.click(screen.getByRole("button", { name: "Finish adaptive setup" }));
    expect(push).toHaveBeenCalledWith(`/path?created=1&returnTo=${encodeURIComponent(destination)}`);
  });

  it.each(["https://outside.example", "/proof?returnTo=%2Fsign-in"])("does not carry an unsafe return destination %s into the completed path", async (destination) => {
    window.history.replaceState(null, "", `/setup?returnTo=${encodeURIComponent(destination)}`);
    const user = userEvent.setup();
    render(<SetupPage />);
    await user.click(await screen.findByRole("button", { name: "继续" }));
    await user.click(screen.getByRole("button", { name: "Finish adaptive setup" }));
    expect(push).toHaveBeenCalledWith("/path?created=1");
  });

  it("updates setup answers without erasing completion history", async () => {
    const user = userEvent.setup();
    const existing = completeDemoUnit(createDemoState(), flagshipRole.today);
    saveDemoState(existing);
    render(<SetupPage />);
    expect(screen.queryByText("研究已在后台运行。你可以离开此页面，稍后回来查看进度。")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI 原生全栈工程师" })).toBeEnabled();

    await user.type(screen.getByRole("textbox", { name: "自定义岗位" }), "数据产品经理");
    await user.click(screen.getByRole("button", { name: "继续" }));
    await user.click(screen.getByRole("button", { name: "熟练" }));
    await user.click(screen.getByRole("button", { name: "继续" }));
    const minutes = screen.getByRole("spinbutton", { name: "每周分钟数" });
    await user.clear(minutes);
    await user.type(minutes, "90");
    await user.click(screen.getByRole("button", { name: "继续" }));
    const weeks = screen.getByRole("spinbutton", { name: "目标周数" });
    await user.clear(weeks);
    await user.type(weeks, "10");
    await user.click(screen.getByRole("button", { name: "生成学习路径" }));

    const saved = loadDemoState();
    expect(saved.setup).toEqual({
      roleId: "数据产品经理",
      level: "advanced",
      weeklyMinutes: 90,
      targetWeeks: 10,
    });
    expect(saved.completedUnitIds).toEqual(existing.completedUnitIds);
    expect(saved.proofs).toEqual(existing.proofs);
    expect(push).toHaveBeenCalledWith("/path?created=1");
  });

  it("shows a storage error and stays on Setup when saving fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    render(<SetupPage />);

    await user.type(screen.getByRole("textbox", { name: "自定义岗位" }), "数据产品经理");
    await user.click(screen.getByRole("button", { name: "继续" }));
    await user.click(screen.getByRole("button", { name: "继续" }));
    await user.click(screen.getByRole("button", { name: "继续" }));
    await user.click(screen.getByRole("button", { name: "生成学习路径" }));

    expect(screen.getByRole("alert")).toHaveTextContent("无法保存到此设备");
    expect(push).not.toHaveBeenCalled();
  });

  it("persists the common Flagship role before exposing a generated adaptive workspace", async () => {
    const user = userEvent.setup();
    saveDemoState(mergeSetup(createDemoState(), {
      roleId: "数据产品经理",
      level: "advanced",
      weeklyMinutes: 90,
      targetWeeks: 10,
    }));
    render(<SetupPage />);
    await screen.findByRole("heading", { name: "你想学习哪个岗位或方向？" });

    await user.click(screen.getByRole("button", { name: "继续" }));
    await user.click(screen.getByRole("button", { name: "Finish adaptive setup" }));

    expect(planningGenerate).toHaveBeenCalledTimes(1);
    expect(loadDemoState().setup).toEqual({
      roleId: "ai-native-full-stack-engineer",
      level: "advanced",
      weeklyMinutes: 840,
      targetWeeks: 12,
    });
    expect(push).toHaveBeenCalledWith("/path?created=1");
  });
});
