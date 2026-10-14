import type { BridgeJob } from "./executor/job";
import type { ResearchValidationContext } from "./package-validator";
import type { RemoteCreationPolicy } from "./repository";
import type { ResearchRunRecord } from "./repository";
import { ResearchRepositoryError } from "./repository";

export type SiteExecutionIdentity = Readonly<{
  ownerId: string;
  runId: string;
  requestId: string;
  jobId: string;
  requestHash: string;
}>;

export type SiteExecutionRecord = SiteExecutionIdentity & Readonly<{
  job: BridgeJob;
  validationContext: ResearchValidationContext;
  quotaKey: string;
  policy: RemoteCreationPolicy;
  reservationExpiresAt: number;
  admissionState: "pending" | "admitted" | "closed";
  version: number;
  quotaReservationId: string | null;
  budgetReservationId: string | null;
  admittedAt: number | null;
  closedAt: number | null;
  closeReason: "cached" | "denied" | "expired" | "interrupted" | null;
  beganAt: number | null;
  executionExpiresAt: number | null;
  createdAt: number;
  updatedAt: number;
}>;

export type SiteAdmissionResult = Readonly<{
  run: ResearchRunRecord;
  execution: SiteExecutionRecord;
}>;

/** Internal read provenance: an exact queued lease was observed before a validated begin grant. */
export type SiteRunReadObservation = Readonly<Pick<ResearchRunRecord, "ownerId" | "id" | "requestId" | "mutationId"
  | "executionMode" | "remoteQuotaKey" | "rawRole" | "normalizedRoleKey" | "locale" | "inputFingerprint"
  | "configFingerprint" | "retryOfRunId" | "createdAt" | "state" | "stateVersion" | "activeExpiresAt">>;

/** Own only primitive fields needed for identity/version/lease evidence; no nested caller references. */
export function observeSiteRun(run: SiteRunReadObservation): SiteRunReadObservation {
  return Object.freeze({ ownerId: run.ownerId, id: run.id, requestId: run.requestId, mutationId: run.mutationId,
    executionMode: run.executionMode, remoteQuotaKey: run.remoteQuotaKey, rawRole: run.rawRole,
    normalizedRoleKey: run.normalizedRoleKey, locale: run.locale, inputFingerprint: run.inputFingerprint,
    configFingerprint: run.configFingerprint, retryOfRunId: run.retryOfRunId, createdAt: run.createdAt,
    state: run.state, stateVersion: run.stateVersion, activeExpiresAt: run.activeExpiresAt });
}

export class SiteExecutionReadSkew extends ResearchRepositoryError {
  readonly observedRun: SiteRunReadObservation;
  readonly identity: SiteExecutionIdentity;
  constructor(run: ResearchRunRecord, execution: SiteExecutionRecord) {
    super("RESEARCH_UNAVAILABLE");
    this.observedRun = observeSiteRun(run);
    this.identity = Object.freeze({ ownerId: execution.ownerId, runId: execution.runId,
      requestId: execution.requestId, jobId: execution.jobId, requestHash: execution.requestHash });
  }
}

export interface SiteExecutionRepository {
  read(ownerId: string, runId: string): Promise<SiteExecutionRecord | null>;
  markAdmitted(command: SiteExecutionIdentity & Readonly<{
    expectedVersion: number;
    quotaReservationId: string;
    budgetReservationId: string;
  }>): Promise<SiteExecutionRecord>;
  closeBeforeBegin(command: SiteExecutionIdentity & Readonly<{
    reason: "denied" | "expired" | "interrupted";
  }>): Promise<SiteAdmissionResult>;
}
