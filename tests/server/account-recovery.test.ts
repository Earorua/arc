// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { env } from "cloudflare:workers";
import { handleOAuthUserInfo } from "better-auth/oauth2";
import { makeAuth, ORIGIN } from "../helpers/auth-migration-fixture";
import { createResearchD1, seedUser, SqliteD1 } from "../helpers/sqlite-d1";
import { applyAccountRecovery, inspectAccountRecovery, type RecoveryIdentity } from "../../app/server/account-recovery/service";
import { rejectRetiredSession, isRetiredAccount } from "../../app/server/account-recovery/session-guard";

const identity: RecoveryIdentity = {
  operationId: "recovery-test", sourceUserId: "retired", targetUserId: "primary",
  sourceAccountId: "github-row", targetAccountId: "google-row",
  sourceProvider: "github", targetProvider: "google", primaryPathId: "path-primary",
};
const databases: SqliteD1[] = [];
afterEach(() => { databases.splice(0).forEach((db) => db.close()); });
function fixture() {
  const db = createResearchD1(); databases.push(db);
  seedUser(db, "retired"); seedUser(db, "primary");
  db.database.exec(`
    INSERT INTO accounts (id,account_id,provider_id,user_id,access_token) VALUES
      ('github-row','github-identity','github','retired','encrypted-original'),
      ('google-row','google-identity','google','primary','encrypted-primary');
    INSERT INTO sessions (id,expires_at,token,user_id) VALUES
      ('old-session',2000000000000,'old-session-token','retired'),
      ('primary-session',2000000000000,'primary-session-token','primary');
    INSERT INTO career_goals (id,user_id,role_id,level,weekly_minutes,target_weeks,status,active_slot) VALUES
      ('old-goal','retired','ai-native-full-stack-engineer','beginner',420,18,'active',1),
      ('main-goal','primary','ai-native-full-stack-engineer','beginner',420,18,'active',1);
    INSERT INTO learning_tasks (id,user_id,goal_id,unit_id,title,deliverable,status,sort_order) VALUES
      ('old-task','retired','old-goal','unit-1','Saved task','Saved work','completed',0);
    INSERT INTO availability_versions (id,user_id,goal_id,schema_version,input_fingerprint,weekly_minutes,payload_json)
      VALUES ('availability','primary','main-goal','v1','fingerprint',420,'{"saved":"availability"}');
    INSERT INTO skill_audit_versions (id,user_id,goal_id,schema_version,blueprint_id,blueprint_version,input_fingerprint,payload_json)
      VALUES ('audit','primary','main-goal','v1','blueprint','v1','fingerprint','{"saved":"audit"}');
    INSERT INTO learning_path_versions (id,user_id,goal_id,schema_version,blueprint_id,blueprint_version,registry_id,registry_version,audit_version_id,availability_version_id,scope_mode,input_fingerprint,payload_json)
      VALUES ('path-primary','primary','main-goal','v1','blueprint','v1','registry','v1','audit','availability','complete','fingerprint','{"saved":"18-week path"}');
    INSERT INTO planning_workspaces (id,user_id,goal_id,active_path_version_id) VALUES ('workspace','primary','main-goal','path-primary');
    INSERT INTO account_link_intents (id,token_hash,user_id,source_provider,target_provider,status,expires_at)
      VALUES ('pending-link','hashed-link','retired','github','google','verified',2000000000000);
    INSERT INTO research_runs (id,user_id,request_id,mutation_id,raw_role,normalized_role_key,locale,input_fingerprint,config_fingerprint,state)
      VALUES ('retired-run','retired','saved-request','saved-mutation','Saved role','saved-role','en-US','saved-input','saved-config','failed');
  `);
  return db;
}
const rows = (db: SqliteD1, table: string) => db.database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
const learning = (db: SqliteD1) => db.database.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
  .map((row) => String(row.name))
  .filter((name) => !["accounts", "sessions", "account_link_intents", "account_recoveries"].includes(name))
  .map((name) => ({ table: name, rows: rows(db, name) }));

