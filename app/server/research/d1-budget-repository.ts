import { z } from "zod";
import { ResearchBudgetError, type ResearchBudgetRepository, type RemoteResearchBudgetRepository, type BudgetReserveCommand, type RemoteBudgetReserveCommand, type RemoteBudgetReleaseBeforeBeginCommand, type BudgetDecision, type BudgetReservation, type BudgetSettlement, type BudgetBucket } from "./budget";
import { siteOpenAdmissionSql } from "./d1-site-execution-repository";
import { readBoundedResearchJson } from "./source-audit";

const MAX = Number.MAX_SAFE_INTEGER;
const integer = z.number().int().nonnegative().max(MAX);
const timestamp = integer.max(8_640_000_000_000_000);
const identifier = z.string().min(1).max(160).refine((value) => value.trim() === value);
const commandSchema = z.object({ ownerId: identifier, runId: identifier, requestId: identifier, maximumMicros: integer, dailyBudgetMicros: integer, monthlyBudgetMicros: integer, expiresAt: timestamp }).strict();
const remoteCommandSchema = commandSchema.extend({
  jobId: z.uuid(),
  requestHash: z.string().length(64).regex(/^[0-9a-f]{64}$/u),
  maximumMicros: integer.min(1).max(5_000_000),
  dailyBudgetMicros: integer.min(1),
  monthlyBudgetMicros: integer.min(1),
}).strict();
const remoteReleaseCommandSchema = z.object({
  ownerId: identifier,
  runId: identifier,
  requestId: identifier,
  jobId: z.uuid(),
  requestHash: z.string().length(64).regex(/^[0-9a-f]{64}$/u),
  reservationId: identifier,
}).strict();
const settlementSchema = z.discriminatedUnion("kind", [z.object({ kind: z.literal("actual"), actualMicros: integer }).strict(), z.object({ kind: z.literal("not-charged") }).strict(), z.object({ kind: z.literal("unknown") }).strict()]);
const bucketSchema = z.object({ id: identifier, scope: z.literal("site"), period_kind: z.enum(["day", "month"]), period_start: timestamp, reserved_micros: integer, settled_micros: integer, version: integer, created_at: timestamp, updated_at: timestamp });
const reservationSchema = z.object({ id: identifier, request_id: identifier, run_id: identifier, day_bucket_id: identifier, month_bucket_id: identifier, maximum_reserved_micros: integer, settled_micros: integer, status: z.enum(["reserved", "settled", "conservative-hold", "released"]), expires_at: timestamp, created_at: timestamp, updated_at: timestamp, owner_id: identifier, run_request_id: identifier });
const releaseContextSchema = z.object({
  execution_request_id: identifier,
  execution_job_id: z.uuid(),
  execution_request_hash: z.string().length(64).regex(/^[0-9a-f]{64}$/u),
  execution_quota_key: z.string().min(8).max(128),
  execution_maximum_micros: integer.min(1).max(5_000_000),
  execution_reservation_expires_at: timestamp,
  admission_state: z.enum(["pending", "admitted", "closed"]),
  budget_reservation_id: identifier.nullable(),
  closed_at: timestamp.nullable(),
  close_reason: z.enum(["cached", "denied", "expired", "interrupted"]).nullable(),
  began_at: timestamp.nullable(),
  run_request_id: identifier,
  execution_mode: z.enum(["synchronous", "cloudflare-workflow-v1"]),
  remote_quota_key: z.string().min(8).max(128).nullable(),
  run_state: z.enum(["queued", "researching", "validating", "ready", "needs-review", "failed"]),
  retryable: z.union([z.literal(0), z.literal(1)]),
  active_slot: z.union([z.literal(1), z.null()]),
  active_expires_at: timestamp.nullable(),
  error_code: identifier.nullable(),
  public_failure_category: z.enum(["timeout", "rate-limited", "allowance-reached", "service-unavailable", "content-rejected", "invalid-result", "internal"]).nullable(),
}).strict();
const reservationSelect = "SELECT r.*, u.user_id AS owner_id, u.request_id AS run_request_id FROM ai_budget_reservations r JOIN research_runs u ON u.id=r.run_id";
const sqlNow = "CAST(ROUND(unixepoch('subsec') * 1000) AS INTEGER)";

