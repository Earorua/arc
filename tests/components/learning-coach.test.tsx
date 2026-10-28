import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LearningCoach } from "../../app/components/agents/learning-coach";
import type { PublicAgentRun } from "../../app/contracts/agents";
import { agentFixture } from "../helpers/agent-fixture";

const mocks = vi.hoisted(() => ({ agents: vi.fn(), planning: vi.fn(), start: vi.fn(), apply: vi.fn(), poll: vi.fn() }));
vi.mock("../../app/components/agents/agent-context", () => ({ useLearningAgents: mocks.agents }));
vi.mock("../../app/lib/use-planning-workspace", () => ({ usePlanningWorkspace: mocks.planning }));
vi.mock("../../app/lib/agent-client", () => ({ agentClient: { start: mocks.start, apply: mocks.apply, poll: mocks.poll } }));
vi.mock("../../app/components/account/account-menu", () => ({ AccountMenu: () => <button>账号</button> }));
vi.mock("../../app/components/brand/site-header", () => ({ SiteHeader: () => <header>Arc.</header> }));
beforeEach(() => window.history.replaceState(null, "", "/coach"));
afterEach(() => { cleanup(); sessionStorage.clear(); vi.resetAllMocks(); vi.unstubAllGlobals(); });
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
function savedRun(id: string, summary: string, createdAt: number, baseVersionId: string): PublicAgentRun {
  return { id, kind: "planner", status: "complete", createdAt, baseVersionId, revision: 0,
    model: "gpt-6-astra", effort: "max", message: "规划", answer: summary, error: null,
    advice: { summary, rationale: "结合当前目标安排。", milestones: [], unitOrder: [] } };
}
describe("learning coach", () => {
  it("restores a selected saved run after reload and browser navigation", () => {
    const f = setup(); const state = mocks.agents();
    state.workspace.history = [savedRun("older", "早先的方案", 1, f.workspace.activePlanVersionId), savedRun("latest", "最新的方案", 2, f.workspace.activePlanVersionId)];
    window.history.replaceState(null, "", "/coach?run=older&returnTo=%2Ftoday%3Funit%3Dlesson");
    const view = render(<LearningCoach />);
    expect(screen.getByRole("heading", { name: "早先的方案" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "最新的方案" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回今日任务" })).toHaveAttribute("href", "/today?unit=lesson");
    view.unmount(); render(<LearningCoach />);
    expect(screen.getByRole("heading", { name: "早先的方案" })).toBeInTheDocument();
    window.history.replaceState(null, "", "/coach?run=latest"); fireEvent.popState(window);
    expect(screen.getByRole("heading", { name: "最新的方案" })).toBeInTheDocument();
    window.history.replaceState(null, "", "/coach?run=older"); fireEvent.popState(window);
    expect(screen.getByRole("heading", { name: "早先的方案" })).toBeInTheDocument();
    expect(mocks.poll).not.toHaveBeenCalled();
  });
  it.each(["missing", "other-account-run", "tutor-run", ""])("does not replace unavailable selection %s with another suggestion", (id) => {
    const f = setup(); const state = mocks.agents();
    state.workspace.history = [savedRun("latest", "最新的方案", 2, f.workspace.activePlanVersionId), { ...savedRun("tutor-run", "答疑内容", 3, f.workspace.activePlanVersionId), kind: "tutor" }];
    window.history.replaceState(null, "", `/coach?run=${encodeURIComponent(id)}&returnTo=%2Ftoday`);
    render(<LearningCoach />);
    expect(screen.getByRole("status")).toHaveTextContent("找不到这份规划建议");
    expect(screen.queryByRole("heading", { name: "最新的方案" })).not.toBeInTheDocument();
    expect(screen.queryByText("答疑内容")).not.toBeInTheDocument();
    expect(mocks.poll).not.toHaveBeenCalled(); expect(mocks.start).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "查看最新建议" }));
    expect(screen.getByRole("heading", { name: "最新的方案" })).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).has("run")).toBe(false);
    expect(new URLSearchParams(window.location.search).get("returnTo")).toBe("/today");
  });
  it("stops showing a saved selection when the account changes", () => {
    const f = setup(); const alice = mocks.agents();
    alice.workspace.history = [savedRun("alice-run", "Alice 的方案", 1, f.workspace.activePlanVersionId)];
    window.history.replaceState(null, "", "/coach?run=alice-run");
    const view = render(<LearningCoach />);
    expect(screen.getByRole("heading", { name: "Alice 的方案" })).toBeInTheDocument();
    mocks.agents.mockReturnValue({ ...alice, accountId: "bob", workspace: { ...alice.workspace, history: [savedRun("bob-run", "Bob 的方案", 2, f.workspace.activePlanVersionId)] } });
    view.rerender(<LearningCoach />);
    expect(screen.getByRole("status")).toHaveTextContent("找不到这份规划建议");
    expect(screen.queryByRole("heading", { name: "Alice 的方案" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Bob 的方案" })).not.toBeInTheDocument();
    expect(mocks.poll).not.toHaveBeenCalled();
  });
  it("preserves the selected run and nested source through guest sign in", () => {
    setup(); mocks.agents.mockReturnValue({ ...mocks.agents(), authenticated: false, workspace: null });
    const destination = "/coach?run=older&returnTo=%2Ftoday%3Funit%3Dlesson#suggestion";
    window.history.replaceState(null, "", destination);
    render(<LearningCoach />);
    expect(screen.getByRole("link", { name: "登录账号" })).toHaveAttribute("href", `/sign-in?next=${encodeURIComponent(destination)}`);
    expect(mocks.planning).not.toHaveBeenCalled();
  });
  it("preserves the full coach location through required goal setup", () => {
    setup(); const state = mocks.agents();
    mocks.agents.mockReturnValue({ ...state, workspace: { ...state.workspace, goalId: null, baseVersionId: null } });
    const destination = "/coach?run=older&returnTo=%2Ftoday%3Funit%3Dlesson#suggestion";
    window.history.replaceState(null, "", destination);
    render(<LearningCoach />);
    expect(screen.getByRole("link", { name: "设置学习目标 ↗" })).toHaveAttribute("href", `/setup?mode=create&returnTo=${encodeURIComponent(destination)}`);
    const updated = "/coach?returnTo=%2Fproof%3Funit%3Dproject#request";
    window.history.replaceState(null, "", updated); fireEvent.popState(window);
    expect(screen.getByRole("link", { name: "设置学习目标 ↗" })).toHaveAttribute("href", `/setup?mode=create&returnTo=${encodeURIComponent(updated)}`);
  });
  it("keeps existing goals on the time editing route", () => {
    setup(); window.history.replaceState(null, "", "/coach?returnTo=%2Ftoday");
    render(<LearningCoach />);
    expect(screen.getByRole("link", { name: "调整可用时间 ↗" })).toHaveAttribute("href", "/setup?mode=edit&section=time");
  });
  it("selects the new run when generating from an older saved suggestion", async () => {
    const f = setup(); const state = mocks.agents();
    state.workspace.history = [savedRun("older", "早先的方案", 1, f.workspace.activePlanVersionId)];
    const next = savedRun("new-run", "重新生成的方案", 2, f.workspace.activePlanVersionId);
    mocks.start.mockImplementation(async (_input, _signal, started) => { started({ ...next, status: "running", advice: null }); return next; });
    window.history.replaceState(null, "", "/coach?run=older&returnTo=%2Ftoday");
    render(<LearningCoach />);
    fireEvent.click(screen.getByText("编辑本次规划重点"));
    const prompt = await screen.findByRole("textbox", { name: "本次规划的重点" });
    fireEvent.change(prompt, { target: { value: "请按新的时间安排" } });
    fireEvent.click(screen.getByRole("button", { name: "开始深度规划" }));
    await screen.findByRole("heading", { name: "重新生成的方案" });
    expect(screen.queryByRole("heading", { name: "早先的方案" })).not.toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("run")).toBe("new-run");
    expect(new URLSearchParams(window.location.search).get("returnTo")).toBe("/today");
  });
  it.each([false, true])("aborts generation on native Back and ignores late callbacks (started=%s)", async (started) => {
    const f = setup(); const state = mocks.agents();
    state.workspace.history = [savedRun("older", "早先的方案", 1, f.workspace.activePlanVersionId), savedRun("latest", "最新的方案", 2, f.workspace.activePlanVersionId)];
    const generated = savedRun("generated", "迟到的方案", 3, f.workspace.activePlanVersionId);
    let signal!: AbortSignal, onStarted!: (run: PublicAgentRun) => void, finish!: (run: PublicAgentRun) => void;
    mocks.start.mockImplementation((_input, nextSignal, callback) => {
      signal = nextSignal; onStarted = callback;
      if (started) callback({ ...generated, status: "running", advice: null });
      return new Promise<PublicAgentRun>(resolve => { finish = resolve; });
    });
    window.history.replaceState(null, "", "/coach?run=latest");
    window.history.pushState(null, "", "/coach?run=older");
    render(<LearningCoach />);
    fireEvent.click(screen.getByText("编辑本次规划重点"));
    fireEvent.change(await screen.findByRole("textbox", { name: "本次规划的重点" }), { target: { value: "重新安排" } });
    fireEvent.click(screen.getByRole("button", { name: "开始深度规划" }));
    expect(signal.aborted).toBe(false);
    window.history.back();
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("run")).toBe("latest"));
    await waitFor(() => expect(signal.aborted).toBe(true));
    await act(async () => { onStarted({ ...generated, status: "running", advice: null }); finish(generated); });
    expect(new URLSearchParams(window.location.search).get("run")).toBe("latest");
    expect(screen.getByRole("heading", { name: "最新的方案" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "迟到的方案" })).not.toBeInTheDocument();
    expect(state.refresh).not.toHaveBeenCalled();
    if (!screen.queryByRole("textbox", { name: "本次规划的重点" })) fireEvent.click(screen.getByText("编辑本次规划重点"));
    await screen.findByRole("textbox", { name: "本次规划的重点" });
    expect(screen.getByRole("button", { name: "开始深度规划" })).toBeEnabled();
  });
  it.each([false, true])("offers context-preserving reauthentication after session expiry (workspace=%s)", async (hasWorkspace) => {
    const f = setup(); const state = mocks.agents();
    state.workspace.history = [savedRun("saved", "已保存的方案", 1, f.workspace.activePlanVersionId)];
    if (!hasWorkspace) mocks.agents.mockReturnValue({ ...state, workspace: null });
    mocks.planning.mockReturnValue({ ...mocks.planning(), recovery: "session-expired", source: "offline-cloud" });
    const destination = "/coach?run=saved&returnTo=%2Ftoday%3Funit%3Dlesson#suggestion";
    window.history.replaceState(null, "", destination);
    render(<LearningCoach />);
    expect(screen.getByRole("link", { name: "重新登录" })).toHaveAttribute("href", `/sign-in?next=${encodeURIComponent(destination)}&reauth=1`);
    expect(screen.queryByRole("button", { name: "重新读取计划" })).not.toBeInTheDocument();
    if (hasWorkspace) {
      expect(screen.getByRole("button", { name: "查看计划差异" })).toBeDisabled();
      fireEvent.click(screen.getByText("编辑本次规划重点"));
    }
    fireEvent.change(await screen.findByRole("textbox", { name: "本次规划的重点" }), { target: { value: "新的重点" } });
    expect(screen.getByRole("button", { name: "开始深度规划" })).toBeDisabled();
    expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.apply).not.toHaveBeenCalled();
  });
  it("waits for an owned goal before accepting a planning draft", () => {
    setup(); const state=mocks.agents();
    mocks.agents.mockReturnValue({ ...state, loading: true, workspace: null });
    const view=render(<LearningCoach />);
    expect(screen.getByRole("textbox", { name: "本次规划的重点" })).toBeDisabled();
    mocks.agents.mockReturnValue(state); view.rerender(<LearningCoach />);
    expect(screen.getByRole("textbox", { name: "本次规划的重点" })).toBeEnabled();
  });
  it("keeps typing usable if only draft writes exceed storage capacity", () => {
    setup(); mocks.agents.mockReturnValue({ ...mocks.agents(), accountId: "quota-owner" });
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
    render(<LearningCoach />);
    fireEvent.change(screen.getByRole("textbox", { name: "本次规划的重点" }), { target: { value: "存储空间不足时仍可输入" } });
    expect(screen.getByRole("textbox", { name: "本次规划的重点" })).toHaveValue("存储空间不足时仍可输入");
    write.mockRestore();
  });
  it("consumes a companion handoff once so later draft edits survive returning", async () => {
    setup(); const state = mocks.agents();
    state.handoff = "来自学习伙伴的原始问题";
    state.setHandoff = vi.fn((value: string) => { state.handoff = value; });
    const view = render(<LearningCoach />);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "本次规划的重点" })).toHaveValue("来自学习伙伴的原始问题"));
    fireEvent.change(screen.getByRole("textbox", { name: "本次规划的重点" }), { target: { value: "我的补充和新的约束" } });
    view.unmount(); render(<LearningCoach />);
    expect(screen.getByRole("textbox", { name: "本次规划的重点" })).toHaveValue("我的补充和新的约束");
  });
  it("starts empty and restores the same owner's draft after leaving", () => {
    setup();
    const view = render(<LearningCoach />);
    expect(screen.getByRole("textbox", { name: "本次规划的重点" })).toHaveValue("");
    fireEvent.change(screen.getByRole("textbox", { name: "本次规划的重点" }), { target: { value: "每周改为三小时" } });
    view.unmount(); render(<LearningCoach />);
    expect(screen.getByRole("textbox", { name: "本次规划的重点" })).toHaveValue("每周改为三小时");
    expect(mocks.start).not.toHaveBeenCalled();
  });
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
    else expect(screen.getByRole("link", { name: "登录账号" })).toHaveAttribute("href", "/sign-in?next=%2Fcoach");
  });
  it("shows immediate generation progress and aborts on leaving the page", async () => {
    const navigation = new EventTarget(); vi.stubGlobal("navigation", navigation);
    const f = setup(); let signal: AbortSignal;
    mocks.start.mockImplementation((_input, current, started) => {
      signal = current; started({ id: "run-1", kind: "planner", status: "running", createdAt: Date.now(),
        baseVersionId: f.workspace.activePlanVersionId, revision: 0, model: "openai/gpt-6-astra", effort: "max" });
      return new Promise(() => {});
    });
    const view = render(<LearningCoach />);
    expect(screen.getByText(/生成时请保持此页面打开/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "本次规划的重点" }), { target: { value: "调整重点" } });
    fireEvent.click(screen.getByRole("button", { name: "开始深度规划" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "正在深度规划…" })).toBeDisabled());
    expect(screen.getByText("正在梳理你的学习路线")).toBeInTheDocument();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const leave = new MouseEvent("click", { bubbles: true, cancelable: true });
    screen.getByRole("link", { name: "返回学习路线" }).dispatchEvent(leave);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("离开会中断"));
    expect(leave.defaultPrevented).toBe(true);
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    const back = new Event("navigate", { cancelable: true });
    Object.assign(back, { navigationType: "traverse", destination: { sameDocument: true, url: "http://localhost/path" } });
    navigation.dispatchEvent(back);
    expect(back.defaultPrevented).toBe(true);
    confirm.mockRestore();
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
    expect(screen.queryByRole("textbox", { name: "本次规划的重点" })).not.toBeInTheDocument();
    expect(screen.getByText("生成信息").closest("details")).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("编辑本次规划重点"));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "本次规划的重点" })).toHaveValue("先补基础"));
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
