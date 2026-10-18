import { z } from "zod";
import { canonicalJson } from "../../lib/planning/fingerprint";
import { researchQuotaInvalidRowsSql, researchQuotaLedgerCte, researchQuotaLiveReservationSql } from "../entitlements/d1-research-quota-sql";
import { D1SiteImportRepository, parseSiteImportIdentity } from "./d1-site-import-repository";
import { D1ResearchBudgetRepository } from "./d1-budget-repository";
import { expiryMs, normalizedPackageInserts, parseStoredPackage, serialize } from "./d1-publication";
import type { ResearchRepository, ResearchRunRecord } from "./repository";
import { ResearchRepositoryError } from "./repository";
import type { SiteExecutionIdentity, SiteExecutionRecord, SiteExecutionRepository } from "./site-execution-repository";
import { siteReservedBudgetSql, siteSqlNow } from "./site-execution-sql";
import type { SiteImportPublication, SiteImportRecord, SiteImportResolution } from "./site-import-repository";
import { readBoundedResearchJson } from "./source-audit";
import { serializeSiteImportDecision } from "./site-import-validation";

type Row = Record<string, unknown>;
type Observation = { journal: SiteImportRecord; run: ResearchRunRecord; execution: SiteExecutionRecord;
  runQualityJson: string | null; runCandidateJson: string | null; packageRow: Row | null;
  dayBucketId: string | null; monthBucketId: string | null };
const unavailable = () => new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
const conflict = () => new ResearchRepositoryError("CONFLICT");
const assertOne = (db: D1Database) => db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('') END AS import_assertion");
const MAX = Number.MAX_SAFE_INTEGER;
const BUDGET_TIMESTAMP_MAX = 8_640_000_000_000_000;
/** Structural original-accounting proof; terminal statuses remain valid for late reconciliation.
 * Group independent conjunctions to stay within native D1's expression-depth limit. */
