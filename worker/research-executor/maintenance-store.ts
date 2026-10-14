import { z } from "zod";
import { BRIDGE_RECEIPT_RETENTION_MS, parseBridgeReceiptMetadata,
  type BridgeReceiptMetadata } from "../../app/server/research/executor/receipt";

export type MaintenanceCategory = "bootstrap" | "results";
export type DeliveryFailure = "temporary" | "authentication" | "protocol" | "conflict";
export type DeliveryState = Readonly<{
  receiptHash: string;
  attemptCount: number;
  nextAttemptAt: number;
  stoppedCode: Exclude<DeliveryFailure, "temporary"> | null;
  completedAt: number | null;
  version: number;
}>;
export type AcceptanceDeliveryState = Readonly<{
  acknowledgedAt: number | null;
  nextAttemptAt: number;
  stoppedCode: Exclude<DeliveryFailure, "temporary"> | null;
}>;

const MAX = Number.MAX_SAFE_INTEGER;
const UUID = z.uuid();
const HASH = /^[0-9a-f]{64}$/u;
const SQL_NOW = "CAST(ROUND(unixepoch('subsec') * 1000) AS INTEGER)";

function validTime(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Executor maintenance unavailable");
  return value;
}
function validId(value: string): string {
  if (!UUID.safeParse(value).success) throw new Error("Executor maintenance unavailable");
  return value;
}
function validHash(value: string): string {
  if (!HASH.test(value)) throw new Error("Executor maintenance unavailable");
  return value;
}
function safeInteger(value: unknown, min = 0, max = MAX): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw new Error("Executor maintenance unavailable");
  }
  return value as number;
}
function changed(result: D1Result<unknown>): boolean {
  return Number(result.meta?.changes ?? 0) === 1;
}

export class ExecutorMaintenanceStore {
  constructor(private readonly db: D1Database) {
    if (!db || typeof db.prepare !== "function") throw new Error("Executor maintenance unavailable");
  }

  async acquire(now: number): Promise<{ generation: number; first: 0 | 1 | 2 } | null> {
    const observed = validTime(now);
    if (observed > MAX - 30_000) return null;
    const row = await this.db.prepare(`UPDATE research_executor_maintenance_schedule
      SET generation=generation+1,next_category=(next_category+1)%3,lease_until=?1+30000
      WHERE singleton=1 AND lease_until<=?1 AND generation<9007199254740991
        AND ?1<=9007199254710991
        AND ${SQL_NOW}>=?1 AND ${SQL_NOW}<?1+30000
      RETURNING generation,next_category`).bind(observed).first<{ generation: unknown; next_category: unknown }>();
    if (!row) return null;
    const generation = safeInteger(row.generation, 1);
    const next = safeInteger(row.next_category, 0, 2);
    return Object.freeze({ generation, first: ((next + 2) % 3) as 0 | 1 | 2 });
  }

