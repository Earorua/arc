import type { EntitlementRepository } from "../entitlements/repository";
import { EntitlementRepositoryError } from "../entitlements/repository";
import type { ResearchBudgetRepository, BudgetReservation } from "./budget";
import { ResearchBudgetError } from "./budget";
import type { UnsentProof } from "./executor/bridge-contract";
import { ResearchRepositoryError } from "./repository";
import type { SiteBridgeRepository, SiteExpiryRepository, SiteRecovery } from "./site-bridge-repository";
import type { SiteExecutionIdentity, SiteExecutionRecord } from "./site-execution-repository";
import type { SiteImportCoordinator } from "./site-import";
import type { SiteImportRepository } from "./site-import-repository";

export type SiteExpiryDependencies = Readonly<{
  repository: SiteExpiryRepository;
  bridgeRepository: SiteBridgeRepository;
  importer: Pick<SiteImportCoordinator, "reconcileMetadata">;
  importJournal: Pick<SiteImportRepository, "read">;
  entitlements: Pick<Required<EntitlementRepository>, "readResearchReservation">
    & Pick<EntitlementRepository, "finalize">;
  budget: Pick<ResearchBudgetRepository, "readReservation" | "readBucket" | "settle">;
}>;

export class SiteExpiryCoordinator {
  constructor(private readonly dependencies: SiteExpiryDependencies) {}

  async reconcile(identity: SiteExecutionIdentity, proof: UnsentProof | null): Promise<void> {
    let journal = await this.dependencies.importJournal.read(identity);
    if (journal) await this.dependencies.importer.reconcileMetadata(identity, journal.metadata);
    let recovery = await this.dependencies.repository.read(identity);
    if (!recovery && !journal) recovery = await this.dependencies.repository.terminate(identity, proof);
    else if (recovery && proof) recovery = await this.dependencies.repository.terminate(identity, proof);
    if (!recovery) return;

    if (!recovery.quotaDone) {
      const context = await this.context(identity, recovery);
      journal = await this.dependencies.importJournal.read(identity);
      if (journal) await this.dependencies.importer.reconcileMetadata(identity, journal.metadata);
      const observed = await this.dependencies.entitlements
        .readResearchReservation(identity.ownerId, context.execution.quotaKey);
      if (!observed || observed.reservationId !== context.execution.quotaReservationId) throw unavailable();
      if (observed.finalStatus === null) {
        try { await this.dependencies.entitlements.finalize(observed.reservationId, "failed", 0); }
        catch (error) {
          const saved = await this.dependencies.entitlements
            .readResearchReservation(identity.ownerId, context.execution.quotaKey).catch(() => null);
          if (!saved || saved.reservationId !== observed.reservationId || saved.finalStatus !== "failed") {
            throw preserve(error);
          }
        }
      } else if (observed.finalStatus !== "failed") {
        throw new EntitlementRepositoryError("CONFLICT");
      }
      recovery = await this.markOrRecover(identity, recovery, "quota");
    } else recovery = await this.dependencies.repository.mark(identity, "quota", recovery.version);

    if (!recovery.budgetDone) {
      const context = await this.context(identity, recovery);
      journal = await this.dependencies.importJournal.read(identity);
      if (journal) await this.dependencies.importer.reconcileMetadata(identity, journal.metadata);
      let reservation = await this.readBudget(identity, context.execution);
      if (journal) {
        reservation = await this.readBudget(identity, context.execution);
      } else {
        const settlement = recovery.reason === "executor-unsent"
          ? { kind: "not-charged" as const } : { kind: "unknown" as const };
        if (!matches(reservation, settlement.kind)) {
          if (reservation.status === "settled" || reservation.status === "released") {
            journal = await this.dependencies.importJournal.read(identity);
            if (!journal) throw unavailable();
            await this.dependencies.importer.reconcileMetadata(identity, journal.metadata);
            reservation = await this.readBudget(identity, context.execution);
          } else try { reservation = await this.dependencies.budget.settle(identity.ownerId, reservation.id, settlement); }
          catch (error) {
            const saved = await this.dependencies.budget.readReservation(identity.ownerId, reservation.id).catch(() => null);
            if (saved && sameBudget(saved, reservation) && matches(saved, settlement.kind)) reservation = saved;
            else {
              journal = await this.dependencies.importJournal.read(identity).catch(() => null);
              if (!journal) throw preserve(error);
              await this.dependencies.importer.reconcileMetadata(identity, journal.metadata);
              reservation = await this.readBudget(identity, context.execution);
            }
          }
        }
        if (!matches(reservation, settlement.kind) && !journal) throw unavailable();
      }
      recovery = await this.markOrRecover(identity, recovery, "budget");
    } else recovery = await this.dependencies.repository.mark(identity, "budget", recovery.version);
  }

