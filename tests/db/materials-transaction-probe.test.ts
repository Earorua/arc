// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteD1 } from "../helpers/sqlite-d1";

const opened: SqliteD1[] = [];
function fixture() {
  const db = new SqliteD1(); opened.push(db);
  db.database.exec(readFileSync(new URL("../fixtures/documents/transaction-probe.sql", import.meta.url), "utf8"));
  db.database.exec(`
    INSERT INTO documents VALUES ('alice','doc-a',1,'active'),('bob','doc-b',1,'active');
    INSERT INTO document_versions VALUES ('alice','doc-a','version-a'),('alice','doc-a','version-old'),('bob','doc-b','version-b');
    INSERT INTO document_confirmations VALUES ('alice','doc-a','version-a','confirm-a'),('bob','doc-b','version-b','confirm-b');
    INSERT INTO material_selections VALUES ('alice','selection-a',1,NULL);
    INSERT INTO material_selection_entries VALUES ('alice','selection-a','jd','doc-a','version-a','confirm-a');
    INSERT INTO planning_context_versions VALUES ('alice','context-a','selection-a',1,'ready');
    INSERT INTO probe_workspaces VALUES ('alice','goal-a',4,'plan-old',NULL,1,NULL);
    INSERT INTO probe_sources VALUES ('alice','source-a','ready','source-hash',2000);
  `);
  return db;
}
afterEach(() => { for (const db of opened.splice(0)) db.close(); });

type Transition = "generation" | "proposal" | "accept";
function transaction(db: SqliteD1, transition: Transition) {
  const resultId = "result-" + transition;
  const statements = [
    db.prepare("INSERT INTO probe_results VALUES (?1,?2,?3)").bind("alice",resultId,transition),
    db.prepare("INSERT INTO document_usage_links VALUES (?1,?2,?3)").bind("alice","context-a",resultId),
    db.prepare("UPDATE material_selections SET bound_goal_id='goal-a' WHERE owner_id='alice' AND id='selection-a'"),
    db.prepare("UPDATE probe_workspaces SET revision=5,active_plan_id=?1,pending_plan_id=?2,last_mutation_id=?3 WHERE owner_id='alice' AND goal_id='goal-a' AND revision=4 AND active_slot=1")
      .bind(transition === "proposal" ? "plan-old" : resultId, transition === "proposal" ? resultId : null, resultId),
    // SQL assertion intentionally last: failing it must roll back ALL previous statements.
    db.prepare(`INSERT INTO document_mutations (owner_id,mutation_id,body_digest,passed)
      VALUES ('alice',?1,'digest-a',CASE WHEN
        EXISTS (SELECT 1 FROM documents WHERE owner_id='alice' AND id='doc-a' AND generation=1 AND lifecycle='active')
        AND EXISTS (SELECT 1 FROM material_selections WHERE owner_id='alice' AND id='selection-a' AND revision=1)
        AND EXISTS (SELECT 1 FROM planning_context_versions WHERE owner_id='alice' AND id='context-a' AND lifecycle='ready')
        AND EXISTS (SELECT 1 FROM probe_workspaces WHERE owner_id='alice' AND goal_id='goal-a' AND revision=5 AND active_slot=1 AND last_mutation_id=?1)
        AND EXISTS (SELECT 1 FROM probe_sources WHERE owner_id='alice' AND id='source-a' AND state='ready' AND fingerprint='source-hash' AND expires_at>1000)
        THEN 1 ELSE 0 END)`).bind(resultId),
  ];
  return db.batch(statements);
}
function count(db: SqliteD1, table: "probe_results" | "document_usage_links" | "document_mutations") {
  return (db.database.prepare("SELECT count(*) AS n FROM " + table).get() as {n:number}).n;
}

describe("phase 0 SQLite contract probe (not an application migration)", () => {
  it("rejects cross-owner and cross-version references through composite foreign keys", () => {
    const db = fixture();
    expect(() => db.database.exec("INSERT INTO material_selection_entries VALUES ('alice','selection-a','supplement','doc-b','version-b','confirm-b')")).toThrow();
    expect(() => db.database.exec("INSERT INTO material_selection_entries VALUES ('alice','selection-a','supplement','doc-a','version-old','confirm-a')")).toThrow();
  });
  it("limits each selection to one main JD and one entry per document", () => {
    const db = fixture();
    db.database.exec("INSERT INTO documents VALUES ('alice','doc-c',1,'active'); INSERT INTO document_versions VALUES ('alice','doc-c','version-c'); INSERT INTO document_confirmations VALUES ('alice','doc-c','version-c','confirm-c')");
    expect(() => db.database.exec("INSERT INTO material_selection_entries VALUES ('alice','selection-a','jd','doc-c','version-c','confirm-c')")).toThrow();
  });
  it.each<Transition>(["generation","proposal","accept"])("commits a valid %s batch and dependency receipt together", async kind => {
    const db=fixture(); await transaction(db,kind);
    expect(count(db,"probe_results")).toBe(1);
    expect(count(db,"document_usage_links")).toBe(1);
    expect(count(db,"document_mutations")).toBe(1);
    expect(db.database.prepare("SELECT revision,last_mutation_id FROM probe_workspaces").get()).toMatchObject({revision:5,last_mutation_id:"result-"+kind});
  });
  const changes = [
    "UPDATE documents SET generation=2,lifecycle='revoked' WHERE owner_id='alice'",
    "UPDATE material_selections SET revision=2",
    "UPDATE planning_context_versions SET lifecycle='revoked'",
    "UPDATE probe_workspaces SET revision=5",
    "UPDATE probe_workspaces SET revision=6",
    "UPDATE probe_workspaces SET active_slot=0",
    "UPDATE probe_sources SET state='expired'",
    "UPDATE probe_sources SET fingerprint='changed'",
    "UPDATE probe_sources SET expires_at=999",
  ];
  for (const kind of ["generation","proposal","accept"] as const) {
    it.each(changes)(kind + " rolls back prior writes after stale guard: %s", async sql => {
      const db=fixture(); db.database.exec(sql);
      const before=db.database.prepare("SELECT * FROM probe_workspaces").all();
      await expect(transaction(db,kind)).rejects.toThrow();
      expect(count(db,"probe_results")).toBe(0);
      expect(count(db,"document_usage_links")).toBe(0);
      expect(count(db,"document_mutations")).toBe(0);
      expect(db.database.prepare("SELECT * FROM probe_workspaces").all()).toEqual(before);
      expect(db.database.prepare("SELECT bound_goal_id FROM material_selections").get()).toMatchObject({bound_goal_id:null});
    });
  }
  it.each([0,1,2,3,4])("rolls back an injected failure at batch statement %i", async point => {
    const db=fixture(); db.failAtBatchStatement=point;
    await expect(transaction(db,"generation")).rejects.toThrow("injected batch failure");
    expect(count(db,"probe_results")).toBe(0);
    expect(count(db,"document_usage_links")).toBe(0);
    expect(count(db,"document_mutations")).toBe(0);
    expect(db.database.prepare("SELECT revision FROM probe_workspaces").get()).toMatchObject({revision:4});
  });
});