  async next(category: MaintenanceCategory, generation: number): Promise<string | null> {
    if (category !== "bootstrap" && category !== "results") throw new Error("Executor maintenance unavailable");
    const ownedGeneration = safeInteger(generation, 1);
    const cursor = await this.db.prepare(`SELECT after_accepted_at,after_job_id,version
      FROM research_executor_maintenance_cursors WHERE category=?1`).bind(category)
      .first<{ after_accepted_at: unknown; after_job_id: unknown; version: unknown }>();
    if (!cursor) throw new Error("Executor maintenance unavailable");
    const afterAt = cursor.after_accepted_at === null ? null : safeInteger(cursor.after_accepted_at);
    const afterId = cursor.after_job_id === null ? null : validId(String(cursor.after_job_id));
    const version = safeInteger(cursor.version);
    if ((afterAt === null) !== (afterId === null)) throw new Error("Executor maintenance unavailable");
    const predicate = category === "bootstrap"
      ? `(j.workflow_accepted_at IS NULL OR a.acknowledged_at IS NULL)`
      : `j.dispatch_state='claimed'`;
    const candidate = await this.db.prepare(`SELECT j.job_id,j.accepted_at
      FROM research_executor_jobs j
      LEFT JOIN research_executor_acceptance_delivery a ON a.job_id=j.job_id
      WHERE ${predicate}
        AND length(j.job_id)=36 AND length(CAST(j.job_id AS BLOB))=36
        AND j.job_id NOT GLOB '*[^0-9A-Fa-f-]*'
        AND length(replace(j.job_id,'-',''))=32
        AND substr(j.job_id,9,1)='-' AND substr(j.job_id,14,1)='-'
        AND substr(j.job_id,19,1)='-' AND substr(j.job_id,24,1)='-'
        AND (lower(j.job_id)='00000000-0000-0000-0000-000000000000'
          OR lower(j.job_id)='ffffffff-ffff-ffff-ffff-ffffffffffff'
          OR (substr(j.job_id,15,1) IN ('1','2','3','4','5','6','7','8')
            AND lower(substr(j.job_id,20,1)) IN ('8','9','a','b')))
        AND (?1 IS NULL OR j.accepted_at>?1 OR (j.accepted_at=?1 AND j.job_id>?2))
      ORDER BY j.accepted_at,j.job_id LIMIT 1`).bind(afterAt, afterId)
      .first<{ job_id: unknown; accepted_at: unknown }>();
    const nextAt = candidate ? safeInteger(candidate.accepted_at) : null;
    const nextId = candidate ? validId(String(candidate.job_id)) : null;
    const result = await this.db.prepare(`UPDATE research_executor_maintenance_cursors
      SET after_accepted_at=?1,after_job_id=?2,version=version+1
      WHERE category=?3 AND version=?4 AND version<9007199254740991
        AND EXISTS(SELECT 1 FROM research_executor_maintenance_schedule
          WHERE singleton=1 AND generation=?5 AND lease_until>${SQL_NOW})`)
      .bind(nextAt, nextId, category, version, ownedGeneration).run();
    if (!changed(result)) return null;
    return nextId;
  }

  async recordAcceptance(jobId: string, observedAt: number): Promise<void> {
    const id = validId(jobId);
    const at = validTime(observedAt);
    const row = await this.db.prepare(`SELECT version,acknowledged_at FROM research_executor_acceptance_delivery
      WHERE job_id=?1`).bind(id).first<{ version: unknown; acknowledged_at: unknown }>();
    if (!row) throw new Error("Executor maintenance unavailable");
    if (row.acknowledged_at !== null) return;
    const version = safeInteger(row.version);
    const result = await this.db.prepare(`UPDATE research_executor_acceptance_delivery
      SET acknowledged_at=?1,stopped_code=NULL,version=version+1
      WHERE job_id=?2 AND version=?3 AND acknowledged_at IS NULL`)
      .bind(at, id, version).run();
    if (!changed(result)) {
      const reread = await this.readAcceptanceDelivery(id);
      if (reread.acknowledgedAt === null) throw new Error("Executor maintenance unavailable");
    }
  }

  async readAcceptanceDelivery(jobId: string): Promise<AcceptanceDeliveryState> {
    const id = validId(jobId);
    const row = await this.db.prepare(`SELECT acknowledged_at,next_attempt_at,stopped_code
      FROM research_executor_acceptance_delivery WHERE job_id=?1`).bind(id)
      .first<{ acknowledged_at: unknown; next_attempt_at: unknown; stopped_code: unknown }>();
    if (!row) throw new Error("Executor maintenance unavailable");
    const acknowledgedAt = row.acknowledged_at === null ? null : safeInteger(row.acknowledged_at);
    const nextAttemptAt = safeInteger(row.next_attempt_at);
    const stoppedCode = row.stopped_code;
    if (stoppedCode !== null && stoppedCode !== "authentication" && stoppedCode !== "protocol"
      && stoppedCode !== "conflict") throw new Error("Executor maintenance unavailable");
    return Object.freeze({ acknowledgedAt, nextAttemptAt, stoppedCode });
  }

