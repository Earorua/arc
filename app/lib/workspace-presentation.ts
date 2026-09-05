import { planningWorkspaceResponseSchema } from "../contracts/planning-api";
import { parsePlanningWorkspaceAtRepositoryBoundary, type PlanningWorkspace } from "../contracts/planning";
import { flagshipBlueprint } from "../data/flagship-blueprint";
import { flagshipUnitRegistry } from "../data/flagship-unit-registry";
import type { PlanningWorkspaceController } from "./use-planning-workspace";

export function resolveWorkspacePresentation(planning: PlanningWorkspaceController) {
  if (planning.source === "restoring") return { kind: "loading" as const };
  if (!planning.workspace) {
    if (planning.recovery === "version-unavailable") return { kind: "unavailable" as const };
    if (planning.source === "offline-cloud" || planning.recovery !== "none") return { kind: "retry" as const };
    return { kind: "legacy" as const };
  }
  try {
    const response = planningWorkspaceResponseSchema.parse({ workspace: planning.workspace, sourceContext: planning.sourceContext ?? null });
    const workspace = parsePlanningWorkspaceAtRepositoryBoundary(response.workspace);
    // The strict response contract permits absent context only for exact historical
    // Flagship blueprint AND registry identities and versions.
    return { kind: "adaptive" as const, workspace, blueprint: response.sourceContext?.blueprint ?? flagshipBlueprint, registry: response.sourceContext?.registry ?? flagshipUnitRegistry };
  } catch { return { kind: "unavailable" as const }; }
}

export function proofSelectableDailyUnits(workspace: PlanningWorkspace | null) {
  if (!workspace) return [];
  const plans = new Set(workspace.planVersions.map(({ id }) => id));
  const completed = new Set(workspace.events.flatMap((event) => event.kind === "completed" && plans.has(event.targetPlanVersionId)
    ? [`${event.targetPlanVersionId}:${event.unitId}`] : []));
  return [...new Map(workspace.dailyUnits.filter((unit) => plans.has(unit.planVersionId)
    && (unit.planVersionId === workspace.activePlanVersionId || completed.has(`${unit.planVersionId}:${unit.id}`)))
    .map((unit) => [unit.id, unit])).values()];
}
