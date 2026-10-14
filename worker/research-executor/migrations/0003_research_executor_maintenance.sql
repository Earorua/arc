CREATE TABLE research_executor_delivery (
  job_id TEXT PRIMARY KEY NOT NULL
    CHECK(typeof(job_id) = 'text' AND length(job_id) = 36 AND length(CAST(job_id AS BLOB)) = 36
      AND job_id NOT GLOB '*[^0-9A-Fa-f-]*'
      AND length(replace(job_id,'-',''))=32
      AND substr(job_id,9,1)='-' AND substr(job_id,14,1)='-'
      AND substr(job_id,19,1)='-' AND substr(job_id,24,1)='-'
      AND (lower(job_id)='00000000-0000-0000-0000-000000000000'
        OR lower(job_id)='ffffffff-ffff-ffff-ffff-ffffffffffff'
        OR (substr(job_id,15,1) IN ('1','2','3','4','5','6','7','8')
          AND lower(substr(job_id,20,1)) IN ('8','9','a','b'))))
    REFERENCES research_executor_jobs(job_id),
  receipt_hash TEXT NOT NULL
    CHECK(typeof(receipt_hash) = 'text' AND length(receipt_hash) = 64
      AND receipt_hash NOT GLOB '*[^0-9a-f]*'),
  attempt_count INTEGER NOT NULL DEFAULT 0
    CHECK(typeof(attempt_count) = 'integer' AND attempt_count BETWEEN 0 AND 31),
  next_attempt_at INTEGER NOT NULL
    CHECK(typeof(next_attempt_at) = 'integer' AND next_attempt_at BETWEEN 0 AND 9007199254740991),
  stopped_code TEXT CHECK(stopped_code IS NULL OR stopped_code IN ('authentication','protocol','conflict')),
  completed_at INTEGER CHECK(completed_at IS NULL OR (
    typeof(completed_at) = 'integer' AND completed_at BETWEEN 0 AND 9007199254740991
  )),
  version INTEGER NOT NULL DEFAULT 0
    CHECK(typeof(version) = 'integer' AND version BETWEEN 0 AND 9007199254740991),
  CHECK(completed_at IS NULL OR stopped_code IS NULL)
);

CREATE TABLE research_executor_acceptance_delivery (
  job_id TEXT PRIMARY KEY NOT NULL
    CHECK(typeof(job_id) = 'text' AND length(job_id) = 36 AND length(CAST(job_id AS BLOB)) = 36
      AND job_id NOT GLOB '*[^0-9A-Fa-f-]*'
      AND length(replace(job_id,'-',''))=32
      AND substr(job_id,9,1)='-' AND substr(job_id,14,1)='-'
      AND substr(job_id,19,1)='-' AND substr(job_id,24,1)='-'
      AND (lower(job_id)='00000000-0000-0000-0000-000000000000'
        OR lower(job_id)='ffffffff-ffff-ffff-ffff-ffffffffffff'
        OR (substr(job_id,15,1) IN ('1','2','3','4','5','6','7','8')
          AND lower(substr(job_id,20,1)) IN ('8','9','a','b'))))
    REFERENCES research_executor_jobs(job_id),
  acknowledged_at INTEGER CHECK(acknowledged_at IS NULL OR (
    typeof(acknowledged_at) = 'integer' AND acknowledged_at BETWEEN 0 AND 9007199254740991
  )),
  next_attempt_at INTEGER NOT NULL
    CHECK(typeof(next_attempt_at) = 'integer' AND next_attempt_at BETWEEN 0 AND 9007199254740991),
  attempt_count INTEGER NOT NULL DEFAULT 0
    CHECK(typeof(attempt_count) = 'integer' AND attempt_count BETWEEN 0 AND 31),
  stopped_code TEXT CHECK(stopped_code IS NULL OR stopped_code IN ('authentication','protocol','conflict')),
  version INTEGER NOT NULL DEFAULT 0
    CHECK(typeof(version) = 'integer' AND version BETWEEN 0 AND 9007199254740991),
  CHECK(acknowledged_at IS NULL OR stopped_code IS NULL)
);

