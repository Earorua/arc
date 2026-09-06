import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Miniflare } from "miniflare";

import { LEGACY_OBJECTS, LEGACY_ROWS, LEGACY_TABLES, MIGRATIONS, RESTORE_ORDER } from "./legacy-fixture.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const normalizeSql = (value) => value.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export const canonicalHash = (value) => sha256(JSON.stringify(stable(value)));

function quoteIdentifier(value) {
  if (!/^[a-z][a-z0-9_]*$/u.test(value)) throw new Error("Unsafe retained fixture identifier");
  return `"${value}"`;
}

export async function all(db, sql, ...bindings) {
  return (await db.prepare(sql).bind(...bindings).all()).results;
}

export async function loadRetainedMigrations() {
  const loaded = [];
  for (const [filename, expectedHash] of MIGRATIONS) {
    const sql = normalizeSql(await readFile(resolve(root, "drizzle", filename), "utf8"));
    const actualHash = sha256(sql);
    if (actualHash !== expectedHash) throw new Error(`Migration hash mismatch: ${filename}`);
    loaded.push({ filename, sha256: actualHash,
      statements: sql.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean) });
  }
  return loaded;
}

export async function applyMigrations(db, migrations, start = 0, end = migrations.length) {
  for (const migration of migrations.slice(start, end)) {
    for (const statement of migration.statements) await db.prepare(statement).run();
  }
}

export async function seedLegacy(db, bucket) {
  for (const table of RESTORE_ORDER) {
    for (const row of LEGACY_ROWS[table]) {
      const columns = Object.keys(row);
      const sql = `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(",")}) VALUES (${columns.map(() => "?").join(",")})`;
      await db.prepare(sql).bind(...columns.map((column) => row[column])).run();
    }
  }
  for (const object of LEGACY_OBJECTS) {
    await bucket.put(object.key, object.bytes, {
      httpMetadata: object.httpMetadata,
      customMetadata: object.customMetadata,
    });
  }
}

export async function tableNames(db) {
  return (await all(db, "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"))
    .map(({ name }) => name);
}

export async function snapshotRows(db, tables) {
  const selectedTables = tables ?? await tableNames(db);
  const result = {};
  for (const table of [...selectedTables].sort()) {
    const columns = await all(db, `PRAGMA table_info(${quoteIdentifier(table)})`);
    const primary = columns.filter(({ pk }) => pk).sort((left, right) => left.pk - right.pk);
    const ordering = (primary.length ? primary : columns).map(({ name }) => quoteIdentifier(name)).join(",");
    result[table] = await all(db, `SELECT * FROM ${quoteIdentifier(table)} ORDER BY ${ordering}`);
  }
  return result;
}

export async function snapshotLegacyFixtureRows(db) {
  const result = {};
  for (const table of [...LEGACY_TABLES].sort()) {
    const columns = await all(db, `PRAGMA table_info(${quoteIdentifier(table)})`);
    const primary = columns.filter(({ pk }) => pk).sort((left, right) => left.pk - right.pk);
    if (primary.length === 0) throw new Error(`Legacy fixture table has no primary key: ${table}`);
    result[table] = [];
    for (const expected of LEGACY_ROWS[table]) {
      const where = primary.map(({ name }, index) => `${quoteIdentifier(name)}=?${index + 1}`).join(" AND ");
      const row = await db.prepare(`SELECT * FROM ${quoteIdentifier(table)} WHERE ${where} LIMIT 1`)
        .bind(...primary.map(({ name }) => expected[name])).first();
      if (!row) throw new Error(`Legacy fixture identity is missing: ${table}`);
      result[table].push(row);
    }
  }
  return result;
}

async function bucketKeys(bucket) {
  const keys = [];
  let cursor;
  do {
    const page = await bucket.list(cursor ? { cursor } : undefined);
    keys.push(...page.objects.map(({ key }) => key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys.sort();
}

export async function snapshotObjects(bucket, requestedKeys) {
  const keys = requestedKeys ?? await bucketKeys(bucket);
  const result = [];
  for (const key of [...keys].sort()) {
    const object = await bucket.get(key);
    if (!object) throw new Error("Retained fixture object is missing");
    const bytes = new Uint8Array(await object.arrayBuffer());
    result.push({ key, size: bytes.byteLength, sha256: sha256(bytes),
      httpMetadata: object.httpMetadata ?? {}, customMetadata: object.customMetadata ?? {} });
  }
  return result;
}

export async function databaseHealth(db) {
  const foreignKeyViolationCount = (await all(db, "PRAGMA foreign_key_check")).length;
  const quickCheck = (await all(db, "PRAGMA quick_check"))[0]?.quick_check;
  assert.equal(foreignKeyViolationCount, 0);
  assert.equal(quickCheck, "ok");
  return { foreignKeyViolationCount, quickCheck };
}

export function legacyRowCount() {
  return Object.values(LEGACY_ROWS).reduce((sum, rows) => sum + rows.length, 0);
}

export function createRetainedRuntime(databaseNames, bucketNames, outboundAudit) {
  return new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('Retained compatibility is local only'); } };",
    compatibilityDate: "2026-05-22",
    d1Databases: databaseNames,
    d1Persist: false,
    r2Buckets: bucketNames,
    r2Persist: false,
    outboundService: () => {
      if (outboundAudit) outboundAudit.attempts++;
      return new Response("Outbound denied by retained compatibility harness", { status: 403 });
    },
  });
}

export { LEGACY_OBJECTS, LEGACY_ROWS, LEGACY_TABLES };
