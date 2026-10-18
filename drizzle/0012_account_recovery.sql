CREATE TABLE `account_recoveries` (
	`id` text PRIMARY KEY NOT NULL,
	`source_user_id` text NOT NULL,
	`target_user_id` text NOT NULL,
	`source_account_id` text NOT NULL,
	`target_account_id` text NOT NULL,
	`source_provider` text NOT NULL,
	`target_provider` text NOT NULL,
	`primary_path_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`source_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "account_recoveries_distinct_users" CHECK("account_recoveries"."source_user_id" <> "account_recoveries"."target_user_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_recoveries_source_idx` ON `account_recoveries` (`source_user_id`);--> statement-breakpoint
CREATE INDEX `account_recoveries_target_idx` ON `account_recoveries` (`target_user_id`);