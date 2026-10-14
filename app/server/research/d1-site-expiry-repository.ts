import { z } from "zod";
import { canonicalJson } from "../../lib/planning/fingerprint";
import { researchQuotaInvalidRowsSql, researchQuotaLedgerCte } from "../entitlements/d1-research-quota-sql";
import { D1SiteImportRepository } from "./d1-site-import-repository";
import type { UnsentProof } from "./executor/bridge-contract";
import { parseBridgeBeginGrant } from "./executor/begin";
import type { ResearchRepository, ResearchRunRecord } from "./repository";
import { ResearchRepositoryError } from "./repository";
import type { SiteExpiryRepository, SiteRecovery } from "./site-bridge-repository";
import type { SiteExecutionIdentity, SiteExecutionRecord, SiteExecutionRepository } from "./site-execution-repository";
import { siteSqlNow } from "./site-execution-sql";

type Row = Record<string, unknown>;
type AccountingSnapshot = Readonly<{
  budgetId: string; dayBucketId: string; monthBucketId: string; status: string;
  maximumMicros: number; settledMicros: number; expiresAt: number; createdAt: number; updatedAt: number;
  dayPeriodStart: number; dayReserved: number; daySettled: number; dayVersion: number;
  dayCreatedAt: number; dayUpdatedAt: number; monthPeriodStart: number; monthReserved: number;
  monthSettled: number; monthVersion: number; monthCreatedAt: number; monthUpdatedAt: number;
}>;
const MAX = Number.MAX_SAFE_INTEGER;
const BUDGET_TIME_MAX = 8_640_000_000_000_000;
const time = z.number().int().min(0).max(MAX);
const hash = z.string().length(64).regex(/^[0-9a-f]{64}$/u);
const identitySchema = z.object({ ownerId: z.string().min(1).max(160), runId: z.string().min(1).max(256),
  requestId: z.string().min(1).max(160), jobId: z.uuid(), requestHash: hash }).strict();
const rowSchema = z.object({
  job_id: z.uuid(), request_hash: hash, execution_version: time, run_version: time,
  terminal_hash: hash, reason: z.enum(["expired-unknown", "executor-unsent"]),
  unsent_json: z.string().nullable(), terminal_at: time,
  quota_done: z.union([z.literal(0), z.literal(1)]),
  budget_done: z.union([z.literal(0), z.literal(1)]), version: time,
}).strict();
const proofSchema = z.object({ jobId: z.uuid(), requestHash: hash, state: z.literal("closed"),
  closedAt: time, grant: z.unknown().nullable() }).strict();

export class D1SiteExpiryRepository implements SiteExpiryRepository {
  constructor(
    private readonly db: D1Database,
    private readonly research: Pick<ResearchRepository, "getRun">,
    private readonly executions: Pick<SiteExecutionRepository, "read">,
  ) {}

