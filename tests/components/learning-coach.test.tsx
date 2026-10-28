import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LearningCoach } from "../../app/components/agents/learning-coach";
import { agentFixture } from "../helpers/agent-fixture";

const mocks = vi.hoisted(() => ({ agents: vi.fn(), planning: vi.fn(), start: vi.fn(), apply: vi.fn(), poll: vi.fn() }));
vi.mock("../../app/components/agents/agent-context", () => ({ useLearningAgents: mocks.agents }));
vi.mock("../../app/lib/use-planning-workspace", () => ({ usePlanningWorkspace: mocks.planning }));
vi.mock("../../app/lib/agent-client", () => ({ agentClient: { start: mocks.start, apply: mocks.apply, poll: mocks.poll } }));
vi.mock("../../app/components/account/account-menu", () => ({ AccountMenu: () => <button>账号</button> }));
vi.mock("../../app/components/brand/site-header", () => ({ SiteHeader: () => <header>Arc.</header> }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
function setup(enabled = true) {
  const f = agentFixture();
  mocks.agents.mockReturnValue({ workspace: { enabled, authenticated: true, goalId: f.workspace.goalId,
    baseVersionId: f.workspace.activePlanVersionId, revision: 0, roleName: "前端工程师", currentTask: "组件基础", history: [],
    reason: enabled ? null : "学习助手尚未启用", plannerModel: "gpt-6-astra" },
    accountId: "alice", authenticated: true, authPending: false, loading: false, refresh: vi.fn(), handoff: "", setHandoff: vi.fn(), setView: vi.fn() });
  mocks.planning.mockReturnValue({ workspace: f.workspace, sourceContext: f.sourceContext, source: "cloud",
    recovery: "none", retry: vi.fn(), accept: vi.fn(), discard: vi.fn() });
  return f;
}
describe("learning coach", () => {
  it.each([true, false])("clears the planning draft across accounts even without a goal (loading=%s)", loading => {
    setup();
    const state = { ...mocks.agents(), workspace: loading ? null : { ...mocks.agents().workspace, goalId: null } };
    mocks.agents.mockReturnValue(state);
    const { rerender } = render(<LearningCoach />);
    fireEvent.change(screen.getByRole("textbox", { name: "本次规划的重点" }), { target: { value: "Alice private draft" } });
    mocks.agents.mockReturnValue({ ...state, accountId: "bob" });
    rerender(<LearningCoach />);
    expect(screen.getByRole("textbox", { name: "本次规划的重点" })).not.toHaveValue("Alice private draft");
  });
  it.each([false, true])("gates the planner before mounting private workspace hooks (pending=%s)", pending => {
    setup(); mocks.agents.mockReturnValue({ ...mocks.agents(), authenticated: false, authPending: pending, workspace: null });
    render(<LearningCoach />);
    expect(screen.queryByRole("textbox", { name: "本次规划的重点" })).not.toBeInTheDocument();
    expect(mocks.planning).not.toHaveBeenCalled(); expect(mocks.start).not.toHaveBeenCalled();
    if (pending) expect(screen.getByRole("status")).toHaveTextContent("正在确认登录状态");
    else expect(screen.getByRole("link", { name: "登录账号" })).toHaveAttribute("href", "/sign-in");
  });
  it("shows immediate generation progress and aborts on leaving the page", async () => {
    const f = setup(); let signal: AbortSignal;
    mocks.start.mockImplementation((_input, current, started) => {
      signal = current; started({ id: "run-1", kind: "planner", status: "running", createdAt: Date.now(),
        baseVersionId: f.workspace.activePlanVersionId, revision: 0, model: "openai/gpt-6-astra", effort: "max" });
      return new Promise(() => {});
    });
    const view = render(<LearningCoach />);
    expect(screen.getByText(/生成时请保持此页面打开/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "开始深度规划" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "正在深度规划…" })).toBeDisabled());
    expect(screen.getByText("正在梳理你的学习路线")).toBeInTheDocument();
    view.unmount(); expect(signal!.aborted).toBe(true);
  });
  it("explains disabled state without starting a paid request", () => {
    setup(false); render(<LearningCoach />);
    expect(screen.getByText("学习伙伴暂未开放")).toBeInTheDocument();
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
