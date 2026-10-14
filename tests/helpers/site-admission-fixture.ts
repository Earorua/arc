import { createResearchD1, seedUser } from "./sqlite-d1";
import { fingerprint } from "../../app/lib/planning/fingerprint";
import { D1EntitlementRepository } from "../../app/server/entitlements/d1-entitlement-repository";
import { D1ResearchBudgetRepository } from "../../app/server/research/d1-budget-repository";
import { D1ResearchRepository } from "../../app/server/research/d1-repository";
import { D1SiteExecutionRepository } from "../../app/server/research/d1-site-execution-repository";
import { D1SiteBeginRepository } from "../../app/server/research/d1-site-begin-repository";
import type { CreateRemoteResearchRunCommand, CreateResearchRunCommand, RemoteCreationPolicy } from "../../app/server/research/repository";
import type { RemoteResearchQuotaAdmission } from "../../app/server/entitlements/repository";
import type { SiteExecutionRecord } from "../../app/server/research/site-execution-repository";
import type { RemoteBudgetReleaseBeforeBeginCommand, RemoteBudgetReserveCommand } from "../../app/server/research/budget";
import { validateResearchCandidate } from "../../app/server/research/package-validator";
import { SiteAdmissionCoordinator } from "../../app/server/research/site-admission";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";

const NOW = Date.parse("2026-09-15T12:00:00.000Z");

export function createControlPoint() {
  let enter!: () => void;
  let resume!: () => void;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  const resumed = new Promise<void>((resolve) => { resume = resolve; });
  return { entered, resume, wait: async () => { enter(); await resumed; } };
}

