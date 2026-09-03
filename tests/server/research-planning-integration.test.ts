import { describe, expect, it, vi } from "vitest";
import { generatePlanningRequestSchema, planningMutationResponseSchema, planningWorkspaceResponseSchema } from "../../app/contracts/planning-api";
import { planningSourceReferenceSchema, type PlanningSourceReference } from "../../app/contracts/planning";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { validateResearchCandidate } from "../../app/server/research/package-validator";
import { PlanningSourceResolver, type PlanningSourceResolverDependencies } from "../../app/server/planning/source-resolver";
import { PlanningService } from "../../app/server/planning/service";
import { D1PlanningRepository } from "../../app/server/planning/d1-planning-repository";
import { D1ResearchRepository } from "../../app/server/research/d1-repository";
import type { PlanningRepository, PlanningRepositoryPayload } from "../../app/server/planning/repository";
import type { ResearchPackage } from "../../app/contracts/research";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";
import { createResearchD1, seedUser } from "../helpers/sqlite-d1";

const ownerId = "owner-research-1";
const goalId = "goal-research-1";
const researchRunId = "research-run-1";
const configFingerprint = "config-fingerprint-1";

const validation = validateResearchCandidate(validResearchCandidate, validAnnotations, {
  packageId: "research-package-1",
  blueprintVersion: "2026.08.1",
  registryVersion: "2026.08.2",
  templateVersion: "2026.08.3",
  promptVersion: "research-prompt-v1",
  inputSchemaVersion: "research-input-v1",
  outputSchemaVersion: "research-output-v1",
  qualityVersion: "research-quality-v1",
  modelConfigVersion: "research-model-v1",
  observedAt: "2026-08-30",
  expiresAt: "2026-09-30",
});
if (!validation.ready) throw new Error("Expected Ready research fixture");
const researchPackage = validation.package;

function request(source: unknown = { source: "research", researchRunId }) {
  return {
    mutationId: "mutation-generate-1",
    source,
    planningDate: "2026-09-01",
    audit: {
      id: "audit-1",
      schemaVersion: "2026.08.1",
      blueprintId: researchPackage.blueprint.id,
      blueprintVersion: researchPackage.blueprint.version,
      answers: researchPackage.blueprint.skills.map(({ id: skillId }) => ({
        skillId, level: "conceptual", evidenceRefs: [],
      })),
      evidence: [],
      createdBy: "learner",
      inputFingerprint: "audit-fingerprint",
    },
    availability: {
      id: "availability-1",
      schemaVersion: "2026.08.1",
      timeZone: "Asia/Shanghai",
      weekdays: { monday: 60, tuesday: 60, wednesday: 60, thursday: 60, friday: 60, saturday: 60, sunday: 60 },
      exceptions: [],
      weeklyMinutes: 420,
      inputFingerprint: "availability-fingerprint",
    },
    target: { id: "target-1", schemaVersion: "2026.08.1", targetWeeks: 18, inputFingerprint: "target-fingerprint" },
    selectedScope: "full-scope",
  };
}

function researchRepository(packageValue: ResearchPackage = researchPackage) {
  const run = {
    id: researchRunId,
    ownerId,
    state: "ready" as const,
    packageId: packageValue.id,
    configFingerprint,
  };
  return {
    getRun: vi.fn(async (candidateOwner: string, candidateRun: string) =>
      candidateOwner === ownerId && candidateRun === researchRunId ? run : null),
    resolveReadyPackage: vi.fn(async (candidateOwner: string, candidateRun: string) => {
      if (candidateOwner !== ownerId || candidateRun !== researchRunId) throw new Error("NOT_FOUND");
      return structuredClone(packageValue);
    }),
    resolveReadyPackageForPlanningReplay: vi.fn(async (candidateOwner: string, candidateRun: string) => {
      if (candidateOwner !== ownerId || candidateRun !== researchRunId) throw new Error("NOT_FOUND");
      return structuredClone(packageValue);
    }),
  };
}

function resolver(repository: NonNullable<PlanningSourceResolverDependencies["researchRepository"]> = researchRepository()) {
  return new PlanningSourceResolver({
    intelligence: { getPublished: vi.fn(async () => structuredClone(flagshipBlueprint)) },
    flagshipRegistry: flagshipUnitRegistry,
    researchRepository: repository,
  });
}

