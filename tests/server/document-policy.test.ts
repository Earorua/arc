import { describe, expect, it } from "vitest";
import { DOCUMENT_LIMITS, readDocumentPolicy, readDocumentSitePolicy } from "../../app/server/documents/policy";

const configured = {
  ARC_DOCUMENTS_ENABLED: "true", ARC_DOCUMENT_ANALYSIS_ENABLED: "true", ARC_DOCUMENT_PLANNING_ENABLED: "true",
  ARC_DOCUMENT_PROVIDER: "synthetic", ARC_DOCUMENT_MODEL: "synthetic-model", ARC_DOCUMENT_PROVIDER_API_KEY: "synthetic-secret",
  ARC_DOCUMENT_PROVIDER_ENDPOINT: "https://synthetic.invalid/analyze", ARC_DOCUMENT_PROVIDER_POLICY_ID: "policy-a",
  ARC_DOCUMENT_ROUTING_POLICY: JSON.stringify({ policyVersion: "2026.11.1", providerOrder: ["synthetic"], allowFallback: false, dataPolicy: "zdr-only" }),
  ARC_DOCUMENT_PRICE_VERSION: "2026.11.1", ARC_DOCUMENT_USER_DAILY_MICRO_USD: "1000000", ARC_DOCUMENT_GLOBAL_DAILY_MICRO_USD: "10000000", ARC_DOCUMENT_MAX_JOB_MICRO_USD: "100000",
  ARC_DOCUMENT_MAX_INPUT_TOKENS: "16000", ARC_DOCUMENT_MAX_OUTPUT_TOKENS: "4096", ARC_DOCUMENT_HTTP_TIMEOUT_MS: "180000",
};

describe("independent document policy", () => {
  it("can qualify site metadata without accessing the executor billing credential", () => {
    const site = { ...configured, get ARC_DOCUMENT_PROVIDER_API_KEY(): string { throw new Error("executor-only"); } };
    const policy = readDocumentSitePolicy(site);
    expect(policy.analysisEnabled).toBe(true);
    expect(policy.analysis).not.toHaveProperty("apiKey");
    expect(readDocumentSitePolicy({ ...configured, ARC_DOCUMENT_MAX_JOB_MICRO_USD: "invalid" }).analysisEnabled).toBe(false);
  });
  it("defaults every feature off and keeps status/delete available", () => expect(readDocumentPolicy({})).toMatchObject({ documentsEnabled: false, analysisEnabled: false, planningEnabled: false, fileUploadEnabled: false, agentProjectionEnabled: false, statusEnabled: true, deletionEnabled: true, analysis: null }));
  it("accepts only complete independently configured document analysis", () => expect(readDocumentPolicy(configured)).toMatchObject({ documentsEnabled: true, analysisEnabled: true, planningEnabled: true, analysis: { maxJobMicroUsd: 100000 } }));
  it.each(Object.keys(configured).filter((key) => !key.endsWith("ENABLED")))("fails closed without %s", (key) => {
    const env: Record<string, string> = { ...configured }; delete env[key];
    expect(readDocumentPolicy(env).analysisEnabled).toBe(false);
  });
  it.each(["-1", "1.2", "Infinity", "9007199254740992", "", " 100", "100x"])("rejects non-integer budget %s", (value) => expect(readDocumentPolicy({ ...configured, ARC_DOCUMENT_MAX_JOB_MICRO_USD: value }).analysisEnabled).toBe(false));
  it("ignores Research and Agent config and never allows unsupported features", () => {
    expect(readDocumentPolicy({ ARC_DOCUMENT_ANALYSIS_ENABLED: "true", ARC_RESEARCH_API_KEY: "key", ARC_AGENT_API_KEY: "key", ARC_DOCUMENT_FILE_UPLOAD_ENABLED: "true", ARC_DOCUMENT_AGENT_PROJECTION_ENABLED: "true" })).toMatchObject({ analysisEnabled: false, fileUploadEnabled: false, agentProjectionEnabled: false });
  });
  it("enforces token, time, budget and routing ceilings", () => {
    for (const change of [{ ARC_DOCUMENT_MAX_INPUT_TOKENS: "16001" }, { ARC_DOCUMENT_MAX_OUTPUT_TOKENS: "4097" }, { ARC_DOCUMENT_HTTP_TIMEOUT_MS: "180001" }, { ARC_DOCUMENT_MAX_JOB_MICRO_USD: "2000000" }, { ARC_DOCUMENT_ROUTING_POLICY: JSON.stringify({ policyVersion: "2026.11.1", providerOrder: ["synthetic"], allowFallback: true, dataPolicy: "zdr-only" }) }]) expect(readDocumentPolicy({ ...configured, ...change }).analysisEnabled).toBe(false);
  });
  it("freezes quota defaults in separate character and byte units", () => expect(DOCUMENT_LIMITS).toMatchObject({ documentsPerOwner: 30, textVersionsPerDocument: 10, retainedCodePointsPerOwner: 1000000, textCodePoints: 50000, textUtf8Bytes: 262144, createBodyBytes: 524288, candidatesPerDocument: 100, itemsJsonBytes: 131072, contextJsonBytes: 262144, executionSlotsPerOwner: 1, queuedJobsPerOwner: 5, queueWaitMs: 1800000, workflowDtoBytes: 4096, maxInputTokens: 16000, maxOutputTokens: 4096, httpTimeoutMs: 180000, paidStepTimeoutMs: 240000 }));
});