  async terminate(input: SiteExecutionIdentity, inputProof: UnsentProof | null): Promise<SiteRecovery | null> {
    const identity = parse(identitySchema, input);
    const proof = inputProof === null ? null : parseProof(inputProof);
    const pair = await this.readPair(identity);
    if (proof) assertProof(proof, pair.execution);
    const accounting = await this.accountingSnapshot(identity, pair.execution);
    const existing = await this.read(identity);
    if (existing) {
      if (!proof || existing.reason === "executor-unsent") return existing;
      const result = await storage(() => this.db.prepare(`${researchQuotaLedgerCte}
        UPDATE research_site_recoveries
        SET reason='executor-unsent',unsent_json=?1,budget_done=0,version=version+1
        WHERE job_id=?2 AND request_hash=?3 AND execution_version=?4 AND run_version=?5
          AND terminal_hash=?6 AND terminal_at=?7 AND reason='expired-unknown'
          AND unsent_json IS NULL AND version=?8 AND version<${MAX}
          AND EXISTS(SELECT 1 FROM research_site_executions e
            JOIN research_runs r ON r.id=e.run_id AND r.user_id=e.user_id AND r.request_id=e.request_id
            WHERE e.job_id=?2 AND e.request_hash=?3 AND e.version=?4
              AND r.state='failed' AND r.state_version=?5 AND r.updated_at=?7
              AND r.execution_mode='cloudflare-workflow-v1' AND r.remote_quota_key=e.quota_key
              AND e.quota_reservation_id=?9 AND e.budget_reservation_id=?10
              AND r.package_id IS ?11 AND r.retryable=?12 AND r.quality_json IS ?13
              AND r.candidate_json IS ?14 AND r.error_code IS ?15
              AND r.public_failure_category IS ?16 AND r.created_at=?17
              AND r.retry_of_run_id IS ?18 AND r.remote_quota_key=?19 AND r.mutation_id=?20
              AND r.input_fingerprint=?21 AND r.raw_role=?22 AND r.normalized_role_key=?23
              AND r.locale=?24 AND r.config_fingerprint=?25
              AND r.active_slot IS NULL AND r.active_expires_at IS NULL
              AND e.job_json=?26 AND e.validation_context_json=?27 AND e.admission_state='admitted'
              AND e.admitted_at=?28 AND e.began_at=?29 AND e.execution_expires_at=?30
              AND e.reservation_expires_at=?31 AND e.maximum_micros=?32
              AND e.daily_budget_micros=?33 AND e.monthly_budget_micros=?34
              AND e.cache_days=?35 AND e.user_daily_quota=?36 AND e.queue_expires_at=?37
              AND e.created_at=?38 AND e.updated_at=?39 AND e.closed_at IS ?40
              AND e.close_reason IS ?41
              AND ${quotaGuardSql("e")}
              AND ${accountingGuardSql("e", 41)})`)
        .bind(canonicalJson(proof), identity.jobId, identity.requestHash,
          existing.executionVersion, existing.runVersion, existing.terminalHash,
          existing.terminalAt, existing.version, pair.execution.quotaReservationId,
          pair.execution.budgetReservationId, pair.run.packageId, pair.run.retryable ? 1 : 0,
          pair.run.quality === null ? null : canonicalJson(pair.run.quality),
          pair.run.candidate === null ? null : canonicalJson(pair.run.candidate),
          pair.run.errorCode, pair.run.failureCategory, pair.run.createdAt, pair.run.retryOfRunId,
          pair.run.remoteQuotaKey, pair.run.mutationId, pair.run.inputFingerprint, pair.run.rawRole,
          pair.run.normalizedRoleKey, pair.run.locale, pair.run.configFingerprint,
          canonicalJson(pair.execution.job), canonicalJson(pair.execution.validationContext),
          pair.execution.admittedAt, pair.execution.beganAt, pair.execution.executionExpiresAt,
          pair.execution.reservationExpiresAt, pair.execution.policy.maximumMicros,
          pair.execution.policy.dailyBudgetMicros, pair.execution.policy.monthlyBudgetMicros,
          pair.execution.policy.cacheDays, pair.execution.policy.userDailyQuota,
          pair.execution.job.queueExpiresAt, pair.execution.createdAt, pair.execution.updatedAt,
          pair.execution.closedAt, pair.execution.closeReason, ...accountingValues(accounting)).run());
      const after = await this.read(identity);
      if (after?.reason === "executor-unsent" && exactProof(after.unsent, proof)) return after;
      if (result.meta.changes !== 1) throw conflict();
      throw unavailable();
    }
    if (!isActivePair(pair.run, pair.execution)) return null;
    const observedAt = await this.sqlTime();
    if (observedAt < pair.execution.beganAt!) throw unavailable();
    const terminal = terminalRun(pair.run, observedAt, proof !== null);
    const terminalHash = await canonicalHash(terminal);
    const unsentJson = proof === null ? null : canonicalJson(proof);
    const values = [terminal.state, terminal.stateVersion, terminal.retryable ? 1 : 0,
      terminal.packageId, terminal.quality === null ? null : canonicalJson(terminal.quality),
      terminal.candidate === null ? null : canonicalJson(terminal.candidate), terminal.errorCode,
      terminal.failureCategory, terminal.updatedAt, pair.run.id, pair.run.ownerId, pair.run.requestId,
      pair.run.stateVersion, pair.run.state, pair.run.activeExpiresAt, pair.run.packageId,
      pair.run.retryable ? 1 : 0, pair.run.updatedAt, pair.run.quality === null ? null : canonicalJson(pair.run.quality),
      pair.run.candidate === null ? null : canonicalJson(pair.run.candidate), pair.run.errorCode,
      pair.run.failureCategory, identity.jobId, identity.requestHash, pair.execution.version,
      proof === null ? 0 : 1,
      pair.run.createdAt, pair.run.retryOfRunId, pair.run.remoteQuotaKey, pair.run.mutationId,
      pair.run.normalizedRoleKey, pair.run.inputFingerprint, pair.run.rawRole, pair.run.locale,
      pair.run.configFingerprint, canonicalJson(pair.execution.job),
      canonicalJson(pair.execution.validationContext), pair.execution.quotaReservationId,
      pair.execution.budgetReservationId, pair.execution.admittedAt, pair.execution.beganAt,
      pair.execution.executionExpiresAt, pair.execution.reservationExpiresAt,
      pair.execution.policy.maximumMicros, pair.execution.policy.dailyBudgetMicros,
      pair.execution.policy.monthlyBudgetMicros, pair.execution.policy.cacheDays,
      pair.execution.policy.userDailyQuota, pair.execution.job.queueExpiresAt,
      pair.execution.createdAt, pair.execution.updatedAt, pair.execution.closedAt,
      pair.execution.closeReason] as const;
    const update = this.db.prepare(`${researchQuotaLedgerCte} UPDATE research_runs AS r SET state=?1,state_version=?2,
      retryable=?3,active_slot=NULL,active_expires_at=NULL,package_id=?4,quality_json=?5,
      candidate_json=?6,error_code=?7,public_failure_category=?8,updated_at=?9
      WHERE r.id=?10 AND r.user_id=?11 AND r.request_id=?12
        AND r.execution_mode='cloudflare-workflow-v1' AND r.state_version=?13
        AND r.state=?14 AND r.active_slot=1 AND r.active_expires_at=?15
        AND r.package_id IS ?16 AND r.retryable=?17 AND r.updated_at=?18
        AND r.quality_json IS ?19 AND r.candidate_json IS ?20
        AND r.error_code IS ?21 AND r.public_failure_category IS ?22
        AND r.created_at=?27 AND r.retry_of_run_id IS ?28 AND r.remote_quota_key=?29
        AND r.mutation_id=?30 AND r.normalized_role_key=?31
        AND r.input_fingerprint=?32 AND r.raw_role=?33 AND r.locale=?34
        AND r.config_fingerprint=?35
        AND r.state_version<${MAX} AND EXISTS(SELECT 1 FROM research_site_executions e
          WHERE e.run_id=r.id AND e.user_id=r.user_id AND e.request_id=r.request_id
            AND e.job_id=?23 AND e.request_hash=?24 AND e.version=?25
            AND e.admission_state='admitted' AND e.began_at IS NOT NULL
            AND e.execution_expires_at=e.began_at+1260000
            AND r.active_expires_at=e.execution_expires_at AND r.remote_quota_key=e.quota_key
            AND e.job_json=?36 AND e.validation_context_json=?37
            AND e.quota_reservation_id=?38 AND e.budget_reservation_id=?39
            AND e.admitted_at=?40 AND e.began_at=?41 AND e.execution_expires_at=?42
            AND e.reservation_expires_at=?43 AND e.maximum_micros=?44
            AND e.daily_budget_micros=?45 AND e.monthly_budget_micros=?46
            AND e.cache_days=?47 AND e.user_daily_quota=?48
            AND e.queue_expires_at=?49 AND e.created_at=?50 AND e.updated_at=?51
            AND e.closed_at IS ?52 AND e.close_reason IS ?53
            AND ${quotaGuardSql("e")}
            AND ${accountingGuardSql("e", 53)}
            AND (?26=1 OR ${siteSqlNow}>=e.execution_expires_at))
        AND ${siteSqlNow}>=?9
        AND NOT EXISTS(SELECT 1 FROM research_site_imports j WHERE j.run_id=r.id AND j.phase>=2)`)
      .bind(...values, ...accountingValues(accounting));
    const insert = this.db.prepare(`INSERT INTO research_site_recoveries
      (job_id,request_hash,execution_version,run_version,terminal_hash,reason,unsent_json,terminal_at)
      SELECT e.job_id,e.request_hash,e.version,r.state_version,?1,?2,?3,?4
      FROM research_site_executions e JOIN research_runs r
        ON r.id=e.run_id AND r.user_id=e.user_id AND r.request_id=e.request_id
      WHERE e.run_id=?5 AND e.user_id=?6 AND e.request_id=?7 AND e.job_id=?8
        AND e.request_hash=?9 AND e.version=?10 AND e.admission_state='admitted'
        AND e.began_at IS NOT NULL AND e.execution_expires_at=e.began_at+1260000
        AND r.state='failed' AND r.state_version=?11 AND r.active_slot IS NULL
        AND r.active_expires_at IS NULL AND r.updated_at=?4 AND r.remote_quota_key=e.quota_key
        AND NOT EXISTS(SELECT 1 FROM research_site_imports j WHERE j.run_id=e.run_id AND j.phase>=2)`)
      .bind(terminalHash, proof ? "executor-unsent" : "expired-unknown", unsentJson, observedAt,
        identity.runId, identity.ownerId, identity.requestId, identity.jobId, identity.requestHash,
        pair.execution.version, terminal.stateVersion);
    try { await this.db.batch([update, assertOne(this.db), insert, assertOne(this.db)]); }
    catch { /* Version winner or lost acknowledgement is determined by immutable reread. */ }
    const saved = await this.read(identity);
    if (saved && saved.terminalHash === terminalHash && saved.executionVersion === pair.execution.version
      && saved.runVersion === terminal.stateVersion && saved.reason === (proof ? "executor-unsent" : "expired-unknown")
      && (proof === null || exactProof(saved.unsent, proof))) return saved;
    const journal = await storage(() => this.db.prepare(`SELECT phase FROM research_site_imports
      WHERE run_id=?1 AND user_id=?2 AND request_id=?3 AND job_id=?4 AND request_hash=?5 LIMIT 1`)
      .bind(identity.runId, identity.ownerId, identity.requestId, identity.jobId, identity.requestHash)
      .first<{ phase: number }>());
    if (journal && Number.isSafeInteger(journal.phase) && journal.phase >= 2) return null;
    if (!proof && isActivePair(pair.run, pair.execution)
      && await this.sqlTime() < pair.execution.executionExpiresAt!) return null;
    throw unavailable();
  }

