import type { AiRunSink, ResearchAiRunReader } from "../ai/gateway";
import { EntitlementRepositoryError, type EntitlementFinalStatus, type EntitlementRepository } from "../entitlements/repository";
import { canonicalJson } from "../../lib/planning/fingerprint";
import { parseSiteImportIdentity } from "./d1-site-import-repository";
import { ResearchBudgetError, type BudgetReservation, type BudgetSettlement, type ResearchBudgetRepository } from "./budget";
import { parseBridgeProviderReceipt, parseBridgeReceiptMetadata, summarizeBridgeProviderReceipt,
  type BridgeProviderReceipt, type BridgeReceiptMetadata } from "./executor/receipt";
import type { ResearchRepository, ResearchRunRecord } from "./repository";
import { ResearchRepositoryError } from "./repository";
import type { SiteExecutionRecord } from "./site-execution-repository";
import type { SiteExecutionIdentity } from "./site-execution-repository";
import type { SiteImportPublication, SiteImportRecord, SiteImportRepository, SiteImportResult } from "./site-import-repository";

type StrictImportReader = Readonly<{
  readStrictImportContext(identity: SiteExecutionIdentity): Promise<Readonly<{
    run: ResearchRunRecord;
    execution: SiteExecutionRecord;
    journal: SiteImportRecord | null;
  }>>;
}>;

export type SiteImportCoordinatorDependencies = Readonly<{
  imports: SiteImportRepository & StrictImportReader;
  publication: SiteImportPublication;
  research: Pick<ResearchRepository, "getRun">;
  audits: Pick<AiRunSink, "record"> & Pick<ResearchAiRunReader, "readResearchAttempt">;
  entitlements: Pick<Required<EntitlementRepository>, "readResearchReservation"> & Pick<EntitlementRepository, "finalize">;
  budget: Pick<ResearchBudgetRepository, "readReservation" | "readBucket" | "settle">;
}>;

export class SiteImportCoordinator {
  constructor(private readonly dependencies: SiteImportCoordinatorDependencies) {}

  complete(input: SiteExecutionIdentity, receipt: unknown): Promise<SiteImportResult> {
    try {
      const identity = parseSiteImportIdentity(input);
      const snapshot = parseBridgeProviderReceipt(receipt);
      return this.captureAndResume(identity, snapshot, "body");
    } catch (error) {
      return Promise.reject(preserveOrUnavailable(error));
    }
  }

  reconcileMetadata(input: SiteExecutionIdentity, metadata: unknown): Promise<SiteImportResult> {
    try {
      const identity = parseSiteImportIdentity(input);
      const snapshot = parseBridgeReceiptMetadata(metadata);
      return this.captureAndResume(identity, snapshot, "metadata");
    } catch (error) {
      return Promise.reject(preserveOrUnavailable(error));
    }
  }

  private async captureAndResume(
    identity: SiteExecutionIdentity,
    snapshot: BridgeProviderReceipt | BridgeReceiptMetadata,
    kind: "body" | "metadata",
  ): Promise<SiteImportResult> {
    let record: SiteImportRecord;
    try {
      record = kind === "body"
        ? await this.dependencies.imports.captureBody(identity, snapshot)
        : await this.dependencies.imports.captureMetadata(identity, snapshot);
    } catch (error) {
      const expected = kind === "body"
        ? await summarizeBridgeProviderReceipt(snapshot)
        : snapshot as BridgeReceiptMetadata;
      const saved = await this.dependencies.imports.read(identity).catch(() => null);
      if (!saved || !exact(saved.metadata, expected)) throw preserveOrUnavailable(error);
      record = saved;
    }
    try {
      return await this.resume(identity, record);
    } catch (error) {
      throw preserveOrUnavailable(error);
    }
  }

