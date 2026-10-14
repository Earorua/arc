import { z } from "zod";
import { researchPackageSchema } from "../../contracts/research";
import { parseBridgeBeginReply, type BridgeBeginReply } from "./executor/begin";
import { researchQuotaLedgerCte, researchQuotaLiveReservationSql } from "../entitlements/d1-research-quota-sql";
import type { ResearchRepository, ResearchRunRecord } from "./repository";
import { ResearchRepositoryError } from "./repository";
import { readBoundedResearchJson } from "./source-audit";
import type { SiteBeginCommand, SiteBeginRepository } from "./site-begin-repository";
import type { SiteExecutionRecord, SiteExecutionRepository } from "./site-execution-repository";
import { siteReservedBudgetSql, siteSqlNow } from "./site-execution-sql";

const identityText = z.string().min(1).max(160)
  .refine((value) => value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value));
const commandSchema = z.object({
  ownerId: identityText,
  runId: researchPackageSchema.shape.id,
  requestId: identityText,
  jobId: z.uuid(),
  requestHash: z.string().length(64).regex(/^[0-9a-f]{64}$/u),
  newExecutionAllowed: z.boolean(),
}).strict();

export class D1SiteBeginRepository implements SiteBeginRepository {
  constructor(
    private readonly db: D1Database,
    private readonly runs: Pick<ResearchRepository, "getRun">,
    private readonly executions: Pick<SiteExecutionRepository, "read">,
  ) {}

  async begin(input: SiteBeginCommand): Promise<BridgeBeginReply> {
    let command: z.infer<typeof commandSchema>;
    try {
      command = Object.freeze(commandSchema.parse(readBoundedResearchJson(input)));
    } catch {
      throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
    }

    const before = await this.readPair(command);
    if (hasGrant(before)) return this.reply(before.execution);
    if (!command.newExecutionAllowed) throw new ResearchRepositoryError("CONFLICT");
    if (before.run.state !== "queued" || before.execution.admissionState !== "admitted"
      || before.execution.beganAt !== null || before.execution.executionExpiresAt !== null
      || before.execution.closedAt !== null || before.execution.closeReason !== null) {
      throw new ResearchRepositoryError("CONFLICT");
    }

    const values = [
      command.runId,
      command.ownerId,
      command.requestId,
      command.jobId,
      command.requestHash,
      before.execution.version,
      before.run.stateVersion,
    ] as const;
    let beginExecution: D1PreparedStatement;
    let beginRun: D1PreparedStatement;
    let firstAssertion: D1PreparedStatement;
    let secondAssertion: D1PreparedStatement;
    try {
      beginExecution = this.db.prepare(`${researchQuotaLedgerCte}
      UPDATE research_site_executions AS e
      SET began_at=${siteSqlNow},execution_expires_at=${siteSqlNow}+1260000,
        version=version+1,updated_at=${siteSqlNow}
      WHERE e.run_id=?1 AND e.user_id=?2 AND e.request_id=?3 AND e.job_id=?4 AND e.request_hash=?5
        AND e.version=?6 AND e.version<${Number.MAX_SAFE_INTEGER}
        AND e.admission_state='admitted' AND e.began_at IS NULL AND e.execution_expires_at IS NULL
        AND e.closed_at IS NULL AND e.close_reason IS NULL
        AND e.admitted_at IS NOT NULL AND ${siteSqlNow}>=e.admitted_at
        AND ${siteSqlNow}<e.queue_expires_at AND ${siteSqlNow}+1260000<=e.reservation_expires_at
        AND EXISTS(
          SELECT 1 FROM research_runs r
          WHERE r.id=e.run_id AND r.user_id=e.user_id AND r.request_id=e.request_id
            AND r.execution_mode='cloudflare-workflow-v1' AND r.remote_quota_key=e.quota_key
            AND r.state='queued' AND r.active_slot=1 AND r.state_version=?7
            AND r.state_version<${Number.MAX_SAFE_INTEGER} AND r.active_expires_at=e.queue_expires_at
        )
        AND ${researchQuotaLiveReservationSql("e.user_id", "e.quota_key", "e.quota_reservation_id")}
        AND ${siteReservedBudgetSql("e", "e.budget_reservation_id")}`).bind(...values);
      beginRun = this.db.prepare(`UPDATE research_runs AS r
      SET state='researching',state_version=state_version+1,
        active_expires_at=(SELECT execution_expires_at FROM research_site_executions WHERE run_id=?1),
        updated_at=(SELECT began_at FROM research_site_executions WHERE run_id=?1)
      WHERE r.id=?1 AND r.user_id=?2 AND r.request_id=?3
        AND r.execution_mode='cloudflare-workflow-v1' AND r.state='queued' AND r.active_slot=1
        AND r.state_version=?7 AND r.state_version<${Number.MAX_SAFE_INTEGER}
        AND EXISTS(
          SELECT 1 FROM research_site_executions e
          WHERE e.run_id=r.id AND e.user_id=r.user_id AND e.request_id=r.request_id
            AND e.job_id=?4 AND e.request_hash=?5 AND e.quota_key=r.remote_quota_key
            AND e.version=?6+1 AND e.admission_state='admitted' AND e.began_at IS NOT NULL
            AND e.execution_expires_at=e.began_at+1260000 AND e.closed_at IS NULL AND e.close_reason IS NULL
            AND r.active_expires_at=e.queue_expires_at
        )`).bind(...values);
      firstAssertion = this.db.prepare(
        "SELECT CASE WHEN changes()=1 THEN 1 ELSE json('') END AS begin_assertion",
      );
      secondAssertion = this.db.prepare(
        "SELECT CASE WHEN changes()=1 THEN 1 ELSE json('') END AS begin_assertion",
      );
    } catch {
      throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
    }

    let batchFailed = false;
    try {
      await this.db.batch([beginExecution, firstAssertion, beginRun, secondAssertion]);
    } catch {
      batchFailed = true;
    }

    let after: CoherentPair;
    try {
      after = await this.readPair(command);
    } catch (error) {
      if (error instanceof ResearchRepositoryError) throw error;
      throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
    }
    if (hasGrant(after)) return this.reply(after.execution);
    throw new ResearchRepositoryError(batchFailed ? "CONFLICT" : "RESEARCH_UNAVAILABLE");
  }

