CREATE TABLE `learning_agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`goal_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`message` text NOT NULL,
	`context` text NOT NULL,
	`answer` text DEFAULT '' NOT NULL,
	`advice` text,
	`workspace_id` text NOT NULL,
	`base_version_id` text NOT NULL,
	`revision` integer NOT NULL,
	`provider_id` text,
	`model` text NOT NULL,
	`effort` text NOT NULL,
	`fingerprint` text NOT NULL,
	`reserved_micros` integer NOT NULL,
	`usage` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "learning_agent_budget_nonnegative" CHECK("learning_agent_runs"."reserved_micros" >= 0)
);
--> statement-breakpoint
CREATE INDEX `learning_agent_history_idx` ON `learning_agent_runs` (`owner_id`,`goal_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `learning_agent_budget_idx` ON `learning_agent_runs` (`created_at`);