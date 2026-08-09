import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "../../drizzle/0002_product_intelligence.sql";
const migrationSql = readFileSync(new URL(/* @vite-ignore */ migrationPath, import.meta.url), "utf8");

function migrationStatements(sql: string) {
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function isAdditiveSchemaMigration(sql: string) {
  return migrationStatements(sql).every((statement) => {
    const statementBody = statement.replace(/;$/u, "").trim();

    return !statementBody.includes(";")
      && /^(?:CREATE TABLE|CREATE (?:UNIQUE )?INDEX)\b/u.test(statementBody);
  });
}

function tableStatement(tableName: string) {
  const statement = migrationSql
    .split("--> statement-breakpoint")
    .find((candidate) => candidate.trimStart().startsWith(`CREATE TABLE \`${tableName}\``));

  if (!statement) {
    throw new Error(`Missing CREATE TABLE statement for ${tableName}`);
  }

  return statement.replace(/\s+/gu, " ");
}

describe("product intelligence migration safety", () => {
  it("creates all six additive intelligence tables", () => {
    const expectedTableNames = [
      "role_blueprints",
      "role_blueprint_versions",
      "role_skill_definitions",
      "role_skill_edges",
      "learning_resources",
      "resource_skill_links",
    ].sort();
    const createdTableNames = [...migrationSql.matchAll(/CREATE TABLE `([^`]+)`/gu)]
      .map((match) => match[1])
      .sort();

    expect(createdTableNames).toEqual(expectedTableNames);
  });

  it("contains only additive table and index statements", () => {
    expect(migrationStatements(migrationSql)).toHaveLength(17);
    expect(isAdditiveSchemaMigration(migrationSql)).toBe(true);
  });

  it.each([
    "INSERT INTO existing_table VALUES (1);",
    "REPLACE INTO existing_table VALUES (1);",
    "UPDATE existing_table SET value = 1;",
    "ALTER TABLE existing_table ADD COLUMN value text;",
    "DELETE FROM existing_table;",
    "DROP TABLE existing_table;",
  ])("rejects non-additive statement: %s", (statement) => {
    expect(isAdditiveSchemaMigration(statement)).toBe(false);
  });

  it.each([
    "CREATE TABLE `allowed` (`id` text); DELETE FROM `users`;",
    "CREATE INDEX `allowed_idx` ON `allowed` (`id`); UPDATE `users` SET `name` = 'changed';",
    "CREATE TABLE `allowed` (`id` text); DROP TABLE `users`;",
  ])("rejects a mutation hidden after an allowed CREATE: %s", (sql) => {
    expect(isAdditiveSchemaMigration(sql)).toBe(false);
  });

  it("accepts one generated multiline CREATE with a terminal semicolon", () => {
    const generatedCreate = `CREATE TABLE \`allowed\` (
      \`id\` text PRIMARY KEY NOT NULL,
      \`created_at\` integer DEFAULT (unixepoch() * 1000) NOT NULL
    );`;

    expect(isAdditiveSchemaMigration(generatedCreate)).toBe(true);
  });

  it("creates the required intelligence uniqueness and lookup indexes", () => {
    const uniqueIndexNames = [
      "role_blueprints_slug_idx",
      "role_blueprint_versions_role_version_idx",
      "role_skill_definitions_version_key_idx",
      "role_skill_edges_unique_idx",
      "learning_resources_url_idx",
      "resource_skill_links_unique_idx",
    ];
    const lookupIndexNames = [
      "role_blueprint_versions_role_idx",
      "role_skill_definitions_version_idx",
      "role_skill_edges_version_idx",
      "resource_skill_links_version_idx",
      "resource_skill_links_resource_idx",
    ];

    for (const indexName of uniqueIndexNames) {
      expect(migrationSql).toContain(`CREATE UNIQUE INDEX \`${indexName}\``);
    }
    for (const indexName of lookupIndexNames) {
      expect(migrationSql).toContain(`CREATE INDEX \`${indexName}\``);
    }

    const createdIndexNames = [...migrationSql.matchAll(/CREATE (?:UNIQUE )?INDEX `([^`]+)`/gu)]
      .map((match) => match[1])
      .sort();
    expect(createdIndexNames).toEqual([...uniqueIndexNames, ...lookupIndexNames].sort());
  });

  it("preserves the approved foreign-key delete behavior", () => {
    expect([...migrationSql.matchAll(/\bFOREIGN KEY\s*\(/gu)]).toHaveLength(8);
    expect(tableStatement("role_blueprint_versions")).toMatch(
      /FOREIGN KEY \(`role_id`\) REFERENCES `role_blueprints`\(`id`\) ON UPDATE no action ON DELETE cascade/iu,
    );
    expect(tableStatement("role_skill_definitions")).toMatch(
      /FOREIGN KEY \(`blueprint_version_id`\) REFERENCES `role_blueprint_versions`\(`id`\) ON UPDATE no action ON DELETE cascade/iu,
    );
    expect(tableStatement("role_skill_edges")).toMatch(
      /FOREIGN KEY \(`blueprint_version_id`\) REFERENCES `role_blueprint_versions`\(`id`\) ON UPDATE no action ON DELETE cascade/iu,
    );
    expect(tableStatement("resource_skill_links")).toMatch(
      /FOREIGN KEY \(`blueprint_version_id`\) REFERENCES `role_blueprint_versions`\(`id`\) ON UPDATE no action ON DELETE cascade/iu,
    );
    expect(tableStatement("resource_skill_links")).toMatch(
      /FOREIGN KEY \(`resource_id`\) REFERENCES `learning_resources`\(`id`\) ON UPDATE no action ON DELETE restrict/iu,
    );
    expect(tableStatement("role_skill_edges")).toMatch(
      /FOREIGN KEY \(`blueprint_version_id`,\s*`from_skill_key`\) REFERENCES `role_skill_definitions`\(`blueprint_version_id`,\s*`skill_key`\) ON UPDATE no action ON DELETE cascade/iu,
    );
    expect(tableStatement("role_skill_edges")).toMatch(
      /FOREIGN KEY \(`blueprint_version_id`,\s*`to_skill_key`\) REFERENCES `role_skill_definitions`\(`blueprint_version_id`,\s*`skill_key`\) ON UPDATE no action ON DELETE cascade/iu,
    );
    expect(tableStatement("resource_skill_links")).toMatch(
      /FOREIGN KEY \(`blueprint_version_id`,\s*`skill_key`\) REFERENCES `role_skill_definitions`\(`blueprint_version_id`,\s*`skill_key`\) ON UPDATE no action ON DELETE cascade/iu,
    );
  });
});
