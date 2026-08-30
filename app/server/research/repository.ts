import type { ResearchCandidate, ResearchPackage, ResearchPublicFailureCategory, ResearchQualityReport, ResearchRunPublicView, ResearchState } from "../../contracts/research";
import type { ResearchValidationResult } from "./package-validator";

export type ResearchRunRecord = {
  id: string; ownerId: string; requestId: string; mutationId: string; rawRole: string; normalizedRoleKey: string;
  locale: "zh-CN" | "en-US"; inputFingerprint: string; configFingerprint: string; state: ResearchState;
  stateVersion: number; retryable: boolean; activeExpiresAt: number | null; packageId: string | null;
  errorCode: string | null; failureCategory: ResearchPublicFailureCategory | null; quality: ResearchQualityReport | null;
  candidate: ResearchCandidate | null; retryOfRunId: string | null; createdAt: number; updatedAt: number;
};

export type CreateResearchRunCommand = Omit<ResearchRunRecord, "id" | "state" | "stateVersion" | "retryable" | "packageId" | "errorCode" | "failureCategory" | "quality" | "candidate" | "retryOfRunId" | "createdAt" | "updatedAt" | "activeExpiresAt"> & { activeExpiresAt: number };
export type ResearchCacheLookup = Pick<ResearchRunRecord, "normalizedRoleKey" | "locale" | "configFingerprint"> & { now?: number };
export type AttachCachedPackageCommand = { id: string; ownerId: string; expectedVersion: number; package: ResearchPackage };
export type TransitionResearchRunCommand = { id: string; ownerId: string; expectedVersion: number; from: ResearchState; to: ResearchState; retryable?: boolean; errorCode?: string; failureCategory?: ResearchPublicFailureCategory };
export type SaveResearchValidationCommand = { id: string; ownerId: string; expectedVersion: number; result: ResearchValidationResult; normalizedRoleKey: string; locale: "zh-CN" | "en-US"; configFingerprint: string };
export type CreateResearchRetryCommand = { ownerId: string; requestId: string; mutationId: string; runId: string; activeExpiresAt: number };

export interface ResearchRepository {
  // Owners must come from the authenticated session, never from a request body.
  // All entry points validate bounded plain JSON and fail with ResearchRepositoryError.
  createOrReplay(command: CreateResearchRunCommand): Promise<{ run: ResearchRunRecord; replayed: boolean }>;
  getRun(ownerId: string, runId: string): Promise<ResearchRunRecord | null>;
  findFreshPackage(input: ResearchCacheLookup): Promise<ResearchPackage | null>;
  attachCachedPackage(command: AttachCachedPackageCommand): Promise<ResearchRunRecord>;
  transition(command: TransitionResearchRunCommand): Promise<ResearchRunRecord>;
  saveValidation(command: SaveResearchValidationCommand): Promise<ResearchRunRecord>;
  getPublicRun(ownerId: string, runId: string): Promise<ResearchRunPublicView | null>;
  createRetry(command: CreateResearchRetryCommand): Promise<{ run: ResearchRunRecord; replayed: boolean }>;
  resolveReadyPackage(ownerId: string, runId: string): Promise<ResearchPackage>;
}

export class ResearchRepositoryError extends Error {
  constructor(readonly code: "CONFLICT" | "NOT_FOUND" | "NOT_READY" | "RESEARCH_UNAVAILABLE") { super(code); this.name = "ResearchRepositoryError"; }
}
