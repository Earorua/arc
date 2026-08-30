import { z } from "zod";
import { EntitlementRepositoryError, RESEARCH_QUOTA_PURPOSE, type EntitlementFinalStatus, type EntitlementPeriod, type EntitlementRepository, type EntitlementUsage, type ResearchQuotaAdmission, type ResearchQuotaDecision } from "./repository";

const MAX = Number.MAX_SAFE_INTEGER;
const integer = z.number().int().min(0).max(MAX);
const identifier = z.string().min(1).max(160).refine((value) => value.trim() === value);
const purposeSchema = identifier.max(120);
const keySchema = identifier.min(8).max(128);
const periodSchema = z.object({ startMs: integer, endMs: integer }).strict().refine((value) => value.endMs > value.startMs);
const reservationSchema = z.object({ user_id: identifier, purpose: purposeSchema, reservation_id: identifier, idempotency_key: keySchema, units: z.number().int().min(1).max(1000), created_at: integer });
type ReservationRow = z.infer<typeof reservationSchema>;
type FinalRow = { entry_kind: EntitlementFinalStatus; units: number };
const researchCommandSchema = z.object({ userId: identifier, purpose: z.literal(RESEARCH_QUOTA_PURPOSE), idempotencyKey: keySchema, units: z.literal(1), dailyQuota: integer.max(100_000), period: periodSchema.refine((value) => value.startMs % 86_400_000 === 0 && value.endMs - value.startMs === 86_400_000) }).strict();

// Aggregate once: reservation_id has no index in the legacy schema. Correlated
// scans here would turn period validation into quadratic work over ledger history.
const ledgerGroups = `WITH ledger_groups AS MATERIALIZED (
  SELECT reservation_id,
    SUM(entry_kind='reserved') AS reserved_count, SUM(entry_kind<>'reserved') AS terminal_count,
    MAX(CASE WHEN entry_kind='reserved' THEN user_id END) AS reserved_user,
    MAX(CASE WHEN entry_kind='reserved' THEN purpose END) AS reserved_purpose,
    MAX(CASE WHEN entry_kind='reserved' THEN idempotency_key END) AS reserved_key,
    MAX(CASE WHEN entry_kind='reserved' THEN units END) AS reserved_units,
    MAX(CASE WHEN entry_kind='reserved' THEN created_at END) AS reserved_created_at
  FROM quota_ledger GROUP BY reservation_id
)`;
// quota_ledger predates CHECK constraints. Only validate rows relevant to this
// operation, using the aggregate to detect malformed reservation relationships.
const invalidLedgerRow = `(
  typeof(q.units)<>'integer' OR q.units<0 OR q.units>1000
  OR typeof(q.created_at)<>'integer' OR q.created_at<0 OR q.created_at>${MAX}
  OR q.entry_kind NOT IN ('reserved','accepted','rejected','failed')
  OR (q.entry_kind='reserved' AND q.units<1)
  OR (q.entry_kind IN ('rejected','failed') AND q.units<>0)
  OR (q.purpose='${RESEARCH_QUOTA_PURPOSE}' AND q.entry_kind IN ('reserved','accepted') AND q.units<>1)
  OR length(trim(q.purpose))<1 OR length(q.purpose)>120
  OR length(trim(q.reservation_id))<1 OR length(q.reservation_id)>160
  OR length(q.idempotency_key)<8 OR length(q.idempotency_key)>128
  OR g.reserved_count<>1 OR g.terminal_count>1
  OR g.reserved_user<>q.user_id OR g.reserved_purpose<>q.purpose OR g.reserved_key<>q.idempotency_key OR g.reserved_units<q.units
)`;
const groupJoin = "quota_ledger q JOIN ledger_groups g ON g.reservation_id=q.reservation_id";
const researchScope = `q.user_id=?1 AND (q.idempotency_key=?2 OR (q.purpose='${RESEARCH_QUOTA_PURPOSE}' AND ((g.reserved_created_at>=?3 AND g.reserved_created_at<?4) OR (q.created_at>=?3 AND q.created_at<?4))))`;

function unavailable(): never { throw new EntitlementRepositoryError("ENTITLEMENT_UNAVAILABLE"); }
function parse<T>(schema: z.ZodType<T>, value: unknown): T { const parsed = schema.safeParse(value); return parsed.success ? parsed.data : unavailable(); }
async function guarded<T>(operation: () => Promise<T>): Promise<T> { try { return await operation(); } catch (error) { if (error instanceof EntitlementRepositoryError) throw error; return unavailable(); } }

