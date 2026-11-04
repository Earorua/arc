-- Replace only the budget column inside this migration. The run IDs, cases view,
-- dispatch table and its live foreign keys stay in place throughout.
ALTER TABLE document_acceptance_runs ADD COLUMN issued_budget_micro_usd INTEGER;
--> statement-breakpoint
UPDATE document_acceptance_runs SET issued_budget_micro_usd=total_budget_micro_usd;
--> statement-breakpoint
ALTER TABLE document_acceptance_runs DROP COLUMN total_budget_micro_usd;
--> statement-breakpoint
ALTER TABLE document_acceptance_runs RENAME COLUMN issued_budget_micro_usd TO total_budget_micro_usd;
--> statement-breakpoint
-- Adding the constraint after the copy preserves the original amounts without a default grant.
-- Only the frozen 2026.11.3 Kimi configuration and 24-case corpus can select this B4 plan.
ALTER TABLE document_acceptance_runs ADD COLUMN budget_plan TEXT CHECK (
  total_budget_micro_usd IS NOT NULL AND (
    (budget_plan IS NULL AND total_budget_micro_usd BETWEEN 1 AND 500000)
    OR (budget_plan IS 'b4-kimi-k31-pro-mxfp4-v1' AND typeof(total_budget_micro_usd)='integer'
      AND total_budget_micro_usd BETWEEN 1 AND 2000000
      AND corpus_sha256='69e5ddd1005f12abf24483e10dd235629ef309ba3a84e922166963ccd9aed750'
      AND configuration_sha256='5b55cb672995351b5c01b6c15a74dae17e3a314f5ab45aa8c1625cfb8eef59e8')
  )
);
--> statement-breakpoint
-- Even INSERT OR REPLACE must not reopen a run. An expanded B4 run must also be distinct from any issued production grant.
CREATE TRIGGER document_acceptance_run_single_issuance BEFORE INSERT ON document_acceptance_runs
WHEN typeof(NEW.total_budget_micro_usd)<>'integer'
  OR EXISTS(SELECT 1 FROM document_acceptance_runs WHERE run_id=NEW.run_id)
  OR (NEW.budget_plan IS NOT NULL AND EXISTS(SELECT 1 FROM document_production_grants WHERE grant_id=NEW.run_id))
BEGIN
  SELECT RAISE(ABORT,'Invalid or already issued document acceptance run');
END;
--> statement-breakpoint
-- A budget change requires a new registration. The expanded plan also freezes its issued identity and window.
CREATE TRIGGER document_acceptance_run_fixed_budget
BEFORE UPDATE OF run_id,budget_plan,total_budget_micro_usd,owner_id,corpus_sha256,configuration_sha256,
  approved_at,expires_at,max_requests,cases_json ON document_acceptance_runs
WHEN NEW.run_id IS NOT OLD.run_id OR NEW.budget_plan IS NOT OLD.budget_plan
  OR NEW.total_budget_micro_usd IS NOT OLD.total_budget_micro_usd OR OLD.budget_plan IS NOT NULL
BEGIN
  SELECT RAISE(ABORT,'Document acceptance grant is immutable');
END;