CREATE TABLE research_executor_maintenance_cursors (
  category TEXT PRIMARY KEY NOT NULL
    CHECK(typeof(category) = 'text' AND category IN ('site','bootstrap','results')),
  after_accepted_at INTEGER CHECK(after_accepted_at IS NULL OR (
    typeof(after_accepted_at) = 'integer' AND after_accepted_at BETWEEN 0 AND 9007199254740991
  )),
  after_job_id TEXT CHECK(after_job_id IS NULL OR (
    typeof(after_job_id) = 'text' AND length(after_job_id) = 36 AND length(CAST(after_job_id AS BLOB)) = 36
    AND after_job_id NOT GLOB '*[^0-9A-Fa-f-]*'
    AND length(replace(after_job_id,'-',''))=32
    AND substr(after_job_id,9,1)='-' AND substr(after_job_id,14,1)='-'
    AND substr(after_job_id,19,1)='-' AND substr(after_job_id,24,1)='-'
    AND (lower(after_job_id)='00000000-0000-0000-0000-000000000000'
      OR lower(after_job_id)='ffffffff-ffff-ffff-ffff-ffffffffffff'
      OR (substr(after_job_id,15,1) IN ('1','2','3','4','5','6','7','8')
        AND lower(substr(after_job_id,20,1)) IN ('8','9','a','b')))
  )),
  version INTEGER NOT NULL DEFAULT 0
    CHECK(typeof(version) = 'integer' AND version BETWEEN 0 AND 9007199254740991),
  pickup_turn INTEGER NOT NULL DEFAULT 0 CHECK(pickup_turn IN (0,1)),
  CHECK((after_accepted_at IS NULL) = (after_job_id IS NULL))
);

CREATE TABLE research_executor_maintenance_schedule (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  next_category INTEGER NOT NULL
    CHECK(typeof(next_category) = 'integer' AND next_category BETWEEN 0 AND 2),
  generation INTEGER NOT NULL DEFAULT 0
    CHECK(typeof(generation) = 'integer' AND generation BETWEEN 0 AND 9007199254740991),
  lease_until INTEGER NOT NULL DEFAULT 0
    CHECK(typeof(lease_until) = 'integer' AND lease_until BETWEEN 0 AND 9007199254740991)
);

INSERT INTO research_executor_maintenance_cursors(category) VALUES('site'),('bootstrap'),('results');
INSERT INTO research_executor_maintenance_schedule(singleton,next_category) VALUES(1,0);
CREATE INDEX research_executor_job_scan_idx ON research_executor_jobs(accepted_at,job_id);
CREATE INDEX research_executor_delivery_due_idx ON research_executor_delivery(next_attempt_at,job_id);

CREATE TRIGGER research_executor_delivery_identity_guard
BEFORE UPDATE ON research_executor_delivery
WHEN NEW.job_id != OLD.job_id OR NEW.receipt_hash != OLD.receipt_hash
  OR NEW.version != OLD.version + 1
BEGIN SELECT RAISE(ABORT, 'immutable executor delivery identity'); END;

CREATE TRIGGER research_executor_delivery_delete_guard
BEFORE DELETE ON research_executor_delivery
BEGIN SELECT RAISE(ABORT, 'immutable executor delivery'); END;

CREATE TRIGGER research_executor_acceptance_identity_guard
BEFORE UPDATE ON research_executor_acceptance_delivery
WHEN NEW.job_id != OLD.job_id OR NEW.version != OLD.version + 1
BEGIN SELECT RAISE(ABORT, 'immutable executor acceptance identity'); END;

CREATE TRIGGER research_executor_acceptance_delete_guard
BEFORE DELETE ON research_executor_acceptance_delivery
BEGIN SELECT RAISE(ABORT, 'immutable executor acceptance'); END;

CREATE TRIGGER research_executor_cursor_identity_guard
BEFORE UPDATE ON research_executor_maintenance_cursors
WHEN NEW.category IS NOT OLD.category OR NEW.version != OLD.version + 1
BEGIN SELECT RAISE(ABORT, 'immutable executor cursor identity'); END;

CREATE TRIGGER research_executor_schedule_identity_guard
BEFORE UPDATE ON research_executor_maintenance_schedule
WHEN NEW.singleton != OLD.singleton OR NEW.generation != OLD.generation + 1
BEGIN SELECT RAISE(ABORT, 'invalid executor schedule generation'); END;
