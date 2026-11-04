ALTER TABLE `document_storage_operations` ADD `writer_protocol` text;--> statement-breakpoint
ALTER TABLE `document_storage_operations` ADD `r2_upload_id` text;
--> statement-breakpoint
-- Re-check old deletion jobs already in progress. Earlier releases could set 'deleted' after an ambiguous PUT.
UPDATE document_storage_operations SET state='cleanup-pending'
WHERE state='deleted' AND EXISTS (
  SELECT 1 FROM document_deletion_jobs j WHERE j.owner_id=document_storage_operations.owner_id
    AND j.document_id=document_storage_operations.document_id AND j.state<>'completed'
);
--> statement-breakpoint
CREATE TRIGGER document_storage_scope_immutable
BEFORE UPDATE OF owner_id, id, document_id, document_version_id, object_key, generation, writer_protocol
ON document_storage_operations
BEGIN
  SELECT RAISE(ABORT, 'Storage operation scope is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER document_storage_enroll_once
BEFORE UPDATE OF r2_upload_id ON document_storage_operations
WHEN OLD.r2_upload_id IS NOT NULL OR OLD.state <> 'writing'
  OR OLD.writer_protocol IS NOT 'r2-multipart-v1' OR coalesce(length(NEW.r2_upload_id),0) = 0
BEGIN
  SELECT RAISE(ABORT, 'Storage upload enrollment is closed');
END;
