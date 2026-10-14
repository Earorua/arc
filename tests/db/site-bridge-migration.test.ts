import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyResearchSiteBridgeMigration, createResearchD1, seedUser, SqliteD1 } from "../helpers/sqlite-d1";
import { createSiteImportFixture } from "../helpers/site-import-fixture";

describe("0011 research site bridge migration", () => {
  it("applies after 0000 through 0010 without changing an existing row", () => {
    const db = new SqliteD1();
    try {
      db.database.exec("PRAGMA foreign_keys = ON");
      for (const file of ["0000_beta_foundation.sql", "0001_secure_account_linking.sql",
        "0002_product_intelligence.sql", "0003_adaptive_planning.sql", "0004_proof_backed_stack.sql",
        "0005_openrouter_research_beta.sql", "0006_research_health_indexes.sql",
        "0007_research_bridge_nonces.sql", "0008_research_site_executions.sql",
        "0009_research_site_begin_grants.sql", "0010_research_site_imports.sql"]) {
        db.database.exec(readFileSync(resolve("drizzle", file), "utf8")
          .replaceAll("--> statement-breakpoint", ";"));
      }
      seedUser(db, "preserved-owner");
      const before = db.database.prepare("SELECT * FROM users WHERE id='preserved-owner'").get();
      applyResearchSiteBridgeMigration(db);
      expect(db.database.prepare("SELECT * FROM users WHERE id='preserved-owner'").get()).toEqual(before);
      expect(db.database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("creates the bridge sidecars and persistent cursors without breaking foreign keys", () => {
    const db = createResearchD1();
    try {
      const tables = db.database.prepare(`SELECT name FROM sqlite_master
        WHERE type='table' AND name LIKE 'research_site_%' ORDER BY name`).all()
        .map((row) => (row as { name: string }).name);
      expect(tables).toEqual(expect.arrayContaining([
        "research_site_acceptances",
        "research_site_recoveries",
        "research_site_scan_cursors",
      ]));
      expect(db.database.prepare("SELECT name,version FROM research_site_scan_cursors ORDER BY name").all())
        .toEqual([{ name: "maintenance", version: 0 }, { name: "outbox", version: 0 }]);
      expect(db.database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("rejects a length-only non-UUID cursor identity", () => {
    const db = createResearchD1();
    try {
      expect(() => db.database.prepare(`UPDATE research_site_scan_cursors
        SET after_created_at=1,after_job_id=?1,version=version+1 WHERE name='maintenance'`)
        .run("x".repeat(36))).toThrow();
    } finally {
      db.close();
    }
  });

  it("enforces bounded proofs, foreign keys, and immutable terminal identity", async () => {
    const f = await createSiteImportFixture();
    try {
      const e = f.execution;
      const acceptance = f.db.database.prepare(`INSERT INTO research_site_acceptances
        (job_id,request_hash,workflow_id,workflow_accepted_at,recorded_at) VALUES (?1,?2,?1,?3,?3)`);
      expect(() => acceptance.run(e.jobId, "A".repeat(64), e.createdAt)).toThrow();
      expect(() => acceptance.run(e.jobId, e.requestHash, -1)).toThrow();
      expect(() => acceptance.run(e.jobId, e.requestHash, 9_007_199_254_740_992)).toThrow();
      expect(f.db.database.prepare("SELECT count(*) AS n FROM research_site_acceptances").get())
        .toEqual({ n: 0 });
      acceptance.run(e.jobId, e.requestHash, e.createdAt);
      expect(() => f.db.database.prepare(`UPDATE research_site_acceptances
        SET workflow_accepted_at=workflow_accepted_at+1 WHERE job_id=?1`).run(e.jobId)).toThrow();
      expect(() => f.db.database.prepare("DELETE FROM research_site_acceptances WHERE job_id=?1")
        .run(e.jobId)).toThrow();

      const recovery = f.db.database.prepare(`INSERT INTO research_site_recoveries
        (job_id,request_hash,execution_version,run_version,terminal_hash,reason,unsent_json,terminal_at)
        VALUES (?1,?2,?3,?4,?5,'expired-unknown',NULL,?6)`);
      expect(() => recovery.run(e.jobId, e.requestHash, e.version, 2, "g".repeat(64), e.createdAt)).toThrow();
      expect(() => recovery.run(e.jobId, e.requestHash, -1, 2, "a".repeat(64), e.createdAt)).toThrow();
      expect(() => recovery.run(e.jobId, e.requestHash, e.version, 2, "a".repeat(64), -1)).toThrow();
      const unsent = f.db.database.prepare(`INSERT INTO research_site_recoveries
        (job_id,request_hash,execution_version,run_version,terminal_hash,reason,unsent_json,terminal_at)
        VALUES (?1,?2,?3,?4,?5,'executor-unsent',?6,?7)`);
      expect(() => unsent.run(e.jobId, e.requestHash, e.version, 2, "a".repeat(64), "[]", e.createdAt))
        .toThrow();
      expect(() => unsent.run(e.jobId, e.requestHash, e.version, 2, "a".repeat(64), "{", e.createdAt))
        .toThrow();
      expect(() => unsent.run(e.jobId, e.requestHash, e.version, 2, "a".repeat(64),
        JSON.stringify({ proof: "😀".repeat(1_025) }), e.createdAt)).toThrow();
      expect(f.db.database.prepare("SELECT count(*) AS n FROM research_site_recoveries").get())
        .toEqual({ n: 0 });
      recovery.run(e.jobId, e.requestHash, e.version, 2, "a".repeat(64), e.createdAt);
      expect(() => f.db.database.prepare(`UPDATE research_site_recoveries SET terminal_at=terminal_at+1,
        version=version+1,quota_done=1 WHERE job_id=?1`).run(e.jobId)).toThrow();
      expect(() => f.db.database.prepare("DELETE FROM research_site_recoveries WHERE job_id=?1")
        .run(e.jobId)).toThrow();
      expect(() => f.db.database.prepare("DELETE FROM research_site_executions WHERE job_id=?1")
        .run(e.jobId)).toThrow();
    } finally {
      f.db.close();
    }
  });
});
