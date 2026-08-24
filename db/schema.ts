// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
export {};
import { sql } from "drizzle-orm";
import { foreignKey, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const nowMs = sql`(unixepoch() * 1000)`;

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (table) => [index("sessions_user_idx").on(table.userId)]);

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
}, (table) => [
  index("accounts_user_idx").on(table.userId),
  uniqueIndex("accounts_provider_account_idx").on(table.providerId, table.accountId),
]);

export const verifications = sqliteTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
}, (table) => [index("verifications_identifier_idx").on(table.identifier)]);

export const authRateLimits = sqliteTable("auth_rate_limits", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: integer("last_request").notNull(),
});

export const learnerProfiles = sqliteTable("learner_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  stateVersion: integer("state_version").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
}, (table) => [uniqueIndex("learner_profiles_user_idx").on(table.userId)]);

export const careerGoals = sqliteTable("career_goals", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  roleId: text("role_id").notNull(),
  level: text("level", { enum: ["new", "beginner", "intermediate", "advanced"] }).notNull(),
  weeklyMinutes: integer("weekly_minutes").notNull(),
  targetWeeks: integer("target_weeks").notNull(),
  status: text("status", { enum: ["active", "archived"] }).notNull(),
  activeSlot: integer("active_slot"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
}, (table) => [
  uniqueIndex("career_goals_one_active_idx").on(table.userId, table.activeSlot),
  uniqueIndex("career_goals_user_id_idx").on(table.userId, table.id),
  index("career_goals_user_idx").on(table.userId),
]);

export const learningTasks = sqliteTable("learning_tasks", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  goalId: text("goal_id").notNull().references(() => careerGoals.id, { onDelete: "cascade" }),
  unitId: text("unit_id").notNull(),
  title: text("title").notNull(),
  deliverable: text("deliverable").notNull(),
  skillIdsJson: text("skill_ids_json").notNull().default("[]"),
  status: text("status", { enum: ["planned", "completed", "delayed", "skipped"] }).notNull().default("planned"),
  sortOrder: integer("sort_order").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
}, (table) => [
  index("learning_tasks_user_goal_idx").on(table.userId, table.goalId),
  uniqueIndex("learning_tasks_goal_unit_idx").on(table.goalId, table.unitId),
]);

export const learningEvents = sqliteTable("learning_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  goalId: text("goal_id").notNull().references(() => careerGoals.id, { onDelete: "cascade" }),
  taskId: text("task_id").notNull(),
  mutationId: text("mutation_id").notNull(),
  kind: text("kind", { enum: ["completed", "delayed", "skipped", "too_hard", "already_known"] }).notNull(),
  payloadJson: text("payload_json").notNull().default("{}"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
}, (table) => [
  uniqueIndex("learning_events_user_mutation_idx").on(table.userId, table.mutationId),
  index("learning_events_user_goal_idx").on(table.userId, table.goalId),
]);

export const proofItems = sqliteTable("proof_items", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  goalId: text("goal_id").notNull().references(() => careerGoals.id, { onDelete: "cascade" }),
  sourceTaskId: text("source_task_id"),
  title: text("title").notNull(),
  kind: text("kind", { enum: ["completion", "commit", "project", "note", "upload"] }).notNull(),
  skillIdsJson: text("skill_ids_json").notNull().default("[]"),
  verified: integer("verified", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
}, (table) => [
  index("proof_items_user_goal_idx").on(table.userId, table.goalId),
  uniqueIndex("proof_items_user_task_idx").on(table.userId, table.sourceTaskId),
  uniqueIndex("proof_items_owner_goal_id_idx").on(table.userId, table.goalId, table.id),
]);

export const proofAssets = sqliteTable("proof_assets", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  proofId: text("proof_id").notNull().references(() => proofItems.id, { onDelete: "cascade" }),
  objectKey: text("object_key").notNull().unique(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
}, (table) => [
  index("proof_assets_user_proof_idx").on(table.userId, table.proofId),
  uniqueIndex("proof_assets_owner_proof_id_idx").on(table.userId, table.proofId, table.id),
]);

export const publicProofShares = sqliteTable("public_proof_shares", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  proofId: text("proof_id").notNull().references(() => proofItems.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  publishedFieldsJson: text("published_fields_json").notNull(),
  publicViewJson: text("public_view_json").notNull(),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
}, (table) => [
  uniqueIndex("public_proof_shares_user_proof_idx").on(table.userId, table.proofId),
]);

