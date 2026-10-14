import { z } from "zod";
import { providerUsageSchema, researchPackageSchema } from "../../contracts/research";
import { canonicalJson, deterministicId } from "../../lib/planning/fingerprint";
import type { ResearchAiRunRecord } from "../ai/gateway";
import { D1AiRunSink } from "../ai/d1-run-recorder";
import { D1EntitlementRepository } from "../entitlements/d1-entitlement-repository";
import { researchQuotaInvalidRowsSql, researchQuotaLedgerCte } from "../entitlements/d1-research-quota-sql";
import { D1ResearchBudgetRepository } from "./d1-budget-repository";
import type { BudgetBucket, BudgetReservation } from "./budget";
import type { BudgetSettlement } from "./budget";
import { parseJson } from "./d1-publication";
import { BRIDGE_AUTH_PROTOCOL } from "./executor/auth";
import { matchBridgeProviderReceipt, parseBridgeProviderReceipt, parseBridgeReceiptMetadata,
  summarizeBridgeProviderReceipt, type BridgeProviderReceipt, type BridgeReceiptMetadata } from "./executor/receipt";
import { parseResearchValidationContext } from "./package-validator";
import type { ResearchRepository, ResearchRunRecord } from "./repository";
import { ResearchRepositoryError } from "./repository";
import { readBoundedResearchJson } from "./source-audit";
import type { SiteExecutionIdentity, SiteExecutionRepository } from "./site-execution-repository";
import type { SiteExecutionRecord } from "./site-execution-repository";
import { siteSqlNow } from "./site-execution-sql";
import type { SiteImportDecision, SiteImportRecord, SiteImportRepository } from "./site-import-repository";
import { hashSiteImportDecision, parseSiteImportDecision, prepareSiteImport, serializeSiteImportDecision } from "./site-import-validation";

const safe = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const identityText = z.string().min(1).max(160).refine((value) => value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value));
const hash = z.string().length(64).regex(/^[0-9a-f]{64}$/u);
const identitySchema = z.object({ ownerId: identityText, runId: researchPackageSchema.shape.id,
  requestId: identityText, jobId: z.uuid(), requestHash: hash }).strict();
const auditSchema = z.object({ userId: identityText, requestId: identityText,
  purpose: z.literal("role-research"), provider: z.literal("openrouter"),
  model: z.string().min(1).max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/u).nullable(),
  promptVersion: identityText.max(64), inputSchemaVersion: identityText.max(64), outputSchemaVersion: identityText.max(64),
  status: z.enum(["accepted", "rejected", "failed"]), latencyMs: safe,
  errorCode: z.enum(["invalid-result", "missing-key", "timeout", "rate", "balance", "unavailable", "filtered", "invalid-transport"]).nullable(),
  usage: providerUsageSchema.nullable(), charged: z.union([z.boolean(), z.literal("unknown")]),
}).strict();
const settlementSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("actual"), actualMicros: safe }).strict(),
  z.object({ kind: z.literal("not-charged") }).strict(),
  z.object({ kind: z.literal("unknown") }).strict(),
]);
const resolutionSchema = z.object({ state: z.enum(["ready", "needs-review", "failed"]),
  runVersion: safe, packageId: researchPackageSchema.shape.id.nullable(), terminalHash: hash,
  quotaStatus: z.enum(["accepted", "rejected", "failed"]), resolvedAt: safe }).strict();
type Row = Record<string, unknown>;
type Context = Readonly<{ run: ResearchRunRecord; execution: SiteExecutionRecord;
  grant: BridgeProviderReceipt["grant"]; journal: SiteImportRecord | null;
  runQualityJson: string | null; runCandidateJson: string | null }>;

function unavailable(): ResearchRepositoryError { return new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); }
function conflict(): ResearchRepositoryError { return new ResearchRepositoryError("CONFLICT"); }
function exactIdentity(a: SiteExecutionIdentity, b: SiteExecutionIdentity): boolean {
  return a.ownerId === b.ownerId && a.runId === b.runId && a.requestId === b.requestId
    && a.jobId === b.jobId && a.requestHash === b.requestHash;
}
function parseSmall<T>(value: unknown, schema: z.ZodType<T>): T {
  try { return schema.parse(readBoundedResearchJson(value)); } catch { throw unavailable(); }
}
function json(value: unknown, limit: number): unknown {
  if (typeof value !== "string") throw unavailable();
  return parseJson(value, limit);
}
function decisionJson(value: unknown): unknown {
  if (typeof value !== "string" || new TextEncoder().encode(value).byteLength > 1_950_000) throw unavailable();
  try { return JSON.parse(value) as unknown; } catch { throw unavailable(); }
}
async function sha256(value: string): Promise<string> {
  try {
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
    return Array.from(digest, (part) => part.toString(16).padStart(2, "0")).join("");
  } catch { throw unavailable(); }
}
function expectedSettlement(metadata: BridgeReceiptMetadata, mode: "body" | "metadata-only"): BudgetSettlement {
  if (mode === "body" && metadata.outcome.kind === "error" && metadata.outcome.charged === false) return { kind: "not-charged" };
  return metadata.outcome.usage === null ? { kind: "unknown" } : { kind: "actual", actualMicros: metadata.outcome.usage.costMicros };
}
export function parseSiteImportIdentity(input: unknown): SiteExecutionIdentity {
  return Object.freeze(parseSmall(input, identitySchema));
}

