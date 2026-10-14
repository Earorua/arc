import type { ResearchCandidate, ResearchPackage, ResearchPublicFailureCategory, ResearchQualityReport } from "../../contracts/research";
import type { ResearchAiRunRecord } from "../ai/gateway";
import type { BudgetSettlement } from "./budget";
import type { BridgeReceiptMetadata } from "./executor/receipt";
import type { ResearchValidationContext } from "./package-validator";
import type { ResearchRunRecord } from "./repository";
import type { SiteExecutionIdentity } from "./site-execution-repository";

export type SiteImportPhase = 0 | 1 | 2 | 3 | 4 | 5;
export type SiteImportDecision =
  | Readonly<{ kind: "ready"; package: ResearchPackage; quality: ResearchQualityReport }>
  | Readonly<{ kind: "needs-review"; quality: ResearchQualityReport; candidate: ResearchCandidate | null }>
  | Readonly<{ kind: "failed"; quality: ResearchQualityReport | null; errorCode: string;
      failureCategory: ResearchPublicFailureCategory; retryable: boolean }>;
export type SiteImportResolution = Readonly<{ state: "ready" | "needs-review" | "failed"; runVersion: number;
  packageId: string | null; terminalHash: string; quotaStatus: "accepted" | "rejected" | "failed"; resolvedAt: number }>;
export type SiteImportRecord = SiteExecutionIdentity & Readonly<{ mode: "body" | "metadata-only"; configFingerprint: string;
  validationContext: ResearchValidationContext; executionVersion: number; metadata: BridgeReceiptMetadata;
  audit: ResearchAiRunRecord; settlement: BudgetSettlement; decisionHash: string; decision: SiteImportDecision | null;
  phase: SiteImportPhase; version: number; resolution: SiteImportResolution | null; createdAt: number; updatedAt: number }>;
export type SiteImportResult = Readonly<{ run: ResearchRunRecord; receiptHash: string; accounting: "settled" | "released" | "held" }>;
export interface SiteImportRepository {
  read(identity: SiteExecutionIdentity): Promise<SiteImportRecord | null>;
  captureBody(identity: SiteExecutionIdentity, receipt: unknown): Promise<SiteImportRecord>;
  captureMetadata(identity: SiteExecutionIdentity, metadata: unknown): Promise<SiteImportRecord>;
  markAudit(identity: SiteExecutionIdentity, receiptHash: string): Promise<SiteImportRecord>;
  markQuota(identity: SiteExecutionIdentity, receiptHash: string): Promise<SiteImportRecord>;
  markBudget(identity: SiteExecutionIdentity, receiptHash: string): Promise<SiteImportRecord>;
  finish(identity: SiteExecutionIdentity, receiptHash: string): Promise<SiteImportRecord>;
}
export interface SiteImportPublication {
  resolve(identity: SiteExecutionIdentity, receiptHash: string): Promise<SiteImportRecord>;
}
