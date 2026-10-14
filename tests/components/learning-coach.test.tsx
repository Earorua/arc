import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LearningCoach } from "../../app/components/agents/learning-coach";
import { agentFixture } from "../helpers/agent-fixture";

const mocks = vi.hoisted(() => ({ agents: vi.fn(), planning: vi.fn(), start: vi.fn(), apply: vi.fn(), poll: vi.fn() }));
vi.mock("../../app/components/agents/agent-context", () => ({ useLearningAgents: mocks.agents }));
vi.mock("../../app/lib/use-planning-workspace", () => ({ usePlanningWorkspace: mocks.planning }));
vi.mock("../../app/lib/agent-client", () => ({ agentClient: { start: mocks.start, apply: mocks.apply, poll: mocks.poll } }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
function setup(enabled = true) {
  const f = agentFixture();
  mocks.agents.mockReturnValue({ workspace: { enabled, authenticated: true, goalId: f.workspace.goalId,
    baseVersionId: f.workspace.activePlanVersionId, revision: 0, roleName: "前端工程师", currentTask: "组件基础", history: [],
    reason: enabled ? null : "学习助手尚未启用", plannerModel: "gpt-6-astra" },
    loading: false, refresh: vi.fn(), handoff: "", setHandoff: vi.fn(), setView: vi.fn() });
  mocks.planning.mockReturnValue({ workspace: f.workspace, sourceContext: f.sourceContext, source: "cloud",
    recovery: "none", retry: vi.fn(), accept: vi.fn(), discard: vi.fn() });
  return f;
}
describe("learning coach", () => {
  it("explains disabled state without starting a paid request", () => {
    setup(false); render(<LearningCoach />);
    expect(screen.getByText("学习助手尚未启用")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始深度规划" })).toBeDisabled();
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it("shows a generated strategy for review without applying it automatically", async () => {
    const f = setup();
    mocks.start.mockResolvedValue({ id: "run-1", kind: "planner", status: "complete", createdAt: Date.now(),
      baseVersionId: f.workspace.activePlanVersionId, revision: 0, model: "gpt-6-astra", effort: "max",
      advice: { summary: "先建立基础", rationale: "根据当前掌握程度安排。",
        milestones: [{ title: "完成基础", successCriteria: "独立解释组件", unitIds: [f.path.units[0].id] }],
        unitOrder: f.path.units.map(unit => unit.id) }, message: "规划", answer: "先建立基础", error: null });
    render(<LearningCoach />);
    fireEvent.change(screen.getByRole("textbox", { name: "本次规划的重点" }), { target: { value: "先补基础" } });
    fireEvent.click(screen.getByRole("button", { name: "开始深度规划" }));
    await waitFor(() => expect(screen.getByText("先建立基础")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "查看计划差异" })).toBeEnabled();
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(mocks.start.mock.calls[0][0]).toMatchObject({ message: "先补基础", revision: 0, goalId: f.workspace.goalId });
  });
  it("provides recovery when the saved candidate cannot be loaded", async () => {
    setup(); const state = mocks.planning();
    mocks.planning.mockReturnValue({ ...state, source: "offline-cloud", recovery: "unavailable" });
    render(<LearningCoach />);
    fireEvent.click(screen.getByRole("button", { name: "重新读取计划" }));
    await waitFor(() => expect(state.retry).toHaveBeenCalledTimes(1));
  });
});
