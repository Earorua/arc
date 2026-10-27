// @vitest-environment node
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from "drizzle-kit/api";
import { describe, expect, it } from "vitest";
import * as schema from "../../db/schema";

function structure(database: DatabaseSync) {
  const tables = database.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const sorted = (rows: unknown[]) => rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return Object.fromEntries(tables.map(({ name }) => {
    const columns = database.prepare(`PRAGMA table_info("${name}")`).all()
      .map(({ cid: _cid, ...column }) => {
        void _cid;
        // SQLite boolean defaults are integer constants; Drizzle spells them false/true.
        return { ...column, dflt_value: column.dflt_value === "false" ? "0" : column.dflt_value === "true" ? "1" : column.dflt_value };
      });
    const indexes = database.prepare(`PRAGMA index_list("${name}")`).all().map((index) => ({
      // Inline UNIQUE and a unique index enforce the same ordered key. Preserve PK identity.
      unique: index.unique, primary: index.origin === "pk", partial: index.partial,
      columns: database.prepare(`PRAGMA index_info("${index.name}")`).all().map((column) => column.name),
      predicate: index.partial ? String(database.prepare("SELECT sql FROM sqlite_schema WHERE type='index' AND name=?")
        .get(index.name)?.sql).split(/\bWHERE\b/i)[1].replaceAll('"', "").replaceAll("`", "")
        .replaceAll(`${name}.`, "").replace(/\s+/g, " ").trim() : null,
    }));
    const foreignKeys = database.prepare(`PRAGMA foreign_key_list("${name}")`).all()
      .map(({ id: _id, ...key }) => { void _id; return key; });
    return [name, { columns: sorted(columns), indexes: sorted(indexes), foreignKeys: sorted(foreignKeys) }];
  }));
}

describe("reconciled release schema", () => {
  it("records the full current schema without proposing duplicate historical DDL", async () => {
    const snapshot = JSON.parse(readFileSync("drizzle/meta/0013_snapshot.json", "utf8"));
    const current = await generateSQLiteDrizzleJson(schema, snapshot.id);
    expect(Object.keys(snapshot.tables)).toHaveLength(49);
    expect(snapshot.tables).toEqual(current.tables);
    expect(await generateSQLiteMigration(snapshot, current)).toEqual([]);
  });

  it("matches all migrated columns, indexes and foreign keys to the declared schema", async () => {
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
    expect(journal.entries.map((entry: { idx: number }) => entry.idx)).toEqual(Array.from({ length: 14 }, (_, index) => index));
    expect(journal.entries[13]).toMatchObject({ version: "6", tag: "0013_learning_agents", breakpoints: true });
    const migrated = new DatabaseSync(":memory:");
    const declared = new DatabaseSync(":memory:");
    try {
      for (const entry of journal.entries) migrated.exec(readFileSync(`drizzle/${entry.tag}.sql`, "utf8").replaceAll("--> statement-breakpoint", ";"));
      const empty = await generateSQLiteDrizzleJson({});
      const current = await generateSQLiteDrizzleJson(schema, empty.id);
      for (const statement of await generateSQLiteMigration(empty, current)) declared.exec(statement);
      expect(structure(migrated)).toEqual(structure(declared));
      expect(migrated.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally { migrated.close(); declared.close(); }
  });
});
