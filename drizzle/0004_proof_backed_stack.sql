CREATE TABLE `proof_review_events` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`goal_id` text NOT NULL,
	`proof_id` text NOT NULL,
	`version_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`mutation_id` text NOT NULL,
	`kind` text NOT NULL,
	`state_after` text NOT NULL,
	`visibility_after` text NOT NULL,
	`validator_key` text,
	`outcome` text,
	`reason_codes_json` text DEFAULT '[]' NOT NULL,
	`occurred_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `goal_id`, `id`),
	FOREIGN KEY (`user_id`,`goal_id`) REFERENCES `career_goals`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`goal_id`,`proof_id`,`version_id`) REFERENCES `proof_versions`(`user_id`,`goal_id`,`proof_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `proof_review_events_identity_idx` ON `proof_review_events` (`user_id`,`goal_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `proof_review_events_sequence_idx` ON `proof_review_events` (`user_id`,`goal_id`,`proof_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `proof_review_events_mutation_kind_idx` ON `proof_review_events` (`user_id`,`goal_id`,`mutation_id`,`kind`);--> statement-breakpoint
CREATE INDEX `proof_review_events_occurred_idx` ON `proof_review_events` (`user_id`,`goal_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `proof_versions` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`goal_id` text NOT NULL,
	`proof_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`schema_version` text NOT NULL,
	`daily_unit_id` text,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`summary` text NOT NULL,
	`artifact_url` text,
	`asset_id` text,
	`skill_ids_json` text NOT NULL,
	`completion_criteria_json` text DEFAULT '[]' NOT NULL,
	`visibility` text NOT NULL,
	`supersedes_version_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `goal_id`, `id`),
	FOREIGN KEY (`user_id`,`goal_id`) REFERENCES `career_goals`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`goal_id`,`proof_id`) REFERENCES `proof_items`(`user_id`,`goal_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`proof_id`,`asset_id`) REFERENCES `proof_assets`(`user_id`,`proof_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`,`goal_id`,`proof_id`,`supersedes_version_id`) REFERENCES `proof_versions`(`user_id`,`goal_id`,`proof_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `proof_versions_identity_idx` ON `proof_versions` (`user_id`,`goal_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `proof_versions_number_idx` ON `proof_versions` (`user_id`,`goal_id`,`proof_id`,`version_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `proof_versions_owner_proof_version_idx` ON `proof_versions` (`user_id`,`goal_id`,`proof_id`,`id`);--> statement-breakpoint
CREATE INDEX `proof_versions_created_idx` ON `proof_versions` (`user_id`,`goal_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `user_skill_projections` (
	`user_id` text NOT NULL,
	`goal_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`audience` text NOT NULL,
	`schema_version` text NOT NULL,
	`status` text NOT NULL,
	`proof_id` text,
	`version_id` text,
	`completed_unit_ids_json` text DEFAULT '[]' NOT NULL,
	`latest_use_at` integer,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `goal_id`, `skill_id`, `audience`),
	FOREIGN KEY (`user_id`,`goal_id`) REFERENCES `career_goals`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`goal_id`,`proof_id`,`version_id`) REFERENCES `proof_versions`(`user_id`,`goal_id`,`proof_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `user_skill_projections_status_idx` ON `user_skill_projections` (`user_id`,`goal_id`,`audience`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `proof_assets_owner_proof_id_idx` ON `proof_assets` (`user_id`,`proof_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `proof_items_owner_goal_id_idx` ON `proof_items` (`user_id`,`goal_id`,`id`);
