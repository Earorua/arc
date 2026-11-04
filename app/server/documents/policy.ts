import { z } from "zod";
import { MAX_DOCUMENT_ITEMS_JSON_BYTES, MAX_DOCUMENT_TEXT_CODE_POINTS, MAX_DOCUMENT_TEXT_UTF8_BYTES, MAX_MATERIAL_CONTEXT_JSON_BYTES, materialIdSchema, materialVersionSchema } from "../../contracts/documents";

export const DOCUMENT_LIMITS = Object.freeze({
  documentsPerOwner: 30, textVersionsPerDocument: 10, retainedCodePointsPerOwner: 1_000_000,
  textCodePoints: MAX_DOCUMENT_TEXT_CODE_POINTS, textUtf8Bytes: MAX_DOCUMENT_TEXT_UTF8_BYTES, createBodyBytes: 512 * 1024,
  primaryResumesPerSelection: 1, primaryJdsPerSelection: 1, supplementsPerSelection: 3,
  candidatesPerDocument: 100, itemTextCharacters: 1000, itemsJsonBytes: MAX_DOCUMENT_ITEMS_JSON_BYTES,
  contextJsonBytes: MAX_MATERIAL_CONTEXT_JSON_BYTES, executionSlotsPerOwner: 1, queuedJobsPerOwner: 5,
  queueWaitMs: 30 * 60 * 1000, workflowDtoBytes: 4 * 1024, maxInputTokens: 16_000, maxOutputTokens: 4096,
  httpTimeoutMs: 180_000, paidStepTimeoutMs: 240_000,
});
const moneySchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const documentRoutingPolicySchema = z.object({
  policyVersion: materialVersionSchema, providerOrder: z.array(z.string().trim().min(1).max(100)).min(1).max(8)
    .refine((providers) => new Set(providers).size === providers.length, "Duplicate providers"),
  allowFallback: z.literal(false), dataPolicy: z.literal("zdr-only"),
}).strict();
const analysisFields = z.object({
  provider: z.string().trim().min(1).max(100), model: z.string().trim().min(1).max(200),
  endpoint: z.string().url().max(2048).refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.hash;
  }, "An explicit HTTPS provider endpoint is required"),
  providerPolicyId: materialIdSchema, routingPolicy: documentRoutingPolicySchema, priceVersion: materialVersionSchema,
  userDailyMicroUsd: moneySchema, globalDailyMicroUsd: moneySchema, maxJobMicroUsd: moneySchema,
  maxInputTokens: z.number().int().min(1).max(DOCUMENT_LIMITS.maxInputTokens),
  maxOutputTokens: z.number().int().min(1).max(DOCUMENT_LIMITS.maxOutputTokens),
  httpTimeoutMs: z.number().int().min(1).max(DOCUMENT_LIMITS.httpTimeoutMs),
}).strict();
const withinBudget = (config: z.infer<typeof analysisFields>) =>
  config.maxJobMicroUsd <= config.userDailyMicroUsd && config.userDailyMicroUsd <= config.globalDailyMicroUsd;
const budgetMessage = "Per-job and per-user budgets must fit global budget";
export const documentAnalysisMetadataSchema = analysisFields.refine(withinBudget, budgetMessage);
export const documentAnalysisConfigurationSchema = analysisFields.extend({ apiKey: z.string().trim().min(1).max(8192) }).refine(withinBudget, budgetMessage);
export type DocumentAnalysisMetadata = z.infer<typeof documentAnalysisMetadataSchema>;
export type DocumentAnalysisConfiguration = z.infer<typeof documentAnalysisConfigurationSchema>;
export type DocumentPolicy<T extends DocumentAnalysisMetadata = DocumentAnalysisMetadata> = Readonly<{
  documentsEnabled: boolean; analysisEnabled: boolean; planningEnabled: boolean;
  fileUploadEnabled: false; agentProjectionEnabled: false; statusEnabled: true; deletionEnabled: true;
  analysis: T | null; analysisReadiness: "configured" | "disabled" | "configuration-incomplete";
}>;
function integerSetting(value: unknown): number | undefined {
  return typeof value === "string" && /^(?:0|[1-9]\d*)$/u.test(value) ? Number(value) : undefined;
}
function jsonSetting(value: unknown): unknown {
  if (typeof value !== "string" || value.length > 8192) return undefined;
  try { return JSON.parse(value); } catch { return undefined; }
}
function metadataSettings(env: Readonly<Record<string, unknown>>) {
  return {
    provider: env.ARC_DOCUMENT_PROVIDER, model: env.ARC_DOCUMENT_MODEL,
    endpoint: env.ARC_DOCUMENT_PROVIDER_ENDPOINT, providerPolicyId: env.ARC_DOCUMENT_PROVIDER_POLICY_ID,
    routingPolicy: jsonSetting(env.ARC_DOCUMENT_ROUTING_POLICY), priceVersion: env.ARC_DOCUMENT_PRICE_VERSION,
    userDailyMicroUsd: integerSetting(env.ARC_DOCUMENT_USER_DAILY_MICRO_USD), globalDailyMicroUsd: integerSetting(env.ARC_DOCUMENT_GLOBAL_DAILY_MICRO_USD),
    maxJobMicroUsd: integerSetting(env.ARC_DOCUMENT_MAX_JOB_MICRO_USD), maxInputTokens: integerSetting(env.ARC_DOCUMENT_MAX_INPUT_TOKENS),
    maxOutputTokens: integerSetting(env.ARC_DOCUMENT_MAX_OUTPUT_TOKENS), httpTimeoutMs: integerSetting(env.ARC_DOCUMENT_HTTP_TIMEOUT_MS),
  };
}
/** The site reserves budgets and verifies the approved configuration using public fields. */
export function readDocumentSitePolicy(env: Readonly<Record<string, unknown>>): DocumentPolicy {
  return policyFromAnalysis(env, documentAnalysisMetadataSchema.safeParse(metadataSettings(env)));
}
/** Only the executor needs a credential. A valid configuration alone does not authorize sending. */
export function readDocumentPolicy(env: Readonly<Record<string, unknown>>): DocumentPolicy<DocumentAnalysisConfiguration> {
  return policyFromAnalysis(env, documentAnalysisConfigurationSchema.safeParse({ ...metadataSettings(env), apiKey: env.ARC_DOCUMENT_PROVIDER_API_KEY }));
}
function policyFromAnalysis<T extends DocumentAnalysisMetadata>(env: Readonly<Record<string, unknown>>, parsed: { success: true; data: T } | { success: false }): DocumentPolicy<T> {
  const documentsEnabled = env.ARC_DOCUMENTS_ENABLED === "true";
  const requestedAnalysis = env.ARC_DOCUMENT_ANALYSIS_ENABLED === "true";
  const analysisEnabled = requestedAnalysis && parsed.success;
  return {
    documentsEnabled, analysisEnabled, planningEnabled: env.ARC_DOCUMENT_PLANNING_ENABLED === "true",
    fileUploadEnabled: false, agentProjectionEnabled: false, statusEnabled: true, deletionEnabled: true,
    analysis: parsed.success && requestedAnalysis ? parsed.data : null,
    analysisReadiness: !requestedAnalysis ? "disabled" : parsed.success ? "configured" : "configuration-incomplete",
  };
}