function unavailable(): never { throw new ResearchBudgetError("BUDGET_UNAVAILABLE"); }
async function guarded<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) { if (error instanceof ResearchBudgetError) throw error; return unavailable(); }
}
function parse<T>(schema: z.ZodType<T>, input: unknown): T { const result = schema.safeParse(input); return result.success ? result.data : unavailable(); }
function periods(now: number) {
  const date = new Date(now);
  return { day: Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()), month: Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) };
}
function periodEnds(period: { day: number; month: number }) {
  const month = new Date(period.month);
  return { day: period.day + 86_400_000, month: Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1) };
}
function mapBucket(input: unknown): BudgetBucket {
  const row = parse(bucketSchema, input);
  if (row.period_start % 86_400_000 !== 0 || (row.period_kind === "month" && new Date(row.period_start).getUTCDate() !== 1) || !Number.isSafeInteger(row.reserved_micros + row.settled_micros)) unavailable();
  return { id: row.id, scope: row.scope, periodKind: row.period_kind, periodStart: row.period_start, reservedMicros: row.reserved_micros, settledMicros: row.settled_micros, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at };
}
function mapReservation(input: unknown): BudgetReservation {
  const row = parse(reservationSchema, input);
  if (row.request_id !== row.run_request_id || row.day_bucket_id === row.month_bucket_id || (row.status !== "settled" && row.settled_micros !== 0)) unavailable();
  return { id: row.id, ownerId: row.owner_id, runId: row.run_id, requestId: row.request_id, dayBucketId: row.day_bucket_id, monthBucketId: row.month_bucket_id, maximumMicros: row.maximum_reserved_micros, settledMicros: row.settled_micros, status: row.status, expiresAt: row.expires_at, createdAt: row.created_at, updatedAt: row.updated_at };
}

/** Internal currency accounting only. Owners and run/request IDs come from trusted orchestration. */
export class D1ResearchBudgetRepository implements ResearchBudgetRepository, RemoteResearchBudgetRepository {
  private readonly options: { now: () => number; createId: () => string };
  constructor(private readonly db: D1Database, options: { now?: () => number; createId?: () => string } = {}) { this.options = { now: () => Date.now(), createId: () => crypto.randomUUID(), ...options }; }

