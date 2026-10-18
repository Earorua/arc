import { z } from "zod";
import { canonicalJson } from "../../lib/planning/fingerprint";
import type { AcceptedProof, BridgeIdentity } from "./executor/bridge-contract";
import type { ResearchRepository } from "./repository";
import { ResearchRepositoryError } from "./repository";
import type { SiteBridgeRepository } from "./site-bridge-repository";
import type { SiteExecutionIdentity, SiteExecutionRepository } from "./site-execution-repository";
import { siteSqlNow } from "./site-execution-sql";

type Row = Record<string, unknown>;
const MAX = Number.MAX_SAFE_INTEGER;
const hash = z.string().length(64).regex(/^[0-9a-f]{64}$/u);
const time = z.number().int().min(0).max(MAX);
const identitySchema = z.object({ jobId: z.uuid(), requestHash: hash }).strict();
const lookupRowSchema = z.object({
  user_id: z.string().min(1).max(160), run_id: z.string().min(1).max(256),
  request_id: z.string().min(1).max(160), job_id: z.uuid(), request_hash: hash,
}).strict();
const cursorSchema = z.object({
  after_created_at: time.nullable(), after_job_id: z.uuid().nullable(), version: time,
}).strict().refine((value) => (value.after_created_at === null) === (value.after_job_id === null));
const scanRowSchema = lookupRowSchema.extend({ created_at: time }).strict();
const acceptanceRowSchema = z.object({
  job_id: z.uuid(), request_hash: hash, workflow_id: z.uuid(),
  workflow_accepted_at: time, recorded_at: time,
}).strict();
const acceptanceSchema = z.object({
  jobId: z.uuid(), requestHash: hash, workflowId: z.uuid(), workflowAcceptedAt: time,
}).strict().refine((value) => value.workflowId === value.jobId);

export class D1SiteBridgeRepository implements SiteBridgeRepository {
  constructor(
    private readonly db: D1Database,
    private readonly research: Pick<ResearchRepository, "getRun">,
    private readonly executions: Pick<SiteExecutionRepository, "read">,
  ) {}

  async lookup(input: BridgeIdentity) {
    const requested = parse(identitySchema, input);
    const row = parse(lookupRowSchema, await storage(() => this.db.prepare(`SELECT user_id,run_id,request_id,job_id,request_hash
      FROM research_site_executions WHERE job_id=?1 LIMIT 1`).bind(requested.jobId).first<Row>()));
    if (row.request_hash !== requested.requestHash) throw conflict();
    const identity = Object.freeze({ ownerId: row.user_id, runId: row.run_id,
      requestId: row.request_id, jobId: row.job_id, requestHash: row.request_hash });
    const [execution, run] = await Promise.all([
      this.executions.read(identity.ownerId, identity.runId),
      this.research.getRun(identity.ownerId, identity.runId),
    ]);
    if (!execution || !run || !sameIdentity(execution, identity)
      || run.ownerId !== identity.ownerId || run.id !== identity.runId
      || run.requestId !== identity.requestId || run.executionMode !== "cloudflare-workflow-v1"
      || run.remoteQuotaKey !== execution.quotaKey || run.inputFingerprint !== execution.job.inputFingerprint
      || run.configFingerprint !== execution.job.configFingerprint || run.rawRole !== execution.job.role
      || run.locale !== execution.job.locale || canonicalJson(execution.job) === "") throw conflict();
    return Object.freeze({ identity, execution });
  }

  async recordAcceptance(input: AcceptedProof): Promise<AcceptedProof> {
    const proof = parseAcceptance(input);
    const { identity } = await this.lookup({ jobId: proof.jobId, requestHash: proof.requestHash });
    if (proof.workflowId !== identity.jobId) throw conflict();
    const insert = this.db.prepare(`INSERT INTO research_site_acceptances
      (job_id,request_hash,workflow_id,workflow_accepted_at,recorded_at)
      SELECT e.job_id,e.request_hash,?3,?4,${siteSqlNow}
      FROM research_site_executions e
      WHERE e.job_id=?1 AND e.request_hash=?2
      ON CONFLICT(job_id) DO NOTHING`).bind(proof.jobId, proof.requestHash,
      proof.workflowId, proof.workflowAcceptedAt);
    try { await insert.run(); } catch { /* A lost insert acknowledgement is resolved by exact reread. */ }
    const saved = await this.readAcceptance(identity);
    if (saved && exactAcceptance(saved, proof)) return saved;
    if (saved) throw conflict();
    throw unavailable();
  }

