import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

const migrationPaths = [
  "../../drizzle/0000_beta_foundation.sql",
  "../../drizzle/0001_secure_account_linking.sql",
  "../../drizzle/0002_product_intelligence.sql",
  "../../drizzle/0003_adaptive_planning.sql",
  "../../drizzle/0004_proof_backed_stack.sql",
] as const;

type Database = InstanceType<typeof DatabaseSync>;

function migrationSql(path: string) {
  return readFileSync(new URL(/* @vite-ignore */ path, import.meta.url), "utf8")
    .replaceAll("--> statement-breakpoint", "");
}

function metadata(db: Database) {
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).all() as Array<{ name: string }>;
  return Object.fromEntries(tables.map(({ name }) => [name, {
    columns: db.prepare(`PRAGMA table_info(\`${name}\`)`).all(),
    foreignKeys: db.prepare(`PRAGMA foreign_key_list(\`${name}\`)`).all(),
    indexes: db.prepare(`PRAGMA index_list(\`${name}\`)`).all(),
  }]));
}

function withDatabase(run: (db: Database, before: ReturnType<typeof metadata>) => void) {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const path of migrationPaths.slice(0, 4)) db.exec(migrationSql(path));
    const before = metadata(db);
    db.exec(migrationSql(migrationPaths[4]));
    run(db, before);
  } finally {
    db.close();
  }
}

function expectConstraint(db: Database, sql: string) {
  expect(() => db.exec(sql)).toThrow(/constraint|foreign key|unique/iu);
}

