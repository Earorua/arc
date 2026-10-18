import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Miniflare } from "miniflare";

import { LEGACY_OBJECTS, LEGACY_ROWS, LEGACY_TABLES, MIGRATIONS, RESTORE_ORDER } from "./legacy-fixture.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const ADDED_LEGACY_INDEXES = new Set([
  "career_goals_user_id_idx", "proof_assets_owner_proof_id_idx", "proof_items_owner_goal_id_idx",
]);

const normalizeSql = (value) => value.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

const canonicalHash = (value) => sha256(JSON.stringify(stableValue(value)));

function quoteIdentifier(value) {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new Error(`Unsafe fixture identifier: ${value}`);
  return `"${value}"`;
}

const splitMigration = (sql) => sql.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean);

async function loadAndValidateMigrations(overrides = {}) {
  const loaded = [];
  for (const [filename, expectedHash] of MIGRATIONS) {
    const diskSql = await readFile(resolve(root, "drizzle", filename), "utf8");
    const sql = normalizeSql(overrides[filename] ?? diskSql);
    const actualHash = sha256(sql);
    if (actualHash !== expectedHash) throw new Error(`Migration hash mismatch: ${filename}`);
    loaded.push({ filename, actualHash, sql, statements: splitMigration(sql) });
  }
  return loaded;
}

async function executeStatements(db, statements) {
  for (const statement of statements) await db.prepare(statement).run();
}

async function applyMigrations(db, migrations, start, end = migrations.length) {
  for (const migration of migrations.slice(start, end)) await executeStatements(db, migration.statements);
}

async function all(db, sql, ...bindings) {
  return (await db.prepare(sql).bind(...bindings).all()).results;
}

