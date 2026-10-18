import { researchCandidateSchema, type ResearchCandidate } from "../../app/contracts/research";
import { parseBridgeJob, type BridgeJob } from "../../app/server/research/executor/job";
import { validResearchCandidate } from "../../tests/fixtures/research/valid-candidate";

export type SmokeScenarioId = "long" | "after-r2" | "after-d1";
export type SmokeScenario = Readonly<{
  id: SmokeScenarioId; ownerId: string; otherOwnerId: string;
  mutationId: string; requestId: string; jobId: string;
  role: string; roleId: string; locale: "en-US";
}>;
export const SCENARIOS: readonly SmokeScenario[] = Object.freeze(([
  ["long", "Data Product Manager", "data-product-manager", "151"],
  ["after-r2", "Senior Data Product Manager", "senior-data-product-manager", "152"],
  ["after-d1", "Lead Data Product Manager", "lead-data-product-manager", "153"],
] as const).map(([id, role, roleId, suffix]) => Object.freeze({
  id, role, roleId, ownerId: `owner-task15-${id}`, otherOwnerId: `other-owner-task15-${id}`,
  mutationId: `mutation-task15-${id}`, requestId: `request-task15-${id}`,
  jobId: `00000000-0000-4000-8000-000000000${suffix}`, locale: "en-US" as const,
})));

export function parseScenarioId(input: unknown): SmokeScenarioId {
  if (input !== "long" && input !== "after-r2" && input !== "after-d1") throw new Error("Invalid smoke scenario");
  return input;
}

export function scenarioForJob(job: BridgeJob): SmokeScenario {
  const parsed = parseBridgeJob(job);
  const scenario = SCENARIOS.find(s => s.jobId === parsed.jobId);
  if (!scenario || parsed.requestId !== scenario.requestId || parsed.role !== scenario.role || parsed.locale !== scenario.locale
    || job.role !== scenario.role || job.locale !== scenario.locale) throw new Error("Smoke job mismatch");
  return scenario;
}

export function candidateForScenario(id: SmokeScenarioId): ResearchCandidate {
  const scenario = SCENARIOS.find(s => s.id === parseScenarioId(id))!;
  const candidate = structuredClone(validResearchCandidate);
  return researchCandidateSchema.parse({ ...candidate, role: { ...candidate.role, name: scenario.role, id: scenario.roleId } });
}
