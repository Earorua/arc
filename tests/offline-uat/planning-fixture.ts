import type { RoleBlueprint } from "../../app/contracts/intelligence";
import type { PlanningGenerateSource } from "../../app/contracts/planning";
import type { GeneratePlanningRequest } from "../../app/contracts/planning-api";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";

/** Authored current answers, not a prebuilt workspace or seeded cloud goal. */
export function offlinePlanningRequest(blueprint: RoleBlueprint = flagshipBlueprint,
  source: PlanningGenerateSource = { source: "flagship", roleId: "ai-native-full-stack-engineer" }, mutationId = crypto.randomUUID()): GeneratePlanningRequest {
  return {
    mutationId, source, planningDate: new Date().toISOString().slice(0, 10),
    audit: { id: "offline-audit", schemaVersion: "2026.08.1", blueprintId: blueprint.id, blueprintVersion: blueprint.version,
      answers: blueprint.skills.map(({ id }) => ({ skillId: id, level: "unseen", evidenceRefs: [] })), evidence: [], createdBy: "learner", inputFingerprint: "offline-audit-answers" },
    availability: { id: "offline-availability", schemaVersion: "2026.08.1", timeZone: "UTC",
      weekdays: { monday: 60, tuesday: 60, wednesday: 60, thursday: 60, friday: 60, saturday: 60, sunday: 60 }, exceptions: [], weeklyMinutes: 420, inputFingerprint: "offline-availability-answers" },
    target: { id: "offline-target", schemaVersion: "2026.08.1", targetWeeks: 18, inputFingerprint: "offline-target-answer" }, selectedScope: "full-scope",
  };
}
