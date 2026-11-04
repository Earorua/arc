import { documentAcceptanceConfigurationDigest } from "../../worker/document-executor/acceptance-policy";
import { readDocumentSitePolicy } from "../../app/server/documents/policy";
import type { DocumentProviderQualification } from "../../worker/document-executor/provider-http";

/** In-memory authorizations for controlled transport tests. Each expires one hour after fixture creation. */
export async function productionFixtureSettings() {
  const qualification: DocumentProviderQualification = {
    qualified: true, endpoint: "https://openrouter.ai/api/v1/chat/completions", model: "moonshotai/kimi-k3.1-pro",
    providerPolicyId: "offline-test-policy", priceVersion: "2026.11.1",
    routingPolicy: {policyVersion:"2026.11.1", providerOrder:["moonshotai/mxfp4"], allowFallback:false, dataPolicy:"zdr-only"},
    receiptRoute: {providerName:"Moonshot AI", endpointId:"a3fafaac-f097-4ef1-86b3-842854dad5c6"},
    inputMicroUsdPerMillionTokens:2_000_000, outputMicroUsdPerMillionTokens:10_000_000, inputTokenBound:"utf8-bytes-plus-4096",
  };
  const environment: Record<string, string> = {
    ARC_ENVIRONMENT: "production", ARC_DOCUMENTS_ENABLED: "true", ARC_DOCUMENT_ANALYSIS_ENABLED: "true",
    ARC_DOCUMENT_PRODUCTION_ENABLED: "true", ARC_DOCUMENT_PROVIDER: "OpenRouter / Moonshot AI",
    ARC_DOCUMENT_PROVIDER_ENDPOINT: qualification.endpoint, ARC_DOCUMENT_MODEL: qualification.model,
    ARC_DOCUMENT_PROVIDER_POLICY_ID: qualification.providerPolicyId, ARC_DOCUMENT_PRICE_VERSION: qualification.priceVersion,
    ARC_DOCUMENT_ROUTING_POLICY: JSON.stringify(qualification.routingPolicy),
    ARC_DOCUMENT_PROVIDER_QUALIFICATION: JSON.stringify(qualification),
    ARC_DOCUMENT_USER_DAILY_MICRO_USD: "150000", ARC_DOCUMENT_GLOBAL_DAILY_MICRO_USD: "300000",
    ARC_DOCUMENT_MAX_JOB_MICRO_USD: "74000", ARC_DOCUMENT_MAX_INPUT_TOKENS: "16000",
    ARC_DOCUMENT_MAX_OUTPUT_TOKENS: "4096", ARC_DOCUMENT_HTTP_TIMEOUT_MS: "10000",
    ARC_DOCUMENT_BRIDGE_SECRET: "offline-materials-bridge-fixture-only-32-characters",
  };
  const authorization = { purpose: "production-private-material-analysis", id: "offline-test-only",
    configurationSha256: await documentAcceptanceConfigurationDigest(readDocumentSitePolicy(environment).analysis!, qualification),
    totalBudgetMicroUsd: 100000, approvedAt: new Date(Date.now() - 60000).toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString() };
  environment.ARC_DOCUMENT_PRODUCTION_AUTHORIZATION = JSON.stringify(authorization);
  return { environment, qualification, authorization };
}
