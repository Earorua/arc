import { z } from "zod";
import { researchPackageSchema } from "../../contracts/research";
import type { D1EntitlementRepository } from "../entitlements/d1-entitlement-repository";
import type { ResearchQuotaReservation } from "../entitlements/repository";
import type { BudgetReservation } from "./budget";
import type { D1ResearchBudgetRepository } from "./d1-budget-repository";
import type { RemoteResearchCreationRepository, ResearchRepository, ResearchRunRecord } from "./repository";
import { ResearchRepositoryError } from "./repository";
import { readBoundedResearchJson } from "./source-audit";
import type { SiteAdmissionResult, SiteExecutionIdentity, SiteExecutionRecord, SiteExecutionRepository } from "./site-execution-repository";
import { observeSiteRun, SiteExecutionReadSkew, type SiteRunReadObservation } from "./site-execution-repository";

/** Internal provenance from the initial before-begin read only, never from reservation/mutation errors. */
export class SiteBeforeBeginObservation extends ResearchRepositoryError {
  readonly observedRun: SiteRunReadObservation;
  readonly identity: SiteExecutionIdentity;
  constructor(readonly kind: "already-begun" | "execution-read-skew" | "run-advanced",
    run: SiteRunReadObservation, identity: SiteExecutionIdentity) {
    super(kind === "execution-read-skew" ? "RESEARCH_UNAVAILABLE" : "CONFLICT");
    this.observedRun = observeSiteRun(run);
    this.identity = Object.freeze({ ownerId: identity.ownerId, runId: identity.runId,
      requestId: identity.requestId, jobId: identity.jobId, requestHash: identity.requestHash });
  }
}

export type SiteAdmissionGate = Readonly<{
  newCallsAllowed: boolean;
  cohortEnabled: boolean;
  rateAllowed: boolean;
}>;

export type SiteAdmissionDependencies = Readonly<{
  research: ResearchRepository & RemoteResearchCreationRepository;
  executions: SiteExecutionRepository;
  entitlements: Pick<D1EntitlementRepository, "admitRemoteResearch" | "readResearchReservation" | "finalize">;
  budget: Pick<D1ResearchBudgetRepository, "reserveRemote" | "findReservation" | "releaseRemoteBeforeBegin">;
  now?: () => number;
}>;

const identityText = z.string().min(1).max(160)
  .refine((value) => value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value));