export const migrationRuns = sqliteTable("migration_runs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  migrationId: text("migration_id").notNull(),
  requestHash: text("request_hash").notNull(),
  status: text("status", { enum: ["started", "completed", "failed"] }).notNull(),
  checkpointJson: text("checkpoint_json").notNull().default("{}"),
  resultJson: text("result_json"),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
}, (table) => [
  uniqueIndex("migration_runs_user_migration_idx").on(table.userId, table.migrationId),
  index("migration_runs_status_idx").on(table.status, table.startedAt),
]);

export const idempotencyRecords = sqliteTable("idempotency_records", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  scope: text("scope").notNull(),
  mutationId: text("mutation_id").notNull(),
  responseJson: text("response_json").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
}, (table) => [
  uniqueIndex("idempotency_user_scope_mutation_idx").on(table.userId, table.scope, table.mutationId),
]);

export const quotaLedger = sqliteTable("quota_ledger", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  purpose: text("purpose").notNull(),
  reservationId: text("reservation_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  entryKind: text("entry_kind", { enum: ["reserved", "accepted", "rejected", "failed"] }).notNull(),
  units: integer("units").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
}, (table) => [
  uniqueIndex("quota_ledger_user_idempotency_idx").on(table.userId, table.idempotencyKey, table.entryKind),
  index("quota_ledger_period_idx").on(table.purpose, table.createdAt),
]);

export const aiRuns = sqliteTable("ai_runs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  requestId: text("request_id").notNull(),
  purpose: text("purpose").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  inputSchemaVersion: text("input_schema_version").notNull(),
  outputSchemaVersion: text("output_schema_version").notNull(),
  status: text("status", { enum: ["accepted", "rejected", "failed", "denied"] }).notNull(),
  usageJson: text("usage_json").notNull().default("{}"),
  latencyMs: integer("latency_ms").notNull(),
  errorCode: text("error_code"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
}, (table) => [
  uniqueIndex("ai_runs_user_request_idx").on(table.userId, table.requestId),
  index("ai_runs_status_created_idx").on(table.status, table.createdAt),
]);

export const featureFlags = sqliteTable("feature_flags", {
  key: text("key").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  cohortJson: text("cohort_json").notNull().default("{}"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
});

export const endpointRateBuckets = sqliteTable("endpoint_rate_buckets", {
  id: text("id").primaryKey(),
  scope: text("scope").notNull(),
  subjectHash: text("subject_hash").notNull(),
  windowStart: integer("window_start", { mode: "timestamp_ms" }).notNull(),
  count: integer("count").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("endpoint_rate_bucket_idx").on(table.scope, table.subjectHash, table.windowStart),
  index("endpoint_rate_expiry_idx").on(table.expiresAt),
]);

export const operationalEvents = sqliteTable("operational_events", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull(),
  route: text("route").notNull(),
  resultCode: text("result_code").notNull(),
  latencyMs: integer("latency_ms").notNull(),
  userSurrogate: text("user_surrogate"),
  countersJson: text("counters_json").notNull().default("{}"),
  occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
}, (table) => [
  uniqueIndex("operational_events_request_idx").on(table.requestId),
  index("operational_events_result_time_idx").on(table.resultCode, table.occurredAt),
]);

export const accountLinkIntents = sqliteTable("account_link_intents", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sourceProvider: text("source_provider", { enum: ["google", "github"] }).notNull(),
  targetProvider: text("target_provider", { enum: ["google", "github"] }).notNull(),
  status: text("status", {
    enum: ["pending_reauth", "verified", "consumed", "completing", "completed", "failed", "expired"],
  }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
  consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  failureCode: text("failure_code"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
}, (table) => [
  uniqueIndex("account_link_intents_token_idx").on(table.tokenHash),
  index("account_link_intents_user_target_idx").on(
    table.userId,
    table.targetProvider,
    table.status,
  ),
  index("account_link_intents_expiry_idx").on(table.status, table.expiresAt),
]);

export const roleBlueprints = sqliteTable("role_blueprints", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  status: text("status", { enum: ["ready", "needs-review", "draft"] }).notNull(),
  currentVersion: text("current_version").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
}, (table) => [
  uniqueIndex("role_blueprints_slug_idx").on(table.slug),
]);

