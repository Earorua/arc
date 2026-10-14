// @vitest-environment node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SqliteD1 } from "../helpers/sqlite-d1";

const NOW = 1_800_000_000_000;
const BEGAN_AT = NOW + 1_000;
const EXECUTION_TTL_MS = 1_260_000;
const MIGRATIONS_THROUGH_0008 = [
  "0000_beta_foundation.sql", "0001_secure_account_linking.sql",
  "0002_product_intelligence.sql", "0003_adaptive_planning.sql",
  "0004_proof_backed_stack.sql", "0005_openrouter_research_beta.sql",
  "0006_research_health_indexes.sql", "0007_research_bridge_nonces.sql",
  "0008_research_site_executions.sql",
] as const;
type Value = string | number | null | Uint8Array;

function migrationPath(name: string): string { return resolve(process.cwd(), "drizzle", name); }
function migrationStatements(name: string): string[] {
  return readFileSync(migrationPath(name), "utf8").split("--> statement-breakpoint")
    .map((statement) => statement.trim()).filter(Boolean);
}
function through0008(): SqliteD1 {
  const db = new SqliteD1();
  db.database.exec("PRAGMA foreign_keys = ON");
  for (const file of MIGRATIONS_THROUGH_0008) db.database.exec(migrationStatements(file).join(";"));
  db.database.prepare(
    "INSERT INTO users (id,name,email,email_verified) VALUES ('owner-a','Owner A','owner-a@example.test',0)",
  ).run();
  return db;
}
async function apply0009IfPresent(db: SqliteD1): Promise<void> {
  if (!existsSync(migrationPath("0009_research_site_begin_grants.sql"))) return;
  await db.batch(migrationStatements("0009_research_site_begin_grants.sql")
    .map((statement) => db.prepare(statement)));
}
function insertRun(db: SqliteD1, id: string, remote = true): void {
  db.database.prepare(`INSERT INTO research_runs
    (id,user_id,request_id,mutation_id,raw_role,normalized_role_key,locale,input_fingerprint,
      config_fingerprint,state,state_version,retryable,active_slot,active_expires_at,created_at,
      updated_at,retry_of_run_id,execution_mode,remote_quota_key)
    VALUES (?1,'owner-a',?2,?3,'Data Product Manager',?4,'en-US',?5,
      'config-fingerprint','queued',0,0,1,?6,?7,?7,NULL,?8,?9)`)
    .run(id, `request-${id}`, `mutation-${id}`, `role-${id}`, `input-${id}`,
      NOW + 120_000, NOW, remote ? "cloudflare-workflow-v1" : "synchronous",
      remote ? `quota-key-${id}` : null);
}
function executionValues(id: string, overrides: Partial<Record<string, Value>> = {}): Record<string, Value> {
  const suffix = id.replace(/[^0-9]/gu, "").padStart(12, "0").slice(-12);
  const values: Record<string, Value> = {
    run_id: id, user_id: "owner-a", request_id: `request-${id}`,
    job_id: `11111111-1111-4111-8111-${suffix}`, request_hash: (id.at(-1) ?? "a").repeat(64),
    job_json: "", validation_context_json: JSON.stringify({ marker: id }), quota_key: `quota-key-${id}`,
    cache_days: 30, user_daily_quota: 10, daily_budget_micros: 100_000,
    monthly_budget_micros: 1_000_000, maximum_micros: 50_000,
    queue_expires_at: NOW + 120_000, reservation_expires_at: NOW + 1_380_000,
    admission_state: "pending", version: 0, quota_reservation_id: null,
    budget_reservation_id: null, admitted_at: null, closed_at: null, close_reason: null,
    began_at: null, created_at: NOW, updated_at: NOW, ...overrides,
  };
  values.job_json = JSON.stringify({ jobId: values.job_id, runId: values.run_id,
    requestId: values.request_id, createdAt: values.created_at, queueExpiresAt: values.queue_expires_at });
  return values;
}
function insertExecution(db: SqliteD1, id: string, overrides: Partial<Record<string, Value>> = {}): void {
  const values = executionValues(id, overrides); const columns = Object.keys(values);
  db.database.prepare(`INSERT INTO research_site_executions
    (${columns.join(",")}) VALUES (${columns.map((_, index) => `?${index + 1}`).join(",")})`)
    .run(...Object.values(values) as never[]);
}
function admit(db: SqliteD1, id: string): void {
  db.database.prepare(`UPDATE research_site_executions SET admission_state='admitted',
    quota_reservation_id=?1,budget_reservation_id=?2,admitted_at=?3,version=1,updated_at=?3
    WHERE run_id=?4`).run(`quota-reservation-${id}`, `budget-reservation-${id}`, NOW + 500, id);
}
function begin(db: SqliteD1, id: string): void {
  admit(db, id);
  db.database.prepare("UPDATE research_site_executions SET began_at=?1,version=2,updated_at=?1 WHERE run_id=?2")
    .run(BEGAN_AT, id);
  db.database.prepare(`UPDATE research_runs SET state='researching',state_version=1,
    active_expires_at=?1,updated_at=?2 WHERE id=?3`).run(BEGAN_AT + EXECUTION_TTL_MS, BEGAN_AT, id);
}
function seedUpgradeStates(db: SqliteD1): void {
  insertRun(db, "run-sync-0", false);
  for (const id of ["run-pending-1", "run-admitted-2", "run-closed-3", "run-begun-4"]) {
    insertRun(db, id); insertExecution(db, id);
  }
  admit(db, "run-admitted-2");
  db.database.prepare(`UPDATE research_site_executions SET admission_state='closed',closed_at=?1,
    close_reason='denied',version=1,updated_at=?1 WHERE run_id='run-closed-3'`).run(NOW + 600);
  begin(db, "run-begun-4");
  db.database.prepare(`INSERT INTO quota_ledger
    (id,user_id,purpose,reservation_id,idempotency_key,entry_kind,units,created_at)
    VALUES ('quota-entry-1','owner-a','research','quota-reservation-run-pending-1',
      'quota-key-run-pending-1','reserve',1,?1)`).run(NOW);
  db.database.prepare(`INSERT INTO ai_budget_buckets
    (id,scope,period_kind,period_start,reserved_micros,settled_micros,version,created_at,updated_at)
    VALUES ('day-bucket','site','day',0,50000,0,1,?1,?1),
      ('month-bucket','site','month',0,50000,0,1,?1,?1)`).run(NOW);
  db.database.prepare(`INSERT INTO ai_budget_reservations
    (id,request_id,run_id,day_bucket_id,month_bucket_id,maximum_reserved_micros,
      settled_micros,status,expires_at,created_at,updated_at)
    VALUES ('budget-reservation-run-pending-1','request-run-pending-1','run-pending-1',
      'day-bucket','month-bucket',50000,0,'reserved',?1,?2,?2)`).run(NOW + 1_380_000, NOW);
}
function rows(db: SqliteD1, table: string): unknown[] {
  return db.database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
}

