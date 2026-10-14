import { z } from "zod";
import { EntitlementRepositoryError, RESEARCH_QUOTA_PURPOSE, type EntitlementFinalStatus, type EntitlementPeriod, type EntitlementRepository, type EntitlementUsage, type RemoteResearchQuotaAdmission, type ResearchQuotaAdmission, type ResearchQuotaDecision } from "./repository";
import { quotaLedgerPurposePeriodInvalidRowsSql, researchQuotaInvalidRowsSql, researchQuotaLedgerCte } from "./d1-research-quota-sql";
import { siteOpenAdmissionSql } from "../research/d1-site-execution-repository";
import { readBoundedResearchJson } from "../research/source-audit";

const MAX = Number.MAX_SAFE_INTEGER;
const integer = z.number().int().min(0).max(MAX);
const identifier = z.string().min(1).max(160).refine((value) => value.trim() === value && !value.includes("\0"));
const purposeSchema = identifier.max(120);
const keySchema = identifier.min(8).max(128);
const periodSchema = z.object({ startMs: integer, endMs: integer }).strict().refine((value) => value.endMs > value.startMs);
const reservationSchema = z.object({ user_id: identifier, purpose: purposeSchema, reservation_id: identifier, idempotency_key: keySchema, units: z.number().int().min(1).max(1000), created_at: integer });
type ReservationRow = z.infer<typeof reservationSchema>;
type FinalRow = { entry_kind: EntitlementFinalStatus; units: number };
const ledgerEntryKindSchema = z.enum(["reserved", "accepted", "rejected", "failed"]);
const recoveryDirectRowSchema = z.object({ reservation_id: identifier, entry_kind: ledgerEntryKindSchema }).strict();
const recoveryLedgerRowSchema = z.object({
  id: identifier,
  user_id: identifier,
  purpose: purposeSchema,
  reservation_id: identifier,
  idempotency_key: keySchema,
  entry_kind: ledgerEntryKindSchema,
  units: integer.max(1000),
  created_at: integer,
}).strict();
const researchCommandSchema = z.object({ userId: identifier, purpose: z.literal(RESEARCH_QUOTA_PURPOSE), idempotencyKey: keySchema, units: z.literal(1), dailyQuota: integer.max(100_000), period: periodSchema.refine((value) => value.startMs % 86_400_000 === 0 && value.endMs - value.startMs === 86_400_000) }).strict();
const remoteResearchCommandSchema = researchCommandSchema.extend({
  ownerId: identifier,
  runId: identifier,
  requestId: identifier,
  jobId: z.uuid(),
  requestHash: z.string().length(64).regex(/^[0-9a-f]{64}$/u),
}).strict().refine((value) => value.ownerId === value.userId);
const sqlNow = "CAST(ROUND(unixepoch('subsec') * 1000) AS INTEGER)";
function unavailable(): never { throw new EntitlementRepositoryError("ENTITLEMENT_UNAVAILABLE"); }
function parse<T>(schema: z.ZodType<T>, value: unknown): T { const parsed = schema.safeParse(value); return parsed.success ? parsed.data : unavailable(); }
async function guarded<T>(operation: () => Promise<T>): Promise<T> { try { return await operation(); } catch (error) { if (error instanceof EntitlementRepositoryError) throw error; return unavailable(); } }

export class D1EntitlementRepository implements EntitlementRepository {
  private readonly options: { createId: () => string; now: () => number };
  constructor(private readonly db: D1Database, options: Partial<{ createId: () => string; now: () => number }> = {}) { this.options = { createId: () => crypto.randomUUID(), now: () => Date.now(), ...options }; }

