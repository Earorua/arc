import { z } from "zod";
import { researchPackageSchema } from "../../contracts/research";
import { canonicalJson, deterministicId } from "../../lib/planning/fingerprint";
import { researchQuotaLedgerCte, researchQuotaLiveReservationSql } from "../entitlements/d1-research-quota-sql";
import { encodeBridgeJob, hashBridgeJob, parseBridgeJob } from "./executor/job";
import { KIMI_RESEARCH_EXECUTION_POLICY } from "./execution-policy";
import { parseResearchValidationContext } from "./package-validator";
import type { ResearchRepository, ResearchRunRecord } from "./repository";
import { ResearchRepositoryError } from "./repository";
import { readBoundedResearchJson } from "./source-audit";
import type { SiteAdmissionResult, SiteExecutionIdentity, SiteExecutionRecord, SiteExecutionRepository } from "./site-execution-repository";
import { SiteExecutionReadSkew } from "./site-execution-repository";
import { siteReservedBudgetSql, siteSqlNow } from "./site-execution-sql";

type Row = Record<string, unknown>;
const timeSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const identityTextSchema = z.string().min(1).max(160)
  .refine((value) => value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value));
const hashSchema = z.string().length(64).regex(/^[0-9a-f]{64}$/u);
const quotaKeySchema = z.string().min(8).max(128);
const policySchema = z.object({
  cacheDays: z.number().int().min(1).max(365),
  userDailyQuota: z.number().int().min(1).max(100_000),
  dailyBudgetMicros: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  monthlyBudgetMicros: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  maximumMicros: z.number().int().min(1).max(5_000_000),
}).strict();
const nullableTime = timeSchema.nullable();
const storedShape = z.object({
  ownerId: identityTextSchema,
  runId: researchPackageSchema.shape.id,
  requestId: identityTextSchema,
  jobId: z.uuid(),
  requestHash: hashSchema,
  job: z.unknown(),
  validationContext: z.unknown(),
  quotaKey: quotaKeySchema,
  policy: policySchema,
  reservationExpiresAt: timeSchema,
  admissionState: z.enum(["pending", "admitted", "closed"]),
  version: timeSchema,
  quotaReservationId: identityTextSchema.nullable(),
  budgetReservationId: identityTextSchema.nullable(),
  admittedAt: nullableTime,
  closedAt: nullableTime,
  closeReason: z.enum(["cached", "denied", "expired", "interrupted"]).nullable(),
  beganAt: nullableTime,
  executionExpiresAt: nullableTime,
  createdAt: timeSchema,
  updatedAt: timeSchema,
}).strict();
const admissionCommandSchema = z.object({
  ownerId: identityTextSchema,
  runId: researchPackageSchema.shape.id,
  requestId: identityTextSchema,
  jobId: z.uuid(),
  requestHash: hashSchema,
  expectedVersion: timeSchema,
  quotaReservationId: identityTextSchema,
  budgetReservationId: identityTextSchema,
}).strict();
const closeCommandSchema = z.object({
  ownerId: identityTextSchema,
  runId: researchPackageSchema.shape.id,
  requestId: identityTextSchema,
  jobId: z.uuid(),
  requestHash: hashSchema,
  reason: z.enum(["denied", "expired", "interrupted"]),
}).strict();

export class D1SiteExecutionRepository implements SiteExecutionRepository {
  constructor(
    private readonly db: D1Database,
    private readonly runs: Pick<ResearchRepository, "getRun">,
  ) {}

  read(ownerId: string, runId: string): Promise<SiteExecutionRecord | null> {
    return this.readRecord(ownerId, runId, true);
  }

  private async readRecord(ownerId: string, runId: string, reportReadSkew: boolean): Promise<SiteExecutionRecord | null> {
    const identity = parseContract(z.object({ ownerId: identityTextSchema, runId: researchPackageSchema.shape.id }).strict(), { ownerId, runId });
    const run = await this.runs.getRun(identity.ownerId, identity.runId);
    if (!run) return null;
    if (run.executionMode === "synchronous") return null;
    const row = await storage(() => this.db.prepare(
      "SELECT * FROM research_site_executions WHERE user_id=?1 AND run_id=?2 LIMIT 1",
    ).bind(identity.ownerId, identity.runId).first<Row>());
    if (!row) throw unavailable();
    return parseStoredExecution(row, run, reportReadSkew);
  }

