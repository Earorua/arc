CREATE TABLE `research_executor_jobs` (
	`job_id` text NOT NULL PRIMARY KEY,
	`request_hash` text NOT NULL,
	`job_json` text NOT NULL,
	`accepted_at` integer NOT NULL,
	`workflow_accepted_at` integer,
	`grant_json` text,
	`dispatch_state` text NOT NULL DEFAULT 'unclaimed',
	`dispatch_at` integer,
	CONSTRAINT "research_executor_jobs_job_id_check" CHECK(typeof("job_id") = 'text'
		AND length("job_id") = 36
		AND length(CAST("job_id" AS BLOB)) = 36),
	CONSTRAINT "research_executor_jobs_request_hash_check" CHECK(typeof("request_hash") = 'text'
		AND length("request_hash") = 64
		AND length(CAST("request_hash" AS BLOB)) = 64
		AND "request_hash" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "research_executor_jobs_job_json_check" CHECK(typeof("job_json") = 'text'
		AND length(CAST("job_json" AS BLOB)) BETWEEN 1 AND 4096
		AND json_valid("job_json") = 1
		AND json_type("job_json") = 'object'),
	CONSTRAINT "research_executor_jobs_accepted_at_check" CHECK(typeof("accepted_at") = 'integer'
		AND "accepted_at" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "research_executor_jobs_workflow_accepted_at_check" CHECK("workflow_accepted_at" IS NULL
		OR (typeof("workflow_accepted_at") = 'integer'
			AND "workflow_accepted_at" BETWEEN 0 AND 9007199254740991)),
	CONSTRAINT "research_executor_jobs_grant_json_check" CHECK("grant_json" IS NULL
		OR (typeof("grant_json") = 'text'
			AND length(CAST("grant_json" AS BLOB)) BETWEEN 1 AND 4096
			AND json_valid("grant_json") = 1
			AND json_type("grant_json") = 'object')),
	CONSTRAINT "research_executor_jobs_dispatch_check" CHECK(
		"dispatch_state" IN ('unclaimed', 'claimed', 'closed')
		AND (("dispatch_state" = 'unclaimed' AND "dispatch_at" IS NULL)
			OR ("dispatch_state" IN ('claimed', 'closed')
				AND typeof("dispatch_at") = 'integer'
				AND "dispatch_at" BETWEEN 0 AND 9007199254740991))
		AND ("dispatch_state" != 'claimed' OR "grant_json" IS NOT NULL))
);