  private async resume(identity: SiteExecutionIdentity, initial: SiteImportRecord): Promise<SiteImportResult> {
    let record = initial;
    const hash = record.metadata.receiptHash;
    if (record.phase === 0) {
      await this.recordAuditOrRecoverExact(record);
      record = await this.advanceMarker(identity, record, 1,
        () => this.dependencies.imports.markAudit(identity, hash));
    }
    if (record.phase === 1) {
      record = await this.resolveOrRecoverExact(identity, record);
    }
    if (record.phase === 2) {
      await this.finalizeQuotaOrRecoverExact(identity, record);
      record = await this.advanceMarker(identity, record, 3,
        () => this.dependencies.imports.markQuota(identity, hash));
    }
    if (record.phase === 3) {
      await this.settleBudgetOrRecoverExact(identity, record);
      record = await this.advanceMarker(identity, record, 4,
        () => this.dependencies.imports.markBudget(identity, hash));
    }
    if (record.phase >= 4) {
      record = await this.advanceMarker(identity, record, 5,
        () => this.dependencies.imports.finish(identity, hash));
    }
    return this.readCompletedResult(identity, record);
  }

  private async recordAuditOrRecoverExact(record: SiteImportRecord): Promise<void> {
    try {
      await this.dependencies.audits.record(record.audit);
    } catch (error) {
      const saved = await this.dependencies.audits.readResearchAttempt(record.audit.userId, record.audit.requestId)
        .catch(() => null);
      if (saved && exact(saved, record.audit)) return;
      throw preserveOrUnavailable(error);
    }
  }

  private async resolveOrRecoverExact(
    identity: SiteExecutionIdentity,
    record: SiteImportRecord,
  ): Promise<SiteImportRecord> {
    try {
      return await this.dependencies.publication.resolve(identity, record.metadata.receiptHash);
    } catch (error) {
      const saved = await this.dependencies.imports.read(identity).catch(() => null);
      if (saved && sameImmutableJournal(saved, record) && saved.phase >= 2) return saved;
      if (saved && saved.metadata.receiptHash === record.metadata.receiptHash
        && !sameImmutableJournal(saved, record)) throw conflict();
      throw preserveOrUnavailable(error);
    }
  }

  private async advanceMarker(
    identity: SiteExecutionIdentity,
    before: SiteImportRecord,
    expectedPhase: 1 | 3 | 4 | 5,
    mutate: () => Promise<SiteImportRecord>,
  ): Promise<SiteImportRecord> {
    try {
      const saved = await mutate();
      if (saved.metadata.receiptHash !== before.metadata.receiptHash || saved.phase < expectedPhase) throw unavailable();
      return saved;
    } catch (error) {
      const saved = await this.dependencies.imports.read(identity).catch(() => null);
      if (saved && sameImmutableJournal(saved, before) && saved.phase >= expectedPhase) return saved;
      if (saved && saved.metadata.receiptHash === before.metadata.receiptHash
        && !sameImmutableJournal(saved, before)) throw conflict();
      throw preserveOrUnavailable(error);
    }
  }

  private async strictContext(identity: SiteExecutionIdentity, record: SiteImportRecord) {
    const context = await this.dependencies.imports.readStrictImportContext(identity);
    if (!context.journal) throw unavailable();
    if (context.journal.phase < record.phase) throw unavailable();
    if (!sameImmutableJournal(context.journal, record)) {
      if (context.journal.metadata.receiptHash === record.metadata.receiptHash) throw conflict();
      throw unavailable();
    }
    return context;
  }

  private async finalizeQuotaOrRecoverExact(identity: SiteExecutionIdentity, record: SiteImportRecord): Promise<void> {
    const context = await this.strictContext(identity, record);
    const reservationId = context.execution.quotaReservationId;
    if (!reservationId || context.execution.quotaKey.length === 0) throw unavailable();
    const expectedStatus = record.resolution?.quotaStatus;
    if (!expectedStatus) throw unavailable();
    const read = () => this.dependencies.entitlements
      .readResearchReservation(identity.ownerId, context.execution.quotaKey);
    const observed = await read();
    if (!observed || observed.reservationId !== reservationId) throw unavailable();
    if (observed.finalStatus !== null) {
      if (observed.finalStatus !== expectedStatus) throw new EntitlementRepositoryError("CONFLICT");
      return;
    }
    try {
      await this.dependencies.entitlements.finalize(
        reservationId,
        expectedStatus,
        expectedStatus === "accepted" ? 1 : 0,
      );
    } catch (error) {
      const recovered = await read().catch(() => null);
      if (recovered?.reservationId === reservationId && recovered.finalStatus === expectedStatus) return;
      throw preserveOrUnavailable(error);
    }
  }