const originalAccountingSql = (dayBucketId: string, monthBucketId: string) => `
  (EXISTS(SELECT 1 FROM ledger_groups g WHERE g.reservation_id=e.quota_reservation_id
    AND g.reserved_user=e.user_id AND g.reserved_key=e.quota_key
    AND g.reserved_purpose='role-research' AND g.reserved_units=1
    AND g.reserved_count=1 AND g.terminal_count<=1)
  AND NOT ${researchQuotaInvalidRowsSql("e.user_id", "e.quota_key")}
  AND EXISTS(SELECT 1 FROM ai_budget_reservations b
    JOIN research_runs budget_run ON budget_run.id=b.run_id AND budget_run.user_id=e.user_id
      AND budget_run.request_id=b.request_id
    JOIN ai_budget_buckets day_bucket ON day_bucket.id=b.day_bucket_id
    JOIN ai_budget_buckets month_bucket ON month_bucket.id=b.month_bucket_id
    WHERE (b.id=e.budget_reservation_id AND b.run_id=e.run_id AND b.request_id=e.request_id
      AND b.day_bucket_id=${dayBucketId} AND b.month_bucket_id=${monthBucketId}
      AND b.maximum_reserved_micros=e.maximum_micros
      AND b.expires_at=e.reservation_expires_at
      AND b.status IN ('reserved','settled','released','conservative-hold'))
      AND (typeof(b.created_at)='integer' AND b.created_at BETWEEN e.created_at AND e.began_at
      AND typeof(b.updated_at)='integer' AND b.updated_at BETWEEN b.created_at AND ${BUDGET_TIMESTAMP_MAX}
      AND typeof(b.settled_micros)='integer' AND b.settled_micros BETWEEN 0 AND ${MAX}
      AND (b.status<>'reserved' OR b.settled_micros=0)
      AND (b.status NOT IN ('released','conservative-hold') OR b.settled_micros=0))
      AND (day_bucket.id<>month_bucket.id
      AND day_bucket.scope='site' AND day_bucket.period_kind='day'
      AND month_bucket.scope='site' AND month_bucket.period_kind='month'
      AND day_bucket.period_start=(b.created_at / 86400000) * 86400000
      AND month_bucket.period_start=CAST(strftime('%s',b.created_at / 1000,'unixepoch','start of month') AS INTEGER) * 1000)
      AND (typeof(day_bucket.created_at)='integer' AND day_bucket.created_at BETWEEN 0 AND ${BUDGET_TIMESTAMP_MAX}
      AND typeof(day_bucket.updated_at)='integer' AND day_bucket.updated_at BETWEEN 0 AND ${BUDGET_TIMESTAMP_MAX}
      AND typeof(month_bucket.created_at)='integer' AND month_bucket.created_at BETWEEN 0 AND ${BUDGET_TIMESTAMP_MAX}
      AND typeof(month_bucket.updated_at)='integer' AND month_bucket.updated_at BETWEEN 0 AND ${BUDGET_TIMESTAMP_MAX})
      AND (typeof(day_bucket.reserved_micros)='integer' AND day_bucket.reserved_micros BETWEEN 0 AND ${MAX}
      AND typeof(month_bucket.reserved_micros)='integer' AND month_bucket.reserved_micros BETWEEN 0 AND ${MAX}
      AND typeof(day_bucket.settled_micros)='integer' AND day_bucket.settled_micros BETWEEN 0 AND ${MAX}
      AND typeof(month_bucket.settled_micros)='integer' AND month_bucket.settled_micros BETWEEN 0 AND ${MAX}
      AND day_bucket.reserved_micros<=${MAX}-day_bucket.settled_micros
      AND month_bucket.reserved_micros<=${MAX}-month_bucket.settled_micros)
      AND (typeof(day_bucket.version)='integer' AND day_bucket.version BETWEEN 0 AND ${MAX}
      AND typeof(month_bucket.version)='integer' AND month_bucket.version BETWEEN 0 AND ${MAX}
      AND (b.status NOT IN ('reserved','conservative-hold') OR
        (day_bucket.reserved_micros>=b.maximum_reserved_micros
          AND month_bucket.reserved_micros>=b.maximum_reserved_micros)))))`;
async function canonicalHash(value: unknown): Promise<string> {
  try {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(value))));
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch { throw unavailable(); }
}
function parseHash(input: unknown): string {
  try { return z.string().length(64).regex(/^[0-9a-f]{64}$/u).parse(readBoundedResearchJson(input)); }
  catch { throw unavailable(); }
}

export class D1SiteImportPublication implements SiteImportPublication {
  private readonly imports: D1SiteImportRepository;
  private readonly budget: D1ResearchBudgetRepository;
  constructor(
    private readonly db: D1Database,
    runs: Pick<ResearchRepository, "getRun">,
    executions: Pick<SiteExecutionRepository, "read">,
  ) {
    this.imports = new D1SiteImportRepository(db, runs, executions);
    this.budget = new D1ResearchBudgetRepository(db);
  }

