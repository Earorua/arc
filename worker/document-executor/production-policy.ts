import { z } from "zod";
import { materialDigestSchema, materialIdSchema, materialTimestampSchema } from "../../app/contracts/documents";
import { materialSha256 } from "../../app/contracts/material-planning";
import type { DocumentAnalysisMetadata } from "../../app/server/documents/policy";
import { documentAcceptanceConfigurationDigest } from "./acceptance-policy";
import type { DocumentProviderQualification } from "./provider-http";

type Environment = Readonly<Record<string, unknown>>;
export function documentTransportMode(env: Environment, side: "site" | "executor") {
  const mode = env.ARC_DOCUMENT_ACCEPTANCE_MODE, run = env.ARC_DOCUMENT_ACCEPTANCE_RUN_ID;
  const fake = env.DOCUMENT_PROVIDER_TRANSPORT !== undefined;
  const production = env.ARC_ENVIRONMENT === "production";
  if (env.ARC_DOCUMENT_QUALIFICATION_ENABLED !== undefined || env.ARC_DOCUMENT_QUALIFICATION_SETTINGS !== undefined) return "closed";
  if (env.ARC_DOCUMENT_PRODUCTION_ENABLED !== undefined || env.ARC_DOCUMENT_PRODUCTION_AUTHORIZATION !== undefined) {
    return production && env.ARC_DOCUMENT_PRODUCTION_ENABLED === "true" && typeof env.ARC_DOCUMENT_PRODUCTION_AUTHORIZATION === "string"
      && mode === undefined && run === undefined && !fake ? "production" : "closed";
  }
  if (mode === "live") return production && materialIdSchema.safeParse(run).success && !fake ? "acceptance" : "closed";
  if (run !== undefined || (mode !== "synthetic" && (mode !== undefined || production))) return "closed";
  // The synthetic binding exists only on the executor. Local development site fixtures may supply their own executor.
  return (side === "site" ? !fake : fake) ? "synthetic" : "closed";
}

export function readDocumentJson(setting: unknown): unknown {
  if (typeof setting !== "string" || setting.length > 8192) return null;
  try {
    return JSON.parse(setting, (key, value: unknown) => { if (key === "__proto__") throw new Error(); return value; });
  } catch { return null; }
}

export const documentProductionAuthorizationSchema = z.object({
  purpose: z.literal("production-private-material-analysis"), id: materialIdSchema,
  configurationSha256: materialDigestSchema, approvedAt: materialTimestampSchema, expiresAt: materialTimestampSchema,
  totalBudgetMicroUsd: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}).strict().refine(grant => Date.parse(grant.approvedAt) < Date.parse(grant.expiresAt));
type Authorization = z.infer<typeof documentProductionAuthorizationSchema>;
export type DocumentProductionRelease = {
  authorization: Authorization;
  reservationMicroUsd: number;
  /** Null if the grant does not commit to the current public budgets, prices, limits, policy and receipt route. */
  identity: Promise<string | null>;
};
export function readDocumentProductionRelease(env: Environment, config: DocumentAnalysisMetadata,
  qualification: DocumentProviderQualification, reservationMicroUsd: number): DocumentProductionRelease | null {
  const grant = documentProductionAuthorizationSchema.safeParse(readDocumentJson(env.ARC_DOCUMENT_PRODUCTION_AUTHORIZATION));
  if (!grant.success || reservationMicroUsd <= 0 || reservationMicroUsd > grant.data.totalBudgetMicroUsd
    || config.provider !== "OpenRouter / Moonshot AI" || config.model !== "moonshotai/kimi-k3.1-pro"
    || config.endpoint !== "https://openrouter.ai/api/v1/chat/completions" || config.routingPolicy.providerOrder[0] !== "moonshotai/mxfp4"
    || qualification.receiptRoute.providerName !== "Moonshot AI" || qualification.receiptRoute.endpointId !== "a3fafaac-f097-4ef1-86b3-842854dad5c6"
    || qualification.receiptRoute.generationModel !== "moonshotai/kimi-k3.1-pro-20261023"
    || qualification.inputMicroUsdPerMillionTokens <= 0 || qualification.outputMicroUsdPerMillionTokens <= 0) return null;
  const authorization = grant.data;
  const secrets = ["apiKey" in config ? config.apiKey : null, env.ARC_DOCUMENT_BRIDGE_SECRET];
  if (secrets.some(secret => typeof secret === "string" && secret.length > 0 && authorization.id.includes(secret))) return null;
  const identity = documentAcceptanceConfigurationDigest(config, qualification).then(digest =>
    digest === authorization.configurationSha256 ? materialSha256(authorization) : null);
  return { authorization, reservationMicroUsd, identity };
}
export async function activeProductionIdentity(release: DocumentProductionRelease, now: () => number) {
  const digest = await release.identity, time = now();
  return time >= Date.parse(release.authorization.approvedAt) && time < Date.parse(release.authorization.expiresAt) ? digest : null;
}
