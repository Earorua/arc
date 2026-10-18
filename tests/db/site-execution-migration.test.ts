// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SqliteD1 } from "../helpers/sqlite-d1";

const NOW = 1_800_000_000_000;
const QUEUE_EXPIRES_AT = NOW + 120_000;
const RESERVATION_EXPIRES_AT = NOW + 1_380_000;
const REMOTE_KEY = "quota-key-remote-1";
const MIGRATIONS_THROUGH_0007 = [
  "0000_beta_foundation.sql",
  "0001_secure_account_linking.sql",
  "0002_product_intelligence.sql",
  "0003_adaptive_planning.sql",
  "0004_proof_backed_stack.sql",
  "0005_openrouter_research_beta.sql",
  "0006_research_health_indexes.sql",
  "0007_research_bridge_nonces.sql",
] as const;

type Value = string | number | null | Uint8Array;

function migration(name: string): string {
  return readFileSync(resolve(process.cwd(), "drizzle", name), "utf8")
    .replaceAll("--> statement-breakpoint", ";");
}

function through0007(): SqliteD1 {
  const db = new SqliteD1();
  db.database.exec("PRAGMA foreign_keys = ON");
  for (const file of MIGRATIONS_THROUGH_0007) db.database.exec(migration(file));
  db.database.prepare(
    "INSERT INTO users (id,name,email,email_verified) VALUES (?1,?2,?3,0)",
  ).run("owner-a", "Owner A", "owner-a@example.test");
  return db;
}

function apply0008(db: SqliteD1): void {
  db.database.exec(migration("0008_research_site_executions.sql"));
}

function insertRun(db: SqliteD1, values: {
  id?: string;
  requestId?: string;
  mutationId?: string;
  executionMode?: Value;
  remoteQuotaKey?: Value;
  normalizedRoleKey?: string;
  createdAt?: number;
  activeExpiresAt?: number;
} = {}): void {
  const createdAt = values.createdAt ?? NOW;
  db.database.prepare(`INSERT INTO research_runs
    (id,user_id,request_id,mutation_id,raw_role,normalized_role_key,locale,input_fingerprint,
      config_fingerprint,state,state_version,retryable,active_slot,active_expires_at,created_at,
      updated_at,retry_of_run_id,execution_mode,remote_quota_key)
    VALUES (?1,'owner-a',?2,?3,'Data Product Manager',?4,'en-US',
      'input-fingerprint-1','config-fingerprint-1','queued',0,0,1,?5,?6,?6,NULL,?7,?8)`)
    .run(
      values.id ?? "run-remote-1",
      values.requestId ?? "request-remote-1",
      values.mutationId ?? "mutation-remote-1",
      values.normalizedRoleKey ?? "data-product-manager",
      values.activeExpiresAt ?? createdAt + 120_000,
      createdAt,
      values.executionMode === undefined ? "cloudflare-workflow-v1" : values.executionMode,
      values.remoteQuotaKey === undefined ? REMOTE_KEY : values.remoteQuotaKey,
    );
}

function executionValues(overrides: Partial<Record<string, Value>> = {}): Record<string, Value> {
  const base: Record<string, Value> = {
    run_id: "run-remote-1",
    user_id: "owner-a",
    request_id: "request-remote-1",
    job_id: "11111111-1111-4111-8111-111111111111",
    request_hash: "a".repeat(64),
    validation_context_json: "{}",
    quota_key: REMOTE_KEY,
    cache_days: 30,
    user_daily_quota: 10,
    daily_budget_micros: 100_000,
    monthly_budget_micros: 1_000_000,
    maximum_micros: 50_000,
    queue_expires_at: QUEUE_EXPIRES_AT,
    reservation_expires_at: RESERVATION_EXPIRES_AT,
    admission_state: "pending",
    version: 0,
    quota_reservation_id: null,
    budget_reservation_id: null,
    admitted_at: null,
    closed_at: null,
    close_reason: null,
    began_at: null,
    created_at: NOW,
    updated_at: NOW,
  };
  const values: Record<string, Value> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) values[key] = value;
  }
  values.job_json = overrides.job_json === undefined ? JSON.stringify({
    jobId: values.job_id,
    runId: values.run_id,
    requestId: values.request_id,
    createdAt: values.created_at,
    queueExpiresAt: values.queue_expires_at,
  }) : overrides.job_json;
  return values;
}

