import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentCompanion, CompanionPanel } from "../../app/components/agents/agent-companion";
import type { AgentLearningContext, AgentWorkspace, PublicAgentRun } from "../../app/contracts/agents";
const mocks = vi.hoisted(() => ({ agents: vi.fn() }));
vi.mock("../../app/components/agents/agent-context", async importOriginal => ({
  ...await importOriginal<typeof import("../../app/components/agents/agent-context")>(), useLearningAgents: mocks.agents,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/today" }));
afterEach(cleanup);

const researchContext = (): AgentLearningContext => ({
  source: "research", date: "2026-10-28", timeZone: "Asia/Shanghai", completedUnits: 2, totalUnits: 6,
  task: { id: "metrics", title: "设计产品指标体系", scheduledDate: "2026-10-27" },
  resources: [
    { id: "primary", title: "产品指标入门", provider: "产品学院", url: "https://example.com/metrics" },
    { id: "alternative", title: "指标设计案例", provider: "案例库", url: "http://example.org/cases" },
  ],
});
const workspace = (): AgentWorkspace => ({
  enabled: true, authenticated: true, availability: "ready", reason: null,
  goalId: "product-goal", baseVersionId: "version-1", revision: 2, roleName: "产品经理",
  currentTask: "旧的课程名称", history: [], plannerModel: "planner", tutorModel: "tutor",
  learningContext: researchContext(),
});
function openContext() {
  fireEvent.click(screen.getByText("路线与资料"));
}

describe("learning companion", () => {
  it("shows the pet for a confirmed account", () => {
    mocks.agents.mockReturnValue({ authenticated: true, authPending: false, workspace: null, view: "pet" });
    render(<AgentCompanion />);
    expect(screen.getByRole("button", { name: "打开学习伙伴" })).toBeInTheDocument();
  });
  it.each([false, true])("hides the pet and chat without confirmed login (pending=%s)", authPending => {
    mocks.agents.mockReturnValue({ authenticated: false, authPending, workspace: null, view: "chat" });
    const { container } = render(<AgentCompanion />);
    expect(container).toBeEmptyDOMElement();
  });
  const props = () => ({
    view: "pet" as const, onView: vi.fn(), messages: [], draft: "", onDraft: vi.fn(), onSend: vi.fn(),
    onStop: vi.fn(), onHandoff: vi.fn(), busy: false, partial: "", error: null,
    task: "React 状态管理", enabled: true, reason: null, deep: false, onDeep: vi.fn(),
    reducedMotion: false, onReducedMotion: vi.fn(),
  });
  it("opens chat from the pet", () => {
    const p = props(); render(<CompanionPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "打开学习伙伴" }));
    expect(p.onView).toHaveBeenCalledWith("chat");
  });
  it("contains keyboard focus on narrow screens and returns it on close", async () => {
    const previous = window.matchMedia;
    window.matchMedia = vi.fn(query => ({ matches: true, media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }));
    function Harness() {
      const [view, onView] = useState<"pet" | "chat">("pet");
      return <CompanionPanel {...props()} view={view} onView={value => onView(value as "pet" | "chat")} />;
    }
    try {
      render(<Harness />);
      fireEvent.click(screen.getByRole("button", { name: "打开学习伙伴" }));
      expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
      const close = screen.getByRole("button", { name: "最小化学习伙伴" });
      close.focus(); fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
      expect(screen.getByRole("button", { name: "调整学习计划" })).toHaveFocus();
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
      await waitFor(() => expect(screen.getByRole("button", { name: "打开学习伙伴" })).toHaveFocus());
      expect(document.body.style.overflow).not.toBe("hidden");
    } finally { cleanup(); window.matchMedia = previous; }
  });
  it("minimizes, shows task context and keeps the message controlled", () => {
    const p = props(); render(<CompanionPanel {...p} view="chat" draft="闭包是什么？" />);
    expect(screen.getByText("React 状态管理")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "向学习伙伴提问" })).toHaveValue("闭包是什么？");
    fireEvent.click(screen.getByRole("button", { name: "最小化学习伙伴" }));
    expect(p.onView).toHaveBeenCalledWith("pet");
  });
  it("allows a hidden pet to be reopened and never fakes a disabled reply", () => {
    const p = props(); const { rerender } = render(<CompanionPanel {...p} view="hidden" />);
    fireEvent.click(screen.getByRole("button", { name: "重新显示学习伙伴" }));
    expect(p.onView).toHaveBeenCalledWith("pet");
    rerender(<CompanionPanel {...p} view="chat" enabled={false} reason="学习助手尚未启用" />);
    expect(screen.getByText("AI 答疑尚未启用，学习路线和资料仍可查看")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "登录" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /学习设置/ })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "向学习伙伴提问" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "发送消息" })).toBeDisabled();
  });
  it("uses the actual account context and expands approved resource titles and providers", () => {
    const p = props();
    mocks.agents.mockReturnValue({ ...p, authenticated: true, authPending: false, loading: false,
      workspace: workspace(), view: "chat", setView: p.onView, setDraft: p.onDraft,
      setDeep: p.onDeep, setReducedMotion: p.onReducedMotion, setHandoff: p.onHandoff,
      send: p.onSend, stop: p.onStop, refresh: vi.fn(),
    });
    render(<AgentCompanion />);
    expect(screen.getByText("产品经理")).toBeInTheDocument();
    expect(screen.getByText("设计产品指标体系")).toBeInTheDocument();
    expect(screen.queryByText("旧的课程名称")).not.toBeInTheDocument();
    openContext();
    expect(screen.getByText("Research 路线")).toBeInTheDocument();
    expect(screen.getByText("已完成 2 / 6 项")).toBeInTheDocument();
    expect(screen.getByText("产品学院")).toBeInTheDocument();
    expect(screen.getByText("案例库")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /产品指标入门/ });
    expect(link).toHaveAttribute("href", "https://example.com/metrics");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: /指标设计案例/ })).toHaveAttribute("href", "http://example.org/cases");
    expect(p.onSend).not.toHaveBeenCalled();
  });
  it("labels built-in context without inventing a Research source", () => {
    render(<CompanionPanel {...props()} view="chat" roleName="全栈开发" learningContext={{ ...researchContext(), source: "flagship" }} />);
    openContext();
    expect(screen.getByText("内置路线")).toBeInTheDocument();
    expect(screen.queryByText("Research 路线")).not.toBeInTheDocument();
  });
  it("keeps general questions available when no task is due and ignores a stale legacy task", () => {
    const p = props();
    render(<CompanionPanel {...p} view="chat" draft="如何复习指标设计？" roleName="产品经理"
      task="下周的访谈练习" learningContext={{ ...researchContext(), task: null, resources: [] }} />);
    expect(screen.getByText("今日暂无待学任务")).toBeInTheDocument();
    expect(screen.queryByText("下周的访谈练习")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "解释当前任务" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "帮我梳理学习思路" }));
    expect(p.onDraft).toHaveBeenCalledWith("帮我梳理学习思路");
    expect(p.onSend).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "发送消息" })).toBeEnabled();
  });
  it("recognizes a completed route without calling it a current task", () => {
    render(<CompanionPanel {...props()} view="chat" learningContext={{ ...researchContext(), completedUnits: 6, task: null, resources: [] }} />);
    expect(screen.getByText("这条路线的任务已完成")).toBeInTheDocument();
    expect(screen.queryByText("当前任务")).not.toBeInTheDocument();
  });
  it("offers broad task help as an editable draft without sending", () => {
    const p = props(); render(<CompanionPanel {...p} view="chat" learningContext={researchContext()} />);
    fireEvent.click(screen.getByRole("button", { name: "帮我拆解任务" }));
    expect(p.onDraft).toHaveBeenCalledWith("帮我拆解任务");
    expect(screen.queryByRole("button", { name: "帮我看报错" })).not.toBeInTheDocument();
    expect(p.onSend).not.toHaveBeenCalled();
  });
  it("offers two focused suggestions and hands the current draft to learning planning", () => {
    const p = props();
    render(<CompanionPanel {...p} view="chat" draft="我的学习时间不够" learningContext={researchContext()} />);
    expect(screen.queryByRole("checkbox", { name: "减少动效" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "给我一个例子" })).not.toBeInTheDocument();
    expect(screen.getByText("正在帮助：")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "调整学习计划" }));
    expect(p.onHandoff).toHaveBeenCalledWith("我的学习时间不够");
    expect(p.onSend).not.toHaveBeenCalled();
  });
  it("restores focus to the workspace help entry when it replaces the floating launcher", async () => {
    const p = props();
    render(<><button data-companion-trigger>工作区帮助</button><CompanionPanel {...p} view="chat" /></>);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.getByRole("button", { name: "工作区帮助" })).toHaveFocus());
  });
  it("keeps resources visible when AI is disabled without directing account setup", () => {
    render(<CompanionPanel {...props()} view="chat" enabled={false} availability="disabled" roleName="产品经理"
      reason="学习助手尚未启用，配置模型服务后即可使用。" learningContext={researchContext()} />);
    expect(screen.getByText("AI 答疑尚未启用，学习路线和资料仍可查看")).toBeInTheDocument();
    expect(screen.getByText("AI 答疑未启用")).toBeInTheDocument();
    expect(screen.queryByText(/配置模型/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /学习设置|登录/ })).not.toBeInTheDocument();
    openContext();
    expect(screen.getByRole("link", { name: /产品指标入门/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送消息" })).toBeDisabled();
  });
  it("offers setup only for a confirmed missing learning route", () => {
    render(<CompanionPanel {...props()} view="chat" enabled={false} availability="needs_setup" task={null} />);
    expect(screen.getByRole("link", { name: /学习设置/ })).toHaveAttribute("href", "/setup");
    expect(screen.queryByRole("link", { name: "登录" })).not.toBeInTheDocument();
    expect(screen.getByText("尚未建立学习路线")).toBeInTheDocument();
    expect(screen.queryByText("学习目标与当前进度")).not.toBeInTheDocument();
  });
  it("shows loading without stale context, placeholder routes or account links", () => {
    const p = props();
    render(<CompanionPanel {...p} view="chat" loading roleName="产品经理" learningContext={researchContext()}
      availability="ready" draft="继续学习" />);
    expect(screen.getByText("正在读取学习进度…")).toBeInTheDocument();
    expect(screen.queryByText("产品经理")).not.toBeInTheDocument();
    expect(screen.queryByText("Research 路线")).not.toBeInTheDocument();
    expect(screen.queryByText("React 状态管理")).not.toBeInTheDocument();
    expect(screen.queryByText("学习目标与当前进度")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /学习设置|登录/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送消息" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    expect(p.onSend).not.toHaveBeenCalled();
  });
  it("offers refresh after a workspace read error without suggesting setup or login", () => {
    const onRefresh = vi.fn();
    render(<CompanionPanel {...props()} view="chat" enabled={false} task={null} error="学习进度读取失败" onRefresh={onRefresh} />);
    expect(screen.getByRole("alert")).toHaveTextContent("学习进度读取失败");
    expect(screen.getByText("暂时无法读取进度")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /学习设置|登录/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });
  it("allows explicit retry after a reply error when the workspace is still valid", () => {
    const p = props();
    render(<CompanionPanel {...p} view="chat" availability="ready" learningContext={researchContext()}
      error="回复失败，请重试。" draft="请再解释一下" />);
    expect(screen.getByRole("alert")).toHaveTextContent("回复失败，请重试。");
    expect(screen.getByText("回复未完成，可重试")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送消息" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));
    expect(p.onSend).toHaveBeenCalledOnce();
  });
  it.each(["javascript:alert(1)", "data:text/html,test", "//example.com/relative", "https://user:password@example.com/course", "https://user@example.com/course", "not-a-url"])("does not make an unsafe catalog URL clickable: %s", url => {
    const context = researchContext();
    context.resources = [{ id: "unsafe", title: "不安全资料", provider: "目录来源", url }];
    render(<CompanionPanel {...props()} view="chat" learningContext={context} />);
    openContext();
    expect(screen.queryByRole("link", { name: /不安全资料/ })).not.toBeInTheDocument();
  });
  it("preserves drafts across minimizing and reopening and respects IME composition", () => {
    const p = props();
    const { rerender } = render(<CompanionPanel {...p} view="chat" draft="分析用户留存" learningContext={researchContext()} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", isComposing: true });
    expect(p.onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(p.onView).toHaveBeenCalledWith("pet");
    rerender(<CompanionPanel {...p} view="pet" draft="分析用户留存" learningContext={researchContext()} />);
    fireEvent.click(screen.getByRole("button", { name: "打开学习伙伴" }));
    rerender(<CompanionPanel {...p} view="chat" draft="分析用户留存" learningContext={researchContext()} />);
    expect(screen.getByRole("textbox")).toHaveValue("分析用户留存");
    expect(p.onDraft).not.toHaveBeenCalled();
    expect(p.onSend).not.toHaveBeenCalled();
  });
  it("retains deep explanations, handoff and stopping a streamed reply", () => {
    const p = props();
    const message: PublicAgentRun = { id: "run", kind: "tutor", status: "complete", message: "指标如何拆解？", answer: "先确定目标。",
      advice: null, createdAt: 1, baseVersionId: "v1", revision: 1, model: "tutor", effort: "high", error: null };
    render(<CompanionPanel {...p} view="chat" busy messages={[message]} pendingQuestion="举一个例子" partial="比如留存率" />);
    fireEvent.click(screen.getByRole("checkbox", { name: "深入讲解" }));
    expect(p.onDeep).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: /带到学习规划/ }));
    expect(p.onHandoff).toHaveBeenCalledWith(expect.stringContaining("指标如何拆解？"));
    expect(screen.getByText("比如留存率")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "停止回复" }));
    expect(p.onStop).toHaveBeenCalledOnce();
    expect(p.onSend).not.toHaveBeenCalled();
  });
});