  async resolve(input: SiteExecutionIdentity, rawHash: string): Promise<SiteImportRecord> {
    const identity = parseSiteImportIdentity(input);
    const receiptHash = parseHash(rawHash);
    const observed = await this.observe(identity, receiptHash);
    if (observed.journal.phase >= 2) return this.replay(observed);
    const { journal, run, execution } = observed;
    if (journal.phase !== 1 || !journal.decision || journal.version >= Number.MAX_SAFE_INTEGER
      || run.stateVersion >= Number.MAX_SAFE_INTEGER && run.state !== "failed") throw unavailable();
    const now = await this.sqlTime();
    if (now < Math.max(run.updatedAt, journal.updatedAt, execution.beganAt!)) throw unavailable();
    const preserved = run.state === "failed";
    const expired = now >= execution.executionExpiresAt!;
    if (!preserved && !["researching", "validating"].includes(run.state)) throw unavailable();
    const decision = journal.decision;
    const state = preserved || expired ? "failed" : decision.kind;
    const terminal: ResearchRunRecord = preserved ? run : {
      ...run, state, stateVersion: run.stateVersion + 1,
      retryable: state === "needs-review" || state === "failed" && (expired || decision.kind === "failed" && decision.retryable),
      activeExpiresAt: null,
      packageId: state === "ready" && decision.kind === "ready" ? decision.package.id : null,
      quality: expired ? null : decision.quality,
      candidate: state === "needs-review" && decision.kind === "needs-review" ? decision.candidate : null,
      errorCode: state === "failed" ? expired ? "interrupted" : decision.kind === "failed" ? decision.errorCode : "invalid-result" : null,
      failureCategory: state === "failed" ? expired ? "timeout" : decision.kind === "failed" ? decision.failureCategory : "invalid-result" : null,
      updatedAt: now,
    };
    const resolution: SiteImportResolution = {
      state: terminal.state as SiteImportResolution["state"], runVersion: terminal.stateVersion,
      packageId: terminal.packageId, terminalHash: await canonicalHash(terminal),
      quotaStatus: terminal.state === "ready" ? "accepted" : terminal.state === "needs-review" ? "rejected" : "failed",
      resolvedAt: now,
    };
    let inserts: D1PreparedStatement[] = [];
    let existing: Row | null = null;
    if (!preserved && !expired && decision.kind === "ready") {
      const pack = decision.package;
      if (pack.id !== execution.validationContext.packageId
        || pack.observedAt !== execution.validationContext.observedAt
        || pack.expiresAt !== execution.validationContext.expiresAt
        || expiryMs(pack.expiresAt) <= now
        || canonicalJson(pack.qualityReport) !== canonicalJson(decision.quality)) throw unavailable();
      existing = await this.existingPackage(pack.id, run, pack.contentFingerprint);
      if (existing) {
        if (existing.id !== pack.id) throw conflict();
        const saved = parseStoredPackage(existing, { kind: "ignore-for-audit" });
        if (saved.id !== pack.id || canonicalJson(saved) !== canonicalJson(pack)
          || existing.normalized_role_key !== run.normalizedRoleKey
          || existing.locale !== run.locale || existing.config_fingerprint !== run.configFingerprint) throw conflict();
      } else {
        inserts = normalizedPackageInserts(pack, run, now, (sql, values) => {
          const guard = this.guard(observed, now, "live", true, values.length);
          // A statement-local proof keeps nested quota/budget checks below D1's depth limit.
          return this.db.prepare(`${researchQuotaLedgerCte}, publication_guard AS MATERIALIZED (${guard.sql})
            ${sql} WHERE EXISTS (SELECT 1 FROM publication_guard)`)
            .bind(...values, ...guard.values);
        });
      }
    }
    const success = !preserved && !expired && decision.kind !== "failed";
    const mode = preserved ? "failed" : expired ? "expired" : "live";
    const statements: D1PreparedStatement[] = [...inserts];
    if (!preserved) {
      const values: unknown[] = [terminal.state, terminal.stateVersion, terminal.retryable ? 1 : 0,
        terminal.packageId, terminal.quality === null ? null : serialize(terminal.quality, 16_384),
        terminal.candidate === null ? null : serialize(terminal.candidate, 1_048_576),
        terminal.errorCode, terminal.failureCategory, terminal.updatedAt, run.id, run.ownerId,
        run.requestId, run.stateVersion, run.state, execution.executionExpiresAt, run.updatedAt,
        run.createdAt, run.retryOfRunId, run.remoteQuotaKey, run.mutationId, run.inputFingerprint,
        run.rawRole, run.normalizedRoleKey, run.locale, run.configFingerprint,
        observed.runQualityJson, observed.runCandidateJson, run.packageId, run.retryable ? 1 : 0,
        run.errorCode, run.failureCategory];
      const guard = this.guard(observed, now, mode, success, values.length);
      const columns = ["id", "normalized_role_key", "locale", "config_fingerprint", "content_fingerprint",
        "package_json", "quality_json", "blueprint_id", "blueprint_version", "blueprint_version_id",
        "registry_id", "registry_version", "observed_at", "expires_at", "created_at"] as const;
      const existingValues = existing ? columns.map((column) => existing![column]) : [];
      const existingGuard = existing
        ? ` AND EXISTS(SELECT 1 FROM research_packages p WHERE ${columns.map((column, index) =>
          `p.${column}=?${values.length + guard.values.length + index + 1}`).join(" AND ")})` : "";
      const sql = `${researchQuotaLedgerCte}, publication_guard AS MATERIALIZED (${guard.sql})
        UPDATE research_runs AS r SET
        state=?1,state_version=?2,retryable=?3,active_slot=NULL,active_expires_at=NULL,
        package_id=?4,quality_json=?5,candidate_json=?6,error_code=?7,
        public_failure_category=?8,updated_at=?9
        WHERE (r.id=?10 AND r.user_id=?11 AND r.request_id=?12
        AND r.state_version=?13 AND r.state=?14 AND r.active_expires_at=?15
        AND r.updated_at=?16 AND r.created_at=?17 AND r.retry_of_run_id IS ?18)
        AND (r.remote_quota_key=?19 AND r.mutation_id=?20 AND r.input_fingerprint=?21
        AND r.raw_role=?22 AND r.normalized_role_key=?23 AND r.locale=?24
        AND r.config_fingerprint=?25 AND r.quality_json IS ?26)
        AND (r.candidate_json IS ?27 AND r.package_id IS ?28 AND r.retryable=?29
        AND r.error_code IS ?30 AND r.public_failure_category IS ?31)
        AND EXISTS (SELECT 1 FROM publication_guard)${existingGuard}`;
      statements.push(this.db.prepare(sql).bind(...values, ...guard.values, ...existingValues));
      statements.push(assertOne(this.db));
    }
    statements.push(this.journalUpdate(observed, terminal, resolution, now), assertOne(this.db));
    try { await this.db.batch(statements); } catch { /* Recover by read, never a second mutation batch. */ }
    const after = await this.observe(identity, receiptHash);
    if (after.journal.phase >= 2 && after.journal.decisionHash === journal.decisionHash)
      return this.replay(after);
    throw unavailable();
  }

