-- Latch the paid intent with the existing Workflow job's first claim, before any potentially ambiguous reserve/stop write.
ALTER TABLE document_executor_jobs ADD COLUMN paid_intent TEXT CHECK(paid_intent IS NULL OR paid_intent='acceptance' OR length(paid_intent)=64);
--> statement-breakpoint
CREATE UNIQUE INDEX document_executor_one_paid_intent ON document_executor_jobs((1)) WHERE paid_intent IS NOT NULL;
--> statement-breakpoint
-- An operator supplies the grant out of band. First use permanently binds its ID to the complete issuance.
CREATE TABLE document_production_grants (
  grant_id TEXT PRIMARY KEY, authorization_sha256 TEXT NOT NULL CHECK(length(authorization_sha256)=64),
  approved_at INTEGER NOT NULL, expires_at INTEGER NOT NULL CHECK(expires_at>approved_at),
  total_budget_micro_usd INTEGER NOT NULL CHECK(total_budget_micro_usd BETWEEN 1 AND 9007199254740991),
  last_checked_at INTEGER NOT NULL DEFAULT 0, expired_at INTEGER
);
--> statement-breakpoint
CREATE TABLE document_production_dispatches (
  job_id TEXT PRIMARY KEY REFERENCES document_executor_jobs(job_id),
  grant_id TEXT NOT NULL REFERENCES document_production_grants(grant_id),
  reserved_micro_usd INTEGER NOT NULL CHECK(reserved_micro_usd>0), claimed_at INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','verified','stopped')),
  receipt_id TEXT UNIQUE, sent_at TEXT, returned_at TEXT, actual_micro_usd INTEGER CHECK(actual_micro_usd>=0),
  input_tokens INTEGER, output_tokens INTEGER,
  audit_json TEXT CHECK(audit_json IS NULL OR (json_valid(audit_json) AND length(audit_json)<=4096)), checked_at INTEGER
);
--> statement-breakpoint
CREATE INDEX document_production_grant_spend ON document_production_dispatches(grant_id,actual_micro_usd);
--> statement-breakpoint
CREATE INDEX document_production_unresolved ON document_production_dispatches(state) WHERE state<>'verified';
--> statement-breakpoint
CREATE TABLE document_paid_transport_hold (singleton INTEGER PRIMARY KEY CHECK(singleton=1), stopped_at INTEGER NOT NULL);
--> statement-breakpoint
-- Both paid paths serialize reservation and receipt ownership in the same executor database.
CREATE VIEW document_paid_dispatches AS
  SELECT job_id,state,receipt_id FROM document_acceptance_dispatches
  UNION ALL SELECT job_id,state,receipt_id FROM document_production_dispatches;
