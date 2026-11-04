import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import corpus from "../tests/fixtures/documents/quality-corpus.json";
import { evaluateDocumentQuality, type DocumentQualityReport, type QualityDocument } from "../tests/helpers/document-quality-evaluation";
import { documentAnalysisConfigurationSchema, documentRoutingPolicySchema } from "../app/server/documents/policy";
import { documentCandidatesSchema, documentCandidateReviewPointsSchema, materialDigestSchema, materialIdSchema, materialTimestampSchema, materialVersionSchema } from "../app/contracts/documents";
import { validateDocumentExtraction } from "../app/server/documents/extraction-validator";
import { documentReceiptRouteSchema, type DocumentReceiptAudit } from "../app/server/documents/provider-receipt";
import { HttpDocumentAnalysisProvider, calculateDocumentReservation, documentProviderQualificationSchema, isDocumentProviderQualified, type DocumentFetch } from "../worker/document-executor/provider-http";

const corpusDigest = createHash("sha256").update(readFileSync(new URL("../tests/fixtures/documents/quality-corpus.json", import.meta.url))).digest("hex");
const amountSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const safeUrl = z.string().url().max(2048).refine(value => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
});
const authorizationSchema = z.object({
  id: materialIdSchema, runId: materialIdSchema, endpoint: safeUrl,
  model: z.string().min(1).max(200), provider: z.string().min(1).max(100),
  providerPolicyId: materialIdSchema, priceVersion: materialVersionSchema,
  routingPolicy: documentRoutingPolicySchema, receiptRoute: documentReceiptRouteSchema,
  inputMicroUsdPerMillionTokens: amountSchema, outputMicroUsdPerMillionTokens: amountSchema,
  maxRequests: z.literal(24), totalBudgetMicroUsd: amountSchema.refine(value => value > 0),
  corpusSha256: materialDigestSchema, privacyEvidence: safeUrl, pricingEvidence: safeUrl,
  approvedAt: materialTimestampSchema, expiresAt: materialTimestampSchema,
}).strict();
const settingsSchema = z.object({
  runId: materialIdSchema, config: z.record(z.string(), z.unknown()),
  qualification: documentProviderQualificationSchema, authorization: authorizationSchema,
}).strict();

export class QualificationRunError extends Error {
  constructor(readonly code: "qualification-disabled" | "qualification-settings-invalid" | "qualification-authorization-mismatch" | "qualification-checkpoint-failed") {
    super(code); this.name = "QualificationRunError";
  }
}

/** No defaults, shared Research credentials, or caller output can grant this authorization. */
export function readQualificationConfiguration(env: Readonly<Record<string, string | undefined>>, now: Date) {
  if (env.ARC_DOCUMENT_QUALIFICATION_ENABLED !== "true") throw new QualificationRunError("qualification-disabled");
  let settings: z.infer<typeof settingsSchema>;
  let config: z.infer<typeof documentAnalysisConfigurationSchema>;
  try {
    const serialized = env.ARC_DOCUMENT_QUALIFICATION_SETTINGS;
    if (!serialized || serialized.length > 32_768 || !env.ARC_DOCUMENT_PROVIDER_API_KEY) throw new Error();
    settings = settingsSchema.parse(JSON.parse(serialized));
    // A secret is accepted only from this dedicated environment key, never from a report/settings file.
    if (Object.hasOwn(settings.config, "apiKey")) throw new Error();
    config = documentAnalysisConfigurationSchema.parse({ ...settings.config, apiKey: env.ARC_DOCUMENT_PROVIDER_API_KEY });
    if (JSON.stringify(settings).includes(JSON.stringify(config.apiKey).slice(1, -1))) throw new Error();
    safeUrl.parse(config.endpoint);
  } catch { throw new QualificationRunError("qualification-settings-invalid"); }
  const { authorization, qualification } = settings;
  const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
  if (!isDocumentProviderQualified(config, qualification)
    || authorization.runId !== settings.runId || authorization.endpoint !== config.endpoint
    || authorization.model !== config.model || authorization.provider !== config.provider
    || authorization.providerPolicyId !== config.providerPolicyId || authorization.priceVersion !== config.priceVersion
    || !equal(authorization.routingPolicy, config.routingPolicy)
    || !equal(authorization.receiptRoute, qualification.receiptRoute)
    || authorization.inputMicroUsdPerMillionTokens !== qualification.inputMicroUsdPerMillionTokens
    || authorization.outputMicroUsdPerMillionTokens !== qualification.outputMicroUsdPerMillionTokens
    || authorization.corpusSha256 !== corpusDigest || corpus.documents.length !== authorization.maxRequests
    || !Number.isFinite(now.getTime()) || Date.parse(authorization.approvedAt) > now.getTime() || Date.parse(authorization.expiresAt) <= now.getTime()
    || authorization.totalBudgetMicroUsd > config.userDailyMicroUsd
    || authorization.totalBudgetMicroUsd > config.globalDailyMicroUsd) {
    throw new QualificationRunError("qualification-authorization-mismatch");
  }
  return { ...settings, config, reservationMicroUsd: calculateDocumentReservation(config, qualification) };
}