  async read(input: SiteExecutionIdentity): Promise<SiteRecovery | null> {
    const identity = parse(identitySchema, input);
    const row = await storage(() => this.db.prepare(`SELECT job_id,request_hash,execution_version,
      run_version,terminal_hash,reason,unsent_json,terminal_at,quota_done,budget_done,version
      FROM research_site_recoveries WHERE job_id=?1 LIMIT 1`).bind(identity.jobId).first<Row>());
    if (!row) return null;
    const stored = parse(rowSchema, row);
    const pair = await this.readPair(identity);
    if (stored.request_hash !== identity.requestHash || pair.execution.version !== stored.execution_version
      || pair.run.state !== "failed" || pair.run.stateVersion !== stored.run_version
      || pair.run.updatedAt !== stored.terminal_at || pair.run.activeExpiresAt !== null
      || pair.run.packageId !== null || await canonicalHash(pair.run) !== stored.terminal_hash) throw unavailable();
    const unsent = stored.unsent_json === null ? null : parseProof(parseJson(stored.unsent_json));
    if ((stored.reason === "executor-unsent") !== (unsent !== null)) throw unavailable();
    if (unsent) assertProof(unsent, pair.execution);
    return Object.freeze({ identity: Object.freeze({ ...identity }), executionVersion: stored.execution_version,
      runVersion: stored.run_version, terminalHash: stored.terminal_hash, reason: stored.reason,
      unsent, terminalAt: stored.terminal_at, quotaDone: stored.quota_done === 1,
      budgetDone: stored.budget_done === 1, version: stored.version });
  }

