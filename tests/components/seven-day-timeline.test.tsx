import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SevenDayTimeline } from "../../app/components/workspace/seven-day-timeline";
import { PLANNING_SCHEMA_VERSION, planningWorkspaceSchema } from "../../app/contracts/planning";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { buildLearningPaths } from "../../app/lib/planning/path-builder";
import { buildPlanVersion } from "../../app/lib/planning/scheduler";

function workspace() {
  const audit = { id: "audit-week", schemaVersion: PLANNING_SCHEMA_VERSION, blueprintId: flagshipBlueprint.id, blueprintVersion: flagshipBlueprint.version, answers: flagshipBlueprint.skills.map(({ id }) => ({ skillId: id, level: "unseen" as const, evidenceRefs: [] })), evidence: [], createdBy: "learner", inputFingerprint: "audit-week-fingerprint" };
  const availability = { id: "availability-week", schemaVersion: PLANNING_SCHEMA_VERSION, timeZone: "Asia/Shanghai", weekdays: { monday: 0, tuesday: 120, wednesday: 120, thursday: 120, friday: 120, saturday: 120, sunday: 120 }, exceptions: [{ date: "2026-08-16", minutes: 0, reason: "Travel" }], weeklyMinutes: 720, inputFingerprint: "availability-week-fingerprint" };
  const target = { id: "target-week", schemaVersion: PLANNING_SCHEMA_VERSION, targetWeeks: 18, inputFingerprint: "target-week-fingerprint" };
  const path = buildLearningPaths({ blueprint: flagshipBlueprint, registry: flagshipUnitRegistry, audit, availability, target, planningDate: "2026-08-14" }).fullScope;
  const built = buildPlanVersion({ path, registry: flagshipUnitRegistry, availability, planningDate: "2026-08-14", generation: "initial", baseVersionId: null, replanReason: null, completedUnitIds: new Set() });
  return planningWorkspaceSchema.parse({ id: "workspace-week", goalId: "goal-week", revision: 0, lastSequence: 0, audit, availability, availabilityVersions: [availability], target, pathVersions: [path], planVersions: [built.plan], dailyUnits: built.dailyUnits, events: [], activePathVersionId: path.id, activePlanVersionId: built.plan.id, pendingPlanVersionId: null });
}

afterEach(cleanup);
describe("SevenDayTimeline", () => {
  it("labels the actual viewed week instead of implying the current calendar week", () => {
    render(<SevenDayTimeline workspace={workspace()} />);
    expect(screen.getByRole("heading", { name: "2026-08-14 — 2026-08-20" })).toBeInTheDocument();
    expect(screen.getByText("当前计划 · 七日安排")).toBeInTheDocument();
  });
  it("uses one ordered timeline with exactly seven consecutive dates and retains exceptions and rest", () => {
    render(<SevenDayTimeline workspace={workspace()} />);
    const timeline = screen.getByRole("list", { name: "连续七日学习安排" });
    expect(within(timeline).getAllByRole("listitem")).toHaveLength(7);
    expect(within(timeline).getAllByText(/2026-08-(14|15|16|17|18|19|20)/)).toHaveLength(7);
    expect(within(timeline).getByText(/临时安排：Travel/)).toBeInTheDocument();
    expect(within(timeline).getAllByText("休息").length).toBeGreaterThan(0);
  });

  it("fails closed when the recorded blueprint or registry version is unavailable", () => {
    const current = workspace();
    const view = render(<SevenDayTimeline workspace={current} registry={{ ...flagshipUnitRegistry, version: "2026.08.99" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("暂时无法读取这个计划");
    expect(screen.getByRole("alert")).toHaveTextContent("原有计划与学习记录已保留");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    view.rerender(<SevenDayTimeline workspace={current} blueprint={{ ...flagshipBlueprint, version: "2026.08.99" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("暂时无法读取这个计划");
    expect(screen.getByRole("alert")).toHaveTextContent("当前暂不支持自动转换这个版本");
  });

  it("renders a truthful fallback for an exception without a reason", () => {
    const current = workspace();
    const availability = {
      ...current.availability,
      exceptions: current.availability.exceptions.map((exception) => ({ ...exception, reason: null })),
    };
    const withoutReason = planningWorkspaceSchema.parse({
      ...current,
      availability,
      availabilityVersions: [availability],
    });

    render(<SevenDayTimeline workspace={withoutReason} />);

    expect(screen.getByText("临时安排 · 未填写原因")).toBeInTheDocument();
    expect(screen.queryByText(/临时安排：(null|undefined)/)).not.toBeInTheDocument();
  });
});