  async readAcceptance(identity: SiteExecutionIdentity): Promise<AcceptedProof | null> {
    const execution = await this.executions.read(identity.ownerId, identity.runId);
    if (!execution || !sameIdentity(execution, identity)) throw conflict();
    const row = await storage(() => this.db.prepare(`SELECT job_id,request_hash,workflow_id,
      workflow_accepted_at,recorded_at FROM research_site_acceptances WHERE job_id=?1 LIMIT 1`)
      .bind(identity.jobId).first<Row>());
    if (!row) return null;
    const stored = parse(acceptanceRowSchema, row);
    if (stored.request_hash !== identity.requestHash || stored.workflow_id !== identity.jobId) throw conflict();
    return parseAcceptance({ jobId: stored.job_id, requestHash: stored.request_hash,
      workflowId: stored.workflow_id, workflowAcceptedAt: stored.workflow_accepted_at });
  }

  async nextScan(name: "maintenance" | "outbox"): Promise<SiteExecutionIdentity | null> {
    if (name !== "maintenance" && name !== "outbox") throw unavailable();
    for (;;) {
      const cursor = parse(cursorSchema, await storage(() => this.db.prepare(`SELECT after_created_at,
        after_job_id,version FROM research_site_scan_cursors WHERE name=?1 LIMIT 1`)
        .bind(name).first<Row>()));
      const raw = await this.scan(name, cursor.after_created_at, cursor.after_job_id);
      if (!raw) {
        if (cursor.after_created_at === null) return null;
        await this.moveCursor(name, cursor, null);
        return null;
      }
      const position = rawPosition(raw);
      await this.moveCursor(name, cursor, position);
      const row = parse(scanRowSchema, raw);
      const found = await this.lookup({ jobId: row.job_id, requestHash: row.request_hash });
      if (found.identity.ownerId !== row.user_id || found.identity.runId !== row.run_id
        || found.identity.requestId !== row.request_id) throw unavailable();
      return found.identity;
    }
  }

