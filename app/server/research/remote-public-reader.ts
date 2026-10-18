import { z } from "zod";
import { researchRecoverRequestSchema, researchRunPublicViewSchema, type ResearchRunPublicView } from "../../contracts/research";
import { canonicalJson, fingerprint } from "../../lib/planning/fingerprint";
import { parseBridgeBeginGrant } from "./executor/begin";
import { matchAcceptedProof, matchBridgeMetadata, matchUnsentProof, parseReceiptNotice } from "./executor/bridge-contract";
import type { ExecutorBridgeClient } from "./executor/executor-client";
import { BridgeTransportError } from "./executor/http-transport";
import { hashBridgeJob } from "./executor/job";
import { PublicOperationScope, PublicOperationTimeout } from "./public-operation-scope";
import { ResearchRepositoryError, type ResearchRepository, type ResearchRunRecord } from "./repository";
import type { ResearchService } from "./service";
import type { SiteBridgeOperations } from "./site-bridge-operations";
import type { SiteBridgeRepository } from "./site-bridge-repository";
import type { SiteExecutionIdentity, SiteExecutionRecord, SiteExecutionRepository } from "./site-execution-repository";
import { SiteExecutionReadSkew, type SiteRunReadObservation } from "./site-execution-repository";
import { SiteBeforeBeginObservation } from "./site-admission";
import { readBoundedResearchJson } from "./source-audit";

/** Each factory must compose every D1 operation (including response nonces) with createGuardedD1. */
export type RemoteResearchReaderDependencies = {
  createReadRepositories: (guard: () => void) => PublicReadRepositories;
  legacy: Pick<ResearchService, "get" | "recover">;
  createOperations: (guard: () => void) => SiteBridgeOperations;
  createExecutor: (guard: () => void) => ExecutorBridgeClient | null;
  monoNow: () => number;
};

/** No mutation, nonce, executor, or admission capabilities exist in the refresh composition. */
export type PublicReadRepositories = Readonly<{
  research: Pick<ResearchRepository, "getRun" | "getPublicRun" | "findRecoveryRun">;
  executions: Pick<SiteExecutionRepository, "read">;
  bridge: Pick<SiteBridgeRepository, "lookup" | "readAcceptance">;
}>;

/** Later writes reuse their existing work scope here; this operation creates no new time window. */
export interface ResearchLocalViewReader {
  readLocalView(scope: PublicOperationScope, ownerId: string, runId: string): Promise<ResearchRunPublicView | null>;
}

type Snapshot = Readonly<{ run: ResearchRunRecord; execution: SiteExecutionRecord; view: ResearchRunPublicView; reread: boolean }>;
const normalizedRole = z.string().min(2).max(160)
  .refine((value) => value === value.trim() && !/[\u0000-\u001f\u007f-\u009f]/u.test(value));
const unavailable = () => new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
const conflict = () => new ResearchRepositoryError("CONFLICT");

type ExecutionObserver = (execution: SiteExecutionRecord) => void;
type ExecutionObservation = Readonly<{
  immutable: string; reservations: string | null; grant: string | null; closure: string | null;
  steps: number; version: number; updatedAt: number;
}>;
/** Own canonical values, not repository object aliases, across every continuation of one public read. */
function createExecutionObserver(onAdvance: () => void = () => {}): ExecutionObserver {
  let previous: ExecutionObservation | null = null;
  return (execution) => {
    const current: ExecutionObservation = Object.freeze({
      immutable: canonicalJson({ ownerId: execution.ownerId, runId: execution.runId, requestId: execution.requestId,
        jobId: execution.jobId, requestHash: execution.requestHash, job: execution.job,
        validationContext: execution.validationContext, quotaKey: execution.quotaKey, policy: execution.policy,
        reservationExpiresAt: execution.reservationExpiresAt, createdAt: execution.createdAt }),
      reservations: execution.admittedAt === null ? null
        : canonicalJson([execution.quotaReservationId, execution.budgetReservationId, execution.admittedAt]),
      grant: execution.beganAt === null ? null : canonicalJson([execution.beganAt, execution.executionExpiresAt]),
      closure: execution.closedAt === null ? null : canonicalJson([execution.closedAt, execution.closeReason]),
      steps: Number(execution.admittedAt !== null) + Number(execution.beganAt !== null) + Number(execution.closedAt !== null),
      version: execution.version, updatedAt: execution.updatedAt,
    });
    if (previous) {
      if (current.immutable !== previous.immutable
        || previous.reservations !== null && current.reservations !== previous.reservations
        || previous.grant !== null && current.grant !== previous.grant
        || previous.closure !== null && current.closure !== previous.closure) throw conflict();
      // SQL assigns each admission, begin and close marker once, incrementing execution version once per assignment.
      const changes = current.steps - previous.steps;
      if (previous.closure !== null && changes !== 0 || current.version - previous.version !== changes || current.updatedAt !== (changes === 0
        ? previous.updatedAt : execution.closedAt ?? execution.beganAt ?? execution.admittedAt)) throw conflict();
      if (changes > 0) onAdvance();
    }
    previous = current;
  };
}

