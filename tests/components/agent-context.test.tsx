import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LearningAgentsProvider, useLearningAgents } from "../../app/components/agents/agent-context";
import type { AgentWorkspace } from "../../app/contracts/agents";
const mocks = vi.hoisted(() => ({ session: vi.fn(), pathname: vi.fn(), workspace: vi.fn(), tutor: vi.fn() }));
vi.mock("../../app/lib/auth-client", () => ({ authClient: { useSession: mocks.session } }));
vi.mock("next/navigation", () => ({ usePathname: mocks.pathname }));
vi.mock("../../app/lib/agent-client", () => ({ agentClient: { workspace: mocks.workspace, tutor: mocks.tutor } }));
afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); vi.resetAllMocks(); });
function Probe() {
  const state = useLearningAgents();
  return <><span data-testid="auth">{state.authPending ? "checking" : state.authenticated ? "member" : "guest"}</span>
    <span>{state.workspace?.roleName}</span><span data-testid="view">{state.view}</span>
    <input aria-label="draft" value={state.draft} onChange={event => state.setDraft(event.target.value)} />
    <button onClick={() => state.setView("hidden")}>hide</button><button onClick={() => void state.send()}>send</button>
    <button onClick={state.stop}>stop</button>
    <span data-testid="partial">{state.partial}</span><span data-testid="history">{state.workspace?.history.map(run => run.answer).join("")}</span></>;
}
function fixture() {
  const workspace: AgentWorkspace = { enabled: true, authenticated: true, goalId: "goal-a", baseVersionId: "plan-a", revision: 0,
    roleName: "前端工程师", currentTask: "组件", history: [], reason: null, plannerModel: "gpt-6-astra", tutorModel: "gpt-6-astra" };
  mocks.session.mockReturnValue({ data: { user: { id: "alice" } }, isPending: false });
  mocks.pathname.mockReturnValue("/today");
  mocks.workspace.mockResolvedValue(workspace);
  return workspace;
}
describe("persistent learning companion context", () => {
  it("preserves unrelated page inputs while guest sessions revalidate and accounts change", async () => {
    fixture(); mocks.session.mockReturnValue({ data: null, isPending: false });
    function PageForm() {
      const [value, setValue] = useState("");
      return <input aria-label="learning setup" value={value} onChange={event => setValue(event.target.value)} />;
    }
    const element = <LearningAgentsProvider><PageForm /><Probe /></LearningAgentsProvider>;
    const { rerender } = render(element);
    fireEvent.change(screen.getByLabelText("learning setup"), { target: { value: "my unfinished setup" } });
    for (const session of [
      { data: null, isPending: true },
      { data: null, isPending: false },
      { data: { user: { id: "alice" } }, isPending: false },
      { data: { user: { id: "bob" } }, isPending: false },
      { data: null, isPending: false },
    ]) {
      mocks.session.mockReturnValue(session);
      rerender(<LearningAgentsProvider><PageForm /><Probe /></LearningAgentsProvider>);
      await act(async () => {});
      expect(screen.getByLabelText("learning setup")).toHaveValue("my unfinished setup");
    }
  });
  it("keeps the initial auth gate stable when the session resolves before hydration", async () => {
    fixture(); mocks.session.mockReturnValue({ data: null, isPending: true });
    const element = <LearningAgentsProvider><Probe /></LearningAgentsProvider>;
    const container = document.createElement("div"); container.innerHTML = renderToString(element);
    document.body.appendChild(container);
    mocks.session.mockReturnValue({ data: null, isPending: false });
    const onRecoverableError = vi.fn(); let root!: ReturnType<typeof hydrateRoot>;
    try {
      await act(async () => { root = hydrateRoot(container, element, { onRecoverableError }); });
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(screen.getByTestId("auth")).toHaveTextContent("guest");
      expect(mocks.workspace).not.toHaveBeenCalled();
    } finally { await act(async () => root.unmount()); container.remove(); }
  });
  it.each([
    { data: null, isPending: false },
    { data: null, isPending: true },
    { data: { user: { id: "alice" } }, isPending: false, error: new Error("session unavailable") },
  ])("does not load agent data or send messages without a confirmed session: %j", async session => {
    fixture(); mocks.session.mockReturnValue(session);
    const { rerender } = render(<LearningAgentsProvider><Probe /></LearningAgentsProvider>);
    await act(async () => {});
    fireEvent.change(screen.getByLabelText("draft"), { target: { value: "guest question" } });
    fireEvent.click(screen.getByText("send"));
    mocks.pathname.mockReturnValue("/coach"); rerender(<LearningAgentsProvider><Probe /></LearningAgentsProvider>);
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(mocks.workspace).not.toHaveBeenCalled(); expect(mocks.tutor).not.toHaveBeenCalled();
    expect(screen.getByTestId("history")).toBeEmptyDOMElement();
  });
  it("cancels streaming and clears private content immediately on logout", async () => {
    fixture(); let reply!: (event: { type: "delta"; text: string }) => void;
    let signal!: AbortSignal, finish!: () => void;
    mocks.tutor.mockImplementation((_input, callback, requestSignal) => {
      reply = callback; signal = requestSignal; return new Promise<void>(resolve => { finish = resolve; });
    });
    const { rerender } = render(<LearningAgentsProvider><Probe /></LearningAgentsProvider>);
    await screen.findByText("前端工程师");
    fireEvent.change(screen.getByLabelText("draft"), { target: { value: "private question" } });
    fireEvent.click(screen.getByText("send"));
    await act(async () => reply({ type: "delta", text: "private answer" }));
    expect(screen.getByTestId("partial")).toHaveTextContent("private answer");
    const reads = mocks.workspace.mock.calls.length;
    mocks.session.mockReturnValue({ data: null, isPending: false });
    rerender(<LearningAgentsProvider><Probe /></LearningAgentsProvider>);
    await act(async () => { reply({ type: "delta", text: "late private answer" }); finish(); });
    expect(signal.aborted).toBe(true);
    expect(screen.queryByText("前端工程师")).not.toBeInTheDocument();
    expect(screen.getByTestId("partial")).toBeEmptyDOMElement();
    expect(screen.getByTestId("history")).toBeEmptyDOMElement();
    expect(screen.getByLabelText("draft")).toHaveValue("");
    expect(mocks.workspace).toHaveBeenCalledTimes(reads);
  });
  it("keeps visibility and drafts across navigation and remount", async () => {
    fixture(); const { rerender, unmount } = render(<LearningAgentsProvider><Probe /></LearningAgentsProvider>);
    await screen.findByText("前端工程师");
    fireEvent.change(screen.getByLabelText("draft"), { target: { value: "状态如何更新？" } });
    fireEvent.click(screen.getByText("hide"));
    mocks.pathname.mockReturnValue("/path");
    rerender(<LearningAgentsProvider><Probe /></LearningAgentsProvider>);
    expect(screen.getByLabelText("draft")).toHaveValue("状态如何更新？");
    expect(screen.getByTestId("view")).toHaveTextContent("hidden");
    unmount(); render(<LearningAgentsProvider><Probe /></LearningAgentsProvider>);
    await waitFor(() => expect(screen.getByLabelText("draft")).toHaveValue("状态如何更新？"));
    expect(screen.getByTestId("view")).toHaveTextContent("hidden");
  });
  it("aborts old-account streams and ignores their late answers after an identity switch", async () => {
    const workspace = fixture();
    let answer: Parameters<typeof mocks.tutor>[0];
    let signal: AbortSignal | undefined;
    let finish: (() => void) | undefined;
    mocks.tutor.mockImplementation((_input, callback, requestSignal) => {
      answer = callback; signal = requestSignal; return new Promise<void>(resolve => { finish = resolve; });
    });
    const { rerender } = render(<LearningAgentsProvider><Probe /></LearningAgentsProvider>);
    await screen.findByText("前端工程师");
    fireEvent.change(screen.getByLabelText("draft"), { target: { value: "private question" } });
    fireEvent.click(screen.getByText("send"));
    await waitFor(() => expect(mocks.tutor).toHaveBeenCalledTimes(1));
    mocks.session.mockReturnValue({ data: { user: { id: "bob" } }, isPending: false });
    mocks.workspace.mockResolvedValue({ ...workspace, goalId: "goal-b", roleName: "后端工程师" });
    rerender(<LearningAgentsProvider><Probe /></LearningAgentsProvider>);
    await screen.findByText("后端工程师");
    expect(signal?.aborted).toBe(true);
    await act(async () => { answer({ type: "delta", text: "private answer" }); finish?.(); });
    expect(screen.getByTestId("partial")).toBeEmptyDOMElement();
    expect(screen.getByTestId("history")).toBeEmptyDOMElement();
    expect(screen.getByLabelText("draft")).toHaveValue("");
  });
  it("preserves a newer draft when the previous answer is stopped", async () => {
    fixture();
    mocks.tutor.mockImplementation((_input, _callback, signal: AbortSignal) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("stopped")), { once: true });
    }));
    render(<LearningAgentsProvider><Probe /></LearningAgentsProvider>);
    await screen.findByText("前端工程师");
    fireEvent.change(screen.getByLabelText("draft"), { target: { value: "first question" } });
    fireEvent.click(screen.getByText("send"));
    await waitFor(() => expect(mocks.tutor).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("draft"), { target: { value: "next question" } });
    await act(async () => { fireEvent.click(screen.getByText("stop")); });
    expect(screen.getByLabelText("draft")).toHaveValue("next question");
    expect(sessionStorage.getItem("arc-companion-draft-v1:alice:goal-a")).toBe("next question");
  });
});
