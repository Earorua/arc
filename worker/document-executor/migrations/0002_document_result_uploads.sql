ALTER TABLE document_executor_jobs ADD COLUMN result_upload_id TEXT;
--> statement-breakpoint
ALTER TABLE document_executor_jobs ADD COLUMN accounting_only INTEGER NOT NULL DEFAULT 0 CHECK(accounting_only IN(0,1));
--> statement-breakpoint
ALTER TABLE document_executor_jobs ADD COLUMN legacy_recovery_hold INTEGER NOT NULL DEFAULT 0 CHECK(legacy_recovery_hold IN(0,1));
--> statement-breakpoint
-- An older maintenance pass could register termination before its recovery PUT finished.
UPDATE document_executor_jobs SET legacy_recovery_hold=writer_terminated,writer_terminated=0,
  result_key=COALESCE(result_key,'document-results/'||job_id||'/'||result_ref)
WHERE result_ref IS NOT NULL AND result_ready=0;
--> statement-breakpoint
CREATE TRIGGER document_executor_upload_enroll_once
BEFORE UPDATE OF result_upload_id ON document_executor_jobs
WHEN OLD.result_upload_id IS NOT NULL OR NEW.result_upload_id IS NULL OR OLD.result_key IS NULL
  OR OLD.result_key IS NOT ('document-results-multipart/v1/' || OLD.job_id || '/' || OLD.result_ref)
  OR (NEW.result_upload_id<>'' AND (OLD.writer_terminated<>0 OR OLD.result_ready<>0 OR OLD.cleanup_requested<>0))
BEGIN
  SELECT RAISE(ABORT, 'Result upload enrollment is closed');
END;
