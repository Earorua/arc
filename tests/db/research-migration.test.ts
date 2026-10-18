import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { describe, expect, it } from "vitest";

const migrationNames = ["0000_beta_foundation", "0001_secure_account_linking", "0002_product_intelligence",
  "0003_adaptive_planning", "0004_proof_backed_stack", "0005_openrouter_research_beta", "0006_research_health_indexes"];
type Database = InstanceType<typeof DatabaseSync>;
type Row = Record<string, SQLInputValue>;
const midnight = Date.UTC(2026, 8, 1);

function metadata(db: Database) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as Array<{ name: string }>;
  return Object.fromEntries(tables.map(({ name }) => [name, {
    columns: db.prepare(`PRAGMA table_info(\`${name}\`)`).all(),
    foreignKeys: db.prepare(`PRAGMA foreign_key_list(\`${name}\`)`).all(),
    indexes: db.prepare(`PRAGMA index_list(\`${name}\`)`).all(),
    data: db.prepare(`SELECT * FROM \`${name}\``).all(),
  }]));
}

function withDatabase(run: (db: Database, before: ReturnType<typeof metadata>) => void) {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    let before: ReturnType<typeof metadata> = {};
    for (const name of migrationNames) {
      const path = resolve("drizzle", `${name}.sql`);
      expect(existsSync(path), `${name} exists`).toBe(true);
      db.exec(readFileSync(path, "utf8").replaceAll("--> statement-breakpoint", ""));
      if (name === "0004_proof_backed_stack") {
        db.exec(`INSERT INTO users (id,name,email) VALUES ('user-a','A','a@example.com'),('user-b','B','b@example.com');
          INSERT INTO role_blueprints (id,slug,name,status,current_version) VALUES ('stored-role','stored-role','Role','ready','1');
          INSERT INTO role_blueprint_versions (id,role_id,version,status,blueprint_json)
            VALUES ('stored-version','stored-role','1','ready','{}');`);
        before = metadata(db);
      }
    }
    run(db, before);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally { db.close(); }
}

