import type { LearningPathVersion, PlanningWorkspace } from "../../contracts/planning";
import { addCalendarDays } from "../../lib/planning/calendar";
import { getPathProgress } from "../../lib/planning/path-progress";
import { estimateUnitSchedule } from "../../lib/planning/scheduler";

export function phaseDateLabels(workspace: PlanningWorkspace, path: LearningPathVersion): Map<string, string> {
  const { completedUnitIds } = getPathProgress(workspace, path);
  const plan = workspace.planVersions.find(item => item.id === workspace.activePlanVersionId && item.pathVersionId === path.id);
  const availability = workspace.availabilityVersions.find(item => item.id === path.availabilityVersionId);
  const dates = new Map<string, string>();
  const completionDates = new Map<string, string>();
  for (const event of workspace.events) {
    if (event.kind === "completed" && !completionDates.has(event.unitId)) completionDates.set(event.unitId, event.planningDate);
  }
  const pathUnitIds = new Set(path.units.map(unit => unit.id));
  for (const unit of workspace.dailyUnits) {
    if (unit.planVersionId === plan?.id && pathUnitIds.has(unit.id) && !completedUnitIds.has(unit.id)) dates.set(unit.id, unit.scheduledDate);
  }
  const estimated = new Set<string>();
  if (plan && availability) {
    try {
      // Preserve the saved week exactly, then extend its remaining scope with the same scheduler.
      const planningDate = addCalendarDays([...plan.days].map(day => day.date).sort().at(-1)!, 1);
      const scheduled = new Set([...completedUnitIds, ...dates.keys()]);
      const remainingAvailability = { ...availability, exceptions: availability.exceptions.filter(exception => exception.date >= planningDate) };
      for (const placement of estimateUnitSchedule({ units: path.units, availability: remainingAvailability, planningDate, completedUnitIds: scheduled })) {
        dates.set(placement.unitId, placement.date);
        estimated.add(placement.unitId);
      }
    } catch { /* An uncomputable range stays unavailable rather than inventing dates. */ }
  }
  return new Map(path.phases.map(phase => {
    const remainingIds = phase.unitIds.filter(id => !completedUnitIds.has(id));
    const done = remainingIds.length === 0;
    const ids = done ? phase.unitIds : remainingIds;
    const source = done ? completionDates : dates;
    if (ids.some(id => !source.has(id))) return [phase.phaseId, "阶段时间暂不可估算"];
    const ordered = ids.map(id => source.get(id)!).sort();
    const range = ordered[0] === ordered.at(-1) ? ordered[0] : `${ordered[0]}—${ordered.at(-1)}`;
    const partial = remainingIds.length > 0 && remainingIds.length < phase.unitIds.length ? "剩余" : "";
    return [phase.phaseId, done ? `完成于 ${range}`
      : ids.some(id => estimated.has(id)) ? `${partial}预计 ${range}（按保存的学习时间估算）`
        : `${partial}已排期 ${range}`];
  }));
}
