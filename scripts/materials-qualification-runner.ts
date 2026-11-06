import { createHash } from "node:crypto";
import { z } from "zod";
import corpus from "../tests/fixtures/documents/quality-corpus.json";
import { evaluateDocumentQuality, type DocumentQualityReport, type QualityDocument } from "../tests/helpers/document-quality-evaluation";
import { documentAnalysisConfigurationSchema, documentRoutingPolicySchema } from "../app/server/documents/policy";
import { documentCandidatesSchema, documentCandidateReviewPointsSchema, materialDigestSchema, materialIdSchema, materialTimestampSchema, materialVersionSchema } from "../app/contracts/documents";
import { validateDocumentExtraction } from "../app/server/documents/extraction-validator";
import { documentReceiptRouteSchema, type DocumentReceiptAudit } from "../app/server/documents/provider-receipt";
import { HttpDocumentAnalysisProvider, calculateDocumentReservation, documentProviderQualificationSchema, isDocumentProviderQualified, type DocumentFetch } from "../worker/document-executor/provider-http";
import { corpusDigest, qualificationInput, qualificationSegments, QualificationRunError } from "./materials-qualification-inputs";
import { readDiagnosticPilotConfiguration } from "./materials-diagnostic-pilot-policy";

export { QualificationRunError, qualificationSegments };
export { inspectDiagnosticPilotScope, readDiagnosticPilotConfiguration } from "./materials-diagnostic-pilot-policy";
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

/** No defaults, shared Research credentials, or caller output can grant this authorization. */
export function readQualificationConfiguration(env: Readonly<Record<string, string | undefined>>, now: Date) {
  if (env.ARC_DOCUMENT_QUALIFICATION_ENABLED !== "true" || env.ARC_DOCUMENT_PILOT_ENABLED === "true") throw new QualificationRunError("qualification-disabled");
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
  corpusSha256: string; totalBudgetMicroUsd: number;
  startedAt: string; completedAt: string; requestsSent: number; settledMicroUsd: number; heldMicroUsd: number;
  normalPrefillCount: number; edgePassCount: number; stoppedReason: string | null;
  documents: DocumentResult[];
} & ({ maxRequests: 24; passed: boolean } | { maxRequests: 4; purpose: "materials-b2-diagnostic-pilot-v1";
  passed: false; pilotCompleted: boolean; pilotQualityPassed: boolean });

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
  if (!extractionValid) {
    quality.passed = false;
    quality.canPrefill = false;
    quality.diagnostics = null;
    quality.failures = [...new Set([...quality.failures, "production-extraction-invalid"])].sort();
  }
  return quality;
}

