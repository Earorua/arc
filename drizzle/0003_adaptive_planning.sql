CREATE TABLE `availability_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`goal_id` text NOT NULL,
	`schema_version` text NOT NULL,
	`input_fingerprint` text NOT NULL,
	`weekly_minutes` integer NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`,`goal_id`) REFERENCES `career_goals`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `availability_versions_identity_idx` ON `availability_versions` (`user_id`,`goal_id`,`id`);--> statement-breakpoint
CREATE INDEX `availability_versions_fingerprint_idx` ON `availability_versions` (`user_id`,`goal_id`,`input_fingerprint`);--> statement-breakpoint
CREATE TABLE `daily_units` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`goal_id` text NOT NULL,
	`plan_version_id` text NOT NULL,
	`unit_id` text NOT NULL,
	`scheduled_date` text NOT NULL,
	`slot` text NOT NULL,
	`required` integer NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`,`goal_id`) REFERENCES `career_goals`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`goal_id`,`plan_version_id`) REFERENCES `plan_versions`(`user_id`,`goal_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_units_unit_idx` ON `daily_units` (`user_id`,`goal_id`,`plan_version_id`,`unit_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `daily_units_slot_idx` ON `daily_units` (`user_id`,`goal_id`,`plan_version_id`,`scheduled_date`,`slot`);--> statement-breakpoint
CREATE TABLE `learning_path_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`goal_id` text NOT NULL,
	`schema_version` text NOT NULL,
	`blueprint_id` text NOT NULL,
	`blueprint_version` text NOT NULL,
	`registry_id` text NOT NULL,
	`registry_version` text NOT NULL,
	`audit_version_id` text NOT NULL,
	`availability_version_id` text NOT NULL,
	`scope_mode` text NOT NULL,
	`input_fingerprint` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`,`goal_id`) REFERENCES `career_goals`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`goal_id`,`audit_version_id`) REFERENCES `skill_audit_versions`(`user_id`,`goal_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`goal_id`,`availability_version_id`) REFERENCES `availability_versions`(`user_id`,`goal_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learning_path_versions_identity_idx` ON `learning_path_versions` (`user_id`,`goal_id`,`id`);--> statement-breakpoint
CREATE INDEX `learning_path_versions_fingerprint_idx` ON `learning_path_versions` (`user_id`,`goal_id`,`input_fingerprint`);--> statement-breakpoint
CREATE TABLE `plan_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`goal_id` text NOT NULL,
	`schema_version` text NOT NULL,
	`path_version_id` text NOT NULL,
	`generation` text NOT NULL,
	`base_version_id` text,
	`replan_reason` text,
	`planning_date` text NOT NULL,
	`input_fingerprint` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`,`goal_id`) REFERENCES `career_goals`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`goal_id`,`path_version_id`) REFERENCES `learning_path_versions`(`user_id`,`goal_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`goal_id`,`base_version_id`) REFERENCES `plan_versions`(`user_id`,`goal_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_versions_identity_idx` ON `plan_versions` (`user_id`,`goal_id`,`id`);--> statement-breakpoint
CREATE INDEX `plan_versions_fingerprint_idx` ON `plan_versions` (`user_id`,`goal_id`,`input_fingerprint`);--> statement-breakpoint
CREATE TABLE `planning_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`goal_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`mutation_id` text NOT NULL,
	`target_plan_version_id` text NOT NULL,
	`candidate_plan_version_id` text,
	`unit_id` text,
	`kind` text NOT NULL,
	`payload_json` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`,`goal_id`) REFERENCES `career_goals`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`goal_id`,`workspace_id`) REFERENCES `planning_workspaces`(`user_id`,`goal_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`goal_id`,`target_plan_version_id`) REFERENCES `plan_versions`(`user_id`,`goal_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`,`goal_id`,`candidate_plan_version_id`) REFERENCES `plan_versions`(`user_id`,`goal_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `planning_events_sequence_idx` ON `planning_events` (`user_id`,`goal_id`,`workspace_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `planning_events_mutation_idx` ON `planning_events` (`user_id`,`mutation_id`);--> statement-breakpoint
CREATE TABLE `planning_workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`goal_id` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`current_audit_version_id` text,
	`current_availability_version_id` text,
	`active_path_version_id` text,
	`active_plan_version_id` text,
	`pending_plan_version_id` text,
	`next_sequence` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`,`goal_id`) REFERENCES `career_goals`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`goal_id`,`current_audit_version_id`) REFERENCES `skill_audit_versions`(`user_id`,`goal_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`,`goal_id`,`current_availability_version_id`) REFERENCES `availability_versions`(`user_id`,`goal_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`,`goal_id`,`active_path_version_id`) REFERENCES `learning_path_versions`(`user_id`,`goal_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`,`goal_id`,`active_plan_version_id`) REFERENCES `plan_versions`(`user_id`,`goal_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`,`goal_id`,`pending_plan_version_id`) REFERENCES `plan_versions`(`user_id`,`goal_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `planning_workspaces_identity_idx` ON `planning_workspaces` (`user_id`,`goal_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `planning_workspaces_goal_idx` ON `planning_workspaces` (`user_id`,`goal_id`);--> statement-breakpoint
CREATE TABLE `skill_audit_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`goal_id` text NOT NULL,
	`schema_version` text NOT NULL,
	`blueprint_id` text NOT NULL,
	`blueprint_version` text NOT NULL,
	`input_fingerprint` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`,`goal_id`) REFERENCES `career_goals`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skill_audit_versions_identity_idx` ON `skill_audit_versions` (`user_id`,`goal_id`,`id`);--> statement-breakpoint
CREATE INDEX `skill_audit_versions_fingerprint_idx` ON `skill_audit_versions` (`user_id`,`goal_id`,`input_fingerprint`);--> statement-breakpoint
CREATE UNIQUE INDEX `career_goals_user_id_idx` ON `career_goals` (`user_id`,`id`);