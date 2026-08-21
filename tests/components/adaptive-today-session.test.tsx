import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdaptiveTodaySession } from "../../app/components/today/adaptive-today-session";
import { PLANNING_SCHEMA_VERSION, planningWorkspaceSchema } from "../../app/contracts/planning";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { buildLearningPaths } from "../../app/lib/planning/path-builder";
import { buildPlanVersion } from "../../app/lib/planning/scheduler";

function workspace() {
  const audit = { id: "audit-today", schemaVersion: PLANNING_SCHEMA_VERSION, blueprintId: flagshipBlueprint.id, blueprintVersion: flagshipBlueprint.version, answers: flagshipBlueprint.skills.map(({ id }) => ({ skillId: id, level: "unseen" as const, evidenceRefs: [] })), evidence: [], createdBy: "learner", inputFingerprint: "audit-today-fingerprint" };
  const availability = { id: "availability-today", schemaVersion: PLANNING_SCHEMA_VERSION, timeZone: "UTC", weekdays: { monday: 180, tuesday: 180, wednesday: 180, thursday: 180, friday: 180, saturday: 180, sunday: 180 }, exceptions: [], weeklyMinutes: 1260, inputFingerprint: "availability-today-fingerprint" };
  const target = { id: "target-today", schemaVersion: PLANNING_SCHEMA_VERSION, targetWeeks: 18, inputFingerprint: "target-today-fingerprint" };
  const path = buildLearningPaths({ blueprint: flagshipBlueprint, registry: flagshipUnitRegistry, audit, availability, target, planningDate: "2026-08-14" }).fullScope;
  const built = buildPlanVersion({ path, registry: flagshipUnitRegistry, availability, planningDate: "2026-08-14", generation: "initial", baseVersionId: null, replanReason: null, completedUnitIds: new Set() });
  return planningWorkspaceSchema.parse({ id: "workspace-today", goalId: "goal-today", revision: 0, lastSequence: 0, audit, availability, availabilityVersions: [availability], target, pathVersions: [path], planVersions: [built.plan], dailyUnits: built.dailyUnits, events: [], activePathVersionId: path.id, activePlanVersionId: built.plan.id, pendingPlanVersionId: null });
}

const fixedNow = () => new Date("2026-08-14T10:00:00.000Z");