export const roleBlueprintVersions = sqliteTable("role_blueprint_versions", {
  id: text("id").primaryKey(),
  roleId: text("role_id").notNull().references(() => roleBlueprints.id, { onDelete: "cascade" }),
  version: text("version").notNull(),
  status: text("status", { enum: ["ready", "needs-review", "draft"] }).notNull(),
  blueprintJson: text("blueprint_json").notNull(),
  sourceCoverageJson: text("source_coverage_json").notNull().default("{}"),
  publishedAt: integer("published_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
}, (table) => [
  uniqueIndex("role_blueprint_versions_role_version_idx").on(table.roleId, table.version),
  index("role_blueprint_versions_role_idx").on(table.roleId),
]);

export const roleSkillDefinitions = sqliteTable("role_skill_definitions", {
  id: text("id").primaryKey(),
  blueprintVersionId: text("blueprint_version_id").notNull().references(
    () => roleBlueprintVersions.id,
    { onDelete: "cascade" },
  ),
  skillKey: text("skill_key").notNull(),
  name: text("name").notNull(),
  category: text("category", {
    enum: ["foundations", "frontend", "backend", "data", "quality", "cloud", "ai", "product"],
  }).notNull(),
  importance: text("importance", { enum: ["core", "strong", "advantage"] }).notNull(),
  payloadJson: text("payload_json").notNull().default("{}"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
}, (table) => [
  uniqueIndex("role_skill_definitions_version_key_idx").on(table.blueprintVersionId, table.skillKey),
  index("role_skill_definitions_version_idx").on(table.blueprintVersionId),
]);

export const roleSkillEdges = sqliteTable("role_skill_edges", {
  id: text("id").primaryKey(),
  blueprintVersionId: text("blueprint_version_id").notNull().references(
    () => roleBlueprintVersions.id,
    { onDelete: "cascade" },
  ),
  fromSkillKey: text("from_skill_key").notNull(),
  toSkillKey: text("to_skill_key").notNull(),
  relation: text("relation", { enum: ["prerequisite"] }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
}, (table) => [
  foreignKey({
    columns: [table.blueprintVersionId, table.fromSkillKey],
    foreignColumns: [roleSkillDefinitions.blueprintVersionId, roleSkillDefinitions.skillKey],
    name: "role_skill_edges_from_skill_fk",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.blueprintVersionId, table.toSkillKey],
    foreignColumns: [roleSkillDefinitions.blueprintVersionId, roleSkillDefinitions.skillKey],
    name: "role_skill_edges_to_skill_fk",
  }).onDelete("cascade"),
  uniqueIndex("role_skill_edges_unique_idx").on(
    table.blueprintVersionId,
    table.fromSkillKey,
    table.toSkillKey,
    table.relation,
  ),
  index("role_skill_edges_version_idx").on(table.blueprintVersionId),
]);

export const learningResources = sqliteTable("learning_resources", {
  id: text("id").primaryKey(),
  canonicalUrl: text("canonical_url").notNull(),
  title: text("title").notNull(),
  provider: text("provider").notNull(),
  language: text("language", { enum: ["en", "zh-CN"] }).notNull(),
  cost: text("cost", { enum: ["free", "paid", "mixed"] }).notNull(),
  format: text("format", {
    enum: ["documentation", "course", "guide", "reference", "practice"],
  }).notNull(),
  sourceTier: text("source_tier", {
    enum: ["primary", "institutional", "practitioner", "community"],
  }).notNull(),
  lastVerifiedAt: text("last_verified_at").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
}, (table) => [
  uniqueIndex("learning_resources_url_idx").on(table.canonicalUrl),
]);

export const resourceSkillLinks = sqliteTable("resource_skill_links", {
  id: text("id").primaryKey(),
  blueprintVersionId: text("blueprint_version_id").notNull().references(
    () => roleBlueprintVersions.id,
    { onDelete: "cascade" },
  ),
  skillKey: text("skill_key").notNull(),
  resourceId: text("resource_id").notNull().references(
    () => learningResources.id,
    { onDelete: "restrict" },
  ),
  purpose: text("purpose", { enum: ["primary", "alternative", "reference"] }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
}, (table) => [
  foreignKey({
    columns: [table.blueprintVersionId, table.skillKey],
    foreignColumns: [roleSkillDefinitions.blueprintVersionId, roleSkillDefinitions.skillKey],
    name: "resource_skill_links_skill_fk",
  }).onDelete("cascade"),
  uniqueIndex("resource_skill_links_unique_idx").on(
    table.blueprintVersionId,
    table.skillKey,
    table.resourceId,
    table.purpose,
  ),
  index("resource_skill_links_version_idx").on(table.blueprintVersionId),
  index("resource_skill_links_resource_idx").on(table.resourceId),
]);

export const skillAuditVersions = sqliteTable("skill_audit_versions", {
  id: text("id").notNull(),
  userId: text("user_id").notNull(),
  goalId: text("goal_id").notNull(),
  schemaVersion: text("schema_version").notNull(),
  blueprintId: text("blueprint_id").notNull(),
  blueprintVersion: text("blueprint_version").notNull(),
  inputFingerprint: text("input_fingerprint").notNull(),
  payloadJson: text("payload_json").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
}, (table) => [
  primaryKey({ columns: [table.userId, table.goalId, table.id] }),
  foreignKey({
    columns: [table.userId, table.goalId],
    foreignColumns: [careerGoals.userId, careerGoals.id],
    name: "skill_audit_versions_goal_fk",
  }).onDelete("cascade"),
  uniqueIndex("skill_audit_versions_identity_idx").on(table.userId, table.goalId, table.id),
  index("skill_audit_versions_fingerprint_idx").on(table.userId, table.goalId, table.inputFingerprint),
]);

export const availabilityVersions = sqliteTable("availability_versions", {
  id: text("id").notNull(),
  userId: text("user_id").notNull(),
  goalId: text("goal_id").notNull(),
  schemaVersion: text("schema_version").notNull(),
  inputFingerprint: text("input_fingerprint").notNull(),
  weeklyMinutes: integer("weekly_minutes").notNull(),
  payloadJson: text("payload_json").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
}, (table) => [
  primaryKey({ columns: [table.userId, table.goalId, table.id] }),
  foreignKey({
    columns: [table.userId, table.goalId],
    foreignColumns: [careerGoals.userId, careerGoals.id],
    name: "availability_versions_goal_fk",
  }).onDelete("cascade"),
  uniqueIndex("availability_versions_identity_idx").on(table.userId, table.goalId, table.id),
  index("availability_versions_fingerprint_idx").on(table.userId, table.goalId, table.inputFingerprint),
]);

export const learningPathVersions = sqliteTable("learning_path_versions", {
  id: text("id").notNull(),
  userId: text("user_id").notNull(),
  goalId: text("goal_id").notNull(),
  schemaVersion: text("schema_version").notNull(),
  blueprintId: text("blueprint_id").notNull(),
  blueprintVersion: text("blueprint_version").notNull(),
  registryId: text("registry_id").notNull(),
  registryVersion: text("registry_version").notNull(),
  auditVersionId: text("audit_version_id").notNull(),
  availabilityVersionId: text("availability_version_id").notNull(),
  scopeMode: text("scope_mode", { enum: ["full-scope", "target-date"] }).notNull(),
  inputFingerprint: text("input_fingerprint").notNull(),
  payloadJson: text("payload_json").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
}, (table) => [
  primaryKey({ columns: [table.userId, table.goalId, table.id] }),
  foreignKey({
    columns: [table.userId, table.goalId],
    foreignColumns: [careerGoals.userId, careerGoals.id],
    name: "learning_path_versions_goal_fk",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.userId, table.goalId, table.auditVersionId],
    foreignColumns: [skillAuditVersions.userId, skillAuditVersions.goalId, skillAuditVersions.id],
    name: "learning_path_versions_audit_fk",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.userId, table.goalId, table.availabilityVersionId],
    foreignColumns: [availabilityVersions.userId, availabilityVersions.goalId, availabilityVersions.id],
    name: "learning_path_versions_availability_fk",
  }).onDelete("cascade"),
  uniqueIndex("learning_path_versions_identity_idx").on(table.userId, table.goalId, table.id),
  index("learning_path_versions_fingerprint_idx").on(table.userId, table.goalId, table.inputFingerprint),
]);

const planningEventKinds = [
  "completed", "delayed", "skipped", "too_hard", "already_known", "availability_changed",
  "replan_accepted", "replan_discarded",
] as const;

export const planVersions = sqliteTable("plan_versions", {
  id: text("id").notNull(),
  userId: text("user_id").notNull(),
  goalId: text("goal_id").notNull(),
  schemaVersion: text("schema_version").notNull(),
  pathVersionId: text("path_version_id").notNull(),
  generation: text("generation", { enum: ["initial", "automatic", "proposed"] }).notNull(),
  baseVersionId: text("base_version_id"),
  replanReason: text("replan_reason", { enum: planningEventKinds }),
  planningDate: text("planning_date").notNull(),
  inputFingerprint: text("input_fingerprint").notNull(),
  payloadJson: text("payload_json").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
}, (table) => [
  primaryKey({ columns: [table.userId, table.goalId, table.id] }),
  foreignKey({
    columns: [table.userId, table.goalId],
    foreignColumns: [careerGoals.userId, careerGoals.id],
    name: "plan_versions_goal_fk",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.userId, table.goalId, table.pathVersionId],
    foreignColumns: [learningPathVersions.userId, learningPathVersions.goalId, learningPathVersions.id],
    name: "plan_versions_path_fk",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.userId, table.goalId, table.baseVersionId],
    foreignColumns: [table.userId, table.goalId, table.id],
    name: "plan_versions_base_fk",
  }).onDelete("no action"),
  uniqueIndex("plan_versions_identity_idx").on(table.userId, table.goalId, table.id),
  index("plan_versions_fingerprint_idx").on(table.userId, table.goalId, table.inputFingerprint),
]);

