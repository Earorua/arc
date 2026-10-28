import type { DailyUnit, PlanningWorkspace } from "../../contracts/planning";

/** The first due primary in the active plan is the task the learner can act on in Today. */
export function getCurrentLearningUnit(workspace: PlanningWorkspace, today: string): DailyUnit | null {
  const path = workspace.pathVersions.find(item => item.id === workspace.activePathVersionId);
  const plan = workspace.planVersions.find(item => item.id === workspace.activePlanVersionId);
  if (!path || !plan || plan.pathVersionId !== path.id) return null;
  const pathUnitIds = new Set(path.units.map(unit => unit.id));
  const completed = new Set(workspace.events.flatMap(event => event.kind === "completed" ? [event.unitId] : []));
  const units = new Map(workspace.dailyUnits.filter(unit => unit.planVersionId === plan.id).map(unit => [unit.id, unit]));
  return plan.days.map(day => day.primaryUnitId ? units.get(day.primaryUnitId) ?? null : null)
    .find(unit => unit !== null && unit.required && unit.slot === "primary"
      && pathUnitIds.has(unit.id) && !completed.has(unit.id) && unit.scheduledDate <= today) ?? null;
}
