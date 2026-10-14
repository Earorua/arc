import { RESEARCH_QUOTA_PURPOSE } from "./repository";

const MAX = Number.MAX_SAFE_INTEGER;

// SQLite's default trim removes only ASCII spaces; use ECMAScript trim's exact
// whitespace set so stored keys cannot disagree with the command schemas.
const trimCharacters = "char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)";
const trimmed = (column: string) => `trim(${column},${trimCharacters})`;
// The command schemas count UTF-16 units. SQLite length counts code points, so
// count supplementary pairs only for non-ASCII, bounded to identifier length.
const utf16Length = (column: string) => `(length(${column}) + CASE WHEN length(CAST(${column} AS BLOB))=length(${column}) THEN 0 ELSE (SELECT count(*) FROM identifier_positions WHERE n<=length(${column}) AND unicode(substr(${column},n,1))>65535) END)`;
const invalidIdentifier = (column: string, minimum: number, maximum: number) => `(typeof(${column})<>'text' OR instr(${column},char(0))>0 OR ${column}<>${trimmed(column)} OR length(${column})>${maximum} OR ${utf16Length(column)}<${minimum} OR ${utf16Length(column)}>${maximum})`;

// Aggregate once: reservation_id has no index in the legacy schema. Correlated
// scans here would turn period validation into quadratic work over ledger history.
export const researchQuotaLedgerCte = `WITH RECURSIVE identifier_positions(n) AS MATERIALIZED (
  SELECT 1 UNION ALL SELECT n+1 FROM identifier_positions WHERE n<160
), ledger_groups AS MATERIALIZED (
  SELECT reservation_id,
    SUM(entry_kind='reserved') AS reserved_count, SUM(entry_kind<>'reserved') AS terminal_count,
    MAX(CASE WHEN entry_kind='reserved' THEN user_id END) AS reserved_user,
    MAX(CASE WHEN entry_kind='reserved' THEN purpose END) AS reserved_purpose,
    MAX(CASE WHEN entry_kind='reserved' THEN idempotency_key END) AS reserved_key,
    MAX(CASE WHEN entry_kind='reserved' THEN units END) AS reserved_units,
    MAX(CASE WHEN entry_kind='reserved' THEN created_at END) AS reserved_created_at
  FROM quota_ledger GROUP BY reservation_id
)`;

const groupJoin = "quota_ledger q JOIN ledger_groups g ON g.reservation_id=q.reservation_id";
// quota_ledger predates CHECK constraints. Only validate rows relevant to this
// operation, using the aggregate to detect malformed reservation relationships.
// Group OR terms to keep nested publication proofs within native D1's expression depth.
const invalidLedgerRow = `(
  (typeof(q.units)<>'integer' OR q.units<0 OR q.units>1000
  OR typeof(q.created_at)<>'integer' OR q.created_at<0 OR q.created_at>${MAX})
  OR (q.entry_kind NOT IN ('reserved','accepted','rejected','failed')
  OR (q.entry_kind='reserved' AND q.units<1)
  OR (q.entry_kind IN ('rejected','failed') AND q.units<>0)
  OR (q.purpose='${RESEARCH_QUOTA_PURPOSE}' AND q.entry_kind IN ('reserved','accepted') AND q.units<>1))
  OR (${invalidIdentifier("q.user_id", 1, 160)}
  OR ${invalidIdentifier("q.purpose", 1, 120)}
  OR ${invalidIdentifier("q.reservation_id", 1, 160)}
  OR ${invalidIdentifier("q.idempotency_key", 8, 128)})
  OR (g.reserved_count<>1 OR g.terminal_count>1
  OR g.reserved_user<>q.user_id OR g.reserved_purpose<>q.purpose OR g.reserved_key<>q.idempotency_key OR g.reserved_units<q.units)
)`;

// Include children through their parent reservation, even if a child's owner,
// key or purpose is corrupt. Direct-row scope also catches orphan ledger rows.
const exactScope = (ownerSql: string, keySql: string) => `((q.user_id=${ownerSql} AND q.idempotency_key=${keySql}) OR (g.reserved_user=${ownerSql} AND g.reserved_key=${keySql}))`;

export function researchQuotaInvalidRowsSql(
  ownerSql: string,
  keySql: string,
  periodStartSql?: string,
  periodEndSql?: string,
): string {
  const exact = exactScope(ownerSql, keySql);
  const scope = periodStartSql === undefined || periodEndSql === undefined
    ? exact
    : `(${exact}
  OR (g.reserved_user=${ownerSql} AND ${trimmed("g.reserved_purpose")}='${RESEARCH_QUOTA_PURPOSE}' AND g.reserved_created_at>=${periodStartSql} AND g.reserved_created_at<${periodEndSql})
  OR (q.user_id=${ownerSql} AND ${trimmed("q.purpose")}='${RESEARCH_QUOTA_PURPOSE}' AND q.created_at>=${periodStartSql} AND q.created_at<${periodEndSql}))`;
  return `EXISTS(SELECT 1 FROM ${groupJoin} WHERE ${scope} AND ${invalidLedgerRow})`;
}

export function quotaLedgerPurposePeriodInvalidRowsSql(
  purposeSql: string,
  periodStartSql: string,
  periodEndSql: string,
): string {
  const scope = `((${trimmed("q.purpose")}=${purposeSql} AND q.created_at>=${periodStartSql} AND q.created_at<${periodEndSql})
        OR (${trimmed("g.reserved_purpose")}=${purposeSql} AND ((q.created_at>=${periodStartSql} AND q.created_at<${periodEndSql}) OR (g.reserved_created_at>=${periodStartSql} AND g.reserved_created_at<${periodEndSql}))))`;
  return `EXISTS(SELECT 1 FROM ${groupJoin} WHERE ${scope} AND ${invalidLedgerRow})`;
}

export function researchQuotaLiveReservationSql(
  ownerSql: string,
  keySql: string,
  reservationIdSql: string,
): string {
  return `EXISTS(
    SELECT 1 FROM ledger_groups live
    WHERE (live.reservation_id=${reservationIdSql}
      AND live.reserved_user=${ownerSql} AND live.reserved_key=${keySql})
      AND (live.reserved_count=1 AND live.terminal_count=0
      AND live.reserved_purpose='${RESEARCH_QUOTA_PURPOSE}' AND live.reserved_units=1)
      AND NOT ${researchQuotaInvalidRowsSql(ownerSql, keySql)}
  )`;
}