export class D1SiteImportRepository implements SiteImportRepository {
  constructor(
    private readonly db: D1Database,
    private readonly runs: Pick<ResearchRepository, "getRun">,
    private readonly executions: Pick<SiteExecutionRepository, "read">,
  ) {}

  async read(input: SiteExecutionIdentity): Promise<SiteImportRecord | null> {
    return (await this.readImportContext(parseSiteImportIdentity(input))).journal;
  }
  /** One strict, owned, read-only observation for the publication transaction. */
  async readStrictImportContext(input: SiteExecutionIdentity): Promise<Readonly<{
    run: ResearchRunRecord; execution: SiteExecutionRecord; journal: SiteImportRecord | null;
    runQualityJson: string | null; runCandidateJson: string | null;
  }>> {
    const identity = parseSiteImportIdentity(input);
    const context = await this.readStrictContext(identity);
    return { run: context.run, execution: context.execution, journal: context.journal,
      runQualityJson: context.runQualityJson, runCandidateJson: context.runCandidateJson };
  }
  async captureBody(input: SiteExecutionIdentity, rawReceipt: unknown): Promise<SiteImportRecord> {
    const identity = parseSiteImportIdentity(input);
    let receipt: BridgeProviderReceipt;
    try { receipt = parseBridgeProviderReceipt(rawReceipt); } catch { throw unavailable(); }
    const context = await this.readImportContext(identity);
    let matched: BridgeProviderReceipt;
    try { matched = matchBridgeProviderReceipt(receipt, context.grant); } catch { throw conflict(); }
    const metadata = await summarizeBridgeProviderReceipt(matched);
    if (context.journal) return this.replay(context.journal, metadata);
    const prepared = prepareSiteImport(context.execution, matched);
    return this.insert(context, metadata, "body", prepared.decision, prepared.audit, prepared.settlement);
  }
  async captureMetadata(input: SiteExecutionIdentity, rawMetadata: unknown): Promise<SiteImportRecord> {
    const identity = parseSiteImportIdentity(input);
    let metadata: BridgeReceiptMetadata;
    try { metadata = parseBridgeReceiptMetadata(rawMetadata); } catch { throw unavailable(); }
    const context = await this.readImportContext(identity);
    if (canonicalJson(metadata.grant) !== canonicalJson(context.grant)) throw conflict();
    if (metadata.outcome.kind === "error") {
      const receipt = parseBridgeProviderReceipt({ grant: metadata.grant, producedAt: metadata.producedAt,
        latencyMs: metadata.latencyMs, outcome: metadata.outcome });
      const summary = await summarizeBridgeProviderReceipt(receipt);
      if (summary.receiptHash !== metadata.receiptHash) throw conflict();
      if (context.journal) return this.replay(context.journal, metadata);
      const prepared = prepareSiteImport(context.execution, receipt);
      return this.insert(context, metadata, "body", prepared.decision, prepared.audit, prepared.settlement);
    }
    if (context.journal) return this.replay(context.journal, metadata);
    const decision = parseSiteImportDecision({ kind: "failed", quality: null, errorCode: "interrupted",
      failureCategory: "timeout", retryable: true }, context.execution.validationContext);
    const audit: ResearchAiRunRecord = { userId: identity.ownerId,
      requestId: deterministicId("research-attempt", [identity.ownerId, identity.runId, identity.requestId, "role-research"]),
      purpose: "role-research", provider: "openrouter", model: metadata.outcome.actualModel,
      promptVersion: context.execution.validationContext.promptVersion,
      inputSchemaVersion: context.execution.validationContext.inputSchemaVersion,
      outputSchemaVersion: context.execution.validationContext.outputSchemaVersion,
      latencyMs: metadata.latencyMs, status: "failed", errorCode: "unavailable", usage: metadata.outcome.usage, charged: true };
    return this.insert(context, metadata, "metadata-only", decision, audit, expectedSettlement(metadata, "metadata-only"));
  }
  async markAudit(input: SiteExecutionIdentity, rawHash: string): Promise<SiteImportRecord> {
    const identity = parseSiteImportIdentity(input);
    const receiptHash = parseSmall(rawHash, hash);
    const context = await this.readProvenContext(identity, receiptHash, "audit");
    const record = this.requireJournal(context, receiptHash);
    if (record.phase >= 1) return record;
    const usage = canonicalJson({ usage: record.audit.usage, charged: record.audit.charged,
      modelKnown: record.audit.model !== null });
    const effect = `EXISTS(SELECT 1 FROM ai_runs a WHERE a.user_id=j.user_id AND a.request_id=?13
      AND a.purpose='role-research' AND a.provider=?14 AND a.model=?15
      AND a.prompt_version=?16 AND a.input_schema_version=?17 AND a.output_schema_version=?18
      AND a.status=?19 AND a.usage_json=?20 AND a.latency_ms=?21 AND a.error_code IS ?22)`;
    return this.mutateMarker(identity, context, 0, 1, effect, [record.audit.requestId,
      record.audit.provider, record.audit.model ?? "unknown", record.audit.promptVersion,
      record.audit.inputSchemaVersion, record.audit.outputSchemaVersion, record.audit.status,
      usage, record.audit.latencyMs, record.audit.errorCode], "audit");
  }
  async markQuota(input: SiteExecutionIdentity, rawHash: string): Promise<SiteImportRecord> {
    const identity = parseSiteImportIdentity(input);
    const receiptHash = parseSmall(rawHash, hash);
    const context = await this.readProvenContext(identity, receiptHash, "quota");
    const record = this.requireJournal(context, receiptHash);
    if (record.phase >= 3) return record;
    if (record.phase !== 2) throw unavailable();
    const status = record.resolution!.quotaStatus;
    const units = status === "accepted" ? 1 : 0;
    const effect = `EXISTS(SELECT 1 FROM research_site_executions e WHERE e.run_id=j.run_id
      AND e.user_id=j.user_id AND e.request_id=j.request_id AND e.job_id=j.job_id
      AND e.request_hash=j.request_hash AND e.quota_reservation_id=?13 AND e.quota_key=?14)
      AND NOT ${researchQuotaInvalidRowsSql("j.user_id", "?14")}
      AND EXISTS(SELECT 1 FROM quota_ledger p JOIN quota_ledger t
        ON t.reservation_id=p.reservation_id AND t.user_id=p.user_id
          AND t.idempotency_key=p.idempotency_key AND t.purpose=p.purpose
        WHERE p.user_id=j.user_id AND p.idempotency_key=?14 AND p.reservation_id=?13
          AND p.purpose='role-research' AND p.entry_kind='reserved' AND p.units=1
          AND t.entry_kind=?15 AND t.units=?16
          AND (SELECT count(*) FROM quota_ledger q WHERE q.reservation_id=p.reservation_id)=2)`;
    return this.mutateMarker(identity, context, 2, 3, effect,
      [context.execution.quotaReservationId, context.execution.quotaKey, status, units],
      "quota", researchQuotaLedgerCte);
  }
  async markBudget(input: SiteExecutionIdentity, rawHash: string): Promise<SiteImportRecord> {
    const identity = parseSiteImportIdentity(input);
    const receiptHash = parseSmall(rawHash, hash);
    const context = await this.readProvenContext(identity, receiptHash, "budget");
    const record = this.requireJournal(context, receiptHash);
    const proof = context.budgetProof!;
    if (record.phase >= 4) return record;
    if (record.phase !== 3) throw unavailable();
    const effect = `EXISTS(SELECT 1 FROM ai_budget_reservations b
      JOIN ai_budget_buckets d ON d.id=b.day_bucket_id
      JOIN ai_budget_buckets m ON m.id=b.month_bucket_id
      WHERE (b.id=?13 AND b.run_id=j.run_id AND b.request_id=j.request_id
        AND b.day_bucket_id=?14 AND b.month_bucket_id=?15
        AND b.maximum_reserved_micros=?16 AND b.expires_at=?17
        AND b.status=?18 AND b.settled_micros=?19)
        AND (d.scope='site' AND d.period_kind='day' AND d.period_start=?20
        AND m.scope='site' AND m.period_kind='month' AND m.period_start=?21
        AND d.id<>m.id)
        AND (typeof(b.maximum_reserved_micros)='integer' AND typeof(b.settled_micros)='integer'
        AND typeof(b.expires_at)='integer' AND typeof(b.created_at)='integer'
        AND typeof(b.updated_at)='integer' AND b.created_at<=b.updated_at
        AND b.expires_at BETWEEN 0 AND 8640000000000000
        AND b.created_at BETWEEN 0 AND 8640000000000000
        AND b.updated_at BETWEEN 0 AND 8640000000000000)
        AND (b.created_at>=?20 AND b.created_at<?20+86400000
        AND b.created_at>=?21
        AND strftime('%Y-%m',b.created_at/1000,'unixepoch')=strftime('%Y-%m',?21/1000,'unixepoch')
        AND b.maximum_reserved_micros BETWEEN 0 AND 9007199254740991
        AND b.settled_micros BETWEEN 0 AND 9007199254740991)
        AND (typeof(d.version)='integer' AND d.version BETWEEN 0 AND 9007199254740991
        AND typeof(m.version)='integer' AND m.version BETWEEN 0 AND 9007199254740991
        AND typeof(d.created_at)='integer' AND typeof(d.updated_at)='integer'
        AND typeof(m.created_at)='integer' AND typeof(m.updated_at)='integer')
        AND (d.created_at BETWEEN 0 AND 9007199254740991 AND d.updated_at>=d.created_at
        AND m.created_at BETWEEN 0 AND 9007199254740991 AND m.updated_at>=m.created_at
        AND d.created_at<=8640000000000000 AND d.updated_at<=8640000000000000
        AND m.created_at<=8640000000000000 AND m.updated_at<=8640000000000000)
        AND (typeof(d.reserved_micros)='integer' AND typeof(d.settled_micros)='integer'
        AND typeof(m.reserved_micros)='integer' AND typeof(m.settled_micros)='integer'
        AND d.reserved_micros BETWEEN 0 AND 9007199254740991
        AND d.settled_micros BETWEEN 0 AND 9007199254740991
        AND m.reserved_micros BETWEEN 0 AND 9007199254740991
        AND m.settled_micros BETWEEN 0 AND 9007199254740991)
        AND (d.reserved_micros<=9007199254740991-d.settled_micros
        AND m.reserved_micros<=9007199254740991-m.settled_micros
        AND (?18<>'conservative-hold' OR
          (d.reserved_micros>=b.maximum_reserved_micros AND m.reserved_micros>=b.maximum_reserved_micros))))`;
    return this.mutateMarker(identity, context, 3, 4, effect,
      [proof.reservation.id, proof.day.id, proof.month.id, proof.reservation.maximumMicros,
        proof.reservation.expiresAt, proof.reservation.status, proof.reservation.settledMicros,
        proof.day.periodStart, proof.month.periodStart], "budget");
  }
  async finish(input: SiteExecutionIdentity, rawHash: string): Promise<SiteImportRecord> {
    const identity = parseSiteImportIdentity(input);
    const receiptHash = parseSmall(rawHash, hash);
    const context = await this.readProvenContext(identity, receiptHash, "all");
    const record = this.requireJournal(context, receiptHash);
    if (record.phase < 4) throw unavailable();
    if (record.phase === 5) return record;
    const budget = context.budgetProof!;
    const run = context.run;
    const runValues = [run.mutationId, run.rawRole, run.normalizedRoleKey, run.locale,
      run.inputFingerprint, run.configFingerprint, run.executionMode, run.remoteQuotaKey,
      run.state, run.stateVersion, run.retryable ? 1 : 0, run.activeExpiresAt,
      run.packageId, run.errorCode, run.failureCategory,
      context.runQualityJson, context.runCandidateJson, run.retryOfRunId,
      run.createdAt, run.updatedAt];
    const runSql = ["mutation_id", "raw_role", "normalized_role_key", "locale",
      "input_fingerprint", "config_fingerprint", "execution_mode", "remote_quota_key",
      "state", "state_version", "retryable", "active_expires_at", "package_id",
      "error_code", "public_failure_category", "quality_json", "candidate_json",
      "retry_of_run_id", "created_at", "updated_at"]
      .map((column, index) => `r.${column} IS ?${14 + index}`).join(" AND ");
    const effect = `j.resolution_json=?13 AND j.decision_json IS NOT NULL
      AND EXISTS(SELECT 1 FROM research_runs r WHERE r.id=j.run_id AND r.user_id=j.user_id
        AND r.request_id=j.request_id AND r.active_slot IS NULL AND ${runSql})
      AND EXISTS(SELECT 1 FROM ai_runs a WHERE a.user_id=j.user_id AND a.request_id=?34
        AND a.purpose='role-research' AND a.provider=?35 AND a.model=?36
        AND a.prompt_version=?37 AND a.input_schema_version=?38 AND a.output_schema_version=?39
        AND a.status=?40 AND a.usage_json=?41 AND a.latency_ms=?42 AND a.error_code IS ?43)
      AND EXISTS(SELECT 1 FROM research_site_executions e WHERE e.run_id=j.run_id
        AND e.user_id=j.user_id AND e.request_id=j.request_id AND e.job_id=j.job_id
        AND e.request_hash=j.request_hash AND e.quota_reservation_id=?44 AND e.quota_key=?45)
      AND NOT ${researchQuotaInvalidRowsSql("j.user_id", "?45")}
      AND EXISTS(SELECT 1 FROM quota_ledger p JOIN quota_ledger t
        ON t.reservation_id=p.reservation_id AND t.user_id=p.user_id
          AND t.idempotency_key=p.idempotency_key AND t.purpose=p.purpose
        WHERE p.user_id=j.user_id AND p.idempotency_key=?45 AND p.reservation_id=?44
          AND p.purpose='role-research' AND p.entry_kind='reserved' AND p.units=1
          AND t.entry_kind=?46 AND t.units=?47
          AND (SELECT count(*) FROM quota_ledger q WHERE q.reservation_id=p.reservation_id)=2)
      AND EXISTS(SELECT 1 FROM ai_budget_reservations b
        JOIN ai_budget_buckets d ON d.id=b.day_bucket_id
        JOIN ai_budget_buckets m ON m.id=b.month_bucket_id
        WHERE (b.id=?48 AND b.run_id=j.run_id AND b.request_id=j.request_id
          AND b.day_bucket_id=?49 AND b.month_bucket_id=?50
          AND b.maximum_reserved_micros=?51 AND b.expires_at=?52
          AND b.status=?53 AND b.settled_micros=?54)
          AND (d.scope='site' AND d.period_kind='day' AND d.period_start=?55
          AND m.scope='site' AND m.period_kind='month' AND m.period_start=?56
          AND d.id<>m.id)
          AND (typeof(b.maximum_reserved_micros)='integer' AND typeof(b.settled_micros)='integer'
          AND typeof(b.expires_at)='integer' AND typeof(b.created_at)='integer'
          AND typeof(b.updated_at)='integer' AND b.created_at<=b.updated_at
          AND b.expires_at BETWEEN 0 AND 8640000000000000
          AND b.created_at BETWEEN 0 AND 8640000000000000
          AND b.updated_at BETWEEN 0 AND 8640000000000000)
          AND (b.created_at>=?55 AND b.created_at<?55+86400000
          AND b.created_at>=?56
          AND strftime('%Y-%m',b.created_at/1000,'unixepoch')=strftime('%Y-%m',?56/1000,'unixepoch')
          AND b.maximum_reserved_micros BETWEEN 0 AND 9007199254740991
          AND b.settled_micros BETWEEN 0 AND 9007199254740991)
          AND (typeof(d.version)='integer' AND d.version BETWEEN 0 AND 9007199254740991
          AND typeof(m.version)='integer' AND m.version BETWEEN 0 AND 9007199254740991
          AND typeof(d.created_at)='integer' AND typeof(d.updated_at)='integer'
          AND typeof(m.created_at)='integer' AND typeof(m.updated_at)='integer')
          AND (d.created_at BETWEEN 0 AND 9007199254740991 AND d.updated_at>=d.created_at
          AND m.created_at BETWEEN 0 AND 9007199254740991 AND m.updated_at>=m.created_at
          AND d.created_at<=8640000000000000 AND d.updated_at<=8640000000000000
          AND m.created_at<=8640000000000000 AND m.updated_at<=8640000000000000)
          AND (typeof(d.reserved_micros)='integer' AND typeof(d.settled_micros)='integer'
          AND typeof(m.reserved_micros)='integer' AND typeof(m.settled_micros)='integer'
          AND d.reserved_micros BETWEEN 0 AND 9007199254740991
          AND d.settled_micros BETWEEN 0 AND 9007199254740991
          AND m.reserved_micros BETWEEN 0 AND 9007199254740991
          AND m.settled_micros BETWEEN 0 AND 9007199254740991)
          AND (d.reserved_micros<=9007199254740991-d.settled_micros
          AND m.reserved_micros<=9007199254740991-m.settled_micros
          AND (?53<>'conservative-hold' OR
            (d.reserved_micros>=b.maximum_reserved_micros AND m.reserved_micros>=b.maximum_reserved_micros))))`;
    const audit = record.audit;
    const auditValues = [audit.requestId, audit.provider, audit.model ?? "unknown",
      audit.promptVersion, audit.inputSchemaVersion, audit.outputSchemaVersion, audit.status,
      canonicalJson({ usage: audit.usage, charged: audit.charged, modelKnown: audit.model !== null }),
      audit.latencyMs, audit.errorCode];
    const quotaStatus = record.resolution!.quotaStatus;
    return this.mutateMarker(identity, context, 4, 5, effect,
      [canonicalJson(record.resolution), ...runValues, ...auditValues,
        context.execution.quotaReservationId, context.execution.quotaKey, quotaStatus,
        quotaStatus === "accepted" ? 1 : 0,
        budget.reservation.id, budget.day.id, budget.month.id, budget.reservation.maximumMicros,
        budget.reservation.expiresAt, budget.reservation.status, budget.reservation.settledMicros,
        budget.day.periodStart, budget.month.periodStart], "all", researchQuotaLedgerCte);
  }

