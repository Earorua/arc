CREATE TABLE `document_bridge_nonces` (
	`nonce` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);

--> statement-breakpoint
CREATE TABLE `document_budget_counters` (
	`scope` text NOT NULL,
	`day` text NOT NULL,
	`reserved_micro_usd` integer DEFAULT 0 NOT NULL,
	`settled_micro_usd` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`scope`, `day`),
	CONSTRAINT "document_counters_money" CHECK(typeof("document_budget_counters"."reserved_micro_usd") = 'integer' AND "document_budget_counters"."reserved_micro_usd" BETWEEN 0 AND 9007199254740991 AND typeof("document_budget_counters"."settled_micro_usd") = 'integer' AND "document_budget_counters"."settled_micro_usd" BETWEEN 0 AND 9007199254740991)
);

--> statement-breakpoint
CREATE TABLE `document_budget_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`job_id` text NOT NULL,
	`day` text NOT NULL,
	`reserved_micro_usd` integer NOT NULL,
	`actual_micro_usd` integer,
	`state` text NOT NULL,
	`receipt_id` text,
	`price_version` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "document_budget_state" CHECK("document_budget_reservations"."state" IN ('reserved','settled','held-unknown','released')),
	CONSTRAINT "document_budget_money" CHECK(typeof("document_budget_reservations"."reserved_micro_usd") = 'integer' AND "document_budget_reservations"."reserved_micro_usd" BETWEEN 0 AND 9007199254740991 AND ("document_budget_reservations"."actual_micro_usd" IS NULL OR typeof("document_budget_reservations"."actual_micro_usd") = 'integer' AND "document_budget_reservations"."actual_micro_usd" BETWEEN 0 AND 9007199254740991))
);

--> statement-breakpoint
CREATE UNIQUE INDEX `document_budget_reservations_job_id_unique` ON `document_budget_reservations` (`job_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_budget_reservations_receipt_id_unique` ON `document_budget_reservations` (`receipt_id`);
--> statement-breakpoint
CREATE INDEX `document_budget_owner_day` ON `document_budget_reservations` (`owner_id`,`day`);
--> statement-breakpoint
CREATE TABLE `document_confirmations` (
	`owner_id` text NOT NULL,
	`document_id` text NOT NULL,
	`document_version_id` text NOT NULL,
	`id` text NOT NULL,
	`text_version_id` text NOT NULL,
	`review_revision` integer NOT NULL,
	`revision` integer NOT NULL,
	`origin` text NOT NULL,
	`state` text NOT NULL,
	`items_json` text NOT NULL,
	`review_points_json` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `document_id`, `document_version_id`, `id`),
	FOREIGN KEY (`owner_id`,`document_id`,`document_version_id`) REFERENCES `document_versions`(`owner_id`,`document_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "document_confirmation_state" CHECK("document_confirmations"."state" IN ('active','revoked')),
	CONSTRAINT "document_confirmation_revision" CHECK(typeof("document_confirmations"."revision") = 'integer' AND "document_confirmations"."revision" BETWEEN 0 AND 9007199254740991 AND typeof("document_confirmations"."review_revision") = 'integer' AND "document_confirmations"."review_revision" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "document_confirmation_items" CHECK(json_valid("document_confirmations"."items_json") AND length(CAST("document_confirmations"."items_json" AS BLOB)) <= 131072),
	CONSTRAINT "document_confirmation_points" CHECK(json_valid("document_confirmations"."review_points_json") AND length(CAST("document_confirmations"."review_points_json" AS BLOB)) <= 131072)
);