function sameIdentity(left: SiteExecutionIdentity, right: SiteExecutionIdentity): boolean {
  return left.ownerId === right.ownerId && left.runId === right.runId && left.requestId === right.requestId
    && left.jobId === right.jobId && left.requestHash === right.requestHash;
}
function sameRunIdentity(left: SiteRunReadObservation, right: SiteRunReadObservation): boolean {
  return left.ownerId === right.ownerId && left.id === right.id && left.requestId === right.requestId
    && left.mutationId === right.mutationId && left.executionMode === right.executionMode
    && left.remoteQuotaKey === right.remoteQuotaKey && left.rawRole === right.rawRole
    && left.normalizedRoleKey === right.normalizedRoleKey && left.locale === right.locale
    && left.inputFingerprint === right.inputFingerprint && left.configFingerprint === right.configFingerprint
    && left.retryOfRunId === right.retryOfRunId && left.createdAt === right.createdAt;
}
/** Successful reads can straddle these atomic SQL transitions; every other execution field is frozen. */
function lookupTransition(before: SiteExecutionRecord, after: SiteExecutionRecord): "researching" | "failed" | null {
  if (before.beganAt !== null || before.executionExpiresAt !== null || before.closedAt !== null
    || before.closeReason !== null || after.version !== before.version + 1) return null;
  if (before.admissionState === "admitted" && after.admissionState === "admitted"
    && after.beganAt !== null && after.executionExpiresAt !== null && after.updatedAt === after.beganAt
    && canonicalJson({ ...after, beganAt: before.beganAt, executionExpiresAt: before.executionExpiresAt,
      version: before.version, updatedAt: before.updatedAt }) === canonicalJson(before)) {
    originalGrant(after);
    return "researching";
  }
  if ((before.admissionState === "pending" || before.admissionState === "admitted")
    && after.admissionState === "closed" && after.closedAt !== null && after.updatedAt === after.closedAt
    && (after.closeReason === "denied" || after.closeReason === "expired" || after.closeReason === "interrupted")
    && canonicalJson({ ...after, admissionState: before.admissionState, closedAt: before.closedAt,
      closeReason: before.closeReason, version: before.version, updatedAt: before.updatedAt }) === canonicalJson(before)) {
    return "failed";
  }
  return null;
}
function originalGrant(execution: SiteExecutionRecord) {
  if (execution.beganAt === null || execution.executionExpiresAt === null) throw conflict();
  return parseBridgeBeginGrant({ protocol: execution.job.protocol, jobId: execution.jobId,
    requestHash: execution.requestHash, beganAt: execution.beganAt, executionExpiresAt: execution.executionExpiresAt });
}
function requireGrant(value: unknown, execution: SiteExecutionRecord): void {
  if (canonicalJson(value) !== canonicalJson(originalGrant(execution))) throw conflict();
}
function publicView(value: unknown, run: ResearchRunRecord, accepted: boolean): ResearchRunPublicView {
  if (value === null || typeof value !== "object") throw unavailable();
  const view = researchRunPublicViewSchema.parse({ ...value, backgroundAccepted: accepted });
  if (view.id !== run.id || view.role !== run.rawRole || view.locale !== run.locale || view.state !== run.state) throw conflict();
  return view;
}

export class RemoteResearchReader implements ResearchLocalViewReader {
  constructor(private readonly dependencies: RemoteResearchReaderDependencies) {}

  get(ownerId: string, runId: string): Promise<ResearchRunPublicView | null> {
    return this.read(ownerId, (repositories) => repositories.research.getRun(ownerId, runId));
  }

