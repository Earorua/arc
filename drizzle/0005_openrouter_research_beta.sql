CREATE TABLE `ai_budget_buckets` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`period_kind` text NOT NULL,
	`period_start` integer NOT NULL,
	`reserved_micros` integer DEFAULT 0 NOT NULL,
	`settled_micros` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "ai_budget_buckets_kind_check" CHECK("ai_budget_buckets"."period_kind" IN ('day', 'month')),
	CONSTRAINT "ai_budget_buckets_period_check" CHECK(typeof("ai_budget_buckets"."period_start") = 'integer' AND "ai_budget_buckets"."period_start" BETWEEN 0 AND 9007199254740991 AND "ai_budget_buckets"."period_start" % 86400000 = 0
    AND ("ai_budget_buckets"."period_kind" = 'day' OR (strftime('%d', "ai_budget_buckets"."period_start" / 1000, 'unixepoch') IS NOT NULL
      AND strftime('%d', "ai_budget_buckets"."period_start" / 1000, 'unixepoch') = '01'))),
	CONSTRAINT "ai_budget_buckets_reserved_check" CHECK(typeof("ai_budget_buckets"."reserved_micros") = 'integer' AND "ai_budget_buckets"."reserved_micros" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "ai_budget_buckets_settled_check" CHECK(typeof("ai_budget_buckets"."settled_micros") = 'integer' AND "ai_budget_buckets"."settled_micros" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "ai_budget_buckets_version_check" CHECK(typeof("ai_budget_buckets"."version") = 'integer' AND "ai_budget_buckets"."version" BETWEEN 0 AND 9007199254740991)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_budget_bucket_period_idx` ON `ai_budget_buckets` (`scope`,`period_kind`,`period_start`);--> statement-breakpoint
CREATE TABLE `ai_budget_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`run_id` text NOT NULL,
	`day_bucket_id` text NOT NULL,
	`month_bucket_id` text NOT NULL,
	`maximum_reserved_micros` integer NOT NULL,
	`settled_micros` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `research_runs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`day_bucket_id`) REFERENCES `ai_budget_buckets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`month_bucket_id`) REFERENCES `ai_budget_buckets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ai_budget_reservations_maximum_check" CHECK(typeof("ai_budget_reservations"."maximum_reserved_micros") = 'integer' AND "ai_budget_reservations"."maximum_reserved_micros" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "ai_budget_reservations_settled_check" CHECK(typeof("ai_budget_reservations"."settled_micros") = 'integer' AND "ai_budget_reservations"."settled_micros" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "ai_budget_reservations_status_check" CHECK("ai_budget_reservations"."status" IN ('reserved', 'settled', 'conservative-hold', 'released')),
	CONSTRAINT "ai_budget_reservations_expiry_check" CHECK(typeof("ai_budget_reservations"."expires_at") = 'integer' AND "ai_budget_reservations"."expires_at" BETWEEN 0 AND 9007199254740991)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_budget_reservations_request_idx` ON `ai_budget_reservations` (`request_id`);--> statement-breakpoint
CREATE INDEX `ai_budget_reservations_expiry_idx` ON `ai_budget_reservations` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `research_packages` (
	`id` text PRIMARY KEY NOT NULL,
	`normalized_role_key` text NOT NULL,
	`locale` text NOT NULL,
	`config_fingerprint` text NOT NULL,
	`content_fingerprint` text NOT NULL,
	`package_json` text NOT NULL,
	`quality_json` text NOT NULL,
	`blueprint_id` text NOT NULL,
	`blueprint_version` text NOT NULL,
	`blueprint_version_id` text NOT NULL,
	`registry_id` text NOT NULL,
	`registry_version` text NOT NULL,
	`observed_at` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`blueprint_version_id`) REFERENCES `role_blueprint_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "research_packages_locale_check" CHECK("research_packages"."locale" IN ('zh-CN', 'en-US')),
	CONSTRAINT "research_packages_payload_check" CHECK("research_packages"."package_json" IS NULL OR (json_valid("research_packages"."package_json") AND length(CAST("research_packages"."package_json" AS BLOB)) <= 1900000)),
	CONSTRAINT "research_packages_quality_check" CHECK("research_packages"."quality_json" IS NULL OR (json_valid("research_packages"."quality_json") AND length(CAST("research_packages"."quality_json" AS BLOB)) <= 16384)),
	CONSTRAINT "research_packages_blueprint_version_check" CHECK(length(trim("research_packages"."blueprint_version")) BETWEEN 1 AND 32),
	CONSTRAINT "research_packages_registry_version_check" CHECK(length(trim("research_packages"."registry_version")) BETWEEN 1 AND 64),
	CONSTRAINT "research_packages_observed_date_check" CHECK(length("research_packages"."observed_at") = 10 AND "research_packages"."observed_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND date("research_packages"."observed_at", '+0 days') IS NOT NULL AND date("research_packages"."observed_at", '+0 days') = "research_packages"."observed_at"),
	CONSTRAINT "research_packages_expiry_check" CHECK(typeof("research_packages"."expires_at") = 'integer' AND "research_packages"."expires_at" BETWEEN 0 AND 9007199254740991 AND "research_packages"."expires_at" % 86400000 = 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_packages_fingerprint_idx` ON `research_packages` (`content_fingerprint`,`config_fingerprint`);--> statement-breakpoint
CREATE INDEX `research_packages_cache_idx` ON `research_packages` (`normalized_role_key`,`locale`,`config_fingerprint`,`expires_at`);--> statement-breakpoint
CREATE TABLE `research_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`mutation_id` text NOT NULL,
	`raw_role` text NOT NULL,
	`normalized_role_key` text NOT NULL,
	`locale` text NOT NULL,
	`input_fingerprint` text NOT NULL,
	`config_fingerprint` text NOT NULL,
	`state` text NOT NULL,
	`state_version` integer DEFAULT 0 NOT NULL,
	`retryable` integer DEFAULT false NOT NULL,
	`active_slot` integer,
	`active_expires_at` integer,
	`package_id` text,
	`error_code` text,
	`public_failure_category` text,
	`quality_json` text,
	`candidate_json` text,
	`retry_of_run_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`package_id`) REFERENCES `research_packages`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`,`retry_of_run_id`) REFERENCES `research_runs`(`user_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "research_runs_state_check" CHECK("research_runs"."state" IN ('queued', 'researching', 'validating', 'ready', 'needs-review', 'failed')),
	CONSTRAINT "research_runs_state_version_check" CHECK(typeof("research_runs"."state_version") = 'integer' AND "research_runs"."state_version" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "research_runs_retryable_check" CHECK("research_runs"."retryable" IN (0, 1)),
	CONSTRAINT "research_runs_locale_check" CHECK("research_runs"."locale" IN ('zh-CN', 'en-US')),
	CONSTRAINT "research_runs_active_slot_check" CHECK(("research_runs"."state" IN ('queued', 'researching', 'validating') AND "research_runs"."active_slot" IS NOT NULL AND "research_runs"."active_slot" = 1)
    OR ("research_runs"."state" IN ('ready', 'needs-review', 'failed') AND "research_runs"."active_slot" IS NULL)),
	CONSTRAINT "research_runs_active_expiry_check" CHECK(("research_runs"."state" NOT IN ('queued', 'researching', 'validating') OR "research_runs"."active_expires_at" IS NOT NULL)
    AND ("research_runs"."active_expires_at" IS NULL OR (typeof("research_runs"."active_expires_at") = 'integer' AND "research_runs"."active_expires_at" BETWEEN 0 AND 9007199254740991))),
	CONSTRAINT "research_runs_ready_package_check" CHECK("research_runs"."state" <> 'ready' OR "research_runs"."package_id" IS NOT NULL),
	CONSTRAINT "research_runs_error_code_check" CHECK("research_runs"."error_code" IS NULL OR (typeof("research_runs"."error_code") = 'text' AND length("research_runs"."error_code") BETWEEN 1 AND 64
    AND length(CAST("research_runs"."error_code" AS BLOB)) = length("research_runs"."error_code")
    AND "research_runs"."error_code" NOT GLOB '*[^a-z-]*' AND substr("research_runs"."error_code", 1, 1) <> '-'
    AND substr("research_runs"."error_code", -1) <> '-' AND instr("research_runs"."error_code", '--') = 0)),
	CONSTRAINT "research_runs_public_failure_check" CHECK("research_runs"."public_failure_category" IS NULL OR "research_runs"."public_failure_category"
    IN ('timeout', 'rate-limited', 'allowance-reached', 'service-unavailable', 'content-rejected', 'invalid-result', 'internal')),
	CONSTRAINT "research_runs_quality_check" CHECK("research_runs"."quality_json" IS NULL OR (json_valid("research_runs"."quality_json") AND length(CAST("research_runs"."quality_json" AS BLOB)) <= 16384)),
	CONSTRAINT "research_runs_candidate_check" CHECK("research_runs"."candidate_json" IS NULL OR (json_valid("research_runs"."candidate_json") AND length(CAST("research_runs"."candidate_json" AS BLOB)) <= 1048576))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_runs_owner_mutation_idx` ON `research_runs` (`user_id`,`mutation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `research_runs_owner_id_idx` ON `research_runs` (`user_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `research_runs_active_idx` ON `research_runs` (`user_id`,`normalized_role_key`,`locale`,`config_fingerprint`,`active_slot`);--> statement-breakpoint
CREATE INDEX `research_runs_active_expiry_idx` ON `research_runs` (`state`,`active_expires_at`);--> statement-breakpoint
CREATE TABLE `research_source_audits` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`canonical_url` text NOT NULL,
	`title` text NOT NULL,
	`hostname` text NOT NULL,
	`source_tier` text NOT NULL,
	`observed_at` text NOT NULL,
	`citation_hash` text NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `research_packages`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "research_source_audits_tier_check" CHECK("research_source_audits"."source_tier" IN ('primary', 'institutional', 'practitioner', 'community')),
	CONSTRAINT "research_source_audits_observed_date_check" CHECK(length("research_source_audits"."observed_at") = 10 AND "research_source_audits"."observed_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND date("research_source_audits"."observed_at", '+0 days') IS NOT NULL AND date("research_source_audits"."observed_at", '+0 days') = "research_source_audits"."observed_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_source_audits_package_url_idx` ON `research_source_audits` (`package_id`,`canonical_url`);