  private async assertLedger(invalidRowsSql: string, values: unknown[]) {
    const row = await this.db.prepare(`${researchQuotaLedgerCte} SELECT ${invalidRowsSql} AS invalid`).bind(...values).first<{ invalid: number }>();
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
  private async isRemoteQuotaKey(userId: string, key: string): Promise<boolean> {
    return Boolean(await this.db.prepare("SELECT 1 FROM research_runs WHERE user_id=?1 AND remote_quota_key=?2 LIMIT 1").bind(userId, key).first());
  }
  private async assertRemoteContext(command: z.infer<typeof remoteResearchCommandSchema>): Promise<void> {
    const row = await this.db.prepare(`SELECT 1 FROM research_site_executions e
      JOIN research_runs r ON r.id=e.run_id AND r.user_id=e.user_id AND r.request_id=e.request_id
      WHERE e.user_id=?1 AND e.run_id=?2 AND e.request_id=?3 AND e.job_id=?4 AND e.request_hash=?5
        AND e.quota_key=?6 AND e.user_daily_quota=?7
        AND r.execution_mode='cloudflare-workflow-v1' AND r.remote_quota_key=e.quota_key
      LIMIT 1`).bind(command.ownerId, command.runId, command.requestId, command.jobId, command.requestHash, command.idempotencyKey, command.dailyQuota).first();
    if (!row) throw new EntitlementRepositoryError("CONFLICT");
  }

  readResearchReservation(userId: string, idempotencyKey: string) {
    return guarded(async () => {
      parse(identifier, userId); parse(keySchema, idempotencyKey);
      const directResult = await this.db.prepare(`SELECT reservation_id,entry_kind FROM quota_ledger
        WHERE user_id=?1 AND idempotency_key=?2 LIMIT 3`).bind(userId, idempotencyKey).all();
      const directRows = parse(z.array(recoveryDirectRowSchema).max(2), directResult.results);
      if (directRows.length === 0) return null;
      const reservationIds = new Set(directRows.map((row) => row.reservation_id));
      if (reservationIds.size !== 1 || directRows.filter((row) => row.entry_kind === "reserved").length !== 1) unavailable();
      const reservationId = directRows[0].reservation_id;

      const relationshipResult = await this.db.prepare(`SELECT id,user_id,purpose,reservation_id,idempotency_key,entry_kind,units,created_at
        FROM quota_ledger WHERE reservation_id=?1 LIMIT 3`).bind(reservationId).all();
      const relationship = parse(z.array(recoveryLedgerRowSchema).min(1).max(2), relationshipResult.results);
      const parents = relationship.filter((row) => row.entry_kind === "reserved");
      if (parents.length !== 1) unavailable();
      const parent = parents[0];
      if (parent.purpose !== RESEARCH_QUOTA_PURPOSE) throw new EntitlementRepositoryError("CONFLICT");
      for (const row of relationship) {
        if (row.reservation_id !== reservationId || row.user_id !== userId || row.idempotency_key !== idempotencyKey || row.purpose !== RESEARCH_QUOTA_PURPOSE) unavailable();
        const expectedUnits = row.entry_kind === "reserved" || row.entry_kind === "accepted" ? 1 : 0;
        if (row.units !== expectedUnits) unavailable();
      }
      const terminal = relationship.find((row) => row.entry_kind !== "reserved");
      const finalStatus = terminal?.entry_kind;
      if (finalStatus === "reserved") unavailable();
      return { reservationId, createdAt: parent.created_at, finalStatus: finalStatus ?? null };
    });
  }

  readUsage(userId: string, purpose: string, period: EntitlementPeriod): Promise<EntitlementUsage> {
    return guarded(async () => {
      parse(identifier, userId); parse(purposeSchema, purpose); parse(periodSchema, period);
      await this.assertLedger(quotaLedgerPurposePeriodInvalidRowsSql("?1", "?2", "?3"), [purpose, period.startMs, period.endMs]);
      // Research accepted usage belongs to its reservation day, even when Ready
      // arrives after midnight. Legacy preview continues using finalization time.
      const row = await this.db.prepare(`SELECT COALESCE(SUM(CASE WHEN q.user_id=?1 THEN q.units ELSE 0 END),0) AS user_units,COALESCE(SUM(q.units),0) AS global_units
        FROM quota_ledger q JOIN quota_ledger r ON r.user_id=q.user_id AND r.idempotency_key=q.idempotency_key AND r.reservation_id=q.reservation_id AND r.purpose=q.purpose AND r.entry_kind='reserved'
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
      await this.assertLedger(researchQuotaInvalidRowsSql("?1", "?2"), [userId, idempotencyKey]);
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
      const invalidRowsSql = researchQuotaInvalidRowsSql("?1", "?2", "?3", "?4");
      await this.assertLedger(invalidRowsSql, scopeValues);
      const replay = async (row: ReservationRow, replayed: boolean): Promise<ResearchQuotaDecision> => {
        if (await this.isRemoteQuotaKey(command.userId, command.idempotencyKey)) unavailable();
        this.validateReplay(row, command.purpose, command.units);
        return { allowed: true, reservationId: row.reservation_id, replayed, finalStatus: (await this.finalRow(row.reservation_id))?.entry_kind ?? null };
      };
      const existing = await this.findReservation(command.userId, command.idempotencyKey);
      if (existing) return replay(existing, true);
      if (now < command.period.startMs || now >= command.period.endMs) unavailable();
      const id = parse(identifier, this.options.createId());
      const result = await this.db.prepare(`${researchQuotaLedgerCte} INSERT INTO quota_ledger(id,user_id,purpose,reservation_id,idempotency_key,entry_kind,units,created_at)
        SELECT ?5,?1,'${RESEARCH_QUOTA_PURPOSE}',?6,?2,'reserved',1,?7
        WHERE NOT ${invalidRowsSql}
          AND NOT EXISTS(SELECT 1 FROM research_runs r WHERE r.user_id=?1 AND r.remote_quota_key=?2)
          AND (SELECT count(*) FROM quota_ledger r WHERE r.user_id=?1 AND r.purpose='${RESEARCH_QUOTA_PURPOSE}' AND r.entry_kind='reserved' AND r.created_at>=?3 AND r.created_at<?4
            AND NOT EXISTS(SELECT 1 FROM quota_ledger t WHERE t.user_id=r.user_id AND t.idempotency_key=r.idempotency_key AND t.reservation_id=r.reservation_id AND t.purpose=r.purpose AND t.entry_kind IN ('rejected','failed'))) < ?8
        ON CONFLICT(user_id,idempotency_key,entry_kind) DO NOTHING
      `).bind(...scopeValues, parse(identifier, this.options.createId()), id, now, command.dailyQuota).run();
      const saved = await this.findReservation(command.userId, command.idempotencyKey);
      if (!saved) { await this.assertLedger(invalidRowsSql, scopeValues); return { allowed: false, reason: "quota" }; }
      return replay(saved, result.meta.changes !== 1);
    });
  }

  admitRemoteResearch(input: RemoteResearchQuotaAdmission): Promise<ResearchQuotaDecision> {
    return guarded(async () => {
      const command = parse(remoteResearchCommandSchema, readBoundedResearchJson(input));
      const scopeValues = [command.userId, command.idempotencyKey, command.period.startMs, command.period.endMs];
      const invalidRowsSql = researchQuotaInvalidRowsSql("?1", "?2", "?3", "?4");
      await this.assertLedger(invalidRowsSql, scopeValues);
      const replay = async (row: ReservationRow, replayed: boolean): Promise<ResearchQuotaDecision> => {
        this.validateReplay(row, command.purpose, command.units);
        await this.assertRemoteContext(command);
        return { allowed: true, reservationId: row.reservation_id, replayed, finalStatus: (await this.finalRow(row.reservation_id))?.entry_kind ?? null };
      };
      const existing = await this.findReservation(command.userId, command.idempotencyKey);
      if (existing) return replay(existing, true);

      const reservationId = parse(identifier, this.options.createId());
      const entryId = parse(identifier, this.options.createId());
      const open = siteOpenAdmissionSql({ ownerSql: "?1", runSql: "?5", requestSql: "?6", jobSql: "?7", hashSql: "?8" });
      const result = await this.db.prepare(`${researchQuotaLedgerCte}
        INSERT INTO quota_ledger(id,user_id,purpose,reservation_id,idempotency_key,entry_kind,units,created_at)
        SELECT ?9,?1,'${RESEARCH_QUOTA_PURPOSE}',?10,?2,'reserved',1,${sqlNow}
        FROM research_site_executions e
        WHERE e.user_id=?1 AND e.run_id=?5 AND e.request_id=?6 AND e.job_id=?7 AND e.request_hash=?8
          AND e.quota_key=?2 AND e.user_daily_quota=?11
          AND ${open}
          AND ${sqlNow}>=?3 AND ${sqlNow}<?4
          AND NOT ${invalidRowsSql}
          AND (SELECT count(*) FROM quota_ledger r WHERE r.user_id=?1 AND r.purpose='${RESEARCH_QUOTA_PURPOSE}' AND r.entry_kind='reserved' AND r.created_at>=?3 AND r.created_at<?4
            AND NOT EXISTS(SELECT 1 FROM quota_ledger t WHERE t.user_id=r.user_id AND t.idempotency_key=r.idempotency_key AND t.reservation_id=r.reservation_id AND t.purpose=r.purpose AND t.entry_kind IN ('rejected','failed'))) < ?11
        ON CONFLICT(user_id,idempotency_key,entry_kind) DO NOTHING
      `).bind(
        ...scopeValues,
        command.runId,
        command.requestId,
        command.jobId,
        command.requestHash,
        entryId,
        reservationId,
        command.dailyQuota,
      ).run();
      const saved = await this.findReservation(command.userId, command.idempotencyKey);
      if (!saved) {
        await this.assertLedger(invalidRowsSql, scopeValues);
        return { allowed: false, reason: "quota" };
      }
      return replay(saved, result.meta.changes !== 1);
    });
  }

  finalize(reservationId: string, status: EntitlementFinalStatus, acceptedUnits: number): Promise<void> {
    return guarded(async () => {
      parse(identifier, reservationId); parse(z.enum(["accepted", "rejected", "failed"]), status); parse(integer.max(1000), acceptedUnits);
      const row = await this.db.prepare("SELECT user_id,purpose,reservation_id,idempotency_key,units,created_at FROM quota_ledger WHERE reservation_id=?1 AND entry_kind='reserved'").bind(reservationId).first();
      if (!row) unavailable(); const reservation = parse(reservationSchema, row);
      await this.assertLedger(researchQuotaInvalidRowsSql("?1", "?2"), [reservation.user_id, reservation.idempotency_key]);
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