function insert(db: Database, table: string, row: Row) {
  const keys = Object.keys(row);
  db.prepare(`INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).run(...Object.values(row));
}
function runRow(overrides: Row = {}): Row {
  return { id: "run-a", user_id: "user-a", request_id: "request-a", mutation_id: "mutation-a", raw_role: "Developer",
    normalized_role_key: "developer", locale: "en-US", input_fingerprint: "input", config_fingerprint: "config",
    state: "queued", active_slot: 1, active_expires_at: midnight, ...overrides };
}
function packageRow(overrides: Row = {}): Row {
  return { id: "package-a", normalized_role_key: "developer", locale: "en-US", config_fingerprint: "config",
    content_fingerprint: "content", package_json: "{}", quality_json: "{}", blueprint_id: "canonical-role",
    blueprint_version: "1", blueprint_version_id: "stored-version", registry_id: "registry", registry_version: "1",
    observed_at: "2026-08-30", expires_at: midnight, ...overrides };
}
function sourceRow(overrides: Row = {}): Row {
  return { id: "source-a", package_id: "package-a", canonical_url: "https://example.com/guide", title: "Guide",
    hostname: "example.com", source_tier: "primary", observed_at: "2026-08-30", citation_hash: "hash", ...overrides };
}
function bucketRow(overrides: Row = {}): Row {
  return { id: "bucket-day", scope: "research", period_kind: "day", period_start: midnight, ...overrides };
}
function reservationRow(overrides: Row = {}): Row {
  return { id: "reservation-a", request_id: "request-a", run_id: "run-a", day_bucket_id: "bucket-day",
    month_bucket_id: "bucket-month", maximum_reserved_micros: 100, status: "reserved", expires_at: midnight, ...overrides };
}
function seedBudget(db: Database) {
  insert(db, "research_runs", runRow());
  insert(db, "ai_budget_buckets", bucketRow());
  insert(db, "ai_budget_buckets", bucketRow({ id: "bucket-month", period_kind: "month" }));
}
function constraint(action: () => void) { expect(action).toThrow(/constraint|foreign key|unique/iu); }

describe("research beta SQLite migration", () => {
  it("adds exactly five tables and preserves every old column, FK, index and row", () => withDatabase((db, before) => {
    const after = metadata(db);
    expect(Object.keys(after).filter((name) => !(name in before)).sort()).toEqual([
      "ai_budget_buckets", "ai_budget_reservations", "research_packages", "research_runs", "research_source_audits",
    ]);
    for (const [name, prior] of Object.entries(before)) expect(after[name], name).toEqual(prior);
  }));

  it("enforces owner mutation replay and one active identity while allowing terminal NULL slots", () => withDatabase((db) => {
    insert(db, "research_runs", runRow());
    constraint(() => insert(db, "research_runs", runRow({ id: "duplicate-mutation", normalized_role_key: "other" })));
    constraint(() => insert(db, "research_runs", runRow({ id: "duplicate-active", mutation_id: "other" })));
    for (const id of ["terminal-a", "terminal-b"]) insert(db, "research_runs", runRow({
      id, mutation_id: id, state: "failed", active_slot: null, active_expires_at: null,
    }));
    insert(db, "research_runs", runRow({ id: "other-owner", user_id: "user-b" }));
    insert(db, "research_runs", runRow({ id: "other-config", mutation_id: "config", config_fingerprint: "other" }));
    insert(db, "research_runs", runRow({ id: "other-locale", mutation_id: "locale", locale: "zh-CN" }));
  }));

  it("requires existing owners/packages and owner-scoped retry lineage", () => withDatabase((db) => {
    insert(db, "research_runs", runRow());
    insert(db, "research_runs", runRow({ id: "retry", mutation_id: "retry", normalized_role_key: "other", retry_of_run_id: "run-a" }));
    constraint(() => insert(db, "research_runs", runRow({ id: "cross-owner", user_id: "user-b", retry_of_run_id: "run-a" })));
    constraint(() => insert(db, "research_runs", runRow({ id: "no-owner", user_id: "absent" })));
    constraint(() => insert(db, "research_runs", runRow({ id: "no-package", mutation_id: "missing", normalized_role_key: "missing", package_id: "absent" })));
    constraint(() => insert(db, "research_runs", runRow({ id: "no-retry", mutation_id: "missing", normalized_role_key: "missing", retry_of_run_id: "absent" })));
  }));

  it.each([
    { state: "unknown" }, { active_slot: null }, { active_slot: 2 }, { state: "failed" }, { active_expires_at: null },
    { state: "ready", active_slot: null }, { retryable: 2 }, { state_version: -1 }, { state_version: 0.5 },
    { state_version: 9007199254740992 }, { locale: "unknown" }, { error_code: "Raw provider failure message" },
    { error_code: "timeout\u0000raw response" }, { error_code: "a".repeat(65) }, { error_code: "" },
    { error_code: Buffer.from("timeout\u0000raw response") }, { error_code: Buffer.from([0, 1, 255]) },
    { error_code: "-timeout" }, { error_code: "timeout-" }, { error_code: "provider--timeout" },
    { public_failure_category: "raw-secret-message" },
  ] as Row[])("rejects invalid run state/value %j", (change) => withDatabase((db) => constraint(() => insert(db, "research_runs", runRow(change)))));

  it("accepts ready only with an existing package and cleared active slot", () => withDatabase((db) => {
    insert(db, "research_packages", packageRow());
    insert(db, "research_runs", runRow({ state: "ready", active_slot: null, active_expires_at: null, package_id: "package-a" }));
    expect(db.prepare("SELECT state_version,retryable FROM research_runs").get()).toEqual({ state_version: 0, retryable: 0 });
  }));

  it("accepts bounded machine error codes and contract public failure categories", () => withDatabase((db) => {
    insert(db, "research_runs", runRow({ state: "failed", active_slot: null, active_expires_at: null,
      error_code: "a".repeat(64), public_failure_category: "service-unavailable" }));
  }));

  it("enforces cache content/config identity and normalized-version linkage", () => withDatabase((db) => {
    insert(db, "research_packages", packageRow());
    constraint(() => insert(db, "research_packages", packageRow({ id: "duplicate" })));
    insert(db, "research_packages", packageRow({ id: "different-config", config_fingerprint: "different" }));
    constraint(() => insert(db, "research_packages", packageRow({ id: "missing-version", content_fingerprint: "other", blueprint_version_id: "absent" })));
    expect(db.prepare("SELECT blueprint_id,blueprint_version_id FROM research_packages WHERE id='package-a'").get())
      .toEqual({ blueprint_id: "canonical-role", blueprint_version_id: "stored-version" });
  }));

  it.each([{ observed_at: "2026-02-30" }, { observed_at: "30-08-2026" }, { expires_at: midnight + 1 },
    { expires_at: -1 }, { blueprint_version: "" }, { registry_version: "" }] as Row[])("rejects invalid package date/version %j", (change) =>
    withDatabase((db) => constraint(() => insert(db, "research_packages", packageRow(change)))));

  it("enforces source URL identity, package FK, date and tier without storing raw content", () => withDatabase((db) => {
    insert(db, "research_packages", packageRow());
    insert(db, "research_source_audits", sourceRow());
    for (const change of [{ id: "duplicate" }, { id: "missing", package_id: "absent" },
      { id: "tier", canonical_url: "https://example.com/tier", source_tier: "untrusted" },
      { id: "date", canonical_url: "https://example.com/date", observed_at: "2026-02-30" }] as Row[]) {
      constraint(() => insert(db, "research_source_audits", sourceRow(change)));
    }
  }));

  it.each([
    ["research_runs", "candidate_json", 1_048_576], ["research_runs", "quality_json", 16_384],
    ["research_packages", "quality_json", 16_384], ["research_packages", "package_json", 1_900_000],
  ] as const)("bounds %s.%s to %i UTF-8 bytes and valid JSON", (table, column, limit) => withDatabase((db) => {
    const row = table === "research_runs" ? runRow() : packageRow();
    insert(db, table, { ...row, [column]: `"${"a".repeat(limit - 2)}"` });
    constraint(() => db.prepare(`UPDATE ${table} SET ${column} = ?`).run(`"${"a".repeat(limit - 1)}"`));
    constraint(() => db.prepare(`UPDATE ${table} SET ${column} = ?`).run(`"${"界".repeat(Math.floor(limit / 3))}"`));
    constraint(() => db.prepare(`UPDATE ${table} SET ${column} = ?`).run("invalid-json"));
  }));

  it("allows omitted candidate/quality JSON but never a missing ready package payload", () => withDatabase((db) => {
    insert(db, "research_runs", runRow({ state: "needs-review", active_slot: null, active_expires_at: null }));
    constraint(() => insert(db, "research_packages", packageRow({ package_json: null })));
  }));

  it("enforces UTC day/month bucket identity", () => withDatabase((db) => {
    insert(db, "ai_budget_buckets", bucketRow());
    constraint(() => insert(db, "ai_budget_buckets", bucketRow({ id: "duplicate" })));
    insert(db, "ai_budget_buckets", bucketRow({ id: "month", period_kind: "month" }));
    insert(db, "ai_budget_buckets", bucketRow({ id: "other-scope", scope: "other" }));
    for (const change of [{ period_kind: "week" }, { period_start: midnight + 1 },
      { period_kind: "month", period_start: midnight + 86400000 }, { version: -1 }, { version: 0.5 }] as Row[]) {
      constraint(() => insert(db, "ai_budget_buckets", bucketRow({ id: "invalid", scope: "invalid", ...change })));
    }
  }));

  it.each(["reserved_micros", "settled_micros"])("rejects negative, fractional and unsafe bucket %s", (column) => withDatabase((db) => {
    for (const value of [-1, 0.25, 9007199254740992]) constraint(() => insert(db, "ai_budget_buckets", bucketRow({ [column]: value })));
    insert(db, "ai_budget_buckets", bucketRow({ [column]: Number.MAX_SAFE_INTEGER }));
  }));

  it.each(["maximum_reserved_micros", "settled_micros"])("rejects negative, fractional and unsafe reservation %s", (column) => withDatabase((db) => {
    seedBudget(db);
    for (const value of [-1, 0.25, 9007199254740992]) constraint(() => insert(db, "ai_budget_reservations", reservationRow({ [column]: value })));
    insert(db, "ai_budget_reservations", reservationRow({ [column]: Number.MAX_SAFE_INTEGER }));
  }));

  it("rejects reservation replay and missing FKs, and retains referenced billing buckets", () => withDatabase((db) => {
    seedBudget(db);
    insert(db, "ai_budget_reservations", reservationRow());
    constraint(() => insert(db, "ai_budget_reservations", reservationRow({ id: "replay" })));
    for (const change of [{ run_id: "absent" }, { day_bucket_id: "absent" }, { month_bucket_id: "absent" },
      { status: "unknown" }, { maximum_reserved_micros: null }] as Row[]) {
      constraint(() => insert(db, "ai_budget_reservations", reservationRow({ id: "invalid", request_id: "other", ...change })));
    }
    constraint(() => db.exec("DELETE FROM ai_budget_buckets WHERE id='bucket-day'"));
    constraint(() => db.exec("DELETE FROM ai_budget_buckets WHERE id='bucket-month'"));
  }));

  it("records actual settled overruns above the reservation maximum", () => withDatabase((db) => {
    seedBudget(db);
    for (const status of ["reserved", "settled", "conservative-hold", "released"]) {
      insert(db, "ai_budget_reservations", reservationRow({ id: status, request_id: status, status, settled_micros: 150 }));
    }
    expect(db.prepare("SELECT settled_micros FROM ai_budget_reservations WHERE status='settled'").get()).toEqual({ settled_micros: 150 });
  }));

  it("rolls back both bucket updates when the final reservation guard fails", () => withDatabase((db) => {
    seedBudget(db);
    db.exec("BEGIN");
    try {
      db.exec("UPDATE ai_budget_buckets SET reserved_micros=100,version=version+1");
      constraint(() => insert(db, "ai_budget_reservations", reservationRow({ maximum_reserved_micros: null })));
    } finally { db.exec("ROLLBACK"); }
    expect(db.prepare("SELECT reserved_micros,version FROM ai_budget_buckets ORDER BY id").all())
      .toEqual([{ reserved_micros: 0, version: 0 }, { reserved_micros: 0, version: 0 }]);
    expect(db.prepare("SELECT count(*) AS count FROM ai_budget_reservations").get()).toEqual({ count: 0 });
  }));

  it("uses the owner, cache, expiry and budget lookup indexes", () => withDatabase((db) => {
    for (const [query, index] of [
      ["SELECT * FROM research_runs WHERE user_id='a' AND mutation_id='m'", "research_runs_owner_mutation_idx"],
      ["SELECT * FROM research_runs WHERE user_id='a' AND normalized_role_key='r' AND locale='en-US' AND config_fingerprint='c' AND active_slot=1", "research_runs_active_idx"],
      ["SELECT * FROM research_runs WHERE state='researching' AND active_expires_at<1", "research_runs_active_expiry_idx"],
      ["SELECT * FROM research_packages WHERE normalized_role_key='r' AND locale='en-US' AND config_fingerprint='c' AND expires_at>1", "research_packages_cache_idx"],
      ["SELECT * FROM ai_budget_buckets WHERE scope='r' AND period_kind='day' AND period_start=1", "ai_budget_bucket_period_idx"],
      ["SELECT state,COUNT(*) FROM research_runs WHERE updated_at>=1 AND updated_at<2 GROUP BY state", "research_runs_updated_state_idx"],
      ["SELECT status,COUNT(*) FROM ai_budget_reservations WHERE day_bucket_id='d' GROUP BY status", "ai_budget_reservations_day_status_idx"],
    ]) expect(JSON.stringify(db.prepare(`EXPLAIN QUERY PLAN ${query}`).all())).toContain(index);
  }));
});
