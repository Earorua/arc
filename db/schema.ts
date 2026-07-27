// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
export {};
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
}, (table) => [index("proof_assets_user_proof_idx").on(table.userId, table.proofId)]);

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
