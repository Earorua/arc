import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

// This module deliberately has no CLI or operational entrypoint. Its only input
// is an already-created native, main-only in-memory synthetic fixture.
const migrations = Object.freeze([
  "0000_beta_foundation.sql", "0001_secure_account_linking.sql",
  "0002_product_intelligence.sql", "0003_adaptive_planning.sql",
  "0004_proof_backed_stack.sql", "0005_openrouter_research_beta.sql",
  "0006_research_health_indexes.sql",
]);
const authTables = ["users", "accounts", "sessions", "verifications", "account_link_intents"];
const socialProviders = new Set(["google", "github"]);
const activeStatuses = new Set(["pending_reauth", "verified", "consumed", "completing"]);
const statuses = new Set([...activeStatuses, "completed", "failed", "expired"]);
const tokenFields = ["access_token", "refresh_token", "id_token", "access_token_expires_at", "refresh_token_expires_at", "scope"];
const schemaSql = "SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name,tbl_name,sql";

class RehearsalError extends Error {
  constructor(category) { super(`AUTH_REHEARSAL_${category}`); }
}
function reject(category) { throw new RehearsalError(category); }
function validTime(value) { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function nonempty(value) { return typeof value === "string" && value.trim().length > 0; }
function eligible(account) { return socialProviders.has(account.provider_id) && account.password === null; }
function schema(db) { return db.prepare(schemaSql).all(); }

function referenceSchema() {
  const reference = new DatabaseSync(":memory:");
  try {
    for (const file of migrations) {
      const sql = readFileSync(new URL(`../../drizzle/${file}`, import.meta.url), "utf8");
      reference.exec(sql.replaceAll("--> statement-breakpoint", ";"));
    }
    const expected = schema(reference);
    const tables = expected.filter((row) => row.type === "table").map((row) => row.name);
    const timestamps = Object.fromEntries(authTables.map((table) => [table,
      reference.prepare(`PRAGMA table_info("${table}")`).all()
        .filter((column) => column.name.endsWith("_at"))
        .map((column) => ({ name: column.name, nullable: column.notnull === 0 })),
    ]));
    return { expected, tables, timestamps };
  } finally { reference.close(); }
}

function checkDatabase(db) {
  if (!(db instanceof DatabaseSync) || Object.getPrototypeOf(db) !== DatabaseSync.prototype) reject("DATABASE");
  // Invoke the intrinsic method to check the native brand rather than trusting
  // a forged prototype or a delegating wrapper's own methods.
  DatabaseSync.prototype.prepare.call(db, "SELECT 1");
  const metadata = db.prepare("PRAGMA database_list").all();
  // integrity_check creates SQLite's empty temp bookkeeping schema. It cannot
  // contain fixture objects; all user data must still belong to main.
  if (metadata.length < 1 || metadata.length > 2 || metadata[0].name !== "main" || metadata[0].file !== ""
    || metadata.slice(1).some((row) => row.name !== "temp" || row.file !== "")) reject("DATABASE");
  // An ordinary unnamed temporary DB also reports an empty main path but uses
  // the delete journal profile. Read the supported memory profile; never change
  // it. This guards accidental fixture inputs, not adversarial reconfiguration.
  if (db.prepare("PRAGMA main.journal_mode").get()?.journal_mode !== "memory") reject("DATABASE");
  if (db.prepare("SELECT count(*) AS count FROM temp.sqlite_schema").get()?.count !== 0) reject("DATABASE");
}
function checkIntegrity(db) {
  if (db.prepare("PRAGMA foreign_keys").get()?.foreign_keys !== 1 || db.prepare("PRAGMA foreign_key_check").all().length !== 0) reject("FOREIGN_KEYS");
  const integrity = db.prepare("PRAGMA integrity_check").all();
  if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") reject("INTEGRITY");
}
function snapshot(db, tables) {
  return Object.fromEntries(tables.map((table) => {
    // Table identifiers come only from the fixed trusted reference schema.
    const rows = db.prepare(`SELECT * FROM "${table}" ORDER BY rowid LIMIT 1001`).all();
    if (rows.length > 1000) reject("LIMIT");
    return [table, rows.map((row) => ({ ...row }))];
  }));
}
function unique(rows, columns) {
  const seen = new Set();
  for (const row of rows) {
    const key = JSON.stringify(columns.map((column) => row[column]));
    if (seen.has(key)) reject("VALIDATION");
    seen.add(key);
  }
}
function validateAuth(rows, timestamps, nowMs) {
  const required = {
    users: ["id", "email"], accounts: ["id", "account_id", "provider_id", "user_id"],
    sessions: ["id", "token", "user_id"], verifications: ["id", "identifier", "value"],
    account_link_intents: ["id", "token_hash", "user_id", "source_provider", "target_provider"],
  };
  for (const table of authTables) {
    unique(rows[table], ["id"]);
    for (const row of rows[table]) {
      if (required[table].some((column) => !nonempty(row[column]))) reject("VALIDATION");
      for (const { name, nullable } of timestamps[table]) {
        if (nullable && row[name] === null) continue;
        if (!validTime(row[name])) reject("VALIDATION");
      }
    }
  }
  unique(rows.users, ["email"]); unique(rows.accounts, ["provider_id", "account_id"]);
  unique(rows.sessions, ["token"]); unique(rows.account_link_intents, ["token_hash"]);
  for (const row of rows.account_link_intents) {
    if (!statuses.has(row.status) || !socialProviders.has(row.source_provider) || !socialProviders.has(row.target_provider)) reject("VALIDATION");
    if (row.failure_code !== null && (typeof row.failure_code !== "string" || !/^[A-Z][A-Z0-9_]{0,63}$/.test(row.failure_code))) reject("VALIDATION");
    if (activeStatuses.has(row.status) && row.updated_at > nowMs) reject("VALIDATION");
  }
}
function expectedCleanup(before, nowMs) {
  const expected = structuredClone(before);
  const counts = {
    kind: "synthetic-only", sessionsRemoved: before.sessions.length,
    verificationsRemoved: before.verifications.length, socialAccountsCleared: 0,
    intentsFailed: 0, unknownProviderAccounts: 0, passwordBearingAccounts: 0,
  };
  expected.sessions = []; expected.verifications = [];
  for (const row of expected.accounts) {
    if (!socialProviders.has(row.provider_id)) counts.unknownProviderAccounts++;
    if (row.password !== null) counts.passwordBearingAccounts++;
    if (eligible(row)) {
      if (tokenFields.some((field) => row[field] !== null)) counts.socialAccountsCleared++;
      for (const field of tokenFields) row[field] = null;
    }
  }
  for (const row of expected.account_link_intents) if (activeStatuses.has(row.status)) {
    row.status = "failed"; row.failure_code = "AUTH_MIGRATION_RESET"; row.updated_at = nowMs; counts.intentsFailed++;
  }
  return { expected, counts };
}

/** Rehearse auth invalidation against a bounded synthetic in-memory fixture. */
export function rehearseAuthCleanup(db, nowMs) {
  let begun = false;
  let category = "DATABASE";
  try {
    checkDatabase(db);
    category = "TIME";
    if (!validTime(nowMs)) reject("TIME");
    category = "TRANSACTION";
    db.exec("BEGIN IMMEDIATE");
    begun = true;
    category = "SCHEMA";
    const reference = referenceSchema();
    if (!isDeepStrictEqual(schema(db), reference.expected)) reject("SCHEMA");
    category = "INTEGRITY";
    checkIntegrity(db);
    category = "VALIDATION";
    const before = snapshot(db, reference.tables);
    validateAuth(before, reference.timestamps, nowMs);
    const { expected, counts } = expectedCleanup(before, nowMs);
    category = "WRITE";
    db.prepare("DELETE FROM sessions").run();
    db.prepare("DELETE FROM verifications").run();
    db.prepare("UPDATE accounts SET access_token=NULL,refresh_token=NULL,id_token=NULL,access_token_expires_at=NULL,refresh_token_expires_at=NULL,scope=NULL WHERE provider_id IN ('google','github') AND password IS NULL AND (access_token IS NOT NULL OR refresh_token IS NOT NULL OR id_token IS NOT NULL OR access_token_expires_at IS NOT NULL OR refresh_token_expires_at IS NOT NULL OR scope IS NOT NULL)").run();
    db.prepare("UPDATE account_link_intents SET status='failed',failure_code='AUTH_MIGRATION_RESET',updated_at=? WHERE status IN ('pending_reauth','verified','consumed','completing')").run(nowMs);
    category = "INVARIANT";
    checkDatabase(db);
    if (!isDeepStrictEqual(schema(db), reference.expected)) reject("INVARIANT");
    checkIntegrity(db);
    if (!isDeepStrictEqual(snapshot(db, reference.tables), expected)) reject("INVARIANT");
    category = "TRANSACTION";
    db.exec("COMMIT");
    begun = false;
    return Object.freeze(counts);
  } catch (error) {
    if (begun) {
      try { db.exec("ROLLBACK"); } catch { reject("TRANSACTION"); }
    }
    // Never propagate driver messages, causes, row values, or injected errors.
    if (error instanceof RehearsalError) throw error;
    reject(category);
  }
}