async function userTableNames(db) {
  return (await all(db, "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"))
    .map(({ name }) => name);
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

async function targetState(db, bucket) {
  return { tables: (await userTableNames(db)).length, objects: (await bucketKeys(bucket)).length };
}

async function stableIndexes(db, table) {
  const indexes = await all(db, `PRAGMA index_list(${quoteIdentifier(table)})`);
  const result = [];
  for (const index of indexes) {
    const columns = await all(db, `PRAGMA index_info(${quoteIdentifier(index.name)})`);
    const schema = await all(db, "SELECT sql FROM sqlite_schema WHERE type='index' AND name=?", index.name);
    result.push({
      name: index.name,
      unique: index.unique,
      origin: index.origin,
      partial: index.partial,
      columns: columns.sort((a, b) => a.seqno - b.seqno).map(({ name }) => name),
      sql: schema[0]?.sql ?? null,
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

async function snapshotDatabase(db, requestedTables) {
  const names = requestedTables ?? await userTableNames(db);
  const tables = [];
  for (const name of [...names].sort()) {
    const schema = await all(db, "SELECT sql FROM sqlite_schema WHERE type='table' AND name=?", name);
    if (schema.length !== 1) throw new Error(`Missing snapshot table: ${name}`);
    const columns = await all(db, `PRAGMA table_info(${quoteIdentifier(name)})`);
    const foreignKeys = (await all(db, `PRAGMA foreign_key_list(${quoteIdentifier(name)})`))
      .map(({ id, seq, table, from, to, on_update, on_delete, match }) => ({ id, seq, table, from, to, on_update, on_delete, match }))
      .sort((a, b) => a.id - b.id || a.seq - b.seq);
    const primaryKey = columns.filter(({ pk }) => pk).sort((a, b) => a.pk - b.pk).map(({ name: column }) => column);
    const orderBy = (primaryKey.length ? primaryKey : columns.map(({ name: column }) => column)).map(quoteIdentifier).join(",");
    const rows = await all(db, `SELECT * FROM ${quoteIdentifier(name)} ORDER BY ${orderBy}`);
    tables.push({
      name,
      createSql: schema[0].sql,
      columns: columns.map(({ cid, name: column, type, notnull, dflt_value, pk }) => ({ cid, name: column, type, notnull, dflt_value, pk })),
      foreignKeys,
      indexes: await stableIndexes(db, name),
      rows,
    });
  }
  return { tables };
}

async function readBucketObject(bucket, key) {
  const object = await bucket.get(key);
  if (!object) throw new Error(`Missing backup object: ${key}`);
  const bytes = new Uint8Array(await object.arrayBuffer());
  return {
    key,
    bytes: [...bytes],
    size: bytes.byteLength,
    sha256: sha256(bytes),
    httpMetadata: object.httpMetadata ?? {},
    customMetadata: object.customMetadata ?? {},
  };
}

async function snapshotBucket(bucket, keys) {
  const objects = [];
  for (const key of [...keys].sort()) objects.push(await readBucketObject(bucket, key));
  return objects;
}

function validateFixtureSemantics() {
  assert.equal(Object.keys(LEGACY_ROWS).length, 20);
  assert.ok(Object.values(LEGACY_ROWS).every((rows) => rows.length > 0));
  assert.deepEqual(new Set(LEGACY_ROWS.account_link_intents.flatMap((row) => [row.source_provider, row.target_provider])), new Set(["google", "github"]));
  assert.ok(LEGACY_ROWS.accounts.every((row) => row.access_token === null && row.refresh_token === null && row.id_token === null));
  assert.ok(LEGACY_ROWS.learning_events.every((row) => ["completed", "delayed", "skipped", "too_hard", "already_known"].includes(row.kind)));
  assert.ok(LEGACY_ROWS.proof_items.every((row) => ["completion", "commit", "project", "note", "upload"].includes(row.kind)));
  assert.ok(LEGACY_ROWS.migration_runs.every((row) => ["started", "completed", "failed"].includes(row.status)));
  assert.ok(LEGACY_ROWS.quota_ledger.every((row) => ["reserved", "accepted", "rejected", "failed"].includes(row.entry_kind)));
  assert.ok(LEGACY_ROWS.quota_ledger.filter((row) => ["rejected", "failed"].includes(row.entry_kind)).every((row) => row.units === 0));
  const taskIds = new Set(LEGACY_ROWS.learning_tasks.map(({ id }) => id));
  const unitIds = new Set(LEGACY_ROWS.learning_tasks.map(({ unit_id }) => unit_id));
  assert.ok(LEGACY_ROWS.learning_events.every(({ task_id }) => !taskIds.has(task_id)));
  assert.ok(LEGACY_ROWS.learning_events.some(({ task_id }) => !unitIds.has(task_id)));
  assert.ok(LEGACY_ROWS.proof_items.filter(({ source_task_id }) => source_task_id === null).length >= 2);
  assert.equal(LEGACY_ROWS.idempotency_records[0].response_json, "{ \"z\": 1, \"a\": \"quote: \\\"yes\\\"\\nsecond line\", \"nullable\": null }");
  const users = new Set(LEGACY_ROWS.users.map(({ id }) => id));
  const goals = new Map(LEGACY_ROWS.career_goals.map(({ id, user_id }) => [id, user_id]));
  const tasks = new Map(LEGACY_ROWS.learning_tasks.map(({ unit_id, user_id, goal_id }) => [unit_id, { user_id, goal_id }]));
  const proofs = new Map(LEGACY_ROWS.proof_items.map(({ id, user_id, goal_id }) => [id, { user_id, goal_id }]));
  for (const row of LEGACY_ROWS.career_goals) assert.ok(users.has(row.user_id));
  for (const row of LEGACY_ROWS.learning_tasks) assert.equal(goals.get(row.goal_id), row.user_id);
  for (const row of LEGACY_ROWS.learning_events) {
    assert.equal(goals.get(row.goal_id), row.user_id);
    if (tasks.has(row.task_id)) assert.deepEqual(tasks.get(row.task_id), { user_id: row.user_id, goal_id: row.goal_id });
  }
  for (const row of LEGACY_ROWS.proof_items) {
    assert.equal(goals.get(row.goal_id), row.user_id);
    if (row.source_task_id !== null) assert.deepEqual(tasks.get(row.source_task_id), { user_id: row.user_id, goal_id: row.goal_id });
  }
  for (const row of LEGACY_ROWS.proof_assets) assert.equal(proofs.get(row.proof_id)?.user_id, row.user_id);
  for (const row of LEGACY_ROWS.public_proof_shares) assert.equal(proofs.get(row.proof_id)?.user_id, row.user_id);
  assert.equal(LEGACY_OBJECTS.length, 2);
}

function validateBackup(backup) {
  if (!backup || backup.format !== "arc-synthetic-v7.2-logical-backup-v1") throw new Error("Unsupported synthetic backup format");
  const { checksum, ...payload } = backup;
  if (canonicalHash(payload) !== checksum) throw new Error("Synthetic backup checksum mismatch");
  assert.deepEqual(backup.tables.map(({ name }) => name).sort(), LEGACY_TABLES);
  assert.deepEqual(backup.restoreOrder, RESTORE_ORDER);
  for (const table of backup.tables) {
    if (!table.createSql || !table.columns.length || !table.rows.length) throw new Error(`Incomplete backup table: ${table.name}`);
    const primaryKey = table.columns.filter(({ pk }) => pk).sort((a, b) => a.pk - b.pk).map(({ name }) => name);
    const expectedRows = [...LEGACY_ROWS[table.name]].sort((left, right) => {
      for (const key of primaryKey) {
        const order = String(left[key]).localeCompare(String(right[key]));
        if (order) return order;
      }
      return 0;
    });
    if (canonicalHash(table.rows) !== canonicalHash(expectedRows)) throw new Error(`Synthetic fixture content mismatch: ${table.name}`);
  }
  const assets = backup.tables.find(({ name }) => name === "proof_assets").rows;
  const objects = new Map(backup.objects.map((object) => [object.key, object]));
  if (objects.size !== backup.objects.length) throw new Error("Duplicate backup object key");
  for (const asset of assets) {
    const object = objects.get(asset.object_key);
    if (!object) throw new Error(`Missing backup object: ${asset.object_key}`);
    const bytes = Uint8Array.from(object.bytes);
    if (object.size !== bytes.byteLength || object.size !== asset.size_bytes || object.sha256 !== sha256(bytes)) {
      throw new Error(`Backup object integrity mismatch: ${asset.object_key}`);
    }
  }
  if (objects.size !== assets.length) throw new Error("Unreferenced backup object");
}

async function assertDatabaseHealthy(db) {
  assert.equal((await all(db, "PRAGMA foreign_key_check")).length, 0, "foreign key check");
  assert.equal((await all(db, "PRAGMA quick_check"))[0].quick_check, "ok", "integrity check");
}

async function seedLegacy(db, bucket) {
  validateFixtureSemantics();
  for (const table of RESTORE_ORDER) {
    for (const row of LEGACY_ROWS[table]) {
      const columns = Object.keys(row);
      const sql = `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(",")}) VALUES (${columns.map(() => "?").join(",")})`;
      await db.prepare(sql).bind(...columns.map((column) => row[column])).run();
    }
  }
  for (const object of LEGACY_OBJECTS) {
    await bucket.put(object.key, object.bytes, { httpMetadata: object.httpMetadata, customMetadata: object.customMetadata });
  }
}

async function captureBackup(db, bucket) {
  const database = await snapshotDatabase(db, LEGACY_TABLES);
  const keys = database.tables.find(({ name }) => name === "proof_assets").rows.map(({ object_key }) => object_key);
  const payload = {
    format: "arc-synthetic-v7.2-logical-backup-v1",
    trustBoundary: "fixed synthetic fixture; checksum is integrity evidence, not authenticity",
    restoreOrder: [...RESTORE_ORDER],
    tables: database.tables,
    objects: await snapshotBucket(bucket, keys),
  };
  const backup = { ...payload, checksum: canonicalHash(payload) };
  validateBackup(backup);
  return backup;
}

async function restoreBackup(backup, db, bucket) {
  validateBackup(backup);
  const state = await targetState(db, bucket);
  if (state.tables || state.objects) throw new Error("Restore target must have an empty database and bucket");
  await db.prepare("PRAGMA foreign_keys=ON").run();
  for (const table of backup.tables) await db.prepare(table.createSql).run();
  for (const table of backup.tables) {
    for (const index of table.indexes) if (index.sql) await db.prepare(index.sql).run();
  }
  const tables = new Map(backup.tables.map((table) => [table.name, table]));
  for (const name of backup.restoreOrder) {
    const table = tables.get(name);
    const columns = table.columns.map(({ name: column }) => column);
    const sql = `INSERT INTO ${quoteIdentifier(name)} (${columns.map(quoteIdentifier).join(",")}) VALUES (${columns.map(() => "?").join(",")})`;
    for (const row of table.rows) await db.prepare(sql).bind(...columns.map((column) => row[column])).run();
  }
  for (const object of backup.objects) {
    await bucket.put(object.key, Uint8Array.from(object.bytes), { httpMetadata: object.httpMetadata, customMetadata: object.customMetadata });
  }
  await assertDatabaseHealthy(db);
  assert.equal(canonicalHash(await snapshotDatabase(db, LEGACY_TABLES)), canonicalHash({ tables: backup.tables }), "restored database snapshot");
  assert.equal(canonicalHash(await snapshotBucket(bucket, backup.objects.map(({ key }) => key))), canonicalHash(backup.objects), "restored object snapshot");
}

const cloneBackup = (backup) => structuredClone(backup);

function refreshBackupChecksum(backup) {
  const payload = { ...backup };
  delete payload.checksum;
  backup.checksum = canonicalHash(payload);
  return backup;
}

async function targetFingerprint(db, bucket) {
  const names = await userTableNames(db);
  const keys = await bucketKeys(bucket);
  return canonicalHash({ database: names.length ? await snapshotDatabase(db, names) : { tables: [] }, objects: await snapshotBucket(bucket, keys) });
}

async function expectRejectedWithoutWrites(operation, db, bucket, expectedPattern) {
  const before = await targetState(db, bucket);
  const beforeFingerprint = await targetFingerprint(db, bucket);
  let rejected = false;
  try {
    await operation();
  } catch (error) {
    if (!expectedPattern.test(String(error?.message ?? error))) throw error;
    rejected = true;
  }
  const after = await targetState(db, bucket);
  const afterFingerprint = await targetFingerprint(db, bucket);
  assert.equal(rejected, true);
  assert.equal(afterFingerprint, beforeFingerprint, "rejected restore target content");
  return { rejected, before, after };
}

async function tableFingerprint(db, table) {
  return canonicalHash((await snapshotDatabase(db, [table])).tables[0].rows);
}

async function expectRejectedStatement(db, table, statement) {
  const before = await tableFingerprint(db, table);
  let rejected = false;
  try {
    await statement();
  } catch (error) {
    if (!/(constraint|foreign key|unique)/i.test(String(error?.message ?? error))) throw error;
    rejected = true;
  }
  const after = await tableFingerprint(db, table);
  assert.equal(rejected, true);
  assert.equal(after, before, `rejected ${table} statement residue`);
  return { rejected, before, after };
}

async function constraintEvidence(db) {
  const availabilitySql = "INSERT INTO availability_versions (id,user_id,goal_id,schema_version,input_fingerprint,weekly_minutes,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?)";
  const proofSql = "INSERT INTO proof_versions (id,user_id,goal_id,proof_id,version_number,schema_version,daily_unit_id,title,kind,summary,artifact_url,asset_id,skill_ids_json,completion_criteria_json,visibility,supersedes_version_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
  await db.batch([
    db.prepare(availabilitySql).bind("availability-valid", "usr-a", "goal-a-active", "1", "valid-fingerprint", 180, "{}", 1_700_000_001_000),
    db.prepare(proofSql).bind("proof-version-valid", "usr-a", "goal-a-active", "proof-a", 1, "1", null, "Valid synthetic version", "upload", "Synthetic summary", null, "asset-a", "[]", "[]", "private", null, 1_700_000_001_001),
  ]);

  const duplicateActiveGoal = await expectRejectedStatement(db, "career_goals", () => db.prepare("INSERT INTO career_goals (id,user_id,role_id,level,weekly_minutes,target_weeks,status,active_slot,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind("goal-a-duplicate", "usr-a", "duplicate-role", "beginner", 60, 2, "active", 1, 1_700_000_002_000, 1_700_000_002_000).run());
  const duplicateIdempotency = await expectRejectedStatement(db, "idempotency_records", () => db.prepare("INSERT INTO idempotency_records (id,user_id,scope,mutation_id,response_json,created_at) VALUES (?,?,?,?,?,?)")
    .bind("idem-duplicate", "usr-a", "synthetic-complete", "idem-mutation-a", "{}", 1_700_000_002_001).run());
  const missingOwner = await expectRejectedStatement(db, "research_runs", () => db.prepare("INSERT INTO research_runs (id,user_id,request_id,mutation_id,raw_role,normalized_role_key,locale,input_fingerprint,config_fingerprint,state,state_version,retryable,active_slot,active_expires_at,package_id,error_code,public_failure_category,quality_json,candidate_json,retry_of_run_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind("research-missing", "usr-missing", "request-missing", "mutation-missing", "Synthetic role", "synthetic-role", "en-US", "input-fingerprint", "config-fingerprint", "failed", 1, 0, null, null, null, "synthetic-error", "internal", null, null, null, 1_700_000_002_002, 1_700_000_002_002).run());
  const crossOwnerPlanning = await expectRejectedStatement(db, "availability_versions", () => db.prepare(availabilitySql)
    .bind("availability-cross", "usr-b", "goal-a-active", "1", "cross-fingerprint", 60, "{}", 1_700_000_002_003).run());
  const crossOwnerProof = await expectRejectedStatement(db, "proof_versions", () => db.prepare(proofSql)
    .bind("proof-version-cross", "usr-b", "goal-b-active", "proof-a", 1, "1", null, "Cross owner", "upload", "Must reject", null, null, "[]", "[]", "private", null, 1_700_000_002_004).run());

  const before = await tableFingerprint(db, "availability_versions");
  let rejected = false;
  try {
    await db.batch([
      db.prepare(availabilitySql).bind("availability-atomic-valid", "usr-a", "goal-a-active", "1", "atomic-valid", 30, "{}", 1_700_000_002_005),
      db.prepare(availabilitySql).bind("availability-atomic-invalid", "usr-b", "goal-a-active", "1", "atomic-invalid", 30, "{}", 1_700_000_002_006),
    ]);
  } catch (error) {
    if (!/(constraint|foreign key)/i.test(String(error?.message ?? error))) throw error;
    rejected = true;
  }
  const after = await tableFingerprint(db, "availability_versions");
  assert.equal(rejected, true);
  assert.equal(after, before, "atomic D1 batch residue");
  return {
    validOwnerScopedWrite: true,
    duplicateActiveGoal,
    duplicateIdempotency,
    missingOwner,
    crossOwnerPlanning,
    crossOwnerProof,
    atomicBatch: { rejected, before, after },
  };
}

function assertLegacyUpgradePreserved(before, after) {
  for (const oldTable of before.tables) {
    const upgraded = after.tables.find(({ name }) => name === oldTable.name);
    assert.ok(upgraded, `old table remains: ${oldTable.name}`);
    assert.equal(canonicalHash(upgraded.columns), canonicalHash(oldTable.columns), `old columns: ${oldTable.name}`);
    assert.equal(canonicalHash(upgraded.foreignKeys), canonicalHash(oldTable.foreignKeys), `old foreign keys: ${oldTable.name}`);
    assert.equal(canonicalHash(upgraded.rows), canonicalHash(oldTable.rows), `old rows: ${oldTable.name}`);
    const retained = upgraded.indexes.filter(({ name }) => !ADDED_LEGACY_INDEXES.has(name));
    assert.equal(canonicalHash(retained), canonicalHash(oldTable.indexes), `old indexes: ${oldTable.name}`);
  }
  const oldNames = new Set(before.tables.flatMap(({ indexes }) => indexes.map(({ name }) => name)));
  const added = after.tables.flatMap(({ indexes }) => indexes.map(({ name }) => name))
    .filter((name) => ADDED_LEGACY_INDEXES.has(name) && !oldNames.has(name)).sort();
  assert.deepEqual(added, [...ADDED_LEGACY_INDEXES].sort());
}

function createRuntime() {
  return new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('Synthetic offline recovery'); } };",
    compatibilityDate: "2026-05-22",
    d1Databases: ["SOURCE_DB", "RESTORED_DB", "INTERRUPTED_DB", "RECOVERED_DB", "REJECT_EMPTY_DB", "REJECT_NONEMPTY_DB"],
    d1Persist: false,
    r2Buckets: ["SOURCE_BUCKET", "RESTORED_BUCKET", "INTERRUPTED_BUCKET", "RECOVERED_BUCKET", "REJECT_EMPTY_BUCKET", "REJECT_NONEMPTY_BUCKET"],
    r2Persist: false,
    outboundService: () => new Response("Outbound denied by synthetic recovery harness", { status: 403 }),
  });
}

export async function runLegacyRecoveryRehearsal() {
  const migrations = await loadAndValidateMigrations();
  const runtime = createRuntime();
  let result;
  try {
    const sourceDb = await runtime.getD1Database("SOURCE_DB");
    const sourceBucket = await runtime.getR2Bucket("SOURCE_BUCKET");
    await sourceDb.prepare("PRAGMA foreign_keys=ON").run();
    await applyMigrations(sourceDb, migrations, 0, 2);
    await seedLegacy(sourceDb, sourceBucket);
    assert.deepEqual(await userTableNames(sourceDb), LEGACY_TABLES);
    await assertDatabaseHealthy(sourceDb);
    const legacySnapshot = await snapshotDatabase(sourceDb, LEGACY_TABLES);
    assert.ok(legacySnapshot.tables.every(({ rows }) => rows.length > 0));
    const legacyRowCount = legacySnapshot.tables.reduce((sum, { rows }) => sum + rows.length, 0);
    const backup = await captureBackup(sourceDb, sourceBucket);
    const objectKeys = backup.objects.map(({ key }) => key);
    const sourceObjectsBefore = await snapshotBucket(sourceBucket, objectKeys);

    const restoredDb = await runtime.getD1Database("RESTORED_DB");
    const restoredBucket = await runtime.getR2Bucket("RESTORED_BUCKET");
    await restoreBackup(backup, restoredDb, restoredBucket);
    const restoredSnapshot = await snapshotDatabase(restoredDb, LEGACY_TABLES);
    const restoredObjects = await snapshotBucket(restoredBucket, objectKeys);

    const rejectDb = await runtime.getD1Database("REJECT_EMPTY_DB");
    const rejectBucket = await runtime.getR2Bucket("REJECT_EMPTY_BUCKET");
    const changedSql = await expectRejectedWithoutWrites(
      () => loadAndValidateMigrations({ [migrations[0].filename]: `${migrations[0].sql}\n-- synthetic drift` }),
      rejectDb, rejectBucket, /Migration hash mismatch/,
    );
    const tamperedRowBackup = cloneBackup(backup);
    tamperedRowBackup.tables.find(({ name }) => name === "users").rows[0].name = "tampered";
    const tamperedRow = await expectRejectedWithoutWrites(
      () => restoreBackup(tamperedRowBackup, rejectDb, rejectBucket), rejectDb, rejectBucket, /checksum mismatch/,
    );
    const missingRowBackup = cloneBackup(backup);
    missingRowBackup.tables.find(({ name }) => name === "sessions").rows.pop();
    refreshBackupChecksum(missingRowBackup);
    const missingRow = await expectRejectedWithoutWrites(
      () => restoreBackup(missingRowBackup, rejectDb, rejectBucket), rejectDb, rejectBucket, /fixture content mismatch/,
    );
    const missingObjectBackup = cloneBackup(backup);
    missingObjectBackup.objects.pop();
    refreshBackupChecksum(missingObjectBackup);
    const missingObject = await expectRejectedWithoutWrites(
      () => restoreBackup(missingObjectBackup, rejectDb, rejectBucket), rejectDb, rejectBucket, /Missing backup object/,
    );
    const tamperedObjectBackup = cloneBackup(backup);
    tamperedObjectBackup.objects[0].bytes[0] ^= 255;
    refreshBackupChecksum(tamperedObjectBackup);
    const tamperedObject = await expectRejectedWithoutWrites(
      () => restoreBackup(tamperedObjectBackup, rejectDb, rejectBucket), rejectDb, rejectBucket, /object integrity mismatch/,
    );

    const nonemptyDb = await runtime.getD1Database("REJECT_NONEMPTY_DB");
    await nonemptyDb.prepare("CREATE TABLE occupied (id text PRIMARY KEY NOT NULL)").run();
    await nonemptyDb.prepare("INSERT INTO occupied (id) VALUES ('keep-me')").run();
    const nonemptyDatabase = await expectRejectedWithoutWrites(
      () => restoreBackup(backup, nonemptyDb, rejectBucket), nonemptyDb, rejectBucket, /empty database and bucket/,
    );
    const nonemptyBucketBinding = await runtime.getR2Bucket("REJECT_NONEMPTY_BUCKET");
    await nonemptyBucketBinding.put("keep-me", Uint8Array.from([7]), { customMetadata: { keep: "true" } });
    const nonemptyBucket = await expectRejectedWithoutWrites(
      () => restoreBackup(backup, rejectDb, nonemptyBucketBinding), rejectDb, nonemptyBucketBinding, /empty database and bucket/,
    );

    await applyMigrations(sourceDb, migrations, 2);
    await assertDatabaseHealthy(sourceDb);
    const upgradedTableCount = (await userTableNames(sourceDb)).length;
    assert.equal(upgradedTableCount, 41);
    const sourceAfter = await snapshotDatabase(sourceDb);
    assertLegacyUpgradePreserved(legacySnapshot, sourceAfter);
    const sourceObjectsAfter = await snapshotBucket(sourceBucket, objectKeys);
    assert.equal(canonicalHash(sourceObjectsAfter), canonicalHash(sourceObjectsBefore));
    const constraints = await constraintEvidence(sourceDb);
    await assertDatabaseHealthy(sourceDb);
    const sourceAfterConstraints = await snapshotDatabase(sourceDb);
    assertLegacyUpgradePreserved(legacySnapshot, sourceAfterConstraints);

    const interruptedDb = await runtime.getD1Database("INTERRUPTED_DB");
    const interruptedBucket = await runtime.getR2Bucket("INTERRUPTED_BUCKET");
    await restoreBackup(backup, interruptedDb, interruptedBucket);
    await executeStatements(interruptedDb, migrations[2].statements);
    await executeStatements(interruptedDb, migrations[3].statements.slice(0, 2));
    let realSqlError = false;
    try {
      await interruptedDb.prepare("CREATE TABLE synthetic_invalid_interruption (").run();
    } catch (error) {
      if (!/(syntax|incomplete)/i.test(String(error?.message ?? error))) throw error;
      realSqlError = true;
    }
    assert.equal(realSqlError, true);
    const partialTableCount = (await userTableNames(interruptedDb)).length;
    assert.ok(partialTableCount > 20);
    const fabricatedMigrationReceiptCount = (await all(interruptedDb, "SELECT COUNT(*) AS count FROM migration_runs WHERE migration_id LIKE 'schema-%'"))[0].count;
    assert.equal(fabricatedMigrationReceiptCount, 0);

    const recoveredDb = await runtime.getD1Database("RECOVERED_DB");
    const recoveredBucket = await runtime.getR2Bucket("RECOVERED_BUCKET");
    await restoreBackup(backup, recoveredDb, recoveredBucket);
    const recoveredBaseline = await snapshotDatabase(recoveredDb, LEGACY_TABLES);
    const recoveredBaselineObjects = await snapshotBucket(recoveredBucket, objectKeys);
    assert.equal(canonicalHash(recoveredBaseline), canonicalHash({ tables: backup.tables }));
    assert.equal(canonicalHash(recoveredBaselineObjects), canonicalHash(backup.objects));
    await applyMigrations(recoveredDb, migrations, 2);
    await assertDatabaseHealthy(recoveredDb);
    const recoveredAfter = await snapshotDatabase(recoveredDb);
    assert.equal(recoveredAfter.tables.length, 41);
    assertLegacyUpgradePreserved(legacySnapshot, recoveredAfter);
    const recoveredObjectsAfter = await snapshotBucket(recoveredBucket, objectKeys);
    assert.equal(canonicalHash(recoveredObjectsAfter), canonicalHash(sourceObjectsBefore));

    result = {
      legacyTableCount: legacySnapshot.tables.length,
      upgradedTableCount,
      oldRowsPreserved: true,
      restoredRowsPreserved: canonicalHash(restoredSnapshot) === canonicalHash(legacySnapshot),
      objectsPreserved: canonicalHash(restoredObjects) === canonicalHash(sourceObjectsBefore),
      interruptedUpgradeRecovered: true,
      evidence: {
        legacyRowCount,
        nonemptyLegacyTables: legacySnapshot.tables.filter(({ rows }) => rows.length).length,
        objectCount: backup.objects.length,
        backupChecksum: backup.checksum,
        checksumMeaning: "integrity evidence for a trusted synthetic fixture; not authenticity",
        legacySnapshotHash: canonicalHash(legacySnapshot),
        objectSnapshotHash: canonicalHash(sourceObjectsBefore),
        migrationHashes: migrations.map(({ filename, actualHash }) => ({ filename, sha256: actualHash })),
        rejections: { changedSql, tamperedRow, missingRow, missingObject, tamperedObject, nonemptyDatabase, nonemptyBucket },
        constraints,
        interruption: {
          realSqlError,
          partialTableCount,
          fabricatedMigrationReceiptCount,
          recoveredLegacyTableCount: recoveredBaseline.tables.length,
          recoveredUpgradedTableCount: recoveredAfter.tables.length,
          recoveredRowsEqual: canonicalHash(recoveredBaseline) === canonicalHash({ tables: backup.tables }),
          recoveredObjectsEqual: canonicalHash(recoveredObjectsAfter) === canonicalHash(sourceObjectsBefore),
        },
      },
    };
  } finally {
    await runtime.dispose();
  }
  return { ...result, disposed: true };
}
