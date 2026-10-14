const MAX = Number.MAX_SAFE_INTEGER;

export const siteSqlNow = "CAST(ROUND(unixepoch('subsec') * 1000) AS INTEGER)";

export function siteReservedBudgetSql(executionAlias: string, reservationIdSql: string): string {
  // Keep conjunction groups shallow for D1 when this proof is nested in a mutation guard.
  return `EXISTS(
    SELECT 1 FROM ai_budget_reservations b
    JOIN research_runs budget_run ON budget_run.id=b.run_id
    JOIN ai_budget_buckets day_bucket ON day_bucket.id=b.day_bucket_id
    JOIN ai_budget_buckets month_bucket ON month_bucket.id=b.month_bucket_id
    WHERE (b.id=${reservationIdSql} AND b.run_id=${executionAlias}.run_id AND b.request_id=${executionAlias}.request_id
      AND budget_run.user_id=${executionAlias}.user_id AND budget_run.request_id=b.request_id)
      AND (b.status='reserved' AND b.settled_micros=0
      AND b.maximum_reserved_micros=${executionAlias}.maximum_micros
      AND b.expires_at=${executionAlias}.reservation_expires_at AND ${siteSqlNow}<b.expires_at)
      AND (typeof(b.created_at)='integer' AND b.created_at BETWEEN 0 AND ${MAX}
      AND typeof(b.updated_at)='integer' AND b.updated_at BETWEEN b.created_at AND ${MAX})
      AND (day_bucket.id<>month_bucket.id
      AND day_bucket.scope='site' AND day_bucket.period_kind='day'
      AND month_bucket.scope='site' AND month_bucket.period_kind='month'
      AND day_bucket.period_start=(b.created_at / 86400000) * 86400000
      AND month_bucket.period_start=CAST(strftime('%s',b.created_at / 1000,'unixepoch','start of month') AS INTEGER) * 1000)
      AND (typeof(day_bucket.reserved_micros)='integer' AND day_bucket.reserved_micros>=b.maximum_reserved_micros
      AND typeof(month_bucket.reserved_micros)='integer' AND month_bucket.reserved_micros>=b.maximum_reserved_micros)
      AND (typeof(day_bucket.settled_micros)='integer' AND day_bucket.settled_micros BETWEEN 0 AND ${MAX}
      AND typeof(month_bucket.settled_micros)='integer' AND month_bucket.settled_micros BETWEEN 0 AND ${MAX})
      AND (day_bucket.reserved_micros<=${MAX}-day_bucket.settled_micros
      AND month_bucket.reserved_micros<=${MAX}-month_bucket.settled_micros)
      AND (typeof(day_bucket.version)='integer' AND day_bucket.version BETWEEN 0 AND ${MAX}
      AND typeof(month_bucket.version)='integer' AND month_bucket.version BETWEEN 0 AND ${MAX})
  )`;
}