  private replay(row: SiteImportRecord, metadata: BridgeReceiptMetadata): SiteImportRecord {
    if (row.metadata.receiptHash !== metadata.receiptHash || canonicalJson(row.metadata) !== canonicalJson(metadata)) throw conflict();
    return row;
  }

  private requireJournal(context: Context, receiptHash: string): SiteImportRecord {
    if (!context.journal) throw unavailable();
    if (context.journal.metadata.receiptHash !== receiptHash) throw conflict();
    return context.journal;
  }

  private async readProvenContext(identity: SiteExecutionIdentity, receiptHash: string,
    proof: "audit" | "quota" | "budget" | "all"): Promise<Context & { budgetProof?: Readonly<{
      reservation: BudgetReservation; day: BudgetBucket; month: BudgetBucket }> }> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const context = await this.readStrictContext(identity);
        const record = this.requireJournal(context, receiptHash);
        if (proof === "audit" || proof === "all") await this.proveAudit(record);
        if (proof === "quota" || proof === "all") await this.proveQuota(context);
        const budgetProof = proof === "budget" || proof === "all" ? await this.proveBudget(context) : undefined;
        return { ...context, budgetProof };
      } catch (error) {
        if (!(error instanceof ResearchRepositoryError) || error.code !== "RESEARCH_UNAVAILABLE"
          || attempt === 1) throw error;
      }
    }
    throw unavailable();
  }

  private async proveAudit(record: SiteImportRecord): Promise<void> {
    let saved: ResearchAiRunRecord | null;
    try { saved = await new D1AiRunSink(this.db).readResearchAttempt(record.ownerId, record.audit.requestId); }
    catch { throw unavailable(); }
    if (!saved) throw unavailable();
    if (canonicalJson(saved) !== canonicalJson(record.audit)) throw conflict();
  }

  private async proveQuota(context: Context): Promise<void> {
    const record = context.journal;
    if (!record || !record.resolution || record.phase < 2) throw unavailable();
    let saved: Awaited<ReturnType<D1EntitlementRepository["readResearchReservation"]>>;
    try { saved = await new D1EntitlementRepository(this.db).readResearchReservation(record.ownerId,
      context.execution.quotaKey); } catch { throw unavailable(); }
    if (!saved || saved.reservationId !== context.execution.quotaReservationId
      || saved.finalStatus !== record.resolution.quotaStatus) throw unavailable();
  }

  private async proveBudget(context: Context): Promise<Readonly<{
    reservation: BudgetReservation; day: BudgetBucket; month: BudgetBucket }>> {
    const record = context.journal;
    if (!record || !record.resolution || record.phase < 2) throw unavailable();
    let reservation: BudgetReservation | null;
    let day: BudgetBucket | null;
    let month: BudgetBucket | null;
    try {
      const budget = new D1ResearchBudgetRepository(this.db);
      reservation = await budget.readReservation(record.ownerId, context.execution.budgetReservationId!);
      day = reservation ? await budget.readBucket(reservation.dayBucketId) : null;
      month = reservation ? await budget.readBucket(reservation.monthBucketId) : null;
    } catch { throw unavailable(); }
    if (!reservation || !day || !month) throw unavailable();
    const original = new Date(reservation.createdAt);
    const dayStart = Date.UTC(original.getUTCFullYear(), original.getUTCMonth(), original.getUTCDate());
    const monthStart = Date.UTC(original.getUTCFullYear(), original.getUTCMonth(), 1);
    const expectedStatus = record.settlement.kind === "actual" ? "settled"
      : record.settlement.kind === "not-charged" ? "released" : "conservative-hold";
    const expectedMicros = record.settlement.kind === "actual" ? record.settlement.actualMicros : 0;
    if (reservation.ownerId !== record.ownerId || reservation.runId !== record.runId
      || reservation.requestId !== record.requestId || reservation.id !== context.execution.budgetReservationId
      || reservation.maximumMicros !== context.execution.policy.maximumMicros
      || reservation.expiresAt !== context.execution.reservationExpiresAt
      || reservation.status !== expectedStatus || reservation.settledMicros !== expectedMicros
      || day.id === month.id || day.periodKind !== "day" || month.periodKind !== "month"
      || day.periodStart !== dayStart || month.periodStart !== monthStart
      || !Number.isSafeInteger(day.reservedMicros + day.settledMicros)
      || !Number.isSafeInteger(month.reservedMicros + month.settledMicros)
      || expectedStatus === "conservative-hold" && (day.reservedMicros < reservation.maximumMicros
        || month.reservedMicros < reservation.maximumMicros)) throw unavailable();
    return { reservation, day, month };
  }

  private async mutateMarker(identity: SiteExecutionIdentity, context: Context,
    from: SiteImportRecord["phase"], to: SiteImportRecord["phase"], effectSql: string,
    effectBindings: unknown[], proof: "audit" | "quota" | "budget" | "all", cte = ""): Promise<SiteImportRecord> {
    const record = this.requireJournal(context, context.journal!.metadata.receiptHash);
    if (record.phase !== from || record.version === Number.MAX_SAFE_INTEGER) throw unavailable();
    const cleanup = to === 5 ? ",decision_json=NULL" : "";
    const sql = `${cte} UPDATE research_site_imports AS j SET phase=${to},version=j.version+1,
      updated_at=${siteSqlNow}${cleanup}
      WHERE (j.run_id=?1 AND j.user_id=?2 AND j.request_id=?3 AND j.job_id=?4
        AND j.request_hash=?5 AND j.receipt_hash=?6 AND j.config_fingerprint=?7
        AND j.validation_context_json=?8 AND j.execution_version=?9)
        AND (j.decision_hash=?10 AND j.phase=?11 AND j.version=?12
        AND j.version<9007199254740991 AND ${siteSqlNow}>=j.updated_at)
        AND EXISTS(SELECT 1 FROM research_site_executions e
          JOIN research_runs r ON r.id=e.run_id AND r.user_id=e.user_id AND r.request_id=e.request_id
          WHERE e.run_id=j.run_id AND e.user_id=j.user_id AND e.request_id=j.request_id
            AND e.job_id=j.job_id AND e.request_hash=j.request_hash
            AND e.version=j.execution_version AND e.validation_context_json=j.validation_context_json
            AND e.admission_state='admitted' AND e.closed_at IS NULL AND e.close_reason IS NULL
            AND e.began_at=CAST(json_extract(j.receipt_metadata_json,'$.grant.beganAt') AS INTEGER)
            AND e.execution_expires_at=CAST(json_extract(j.receipt_metadata_json,'$.grant.executionExpiresAt') AS INTEGER)
            AND r.execution_mode='cloudflare-workflow-v1' AND r.remote_quota_key=e.quota_key
            AND r.config_fingerprint=j.config_fingerprint
            AND r.input_fingerprint=json_extract(e.job_json,'$.inputFingerprint')
            AND r.raw_role=json_extract(e.job_json,'$.role')
            AND r.locale=json_extract(e.job_json,'$.locale')) AND (${effectSql})`;
    try { await this.db.prepare(sql).bind(record.runId, record.ownerId, record.requestId,
      record.jobId, record.requestHash, record.metadata.receiptHash, record.configFingerprint,
      canonicalJson(record.validationContext), record.executionVersion, record.decisionHash,
      from, record.version, ...effectBindings).run(); }
    catch { /* A lost acknowledgement is resolved by the complete observation below. */ }
    const observed = await this.readProvenContext(identity, record.metadata.receiptHash, proof);
    const next = this.requireJournal(observed, record.metadata.receiptHash);
    if (next.phase < to || next.version < record.version + 1) throw unavailable();
    return next;
  }

  private async readImportContext(identity: SiteExecutionIdentity): Promise<Context> {
    try { return await this.readStrictContext(identity); }
    catch (error) {
      if (!(error instanceof ResearchRepositoryError) || error.code !== "RESEARCH_UNAVAILABLE") throw error;
      return this.readStrictContext(identity);
    }
  }

  private async readStrictContext(identity: SiteExecutionIdentity): Promise<Context> {
    let run: ResearchRunRecord | null;
    let execution: SiteExecutionRecord | null;
    let row: Row | null;
    let runPayload: Row | null;
    try {
      run = await this.runs.getRun(identity.ownerId, identity.runId);
      execution = await this.executions.read(identity.ownerId, identity.runId);
      row = await this.db.prepare("SELECT * FROM research_site_imports WHERE run_id=?1 AND user_id=?2")
        .bind(identity.runId, identity.ownerId).first<Row>();
      runPayload = await this.db.prepare("SELECT quality_json,candidate_json FROM research_runs WHERE id=?1 AND user_id=?2")
        .bind(identity.runId, identity.ownerId).first<Row>();
    } catch (error) { if (error instanceof ResearchRepositoryError) throw error; throw unavailable(); }
    if (!run && !execution && !row) throw new ResearchRepositoryError("NOT_FOUND");
    if (!run || !execution || !runPayload) throw unavailable();
    if (!exactIdentity(identity, execution) || run.ownerId !== identity.ownerId || run.id !== identity.runId
      || run.requestId !== identity.requestId) throw conflict();
    if (run.executionMode !== "cloudflare-workflow-v1" || run.remoteQuotaKey !== execution.quotaKey
      || run.configFingerprint !== execution.job.configFingerprint || run.inputFingerprint !== execution.job.inputFingerprint
      || run.rawRole !== execution.job.role || run.locale !== execution.job.locale || run.createdAt !== execution.createdAt
      || execution.admissionState !== "admitted" || execution.closedAt !== null || execution.closeReason !== null
      || execution.beganAt === null || execution.executionExpiresAt === null || !execution.quotaReservationId
      || !execution.budgetReservationId || run.state === "queued"
      || ["researching", "validating"].includes(run.state) && run.activeExpiresAt !== execution.executionExpiresAt
      || !["researching", "validating"].includes(run.state) && run.activeExpiresAt !== null) throw unavailable();
    const grant = Object.freeze({ protocol: BRIDGE_AUTH_PROTOCOL, jobId: execution.jobId,
      requestHash: execution.requestHash, beganAt: execution.beganAt, executionExpiresAt: execution.executionExpiresAt });
    const quality = runPayload.quality_json;
    const candidate = runPayload.candidate_json;
    if (quality !== null && typeof quality !== "string" || candidate !== null && typeof candidate !== "string") throw unavailable();
    try {
      if (canonicalJson(quality === null ? null : parseJson(quality, 16_384)) !== canonicalJson(run.quality)
        || canonicalJson(candidate === null ? null : parseJson(candidate, 1_048_576)) !== canonicalJson(run.candidate)) throw unavailable();
    } catch { throw unavailable(); }
    const journal = row ? await this.parseRow(row, identity, run, execution) : null;
    return { run, execution, grant, journal, runQualityJson: quality, runCandidateJson: candidate };
  }

  private async parseRow(row: Row, identity: SiteExecutionIdentity, run: ResearchRunRecord,
    execution: SiteExecutionRecord): Promise<SiteImportRecord> {
    try {
      const metadata = parseBridgeReceiptMetadata(json(row.receipt_metadata_json, 4096));
      const context = parseResearchValidationContext(json(row.validation_context_json, 4096));
      const decision = row.decision_json === null ? null
        : parseSiteImportDecision(decisionJson(row.decision_json), context);
      const audit = parseSmall(json(row.audit_json, 4096), auditSchema);
      const settlement = parseSmall(json(row.settlement_json, 256), settlementSchema);
      const resolution = row.resolution_json === null ? null
        : parseSmall(json(row.resolution_json, 4096), resolutionSchema);
      const fields = parseSmall({ ownerId: row.user_id, runId: row.run_id, requestId: row.request_id,
        jobId: row.job_id, requestHash: row.request_hash }, identitySchema);
      const phase = z.number().int().min(0).max(5).parse(row.phase) as SiteImportRecord["phase"];
      const mode = z.enum(["body", "metadata-only"]).parse(row.mode);
      const result: SiteImportRecord = { ...fields, mode, configFingerprint: identityText.parse(row.config_fingerprint),
        validationContext: context, executionVersion: safe.parse(row.execution_version), metadata,
        audit, settlement, decisionHash: hash.parse(row.decision_hash), decision,
        phase, version: safe.parse(row.version), resolution,
        createdAt: safe.parse(row.created_at), updatedAt: safe.parse(row.updated_at) };
      if (!exactIdentity(result, identity) || result.configFingerprint !== execution.job.configFingerprint
        || canonicalJson(context) !== row.validation_context_json
        || canonicalJson(context) !== canonicalJson(execution.validationContext)
        || result.executionVersion !== execution.version || hash.parse(row.receipt_hash) !== metadata.receiptHash
        || mode === "metadata-only" && metadata.outcome.kind !== "response"
        || canonicalJson(metadata) !== row.receipt_metadata_json
        || canonicalJson(audit) !== row.audit_json || canonicalJson(settlement) !== row.settlement_json
        || resolution !== null && canonicalJson(resolution) !== row.resolution_json
        || decision !== null && serializeSiteImportDecision(decision, context) !== row.decision_json
        || decision !== null && await hashSiteImportDecision(decision, context) !== result.decisionHash
        || metadata.grant.jobId !== result.jobId || metadata.grant.requestHash !== result.requestHash
        || metadata.grant.beganAt !== execution.beganAt || metadata.grant.executionExpiresAt !== execution.executionExpiresAt
        || result.createdAt > result.updatedAt || phase < 2 && resolution !== null
        || phase >= 2 && resolution === null || phase < 5 && decision === null || phase === 5 && decision !== null
        || result.version !== phase
        || mode === "metadata-only" && decision !== null && canonicalJson(decision) !== canonicalJson({
          kind: "failed", quality: null, errorCode: "interrupted", failureCategory: "timeout", retryable: true })
        || mode === "body" && metadata.outcome.kind === "error" && decision !== null
          && (decision.kind !== "failed" || decision.errorCode !== metadata.outcome.code
            || decision.retryable !== metadata.outcome.retryable || decision.quality !== null)
        || run.state === "ready" && phase < 2 || run.state === "needs-review" && phase < 2) throw unavailable();
      if (metadata.outcome.kind === "error") {
        const original = parseBridgeProviderReceipt({ grant: metadata.grant, producedAt: metadata.producedAt,
          latencyMs: metadata.latencyMs, outcome: metadata.outcome });
        if ((await summarizeBridgeProviderReceipt(original)).receiptHash !== metadata.receiptHash) throw unavailable();
      }
      this.assertAudit(audit, decision, metadata, identity, context, mode);
      if (canonicalJson(settlement) !== canonicalJson(expectedSettlement(metadata, mode))) throw unavailable();
      if (resolution && (resolution.state !== run.state || resolution.runVersion !== run.stateVersion
        || resolution.packageId !== run.packageId || resolution.terminalHash !== await sha256(canonicalJson(run))
        || resolution.quotaStatus !== (run.state === "ready" ? "accepted" : run.state === "needs-review" ? "rejected" : "failed")
        || resolution.resolvedAt < Math.max(run.updatedAt, result.createdAt)
        || resolution.resolvedAt > result.updatedAt)) throw unavailable();
      return result;
    } catch { throw unavailable(); }
  }

  private assertAudit(audit: ResearchAiRunRecord, decision: SiteImportDecision | null,
    metadata: BridgeReceiptMetadata, identity: SiteExecutionIdentity,
    context: SiteExecutionRecord["validationContext"], mode: "body" | "metadata-only"): void {
    const expectedStatus = mode === "metadata-only" ? "failed" : metadata.outcome.kind === "error"
      ? "failed" : decision?.kind === "ready" ? "accepted" : "rejected";
    const expectedCode = mode === "metadata-only" ? "unavailable" : metadata.outcome.kind === "error"
      ? metadata.outcome.code : expectedStatus === "accepted" ? null : "invalid-result";
    if (audit.userId !== identity.ownerId || audit.requestId !== deterministicId("research-attempt",
      [identity.ownerId, identity.runId, identity.requestId, "role-research"])
      || audit.promptVersion !== context.promptVersion || audit.inputSchemaVersion !== context.inputSchemaVersion
      || audit.outputSchemaVersion !== context.outputSchemaVersion || audit.latencyMs !== metadata.latencyMs
      || audit.model !== metadata.outcome.actualModel || canonicalJson(audit.usage) !== canonicalJson(metadata.outcome.usage)
      || decision !== null && (audit.status !== expectedStatus || audit.errorCode !== expectedCode)
      || decision === null && metadata.outcome.kind === "response" && mode === "body"
        && !((audit.status === "accepted" && audit.errorCode === null)
          || (audit.status === "rejected" && audit.errorCode === "invalid-result"))
      || decision === null && (metadata.outcome.kind === "error" || mode === "metadata-only")
        && (audit.status !== expectedStatus || audit.errorCode !== expectedCode)
      || audit.charged !== (mode === "metadata-only" ? true : metadata.outcome.kind === "response" ? true : metadata.outcome.charged)
      || audit.charged === false && audit.usage !== null && audit.usage.costMicros !== 0) throw unavailable();
  }

  private async insert(context: Context, metadata: BridgeReceiptMetadata, mode: "body" | "metadata-only",
    decision: SiteImportDecision, audit: ResearchAiRunRecord, settlement: BudgetSettlement): Promise<SiteImportRecord> {
    const { run, execution } = context;
    if (!["researching", "validating", "failed"].includes(run.state)) throw conflict();
    const decisionJson = serializeSiteImportDecision(decision, execution.validationContext);
    const decisionHash = await hashSiteImportDecision(decision, execution.validationContext);
    const values = [execution.runId, execution.ownerId, execution.requestId, execution.jobId,
      execution.requestHash, execution.job.configFingerprint, canonicalJson(execution.validationContext),
      execution.version, mode, metadata.receiptHash, canonicalJson(metadata), canonicalJson(audit),
      canonicalJson(settlement), decisionHash, decisionJson] as const;
    const sql = `INSERT INTO research_site_imports (
      run_id,user_id,request_id,job_id,request_hash,config_fingerprint,validation_context_json,
      execution_version,mode,receipt_hash,receipt_metadata_json,audit_json,settlement_json,
      decision_hash,decision_json,phase,version,resolution_json,created_at,updated_at)
      SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,0,0,NULL,${siteSqlNow},${siteSqlNow}
      FROM research_site_executions e JOIN research_runs r ON r.id=e.run_id AND r.user_id=e.user_id AND r.request_id=e.request_id
      WHERE e.run_id=?1 AND e.user_id=?2 AND e.request_id=?3 AND e.job_id=?4 AND e.request_hash=?5
        AND e.validation_context_json=?7 AND e.version=?8
        AND e.admission_state='admitted' AND e.closed_at IS NULL AND e.close_reason IS NULL
        AND e.began_at=?16 AND e.execution_expires_at=?17 AND ${siteSqlNow}>=e.began_at
        AND r.execution_mode='cloudflare-workflow-v1' AND r.remote_quota_key=e.quota_key
        AND r.config_fingerprint=?6 AND r.state IN ('researching','validating','failed')
        AND (r.state='failed' OR r.active_expires_at=e.execution_expires_at)
        AND (?9='body' OR r.state='failed' OR ${siteSqlNow}>=e.execution_expires_at)
        AND NOT EXISTS (SELECT 1 FROM research_site_imports j WHERE j.run_id=e.run_id)`;
    try { await this.db.prepare(sql).bind(...values, execution.beganAt, execution.executionExpiresAt).run(); }
    catch { /* A concurrent insert or lost acknowledgement is resolved by the exact read below. */ }
    const after = await this.readImportContext({ ownerId: execution.ownerId, runId: execution.runId,
      requestId: execution.requestId, jobId: execution.jobId, requestHash: execution.requestHash });
    if (after.journal) return this.replay(after.journal, metadata);
    throw unavailable();
  }
}
