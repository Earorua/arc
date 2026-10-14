// @vitest-environment node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SqliteD1 } from "../helpers/sqlite-d1";
import { createSiteImportFixture } from "../helpers/site-import-fixture";

const migration = resolve(process.cwd(), "drizzle/0010_research_site_imports.sql");
const files = ["0000_beta_foundation.sql", "0001_secure_account_linking.sql", "0002_product_intelligence.sql",
  "0003_adaptive_planning.sql", "0004_proof_backed_stack.sql", "0005_openrouter_research_beta.sql",
  "0006_research_health_indexes.sql", "0007_research_bridge_nonces.sql", "0008_research_site_executions.sql",
  "0009_research_site_begin_grants.sql"];

function through0009(): SqliteD1 {
  const db = new SqliteD1();
  db.database.exec("PRAGMA foreign_keys=ON");
  for (const file of files) db.database.exec(readFileSync(resolve(process.cwd(), "drizzle", file), "utf8")
    .replaceAll("--> statement-breakpoint", ";"));
  return db;
}
function seed(db: SqliteD1) {
  db.database.prepare("INSERT INTO users(id,name,email,email_verified) VALUES('owner-a','A','a@example.test',0)").run();
  const now = 1_800_000_000_000;
  for (const [id, remote, state] of [["run-sync-1", false, "queued"],
    ["run-remote-2", true, "researching"], ["run-terminal-3", true, "failed"]] as const) {
    db.database.prepare(`INSERT INTO research_runs
      (id,user_id,request_id,mutation_id,raw_role,normalized_role_key,locale,input_fingerprint,
      config_fingerprint,state,state_version,retryable,active_slot,active_expires_at,created_at,
      updated_at,retry_of_run_id,execution_mode,remote_quota_key)
      VALUES(?1,'owner-a',?2,?3,'Data Product Manager',?4,'en-US',?5,'config-fingerprint',
      'queued',0,0,1,?6,?7,?7,NULL,?8,?9)`)
      .run(id, `request-${id}`, `mutation-${id}`, `role-${id}`, `input-${id}`,
        now + 120_000, now,
        remote ? "cloudflare-workflow-v1" : "synchronous", remote ? `quota-${id}` : null);
    if (!remote) continue;
    const suffix = id === "run-remote-2" ? "000000000002" : "000000000003";
    const jobId = `00000000-0000-4000-8000-${suffix}`;
    db.database.prepare(`INSERT INTO research_site_executions
      (run_id,user_id,request_id,job_id,request_hash,job_json,validation_context_json,quota_key,
      cache_days,user_daily_quota,daily_budget_micros,monthly_budget_micros,maximum_micros,
      queue_expires_at,reservation_expires_at,admission_state,version,quota_reservation_id,
      budget_reservation_id,admitted_at,closed_at,close_reason,began_at,execution_expires_at,created_at,updated_at)
      VALUES(?1,'owner-a',?2,?3,?4,?5,'{}',?6,30,10,100000,1000000,50000,
      ?7,?8,'pending',0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,?9,?9)`)
      .run(id, `request-${id}`, jobId, suffix.repeat(6).slice(0, 64),
        JSON.stringify({ jobId, runId: id, requestId: `request-${id}`, createdAt: now,
          queueExpiresAt: now + 120_000 }), `quota-${id}`, now + 120_000, now + 1_380_000, now);
    db.database.prepare(`UPDATE research_site_executions SET admission_state='admitted',
      quota_reservation_id=?1,budget_reservation_id=?2,admitted_at=?3,version=1,updated_at=?3 WHERE run_id=?4`)
      .run(`quota-res-${id}`, `budget-res-${id}`, now + 500, id);
    db.database.prepare(`UPDATE research_site_executions SET began_at=?1,execution_expires_at=?2,
      version=2,updated_at=?1 WHERE run_id=?3`).run(now + 1000, now + 1_261_000, id);
    db.database.prepare(`UPDATE research_runs SET state='researching',state_version=1,
      active_expires_at=?1,updated_at=?2 WHERE id=?3`).run(now + 1_261_000, now + 1000, id);
    if (state === "failed") db.database.prepare(`UPDATE research_runs SET state='failed',state_version=2,
      retryable=1,active_slot=NULL,active_expires_at=NULL,error_code='unavailable',
      public_failure_category='service-unavailable',updated_at=?1 WHERE id=?2`).run(now + 2000, id);
  }
  db.database.prepare(`INSERT INTO quota_ledger
    (id,user_id,purpose,reservation_id,idempotency_key,entry_kind,units,created_at)
    VALUES('quota-ledger-1','owner-a','research','quota-res-run-remote-2',
    'quota-run-remote-2','reserve',1,?1)`).run(now);
  db.database.prepare(`INSERT INTO ai_budget_buckets
    (id,scope,period_kind,period_start,reserved_micros,settled_micros,version,created_at,updated_at)
    VALUES('day-bucket','site','day',0,50000,0,1,?1,?1),
    ('month-bucket','site','month',0,50000,0,1,?1,?1)`).run(now);
  db.database.prepare(`INSERT INTO ai_budget_reservations
    (id,request_id,run_id,day_bucket_id,month_bucket_id,maximum_reserved_micros,
    settled_micros,status,expires_at,created_at,updated_at)
    VALUES('budget-res-run-remote-2','request-run-remote-2','run-remote-2',
    'day-bucket','month-bucket',50000,0,'reserved',?1,?2,?2)`).run(now + 1_380_000, now);
}