export const dailyUnits = sqliteTable("daily_units", {
  id: text("id").notNull(),
  userId: text("user_id").notNull(),
  goalId: text("goal_id").notNull(),
  planVersionId: text("plan_version_id").notNull(),
  unitId: text("unit_id").notNull(),
  scheduledDate: text("scheduled_date").notNull(),
  slot: text("slot", { enum: ["primary", "stretch"] }).notNull(),
  required: integer("required", { mode: "boolean" }).notNull(),
  payloadJson: text("payload_json").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
}, (table) => [
  primaryKey({ columns: [table.userId, table.goalId, table.id] }),
  foreignKey({
    columns: [table.userId, table.goalId],
    foreignColumns: [careerGoals.userId, careerGoals.id],
    name: "daily_units_goal_fk",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.userId, table.goalId, table.planVersionId],
    foreignColumns: [planVersions.userId, planVersions.goalId, planVersions.id],
    name: "daily_units_plan_fk",
  }).onDelete("cascade"),
  uniqueIndex("daily_units_unit_idx").on(table.userId, table.goalId, table.planVersionId, table.unitId),
  uniqueIndex("daily_units_slot_idx").on(
    table.userId,
    table.goalId,
    table.planVersionId,
    table.scheduledDate,
    table.slot,
  ),
]);

