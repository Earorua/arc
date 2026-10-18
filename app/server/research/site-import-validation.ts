import { z } from "zod";
import { MAX_RESEARCH_PACKAGE_JSON_BYTES, researchPublicFailureCategorySchema, type ResearchQualityReport } from "../../contracts/research";
import { canonicalJson, deterministicId } from "../../lib/planning/fingerprint";
import type { ResearchAiRunRecord } from "../ai/gateway";
import type { BudgetSettlement } from "./budget";
import { bytes, validateCandidate, validatePackage, validateQuality } from "./d1-publication";
import { BRIDGE_AUTH_PROTOCOL } from "./executor/auth";
import { matchBridgeProviderReceipt, type BridgeProviderErrorOutcome, type BridgeProviderReceipt } from "./executor/receipt";
import { parseResearchValidationContext, validateResearchCandidate, type ResearchValidationContext, type ResearchValidationResult } from "./package-validator";
import { candidateFromContent } from "./provider";
import { extractResearchJson } from "./research-content";
import { ResearchRepositoryError } from "./repository";
import { readBoundedResearchJson } from "./source-audit";
import type { SiteExecutionRecord } from "./site-execution-repository";
import type { SiteImportDecision } from "./site-import-repository";

const CANDIDATE_MAX = 1_048_576;
const QUALITY_MAX = 16_384;
const DECISION_MAX = 1_950_000;
const failedFields = z.object({ errorCode: z.string().max(64).regex(/^[a-z]+(?:-[a-z]+)*$/u),
  failureCategory: researchPublicFailureCategorySchema, retryable: z.boolean() }).strict();
const categories: Record<BridgeProviderErrorOutcome["code"], "timeout" | "rate-limited" | "allowance-reached" | "content-rejected" | "invalid-result" | "service-unavailable"> = {
  timeout: "timeout", rate: "rate-limited", balance: "allowance-reached", filtered: "content-rejected",
  "invalid-transport": "invalid-result", "missing-key": "service-unavailable", unavailable: "service-unavailable",
};

export type PreparedSiteImport = Readonly<{ decision: SiteImportDecision; audit: ResearchAiRunRecord; settlement: BudgetSettlement }>;
function unavailable(): never { throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); }

/** Read only the shallow envelope; package depth keeps its original 12-level limit. */
function envelope(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype
    || Object.getOwnPropertySymbols(input).length) return unavailable();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Object.keys(descriptors).length > 5) return unavailable();
  const output: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable || !("value" in descriptor)) return unavailable();
    Object.defineProperty(output, key, { value: descriptor.value, enumerable: true });
  }
  return output;
}
function keys(value: Record<string, unknown>, expected: string[]): void {
  if (Object.keys(value).sort().join("|") !== expected.sort().join("|")) unavailable();
}
function exactContext(pack: ReturnType<typeof validatePackage>, context: ResearchValidationContext): void {
  if (pack.id !== context.packageId || pack.blueprint.version !== context.blueprintVersion
    || pack.registry.version !== context.registryVersion || pack.observedAt !== context.observedAt
    || pack.expiresAt !== context.expiresAt || pack.promptVersion !== context.promptVersion
    || pack.inputSchemaVersion !== context.inputSchemaVersion || pack.outputSchemaVersion !== context.outputSchemaVersion
    || pack.qualityVersion !== context.qualityVersion || pack.modelConfigVersion !== context.modelConfigVersion
    || pack.registry.tracks.some((track) => track.templates.some((template) => template.version !== context.templateVersion))) unavailable();
}