const identitySchema = z.object({
  ownerId: identityText,
  runId: researchPackageSchema.shape.id,
  requestId: identityText,
  jobId: z.uuid(),
  requestHash: z.string().length(64).regex(/^[0-9a-f]{64}$/u),
}).strict();
const gateSchema = z.object({
  newCallsAllowed: z.boolean(),
  cohortEnabled: z.boolean(),
  rateAllowed: z.boolean(),
}).strict();
const timestampSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export class SiteAdmissionCoordinator {
  constructor(private readonly dependencies: SiteAdmissionDependencies) {}

  async admitNew(input: SiteExecutionIdentity, inputGate: SiteAdmissionGate): Promise<SiteAdmissionResult> {
    const identity = snapshot(identitySchema, input);
    const gate = snapshot(gateSchema, inputGate);
    return this.guarded(async () => {
      const pair = await this.readPair(identity);
      const storedIdentity = executionIdentity(pair.execution);
      if (pair.execution.admissionState !== "pending") return this.reconcile(identity, pair);
      if (pair.run.state !== "queued") throw unavailable();

      let existing: Readonly<{ quota: ResearchQuotaReservation | null; budget: BudgetReservation | null }>;
      try { existing = await this.readReservations(pair.execution); }
      catch { return this.closeAndReconcile(storedIdentity, pair, closeReason(pair.execution, this.now())); }
      if (existing.quota || existing.budget) return this.reconcile(identity, pair);

      const now = this.now();
      const cached = await this.dependencies.research.findFreshPackage({
        normalizedRoleKey: pair.run.normalizedRoleKey,
        locale: pair.run.locale,
        configFingerprint: pair.run.configFingerprint,
        now,
      });
      if (cached) {
        return this.dependencies.research.attachRemoteCachedPackage({
          ...storedIdentity,
          expectedRunVersion: pair.run.stateVersion,
          expectedExecutionVersion: pair.execution.version,
          package: cached,
        });
      }

      if (!gate.newCallsAllowed || !gate.cohortEnabled || !gate.rateAllowed) {
        return this.closeAndReconcile(storedIdentity, pair,
          now >= pair.execution.job.queueExpiresAt ? "expired" : "denied");
      }
      if (now >= pair.execution.job.queueExpiresAt || now >= pair.execution.reservationExpiresAt) {
        return this.closeAndReconcile(storedIdentity, pair, "expired");
      }

      let quotaDecision: Awaited<ReturnType<SiteAdmissionDependencies["entitlements"]["admitRemoteResearch"]>>;
      try {
        const dayStart = utcDayStart(now);
        quotaDecision = await this.dependencies.entitlements.admitRemoteResearch({
          ...storedIdentity,
          userId: pair.execution.ownerId,
          purpose: "role-research",
          idempotencyKey: pair.execution.quotaKey,
          units: 1,
          dailyQuota: pair.execution.policy.userDailyQuota,
          period: { startMs: dayStart, endMs: dayStart + 86_400_000 },
        });
      } catch {
        return this.closeAndReconcile(storedIdentity, pair, closeReason(pair.execution, this.now()));
      }
      if (!quotaDecision.allowed) return this.closeAndReconcile(storedIdentity, pair, "denied");

      let budgetDecision: Awaited<ReturnType<SiteAdmissionDependencies["budget"]["reserveRemote"]>>;
      try {
        budgetDecision = await this.dependencies.budget.reserveRemote({
          ...storedIdentity,
          expiresAt: pair.execution.reservationExpiresAt,
          dailyBudgetMicros: pair.execution.policy.dailyBudgetMicros,
          monthlyBudgetMicros: pair.execution.policy.monthlyBudgetMicros,
          maximumMicros: pair.execution.policy.maximumMicros,
        });
      } catch {
        return this.closeAndReconcile(storedIdentity, pair, closeReason(pair.execution, this.now()));
      }
      if (!budgetDecision.allowed) return this.closeAndReconcile(storedIdentity, pair, "denied");

      let durable: Readonly<{ quota: ResearchQuotaReservation | null; budget: BudgetReservation | null }>;
      try {
        durable = await this.readReservations(pair.execution);
        this.assertLiveReservations(pair.execution, durable.quota, durable.budget,
          quotaDecision.reservationId, budgetDecision.reservation.id);
      } catch {
        return this.closeAndReconcile(storedIdentity, pair, closeReason(pair.execution, this.now()));
      }
      try {
        await this.dependencies.executions.markAdmitted({
          ...storedIdentity,
          expectedVersion: pair.execution.version,
          quotaReservationId: durable.quota!.reservationId,
          budgetReservationId: durable.budget!.id,
        });
      } catch {
        return this.reconcile(storedIdentity);
      }
      return this.reconcile(storedIdentity);
    });
  }

  async reconcileBeforeBegin(input: SiteExecutionIdentity): Promise<SiteAdmissionResult> {
    const identity = snapshot(identitySchema, input);
    return this.guarded(async () => {
      const pair = await this.readPair(identity, true);
      if (pair.execution.beganAt !== null) {
        // readPair validated the execution; check the latest run's frozen fields and lease too.
        const { run, execution } = pair;
        const active = ["queued", "researching", "validating"].includes(run.state);
        if (!sameFrozenRun(execution, run) || run.state === "queued"
          || (active ? run.activeExpiresAt !== execution.executionExpiresAt : run.activeExpiresAt !== null)) {
          throw new ResearchRepositoryError("CONFLICT");
        }
        throw new SiteBeforeBeginObservation("already-begun", run, executionIdentity(execution));
      }
      // Subsequent dependency errors retain their original meaning, even if begin happens meanwhile.
      return this.reconcile(identity, pair);
    });
  }

  private async reconcile(
    identity: SiteExecutionIdentity,
    initial?: SiteAdmissionResult,
  ): Promise<SiteAdmissionResult> {
    let pair = initial ?? await this.readPair(identity);
    const { execution } = pair;
    const storedIdentity = executionIdentity(execution);
    if (execution.beganAt !== null) throw new ResearchRepositoryError("CONFLICT");

    if (execution.admissionState === "pending") {
      pair = await this.dependencies.executions.closeBeforeBegin({
        ...storedIdentity,
        reason: closeReason(execution, this.now()),
      });
    } else if (execution.admissionState === "admitted") {
      if (pair.run.state !== "queued" || pair.run.activeExpiresAt !== execution.job.queueExpiresAt) {
        throw new ResearchRepositoryError("CONFLICT");
      }
      if (this.now() < execution.job.queueExpiresAt) {
        const reservations = await this.readReservations(execution);
        this.assertLiveReservations(execution, reservations.quota, reservations.budget,
          execution.quotaReservationId, execution.budgetReservationId);
        return pair;
      }
      pair = await this.dependencies.executions.closeBeforeBegin({ ...storedIdentity, reason: "expired" });
    }

    if (pair.execution.admissionState !== "closed") throw unavailable();
    const reservations = await this.readReservations(pair.execution);
    if (pair.execution.closeReason === "cached") {
      if (reservations.quota || reservations.budget) throw unavailable();
      if (pair.run.state !== "ready") throw unavailable();
      return pair;
    }
    if (!pair.execution.closeReason || pair.run.state !== "failed") throw unavailable();
    await this.releaseKnownUnsent(pair.execution, reservations.quota, reservations.budget);
    return this.readPair(storedIdentity);
  }

  private async closeAndReconcile(
    identity: SiteExecutionIdentity,
    pair: SiteAdmissionResult,
    reason: "denied" | "expired" | "interrupted",
  ): Promise<SiteAdmissionResult> {
    const closed = await this.dependencies.executions.closeBeforeBegin({ ...identity, reason });
    return this.reconcile(identity, closed);
  }

  private async readPair(identity: SiteExecutionIdentity, beforeBeginRead = false): Promise<SiteAdmissionResult> {
    const initialRun = await this.dependencies.research.getRun(identity.ownerId, identity.runId);
    if (!initialRun) throw new ResearchRepositoryError("NOT_FOUND");
    let execution: SiteExecutionRecord | null;
    try { execution = await this.dependencies.executions.read(identity.ownerId, identity.runId); }
    catch (error) {
      if (beforeBeginRead && error instanceof SiteExecutionReadSkew) {
        throw new SiteBeforeBeginObservation("execution-read-skew", error.observedRun, error.identity);
      }
      throw error;
    }
    if (!execution) throw unavailable();
    const run = await this.dependencies.research.getRun(identity.ownerId, identity.runId);
    if (!run) throw unavailable();
    assertPairIdentity(identity, run, execution);
    if (beforeBeginRead) {
      assertPairIdentity(identity, initialRun, execution);
      if (!sameFrozenRun(execution, initialRun) || !sameFrozenRun(execution, run)
        || initialRun.mutationId !== run.mutationId || initialRun.normalizedRoleKey !== run.normalizedRoleKey
        || initialRun.retryOfRunId !== run.retryOfRunId) throw new ResearchRepositoryError("CONFLICT");
      // No dependency failed: begin may have committed between the valid execution and final run reads.
      // Record this exact old-queue/new-run observation; the reader must verify the new begun lease.
      if (execution.beganAt === null && execution.admissionState === "admitted" && initialRun.state === "queued"
        && initialRun.activeExpiresAt === execution.job.queueExpiresAt && run.state !== "queued"
        && run.stateVersion > initialRun.stateVersion) {
        throw new SiteBeforeBeginObservation("run-advanced", run, executionIdentity(execution));
      }
    }
    return Object.freeze({ run, execution });
  }

  private async readReservations(execution: SiteExecutionRecord): Promise<Readonly<{
    quota: ResearchQuotaReservation | null;
    budget: BudgetReservation | null;
  }>> {
    const quota = await this.dependencies.entitlements.readResearchReservation(execution.ownerId, execution.quotaKey);
    const budget = await this.dependencies.budget.findReservation(execution.ownerId, execution.runId, execution.requestId);
    return Object.freeze({ quota, budget });
  }

  private assertLiveReservations(
    execution: SiteExecutionRecord,
    quota: ResearchQuotaReservation | null,
    budget: BudgetReservation | null,
    expectedQuotaId: string | null,
    expectedBudgetId: string | null,
  ): void {
    if (!quota || !budget || !expectedQuotaId || !expectedBudgetId
      || quota.reservationId !== expectedQuotaId || quota.finalStatus !== null
      || budget.id !== expectedBudgetId) {
      throw new ResearchRepositoryError("CONFLICT");
    }
    this.assertBudgetRelationship(execution, budget, ["reserved"]);
  }

  private async releaseKnownUnsent(
    execution: SiteExecutionRecord,
    quota: ResearchQuotaReservation | null,
    budget: BudgetReservation | null,
  ): Promise<void> {
    let failed = false;
    if (quota) {
      if (execution.quotaReservationId !== null && execution.quotaReservationId !== quota.reservationId) {
        throw new ResearchRepositoryError("CONFLICT");
      }
      if (quota.finalStatus === "accepted" || quota.finalStatus === "rejected") {
        throw new ResearchRepositoryError("CONFLICT");
      }
    }
    if (execution.quotaReservationId !== null && !quota) throw unavailable();
    if (budget) {
      if (execution.budgetReservationId !== null && execution.budgetReservationId !== budget.id) {
        throw new ResearchRepositoryError("CONFLICT");
      }
      this.assertBudgetRelationship(execution, budget, ["reserved", "released"]);
    }
    if (execution.budgetReservationId !== null && !budget) throw unavailable();
    if (quota?.finalStatus === null) {
      try { await this.dependencies.entitlements.finalize(quota.reservationId, "failed", 0); }
      catch {
        let recovered: ResearchQuotaReservation | null = null;
        try {
          recovered = await this.dependencies.entitlements.readResearchReservation(execution.ownerId, execution.quotaKey);
        } catch {
          failed = true;
        }
        if (!recovered) failed = true;
        else {
          if (recovered.finalStatus === "accepted" || recovered.finalStatus === "rejected") {
            throw new ResearchRepositoryError("CONFLICT");
          }
          if (recovered.reservationId !== quota.reservationId || recovered.finalStatus !== "failed") failed = true;
        }
      }
    }
    if (budget) {
      if (budget.status === "reserved") {
        try {
          await this.dependencies.budget.releaseRemoteBeforeBegin({
            ownerId: execution.ownerId,
            runId: execution.runId,
            requestId: execution.requestId,
            jobId: execution.jobId,
            requestHash: execution.requestHash,
            reservationId: budget.id,
          });
        } catch {
          const recovered = await this.dependencies.budget.findReservation(execution.ownerId, execution.runId, execution.requestId);
          if (!recovered || recovered.id !== budget.id) failed = true;
          else if (recovered.status === "reserved") {
            this.assertBudgetRelationship(execution, recovered, ["reserved"]);
            failed = true;
          } else this.assertBudgetRelationship(execution, recovered, ["released"]);
        }
      }
    }
    if (failed) throw unavailable();
  }

  private assertBudgetRelationship(
    execution: SiteExecutionRecord,
    budget: BudgetReservation,
    allowedStatuses: readonly BudgetReservation["status"][],
  ): void {
    if (budget.ownerId !== execution.ownerId || budget.runId !== execution.runId
      || budget.requestId !== execution.requestId || budget.maximumMicros !== execution.policy.maximumMicros
      || budget.expiresAt !== execution.reservationExpiresAt || budget.settledMicros !== 0
      || !allowedStatuses.includes(budget.status)) {
      throw new ResearchRepositoryError("CONFLICT");
    }
  }

  private now(): number {
    return snapshot(timestampSchema, (this.dependencies.now ?? Date.now)());
  }

  private async guarded<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error) {
      if (error instanceof ResearchRepositoryError) throw error;
      if (error && typeof error === "object" && "code" in error && error.code === "CONFLICT") {
        throw new ResearchRepositoryError("CONFLICT");
      }
      throw unavailable();
    }
  }
}

