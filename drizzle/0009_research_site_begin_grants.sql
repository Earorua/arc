ALTER TABLE `research_site_executions` ADD COLUMN `execution_expires_at` INTEGER
	CONSTRAINT "research_site_executions_execution_expiry_check" CHECK(
		`execution_expires_at` IS NULL OR (
			typeof(`execution_expires_at`) = 'integer'
			AND `began_at` IS NOT NULL
			AND `began_at` <= 9007199253480991
			AND `execution_expires_at` = `began_at` + 1260000
			AND `execution_expires_at` <= `reservation_expires_at`
		)
	);
--> statement-breakpoint
UPDATE `research_site_executions`
SET `execution_expires_at` = `began_at` + 1260000, `version` = `version` + 1
WHERE `began_at` IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER `research_site_executions_begin_deadline_insert_guard`
BEFORE INSERT ON `research_site_executions`
WHEN NEW.`execution_expires_at` IS NOT NULL
BEGIN
	SELECT RAISE(ABORT, 'invalid initial research site execution deadline');
END;
--> statement-breakpoint
CREATE TRIGGER `research_site_executions_begin_deadline_guard`
BEFORE UPDATE ON `research_site_executions`
WHEN (NEW.`began_at` IS NULL) <> (NEW.`execution_expires_at` IS NULL)
	OR (NEW.`execution_expires_at` IS NOT NULL AND (
		typeof(NEW.`execution_expires_at`) <> 'integer'
		OR NEW.`began_at` > 9007199253480991
		OR NEW.`execution_expires_at` <> NEW.`began_at` + 1260000
		OR NEW.`execution_expires_at` > NEW.`reservation_expires_at`
	))
	OR (OLD.`execution_expires_at` IS NOT NULL
		AND NEW.`execution_expires_at` IS NOT OLD.`execution_expires_at`)
BEGIN
	SELECT RAISE(ABORT, 'invalid research site execution begin deadline');
END;