--> statement-breakpoint
CREATE TABLE `document_deletion_jobs` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`document_id` text NOT NULL,
	`generation` integer NOT NULL,
	`state` text NOT NULL,
	`error_code` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `id`),
	FOREIGN KEY (`owner_id`,`document_id`) REFERENCES `documents`(`owner_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "document_deletion_state" CHECK("document_deletion_jobs"."state" IN ('revoked','cleaning','failed','completed'))
);

--> statement-breakpoint
CREATE INDEX `document_deletion_cleanup_scan` ON `document_deletion_jobs` (`state`,`next_attempt_at`);
--> statement-breakpoint
CREATE TABLE `document_extractions` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`job_id` text NOT NULL,
	`document_id` text NOT NULL,
	`text_version_id` text NOT NULL,
	`schema_version` text DEFAULT '2026.11.1' NOT NULL,
	`model_version` text,
	`policy_version` text DEFAULT '2026.11.1' NOT NULL,
	`candidates_json` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `id`),
	FOREIGN KEY (`owner_id`,`text_version_id`) REFERENCES `document_text_versions`(`owner_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "document_extractions_json" CHECK(json_valid("document_extractions"."candidates_json") AND length(CAST("document_extractions"."candidates_json" AS BLOB)) <= 131072),
	CONSTRAINT "document_extractions_state" CHECK("document_extractions"."state" IN ('active','revoked'))
);

--> statement-breakpoint
CREATE UNIQUE INDEX `document_extractions_job` ON `document_extractions` (`owner_id`,`job_id`);
--> statement-breakpoint
CREATE TABLE `document_jobs` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`text_version_id` text NOT NULL,
	`document_id` text NOT NULL,
	`document_version_id` text NOT NULL,
	`consent_id` text NOT NULL,
	`generation` integer NOT NULL,
	`document_revision` integer NOT NULL,
	`model_version` text DEFAULT '' NOT NULL,
	`configuration_digest` text DEFAULT '' NOT NULL,
	`executor_cancel_state` text DEFAULT 'none' NOT NULL,
	`executor_cancel_attempt_at` integer DEFAULT 0 NOT NULL,
	`revision` integer NOT NULL,
	`state` text NOT NULL,
	`dispatch_state` text NOT NULL,
	`execution_slot` integer,
	`queued_at` integer NOT NULL,
	`queue_expires_at` integer NOT NULL,
	`provider_policy_id` text NOT NULL,
	`price_version` text NOT NULL,
	`policy_version` text NOT NULL,
	`reservation_id` text NOT NULL,
	`extraction_id` text,
	`error_code` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `id`),
	FOREIGN KEY (`owner_id`,`consent_id`) REFERENCES `document_processing_consents`(`owner_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`,`document_id`,`document_version_id`) REFERENCES `document_versions`(`owner_id`,`document_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "document_job_state" CHECK("document_jobs"."state" IN ('queued','running','succeeded','failed','cancel-requested','cancelled','revoked','cost-unknown')),
	CONSTRAINT "document_job_dispatch" CHECK("document_jobs"."dispatch_state" IN ('not-sent','may-have-sent','settled')),
	CONSTRAINT "document_job_cancel_state" CHECK("document_jobs"."executor_cancel_state" IN ('none','pending','acknowledged')),
	CONSTRAINT "document_job_slot" CHECK("document_jobs"."execution_slot" IS NULL OR "document_jobs"."execution_slot"=1)
);

--> statement-breakpoint
CREATE UNIQUE INDEX `document_jobs_id` ON `document_jobs` (`id`);
--> statement-breakpoint
CREATE INDEX `document_jobs_owner_queue` ON `document_jobs` (`owner_id`,`state`,`queued_at`,`id`);
--> statement-breakpoint
CREATE INDEX `document_jobs_expiry_queue` ON `document_jobs` (`state`,`dispatch_state`,`queue_expires_at`,`id`);
--> statement-breakpoint
CREATE INDEX `document_jobs_cancel_notifications` ON `document_jobs` (`executor_cancel_state`,`executor_cancel_attempt_at`,`id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_jobs_owner_slot` ON `document_jobs` (`owner_id`) WHERE "document_jobs"."execution_slot"=1;
--> statement-breakpoint
CREATE TABLE `document_mutations` (
	`owner_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`mutation_id` text NOT NULL,
	`body_digest` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `endpoint`, `mutation_id`),
	CONSTRAINT "document_mutation_result" CHECK(json_valid("document_mutations"."result_json") AND length(CAST("document_mutations"."result_json" AS BLOB)) <= 4096)
);