  recover(ownerId: string, input: unknown): Promise<ResearchRunPublicView | null> {
    return this.read(ownerId, (repositories) => {
      const request = researchRecoverRequestSchema.parse(readBoundedResearchJson(input));
      const key = normalizedRole.parse(request.role.normalize("NFKC").trim().replace(/\s+/gu, " ")).toLowerCase();
      return repositories.research.findRecoveryRun({ ownerId, mutationId: request.mutationId,
        normalizedRoleKey: key, locale: request.locale, inputFingerprint: fingerprint([key, request.locale]),
        retryOfRunId: request.kind === "retry" ? request.sourceRunId : null });
    });
  }

  async readLocalView(scope: PublicOperationScope, ownerId: string, runId: string): Promise<ResearchRunPublicView | null> {
    scope.ensure();
    const repositories = this.dependencies.createReadRepositories(scope.ensure);
    const run = await scope.run(() => repositories.research.getRun(ownerId, runId));
    if (!run) return null;
    if (run.executionMode === "synchronous") {
      return publicView(await scope.run(() => repositories.research.getPublicRun(ownerId, runId)), run, false);
    }
    return (await this.snapshot(scope, repositories, run)).view;
  }

  private async read(ownerId: string, find: (repositories: PublicReadRepositories) => Promise<ResearchRunRecord | null>) {
    const work = new PublicOperationScope(this.dependencies.monoNow);
    let owned: ResearchRunRecord | null = null;
    let verified: Snapshot | null = null;
    let hadSnapshot = false;
    const invalidate = () => { verified = null; };
    const observeExecution = createExecutionObserver(invalidate);
    const observe = (run: ResearchRunRecord) => {
      if (verified && (!sameRunIdentity(run, verified.run) || run.stateVersion !== verified.run.stateVersion)) verified = null;
    };
    try {
      const repositories = this.dependencies.createReadRepositories(work.ensure);
      owned = await work.run(() => find(repositories));
      if (!owned) return null;
      if (owned.ownerId !== ownerId) throw conflict();
      if (owned.executionMode === "synchronous") {
        work.finish();
        // Historical synchronous semantics deliberately remain outside the remote service budget.
        return this.dependencies.legacy.get(ownerId, owned.id);
      }
      verified = await this.snapshot(work, repositories, owned, observe, true, observeExecution, invalidate);
      hadSnapshot = true;
      work.ensure();
      const operations = this.dependencies.createOperations(work.ensure);
      await this.reconcile(work, operations, repositories, verified, observe, observeExecution, invalidate);
    } catch (error) {
      if (!(error instanceof PublicOperationTimeout)
        && !(error instanceof BridgeTransportError && error.kind === "temporary")) throw error;
      if (!hadSnapshot) throw unavailable();
    } finally { work.finish(); }

    const refresh = new PublicOperationScope(this.dependencies.monoNow, 500);
    try {
      const repositories = this.dependencies.createReadRepositories(refresh.ensure);
      const run = await refresh.run(() => repositories.research.getRun(ownerId, owned!.id));
      if (!run) throw conflict();
      observe(run);
      if (!sameRunIdentity(run, owned!) || run.executionMode !== "cloudflare-workflow-v1") throw conflict();
      return (await this.snapshot(refresh, repositories, run, observe, true, observeExecution, invalidate)).view;
    } catch (error) {
      if (error instanceof PublicOperationTimeout && verified) return verified.view;
      if (error instanceof PublicOperationTimeout) throw unavailable();
      throw error;
    } finally { refresh.finish(); }
  }

