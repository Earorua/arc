import { getTableName } from "drizzle-orm";
import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import * as schema from "../../db/schema";

const expectedTableNames = [
  "users",
  "sessions",
  "accounts",
  "verifications",
  "auth_rate_limits",
  "learner_profiles",
  "career_goals",
  "learning_tasks",
  "learning_events",
  "proof_items",
  "proof_assets",
  "public_proof_shares",
  "migration_runs",
  "idempotency_records",
  "quota_ledger",
  "ai_runs",
  "feature_flags",
  "endpoint_rate_buckets",
  "operational_events",
  "account_link_intents",
];

function exportedTableNames() {
  return Object.values(schema).flatMap((value) => {
    try {
      return [getTableName(value as SQLiteTable)];
    } catch {
      return [];
    }
  });
}

function indexNames(table: SQLiteTable) {
  return getTableConfig(table).indexes.map((index) => index.config.name);
}

describe("Arc beta persistence schema", () => {
  it("exports every foundation table", () => {
    expect(exportedTableNames()).toEqual(expect.arrayContaining(expectedTableNames));
    expect(exportedTableNames()).toHaveLength(expectedTableNames.length);
  });

  it("keeps every personal product table owner scoped", () => {
    const userOwnedTables = [
      schema.learnerProfiles,
      schema.careerGoals,
      schema.learningTasks,
      schema.learningEvents,
      schema.proofItems,
      schema.proofAssets,
      schema.publicProofShares,
      schema.migrationRuns,
      schema.idempotencyRecords,
      schema.quotaLedger,
      schema.aiRuns,
      schema.accountLinkIntents,
    ];

    for (const table of userOwnedTables) {
      expect(getTableConfig(table).columns.map((column) => column.name)).toContain("user_id");
    }
  });

  it("declares the active-goal and idempotency uniqueness boundaries", () => {
    expect(indexNames(schema.careerGoals)).toContain("career_goals_one_active_idx");
    expect(indexNames(schema.learningEvents)).toContain("learning_events_user_mutation_idx");
    expect(indexNames(schema.migrationRuns)).toContain("migration_runs_user_migration_idx");
    expect(indexNames(schema.idempotencyRecords)).toContain("idempotency_user_scope_mutation_idx");
    expect(indexNames(schema.quotaLedger)).toContain("quota_ledger_user_idempotency_idx");
    expect(indexNames(schema.endpointRateBuckets)).toContain("endpoint_rate_bucket_idx");
    expect(indexNames(schema.accountLinkIntents)).toEqual(expect.arrayContaining([
      "account_link_intents_token_idx",
      "account_link_intents_user_target_idx",
      "account_link_intents_expiry_idx",
    ]));
  });

  it("declares the durable account-link completion reservation status", () => {
    expect(schema.accountLinkIntents.status.enumValues).toContain("completing");
  });
});