export function parseSiteImportDecision(input: unknown, originalContext: ResearchValidationContext): SiteImportDecision {
  try {
    const context = parseResearchValidationContext(originalContext);
    const value = envelope(input);
    if (value.kind === "ready") {
      keys(value, ["kind", "package", "quality"]);
      const pack = validatePackage(value.package, { kind: "ignore-for-audit" });
      if (bytes(JSON.stringify(pack)) > MAX_RESEARCH_PACKAGE_JSON_BYTES) unavailable();
      exactContext(pack, context);
      const quality = validateQuality(value.quality);
      if (!quality.passed || quality.observedAt !== context.observedAt || bytes(JSON.stringify(quality)) > QUALITY_MAX
        || canonicalJson(quality) !== canonicalJson(pack.qualityReport)) unavailable();
      return { kind: "ready", package: pack, quality };
    }
    if (value.kind === "needs-review") {
      keys(value, ["kind", "quality", "candidate"]);
      const quality = validateQuality(value.quality);
      if (quality.passed || quality.issueCodes.length === 0 || quality.observedAt !== context.observedAt
        || bytes(JSON.stringify(quality)) > QUALITY_MAX) unavailable();
      const candidate = value.candidate === null ? null : validateCandidate(value.candidate);
      if (candidate !== null && bytes(JSON.stringify(candidate)) > CANDIDATE_MAX) unavailable();
      return { kind: "needs-review", quality, candidate };
    }
    if (value.kind === "failed") {
      keys(value, ["kind", "quality", "errorCode", "failureCategory", "retryable"]);
      const fields = failedFields.parse({ errorCode: value.errorCode, failureCategory: value.failureCategory, retryable: value.retryable });
      const quality = value.quality === null ? null : validateQuality(value.quality);
      if (quality !== null && (quality.passed || quality.issueCodes.length === 0 || quality.observedAt !== context.observedAt
        || bytes(JSON.stringify(quality)) > QUALITY_MAX)) unavailable();
      if (fields.errorCode === "invalid-result") {
        if (fields.failureCategory !== "invalid-result" || !fields.retryable || quality === null) unavailable();
      } else if (fields.errorCode === "interrupted") {
        if (fields.failureCategory !== "timeout" || !fields.retryable || quality !== null) unavailable();
      } else if (fields.errorCode === "result-too-large") {
        if (fields.failureCategory !== "invalid-result" || fields.retryable || quality !== null) unavailable();
      } else {
        const category = categories[fields.errorCode as BridgeProviderErrorOutcome["code"]];
        if (!category || fields.failureCategory !== category || quality !== null) unavailable();
      }
      return { kind: "failed", quality, ...fields };
    }
    return unavailable();
  } catch { return unavailable(); }
}

export function serializeSiteImportDecision(input: unknown, context: ResearchValidationContext): string {
  const result = canonicalJson(parseSiteImportDecision(input, context));
  if (bytes(result) > DECISION_MAX) unavailable();
  return result;
}
export async function hashSiteImportDecision(input: unknown, context: ResearchValidationContext): Promise<string> {
  const encoded = new TextEncoder().encode(serializeSiteImportDecision(input, context));
  try {
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", encoded));
    return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
  } catch { return unavailable(); }
}

/** Only prepareSiteImport may derive this input from provider content. */
export function classifySiteValidation(result: ResearchValidationResult, originalContext: ResearchValidationContext): SiteImportDecision {
  const context = parseResearchValidationContext(originalContext);
  if (result.ready) {
    const pack = validatePackage(result.package, { kind: "ignore-for-audit" });
    exactContext(pack, context);
    const quality = validateQuality(result.quality);
    if (!quality.passed || quality.observedAt !== context.observedAt
      || canonicalJson(quality) !== canonicalJson(pack.qualityReport)) unavailable();
    if (bytes(JSON.stringify(pack)) > MAX_RESEARCH_PACKAGE_JSON_BYTES) return parseSiteImportDecision({
      kind: "failed", quality: null, errorCode: "result-too-large", failureCategory: "invalid-result", retryable: false,
    }, context);
    return parseSiteImportDecision({ kind: "ready", package: pack, quality }, context);
  }
  const quality: ResearchQualityReport = validateQuality(result.quality);
  if (quality.passed || quality.issueCodes.length === 0 || quality.observedAt !== context.observedAt) unavailable();
  if (result.sanitizedCandidate === null) return parseSiteImportDecision({ kind: "failed", quality,
    errorCode: "invalid-result", failureCategory: "invalid-result", retryable: true }, context);
  let candidate: ReturnType<typeof validateCandidate>;
  try { candidate = validateCandidate(result.sanitizedCandidate); }
  catch { return parseSiteImportDecision({ kind: "failed", quality,
    errorCode: "invalid-result", failureCategory: "invalid-result", retryable: true }, context); }
  return parseSiteImportDecision({ kind: "needs-review", quality,
    candidate: bytes(JSON.stringify(candidate)) <= CANDIDATE_MAX ? candidate : null }, context);
}

