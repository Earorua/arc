import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SetupFlow } from "../../app/components/setup/setup-flow";
import { AdaptiveSetupFlow } from "../../app/components/setup/adaptive-setup-flow";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { buildPlanVersion, type PlanBuildInput } from "../../app/lib/planning/scheduler";

beforeEach(() => { localStorage.clear(); window.history.replaceState(null, "", "/setup?mode=create"); });
afterEach(cleanup);
const adaptive = { blueprint: flagshipBlueprint, registry: flagshipUnitRegistry, generate: vi.fn().mockResolvedValue(true), navigate: vi.fn(), createMutationId: () => "mutation-completion", now: () => new Date("2026-10-28T00:00:00Z"), timeZone: "UTC" };
const popTo = (step: string) => act(() => { window.history.replaceState(null, "", `/setup?mode=create&step=${step}`); window.dispatchEvent(new PopStateEvent("popstate")); });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

describe("complete setup experience", () => {
  it("rechecks unavailable research without losing the existing-plan role input", async () => {
    const retry = vi.fn();
    render(<SetupFlow basicCreationAllowed={false} signedIn researchEligible={false} onRetryResearchAvailability={retry} renderResearch={() => <p>Research</p>} onComplete={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("自定义岗位"), { target: { value: "AI 工程师" } });
    expect(screen.getByRole("status")).toHaveTextContent("岗位研究暂不可用");
    expect(screen.queryByText(/此岗位将使用按时间比例分配的基础路径/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "继续" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "重新检查岗位研究" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("自定义岗位")).toHaveValue("AI 工程师");
  });

  it("keeps research as the actionable goal substate when existing-plan research is enabled", async () => {
    const useResult = vi.fn();
    render(<SetupFlow basicCreationAllowed={false} signedIn researchEligible renderResearch={({ onUseResearch }) => <button onClick={() => onUseResearch("research-ready", { id: "research-package-ready", blueprint: flagshipBlueprint, registry: flagshipUnitRegistry })}>使用研究结果</button>} renderAdaptive={(controls) => { useResult(controls.source); return <p>基础评估</p>; }} onComplete={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("自定义岗位"), { target: { value: "AI 工程师" } });
    expect(screen.queryByText(/直接继续将使用/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "使用研究结果" }));
    expect(useResult).toHaveBeenCalledWith({ source: "research", researchRunId: "research-ready" });
  });

  it("uses four named steps and puts scope choices alongside creation confirmation", async () => {
    const user = userEvent.setup();
    render(<AdaptiveSetupFlow {...adaptive} />);
    expect(screen.getByRole("list", { name: "设置进度" }).children).toHaveLength(4);
    expect(screen.getByText("02 / 04 · 当前基础")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "继续" }));
    await user.click(screen.getByRole("button", { name: "继续" }));
    expect(screen.getByLabelText("目标周数")).toBeVisible();
    expect(screen.getByRole("button", { name: "创建路线" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "继续" })).not.toBeInTheDocument();
  });

  it("restores browser Back and Forward within completed legacy steps, without private answers in the URL", async () => {
    const user = userEvent.setup();
    render(<SetupFlow draftOwner="user:alice" syncUrl onComplete={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("自定义岗位"), { target: { value: "私人研究目标" } });
    await user.click(screen.getByRole("button", { name: "继续" }));
    await user.click(screen.getByRole("button", { name: "继续" }));
    expect(new URLSearchParams(window.location.search).get("step")).toBe("time");
    popTo("foundation");
    expect(await screen.findByRole("heading", { name: "你现在处于哪个阶段？" })).toBeVisible();
    popTo("time");
    expect(await screen.findByLabelText("每周分钟数")).toBeVisible();
    expect(window.location.search).not.toContain("私人");
  });

  it("does not let a URL skip inputs or borrow another account's progress", async () => {
    window.history.replaceState(null, "", "/setup?step=confirm");
    const page = render(<SetupFlow draftOwner="user:alice" syncUrl onComplete={vi.fn()} />);
    expect(await screen.findByLabelText("自定义岗位")).toBeVisible();
    await act(async () => {});
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("step")).toBe("goal"));
    await userEvent.click(screen.getByRole("button", { name: "继续" }));
    page.rerender(<SetupFlow draftOwner="user:bob" syncUrl onComplete={vi.fn()} />);
    expect(await screen.findByLabelText("自定义岗位")).toBeVisible();
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("step")).toBe("goal"));
  });

  it("guards confirm after browser navigation invalidates the required time input", async () => {
    const user = userEvent.setup();
    render(<SetupFlow draftOwner="user:alice" syncUrl onComplete={vi.fn()} />);
    for (let index = 0; index < 3; index++) await user.click(screen.getByRole("button", { name: "继续" }));
    popTo("time");
    fireEvent.change(await screen.findByLabelText("每周分钟数"), { target: { value: "0" } });
    popTo("confirm");
    expect(await screen.findByLabelText("每周分钟数")).toBeVisible();
    expect(screen.queryByRole("button", { name: "创建路线" })).not.toBeInTheDocument();
  });

  it("restores the adaptive confirmation after refresh and browser back to the goal", async () => {
    const user = userEvent.setup();
    const flow = <SetupFlow draftOwner="user:alice" syncUrl onComplete={vi.fn()} renderAdaptive={(controls) => <AdaptiveSetupFlow {...adaptive} {...controls} draftOwner="user:alice" syncUrl />} />;
    const page = render(flow);
    for (let index = 0; index < 3; index++) await user.click(screen.getByRole("button", { name: "继续" }));
    page.unmount(); render(flow);
    expect(await screen.findByRole("button", { name: "创建路线" })).toBeVisible();
    popTo("goal");
    expect(await screen.findByLabelText("自定义岗位")).toBeVisible();
    popTo("confirm");
    expect(await screen.findByRole("button", { name: "创建路线" })).toBeVisible();
  });

  it("keeps research recovery active on refresh before trusting a saved research source", async () => {
    const user = userEvent.setup(); const onActive = vi.fn();
    const data = { id: "research-package-ready", blueprint: flagshipBlueprint, registry: flagshipUnitRegistry };
    const flow = <SetupFlow draftOwner="user:alice" syncUrl signedIn researchEligible researchRecoveryAvailable onResearchActiveChange={onActive} onComplete={vi.fn()}
      renderResearch={({ onUseResearch }) => <button onClick={() => onUseResearch("research-ready", data)}>使用研究结果</button>}
      renderAdaptive={(controls) => <AdaptiveSetupFlow {...adaptive} {...controls} draftOwner="user:alice" syncUrl />} />;
    const page = render(flow);
    await user.click(screen.getByRole("button", { name: "使用研究结果" }));
    await user.click(screen.getByRole("button", { name: "继续" }));
    await user.click(screen.getByRole("button", { name: "继续" }));
    page.unmount(); onActive.mockClear(); render(flow);
    await act(async () => {});
    expect(onActive).toHaveBeenLastCalledWith(true);
    expect(screen.queryByRole("button", { name: "创建路线" })).not.toBeInTheDocument();
  });

  it("keeps an ambiguous first save on its locked confirmation when browser Back requests the goal", async () => {
    window.history.replaceState(null, "", "/setup?mode=create&step=goal");
    render(<AdaptiveSetupFlow {...adaptive} syncUrl lockedGeneration />);
    expect(await screen.findByRole("button", { name: "重试保存原计划" })).toBeVisible();
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("step")).toBe("confirm"));
    expect(screen.getByLabelText("目标周数")).toBeDisabled();
  });

  it.each(["schedule", "save"])("keeps confirmation frozen when browser Back requests earlier steps during pending %s", async (pendingStage) => {
    const user = userEvent.setup(); const navigate = vi.fn();
    const scheduleWork = deferred<ReturnType<typeof buildPlanVersion>>(); const saveWork = deferred<boolean>();
    let scheduleInput!: PlanBuildInput;
    const scheduleForSubmit = (input: PlanBuildInput) => { scheduleInput = input; return pendingStage === "schedule" ? scheduleWork.promise : buildPlanVersion(input); };
    const generate = vi.fn(() => pendingStage === "save" ? saveWork.promise : Promise.resolve(true));
    render(<SetupFlow draftOwner="user:alice" syncUrl onComplete={vi.fn()} renderAdaptive={(controls) => <AdaptiveSetupFlow {...adaptive} {...controls} generate={generate} navigate={navigate} scheduleForSubmit={scheduleForSubmit} draftOwner="user:alice" syncUrl />} />);
    for (let index = 0; index < 3; index++) await user.click(screen.getByRole("button", { name: "继续" }));
    await user.click(screen.getByRole("button", { name: "创建路线" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(pendingStage === "schedule" ? "正在安排未来七天" : "正在保存计划"));
    for (const earlierStep of ["time", "foundation", "goal"]) {
      popTo(earlierStep);
      await waitFor(() => expect(new URLSearchParams(window.location.search).get("step")).toBe("confirm"));
      expect(screen.getByRole("heading", { name: "确认你的学习路线。" })).toBeVisible();
      expect(screen.getByLabelText("目标周数")).toBeDisabled();
      expect(screen.queryByLabelText("周一分钟数")).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "你想学习哪个岗位或方向？" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "返回" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "创建路线" })).toBeDisabled();
      expect(navigate).not.toHaveBeenCalled();
    }
    if (pendingStage === "schedule") {
      await act(async () => scheduleWork.resolve(buildPlanVersion(scheduleInput)));
      await waitFor(() => expect(navigate).toHaveBeenCalledExactlyOnceWith("/path?created=1"));
    } else {
      await act(async () => saveWork.resolve(false));
      expect(await screen.findByRole("alert")).toHaveTextContent("未能保存计划");
      await user.click(screen.getByRole("button", { name: "返回" }));
      expect(screen.getByLabelText("周一分钟数")).toBeEnabled();
      expect(navigate).not.toHaveBeenCalled();
    }
    expect(generate).toHaveBeenCalledOnce();
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ availability: expect.objectContaining({ weeklyMinutes: 420 }), target: expect.objectContaining({ targetWeeks: 18 }) }));
  });
});