  readReservation(ownerId: string, id: string): Promise<BudgetReservation | null> {
    return guarded(async () => {
      parse(identifier, ownerId); parse(identifier, id);
      const row = await this.db.prepare(`${reservationSelect} WHERE r.id=?1 AND u.user_id=?2`).bind(id, ownerId).first();
      return row ? mapReservation(row) : null;
    });
  }
  findReservation(ownerId: string, runId: string, requestId: string): Promise<BudgetReservation | null> {
    return guarded(async () => {
      parse(identifier, ownerId); parse(identifier, runId); parse(identifier, requestId);
      const row = await this.db.prepare(`${reservationSelect} WHERE u.user_id=?1 AND r.run_id=?2 AND r.request_id=?3`).bind(ownerId, runId, requestId).first();
      return row ? mapReservation(row) : null;
    });
  }
  readBucket(id: string): Promise<BudgetBucket | null> {
    return guarded(async () => { parse(identifier, id); const row = await this.db.prepare("SELECT * FROM ai_budget_buckets WHERE id=?1").bind(id).first(); return row ? mapBucket(row) : null; });
  }
  private async byRequest(ownerId: string, requestId: string) {
    const row = await this.db.prepare(`${reservationSelect} WHERE r.request_id=?1 AND u.user_id=?2`).bind(requestId, ownerId).first();
    if (row) return mapReservation(row);
    // A globally unique request collision is a conflict, never a foreign record.
    if (await this.db.prepare("SELECT 1 FROM ai_budget_reservations WHERE request_id=?1").bind(requestId).first()) throw new ResearchBudgetError("CONFLICT");
    return null;
  }
  private replay(reservation: BudgetReservation, command: BudgetReserveCommand): BudgetDecision {
    if (reservation.ownerId !== command.ownerId || reservation.runId !== command.runId || reservation.maximumMicros !== command.maximumMicros) throw new ResearchBudgetError("CONFLICT");
    return { allowed: true, reservation, replayed: true, providerAttemptAllowed: false };
  }
  private async assertSynchronousRun(command: BudgetReserveCommand): Promise<void> {
    const run = await this.db.prepare("SELECT 1 FROM research_runs WHERE id=?1 AND user_id=?2 AND request_id=?3 AND execution_mode='synchronous' AND remote_quota_key IS NULL")
      .bind(command.runId, command.ownerId, command.requestId).first();
    if (!run) throw new ResearchBudgetError("CONFLICT");
  }
  private async assertRun(command: BudgetReserveCommand, now: number) {
    const run = await this.db.prepare("SELECT user_id,request_id,state,active_slot,active_expires_at,execution_mode,remote_quota_key FROM research_runs WHERE id=?1 AND user_id=?2").bind(command.runId, command.ownerId).first<{ user_id: string; request_id: string; state: string; active_slot: number | null; active_expires_at: number | null; execution_mode: string; remote_quota_key: string | null }>();
    if (!run || run.user_id !== command.ownerId || run.request_id !== command.requestId || run.execution_mode !== "synchronous" || run.remote_quota_key !== null || run.state !== "queued" || run.active_slot !== 1 || !Number.isSafeInteger(run.active_expires_at) || run.active_expires_at! <= now || command.expiresAt <= now) throw new ResearchBudgetError("CONFLICT");
  }

  reserve(input: BudgetReserveCommand): Promise<BudgetDecision> {
    return guarded(async () => {
      const command = parse(commandSchema, input); const now = parse(timestamp, this.options.now());
      const existing = await this.byRequest(command.ownerId, command.requestId);
      if (existing) { await this.assertSynchronousRun(command); return this.replay(existing, command); }
      await this.assertRun(command, now);
      const period = periods(now);
      for (const [kind, start] of Object.entries(period)) {
        const row = await this.db.prepare("SELECT * FROM ai_budget_buckets WHERE scope='site' AND period_kind=?1 AND period_start=?2").bind(kind, start).first();
        if (row && mapBucket(row).version === MAX) unavailable();
      }
      const id = parse(identifier, this.options.createId());
      const createBucket = (kind: string, start: number) => this.db.prepare(`INSERT INTO ai_budget_buckets(id,scope,period_kind,period_start,reserved_micros,settled_micros,version,created_at,updated_at) VALUES(?1,'site',?2,?3,0,0,0,?4,?4) ON CONFLICT(scope,period_kind,period_start) DO NOTHING`).bind(parse(identifier, this.options.createId()), kind, start, now);
      const insert = this.db.prepare(`
        INSERT INTO ai_budget_reservations(id,request_id,run_id,day_bucket_id,month_bucket_id,maximum_reserved_micros,settled_micros,status,expires_at,created_at,updated_at)
        SELECT ?1,?2,?3,d.id,m.id,?4,0,'reserved',?5,?6,?6
        FROM ai_budget_buckets d JOIN ai_budget_buckets m ON m.scope=d.scope
        WHERE d.scope='site' AND d.period_kind='day' AND d.period_start=?7 AND m.period_kind='month' AND m.period_start=?8
          AND d.reserved_micros <= ?9-d.settled_micros-?4 AND m.reserved_micros <= ?10-m.settled_micros-?4
          AND d.version < ${MAX} AND m.version < ${MAX}
          AND EXISTS(SELECT 1 FROM research_runs WHERE id=?3 AND request_id=?2 AND user_id=?11 AND execution_mode='synchronous' AND remote_quota_key IS NULL AND state='queued' AND active_slot=1 AND active_expires_at>?6)
        ON CONFLICT(request_id) DO NOTHING
      `).bind(id, command.requestId, command.runId, command.maximumMicros, command.expiresAt, now, period.day, period.month, command.dailyBudgetMicros, command.monthlyBudgetMicros, command.ownerId);
      // changes() is local to the preceding statement in this atomic batch. The
      // unique request INSERT, not predicted balances or versions, owns admission.
      const increment = (column: "day_bucket_id" | "month_bucket_id") => this.db.prepare(`UPDATE ai_budget_buckets SET reserved_micros=reserved_micros+?1,version=version+1,updated_at=?2 WHERE id=(SELECT ${column} FROM ai_budget_reservations WHERE id=?3) AND changes()=1`).bind(command.maximumMicros, now, id);
      const result = await this.db.batch([createBucket("day", period.day), createBucket("month", period.month), insert, increment("day_bucket_id"), increment("month_bucket_id")]);
      const saved = await this.byRequest(command.ownerId, command.requestId);
      if (!saved) { await this.assertRun(command, now); return { allowed: false, reason: "budget" }; }
      await this.assertSynchronousRun(command);
      const replay = this.replay(saved, command);
      if (result[2]?.meta.changes !== 1) return replay;
      if (result[3]?.meta.changes !== 1 || result[4]?.meta.changes !== 1 || saved.id !== id) unavailable();
      return { allowed: true, reservation: saved, replayed: false, providerAttemptAllowed: saved.status === "reserved" };
    });
  }