  async ensureAcceptance(jobId: string, now: number): Promise<void> {
    const id = validId(jobId);
    const at = validTime(now);
    await this.db.prepare(`INSERT INTO research_executor_acceptance_delivery(job_id,next_attempt_at)
      SELECT job_id,?2 FROM research_executor_jobs WHERE job_id=?1
      ON CONFLICT(job_id) DO NOTHING`).bind(id, at).run();
    await this.readAcceptanceDelivery(id);
  }

  async takePickupTurn(generation: number): Promise<"existing" | "pickup"> {
    const ownedGeneration = safeInteger(generation, 1);
    const row = await this.db.prepare(`UPDATE research_executor_maintenance_cursors
      SET pickup_turn=1-pickup_turn,version=version+1
      WHERE category='bootstrap' AND version<9007199254740991
        AND EXISTS(SELECT 1 FROM research_executor_maintenance_schedule
          WHERE singleton=1 AND generation=?1 AND lease_until>${SQL_NOW})
      RETURNING pickup_turn`).bind(ownedGeneration).first<{ pickup_turn: unknown }>();
    if (!row) throw new Error("Executor maintenance unavailable");
    const next = safeInteger(row.pickup_turn, 0, 1);
    return next === 1 ? "existing" : "pickup";
  }

  async scheduleReceipt(input: BridgeReceiptMetadata): Promise<void> {
    const metadata = parseBridgeReceiptMetadata(input);
    const result = await this.db.prepare(`INSERT INTO research_executor_delivery(
        job_id,receipt_hash,next_attempt_at)
      SELECT ?1,?2,?3 WHERE EXISTS(SELECT 1 FROM research_executor_jobs
        WHERE job_id=?1 AND request_hash=?4 AND dispatch_state='claimed')
      ON CONFLICT(job_id) DO NOTHING`).bind(metadata.grant.jobId, metadata.receiptHash,
      metadata.producedAt, metadata.grant.requestHash).run();
    const state = await this.readDelivery(metadata.grant.jobId);
    if ((!changed(result) && state === null) || state?.receiptHash !== metadata.receiptHash) {
      throw new Error("Executor maintenance conflict");
    }
  }

  async readDelivery(jobId: string): Promise<DeliveryState | null> {
    const id = validId(jobId);
    const row = await this.db.prepare(`SELECT receipt_hash,attempt_count,next_attempt_at,
      stopped_code,completed_at,version FROM research_executor_delivery WHERE job_id=?1`)
      .bind(id).first<Record<string, unknown>>();
    if (!row) return null;
    const receiptHash = validHash(String(row.receipt_hash));
    const attemptCount = safeInteger(row.attempt_count, 0, 31);
    const nextAttemptAt = safeInteger(row.next_attempt_at);
    const completedAt = row.completed_at === null ? null : safeInteger(row.completed_at);
    const version = safeInteger(row.version);
    const stoppedCode = row.stopped_code;
    if (stoppedCode !== null && stoppedCode !== "authentication" && stoppedCode !== "protocol"
      && stoppedCode !== "conflict") throw new Error("Executor maintenance unavailable");
    return Object.freeze({ receiptHash, attemptCount, nextAttemptAt,
      stoppedCode: stoppedCode as DeliveryState["stoppedCode"], completedAt, version });
  }

  async cleanupPriority(jobId: string, now: number): Promise<boolean> {
    const id = validId(jobId);
    const at = validTime(now);
    const row = await this.db.prepare(`SELECT metadata_json,site_acknowledged_at,
      cleanup_requested_at,body_removed_at FROM research_executor_results WHERE job_id=?1`)
      .bind(id).first<Record<string, unknown>>();
    if (!row) return true;
    const siteAcknowledgedAt = row.site_acknowledged_at === null ? null
      : safeInteger(row.site_acknowledged_at);
    const cleanupRequestedAt = row.cleanup_requested_at === null ? null
      : safeInteger(row.cleanup_requested_at);
    const bodyRemovedAt = row.body_removed_at === null ? null : safeInteger(row.body_removed_at);
    if (bodyRemovedAt !== null) {
      if (cleanupRequestedAt !== bodyRemovedAt) throw new Error("Executor maintenance unavailable");
      return false;
    }
    if (cleanupRequestedAt !== null || siteAcknowledgedAt !== null) return true;
    try {
      const metadata = parseBridgeReceiptMetadata(JSON.parse(String(row.metadata_json)));
      return at >= metadata.producedAt
        && at - metadata.producedAt >= BRIDGE_RECEIPT_RETENTION_MS;
    } catch {
      throw new Error("Executor maintenance unavailable");
    }
  }

