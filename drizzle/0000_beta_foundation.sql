CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `accounts_user_idx` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_provider_account_idx` ON `accounts` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `ai_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`purpose` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`input_schema_version` text NOT NULL,
	`output_schema_version` text NOT NULL,
	`status` text NOT NULL,
	`usage_json` text DEFAULT '{}' NOT NULL,
	`latency_ms` integer NOT NULL,
	`error_code` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_runs_user_request_idx` ON `ai_runs` (`user_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `ai_runs_status_created_idx` ON `ai_runs` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `auth_rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`count` integer NOT NULL,
	`last_request` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_rate_limits_key_unique` ON `auth_rate_limits` (`key`);--> statement-breakpoint
CREATE TABLE `career_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`role_id` text NOT NULL,
	`level` text NOT NULL,
	`weekly_minutes` integer NOT NULL,
	`target_weeks` integer NOT NULL,
	`status` text NOT NULL,
	`active_slot` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `career_goals_one_active_idx` ON `career_goals` (`user_id`,`active_slot`);--> statement-breakpoint
CREATE INDEX `career_goals_user_idx` ON `career_goals` (`user_id`);--> statement-breakpoint
CREATE TABLE `endpoint_rate_buckets` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`subject_hash` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `endpoint_rate_bucket_idx` ON `endpoint_rate_buckets` (`scope`,`subject_hash`,`window_start`);--> statement-breakpoint
CREATE INDEX `endpoint_rate_expiry_idx` ON `endpoint_rate_buckets` (`expires_at`);--> statement-breakpoint
CREATE TABLE `feature_flags` (
	`key` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`cohort_json` text DEFAULT '{}' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `idempotency_records` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scope` text NOT NULL,
	`mutation_id` text NOT NULL,
	`response_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idempotency_user_scope_mutation_idx` ON `idempotency_records` (`user_id`,`scope`,`mutation_id`);--> statement-breakpoint
CREATE TABLE `learner_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`state_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learner_profiles_user_idx` ON `learner_profiles` (`user_id`);--> statement-breakpoint
CREATE TABLE `learning_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`goal_id` text NOT NULL,
	`task_id` text NOT NULL,
	`mutation_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`goal_id`) REFERENCES `career_goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learning_events_user_mutation_idx` ON `learning_events` (`user_id`,`mutation_id`);--> statement-breakpoint
CREATE INDEX `learning_events_user_goal_idx` ON `learning_events` (`user_id`,`goal_id`);--> statement-breakpoint
CREATE TABLE `learning_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`goal_id` text NOT NULL,
	`unit_id` text NOT NULL,
	`title` text NOT NULL,
	`deliverable` text NOT NULL,
	`skill_ids_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`goal_id`) REFERENCES `career_goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `learning_tasks_user_goal_idx` ON `learning_tasks` (`user_id`,`goal_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `learning_tasks_goal_unit_idx` ON `learning_tasks` (`goal_id`,`unit_id`);--> statement-breakpoint
CREATE TABLE `migration_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`migration_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`status` text NOT NULL,
	`checkpoint_json` text DEFAULT '{}' NOT NULL,
	`result_json` text,
	`started_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `migration_runs_user_migration_idx` ON `migration_runs` (`user_id`,`migration_id`);--> statement-breakpoint
CREATE INDEX `migration_runs_status_idx` ON `migration_runs` (`status`,`started_at`);--> statement-breakpoint
CREATE TABLE `operational_events` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`route` text NOT NULL,
	`result_code` text NOT NULL,
	`latency_ms` integer NOT NULL,
	`user_surrogate` text,
	`counters_json` text DEFAULT '{}' NOT NULL,
	`occurred_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operational_events_request_idx` ON `operational_events` (`request_id`);--> statement-breakpoint
CREATE INDEX `operational_events_result_time_idx` ON `operational_events` (`result_code`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `proof_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`proof_id` text NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`proof_id`) REFERENCES `proof_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `proof_assets_object_key_unique` ON `proof_assets` (`object_key`);--> statement-breakpoint
CREATE INDEX `proof_assets_user_proof_idx` ON `proof_assets` (`user_id`,`proof_id`);--> statement-breakpoint
CREATE TABLE `proof_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`goal_id` text NOT NULL,
	`source_task_id` text,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`skill_ids_json` text DEFAULT '[]' NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`goal_id`) REFERENCES `career_goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `proof_items_user_goal_idx` ON `proof_items` (`user_id`,`goal_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `proof_items_user_task_idx` ON `proof_items` (`user_id`,`source_task_id`);--> statement-breakpoint
CREATE TABLE `public_proof_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`proof_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`published_fields_json` text NOT NULL,
	`public_view_json` text NOT NULL,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`proof_id`) REFERENCES `proof_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `public_proof_shares_token_hash_unique` ON `public_proof_shares` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `public_proof_shares_user_proof_idx` ON `public_proof_shares` (`user_id`,`proof_id`);--> statement-breakpoint
CREATE TABLE `quota_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`purpose` text NOT NULL,
	`reservation_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`entry_kind` text NOT NULL,
	`units` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quota_ledger_user_idempotency_idx` ON `quota_ledger` (`user_id`,`idempotency_key`,`entry_kind`);--> statement-breakpoint
CREATE INDEX `quota_ledger_period_idx` ON `quota_ledger` (`purpose`,`created_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verifications_identifier_idx` ON `verifications` (`identifier`);
