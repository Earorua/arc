// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync, type SQLInputValue, type StatementSync } from "node:sqlite";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createResearchD1 } from "../helpers/sqlite-d1";

const moduleUrl = pathToFileURL(resolve(process.cwd(), "scripts/cloudflare-migration/rehearse-auth-cleanup.mjs"));
const now = 1_800_000_000_000;
const timestamp = now - 10_000;
const active = ["pending_reauth", "verified", "consumed", "completing"];
const statuses = [...active, "completed", "failed", "expired"];
const tokenFields = ["access_token", "refresh_token", "id_token", "access_token_expires_at", "refresh_token_expires_at", "scope"];
type Row = Record<string, SQLInputValue>;
type Summary = { kind: "synthetic-only"; sessionsRemoved: number; verificationsRemoved: number; socialAccountsCleared: number; intentsFailed: number; unknownProviderAccounts: number; passwordBearingAccounts: number };
let cleanup: (db: DatabaseSync, nowMs: number) => Summary;
const databases: ReturnType<typeof createResearchD1>[] = [];
beforeAll(async () => {
  expect(existsSync(moduleUrl), "synthetic auth cleanup module must exist").toBe(true);
  cleanup = (await import(moduleUrl.href)).rehearseAuthCleanup;
});
afterEach(() => { vi.restoreAllMocks(); for (const db of databases.splice(0)) db.close(); });