type Environment = Readonly<Record<string, string | undefined>>;
type RunDependencies = {
  fetch: DocumentFetch; checkpoint(value: QualificationCheckpoint): Promise<void>;
  mode: QualificationResult["mode"]; now?: () => Date;
};
type ExecutionDependencies = Omit<RunDependencies, "checkpoint"> & { checkpoint?: RunDependencies["checkpoint"] };
export function runDocumentQualification(env: Environment, dependencies: RunDependencies) {
  return runAuthorizedDocuments(env, dependencies, "full");
}
export function runDocumentDiagnosticPilot(env: Environment, dependencies: RunDependencies | { mode: "authorized-live" }) {
  // A caller cannot substitute the live clock, paid transport, or durable journal.
  return runAuthorizedDocuments(env, dependencies.mode === "authorized-live" ? { mode: "authorized-live", fetch: globalThis.fetch } : dependencies, "pilot");
}
function runAuthorizedDocuments(env: Environment, dependencies: RunDependencies, profile: "full"): Promise<Extract<QualificationResult, { maxRequests: 24 }>>;
function runAuthorizedDocuments(env: Environment, dependencies: ExecutionDependencies, profile: "pilot"): Promise<Extract<QualificationResult, { maxRequests: 4 }>>;
async function runAuthorizedDocuments(env: Environment, dependencies: ExecutionDependencies, profile: "full" | "pilot"): Promise<QualificationResult> {
  const clock = dependencies.now ?? (() => new Date());
  let latestTime = -Infinity, clockRegressed = false;
  const now = () => {
    const current = clock(), time = current.getTime();
    if (time < latestTime) clockRegressed = true;
    latestTime = Math.max(latestTime, time);
    return current;
  };
  const settings = profile === "pilot" ? await readDiagnosticPilotConfiguration(env, now(), dependencies.mode)
    : { ...readQualificationConfiguration(env, now()), pilotScope: null, documents: corpus.documents, openLiveJournal: null };
  const { config, authorization, qualification, runId, reservationMicroUsd, pilotScope, documents: selected } = settings;
  const journal = settings.openLiveJournal ? await settings.openLiveJournal() : null;
  const persist = journal?.checkpoint ?? dependencies.checkpoint;
  if (!persist) throw new QualificationRunError("qualification-checkpoint-failed");
  const checkWindow = (observed: Date) => {
    const time = observed.getTime();
    if (clockRegressed || !Number.isFinite(time) || time < Date.parse(authorization.approvedAt)) return "authorization-clock-rollback";
    return time >= Date.parse(authorization.expiresAt) ? "authorization-expired" : null;
  };
  const checkpoint = async (value: Omit<QualificationCheckpoint, "runId" | "timestamp">) => {
    try { await persist({ ...value, runId, timestamp: now().toISOString() }); }
    catch { throw new QualificationRunError("qualification-checkpoint-failed"); }
  };
  const documents: DocumentResult[] = selected.map(document => ({
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
    corpusSha256: corpusDigest, totalBudgetMicroUsd: authorization.totalBudgetMicroUsd,
    startedAt: now().toISOString(), completedAt: "", requestsSent: 0, settledMicroUsd: 0, heldMicroUsd: 0,
    normalPrefillCount: 0, edgePassCount: 0, stoppedReason: null, documents,
    ...(pilotScope ? { maxRequests: pilotScope.maxRequests, purpose: pilotScope.purpose, passed: false, pilotCompleted: false, pilotQualityPassed: false } as const
      : { maxRequests: 24, passed: false } as const),
  };
  await checkpoint({ type: "run-start" });
  const receipts = new Set<string>();
  for (const [index, document] of selected.entries()) {
    const windowFailure = checkWindow(now());
    if (windowFailure) { result.stoppedReason = windowFailure; break; }
    if (result.requestsSent >= authorization.maxRequests) { result.stoppedReason = "request-limit"; break; }
    if (result.settledMicroUsd + result.heldMicroUsd + reservationMicroUsd > authorization.totalBudgetMicroUsd) { result.stoppedReason = "budget-exhausted"; break; }

    const entry = documents[index]!;
    entry.processingStartedAt = now().toISOString();
    const input = qualificationInput(document, config.providerPolicyId);
    await checkpoint({ type: "reservation", documentId: document.id, textVersionId: document.textVersionId,
      state: "reserved", reservedMicroUsd: reservationMicroUsd, processingStartedAt: entry.processingStartedAt });
    entry.reservedMicroUsd = reservationMicroUsd;
    result.heldMicroUsd += reservationMicroUsd;

    let admissionReason: string | null = null;
    let generationReads = 0, claimedGenerationUrl: string | null = null;
    const provider = new HttpDocumentAnalysisProvider(config, { qualification, now, fetch: async (url, init) => {
      if (init?.method !== "POST") {
        if (pilotScope) {
          if (init?.method !== "GET" || entry.sentAt === null || String(url) !== claimedGenerationUrl || init.body != null || init.redirect !== "manual"
            || generationReads >= pilotScope.maxGetsPerDocument) throw new Error("pilot-generation-scope-mismatch");
          generationReads++;
        }
        return dependencies.fetch(url, init);
      }
      if (pilotScope && entry.sentAt !== null) throw new Error("pilot-document-already-sent");
      if (pilotScope && (String(url) !== config.endpoint || init.redirect !== "manual" || typeof init.body !== "string"
        || createHash("sha256").update(init.body, "utf8").digest("hex") !== pilotScope.documents[index]!.bodySha256)) {
        admissionReason = "pilot-body-scope-mismatch";
        throw new Error("qualification-before-send");
      }
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
    const outcome = await provider.analyze(input, new AbortController().signal, undefined, async (receiptId, observed) => {
      if (receipts.has(receiptId)) return false;
      receipts.add(receiptId);
      await checkpoint({ type: "receipt", documentId: document.id, textVersionId: document.textVersionId,
        state: "reserved", reservedMicroUsd: reservationMicroUsd, receiptId, ...observed });
      if (pilotScope) {
        const url = new URL(config.endpoint);
        url.pathname = url.pathname.replace(/\/chat\/completions$/u, "/generation");
        url.searchParams.set("id", receiptId);
        claimedGenerationUrl = url.href;
      }
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
        entry.quality = scoreCandidate(document, input.segments, outcome.candidate);
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
  let status: string;
  if (result.maxRequests === 4) {
    result.pilotCompleted = result.stoppedReason === null && result.heldMicroUsd === 0 && result.requestsSent === 4 && receipts.size === 4
      && documents.every(document => document.accounting === "settled" && document.audit?.status === "verified" && document.quality !== null);
    result.pilotQualityPassed = result.pilotCompleted && documents.every(document => document.status === "passed");
    status = result.stoppedReason ?? (result.pilotCompleted ? "pilot-completed" : "pilot-incomplete");
  } else {
    result.passed = result.stoppedReason === null && documents.every(document => document.status === "passed")
      && result.normalPrefillCount === 18 && result.edgePassCount === 6;
    status = result.passed ? "passed" : result.stoppedReason ?? "quality-threshold-failed";
  }
  result.completedAt = now().toISOString();
  await checkpoint({ type: "run-end", status });
  journal?.finish(result);
  return result;
}