  async markAdmitted(input: SiteExecutionIdentity & Readonly<{
    expectedVersion: number;
    quotaReservationId: string;
    budgetReservationId: string;
  }>): Promise<SiteExecutionRecord> {
    const command = parseContract(admissionCommandSchema, input);
    const before = await this.readRecord(command.ownerId, command.runId, false);
    const admittedBefore = await this.exactAdmittedReplay(before, command);
    if (admittedBefore) return admittedBefore;
    if (!hasExactIdentity(before, command) || before.admissionState !== "pending"
      || before.version !== command.expectedVersion) throw new ResearchRepositoryError("CONFLICT");
    const open = siteOpenAdmissionSql({ ownerSql: "?2", runSql: "?1", requestSql: "?3", jobSql: "?4", hashSql: "?5" });
    const liveQuota = researchQuotaLiveReservationSql("?2", "e.quota_key", "?6");
    const statement = this.db.prepare(`${researchQuotaLedgerCte}
      UPDATE research_site_executions AS e
      SET admission_state='admitted',quota_reservation_id=?6,budget_reservation_id=?7,
        admitted_at=${siteSqlNow},version=version+1,updated_at=${siteSqlNow}
      WHERE e.run_id=?1 AND e.user_id=?2 AND e.request_id=?3 AND e.job_id=?4 AND e.request_hash=?5
        AND e.admission_state='pending' AND e.version=?8 AND e.version<${Number.MAX_SAFE_INTEGER}
        AND e.quota_reservation_id IS NULL AND e.budget_reservation_id IS NULL AND e.admitted_at IS NULL
        AND e.began_at IS NULL AND e.closed_at IS NULL AND e.close_reason IS NULL
        AND ${siteSqlNow}<e.queue_expires_at AND ${siteSqlNow}<e.reservation_expires_at
        AND ${open}
        AND ${liveQuota}
        AND ${siteReservedBudgetSql("e", "?7")}`).bind(
      command.runId,
      command.ownerId,
      command.requestId,
      command.jobId,
      command.requestHash,
      command.quotaReservationId,
      command.budgetReservationId,
      command.expectedVersion,
    );
    try {
      const result = await statement.run();
      const execution = await this.readRecord(command.ownerId, command.runId, false);
      const admitted = await this.exactAdmittedReplay(execution, command);
      if (admitted) return admitted;
      if (result.meta.changes !== 1) throw new ResearchRepositoryError("CONFLICT");
      throw unavailable();
    } catch (error) {
      try {
        const execution = await this.readRecord(command.ownerId, command.runId, false);
        const admitted = await this.exactAdmittedReplay(execution, command);
        if (admitted) return admitted;
      } catch (readError) {
        if (readError instanceof ResearchRepositoryError) throw readError;
      }
      if (error instanceof ResearchRepositoryError) throw error;
      throw unavailable();
    }
  }

  private async exactAdmittedReplay(
    execution: SiteExecutionRecord | null,
    command: z.infer<typeof admissionCommandSchema>,
  ): Promise<SiteExecutionRecord | null> {
    if (!isExactAdmission(execution, command)) return null;
    const run = await this.runs.getRun(command.ownerId, command.runId);
    if (!run || run.state !== "queued" || run.activeExpiresAt !== execution.job.queueExpiresAt
      || run.executionMode !== "cloudflare-workflow-v1" || run.remoteQuotaKey !== execution.quotaKey) {
      throw new ResearchRepositoryError("CONFLICT");
    }
    return execution;
  }