export const planningWorkspaces = sqliteTable("planning_workspaces", {
  id: text("id").notNull(),
  userId: text("user_id").notNull(),
  goalId: text("goal_id").notNull(),
  revision: integer("revision").notNull().default(0),
  currentAuditVersionId: text("current_audit_version_id"),
  currentAvailabilityVersionId: text("current_availability_version_id"),
  activePathVersionId: text("active_path_version_id"),
  activePlanVersionId: text("active_plan_version_id"),
  pendingPlanVersionId: text("pending_plan_version_id"),
  nextSequence: integer("next_sequence").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
}, (table) => [
  primaryKey({ columns: [table.userId, table.goalId, table.id] }),
  foreignKey({
    columns: [table.userId, table.goalId],
    foreignColumns: [careerGoals.userId, careerGoals.id],
    name: "planning_workspaces_goal_fk",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.userId, table.goalId, table.currentAuditVersionId],
    foreignColumns: [skillAuditVersions.userId, skillAuditVersions.goalId, skillAuditVersions.id],
    name: "planning_workspaces_audit_fk",
  }).onDelete("no action"),
  foreignKey({
    columns: [table.userId, table.goalId, table.currentAvailabilityVersionId],
    foreignColumns: [availabilityVersions.userId, availabilityVersions.goalId, availabilityVersions.id],
    name: "planning_workspaces_availability_fk",
  }).onDelete("no action"),
  foreignKey({
    columns: [table.userId, table.goalId, table.activePathVersionId],
    foreignColumns: [learningPathVersions.userId, learningPathVersions.goalId, learningPathVersions.id],
    name: "planning_workspaces_path_fk",
  }).onDelete("no action"),
  foreignKey({
    columns: [table.userId, table.goalId, table.activePlanVersionId],
    foreignColumns: [planVersions.userId, planVersions.goalId, planVersions.id],
    name: "planning_workspaces_active_plan_fk",
  }).onDelete("no action"),
  foreignKey({
    columns: [table.userId, table.goalId, table.pendingPlanVersionId],
    foreignColumns: [planVersions.userId, planVersions.goalId, planVersions.id],
    name: "planning_workspaces_pending_plan_fk",
  }).onDelete("no action"),
  uniqueIndex("planning_workspaces_identity_idx").on(table.userId, table.goalId, table.id),
  uniqueIndex("planning_workspaces_goal_idx").on(table.userId, table.goalId),
]);

