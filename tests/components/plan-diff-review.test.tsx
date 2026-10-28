import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanDiffReview } from "../../app/components/workspace/plan-diff-review";
import { PLANNING_SCHEMA_VERSION, planningWorkspaceSchema, type SkillSelfLevel } from "../../app/contracts/planning";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { buildLearningPaths } from "../../app/lib/planning/path-builder";
import { buildPlanVersion } from "../../app/lib/planning/scheduler";

import { applyPlanningEvent } from "../../app/lib/planning/event-reducer";

function workspace(level: SkillSelfLevel = "unseen") {
  const audit = { id: "audit-diff", schemaVersion: PLANNING_SCHEMA_VERSION, blueprintId: flagshipBlueprint.id, blueprintVersion: flagshipBlueprint.version, answers: flagshipBlueprint.skills.map(({ id }) => ({ skillId: id, level, evidenceRefs: [] })), evidence: [], createdBy: "learner", inputFingerprint: "audit-diff-fingerprint" };
  const availability = { id: "availability-diff", schemaVersion: PLANNING_SCHEMA_VERSION, timeZone: "UTC", weekdays: { monday: 60, tuesday: 60, wednesday: 60, thursday: 60, friday: 60, saturday: 60, sunday: 60 }, exceptions: [], weeklyMinutes: 420, inputFingerprint: "availability-diff-fingerprint" };
  const target = { id: "target-diff", schemaVersion: PLANNING_SCHEMA_VERSION, targetWeeks: 18, inputFingerprint: "target-diff-fingerprint" };
  const path = buildLearningPaths({ blueprint: flagshipBlueprint, registry: flagshipUnitRegistry, audit, availability, target, planningDate: "2026-08-14" }).fullScope;
  const active = buildPlanVersion({ path, registry: flagshipUnitRegistry, availability, planningDate: "2026-08-14", generation: "initial", baseVersionId: null, replanReason: null, completedUnitIds: new Set() });
  const candidate = buildPlanVersion({ path, registry: flagshipUnitRegistry, availability, planningDate: "2026-08-15", generation: "proposed", baseVersionId: active.plan.id, replanReason: "delayed", completedUnitIds: new Set() });
  return planningWorkspaceSchema.parse({ id: "workspace-diff", goalId: "goal-diff", revision: 1, lastSequence: 0, audit, availability, availabilityVersions: [availability], target, pathVersions: [path], planVersions: [active.plan, candidate.plan], dailyUnits: [...active.dailyUnits, ...candidate.dailyUnits], events: [], activePathVersionId: path.id, activePlanVersionId: active.plan.id, pendingPlanVersionId: candidate.plan.id });
}