export class D1EntitlementRepository implements EntitlementRepository {
  private readonly options: { createId: () => string; now: () => number };
  constructor(private readonly db: D1Database, options: Partial<{ createId: () => string; now: () => number }> = {}) { this.options = { createId: () => crypto.randomUUID(), now: () => Date.now(), ...options }; }

  private async assertLedger(scope: string, values: unknown[]) {
    const row = await this.db.prepare(`${ledgerGroups} SELECT count(*) AS invalid FROM ${groupJoin} WHERE ${scope} AND ${invalidLedgerRow}`).bind(...values).first<{ invalid: number }>();
    if (!row || row.invalid !== 0) unavailable();
  }
  private async findReservation(userId: string, key: string): Promise<ReservationRow | null> {
    const row = await this.db.prepare("SELECT user_id,purpose,reservation_id,idempotency_key,units,created_at FROM quota_ledger WHERE user_id=?1 AND idempotency_key=?2 AND entry_kind='reserved'").bind(userId, key).first();
    return row ? parse(reservationSchema, row) : null;
  }
  private async finalRow(reservationId: string): Promise<FinalRow | null> {
    const row = await this.db.prepare("SELECT entry_kind,units FROM quota_ledger WHERE reservation_id=?1 AND entry_kind<>'reserved'").bind(reservationId).first();
    return row ? parse(z.object({ entry_kind: z.enum(["accepted", "rejected", "failed"]), units: integer.max(1000) }), row) : null;
  }
  private validateReplay(row: ReservationRow, purpose: string, units: number) {
    if (row.purpose !== purpose || row.units !== units) throw new EntitlementRepositoryError("CONFLICT");
  }

  readUsage(userId: string, purpose: string, period: EntitlementPeriod): Promise<EntitlementUsage> {
    return guarded(async () => {
      parse(identifier, userId); parse(purposeSchema, purpose); parse(periodSchema, period);
      await this.assertLedger("q.purpose=?1 AND ((q.created_at>=?2 AND q.created_at<?3) OR (q.purpose=?4 AND g.reserved_created_at>=?2 AND g.reserved_created_at<?3))", [purpose, period.startMs, period.endMs, RESEARCH_QUOTA_PURPOSE]);
      // Research accepted usage belongs to its reservation day, even when Ready
      // arrives after midnight. Legacy preview continues using finalization time.
      const row = await this.db.prepare(`SELECT COALESCE(SUM(CASE WHEN q.user_id=?1 THEN q.units ELSE 0 END),0) AS user_units,COALESCE(SUM(q.units),0) AS global_units
        FROM quota_ledger q JOIN quota_ledger r ON r.user_id=q.user_id AND r.idempotency_key=q.idempotency_key AND r.entry_kind='reserved'
        WHERE q.purpose=?2 AND q.entry_kind='accepted'
          AND (CASE WHEN q.purpose='${RESEARCH_QUOTA_PURPOSE}' THEN r.created_at ELSE q.created_at END)>=?3
          AND (CASE WHEN q.purpose='${RESEARCH_QUOTA_PURPOSE}' THEN r.created_at ELSE q.created_at END)<?4
      `).bind(userId, purpose, period.startMs, period.endMs).first<{ user_units: number; global_units: number }>();
      if (!row) unavailable();
      return { userAcceptedUnits: parse(integer, row.user_units), globalAcceptedUnits: parse(integer, row.global_units) };
    });
  }

  reserve(userId: string, purpose: string, idempotencyKey: string, units: number): Promise<string> {
    return guarded(async () => {
      parse(identifier, userId); parse(purposeSchema, purpose); parse(keySchema, idempotencyKey); parse(z.number().int().min(1).max(1000), units);
      if (purpose === RESEARCH_QUOTA_PURPOSE) unavailable();
      await this.assertLedger("q.user_id=?1 AND q.idempotency_key=?2", [userId, idempotencyKey]);
      const existing = await this.findReservation(userId, idempotencyKey);
      if (existing) { this.validateReplay(existing, purpose, units); return existing.reservation_id; }
      const id = parse(identifier, this.options.createId());
      await this.db.prepare(`INSERT INTO quota_ledger(id,user_id,purpose,reservation_id,idempotency_key,entry_kind,units,created_at) VALUES(?1,?2,?3,?4,?5,'reserved',?6,?7) ON CONFLICT(user_id,idempotency_key,entry_kind) DO NOTHING`).bind(parse(identifier, this.options.createId()), userId, purpose, id, idempotencyKey, units, parse(integer, this.options.now())).run();
      const saved = await this.findReservation(userId, idempotencyKey); if (!saved) unavailable();
      this.validateReplay(saved, purpose, units); return saved.reservation_id;
    });
  }

