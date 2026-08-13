import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

const migrationPaths = [
  "../../drizzle/0000_beta_foundation.sql",
  "../../drizzle/0001_secure_account_linking.sql",
  "../../drizzle/0002_product_intelligence.sql",
  "../../drizzle/0003_adaptive_planning.sql",
] as const;

const planningTables = [
  "skill_audit_versions",
  "availability_versions",
  "learning_path_versions",
  "plan_versions",
  "daily_units",
  "planning_workspaces",
  "planning_events",
] as const;

type Database = InstanceType<typeof DatabaseSync>;

function migrationSql(path: string) {
  return readFileSync(new URL(/* @vite-ignore */ path, import.meta.url), "utf8")
    .replaceAll("--> statement-breakpoint", "");
}

function snapshotMetadata(db: Database) {
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).all() as Array<{ name: string }>;
  return Object.fromEntries(tables.map(({ name }) => [name, {
    columns: db.prepare(`PRAGMA table_info(\`${name}\`)`).all(),
    foreignKeys: db.prepare(`PRAGMA foreign_key_list(\`${name}\`)`).all(),
    indexes: db.prepare(`PRAGMA index_list(\`${name}\`)`).all(),
  }]));
}

function withDatabase(run: (db: Database) => void) {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const path of migrationPaths.slice(0, 3)) db.exec(migrationSql(path));
    const before = snapshotMetadata(db);
    db.exec(migrationSql(migrationPaths[3]));
    run(db);
    return { before, after: snapshotMetadata(db) };
  } finally {
    db.close();
  }
}

function seedOwners(db: Database) {
  db.exec(`
    INSERT INTO users (id, name, email, email_verified) VALUES
      ('user-a', 'User A', 'a@example.com', 1),
      ('user-b', 'User B', 'b@example.com', 1);
    INSERT INTO career_goals
      (id, user_id, role_id, level, weekly_minutes, target_weeks, status)
    VALUES
      ('goal-a', 'user-a', 'role', 'beginner', 420, 18, 'active'),
      ('goal-a2', 'user-a', 'role', 'beginner', 420, 18, 'archived'),
      ('goal-b', 'user-b', 'role', 'beginner', 420, 18, 'active');
  `);
}

function seedValidGraph(db: Database) {
  seedOwners(db);
  db.exec(`
    INSERT INTO skill_audit_versions
      (id, user_id, goal_id, schema_version, blueprint_id, blueprint_version, input_fingerprint, payload_json)
    VALUES ('audit-a', 'user-a', 'goal-a', '2026.08.1', 'blueprint', '2026.08.1', 'audit-fp', '{}');
    INSERT INTO availability_versions
      (id, user_id, goal_id, schema_version, input_fingerprint, weekly_minutes, payload_json)
    VALUES ('availability-a', 'user-a', 'goal-a', '2026.08.1', 'availability-fp', 420, '{}');
    INSERT INTO learning_path_versions
      (id, user_id, goal_id, schema_version, blueprint_id, blueprint_version, registry_id,
       registry_version, audit_version_id, availability_version_id, scope_mode, input_fingerprint, payload_json)
    VALUES ('path-a', 'user-a', 'goal-a', '2026.08.1', 'blueprint', '2026.08.1', 'registry',
      '2026.08.1', 'audit-a', 'availability-a', 'full-scope', 'path-fp', '{}');
    INSERT INTO plan_versions
      (id, user_id, goal_id, schema_version, path_version_id, generation, base_version_id,
       replan_reason, planning_date, input_fingerprint, payload_json)
    VALUES ('plan-a', 'user-a', 'goal-a', '2026.08.1', 'path-a', 'initial', NULL,
      NULL, '2026-08-12', 'plan-fp', '{}');
    INSERT INTO daily_units
      (id, user_id, goal_id, plan_version_id, unit_id, scheduled_date, slot, required, payload_json)
    VALUES ('daily-a', 'user-a', 'goal-a', 'plan-a', 'unit-a', '2026-08-12', 'primary', 1, '{}');
    INSERT INTO planning_workspaces
      (id, user_id, goal_id, revision, current_audit_version_id, current_availability_version_id,
       active_path_version_id, active_plan_version_id, pending_plan_version_id, next_sequence)
    VALUES ('workspace-a', 'user-a', 'goal-a', 0, 'audit-a', 'availability-a', 'path-a', 'plan-a', NULL, 1);
    INSERT INTO planning_events
      (id, user_id, goal_id, workspace_id, sequence, mutation_id, target_plan_version_id,
       candidate_plan_version_id, unit_id, kind, payload_json, occurred_at)
    VALUES ('event-a', 'user-a', 'goal-a', 'workspace-a', 1, 'mutation-a', 'plan-a',
      NULL, 'unit-a', 'completed', '{}', 1786500000000);
  `);
}

