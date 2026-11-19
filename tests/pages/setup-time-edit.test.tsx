import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SetupPage from "../../app/setup/page";
import { createLocalPlanningRepository } from "../../app/lib/planning/local-repository";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { PLANNING_SCHEMA_VERSION, type PlanningEventInput } from "../../app/contracts/planning";
import type { PlanningWorkspaceController } from "../../app/lib/use-planning-workspace";
import { createDemoState, loadDemoState, saveDemoState } from "../../app/lib/demo-store";
import { TimeEditFlow } from "../../app/components/setup/time-edit-flow";
import { readSetupDraft, timeEditDraftSchema } from "../../app/components/setup/setup-draft";
import type { ArcStateController } from "../../app/lib/use-arc-state";

const state = vi.hoisted(() => ({ planning: null as unknown as PlanningWorkspaceController, push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock("../../app/lib/auth-client", () => ({ authClient: { useSession: () => ({ data: null, isPending: false }) } }));
vi.mock("../../app/lib/use-planning-workspace", () => ({ usePlanningWorkspace: () => state.planning }));
let repository: ReturnType<typeof createLocalPlanningRepository>;
const locksDescriptor = Object.getOwnPropertyDescriptor(navigator, "locks");

beforeEach(async () => {
  localStorage.clear(); state.push.mockReset();
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: (_name: string, _options: unknown, action: () => unknown) => action() } });
  window.history.replaceState(null, "", "/setup?mode=edit&section=time");
  repository = createLocalPlanningRepository({ storage: localStorage });
  const initial = await repository.generate({ mutationId: "mutation-edit-initial", roleId: "ai-native-full-stack-engineer", planningDate: "2026-10-28",
    audit: { id: "audit-edit", schemaVersion: PLANNING_SCHEMA_VERSION, blueprintId: flagshipBlueprint.id, blueprintVersion: flagshipBlueprint.version, answers: flagshipBlueprint.skills.map(({ id }) => ({ skillId: id, level: "unseen", evidenceRefs: [] })), evidence: [], createdBy: "learner", inputFingerprint: "audit-edit" },
    availability: { id: "availability-edit", schemaVersion: PLANNING_SCHEMA_VERSION, timeZone: "UTC", weekdays: { monday: 60, tuesday: 60, wednesday: 60, thursday: 60, friday: 60, saturday: 60, sunday: 60 }, exceptions: [], weeklyMinutes: 420, inputFingerprint: "availability-edit" },
    target: { id: "target-edit", schemaVersion: PLANNING_SCHEMA_VERSION, targetWeeks: 18, inputFingerprint: "target-edit" }, selectedScope: "full-scope" });
  const first = initial.workspace.dailyUnits[0]!;
  const completed = await repository.appendEvent({ mutationId: "mutation-edit-completed", baseVersionId: initial.workspace.activePlanVersionId, event: { kind: "completed", unitId: first.id, actualMinutes: 60, planningDate: "2026-10-28" } });
  let sequence = 0;
  state.planning = { workspace: completed.workspace, sourceContext: null, source: "local", recovery: "none", cloudGoalMissing: false, migration: "none",
    generate: vi.fn(), record: vi.fn(async (event: PlanningEventInput) => { const result = await repository.appendEvent({ mutationId: `mutation-edit-${++sequence}`, baseVersionId: state.planning.workspace!.activePlanVersionId, event }); state.planning.workspace = result.workspace; return true; }),
    accept: vi.fn(async (candidatePlanVersionId: string) => { const result = await repository.accept({ mutationId: "mutation-edit-accept", baseVersionId: state.planning.workspace!.activePlanVersionId, candidatePlanVersionId }); state.planning.workspace = result.workspace; return true; }),
    discard: vi.fn(async (candidatePlanVersionId: string) => { const result = await repository.discard({ mutationId: "mutation-edit-discard", baseVersionId: state.planning.workspace!.activePlanVersionId, candidatePlanVersionId }); state.planning.workspace = result.workspace; return true; }),
    retry: vi.fn(), importLocal: vi.fn(), dismissMigration: vi.fn(), preflightCurrentSetup: vi.fn() };
});
afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); if (locksDescriptor) Object.defineProperty(navigator, "locks", locksDescriptor); else Reflect.deleteProperty(navigator, "locks"); });

