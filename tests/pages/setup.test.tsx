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
  }).then((saved) => { if (saved) navigate("/path"); })} type="button">Finish adaptive setup</button>,
}));

beforeEach(() => {
  window.localStorage.clear();
  push.mockClear();
  planningGenerate.mockReset();
  planningGenerate.mockResolvedValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SetupPage", () => {
  it("updates setup answers without erasing completion history", async () => {
    const user = userEvent.setup();
    const existing = completeDemoUnit(createDemoState(), flagshipRole.today);
    saveDemoState(existing);
    render(<SetupPage />);

    await user.type(screen.getByRole("textbox", { name: "Custom role" }), "数据产品经理");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Advanced" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    const minutes = screen.getByRole("spinbutton", { name: "Weekly minutes" });
    await user.clear(minutes);
    await user.type(minutes, "90");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    const weeks = screen.getByRole("spinbutton", { name: "Target weeks" });
    await user.clear(weeks);
    await user.type(weeks, "10");
    await user.click(screen.getByRole("button", { name: "Build my path" }));

    const saved = loadDemoState();
    expect(saved.setup).toEqual({
      roleId: "数据产品经理",
      level: "advanced",
      weeklyMinutes: 90,
      targetWeeks: 10,
    });
    expect(saved.completedUnitIds).toEqual(existing.completedUnitIds);
    expect(saved.proofs).toEqual(existing.proofs);
    expect(push).toHaveBeenCalledWith("/path");
  });

  it("shows a storage error and stays on Setup when saving fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    render(<SetupPage />);

    await user.type(screen.getByRole("textbox", { name: "Custom role" }), "数据产品经理");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Build my path" }));

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
    await screen.findByRole("heading", { name: "你想成为怎样的构建者？" });

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Finish adaptive setup" }));

    expect(planningGenerate).toHaveBeenCalledTimes(1);
    expect(loadDemoState().setup).toEqual({
      roleId: "ai-native-full-stack-engineer",
      level: "advanced",
      weeklyMinutes: 840,
      targetWeeks: 12,
    });
    expect(push).toHaveBeenCalledWith("/path");
  });
});