function seedOwnersAndRoots(db: Database) {
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
    INSERT INTO proof_items
      (id, user_id, goal_id, title, kind, skill_ids_json, verified)
    VALUES
      ('proof-a', 'user-a', 'goal-a', 'Proof A', 'project', '["react"]', 0),
      ('proof-a2', 'user-a', 'goal-a2', 'Proof A2', 'project', '["react"]', 0),
      ('proof-b', 'user-b', 'goal-b', 'Proof B', 'project', '["react"]', 0);
    INSERT INTO proof_assets
      (id, user_id, proof_id, object_key, filename, content_type, size_bytes)
    VALUES
      ('asset-a', 'user-a', 'proof-a', 'proof/a', 'report.json', 'application/json', 128),
      ('asset-b', 'user-b', 'proof-b', 'proof/b', 'report.json', 'application/json', 128);
  `);
}

function insertVersion(db: Database, values: {
  id?: string;
  userId?: string;
  goalId?: string;
  proofId?: string;
  versionNumber?: number;
  assetId?: string | null;
  supersedesVersionId?: string | null;
}) {
  const {
    id = "version-a",
    userId = "user-a",
    goalId = "goal-a",
    proofId = "proof-a",
    versionNumber = 1,
    assetId = "asset-a",
    supersedesVersionId = null,
  } = values;
  db.prepare(`INSERT INTO proof_versions
    (id,user_id,goal_id,proof_id,version_number,schema_version,title,kind,summary,asset_id,
     skill_ids_json,completion_criteria_json,visibility,supersedes_version_id)
    VALUES (?,?,?,?,?,'2026.08.1','Evidence','document','Summary',?,'["react"]','["Tests pass"]','private',?)`)
    .run(id, userId, goalId, proofId, versionNumber, assetId, supersedesVersionId);
}

describe("proof ledger migration", () => {
  it("applies 0000 through 0004 and creates exactly the three ledger tables", () => {
    withDatabase((db, before) => {
      const after = metadata(db);
      expect(Object.keys(after).filter((name) => !(name in before)).sort()).toEqual([
        "proof_review_events",
        "proof_versions",
        "user_skill_projections",
      ]);
    });
  });

  it("preserves every pre-0004 column and foreign key while adding only approved indexes", () => {
    withDatabase((db, before) => {
      const after = metadata(db);
      for (const [table, prior] of Object.entries(before)) {
        expect(after[table]?.columns, `${table} columns`).toEqual(prior.columns);
        expect(after[table]?.foreignKeys, `${table} foreign keys`).toEqual(prior.foreignKeys);
        const oldIndexes = (prior.indexes as Array<{ name: string }>).map(({ name }) => name);
        const newIndexes = (after[table]?.indexes as Array<{ name: string }>).map(({ name }) => name);
        expect(newIndexes, `${table} indexes`).toEqual(expect.arrayContaining(oldIndexes));
        expect(newIndexes.filter((name) => !oldIndexes.includes(name)), `${table} added indexes`)
          .toEqual(table === "proof_items"
            ? ["proof_items_owner_goal_id_idx"]
            : table === "proof_assets"
              ? ["proof_assets_owner_proof_id_idx"]
              : []);
      }
    });
  });

  it("allows owner-scoped IDs while rejecting cross-owner and cross-goal roots", () => {
    withDatabase((db) => {
      seedOwnersAndRoots(db);
      insertVersion(db, {});
      insertVersion(db, {
        id: "version-a",
        userId: "user-b",
        goalId: "goal-b",
        proofId: "proof-b",
        assetId: "asset-b",
      });
      db.exec(`INSERT INTO proof_review_events
        (id,user_id,goal_id,proof_id,version_id,sequence,mutation_id,kind,state_after,
         visibility_after,reason_codes_json,occurred_at)
        VALUES
          ('review-shared','user-a','goal-a','proof-a','version-a',1,'mutation-a','submitted',
            'pending_review','private','[]',1786500000000),
          ('review-shared','user-b','goal-b','proof-b','version-a',1,'mutation-b','submitted',
            'pending_review','private','[]',1786500000000)`);
      expectConstraint(db, `INSERT INTO proof_versions
        (id,user_id,goal_id,proof_id,version_number,schema_version,title,kind,summary,
         skill_ids_json,completion_criteria_json,visibility)
        VALUES ('bad-owner','user-b','goal-b','proof-a',1,'2026.08.1','x','document','x','[]','[]','private')`);
      expectConstraint(db, `INSERT INTO proof_versions
        (id,user_id,goal_id,proof_id,version_number,schema_version,title,kind,summary,
         skill_ids_json,completion_criteria_json,visibility)
        VALUES ('bad-goal','user-a','goal-a2','proof-a',1,'2026.08.1','x','document','x','[]','[]','private')`);
    });
  });

  it("enforces immutable versions, supersession scope, and owned assets", () => {
    withDatabase((db) => {
      seedOwnersAndRoots(db);
      insertVersion(db, {});
      expectConstraint(db, `INSERT INTO proof_versions
        (id,user_id,goal_id,proof_id,version_number,schema_version,title,kind,summary,
         skill_ids_json,completion_criteria_json,visibility)
        VALUES ('duplicate-version','user-a','goal-a','proof-a',1,'2026.08.1','x','document','x','[]','[]','private')`);
      expectConstraint(db, `INSERT INTO proof_versions
        (id,user_id,goal_id,proof_id,version_number,schema_version,title,kind,summary,asset_id,
         skill_ids_json,completion_criteria_json,visibility)
        VALUES ('bad-asset','user-a','goal-a','proof-a',2,'2026.08.1','x','document','x','asset-b','[]','[]','private')`);
      insertVersion(db, { id: "version-a2", versionNumber: 2, supersedesVersionId: "version-a" });
      expectConstraint(db, `INSERT INTO proof_versions
        (id,user_id,goal_id,proof_id,version_number,schema_version,title,kind,summary,
         skill_ids_json,completion_criteria_json,visibility,supersedes_version_id)
        VALUES ('bad-supersedes','user-a','goal-a2','proof-a2',1,'2026.08.1','x','document','x','[]','[]','private','version-a')`);
    });
  });

  it("scopes review events to their version and makes each mutation transition idempotent", () => {
    withDatabase((db) => {
      seedOwnersAndRoots(db);
      insertVersion(db, {});
      db.exec(`INSERT INTO proof_review_events
        (id,user_id,goal_id,proof_id,version_id,sequence,mutation_id,kind,state_after,
         visibility_after,reason_codes_json,occurred_at)
        VALUES ('review-a','user-a','goal-a','proof-a','version-a',1,'mutation-a','submitted',
          'pending_review','private','[]',1786500000000)`);
      db.exec(`INSERT INTO proof_review_events
        (id,user_id,goal_id,proof_id,version_id,sequence,mutation_id,kind,state_after,
         visibility_after,reason_codes_json,occurred_at)
        VALUES ('review-a2','user-a','goal-a','proof-a','version-a',2,'mutation-a','structural_passed',
          'demonstrated','private','[]',1786500000001)`);
      expectConstraint(db, `INSERT INTO proof_review_events
        (id,user_id,goal_id,proof_id,version_id,sequence,mutation_id,kind,state_after,
         visibility_after,reason_codes_json,occurred_at)
        VALUES ('review-duplicate','user-a','goal-a','proof-a','version-a',3,'mutation-a','submitted',
          'pending_review','private','[]',1786500000002)`);
      expectConstraint(db, `INSERT INTO proof_review_events
        (id,user_id,goal_id,proof_id,version_id,sequence,mutation_id,kind,state_after,
         visibility_after,reason_codes_json,occurred_at)
        VALUES ('review-cross-proof','user-a','goal-a2','proof-a2','version-a',1,'mutation-b','submitted',
          'pending_review','private','[]',1786500000000)`);
    });
  });

  it("allows scoped projection IDs for both owners and rejects foreign strongest evidence", () => {
    withDatabase((db) => {
      seedOwnersAndRoots(db);
      insertVersion(db, {});
      insertVersion(db, {
        id: "version-a",
        userId: "user-b",
        goalId: "goal-b",
        proofId: "proof-b",
        assetId: "asset-b",
      });
      db.exec(`INSERT INTO user_skill_projections
        (user_id,goal_id,skill_id,audience,schema_version,status,proof_id,version_id,
         completed_unit_ids_json,latest_use_at)
        VALUES
          ('user-a','goal-a','react','internal','2026.08.1','demonstrated','proof-a','version-a','[]',1786500000000),
          ('user-b','goal-b','react','internal','2026.08.1','demonstrated','proof-b','version-a','[]',1786500000000)`);
      expectConstraint(db, `INSERT INTO user_skill_projections
        (user_id,goal_id,skill_id,audience,schema_version,status,proof_id,version_id,completed_unit_ids_json)
        VALUES ('user-a','goal-a','typescript','internal','2026.08.1','demonstrated','proof-b','version-a','[]')`);
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    });
  });
});
