CREATE TABLE `learning_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`canonical_url` text NOT NULL,
	`title` text NOT NULL,
	`provider` text NOT NULL,
	`language` text NOT NULL,
	`cost` text NOT NULL,
	`format` text NOT NULL,
	`source_tier` text NOT NULL,
	`last_verified_at` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learning_resources_url_idx` ON `learning_resources` (`canonical_url`);--> statement-breakpoint
CREATE TABLE `resource_skill_links` (
	`id` text PRIMARY KEY NOT NULL,
	`blueprint_version_id` text NOT NULL,
	`skill_key` text NOT NULL,
	`resource_id` text NOT NULL,
	`purpose` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`blueprint_version_id`) REFERENCES `role_blueprint_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resource_id`) REFERENCES `learning_resources`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`blueprint_version_id`,`skill_key`) REFERENCES `role_skill_definitions`(`blueprint_version_id`,`skill_key`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resource_skill_links_unique_idx` ON `resource_skill_links` (`blueprint_version_id`,`skill_key`,`resource_id`,`purpose`);--> statement-breakpoint
CREATE INDEX `resource_skill_links_version_idx` ON `resource_skill_links` (`blueprint_version_id`);--> statement-breakpoint
CREATE INDEX `resource_skill_links_resource_idx` ON `resource_skill_links` (`resource_id`);--> statement-breakpoint
CREATE TABLE `role_blueprint_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`role_id` text NOT NULL,
	`version` text NOT NULL,
	`status` text NOT NULL,
	`blueprint_json` text NOT NULL,
	`source_coverage_json` text DEFAULT '{}' NOT NULL,
	`published_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `role_blueprints`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `role_blueprint_versions_role_version_idx` ON `role_blueprint_versions` (`role_id`,`version`);--> statement-breakpoint
CREATE INDEX `role_blueprint_versions_role_idx` ON `role_blueprint_versions` (`role_id`);--> statement-breakpoint
CREATE TABLE `role_blueprints` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`current_version` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `role_blueprints_slug_idx` ON `role_blueprints` (`slug`);--> statement-breakpoint
CREATE TABLE `role_skill_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`blueprint_version_id` text NOT NULL,
	`skill_key` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`importance` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`blueprint_version_id`) REFERENCES `role_blueprint_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `role_skill_definitions_version_key_idx` ON `role_skill_definitions` (`blueprint_version_id`,`skill_key`);--> statement-breakpoint
CREATE INDEX `role_skill_definitions_version_idx` ON `role_skill_definitions` (`blueprint_version_id`);--> statement-breakpoint
CREATE TABLE `role_skill_edges` (
	`id` text PRIMARY KEY NOT NULL,
	`blueprint_version_id` text NOT NULL,
	`from_skill_key` text NOT NULL,
	`to_skill_key` text NOT NULL,
	`relation` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`blueprint_version_id`) REFERENCES `role_blueprint_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`blueprint_version_id`,`from_skill_key`) REFERENCES `role_skill_definitions`(`blueprint_version_id`,`skill_key`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`blueprint_version_id`,`to_skill_key`) REFERENCES `role_skill_definitions`(`blueprint_version_id`,`skill_key`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `role_skill_edges_unique_idx` ON `role_skill_edges` (`blueprint_version_id`,`from_skill_key`,`to_skill_key`,`relation`);--> statement-breakpoint
CREATE INDEX `role_skill_edges_version_idx` ON `role_skill_edges` (`blueprint_version_id`);