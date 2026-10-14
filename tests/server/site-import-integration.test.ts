// @vitest-environment node

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import type { ResearchPackage } from "../../app/contracts/research";
import { D1AiRunSink } from "../../app/server/ai/d1-run-recorder";
import { D1CloudRepository } from "../../app/server/cloud/d1-cloud-repository";
import { CloudService } from "../../app/server/cloud/service";
import { D1EntitlementRepository } from "../../app/server/entitlements/d1-entitlement-repository";
import { D1PlanningRepository } from "../../app/server/planning/d1-planning-repository";
import { PlanningService } from "../../app/server/planning/service";
import { PlanningSourceResolver } from "../../app/server/planning/source-resolver";
import { D1ResearchBudgetRepository } from "../../app/server/research/d1-budget-repository";
import { D1ResearchRepository, D1PlanningReplayPackageReader } from "../../app/server/research/d1-repository";
import { D1SiteExecutionRepository } from "../../app/server/research/d1-site-execution-repository";
import { D1SiteImportPublication } from "../../app/server/research/d1-site-import-publication";
import { D1SiteImportRepository } from "../../app/server/research/d1-site-import-repository";
import { SiteImportCoordinator } from "../../app/server/research/site-import";
import { createSiteImportFixture, validReceipt } from "../helpers/site-import-fixture";
import { SqliteD1 } from "../helpers/sqlite-d1";

const ORIGINAL_NOW = Date.parse("2026-09-15T12:00:00.000Z");
const EXPIRED_NOW = Date.parse("2026-10-16T00:00:00.000Z");
const COST_MICROS = 123_456;
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    const target = resolve(directory);
    const parent = resolve(tmpdir());
    if (!target.startsWith(`${parent}${sep}`) || !target.split(sep).at(-1)?.startsWith("site-import-native-")) {
      throw new Error("Refusing to remove an unexpected fixture directory");
    }
    rmSync(target, { recursive: true, force: true });
  }
});

type Fixture = Awaited<ReturnType<typeof createSiteImportFixture>>;

function coordinator(
  db: D1Database,
  research: D1ResearchRepository,
  executions: D1SiteExecutionRepository,
) {
  const imports = new D1SiteImportRepository(db, research, executions);
  return {
    imports,
    service: new SiteImportCoordinator({
      imports,
      publication: new D1SiteImportPublication(db, research, executions),
      research,
      audits: new D1AiRunSink(db),
      entitlements: new D1EntitlementRepository(db),
      budget: new D1ResearchBudgetRepository(db),
    }),
  };
}

function scalar(db: SqliteD1, sql: string): number {
  return (db.database.prepare(sql).get() as { value: number }).value;
}

function budgetBuckets(db: SqliteD1) {
  return db.database.prepare(`SELECT id,reserved_micros,settled_micros
    FROM ai_budget_buckets ORDER BY id`).all() as Array<{
      id: string;
      reserved_micros: number;
      settled_micros: number;
    }>;
}

function durableCounts(db: SqliteD1) {
  return Object.fromEntries([
    "role_blueprints",
    "role_blueprint_versions",
    "role_skill_definitions",
    "role_skill_edges",
    "learning_resources",
    "resource_skill_links",
    "research_packages",
    "research_source_audits",
    "research_site_imports",
    "ai_runs",
    "quota_ledger",
    "ai_budget_reservations",
    "planning_workspaces",
    "planning_events",
    "skill_audit_versions",
    "availability_versions",
    "learning_path_versions",
    "plan_versions",
    "daily_units",
  ].map((table) => [table, scalar(db, `SELECT count(*) value FROM ${table}`)]));
}

function cloudImport(roleId: string, migrationId: string) {
  return {
    migrationId,
    consent: true,
    conflictResolution: "reject" as const,
    intent: "research-setup" as const,
    state: {
      setup: { roleId, level: "beginner" as const, weeklyMinutes: 420, targetWeeks: 18 },
      completedUnitIds: [],
      proofs: [],
    },
  };
}