describe("research site begin grant migration", () => {
  it("adds the durable execution deadline column to schema 0008", async () => {
    const db = through0008();
    try {
      await apply0009IfPresent(db);
      const columns = db.database.prepare("PRAGMA table_info(research_site_executions)").all() as Array<Record<string, unknown>>;
      expect(columns.some((row) => row.name === "execution_expires_at")).toBe(true);
    } finally { db.close(); }
  });

  it("backfills only begun evidence and preserves all other durable bytes", async () => {
    const db = through0008();
    try {
      seedUpgradeStates(db);
      const before = { runs: rows(db, "research_runs"), quota: rows(db, "quota_ledger"),
        buckets: rows(db, "ai_budget_buckets"), budgets: rows(db, "ai_budget_reservations"),
        executions: rows(db, "research_site_executions") as Array<Record<string, unknown>>,
        contexts: db.database.prepare(`SELECT run_id,validation_context_json
          FROM research_site_executions ORDER BY run_id`).all() };
      await apply0009IfPresent(db);
      expect(db.database.prepare(`SELECT run_id,admission_state,version,began_at,execution_expires_at
        FROM research_site_executions ORDER BY run_id`).all()).toEqual([
        { run_id: "run-admitted-2", admission_state: "admitted", version: 1, began_at: null, execution_expires_at: null },
        { run_id: "run-begun-4", admission_state: "admitted", version: 3, began_at: BEGAN_AT, execution_expires_at: BEGAN_AT + EXECUTION_TTL_MS },
        { run_id: "run-closed-3", admission_state: "closed", version: 1, began_at: null, execution_expires_at: null },
        { run_id: "run-pending-1", admission_state: "pending", version: 0, began_at: null, execution_expires_at: null },
      ]);
      const afterExecutions = rows(db, "research_site_executions") as Array<Record<string, unknown>>;
      for (const oldRow of before.executions) {
        const current = afterExecutions.find((row) => row.run_id === oldRow.run_id)!;
        const { execution_expires_at: deadline, version, ...unchanged } = current;
        const { version: oldVersion, ...oldUnchanged } = oldRow;
        expect(unchanged).toEqual(oldUnchanged);
        expect(version).toBe((oldVersion as number) + (oldRow.began_at === null ? 0 : 1));
        expect(deadline).toBe(oldRow.began_at === null ? null : (oldRow.began_at as number) + EXECUTION_TTL_MS);
      }
      expect(rows(db, "research_runs")).toEqual(before.runs);
      expect(rows(db, "quota_ledger")).toEqual(before.quota);
      expect(rows(db, "ai_budget_buckets")).toEqual(before.buckets);
      expect(rows(db, "ai_budget_reservations")).toEqual(before.budgets);
      expect(db.database.prepare(`SELECT run_id,validation_context_json
        FROM research_site_executions ORDER BY run_id`).all()).toEqual(before.contexts);
      expect(db.database.prepare(`SELECT execution_mode,remote_quota_key FROM research_runs
        WHERE id='run-sync-0'`).get()).toEqual({ execution_mode: "synchronous", remote_quota_key: null });
    } finally { db.close(); }
  });

  it.each([["text", "'bad'"], ["fraction", "1800001260000.5"], ["negative", "-1"],
    ["unsafe", "9007199254740992"]])("rejects an invalid %s deadline value", async (_label, deadline) => {
    const db = through0008();
    try {
      insertRun(db, "run-admitted-2"); insertExecution(db, "run-admitted-2"); admit(db, "run-admitted-2");
      await apply0009IfPresent(db);
      expect(() => db.database.exec(`UPDATE research_site_executions
        SET began_at=${BEGAN_AT},execution_expires_at=${deadline},version=2,updated_at=${BEGAN_AT}
        WHERE run_id='run-admitted-2'`)).toThrow();
    } finally { db.close(); }
  });

  it("rejects null-pair mismatches, wrong duration, and the reservation bound", async () => {
    const db = through0008();
    try {
      insertRun(db, "run-admitted-2"); insertExecution(db, "run-admitted-2"); admit(db, "run-admitted-2");
      await apply0009IfPresent(db);
      for (const assignment of [`began_at=${BEGAN_AT}`,
        `execution_expires_at=${BEGAN_AT + EXECUTION_TTL_MS}`,
        `began_at=${BEGAN_AT},execution_expires_at=${BEGAN_AT + EXECUTION_TTL_MS - 1}`]) {
        expect(() => db.database.exec(`UPDATE research_site_executions SET ${assignment},
          version=2,updated_at=${BEGAN_AT} WHERE run_id='run-admitted-2'`)).toThrow();
      }
      db.database.exec("PRAGMA ignore_check_constraints=ON");
      db.database.exec("DROP TRIGGER research_site_executions_identity_immutable");
      expect(() => db.database.exec(`UPDATE research_site_executions
        SET began_at=${BEGAN_AT},execution_expires_at=${BEGAN_AT + EXECUTION_TTL_MS},
          reservation_expires_at=${BEGAN_AT + EXECUTION_TTL_MS - 1},version=2,updated_at=${BEGAN_AT}
        WHERE run_id='run-admitted-2'`)).toThrow();
    } finally { db.close(); }
  });

  it("allows one exact begin pair then prevents replacing or clearing its deadline", async () => {
    const db = through0008();
    try {
      insertRun(db, "run-admitted-2"); insertExecution(db, "run-admitted-2"); admit(db, "run-admitted-2");
      await apply0009IfPresent(db);
      db.database.prepare(`UPDATE research_site_executions SET began_at=?1,execution_expires_at=?2,
        version=2,updated_at=?1 WHERE run_id='run-admitted-2'`).run(BEGAN_AT, BEGAN_AT + EXECUTION_TTL_MS);
      db.database.exec("DROP TRIGGER research_site_executions_lifecycle_guard");
      expect(() => db.database.prepare(`UPDATE research_site_executions SET began_at=?1,
        execution_expires_at=?2,version=3,updated_at=?1 WHERE run_id='run-admitted-2'`)
        .run(BEGAN_AT + 1, BEGAN_AT + EXECUTION_TTL_MS + 1)).toThrow();
      expect(() => db.database.prepare(`UPDATE research_site_executions SET began_at=NULL,execution_expires_at=NULL,
        version=3,updated_at=?1 WHERE run_id='run-admitted-2'`).run(BEGAN_AT + 1)).toThrow();
    } finally { db.close(); }
  });

  it("does not let a new unbegun execution carry a deadline", async () => {
    const db = through0008();
    try {
      await apply0009IfPresent(db); insertRun(db, "run-pending-1");
      db.database.exec("PRAGMA ignore_check_constraints=ON");
      expect(() => insertExecution(db, "run-pending-1", {
        execution_expires_at: BEGAN_AT + EXECUTION_TTL_MS,
      })).toThrow();
    } finally { db.close(); }
  });

  it("rolls back the complete migration when a begun version cannot increment", async () => {
    const db = through0008();
    try {
      insertRun(db, "run-begun-4"); insertExecution(db, "run-begun-4"); begin(db, "run-begun-4");
      const trigger = db.database.prepare(`SELECT sql FROM sqlite_master
        WHERE type='trigger' AND name='research_site_executions_lifecycle_guard'`).get() as { sql: string };
      db.database.exec("DROP TRIGGER research_site_executions_lifecycle_guard");
      db.database.prepare("UPDATE research_site_executions SET version=?1 WHERE run_id='run-begun-4'")
        .run(Number.MAX_SAFE_INTEGER);
      db.database.exec(trigger.sql);
      const before = db.database.prepare("SELECT * FROM research_site_executions WHERE run_id='run-begun-4'").get();
      await expect(apply0009IfPresent(db)).rejects.toThrow();
      expect(db.database.prepare("PRAGMA table_info(research_site_executions)").all()
        .some((column) => (column as Record<string, unknown>).name === "execution_expires_at")).toBe(false);
      expect(db.database.prepare("SELECT * FROM research_site_executions WHERE run_id='run-begun-4'").get()).toEqual(before);
    } finally { db.close(); }
  });
});