  private scan(name: "maintenance" | "outbox", createdAt: number | null, jobId: string | null) {
    const cursor = `(?1 IS NULL OR e.created_at>?1 OR (e.created_at=?1 AND e.job_id>?2))`;
    const outbox = `e.admission_state='admitted' AND e.began_at IS NULL
      AND e.queue_expires_at>${siteSqlNow}`;
    const maintenance = `e.admission_state='pending'
      OR (e.began_at IS NULL AND ((e.admission_state='admitted' AND e.queue_expires_at<=${siteSqlNow})
        OR (e.admission_state='closed' AND e.close_reason IN ('denied','expired','interrupted'))))
      OR (e.began_at IS NOT NULL AND r.state IN ('researching','validating')
        AND e.execution_expires_at<=${siteSqlNow})
      OR EXISTS(SELECT 1 FROM research_site_recoveries p WHERE p.job_id=e.job_id
        AND p.request_hash=e.request_hash AND (p.quota_done=0 OR p.budget_done=0))
      OR EXISTS(SELECT 1 FROM research_site_imports j WHERE j.job_id=e.job_id
        AND j.request_hash=e.request_hash AND j.phase<5)
      OR EXISTS(SELECT 1 FROM research_site_recoveries p
        JOIN ai_budget_reservations b ON b.id=e.budget_reservation_id
          AND b.run_id=e.run_id AND b.request_id=e.request_id
        WHERE p.job_id=e.job_id AND p.request_hash=e.request_hash
          AND p.execution_version=e.version AND p.run_version=r.state_version
          AND p.reason='expired-unknown' AND p.unsent_json IS NULL
          AND r.state='failed' AND r.active_slot IS NULL AND r.active_expires_at IS NULL
          AND b.maximum_reserved_micros=e.maximum_micros AND b.expires_at=e.reservation_expires_at
          AND b.status='conservative-hold' AND b.settled_micros=0)`;
    return storage(() => this.db.prepare(`SELECT e.user_id,e.run_id,e.request_id,e.job_id,e.request_hash,e.created_at
      FROM research_site_executions e
      JOIN research_runs r ON r.id=e.run_id AND r.user_id=e.user_id AND r.request_id=e.request_id
      WHERE r.execution_mode='cloudflare-workflow-v1'
        AND length(e.job_id)=36 AND substr(e.job_id,9,1)='-' AND substr(e.job_id,14,1)='-'
        AND substr(e.job_id,19,1)='-' AND substr(e.job_id,24,1)='-'
        AND length(replace(e.job_id,'-',''))=32
        AND replace(e.job_id,'-','') NOT GLOB '*[^0-9a-f]*'
        AND ((substr(e.job_id,15,1) GLOB '[1-8]' AND substr(e.job_id,20,1) GLOB '[89ab]')
          OR e.job_id='00000000-0000-0000-0000-000000000000'
          OR e.job_id='ffffffff-ffff-ffff-ffff-ffffffffffff')
        AND ${cursor}
        AND (${name === "outbox" ? outbox : maintenance})
      ORDER BY e.created_at,e.job_id LIMIT 1`).bind(createdAt, jobId).first<Row>());
  }

  private async moveCursor(name: "maintenance" | "outbox", before: z.infer<typeof cursorSchema>,
    after: Readonly<{ createdAt: number; jobId: string }> | null): Promise<void> {
    const result = await storage(() => this.db.prepare(`UPDATE research_site_scan_cursors
      SET after_created_at=?1,after_job_id=?2,version=version+1
      WHERE name=?3 AND version=?4 AND version<${MAX}
        AND after_created_at IS ?5 AND after_job_id IS ?6`)
      .bind(after?.createdAt ?? null, after?.jobId ?? null, name, before.version,
        before.after_created_at, before.after_job_id).run());
    if (result.meta.changes === 1) return;
    const observed = parse(cursorSchema, await storage(() => this.db.prepare(`SELECT after_created_at,
      after_job_id,version FROM research_site_scan_cursors WHERE name=?1 LIMIT 1`)
      .bind(name).first<Row>()));
    if (observed.version === before.version + 1
      && observed.after_created_at === (after?.createdAt ?? null)
      && observed.after_job_id === (after?.jobId ?? null)) return;
    throw unavailable();
  }
}

function rawPosition(row: Row): Readonly<{ createdAt: number; jobId: string }> {
  try { return Object.freeze({ createdAt: time.parse(row.created_at), jobId: z.uuid().parse(row.job_id) }); }
  catch { throw unavailable(); }
}

function parseAcceptance(value: unknown): AcceptedProof {
  try { return Object.freeze({ ...acceptanceSchema.parse(value) }); } catch { throw unavailable(); }
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  try { return schema.parse(value); } catch { throw unavailable(); }
}
function sameIdentity(value: SiteExecutionIdentity, expected: SiteExecutionIdentity): boolean {
  return value.ownerId === expected.ownerId && value.runId === expected.runId
    && value.requestId === expected.requestId && value.jobId === expected.jobId
    && value.requestHash === expected.requestHash;
}
function exactAcceptance(left: AcceptedProof, right: AcceptedProof): boolean {
  return left.jobId === right.jobId && left.requestHash === right.requestHash
    && left.workflowId === right.workflowId && left.workflowAcceptedAt === right.workflowAcceptedAt;
}
function conflict() { return new ResearchRepositoryError("CONFLICT"); }
function unavailable() { return new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); }
async function storage<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) { if (error instanceof ResearchRepositoryError) throw error; throw unavailable(); }
}