function expectConstraint(db: Database, sql: string) {
  expect(() => db.exec(sql)).toThrow(/constraint|foreign key|unique/iu);
}

describe("adaptive planning migration", () => {
  it("applies 0000 through 0003 with all seven tables and intact old metadata", () => {
    const metadata = withDatabase((db) => {
      const existing = (db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      ).all() as Array<{ name: string }>).map(({ name }) => name);
      expect(existing).toEqual(expect.arrayContaining([...planningTables]));
    });

    for (const [table, before] of Object.entries(metadata.before)) {
      const after = metadata.after[table]!;
      expect(after.columns, `${table} columns`).toEqual(before.columns);
      expect(after.foreignKeys, `${table} foreign keys`).toEqual(before.foreignKeys);
      const beforeIndexes = (before.indexes as Array<{ name: string }>).map(({ name }) => name).sort();
      const afterIndexes = (after.indexes as Array<{ name: string }>).map(({ name }) => name).sort();
      expect(afterIndexes, `${table} indexes`).toEqual(table === "career_goals"
        ? [...beforeIndexes, "career_goals_user_id_idx"].sort()
        : beforeIndexes);
    }
  });

  it("accepts a same-owner graph and rejects cross-owner or cross-goal references", () => {
    withDatabase((db) => {
      seedValidGraph(db);
      expectConstraint(db, `INSERT INTO skill_audit_versions
        (id,user_id,goal_id,schema_version,blueprint_id,blueprint_version,input_fingerprint,payload_json)
        VALUES ('bad-owner','user-b','goal-a','2026.08.1','b','2026.08.1','fp','{}')`);
      expectConstraint(db, `INSERT INTO learning_path_versions
        (id,user_id,goal_id,schema_version,blueprint_id,blueprint_version,registry_id,registry_version,
         audit_version_id,availability_version_id,scope_mode,input_fingerprint,payload_json)
        VALUES ('bad-goal','user-a','goal-a2','2026.08.1','b','2026.08.1','r','2026.08.1',
          'audit-a','availability-a','full-scope','fp','{}')`);
    });
  });

  it("rejects duplicate workspace, sequence, mutation, plan slot, and unit IDs", () => {
    withDatabase((db) => {
      seedValidGraph(db);
      expectConstraint(db, `INSERT INTO planning_workspaces (id,user_id,goal_id,revision,next_sequence)
        VALUES ('workspace-duplicate','user-a','goal-a',0,1)`);
      expectConstraint(db, `INSERT INTO planning_events
        (id,user_id,goal_id,workspace_id,sequence,mutation_id,target_plan_version_id,kind,payload_json,occurred_at)
        VALUES ('event-sequence','user-a','goal-a','workspace-a',1,'mutation-sequence','plan-a','completed','{}',1)`);
      expectConstraint(db, `INSERT INTO planning_events
        (id,user_id,goal_id,workspace_id,sequence,mutation_id,target_plan_version_id,kind,payload_json,occurred_at)
        VALUES ('event-mutation','user-a','goal-a','workspace-a',2,'mutation-a','plan-a','completed','{}',1)`);
      expectConstraint(db, `INSERT INTO daily_units
        (id,user_id,goal_id,plan_version_id,unit_id,scheduled_date,slot,required,payload_json)
        VALUES ('daily-slot','user-a','goal-a','plan-a','unit-b','2026-08-12','primary',1,'{}')`);
      expectConstraint(db, `INSERT INTO daily_units
        (id,user_id,goal_id,plan_version_id,unit_id,scheduled_date,slot,required,payload_json)
        VALUES ('daily-unit','user-a','goal-a','plan-a','unit-a','2026-08-13','stretch',1,'{}')`);
    });
  });

  it("cascades all planning rows from a goal and leaves no foreign-key violations", () => {
    withDatabase((db) => {
      seedValidGraph(db);
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      db.exec("DELETE FROM career_goals WHERE user_id = 'user-a' AND id = 'goal-a'");
      for (const table of planningTables) {
        expect(db.prepare(`SELECT COUNT(*) AS count FROM \`${table}\``).get()).toMatchObject({ count: 0 });
      }
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    });
  });
});