  private async settleBudgetOrRecoverExact(identity: SiteExecutionIdentity, record: SiteImportRecord): Promise<void> {
    const context = await this.strictContext(identity, record);
    const reservationId = context.execution.budgetReservationId;
    if (!reservationId) throw unavailable();
    const read = () => this.dependencies.budget.readReservation(identity.ownerId, reservationId);
    let observed = (await this.readOriginalBudgetObservation(identity, context.execution)).reservation;
    if (matchesSettlement(observed, record.settlement)) return;
    if (observed.status === "settled" || observed.status === "released") throw unavailable();
    try {
      observed = await this.dependencies.budget.settle(identity.ownerId, reservationId, record.settlement);
    } catch (error) {
      const recovered = await read().catch(() => null);
      if (recovered && matchesBudgetIdentity(recovered, identity, reservationId)
        && matchesOriginalReservation(recovered, context.execution)
        && matchesSettlement(recovered, record.settlement)) return;
      throw preserveOrUnavailable(error);
    }
    if (!matchesBudgetIdentity(observed, identity, reservationId)
      || !matchesOriginalReservation(observed, context.execution)
      || !matchesSettlement(observed, record.settlement)) throw unavailable();
  }

  private async readOriginalBudgetObservation(
    identity: SiteExecutionIdentity,
    execution: SiteExecutionRecord,
  ): Promise<Readonly<{ reservation: BudgetReservation }>> {
    const read = async () => {
      const reservationId = execution.budgetReservationId;
      if (!reservationId) throw unavailable();
      const reservation = await this.dependencies.budget.readReservation(identity.ownerId, reservationId);
      if (!reservation || !matchesBudgetIdentity(reservation, identity, reservationId)
        || !matchesOriginalReservation(reservation, execution)) throw unavailable();
      await this.readOriginalBuckets(reservation);
      return Object.freeze({ reservation });
    };
    try {
      return await read();
    } catch (error) {
      if (!(error instanceof ResearchRepositoryError) || error.code !== "RESEARCH_UNAVAILABLE") throw error;
      return read();
    }
  }

  private async readOriginalBuckets(reservation: BudgetReservation): Promise<void> {
    const [day, month] = await Promise.all([
      this.dependencies.budget.readBucket(reservation.dayBucketId),
      this.dependencies.budget.readBucket(reservation.monthBucketId),
    ]);
    const date = new Date(reservation.createdAt);
    const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    const monthStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    if (!day || !month || day.id === month.id || day.periodKind !== "day" || month.periodKind !== "month"
      || day.periodStart !== dayStart || month.periodStart !== monthStart
      || !Number.isSafeInteger(day.reservedMicros + day.settledMicros)
      || !Number.isSafeInteger(month.reservedMicros + month.settledMicros)
      || reservation.status === "conservative-hold"
        && (day.reservedMicros < reservation.maximumMicros || month.reservedMicros < reservation.maximumMicros)) {
      throw unavailable();
    }
  }

  private async readCompletedResult(
    identity: SiteExecutionIdentity,
    previous: SiteImportRecord,
  ): Promise<SiteImportResult> {
    if (previous.phase !== 5 || previous.decision !== null || !previous.resolution) throw unavailable();
    const canonical = await this.dependencies.publication.resolve(identity, previous.metadata.receiptHash);
    if (canonical.phase !== 5 || !exact(canonical, previous)) throw unavailable();
    const context = await this.strictContext(identity, canonical);
    const run = await this.dependencies.research.getRun(identity.ownerId, identity.runId);
    if (!run || !exact(run, context.run)
      || run.state !== canonical.resolution!.state
      || run.stateVersion !== canonical.resolution!.runVersion
      || run.packageId !== canonical.resolution!.packageId
      || await canonicalHash(run) !== canonical.resolution!.terminalHash) throw unavailable();
    await this.requireAudit(canonical);
    await this.requireQuota(identity, context.execution, canonical.resolution!.quotaStatus);
    const accounting = await this.requireBudget(identity, context.execution, canonical.settlement);
    return Object.freeze({ run, receiptHash: canonical.metadata.receiptHash, accounting });
  }