function insert(db: DatabaseSync, table: string, row: Row) {
  const columns = Object.keys(row);
  db.prepare(`INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`).run(...Object.values(row));
}
function fixture() {
  const adapter = createResearchD1(); databases.push(adapter);
  const db = adapter.database;
  for (const id of ["owner-a", "owner-b"]) insert(db, "users", { id, name: id, email: `${id}@example.test`, email_verified: 1, created_at: timestamp, updated_at: timestamp });
  for (const [id, provider, password, tokens] of [
    ["google-a", "google", null, true], ["github-b", "github", null, true],
    ["unknown-b", "saml", null, true], ["credential-a", "credential", "synthetic-password", true],
    ["password-social-b", "google", "synthetic-password", true], ["empty-social-a", "github", null, false],
  ] as const) insert(db, "accounts", { id, provider_id: provider, account_id: `subject-${id}`, user_id: id.endsWith("-b") ? "owner-b" : "owner-a", password, access_token: tokens ? `synthetic-access-${id}` : null, refresh_token: tokens ? `synthetic-refresh-${id}` : null, id_token: tokens ? `synthetic-id-${id}` : null, access_token_expires_at: tokens ? now + 1000 : null, refresh_token_expires_at: tokens ? now + 2000 : null, scope: tokens ? "synthetic-scope" : null, created_at: timestamp, updated_at: timestamp });
  for (const id of ["a", "b"]) insert(db, "sessions", { id: `session-${id}`, token: `synthetic-session-${id}`, user_id: `owner-${id}`, expires_at: now + 1000, created_at: timestamp, updated_at: timestamp });
  insert(db, "verifications", { id: "state", identifier: "synthetic-oauth-state", value: "synthetic-state", expires_at: now + 1000, created_at: timestamp, updated_at: timestamp });
  for (const [index, status] of statuses.entries()) insert(db, "account_link_intents", { id: `intent-${status}`, token_hash: `synthetic-hash-${status}`, user_id: index % 2 ? "owner-b" : "owner-a", source_provider: "google", target_provider: "github", status, expires_at: ["consumed", "completing"].includes(status) ? now - 1 : now + 1000, verified_at: status === "pending_reauth" ? null : timestamp, consumed_at: ["consumed", "completing", "completed"].includes(status) ? timestamp : null, completed_at: status === "completed" ? timestamp : null, failure_code: status === "failed" ? "PREEXISTING_FAILURE" : null, created_at: timestamp, updated_at: timestamp });
  for (const owner of ["a", "b"]) {
    insert(db, "learner_profiles", { id: `profile-${owner}`, user_id: `owner-${owner}`, state_version: 3, created_at: timestamp, updated_at: timestamp });
    insert(db, "career_goals", { id: `goal-${owner}`, user_id: `owner-${owner}`, role_id: "role", level: "junior", weekly_minutes: 120, target_weeks: 8, status: "active", active_slot: 1, created_at: timestamp, updated_at: timestamp });
    insert(db, "proof_items", { id: `proof-${owner}`, user_id: `owner-${owner}`, goal_id: `goal-${owner}`, title: "Synthetic proof", kind: "artifact", created_at: timestamp, updated_at: timestamp });
    insert(db, "proof_assets", { id: `asset-${owner}`, user_id: `owner-${owner}`, proof_id: `proof-${owner}`, object_key: `synthetic/owner-${owner}/proof/file.txt`, filename: "file.txt", content_type: "text/plain", size_bytes: 7, created_at: timestamp });
    insert(db, "research_runs", { id: `research-${owner}`, user_id: `owner-${owner}`, request_id: `research-request-${owner}`, mutation_id: `research-mutation-${owner}`, raw_role: "Synthetic role", normalized_role_key: "synthetic-role", locale: "en-US", input_fingerprint: "input", config_fingerprint: "config", state: "failed", created_at: timestamp, updated_at: timestamp });
  }
  insert(db, "auth_rate_limits", { id: "auth-rate", key: "synthetic-key", count: 4, last_request: timestamp });
  insert(db, "endpoint_rate_buckets", { id: "endpoint-rate", scope: "synthetic", subject_hash: "synthetic-hash", window_start: timestamp, count: 2, expires_at: now + 1000 });
  insert(db, "feature_flags", { key: "synthetic-flag", enabled: 1, cohort_json: '{"synthetic":true}', updated_at: timestamp });
  return db;
}
function schema(db: DatabaseSync) { return db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name,tbl_name,sql").all(); }
function snapshot(db: DatabaseSync) {
  return Object.fromEntries(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all().map(({ name }) => [String(name), db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all().map((row) => ({ ...row }))])) as Record<string, Row[]>;
}
function expectedSnapshot(before: Record<string, Row[]>) {
  const expected = structuredClone(before);
  expected.sessions = []; expected.verifications = [];
  for (const row of expected.accounts) if (["google", "github"].includes(String(row.provider_id)) && row.password === null) for (const field of tokenFields) row[field] = null;
  for (const row of expected.account_link_intents) if (active.includes(String(row.status))) { row.status = "failed"; row.failure_code = "AUTH_MIGRATION_RESET"; row.updated_at = now; }
  return expected;
}
function unchangedFailure(db: DatabaseSync, category: string, nowMs = now) {
  const before = snapshot(db); const beforeSchema = schema(db);
  expect(() => cleanup(db, nowMs)).toThrow(new RegExp(`^AUTH_REHEARSAL_${category}$`));
  expect(snapshot(db)).toEqual(before); expect(schema(db)).toEqual(beforeSchema);
}

describe("synthetic auth migration cleanup", () => {
  it("makes only exact permitted changes, preserves both owners and source, and is idempotent", () => {
    const source = fixture(); const destination = fixture(); const before = snapshot(source); const beforeSchema = schema(source);
    expect(snapshot(destination)).toEqual(before);
    const result = cleanup(destination, now);
    expect(result).toEqual({ kind: "synthetic-only", sessionsRemoved: 2, verificationsRemoved: 1, socialAccountsCleared: 2, intentsFailed: 4, unknownProviderAccounts: 2, passwordBearingAccounts: 2 });
    expect(Object.isFrozen(result)).toBe(true);
    expect(snapshot(destination)).toEqual(expectedSnapshot(before)); expect(schema(destination)).toEqual(beforeSchema);
    expect(snapshot(source)).toEqual(before); expect(schema(source)).toEqual(beforeSchema);
    const after = snapshot(destination);
    const changesBefore = destination.prepare("SELECT total_changes() AS total").get()?.total;
    expect(cleanup(destination, now + 10_000)).toEqual({ ...result, sessionsRemoved: 0, verificationsRemoved: 0, socialAccountsCleared: 0, intentsFailed: 0 });
    expect(snapshot(destination)).toEqual(after);
    expect(destination.prepare("SELECT total_changes() AS total").get()?.total).toBe(changesBefore);
  });

  it.each([NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid now %s", (value) => unchangedFailure(fixture(), "TIME", value));
  it("rejects nonnative handles without accepting file, SQL or CLI inputs", () => {
    for (const value of [":memory:", "DELETE FROM users", { database: fixture() }, {}, Object.create(DatabaseSync.prototype)]) expect(() => cleanup(value as DatabaseSync, now)).toThrow(/^AUTH_REHEARSAL_/);
  });
  it("rejects forged native prototypes and proxies even when methods delegate to a native fixture", () => {
    const db = fixture(); const before = snapshot(db);
    const forged = Object.assign(Object.create(DatabaseSync.prototype), { prepare: db.prepare.bind(db), exec: db.exec.bind(db) });
    const proxy = new Proxy(db, { get(target, key) { const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value; } });
    for (const handle of [forged, proxy]) {
      expect(() => cleanup(handle, now)).toThrow(/^AUTH_REHEARSAL_DATABASE$/);
      expect(snapshot(db)).toEqual(before);
    }
  });
  it("rejects attached databases", () => { const db = fixture(); db.exec("ATTACH DATABASE ':memory:' AS other"); unchangedFailure(db, "DATABASE"); });
  it("rejects unnamed temporary database mode before BEGIN without changing rows or mode", () => {
    const db = new DatabaseSync("");
    try {
      db.exec("PRAGMA foreign_keys=ON");
      for (const file of ["0000_beta_foundation.sql", "0001_secure_account_linking.sql", "0002_product_intelligence.sql", "0003_adaptive_planning.sql", "0004_proof_backed_stack.sql", "0005_openrouter_research_beta.sql", "0006_research_health_indexes.sql"]) {
        db.exec(readFileSync(resolve(process.cwd(), "drizzle", file), "utf8").replaceAll("--> statement-breakpoint", ";"));
      }
      insert(db, "users", { id: "synthetic-temp-owner", name: "synthetic", email: "synthetic-temp@example.test", created_at: timestamp, updated_at: timestamp });
      insert(db, "sessions", { id: "synthetic-temp-session", user_id: "synthetic-temp-owner", token: "synthetic-temp-token", expires_at: now + 1000, created_at: timestamp, updated_at: timestamp });
      expect(db.prepare("PRAGMA database_list").all()).toEqual([{ seq: 0, name: "main", file: "" }]);
      const mode = db.prepare("PRAGMA main.journal_mode").get();
      expect(mode?.journal_mode).toBe("delete");
      const exec = vi.spyOn(db, "exec");
      unchangedFailure(db, "DATABASE");
      expect(exec.mock.calls.some(([sql]) => /^BEGIN\b/.test(sql))).toBe(false);
      expect(db.prepare("PRAGMA main.journal_mode").get()).toEqual(mode);
    } finally { db.close(); }
  });
  it("rejects fixture objects in the temp schema", () => { const db = fixture(); db.exec("CREATE TEMP TABLE synthetic_extra(id TEXT)"); unchangedFailure(db, "DATABASE"); });
  it("rejects temp triggers on main tables", () => { const db = fixture(); db.exec("CREATE TEMP TRIGGER synthetic_extra AFTER DELETE ON main.sessions BEGIN UPDATE users SET name='synthetic-altered'; END"); unchangedFailure(db, "DATABASE"); });
  it("accepts exactly 1000 rows without exceeding the fixture boundary", () => {
    const db = fixture(); const add = db.prepare("INSERT INTO verifications(id,identifier,value,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?)");
    for (let index = 0; index < 999; index++) add.run(`synthetic-${index}`, "synthetic", "synthetic", now, timestamp, timestamp);
    expect(cleanup(db, now).verificationsRemoved).toBe(1000);
  });
  it("preserves terminal intent timestamps even when they are later than supplied now", () => {
    const db = fixture(); db.prepare("UPDATE account_link_intents SET updated_at=? WHERE status IN ('completed','failed','expired')").run(now + 1000);
    const terminal = db.prepare("SELECT * FROM account_link_intents WHERE status IN ('completed','failed','expired') ORDER BY id").all();
    cleanup(db, now);
    expect(db.prepare("SELECT * FROM account_link_intents WHERE id IN ('intent-completed','intent-failed','intent-expired') ORDER BY id").all()).toEqual(terminal);
  });
  it("rejects file-backed main metadata without opening a file", () => {
    const db = fixture(); const prepare = db.prepare.bind(db);
    vi.spyOn(db, "prepare").mockImplementation((sql) => sql === "PRAGMA database_list" ? { all: () => [{ seq: 0, name: "main", file: "synthetic-file.sqlite" }] } as unknown as StatementSync : prepare(sql));
    unchangedFailure(db, "DATABASE");
  });
  it("rejects disabled foreign keys", () => { const db = fixture(); db.exec("PRAGMA foreign_keys=OFF"); unchangedFailure(db, "FOREIGN_KEYS"); });
  it("rejects existing orphans", () => { const db = fixture(); db.exec("PRAGMA foreign_keys=OFF; UPDATE accounts SET user_id='synthetic-missing' WHERE id='google-a'; PRAGMA foreign_keys=ON"); unchangedFailure(db, "FOREIGN_KEYS"); });
  it.each([
    "CREATE TRIGGER extra_trigger AFTER DELETE ON sessions BEGIN UPDATE users SET name='changed'; END",
    "CREATE VIEW extra_view AS SELECT id FROM users", "CREATE TABLE extra_table (id TEXT)",
    "ALTER TABLE users ADD COLUMN extra TEXT", "CREATE INDEX extra_index ON users(name)",
    "DROP INDEX users_email_unique",
  ])("rejects schema drift: %s", (sql) => { const db = fixture(); db.exec(sql); unchangedFailure(db, "SCHEMA"); });
  it.each([
    "UPDATE users SET id='' WHERE id='owner-b'", "UPDATE users SET email='' WHERE id='owner-a'",
    "UPDATE accounts SET account_id='' WHERE id='google-a'", "UPDATE accounts SET provider_id='' WHERE id='google-a'",
    "UPDATE sessions SET token='' WHERE id='session-a'", "UPDATE verifications SET identifier=''",
    "UPDATE account_link_intents SET token_hash='' WHERE id='intent-completing'",
    "UPDATE users SET created_at=-1 WHERE id='owner-a'", "UPDATE accounts SET access_token_expires_at=1.5 WHERE id='google-a'",
    "UPDATE sessions SET expires_at='synthetic-bad' WHERE id='session-a'", "UPDATE verifications SET updated_at=-1",
    "UPDATE account_link_intents SET verified_at=-1 WHERE id='intent-verified'",
    `UPDATE account_link_intents SET updated_at=${now + 1} WHERE id='intent-completing'`,
    "UPDATE account_link_intents SET status='unknown' WHERE id='intent-completing'",
    "UPDATE account_link_intents SET source_provider='saml' WHERE id='intent-completing'",
    "UPDATE account_link_intents SET target_provider='saml' WHERE id='intent-completing'",
    "UPDATE account_link_intents SET failure_code='synthetic-secret-code' WHERE id='intent-failed'",
    `UPDATE account_link_intents SET failure_code='${"A".repeat(65)}' WHERE id='intent-failed'`,
  ])("rejects invalid auth row without changing values: %s", (sql) => {
    const db = fixture();
    // Empty owner ID must remain FK-clean so this exercises identity validation.
    if (sql.includes("SET id=''")) db.exec("PRAGMA foreign_keys=OFF; UPDATE accounts SET user_id='' WHERE user_id='owner-b'; UPDATE sessions SET user_id='' WHERE user_id='owner-b'; UPDATE account_link_intents SET user_id='' WHERE user_id='owner-b'; UPDATE learner_profiles SET user_id='' WHERE user_id='owner-b'; UPDATE career_goals SET user_id='' WHERE user_id='owner-b'; UPDATE proof_items SET user_id='' WHERE user_id='owner-b'; UPDATE proof_assets SET user_id='' WHERE user_id='owner-b'; UPDATE research_runs SET user_id='' WHERE user_id='owner-b'");
    db.exec(sql); db.exec("PRAGMA foreign_keys=ON"); unchangedFailure(db, "VALIDATION");
  });
  it("retains exact identity uniqueness constraints", () => {
    const db = fixture();
    for (const sql of ["UPDATE users SET email='owner-a@example.test' WHERE id='owner-b'", "UPDATE accounts SET provider_id='google',account_id='subject-google-a' WHERE id='github-b'", "UPDATE sessions SET token='synthetic-session-a' WHERE id='session-b'", "UPDATE account_link_intents SET token_hash='synthetic-hash-verified' WHERE id='intent-consumed'"]) expect(() => db.exec(sql)).toThrow();
    expect(cleanup(db, now).intentsFailed).toBe(4);
  });
  it("bounds snapshots at 1000 rows per table", () => {
    const db = fixture(); const add = db.prepare("INSERT INTO verifications(id,identifier,value,expires_at,created_at,updated_at) VALUES (?,?,?, ?,?,?)");
    for (let index = 0; index < 1000; index++) add.run(`synthetic-${index}`, "synthetic", "synthetic", now, timestamp, timestamp);
    unchangedFailure(db, "LIMIT");
  });
  it("rolls back mid-write errors and redacts arbitrary causes", () => {
    const db = fixture(); const prepare = db.prepare.bind(db);
    vi.spyOn(db, "prepare").mockImplementation((sql) => { if (/^DELETE FROM verifications/.test(sql)) throw new Error(`AUTH_REHEARSAL_${"SYNTHETIC_SECRET".repeat(100)}`); return prepare(sql); });
    unchangedFailure(db, "WRITE");
    expect(() => cleanup(db, now)).toThrow(/^AUTH_REHEARSAL_WRITE$/);
  });
  it("rolls back a postcondition mutation to protected business values", () => {
    const db = fixture(); const exec = db.exec.bind(db); let injected = false;
    const prepare = db.prepare.bind(db);
    vi.spyOn(db, "prepare").mockImplementation((sql) => {
      if (!injected && sql.startsWith("UPDATE account_link_intents")) {
        const statement = prepare(sql); const run = statement.run.bind(statement);
        vi.spyOn(statement, "run").mockImplementation((...params) => { const result = run(...params); exec("UPDATE proof_assets SET object_key='synthetic-altered' WHERE id='asset-b'"); injected = true; return result; });
        return statement;
      }
      return prepare(sql);
    });
    unchangedFailure(db, "INVARIANT");
  });
  it("does not roll back a caller transaction when BEGIN fails", () => {
    const db = fixture(); db.exec("BEGIN; UPDATE users SET name='synthetic-caller-write' WHERE id='owner-b'");
    const before = snapshot(db); unchangedFailure(db, "TRANSACTION");
    expect(snapshot(db)).toEqual(before); db.exec("COMMIT");
    expect(db.prepare("SELECT name FROM users WHERE id='owner-b'").get()?.name).toBe("synthetic-caller-write");
  });
});
