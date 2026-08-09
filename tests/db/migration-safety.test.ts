import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "../../drizzle/0002_product_intelligence.sql";
const migrationSql = readFileSync(new URL(/* @vite-ignore */ migrationPath, import.meta.url), "utf8");

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

  it("contains no destructive or data-mutating statements", () => {
    expect(migrationSql).not.toMatch(/\bDROP\s+(?:TABLE|COLUMN)\b/iu);
    expect(migrationSql).not.toMatch(/\bDELETE\s+FROM\b/iu);
    expect(migrationSql).not.toMatch(/(?:^|;)\s*UPDATE\s+/iu);
    expect(migrationSql).not.toMatch(/\bALTER\s+TABLE\b/iu);
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
  });
});