export function createSiteAdmissionFixture(filename = ":memory:") {
  const db = createResearchD1(filename);
  seedUser(db, "owner-a");
  seedUser(db, "owner-b");

  let appNow = NOW;
  let sqlNow = NOW;
  let commandSequence = 0;
  let researchSequence = 0;
  let jobSequence = 0;
  let quotaSequence = 0;
  let budgetSequence = 0;

  db.database.function("unixepoch", { varargs: true }, (...args: unknown[]) => {
    if (args.length === 0) return Math.floor(sqlNow / 1_000);
    if (args.length === 1 && args[0] === "subsec") return sqlNow / 1_000;
    throw new Error("Unexpected SQL clock call in this fixture");
  });

  const research = new D1ResearchRepository(db as unknown as D1Database, {
    now: () => appNow,
    createId: () => `research-run-${++researchSequence}`,
    createJobId: () => `00000000-0000-4000-8000-${String(++jobSequence).padStart(12, "0")}`,
  });
  const executions = new D1SiteExecutionRepository(db as unknown as D1Database, research);
  const begin = new D1SiteBeginRepository(db as unknown as D1Database, research, executions);
  const quota = new D1EntitlementRepository(db as unknown as D1Database, {
    now: () => appNow,
    createId: () => `quota-${++quotaSequence}`,
  });
  const budget = new D1ResearchBudgetRepository(db as unknown as D1Database, {
    now: () => appNow,
    createId: () => `budget-${++budgetSequence}`,
  });
  const coordinator = new SiteAdmissionCoordinator({
    research,
    executions,
    entitlements: quota,
    budget,
    now: () => appNow,
  });

  const command = (ownerId = "owner-a"): CreateResearchRunCommand => {
    const sequence = ++commandSequence;
    return {
      ownerId,
      requestId: `request-${sequence}`,
      mutationId: `mutation-${sequence}`,
      rawRole: "Data Product Manager",
      normalizedRoleKey: "data product manager",
      locale: "en-US",
      inputFingerprint: fingerprint(["data product manager", "en-US"]),
      configFingerprint: fingerprint(["synthetic-current-config"]),
      activeExpiresAt: appNow + 120_000,
    };
  };

  const remoteCommand = (ownerId = "owner-a"): CreateRemoteResearchRunCommand => {
    const base = command(ownerId);
    return {
      ownerId: base.ownerId,
      requestId: base.requestId,
      mutationId: base.mutationId,
      rawRole: base.rawRole,
      normalizedRoleKey: base.normalizedRoleKey,
      locale: base.locale,
      inputFingerprint: base.inputFingerprint,
      configFingerprint: base.configFingerprint,
      policy: {
        cacheDays: 30,
        userDailyQuota: 3,
        dailyBudgetMicros: 20_000_000,
        monthlyBudgetMicros: 100_000_000,
        maximumMicros: 5_000_000,
      },
    };
  };

  const createRemote = async (ownerId = "owner-a", policy: Partial<RemoteCreationPolicy> = {}) => {
    const input = remoteCommand(ownerId);
    const created = await research.createRemoteOrReplay({ ...input, policy: { ...input.policy, ...policy } });
    if (!created.execution) throw new Error("remote fixture requires a durable execution");
    const stored = await executions.read(ownerId, created.run.id);
    if (!stored) throw new Error("remote fixture could not read its durable execution");
    return { ...created, execution: stored };
  };

  const createFreshCachePackage = async (ownerId = "owner-a") => {
    const created = await research.createOrReplay(command(ownerId));
    const researching = await research.transition({
      id: created.run.id,
      ownerId,
      expectedVersion: created.run.stateVersion,
      from: "queued",
      to: "researching",
    });
    const validating = await research.transition({
      id: researching.id,
      ownerId,
      expectedVersion: researching.stateVersion,
      from: "researching",
      to: "validating",
    });
    const result = validateResearchCandidate(validResearchCandidate, validAnnotations, {
      packageId: `research-package-cache-${commandSequence}`,
      blueprintVersion: "2026.09.1",
      registryVersion: "2026.09.1",
      templateVersion: "2026.09.1",
      promptVersion: "research-prompt-v1",
      inputSchemaVersion: "research-input-v1",
      outputSchemaVersion: "research-output-v1",
      qualityVersion: "research-quality-v1",
      modelConfigVersion: "research-model-v1",
      observedAt: new Date(appNow).toISOString().slice(0, 10),
      expiresAt: new Date(appNow + 30 * 86_400_000).toISOString().slice(0, 10),
    });
    if (!result.ready) throw new Error("fresh cache fixture must validate");
    const ready = await research.saveValidation({
      id: validating.id,
      ownerId,
      expectedVersion: validating.stateVersion,
      result,
      normalizedRoleKey: validating.normalizedRoleKey,
      locale: validating.locale,
      configFingerprint: validating.configFingerprint,
    });
    return { run: ready, package: result.package };
  };

  const quotaCommand = (execution: SiteExecutionRecord): RemoteResearchQuotaAdmission => ({
    ownerId: execution.ownerId,
    runId: execution.runId,
    requestId: execution.requestId,
    jobId: execution.jobId,
    requestHash: execution.requestHash,
    userId: execution.ownerId,
    purpose: "role-research",
    idempotencyKey: execution.quotaKey,
    units: 1,
    dailyQuota: execution.policy.userDailyQuota,
    period: {
      startMs: Date.UTC(new Date(appNow).getUTCFullYear(), new Date(appNow).getUTCMonth(), new Date(appNow).getUTCDate()),
      endMs: Date.UTC(new Date(appNow).getUTCFullYear(), new Date(appNow).getUTCMonth(), new Date(appNow).getUTCDate()) + 86_400_000,
    },
  });

  const budgetCommand = (execution: SiteExecutionRecord): RemoteBudgetReserveCommand => ({
    ownerId: execution.ownerId,
    runId: execution.runId,
    requestId: execution.requestId,
    jobId: execution.jobId,
    requestHash: execution.requestHash,
    expiresAt: execution.reservationExpiresAt,
    dailyBudgetMicros: execution.policy.dailyBudgetMicros,
    monthlyBudgetMicros: execution.policy.monthlyBudgetMicros,
    maximumMicros: execution.policy.maximumMicros,
  });

  const reserveAdmission = async (execution: SiteExecutionRecord) => {
    const quotaDecision = await quota.admitRemoteResearch(quotaCommand(execution));
    const budgetDecision = await budget.reserveRemote(budgetCommand(execution));
    if (!quotaDecision.allowed || !budgetDecision.allowed) throw new Error("remote admission fixture reservation denied");
    return {
      quotaReservationId: quotaDecision.reservationId,
      budgetReservationId: budgetDecision.reservation.id,
    };
  };

  const admissionCommand = (
    execution: SiteExecutionRecord,
    reservations: Awaited<ReturnType<typeof reserveAdmission>>,
  ) => ({
    ownerId: execution.ownerId,
    runId: execution.runId,
    requestId: execution.requestId,
    jobId: execution.jobId,
    requestHash: execution.requestHash,
    expectedVersion: execution.version,
    ...reservations,
  });

  const closeCommand = (
    execution: SiteExecutionRecord,
    reason: "denied" | "expired" | "interrupted" = "denied",
  ) => ({
    ownerId: execution.ownerId,
    runId: execution.runId,
    requestId: execution.requestId,
    jobId: execution.jobId,
    requestHash: execution.requestHash,
    reason,
  });

  const releaseCommand = (
    execution: SiteExecutionRecord,
    reservationId: string,
  ): RemoteBudgetReleaseBeforeBeginCommand => ({
    ownerId: execution.ownerId,
    runId: execution.runId,
    requestId: execution.requestId,
    jobId: execution.jobId,
    requestHash: execution.requestHash,
    reservationId,
  });

  const readCounts = () => {
    const count = (table: "research_runs" | "idempotency_records" | "research_site_executions" | "quota_ledger" | "ai_budget_reservations") => {
      const row = db.database.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number };
      return row.count;
    };
    return {
      researchRuns: count("research_runs"),
      idempotencyRecords: count("idempotency_records"),
      siteExecutions: count("research_site_executions"),
      quotaLedger: count("quota_ledger"),
      aiBudgetReservations: count("ai_budget_reservations"),
    };
  };

  return {
    db,
    research,
    executions,
    begin,
    quota,
    budget,
    coordinator,
    command,
    remoteCommand,
    createRemote,
    createFreshCachePackage,
    quotaCommand,
    budgetCommand,
    reserveAdmission,
    admissionCommand,
    closeCommand,
    releaseCommand,
    setSqlNow: (value: number) => { sqlNow = value; },
    setAppNow: (value: number) => { appNow = value; },
    readCounts,
  };
}
