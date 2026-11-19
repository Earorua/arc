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
  it.each(["accept", "discard"] as const)("reports the explicit %s decision to its parent", async decision => {
    const onSuccess = vi.fn();
    render(<PlanDiffReview workspace={workspace()} onAccept={vi.fn().mockResolvedValue(true)} onDiscard={vi.fn().mockResolvedValue(true)} onSuccess={onSuccess} />);
    await userEvent.click(screen.getByRole("button", { name: decision === "accept" ? "Accept new schedule" : "Keep current schedule" }));
    expect(onSuccess).toHaveBeenCalledWith(expect.any(String), decision);
  });
  it("explains why an uncertain self-claim keeps learning and allows keeping the current arrangement", async () => {
    const current = workspace("uncertain");
    current.pendingPlanVersionId = null;
    const unit = current.dailyUnits.find(item => item.planVersionId === current.activePlanVersionId && item.required)!;
    const proposed = applyPlanningEvent({ workspace: current, blueprint: flagshipBlueprint, registry: flagshipUnitRegistry, event: { eventId: "event-uncertain", mutationId: "mutation-uncertain", sequence: 1, targetPlanVersionId: current.activePlanVersionId, occurredAt: "2026-08-14T08:00:00.000Z", kind: "already_known", unitId: unit.id, planningDate: "2026-08-14" } }).workspace;
    const onDiscard = vi.fn().mockResolvedValue(true);
    render(<PlanDiffReview workspace={proposed} onAccept={vi.fn()} onDiscard={onDiscard} />);
    expect(screen.getByText(/You rated this skill Unsure/)).toHaveTextContent(/this self-assessment keeps its learning tasks/);
    expect(screen.getByText(/You rated this skill Unsure/)).toHaveTextContent(/delay the task or adjust your study time/);
    await userEvent.click(screen.getByRole("button", { name: "Keep current schedule" }));
    expect(onDiscard).toHaveBeenCalledWith(proposed.pendingPlanVersionId);
    expect(await screen.findByRole("status")).toHaveTextContent("Current schedule kept");
  });

  it("folds the detailed diff and requires an explicit decision after reading effects", async () => {
    const onAccept = vi.fn();
    const onDiscard = vi.fn();
    render(<PlanDiffReview workspace={workspace()} onAccept={onAccept} onDiscard={onDiscard} />);
    const disclosure = screen.getByText("View individual changes").closest("details")!;
    expect(disclosure.open).toBe(false);
    await userEvent.click(screen.getByText("View individual changes"));
    expect(disclosure.open).toBe(true);
    expect(onAccept).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Accept new schedule" })).toBeEnabled();
  });
  it("focuses review and exposes counts, every row, dates, reasons, and completion change", async () => {
    const current = workspace();
    const active = current.planVersions.find(({ id }) => id === current.activePlanVersionId)!;
    const firstUnitId = active.days.find(({ primaryUnitId }) => primaryUnitId !== null)!.primaryUnitId!;
    const firstUnit = current.dailyUnits.find(({ id, planVersionId }) => id === firstUnitId && planVersionId === active.id)!;
    const firstTemplate = flagshipUnitRegistry.tracks.flatMap(({ templates }) => templates).find(({ id }) => id === firstUnit.templateId)!;
    render(<PlanDiffReview workspace={current} onAccept={vi.fn()} onDiscard={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "What will change" })).toHaveFocus());
    const counts = screen.getByText("Rescheduled", { selector: "dt" }).parentElement!;
    expect(within(counts).getByRole("definition")).not.toHaveTextContent("0");
    expect(screen.getByText(/Current estimated finish/)).toBeInTheDocument();
    expect(screen.getByText(/Proposed estimated finish/)).toBeInTheDocument();
    expect(screen.getAllByText(/Moved from/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(firstTemplate.title).length).toBeGreaterThan(0);
    expect(screen.queryByText(new RegExp(firstUnitId))).not.toBeInTheDocument();
  });

  it("blocks double decisions, announces success, and maps conflict without automatic retry", async () => {
    const user = userEvent.setup();
    let resolve!: (value: boolean) => void;
    const onAccept = vi.fn(() => new Promise<boolean>((done) => { resolve = done; }));
    const view = render(<PlanDiffReview workspace={workspace()} onAccept={onAccept} onDiscard={vi.fn()} />);
    const accept = screen.getByRole("button", { name: "Accept new schedule" });
    await user.click(accept); await user.click(accept);
    expect(onAccept).toHaveBeenCalledTimes(1); expect(accept).toBeDisabled();
    resolve(true);
    expect(await screen.findByRole("status")).toHaveTextContent("New schedule accepted");
    view.rerender(<PlanDiffReview workspace={workspace()} recovery="conflict" onAccept={vi.fn().mockResolvedValue(false)} onDiscard={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Accept new schedule" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your plan changed on another device. Refresh before making a decision.");
  });

  it("contains a rejected decision and restores both decision controls", async () => {
    const user = userEvent.setup();
    const onDiscard = vi.fn()
      .mockRejectedValueOnce(new Error("private repository detail"))
      .mockResolvedValueOnce(true);
    const current = workspace();
    const candidateId = current.pendingPlanVersionId!;
    render(<PlanDiffReview workspace={current} onAccept={vi.fn()} onDiscard={onDiscard} />);
    const keep = screen.getByRole("button", { name: "Keep current schedule" });

    await user.click(keep);

    expect(await screen.findByRole("alert")).toHaveTextContent("Your choice could not be saved");
    expect(screen.getByRole("alert")).not.toHaveTextContent("private repository detail");
    expect(keep).toBeEnabled();
    expect(screen.getByRole("button", { name: "Accept new schedule" })).toBeEnabled();

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

    expect(screen.getByRole("alert")).toHaveTextContent("This plan is temporarily unavailable");
    expect(screen.getByRole("alert")).toHaveTextContent("Your plan and learning history are preserved");
    expect(screen.getByRole("alert")).toHaveTextContent("This version cannot be converted automatically yet");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept new schedule" })).not.toBeInTheDocument();
  });
});