function planningRequest(packageValue: ResearchPackage, researchRunId: string, mutationId: string) {
  return {
    mutationId,
    source: { source: "research" as const, researchRunId },
    planningDate: "2026-09-15",
    audit: {
      id: `${mutationId}-audit`,
      schemaVersion: "2026.08.1",
      blueprintId: packageValue.blueprint.id,
      blueprintVersion: packageValue.blueprint.version,
      answers: packageValue.blueprint.skills.map(({ id: skillId }) => ({
        skillId,
        level: "conceptual" as const,
        evidenceRefs: [],
      })),
      evidence: [],
      createdBy: "learner" as const,
      inputFingerprint: `${mutationId}-audit-fingerprint`,
    },
    availability: {
      id: `${mutationId}-availability`,
      schemaVersion: "2026.08.1",
      timeZone: "Asia/Shanghai",
      weekdays: {
        monday: 60,
        tuesday: 60,
        wednesday: 60,
        thursday: 60,
        friday: 60,
        saturday: 60,
        sunday: 60,
      },
      exceptions: [],
      weeklyMinutes: 420,
      inputFingerprint: `${mutationId}-availability-fingerprint`,
    },
    target: {
      id: `${mutationId}-target`,
      schemaVersion: "2026.08.1",
      targetWeeks: 18,
      inputFingerprint: `${mutationId}-target-fingerprint`,
    },
    selectedScope: "full-scope" as const,
  };
}

function makePlanning(
  db: D1Database,
  research: D1ResearchRepository,
  now: () => Date,
  prefix: string,
) {
  const intelligenceFallback = vi.fn(async () => {
    throw new Error("FLAGSHIP_FALLBACK_DENIED");
  });
  const sourceResolver = new PlanningSourceResolver({
    intelligence: { getPublished: intelligenceFallback },
    flagshipRegistry: flagshipUnitRegistry,
    researchRepository: research,
    replayPackageReader: new D1PlanningReplayPackageReader(db),
  });
  let sequence = 0;
  const repository = new D1PlanningRepository(db, {
    sourceResolver,
    createId: () => `${prefix}-record-${++sequence}`,
    now,
  });
  const service = new PlanningService({
    repository,
    sourceResolver,
    createId: () => `${prefix}-domain-${++sequence}`,
    now,
  });
  return { intelligenceFallback, sourceResolver, repository, service };
}

async function activate(
  db: D1Database,
  ownerId: string,
  roleId: string,
  migrationId: string,
  prefix: string,
) {
  let sequence = 0;
  const cloud = new CloudService(new D1CloudRepository(db, {
    createId: () => `${prefix}-${++sequence}`,
    now: () => new Date(ORIGINAL_NOW),
  }));
  const request = cloudImport(roleId, migrationId);
  const imported = await cloud.importLocalState(ownerId, request);
  if (!imported.activeGoalId) throw new Error("Expected an active cloud goal");
  return { cloud, request, imported };
}

