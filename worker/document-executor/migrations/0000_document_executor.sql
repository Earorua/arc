CREATE TABLE document_bridge_nonces(nonce TEXT PRIMARY KEY,expires_at INTEGER NOT NULL);
CREATE TABLE document_executor_jobs(
 job_id TEXT PRIMARY KEY,
 state TEXT NOT NULL CHECK(state IN('queued','running','delivery-pending','delivered','cost-unknown','closed')),
 dispatch_state TEXT NOT NULL CHECK(dispatch_state IN('not-sent','may-have-sent','settled')),
 result_ref TEXT UNIQUE,result_key TEXT UNIQUE,result_ready INTEGER NOT NULL DEFAULT 0 CHECK(result_ready IN(0,1)),
 accounting_json TEXT CHECK(accounting_json IS NULL OR (json_valid(accounting_json) AND length(CAST(accounting_json AS BLOB))<=4096)),
 cleanup_requested INTEGER NOT NULL DEFAULT 0 CHECK(cleanup_requested IN(0,1)),
 writer_terminated INTEGER NOT NULL DEFAULT 0 CHECK(writer_terminated IN(0,1)),
 delivery_attempts INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,last_attempt_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX document_executor_recovery ON document_executor_jobs(last_attempt_at,job_id);
