-- Preserve existing grants verbatim while adding the separately issued v2 canonical-model plan.
-- The cases view, dispatch table and foreign keys remain in place. No run is issued by this migration.
DROP TRIGGER document_acceptance_run_fixed_budget;
--> statement-breakpoint
DROP TRIGGER document_acceptance_run_single_issuance;
--> statement-breakpoint
ALTER TABLE document_acceptance_runs ADD COLUMN preserved_budget_plan TEXT;
--> statement-breakpoint
UPDATE document_acceptance_runs SET preserved_budget_plan=budget_plan;
--> statement-breakpoint
ALTER TABLE document_acceptance_runs DROP COLUMN budget_plan;
--> statement-breakpoint
ALTER TABLE document_acceptance_runs RENAME COLUMN preserved_budget_plan TO budget_plan;
--> statement-breakpoint
-- Attach the replacement constraint after copying; the sentinel cannot be NULL or disabled.
ALTER TABLE document_acceptance_runs ADD COLUMN budget_plan_guard INTEGER NOT NULL DEFAULT 1 CHECK (
  budget_plan_guard=1 AND total_budget_micro_usd IS NOT NULL AND (
    (budget_plan IS NULL AND total_budget_micro_usd BETWEEN 1 AND 500000)
    OR (typeof(total_budget_micro_usd)='integer' AND total_budget_micro_usd BETWEEN 1 AND 2000000
      AND corpus_sha256='69e5ddd1005f12abf24483e10dd235629ef309ba3a84e922166963ccd9aed750'
      AND (
        (budget_plan IS 'b4-kimi-k31-pro-mxfp4-v1'
          AND configuration_sha256='5b55cb672995351b5c01b6c15a74dae17e3a314f5ab45aa8c1625cfb8eef59e8')
        OR (budget_plan IS 'b4-kimi-k31-pro-mxfp4-v2'
          AND configuration_sha256='ec56126eff54568bbd9960ad050c7311b137cb0ac44c2f42e0ea506c6c81718f')
      )
    )
  )
);
--> statement-breakpoint
CREATE TRIGGER document_acceptance_run_single_issuance BEFORE INSERT ON document_acceptance_runs
WHEN typeof(NEW.total_budget_micro_usd)<>'integer'
  OR EXISTS(SELECT 1 FROM document_acceptance_runs WHERE run_id=NEW.run_id)
  OR (NEW.budget_plan IS NOT NULL AND EXISTS(SELECT 1 FROM document_production_grants WHERE grant_id=NEW.run_id))
BEGIN
  SELECT RAISE(ABORT,'Invalid or already issued document acceptance run');
END;
--> statement-breakpoint
CREATE TRIGGER document_acceptance_run_fixed_budget
BEFORE UPDATE OF run_id,budget_plan,total_budget_micro_usd,owner_id,corpus_sha256,configuration_sha256,
  approved_at,expires_at,max_requests,cases_json ON document_acceptance_runs
WHEN NEW.run_id IS NOT OLD.run_id OR NEW.budget_plan IS NOT OLD.budget_plan
  OR NEW.total_budget_micro_usd IS NOT OLD.total_budget_micro_usd OR OLD.budget_plan IS NOT NULL
BEGIN
  SELECT RAISE(ABORT,'Document acceptance grant is immutable');
END;
