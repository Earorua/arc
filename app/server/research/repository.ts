import type { ResearchCandidate, ResearchPackage, ResearchPublicFailureCategory, ResearchQualityReport, ResearchRunPublicView, ResearchState } from "../../contracts/research";
import type { ResearchValidationResult } from "./package-validator";
import type { SiteAdmissionResult, SiteExecutionIdentity, SiteExecutionRecord } from "./site-execution-repository";

export type ResearchExecutionMode = "synchronous" | "cloudflare-workflow-v1";

export type ResearchRunRecord = {
  id: string; ownerId: string; requestId: string; mutationId: string; rawRole: string; normalizedRoleKey: string;
  locale: "zh-CN" | "en-US"; inputFingerprint: string; configFingerprint: string; executionMode: ResearchExecutionMode;
  remoteQuotaKey: string | null; state: ResearchState;
  stateVersion: number; retryable: boolean; activeExpiresAt: number | null; packageId: string | null;
  errorCode: string | null; failureCategory: ResearchPublicFailureCategory | null; quality: ResearchQualityReport | null;
  candidate: ResearchCandidate | null; retryOfRunId: string | null; createdAt: number; updatedAt: number;
};

export type CreateResearchRunCommand = Omit<ResearchRunRecord, "id" | "state" | "stateVersion" | "retryable" | "packageId" | "errorCode" | "failureCategory" | "quality" | "candidate" | "retryOfRunId" | "createdAt" | "updatedAt" | "activeExpiresAt" | "executionMode" | "remoteQuotaKey"> & { activeExpiresAt: number };
export type ResearchCacheLookup = Pick<ResearchRunRecord, "normalizedRoleKey" | "locale" | "configFingerprint"> & { now?: number };
export type AttachCachedPackageCommand = { id: string; ownerId: string; expectedVersion: number; package: ResearchPackage };
export type TransitionResearchRunCommand = { id: string; ownerId: string; expectedVersion: number; from: ResearchState; to: ResearchState; retryable?: boolean; errorCode?: string; failureCategory?: ResearchPublicFailureCategory };
export type SaveResearchValidationCommand = { id: string; ownerId: string; expectedVersion: number; result: ResearchValidationResult; normalizedRoleKey: string; locale: "zh-CN" | "en-US"; configFingerprint: string };
export type CreateResearchRetryCommand = { ownerId: string; requestId: string; mutationId: string; runId: string; activeExpiresAt: number };
export type RemoteCreationPolicy = Readonly<{
  cacheDays: number;
  userDailyQuota: number;
  dailyBudgetMicros: number;
  monthlyBudgetMicros: number;
  maximumMicros: number;
}>;
export type CreateRemoteResearchRunCommand = Omit<CreateResearchRunCommand, "activeExpiresAt"> & { policy: RemoteCreationPolicy };
export type CreateRemoteResearchRetryCommand = Readonly<{
  ownerId: string;
  runId: string;
  requestId: string;
  mutationId: string;
  currentConfigFingerprint: string;
  policy: RemoteCreationPolicy;
}>;
export type RemoteCreationResult = Readonly<{
  run: ResearchRunRecord;
  replayed: boolean;
  execution: SiteExecutionRecord | null;
}>;
export type RecoverResearchRunCommand = Pick<ResearchRunRecord, "ownerId" | "mutationId" | "normalizedRoleKey" | "locale" | "inputFingerprint" | "retryOfRunId">;
export type ResearchReadyPackageAuditVersions = Readonly<Pick<ResearchPackage, "promptVersion" | "inputSchemaVersion" | "outputSchemaVersion">>;

export interface ResearchRepository {
  // Owners must come from the authenticated session, never from a request body.
  // All entry points validate bounded plain JSON and fail with ResearchRepositoryError.
  createOrReplay(command: CreateResearchRunCommand): Promise<{ run: ResearchRunRecord; replayed: boolean }>;
  findRecoveryRun(command: RecoverResearchRunCommand): Promise<ResearchRunRecord | null>;
  getRun(ownerId: string, runId: string): Promise<ResearchRunRecord | null>;
  findFreshPackage(input: ResearchCacheLookup): Promise<ResearchPackage | null>;
  attachCachedPackage(command: AttachCachedPackageCommand): Promise<ResearchRunRecord>;
  transition(command: TransitionResearchRunCommand): Promise<ResearchRunRecord>;
  saveValidation(command: SaveResearchValidationCommand): Promise<ResearchRunRecord>;
  getPublicRun(ownerId: string, runId: string): Promise<ResearchRunPublicView | null>;
  createRetry(command: CreateResearchRetryCommand): Promise<{ run: ResearchRunRecord; replayed: boolean }>;
  resolveReadyPackage(ownerId: string, runId: string): Promise<ResearchPackage>;
  readReadyPackageAuditVersions(ownerId: string, runId: string): Promise<ResearchReadyPackageAuditVersions>;
}

export interface RemoteResearchCreationRepository {
  createRemoteOrReplay(command: CreateRemoteResearchRunCommand): Promise<RemoteCreationResult>;
  createRemoteRetry(command: CreateRemoteResearchRetryCommand): Promise<RemoteCreationResult>;
  attachRemoteCachedPackage(command: SiteExecutionIdentity & Readonly<{
    expectedRunVersion: number;
    expectedExecutionVersion: number;
    package: ResearchPackage;
  }>): Promise<SiteAdmissionResult>;
}

export class ResearchRepositoryError extends Error {
  constructor(readonly code: "CONFLICT" | "NOT_FOUND" | "NOT_READY" | "RESEARCH_UNAVAILABLE") { super(code); this.name = "ResearchRepositoryError"; }
}
