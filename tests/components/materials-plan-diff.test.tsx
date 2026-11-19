import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PlanDiffReview } from "../../app/components/workspace/plan-diff-review";
import { MaterialHistory } from "../../app/components/materials/material-history";
import { planningWorkspaceSchema } from "../../app/contracts/planning";
import type { MaterialHistoryResponse } from "../../app/contracts/material-planning";
import { DocumentClientError, documentsClient } from "../../app/lib/documents-client";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { buildLearningPaths } from "../../app/lib/planning/path-builder";
import { buildPlanVersion } from "../../app/lib/planning/scheduler";
import { applyPlanningEvent } from "../../app/lib/planning/event-reducer";
import { materialContextRequest } from "../helpers/material-planning";
function workspace() {
  const { audit, availability, target, planningDate } = materialContextRequest();
  const path = buildLearningPaths({ blueprint: flagshipBlueprint, registry: flagshipUnitRegistry, audit, availability, target, planningDate }).fullScope;
  const active = buildPlanVersion({ path, registry: flagshipUnitRegistry, availability, planningDate, generation: "initial", baseVersionId: null, replanReason: null, completedUnitIds: new Set() });
  const candidate = buildPlanVersion({ path, registry: flagshipUnitRegistry, availability, planningDate: "2026-11-05", generation: "proposed", baseVersionId: active.plan.id, replanReason: "delayed", completedUnitIds: new Set() });
  return planningWorkspaceSchema.parse({ id: "workspace-material-diff", goalId: "goal-material-diff", revision: 1, lastSequence: 0, audit, availability, availabilityVersions: [availability], target, pathVersions: [path], planVersions: [active.plan, candidate.plan], dailyUnits: [...active.dailyUnits, ...candidate.dailyUnits], events: [], activePathVersionId: path.id, activePlanVersionId: active.plan.id, pendingPlanVersionId: candidate.plan.id });
}
function materialProposal({ material = true, reorderAfterWeek = false, planningDate }: { material?: boolean; reorderAfterWeek?: boolean; planningDate?: string } = {}) {
  const current = workspace();
  const active = current.planVersions.find(plan => plan.id === current.activePlanVersionId)!;
  const activePath = current.pathVersions.find(path => path.id === active.pathVersionId)!;
  const initial = planningWorkspaceSchema.parse({ ...current, planVersions: [active],
    dailyUnits: current.dailyUnits.filter(unit => unit.planVersionId === active.id), pendingPlanVersionId: null });
  const unitOrder = activePath.units.map(unit => unit.id);
  if (reorderAfterWeek) {
    const lastScheduledIndex = Math.max(...active.dailyUnitIds.map(id => unitOrder.indexOf(id)));
    const index = activePath.units.findIndex((unit, index) => index > lastScheduledIndex + 1
      && !unit.prerequisiteUnitIds.includes(unitOrder[index - 1]!));
    if (index < 0) throw new Error("Fixture needs two independent adjacent units after the displayed week.");
    [unitOrder[index - 1], unitOrder[index]] = [unitOrder[index]!, unitOrder[index - 1]!];
  }
  const transition = applyPlanningEvent({ workspace: initial, blueprint: flagshipBlueprint, registry: flagshipUnitRegistry,
    event: { kind: "agent_replanned", baseRevision: initial.revision, unitOrder, planningDate: planningDate ?? active.planningDate,
      eventId: "event-material-diff", mutationId: "mutation-material-diff", sequence: 1,
      targetPlanVersionId: active.id, occurredAt: "2026-11-04T08:00:00.000Z",
      ...(material ? { materialContextFingerprint: "a".repeat(64) } : {}) } });
  if (transition.kind !== "proposed") throw new Error("Expected a pending proposal.");
  const candidate = transition.workspace.planVersions.find(plan => plan.id === transition.workspace.pendingPlanVersionId)!;
  const candidatePath = transition.workspace.pathVersions.find(path => path.id === candidate.pathVersionId)!;
  const publicWorkspace = planningWorkspaceSchema.parse({ ...transition.workspace, events: transition.workspace.events.map(event => {
    if (event.kind !== "agent_replanned") return event;
    const visible = { ...event };
    delete visible.materialContextFingerprint;
    return { ...visible, ...(material ? { materialProposal: true } : {}) };
  }) });
  return { current: publicWorkspace, active, activePath, candidate, candidatePath, diff: transition.diff };
}
function history(planVersionId: string, message: string): MaterialHistoryResponse {
  return { plans: [{ planVersionId, contextVersionId: "context-material-diff", kind: "proposal", sourceAvailability: "available", explanations: [{ ruleId: "must-gap-first", changeKind: "reordered", skillId: null, unitIds: [], reasonItemIds: [], message, sourceAvailability: "available" }] }] };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const contextOnlyExplanation = "Tasks and dates stay the same. Accepting updates the materials and learning focus used by the current path.";

it("explains a public context-only proposal without reading private history or saving it", () => {
  const { current, active, activePath, candidate, candidatePath, diff } = materialProposal();
  expect(candidatePath.units).toEqual(activePath.units);
  expect(candidate.days).toEqual(active.days);
  expect(candidate.estimatedCompletionDate).toBe(active.estimatedCompletionDate);
  expect(diff.items.every(item => item.change === "unchanged")).toBe(true);
  const before = JSON.stringify(current);
  const request = vi.spyOn(documentsClient, "request");
  const onAccept = vi.fn(); const onDiscard = vi.fn();
  render(<PlanDiffReview workspace={current} onAccept={onAccept} onDiscard={onDiscard} />);
  expect(screen.getByText(contextOnlyExplanation)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Accept material update" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Keep current materials and schedule" })).toBeEnabled();
  expect(request).not.toHaveBeenCalled();
  expect(onAccept).not.toHaveBeenCalled(); expect(onDiscard).not.toHaveBeenCalled();
  expect(JSON.stringify(current)).toBe(before);
});