  async defer(jobId: string, receiptHash: string, expectedVersion: number, now: number,
    failure: DeliveryFailure): Promise<void> {
    const id = validId(jobId);
    const hash = validHash(receiptHash);
    const version = safeInteger(expectedVersion);
    const at = validTime(now);
    if (!(["temporary", "authentication", "protocol", "conflict"] as const).includes(failure)) {
      throw new Error("Executor maintenance unavailable");
    }
    const state = await this.readDelivery(id);
    if (!state || state.receiptHash !== hash) throw new Error("Executor maintenance conflict");
    if (state.completedAt !== null || state.stoppedCode !== null) return;
    const attempts = Math.min(31, state.attemptCount + 1);
    const delay = Math.min(300_000, 1_000 * 2 ** Math.min(state.attemptCount, 9));
    if (at > MAX - delay) throw new Error("Executor maintenance unavailable");
    const stopped = failure === "temporary" ? null : failure;
    const result = await this.db.prepare(`UPDATE research_executor_delivery
      SET attempt_count=?1,next_attempt_at=?2,stopped_code=?3,version=version+1
      WHERE job_id=?4 AND receipt_hash=?5 AND version=?6
        AND completed_at IS NULL AND stopped_code IS NULL`)
      .bind(attempts, at + delay, stopped, id, hash, version).run();
    if (!changed(result)) {
      const reread = await this.readDelivery(id);
      if (!reread || reread.receiptHash !== hash || (reread.completedAt === null
        && reread.stoppedCode === null && reread.version === version)) {
        throw new Error("Executor maintenance unavailable");
      }
    }
  }

  async complete(jobId: string, receiptHash: string, expectedVersion: number, now: number): Promise<void> {
    const id = validId(jobId);
    const hash = validHash(receiptHash);
    const version = safeInteger(expectedVersion);
    const at = validTime(now);
    const result = await this.db.prepare(`UPDATE research_executor_delivery
      SET completed_at=?1,stopped_code=NULL,version=version+1
      WHERE job_id=?2 AND receipt_hash=?3 AND version=?4
        AND completed_at IS NULL AND stopped_code IS NULL`).bind(at, id, hash, version).run();
    if (!changed(result)) {
      const reread = await this.readDelivery(id);
      if (!reread || reread.receiptHash !== hash || reread.completedAt === null) {
        throw new Error("Executor maintenance unavailable");
      }
    }
  }

  async deferAcceptance(jobId: string, now: number, failure: DeliveryFailure): Promise<void> {
    const id = validId(jobId);
    const at = validTime(now);
    const row = await this.db.prepare(`SELECT attempt_count,version FROM research_executor_acceptance_delivery
      WHERE job_id=?1 AND acknowledged_at IS NULL AND stopped_code IS NULL`).bind(id)
      .first<{ attempt_count: unknown; version: unknown }>();
    if (!row) return;
    const oldCount = safeInteger(row.attempt_count, 0, 31);
    const version = safeInteger(row.version);
    const delay = Math.min(300_000, 1_000 * 2 ** Math.min(oldCount, 9));
    if (at > MAX - delay) throw new Error("Executor maintenance unavailable");
    const stopped = failure === "temporary" ? null : failure;
    const result = await this.db.prepare(`UPDATE research_executor_acceptance_delivery
      SET attempt_count=?1,next_attempt_at=?2,stopped_code=?3,version=version+1
      WHERE job_id=?4 AND version=?5 AND acknowledged_at IS NULL AND stopped_code IS NULL`)
      .bind(Math.min(31, oldCount + 1), at + delay, stopped, id, version).run();
    if (!changed(result)) throw new Error("Executor maintenance unavailable");
  }
}