  admitResearch(input: ResearchQuotaAdmission): Promise<ResearchQuotaDecision> {
    return guarded(async () => {
      const command = parse(researchCommandSchema, input); const now = parse(integer, this.options.now());
      const scopeValues = [command.userId, command.idempotencyKey, command.period.startMs, command.period.endMs];
      await this.assertLedger(researchScope, scopeValues);
      const replay = async (row: ReservationRow, replayed: boolean): Promise<ResearchQuotaDecision> => {
        this.validateReplay(row, command.purpose, command.units);
        return { allowed: true, reservationId: row.reservation_id, replayed, finalStatus: (await this.finalRow(row.reservation_id))?.entry_kind ?? null };
      };
      const existing = await this.findReservation(command.userId, command.idempotencyKey);
      if (existing) return replay(existing, true);
      if (now < command.period.startMs || now >= command.period.endMs) unavailable();
      const id = parse(identifier, this.options.createId());
      const result = await this.db.prepare(`${ledgerGroups} INSERT INTO quota_ledger(id,user_id,purpose,reservation_id,idempotency_key,entry_kind,units,created_at)
        SELECT ?5,?1,'${RESEARCH_QUOTA_PURPOSE}',?6,?2,'reserved',1,?7
        WHERE NOT EXISTS(SELECT 1 FROM ${groupJoin} WHERE ${researchScope} AND ${invalidLedgerRow})
          AND (SELECT count(*) FROM quota_ledger r WHERE r.user_id=?1 AND r.purpose='${RESEARCH_QUOTA_PURPOSE}' AND r.entry_kind='reserved' AND r.created_at>=?3 AND r.created_at<?4
            AND NOT EXISTS(SELECT 1 FROM quota_ledger t WHERE t.user_id=r.user_id AND t.idempotency_key=r.idempotency_key AND t.entry_kind IN ('rejected','failed'))) < ?8
        ON CONFLICT(user_id,idempotency_key,entry_kind) DO NOTHING
      `).bind(...scopeValues, parse(identifier, this.options.createId()), id, now, command.dailyQuota).run();
      const saved = await this.findReservation(command.userId, command.idempotencyKey);
      if (!saved) { await this.assertLedger(researchScope, scopeValues); return { allowed: false, reason: "quota" }; }
      return replay(saved, result.meta.changes !== 1);
    });
  }

  finalize(reservationId: string, status: EntitlementFinalStatus, acceptedUnits: number): Promise<void> {
    return guarded(async () => {
      parse(identifier, reservationId); parse(z.enum(["accepted", "rejected", "failed"]), status); parse(integer.max(1000), acceptedUnits);
      const row = await this.db.prepare("SELECT user_id,purpose,reservation_id,idempotency_key,units,created_at FROM quota_ledger WHERE reservation_id=?1 AND entry_kind='reserved'").bind(reservationId).first();
      if (!row) unavailable(); const reservation = parse(reservationSchema, row);
      await this.assertLedger("q.user_id=?1 AND q.idempotency_key=?2", [reservation.user_id, reservation.idempotency_key]);
      if (reservation.purpose === RESEARCH_QUOTA_PURPOSE && acceptedUnits !== (status === "accepted" ? 1 : 0)) unavailable();
      const units = status === "accepted" ? acceptedUnits : 0;
      if (units > reservation.units) unavailable();
      await this.db.prepare(`INSERT INTO quota_ledger(id,user_id,purpose,reservation_id,idempotency_key,entry_kind,units,created_at)
        SELECT ?1,?2,?3,?4,?5,?6,?7,?8
        WHERE NOT EXISTS(SELECT 1 FROM quota_ledger WHERE reservation_id=?4 AND entry_kind<>'reserved')
        ON CONFLICT(user_id,idempotency_key,entry_kind) DO NOTHING
      `).bind(parse(identifier, this.options.createId()), reservation.user_id, reservation.purpose, reservationId, reservation.idempotency_key, status, units, parse(integer, this.options.now())).run();
      const final = await this.finalRow(reservationId);
      if (!final) unavailable();
      if (final.entry_kind !== status || final.units !== units) throw new EntitlementRepositoryError("CONFLICT");
    });
  }
}