describe("bounded account recovery", () => {
  it("rejects a stale callback through the installed adapter and production session hook", async () => {
    const db = fixture();
    const descriptor = Object.getOwnPropertyDescriptor(env, "DB");
    Object.defineProperty(env, "DB", { configurable: true, writable: true, value: db });
    try {
      const context = await makeAuth(db).$context;
      const find = context.internalAdapter.findOAuthUser;
      let resume!: () => void; let signalRead!: () => void;
      const gate = new Promise<void>((resolve) => { resume = resolve; });
      const read = new Promise<void>((resolve) => { signalRead = resolve; });
      context.internalAdapter.findOAuthUser = async (...args) => {
        const found = await find(...args);
        signalRead(); await gate;
        return found;
      };
      const endpoint = { context, headers: new Headers(), request: new Request(ORIGIN) } as Parameters<typeof handleOAuthUserInfo>[0];
      const flow = handleOAuthUserInfo(endpoint, {
        userInfo: { id: "github-identity", name: "Retired learner", email: "retired@example.test", emailVerified: false },
        account: { accountId: "github-identity", providerId: "github" },
        callbackURL: `${ORIGIN}/today`, disableSignUp: true,
      });
      await read;
      await applyAccountRecovery(db as unknown as D1Database, identity, 1000);
      resume();
      await expect(flow).rejects.toThrow("Please sign in again");
      expect(rows(db, "sessions").map((row) => row.id)).toEqual(["primary-session"]);
      expect(rows(db, "accounts").map((row) => row.user_id)).toEqual(["primary", "primary"]);
    } finally {
      if (descriptor) Object.defineProperty(env, "DB", descriptor);
      else Reflect.deleteProperty(env, "DB");
    }
  });
  it("adds migration 0012 to populated Research history without changing existing rows or triggers", () => {
    const db = new SqliteD1(); databases.push(db);
    db.database.exec("PRAGMA foreign_keys = ON");
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
    for (const entry of journal.entries.slice(0, 12)) {
      db.database.exec(readFileSync(resolve("drizzle", `${entry.tag}.sql`), "utf8").replaceAll("--> statement-breakpoint", ";"));
    }
    seedUser(db, "retired");
    db.database.exec(`INSERT INTO research_runs (id,user_id,request_id,mutation_id,raw_role,normalized_role_key,locale,input_fingerprint,config_fingerprint,state)
      VALUES ('saved-run','retired','saved-request','saved-mutation','Saved role','saved-role','en-US','saved-input','saved-config','failed')`);
    const before = learning(db);
    const triggers = db.database.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' ORDER BY name").all();
    db.database.exec(readFileSync("drizzle/0012_account_recovery.sql", "utf8").replaceAll("--> statement-breakpoint", ";"));
    expect(learning(db)).toEqual(before);
    expect(db.database.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' ORDER BY name").all()).toEqual(triggers);
    expect(rows(db, "account_recoveries")).toEqual([]);
    expect(db.database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
  it("blocks the installed Better Auth callback when its identity read straddles recovery", async () => {
    const db = fixture();
    const oauthPath = pathToFileURL(resolve("node_modules/better-auth/dist/oauth2/link-account.mjs")).href;
    const hooksPath = pathToFileURL(resolve("node_modules/better-auth/dist/db/with-hooks.mjs")).href;
    const { handleOAuthUserInfo } = await import(/* @vite-ignore */ oauthPath);
    const { getWithHooks } = await import(/* @vite-ignore */ hooksPath);
    let resume!: () => void; let signalRead!: () => void;
    const gate = new Promise<void>((resolve) => { resume = resolve; });
    const read = new Promise<void>((resolve) => { signalRead = resolve; });
    const hooks = getWithHooks({ create: async ({ data }: { data: { id: string; userId: string } }) => {
      db.database.prepare("INSERT INTO sessions (id,expires_at,token,user_id) VALUES (?,2000000000000,'race-token',?)").run(data.id, data.userId);
      return data;
    } }, { hooks: [{ source: "recovery-test", hooks: { session: { create: { after: (session: { id: string; userId: string }) => rejectRetiredSession(db as unknown as D1Database, session) } } } }] });
    const flow = handleOAuthUserInfo({ context: { options: { account: { updateAccountOnSignIn: false } }, internalAdapter: {
      findOAuthUser: async () => {
        const account = db.database.prepare("SELECT * FROM accounts WHERE id = 'github-row'").get()!;
        const user = db.database.prepare("SELECT * FROM users WHERE id = ?").get(account.user_id as string)!;
        signalRead(); await gate;
        return { user: { id: user.id, email: user.email, emailVerified: false }, linkedAccount: { id: account.id, userId: account.user_id, providerId: "github", accountId: "github-identity" }, accounts: [] };
      },
      createSession: (userId: string) => hooks.createWithHooks({ id: "racing-session", userId }, "session"),
    } } }, { userInfo: { id: "github-identity", email: "retired@example.test", emailVerified: false }, account: { accountId: "github-identity", providerId: "github" } });
    await read;
    await applyAccountRecovery(db as unknown as D1Database, identity, 1000);
    resume();
    await expect(flow).rejects.toThrow("Please sign in again");
    expect(rows(db, "sessions").map((row) => row.id)).toEqual(["primary-session"]);
  });
  it("rejects and removes a retired session created by a callback racing recovery", async () => {
    const db = fixture();
    await applyAccountRecovery(db as unknown as D1Database, identity, 1000);
    db.database.exec("INSERT INTO sessions (id,expires_at,token,user_id) VALUES ('racing-session',2000000000000,'racing-token','retired')");
    await expect(rejectRetiredSession(db as unknown as D1Database, { id: "racing-session", userId: "retired" })).rejects.toThrow();
    expect(rows(db, "sessions").map((row) => row.id)).toEqual(["primary-session"]);
    // Better Auth may invoke a failing after-hook twice; both invocations must deny it.
    await expect(rejectRetiredSession(db as unknown as D1Database, { id: "racing-session", userId: "retired" })).rejects.toThrow();
    expect(await isRetiredAccount(db as unknown as D1Database, "retired")).toBe(true);
    expect(await isRetiredAccount(db as unknown as D1Database, "primary")).toBe(false);
    await expect(rejectRetiredSession(db as unknown as D1Database, { id: "primary-session", userId: "primary" })).resolves.toBeUndefined();
  });
  it("inspects without changing identities or learning data", async () => {
    const db = fixture();
    const before = db.database.prepare("SELECT total_changes() AS n").get();
    expect(await inspectAccountRecovery(db as unknown as D1Database, identity)).toMatchObject({ status: "ready", primaryPathId: "path-primary", archivedGoalCount: 1 });
    expect(db.database.prepare("SELECT total_changes() AS n").get()).toEqual(before);
  });
  it("joins both sign-ins, preserves every learning row, invalidates old sessions and is idempotent", async () => {
    const db = fixture(); const before = learning(db);
    expect(await applyAccountRecovery(db as unknown as D1Database, identity, 1000)).toMatchObject({ status: "completed" });
    expect(rows(db, "accounts").map((row) => row.user_id)).toEqual(["primary", "primary"]);
    expect(rows(db, "accounts")[0].access_token).toBe("encrypted-original");
    expect(learning(db)).toEqual(before);
    expect(rows(db, "sessions").map((row) => row.id)).toEqual(["primary-session"]);
    expect(rows(db, "account_link_intents")[0].status).toBe("failed");
    expect(rows(db, "account_recoveries")).toHaveLength(1);
    const audit = rows(db, "account_recoveries");
    await applyAccountRecovery(db as unknown as D1Database, identity, 2000);
    expect(rows(db, "account_recoveries")).toEqual(audit);
    expect(learning(db)).toEqual(before);
  });
  it.each(["sourceAccountId", "targetAccountId", "primaryPathId", "operationId"] as const)("rejects a mismatched %s without changing either account", async (field) => {
    const db = fixture();
    if (field === "operationId") await applyAccountRecovery(db as unknown as D1Database, identity, 1000);
    const before = [rows(db, "accounts"), rows(db, "sessions"), learning(db), rows(db, "account_recoveries")];
    await expect(applyAccountRecovery(db as unknown as D1Database, { ...identity, [field]: "wrong" }, 2000)).rejects.toThrow("preconditions");
    expect([rows(db, "accounts"), rows(db, "sessions"), learning(db), rows(db, "account_recoveries")]).toEqual(before);
  });
  it("refuses unexpected additional sign-in identities", async () => {
    const db = fixture();
    db.database.exec("INSERT INTO accounts (id,account_id,provider_id,user_id) VALUES ('extra','extra-identity','google','retired')");
    const before = rows(db, "accounts");
    await expect(applyAccountRecovery(db as unknown as D1Database, identity, 1000)).rejects.toThrow("preconditions");
    expect(rows(db, "accounts")).toEqual(before);
    expect(rows(db, "account_recoveries")).toHaveLength(0);
  });
  it.each(["retired", "primary"])("waits for a reserved account-link insertion owned by %s", async (owner) => {
    const db = fixture();
    db.database.prepare("UPDATE account_link_intents SET user_id = ?, status = 'completing'").run(owner);
    await expect(applyAccountRecovery(db as unknown as D1Database, identity, 1000)).rejects.toThrow("preconditions");
    expect(rows(db, "accounts").map((row) => row.user_id)).toEqual(["retired", "primary"]);
    expect(rows(db, "account_recoveries")).toHaveLength(0);
  });
  it("rechecks account-link reservations inside the atomic batch", async () => {
    const db = fixture();
    const batch = db.batch.bind(db);
    db.batch = async (statements) => {
      db.database.exec("UPDATE account_link_intents SET status = 'completing'");
      return batch(statements);
    };
    await expect(applyAccountRecovery(db as unknown as D1Database, identity, 1000)).rejects.toThrow("preconditions");
    expect(rows(db, "accounts").map((row) => row.user_id)).toEqual(["retired", "primary"]);
    expect(rows(db, "account_recoveries")).toHaveLength(0);
    expect(rows(db, "account_link_intents")[0].status).toBe("completing");
  });
  it.each([0, 1, 2, 3])("rolls back every mutation if batch statement %s fails", async (index) => {
    const db = fixture(); const before = [rows(db, "accounts"), rows(db, "sessions"), rows(db, "account_link_intents"), learning(db)];
    db.failAtBatchStatement = index;
    await expect(applyAccountRecovery(db as unknown as D1Database, identity, 1000)).rejects.toThrow();
    expect(rows(db, "account_recoveries")).toHaveLength(0);
    expect([rows(db, "accounts"), rows(db, "sessions"), rows(db, "account_link_intents"), learning(db)]).toEqual(before);
  });
});