it("does not use a private fingerprint as the public material proposal indicator", () => {
  const { current } = materialProposal({ material: false });
  const privateOnly = { ...current, events: current.events.map(event => event.kind === "agent_replanned"
    ? { ...event, materialContextFingerprint: "a".repeat(64) } : event) };
  render(<PlanDiffReview workspace={privateOnly} onAccept={vi.fn()} onDiscard={vi.fn()} />);
  expect(screen.queryByText(contextOnlyExplanation)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Accept new schedule" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Keep current schedule" })).toBeEnabled();
});

it.each(["accept", "discard"] as const)("saves a context-only proposal only on explicit %s using the current candidate ID", async decision => {
  const { current, candidate } = materialProposal();
  const onAccept = vi.fn().mockResolvedValue(true); const onDiscard = vi.fn().mockResolvedValue(true);
  render(<PlanDiffReview workspace={current} onAccept={onAccept} onDiscard={onDiscard} />);
  expect(onAccept).not.toHaveBeenCalled(); expect(onDiscard).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: decision === "accept" ? "Accept material update" : "Keep current materials and schedule" }));
  expect(decision === "accept" ? onAccept : onDiscard).toHaveBeenCalledExactlyOnceWith(candidate.id);
  expect(decision === "accept" ? onDiscard : onAccept).not.toHaveBeenCalled();
  expect(await screen.findByRole("status")).toHaveTextContent(decision === "accept" ? "Materials used by the current path updated." : "Current materials and schedule kept.");
});

