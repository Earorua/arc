import { describe, expect, it, vi } from "vitest";
import { generatePlanningRequestSchema, planningMutationResponseSchema, planningWorkspaceResponseSchema } from "../../app/contracts/planning-api";
import { planningSourceContextSchema, planningSourceReferenceSchema, type PlanningSourceReference } from "../../app/contracts/planning";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { canonicalJson, fingerprint } from "../../app/lib/planning/fingerprint";
import { validateResearchCandidate } from "../../app/server/research/package-validator";
import { PlanningSourceResolver, type PlanningReplayPackageReader, type PlanningSourceResolverDependencies } from "../../app/server/planning/source-resolver";
import { PlanningService } from "../../app/server/planning/service";
import { D1PlanningRepository } from "../../app/server/planning/d1-planning-repository";
import { D1PlanningReplayPackageReader, D1ResearchRepository } from "../../app/server/research/d1-repository";
import { D1ProofRepository } from "../../app/server/proof/d1-proof-repository";
import { ProofService } from "../../app/server/proof/service";
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
  };
}

function replayReader(packageValue: ResearchPackage = researchPackage): PlanningReplayPackageReader {
  return {
    resolveLockedPackage: vi.fn(async (candidateOwner, reference) => {
      if (candidateOwner !== ownerId || reference.researchRunId !== researchRunId) throw new Error("NOT_FOUND");
      const expected = {
        source: "research",
        researchRunId,
        packageId: packageValue.id,
        blueprintId: packageValue.blueprint.id,
        blueprintVersion: packageValue.blueprint.version,
        registryId: packageValue.registry.id,
        registryVersion: packageValue.registry.version,
        configFingerprint,
        contentFingerprint: packageValue.contentFingerprint,
      };
      if (JSON.stringify(reference) !== JSON.stringify(expected)) throw new Error("MISMATCH");
      return structuredClone(packageValue);
    }),
  };
}