function memoryRepository() {
  let stored: PlanningRepositoryPayload | null = null;
  const mutations = new Map<string, PlanningRepositoryPayload>();
  const repository: PlanningRepository = {
    findActiveGoal: vi.fn(async () => ({ ownerId, goalId })),
    load: vi.fn(async () => structuredClone(stored)),
    findMutation: vi.fn(async ({ mutationId }) => structuredClone(mutations.get(mutationId) ?? null)),
    saveGeneration: vi.fn(async (command) => {
      stored = { ownerId, goalId, payload: command.result.workspace, sourceReference: command.sourceReference };
      const result = { ownerId, goalId, payload: command.result, sourceReference: command.sourceReference };
      mutations.set(command.mutationId, result);
      return structuredClone(result);
    }),
    saveEvent: vi.fn(async (command) => {
      stored = { ownerId, goalId, payload: command.result.workspace, sourceReference: command.sourceReference };
      const result = { ownerId, goalId, payload: command.result, sourceReference: command.sourceReference };
      mutations.set(command.mutationId, result);
      return structuredClone(result);
    }),
  };
  return repository;
}

describe("Research planning source integration", () => {
  it("keeps legacy Flagship requests and strictly parses the explicit source union", () => {
    const legacy = { ...request(), source: undefined, roleId: "ai-native-full-stack-engineer" };
    delete (legacy as { source?: unknown }).source;
    expect(generatePlanningRequestSchema.safeParse(legacy).success).toBe(true);
    const explicit = structuredClone(legacy) as Record<string, unknown>;
    delete explicit.roleId;
    expect(generatePlanningRequestSchema.safeParse({
      ...explicit, source: { source: "flagship", roleId: "ai-native-full-stack-engineer" },
    }).success).toBe(true);
    expect(generatePlanningRequestSchema.safeParse(request()).success).toBe(true);
    for (const invalid of [
      { source: "research" },
      { source: "research", researchRunId, packageId: researchPackage.id },
      { source: "flagship", roleId: "another-role" },
      { source: "research", researchRunId, ownerId },
    ]) expect(generatePlanningRequestSchema.safeParse(request(invalid)).success).toBe(false);
  });

  it("resolves an owner Ready package into an immutable exact reference and rejects cross-owner generate", async () => {
    const sourceResolver = resolver();
    const resolved = await sourceResolver.resolveForGenerate(ownerId, { source: "research", researchRunId });
    expect(resolved.reference).toEqual({
      source: "research",
      researchRunId,
      packageId: researchPackage.id,
      blueprintId: researchPackage.blueprint.id,
      blueprintVersion: researchPackage.blueprint.version,
      registryId: researchPackage.registry.id,
      registryVersion: researchPackage.registry.version,
      configFingerprint,
      contentFingerprint: researchPackage.contentFingerprint,
    });
    expect(planningSourceReferenceSchema.safeParse(resolved.reference).success).toBe(true);
    await expect(sourceResolver.resolveForGenerate("owner-other", { source: "research", researchRunId }))
      .rejects.toMatchObject({ name: "PlanningSourceUnavailableError" });
  });

  it.each(["needs-review", "failed"] as const)("rejects a %s Research run before package resolution", async (state) => {
    const base = researchRepository();
    const repository: NonNullable<PlanningSourceResolverDependencies["researchRepository"]> = {
      ...base,
      getRun: vi.fn(async () => ({
        id: researchRunId,
        ownerId,
        state,
        packageId: researchPackage.id,
        configFingerprint,
      })),
    };
    const sourceResolver = resolver(repository);
    await expect(sourceResolver.resolveForGenerate(ownerId, { source: "research", researchRunId }))
      .rejects.toMatchObject({ name: "PlanningSourceUnavailableError" });
    expect(base.resolveReadyPackage).not.toHaveBeenCalled();
  });

  it("generates deterministically from Research and replays events in a fresh service from the persisted source", async () => {
    const repository = memoryRepository();
    const sourceResolver = resolver();
    const create = () => new PlanningService({
      repository,
      sourceResolver,
      createId: () => "planning-service-id",
      now: () => new Date("2026-10-15T00:00:00.000Z"),
    });
    const first = await create().generate(ownerId, request());
    const sourceContext = await create().getSourceContext(ownerId);
    expect(planningWorkspaceResponseSchema.parse({ workspace: first.workspace, sourceContext })).toEqual({
      workspace: first.workspace, sourceContext,
    });
    expect(planningMutationResponseSchema.safeParse({ result: first, sourceContext }).success).toBe(true);
    expect(planningWorkspaceResponseSchema.safeParse({ workspace: first.workspace }).success).toBe(false);
    expect(planningMutationResponseSchema.safeParse({ result: first }).success).toBe(false);
    expect(planningWorkspaceResponseSchema.safeParse({ workspace: null, sourceContext }).success).toBe(false);
    const secondRepository = memoryRepository();
    const second = await new PlanningService({
      repository: secondRepository,
      sourceResolver,
      createId: () => "planning-service-id",
      now: () => new Date("2026-10-15T00:00:00.000Z"),
    }).generate(ownerId, request());
    expect(second).toEqual(first);

    const stored = await repository.load({ ownerId, goalId });
    expect(stored?.sourceReference).toMatchObject({ source: "research", researchRunId });
    const replayContext = await sourceResolver.resolveForReplay(ownerId, stored!.sourceReference);
    expect(first.workspace.pathVersions.every((path) => path.blueprintId === replayContext.blueprint.id
      && path.blueprintVersion === replayContext.blueprint.version
      && path.registryId === replayContext.registry.id
      && path.registryVersion === replayContext.registry.version)).toBe(true);

    const unit = first.workspace.dailyUnits[0]!;
    const completed = await create().appendEvent(ownerId, {
      mutationId: "mutation-complete-1",
      baseVersionId: first.workspace.activePlanVersionId,
      event: { kind: "completed", unitId: unit.id, actualMinutes: unit.estimatedMinutes, planningDate: "2026-09-01" },
    });
    expect(completed.workspace.events.at(-1)?.kind).toBe("completed");
    expect(sourceResolver.dependencies.researchRepository?.resolveReadyPackageForPlanningReplay).toHaveBeenCalled();
  });

  it.each([
    ["packageId", "another-package"],
    ["blueprintId", "another-blueprint"],
    ["blueprintVersion", "2026.08.999"],
    ["registryId", "another-registry"],
    ["registryVersion", "2026.08.999"],
    ["configFingerprint", "another-config"],
    ["contentFingerprint", "p2-00000000000000000000000000000000"],
  ] as const)("fails closed on persisted Research %s mismatch", async (field, value) => {
    const valid = (await resolver().resolveForGenerate(ownerId, { source: "research", researchRunId })).reference;
    const tampered = { ...valid, [field]: value } as PlanningSourceReference;
    await expect(resolver().resolveForReplay(ownerId, tampered))
      .rejects.toMatchObject({ name: "PlanningSourceUnavailableError" });
  });

  it("replays a locked Research Complete through fresh D1 repository instances after expiry", async () => {
    const db = createResearchD1();
    seedUser(db, ownerId);
    db.database.prepare(`INSERT INTO career_goals
      (id,user_id,role_id,level,weekly_minutes,target_weeks,status,active_slot)
      VALUES (?1,?2,?3,'beginner',420,18,'active',1)`).run(goalId, ownerId, researchPackage.blueprint.id);
    const beforeExpiry = new D1ResearchRepository(db as unknown as D1Database, {
      now: () => Date.parse("2026-09-01T00:00:00.000Z"), createId: () => researchRunId,
    });
    const created = await beforeExpiry.createOrReplay({
      ownerId, requestId: "request-research-1", mutationId: "mutation-research-1",
      rawRole: "Data Product Manager", normalizedRoleKey: "data-product-manager", locale: "en-US",
      inputFingerprint: "input-fingerprint-1", configFingerprint,
      activeExpiresAt: Date.parse("2026-09-01T00:01:00.000Z"),
    });
    const researching = await beforeExpiry.transition({
      id: created.run.id, ownerId, expectedVersion: 0, from: "queued", to: "researching",
    });
    const validating = await beforeExpiry.transition({
      id: researching.id, ownerId, expectedVersion: 1, from: "researching", to: "validating",
    });
    await beforeExpiry.saveValidation({
      id: validating.id, ownerId, expectedVersion: 2, result: validation,
      normalizedRoleKey: "data-product-manager", locale: "en-US", configFingerprint,
    });
    let planningId = 0;
    const beforeResolver = new PlanningSourceResolver({
      intelligence: { getPublished: vi.fn(async () => flagshipBlueprint) },
      flagshipRegistry: flagshipUnitRegistry, researchRepository: beforeExpiry,
    });
    const beforePlanning = new D1PlanningRepository(db as unknown as D1Database, {
      sourceResolver: beforeResolver, createId: () => `planning-record-${++planningId}`,
      now: () => new Date("2026-09-01T00:00:00.000Z"),
    });
    const generated = await new PlanningService({
      repository: beforePlanning, sourceResolver: beforeResolver,
      createId: () => "research-workspace-1", now: () => new Date("2026-09-01T00:00:00.000Z"),
    }).generate(ownerId, request());

    const expiredResearch = new D1ResearchRepository(db as unknown as D1Database, {
      now: () => Date.parse("2026-10-15T00:00:00.000Z"),
    });
    const flagshipFallback = vi.fn(async () => { throw new Error("no flagship fallback"); });
    const expiredResolver = new PlanningSourceResolver({
      intelligence: { getPublished: flagshipFallback },
      flagshipRegistry: flagshipUnitRegistry, researchRepository: expiredResearch,
    });
    const expiredPlanning = new D1PlanningRepository(db as unknown as D1Database, {
      sourceResolver: expiredResolver, createId: () => `planning-record-${++planningId}`,
      now: () => new Date("2026-10-15T00:00:00.000Z"),
    });
    let eventId = 0;
    const expiredService = new PlanningService({
      repository: expiredPlanning, sourceResolver: expiredResolver,
      createId: () => `research-event-${++eventId}`, now: () => new Date("2026-10-15T00:00:00.000Z"),
    });
    await expect(expiredResolver.resolveForGenerate(ownerId, { source: "research", researchRunId }))
      .rejects.toMatchObject({ name: "PlanningSourceUnavailableError" });
    expect(flagshipFallback).not.toHaveBeenCalled();
    const completed = await expiredService.appendEvent(ownerId, {
      mutationId: "mutation-complete-expired",
      baseVersionId: generated.workspace.activePlanVersionId,
      event: {
        kind: "completed", unitId: generated.workspace.dailyUnits[0]!.id,
        actualMinutes: generated.workspace.dailyUnits[0]!.estimatedMinutes, planningDate: "2026-09-01",
      },
    });
    expect(completed.workspace.events.at(-1)?.kind).toBe("completed");
    const delayedUnit = completed.workspace.dailyUnits.find(({ planVersionId, id }) =>
      planVersionId === completed.workspace.activePlanVersionId && id !== generated.workspace.dailyUnits[0]!.id);
    if (!delayedUnit) throw new Error("Expected another Research unit");
    const proposed = await expiredService.appendEvent(ownerId, {
      mutationId: "mutation-delay-expired",
      baseVersionId: completed.workspace.activePlanVersionId,
      event: { kind: "delayed", unitId: delayedUnit.id, planningDate: "2026-09-01" },
    });
    expect(proposed.outcome).toBe("proposed");
    if (!proposed.workspace.pendingPlanVersionId) throw new Error("Expected Research replan proposal");
    const accepted = await expiredService.acceptReplan(ownerId, {
      mutationId: "mutation-accept-expired",
      baseVersionId: proposed.workspace.activePlanVersionId,
      candidatePlanVersionId: proposed.workspace.pendingPlanVersionId,
    });
    expect(accepted.outcome).toBe("accepted");
    expect(accepted.workspace.events.map(({ kind }) => kind)).toEqual(["completed", "delayed", "replan_accepted"]);
    expect((await expiredPlanning.load({ ownerId, goalId }))?.sourceReference).toMatchObject({
      source: "research", researchRunId, packageId: researchPackage.id,
    });
    db.close();
  });
});