  reserveRemote(input: RemoteBudgetReserveCommand): Promise<BudgetDecision> {
    return guarded(async () => {
      const command = parse(remoteCommandSchema, readBoundedResearchJson(input));
      const now = parse(timestamp, this.options.now());
      const period = periods(now); const ends = periodEnds(period);
      const existing = await this.byRequest(command.ownerId, command.requestId);
      if (existing) return this.replayRemote(existing, command);
      await this.assertRemoteContext(command);
      for (const [kind, start] of Object.entries(period)) {
        const row = await this.db.prepare("SELECT * FROM ai_budget_buckets WHERE scope='site' AND period_kind=?1 AND period_start=?2").bind(kind, start).first();
        if (row && mapBucket(row).version === MAX) unavailable();
      }

      const id = parse(identifier, this.options.createId());
      const open = siteOpenAdmissionSql({ ownerSql: "?4", runSql: "?5", requestSql: "?6", jobSql: "?7", hashSql: "?8" });
      const createBucket = (kind: "day" | "month", start: number, end: number) => this.db.prepare(`
        INSERT INTO ai_budget_buckets(id,scope,period_kind,period_start,reserved_micros,settled_micros,version,created_at,updated_at)
        SELECT ?1,'site',?2,?3,0,0,0,${sqlNow},${sqlNow}
        FROM research_site_executions e
        WHERE e.user_id=?4 AND e.run_id=?5 AND e.request_id=?6 AND e.job_id=?7 AND e.request_hash=?8
          AND e.daily_budget_micros=?9 AND e.monthly_budget_micros=?10 AND e.maximum_micros=?11
          AND e.reservation_expires_at=?12 AND ${sqlNow}<?12
          AND ${sqlNow}>=?3 AND ${sqlNow}<?13
          AND ${open}
        ON CONFLICT(scope,period_kind,period_start) DO NOTHING
      `).bind(parse(identifier, this.options.createId()), kind, start, command.ownerId, command.runId, command.requestId, command.jobId, command.requestHash, command.dailyBudgetMicros, command.monthlyBudgetMicros, command.maximumMicros, command.expiresAt, end);
      const insertOpen = siteOpenAdmissionSql({ ownerSql: "?10", runSql: "?3", requestSql: "?2", jobSql: "?11", hashSql: "?12" });
      const insert = this.db.prepare(`
        INSERT INTO ai_budget_reservations(id,request_id,run_id,day_bucket_id,month_bucket_id,maximum_reserved_micros,settled_micros,status,expires_at,created_at,updated_at)
        SELECT ?1,?2,?3,d.id,m.id,?4,0,'reserved',?5,${sqlNow},${sqlNow}
        FROM ai_budget_buckets d JOIN ai_budget_buckets m ON m.scope=d.scope
        JOIN research_site_executions e ON e.run_id=?3 AND e.user_id=?10 AND e.request_id=?2
        WHERE d.scope='site' AND d.period_kind='day' AND d.period_start=?6 AND m.period_kind='month' AND m.period_start=?7
          AND d.reserved_micros <= ?8-d.settled_micros-?4 AND m.reserved_micros <= ?9-m.settled_micros-?4
          AND d.version < ${MAX} AND m.version < ${MAX}
          AND e.job_id=?11 AND e.request_hash=?12
          AND e.daily_budget_micros=?8 AND e.monthly_budget_micros=?9 AND e.maximum_micros=?4
          AND e.reservation_expires_at=?5 AND ${sqlNow}<?5
          AND ${sqlNow}>=?6 AND ${sqlNow}<?13 AND ${sqlNow}>=?7 AND ${sqlNow}<?14
          AND ${insertOpen}
        ON CONFLICT(request_id) DO NOTHING
      `).bind(id, command.requestId, command.runId, command.maximumMicros, command.expiresAt, period.day, period.month, command.dailyBudgetMicros, command.monthlyBudgetMicros, command.ownerId, command.jobId, command.requestHash, ends.day, ends.month);
      const increment = (column: "day_bucket_id" | "month_bucket_id") => this.db.prepare(`UPDATE ai_budget_buckets SET reserved_micros=reserved_micros+?1,version=version+1,updated_at=${sqlNow} WHERE id=(SELECT ${column} FROM ai_budget_reservations WHERE id=?2) AND changes()=1`).bind(command.maximumMicros, id);
      const assertion = this.db.prepare("SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM ai_budget_reservations WHERE id=?1) OR changes()=1 THEN 1 ELSE json('') END AS lifecycle_assertion").bind(id);
      const result = await this.db.batch([
        createBucket("day", period.day, ends.day),
        createBucket("month", period.month, ends.month),
        insert,
        increment("day_bucket_id"),
        increment("month_bucket_id"),
        assertion,
      ]);
      const saved = await this.byRequest(command.ownerId, command.requestId);
      if (!saved) return { allowed: false, reason: "budget" };
      const replay = await this.replayRemote(saved, command);
      if (result[2]?.meta.changes !== 1) return replay;
      if (result[3]?.meta.changes !== 1 || result[4]?.meta.changes !== 1 || saved.id !== id) unavailable();
      return { allowed: true, reservation: saved, replayed: false, providerAttemptAllowed: saved.status === "reserved" };
    });
  }

