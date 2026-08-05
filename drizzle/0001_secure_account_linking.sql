CREATE TABLE `account_link_intents` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` text NOT NULL,
	`source_provider` text NOT NULL,
	`target_provider` text NOT NULL,
	`status` text NOT NULL,
	`expires_at` integer NOT NULL,
	`verified_at` integer,
	`consumed_at` integer,
	`completed_at` integer,
	`failure_code` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_link_intents_token_idx` ON `account_link_intents` (`token_hash`);--> statement-breakpoint
CREATE INDEX `account_link_intents_user_target_idx` ON `account_link_intents` (`user_id`,`target_provider`,`status`);--> statement-breakpoint
CREATE INDEX `account_link_intents_expiry_idx` ON `account_link_intents` (`status`,`expires_at`);