describe("research site import migration", () => {
  it("adds an empty journal without changing existing durable rows", () => {
    const db = through0009();
    try {
      seed(db);
      const tables = ["users", "research_runs", "research_site_executions", "quota_ledger", "ai_budget_buckets", "ai_budget_reservations"];
      const before = Object.fromEntries(tables.map((table) => [table, db.database.prepare(`SELECT * FROM ${table}`).all()]));
      expect(db.database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='research_site_imports'").get()).toBeUndefined();
      if (existsSync(migration)) {
        db.database.exec(readFileSync(migration, "utf8").replaceAll("--> statement-breakpoint", ";"));
      }
      expect(db.database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='research_site_imports'").get())
        .toBeDefined();
      expect(db.database.prepare("SELECT * FROM research_site_imports").all()).toEqual([]);
      for (const table of tables) expect(db.database.prepare(`SELECT * FROM ${table}`).all()).toEqual(before[table]);
    } finally { db.close(); }
  });

  it("rejects illegal identity, receipt, phase, resolution and decision transitions", async () => {
    const f = await createSiteImportFixture();
    try {
      await f.imports.captureBody(f.identity, f.receipt);
      const update = (assignment: string) => f.db.database.prepare(`UPDATE research_site_imports SET ${assignment} WHERE run_id=?1`)
        .run(f.identity.runId);
      for (const assignment of ["user_id='owner-b'", `receipt_hash='${"f".repeat(64)}'`,
        "validation_context_json='{}'", "receipt_metadata_json='{}'", "audit_json='{}'",
        "settlement_json='{}'", "mode='metadata-only'", "config_fingerprint='other-config'",
        "execution_version=execution_version+1", "created_at=created_at+1"]) {
        expect(() => update(`${assignment},phase=1,version=1,updated_at=updated_at+1`), assignment).toThrow();
      }
      for (const assignment of ["phase=2,version=1,resolution_json='{}'", "phase=0,version=1",
        "phase=-1,version=1", "phase=1,version=9007199254740992",
        "phase=1,version=1,resolution_json='{}'", "phase=1,version=1,decision_json=NULL",
        "phase=1,version=1,decision_json='{}'"]) expect(() => update(assignment)).toThrow();
      const pending = await f.createRemote("owner-b");
      expect(() => f.db.database.prepare(`INSERT INTO research_site_imports
        SELECT ?1,?2,?3,?4,?5,config_fingerprint,validation_context_json,execution_version,mode,
          receipt_hash,receipt_metadata_json,audit_json,settlement_json,decision_hash,decision_json,
          1,1,NULL,created_at,updated_at FROM research_site_imports WHERE run_id=?6`)
        .run(pending.execution.runId, pending.execution.ownerId, pending.execution.requestId,
          pending.execution.jobId, pending.execution.requestHash, f.identity.runId)).toThrow();
      expect(f.db.database.prepare("SELECT phase,version,resolution_json,decision_json FROM research_site_imports").get())
        .toMatchObject({ phase: 0, version: 0, resolution_json: null });
      update("phase=1,version=1,updated_at=updated_at+1");
      expect(() => update("phase=0,version=2,updated_at=updated_at+2")).toThrow();
      expect(() => update("phase=2,version=2,updated_at=updated_at+1")).toThrow();
      update("phase=2,version=2,resolution_json='{}',updated_at=updated_at+1");
      expect(() => update(`phase=3,version=3,resolution_json='{"changed":true}',updated_at=updated_at+1`)).toThrow();
      update("phase=3,version=3,updated_at=updated_at+1");
      update("phase=4,version=4,updated_at=updated_at+1");
      update("phase=5,version=5,decision_json=NULL,updated_at=updated_at+1");
      expect(() => update("phase=5,version=6,decision_json='{}',updated_at=updated_at+1")).toThrow();
    } finally { f.db.close(); }
  });

  it("enforces UTF-8 byte caps, JSON objects and TEXT storage under native SQLite", async () => {
    const f = await createSiteImportFixture();
    try {
      await f.imports.captureBody(f.identity, f.receipt);
      f.db.database.exec("DROP TRIGGER research_site_imports_immutable_guard");
      f.db.database.exec("DROP TRIGGER research_site_imports_lifecycle_guard");
      const update = (column: string, value: string | Uint8Array) => f.db.database.prepare(
        `UPDATE research_site_imports SET ${column}=?1 WHERE run_id=?2`).run(value, f.identity.runId);
      for (const column of ["validation_context_json", "receipt_metadata_json", "audit_json",
        "settlement_json", "decision_json"]) {
        expect(() => update(column, "{invalid"), column).toThrow();
        expect(() => update(column, JSON.stringify([1, 2])), column).toThrow();
        expect(() => update(column, new TextEncoder().encode("{}")), column).toThrow();
      }
      expect(() => update("validation_context_json", JSON.stringify({ text: "学".repeat(1400) }))).toThrow();
      expect(() => update("receipt_metadata_json", JSON.stringify({ text: "学".repeat(1400) }))).toThrow();
      expect(() => update("audit_json", JSON.stringify({ text: "学".repeat(1400) }))).toThrow();
      expect(() => update("settlement_json", JSON.stringify({ text: "学".repeat(86) }))).toThrow();
      expect(() => update("decision_json", JSON.stringify({ text: "学".repeat(650_000) }))).toThrow();
      expect(() => update("version", "1.5")).toThrow();
      for (const column of ["request_hash", "receipt_hash", "decision_hash"])
        expect(() => update(column, new TextEncoder().encode("a".repeat(64))), column).toThrow();
    } finally { f.db.close(); }
    const phase2 = await createSiteImportFixture();
    try {
      await phase2.imports.captureBody(phase2.identity, phase2.receipt);
      phase2.db.database.prepare("UPDATE research_site_imports SET phase=1,version=1,updated_at=updated_at+1 WHERE run_id=?1")
        .run(phase2.identity.runId);
      phase2.db.database.prepare(`UPDATE research_site_imports SET phase=2,version=2,
        resolution_json='{}',updated_at=updated_at+1 WHERE run_id=?1`).run(phase2.identity.runId);
      phase2.db.database.exec("DROP TRIGGER research_site_imports_immutable_guard");
      phase2.db.database.exec("DROP TRIGGER research_site_imports_lifecycle_guard");
      const update = (value: string | Uint8Array) => phase2.db.database.prepare(
        "UPDATE research_site_imports SET resolution_json=?1 WHERE run_id=?2").run(value, phase2.identity.runId);
      expect(() => update("{invalid")).toThrow();
      expect(() => update("[]")).toThrow();
      expect(() => update(new TextEncoder().encode("{}"))).toThrow();
      expect(() => update(JSON.stringify({ text: "学".repeat(1400) }))).toThrow();
    } finally { phase2.db.close(); }
  });
});