  private async assertRemoteContext(command: RemoteBudgetReserveCommand): Promise<void> {
    const row = await this.db.prepare(`SELECT 1 FROM research_site_executions e
      JOIN research_runs r ON r.id=e.run_id AND r.user_id=e.user_id AND r.request_id=e.request_id
      WHERE e.user_id=?1 AND e.run_id=?2 AND e.request_id=?3 AND e.job_id=?4 AND e.request_hash=?5
        AND e.daily_budget_micros=?6 AND e.monthly_budget_micros=?7 AND e.maximum_micros=?8
        AND e.reservation_expires_at=?9
        AND r.execution_mode='cloudflare-workflow-v1' AND r.remote_quota_key=e.quota_key
      LIMIT 1`).bind(command.ownerId, command.runId, command.requestId, command.jobId, command.requestHash, command.dailyBudgetMicros, command.monthlyBudgetMicros, command.maximumMicros, command.expiresAt).first();
    if (!row) throw new ResearchBudgetError("CONFLICT");
  }

  private async replayRemote(reservation: BudgetReservation, command: RemoteBudgetReserveCommand): Promise<BudgetDecision> {
    if (reservation.ownerId !== command.ownerId || reservation.runId !== command.runId || reservation.requestId !== command.requestId
      || reservation.maximumMicros !== command.maximumMicros || reservation.expiresAt !== command.expiresAt) throw new ResearchBudgetError("CONFLICT");
    await this.assertRemoteContext(command);
    return { allowed: true, reservation, replayed: true, providerAttemptAllowed: false };
  }

