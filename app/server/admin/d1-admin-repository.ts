import {
  adminHealthSnapshotSchema,
  type AdminHealthSnapshot,
  type AdminRepository,
} from "./repository";

type FlagRow = { enabled: number };
type AiRow = { calls_today: number; accepted_today: number };
type BudgetRow = { budget_units_today: number };
type ResearchStateRow = { state: unknown; total: unknown };
type ResearchExposureRow = { status: unknown; total_micros: unknown; invalid_rows: unknown };
type ResearchSettledRow = { settled_micros: unknown };
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

function requiredCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("Admin health aggregate is unavailable.");
  }
  return value;
}

function count(value: unknown): number {
  return value === null || value === undefined ? 0 : requiredCount(value);
}

const researchStates = ["queued", "researching", "validating", "ready", "needs-review", "failed"] as const;
const reservationStatuses = ["reserved", "settled", "conservative-hold", "released"] as const;

function researchSnapshot(
  states: ResearchStateRow[],
  exposures: ResearchExposureRow[],
  settled: ResearchSettledRow | null,
) {
  const stateCounts = new Map<string, number>();
  for (const row of states) {
    if (typeof row.state !== "string"
      || !researchStates.includes(row.state as typeof researchStates[number])
      || stateCounts.has(row.state)) {
      throw new Error("Admin health aggregate is unavailable.");
    }
    stateCounts.set(row.state, requiredCount(row.total));
  }
  const exposureCounts = new Map<string, number>();
  for (const row of exposures) {
    if (
      typeof row.status !== "string"
      || !reservationStatuses.includes(row.status as typeof reservationStatuses[number])
      || requiredCount(row.invalid_rows) !== 0
      || exposureCounts.has(row.status)
    ) {
      throw new Error("Admin health aggregate is unavailable.");
    }
    exposureCounts.set(row.status, requiredCount(row.total_micros));
  }
  return {
    queued: stateCounts.get("queued") ?? 0,
    researching: stateCounts.get("researching") ?? 0,
    validating: stateCounts.get("validating") ?? 0,
    ready: stateCounts.get("ready") ?? 0,
    needsReview: stateCounts.get("needs-review") ?? 0,
    failed: stateCounts.get("failed") ?? 0,
    reservedMicros: exposureCounts.get("reserved") ?? 0,
    settledMicros: settled === null ? 0 : requiredCount(settled.settled_micros),
    conservativeHoldMicros: exposureCounts.get("conservative-hold") ?? 0,
  };
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
    const tomorrow = today + 24 * 60 * 60 * 1000;
    const since24h = nowMs - 24 * 60 * 60 * 1000;

    const [flag, ai, budget, researchStateResult, researchExposureResult, researchSettled, migrations, failureResult] = await Promise.all([
      this.db.prepare(`
        SELECT enabled
        FROM feature_flags
        WHERE key = ?1
        LIMIT 1
      `).bind("role-research-beta").first<FlagRow>(),
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
        SELECT state, COUNT(*) AS total
        FROM research_runs
        WHERE updated_at >= ?1 AND updated_at < ?2
        GROUP BY state
        ORDER BY state
      `).bind(today, tomorrow).all<ResearchStateRow>(),
      this.db.prepare(`
        SELECT
          reservation.status AS status,
          COALESCE(SUM(CASE
            WHEN reservation.status IN ('reserved', 'conservative-hold')
              AND typeof(reservation.maximum_reserved_micros) = 'integer'
              AND reservation.maximum_reserved_micros BETWEEN 0 AND ${Number.MAX_SAFE_INTEGER}
            THEN reservation.maximum_reserved_micros
            ELSE 0
          END), 0) AS total_micros,
          COALESCE(SUM(CASE
            WHEN reservation.status NOT IN ('reserved', 'settled', 'conservative-hold', 'released')
              OR typeof(reservation.maximum_reserved_micros) <> 'integer'
              OR reservation.maximum_reserved_micros NOT BETWEEN 0 AND ${Number.MAX_SAFE_INTEGER}
              OR typeof(reservation.settled_micros) <> 'integer'
              OR reservation.settled_micros NOT BETWEEN 0 AND ${Number.MAX_SAFE_INTEGER}
              OR (reservation.status <> 'settled' AND reservation.settled_micros <> 0)
            THEN 1
            ELSE 0
          END), 0) AS invalid_rows
        FROM ai_budget_buckets AS day_bucket
        JOIN ai_budget_reservations AS reservation
          ON reservation.day_bucket_id = day_bucket.id
        WHERE day_bucket.scope = 'site'
          AND day_bucket.period_kind = 'day'
          AND day_bucket.period_start = ?1
        GROUP BY reservation.status
        ORDER BY reservation.status
      `).bind(today).all<ResearchExposureRow>(),
      this.db.prepare(`
        SELECT settled_micros
        FROM ai_budget_buckets
        WHERE scope = 'site' AND period_kind = 'day' AND period_start = ?1
        LIMIT 1
      `).bind(today).first<ResearchSettledRow>(),
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
    return adminHealthSnapshotSchema.parse({
      service: migrationSnapshot.failed24h > 0 || failures.length > 0 ? "degraded" : "ok",
      ai: {
        enabled: Boolean(flag?.enabled),
        callsToday: count(ai?.calls_today),
        acceptedToday: count(ai?.accepted_today),
        budgetUnitsToday: count(budget?.budget_units_today),
      },
      research: researchSnapshot(
        researchStateResult.results ?? [],
        researchExposureResult.results ?? [],
        researchSettled,
      ),
      migrations: migrationSnapshot,
      failures,
    });
  }
}
