import { planningWorkspaceResponseSchema } from "../../app/contracts/planning-api";
import { buildLearningPaths } from "../../app/lib/planning/path-builder";
import { buildPlanVersion } from "../../app/lib/planning/scheduler";
import { validateResearchCandidate } from "../../app/server/research/package-validator";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";
import { offlinePlanningRequest } from "../offline-uat/planning-fixture";

export function researchAgentFixture(timeZone = "Asia/Shanghai") {
  const validation = validateResearchCandidate(validResearchCandidate, validAnnotations, {
    packageId: "research-package-agent", blueprintVersion: "2026.08.1", registryVersion: "2026.08.2",
    templateVersion: "2026.08.3", promptVersion: "research-prompt-v1", inputSchemaVersion: "research-input-v1",
    outputSchemaVersion: "research-output-v1", qualityVersion: "research-quality-v1",
    modelConfigVersion: "research-model-v1", observedAt: "2026-10-01", expiresAt: "2026-10-31",
  });
  if (!validation.ready) throw new Error("Expected a valid synthetic Research package");
  const { blueprint, registry, id: packageId, contentFingerprint } = validation.package;
  const request = { ...offlinePlanningRequest(blueprint, { source: "research", researchRunId: "research-run-agent" }),
    planningDate: "2026-10-14" };
  request.availability.timeZone = timeZone;
  const path = buildLearningPaths({ ...request, blueprint, registry }).fullScope;
  const built = buildPlanVersion({ path, registry, availability: request.availability,
    planningDate: request.planningDate, generation: "initial", baseVersionId: null, replanReason: null,
    completedUnitIds: new Set() });
  const response = planningWorkspaceResponseSchema.parse({
    workspace: { id: "workspace-research-agent", goalId: "goal-research-agent", revision: 0, lastSequence: 0,
      audit: request.audit, availability: request.availability, availabilityVersions: [request.availability],
      target: request.target, pathVersions: [path], planVersions: [built.plan], dailyUnits: built.dailyUnits, events: [],
      activePathVersionId: path.id, activePlanVersionId: built.plan.id, pendingPlanVersionId: null },
    sourceContext: { reference: { source: "research", researchRunId: "research-run-agent", packageId,
      blueprintId: blueprint.id, blueprintVersion: blueprint.version, registryId: registry.id,
      registryVersion: registry.version, configFingerprint: "synthetic-config", contentFingerprint }, blueprint, registry },
  });
  return { workspace: response.workspace!, sourceContext: response.sourceContext!, path };
}
