import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompanionPanel } from "../../app/components/agents/agent-companion";
afterEach(cleanup);

describe("learning companion", () => {
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
    expect(screen.getByText("学习助手尚未启用")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送消息" })).toBeDisabled();
  });
});
