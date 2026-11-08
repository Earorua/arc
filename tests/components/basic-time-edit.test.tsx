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
    expect(screen.queryByRole("link", { name: "Continue today's learning" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Available minutes per week"), { target: { value: "300" } });
    fireEvent.click(screen.getByRole("button", { name: "Save time" }));
    await waitFor(() => expect(arc.saveSetup).toHaveBeenCalledWith({ ...retained!.setup, weeklyMinutes: 300 }, expect.any(AbortSignal)));
    expect(await screen.findByRole("status")).toHaveTextContent("Your time is saved");
    expect(screen.getAllByRole("link", { name: "Continue today's learning" })).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Available minutes per week"), { target: { value: "360" } });
    expect(screen.queryByRole("link", { name: "Continue today's learning" })).not.toBeInTheDocument();
    expect(arc.state).toEqual(retained);
  });

  it("keeps failed saves editable without offering completion", async () => {
    arc.saveSetup = vi.fn().mockResolvedValue(false);
    view();
    fireEvent.change(screen.getByLabelText("Available minutes per week"), { target: { value: "300" } });
    fireEvent.click(screen.getByRole("button", { name: "Save time" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save your time");
    expect(screen.queryByRole("link", { name: "Continue today's learning" })).not.toBeInTheDocument();
  });

  it("aborts a pending save on explicit cancel without claiming a persisted draft", async () => {
    let finish!: (saved: boolean) => void;
    arc.saveSetup = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    view();
    fireEvent.change(screen.getByLabelText("Available minutes per week"), { target: { value: "300" } });
    fireEvent.click(screen.getByRole("button", { name: "Save time" }));
    const cancel = screen.getByRole("link", { name: "Cancel changes" });
    cancel.addEventListener("click", event => event.preventDefault());
    fireEvent.click(cancel);
    expect(vi.mocked(arc.saveSetup).mock.calls[0]![1]!.aborted).toBe(true);
    await act(async () => finish(true));
    expect(screen.queryByRole("link", { name: "Continue today's learning" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Draft/)).not.toBeInTheDocument();
  });

  it.each(["offline-cloud", "session-expired"] as const)("offers recovery rather than creating a replacement for %s", async (failure) => {
    if (failure === "offline-cloud") arc.source = failure;
    else arc.recovery = failure;
    view();
    expect(screen.queryByLabelText("Available minutes per week")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Create a learning goal" })).not.toBeInTheDocument();
    if (failure === "session-expired") {
      expect(screen.getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/sign-in?reauth=1&next=%2Fsetup%3Fmode%3Dedit%26section%3Dtime");
    } else {
      fireEvent.click(screen.getByRole("button", { name: "Reload plan" }));
      await waitFor(() => expect(arc.retry).toHaveBeenCalledOnce());
      expect(mocks.planning.retry).toHaveBeenCalledOnce();
    }
    expect(arc.saveSetup).not.toHaveBeenCalled();
  });

  it("aborts a pending save when leaving the editor", async () => {
    let finish!: (saved: boolean) => void;
    arc.saveSetup = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    const mounted = view();
    fireEvent.change(screen.getByLabelText("Available minutes per week"), { target: { value: "300" } });
    fireEvent.click(screen.getByRole("button", { name: "Save time" }));
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    const signal = vi.mocked(arc.saveSetup).mock.calls[0]![1]!;
    mounted.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => finish(false));
    expect(arc.saveSetup).toHaveBeenCalledOnce();
  });
});