function insertExecution(db: SqliteD1, overrides: Partial<Record<string, Value>> = {}): void {
  const values = executionValues(overrides);
  const columns = Object.keys(values);
  db.database.prepare(`INSERT INTO research_site_executions
    (${columns.join(",")}) VALUES (${columns.map((_, index) => `?${index + 1}`).join(",")})`)
    .run(...Object.values(values) as never[]);
}

function remoteDb(): SqliteD1 {
  const db = through0007();
  apply0008(db);
  insertRun(db);
  return db;
}

describe("research site execution migration", () => {
  it("upgrades a database through 0007 without changing any old run field", () => {
    const db = through0007();
    try {
      db.database.prepare(`INSERT INTO research_runs
        (id,user_id,request_id,mutation_id,raw_role,normalized_role_key,locale,input_fingerprint,
          config_fingerprint,state,state_version,retryable,active_slot,active_expires_at,created_at,updated_at)
        VALUES ('old-run','owner-a','old-request','old-mutation','Old Role','old-role','en-US',
          'old-input','old-config','queued',0,0,1,?1,?2,?2)`)
        .run(NOW + 60_000, NOW);
      const before = db.database.prepare("SELECT * FROM research_runs WHERE id='old-run'").get();

      apply0008(db);

      const after = db.database.prepare("SELECT * FROM research_runs WHERE id='old-run'").get() as Record<string, unknown>;
      const { execution_mode: executionMode, remote_quota_key: remoteQuotaKey, ...oldFields } = after;
      expect(oldFields).toEqual(before);
      expect({ executionMode, remoteQuotaKey }).toEqual({
        executionMode: "synchronous",
        remoteQuotaKey: null,
      });
    } finally {
      db.close();
    }
  });

  it("stores one valid explicit remote execution and exposes its maintenance index", () => {
    const db = remoteDb();
    try {
      expect(() => insertExecution(db)).not.toThrow();
      expect(db.database.prepare(`SELECT run_id,user_id,request_id,job_id,quota_key,
        admission_state,version FROM research_site_executions`).get()).toEqual({
        run_id: "run-remote-1",
        user_id: "owner-a",
        request_id: "request-remote-1",
        job_id: "11111111-1111-4111-8111-111111111111",
        quota_key: REMOTE_KEY,
        admission_state: "pending",
        version: 0,
      });
      expect(db.database.prepare(`SELECT name FROM sqlite_master
        WHERE type='index' AND name='research_site_executions_maintenance_idx'`).get())
        .toEqual({ name: "research_site_executions_maintenance_idx" });
    } finally {
      db.close();
    }
  });

  it.each([
    ["unknown mode", "other", null],
    ["null mode", null, null],
    ["remote without key", "cloudflare-workflow-v1", null],
    ["synchronous with key", "synchronous", REMOTE_KEY],
    ["short key", "cloudflare-workflow-v1", "short"],
    ["oversized key", "cloudflare-workflow-v1", "q".repeat(129)],
    ["blob key", "cloudflare-workflow-v1", new Uint8Array(8)],
  ])("rejects an invalid run execution classification: %s", (_label, executionMode, remoteQuotaKey) => {
    const db = through0007();
    try {
      apply0008(db);
      expect(() => insertRun(db, { executionMode, remoteQuotaKey })).toThrow();
    } finally {
      db.close();
    }
  });

  it("keeps the run execution classification immutable", () => {
    const db = remoteDb();
    try {
      expect(() => db.database.prepare(`UPDATE research_runs
        SET execution_mode='synchronous',remote_quota_key=NULL WHERE id='run-remote-1'`).run())
        .toThrow();
      expect(db.database.prepare(`SELECT execution_mode,remote_quota_key FROM research_runs
        WHERE id='run-remote-1'`).get()).toEqual({
        execution_mode: "cloudflare-workflow-v1",
        remote_quota_key: REMOTE_KEY,
      });
    } finally {
      db.close();
    }
  });

  it("uniquely reserves non-null remote quota keys per owner while allowing synchronous null keys", () => {
    const db = through0007();
    try {
      apply0008(db);
      insertRun(db);
      expect(() => insertRun(db, {
        id: "run-remote-2",
        requestId: "request-remote-2",
        mutationId: "mutation-remote-2",
        normalizedRoleKey: "data-product-manager-2",
      })).toThrow(/research_runs\.user_id, research_runs\.remote_quota_key/u);
      insertRun(db, {
        id: "run-sync-1",
        requestId: "request-sync-1",
        mutationId: "mutation-sync-1",
        normalizedRoleKey: "sync-role-1",
        executionMode: "synchronous",
        remoteQuotaKey: null,
      });
      insertRun(db, {
        id: "run-sync-2",
        requestId: "request-sync-2",
        mutationId: "mutation-sync-2",
        normalizedRoleKey: "sync-role-2",
        executionMode: "synchronous",
        remoteQuotaKey: null,
      });
      expect(db.database.prepare("SELECT count(*) AS count FROM research_runs").get())
        .toEqual({ count: 3 });
    } finally {
      db.close();
    }
  });

  it.each([
    ["wrong owner", { user_id: "missing-owner" }],
    ["wrong request", { request_id: "wrong-request" }],
    ["wrong quota", { quota_key: "different-quota-key" }],
    ["null quota", { quota_key: null }],
    ["bad hash", { request_hash: "A".repeat(64) }],
    ["blob hash", { request_hash: new Uint8Array(64) }],
    ["hash with hidden NUL suffix", { request_hash: `${"a".repeat(64)}\0x` }],
    ["invalid job JSON", { job_json: "{" }],
    ["null job JSON", { job_json: null }],
    ["oversized job JSON", { job_json: JSON.stringify({ padding: "x".repeat(4096) }) }],
    ["invalid context JSON", { validation_context_json: "{" }],
    ["oversized context JSON", { validation_context_json: JSON.stringify({ padding: "x".repeat(4096) }) }],
    ["zero cache days", { cache_days: 0 }],
    ["nonnumeric cache days", { cache_days: "thirty" }],
    ["excess cache days", { cache_days: 366 }],
    ["fractional quota", { user_daily_quota: 1.5 }],
    ["zero daily budget", { daily_budget_micros: 0 }],
    ["unsafe monthly budget", { monthly_budget_micros: Number.MAX_SAFE_INTEGER + 1 }],
    ["excess maximum", { maximum_micros: 5_000_001 }],
    ["wrong queue expiry", { queue_expires_at: QUEUE_EXPIRES_AT + 1 }],
    ["wrong reservation expiry", { reservation_expires_at: RESERVATION_EXPIRES_AT + 1 }],
    ["unknown state", { admission_state: "unknown" }],
    ["negative version", { version: -1 }],
    ["noninitial version", { version: 1 }],
    ["partial reservation", { quota_reservation_id: "quota-reservation" }],
    ["admitted without markers", { admission_state: "admitted" }],
    ["closed without reason", { admission_state: "closed", closed_at: NOW + 1 }],
    ["pending with began marker", { began_at: NOW + 1 }],
    ["timestamp overflow", { created_at: Number.MAX_SAFE_INTEGER }],
    ["updated before creation", { updated_at: NOW - 1 }],
  ])("rejects invalid execution storage: %s", (_label, overrides) => {
    const db = remoteDb();
    try {
      expect(() => insertExecution(db, overrides)).toThrow();
      expect(db.database.prepare("SELECT count(*) AS count FROM research_site_executions").get())
        .toEqual({ count: 0 });
    } finally {
      db.close();
    }
  });

  it.each([
    ["nonqueued parent", "UPDATE research_runs SET state='researching' WHERE id='run-remote-1'"],
    ["mismatched active expiry", "UPDATE research_runs SET active_expires_at=active_expires_at+1 WHERE id='run-remote-1'"],
    ["mismatched creation time", "UPDATE research_runs SET created_at=created_at-1 WHERE id='run-remote-1'"],
  ])("rejects an execution whose parent run is %s", (_label, mutation) => {
    const db = remoteDb();
    try {
      db.database.exec(mutation);
      expect(() => insertExecution(db)).toThrow();
      expect(db.database.prepare("SELECT count(*) AS count FROM research_site_executions").get())
        .toEqual({ count: 0 });
    } finally {
      db.close();
    }
  });

  it.each(["jobId", "runId", "requestId", "createdAt", "queueExpiresAt"])(
    "rejects a missing or mismatched job JSON identity: %s",
    (field) => {
      const db = remoteDb();
      try {
        const job = JSON.parse(executionValues().job_json as string) as Record<string, unknown>;
        delete job[field];
        expect(() => insertExecution(db, { job_json: JSON.stringify(job) })).toThrow();
        job[field] = field.endsWith("At") ? NOW + 1 : "wrong";
        expect(() => insertExecution(db, { job_json: JSON.stringify(job) })).toThrow();
      } finally {
        db.close();
      }
    },
  );

  it("declares the execution uniqueness, maintenance, and owner foreign-key indexes", () => {
    const db = remoteDb();
    try {
      const indexes = db.database.prepare("PRAGMA index_list('research_site_executions')").all() as Array<Record<string, unknown>>;
      expect(indexes.map(({ name, unique }) => ({ name, unique }))).toEqual(expect.arrayContaining([
        { name: "research_site_executions_request_idx", unique: 1 },
        { name: "research_site_executions_job_idx", unique: 1 },
        { name: "research_site_executions_owner_quota_idx", unique: 1 },
        { name: "research_site_executions_maintenance_idx", unique: 0 },
      ]));
      const foreignKeys = db.database.prepare("PRAGMA foreign_key_list('research_site_executions')").all() as Array<Record<string, unknown>>;
      expect(foreignKeys.map(({ from, to, on_delete }) => ({ from, to, on_delete })))
        .toEqual(expect.arrayContaining([
          { from: "run_id", to: "id", on_delete: "RESTRICT" },
          { from: "user_id", to: "user_id", on_delete: "RESTRICT" },
        ]));
    } finally {
      db.close();
    }
  });

  it.each(["job", "request"])("rejects a duplicate execution %s identity", (identity) => {
    const db = remoteDb();
    try {
      insertExecution(db);
      insertRun(db, {
        id: "run-remote-2",
        requestId: identity === "request" ? "request-remote-1" : "request-remote-2",
        mutationId: "mutation-remote-2",
        remoteQuotaKey: "quota-key-remote-2",
        normalizedRoleKey: "data-product-manager-2",
      });
      expect(() => insertExecution(db, {
        run_id: "run-remote-2",
        request_id: identity === "request" ? "request-remote-1" : "request-remote-2",
        quota_key: "quota-key-remote-2",
        job_id: identity === "job"
          ? "11111111-1111-4111-8111-111111111111"
          : "22222222-2222-4222-8222-222222222222",
      })).toThrow(new RegExp(`research_site_executions\\.${identity}_id`, "u"));
    } finally {
      db.close();
    }
  });

  it("restricts deleting an execution's parent run", () => {
    const db = remoteDb();
    try {
      insertExecution(db);
      expect(() => db.database.prepare("DELETE FROM research_runs WHERE id='run-remote-1'").run())
        .toThrow();
    } finally {
      db.close();
    }
  });

  it.each([
    ["run_id", "other-run"],
    ["user_id", "owner-b"],
    ["request_id", "other-request"],
    ["job_id", "22222222-2222-4222-8222-222222222222"],
    ["request_hash", "b".repeat(64)],
    ["job_json", "{}"],
    ["validation_context_json", "[]"],
    ["quota_key", "other-quota-key"],
    ["cache_days", 31],
    ["user_daily_quota", 11],
    ["daily_budget_micros", 100_001],
    ["monthly_budget_micros", 1_000_001],
    ["maximum_micros", 50_001],
    ["queue_expires_at", QUEUE_EXPIRES_AT + 1],
    ["reservation_expires_at", RESERVATION_EXPIRES_AT + 1],
    ["created_at", NOW + 1],
  ])("keeps execution identity, policy, and creation time immutable: %s", (column, value) => {
    const db = remoteDb();
    try {
      insertExecution(db);
      expect(() => db.database.prepare(`UPDATE research_site_executions
        SET ${column}=?1,version=version+1,updated_at=updated_at+1 WHERE run_id='run-remote-1'`)
        .run(value)).toThrow();
    } finally {
      db.close();
    }
  });

  it("allows legal admission and closure while rejecting lifecycle regressions", () => {
    const db = remoteDb();
    try {
      insertExecution(db);
      db.database.prepare(`UPDATE research_site_executions SET admission_state='admitted',
        quota_reservation_id='quota-reservation-1',budget_reservation_id='budget-reservation-1',
        admitted_at=?1,version=1,updated_at=?1 WHERE run_id='run-remote-1'`).run(NOW + 1);
      expect(() => db.database.prepare(`UPDATE research_site_executions SET admission_state='pending',
        version=2,updated_at=?1 WHERE run_id='run-remote-1'`).run(NOW + 2)).toThrow();
      expect(() => db.database.prepare(`UPDATE research_site_executions SET quota_reservation_id='replacement',
        version=2,updated_at=?1 WHERE run_id='run-remote-1'`).run(NOW + 2)).toThrow();
      db.database.prepare(`UPDATE research_site_executions SET admission_state='closed',closed_at=?1,
        close_reason='interrupted',version=2,updated_at=?1 WHERE run_id='run-remote-1'`).run(NOW + 2);
      expect(() => db.database.prepare(`UPDATE research_site_executions SET admission_state='admitted',
        closed_at=NULL,close_reason=NULL,version=3,updated_at=?1 WHERE run_id='run-remote-1'`).run(NOW + 3)).toThrow();
      expect(() => db.database.prepare(`UPDATE research_site_executions SET close_reason='denied',
        version=3,updated_at=?1 WHERE run_id='run-remote-1'`).run(NOW + 3)).toThrow();
    } finally {
      db.close();
    }
  });

  it("allows a future begin marker but refuses to close a begun execution", () => {
    const db = remoteDb();
    try {
      insertExecution(db);
      db.database.prepare(`UPDATE research_site_executions SET admission_state='admitted',
        quota_reservation_id='quota-reservation-1',budget_reservation_id='budget-reservation-1',
        admitted_at=?1,version=1,updated_at=?1 WHERE run_id='run-remote-1'`).run(NOW + 1);
      db.database.prepare(`UPDATE research_site_executions SET began_at=?1,version=2,updated_at=?1
        WHERE run_id='run-remote-1'`).run(NOW + 2);
      expect(() => db.database.prepare(`UPDATE research_site_executions SET admission_state='closed',
        closed_at=?1,close_reason='interrupted',version=3,updated_at=?1
        WHERE run_id='run-remote-1'`).run(NOW + 3)).toThrow();
      expect(() => db.database.prepare(`UPDATE research_site_executions SET began_at=NULL,
        version=3,updated_at=?1 WHERE run_id='run-remote-1'`).run(NOW + 3)).toThrow();
    } finally {
      db.close();
    }
  });

  it("requires every lifecycle update to increment the version exactly once", () => {
    const db = remoteDb();
    try {
      insertExecution(db);
      for (const version of [0, 2, -1, Number.MAX_SAFE_INTEGER + 1]) {
        expect(() => db.database.prepare(`UPDATE research_site_executions
          SET admission_state='closed',closed_at=?1,close_reason='denied',version=?2,updated_at=?1
          WHERE run_id='run-remote-1'`).run(NOW + 1, version)).toThrow();
      }
      db.database.prepare(`UPDATE research_site_executions
        SET admission_state='closed',closed_at=?1,close_reason='denied',version=1,updated_at=?1
        WHERE run_id='run-remote-1'`).run(NOW + 1);
    } finally {
      db.close();
    }
  });
});