it("honors an explicit accept label and reports the materials update to the parent", async () => {
  const { current, candidate } = materialProposal();
  const onAccept = vi.fn().mockResolvedValue(true); const onSuccess = vi.fn();
  render(<PlanDiffReview workspace={current} acceptLabel="保存调整" onAccept={onAccept} onDiscard={vi.fn()} onSuccess={onSuccess} />);
  expect(screen.getByText(contextOnlyExplanation)).toBeInTheDocument();
  expect(screen.getByText(/They take effect only after you select 保存调整/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Accept material update" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "保存调整" }));
  expect(onAccept).toHaveBeenCalledExactlyOnceWith(candidate.id);
  expect(onSuccess).toHaveBeenCalledExactlyOnceWith("Materials used by the current path updated.", "accept");
});

it.each(["accept", "discard"] as const)("disables both context-only actions while %s is pending and lets a failed decision be retried", async decision => {
  const { current, candidate } = materialProposal();
  let finish!: (saved: boolean) => void;
  let reject!: (error: Error) => void;
  const onDecision = vi.fn().mockImplementationOnce(() => new Promise<boolean>((resolve, fail) => { finish = resolve; reject = fail; })).mockResolvedValueOnce(true);
  const otherDecision = vi.fn();
  render(<PlanDiffReview workspace={current} onAccept={decision === "accept" ? onDecision : otherDecision} onDiscard={decision === "discard" ? onDecision : otherDecision} />);
  const accept = screen.getByRole("button", { name: "Accept material update" });
  const discard = screen.getByRole("button", { name: "Keep current materials and schedule" });
  const button = decision === "accept" ? accept : discard;
  await userEvent.click(button); await userEvent.click(button);
  expect(accept).toBeDisabled(); expect(discard).toBeDisabled();
  expect(onDecision).toHaveBeenCalledExactlyOnceWith(candidate.id);
  await act(async () => { if (decision === "accept") finish(false); else reject(new Error("private repository detail")); });
  expect(await screen.findByRole("alert")).toHaveTextContent("Your choice could not be saved. Try again when your connection is restored.");
  expect(screen.getByRole("alert")).not.toHaveTextContent("private repository detail");
  expect(accept).toBeEnabled(); expect(discard).toBeEnabled();
  expect(onDecision).toHaveBeenCalledTimes(1); expect(otherDecision).not.toHaveBeenCalled();
  await userEvent.click(button);
  expect(onDecision).toHaveBeenCalledTimes(2); expect(onDecision).toHaveBeenLastCalledWith(candidate.id);
  expect(await screen.findByRole("status")).toHaveTextContent(decision === "accept" ? "Materials used by the current path updated." : "Current materials and schedule kept.");
});

it("keeps an ordinary no-change agent proposal generic even when material history arrives", async () => {
  const { current, active, candidate, diff } = materialProposal({ material: false });
  expect(candidate.days).toEqual(active.days);
  expect(diff.items.every(item => item.change === "unchanged")).toBe(true);
  vi.spyOn(documentsClient, "request").mockResolvedValue(history(candidate.id, "历史资料依据"));
  render(<PlanDiffReview workspace={current} materialOwnerId="owner-a" onAccept={vi.fn()} onDiscard={vi.fn()} />);
  expect(await screen.findByText("历史资料依据")).toBeInTheDocument();
  expect(screen.queryByText(contextOnlyExplanation)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Accept new schedule" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Keep current schedule" })).toBeEnabled();
});

it.each(["outside-week", "next-day"] as const)("keeps a material proposal with %s task changes generic", change => {
  const { current, active, activePath, candidate, candidatePath, diff } = materialProposal(change === "outside-week"
    ? { reorderAfterWeek: true } : { planningDate: "2026-11-05" });
  if (change === "outside-week") {
    expect(candidatePath.units).not.toEqual(activePath.units);
    expect(candidate.days).toEqual(active.days);
    expect(candidate.estimatedCompletionDate).toBe(active.estimatedCompletionDate);
    expect(diff.items.every(item => item.change === "unchanged")).toBe(true);
  } else expect(diff.items.some(item => item.change !== "unchanged")).toBe(true);
  render(<PlanDiffReview workspace={current} onAccept={vi.fn()} onDiscard={vi.fn()} />);
  expect(screen.queryByText(contextOnlyExplanation)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Accept new schedule" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Keep current schedule" })).toBeEnabled();
});