  releaseRemoteBeforeBegin(input: RemoteBudgetReleaseBeforeBeginCommand): Promise<BudgetReservation> {
    return guarded(async () => {
      const command = parse(remoteReleaseCommandSchema, readBoundedResearchJson(input));
      const before = await this.readRemoteReleaseState(command);
      if (before.reservation.status === "released") return before.reservation;
      if (before.reservation.status !== "reserved") throw new ResearchBudgetError("CONFLICT");
      for (const bucket of [before.day, before.month]) {
        if (bucket.reservedMicros < before.reservation.maximumMicros || bucket.version === MAX) unavailable();
      }

      const transition = this.db.prepare(`UPDATE ai_budget_reservations AS release_reservation
        SET status='released',settled_micros=0,updated_at=${sqlNow}
        WHERE release_reservation.id=?1 AND release_reservation.run_id=?2 AND release_reservation.request_id=?3
          AND release_reservation.status='reserved' AND release_reservation.settled_micros=0
          AND EXISTS(
            SELECT 1 FROM research_site_executions e
            JOIN research_runs r ON r.id=e.run_id AND r.user_id=e.user_id
            WHERE e.run_id=?2 AND e.request_id=?3 AND e.user_id=?4
              AND e.job_id=?5 AND e.request_hash=?6
              AND r.request_id=e.request_id AND r.execution_mode='cloudflare-workflow-v1'
              AND r.remote_quota_key=e.quota_key
              AND e.admission_state='closed' AND e.closed_at IS NOT NULL
              AND e.began_at IS NULL AND e.close_reason IN ('denied','expired','interrupted')
              AND r.state='failed' AND r.retryable=1
              AND r.active_slot IS NULL AND r.active_expires_at IS NULL
              AND release_reservation.maximum_reserved_micros=e.maximum_micros
              AND release_reservation.expires_at=e.reservation_expires_at
              AND (e.budget_reservation_id IS NULL OR e.budget_reservation_id=?1)
          )
          AND EXISTS(
            SELECT 1 FROM ai_budget_buckets day_bucket
            JOIN ai_budget_buckets month_bucket ON month_bucket.id=release_reservation.month_bucket_id
            WHERE day_bucket.id=release_reservation.day_bucket_id
              AND day_bucket.id<>month_bucket.id
              AND day_bucket.scope='site' AND day_bucket.period_kind='day' AND day_bucket.period_start=?7
              AND month_bucket.scope='site' AND month_bucket.period_kind='month' AND month_bucket.period_start=?8
              AND day_bucket.reserved_micros>=release_reservation.maximum_reserved_micros
              AND month_bucket.reserved_micros>=release_reservation.maximum_reserved_micros
              AND day_bucket.reserved_micros<=${MAX}-day_bucket.settled_micros
              AND month_bucket.reserved_micros<=${MAX}-month_bucket.settled_micros
              AND day_bucket.version<${MAX} AND month_bucket.version<${MAX}
          )`).bind(
        command.reservationId,
        command.runId,
        command.requestId,
        command.ownerId,
        command.jobId,
        command.requestHash,
        before.day.periodStart,
        before.month.periodStart,
      );
      const decrement = (bucket: BudgetBucket, column: "day_bucket_id" | "month_bucket_id") => this.db.prepare(`
        UPDATE ai_budget_buckets
        SET reserved_micros=reserved_micros-(SELECT maximum_reserved_micros FROM ai_budget_reservations WHERE id=?1),
          version=version+1,updated_at=${sqlNow}
        WHERE id=?2 AND id=(SELECT ${column} FROM ai_budget_reservations WHERE id=?1)
          AND changes()=1
          AND EXISTS(SELECT 1 FROM ai_budget_reservations
            WHERE id=?1 AND run_id=?3 AND request_id=?4 AND status='released' AND settled_micros=0)
          AND reserved_micros>=(SELECT maximum_reserved_micros FROM ai_budget_reservations WHERE id=?1)
          AND reserved_micros<=${MAX}-settled_micros AND version<${MAX}
      `).bind(command.reservationId, bucket.id, command.runId, command.requestId);
      const assertion = this.db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('') END AS lifecycle_assertion");
      try {
        await this.db.batch([
          transition,
          decrement(before.day, "day_bucket_id"),
          decrement(before.month, "month_bucket_id"),
          assertion,
        ]);
      } catch (error) {
        try {
          const recovered = await this.readRemoteReleaseState(command);
          if (recovered.reservation.status === "released") return recovered.reservation;
          if (recovered.reservation.status !== "reserved") throw new ResearchBudgetError("CONFLICT");
        } catch (readError) {
          if (readError instanceof ResearchBudgetError) throw readError;
        }
        if (error instanceof ResearchBudgetError) throw error;
        return unavailable();
      }
      const saved = await this.readRemoteReleaseState(command);
      if (saved.reservation.status !== "released") unavailable();
      return saved.reservation;
    });
  }