  private async observe(identity: SiteExecutionIdentity, receiptHash: string): Promise<Observation> {
    try { return await this.readOnce(identity, receiptHash); }
    catch (error) {
      if (!(error instanceof ResearchRepositoryError) || error.code !== "RESEARCH_UNAVAILABLE") throw error;
      return this.readOnce(identity, receiptHash);
    }
  }

  private async readOnce(identity: SiteExecutionIdentity, receiptHash: string): Promise<Observation> {
    const context = await this.imports.readStrictImportContext(identity);
    const { run, execution, journal, runQualityJson, runCandidateJson } = context;
    if (!journal) throw unavailable();
    if (journal.metadata.receiptHash !== receiptHash) throw conflict();
    if (execution.executionExpiresAt === null || execution.beganAt === null
      || execution.executionExpiresAt !== execution.beganAt + 1_260_000) throw unavailable();
    let dayBucketId: string | null = null;
    let monthBucketId: string | null = null;
    if (journal.phase === 1) {
      let accounting: Row | null;
      try {
        if (execution.budgetReservationId === null) throw unavailable();
        const reservation = await this.budget.readReservation(identity.ownerId, execution.budgetReservationId);
        if (!reservation) throw unavailable();
        dayBucketId = reservation.dayBucketId;
        monthBucketId = reservation.monthBucketId;
        accounting = await this.db.prepare(`${researchQuotaLedgerCte}
          SELECT 1 AS ok FROM research_site_executions e
          WHERE e.run_id=?1 AND e.user_id=?2 AND e.request_id=?3
            AND e.job_id=?4 AND e.request_hash=?5
            AND e.quota_reservation_id=?6 AND e.budget_reservation_id=?7
            AND ${originalAccountingSql("?8", "?9")} LIMIT 1`)
          .bind(identity.runId, identity.ownerId, identity.requestId,
            identity.jobId, identity.requestHash, execution.quotaReservationId,
            execution.budgetReservationId, dayBucketId, monthBucketId).first<Row>();
      } catch { throw unavailable(); }
      if (!accounting) throw unavailable();
    }
    let packageRow: Row | null = null;
    if (run.state === "ready") {
      try {
        packageRow = await this.db.prepare("SELECT * FROM research_packages WHERE id=?1 LIMIT 1")
          .bind(run.packageId).first<Row>();
      } catch { throw unavailable(); }
      if (!packageRow) throw unavailable();
      const pack = parseStoredPackage(packageRow, { kind: "ignore-for-audit" });
      if (pack.id !== journal.validationContext.packageId
        || packageRow.normalized_role_key !== run.normalizedRoleKey
        || packageRow.locale !== run.locale
        || packageRow.config_fingerprint !== run.configFingerprint
        || pack.observedAt !== journal.validationContext.observedAt
        || pack.expiresAt !== journal.validationContext.expiresAt
        || pack.promptVersion !== journal.validationContext.promptVersion
        || pack.inputSchemaVersion !== journal.validationContext.inputSchemaVersion
        || pack.outputSchemaVersion !== journal.validationContext.outputSchemaVersion
        || canonicalJson(pack.qualityReport) !== canonicalJson(run.quality)
        || await canonicalHash({ kind: "ready", package: pack, quality: run.quality })
          !== journal.decisionHash) throw unavailable();
    }
    if (run.state === "needs-review"
      && await canonicalHash({ kind: "needs-review", quality: run.quality,
        candidate: run.candidate }) !== journal.decisionHash) throw unavailable();
    return { run, execution, journal, runQualityJson, runCandidateJson, packageRow,
      dayBucketId, monthBucketId };
  }

