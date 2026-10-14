CREATE TABLE `research_site_imports` (
  `run_id` text PRIMARY KEY NOT NULL REFERENCES `research_site_executions`(`run_id`) ON DELETE RESTRICT,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE RESTRICT,
  `request_id` text NOT NULL,
  `job_id` text NOT NULL UNIQUE,
  `request_hash` text NOT NULL,
  `config_fingerprint` text NOT NULL,
  `validation_context_json` text NOT NULL,
  `execution_version` integer NOT NULL,
  `mode` text NOT NULL,
  `receipt_hash` text NOT NULL,
  `receipt_metadata_json` text NOT NULL,
  `audit_json` text NOT NULL,
  `settlement_json` text NOT NULL,
  `decision_hash` text NOT NULL,
  `decision_json` text,
  `phase` integer NOT NULL DEFAULT 0,
  `version` integer NOT NULL DEFAULT 0,
  `resolution_json` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  CONSTRAINT `research_site_imports_owner_check` CHECK(typeof(`user_id`)='text' AND length(`user_id`) BETWEEN 1 AND 160 AND `user_id`=trim(`user_id`)),
  CONSTRAINT `research_site_imports_run_check` CHECK(typeof(`run_id`)='text' AND length(`run_id`) BETWEEN 1 AND 256 AND `run_id`=trim(`run_id`)),
  CONSTRAINT `research_site_imports_request_check` CHECK(typeof(`request_id`)='text' AND length(`request_id`) BETWEEN 1 AND 160 AND `request_id`=trim(`request_id`)),
  CONSTRAINT `research_site_imports_job_check` CHECK(typeof(`job_id`)='text' AND length(`job_id`)=36),
  CONSTRAINT `research_site_imports_hashes_check` CHECK(
    typeof(`request_hash`)='text' AND length(`request_hash`)=64 AND `request_hash` NOT GLOB '*[^0-9a-f]*'
    AND typeof(`receipt_hash`)='text' AND length(`receipt_hash`)=64 AND `receipt_hash` NOT GLOB '*[^0-9a-f]*'
    AND typeof(`decision_hash`)='text' AND length(`decision_hash`)=64 AND `decision_hash` NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT `research_site_imports_config_check` CHECK(typeof(`config_fingerprint`)='text' AND length(`config_fingerprint`) BETWEEN 1 AND 160),
  CONSTRAINT `research_site_imports_context_check` CHECK(typeof(`validation_context_json`)='text' AND length(CAST(`validation_context_json` AS BLOB)) BETWEEN 2 AND 4096 AND json_valid(`validation_context_json`) AND json_type(`validation_context_json`)='object'),
  CONSTRAINT `research_site_imports_metadata_check` CHECK(typeof(`receipt_metadata_json`)='text' AND length(CAST(`receipt_metadata_json` AS BLOB)) BETWEEN 2 AND 4096 AND json_valid(`receipt_metadata_json`) AND json_type(`receipt_metadata_json`)='object'),
  CONSTRAINT `research_site_imports_audit_check` CHECK(typeof(`audit_json`)='text' AND length(CAST(`audit_json` AS BLOB)) BETWEEN 2 AND 4096 AND json_valid(`audit_json`) AND json_type(`audit_json`)='object'),
  CONSTRAINT `research_site_imports_settlement_check` CHECK(typeof(`settlement_json`)='text' AND length(CAST(`settlement_json` AS BLOB)) BETWEEN 2 AND 256 AND json_valid(`settlement_json`) AND json_type(`settlement_json`)='object'),
  CONSTRAINT `research_site_imports_decision_check` CHECK(`decision_json` IS NULL OR (typeof(`decision_json`)='text' AND length(CAST(`decision_json` AS BLOB)) BETWEEN 2 AND 1950000 AND json_valid(`decision_json`) AND json_type(`decision_json`)='object')),
  CONSTRAINT `research_site_imports_resolution_check` CHECK(`resolution_json` IS NULL OR (typeof(`resolution_json`)='text' AND length(CAST(`resolution_json` AS BLOB)) BETWEEN 2 AND 4096 AND json_valid(`resolution_json`) AND json_type(`resolution_json`)='object')),
  CONSTRAINT `research_site_imports_mode_check` CHECK(`mode` IN ('body','metadata-only')),
  CONSTRAINT `research_site_imports_phase_check` CHECK(typeof(`phase`)='integer' AND `phase` BETWEEN 0 AND 5),
  CONSTRAINT `research_site_imports_version_check` CHECK(typeof(`version`)='integer' AND `version` BETWEEN 0 AND 9007199254740991),
  CONSTRAINT `research_site_imports_execution_version_check` CHECK(typeof(`execution_version`)='integer' AND `execution_version` BETWEEN 0 AND 9007199254740991),
  CONSTRAINT `research_site_imports_time_check` CHECK(typeof(`created_at`)='integer' AND `created_at` BETWEEN 0 AND 9007199254740991 AND typeof(`updated_at`)='integer' AND `updated_at` BETWEEN `created_at` AND 9007199254740991),
  CONSTRAINT `research_site_imports_lifecycle_check` CHECK(
    (`phase`<2 AND `resolution_json` IS NULL OR `phase`>=2 AND `resolution_json` IS NOT NULL)
    AND (`phase`=5 AND `decision_json` IS NULL OR `phase`<5 AND `decision_json` IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_site_imports_owner_request_idx` ON `research_site_imports`(`user_id`,`request_id`);
--> statement-breakpoint
CREATE TRIGGER `research_site_imports_initial_guard` BEFORE INSERT ON `research_site_imports`
WHEN NEW.`phase`<>0 OR NEW.`version`<>0 OR NEW.`decision_json` IS NULL OR NEW.`resolution_json` IS NOT NULL
BEGIN SELECT RAISE(ABORT,'invalid initial research site import'); END;
--> statement-breakpoint
CREATE TRIGGER `research_site_imports_immutable_guard` BEFORE UPDATE ON `research_site_imports`
WHEN NEW.`run_id` IS NOT OLD.`run_id` OR NEW.`user_id` IS NOT OLD.`user_id`
  OR NEW.`request_id` IS NOT OLD.`request_id` OR NEW.`job_id` IS NOT OLD.`job_id`
  OR NEW.`request_hash` IS NOT OLD.`request_hash` OR NEW.`config_fingerprint` IS NOT OLD.`config_fingerprint`
  OR NEW.`validation_context_json` IS NOT OLD.`validation_context_json`
  OR NEW.`execution_version` IS NOT OLD.`execution_version` OR NEW.`mode` IS NOT OLD.`mode`
  OR NEW.`receipt_hash` IS NOT OLD.`receipt_hash` OR NEW.`receipt_metadata_json` IS NOT OLD.`receipt_metadata_json`
  OR NEW.`audit_json` IS NOT OLD.`audit_json` OR NEW.`settlement_json` IS NOT OLD.`settlement_json`
  OR NEW.`decision_hash` IS NOT OLD.`decision_hash` OR NEW.`created_at` IS NOT OLD.`created_at`
BEGIN SELECT RAISE(ABORT,'immutable research site import'); END;
--> statement-breakpoint
CREATE TRIGGER `research_site_imports_lifecycle_guard` BEFORE UPDATE ON `research_site_imports`
WHEN OLD.`version`>=9007199254740991 OR NEW.`version`<>OLD.`version`+1
  OR NEW.`phase`<>OLD.`phase`+1 OR NEW.`updated_at`<OLD.`updated_at`
  OR (OLD.`phase`<1 AND NEW.`resolution_json` IS NOT NULL)
  OR (OLD.`phase`=1 AND NEW.`resolution_json` IS NULL)
  OR (OLD.`phase`>=2 AND NEW.`resolution_json` IS NOT OLD.`resolution_json`)
  OR (OLD.`phase`<4 AND NEW.`decision_json` IS NOT OLD.`decision_json`)
  OR (OLD.`phase`=4 AND NEW.`decision_json` IS NOT NULL)
  OR (OLD.`phase`=5)
BEGIN SELECT RAISE(ABORT,'invalid research site import transition'); END;