  async closeBeforeBegin(input: SiteExecutionIdentity & Readonly<{
    reason: "denied" | "expired" | "interrupted";
  }>): Promise<SiteAdmissionResult> {
    const command = parseContract(closeCommandSchema, input);
    const before = await this.readRecord(command.ownerId, command.runId, false);
    if (!hasExactIdentity(before, command)) throw new ResearchRepositoryError("CONFLICT");
    const beforeRun = await this.runs.getRun(command.ownerId, command.runId);
    if (!beforeRun) throw new ResearchRepositoryError("CONFLICT");
    const replay = exactClosedResult(beforeRun, before, command);
    if (replay) return replay;
    if (before.admissionState === "closed" || before.beganAt !== null
      || !["pending", "admitted"].includes(before.admissionState)
      || beforeRun.state !== "queued" || beforeRun.activeExpiresAt !== before.job.queueExpiresAt) {
      throw new ResearchRepositoryError("CONFLICT");
    }

    const failure = closeFailure(command.reason);
    const closeExecution = this.db.prepare(`UPDATE research_site_executions AS e
      SET admission_state='closed',closed_at=${siteSqlNow},close_reason=?6,
        version=version+1,updated_at=${siteSqlNow}
      WHERE e.run_id=?1 AND e.user_id=?2 AND e.request_id=?3 AND e.job_id=?4 AND e.request_hash=?5
        AND e.admission_state IN ('pending','admitted') AND e.version<${Number.MAX_SAFE_INTEGER}
        AND e.began_at IS NULL AND e.closed_at IS NULL AND e.close_reason IS NULL
        AND EXISTS(
          SELECT 1 FROM research_runs close_run
          WHERE close_run.id=e.run_id AND close_run.user_id=e.user_id AND close_run.request_id=e.request_id
            AND close_run.execution_mode='cloudflare-workflow-v1'
            AND close_run.remote_quota_key=e.quota_key
            AND close_run.state='queued' AND close_run.active_slot=1
            AND close_run.active_expires_at=e.queue_expires_at
            AND close_run.state_version<${Number.MAX_SAFE_INTEGER}
        )`).bind(
      command.runId,
      command.ownerId,
      command.requestId,
      command.jobId,
      command.requestHash,
      command.reason,
    );
    const assertOne = () => this.db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('') END AS lifecycle_assertion");
    const failRun = this.db.prepare(`UPDATE research_runs AS close_run
      SET state='failed',state_version=state_version+1,retryable=1,
        active_slot=NULL,active_expires_at=NULL,error_code=?6,public_failure_category=?7,
        updated_at=${siteSqlNow}
      WHERE close_run.id=?1 AND close_run.user_id=?2 AND close_run.request_id=?3
        AND close_run.execution_mode='cloudflare-workflow-v1'
        AND close_run.state='queued' AND close_run.active_slot=1
        AND close_run.state_version<${Number.MAX_SAFE_INTEGER}
        AND EXISTS(
          SELECT 1 FROM research_site_executions e
          WHERE e.run_id=close_run.id AND e.user_id=close_run.user_id AND e.request_id=close_run.request_id
            AND e.job_id=?4 AND e.request_hash=?5 AND close_run.remote_quota_key=e.quota_key
            AND e.admission_state='closed' AND e.began_at IS NULL
            AND e.closed_at IS NOT NULL AND e.close_reason=?8
            AND close_run.active_expires_at=e.queue_expires_at
        )`).bind(
      command.runId,
      command.ownerId,
      command.requestId,
      command.jobId,
      command.requestHash,
      failure.errorCode,
      failure.category,
      command.reason,
    );
    try {
      await this.db.batch([closeExecution, assertOne(), failRun, assertOne()]);
    } catch (error) {
      try {
        const recovered = await this.readClosedResult(command);
        if (recovered) return recovered;
      } catch (readError) {
        if (readError instanceof ResearchRepositoryError) throw readError;
      }
      if (error instanceof ResearchRepositoryError) throw error;
      throw unavailable();
    }
    const result = await this.readClosedResult(command);
    if (!result) throw unavailable();
    return result;
  }

  private async readClosedResult(command: z.infer<typeof closeCommandSchema>): Promise<SiteAdmissionResult | null> {
    const execution = await this.readRecord(command.ownerId, command.runId, false);
    if (!hasExactIdentity(execution, command)) throw new ResearchRepositoryError("CONFLICT");
    const run = await this.runs.getRun(command.ownerId, command.runId);
    if (!run) throw new ResearchRepositoryError("CONFLICT");
    const result = exactClosedResult(run, execution, command);
    if (result) return result;
    if (execution.admissionState === "closed" || execution.beganAt !== null) {
      throw new ResearchRepositoryError("CONFLICT");
    }
    return null;
  }
}

