import {materialSha256} from "../../contracts/material-planning";
import type { DocumentReceiptAudit } from "./provider-receipt";
import type {DocumentAnalysisMetadata} from "./policy";
/** In-memory provider boundary. Never serialize this input into Workflow history. */
export type DocumentProviderInput = Readonly<{
  textVersionId: string;
  text: string;
  segments: readonly Readonly<{ id: string; start: number; end: number }>[];
  kind: "resume" | "jd" | "supplement";
  providerPolicyId: string;
  outputSchemaVersion: "2026.11.1";
  execution?:Readonly<{modelVersion:string;priceVersion:string;configurationDigest:string;
    sendScope?:Readonly<{consentId:string;generation:number}>;
    acceptance?:Readonly<{runId:string;configurationSha256:string;ownerId:string;documentId:string;documentVersionId:string;generation:number}>}>;
}>;

export type DocumentProviderOutcome =
  | Readonly<{ kind: "received"; candidate: unknown; inputTokens: number | null; outputTokens: number | null;
      actualMicroUsd: number | null; receiptId: string | null; audit?: DocumentReceiptAudit }>
  | Readonly<{ kind: "not-sent"; code: "configuration" | "aborted-before-send" }>
  | Readonly<{ kind: "unknown"; code: "timeout" | "connection-lost" | "invalid-receipt" }>;

export type DocumentReceiptClaim = (receiptId: string, observed: Readonly<{
  sentAt: string; returnedAt: string; inputTokens: number | null; outputTokens: number | null; actualMicroUsd: number | null;
}>) => Promise<boolean>;
export interface DocumentAnalysisProvider {
  analyze(input: DocumentProviderInput, signal: AbortSignal, beforeSend?: () => Promise<boolean>,
    claimReceipt?: DocumentReceiptClaim): Promise<DocumentProviderOutcome>;
}

export function documentProviderConfigurationDigest(config:DocumentAnalysisMetadata,reservationMicroUsd:number,acceptanceRunId?:string,acceptanceConfigurationSha256?:string):Promise<string>{
  return materialSha256({provider:config.provider,endpoint:config.endpoint,model:config.model,providerPolicyId:config.providerPolicyId,
    routingPolicy:config.routingPolicy,priceVersion:config.priceVersion,maxInputTokens:config.maxInputTokens,maxOutputTokens:config.maxOutputTokens,reservationMicroUsd,
    ...(acceptanceRunId ? {acceptanceRunId,acceptanceConfigurationSha256} : {})});
}
