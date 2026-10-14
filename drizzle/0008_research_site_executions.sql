ALTER TABLE `research_runs` ADD COLUMN `execution_mode` text NOT NULL DEFAULT 'synchronous'
	CONSTRAINT "research_runs_execution_mode_check" CHECK(typeof(`execution_mode`) = 'text' AND `execution_mode` IN ('synchronous', 'cloudflare-workflow-v1'));
--> statement-breakpoint
ALTER TABLE `research_runs` ADD COLUMN `remote_quota_key` text
	CONSTRAINT "research_runs_remote_quota_key_check" CHECK(
		(`execution_mode` = 'synchronous' AND `remote_quota_key` IS NULL)
		OR (`execution_mode` = 'cloudflare-workflow-v1' AND typeof(`remote_quota_key`) = 'text' AND length(`remote_quota_key`) BETWEEN 8 AND 128)
	);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_runs_remote_quota_idx` ON `research_runs` (`user_id`,`remote_quota_key`) WHERE `remote_quota_key` IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER `research_runs_execution_classification_immutable`
BEFORE UPDATE OF `execution_mode`,`remote_quota_key` ON `research_runs`
WHEN NOT (NEW.`execution_mode` IS OLD.`execution_mode` AND NEW.`remote_quota_key` IS OLD.`remote_quota_key`)
BEGIN
	SELECT RAISE(ABORT, 'research run execution classification is immutable');
END;
--> statement-breakpoint
CREATE TABLE `research_site_executions` (
	`run_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`job_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`job_json` text NOT NULL,
	`validation_context_json` text NOT NULL,
	`quota_key` text NOT NULL,
	`cache_days` integer NOT NULL,
	`user_daily_quota` integer NOT NULL,
	`daily_budget_micros` integer NOT NULL,
	`monthly_budget_micros` integer NOT NULL,
	`maximum_micros` integer NOT NULL,
	`queue_expires_at` integer NOT NULL,
	`reservation_expires_at` integer NOT NULL,
	`admission_state` text DEFAULT 'pending' NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`quota_reservation_id` text,
	`budget_reservation_id` text,
	`admitted_at` integer,
	`closed_at` integer,
	`close_reason` text,
	`began_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `research_runs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`,`run_id`) REFERENCES `research_runs`(`user_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "research_site_executions_text_identity_check" CHECK(
		typeof(`run_id`) = 'text' AND length(`run_id`) > 0
		AND typeof(`user_id`) = 'text' AND length(`user_id`) > 0
		AND typeof(`request_id`) = 'text' AND length(`request_id`) > 0
		AND typeof(`job_id`) = 'text' AND length(`job_id`) > 0
		AND typeof(`quota_key`) = 'text' AND length(`quota_key`) BETWEEN 8 AND 128
	),
	CONSTRAINT "research_site_executions_request_hash_check" CHECK(
		typeof(`request_hash`) = 'text' AND length(`request_hash`) = 64
		AND length(CAST(`request_hash` AS BLOB)) = 64
		AND `request_hash` NOT GLOB '*[^0-9a-f]*'
	),
	CONSTRAINT "research_site_executions_job_json_check" CHECK(
		typeof(`job_json`) = 'text' AND json_valid(`job_json`)
		AND length(CAST(`job_json` AS BLOB)) <= 4096
		AND json_type(`job_json`, '$') IS 'object'
		AND json_type(`job_json`, '$.jobId') IS 'text'
		AND json_extract(`job_json`, '$.jobId') IS `job_id`
		AND json_type(`job_json`, '$.runId') IS 'text'
		AND json_extract(`job_json`, '$.runId') IS `run_id`
		AND json_type(`job_json`, '$.requestId') IS 'text'
		AND json_extract(`job_json`, '$.requestId') IS `request_id`
		AND json_type(`job_json`, '$.createdAt') IS 'integer'
		AND json_extract(`job_json`, '$.createdAt') IS `created_at`
		AND json_type(`job_json`, '$.queueExpiresAt') IS 'integer'
		AND json_extract(`job_json`, '$.queueExpiresAt') IS `queue_expires_at`
	),
	CONSTRAINT "research_site_executions_context_json_check" CHECK(
		typeof(`validation_context_json`) = 'text' AND json_valid(`validation_context_json`)
		AND length(CAST(`validation_context_json` AS BLOB)) <= 4096
	),
	CONSTRAINT "research_site_executions_cache_days_check" CHECK(typeof(`cache_days`) = 'integer' AND `cache_days` BETWEEN 1 AND 365),
	CONSTRAINT "research_site_executions_user_quota_check" CHECK(typeof(`user_daily_quota`) = 'integer' AND `user_daily_quota` BETWEEN 1 AND 100000),
	CONSTRAINT "research_site_executions_daily_budget_check" CHECK(typeof(`daily_budget_micros`) = 'integer' AND `daily_budget_micros` BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "research_site_executions_monthly_budget_check" CHECK(typeof(`monthly_budget_micros`) = 'integer' AND `monthly_budget_micros` BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "research_site_executions_maximum_check" CHECK(typeof(`maximum_micros`) = 'integer' AND `maximum_micros` BETWEEN 1 AND 5000000),
	CONSTRAINT "research_site_executions_created_time_check" CHECK(
		typeof(`created_at`) = 'integer' AND `created_at` BETWEEN 0 AND 9007199253360991
		AND typeof(`updated_at`) = 'integer' AND `updated_at` BETWEEN `created_at` AND 9007199254740991
	),
	CONSTRAINT "research_site_executions_expiry_check" CHECK(
		typeof(`queue_expires_at`) = 'integer' AND `queue_expires_at` BETWEEN 0 AND 9007199254740991
		AND typeof(`reservation_expires_at`) = 'integer' AND `reservation_expires_at` BETWEEN 0 AND 9007199254740991
		AND `queue_expires_at` = `created_at` + 120000
		AND `reservation_expires_at` = `created_at` + 1380000
	),
	CONSTRAINT "research_site_executions_state_check" CHECK(
		typeof(`admission_state`) = 'text' AND `admission_state` IN ('pending', 'admitted', 'closed')
	),
	CONSTRAINT "research_site_executions_version_check" CHECK(typeof(`version`) = 'integer' AND `version` BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "research_site_executions_reservation_markers_check" CHECK(
		(`quota_reservation_id` IS NULL AND `budget_reservation_id` IS NULL AND `admitted_at` IS NULL)
		OR (typeof(`quota_reservation_id`) = 'text' AND length(`quota_reservation_id`) > 0
			AND typeof(`budget_reservation_id`) = 'text' AND length(`budget_reservation_id`) > 0
			AND typeof(`admitted_at`) = 'integer' AND `admitted_at` BETWEEN `created_at` AND 9007199254740991
			AND `admitted_at` <= `updated_at`)
	),
	CONSTRAINT "research_site_executions_closure_markers_check" CHECK(
		(`closed_at` IS NULL AND `close_reason` IS NULL)
		OR (typeof(`closed_at`) = 'integer' AND `closed_at` BETWEEN `created_at` AND 9007199254740991
			AND `closed_at` <= `updated_at` AND typeof(`close_reason`) = 'text'
			AND `close_reason` IN ('cached', 'denied', 'expired', 'interrupted'))
	),
	CONSTRAINT "research_site_executions_begin_marker_check" CHECK(
		`began_at` IS NULL OR (typeof(`began_at`) = 'integer' AND `began_at` BETWEEN `admitted_at` AND `updated_at`
			AND `began_at` < `queue_expires_at`)
	),
	CONSTRAINT "research_site_executions_state_markers_check" CHECK(
		(`admission_state` = 'pending' AND `quota_reservation_id` IS NULL AND `budget_reservation_id` IS NULL
			AND `admitted_at` IS NULL AND `closed_at` IS NULL AND `close_reason` IS NULL AND `began_at` IS NULL)
		OR (`admission_state` = 'admitted' AND `quota_reservation_id` IS NOT NULL AND `budget_reservation_id` IS NOT NULL
			AND `admitted_at` IS NOT NULL AND `closed_at` IS NULL AND `close_reason` IS NULL)
		OR (`admission_state` = 'closed' AND `closed_at` IS NOT NULL AND `close_reason` IS NOT NULL AND `began_at` IS NULL)
	)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_site_executions_request_idx` ON `research_site_executions` (`request_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_site_executions_job_idx` ON `research_site_executions` (`job_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_site_executions_owner_quota_idx` ON `research_site_executions` (`user_id`,`quota_key`);
--> statement-breakpoint
CREATE INDEX `research_site_executions_maintenance_idx` ON `research_site_executions` (`admission_state`,`queue_expires_at`,`run_id`);
--> statement-breakpoint
CREATE TRIGGER `research_site_executions_insert_guard`
BEFORE INSERT ON `research_site_executions`
WHEN NOT (
	NEW.`admission_state` IS 'pending' AND NEW.`version` = 0
	AND NEW.`quota_reservation_id` IS NULL AND NEW.`budget_reservation_id` IS NULL
	AND NEW.`admitted_at` IS NULL AND NEW.`closed_at` IS NULL AND NEW.`close_reason` IS NULL AND NEW.`began_at` IS NULL
	AND EXISTS (
		SELECT 1 FROM `research_runs` AS `run`
		WHERE `run`.`id` = NEW.`run_id`
			AND `run`.`user_id` = NEW.`user_id`
			AND `run`.`request_id` = NEW.`request_id`
			AND `run`.`execution_mode` = 'cloudflare-workflow-v1'
			AND `run`.`remote_quota_key` = NEW.`quota_key`
			AND `run`.`state` = 'queued'
			AND `run`.`active_slot` = 1
			AND `run`.`created_at` = NEW.`created_at`
			AND `run`.`active_expires_at` = NEW.`queue_expires_at`
	)
)
BEGIN
	SELECT RAISE(ABORT, 'invalid research site execution insert');
END;
--> statement-breakpoint
CREATE TRIGGER `research_site_executions_identity_immutable`
BEFORE UPDATE OF `run_id`,`user_id`,`request_id`,`job_id`,`request_hash`,`job_json`,`validation_context_json`,`quota_key`,`cache_days`,`user_daily_quota`,`daily_budget_micros`,`monthly_budget_micros`,`maximum_micros`,`queue_expires_at`,`reservation_expires_at`,`created_at` ON `research_site_executions`
WHEN NOT (
	NEW.`run_id` IS OLD.`run_id`
	AND NEW.`user_id` IS OLD.`user_id`
	AND NEW.`request_id` IS OLD.`request_id`
	AND NEW.`job_id` IS OLD.`job_id`
	AND NEW.`request_hash` IS OLD.`request_hash`
	AND NEW.`job_json` IS OLD.`job_json`
	AND NEW.`validation_context_json` IS OLD.`validation_context_json`
	AND NEW.`quota_key` IS OLD.`quota_key`
	AND NEW.`cache_days` IS OLD.`cache_days`
	AND NEW.`user_daily_quota` IS OLD.`user_daily_quota`
	AND NEW.`daily_budget_micros` IS OLD.`daily_budget_micros`
	AND NEW.`monthly_budget_micros` IS OLD.`monthly_budget_micros`
	AND NEW.`maximum_micros` IS OLD.`maximum_micros`
	AND NEW.`queue_expires_at` IS OLD.`queue_expires_at`
	AND NEW.`reservation_expires_at` IS OLD.`reservation_expires_at`
	AND NEW.`created_at` IS OLD.`created_at`
)
BEGIN
	SELECT RAISE(ABORT, 'research site execution identity is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `research_site_executions_lifecycle_guard`
BEFORE UPDATE ON `research_site_executions`
WHEN NEW.`version` <> OLD.`version` + 1
	OR NEW.`updated_at` < OLD.`updated_at`
	OR (OLD.`admission_state` = 'closed' AND NEW.`admission_state` <> 'closed')
	OR (OLD.`admission_state` = 'admitted' AND NEW.`admission_state` = 'pending')
	OR (OLD.`quota_reservation_id` IS NOT NULL AND NEW.`quota_reservation_id` IS NOT OLD.`quota_reservation_id`)
	OR (OLD.`budget_reservation_id` IS NOT NULL AND NEW.`budget_reservation_id` IS NOT OLD.`budget_reservation_id`)
	OR (OLD.`admitted_at` IS NOT NULL AND NEW.`admitted_at` IS NOT OLD.`admitted_at`)
	OR (OLD.`began_at` IS NOT NULL AND NEW.`began_at` IS NOT OLD.`began_at`)
	OR (OLD.`began_at` IS NOT NULL AND NEW.`admission_state` = 'closed')
	OR (OLD.`closed_at` IS NOT NULL AND NEW.`closed_at` IS NOT OLD.`closed_at`)
	OR (OLD.`close_reason` IS NOT NULL AND NEW.`close_reason` IS NOT OLD.`close_reason`)
	OR (OLD.`quota_reservation_id` IS NULL AND NEW.`quota_reservation_id` IS NOT NULL AND NEW.`admission_state` <> 'admitted')
BEGIN
	SELECT RAISE(ABORT, 'invalid research site execution lifecycle update');
END;