  private async readRemoteReleaseState(command: z.infer<typeof remoteReleaseCommandSchema>): Promise<Readonly<{
    reservation: BudgetReservation;
    day: BudgetBucket;
    month: BudgetBucket;
  }>> {
    const reservation = await this.readReservation(command.ownerId, command.reservationId);
    if (!reservation) throw new ResearchBudgetError("NOT_FOUND");
    if (reservation.ownerId !== command.ownerId || reservation.runId !== command.runId
      || reservation.requestId !== command.requestId) throw new ResearchBudgetError("CONFLICT");
    const rawContext = await this.db.prepare(`SELECT
        e.request_id AS execution_request_id,e.job_id AS execution_job_id,
        e.request_hash AS execution_request_hash,e.quota_key AS execution_quota_key,
        e.maximum_micros AS execution_maximum_micros,
        e.reservation_expires_at AS execution_reservation_expires_at,
        e.admission_state,e.budget_reservation_id,e.closed_at,e.close_reason,e.began_at,
        r.request_id AS run_request_id,r.execution_mode,r.remote_quota_key,r.state AS run_state,
        r.retryable,r.active_slot,r.active_expires_at,r.error_code,r.public_failure_category
      FROM research_site_executions e
      JOIN research_runs r ON r.id=e.run_id AND r.user_id=e.user_id
      WHERE e.user_id=?1 AND e.run_id=?2 LIMIT 1`)
      .bind(command.ownerId, command.runId).first();
    if (!rawContext) unavailable();
    const context = parse(releaseContextSchema, rawContext);
    if (context.execution_request_id !== command.requestId || context.execution_job_id !== command.jobId
      || context.execution_request_hash !== command.requestHash) throw new ResearchBudgetError("CONFLICT");
    if (context.run_request_id !== context.execution_request_id
      || context.execution_mode !== "cloudflare-workflow-v1"
      || context.remote_quota_key !== context.execution_quota_key) unavailable();
    const closureMarkersCoherent = context.admission_state === "closed"
      ? context.closed_at !== null && context.close_reason !== null && context.began_at === null
      : context.closed_at === null && context.close_reason === null;
    if (!closureMarkersCoherent) unavailable();
    if (context.admission_state !== "closed" || context.began_at !== null
      || context.close_reason === "cached" || context.close_reason === null) {
      throw new ResearchBudgetError("CONFLICT");
    }
    const expectedFailure = context.close_reason === "expired"
      ? { errorCode: "interrupted", category: "timeout" }
      : context.close_reason === "denied"
        ? { errorCode: "admission-denied", category: "service-unavailable" }
        : { errorCode: "interrupted", category: "service-unavailable" };
    if (context.run_state !== "failed" || context.retryable !== 1
      || context.active_slot !== null || context.active_expires_at !== null
      || context.error_code !== expectedFailure.errorCode
      || context.public_failure_category !== expectedFailure.category) {
      throw new ResearchBudgetError("CONFLICT");
    }
    if (reservation.maximumMicros !== context.execution_maximum_micros
      || reservation.expiresAt !== context.execution_reservation_expires_at
      || context.budget_reservation_id !== null && context.budget_reservation_id !== reservation.id) {
      throw new ResearchBudgetError("CONFLICT");
    }
    const day = await this.readBucket(reservation.dayBucketId);
    const month = await this.readBucket(reservation.monthBucketId);
    const original = periods(reservation.createdAt);
    if (!day || !month || day.id === month.id || day.periodKind !== "day" || month.periodKind !== "month"
      || day.periodStart !== original.day || month.periodStart !== original.month) unavailable();
    return Object.freeze({ reservation, day, month });
  }

