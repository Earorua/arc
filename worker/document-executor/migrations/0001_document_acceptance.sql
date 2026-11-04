-- A single trusted registration inserts a complete run. The public API cannot enroll or edit cases.
CREATE TABLE document_acceptance_runs(
 run_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, corpus_sha256 TEXT NOT NULL, configuration_sha256 TEXT NOT NULL,
 approved_at INTEGER NOT NULL, expires_at INTEGER NOT NULL CHECK(expires_at > approved_at),
 max_requests INTEGER NOT NULL CHECK(max_requests=24),
 total_budget_micro_usd INTEGER NOT NULL CHECK(total_budget_micro_usd BETWEEN 1 AND 500000),
 cases_json TEXT NOT NULL CHECK(json_valid(cases_json) AND json_type(cases_json)='array' AND json_array_length(cases_json)=24 AND length(cases_json)<=32768),
 last_checked_at INTEGER NOT NULL DEFAULT 0, stopped_at INTEGER
);
CREATE VIEW document_acceptance_cases AS
 SELECT r.run_id, c.value->>'caseId' AS case_id, c.value->>'documentId' AS document_id,
 c.value->>'documentVersionId' AS document_version_id, c.value->>'textVersionId' AS text_version_id,
 c.value->>'generation' AS generation, c.value->>'textSha256' AS text_sha256
 FROM document_acceptance_runs r, json_each(r.cases_json) c;
CREATE TABLE document_acceptance_dispatches(
 run_id TEXT NOT NULL REFERENCES document_acceptance_runs(run_id), case_id TEXT NOT NULL,
 job_id TEXT NOT NULL UNIQUE REFERENCES document_executor_jobs(job_id), reserved_micro_usd INTEGER NOT NULL CHECK(reserved_micro_usd>=0),
 claimed_at INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','verified','stopped')),
 receipt_id TEXT UNIQUE, sent_at TEXT, returned_at TEXT, actual_micro_usd INTEGER CHECK(actual_micro_usd>=0), input_tokens INTEGER, output_tokens INTEGER,
 audit_json TEXT CHECK(audit_json IS NULL OR (json_valid(audit_json) AND length(audit_json)<=4096)), checked_at INTEGER,
 PRIMARY KEY(run_id,case_id)
);