describe("native Site import activation and planning integration", () => {
  it("persists one owner-isolated imported package and reopens its exact idempotent Research plan", async () => {
    const directory = mkdtempSync(join(tmpdir(), "site-import-native-"));
    temporaryDirectories.push(directory);
    const filename = join(directory, "research.sqlite");
    let fixture: Fixture | null = await createSiteImportFixture(filename);
    let reopened: SqliteD1 | null = null;

    try {
      const f = fixture;
      const receipt = validReceipt(f.execution, COST_MICROS);
      const beforeBudget = budgetBuckets(f.db);
      const native = coordinator(
        f.db as unknown as D1Database,
        f.research,
        f.executions,
      );

      const completed = await native.service.complete(f.identity, receipt);
      const packageValue = await f.research.resolveReadyPackage(f.identity.ownerId, f.identity.runId);
      const completedJournal = await native.imports.read(f.identity);

      expect(completed).toMatchObject({
        run: {
          id: f.identity.runId,
          ownerId: f.identity.ownerId,
          requestId: f.identity.requestId,
          state: "ready",
          packageId: f.execution.validationContext.packageId,
          configFingerprint: f.execution.job.configFingerprint,
          executionMode: "cloudflare-workflow-v1",
        },
        accounting: "settled",
      });
      expect(packageValue).toMatchObject({
        id: f.execution.validationContext.packageId,
        blueprint: { version: f.execution.validationContext.blueprintVersion },
        registry: { version: f.execution.validationContext.registryVersion },
        promptVersion: f.execution.validationContext.promptVersion,
        inputSchemaVersion: f.execution.validationContext.inputSchemaVersion,
        outputSchemaVersion: f.execution.validationContext.outputSchemaVersion,
        qualityVersion: f.execution.validationContext.qualityVersion,
        modelConfigVersion: f.execution.validationContext.modelConfigVersion,
        observedAt: "2026-09-15",
        expiresAt: "2026-10-15",
      });
      expect(packageValue.qualityReport).toEqual(completed.run.quality);
      expect(completedJournal).toMatchObject({
        phase: 5,
        decision: null,
        ownerId: f.identity.ownerId,
        runId: f.identity.runId,
        requestId: f.identity.requestId,
        jobId: f.identity.jobId,
        requestHash: f.identity.requestHash,
        configFingerprint: f.execution.job.configFingerprint,
        validationContext: f.execution.validationContext,
        executionVersion: f.execution.version,
        audit: {
          latencyMs: 123,
          usage: { costMicros: COST_MICROS },
          promptVersion: f.execution.validationContext.promptVersion,
          inputSchemaVersion: f.execution.validationContext.inputSchemaVersion,
          outputSchemaVersion: f.execution.validationContext.outputSchemaVersion,
        },
      });
      expect(durableCounts(f.db)).toMatchObject({
        role_blueprints: 1,
        role_blueprint_versions: 1,
        role_skill_definitions: packageValue.blueprint.skills.length,
        role_skill_edges: packageValue.blueprint.skills.reduce(
          (total, skill) => total + skill.prerequisiteIds.length,
          0,
        ),
        learning_resources: new Set(packageValue.blueprint.resources.map(({ url }) => url)).size,
        resource_skill_links: packageValue.blueprint.resources.reduce(
          (total, resource) => total + resource.skillIds.length,
          0,
        ),
        research_packages: 1,
        research_source_audits: packageValue.sourceEvidence.length,
        research_site_imports: 1,
        ai_runs: 1,
        quota_ledger: 2,
        ai_budget_reservations: 1,
      });
      expect(scalar(f.db, "SELECT count(*) value FROM quota_ledger WHERE entry_kind<>'reserved'"))
        .toBe(1);
      expect(budgetBuckets(f.db)).toEqual(beforeBudget.map((bucket) => ({
        ...bucket,
        reserved_micros: bucket.reserved_micros - f.execution.policy.maximumMicros,
        settled_micros: bucket.settled_micros + COST_MICROS,
      })));

      const effectsAfterFirstCompletion = {
        journal: completedJournal,
        counts: durableCounts(f.db),
        budget: budgetBuckets(f.db),
      };
      await expect(coordinator(
        f.db as unknown as D1Database,
        f.research,
        f.executions,
      ).service.complete(f.identity, receipt)).resolves.toEqual(completed);
      expect({
        journal: await native.imports.read(f.identity),
        counts: durableCounts(f.db),
        budget: budgetBuckets(f.db),
      }).toEqual(effectsAfterFirstCompletion);

      const ownerAActivation = await activate(
        f.db as unknown as D1Database,
        "owner-a",
        packageValue.blueprint.id,
        "migration-native-owner-a",
        "cloud-owner-a",
      );
      expect(ownerAActivation.imported).toMatchObject({ status: "imported" });
      await expect(ownerAActivation.cloud.importLocalState("owner-a", ownerAActivation.request))
        .resolves.toMatchObject({
          status: "already-imported",
          activeGoalId: ownerAActivation.imported.activeGoalId,
        });
      await expect(ownerAActivation.cloud.getWorkspace("owner-a")).resolves.toMatchObject({
        activeGoalId: ownerAActivation.imported.activeGoalId,
        state: { setup: { roleId: packageValue.blueprint.id } },
      });

      const ownerBActivation = await activate(
        f.db as unknown as D1Database,
        "owner-b",
        "ai-native-full-stack-engineer",
        "migration-native-owner-b",
        "cloud-owner-b",
      );
      expect(ownerBActivation.imported).toMatchObject({ status: "imported" });
      expect(ownerBActivation.imported.activeGoalId).not.toBe(ownerAActivation.imported.activeGoalId);

      const planning = makePlanning(
        f.db as unknown as D1Database,
        f.research,
        () => new Date(ORIGINAL_NOW),
        "native-planning",
      );
      const request = planningRequest(packageValue, f.identity.runId, "mutation-native-generation");
      const generated = await planning.service.generateResponse("owner-a", request);
      const sourceContext = generated.sourceContext;
      if (!sourceContext) throw new Error("Expected persisted Research source context");
      expect(generated.result.workspace.dailyUnits.length).toBeGreaterThan(0);
      expect(sourceContext.reference).toEqual({
        source: "research",
        researchRunId: f.identity.runId,
        packageId: packageValue.id,
        blueprintId: packageValue.blueprint.id,
        blueprintVersion: packageValue.blueprint.version,
        registryId: packageValue.registry.id,
        registryVersion: packageValue.registry.version,
        configFingerprint: f.execution.job.configFingerprint,
        contentFingerprint: packageValue.contentFingerprint,
      });
      expect(sourceContext.blueprint).toEqual(packageValue.blueprint);
      expect(sourceContext.registry).toEqual(packageValue.registry);
      const effectsAfterGeneration = {
        counts: durableCounts(f.db),
        budget: budgetBuckets(f.db),
      };
      expect(effectsAfterGeneration.counts).toMatchObject({
        planning_workspaces: 1,
        planning_events: 0,
        skill_audit_versions: 1,
        availability_versions: 1,
        learning_path_versions: generated.result.workspace.pathVersions.length,
        plan_versions: generated.result.workspace.planVersions.length,
        daily_units: generated.result.workspace.dailyUnits.length,
      });
      await expect(planning.service.generateResponse("owner-a", request)).resolves.toEqual(generated);
      expect({ counts: durableCounts(f.db), budget: budgetBuckets(f.db) })
        .toEqual(effectsAfterGeneration);
      expect(planning.intelligenceFallback).not.toHaveBeenCalled();

      const ownerBPlanning = makePlanning(
        f.db as unknown as D1Database,
        f.research,
        () => new Date(ORIGINAL_NOW),
        "native-owner-b-planning",
      );
      await expect(coordinator(
        f.db as unknown as D1Database,
        f.research,
        f.executions,
      ).service.complete({ ...f.identity, ownerId: "owner-b" }, receipt))
        .rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(f.research.resolveReadyPackage("owner-b", f.identity.runId))
        .rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(ownerBPlanning.sourceResolver.resolveForGenerate("owner-b", {
        source: "research",
        researchRunId: f.identity.runId,
      })).rejects.toMatchObject({ name: "PlanningSourceUnavailableError" });
      if (sourceContext.reference.source !== "research") {
        throw new Error("Expected a Research planning reference");
      }
      await expect(new D1PlanningReplayPackageReader(f.db as unknown as D1Database)
        .resolveLockedPackage("owner-b", sourceContext.reference))
        .rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(ownerBPlanning.service.generateResponse("owner-b", {
        ...request,
        mutationId: "mutation-native-owner-b-generation",
      })).rejects.toMatchObject({ code: "PLANNING_UNAVAILABLE" });
      await expect(ownerBPlanning.service.getWorkspaceResponse("owner-b")).resolves.toEqual({
        workspace: null,
        sourceContext: null,
      });
      expect(ownerBPlanning.intelligenceFallback).not.toHaveBeenCalled();

      f.db.close();
      fixture = null;
      reopened = new SqliteD1(filename);
      reopened.database.exec("PRAGMA foreign_keys=ON");
      expect((reopened.database.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys).toBe(1);
      const reopenedD1 = reopened as unknown as D1Database;
      const expiredResearch = new D1ResearchRepository(reopenedD1, { now: () => EXPIRED_NOW });
      const reopenedExecutions = new D1SiteExecutionRepository(reopenedD1, expiredResearch);
      const reopenedCoordinator = coordinator(reopenedD1, expiredResearch, reopenedExecutions);
      await expect(reopenedCoordinator.service.complete(f.identity, receipt)).resolves.toEqual(completed);
      expect({ counts: durableCounts(reopened), budget: budgetBuckets(reopened) })
        .toEqual(effectsAfterGeneration);

      const reopenedPlanning = makePlanning(
        reopenedD1,
        expiredResearch,
        () => new Date(EXPIRED_NOW),
        "native-reopened-planning",
      );
      await expect(reopenedPlanning.service.getWorkspaceResponse("owner-a")).resolves.toEqual({
        workspace: generated.result.workspace,
        sourceContext,
      });
      await expect(reopenedPlanning.service.generateResponse("owner-a", request)).resolves.toEqual(generated);
      expect({ counts: durableCounts(reopened), budget: budgetBuckets(reopened) })
        .toEqual(effectsAfterGeneration);
      await expect(reopenedPlanning.service.generateResponse("owner-a", {
        ...request,
        mutationId: "mutation-native-new-generation-after-expiry",
      })).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(reopenedPlanning.sourceResolver.resolveForGenerationCommit(
        "owner-a",
        sourceContext.reference,
      )).rejects.toMatchObject({ name: "PlanningSourceUnavailableError" });
      expect(reopenedPlanning.intelligenceFallback).not.toHaveBeenCalled();
    } finally {
      if (fixture) fixture.db.close();
      if (reopened) reopened.close();
    }
  });

  it("rolls back a new imported-package generation when the real source expires before its D1 commit", async () => {
    const f = await createSiteImportFixture();
    try {
      const receipt = validReceipt(f.execution, COST_MICROS);
      await coordinator(
        f.db as unknown as D1Database,
        f.research,
        f.executions,
      ).service.complete(f.identity, receipt);
      const packageValue = await f.research.resolveReadyPackage(f.identity.ownerId, f.identity.runId);
      await activate(
        f.db as unknown as D1Database,
        "owner-a",
        packageValue.blueprint.id,
        "migration-native-expiry-race",
        "cloud-expiry-race",
      );

      let commitNow = ORIGINAL_NOW;
      const planning = makePlanning(
        f.db as unknown as D1Database,
        f.research,
        () => new Date(commitNow),
        "native-expiry-race",
      );
      const realCommitResolution = planning.sourceResolver.resolveForGenerationCommit
        .bind(planning.sourceResolver);
      vi.spyOn(planning.sourceResolver, "resolveForGenerationCommit")
        .mockImplementation(async (ownerId, reference) => {
          const context = await realCommitResolution(ownerId, reference);
          f.setAppNow(EXPIRED_NOW);
          commitNow = EXPIRED_NOW;
          return context;
        });
      const planningTables = [
        "planning_workspaces",
        "planning_events",
        "skill_audit_versions",
        "availability_versions",
        "learning_path_versions",
        "plan_versions",
        "daily_units",
      ] as const;
      const counts = () => Object.fromEntries(planningTables.map((table) => [
        table,
        scalar(f.db, `SELECT count(*) value FROM ${table}`),
      ]));
      const before = counts();

      await expect(planning.service.generateResponse(
        "owner-a",
        planningRequest(packageValue, f.identity.runId, "mutation-native-expiry-race-generation"),
      )).rejects.toMatchObject({ code: "PLANNING_UNAVAILABLE" });

      expect(counts()).toEqual(before);
      expect(planning.intelligenceFallback).not.toHaveBeenCalled();
      await expect(f.research.resolveReadyPackage("owner-a", f.identity.runId))
        .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    } finally {
      f.db.close();
    }
  });
});
