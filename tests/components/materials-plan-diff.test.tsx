import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PlanDiffReview } from "../../app/components/workspace/plan-diff-review";
import { planningWorkspaceSchema } from "../../app/contracts/planning";
import type { MaterialHistoryResponse } from "../../app/contracts/material-planning";
import { documentsClient } from "../../app/lib/documents-client";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { buildLearningPaths } from "../../app/lib/planning/path-builder";
import { buildPlanVersion } from "../../app/lib/planning/scheduler";
import { materialContextRequest } from "../helpers/material-planning";
function workspace() {
  const { audit, availability, target, planningDate } = materialContextRequest();
  const path = buildLearningPaths({ blueprint: flagshipBlueprint, registry: flagshipUnitRegistry, audit, availability, target, planningDate }).fullScope;
  const active = buildPlanVersion({ path, registry: flagshipUnitRegistry, availability, planningDate, generation: "initial", baseVersionId: null, replanReason: null, completedUnitIds: new Set() });
  const candidate = buildPlanVersion({ path, registry: flagshipUnitRegistry, availability, planningDate: "2026-11-05", generation: "proposed", baseVersionId: active.plan.id, replanReason: "delayed", completedUnitIds: new Set() });
  return planningWorkspaceSchema.parse({ id: "workspace-material-diff", goalId: "goal-material-diff", revision: 1, lastSequence: 0, audit, availability, availabilityVersions: [availability], target, pathVersions: [path], planVersions: [active.plan, candidate.plan], dailyUnits: [...active.dailyUnits, ...candidate.dailyUnits], events: [], activePathVersionId: path.id, activePlanVersionId: active.plan.id, pendingPlanVersionId: candidate.plan.id });
}
function history(planVersionId: string, message: string): MaterialHistoryResponse {
  return { plans: [{ planVersionId, contextVersionId: "context-material-diff", kind: "proposal", sourceAvailability: "available", explanations: [{ ruleId: "must-gap-first", changeKind: "reordered", skillId: null, unitIds: [], reasonItemIds: [], message, sourceAvailability: "available" }] }] };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("shows only the pending candidate's material explanation before a decision without mutating canonical workspace", async () => {
  const current = workspace(); const unchanged = JSON.stringify(current);
  const request = vi.spyOn(documentsClient, "request").mockResolvedValue({ plans: [
    ...history(current.activePlanVersionId, "Old generation explanation").plans,
    ...history(current.pendingPlanVersionId!, "必备技能缺口优先安排，仍保留前置依赖。").plans,
  ] });
  const accept = vi.fn(); const discard = vi.fn();
  render(<PlanDiffReview workspace={current} materialOwnerId="owner-a" onAccept={accept} onDiscard={discard} />);
  expect(await screen.findByText("必备技能缺口优先安排，仍保留前置依赖。")).toBeInTheDocument();
  expect(screen.queryByText("Old generation explanation")).not.toBeInTheDocument();
  expect(request).toHaveBeenCalledWith("readMaterialHistory", { goalId: current.goalId }, expect.any(AbortSignal));
  expect(accept).not.toHaveBeenCalled(); expect(discard).not.toHaveBeenCalled(); expect(JSON.stringify(current)).toBe(unchanged);
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
  expect(screen.getByText("接受新安排")).toBeEnabled(); expect(request).not.toHaveBeenCalled();
  view.rerender(<PlanDiffReview {...props} materialOwnerId="owner-a" />);
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(screen.queryByText("资料辅助规划依据")).not.toBeInTheDocument();
  expect(screen.getByText("接受新安排")).toBeEnabled();
});
