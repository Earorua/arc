import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AdaptivePath } from "../../app/components/workspace/adaptive-path";
import { PLANNING_SCHEMA_VERSION, planningWorkspaceSchema } from "../../app/contracts/planning";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { buildLearningPaths } from "../../app/lib/planning/path-builder";
import { buildPlanVersion } from "../../app/lib/planning/scheduler";

function workspace() {
  const audit = { id: "audit-ui", schemaVersion: PLANNING_SCHEMA_VERSION, blueprintId: flagshipBlueprint.id, blueprintVersion: flagshipBlueprint.version, answers: flagshipBlueprint.skills.map(({ id }, index) => ({ skillId: id, level: index === 0 ? "independent" as const : "conceptual" as const, evidenceRefs: [] })), evidence: [], createdBy: "learner", inputFingerprint: "audit-ui-fingerprint" };
  const availability = { id: "availability-ui", schemaVersion: PLANNING_SCHEMA_VERSION, timeZone: "Asia/Shanghai", weekdays: { monday: 120, tuesday: 120, wednesday: 120, thursday: 120, friday: 120, saturday: 120, sunday: 120 }, exceptions: [], weeklyMinutes: 840, inputFingerprint: "availability-ui-fingerprint" };
  const target = { id: "target-ui", schemaVersion: PLANNING_SCHEMA_VERSION, targetWeeks: 18, inputFingerprint: "target-ui-fingerprint" };
  const paths = buildLearningPaths({ blueprint: flagshipBlueprint, registry: flagshipUnitRegistry, audit, availability, target, planningDate: "2026-08-14" });
  const path = paths.fullScope;
  const built = buildPlanVersion({ path, registry: flagshipUnitRegistry, availability, planningDate: "2026-08-14", generation: "initial", baseVersionId: null, replanReason: null, completedUnitIds: new Set() });
  return planningWorkspaceSchema.parse({ id: "workspace-ui", goalId: "goal-ui", revision: 0, lastSequence: 0, audit, availability, availabilityVersions: [availability], target, pathVersions: [path], planVersions: [built.plan], dailyUnits: built.dailyUnits, events: [], activePathVersionId: path.id, activePlanVersionId: built.plan.id, pendingPlanVersionId: null });
}

afterEach(cleanup);
describe("AdaptivePath", () => {
  it("opens only the current phase initially and offers explicit expansion of the entire route", () => {
    const current = workspace();
    render(<AdaptivePath workspace={current} />);
    const phases = screen.getByRole("list", { name: "学习阶段" }).querySelectorAll("details");
    expect(phases.length).toBeGreaterThan(1);
    expect([...phases].filter((phase) => phase.open)).toHaveLength(1);
    expect(phases[0].open).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "展开全部阶段" }));
    expect([...phases].every((phase) => phase.open)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "仅展开当前阶段" }));
    expect([...phases].filter((phase) => phase.open)).toHaveLength(1);
  });
  it("renders the exact ordered scope, current phase, calibration and distinct self-assessment", () => {
    render(<AdaptivePath workspace={workspace()} />);
    const path = screen.getByRole("list", { name: "学习阶段" });
    expect(within(path).getAllByRole("listitem").length).toBeGreaterThan(4);
    expect(within(path).getAllByText("当前阶段")).toHaveLength(1);
    expect(screen.getAllByText("能力校准").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/你的自评：了解概念/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/Blueprint claim confidence/i)).toHaveLength(0);
    expect(screen.queryByText(/self-assessment.*verified/i)).not.toBeInTheDocument();
    expect(screen.getByText(/2026-08-14—/)).toBeInTheDocument();
  });

  it("fails closed when a recorded registry version is unavailable", () => {
    const current = workspace();
    render(<AdaptivePath workspace={current} registry={{ ...flagshipUnitRegistry, version: "2026.08.99" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Plan version unavailable");
    expect(screen.getByRole("alert")).toHaveTextContent("kept this saved plan unchanged");
    expect(screen.getByRole("alert")).toHaveTextContent("A compatible rebuild is not available in this Phase 2 build");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("explains prerequisites with the recorded blueprint rationale", () => {
    const current = workspace();
    const path = current.pathVersions.find(({ id }) => id === current.activePathVersionId)!;
    const dependent = path.units.find(({ prerequisiteUnitIds }) => prerequisiteUnitIds.length > 0)!;
    const rationale = flagshipBlueprint.skills.find(({ id }) => id === dependent.skillId)!.why;

    render(<AdaptivePath workspace={current} />);

    expect(screen.getAllByText(rationale).length).toBeGreaterThan(0);
    expect(screen.queryByText(/because this outcome depends on those foundations/i)).not.toBeInTheDocument();
  });
});
