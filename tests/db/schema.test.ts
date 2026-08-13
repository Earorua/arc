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
  "role_blueprints",
  "role_blueprint_versions",
  "role_skill_definitions",
  "role_skill_edges",
  "learning_resources",
  "resource_skill_links",
  "skill_audit_versions",
  "availability_versions",
  "learning_path_versions",
  "plan_versions",
  "daily_units",
  "planning_workspaces",
  "planning_events",
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

function isUniqueIndex(table: SQLiteTable, indexName: string) {
  return getTableConfig(table).indexes.find((index) => index.config.name === indexName)?.config.unique;
}

function nonUniqueIndexNames(table: SQLiteTable) {
  return getTableConfig(table).indexes
    .filter((index) => !index.config.unique)
    .map((index) => index.config.name);
}

function columnNames(table: SQLiteTable) {
  return getTableConfig(table).columns.map((column) => column.name).sort();
}

function foreignKeyConfig(table: SQLiteTable, foreignKeyName: string) {
  const foreignKey = getTableConfig(table).foreignKeys.find(
    (candidate) => candidate.getName() === foreignKeyName,
  );
  const reference = foreignKey?.reference();

  return foreignKey && reference
    ? {
        columns: reference.columns.map((column) => column.name),
        foreignColumns: reference.foreignColumns.map((column) => column.name),
        foreignTable: getTableName(reference.foreignTable),
        onDelete: foreignKey.onDelete,
      }
    : undefined;
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

  it("declares the product intelligence table columns", () => {
    expect(columnNames(schema.roleBlueprints)).toEqual([
      "created_at",
      "current_version",
      "id",
      "name",
      "slug",
      "status",
      "updated_at",
    ]);
    expect(columnNames(schema.roleBlueprintVersions)).toEqual([
      "blueprint_json",
      "created_at",
      "id",
      "published_at",
      "role_id",
      "source_coverage_json",
      "status",
      "version",
    ]);
    expect(columnNames(schema.roleSkillDefinitions)).toEqual([
      "blueprint_version_id",
      "category",
      "created_at",
      "id",
      "importance",
      "name",
      "payload_json",
      "skill_key",
    ]);
    expect(columnNames(schema.roleSkillEdges)).toEqual([
      "blueprint_version_id",
      "created_at",
      "from_skill_key",
      "id",
      "relation",
      "to_skill_key",
    ]);
    expect(columnNames(schema.learningResources)).toEqual([
      "canonical_url",
      "cost",
      "created_at",
      "format",
      "id",
      "language",
      "last_verified_at",
      "provider",
      "source_tier",
      "title",
      "updated_at",
    ]);
    expect(columnNames(schema.resourceSkillLinks)).toEqual([
      "blueprint_version_id",
      "created_at",
      "id",
      "purpose",
      "resource_id",
      "skill_key",
    ]);
  });

  it("declares the product intelligence enum boundaries", () => {
    expect(schema.roleBlueprints.status.enumValues).toEqual(["ready", "needs-review", "draft"]);
    expect(schema.roleBlueprintVersions.status.enumValues).toEqual(["ready", "needs-review", "draft"]);
    expect(schema.roleSkillDefinitions.category.enumValues).toEqual([
      "foundations",
      "frontend",
      "backend",
      "data",
      "quality",
      "cloud",
      "ai",
      "product",
    ]);
    expect(schema.roleSkillDefinitions.importance.enumValues).toEqual(["core", "strong", "advantage"]);
    expect(schema.roleSkillEdges.relation.enumValues).toEqual(["prerequisite"]);
    expect(schema.learningResources.language.enumValues).toEqual(["en", "zh-CN"]);
    expect(schema.learningResources.cost.enumValues).toEqual(["free", "paid", "mixed"]);
    expect(schema.learningResources.format.enumValues).toEqual([
      "documentation",
      "course",
      "guide",
      "reference",
      "practice",
    ]);
    expect(schema.learningResources.sourceTier.enumValues).toEqual([
      "primary",
      "institutional",
      "practitioner",
      "community",
    ]);
    expect(schema.resourceSkillLinks.purpose.enumValues).toEqual(["primary", "alternative", "reference"]);
  });

  it("declares version and normalized intelligence uniqueness boundaries", () => {
    expect(indexNames(schema.roleBlueprints)).toContain("role_blueprints_slug_idx");
    expect(isUniqueIndex(schema.roleBlueprints, "role_blueprints_slug_idx")).toBe(true);
    expect(indexNames(schema.roleBlueprintVersions)).toContain("role_blueprint_versions_role_version_idx");
    expect(isUniqueIndex(schema.roleBlueprintVersions, "role_blueprint_versions_role_version_idx")).toBe(true);
    expect(indexNames(schema.roleSkillDefinitions)).toContain("role_skill_definitions_version_key_idx");
    expect(isUniqueIndex(schema.roleSkillDefinitions, "role_skill_definitions_version_key_idx")).toBe(true);
    expect(indexNames(schema.roleSkillEdges)).toContain("role_skill_edges_unique_idx");
    expect(isUniqueIndex(schema.roleSkillEdges, "role_skill_edges_unique_idx")).toBe(true);
    expect(indexNames(schema.learningResources)).toContain("learning_resources_url_idx");
    expect(isUniqueIndex(schema.learningResources, "learning_resources_url_idx")).toBe(true);
    expect(indexNames(schema.resourceSkillLinks)).toContain("resource_skill_links_unique_idx");
    expect(isUniqueIndex(schema.resourceSkillLinks, "resource_skill_links_unique_idx")).toBe(true);
  });

  it("declares exact product intelligence lookup indexes", () => {
    expect(nonUniqueIndexNames(schema.roleBlueprintVersions)).toEqual(["role_blueprint_versions_role_idx"]);
    expect(nonUniqueIndexNames(schema.roleSkillDefinitions)).toEqual(["role_skill_definitions_version_idx"]);
    expect(nonUniqueIndexNames(schema.roleSkillEdges)).toEqual(["role_skill_edges_version_idx"]);
    expect(nonUniqueIndexNames(schema.resourceSkillLinks)).toEqual([
      "resource_skill_links_version_idx",
      "resource_skill_links_resource_idx",
    ]);
  });

  it("links edges and resources to declared skills with composite foreign keys", () => {
    expect(foreignKeyConfig(schema.roleSkillEdges, "role_skill_edges_from_skill_fk")).toEqual({
      columns: ["blueprint_version_id", "from_skill_key"],
      foreignColumns: ["blueprint_version_id", "skill_key"],
      foreignTable: "role_skill_definitions",
      onDelete: "cascade",
    });
    expect(foreignKeyConfig(schema.roleSkillEdges, "role_skill_edges_to_skill_fk")).toEqual({
      columns: ["blueprint_version_id", "to_skill_key"],
      foreignColumns: ["blueprint_version_id", "skill_key"],
      foreignTable: "role_skill_definitions",
      onDelete: "cascade",
    });
    expect(foreignKeyConfig(schema.resourceSkillLinks, "resource_skill_links_skill_fk")).toEqual({
      columns: ["blueprint_version_id", "skill_key"],
      foreignColumns: ["blueprint_version_id", "skill_key"],
      foreignTable: "role_skill_definitions",
      onDelete: "cascade",
    });
  });

  it("declares the exact adaptive planning table columns", () => {
    expect(columnNames(schema.skillAuditVersions)).toEqual([
      "blueprint_id", "blueprint_version", "created_at", "goal_id", "id",
      "input_fingerprint", "payload_json", "schema_version", "user_id",
    ]);
    expect(columnNames(schema.availabilityVersions)).toEqual([
      "created_at", "goal_id", "id", "input_fingerprint", "payload_json",
      "schema_version", "user_id", "weekly_minutes",
    ]);
    expect(columnNames(schema.learningPathVersions)).toEqual([
      "audit_version_id", "availability_version_id", "blueprint_id", "blueprint_version",
      "created_at", "goal_id", "id", "input_fingerprint", "payload_json", "registry_id",
      "registry_version", "schema_version", "scope_mode", "user_id",
    ]);
    expect(columnNames(schema.planVersions)).toEqual([
      "base_version_id", "created_at", "generation", "goal_id", "id",
      "input_fingerprint", "path_version_id", "payload_json", "planning_date",
      "replan_reason", "schema_version", "user_id",
    ]);
    expect(columnNames(schema.dailyUnits)).toEqual([
      "created_at", "goal_id", "id", "payload_json", "plan_version_id", "required",
      "scheduled_date", "slot", "unit_id", "user_id",
    ]);
    expect(columnNames(schema.planningWorkspaces)).toEqual([
      "active_path_version_id", "active_plan_version_id", "created_at",
      "current_audit_version_id", "current_availability_version_id", "goal_id", "id",
      "next_sequence", "pending_plan_version_id", "revision", "updated_at", "user_id",
    ]);
    expect(columnNames(schema.planningEvents)).toEqual([
      "candidate_plan_version_id", "created_at", "goal_id", "id", "kind", "mutation_id",
      "occurred_at", "payload_json", "sequence", "target_plan_version_id", "unit_id",
      "user_id", "workspace_id",
    ]);
  });

  it("keeps all adaptive planning rows scoped to one user and goal", () => {
    for (const table of [
      schema.skillAuditVersions,
      schema.availabilityVersions,
      schema.learningPathVersions,
      schema.planVersions,
      schema.dailyUnits,
      schema.planningWorkspaces,
      schema.planningEvents,
    ]) {
      expect(columnNames(table)).toEqual(expect.arrayContaining(["user_id", "goal_id"]));
    }
    expect(isUniqueIndex(schema.careerGoals, "career_goals_user_id_idx")).toBe(true);
  });

  it("declares exact adaptive planning enum boundaries", () => {
    expect(schema.learningPathVersions.scopeMode.enumValues).toEqual(["full-scope", "target-date"]);
    expect(schema.planVersions.generation.enumValues).toEqual(["initial", "automatic", "proposed"]);
    expect(schema.planVersions.replanReason.enumValues).toEqual([
      "completed", "delayed", "skipped", "too_hard", "already_known", "availability_changed",
      "replan_accepted", "replan_discarded",
    ]);
    expect(schema.dailyUnits.slot.enumValues).toEqual(["primary", "stretch"]);
    expect(schema.planningEvents.kind.enumValues).toEqual([
      "completed", "delayed", "skipped", "too_hard", "already_known", "availability_changed",
      "replan_accepted", "replan_discarded",
    ]);
  });

  it("declares exact adaptive planning uniqueness boundaries", () => {
    const uniqueIndexes: Array<[SQLiteTable, string]> = [
      [schema.careerGoals, "career_goals_user_id_idx"],
      [schema.skillAuditVersions, "skill_audit_versions_identity_idx"],
      [schema.availabilityVersions, "availability_versions_identity_idx"],
      [schema.learningPathVersions, "learning_path_versions_identity_idx"],
      [schema.planVersions, "plan_versions_identity_idx"],
      [schema.dailyUnits, "daily_units_unit_idx"],
      [schema.dailyUnits, "daily_units_slot_idx"],
      [schema.planningWorkspaces, "planning_workspaces_identity_idx"],
      [schema.planningWorkspaces, "planning_workspaces_goal_idx"],
      [schema.planningEvents, "planning_events_sequence_idx"],
      [schema.planningEvents, "planning_events_mutation_idx"],
    ];
    for (const [table, name] of uniqueIndexes) {
      expect(isUniqueIndex(table, name), name).toBe(true);
    }
  });

  it("indexes immutable planning fingerprints within the owner and goal scope", () => {
    for (const [table, name] of [
      [schema.skillAuditVersions, "skill_audit_versions_fingerprint_idx"],
      [schema.availabilityVersions, "availability_versions_fingerprint_idx"],
      [schema.learningPathVersions, "learning_path_versions_fingerprint_idx"],
      [schema.planVersions, "plan_versions_fingerprint_idx"],
    ] as Array<[SQLiteTable, string]>) {
      const candidate = getTableConfig(table).indexes.find((item) => item.config.name === name);
      expect(candidate?.config.columns.map((column) => "name" in column ? column.name : null), name)
        .toEqual(["user_id", "goal_id", "input_fingerprint"]);
      expect(candidate?.config.unique, name).toBe(false);
    }
  });

  it("declares the exact adaptive planning composite foreign keys", () => {
    const goalForeignKeys: Array<[SQLiteTable, string]> = [
      [schema.skillAuditVersions, "skill_audit_versions_goal_fk"],
      [schema.availabilityVersions, "availability_versions_goal_fk"],
      [schema.learningPathVersions, "learning_path_versions_goal_fk"],
      [schema.planVersions, "plan_versions_goal_fk"],
      [schema.dailyUnits, "daily_units_goal_fk"],
      [schema.planningWorkspaces, "planning_workspaces_goal_fk"],
      [schema.planningEvents, "planning_events_goal_fk"],
    ];
    for (const [table, name] of goalForeignKeys) {
      expect(foreignKeyConfig(table, name), name).toEqual({
        columns: ["user_id", "goal_id"],
        foreignColumns: ["user_id", "id"],
        foreignTable: "career_goals",
        onDelete: "cascade",
      });
    }

    expect(foreignKeyConfig(schema.learningPathVersions, "learning_path_versions_audit_fk")).toEqual({
      columns: ["user_id", "goal_id", "audit_version_id"],
      foreignColumns: ["user_id", "goal_id", "id"],
      foreignTable: "skill_audit_versions",
      onDelete: "cascade",
    });
    expect(foreignKeyConfig(schema.learningPathVersions, "learning_path_versions_availability_fk")).toEqual({
      columns: ["user_id", "goal_id", "availability_version_id"],
      foreignColumns: ["user_id", "goal_id", "id"],
      foreignTable: "availability_versions",
      onDelete: "cascade",
    });
    expect(foreignKeyConfig(schema.planVersions, "plan_versions_path_fk")).toEqual({
      columns: ["user_id", "goal_id", "path_version_id"],
      foreignColumns: ["user_id", "goal_id", "id"],
      foreignTable: "learning_path_versions",
      onDelete: "cascade",
    });
    expect(foreignKeyConfig(schema.planVersions, "plan_versions_base_fk")).toEqual({
      columns: ["user_id", "goal_id", "base_version_id"],
      foreignColumns: ["user_id", "goal_id", "id"],
      foreignTable: "plan_versions",
      onDelete: "no action",
    });
    expect(foreignKeyConfig(schema.dailyUnits, "daily_units_plan_fk")).toEqual({
      columns: ["user_id", "goal_id", "plan_version_id"],
      foreignColumns: ["user_id", "goal_id", "id"],
      foreignTable: "plan_versions",
      onDelete: "cascade",
    });
    expect(foreignKeyConfig(schema.planningEvents, "planning_events_workspace_fk")).toEqual({
      columns: ["user_id", "goal_id", "workspace_id"],
      foreignColumns: ["user_id", "goal_id", "id"],
      foreignTable: "planning_workspaces",
      onDelete: "cascade",
    });
    for (const [name, column] of [
      ["planning_events_target_plan_fk", "target_plan_version_id"],
      ["planning_events_candidate_plan_fk", "candidate_plan_version_id"],
    ] as const) {
      expect(foreignKeyConfig(schema.planningEvents, name)).toEqual({
        columns: ["user_id", "goal_id", column],
        foreignColumns: ["user_id", "goal_id", "id"],
        foreignTable: "plan_versions",
        onDelete: "no action",
      });
    }

    for (const [name, column, foreignTable] of [
      ["planning_workspaces_audit_fk", "current_audit_version_id", "skill_audit_versions"],
      ["planning_workspaces_availability_fk", "current_availability_version_id", "availability_versions"],
      ["planning_workspaces_path_fk", "active_path_version_id", "learning_path_versions"],
      ["planning_workspaces_active_plan_fk", "active_plan_version_id", "plan_versions"],
      ["planning_workspaces_pending_plan_fk", "pending_plan_version_id", "plan_versions"],
    ] as const) {
      expect(foreignKeyConfig(schema.planningWorkspaces, name)).toEqual({
        columns: ["user_id", "goal_id", column],
        foreignColumns: ["user_id", "goal_id", "id"],
        foreignTable,
        onDelete: "no action",
      });
    }
  });
});
