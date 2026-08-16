import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanDiffReview } from "../../app/components/workspace/plan-diff-review";
import { PLANNING_SCHEMA_VERSION, planningWorkspaceSchema } from "../../app/contracts/planning";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { buildLearningPaths } from "../../app/lib/planning/path-builder";
import { buildPlanVersion } from "../../app/lib/planning/scheduler";

function workspace() {
  const audit = { id: "audit-diff", schemaVersion: PLANNING_SCHEMA_VERSION, blueprintId: flagshipBlueprint.id, blueprintVersion: flagshipBlueprint.version, answers: flagshipBlueprint.skills.map(({ id }) => ({ skillId: id, level: "unseen" as const, evidenceRefs: [] })), evidence: [], createdBy: "learner", inputFingerprint: "audit-diff-fingerprint" };
  const availability = { id: "availability-diff", schemaVersion: PLANNING_SCHEMA_VERSION, timeZone: "UTC", weekdays: { monday: 60, tuesday: 60, wednesday: 60, thursday: 60, friday: 60, saturday: 60, sunday: 60 }, exceptions: [], weeklyMinutes: 420, inputFingerprint: "availability-diff-fingerprint" };
  const target = { id: "target-diff", schemaVersion: PLANNING_SCHEMA_VERSION, targetWeeks: 18, inputFingerprint: "target-diff-fingerprint" };
  const path = buildLearningPaths({ blueprint: flagshipBlueprint, registry: flagshipUnitRegistry, audit, availability, target, planningDate: "2026-08-14" }).fullScope;
  const active = buildPlanVersion({ path, registry: flagshipUnitRegistry, availability, planningDate: "2026-08-14", generation: "initial", baseVersionId: null, replanReason: null, completedUnitIds: new Set() });
  const candidate = buildPlanVersion({ path, registry: flagshipUnitRegistry, availability, planningDate: "2026-08-15", generation: "proposed", baseVersionId: active.plan.id, replanReason: "delayed", completedUnitIds: new Set() });
  return planningWorkspaceSchema.parse({ id: "workspace-diff", goalId: "goal-diff", revision: 1, lastSequence: 0, audit, availability, availabilityVersions: [availability], target, pathVersions: [path], planVersions: [active.plan, candidate.plan], dailyUnits: [...active.dailyUnits, ...candidate.dailyUnits], events: [], activePathVersionId: path.id, activePlanVersionId: active.plan.id, pendingPlanVersionId: candidate.plan.id });
}

afterEach(cleanup);
describe("PlanDiffReview", () => {
  it("focuses review and exposes counts, every row, dates, reasons, and completion change", async () => {
    const current = workspace();
    const active = current.planVersions.find(({ id }) => id === current.activePlanVersionId)!;
    const firstUnitId = active.days.find(({ primaryUnitId }) => primaryUnitId !== null)!.primaryUnitId!;
    const firstUnit = current.dailyUnits.find(({ id, planVersionId }) => id === firstUnitId && planVersionId === active.id)!;
    const firstTemplate = flagshipUnitRegistry.tracks.flatMap(({ templates }) => templates).find(({ id }) => id === firstUnit.templateId)!;
    render(<PlanDiffReview workspace={current} onAccept={vi.fn()} onDiscard={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Review every change." })).toHaveFocus());
    const counts = screen.getByText("moved", { selector: "dt" }).parentElement!;
    expect(within(counts).getByRole("definition")).not.toHaveTextContent("0");
    expect(screen.getByText(/Current completion/)).toBeInTheDocument();
    expect(screen.getByText(/Candidate completion/)).toBeInTheDocument();
    expect(screen.getAllByText(/Moved from/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(firstTemplate.title).length).toBeGreaterThan(0);
    expect(screen.queryByText(new RegExp(firstUnitId))).not.toBeInTheDocument();
  });

  it("blocks double decisions, announces success, and maps conflict without automatic retry", async () => {
    const user = userEvent.setup();
    let resolve!: (value: boolean) => void;
    const onAccept = vi.fn(() => new Promise<boolean>((done) => { resolve = done; }));
    const view = render(<PlanDiffReview workspace={workspace()} onAccept={onAccept} onDiscard={vi.fn()} />);
    const accept = screen.getByRole("button", { name: "Accept new plan" });
    await user.click(accept); await user.click(accept);
    expect(onAccept).toHaveBeenCalledTimes(1); expect(accept).toBeDisabled();
    resolve(true);
    expect(await screen.findByRole("status")).toHaveTextContent("accepted");
    view.rerender(<PlanDiffReview workspace={workspace()} recovery="conflict" onAccept={vi.fn().mockResolvedValue(false)} onDiscard={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Accept new plan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This plan changed on another device. Refresh before deciding.");
  });

  it("contains a rejected decision and restores both decision controls", async () => {
    const user = userEvent.setup();
    const onDiscard = vi.fn()
      .mockRejectedValueOnce(new Error("private repository detail"))
      .mockResolvedValueOnce(true);
    const current = workspace();
    const candidateId = current.pendingPlanVersionId!;
    render(<PlanDiffReview workspace={current} onAccept={vi.fn()} onDiscard={onDiscard} />);
    const keep = screen.getByRole("button", { name: "Keep current plan" });

    await user.click(keep);

    expect(await screen.findByRole("alert")).toHaveTextContent("Arc could not save this decision");
    expect(screen.getByRole("alert")).not.toHaveTextContent("private repository detail");
    expect(keep).toBeEnabled();
    expect(screen.getByRole("button", { name: "Accept new plan" })).toBeEnabled();

    await user.click(keep);
    expect(onDiscard).toHaveBeenLastCalledWith(candidateId);
    expect(onDiscard).toHaveBeenCalledTimes(2);
  });

  it("shows rebuild recovery when the pending path catalogue version is unavailable", () => {
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

    expect(screen.getByRole("alert")).toHaveTextContent("Plan version unavailable. Rebuild it from Setup.");
    expect(screen.getByRole("link", { name: "Setup" })).toHaveAttribute("href", "/setup");
    expect(screen.queryByRole("button", { name: "Accept new plan" })).not.toBeInTheDocument();
  });
});