  async mark(input: SiteExecutionIdentity, stage: "quota" | "budget", expectedVersion: number): Promise<SiteRecovery> {
    const identity = parse(identitySchema, input);
    if (stage !== "quota" && stage !== "budget") throw unavailable();
    const version = time.parse(expectedVersion);
    const before = await this.read(identity);
    if (!before) throw unavailable();
    if (before.version !== version) {
      if ((stage === "quota" ? before.quotaDone : before.budgetDone) && await this.effectExists(identity, before, stage)) return before;
      throw conflict();
    }
    if ((stage === "quota" ? before.quotaDone : before.budgetDone)) {
      if (await this.effectExists(identity, before, stage)) return before;
      throw unavailable();
    }
    const proof = await this.effectProof(identity, before, stage, 3);
    let changes: number | null = null;
    try {
      const result = await this.db.prepare(`${stage === "quota" ? researchQuotaLedgerCte : ""}
        UPDATE research_site_recoveries AS p
        SET ${stage === "quota" ? "quota_done" : "budget_done"}=1,version=version+1
        WHERE p.job_id=?1 AND p.request_hash=?2 AND p.version=?3 AND p.${stage === "quota" ? "quota_done" : "budget_done"}=0
          AND p.version<${MAX} AND EXISTS(${proof.sql})`)
        .bind(identity.jobId, identity.requestHash, version, ...proof.values).run();
      changes = result.meta.changes;
    } catch { /* Lost acknowledgement is accepted only after exact effect proof below. */ }
    const after = await this.read(identity);
    if (after && (stage === "quota" ? after.quotaDone : after.budgetDone)
      && await this.effectExists(identity, after, stage)) return after;
    if (changes !== 1) throw unavailable();
    throw unavailable();
  }

