CREATE TABLE `research_bridge_nonces` (
	`scope` text NOT NULL,
	`nonce` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`scope`, `nonce`),
	CONSTRAINT "research_bridge_nonces_scope_check" CHECK(length("research_bridge_nonces"."scope") BETWEEN 18 AND 49
    AND length(CAST("research_bridge_nonces"."scope" AS BLOB)) = length("research_bridge_nonces"."scope")
    AND substr("research_bridge_nonces"."scope",1,17) IN ('site-to-executor:', 'executor-to-site:')
    AND substr("research_bridge_nonces"."scope",18) NOT GLOB '*[^A-Za-z0-9_-]*'),
	CONSTRAINT "research_bridge_nonces_nonce_check" CHECK(length("research_bridge_nonces"."nonce") = 32
    AND length(CAST("research_bridge_nonces"."nonce" AS BLOB)) = 32
    AND "research_bridge_nonces"."nonce" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "research_bridge_nonces_time_check" CHECK(typeof("research_bridge_nonces"."created_at") = 'integer' AND "research_bridge_nonces"."created_at" BETWEEN 0 AND 9007199254740991
    AND typeof("research_bridge_nonces"."expires_at") = 'integer' AND "research_bridge_nonces"."expires_at" BETWEEN 0 AND 9007199254740991
    AND "research_bridge_nonces"."expires_at" > "research_bridge_nonces"."created_at"
    AND "research_bridge_nonces"."expires_at" - "research_bridge_nonces"."created_at" <= 150001)
);
--> statement-breakpoint
CREATE INDEX `research_bridge_nonces_expiry_idx` ON `research_bridge_nonces` (`expires_at`);