  private async snapshot(scope: PublicOperationScope, repositories: PublicReadRepositories,
    initial: ResearchRunRecord, observe: (run: ResearchRunRecord) => void = () => {}, allowReread = true,
    observeExecution: ExecutionObserver = createExecutionObserver(), invalidate: () => void = () => {}): Promise<Snapshot> {
    let run = initial;
    let rereadIdentity: SiteExecutionIdentity | null = null;
    let transitionExecution: string | null = null;
    for (let attempt = 0; attempt < (allowReread ? 2 : 1); attempt += 1) {
      observe(run);
      try {
        const execution = await scope.run(() => repositories.executions.read(run.ownerId, run.id));
        if (!execution) throw conflict();
        observeExecution(execution);
        if (rereadIdentity && !sameIdentity(execution, rereadIdentity)) throw conflict();
        if (transitionExecution !== null && canonicalJson(execution) !== transitionExecution) throw conflict();
        rereadIdentity = execution;
        const current = await scope.run(() => repositories.research.getRun(run.ownerId, run.id));
        if (!current || !sameRunIdentity(current, initial)) throw conflict();
        observe(current);
        if (current.stateVersion !== run.stateVersion) {
          if (!allowReread || attempt > 0 || current.stateVersion < run.stateVersion) throw conflict();
          rereadIdentity = execution; run = current; continue;
        }
        const found = await scope.run(() => repositories.bridge.lookup({ jobId: execution.jobId, requestHash: execution.requestHash }));
        if (!sameIdentity(found.identity, execution) || found.identity.ownerId !== run.ownerId
          || found.identity.runId !== run.id || found.identity.requestId !== run.requestId) throw conflict();
        observeExecution(found.execution);
        const hash = await scope.run(() => hashBridgeJob(found.execution.job));
        if (hash !== execution.requestHash) throw conflict();
        if (canonicalJson(found.execution) !== canonicalJson(execution)) {
          const state = lookupTransition(execution, found.execution);
          if (!allowReread || attempt > 0 || state === null || run.state !== "queued"
            || run.activeExpiresAt !== execution.job.queueExpiresAt) throw conflict();
          const advanced = await scope.run(() => repositories.research.getRun(run.ownerId, run.id));
          if (!advanced || !sameRunIdentity(advanced, initial) || advanced.stateVersion !== run.stateVersion + 1
            || advanced.state !== state || advanced.activeExpiresAt !== found.execution.executionExpiresAt
            || state === "researching" && advanced.updatedAt !== found.execution.updatedAt) throw conflict();
          observe(advanced); transitionExecution = canonicalJson(found.execution); run = advanced; continue;
        }
        if (execution.beganAt !== null) originalGrant(execution);
        const proof = await scope.run(() => repositories.bridge.readAcceptance(found.identity));
        if (proof) await scope.run(() => matchAcceptedProof(proof, execution.job));
        const value = await scope.run(() => repositories.research.getPublicRun(run.ownerId, run.id));
        const after = await scope.run(() => repositories.research.getRun(run.ownerId, run.id));
        if (!after || !sameRunIdentity(after, initial)) throw conflict();
        observe(after);
        if (after.stateVersion !== run.stateVersion) {
          if (!allowReread || attempt > 0 || after.stateVersion < run.stateVersion) throw conflict();
          rereadIdentity = execution; run = after; continue;
        }
        return { run: after, execution, view: publicView(value, after, proof !== null), reread: attempt > 0 || !allowReread };
      } catch (error) {
        if (!allowReread || attempt > 0 || !(error instanceof SiteExecutionReadSkew) || scope.signal.aborted) throw error;
        if (rereadIdentity && !sameIdentity(error.identity, rereadIdentity)) throw error;
        if (!sameRunIdentity(error.observedRun, initial) || error.observedRun.stateVersion < run.stateVersion
          || error.identity.ownerId !== run.ownerId || error.identity.runId !== run.id || error.identity.requestId !== run.requestId) throw error;
        if (error.observedRun.stateVersion === run.stateVersion && (error.observedRun.state !== run.state
          || error.observedRun.activeExpiresAt !== run.activeExpiresAt)) throw error;
        invalidate(); // The validated marker already proves a newer begin, before the awaited owned-run read.
        // Retry only the explicitly validated old-queue/new-begin read, never an unrelated local failure.
        const current = await scope.run(() => repositories.research.getRun(run.ownerId, run.id));
        if (!current || !sameRunIdentity(current, initial) || current.stateVersion <= error.observedRun.stateVersion) throw error;
        observe(current); rereadIdentity = error.identity; run = current;
      }
    }
    throw conflict();
  }