  private async effectProof(identity: SiteExecutionIdentity, recovery: SiteRecovery,
    stage: "quota" | "budget", offset: number): Promise<Readonly<{ sql: string; values: readonly unknown[] }>> {
    const { run, execution } = await this.readPair(identity);
    if (run.state !== "failed" || run.stateVersion !== recovery.runVersion
      || run.updatedAt !== recovery.terminalAt || execution.version !== recovery.executionVersion
      || execution.quotaReservationId === null || execution.budgetReservationId === null
      || execution.beganAt === null || execution.executionExpiresAt === null
      || await canonicalHash(run) !== recovery.terminalHash) throw unavailable();
    const accounting = await storage(() => this.db.prepare(`SELECT b.id,b.day_bucket_id,b.month_bucket_id,
      b.created_at FROM ai_budget_reservations b JOIN research_runs r ON r.id=b.run_id
      WHERE b.id=?1 AND b.run_id=?2 AND b.request_id=?3 AND r.user_id=?4 LIMIT 1`)
      .bind(execution.budgetReservationId, identity.runId, identity.requestId, identity.ownerId)
      .first<{ id: unknown; day_bucket_id: unknown; month_bucket_id: unknown; created_at: unknown }>());
    if (!accounting || typeof accounting.id !== "string" || typeof accounting.day_bucket_id !== "string"
      || typeof accounting.month_bucket_id !== "string" || !Number.isSafeInteger(accounting.created_at)) throw unavailable();
    const imports = new D1SiteImportRepository(this.db, this.research, this.executions);
    const journal = await imports.read(identity);
    const rawJournal = journal === null ? null : await storage(() => this.db.prepare(`SELECT receipt_metadata_json,
      settlement_json,resolution_json,version FROM research_site_imports WHERE run_id=?1 LIMIT 1`)
      .bind(identity.runId).first<{ receipt_metadata_json: unknown; settlement_json: unknown;
        resolution_json: unknown; version: unknown }>());
    if (journal && (!rawJournal || rawJournal.receipt_metadata_json !== canonicalJson(journal.metadata)
      || rawJournal.settlement_json !== canonicalJson(journal.settlement)
      || rawJournal.resolution_json !== canonicalJson(journal.resolution)
      || rawJournal.version !== journal.version)) throw unavailable();
    const values: readonly unknown[] = [identity.ownerId, identity.runId, identity.requestId,
      recovery.executionVersion, recovery.runVersion, recovery.terminalAt,
      execution.quotaReservationId, execution.budgetReservationId, execution.quotaKey,
      execution.policy.maximumMicros, execution.reservationExpiresAt, execution.beganAt,
      execution.executionExpiresAt, run.mutationId, run.inputFingerprint, run.rawRole,
      run.normalizedRoleKey, run.locale, run.configFingerprint, run.retryable ? 1 : 0,
      run.errorCode, run.failureCategory, run.quality === null ? null : canonicalJson(run.quality),
      run.candidate === null ? null : canonicalJson(run.candidate), canonicalJson(execution.job),
      canonicalJson(execution.validationContext), accounting.day_bucket_id, accounting.month_bucket_id,
      accounting.created_at, rawJournal?.receipt_metadata_json ?? null,
      rawJournal?.settlement_json ?? null, rawJournal?.resolution_json ?? null,
      rawJournal?.version ?? null, run.createdAt, run.retryOfRunId,
      run.executionMode, run.remoteQuotaKey];
    const p = (index: number) => `?${offset + index}`;
    const common = `SELECT 1 FROM research_site_executions e
      JOIN research_runs r ON r.id=e.run_id AND r.user_id=e.user_id AND r.request_id=e.request_id
      WHERE e.job_id=p.job_id AND e.request_hash=p.request_hash
        AND e.user_id=${p(1)} AND e.run_id=${p(2)} AND e.request_id=${p(3)}
        AND e.version=${p(4)} AND p.execution_version=${p(4)}
        AND e.admission_state='admitted' AND e.began_at IS NOT NULL
        AND e.execution_expires_at=e.began_at+1260000 AND e.began_at=${p(12)}
        AND e.execution_expires_at=${p(13)} AND e.quota_reservation_id=${p(7)}
        AND e.budget_reservation_id=${p(8)} AND e.quota_key=${p(9)}
        AND e.maximum_micros=${p(10)} AND e.reservation_expires_at=${p(11)}
        AND e.job_json=${p(25)} AND e.validation_context_json=${p(26)}
        AND r.state='failed' AND r.state_version=${p(5)} AND p.run_version=${p(5)}
        AND r.active_slot IS NULL AND r.active_expires_at IS NULL AND r.package_id IS NULL
        AND r.updated_at=${p(6)} AND p.terminal_at=${p(6)}
        AND r.mutation_id=${p(14)} AND r.input_fingerprint=${p(15)}
        AND r.raw_role=${p(16)} AND r.normalized_role_key=${p(17)} AND r.locale=${p(18)}
        AND r.config_fingerprint=${p(19)} AND r.retryable=${p(20)}
        AND r.error_code IS ${p(21)} AND r.public_failure_category IS ${p(22)}
        AND r.quality_json IS ${p(23)} AND r.candidate_json IS ${p(24)}
        AND r.created_at=${p(34)} AND r.retry_of_run_id IS ${p(35)}
        AND r.execution_mode=${p(36)} AND r.remote_quota_key=${p(37)}`;
    if (stage === "quota") return Object.freeze({ sql: `${common}
      AND NOT ${researchQuotaInvalidRowsSql("e.user_id", "e.quota_key")}
      AND EXISTS(SELECT 1 FROM ledger_groups g JOIN quota_ledger q ON q.reservation_id=g.reservation_id
        WHERE g.reservation_id=e.quota_reservation_id AND g.reserved_user=e.user_id
          AND g.reserved_key=e.quota_key AND g.reserved_purpose='role-research'
          AND g.reserved_units=1 AND g.reserved_count=1 AND g.terminal_count=1
          AND q.user_id=e.user_id AND q.idempotency_key=e.quota_key
          AND q.purpose='role-research' AND q.entry_kind='failed' AND q.units=0)`, values });
    return Object.freeze({ sql: `${common}
      AND EXISTS(SELECT 1 FROM ai_budget_reservations b
        JOIN ai_budget_buckets d ON d.id=b.day_bucket_id AND d.id=${p(27)} AND d.scope='site' AND d.period_kind='day'
        JOIN ai_budget_buckets m ON m.id=b.month_bucket_id AND m.id=${p(28)} AND m.scope='site' AND m.period_kind='month'
        WHERE b.id=e.budget_reservation_id AND b.run_id=e.run_id AND b.request_id=e.request_id
          AND b.maximum_reserved_micros=e.maximum_micros AND b.expires_at=e.reservation_expires_at
          AND b.day_bucket_id=${p(27)} AND b.month_bucket_id=${p(28)} AND b.day_bucket_id<>b.month_bucket_id
          AND b.created_at=${p(29)}
          AND d.period_start=CAST(b.created_at/86400000 AS INTEGER)*86400000
          AND m.period_start=CAST(strftime('%s',strftime('%Y-%m-01T00:00:00Z',b.created_at/1000,'unixepoch')) AS INTEGER)*1000
          AND d.reserved_micros BETWEEN 0 AND ${MAX} AND d.settled_micros BETWEEN 0 AND ${MAX}
          AND m.reserved_micros BETWEEN 0 AND ${MAX} AND m.settled_micros BETWEEN 0 AND ${MAX}
          AND d.reserved_micros<=${MAX}-d.settled_micros
          AND m.reserved_micros<=${MAX}-m.settled_micros
          AND ((p.reason='expired-unknown' AND b.status='conservative-hold' AND b.settled_micros=0
              AND d.reserved_micros>=b.maximum_reserved_micros AND m.reserved_micros>=b.maximum_reserved_micros)
            OR (p.reason='executor-unsent' AND p.unsent_json IS NOT NULL AND b.status='released' AND b.settled_micros=0
              AND NOT EXISTS(SELECT 1 FROM research_site_imports j WHERE j.run_id=e.run_id))
            OR EXISTS(SELECT 1 FROM research_site_imports j
              WHERE j.run_id=e.run_id AND j.user_id=e.user_id AND j.request_id=e.request_id
                AND j.job_id=e.job_id AND j.request_hash=e.request_hash
                AND j.execution_version=e.version AND j.phase>=4
                AND j.receipt_metadata_json=${p(30)} AND j.settlement_json=${p(31)}
                AND j.resolution_json=${p(32)} AND j.version=${p(33)}
                AND json_extract(j.resolution_json,'$.state')='failed'
                AND json_extract(j.resolution_json,'$.runVersion')=p.run_version
                AND json_extract(j.resolution_json,'$.terminalHash')=p.terminal_hash
                AND ((json_extract(j.settlement_json,'$.kind')='actual' AND b.status='settled'
                    AND b.settled_micros=json_extract(j.settlement_json,'$.actualMicros'))
                  OR (json_extract(j.settlement_json,'$.kind')='not-charged' AND b.status='released')
                  OR (json_extract(j.settlement_json,'$.kind')='unknown' AND b.status='conservative-hold'
                    AND d.reserved_micros>=b.maximum_reserved_micros
                    AND m.reserved_micros>=b.maximum_reserved_micros)))))`, values });
  }