--> statement-breakpoint
CREATE TABLE `document_processing_consents` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`text_version_id` text NOT NULL,
	`document_id` text NOT NULL,
	`document_version_id` text NOT NULL,
	`purpose` text NOT NULL,
	`policy_version` text NOT NULL,
	`provider_policy_id` text NOT NULL,
	`generation` integer NOT NULL,
	`granted_at` integer NOT NULL,
	`revoked_at` integer,
	PRIMARY KEY(`owner_id`, `id`),
	FOREIGN KEY (`owner_id`,`text_version_id`) REFERENCES `document_text_versions`(`owner_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`,`document_id`,`document_version_id`) REFERENCES `document_versions`(`owner_id`,`document_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "document_consent_purpose" CHECK("document_processing_consents"."purpose"='analysis')
);

--> statement-breakpoint
CREATE TABLE `document_review_drafts` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`document_id` text NOT NULL,
	`document_version_id` text NOT NULL,
	`text_version_id` text NOT NULL,
	`extraction_id` text,
	`origin` text NOT NULL,
	`items_json` text NOT NULL,
	`self_assessment_hints_json` text NOT NULL,
	`review_points_json` text DEFAULT '[]' NOT NULL,
	`revision` integer NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `text_version_id`),
	FOREIGN KEY (`owner_id`,`document_id`,`document_version_id`) REFERENCES `document_versions`(`owner_id`,`document_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`,`extraction_id`) REFERENCES `document_extractions`(`owner_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "document_review_origin" CHECK("document_review_drafts"."origin" IN ('ai','manual','mixed')),
	CONSTRAINT "document_review_state" CHECK("document_review_drafts"."state" IN ('active','revoked')),
	CONSTRAINT "document_review_revision" CHECK(typeof("document_review_drafts"."revision") = 'integer' AND "document_review_drafts"."revision" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "document_review_items" CHECK(json_valid("document_review_drafts"."items_json") AND length(CAST("document_review_drafts"."items_json" AS BLOB)) <= 131072),
	CONSTRAINT "document_review_hints" CHECK(json_valid("document_review_drafts"."self_assessment_hints_json") AND length(CAST("document_review_drafts"."self_assessment_hints_json" AS BLOB)) <= 131072),
	CONSTRAINT "document_review_points" CHECK(json_valid("document_review_drafts"."review_points_json") AND length(CAST("document_review_drafts"."review_points_json" AS BLOB)) <= 131072)
);

--> statement-breakpoint
CREATE TABLE `document_storage_operations` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`document_id` text NOT NULL,
	`document_version_id` text NOT NULL,
	`object_key` text NOT NULL,
	`generation` integer NOT NULL,
	`expected_revision` integer NOT NULL,
	`state` text NOT NULL,
	`writer_terminated` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`mutation_endpoint` text NOT NULL,
	`mutation_id` text NOT NULL,
	`body_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `id`),
	FOREIGN KEY (`owner_id`,`document_id`,`document_version_id`) REFERENCES `document_versions`(`owner_id`,`document_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "document_storage_state" CHECK("document_storage_operations"."state" IN ('writing','active','cleanup-pending','deleted'))
);

--> statement-breakpoint
CREATE UNIQUE INDEX `document_storage_owner_mutation` ON `document_storage_operations` (`owner_id`,`mutation_endpoint`,`mutation_id`);
--> statement-breakpoint
CREATE INDEX `document_storage_cleanup_scan` ON `document_storage_operations` (`state`,`next_attempt_at`);
--> statement-breakpoint
CREATE TABLE `document_text_versions` (
	`owner_id` text NOT NULL,
	`document_id` text NOT NULL,
	`document_version_id` text NOT NULL,
	`id` text NOT NULL,
	`parser_version` text NOT NULL,
	`text_hash` text NOT NULL,
	`object_key` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `id`),
	FOREIGN KEY (`owner_id`,`document_id`,`document_version_id`) REFERENCES `document_versions`(`owner_id`,`document_id`,`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE TABLE `document_usage_links` (
	`owner_id` text NOT NULL,
	`context_version_id` text NOT NULL,
	`goal_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`plan_version_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `context_version_id`, `plan_version_id`, `kind`),
	FOREIGN KEY (`owner_id`,`goal_id`,`workspace_id`) REFERENCES `planning_workspaces`(`user_id`,`goal_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`,`goal_id`,`plan_version_id`) REFERENCES `plan_versions`(`user_id`,`goal_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`,`context_version_id`) REFERENCES `material_context_versions`(`owner_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "document_usage_kind" CHECK("document_usage_links"."kind" IN ('generation','proposal','accepted'))
);