/** Preserve every frozen source ID/offset; gap segments cover only the prefix and separators. */
export function qualificationSegments(document: QualityDocument) {
  const segments: { id: string; start: number; end: number }[] = [];
  let offset = 0, gap = 0;
  for (const segment of document.segments) {
    if (segment.start < offset || segment.end <= segment.start || document.text.slice(segment.start, segment.end) !== segment.text) throw new QualificationRunError("qualification-settings-invalid");
    if (segment.start > offset) segments.push({ id: `qualification-gap-${++gap}`, start: offset, end: segment.start });
    segments.push({ id: segment.id, start: segment.start, end: segment.end });
    offset = segment.end;
  }
  if (offset < document.text.length) segments.push({ id: `qualification-gap-${++gap}`, start: offset, end: document.text.length });
  return segments;
}

export type QualificationCheckpoint = Readonly<{
  type: "run-start" | "reservation" | "receipt" | "settlement" | "run-end";
  runId: string; documentId?: string; textVersionId?: string;
  state?: "reserved" | "settled" | "released" | "held-unknown";
  reservedMicroUsd?: number; actualMicroUsd?: number | null; receiptId?: string | null;
  inputTokens?: number | null; outputTokens?: number | null;
  processingStartedAt?: string | null; processingEndedAt?: string | null; sentAt?: string | null;
  returnedAt?: string | null; queueDurationMs?: null; audit?: DocumentReceiptAudit | null;
  status?: string; timestamp: string;
}>;
type DocumentResult = {
  documentId: string; category: "normal" | "edge"; status: "not-run" | "passed" | "failed" | "cost-unknown";
  accounting: "not-reserved" | "settled" | "released" | "held-unknown";
  reservedMicroUsd: number; actualMicroUsd: number | null; receiptId: string | null;
  inputTokens: number | null; outputTokens: number | null;
  processingStartedAt: string | null; processingEndedAt: string | null; sentAt: string | null;
  returnedAt: string | null; queueDurationMs: null; audit: DocumentReceiptAudit | null;
  quality: DocumentQualityReport | null; reason: string | null;
};
export type QualificationResult = {
  runId: string; mode: "offline-test" | "authorized-live"; authorizationId: string;
  endpoint: string; provider: string; model: string; providerPolicyId: string; priceVersion: string;
  routingPolicyVersion: string; routingPolicy: z.infer<typeof documentRoutingPolicySchema>; receiptRoute: z.infer<typeof documentReceiptRouteSchema>;
  inputMicroUsdPerMillionTokens: number; outputMicroUsdPerMillionTokens: number;
  privacyEvidence: string; pricingEvidence: string; authorizationExpiresAt: string;
  corpusSha256: string; maxRequests: 24; totalBudgetMicroUsd: number;
  startedAt: string; completedAt: string; requestsSent: number; settledMicroUsd: number; heldMicroUsd: number;
  normalPrefillCount: number; edgePassCount: number; passed: boolean; stoppedReason: string | null;
  documents: DocumentResult[];
};

function scoreCandidate(document: QualityDocument, segments: ReturnType<typeof qualificationSegments>, candidate: unknown) {
  let candidates: unknown[] = [];
  let reviewPoints: z.infer<typeof documentCandidateReviewPointsSchema> = [];
  let extractionValid = true;
  try {
    validateDocumentExtraction(candidate, "quality-fixture-owner", {
      ownerId: "quality-fixture-owner", documentId: document.id, documentVersionId: document.documentVersionId,
      textVersionId: document.textVersionId, lifecycle: "active", text: document.text, segments,
    });
    candidates = documentCandidatesSchema.parse((candidate as { items: unknown }).items);
    reviewPoints = documentCandidateReviewPointsSchema.parse((candidate as { reviewPoints?: unknown }).reviewPoints ?? []);
  } catch { extractionValid = false; }
  // Only observations returned by the provider and validated by the production boundary are scored.
  const quality = evaluateDocumentQuality(document, { documentId: document.id, documentVersionId: document.documentVersionId,
    textVersionId: document.textVersionId, candidates, reviewPoints });
  if (!extractionValid) { quality.passed = false; quality.canPrefill = false; quality.failures = [...new Set([...quality.failures, "production-extraction-invalid"])].sort(); }
  return quality;
}