export const planningEvents = sqliteTable("planning_events", {
  id: text("id").notNull(),
  userId: text("user_id").notNull(),
  goalId: text("goal_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  sequence: integer("sequence").notNull(),
  mutationId: text("mutation_id").notNull(),
  targetPlanVersionId: text("target_plan_version_id").notNull(),
  candidatePlanVersionId: text("candidate_plan_version_id"),
  unitId: text("unit_id"),
  kind: text("kind", { enum: planningEventKinds }).notNull(),
  payloadJson: text("payload_json").notNull(),
  occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
}, (table) => [
  primaryKey({ columns: [table.userId, table.goalId, table.id] }),
  foreignKey({
    columns: [table.userId, table.goalId],
    foreignColumns: [careerGoals.userId, careerGoals.id],
    name: "planning_events_goal_fk",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.userId, table.goalId, table.workspaceId],
    foreignColumns: [planningWorkspaces.userId, planningWorkspaces.goalId, planningWorkspaces.id],
    name: "planning_events_workspace_fk",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.userId, table.goalId, table.targetPlanVersionId],
    foreignColumns: [planVersions.userId, planVersions.goalId, planVersions.id],
    name: "planning_events_target_plan_fk",
  }).onDelete("no action"),
  foreignKey({
    columns: [table.userId, table.goalId, table.candidatePlanVersionId],
    foreignColumns: [planVersions.userId, planVersions.goalId, planVersions.id],
    name: "planning_events_candidate_plan_fk",
  }).onDelete("no action"),
  uniqueIndex("planning_events_sequence_idx").on(table.userId, table.goalId, table.workspaceId, table.sequence),
  uniqueIndex("planning_events_mutation_idx").on(table.userId, table.mutationId),
]);

const proofArtifactKinds = [
  "repository", "commit", "pull_request", "deployment", "api", "document", "screenshot",
  "test_report", "code", "upload", "reflection",
] as const;
const proofReviewStates = [
  "draft", "pending_review", "demonstrated", "verified", "rejected", "withdrawn", "superseded",
] as const;
const proofReviewEventKinds = [
  "drafted", "submitted", "structural_passed", "validator_passed", "validator_failed",
  "validator_unavailable", "rejected", "withdrawn", "superseded", "visibility_changed",
] as const;

export const proofVersions = sqliteTable("proof_versions", {
  id: text("id").notNull(),
  userId: text("user_id").notNull(),
  goalId: text("goal_id").notNull(),
  proofId: text("proof_id").notNull(),
  versionNumber: integer("version_number").notNull(),
  schemaVersion: text("schema_version").notNull(),
  dailyUnitId: text("daily_unit_id"),
  title: text("title").notNull(),
  kind: text("kind", { enum: proofArtifactKinds }).notNull(),
  summary: text("summary").notNull(),
  artifactUrl: text("artifact_url"),
  assetId: text("asset_id"),
  skillIdsJson: text("skill_ids_json").notNull(),
  completionCriteriaJson: text("completion_criteria_json").notNull().default("[]"),
  visibility: text("visibility", { enum: ["private", "public"] }).notNull(),
  supersedesVersionId: text("supersedes_version_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
}, (table) => [
  primaryKey({ columns: [table.userId, table.goalId, table.id] }),
  foreignKey({
    columns: [table.userId, table.goalId],
    foreignColumns: [careerGoals.userId, careerGoals.id],
    name: "proof_versions_goal_fk",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.userId, table.goalId, table.proofId],
    foreignColumns: [proofItems.userId, proofItems.goalId, proofItems.id],
    name: "proof_versions_root_fk",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.userId, table.proofId, table.assetId],
    foreignColumns: [proofAssets.userId, proofAssets.proofId, proofAssets.id],
    name: "proof_versions_asset_fk",
  }).onDelete("no action"),
  foreignKey({
    columns: [table.userId, table.goalId, table.proofId, table.supersedesVersionId],
    foreignColumns: [table.userId, table.goalId, table.proofId, table.id],
    name: "proof_versions_supersedes_fk",
  }).onDelete("no action"),
  uniqueIndex("proof_versions_identity_idx").on(table.userId, table.goalId, table.id),
  uniqueIndex("proof_versions_number_idx").on(
    table.userId,
    table.goalId,
    table.proofId,
    table.versionNumber,
  ),
  uniqueIndex("proof_versions_owner_proof_version_idx").on(
    table.userId,
    table.goalId,
    table.proofId,
    table.id,
  ),
  index("proof_versions_created_idx").on(table.userId, table.goalId, table.createdAt),
]);