  private async requireAudit(record: SiteImportRecord): Promise<void> {
    const audit = await this.dependencies.audits.readResearchAttempt(record.audit.userId, record.audit.requestId);
    if (!audit || !exact(audit, record.audit)) throw unavailable();
  }

  private async requireQuota(
    identity: SiteExecutionIdentity,
    execution: SiteExecutionRecord,
    status: EntitlementFinalStatus,
  ): Promise<void> {
    if (!execution.quotaReservationId) throw unavailable();
    const quota = await this.dependencies.entitlements.readResearchReservation(identity.ownerId, execution.quotaKey);
    if (!quota || quota.reservationId !== execution.quotaReservationId || quota.finalStatus !== status) throw unavailable();
  }

  private async requireBudget(
    identity: SiteExecutionIdentity,
    execution: SiteExecutionRecord,
    settlement: BudgetSettlement,
  ): Promise<SiteImportResult["accounting"]> {
    const { reservation } = await this.readOriginalBudgetObservation(identity, execution);
    if (!matchesSettlement(reservation, settlement)) throw unavailable();
    return reservation.status === "conservative-hold" ? "held"
      : reservation.status === "settled" ? "settled" : "released";
  }
}

function exact(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function sameImmutableJournal(left: SiteImportRecord, right: SiteImportRecord): boolean {
  return left.ownerId === right.ownerId && left.runId === right.runId
    && left.requestId === right.requestId && left.jobId === right.jobId
    && left.requestHash === right.requestHash && left.mode === right.mode
    && left.configFingerprint === right.configFingerprint
    && left.executionVersion === right.executionVersion
    && left.decisionHash === right.decisionHash && left.createdAt === right.createdAt
    && (left.phase < 2 || right.phase < 2 || exact(left.resolution, right.resolution))
    && exact(left.validationContext, right.validationContext)
    && exact(left.metadata, right.metadata) && exact(left.audit, right.audit)
    && exact(left.settlement, right.settlement);
}

async function canonicalHash(value: unknown): Promise<string> {
  try {
    const bytes = new TextEncoder().encode(canonicalJson(value));
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch { throw unavailable(); }
}

function matchesBudgetIdentity(
  reservation: BudgetReservation,
  identity: SiteExecutionIdentity,
  reservationId: string,
): boolean {
  return reservation.id === reservationId && reservation.ownerId === identity.ownerId
    && reservation.runId === identity.runId && reservation.requestId === identity.requestId;
}

function matchesOriginalReservation(reservation: BudgetReservation, execution: SiteExecutionRecord): boolean {
  return reservation.maximumMicros === execution.policy.maximumMicros
    && reservation.expiresAt === execution.reservationExpiresAt;
}

function matchesSettlement(reservation: BudgetReservation, settlement: BudgetSettlement): boolean {
  if (settlement.kind === "actual") {
    return reservation.status === "settled" && reservation.settledMicros === settlement.actualMicros;
  }
  if (settlement.kind === "not-charged") {
    return reservation.status === "released" && reservation.settledMicros === 0;
  }
  return reservation.status === "conservative-hold" && reservation.settledMicros === 0;
}

function unavailable(): ResearchRepositoryError {
  return new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
}

function preserveOrUnavailable(error: unknown): Error {
  if (error instanceof ResearchRepositoryError
    || error instanceof EntitlementRepositoryError
    || error instanceof ResearchBudgetError) return error;
  return unavailable();
}

function conflict(): ResearchRepositoryError {
  return new ResearchRepositoryError("CONFLICT");
}
