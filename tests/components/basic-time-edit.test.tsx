import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimeEditFlow } from "../../app/components/setup/time-edit-flow";
import { createDemoState } from "../../app/lib/demo-store";
import type { ArcStateController } from "../../app/lib/use-arc-state";
import type { PlanningWorkspaceController } from "../../app/lib/use-planning-workspace";

const mocks = vi.hoisted(() => ({ planning: null as unknown as PlanningWorkspaceController }));
vi.mock("../../app/lib/use-planning-workspace", () => ({ usePlanningWorkspace: () => mocks.planning }));
let arc: ArcStateController;
beforeEach(() => {
  mocks.planning = { workspace: null, sourceContext: null, source: "cloud", recovery: "none", cloudGoalMissing: false, retry: vi.fn().mockResolvedValue(undefined) } as unknown as PlanningWorkspaceController;
  arc = { state: { ...createDemoState(), setup: { ...createDemoState().setup, roleId: "basic-role" }, completedUnitIds: ["retained-unit"] }, source: "cloud", recovery: "none", saveSetup: vi.fn().mockResolvedValue(true), retry: vi.fn().mockResolvedValue(undefined) } as unknown as ArcStateController;
});
afterEach(cleanup);
const view = () => render(<TimeEditFlow arc={arc} signedIn draftOwner="user:owner-a" onResearchActiveChange={vi.fn()} />);

describe("basic cloud time editing", () => {
  it("uses the existing owner-bound save and changes only weekly minutes", async () => {
    const retained = structuredClone(arc.state);
    view();
    expect(screen.queryByRole("link", { name: "继续今日学习" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("每周可用分钟"), { target: { value: "300" } });
    fireEvent.click(screen.getByRole("button", { name: "保存时间" }));
    await waitFor(() => expect(arc.saveSetup).toHaveBeenCalledWith({ ...retained!.setup, weeklyMinutes: 300 }, expect.any(AbortSignal)));
    expect(await screen.findByRole("status")).toHaveTextContent("时间已保存");
    expect(screen.getAllByRole("link", { name: "继续今日学习" })).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("每周可用分钟"), { target: { value: "360" } });
    expect(screen.queryByRole("link", { name: "继续今日学习" })).not.toBeInTheDocument();
    expect(arc.state).toEqual(retained);
  });

  it("keeps failed saves editable without offering completion", async () => {
    arc.saveSetup = vi.fn().mockResolvedValue(false);
    view();
    fireEvent.change(screen.getByLabelText("每周可用分钟"), { target: { value: "300" } });
    fireEvent.click(screen.getByRole("button", { name: "保存时间" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("未能保存时间");
    expect(screen.queryByRole("link", { name: "继续今日学习" })).not.toBeInTheDocument();
  });

  it("aborts a pending save on explicit cancel without claiming a persisted draft", async () => {
    let finish!: (saved: boolean) => void;
    arc.saveSetup = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    view();
    fireEvent.change(screen.getByLabelText("每周可用分钟"), { target: { value: "300" } });
    fireEvent.click(screen.getByRole("button", { name: "保存时间" }));
    const cancel = screen.getByRole("link", { name: "取消修改" });
    cancel.addEventListener("click", event => event.preventDefault());
    fireEvent.click(cancel);
    expect(vi.mocked(arc.saveSetup).mock.calls[0]![1]!.aborted).toBe(true);
    await act(async () => finish(true));
    expect(screen.queryByRole("link", { name: "继续今日学习" })).not.toBeInTheDocument();
    expect(screen.queryByText(/草稿/)).not.toBeInTheDocument();
  });

  it.each(["offline-cloud", "session-expired"] as const)("offers recovery rather than creating a replacement for %s", async (failure) => {
    if (failure === "offline-cloud") arc.source = failure;
    else arc.recovery = failure;
    view();
    expect(screen.queryByLabelText("每周可用分钟")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "创建学习目标" })).not.toBeInTheDocument();
    if (failure === "session-expired") {
      expect(screen.getByRole("link", { name: "重新登录" })).toHaveAttribute("href", "/sign-in?reauth=1&next=%2Fsetup%3Fmode%3Dedit%26section%3Dtime");
    } else {
      fireEvent.click(screen.getByRole("button", { name: "重新读取计划" }));
      await waitFor(() => expect(arc.retry).toHaveBeenCalledOnce());
      expect(mocks.planning.retry).toHaveBeenCalledOnce();
    }
    expect(arc.saveSetup).not.toHaveBeenCalled();
  });

  it("aborts a pending save when leaving the editor", async () => {
    let finish!: (saved: boolean) => void;
    arc.saveSetup = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    const mounted = view();
    fireEvent.change(screen.getByLabelText("每周可用分钟"), { target: { value: "300" } });
    fireEvent.click(screen.getByRole("button", { name: "保存时间" }));
    expect(screen.getByRole("button", { name: "正在保存…" })).toBeDisabled();
    const signal = vi.mocked(arc.saveSetup).mock.calls[0]![1]!;
    mounted.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => finish(false));
    expect(arc.saveSetup).toHaveBeenCalledOnce();
  });
});