export const proofReviewEvents = sqliteTable("proof_review_events", {
  id: text("id").notNull(),
  userId: text("user_id").notNull(),
  goalId: text("goal_id").notNull(),
  proofId: text("proof_id").notNull(),
  versionId: text("version_id").notNull(),
  sequence: integer("sequence").notNull(),
  mutationId: text("mutation_id").notNull(),
  kind: text("kind", { enum: proofReviewEventKinds }).notNull(),
  stateAfter: text("state_after", { enum: proofReviewStates }).notNull(),
  visibilityAfter: text("visibility_after", { enum: ["private", "public"] }).notNull(),
  validatorKey: text("validator_key"),
  outcome: text("outcome", { enum: ["passed", "failed", "unavailable"] }),
  reasonCodesJson: text("reason_codes_json").notNull().default("[]"),
  occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
}, (table) => [
  primaryKey({ columns: [table.userId, table.goalId, table.id] }),
  foreignKey({
    columns: [table.userId, table.goalId],
    foreignColumns: [careerGoals.userId, careerGoals.id],
    name: "proof_review_events_goal_fk",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.userId, table.goalId, table.proofId, table.versionId],
    foreignColumns: [proofVersions.userId, proofVersions.goalId, proofVersions.proofId, proofVersions.id],
    name: "proof_review_events_version_fk",
  }).onDelete("cascade"),
  uniqueIndex("proof_review_events_identity_idx").on(table.userId, table.goalId, table.id),
  uniqueIndex("proof_review_events_sequence_idx").on(
    table.userId,
    table.goalId,
    table.proofId,
    table.sequence,
  ),
  uniqueIndex("proof_review_events_mutation_kind_idx").on(
    table.userId,
    table.goalId,
    table.mutationId,
    table.kind,
  ),
  index("proof_review_events_occurred_idx").on(table.userId, table.goalId, table.occurredAt),
]);

export const userSkillProjections = sqliteTable("user_skill_projections", {
  userId: text("user_id").notNull(),
  goalId: text("goal_id").notNull(),
  skillId: text("skill_id").notNull(),
  audience: text("audience", { enum: ["internal", "public"] }).notNull(),
  schemaVersion: text("schema_version").notNull(),
  status: text("status", {
    enum: ["exploring", "practicing", "demonstrated", "verified"],
  }).notNull(),
  proofId: text("proof_id"),
  versionId: text("version_id"),
  completedUnitIdsJson: text("completed_unit_ids_json").notNull().default("[]"),
  latestUseAt: integer("latest_use_at", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
}, (table) => [
  primaryKey({ columns: [table.userId, table.goalId, table.skillId, table.audience] }),
  foreignKey({
    columns: [table.userId, table.goalId],
    foreignColumns: [careerGoals.userId, careerGoals.id],
    name: "user_skill_projections_goal_fk",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.userId, table.goalId, table.proofId, table.versionId],
    foreignColumns: [proofVersions.userId, proofVersions.goalId, proofVersions.proofId, proofVersions.id],
    name: "user_skill_projections_version_fk",
  }).onDelete("no action"),
  index("user_skill_projections_status_idx").on(table.userId, table.goalId, table.audience, table.status),
]);