export function buildSiteExecutionInsert(
  db: D1Database,
  initial: SiteExecutionRecord,
): D1PreparedStatement {
  const value = validateInitial(initial);
  return db.prepare(`INSERT INTO research_site_executions (
    run_id,user_id,request_id,job_id,request_hash,job_json,validation_context_json,quota_key,
    cache_days,user_daily_quota,daily_budget_micros,monthly_budget_micros,maximum_micros,
    queue_expires_at,reservation_expires_at,admission_state,version,quota_reservation_id,
    budget_reservation_id,admitted_at,closed_at,close_reason,began_at,execution_expires_at,
    created_at,updated_at
  ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26)`)
    .bind(
      value.runId, value.ownerId, value.requestId, value.jobId, value.requestHash,
      canonicalJson(value.job), canonicalJson(value.validationContext), value.quotaKey,
      value.policy.cacheDays, value.policy.userDailyQuota, value.policy.dailyBudgetMicros,
      value.policy.monthlyBudgetMicros, value.policy.maximumMicros, value.job.queueExpiresAt,
      value.reservationExpiresAt, value.admissionState, value.version, value.quotaReservationId,
      value.budgetReservationId, value.admittedAt, value.closedAt, value.closeReason, value.beganAt,
      value.executionExpiresAt, value.createdAt, value.updatedAt,
    );
}

export function siteOpenAdmissionSql(input: Readonly<{
  ownerSql: string;
  runSql: string;
  requestSql: string;
  jobSql: string;
  hashSql: string;
}>): string {
  return `EXISTS(
    SELECT 1 FROM research_runs admission_run
    JOIN research_site_executions admission_execution
      ON admission_execution.run_id=admission_run.id
      AND admission_execution.user_id=admission_run.user_id
      AND admission_execution.request_id=admission_run.request_id
    WHERE admission_run.user_id=${input.ownerSql}
      AND admission_run.id=${input.runSql}
      AND admission_run.request_id=${input.requestSql}
      AND admission_execution.job_id=${input.jobSql}
      AND admission_execution.request_hash=${input.hashSql}
      AND admission_run.execution_mode='cloudflare-workflow-v1'
      AND admission_run.remote_quota_key=admission_execution.quota_key
      AND admission_run.state='queued' AND admission_run.active_slot=1
      AND admission_run.active_expires_at=admission_execution.queue_expires_at
      AND admission_run.active_expires_at>${siteSqlNow}
      AND admission_execution.admission_state='pending'
      AND admission_execution.began_at IS NULL
      AND admission_execution.closed_at IS NULL
      AND admission_execution.close_reason IS NULL
  )`;
}

function validateInitial(input: SiteExecutionRecord): SiteExecutionRecord {
  const value = parseStoredValue(input);
  assertExecutionIdentity(value);
  if (value.admissionState !== "pending" || value.version !== 0
    || value.quotaReservationId !== null || value.budgetReservationId !== null
    || value.admittedAt !== null || value.closedAt !== null || value.closeReason !== null
    || value.beganAt !== null || value.executionExpiresAt !== null
    || value.createdAt !== value.updatedAt) throw unavailable();
  return value;
}