afterEach(cleanup);
describe("PlanDiffReview", () => {
  it("explains why an uncertain self-claim keeps learning and allows keeping the current arrangement", async () => {
    const current = workspace("uncertain");
    current.pendingPlanVersionId = null;
    const unit = current.dailyUnits.find(item => item.planVersionId === current.activePlanVersionId && item.required)!;
    const proposed = applyPlanningEvent({ workspace: current, blueprint: flagshipBlueprint, registry: flagshipUnitRegistry, event: { eventId: "event-uncertain", mutationId: "mutation-uncertain", sequence: 1, targetPlanVersionId: current.activePlanVersionId, occurredAt: "2026-08-14T08:00:00.000Z", kind: "already_known", unitId: unit.id, planningDate: "2026-08-14" } }).workspace;
    const onDiscard = vi.fn().mockResolvedValue(true);
    render(<PlanDiffReview workspace={proposed} onAccept={vi.fn()} onDiscard={onDiscard} />);
    expect(screen.getByText(/这项技能的自评是“不确定”/)).toHaveTextContent(/本次自评不会移除学习任务/);
    expect(screen.getByText(/这项技能的自评是“不确定”/)).toHaveTextContent(/延后任务或调整学习时间/);
    await userEvent.click(screen.getByRole("button", { name: "保留当前安排" }));
    expect(onDiscard).toHaveBeenCalledWith(proposed.pendingPlanVersionId);
    expect(await screen.findByRole("status")).toHaveTextContent("已保留当前安排");
  });

  it("folds the detailed diff and requires an explicit decision after reading effects", async () => {
    const onAccept = vi.fn();
    const onDiscard = vi.fn();
    render(<PlanDiffReview workspace={workspace()} onAccept={onAccept} onDiscard={onDiscard} />);
    const disclosure = screen.getByText("查看逐项变化").closest("details")!;
    expect(disclosure.open).toBe(false);
    await userEvent.click(screen.getByText("查看逐项变化"));
    expect(disclosure.open).toBe(true);
    expect(onAccept).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "接受新安排" })).toBeEnabled();
  });
  it("focuses review and exposes counts, every row, dates, reasons, and completion change", async () => {
    const current = workspace();
    const active = current.planVersions.find(({ id }) => id === current.activePlanVersionId)!;
    const firstUnitId = active.days.find(({ primaryUnitId }) => primaryUnitId !== null)!.primaryUnitId!;
    const firstUnit = current.dailyUnits.find(({ id, planVersionId }) => id === firstUnitId && planVersionId === active.id)!;
    const firstTemplate = flagshipUnitRegistry.tracks.flatMap(({ templates }) => templates).find(({ id }) => id === firstUnit.templateId)!;
    render(<PlanDiffReview workspace={current} onAccept={vi.fn()} onDiscard={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "这次调整会改变什么" })).toHaveFocus());
    const counts = screen.getByText("调整日期", { selector: "dt" }).parentElement!;
    expect(within(counts).getByRole("definition")).not.toHaveTextContent("0");
    expect(screen.getByText(/当前预计完成/)).toBeInTheDocument();
    expect(screen.getByText(/调整后预计完成/)).toBeInTheDocument();
    expect(screen.getAllByText(/Moved from/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(firstTemplate.title).length).toBeGreaterThan(0);
    expect(screen.queryByText(new RegExp(firstUnitId))).not.toBeInTheDocument();
  });

  it("blocks double decisions, announces success, and maps conflict without automatic retry", async () => {
    const user = userEvent.setup();
    let resolve!: (value: boolean) => void;
    const onAccept = vi.fn(() => new Promise<boolean>((done) => { resolve = done; }));
    const view = render(<PlanDiffReview workspace={workspace()} onAccept={onAccept} onDiscard={vi.fn()} />);
    const accept = screen.getByRole("button", { name: "接受新安排" });
    await user.click(accept); await user.click(accept);
    expect(onAccept).toHaveBeenCalledTimes(1); expect(accept).toBeDisabled();
    resolve(true);
    expect(await screen.findByRole("status")).toHaveTextContent("已接受");
    view.rerender(<PlanDiffReview workspace={workspace()} recovery="conflict" onAccept={vi.fn().mockResolvedValue(false)} onDiscard={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "接受新安排" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("计划已在另一台设备上发生变化，请刷新后再决定。");
  });

  it("contains a rejected decision and restores both decision controls", async () => {
    const user = userEvent.setup();
    const onDiscard = vi.fn()
      .mockRejectedValueOnce(new Error("private repository detail"))
      .mockResolvedValueOnce(true);
    const current = workspace();
    const candidateId = current.pendingPlanVersionId!;
    render(<PlanDiffReview workspace={current} onAccept={vi.fn()} onDiscard={onDiscard} />);
    const keep = screen.getByRole("button", { name: "保留当前安排" });

    await user.click(keep);

    expect(await screen.findByRole("alert")).toHaveTextContent("暂时无法保存这个决定");
    expect(screen.getByRole("alert")).not.toHaveTextContent("private repository detail");
    expect(keep).toBeEnabled();
    expect(screen.getByRole("button", { name: "接受新安排" })).toBeEnabled();

    await user.click(keep);
    expect(onDiscard).toHaveBeenLastCalledWith(candidateId);
    expect(onDiscard).toHaveBeenCalledTimes(2);
  });

  it("keeps unavailable pending history unchanged without offering a dead rebuild action", () => {
    const current = workspace();
    const activePath = current.pathVersions.find(({ id }) => id === current.activePathVersionId)!;
    const candidate = current.planVersions.find(({ id }) => id === current.pendingPlanVersionId)!;
    const unavailablePath = {
      ...activePath,
      id: "path-diff-unavailable",
      registryVersion: "2026.99.1",
      inputFingerprint: "path-diff-unavailable-fingerprint",
    };
    const unavailable = planningWorkspaceSchema.parse({
      ...current,
      pathVersions: [activePath, unavailablePath],
      planVersions: current.planVersions.map((plan) => plan.id === candidate.id ? { ...plan, pathVersionId: unavailablePath.id } : plan),
    });

    render(<PlanDiffReview workspace={unavailable} onAccept={vi.fn()} onDiscard={vi.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent("暂时无法读取这个计划");
    expect(screen.getByRole("alert")).toHaveTextContent("原有计划与学习记录已保留");
    expect(screen.getByRole("alert")).toHaveTextContent("当前暂不支持自动转换这个版本");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "接受新安排" })).not.toBeInTheDocument();
  });
});
