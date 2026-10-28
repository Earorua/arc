import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentCompanion, CompanionPanel } from "../../app/components/agents/agent-companion";
const mocks = vi.hoisted(() => ({ agents: vi.fn() }));
vi.mock("../../app/components/agents/agent-context", async importOriginal => ({
  ...await importOriginal<typeof import("../../app/components/agents/agent-context")>(), useLearningAgents: mocks.agents,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/today" }));
afterEach(cleanup);

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
      expect(screen.getByRole("link", { name: "学习规划师 ↗" })).toHaveFocus();
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
    expect(screen.getByText("学习伙伴暂未开放")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "登录" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /学习设置/ })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "向学习伙伴提问" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "发送消息" })).toBeDisabled();
  });
});