  private async effectExists(identity: SiteExecutionIdentity, recovery: SiteRecovery,
    stage: "quota" | "budget"): Promise<boolean> {
    const proof = await this.effectProof(identity, recovery, stage, 6);
    const row = await storage(() => this.db.prepare(`${stage === "quota" ? researchQuotaLedgerCte : ""}
      SELECT 1 AS ok FROM research_site_recoveries p
      WHERE p.job_id=?1 AND p.request_hash=?2 AND p.execution_version=?3 AND p.run_version=?4
        AND p.terminal_hash=?5 AND p.terminal_at=?6 AND EXISTS(${proof.sql}) LIMIT 1`)
      .bind(identity.jobId, identity.requestHash, recovery.executionVersion, recovery.runVersion,
        recovery.terminalHash, recovery.terminalAt, ...proof.values).first<{ ok: number }>());
    return row?.ok === 1;
  }

  private async readPair(identity: SiteExecutionIdentity): Promise<Readonly<{ run: ResearchRunRecord; execution: SiteExecutionRecord }>> {
    const [run, execution] = await Promise.all([
      this.research.getRun(identity.ownerId, identity.runId),
      this.executions.read(identity.ownerId, identity.runId),
    ]);
    if (!run || !execution || !sameIdentity(execution, identity)
      || run.ownerId !== identity.ownerId || run.id !== identity.runId || run.requestId !== identity.requestId
      || run.executionMode !== "cloudflare-workflow-v1" || run.remoteQuotaKey !== execution.quotaKey
      || run.inputFingerprint !== execution.job.inputFingerprint
      || run.configFingerprint !== execution.job.configFingerprint || run.rawRole !== execution.job.role
      || run.locale !== execution.job.locale) throw conflict();
    return Object.freeze({ run, execution });
  }

  private async sqlTime(): Promise<number> {
    const row = await storage(() => this.db.prepare(`SELECT ${siteSqlNow} AS now`).first<{ now: unknown }>());
    return parse(time, row?.now);
  }

