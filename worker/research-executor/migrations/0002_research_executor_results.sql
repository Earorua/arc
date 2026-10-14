CREATE TABLE research_executor_results (
  job_id TEXT PRIMARY KEY NOT NULL
    CHECK(typeof(job_id) = 'text' AND length(job_id) = 36)
    REFERENCES research_executor_jobs(job_id),
  receipt_hash TEXT NOT NULL
    CHECK(typeof(receipt_hash) = 'text'
      AND length(receipt_hash) = 64
      AND receipt_hash NOT GLOB '*[^0-9a-f]*'),
  metadata_json TEXT NOT NULL
    CHECK(typeof(metadata_json) = 'text'
      AND length(CAST(metadata_json AS BLOB)) BETWEEN 1 AND 4096
      AND json_valid(metadata_json)
      AND json_type(metadata_json) = 'object'),
  fixed_at INTEGER NOT NULL
    CHECK(typeof(fixed_at) = 'integer' AND fixed_at BETWEEN 0 AND 9007199254740991),
  site_acknowledged_at INTEGER
    CHECK(site_acknowledged_at IS NULL OR (
      typeof(site_acknowledged_at) = 'integer'
      AND site_acknowledged_at BETWEEN 0 AND 9007199254740991
    )),
  cleanup_requested_at INTEGER
    CHECK(cleanup_requested_at IS NULL OR (
      typeof(cleanup_requested_at) = 'integer'
      AND cleanup_requested_at BETWEEN 0 AND 9007199254740991
    )),
  body_removed_at INTEGER
    CHECK(body_removed_at IS NULL OR (
      typeof(body_removed_at) = 'integer'
      AND body_removed_at BETWEEN 0 AND 9007199254740991
    )),
  CHECK(body_removed_at IS NULL OR (
    cleanup_requested_at IS NOT NULL AND body_removed_at = cleanup_requested_at
  ))
);