function snapshot<T>(schema: z.ZodType<T>, input: unknown): T {
  try { return Object.freeze(schema.parse(readBoundedResearchJson(input))); }
  catch { throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); }
}

function assertPairIdentity(
  identity: SiteExecutionIdentity,
  run: ResearchRunRecord,
  execution: SiteExecutionRecord,
): void {
  if (execution.ownerId !== identity.ownerId || execution.runId !== identity.runId
    || execution.requestId !== identity.requestId || execution.jobId !== identity.jobId
    || execution.requestHash !== identity.requestHash || run.ownerId !== identity.ownerId
    || run.id !== identity.runId || run.requestId !== execution.requestId
    || run.executionMode !== "cloudflare-workflow-v1" || run.remoteQuotaKey !== execution.quotaKey) {
    throw new ResearchRepositoryError("CONFLICT");
  }
}

function utcDayStart(now: number): number {
  const value = new Date(now);
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function sameFrozenRun(execution: SiteExecutionRecord, run: ResearchRunRecord): boolean {
  return run.inputFingerprint === execution.job.inputFingerprint && run.configFingerprint === execution.job.configFingerprint
    && run.rawRole === execution.job.role && run.locale === execution.job.locale && run.createdAt === execution.createdAt;
}

function closeReason(execution: SiteExecutionRecord, now: number): "expired" | "interrupted" {
  return now >= execution.job.queueExpiresAt ? "expired" : "interrupted";
}

function executionIdentity(execution: SiteExecutionRecord): SiteExecutionIdentity {
  return Object.freeze({
    ownerId: execution.ownerId,
    runId: execution.runId,
    requestId: execution.requestId,
    jobId: execution.jobId,
    requestHash: execution.requestHash,
  });
}

function unavailable(): ResearchRepositoryError {
  return new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
}
