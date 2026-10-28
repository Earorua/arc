import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AdaptivePath } from "../../app/components/workspace/adaptive-path";
import { PLANNING_SCHEMA_VERSION, planningWorkspaceSchema } from "../../app/contracts/planning";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { buildLearningPaths } from "../../app/lib/planning/path-builder";
import { buildPlanVersion } from "../../app/lib/planning/scheduler";
import { getPathProgress } from "../../app/lib/planning/path-progress";

function workspace() {
  const audit = { id: "audit-ui", schemaVersion: PLANNING_SCHEMA_VERSION, blueprintId: flagshipBlueprint.id, blueprintVersion: flagshipBlueprint.version, answers: flagshipBlueprint.skills.map(({ id }, index) => ({ skillId: id, level: index === 0 ? "independent" as const : "conceptual" as const, evidenceRefs: [] })), evidence: [], createdBy: "learner", inputFingerprint: "audit-ui-fingerprint" };
  const availability = { id: "availability-ui", schemaVersion: PLANNING_SCHEMA_VERSION, timeZone: "Asia/Shanghai", weekdays: { monday: 120, tuesday: 120, wednesday: 120, thursday: 120, friday: 120, saturday: 120, sunday: 120 }, exceptions: [], weeklyMinutes: 840, inputFingerprint: "availability-ui-fingerprint" };
  const target = { id: "target-ui", schemaVersion: PLANNING_SCHEMA_VERSION, targetWeeks: 18, inputFingerprint: "target-ui-fingerprint" };
  const paths = buildLearningPaths({ blueprint: flagshipBlueprint, registry: flagshipUnitRegistry, audit, availability, target, planningDate: "2026-08-14" });
  const path = paths.fullScope;
  const built = buildPlanVersion({ path, registry: flagshipUnitRegistry, availability, planningDate: "2026-08-14", generation: "initial", baseVersionId: null, replanReason: null, completedUnitIds: new Set() });
  return planningWorkspaceSchema.parse({ id: "workspace-ui", goalId: "goal-ui", revision: 0, lastSequence: 0, audit, availability, availabilityVersions: [availability], target, pathVersions: [path], planVersions: [built.plan], dailyUnits: built.dailyUnits, events: [], activePathVersionId: path.id, activePlanVersionId: built.plan.id, pendingPlanVersionId: null });
}

afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });
describe("AdaptivePath", () => {
  it("distinguishes prerequisite readiness from a future scheduled task", () => {
    const current = smallWorkspace(1);
    window.history.replaceState(null, "", `/path?unit=${current.pathVersions[0].units[1].id}`);
    render(<AdaptivePath workspace={current} now={() => new Date("2026-08-14T08:00:00.000Z")} />);
    expect(screen.getAllByText("已完成", { exact: true })).toHaveLength(1);
    expect(screen.getAllByText("前置已满足", { exact: true })).toHaveLength(1);
    expect(screen.getAllByText("待学习", { exact: true })).toHaveLength(1);
    expect(screen.getByText("已完成阶段")).toBeInTheDocument();
    expect(screen.getByText("当前阶段")).toBeInTheDocument();
    expect(screen.queryByText("当前任务", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /去做当前任务|继续今日学习/ })).not.toBeInTheDocument();
  });

  it("offers the current-task link only on Today's due primary, even when other roots are ready", () => {
    const current = workspace();
    const first = current.dailyUnits.find(unit => unit.slot === "primary")!;
    window.history.replaceState(null, "", `/path?unit=${first.id}`);
    render(<AdaptivePath workspace={current} now={() => new Date("2026-08-13T16:00:00.000Z")} />);
    const details = screen.getByText("当前任务", { exact: true }).closest("details")!;
    expect(details).toHaveClass("path-unit-detail");
    expect(within(details).getByRole("link", { name: "去做当前任务" })).toHaveAttribute("href", "/today");
    expect(screen.getAllByText("当前任务", { exact: true })).toHaveLength(1);
    expect(screen.getAllByText("前置已满足", { exact: true }).length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.path-unit-detail a[href="/today"]')).toHaveLength(1);
  });

  it("does not expose current-task actions or labels on a read-only saved route", () => {
    render(<AdaptivePath workspace={workspace()} readOnly now={() => new Date("2026-08-14T08:00:00.000Z")} />);
    expect(screen.getAllByText("前置已满足", { exact: true }).length).toBeGreaterThan(0);
    expect(screen.queryByText("当前任务", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /去做当前任务|继续今日学习/ })).not.toBeInTheDocument();
  });

  it("deduplicates completions and excludes optional stretch and non-completion events from route progress", () => {
    const current = smallWorkspace(1);
    const completed = current.events[0];
    if (completed.kind !== "completed") throw new Error("Expected the fixture completion event");
    const stretch = current.dailyUnits.find(unit => unit.slot === "stretch")!;
    current.events.push({ ...completed, eventId: "repeat", mutationId: "repeat", sequence: 2 },
      { ...completed, unitId: stretch.id, eventId: "stretch", mutationId: "stretch", sequence: 3 },
      { kind: "already_known", unitId: current.pathVersions[0].units[1].id, planningDate: "2026-08-14", occurredAt: completed.occurredAt, targetPlanVersionId: current.activePlanVersionId, eventId: "known", mutationId: "known", sequence: 4 });
    current.lastSequence = 4;
    const progress = getPathProgress(planningWorkspaceSchema.parse(current));
    expect(progress.completedUnits).toBe(1);
    expect(progress.totalUnits).toBe(3);
    expect(progress.currentPhaseId).toBe("phase-two");
    expect([...progress.prerequisitesSatisfiedUnitIds]).toEqual([current.pathVersions[0].units[1].id]);
  });

  it("shows no current phase after every route unit is completed", () => {
    render(<AdaptivePath workspace={smallWorkspace(3)} />);
    expect(screen.queryByText("当前阶段", { exact: true })).not.toBeInTheDocument();
    expect(screen.getAllByText("已完成阶段")).toHaveLength(2);
    expect(screen.getByText("全部学习单元已完成。")).toBeInTheDocument();
    expect(document.querySelector('[aria-current="step"]')).toBeNull();
    expect(screen.queryByText("当前任务", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /去做当前任务|继续今日学习/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "展开全部阶段" }));
    expect(screen.getByRole("button", { name: "收起全部阶段" })).toBeInTheDocument();
  });

  it("uses saved scheduled dates and labels dates outside the saved week as estimates", () => {
    const current = workspace();
    current.availability.exceptions = [{ date: "2026-08-14", minutes: 120, reason: "Saved day" }, { date: "2026-08-21", minutes: 0, reason: "Unavailable" }];
    current.availabilityVersions[0] = current.availability;
    render(<AdaptivePath workspace={current} />);
    expect(document.querySelector(".path-phase-range")).toHaveTextContent("预计 2026-08-14—2026-08-22（按保存的学习时间估算）");
    expect(screen.getByText(/路线预计/)).toBeInTheDocument();
  });

  it("keeps completed dates distinct from the remaining saved schedule", () => {
    render(<AdaptivePath workspace={smallWorkspace(1)} readOnly />);
    expect(screen.getByText("完成于 2026-08-14")).toBeInTheDocument();
    expect(screen.getByText("已排期 2026-08-15—2026-08-16")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("reports unavailable phase estimates when a remaining full unit cannot fit", () => {
    const current = workspace();
    current.availability.weekdays = { monday: 15, tuesday: 15, wednesday: 15, thursday: 15, friday: 15, saturday: 15, sunday: 15 };
    current.availability.weeklyMinutes = 105;
    current.availabilityVersions[0] = current.availability;
    render(<AdaptivePath workspace={current} />);
    expect(screen.getAllByText("阶段时间暂不可估算")).toHaveLength(current.pathVersions[0].phases.length);
  });

  it("shows checkpoint-specific names and time instead of repeating the whole template estimate", () => {
    const current = workspace();
    const unit = current.pathVersions[0].units.find(unit => unit.checkpointId !== null)!;
    const template = flagshipUnitRegistry.tracks.flatMap(track => track.templates).find(item => item.id === unit.templateId)!;
    const checkpoint = template.checkpoints.find(item => item.id === unit.checkpointId)!;
    render(<AdaptivePath workspace={current} />);
    const summary = screen.getByText(checkpoint.label).closest("summary")!;
    expect(within(summary).getByText(`${unit.estimatedMinutes} 分钟`)).toBeInTheDocument();
  });
  it("restores selected unit from the URL and browser history", () => {
    const current = workspace();
    const first = current.pathVersions[0].units[0];
    window.history.replaceState(null, "", `/path?unit=${first.id}`);
    render(<AdaptivePath workspace={current} />);
    const row = document.querySelector(".is-selected .path-unit-detail");
    expect(row).toHaveAttribute("open");
    act(() => { window.history.replaceState(null, "", "/path"); window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(document.querySelector(".is-selected")).toBeNull();
  });
  it("provides a clear continuation and makes saved routes read-only", () => {
    const view = render(<AdaptivePath workspace={workspace()} />);
    expect(screen.getByRole("link", { name: /继续今日学习/ })).toHaveAttribute("href", "/today");
    view.rerender(<AdaptivePath workspace={workspace()} readOnly />);
    expect(screen.queryByRole("link", { name: /继续今日学习/ })).not.toBeInTheDocument();
  });
  it("opens only the current phase initially and offers explicit expansion of the entire route", () => {
    const current = workspace();
    render(<AdaptivePath workspace={current} />);
    const phases = screen.getByRole("list", { name: "学习阶段" }).querySelectorAll<HTMLDetailsElement>("details.adaptive-phase-copy");
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
    expect(screen.getByText(/路线预计 2026-08-14—/)).toBeInTheDocument();
  });

  it("fails closed when a recorded registry version is unavailable", () => {
    const current = workspace();
    render(<AdaptivePath workspace={current} registry={{ ...flagshipUnitRegistry, version: "2026.08.99" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("暂时无法读取这个计划");
    expect(screen.getByRole("alert")).toHaveTextContent("原有计划与学习记录已保留");
    expect(screen.getByRole("alert")).toHaveTextContent("当前暂不支持自动转换这个版本");
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

function smallWorkspace(completedCount: number) {
  const current = workspace();
  const path = current.pathVersions[0];
  path.units = path.units.slice(0, 3).map((unit, index, units) => ({ ...unit, prerequisiteUnitIds: index === 0 ? [] : [units[index - 1].id] }));
  path.phases = [
    { ...path.phases[0], phaseId: "phase-one", unitIds: [path.units[0].id] },
    { ...path.phases[1], phaseId: "phase-two", unitIds: path.units.slice(1).map(unit => unit.id) },
  ];
  current.events = path.units.slice(0, completedCount).map((unit, index) => ({
    kind: "completed" as const, unitId: unit.id, actualMinutes: unit.estimatedMinutes,
    planningDate: "2026-08-14", occurredAt: "2026-08-14T10:00:00.000Z",
    targetPlanVersionId: current.activePlanVersionId,
    eventId: `complete-${index}`, mutationId: `mutation-${index}`, sequence: index + 1,
  }));
  current.lastSequence = current.events.length;
  return planningWorkspaceSchema.parse(current);
}