  private readPair(command: z.infer<typeof commandSchema>): Promise<CoherentPair> {
    return readCoherentPair(async () => {
      const run = await this.runs.getRun(command.ownerId, command.runId);
      if (!run) throw new ResearchRepositoryError("NOT_FOUND");
      if (run.executionMode === "synchronous") throw new ResearchRepositoryError("CONFLICT");
      const execution = await this.executions.read(command.ownerId, command.runId);
      if (!execution) throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
      if (!sameCommandIdentity(command, execution)) throw new ResearchRepositoryError("CONFLICT");
      assertCoherent(run, execution);
      return Object.freeze({ run, execution });
    });
  }

  private async reply(execution: SiteExecutionRecord): Promise<BridgeBeginReply> {
    if (execution.beganAt === null || execution.executionExpiresAt === null) {
      throw new ResearchRepositoryError("CONFLICT");
    }
    let row: Record<string, unknown> | null;
    try {
      row = await this.db.prepare(`SELECT ${siteSqlNow} AS observed_at`).first<Record<string, unknown>>();
    } catch {
      throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
    }
    const observedAt = row?.observed_at;
    if (!Number.isSafeInteger(observedAt) || (observedAt as number) < execution.beganAt) {
      throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
    }
    try {
      return parseBridgeBeginReply({
        grant: {
          protocol: execution.job.protocol,
          jobId: execution.jobId,
          requestHash: execution.requestHash,
          beganAt: execution.beganAt,
          executionExpiresAt: execution.executionExpiresAt,
        },
        observedAt,
        remainingMs: Math.max(0, execution.executionExpiresAt - (observedAt as number)),
      });
    } catch {
      throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
    }
  }
}

type CoherentPair = Readonly<{ run: ResearchRunRecord; execution: SiteExecutionRecord }>;

async function readCoherentPair<T>(readStrictPair: () => Promise<T>): Promise<T> {
  try {
    return await readStrictPair();
  } catch (error) {
    if (!(error instanceof ResearchRepositoryError) || error.code !== "RESEARCH_UNAVAILABLE") throw error;
  }
  return readStrictPair();
}

function sameCommandIdentity(command: z.infer<typeof commandSchema>, execution: SiteExecutionRecord): boolean {
  return execution.ownerId === command.ownerId
    && execution.runId === command.runId
    && execution.requestId === command.requestId
    && execution.jobId === command.jobId
    && execution.requestHash === command.requestHash;
}

function assertCoherent(run: ResearchRunRecord, execution: SiteExecutionRecord): void {
  const immutable = run.ownerId === execution.ownerId
    && run.id === execution.runId
    && run.requestId === execution.requestId
    && run.executionMode === "cloudflare-workflow-v1"
    && run.remoteQuotaKey === execution.quotaKey
    && run.inputFingerprint === execution.job.inputFingerprint
    && run.configFingerprint === execution.job.configFingerprint
    && run.rawRole === execution.job.role
    && run.locale === execution.job.locale
    && run.createdAt === execution.createdAt;
  const queued = run.state === "queued"
    && execution.beganAt === null
    && execution.executionExpiresAt === null
    && run.activeExpiresAt === execution.job.queueExpiresAt;
  const running = ["researching", "validating"].includes(run.state)
    && execution.admissionState === "admitted"
    && execution.beganAt !== null
    && execution.executionExpiresAt !== null
    && run.activeExpiresAt === execution.executionExpiresAt;
  const terminal = !["queued", "researching", "validating"].includes(run.state)
    && run.activeExpiresAt === null;
  const closedIsInactive = execution.admissionState !== "closed"
    || !["queued", "researching", "validating"].includes(run.state);
  if (!immutable || (!queued && !running && !terminal) || !closedIsInactive) {
    throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
  }
}

function hasGrant(pair: CoherentPair): boolean {
  return pair.execution.admissionState === "admitted"
    && pair.execution.beganAt !== null
    && pair.execution.executionExpiresAt !== null
    && pair.execution.closedAt === null
    && pair.execution.closeReason === null
    && pair.run.state !== "queued";
}