  private async context(identity: SiteExecutionIdentity, recovery: SiteRecovery): Promise<Readonly<{
    execution: SiteExecutionRecord;
  }>> {
    const { identity: actual, execution } = await this.dependencies.bridgeRepository.lookup({
      jobId: identity.jobId, requestHash: identity.requestHash,
    });
    if (!sameIdentity(actual, identity) || execution.version !== recovery.executionVersion
      || execution.quotaReservationId === null || execution.budgetReservationId === null) throw unavailable();
    const exact = await this.dependencies.repository.read(identity);
    if (!exact || exact.version !== recovery.version || exact.terminalHash !== recovery.terminalHash
      || exact.runVersion !== recovery.runVersion || exact.executionVersion !== recovery.executionVersion) {
      throw unavailable();
    }
    // The expiry repository's read validates the complete canonical run snapshot.
    return Object.freeze({ execution });
  }

  private async readBudget(identity: SiteExecutionIdentity, execution: SiteExecutionRecord): Promise<BudgetReservation> {
    const id = execution.budgetReservationId;
    if (!id) throw unavailable();
    const reservation = await this.dependencies.budget.readReservation(identity.ownerId, id);
    if (!reservation || reservation.id !== id || reservation.ownerId !== identity.ownerId
      || reservation.runId !== identity.runId || reservation.requestId !== identity.requestId
      || reservation.maximumMicros !== execution.policy.maximumMicros
      || reservation.expiresAt !== execution.reservationExpiresAt
      || reservation.dayBucketId === reservation.monthBucketId) throw unavailable();
    const [day, month] = await Promise.all([
      this.dependencies.budget.readBucket(reservation.dayBucketId),
      this.dependencies.budget.readBucket(reservation.monthBucketId),
    ]);
    const date = new Date(reservation.createdAt);
    if (!day || !month || day.scope !== "site" || month.scope !== "site"
      || day.periodKind !== "day" || month.periodKind !== "month"
      || day.periodStart !== Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
      || month.periodStart !== Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
      || !Number.isSafeInteger(day.reservedMicros + day.settledMicros)
      || !Number.isSafeInteger(month.reservedMicros + month.settledMicros)
      || reservation.status === "conservative-hold"
        && (day.reservedMicros < reservation.maximumMicros || month.reservedMicros < reservation.maximumMicros)) {
      throw unavailable();
    }
    return reservation;
  }

  private async markOrRecover(identity: SiteExecutionIdentity, before: SiteRecovery,
    stage: "quota" | "budget"): Promise<SiteRecovery> {
    try { return await this.dependencies.repository.mark(identity, stage, before.version); }
    catch (error) {
      const saved = await this.dependencies.repository.read(identity).catch(() => null);
      if (saved && saved.terminalHash === before.terminalHash
        && saved.executionVersion === before.executionVersion && saved.runVersion === before.runVersion
        && (stage === "quota" ? saved.quotaDone : saved.budgetDone)) {
        return this.dependencies.repository.mark(identity, stage, saved.version);
      }
      throw preserve(error);
    }
  }
}

function matches(reservation: BudgetReservation, kind: "unknown" | "not-charged"): boolean {
  return kind === "unknown"
    ? reservation.status === "conservative-hold" && reservation.settledMicros === 0
    : reservation.status === "released" && reservation.settledMicros === 0;
}
function sameBudget(left: BudgetReservation, right: BudgetReservation): boolean {
  return left.id === right.id && left.ownerId === right.ownerId && left.runId === right.runId
    && left.requestId === right.requestId && left.dayBucketId === right.dayBucketId
    && left.monthBucketId === right.monthBucketId && left.maximumMicros === right.maximumMicros
    && left.expiresAt === right.expiresAt;
}
function sameIdentity(left: SiteExecutionIdentity, right: SiteExecutionIdentity): boolean {
  return left.ownerId === right.ownerId && left.runId === right.runId
    && left.requestId === right.requestId && left.jobId === right.jobId
    && left.requestHash === right.requestHash;
}
function unavailable() { return new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); }
function preserve(error: unknown): Error {
  if (error instanceof ResearchRepositoryError || error instanceof EntitlementRepositoryError
    || error instanceof ResearchBudgetError) return error;
  return unavailable();
}
