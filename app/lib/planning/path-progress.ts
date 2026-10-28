import type { LearningPathVersion, PlanningWorkspace } from "../../contracts/planning";

/** Completion is recorded against stable path-unit IDs; optional daily stretch units stay outside route progress. */
export function getPathProgress(workspace: PlanningWorkspace, path: LearningPathVersion | undefined = workspace.pathVersions.find(item => item.id === workspace.activePathVersionId)) {
  const units = path?.units ?? [];
  const pathUnitIds = new Set(units.map(unit => unit.id));
  const completedUnitIds = new Set(workspace.events.flatMap(event =>
    event.kind === "completed" && pathUnitIds.has(event.unitId) ? [event.unitId] : []));
  const prerequisitesSatisfiedUnitIds = new Set(units.filter(unit => !completedUnitIds.has(unit.id)
    && unit.prerequisiteUnitIds.every(id => completedUnitIds.has(id))).map(unit => unit.id));
  return {
    completedUnitIds,
    prerequisitesSatisfiedUnitIds,
    currentPhaseId: path?.phases.find(phase => phase.unitIds.some(id => !completedUnitIds.has(id)))?.phaseId ?? null,
    completedUnits: completedUnitIds.size,
    totalUnits: units.length,
  };
}

export type PathProgress = ReturnType<typeof getPathProgress>;
