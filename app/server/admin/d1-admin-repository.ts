import type { AdminHealthSnapshot, AdminRepository } from "./repository";

type FlagRow = { enabled: number };
type AiRow = { calls_today: number; accepted_today: number };
type BudgetRow = { budget_units_today: number };
type MigrationRow = { pending: number; failed_24h: number; completed_24h: number };
type FailureRow = {
  request_id: string;
  route: string;
  result_code: string;
  occurred_at: number;
};

function utcDayStart(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function count(value: unknown): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) && result >= 0 ? Math.floor(result) : 0;
}

export class D1AdminRepository implements AdminRepository {
  constructor(
    private readonly db: D1Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getHealthSnapshot(): Promise<AdminHealthSnapshot> {
    const now = this.now();
    const nowMs = now.getTime();
    const today = utcDayStart(now);
    const since24h = nowMs - 24 * 60 * 60 * 1000;

    const [flag, ai, budget, migrations, failureResult] = await Promise.all([
      this.db.prepare(`
        SELECT enabled
        FROM feature_flags
        WHERE key = ?1
        LIMIT 1
      `).bind("role-research-preview").first<FlagRow>(),
      this.db.prepare(`
        SELECT
          COUNT(*) AS calls_today,
          COALESCE(SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END), 0) AS accepted_today
        FROM ai_runs
        WHERE created_at >= ?1 AND created_at < ?2
      `).bind(today, nowMs + 1).first<AiRow>(),
      this.db.prepare(`
        SELECT COALESCE(SUM(units), 0) AS budget_units_today
        FROM quota_ledger
        WHERE entry_kind = 'accepted' AND created_at >= ?1 AND created_at < ?2
      `).bind(today, nowMs + 1).first<BudgetRow>(),
      this.db.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN status = 'started' THEN 1 ELSE 0 END), 0) AS pending,
          COALESCE(SUM(CASE WHEN status = 'failed' AND started_at >= ?1 THEN 1 ELSE 0 END), 0) AS failed_24h,
          COALESCE(SUM(CASE WHEN status = 'completed' AND completed_at >= ?1 THEN 1 ELSE 0 END), 0) AS completed_24h
        FROM migration_runs
      `).bind(since24h).first<MigrationRow>(),
      this.db.prepare(`
        SELECT request_id, route, result_code, occurred_at
        FROM operational_events
        WHERE result_code NOT IN ('OK', 'IMPORTED', 'COMPLETED') AND occurred_at >= ?1
        ORDER BY occurred_at DESC
        LIMIT 12
      `).bind(since24h).all<FailureRow>(),
    ]);

    const migrationSnapshot = {
      pending: count(migrations?.pending),
      failed24h: count(migrations?.failed_24h),
      completed24h: count(migrations?.completed_24h),
    };
    const failures = (failureResult.results ?? []).map((row) => ({
      requestId: row.request_id,
      route: row.route,
      code: row.result_code,
      occurredAt: new Date(row.occurred_at).toISOString(),
    }));
    return {
      service: migrationSnapshot.failed24h > 0 || failures.length > 0 ? "degraded" : "ok",
      ai: {
        enabled: Boolean(flag?.enabled),
        callsToday: count(ai?.calls_today),
        acceptedToday: count(ai?.accepted_today),
        budgetUnitsToday: count(budget?.budget_units_today),
      },
      migrations: migrationSnapshot,
      failures,
    };
  }
}