function resolver(
  repository: NonNullable<PlanningSourceResolverDependencies["researchRepository"]> = researchRepository(),
  replay: PlanningReplayPackageReader = replayReader(),
) {
  return new PlanningSourceResolver({
    intelligence: { getPublished: vi.fn(async () => structuredClone(flagshipBlueprint)) },
    flagshipRegistry: flagshipUnitRegistry,
    researchRepository: repository,
    replayPackageReader: replay,
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

  it.each([
    ["blueprint version", { blueprint: { ...flagshipBlueprint, version: "2026.08.tampered" } }],
    ["registry id", { registry: { ...flagshipUnitRegistry, id: "tampered-flagship-registry" } }],
    ["registry version", { registry: { ...flagshipUnitRegistry, version: "2026.08.999" } }],
  ] as const)("rejects Flagship source context with a tampered %s", (_label, override) => {
    const context = {
      reference: { source: "flagship", roleId: "ai-native-full-stack-engineer" },
      blueprint: flagshipBlueprint,
      registry: flagshipUnitRegistry,
      ...override,
    };
    expect(planningSourceContextSchema.safeParse(context).success).toBe(false);
  });

  it("resolves an owner Ready package into an immutable exact reference and rejects cross-owner generate", async () => {
    const lockedPackageReader = replayReader();
    const sourceResolver = resolver(researchRepository(), lockedPackageReader);
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
    expect(lockedPackageReader.resolveLockedPackage).not.toHaveBeenCalled();
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
    const lockedPackageReader = replayReader();
    const sourceResolver = resolver(researchRepository(), lockedPackageReader);
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
    expect(lockedPackageReader.resolveLockedPackage).toHaveBeenCalledWith(
      ownerId,
      expect.objectContaining({ source: "research", researchRunId }),
    );
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
      flagshipRegistry: flagshipUnitRegistry,
      researchRepository: beforeExpiry,
      replayPackageReader: new D1PlanningReplayPackageReader(db as unknown as D1Database),
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
      flagshipRegistry: flagshipUnitRegistry,
      researchRepository: expiredResearch,
      replayPackageReader: new D1PlanningReplayPackageReader(db as unknown as D1Database),
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

  it("projects and withdraws Proof for a completed Research daily unit through one real D1 database", async () => {
    const db = createResearchD1();
    seedUser(db, ownerId);
    db.database.prepare(`INSERT INTO career_goals
      (id,user_id,role_id,level,weekly_minutes,target_weeks,status,active_slot)
      VALUES (?1,?2,?3,'beginner',420,18,'active',1)`).run(goalId, ownerId, researchPackage.blueprint.id);
    const research = new D1ResearchRepository(db as unknown as D1Database, {
      now: () => Date.parse("2026-09-01T00:00:00.000Z"), createId: () => researchRunId,
    });
    const created = await research.createOrReplay({
      ownerId, requestId: "request-proof-flow", mutationId: "mutation-proof-research",
      rawRole: "Data Product Manager", normalizedRoleKey: "data-product-manager", locale: "en-US",
      inputFingerprint: "input-proof-flow", configFingerprint,
      activeExpiresAt: Date.parse("2026-09-01T00:01:00.000Z"),
    });
    const researching = await research.transition({
      id: created.run.id, ownerId, expectedVersion: 0, from: "queued", to: "researching",
    });
    const validating = await research.transition({
      id: researching.id, ownerId, expectedVersion: 1, from: "researching", to: "validating",
    });
    await research.saveValidation({
      id: validating.id, ownerId, expectedVersion: 2, result: validation,
      normalizedRoleKey: "data-product-manager", locale: "en-US", configFingerprint,
    });
    const sourceResolver = new PlanningSourceResolver({
      intelligence: { getPublished: vi.fn(async () => flagshipBlueprint) },
      flagshipRegistry: flagshipUnitRegistry,
      researchRepository: research,
      replayPackageReader: new D1PlanningReplayPackageReader(db as unknown as D1Database),
    });
    let id = 0;
    const planningRepository = new D1PlanningRepository(db as unknown as D1Database, {
      sourceResolver, createId: () => `proof-flow-planning-${++id}`,
      now: () => new Date("2026-09-01T00:00:00.000Z"),
    });
    const planning = new PlanningService({
      repository: planningRepository, sourceResolver,
      createId: () => `proof-flow-domain-${++id}`,
      now: () => new Date("2026-09-01T00:00:00.000Z"),
    });
    const generated = await planning.generate(ownerId, request());
    const completedUnit = generated.workspace.dailyUnits[0]!;
    const completed = await planning.appendEvent(ownerId, {
      mutationId: "mutation-proof-complete",
      baseVersionId: generated.workspace.activePlanVersionId,
      event: {
        kind: "completed", unitId: completedUnit.id,
        actualMinutes: completedUnit.estimatedMinutes, planningDate: "2026-09-01",
      },
    });
    expect(completed.workspace.events.at(-1)?.kind).toBe("completed");

    const proofRepository = new D1ProofRepository(db as unknown as D1Database, () => Date.parse("2026-09-01T01:00:00.000Z"));
    const proof = new ProofService({
      repository: proofRepository,
      blueprint: flagshipBlueprint,
      registry: flagshipUnitRegistry,
      planningSource: { repository: planningRepository, resolver: sourceResolver },
      createId: () => `proof-flow-ledger-${++id}`,
      now: () => new Date("2026-09-01T01:00:00.000Z"),
    });
    const submitted = await proof.create(ownerId, {
      mutationId: "mutation-proof-submit", baseRevision: 0, intent: "submit", validatorKey: null,
      dailyUnitId: completedUnit.id, title: "Research learning artifact", kind: "document",
      summary: "Shows the completed Research learning unit with reviewable evidence.",
      artifactUrl: "https://example.com/research-proof", assetId: null,
      skillIds: [completedUnit.skillId], completionCriteria: completedUnit.completionCriteria,
      visibility: "private",
    });
    expect(submitted.outcome).toBe("demonstrated");
    expect(submitted.workspace.projections.find(({ skillId, audience }) =>
      skillId === completedUnit.skillId && audience === "internal")?.status).toBe("demonstrated");

    for (const foreignSkill of ["testing", "foreign-research-skill"]) {
      await expect(proof.create(ownerId, {
        mutationId: `mutation-reject-${foreignSkill}`, baseRevision: 1, intent: "submit", validatorKey: null,
        dailyUnitId: null, title: "Foreign artifact", kind: "document",
        summary: "Must never enter the Research-backed evidence projection.",
        artifactUrl: "https://example.com/foreign-proof", assetId: null,
        skillIds: [foreignSkill], completionCriteria: ["Must be rejected"], visibility: "private",
      })).rejects.toMatchObject({ code: "INVALID_INPUT", issues: ["skill"] });
    }
    const withdrawn = await proof.withdraw(ownerId, submitted.workspace.versions[0]!.proofId, {
      mutationId: "mutation-proof-withdraw", baseRevision: 1,
    });
    expect(withdrawn.workspace.projections.find(({ skillId, audience }) =>
      skillId === completedUnit.skillId && audience === "internal")?.status).toBe("exploring");
    db.close();
  });

  it.each([
    "missing-package",
    "corrupt-package",
    "cross-owner-run",
    "substituted-package-reference",
    "blueprint-id",
    "blueprint-version",
    "registry-id",
    "registry-version",
    "config-fingerprint",
    "content-fingerprint",
    "domain-integrity",
  ] as const)("fails closed without writes for expired locked replay corruption: %s", async (kind) => {
    const db = createResearchD1();
    seedUser(db, ownerId);
    seedUser(db, "owner-research-other");
    db.database.prepare(`INSERT INTO career_goals
      (id,user_id,role_id,level,weekly_minutes,target_weeks,status,active_slot)
      VALUES (?1,?2,?3,'beginner',420,18,'active',1)`).run(goalId, ownerId, researchPackage.blueprint.id);
    const research = new D1ResearchRepository(db as unknown as D1Database, {
      now: () => Date.parse("2026-09-01T00:00:00.000Z"), createId: () => researchRunId,
    });
    const created = await research.createOrReplay({
      ownerId, requestId: `request-matrix-${kind}`, mutationId: `mutation-matrix-${kind}`,
      rawRole: "Data Product Manager", normalizedRoleKey: "data-product-manager", locale: "en-US",
      inputFingerprint: "input-matrix", configFingerprint,
      activeExpiresAt: Date.parse("2026-09-01T00:01:00.000Z"),
    });
    const researching = await research.transition({
      id: created.run.id, ownerId, expectedVersion: 0, from: "queued", to: "researching",
    });
    const validating = await research.transition({
      id: researching.id, ownerId, expectedVersion: 1, from: "researching", to: "validating",
    });
    await research.saveValidation({
      id: validating.id, ownerId, expectedVersion: 2, result: validation,
      normalizedRoleKey: "data-product-manager", locale: "en-US", configFingerprint,
    });
    const freshResolver = new PlanningSourceResolver({
      intelligence: { getPublished: vi.fn(async () => flagshipBlueprint) },
      flagshipRegistry: flagshipUnitRegistry,
      researchRepository: research,
      replayPackageReader: new D1PlanningReplayPackageReader(db as unknown as D1Database),
    });
    let id = 0;
    const freshRepository = new D1PlanningRepository(db as unknown as D1Database, {
      sourceResolver: freshResolver, createId: () => `matrix-record-${kind}-${++id}`,
      now: () => new Date("2026-09-01T00:00:00.000Z"),
    });
    const freshService = new PlanningService({
      repository: freshRepository, sourceResolver: freshResolver,
      createId: () => `matrix-domain-${kind}-${++id}`,
      now: () => new Date("2026-09-01T00:00:00.000Z"),
    });
    const generated = await freshService.generate(ownerId, {
      ...request(), mutationId: `mutation-generate-${kind}`,
    });
    const delayedUnit = generated.workspace.dailyUnits[0]!;
    const proposed = await freshService.appendEvent(ownerId, {
      mutationId: `mutation-seed-delay-${kind}`,
      baseVersionId: generated.workspace.activePlanVersionId,
      event: { kind: "delayed", unitId: delayedUnit.id, planningDate: "2026-09-01" },
    });
    if (!proposed.workspace.pendingPlanVersionId) throw new Error("Expected a pending replay candidate");

    const sourcePath = "$.sourceReference";
    const updateReference = (field: string, value: string) => db.database.prepare(
      `UPDATE idempotency_records SET response_json=json_set(response_json,'${sourcePath}.${field}',?1)
       WHERE mutation_id=?2`,
    ).run(value, `mutation-generate-${kind}`);
    if (kind === "missing-package") {
      db.database.exec("PRAGMA foreign_keys=OFF");
      db.database.prepare("DELETE FROM research_packages WHERE id=?1").run(researchPackage.id);
    } else if (kind === "corrupt-package") {
      db.database.prepare("UPDATE research_packages SET package_json='{}' WHERE id=?1").run(researchPackage.id);
    } else if (kind === "cross-owner-run") {
      db.database.exec("PRAGMA foreign_keys=OFF");
      db.database.prepare("UPDATE research_runs SET user_id=?1 WHERE id=?2").run("owner-research-other", researchRunId);
    } else if (kind === "substituted-package-reference") updateReference("packageId", "research-package-substitute");
    else if (kind === "blueprint-id") updateReference("blueprintId", "research-blueprint-substitute");
    else if (kind === "blueprint-version") updateReference("blueprintVersion", "2026.08.999");
    else if (kind === "registry-id") updateReference("registryId", "research-registry-substitute");
    else if (kind === "registry-version") updateReference("registryVersion", "2026.08.999");
    else if (kind === "config-fingerprint") updateReference("configFingerprint", "config-fingerprint-substitute");
    else if (kind === "content-fingerprint") updateReference("contentFingerprint", "p2-00000000000000000000000000000000");
    else {
      const forged = structuredClone(researchPackage);
      forged.blueprint.skills[0]!.prerequisiteIds = [forged.blueprint.skills[0]!.id];
      const content: Partial<ResearchPackage> = structuredClone(forged);
      delete content.contentFingerprint;
      forged.contentFingerprint = fingerprint(canonicalJson(content));
      db.database.prepare(`UPDATE research_packages
        SET package_json=?1,content_fingerprint=?2 WHERE id=?3`)
        .run(JSON.stringify(forged), forged.contentFingerprint, forged.id);
      updateReference("contentFingerprint", forged.contentFingerprint);
    }

    const flagshipFallback = vi.fn(async () => flagshipBlueprint);
    const expiredResolver = new PlanningSourceResolver({
      intelligence: { getPublished: flagshipFallback },
      flagshipRegistry: flagshipUnitRegistry,
      researchRepository: new D1ResearchRepository(db as unknown as D1Database, {
        now: () => Date.parse("2026-10-15T00:00:00.000Z"),
      }),
      replayPackageReader: new D1PlanningReplayPackageReader(db as unknown as D1Database),
    });
    const expiredRepository = new D1PlanningRepository(db as unknown as D1Database, {
      sourceResolver: expiredResolver, createId: () => `matrix-expired-${kind}-${++id}`,
      now: () => new Date("2026-10-15T00:00:00.000Z"),
    });
    const expiredService = new PlanningService({
      repository: expiredRepository, sourceResolver: expiredResolver,
      createId: () => `matrix-expired-domain-${kind}-${++id}`,
      now: () => new Date("2026-10-15T00:00:00.000Z"),
    });
    const tableCounts = () => Object.fromEntries([
      "planning_events", "plan_versions", "daily_units", "learning_path_versions",
    ].map((table) => [table, (db.database.prepare(`SELECT count(*) count FROM ${table}`).get() as { count: number }).count]));
    const before = tableCounts();
    await expect(expiredRepository.load({ ownerId, goalId })).rejects.toMatchObject({ name: "PlanningUnavailableError" });
    await expect(expiredService.appendEvent(ownerId, {
      mutationId: `mutation-matrix-complete-${kind}`,
      baseVersionId: proposed.workspace.activePlanVersionId,
      event: {
        kind: "completed", unitId: delayedUnit.id,
        actualMinutes: delayedUnit.estimatedMinutes, planningDate: "2026-09-01",
      },
    })).rejects.toMatchObject({ code: "PLANNING_UNAVAILABLE" });
    await expect(expiredService.appendEvent(ownerId, {
      mutationId: `mutation-matrix-delay-${kind}`,
      baseVersionId: proposed.workspace.activePlanVersionId,
      event: { kind: "delayed", unitId: delayedUnit.id, planningDate: "2026-09-01" },
    })).rejects.toMatchObject({ code: "PLANNING_UNAVAILABLE" });
    await expect(expiredService.acceptReplan(ownerId, {
      mutationId: `mutation-matrix-accept-${kind}`,
      baseVersionId: proposed.workspace.activePlanVersionId,
      candidatePlanVersionId: proposed.workspace.pendingPlanVersionId,
    })).rejects.toMatchObject({ code: "PLANNING_UNAVAILABLE" });
    expect(tableCounts()).toEqual(before);
    expect(flagshipFallback).not.toHaveBeenCalled();
    db.close();
  });
});