--> statement-breakpoint
CREATE TABLE `document_versions` (
	`owner_id` text NOT NULL,
	`document_id` text NOT NULL,
	`id` text NOT NULL,
	`text_version_id` text NOT NULL,
	`state` text NOT NULL,
	`generation` integer NOT NULL,
	`revision` integer NOT NULL,
	`text_digest` text NOT NULL,
	`object_key` text NOT NULL,
	`utf8_bytes` integer NOT NULL,
	`code_points` integer NOT NULL,
	`segments_json` text NOT NULL,
	`parser_version` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `document_id`, `id`),
	FOREIGN KEY (`owner_id`,`document_id`) REFERENCES `documents`(`owner_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "document_versions_state" CHECK("document_versions"."state" IN ('pending','ready','revoked','cleanup-pending')),
	CONSTRAINT "document_versions_size" CHECK("document_versions"."utf8_bytes" BETWEEN 1 AND 262144 AND "document_versions"."code_points" BETWEEN 1 AND 50000),
	CONSTRAINT "document_versions_segments" CHECK(json_valid("document_versions"."segments_json") AND length(CAST("document_versions"."segments_json" AS BLOB)) <= 16384)
);

--> statement-breakpoint
CREATE UNIQUE INDEX `document_versions_text_id` ON `document_versions` (`owner_id`,`text_version_id`);
--> statement-breakpoint
CREATE TABLE `documents` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`kind` text NOT NULL,
	`display_name` text NOT NULL,
	`lifecycle` text DEFAULT 'active' NOT NULL,
	`generation` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`current_document_version_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `id`),
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "documents_kind" CHECK("documents"."kind" IN ('resume','jd','supplement')),
	CONSTRAINT "documents_lifecycle" CHECK("documents"."lifecycle" IN ('active','revoked','cleanup-pending','deleted')),
	CONSTRAINT "documents_revision" CHECK(typeof("documents"."revision") = 'integer' AND "documents"."revision" BETWEEN 0 AND 9007199254740991 AND typeof("documents"."generation") = 'integer' AND "documents"."generation" BETWEEN 0 AND 9007199254740991)
);