it("shows only the pending candidate's material explanation before a decision without mutating canonical workspace", async () => {
  const { current } = materialProposal(); const unchanged = JSON.stringify(current);
  let finish!: (value: MaterialHistoryResponse) => void;
  const pending = new Promise<MaterialHistoryResponse>(resolve => { finish = resolve; });
  const request = vi.spyOn(documentsClient, "request").mockReturnValue(pending as ReturnType<typeof documentsClient.request>);
  const accept = vi.fn(); const discard = vi.fn();
  render(<PlanDiffReview workspace={current} materialOwnerId="owner-a" onAccept={accept} onDiscard={discard} />);
  expect(screen.getByText(contextOnlyExplanation)).toBeInTheDocument();
  expect(accept).not.toHaveBeenCalled(); expect(discard).not.toHaveBeenCalled();
  await act(async () => { finish({ plans: [
    ...history(current.activePlanVersionId, "Old generation explanation").plans,
    ...history(current.pendingPlanVersionId!, "必备技能缺口优先安排，仍保留前置依赖。").plans,
  ] }); await pending; });
  expect(await screen.findByText("必备技能缺口优先安排，仍保留前置依赖。")).toBeInTheDocument();
  expect(screen.getByText(contextOnlyExplanation)).toBeInTheDocument();
  expect(screen.queryByText("Old generation explanation")).not.toBeInTheDocument();
  expect(request).toHaveBeenCalledWith("readMaterialHistory", { goalId: current.goalId, includeProposalState: "current" }, expect.any(AbortSignal));
  expect(accept).not.toHaveBeenCalled(); expect(discard).not.toHaveBeenCalled(); expect(JSON.stringify(current)).toBe(unchanged);
});
it("shows generation, discarded and accepted as three distinct history entries", async () => {
  const row = history("plan", "原因").plans[0]!;
  vi.spyOn(documentsClient, "request").mockResolvedValue({ plans: [
    { ...row, kind: "generation", planVersionId: "initial" },
    { ...row, planVersionId: "first", proposalState: "discarded" },
    { ...row, kind: "accepted", planVersionId: "second" },
  ] });
  const view = render(<MaterialHistory ownerId="owner-a" goalId="archived-goal" />);
  expect(await screen.findByText("Discarded changes")).toBeInTheDocument();
  expect(screen.getByText("Accepted changes")).toBeInTheDocument();
  expect(screen.queryByText("Changes awaiting confirmation")).not.toBeInTheDocument();
  expect(view.container.querySelectorAll("summary")).toHaveLength(3);
});
it("reads an older server without the option and does not mistake an undated proposal for a pending one", async () => {
  const row = history("first", "原因").plans[0]!;
  const request = vi.spyOn(documentsClient, "request").mockRejectedValueOnce(new DocumentClientError("invalid-request", 400))
    .mockResolvedValue({ plans: [row, { ...row, kind: "accepted" }, { ...row, planVersionId: "second" }] });
  const view = render(<MaterialHistory ownerId="owner-a" goalId="old-goal" />);
  expect(await screen.findByText("Accepted changes")).toBeInTheDocument();
  expect(screen.getByText("Historical proposal (outcome not recorded)")).toBeInTheDocument();
  expect(view.container.querySelectorAll("summary")).toHaveLength(2);
  expect(request).toHaveBeenNthCalledWith(2, "readMaterialHistory", { goalId: "old-goal" }, expect.any(AbortSignal));
});
it("aborts and discards an earlier owner's delayed material history across A→B→A", async () => {
  const current = workspace(); let finish!: (value: MaterialHistoryResponse) => void;
  const pending = new Promise<MaterialHistoryResponse>(resolve => { finish = resolve; });
  const request = vi.spyOn(documentsClient, "request").mockImplementationOnce(() => pending as ReturnType<typeof documentsClient.request>).mockResolvedValue({ plans: [] });
  const props = { workspace: current, onAccept: vi.fn(), onDiscard: vi.fn() };
  const view = render(<PlanDiffReview {...props} materialOwnerId="owner-a" />);
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  const firstSignal = request.mock.calls[0]![2]!;
  view.rerender(<PlanDiffReview {...props} materialOwnerId="owner-b" />);
  expect(firstSignal.aborted).toBe(true);
  view.rerender(<PlanDiffReview {...props} materialOwnerId="owner-a" />);
  await act(async () => { finish(history(current.pendingPlanVersionId!, "STALE-OWNER-EXPLANATION")); await pending; });
  expect(screen.queryByText("STALE-OWNER-EXPLANATION")).not.toBeInTheDocument();
  expect(request).toHaveBeenCalledTimes(3);
});
it("keeps existing non-material comparisons unchanged and reads no private history without a cloud owner", async () => {
  const request = vi.spyOn(documentsClient, "request").mockResolvedValue({ plans: [] });
  const current = workspace(); const props = { workspace: current, onAccept: vi.fn(), onDiscard: vi.fn() };
  const view = render(<PlanDiffReview {...props} />);
  expect(screen.getByText("Accept new schedule")).toBeEnabled(); expect(request).not.toHaveBeenCalled();
  view.rerender(<PlanDiffReview {...props} materialOwnerId="owner-a" />);
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(screen.queryByText("Material planning evidence")).not.toBeInTheDocument();
  expect(screen.getByText("Accept new schedule")).toBeEnabled();
});
