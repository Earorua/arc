import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { planningWorkspaceSchema } from "../../app/contracts/planning";
import { buildLearningPaths } from "../../app/lib/planning/path-builder";
import { buildPlanVersion } from "../../app/lib/planning/scheduler";
import { offlinePlanningRequest } from "../offline-uat/planning-fixture";

export function agentFixture() {
  const request = { ...offlinePlanningRequest(), planningDate: "2026-10-14" };
  const path = buildLearningPaths({ ...request, blueprint: flagshipBlueprint, registry: flagshipUnitRegistry }).fullScope;
  const built = buildPlanVersion({ path, registry: flagshipUnitRegistry, availability: request.availability,
    planningDate: request.planningDate, generation: "initial", baseVersionId: null, replanReason: null, completedUnitIds: new Set() });
  const workspace = planningWorkspaceSchema.parse({ id: "workspace-agent", goalId: "goal-agent", revision: 0, lastSequence: 0,
    audit: request.audit, availability: request.availability, availabilityVersions: [request.availability],
    target: request.target, pathVersions: [path], planVersions: [built.plan], dailyUnits: built.dailyUnits, events: [],
    activePathVersionId: path.id, activePlanVersionId: built.plan.id, pendingPlanVersionId: null });
  const sourceContext = { reference: { source: "flagship" as const, roleId: "ai-native-full-stack-engineer" as const },
    blueprint: flagshipBlueprint, registry: flagshipUnitRegistry };
  return { workspace, path, sourceContext, request };
}