  private async reconcile(scope: PublicOperationScope, operations: SiteBridgeOperations, repositories: PublicReadRepositories,
    snapshot: Snapshot, observe: (run: ResearchRunRecord) => void, observeExecution: ExecutionObserver,
    invalidate: () => void): Promise<void> {
    const execution = snapshot.execution;
    const identity: SiteExecutionIdentity = { ownerId: execution.ownerId, runId: execution.runId,
      requestId: execution.requestId, jobId: execution.jobId, requestHash: execution.requestHash };
    // The journal repository requires a persisted begin grant. Unbegun rows cannot have an import journal.
    if (execution.beganAt === null) {
      try {
        const result = await scope.run(() => operations.admission.reconcileBeforeBegin(identity));
        observe(result.run); return;
      } catch (error) {
        if (snapshot.reread || !(error instanceof SiteBeforeBeginObservation) || scope.signal.aborted) throw error;
        if (!sameIdentity(error.identity, identity) || !sameRunIdentity(error.observedRun, snapshot.run)
          || error.observedRun.stateVersion < snapshot.run.stateVersion) throw error;
        invalidate(); // Do not retain the queued view while resolving trustworthy begin/lifecycle provenance.
        const current = await scope.run(() => repositories.research.getRun(identity.ownerId, identity.runId));
        if (!current || !sameRunIdentity(current, snapshot.run) || current.stateVersion <= snapshot.run.stateVersion
          || current.stateVersion < error.observedRun.stateVersion
          || error.kind === "execution-read-skew" && current.stateVersion === error.observedRun.stateVersion) throw error;
        observe(current);
        const next = await this.snapshot(scope, repositories, current, observe, false, observeExecution, invalidate);
        if (next.execution.beganAt === null || !sameIdentity(next.execution, identity)) throw error;
        if (error.kind !== "execution-read-skew") {
          const active = ["researching", "validating"].includes(error.observedRun.state);
          if (error.observedRun.activeExpiresAt !== (active ? next.execution.executionExpiresAt : null)) throw error;
        }
        return this.reconcile(scope, operations, repositories, next, observe, observeExecution, invalidate);
      }
    }
    const journal = await scope.run(() => operations.importJournal.read(identity));
    if (journal) {
      const result = await scope.run(() => operations.imports.reconcileMetadata(identity, journal.metadata));
      observe(result.run);
      if ((await scope.run(() => operations.importJournal.read(identity)))?.phase === 5) return;
    }
    await scope.run(() => operations.expiry.reconcile(identity, null));
    const run = await scope.run(() => repositories.research.getRun(identity.ownerId, identity.runId));
    if (!run || !sameRunIdentity(run, snapshot.run)) throw conflict();
    observe(run);
    scope.ensure();
    const executor = this.dependencies.createExecutor(scope.ensure);
    if (!executor) return;
    const status = await scope.run(() => executor.status(execution.job, { signal: scope.signal }));
    if (status.metadata) {
      const metadata = await scope.run(() => matchBridgeMetadata(status.metadata, execution.job));
      requireGrant(metadata.grant, execution);
      if (status.bodyState === "available") {
        const notice = parseReceiptNotice({ jobId: execution.jobId, requestHash: execution.requestHash, receiptHash: metadata.receiptHash });
        const receipt = await scope.run(() => executor.result(execution.job, notice, originalGrant(execution), { signal: scope.signal }));
        const result = await scope.run(() => operations.imports.complete(identity, receipt));
        observe(result.run);
      } else {
        const result = await scope.run(() => operations.imports.reconcileMetadata(identity, metadata));
        observe(result.run);
      }
      return;
    }
    let proof = status.unsent;
    if (!proof && status.dispatchState === "unclaimed" && await this.mayClose(scope, operations, identity, execution, run)) {
      proof = await scope.run(() => executor.close(execution.job, { signal: scope.signal }));
    }
    if (!proof) return;
    const matched = await scope.run(() => matchUnsentProof(proof, execution.job));
    if (matched.grant !== null) requireGrant(matched.grant, execution);
    await scope.run(() => operations.expiry.reconcile(identity, matched));
  }

  private async mayClose(scope: PublicOperationScope, operations: SiteBridgeOperations, identity: SiteExecutionIdentity,
    execution: SiteExecutionRecord, run: ResearchRunRecord): Promise<boolean> {
    const recovery = await scope.run(() => operations.recovery.read(identity));
    if (!recovery) return false;
    if (!sameIdentity(recovery.identity, identity) || recovery.executionVersion !== execution.version
      || recovery.runVersion !== run.stateVersion || run.state !== "failed" || run.activeExpiresAt !== null
      || !recovery.quotaDone || !recovery.budgetDone || recovery.reason !== "expired-unknown" || recovery.unsent !== null) return false;
    if (!execution.budgetReservationId) throw conflict();
    const reservation = await scope.run(() => operations.budget.readReservation(identity.ownerId, execution.budgetReservationId!));
    return reservation !== null && reservation.id === execution.budgetReservationId
      && reservation.ownerId === identity.ownerId && reservation.runId === identity.runId && reservation.requestId === identity.requestId
      && reservation.maximumMicros === execution.policy.maximumMicros && reservation.expiresAt === execution.reservationExpiresAt
      && reservation.status === "conservative-hold" && reservation.settledMicros === 0;
  }
}