  private async replay(observed: Observation): Promise<SiteImportRecord> {
    const { journal, run } = observed;
    if (!journal.resolution || journal.resolution.state !== run.state
      || journal.resolution.runVersion !== run.stateVersion
      || journal.resolution.packageId !== run.packageId
      || journal.resolution.terminalHash !== await canonicalHash(run)) throw unavailable();
    return journal;
  }

  private async sqlTime(): Promise<number> {
    try {
      const row = await this.db.prepare(`SELECT ${siteSqlNow} AS now`).first<{ now: unknown }>();
      return z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).parse(row?.now);
    } catch { throw unavailable(); }
  }

  private async existingPackage(id: string, run: ResearchRunRecord, fingerprint: string): Promise<Row | null> {
    try {
      const rows = await this.db.prepare(`SELECT * FROM research_packages WHERE id=?1 OR
        (normalized_role_key=?2 AND locale=?3 AND config_fingerprint=?4 AND content_fingerprint=?5)`)
        .bind(id, run.normalizedRoleKey, run.locale, run.configFingerprint, fingerprint).all<Row>();
      if (rows.results.length > 1) throw conflict();
      return rows.results[0] ?? null;
    } catch (error) { if (error instanceof ResearchRepositoryError) throw error; throw unavailable(); }
  }

  private guard(observed: Observation, observation: number,
    mode: "live" | "expired" | "failed", success: boolean, offset: number) {
    const { run, execution, journal, dayBucketId, monthBucketId } = observed;
    if (dayBucketId === null || monthBucketId === null) throw unavailable();
    const values: unknown[] = [run.id, run.ownerId, run.requestId, execution.jobId,
      execution.requestHash, run.stateVersion, execution.version, canonicalJson(execution.validationContext),
      canonicalJson(execution.job), execution.quotaReservationId, execution.budgetReservationId,
      journal.version, journal.metadata.receiptHash, journal.decisionHash, observation,
      execution.beganAt, execution.executionExpiresAt, run.configFingerprint,
      success && journal.decision?.kind === "ready" ? expiryMs(journal.decision.package.expiresAt) : null,
      dayBucketId, monthBucketId];
    const p = (index: number) => `?${offset + index}`;
    const sql = `SELECT 1 FROM research_site_executions e
      JOIN research_runs r ON r.id=e.run_id AND r.user_id=e.user_id AND r.request_id=e.request_id
      JOIN research_site_imports j ON j.run_id=e.run_id AND j.user_id=e.user_id
      WHERE (r.id=${p(1)} AND r.user_id=${p(2)} AND r.request_id=${p(3)}
      AND r.execution_mode='cloudflare-workflow-v1' AND r.remote_quota_key=e.quota_key
      AND e.job_id=${p(4)} AND e.request_hash=${p(5)} AND r.state_version=${p(6)})
      AND (e.version=${p(7)} AND e.validation_context_json=${p(8)} AND e.job_json=${p(9)}
      AND e.quota_reservation_id=${p(10)} AND e.budget_reservation_id=${p(11)}
      AND e.admission_state='admitted' AND e.closed_at IS NULL AND e.close_reason IS NULL)
      AND (e.began_at=${p(16)} AND e.execution_expires_at=${p(17)}
      AND e.execution_expires_at=e.began_at+1260000
      AND r.config_fingerprint=${p(18)} AND r.input_fingerprint=json_extract(e.job_json,'$.inputFingerprint')
      AND r.raw_role=json_extract(e.job_json,'$.role') AND r.locale=json_extract(e.job_json,'$.locale'))
      AND (j.request_id=e.request_id AND j.job_id=e.job_id AND j.request_hash=e.request_hash
      AND j.config_fingerprint=r.config_fingerprint AND j.validation_context_json=e.validation_context_json
      AND j.execution_version=e.version AND j.phase=1 AND j.version=${p(12)})
      AND (j.receipt_hash=${p(13)} AND j.decision_hash=${p(14)} AND j.decision_json IS NOT NULL
      AND ${siteSqlNow}>=${p(15)} AND ${siteSqlNow}>=e.began_at
      AND (${p(19)} IS NULL OR ${siteSqlNow}<${p(19)}))
      AND ${originalAccountingSql(p(20), p(21))}
      AND (${mode === "failed" ? "r.state='failed' AND r.active_slot IS NULL AND r.active_expires_at IS NULL"
        : `r.state IN ('researching','validating') AND r.active_slot=1
          AND r.active_expires_at=e.execution_expires_at AND r.state_version<9007199254740991
          AND ${siteSqlNow}${mode === "expired" ? ">=" : "<"}e.execution_expires_at`})
      ${success ? `AND ${researchQuotaLiveReservationSql("e.user_id", "e.quota_key", "e.quota_reservation_id")}
        AND ${siteReservedBudgetSql("e", "e.budget_reservation_id")}` : ""}`;
    return { sql, values };
  }

  private journalUpdate(observed: Observation, terminal: ResearchRunRecord,
    resolution: SiteImportResolution, observation: number): D1PreparedStatement {
    const { journal, run, execution, dayBucketId, monthBucketId } = observed;
    if (dayBucketId === null || monthBucketId === null) throw unavailable();
    const values: unknown[] = [canonicalJson(resolution), journal.runId, journal.ownerId,
      journal.requestId, journal.jobId, journal.requestHash, journal.metadata.receiptHash,
      journal.configFingerprint, canonicalJson(journal.validationContext), journal.executionVersion,
      journal.decisionHash, journal.version, observation, terminal.state, terminal.stateVersion,
      terminal.packageId, terminal.retryable ? 1 : 0, terminal.updatedAt,
      terminal.quality === null ? null : terminal === run ? observed.runQualityJson : serialize(terminal.quality, 16_384),
      terminal.candidate === null ? null : terminal === run ? observed.runCandidateJson : serialize(terminal.candidate, 1_048_576),
      terminal.errorCode, terminal.failureCategory, run.mutationId, run.inputFingerprint,
      run.rawRole, run.normalizedRoleKey, run.locale, run.configFingerprint,
      execution.quotaReservationId, execution.budgetReservationId, execution.beganAt,
      execution.executionExpiresAt, run.createdAt, run.retryOfRunId, run.remoteQuotaKey,
      canonicalJson(execution.job), canonicalJson(journal.metadata), canonicalJson(journal.audit),
      canonicalJson(journal.settlement),
      journal.decision === null ? null : serializeSiteImportDecision(journal.decision, journal.validationContext),
      journal.mode, journal.createdAt, journal.updatedAt, dayBucketId, monthBucketId];
    const sql = `${researchQuotaLedgerCte} UPDATE research_site_imports AS j SET phase=2,version=j.version+1,
      resolution_json=?1,updated_at=${siteSqlNow}
      WHERE (j.run_id=?2 AND j.user_id=?3 AND j.request_id=?4 AND j.job_id=?5
      AND j.request_hash=?6 AND j.receipt_hash=?7 AND j.config_fingerprint=?8
      AND j.validation_context_json=?9 AND j.execution_version=?10)
      AND (j.decision_hash=?11 AND j.phase=1 AND j.version=?12
      AND j.version<9007199254740991 AND j.decision_json IS NOT NULL
      AND ${siteSqlNow}>=?13 AND ${siteSqlNow}>=j.updated_at)
      AND EXISTS(SELECT 1 FROM research_runs r JOIN research_site_executions e
        ON e.run_id=r.id AND e.user_id=r.user_id AND e.request_id=r.request_id
        WHERE (r.id=j.run_id AND r.user_id=j.user_id AND r.request_id=j.request_id
        AND r.state=?14 AND r.state_version=?15 AND r.package_id IS ?16 AND r.retryable=?17
        AND r.active_slot IS NULL AND r.active_expires_at IS NULL AND r.updated_at=?18)
        AND (r.quality_json IS ?19 AND r.candidate_json IS ?20
        AND r.error_code IS ?21 AND r.public_failure_category IS ?22
        AND r.mutation_id=?23 AND r.input_fingerprint=?24 AND r.raw_role=?25
        AND r.normalized_role_key=?26 AND r.locale=?27 AND r.config_fingerprint=?28)
        AND (r.execution_mode='cloudflare-workflow-v1' AND r.remote_quota_key=e.quota_key
        AND e.quota_reservation_id=?29 AND e.budget_reservation_id=?30
        AND e.began_at=?31 AND e.execution_expires_at=?32
        AND e.execution_expires_at=e.began_at+1260000
        AND e.version=j.execution_version AND e.validation_context_json=j.validation_context_json
        AND e.job_id=j.job_id AND e.request_hash=j.request_hash)
        AND (e.admission_state='admitted' AND e.closed_at IS NULL AND e.close_reason IS NULL
        AND r.created_at=?33 AND r.retry_of_run_id IS ?34 AND r.remote_quota_key=?35
        AND e.job_json=?36 AND ${siteSqlNow}>=e.began_at)
        AND ${originalAccountingSql("?44", "?45")})
      AND (j.receipt_metadata_json=?37 AND j.audit_json=?38 AND j.settlement_json=?39
      AND j.decision_json=?40 AND j.mode=?41 AND j.created_at=?42 AND j.updated_at=?43)`;
    return this.db.prepare(sql).bind(...values);
  }
}