  private async accountingSnapshot(identity: SiteExecutionIdentity,
    execution: SiteExecutionRecord): Promise<AccountingSnapshot> {
    if (!execution.quotaReservationId || !execution.budgetReservationId) throw unavailable();
    const row = await storage(() => this.db.prepare(`SELECT b.id AS budget_id,
      b.day_bucket_id,b.month_bucket_id,b.status,b.maximum_reserved_micros,b.settled_micros,
      b.expires_at,b.created_at,b.updated_at,day.period_start AS day_period_start,
      day.reserved_micros AS day_reserved,day.settled_micros AS day_settled,day.version AS day_version,
      day.created_at AS day_created_at,day.updated_at AS day_updated_at,
      month.period_start AS month_period_start,month.reserved_micros AS month_reserved,
      month.settled_micros AS month_settled,month.version AS month_version,
      month.created_at AS month_created_at,month.updated_at AS month_updated_at
      FROM ai_budget_reservations b
      JOIN ai_budget_buckets day ON day.id=b.day_bucket_id
      JOIN ai_budget_buckets month ON month.id=b.month_bucket_id
      WHERE b.id=?1 AND b.run_id=?2 AND b.request_id=?3 AND b.expires_at=?4
        AND b.maximum_reserved_micros=?5 AND day.scope='site' AND day.period_kind='day'
        AND month.scope='site' AND month.period_kind='month' LIMIT 1`)
      .bind(execution.budgetReservationId, identity.runId, identity.requestId,
        execution.reservationExpiresAt, execution.policy.maximumMicros).first<Row>());
    if (!row) throw unavailable();
    const stringValue = (key: string) => typeof row[key] === "string" ? row[key] as string : null;
    const numberValue = (key: string) => Number.isSafeInteger(row[key]) ? row[key] as number : null;
    const snapshot = {
      budgetId: stringValue("budget_id"), dayBucketId: stringValue("day_bucket_id"),
      monthBucketId: stringValue("month_bucket_id"), status: stringValue("status"),
      maximumMicros: numberValue("maximum_reserved_micros"), settledMicros: numberValue("settled_micros"),
      expiresAt: numberValue("expires_at"), createdAt: numberValue("created_at"), updatedAt: numberValue("updated_at"),
      dayPeriodStart: numberValue("day_period_start"), dayReserved: numberValue("day_reserved"),
      daySettled: numberValue("day_settled"), dayVersion: numberValue("day_version"),
      dayCreatedAt: numberValue("day_created_at"), dayUpdatedAt: numberValue("day_updated_at"),
      monthPeriodStart: numberValue("month_period_start"), monthReserved: numberValue("month_reserved"),
      monthSettled: numberValue("month_settled"), monthVersion: numberValue("month_version"),
      monthCreatedAt: numberValue("month_created_at"), monthUpdatedAt: numberValue("month_updated_at"),
    };
    if (Object.values(snapshot).some((value) => value === null)) throw unavailable();
    return snapshot as AccountingSnapshot;
  }
}

function quotaGuardSql(alias: string): string {
  return `EXISTS(SELECT 1 FROM ledger_groups g WHERE g.reservation_id=${alias}.quota_reservation_id
    AND g.reserved_user=${alias}.user_id AND g.reserved_key=${alias}.quota_key
    AND g.reserved_purpose='role-research' AND g.reserved_units=1
    AND g.reserved_count=1 AND g.terminal_count<=1)
    AND NOT ${researchQuotaInvalidRowsSql(`${alias}.user_id`, `${alias}.quota_key`)}`;
}