function snapshotExecution(value: SiteExecutionRecord): { execution: SiteExecutionRecord; context: ResearchValidationContext } {
  try {
    const execution = readBoundedResearchJson(value) as SiteExecutionRecord;
    const context = parseResearchValidationContext(execution.validationContext);
    if (execution.admissionState !== "admitted" || execution.closedAt !== null || execution.closeReason !== null
      || execution.beganAt === null || execution.executionExpiresAt === null || !execution.quotaReservationId
      || !execution.budgetReservationId || execution.job.jobId !== execution.jobId
      || execution.job.runId !== execution.runId || execution.job.requestId !== execution.requestId
      || execution.job.createdAt !== execution.createdAt
      || context.packageId !== deterministicId("research-package", [execution.ownerId, execution.runId, execution.requestId])
      || context.observedAt !== new Date(execution.createdAt).toISOString().slice(0, 10)
      || context.expiresAt !== new Date(execution.createdAt + execution.policy.cacheDays * 86_400_000).toISOString().slice(0, 10)
      || !Number.isSafeInteger(execution.version)) unavailable();
    return { execution, context };
  } catch { return unavailable(); }
}
function settlement(receipt: BridgeProviderReceipt): BudgetSettlement {
  if (receipt.outcome.kind === "error" && receipt.outcome.charged === false) return { kind: "not-charged" };
  return receipt.outcome.usage === null ? { kind: "unknown" } : { kind: "actual", actualMicros: receipt.outcome.usage.costMicros };
}

export function prepareSiteImport(input: SiteExecutionRecord, rawReceipt: unknown): PreparedSiteImport {
  const { execution, context } = snapshotExecution(input);
  let receipt: BridgeProviderReceipt;
  try {
    receipt = matchBridgeProviderReceipt(rawReceipt, { protocol: BRIDGE_AUTH_PROTOCOL,
      jobId: execution.jobId, requestHash: execution.requestHash,
      beganAt: execution.beganAt!, executionExpiresAt: execution.executionExpiresAt! });
  } catch { return unavailable(); }
  const outcome = receipt.outcome;
  if (outcome.kind === "error" && outcome.charged === false && outcome.usage !== null
    && outcome.usage.costMicros !== 0) unavailable();
  const decision: SiteImportDecision = outcome.kind === "error"
    ? parseSiteImportDecision({ kind: "failed", quality: null, errorCode: outcome.code,
        failureCategory: categories[outcome.code], retryable: outcome.retryable }, context)
    : classifySiteValidation(validateResearchCandidate(candidateFromContent(extractResearchJson(outcome.content)),
        outcome.annotations, context), context);
  const audit: ResearchAiRunRecord = {
    userId: execution.ownerId,
    requestId: deterministicId("research-attempt", [execution.ownerId, execution.runId, execution.requestId, "role-research"]),
    purpose: "role-research", provider: "openrouter", model: outcome.actualModel,
    promptVersion: context.promptVersion, inputSchemaVersion: context.inputSchemaVersion,
    outputSchemaVersion: context.outputSchemaVersion, latencyMs: receipt.latencyMs,
    status: outcome.kind === "error" ? "failed" : decision.kind === "ready" ? "accepted" : "rejected",
    errorCode: outcome.kind === "error" ? outcome.code : decision.kind === "ready" ? null : "invalid-result",
    usage: outcome.usage, charged: outcome.kind === "response" ? true : outcome.charged,
  };
  return { decision, audit, settlement: settlement(receipt) };
}