afterEach(cleanup);
describe("AdaptiveTodaySession", () => {
  it("renders one complete primary brief, exact source attributes, and at most one optional stretch", () => {
    render(<AdaptiveTodaySession workspace={workspace()} now={fixedNow} record={vi.fn()} accept={vi.fn()} discard={vi.fn()} />);
    expect(screen.getByText(/Today · 2026-08-14 · Primary outcome/)).toBeInTheDocument();
    expect(screen.getByText("Build")).toBeInTheDocument(); expect(screen.getByText("Completion criteria")).toBeInTheDocument();
    expect(screen.getByText("Proof requirement")).toBeInTheDocument(); expect(screen.getByText("Rubric")).toBeInTheDocument();
    const source = screen.getByRole("link", { name: flagshipBlueprint.resources[0]!.title });
    expect(source).toHaveAttribute("target", "_blank"); expect(source).toHaveAttribute("rel", "noreferrer"); expect(source).toHaveAttribute("lang", "en");
    expect(within(screen.getByRole("article")).queryAllByText(/Optional stretch/).length).toBeLessThanOrEqual(1);
    expect(screen.queryByText(/verified|demo/i)).not.toBeInTheDocument();
  });

  it("keeps step checks ephemeral, requires them for Complete, and emits contextual event kinds", async () => {
    const user = userEvent.setup(); const record = vi.fn().mockResolvedValue(true);
    render(<AdaptiveTodaySession workspace={workspace()} now={fixedNow} record={record} accept={vi.fn()} discard={vi.fn()} />);
    const complete = screen.getByRole("button", { name: "Complete" }); expect(complete).toBeDisabled();
    for (const box of screen.getAllByRole("checkbox")) await user.click(box);
    await user.click(complete); expect(record).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "completed" }));
    for (const [label, kind] of [["Delay", "delayed"], ["Skip", "skipped"], ["Too hard", "too_hard"], ["Already know this", "already_known"]] as const) { await user.click(screen.getByRole("button", { name: label })); expect(record).toHaveBeenLastCalledWith(expect.objectContaining({ kind })); }
    expect(screen.getByRole("status")).toHaveTextContent("current plan has not changed");
  });

  it("reveals optional stretch only after the primary checklist is complete", async () => {
    const user = userEvent.setup();
    const current = workspace();
    const active = current.planVersions.find(({ id }) => id === current.activePlanVersionId)!;
    const firstDay = active.days[0]!;
    expect(firstDay.stretchUnitId).not.toBeNull();

    render(<AdaptiveTodaySession workspace={current} now={fixedNow} record={vi.fn()} accept={vi.fn()} discard={vi.fn()} />);

    const article = screen.getByRole("article");
    expect(within(article).queryByText(/Optional stretch/)).not.toBeInTheDocument();
    for (const box of screen.getAllByRole("checkbox")) await user.click(box);
    expect(within(article).getByText(/Optional stretch/)).toBeInTheDocument();
  });

  it("uses the current availability-zone date for overdue work and event rollover", async () => {
    const user = userEvent.setup();
    const record = vi.fn().mockResolvedValue(true);
    render(<AdaptiveTodaySession
      workspace={workspace()}
      now={() => new Date("2026-08-15T10:00:00.000Z")}
      record={record}
      accept={vi.fn()}
      discard={vi.fn()}
    />);

    expect(screen.getByText(/Today · 2026-08-15 · Primary outcome/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delay" }));
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ planningDate: "2026-08-15" }));
  });

  it("contains a rejected action and restores the controls for retry", async () => {
    const user = userEvent.setup();
    const record = vi.fn()
      .mockRejectedValueOnce(new Error("private transport detail"))
      .mockResolvedValueOnce(true);
    render(<AdaptiveTodaySession workspace={workspace()} now={fixedNow} record={record} accept={vi.fn()} discard={vi.fn()} />);
    const delay = screen.getByRole("button", { name: "Delay" });

    await user.click(delay);

    expect(await screen.findByRole("alert")).toHaveTextContent("Arc could not update this plan");
    expect(screen.getByRole("alert")).not.toHaveTextContent("private transport detail");
    expect(delay).toBeEnabled();

    await user.click(delay);
    expect(record).toHaveBeenCalledTimes(2);
  });

  it("fails closed before rendering Today when the active path lineage diverges", () => {
    const current = workspace();
    const activePath = current.pathVersions.find(({ id }) => id === current.activePathVersionId)!;
    const activePlan = current.planVersions.find(({ id }) => id === current.activePlanVersionId)!;
    const alternatePath = { ...activePath, id: "path-ui-alternate", inputFingerprint: "path-ui-alternate-fingerprint" };
    const mismatched = planningWorkspaceSchema.parse({
      ...current,
      pathVersions: [activePath, alternatePath],
      planVersions: [{ ...activePlan, pathVersionId: alternatePath.id }],
    });
    const view = render(<AdaptiveTodaySession workspace={mismatched} now={fixedNow} record={vi.fn()} accept={vi.fn()} discard={vi.fn()} />);

    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Plan version unavailable");
    expect(screen.getByRole("alert")).toHaveTextContent("kept this saved plan unchanged");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    view.rerender(<AdaptiveTodaySession workspace={current} now={fixedNow} registry={{ ...flagshipUnitRegistry, blueprintVersion: "2026.99" }} record={vi.fn()} accept={vi.fn()} discard={vi.fn()} />);
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("A compatible rebuild is not available in this Phase 2 build");
  });

  it("keeps active Today visible while a candidate diff is pending", () => {
    const current = workspace();
    const path = current.pathVersions.find(({ id }) => id === current.activePathVersionId)!;
    const active = current.planVersions.find(({ id }) => id === current.activePlanVersionId)!;
    const candidate = buildPlanVersion({ path, registry: flagshipUnitRegistry, availability: current.availability, planningDate: "2026-08-15", generation: "proposed", baseVersionId: active.id, replanReason: "delayed", completedUnitIds: new Set() });
    const pending = planningWorkspaceSchema.parse({
      ...current,
      revision: 1,
      planVersions: [active, candidate.plan],
      dailyUnits: [...current.dailyUnits, ...candidate.dailyUnits],
      pendingPlanVersionId: candidate.plan.id,
    });
    const activePrimaryId = active.days.find(({ primaryUnitId }) => primaryUnitId !== null)!.primaryUnitId!;
    const activeObjective = current.dailyUnits.find(({ id, planVersionId }) => id === activePrimaryId && planVersionId === active.id)!.objective;

    render(<AdaptiveTodaySession workspace={pending} now={fixedNow} record={vi.fn()} accept={vi.fn()} discard={vi.fn()} />);

    expect(screen.getByRole("heading", { name: activeObjective })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Review every change." })).toBeInTheDocument();
    expect(screen.getByText(/review before changing/)).toBeInTheDocument();
  });

  it("uses exact safe-link attributes for primary and alternative sources", () => {
    const current = workspace();
    const active = current.planVersions.find(({ id }) => id === current.activePlanVersionId)!;
    const primaryId = active.days.find(({ primaryUnitId }) => primaryUnitId !== null)!.primaryUnitId!;
    const primary = current.dailyUnits.find(({ id, planVersionId }) => id === primaryId && planVersionId === active.id)!;
    const alternative = flagshipBlueprint.resources.find(({ id }) => id !== primary.primaryResourceId)!;
    const withAlternative = planningWorkspaceSchema.parse({
      ...current,
      dailyUnits: current.dailyUnits.map((unit) => unit.id === primary.id && unit.planVersionId === primary.planVersionId
        ? { ...unit, alternativeResourceIds: [alternative.id] }
        : unit),
    });

    render(<AdaptiveTodaySession workspace={withAlternative} now={fixedNow} record={vi.fn()} accept={vi.fn()} discard={vi.fn()} />);

    for (const resource of [flagshipBlueprint.resources.find(({ id }) => id === primary.primaryResourceId)!, alternative]) {
      const link = screen.getByRole("link", { name: resource.title });
      expect(link).toHaveAttribute("href", resource.url);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noreferrer");
      expect(link).toHaveAttribute("lang", resource.language);
    }
  });
});
