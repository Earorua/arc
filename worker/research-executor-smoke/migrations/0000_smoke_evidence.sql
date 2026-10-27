-- Smoke-only observations. Business lifecycle remains in the production tables.
CREATE TABLE smoke_scenarios (
  scenario_id TEXT PRIMARY KEY CHECK (scenario_id IN ('long','after-r2','after-d1')),
  job_id TEXT NOT NULL UNIQUE CHECK (length(job_id) = 36),
  owner_id TEXT NOT NULL UNIQUE CHECK (length(owner_id) BETWEEN 1 AND 64),
  mutation_id TEXT NOT NULL UNIQUE CHECK (length(mutation_id) BETWEEN 1 AND 64),
  request_id TEXT NOT NULL UNIQUE CHECK (length(request_id) BETWEEN 1 AND 64),
  started_at INTEGER NOT NULL CHECK (started_at BETWEEN 0 AND 9007199254740991),
  provider_calls INTEGER NOT NULL DEFAULT 0 CHECK (provider_calls BETWEEN 0 AND 10000),
  repair_calls INTEGER NOT NULL DEFAULT 0 CHECK (repair_calls BETWEEN 0 AND 10000),
  rejections INTEGER NOT NULL DEFAULT 0 CHECK (rejections BETWEEN 0 AND 10000),
  fault_marker TEXT CHECK (fault_marker IS NULL OR (fault_marker = scenario_id AND fault_marker IN ('after-r2','after-d1'))),
  fault_at INTEGER CHECK (fault_at BETWEEN 0 AND 9007199254740991),
  CHECK ((fault_marker IS NULL) = (fault_at IS NULL))
) STRICT;

CREATE TRIGGER smoke_identity_immutable BEFORE UPDATE ON smoke_scenarios
WHEN NEW.scenario_id != OLD.scenario_id OR NEW.job_id != OLD.job_id OR NEW.owner_id != OLD.owner_id
  OR NEW.mutation_id != OLD.mutation_id OR NEW.request_id != OLD.request_id OR NEW.started_at != OLD.started_at
  OR (OLD.fault_marker IS NOT NULL AND (NEW.fault_marker IS NOT OLD.fault_marker OR NEW.fault_at IS NOT OLD.fault_at))
BEGIN SELECT RAISE(ABORT, 'immutable smoke evidence'); END;

CREATE TABLE smoke_cron_events (
  event_id TEXT NOT NULL CHECK (length(event_id) BETWEEN 1 AND 64),
  phase TEXT NOT NULL CHECK (phase IN ('start','end')),
  at INTEGER NOT NULL CHECK (at BETWEEN 0 AND 9007199254740991),
  outcome TEXT CHECK (outcome IN ('ok','error')),
  PRIMARY KEY (event_id, phase),
  CHECK ((phase = 'start' AND outcome IS NULL) OR (phase = 'end' AND outcome IS NOT NULL))
) STRICT;
CREATE TRIGGER smoke_cron_immutable BEFORE UPDATE ON smoke_cron_events
BEGIN SELECT RAISE(ABORT, 'immutable smoke Cron evidence'); END;