describe("time-only setup editing", () => {
  it.each(["owner", "goal"])("ignores a late accept after the %s changes, including when returning", async scope => {
    const original = state.planning.workspace!;
    const arc = { state: createDemoState(), source: "local", recovery: "none" } as ArcStateController;
    const page = (owner: string) => <TimeEditFlow arc={arc} signedIn={false} draftOwner={owner} onResearchActiveChange={vi.fn()} />;
    const mounted = render(page("owner-a"));
    fireEvent.change(await screen.findByLabelText("Monday minutes"), { target: { value: "90" } });
    await userEvent.click(screen.getByRole("button", { name: "Preview time changes" }));
    let finish!: (saved: boolean) => void;
    state.planning.accept = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    mounted.rerender(page("owner-a"));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    state.planning.workspace = scope === "goal" ? { ...original, goalId: "other-goal" } : original;
    mounted.rerender(page(scope === "owner" ? "owner-b" : "owner-a"));
    await act(async () => finish(true));
    expect(screen.queryByRole("link", { name: "Continue today's learning" })).not.toBeInTheDocument();
    state.planning.workspace = original;
    mounted.rerender(page("owner-a"));
    await act(async () => {});
    expect(screen.queryByRole("link", { name: "Continue today's learning" })).not.toBeInTheDocument();
    expect(screen.queryByText("New schedule accepted.")).not.toBeInTheDocument();
  });

  it.each([false, true])("preserves the accept result through availability remount unless editing starts again (editAgain=%s)", async editAgain => {
    const mounted = render(<SetupPage />);
    fireEvent.change(await screen.findByLabelText("Monday minutes"), { target: { value: "90" } });
    await userEvent.click(screen.getByRole("button", { name: "Preview time changes" }));
    let finish!: () => void;
    const pause = new Promise<void>(resolve => { finish = resolve; });
    const accept = state.planning.accept;
    state.planning.accept = vi.fn(async candidate => { const saved = await accept(candidate); await pause; return saved; });
    mounted.rerender(<SetupPage />);
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(state.planning.workspace!.pendingPlanVersionId).toBeNull());
    mounted.rerender(<SetupPage />);
    expect(screen.queryByRole("link", { name: "Continue today's learning" })).not.toBeInTheDocument();
    if (editAgain) fireEvent.change(await screen.findByLabelText("Monday minutes"), { target: { value: "120" } });
    await act(async () => finish());
    if (editAgain) expect(screen.queryByRole("link", { name: "Continue today's learning" })).not.toBeInTheDocument();
    else expect(screen.getByRole("link", { name: "Continue today's learning" })).toHaveAttribute("href", "/today");
  });

  it.each(["accept", "discard"] as const)("keeps a newer persisted draft when a late %s callback settles", async decision => {
    const mounted = render(<SetupPage />);
    fireEvent.change(await screen.findByLabelText("Monday minutes"), { target: { value: "90" } });
    await userEvent.click(screen.getByRole("button", { name: "Preview time changes" }));
    let finish!: () => void;
    const pause = new Promise<void>(resolve => { finish = resolve; });
    const decide = state.planning[decision];
    state.planning[decision] = vi.fn(async candidate => { const saved = await decide(candidate); await pause; return saved; });
    mounted.rerender(<SetupPage />);
    await userEvent.click(screen.getByRole("button", { name: decision === "accept" ? "Save changes" : "Keep current schedule" }));
    await waitFor(() => expect(state.planning.workspace!.pendingPlanVersionId).toBeNull());
    mounted.rerender(<SetupPage />);
    fireEvent.change(await screen.findByLabelText("Monday minutes"), { target: { value: "135" } });
    const draftSource = `time:${state.planning.workspace!.goalId}:${state.planning.workspace!.availability.id}`;
    const readMonday = () => readSetupDraft("guest", draftSource, timeEditDraftSchema)?.weekdays.monday;
    await waitFor(() => expect(readMonday()).toBe(135));
    await act(async () => finish());
    expect(readMonday()).toBe(135);
    mounted.unmount();
    render(<SetupPage />);
    // The input mounts with saved availability before the queued draft restoration runs.
    await waitFor(() => expect(screen.getByLabelText("Monday minutes")).toHaveValue(135));
    expect(screen.queryByRole("link", { name: "Continue today's learning" })).not.toBeInTheDocument();
  });
  it("updates a basic plan's time without replacing its goal or completed work", async () => {
    state.planning.workspace = null;
    const retained = { ...createDemoState(), setup: { ...createDemoState().setup, roleId: "basic-custom-role" }, completedUnitIds: ["completed-basic-unit"] };
    saveDemoState(retained);
    render(<SetupPage />);
    const minutes = await screen.findByLabelText("Available minutes per week");
    expect(minutes).toHaveValue(420);
    fireEvent.change(minutes, { target: { value: "300" } });
    await userEvent.click(screen.getByRole("button", { name: "Save time" }));
    await waitFor(() => expect(loadDemoState()).toEqual({ ...retained, setup: { ...retained.setup, weeklyMinutes: 300 } }));
    expect(await screen.findByRole("status")).toHaveTextContent("Your time is saved");
    expect(state.planning.generate).not.toHaveBeenCalled();
    expect(state.planning.record).not.toHaveBeenCalled();
  });

  it("does not save invalid or cancelled basic time edits", async () => {
    state.planning.workspace = null;
    const retained = { ...createDemoState(), setup: { ...createDemoState().setup, roleId: "basic-custom-role" } };
    saveDemoState(retained);
    const view = render(<SetupPage />);
    fireEvent.change(await screen.findByLabelText("Available minutes per week"), { target: { value: "0" } });
    expect(screen.getByRole("button", { name: "Save time" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Available minutes per week"), { target: { value: "300" } });
    const cancel = screen.getByRole("link", { name: "Cancel changes" });
    cancel.addEventListener("click", (event) => event.preventDefault());
    await userEvent.click(cancel);
    view.unmount();
    expect(loadDemoState()).toEqual(retained);
  });

  it("restores unsent time edits after refresh and clears them on explicit cancel", async () => {
    const user = userEvent.setup();
    const view = render(<SetupPage />);
    fireEvent.change(await screen.findByLabelText("Monday minutes"), { target: { value: "90" } });
    view.unmount();
    const restored = render(<SetupPage />);
    expect(await screen.findByLabelText("Monday minutes")).toHaveValue(90);
    const cancel = screen.getByRole("link", { name: "Cancel changes" });
    cancel.addEventListener("click", (event) => event.preventDefault());
    await user.click(cancel);
    restored.unmount();
    render(<SetupPage />);
    expect(await screen.findByLabelText("Monday minutes")).toHaveValue(60);
    expect(state.planning.record).not.toHaveBeenCalled();
  });

  it("does not apply a time draft to another goal or a changed base availability", async () => {
    const view = render(<SetupPage />);
    fireEvent.change(await screen.findByLabelText("Monday minutes"), { target: { value: "90" } });
    view.unmount();
    state.planning.workspace = { ...state.planning.workspace!, goalId: "goal-another" };
    const other = render(<SetupPage />);
    expect(await screen.findByLabelText("Monday minutes")).toHaveValue(60);
    other.unmount();
  });

  it("blocks unsupported creation before the user fills a replacement plan", async () => {
    window.history.replaceState(null, "", "/setup?mode=create");
    render(<SetupPage />);
    expect(await screen.findByRole("heading", { name: "Create a new learning goal" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "AI-Native Full-Stack Engineer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to your path" })).toHaveAttribute("href", "/path");
    expect(state.planning.generate).not.toHaveBeenCalled();
  });

  it.each(["accept", "discard"])("proposes availability and explicitly decides %s without regenerating the goal or completed history", async (decision) => {
    const original = state.planning.workspace!; const user = userEvent.setup();
    const view = render(<SetupPage />);
    expect(await screen.findByRole("heading", { name: "Adjust weekly time" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Custom role")).not.toBeInTheDocument();
    expect(screen.getByText(/18-week/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Continue today's learning" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Monday minutes"), { target: { value: "120" } });
    await user.click(screen.getByRole("button", { name: "Preview time changes" }));
    await waitFor(() => expect(state.planning.record).toHaveBeenCalledWith(expect.objectContaining({ kind: "availability_changed", availability: expect.objectContaining({ weeklyMinutes: 480 }), planningDate: expect.any(String) })));
    view.rerender(<SetupPage />);
    expect(await screen.findByRole("heading", { name: "What will change" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Continue today's learning" })).not.toBeInTheDocument();
    expect(state.planning.workspace!.activePlanVersionId).toBe(original.activePlanVersionId);
    expect(state.planning.accept).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: decision === "accept" ? "Save changes" : "Keep current schedule" }));
    const saved = await repository.load();
    expect(saved!.goalId).toBe(original.goalId);
    expect(saved!.target).toEqual(original.target);
    expect(saved!.events.filter(({ kind }) => kind === "completed")).toEqual(original.events.filter(({ kind }) => kind === "completed"));
    if (decision === "accept") expect(saved!.activePlanVersionId).not.toBe(original.activePlanVersionId);
    else expect(saved!.activePlanVersionId).toBe(original.activePlanVersionId);
    expect(state.planning.generate).not.toHaveBeenCalled();
    view.rerender(<SetupPage />);
    expect(await screen.findByRole("status")).toHaveTextContent(decision === "accept" ? "New schedule accepted." : "Current schedule kept.");
    if (decision === "accept") expect(screen.getAllByRole("link", { name: "Continue today's learning" })).toHaveLength(1);
    else expect(screen.queryByRole("link", { name: "Continue today's learning" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Available minutes per week"), { target: { value: "180" } });
    expect(screen.queryByRole("link", { name: "Continue today's learning" })).not.toBeInTheDocument();
    view.unmount(); render(<SetupPage />);
    expect(await screen.findByLabelText("Available minutes per week")).toHaveValue(180);
  });

  it("offers a real connection retry after a failed availability write", async () => {
    state.planning.record = vi.fn(async () => { state.planning.source = "offline-cloud"; state.planning.recovery = "unavailable"; return false; });
    const user = userEvent.setup(); const view = render(<SetupPage />);
    await screen.findByRole("heading", { name: "Adjust weekly time" });
    fireEvent.change(screen.getByLabelText("Monday minutes"), { target: { value: "90" } });
    await user.click(screen.getByRole("button", { name: "Preview time changes" }));
    view.rerender(<SetupPage />);
    await user.click(screen.getByRole("button", { name: "Reload current plan" }));
    expect(state.planning.retry).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Monday minutes")).toHaveValue(90);
    expect(state.planning.record).toHaveBeenCalledTimes(1);
  });

  it("allows cancellation and failed-preview retry without saving a new goal", async () => {
    state.planning.record = vi.fn().mockResolvedValue(false);
    const user = userEvent.setup(); render(<SetupPage />);
    await screen.findByRole("heading", { name: "Adjust weekly time" });
    fireEvent.change(screen.getByLabelText("Monday minutes"), { target: { value: "90" } });
    await user.click(screen.getByRole("button", { name: "Preview time changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not create proposed changes");
    expect(screen.getByRole("button", { name: "Preview time changes" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Cancel changes" })).toHaveAttribute("href", "/path");
    expect(state.planning.generate).not.toHaveBeenCalled();
  });

  it("keeps the time draft when returning through the page header", async () => {
    const mounted = render(<SetupPage />);
    fireEvent.change(await screen.findByLabelText("Monday minutes"), { target: { value: "90" } });
    const back = screen.getByRole("link", { name: "Back to your path" });
    back.addEventListener("click", event => event.preventDefault());
    fireEvent.click(back);
    mounted.unmount();
    render(<SetupPage />);
    expect(await screen.findByLabelText("Monday minutes")).toHaveValue(90);
  });

  it("does not offer completion after a failed accept", async () => {
    state.planning.accept = vi.fn().mockResolvedValue(false);
    const mounted = render(<SetupPage />);
    fireEvent.change(await screen.findByLabelText("Monday minutes"), { target: { value: "90" } });
    await userEvent.click(screen.getByRole("button", { name: "Preview time changes" }));
    mounted.rerender(<SetupPage />);
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your choice could not be saved");
    expect(screen.queryByRole("link", { name: "Continue today's learning" })).not.toBeInTheDocument();
  });
});
