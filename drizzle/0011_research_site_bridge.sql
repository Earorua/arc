CREATE TABLE `research_site_acceptances` (
  `job_id` text PRIMARY KEY NOT NULL REFERENCES `research_site_executions`(`job_id`) ON DELETE RESTRICT,
  `request_hash` text NOT NULL,
  `workflow_id` text NOT NULL,
  `workflow_accepted_at` integer NOT NULL,
  `recorded_at` integer NOT NULL,
  CONSTRAINT `research_site_acceptances_identity_check` CHECK(
    typeof(`job_id`)='text' AND length(`job_id`)=36
    AND substr(`job_id`,9,1)='-' AND substr(`job_id`,14,1)='-'
    AND substr(`job_id`,19,1)='-' AND substr(`job_id`,24,1)='-'
    AND length(replace(`job_id`,'-',''))=32
    AND replace(`job_id`,'-','') NOT GLOB '*[^0-9a-f]*'
    AND typeof(`request_hash`)='text' AND length(`request_hash`)=64
    AND `request_hash` NOT GLOB '*[^0-9a-f]*'
    AND typeof(`workflow_id`)='text' AND `workflow_id`=`job_id`),
  CONSTRAINT `research_site_acceptances_time_check` CHECK(
    typeof(`workflow_accepted_at`)='integer' AND `workflow_accepted_at` BETWEEN 0 AND 9007199254740991
    AND typeof(`recorded_at`)='integer' AND `recorded_at` BETWEEN 0 AND 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE `research_site_recoveries` (
  `job_id` text PRIMARY KEY NOT NULL REFERENCES `research_site_executions`(`job_id`) ON DELETE RESTRICT,
  `request_hash` text NOT NULL,
  `execution_version` integer NOT NULL,
  `run_version` integer NOT NULL,
  `terminal_hash` text NOT NULL,
  `reason` text NOT NULL,
  `unsent_json` text,
  `terminal_at` integer NOT NULL,
  `quota_done` integer NOT NULL DEFAULT 0,
  `budget_done` integer NOT NULL DEFAULT 0,
  `version` integer NOT NULL DEFAULT 0,
  CONSTRAINT `research_site_recoveries_identity_check` CHECK(
    typeof(`job_id`)='text' AND length(`job_id`)=36
    AND substr(`job_id`,9,1)='-' AND substr(`job_id`,14,1)='-'
    AND substr(`job_id`,19,1)='-' AND substr(`job_id`,24,1)='-'
    AND length(replace(`job_id`,'-',''))=32
    AND replace(`job_id`,'-','') NOT GLOB '*[^0-9a-f]*'
    AND typeof(`request_hash`)='text' AND length(`request_hash`)=64
    AND `request_hash` NOT GLOB '*[^0-9a-f]*'
    AND typeof(`terminal_hash`)='text' AND length(`terminal_hash`)=64
    AND `terminal_hash` NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT `research_site_recoveries_version_check` CHECK(
    typeof(`execution_version`)='integer' AND `execution_version` BETWEEN 0 AND 9007199254740991
    AND typeof(`run_version`)='integer' AND `run_version` BETWEEN 0 AND 9007199254740991
    AND typeof(`version`)='integer' AND `version` BETWEEN 0 AND 9007199254740991),
  CONSTRAINT `research_site_recoveries_time_check` CHECK(
    typeof(`terminal_at`)='integer' AND `terminal_at` BETWEEN 0 AND 9007199254740991),
  CONSTRAINT `research_site_recoveries_state_check` CHECK(
    `reason` IN ('expired-unknown','executor-unsent')
    AND (`reason`='executor-unsent')=(`unsent_json` IS NOT NULL)
    AND (`unsent_json` IS NULL OR (typeof(`unsent_json`)='text'
      AND length(CAST(`unsent_json` AS BLOB)) BETWEEN 2 AND 4096
      AND json_valid(`unsent_json`) AND json_type(`unsent_json`)='object'))
    AND `quota_done` IN (0,1) AND `budget_done` IN (0,1))
);
--> statement-breakpoint
CREATE TABLE `research_site_scan_cursors` (
  `name` text PRIMARY KEY NOT NULL,
  `after_created_at` integer,
  `after_job_id` text,
  `version` integer NOT NULL DEFAULT 0,
  CONSTRAINT `research_site_scan_cursors_name_check` CHECK(`name` IN ('maintenance','outbox')),
  CONSTRAINT `research_site_scan_cursors_position_check` CHECK(
    (`after_created_at` IS NULL)=(`after_job_id` IS NULL)
    AND (`after_created_at` IS NULL OR (typeof(`after_created_at`)='integer'
      AND `after_created_at` BETWEEN 0 AND 9007199254740991
      AND typeof(`after_job_id`)='text' AND length(`after_job_id`)=36
      AND substr(`after_job_id`,9,1)='-' AND substr(`after_job_id`,14,1)='-'
      AND substr(`after_job_id`,19,1)='-' AND substr(`after_job_id`,24,1)='-'
      AND length(replace(`after_job_id`,'-',''))=32
      AND replace(`after_job_id`,'-','') NOT GLOB '*[^0-9a-f]*'))
    AND typeof(`version`)='integer' AND `version` BETWEEN 0 AND 9007199254740991)
);
--> statement-breakpoint
INSERT INTO `research_site_scan_cursors` (`name`) VALUES ('maintenance'),('outbox');
--> statement-breakpoint
CREATE INDEX `research_site_scan_idx` ON `research_site_executions`(`created_at`,`job_id`);
--> statement-breakpoint
CREATE TRIGGER `research_site_acceptances_immutable_update` BEFORE UPDATE ON `research_site_acceptances`
BEGIN SELECT RAISE(ABORT,'immutable research site acceptance'); END;
--> statement-breakpoint
CREATE TRIGGER `research_site_acceptances_immutable_delete` BEFORE DELETE ON `research_site_acceptances`
BEGIN SELECT RAISE(ABORT,'immutable research site acceptance'); END;
--> statement-breakpoint
CREATE TRIGGER `research_site_recoveries_initial_guard` BEFORE INSERT ON `research_site_recoveries`
WHEN NEW.`version`<>0 OR NEW.`quota_done`<>0 OR NEW.`budget_done`<>0
BEGIN SELECT RAISE(ABORT,'invalid initial research site recovery'); END;
--> statement-breakpoint
CREATE TRIGGER `research_site_recoveries_immutable_delete` BEFORE DELETE ON `research_site_recoveries`
BEGIN SELECT RAISE(ABORT,'immutable research site recovery'); END;
--> statement-breakpoint
CREATE TRIGGER `research_site_recoveries_transition_guard` BEFORE UPDATE ON `research_site_recoveries`
WHEN NEW.`job_id` IS NOT OLD.`job_id` OR NEW.`request_hash` IS NOT OLD.`request_hash`
  OR NEW.`execution_version` IS NOT OLD.`execution_version` OR NEW.`run_version` IS NOT OLD.`run_version`
  OR NEW.`terminal_hash` IS NOT OLD.`terminal_hash` OR NEW.`terminal_at` IS NOT OLD.`terminal_at`
  OR OLD.`version`>=9007199254740991 OR NEW.`version`<>OLD.`version`+1
  OR NOT (
    (NEW.`reason` IS OLD.`reason` AND NEW.`unsent_json` IS OLD.`unsent_json`
      AND ((OLD.`quota_done`=0 AND NEW.`quota_done`=1 AND NEW.`budget_done`=OLD.`budget_done`)
        OR (OLD.`budget_done`=0 AND NEW.`budget_done`=1 AND NEW.`quota_done`=OLD.`quota_done`)))
    OR (OLD.`reason`='expired-unknown' AND OLD.`unsent_json` IS NULL
      AND NEW.`reason`='executor-unsent' AND NEW.`unsent_json` IS NOT NULL
      AND NEW.`quota_done`=OLD.`quota_done` AND NEW.`budget_done`=0)
  )
BEGIN SELECT RAISE(ABORT,'invalid research site recovery transition'); END;
--> statement-breakpoint
CREATE TRIGGER `research_site_scan_cursors_insert_guard` BEFORE INSERT ON `research_site_scan_cursors`
BEGIN SELECT RAISE(ABORT,'fixed research site scan cursor'); END;
--> statement-breakpoint
CREATE TRIGGER `research_site_scan_cursors_delete_guard` BEFORE DELETE ON `research_site_scan_cursors`
BEGIN SELECT RAISE(ABORT,'fixed research site scan cursor'); END;
--> statement-breakpoint
CREATE TRIGGER `research_site_scan_cursors_update_guard` BEFORE UPDATE ON `research_site_scan_cursors`
WHEN NEW.`name` IS NOT OLD.`name` OR OLD.`version`>=9007199254740991 OR NEW.`version`<>OLD.`version`+1
BEGIN SELECT RAISE(ABORT,'invalid research site scan cursor transition'); END;
