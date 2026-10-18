import { z } from "zod";
import { ResearchBudgetError, type ResearchBudgetRepository, type BudgetReserveCommand, type BudgetDecision, type BudgetReservation, type BudgetSettlement, type BudgetBucket } from "./budget";

const MAX = Number.MAX_SAFE_INTEGER;
const integer = z.number().int().nonnegative().max(MAX);
const timestamp = integer.max(8_640_000_000_000_000);
const identifier = z.string().min(1).max(160).refine((value) => value.trim() === value);
const commandSchema = z.object({ ownerId: identifier, runId: identifier, requestId: identifier, maximumMicros: integer, dailyBudgetMicros: integer, monthlyBudgetMicros: integer, expiresAt: timestamp }).strict();
const settlementSchema = z.discriminatedUnion("kind", [z.object({ kind: z.literal("actual"), actualMicros: integer }).strict(), z.object({ kind: z.literal("not-charged") }).strict(), z.object({ kind: z.literal("unknown") }).strict()]);
const bucketSchema = z.object({ id: identifier, scope: z.literal("site"), period_kind: z.enum(["day", "month"]), period_start: timestamp, reserved_micros: integer, settled_micros: integer, version: integer, created_at: timestamp, updated_at: timestamp });
const reservationSchema = z.object({ id: identifier, request_id: identifier, run_id: identifier, day_bucket_id: identifier, month_bucket_id: identifier, maximum_reserved_micros: integer, settled_micros: integer, status: z.enum(["reserved", "settled", "conservative-hold", "released"]), expires_at: timestamp, created_at: timestamp, updated_at: timestamp, owner_id: identifier, run_request_id: identifier });
const reservationSelect = "SELECT r.*, u.user_id AS owner_id, u.request_id AS run_request_id FROM ai_budget_reservations r JOIN research_runs u ON u.id=r.run_id";

function unavailable(): never { throw new ResearchBudgetError("BUDGET_UNAVAILABLE"); }
async function guarded<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) { if (error instanceof ResearchBudgetError) throw error; return unavailable(); }
}
function parse<T>(schema: z.ZodType<T>, input: unknown): T { const result = schema.safeParse(input); return result.success ? result.data : unavailable(); }
function periods(now: number) {
  const date = new Date(now);
  return { day: Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()), month: Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) };
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
export class D1ResearchBudgetRepository implements ResearchBudgetRepository {
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
  private async assertRun(command: BudgetReserveCommand, now: number) {
    const run = await this.db.prepare("SELECT user_id,request_id,state,active_slot,active_expires_at FROM research_runs WHERE id=?1 AND user_id=?2").bind(command.runId, command.ownerId).first<{ user_id: string; request_id: string; state: string; active_slot: number | null; active_expires_at: number | null }>();
    if (!run || run.user_id !== command.ownerId || run.request_id !== command.requestId || run.state !== "queued" || run.active_slot !== 1 || !Number.isSafeInteger(run.active_expires_at) || run.active_expires_at! <= now || command.expiresAt <= now) throw new ResearchBudgetError("CONFLICT");
  }

  reserve(input: BudgetReserveCommand): Promise<BudgetDecision> {
    return guarded(async () => {
      const command = parse(commandSchema, input); const now = parse(timestamp, this.options.now());
      const existing = await this.byRequest(command.ownerId, command.requestId);
      if (existing) return this.replay(existing, command);
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
          AND EXISTS(SELECT 1 FROM research_runs WHERE id=?3 AND request_id=?2 AND user_id=?11 AND state='queued' AND active_slot=1 AND active_expires_at>?6)
        ON CONFLICT(request_id) DO NOTHING
      `).bind(id, command.requestId, command.runId, command.maximumMicros, command.expiresAt, now, period.day, period.month, command.dailyBudgetMicros, command.monthlyBudgetMicros, command.ownerId);
      // changes() is local to the preceding statement in this atomic batch. The
      // unique request INSERT, not predicted balances or versions, owns admission.
      const increment = (column: "day_bucket_id" | "month_bucket_id") => this.db.prepare(`UPDATE ai_budget_buckets SET reserved_micros=reserved_micros+?1,version=version+1,updated_at=?2 WHERE id=(SELECT ${column} FROM ai_budget_reservations WHERE id=?3) AND changes()=1`).bind(command.maximumMicros, now, id);
      const result = await this.db.batch([createBucket("day", period.day), createBucket("month", period.month), insert, increment("day_bucket_id"), increment("month_bucket_id")]);
      const saved = await this.byRequest(command.ownerId, command.requestId);
      if (!saved) { await this.assertRun(command, now); return { allowed: false, reason: "budget" }; }
      const replay = this.replay(saved, command);
      if (result[2]?.meta.changes !== 1) return replay;
      if (result[3]?.meta.changes !== 1 || result[4]?.meta.changes !== 1 || saved.id !== id) unavailable();
      return { allowed: true, reservation: saved, replayed: false, providerAttemptAllowed: saved.status === "reserved" };
    });
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