function accountingGuardSql(alias: string, offset: number): string {
  const p = (index: number) => `?${offset + index}`;
  return `EXISTS(SELECT 1 FROM ai_budget_reservations b
    JOIN ai_budget_buckets day ON day.id=b.day_bucket_id
    JOIN ai_budget_buckets month ON month.id=b.month_bucket_id
    WHERE b.id=${alias}.budget_reservation_id AND b.run_id=${alias}.run_id
      AND b.request_id=${alias}.request_id AND b.id=${p(1)} AND b.day_bucket_id=${p(2)}
      AND b.month_bucket_id=${p(3)} AND b.status=${p(4)} AND b.maximum_reserved_micros=${p(5)}
      AND b.settled_micros=${p(6)} AND b.expires_at=${p(7)} AND b.created_at=${p(8)}
      AND b.updated_at=${p(9)} AND day.scope='site' AND day.period_kind='day'
      AND day.period_start=${p(10)} AND day.reserved_micros=${p(11)} AND day.settled_micros=${p(12)}
      AND day.version=${p(13)} AND day.created_at=${p(14)} AND day.updated_at=${p(15)}
      AND month.scope='site' AND month.period_kind='month' AND month.period_start=${p(16)}
      AND month.reserved_micros=${p(17)} AND month.settled_micros=${p(18)}
      AND month.version=${p(19)} AND month.created_at=${p(20)} AND month.updated_at=${p(21)}
      AND b.created_at BETWEEN ${alias}.created_at AND ${alias}.began_at
      AND b.updated_at BETWEEN b.created_at AND ${BUDGET_TIME_MAX}
      AND b.settled_micros BETWEEN 0 AND ${MAX}
      AND (b.status<>'reserved' OR b.settled_micros=0)
      AND (b.status NOT IN ('released','conservative-hold') OR b.settled_micros=0)
      AND b.day_bucket_id<>b.month_bucket_id
      AND day.period_start=(b.created_at/86400000)*86400000
      AND month.period_start=CAST(strftime('%s',b.created_at/1000,'unixepoch','start of month') AS INTEGER)*1000
      AND day.created_at BETWEEN 0 AND ${BUDGET_TIME_MAX} AND day.updated_at BETWEEN 0 AND ${BUDGET_TIME_MAX}
      AND month.created_at BETWEEN 0 AND ${BUDGET_TIME_MAX} AND month.updated_at BETWEEN 0 AND ${BUDGET_TIME_MAX}
      AND day.reserved_micros BETWEEN 0 AND ${MAX} AND day.settled_micros BETWEEN 0 AND ${MAX}
      AND month.reserved_micros BETWEEN 0 AND ${MAX} AND month.settled_micros BETWEEN 0 AND ${MAX}
      AND day.reserved_micros<=${MAX}-day.settled_micros
      AND month.reserved_micros<=${MAX}-month.settled_micros
      AND day.version BETWEEN 0 AND ${MAX} AND month.version BETWEEN 0 AND ${MAX}
      AND (b.status NOT IN ('reserved','conservative-hold') OR
        (day.reserved_micros>=b.maximum_reserved_micros
          AND month.reserved_micros>=b.maximum_reserved_micros)))`;
}

function accountingValues(value: AccountingSnapshot): readonly unknown[] {
  return [value.budgetId, value.dayBucketId, value.monthBucketId, value.status, value.maximumMicros,
    value.settledMicros, value.expiresAt, value.createdAt, value.updatedAt, value.dayPeriodStart,
    value.dayReserved, value.daySettled, value.dayVersion, value.dayCreatedAt, value.dayUpdatedAt,
    value.monthPeriodStart, value.monthReserved, value.monthSettled, value.monthVersion,
    value.monthCreatedAt, value.monthUpdatedAt];
}

function isActivePair(run: ResearchRunRecord, execution: SiteExecutionRecord): boolean {
  return execution.admissionState === "admitted" && execution.beganAt !== null
    && execution.executionExpiresAt === execution.beganAt + 1_260_000
    && ["researching", "validating"].includes(run.state)
    && run.activeExpiresAt === execution.executionExpiresAt;
}
function terminalRun(run: ResearchRunRecord, now: number, unsent: boolean): ResearchRunRecord {
  if (run.stateVersion >= MAX) throw unavailable();
  return Object.freeze({ ...run, state: "failed", stateVersion: run.stateVersion + 1,
    retryable: true, activeExpiresAt: null, packageId: null, quality: null, candidate: null,
    errorCode: "interrupted", failureCategory: unsent ? "service-unavailable" : "timeout", updatedAt: now });
}
function assertProof(proof: UnsentProof, execution: SiteExecutionRecord): void {
  if (proof.jobId !== execution.jobId || proof.requestHash !== execution.requestHash
    || proof.state !== "closed" || (proof.grant !== null && (
      proof.grant.protocol !== execution.job.protocol || proof.grant.jobId !== execution.jobId
      || proof.grant.requestHash !== execution.requestHash || proof.grant.beganAt !== execution.beganAt
      || proof.grant.executionExpiresAt !== execution.executionExpiresAt))) throw conflict();
}
function parseProof(value: unknown): UnsentProof {
  try {
    const parsed = proofSchema.parse(value);
    return Object.freeze({ ...parsed,
      grant: parsed.grant === null ? null : parseBridgeBeginGrant(parsed.grant) });
  } catch { throw unavailable(); }
}
function exactProof(left: UnsentProof | null, right: UnsentProof): boolean {
  return left !== null && canonicalJson(left) === canonicalJson(right);
}
function sameIdentity(value: SiteExecutionIdentity, expected: SiteExecutionIdentity): boolean {
  return value.ownerId === expected.ownerId && value.runId === expected.runId
    && value.requestId === expected.requestId && value.jobId === expected.jobId
    && value.requestHash === expected.requestHash;
}
function parseJson(value: string): unknown { try { return JSON.parse(value) as unknown; } catch { throw unavailable(); } }
async function canonicalHash(value: unknown): Promise<string> {
  try {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(value))));
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch { throw unavailable(); }
}
function assertOne(db: D1Database): D1PreparedStatement {
  return db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('') END AS site_expiry_assertion");
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T { try { return schema.parse(value); } catch { throw unavailable(); } }
function conflict() { return new ResearchRepositoryError("CONFLICT"); }
function unavailable() { return new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); }
async function storage<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) { if (error instanceof ResearchRepositoryError) throw error; throw unavailable(); }
}