export async function parseStoredExecution(row: Row, run: ResearchRunRecord, reportReadSkew: boolean): Promise<SiteExecutionRecord> {
  let value: SiteExecutionRecord;
  try {
    if (typeof row.job_json !== "string" || typeof row.validation_context_json !== "string") throw new Error();
    const rawJob = parseJson(row.job_json, 4096);
    const rawContext = parseJson(row.validation_context_json, 4096);
    value = parseStoredValue({
      ownerId: row.user_id,
      runId: row.run_id,
      requestId: row.request_id,
      jobId: row.job_id,
      requestHash: row.request_hash,
      job: rawJob,
      validationContext: rawContext,
      quotaKey: row.quota_key,
      policy: {
        cacheDays: row.cache_days,
        userDailyQuota: row.user_daily_quota,
        dailyBudgetMicros: row.daily_budget_micros,
        monthlyBudgetMicros: row.monthly_budget_micros,
        maximumMicros: row.maximum_micros,
      },
      reservationExpiresAt: row.reservation_expires_at,
      admissionState: row.admission_state,
      version: row.version,
      quotaReservationId: row.quota_reservation_id,
      budgetReservationId: row.budget_reservation_id,
      admittedAt: row.admitted_at,
      closedAt: row.closed_at,
      closeReason: row.close_reason,
      beganAt: row.began_at,
      executionExpiresAt: row.execution_expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
    const encodedJob = new TextDecoder().decode(encodeBridgeJob(value.job));
    if (encodedJob !== row.job_json || canonicalJson(value.validationContext) !== row.validation_context_json) throw new Error();
    if (await hashBridgeJob(value.job) !== value.requestHash) throw new Error();
    assertRunIdentity(value, run);
  } catch {
    throw unavailable();
  }
  const active = ["queued", "researching", "validating"].includes(run.state);
  const expectedExpiry = value.beganAt === null ? value.job.queueExpiresAt : value.executionExpiresAt;
  if (active && run.activeExpiresAt !== expectedExpiry || !active && run.activeExpiresAt !== null) {
    // A generic lease mismatch is corruption. Only this exact old-queue/new-begin relationship
    // can describe read skew, and only after canonical job/hash, identity and lifecycle validation.
    if (reportReadSkew && run.state === "queued" && run.activeExpiresAt === value.job.queueExpiresAt
      && value.beganAt !== null) throw new SiteExecutionReadSkew(run, value);
    throw unavailable();
  }
  return value;
}

function parseStoredValue(input: unknown): SiteExecutionRecord {
  try {
    const envelope = storedShape.parse(readBoundedResearchJson(input));
    const job = parseBridgeJob(envelope.job);
    const validationContext = parseResearchValidationContext(envelope.validationContext);
    const value: SiteExecutionRecord = Object.freeze({ ...envelope, job, validationContext, policy: Object.freeze(envelope.policy) });
    assertLifecycle(value);
    return value;
  } catch {
    throw unavailable();
  }
}

function assertRunIdentity(value: SiteExecutionRecord, run: ResearchRunRecord): void {
  assertExecutionIdentity(value);
  if (run.executionMode !== "cloudflare-workflow-v1" || run.ownerId !== value.ownerId
    || run.id !== value.runId || run.requestId !== value.requestId || run.remoteQuotaKey !== value.quotaKey
    || run.inputFingerprint !== value.job.inputFingerprint || run.configFingerprint !== value.job.configFingerprint
    || run.rawRole !== value.job.role || run.locale !== value.job.locale || run.createdAt !== value.createdAt) throw new Error();
}

function assertExecutionIdentity(value: SiteExecutionRecord): void {
  if (value.job.runId !== value.runId || value.job.requestId !== value.requestId || value.job.jobId !== value.jobId
    || value.validationContext.packageId !== deterministicId("research-package", [value.ownerId, value.runId, value.requestId])
    || value.quotaKey !== deterministicId("research-quota", [value.ownerId, value.runId, value.requestId])
    || value.validationContext.observedAt !== date(value.createdAt)
    || value.validationContext.expiresAt !== date(value.createdAt + value.policy.cacheDays * 86_400_000)) throw new Error();
}

function assertLifecycle(value: SiteExecutionRecord): void {
  const reservationsAbsent = value.quotaReservationId === null && value.budgetReservationId === null && value.admittedAt === null;
  const reservationsPresent = value.quotaReservationId !== null && value.budgetReservationId !== null && value.admittedAt !== null;
  const closureAbsent = value.closedAt === null && value.closeReason === null;
  const closurePresent = value.closedAt !== null && value.closeReason !== null;
  if (value.updatedAt < value.createdAt || value.job.createdAt !== value.createdAt
    || value.job.queueExpiresAt !== value.createdAt + 120_000
    || value.reservationExpiresAt !== value.createdAt + 1_380_000
    || (!reservationsAbsent && !reservationsPresent) || (!closureAbsent && !closurePresent)
    || value.admittedAt !== null && (value.admittedAt < value.createdAt || value.admittedAt > value.updatedAt)
    || value.closedAt !== null && (value.closedAt < value.createdAt || value.closedAt > value.updatedAt)
    || (value.beganAt === null) !== (value.executionExpiresAt === null)
    || value.beganAt !== null && (value.executionExpiresAt === null
      || value.admittedAt === null || value.beganAt < value.admittedAt
      || value.beganAt > value.updatedAt || value.beganAt >= value.job.queueExpiresAt
      || value.beganAt > Number.MAX_SAFE_INTEGER - KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs
      || value.executionExpiresAt !== value.beganAt + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs
      || value.executionExpiresAt > value.reservationExpiresAt)
    || value.admissionState === "pending" && (!reservationsAbsent || !closureAbsent || value.beganAt !== null)
    || value.admissionState === "admitted" && (!reservationsPresent || !closureAbsent)
    || value.admissionState === "closed" && (!closurePresent || value.beganAt !== null)) throw new Error();
}

function isExactAdmission(
  value: SiteExecutionRecord | null,
  command: z.infer<typeof admissionCommandSchema>,
): value is SiteExecutionRecord {
  return value !== null
    && value.ownerId === command.ownerId
    && value.runId === command.runId
    && value.requestId === command.requestId
    && value.jobId === command.jobId
    && value.requestHash === command.requestHash
    && value.admissionState === "admitted"
    && value.beganAt === null
    && value.closedAt === null
    && value.closeReason === null
    && value.quotaReservationId === command.quotaReservationId
    && value.budgetReservationId === command.budgetReservationId;
}

function hasExactIdentity(
  value: SiteExecutionRecord | null,
  command: SiteExecutionIdentity,
): value is SiteExecutionRecord {
  return value !== null
    && value.ownerId === command.ownerId
    && value.runId === command.runId
    && value.requestId === command.requestId
    && value.jobId === command.jobId
    && value.requestHash === command.requestHash;
}

function closeFailure(reason: z.infer<typeof closeCommandSchema>["reason"]): Readonly<{
  errorCode: "admission-denied" | "interrupted";
  category: "timeout" | "service-unavailable";
}> {
  if (reason === "expired") return { errorCode: "interrupted", category: "timeout" };
  if (reason === "denied") return { errorCode: "admission-denied", category: "service-unavailable" };
  return { errorCode: "interrupted", category: "service-unavailable" };
}

function exactClosedResult(
  run: ResearchRunRecord,
  execution: SiteExecutionRecord,
  command: z.infer<typeof closeCommandSchema>,
): SiteAdmissionResult | null {
  const failure = closeFailure(command.reason);
  if (execution.admissionState !== "closed" || execution.closeReason !== command.reason
    || execution.closedAt === null || execution.beganAt !== null
    || run.ownerId !== command.ownerId || run.id !== command.runId || run.requestId !== command.requestId
    || run.executionMode !== "cloudflare-workflow-v1" || run.remoteQuotaKey !== execution.quotaKey
    || run.state !== "failed" || run.activeExpiresAt !== null || !run.retryable
    || run.errorCode !== failure.errorCode || run.failureCategory !== failure.category) return null;
  return Object.freeze({ run, execution });
}

function parseJson(value: string, limit: number): unknown {
  if (new TextEncoder().encode(value).byteLength > limit) throw unavailable();
  try { return readBoundedResearchJson(JSON.parse(value) as unknown); }
  catch { throw unavailable(); }
}

function parseContract<T>(schema: z.ZodType<T>, input: unknown): T {
  try { return schema.parse(readBoundedResearchJson(input)); }
  catch { throw unavailable(); }
}

function date(value: number): string { return new Date(value).toISOString().slice(0, 10); }
function unavailable(): ResearchRepositoryError { return new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); }
async function storage<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) { if (error instanceof ResearchRepositoryError) throw error; throw unavailable(); }
}
