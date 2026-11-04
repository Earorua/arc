import { canonicalJson } from "../../app/lib/planning/fingerprint.ts";
import type { DocumentAnalysisMetadata } from "../../app/server/documents/policy";
import type { DocumentProviderQualification } from "./provider-http";
import cases from "./acceptance-corpus.json" with { type: "json" };

// Only commitments ship in the executor. Raw corpus text and evaluator annotations stay offline.
export const documentAcceptanceCorpusSha256 = "69e5ddd1005f12abf24483e10dd235629ef309ba3a84e922166963ccd9aed750";
export const documentAcceptanceCases: Readonly<Record<string, string>> = Object.freeze(cases);
export async function utf8Sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, "0")).join("");
}
export function documentAcceptanceConfigurationDigest(config: DocumentAnalysisMetadata, qualification: DocumentProviderQualification) {
  // An explicit metadata projection works with both site policy and secret-bearing executor policy.
  const { provider, model, endpoint, providerPolicyId, routingPolicy, priceVersion, userDailyMicroUsd,
    globalDailyMicroUsd, maxJobMicroUsd, maxInputTokens, maxOutputTokens, httpTimeoutMs } = config;
  return utf8Sha256(canonicalJson({ config: { provider, model, endpoint, providerPolicyId, routingPolicy, priceVersion,
    userDailyMicroUsd, globalDailyMicroUsd, maxJobMicroUsd, maxInputTokens, maxOutputTokens, httpTimeoutMs }, qualification }));
}
export type DocumentAcceptanceGate = {
  runId: string;
  configurationSha256: Promise<string>;
  reservationMicroUsd: number;
};