--> statement-breakpoint
CREATE TABLE `goal_document_links` (
	`owner_id` text NOT NULL,
	`goal_id` text NOT NULL,
	`document_id` text NOT NULL,
	`document_version_id` text NOT NULL,
	`confirmation_id` text NOT NULL,
	`context_version_id` text NOT NULL,
	`slot` text NOT NULL,
	`purpose` text DEFAULT 'planning' NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `goal_id`, `context_version_id`, `document_id`),
	FOREIGN KEY (`owner_id`,`goal_id`) REFERENCES `career_goals`(`user_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`,`document_id`,`document_version_id`,`confirmation_id`) REFERENCES `document_confirmations`(`owner_id`,`document_id`,`document_version_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`,`context_version_id`) REFERENCES `material_context_versions`(`owner_id`,`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE UNIQUE INDEX `goal_document_main_slot` ON `goal_document_links` (`owner_id`,`goal_id`,`slot`) WHERE "goal_document_links"."slot" IN ('resume','jd') AND "goal_document_links"."enabled"=1;
--> statement-breakpoint
CREATE TABLE `material_context_dependencies` (
	`owner_id` text NOT NULL,
	`context_version_id` text NOT NULL,
	`document_id` text NOT NULL,
	`document_version_id` text NOT NULL,
	`text_version_id` text NOT NULL,
	`confirmation_id` text NOT NULL,
	`generation` integer NOT NULL,
	`confirmation_digest` text NOT NULL,
	`slot` text NOT NULL,
	PRIMARY KEY(`owner_id`, `context_version_id`, `document_id`),
	FOREIGN KEY (`owner_id`,`context_version_id`) REFERENCES `material_context_versions`(`owner_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`,`document_id`,`document_version_id`,`confirmation_id`) REFERENCES `document_confirmations`(`owner_id`,`document_id`,`document_version_id`,`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE TABLE `material_context_versions` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`preview_json` text NOT NULL,
	`fingerprint` text NOT NULL,
	`preview_token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`state` text NOT NULL,
	`selection_id` text NOT NULL,
	`selection_revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `id`),
	FOREIGN KEY (`owner_id`,`selection_id`) REFERENCES `material_selections`(`owner_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "material_context_state" CHECK("material_context_versions"."state" IN ('active','revoked')),
	CONSTRAINT "material_context_snapshot" CHECK(json_valid("material_context_versions"."snapshot_json") AND length(CAST("material_context_versions"."snapshot_json" AS BLOB)) <= 262144),
	CONSTRAINT "material_context_preview" CHECK(json_valid("material_context_versions"."preview_json") AND length(CAST("material_context_versions"."preview_json" AS BLOB)) <= 262144)
);

--> statement-breakpoint
CREATE TABLE `material_plan_proposals` (
	`owner_id` text NOT NULL,
	`goal_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`candidate_plan_version_id` text NOT NULL,
	`active_base_plan_id` text NOT NULL,
	`input_revision` integer NOT NULL,
	`proposal_revision` integer NOT NULL,
	`context_version_id` text NOT NULL,
	`context_fingerprint` text NOT NULL,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `goal_id`, `candidate_plan_version_id`),
	FOREIGN KEY (`owner_id`,`goal_id`,`workspace_id`) REFERENCES `planning_workspaces`(`user_id`,`goal_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`,`goal_id`,`candidate_plan_version_id`) REFERENCES `plan_versions`(`user_id`,`goal_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`,`goal_id`,`active_base_plan_id`) REFERENCES `plan_versions`(`user_id`,`goal_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`,`context_version_id`) REFERENCES `material_context_versions`(`owner_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "material_proposal_state" CHECK("material_plan_proposals"."state" IN ('pending','accepted','discarded','revoked'))
);

--> statement-breakpoint
CREATE TABLE `material_selection_entries` (
	`owner_id` text NOT NULL,
	`selection_id` text NOT NULL,
	`slot` text NOT NULL,
	`document_id` text NOT NULL,
	`document_version_id` text NOT NULL,
	`confirmation_id` text NOT NULL,
	PRIMARY KEY(`owner_id`, `selection_id`, `document_id`),
	FOREIGN KEY (`owner_id`,`selection_id`) REFERENCES `material_selections`(`owner_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`,`document_id`,`document_version_id`,`confirmation_id`) REFERENCES `document_confirmations`(`owner_id`,`document_id`,`document_version_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "material_selection_slot" CHECK("material_selection_entries"."slot" IN ('resume','jd','supplement'))
);

--> statement-breakpoint
CREATE UNIQUE INDEX `material_selection_main_slot` ON `material_selection_entries` (`owner_id`,`selection_id`,`slot`) WHERE "material_selection_entries"."slot" IN ('resume','jd');
--> statement-breakpoint
CREATE TABLE `material_selections` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`scope_json` text NOT NULL,
	`revision` integer NOT NULL,
	`state` text NOT NULL,
	`bound_goal_id` text,
	`generation_mutation_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `id`),
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "material_selections_state" CHECK("material_selections"."state" IN ('active','bound','revoked') AND ("material_selections"."state"<>'bound' OR "material_selections"."bound_goal_id" IS NOT NULL)),
	CONSTRAINT "material_selections_revision" CHECK(typeof("material_selections"."revision") = 'integer' AND "material_selections"."revision" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "material_selections_scope" CHECK(json_valid("material_selections"."scope_json") AND length(CAST("material_selections"."scope_json" AS BLOB)) <= 4096)
);