export async function runDocumentQualification(env: Readonly<Record<string, string | undefined>>, dependencies: {
  fetch: DocumentFetch; checkpoint(value: QualificationCheckpoint): Promise<void>;
  mode: QualificationResult["mode"]; now?: () => Date;
}): Promise<QualificationResult> {
  const clock = dependencies.now ?? (() => new Date());
  let latestTime = -Infinity, clockRegressed = false;
  const now = () => {
    const current = clock(), time = current.getTime();
    if (time < latestTime) clockRegressed = true;
    latestTime = Math.max(latestTime, time);
    return current;
  };
  const settings = readQualificationConfiguration(env, now());
  const { config, authorization, qualification, runId, reservationMicroUsd } = settings;
  const checkWindow = (observed: Date) => {
    const time = observed.getTime();
    if (clockRegressed || !Number.isFinite(time) || time < Date.parse(authorization.approvedAt)) return "authorization-clock-rollback";
    return time >= Date.parse(authorization.expiresAt) ? "authorization-expired" : null;
  };
  const checkpoint = async (value: Omit<QualificationCheckpoint, "runId" | "timestamp">) => {
    try { await dependencies.checkpoint({ ...value, runId, timestamp: now().toISOString() }); }
    catch { throw new QualificationRunError("qualification-checkpoint-failed"); }
  };
  const documents: DocumentResult[] = corpus.documents.map(document => ({
    documentId: document.id, category: document.category as "normal" | "edge", status: "not-run", accounting: "not-reserved",
    reservedMicroUsd: 0, actualMicroUsd: null, receiptId: null, inputTokens: null, outputTokens: null,
    processingStartedAt: null, processingEndedAt: null, sentAt: null, returnedAt: null, queueDurationMs: null, audit: null,
    quality: null, reason: "not-run",
  }));
  const result: QualificationResult = {
    runId, mode: dependencies.mode, authorizationId: authorization.id, endpoint: config.endpoint,
    provider: config.provider, model: config.model, providerPolicyId: config.providerPolicyId,
    priceVersion: config.priceVersion, routingPolicyVersion: config.routingPolicy.policyVersion,
    routingPolicy: config.routingPolicy, receiptRoute: qualification.receiptRoute, inputMicroUsdPerMillionTokens: qualification.inputMicroUsdPerMillionTokens,
    outputMicroUsdPerMillionTokens: qualification.outputMicroUsdPerMillionTokens,
    privacyEvidence: authorization.privacyEvidence, pricingEvidence: authorization.pricingEvidence,
    authorizationExpiresAt: authorization.expiresAt,
    corpusSha256: corpusDigest, maxRequests: 24, totalBudgetMicroUsd: authorization.totalBudgetMicroUsd,
    startedAt: now().toISOString(), completedAt: "", requestsSent: 0, settledMicroUsd: 0, heldMicroUsd: 0,
    normalPrefillCount: 0, edgePassCount: 0, passed: false, stoppedReason: null, documents,
  };
  await checkpoint({ type: "run-start" });
  const receipts = new Set<string>();
  for (const [index, document] of corpus.documents.entries()) {
    const windowFailure = checkWindow(now());
    if (windowFailure) { result.stoppedReason = windowFailure; break; }
    if (result.requestsSent >= authorization.maxRequests) { result.stoppedReason = "request-limit"; break; }
    if (result.settledMicroUsd + result.heldMicroUsd + reservationMicroUsd > authorization.totalBudgetMicroUsd) { result.stoppedReason = "budget-exhausted"; break; }

    const entry = documents[index]!;
    entry.processingStartedAt = now().toISOString();
    const segments = qualificationSegments(document);
    await checkpoint({ type: "reservation", documentId: document.id, textVersionId: document.textVersionId,
      state: "reserved", reservedMicroUsd: reservationMicroUsd, processingStartedAt: entry.processingStartedAt });
    entry.reservedMicroUsd = reservationMicroUsd;
    result.heldMicroUsd += reservationMicroUsd;

    let admissionReason: string | null = null;
    const provider = new HttpDocumentAnalysisProvider(config, { qualification, now, fetch: async (url, init) => {
      if (init?.method !== "POST") return dependencies.fetch(url, init);
      const handoff = now();
      admissionReason = checkWindow(handoff);
      if (result.requestsSent >= authorization.maxRequests) admissionReason = "request-limit";
      if (admissionReason) throw new Error("qualification-before-send");
      result.requestsSent++;
      entry.sentAt = handoff.toISOString();
      const response = await dependencies.fetch(url, init);
      entry.returnedAt = now().toISOString();
      return response;
    } });
    const outcome = await provider.analyze({ textVersionId: document.textVersionId, text: document.text,
      segments, kind: document.kind as "resume" | "jd", providerPolicyId: config.providerPolicyId, outputSchemaVersion: "2026.11.1" },
    new AbortController().signal, undefined, async (receiptId, observed) => {
      if (receipts.has(receiptId)) return false;
      receipts.add(receiptId);
      await checkpoint({ type: "receipt", documentId: document.id, textVersionId: document.textVersionId,
        state: "reserved", reservedMicroUsd: reservationMicroUsd, receiptId, ...observed });
      return true;
    });
    let stop: string | null = null;
    if (outcome.kind === "received") {
      entry.audit = outcome.audit ?? null;
      entry.receiptId = outcome.receiptId;
      entry.inputTokens = outcome.inputTokens;
      entry.outputTokens = outcome.outputTokens;
      entry.actualMicroUsd = outcome.actualMicroUsd;
      if (entry.audit) { entry.sentAt = entry.audit.sentAt; entry.returnedAt = entry.audit.returnedAt; }
      if (entry.audit?.status === "receipt-claim-failed") throw new QualificationRunError("qualification-checkpoint-failed");
    }

    if (admissionReason || outcome.kind === "not-sent") {
      entry.accounting = "released";
      entry.status = "failed";
      result.heldMicroUsd -= reservationMicroUsd;
      stop = admissionReason ?? "provider-not-sent";
    } else if (outcome.kind === "unknown" || outcome.actualMicroUsd === null || outcome.receiptId === null) {
      entry.accounting = "held-unknown";
      entry.status = "cost-unknown";
      stop = entry.audit?.status ?? "unknown-cost-or-receipt";
    } else {
      entry.accounting = "settled";
      result.heldMicroUsd -= reservationMicroUsd;
      result.settledMicroUsd += outcome.actualMicroUsd;
      if (outcome.actualMicroUsd > reservationMicroUsd || result.settledMicroUsd > authorization.totalBudgetMicroUsd) stop = "price-bound-exceeded";
      else if (entry.audit?.status !== "verified") stop = entry.audit?.status ?? "metadata-unavailable";
      if (stop) entry.status = "failed";
      else {
        entry.quality = scoreCandidate(document, segments, outcome.candidate);
        entry.status = entry.quality.passed ? "passed" : "failed";
      }
    }
    entry.reason = stop ?? (entry.status === "passed" ? null : "quality-threshold-failed");
    entry.processingEndedAt = now().toISOString();
    // The next inference is unreachable until this document's final evidence is durably acknowledged.
    await checkpoint({ type: "settlement", documentId: document.id, textVersionId: document.textVersionId,
      state: entry.accounting, reservedMicroUsd: reservationMicroUsd, actualMicroUsd: entry.actualMicroUsd,
      receiptId: entry.receiptId, inputTokens: entry.inputTokens, outputTokens: entry.outputTokens, audit: entry.audit,
      processingStartedAt: entry.processingStartedAt, processingEndedAt: entry.processingEndedAt,
      sentAt: entry.sentAt, returnedAt: entry.returnedAt, queueDurationMs: null, status: entry.reason ?? "passed" });
    if (stop) { result.stoppedReason = stop; break; }
  }
  result.normalPrefillCount = documents.filter(document => document.category === "normal" && document.quality?.canPrefill).length;
  result.edgePassCount = documents.filter(document => document.category === "edge" && document.status === "passed").length;
  result.passed = result.stoppedReason === null && documents.every(document => document.status === "passed")
    && result.normalPrefillCount === 18 && result.edgePassCount === 6;
  result.completedAt = now().toISOString();
  await checkpoint({ type: "run-end", status: result.passed ? "passed" : result.stoppedReason ?? "quality-threshold-failed" });
  return result;
}