  settle(ownerId: string, id: string, input: BudgetSettlement): Promise<BudgetReservation> {
    return guarded(async () => {
      const settlement = parse(settlementSchema, input); const now = parse(timestamp, this.options.now());
      const reservation = await this.readReservation(ownerId, id);
      if (!reservation) throw new ResearchBudgetError("NOT_FOUND");
      const status = settlement.kind === "actual" ? "settled" : settlement.kind === "unknown" ? "conservative-hold" : "released";
      const actual = settlement.kind === "actual" ? settlement.actualMicros : 0;
      const matches = (row: BudgetReservation) => row.status === status && row.settledMicros === actual;
      if (matches(reservation)) return reservation;
      if (reservation.status === "settled" || reservation.status === "released") throw new ResearchBudgetError("CONFLICT");
      const day = await this.readBucket(reservation.dayBucketId); const month = await this.readBucket(reservation.monthBucketId);
      const original = periods(reservation.createdAt);
      if (!day || !month || day.periodKind !== "day" || month.periodKind !== "month" || day.periodStart !== original.day || month.periodStart !== original.month) unavailable();
      for (const bucket of [day, month]) {
        if (bucket.reservedMicros < reservation.maximumMicros || bucket.version === MAX || !Number.isSafeInteger(bucket.reservedMicros - reservation.maximumMicros + bucket.settledMicros + actual)) unavailable();
      }
      // The transition proves BOTH following UPDATEs will match and fit. A
      // zero-row conditional UPDATE alone would not roll a D1 batch back.
      const transition = this.db.prepare(`UPDATE ai_budget_reservations SET status=?1,settled_micros=?2,updated_at=?3
        WHERE id=?4 AND status IN ('reserved','conservative-hold') AND status<>?1
          AND EXISTS(SELECT 1 FROM research_runs WHERE id=run_id AND user_id=?5)
          AND EXISTS(SELECT 1 FROM ai_budget_buckets d JOIN ai_budget_buckets m ON m.id=month_bucket_id
            WHERE d.id=day_bucket_id AND d.scope='site' AND m.scope='site' AND d.period_kind='day' AND m.period_kind='month'
              AND d.period_start=?6 AND m.period_start=?7
              AND d.reserved_micros>=maximum_reserved_micros AND m.reserved_micros>=maximum_reserved_micros
              AND d.settled_micros <= ${MAX}-?2 AND m.settled_micros <= ${MAX}-?2
              AND d.reserved_micros-maximum_reserved_micros <= ${MAX}-d.settled_micros-?2
              AND m.reserved_micros-maximum_reserved_micros <= ${MAX}-m.settled_micros-?2
              AND d.version<${MAX} AND m.version<${MAX})
      `).bind(status, actual, now, id, ownerId, original.day, original.month);
      const statements = [transition];
      if (settlement.kind !== "unknown") {
        for (const bucketId of [day.id, month.id]) statements.push(this.db.prepare(`UPDATE ai_budget_buckets SET reserved_micros=reserved_micros-?1,settled_micros=settled_micros+?2,version=version+1,updated_at=?3 WHERE id=?4 AND changes()=1`).bind(reservation.maximumMicros, actual, now, bucketId));
      }
      await this.db.batch(statements);
      const result = await this.readReservation(ownerId, id);
      if (!result) unavailable();
      if (!matches(result)) {
        if (result.status === "settled" || result.status === "released") throw new ResearchBudgetError("CONFLICT");
        unavailable();
      }
      return result;
    });
  }
}
