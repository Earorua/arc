import { plannerAdviceSchema, type AgentKind, type AgentRunStatus, type PublicAgentRun } from "../../contracts/agents";
import type { AgentUsage } from "./openrouter-provider";

export type AgentReservation = {
  id: string; ownerId: string; goalId: string; kind: AgentKind; message: string; context: string;
  workspaceId: string; baseVersionId: string; revision: number; model: string; effort: string;
  reservedMicros: number; fingerprint: string; createdAt: number;
};
export type StoredAgentRun = PublicAgentRun & { ownerId: string; goalId: string; workspaceId: string;
  providerId: string | null; context: string; fingerprint: string; reservedMicros: number };
export type AgentBudgetLimits = { siteDailyMicros: number; siteMonthlyMicros: number; userDailyMicros: number };
export interface AgentRepository {
  reserve(run: AgentReservation, limits: AgentBudgetLimits): Promise<boolean>;
  find(ownerId: string, goalId: string, id: string): Promise<StoredAgentRun | null>;
  history(ownerId: string, goalId: string): Promise<StoredAgentRun[]>;
  update(run: StoredAgentRun, fields: { status: AgentRunStatus; providerId?: string; answer?: string;
    advice?: PublicAgentRun["advice"]; usage?: AgentUsage; error?: string }): Promise<void>;
}
type Row = { id: string; owner_id: string; goal_id: string; kind: AgentKind; status: AgentRunStatus;
  message: string; context: string; workspace_id: string; base_version_id: string; revision: number;
  provider_id: string | null; model: string; effort: string; fingerprint: string; reserved_micros: number;
  answer: string; advice: string | null; error: string | null; created_at: number };
export class D1AgentRepository implements AgentRepository {
  constructor(private db: D1Database) {}
  async reserve(run: AgentReservation, limits: AgentBudgetLimits) {
    const day = Math.floor(run.createdAt / 86400000) * 86400000;
    const date = new Date(run.createdAt);
    const month = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    // One SQLite statement serializes admission, duplicate detection and all budget checks.
    const result = await this.db.prepare(`INSERT OR IGNORE INTO learning_agent_runs
      (id, owner_id, goal_id, kind, status, message, context, workspace_id, base_version_id, revision,
       model, effort, fingerprint, reserved_micros, created_at, updated_at)
      SELECT ?1, ?2, ?3, ?4, 'starting', ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14
      WHERE NOT EXISTS (SELECT 1 FROM learning_agent_runs WHERE owner_id=?2 AND goal_id=?3 AND kind=?4
        AND status IN ('starting','running'))
      AND COALESCE((SELECT SUM(reserved_micros) FROM learning_agent_runs WHERE created_at>=?15),0)+?13<=?16
      AND COALESCE((SELECT SUM(reserved_micros) FROM learning_agent_runs WHERE owner_id=?2 AND created_at>=?15),0)+?13<=?17
      AND COALESCE((SELECT SUM(reserved_micros) FROM learning_agent_runs WHERE created_at>=?18),0)+?13<=?19
      RETURNING id`).bind(run.id, run.ownerId, run.goalId, run.kind, run.message, run.context,
        run.workspaceId, run.baseVersionId, run.revision, run.model, run.effort, run.fingerprint,
        run.reservedMicros, run.createdAt, day, limits.siteDailyMicros, limits.userDailyMicros,
        month, limits.siteMonthlyMicros).first();
    return Boolean(result);
  }
  async find(ownerId: string, goalId: string, id: string) {
    const row = await this.db.prepare("SELECT * FROM learning_agent_runs WHERE owner_id=?1 AND goal_id=?2 AND id=?3")
      .bind(ownerId, goalId, id).first<Row>();
    return row ? fromRow(row) : null;
  }
  async history(ownerId: string, goalId: string) {
    const rows = await this.db.prepare(`SELECT * FROM learning_agent_runs WHERE owner_id=?1 AND goal_id=?2 AND (
      status IN ('starting','running')
      OR id IN (SELECT id FROM learning_agent_runs WHERE owner_id=?1 AND goal_id=?2 ORDER BY created_at DESC, id DESC LIMIT 30)
      OR id = (SELECT id FROM learning_agent_runs WHERE owner_id=?1 AND goal_id=?2 AND kind='planner' ORDER BY created_at DESC, id DESC LIMIT 1)
      ) ORDER BY created_at DESC, id DESC`)
      .bind(ownerId, goalId).all<Row>();
    return rows.results.map(fromRow).reverse();
  }
  async update(run: StoredAgentRun, fields: { status: AgentRunStatus; providerId?: string; answer?: string;
    advice?: PublicAgentRun["advice"]; usage?: AgentUsage; error?: string }) {
    await this.db.prepare(`UPDATE learning_agent_runs SET status=?1, provider_id=COALESCE(?2,provider_id),
      answer=COALESCE(?3,answer), advice=COALESCE(?4,advice), usage=COALESCE(?5,usage), error=?6, updated_at=?7
      WHERE id=?8 AND owner_id=?9 AND goal_id=?10 AND status IN ('starting','running')`)
      .bind(fields.status, fields.providerId ?? null, fields.answer ?? null,
        fields.advice ? JSON.stringify(fields.advice) : null, fields.usage ? JSON.stringify(fields.usage) : null,
        fields.error ?? null, Date.now(), run.id, run.ownerId, run.goalId).run();
  }
}
function fromRow(row: Row): StoredAgentRun {
  return { id: row.id, ownerId: row.owner_id, goalId: row.goal_id, kind: row.kind, status: row.status,
    message: row.message, context: row.context, workspaceId: row.workspace_id, baseVersionId: row.base_version_id,
    revision: row.revision, providerId: row.provider_id, model: row.model, effort: row.effort,
    fingerprint: row.fingerprint, reservedMicros: row.reserved_micros, answer: row.answer,
    advice: row.advice ? plannerAdviceSchema.parse(JSON.parse(row.advice)) : null,
    error: row.error, createdAt: row.created_at };
}
export function publicRun(run: StoredAgentRun): PublicAgentRun {
  return { id: run.id, kind: run.kind, status: run.status, message: run.message, answer: run.answer,
    advice: run.advice, createdAt: run.createdAt, baseVersionId: run.baseVersionId, revision: run.revision,
    model: run.model, effort: run.effort, error: run.error };
}
