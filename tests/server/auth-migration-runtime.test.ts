// @vitest-environment node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { StatementSync, type DatabaseSync } from "node:sqlite";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { betterAuth } from "better-auth";
import { handleOAuthUserInfo } from "better-auth/oauth2";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema";
import { buildAuthOptions } from "../../app/server/auth/runtime";
import { createResearchD1 } from "../helpers/sqlite-d1";

const origin = "https://arc.example.test";
const fixtureSecret = "synthetic-c2-auth-secret-for-offline-fixtures-only";
const now = 1_800_000_000_000;
const timestamp = now - 10_000;
const databases: ReturnType<typeof createResearchD1>[] = [];
let cleanup: (database: DatabaseSync, nowMs: number) => unknown;
let deniedFetch: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  const moduleUrl = pathToFileURL(resolve(process.cwd(), "scripts/cloudflare-migration/rehearse-auth-cleanup.mjs"));
  cleanup = (await import(moduleUrl.href)).rehearseAuthCleanup;
});
beforeEach(() => {
  deniedFetch = vi.fn(async () => { throw new Error("SYNTHETIC_AUTH_NETWORK_DENIED"); });
  vi.stubGlobal("fetch", deniedFetch);
});
afterEach(() => {
  try { expect(deniedFetch).not.toHaveBeenCalled(); }
  finally {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    for (const db of databases.splice(0)) db.close();
  }
});

function fixture() {
  const db = createResearchD1();
  databases.push(db);
  return db;
}

describe("synthetic auth migration actual-library characterization", () => {
  it.each(["google", "github"] as const)("retains the %s subject owner after cleanup despite another owner's changed email", async (provider) => {
    const db = fixture();
    const insertUser = db.database.prepare("INSERT INTO users(id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,1,?,?)");
    insertUser.run("owner-a", "A", "old@example.test", timestamp, timestamp);
    insertUser.run("owner-b", "B", "changed@example.test", timestamp, timestamp);
    db.database.prepare(`INSERT INTO accounts(id,account_id,provider_id,user_id,access_token,refresh_token,id_token,
      access_token_expires_at,refresh_token_expires_at,scope,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run("fixture-account-a", "subject-a", provider, "owner-a", "fixture-old-access", "fixture-old-refresh",
        "fixture-old-id", now + 1000, now + 2000, "fixture-old-scope", timestamp, timestamp);
    db.database.prepare("INSERT INTO learner_profiles(id,user_id,state_version,created_at,updated_at) VALUES (?,?,3,?,?)")
      .run("fixture-profile-a", "owner-a", timestamp, timestamp);
    const usersBefore = db.database.prepare("SELECT * FROM users ORDER BY id").all();
    const profileBefore = db.database.prepare("SELECT * FROM learner_profiles").all();

    expect(cleanup(db.database, now)).toMatchObject({ kind: "synthetic-only", socialAccountsCleared: 1 });
    expect(db.database.prepare(`SELECT access_token,refresh_token,id_token,access_token_expires_at,
      refresh_token_expires_at,scope FROM accounts`).get()).toEqual({
      access_token: null, refresh_token: null, id_token: null, access_token_expires_at: null,
      refresh_token_expires_at: null, scope: null,
    });

    const database = drizzle(db as unknown as D1Database, { schema });
    const options = buildAuthOptions({
      ARC_ENVIRONMENT: "production", BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: fixtureSecret,
      GOOGLE_CLIENT_ID: "synthetic-google-client-id", GOOGLE_CLIENT_SECRET: "synthetic-google-client-secret",
      GITHUB_CLIENT_ID: "synthetic-github-client-id", GITHUB_CLIENT_SECRET: "synthetic-github-client-secret",
    }, database);
    const auth = betterAuth({ ...options, secrets: [{ version: 1, value: fixtureSecret }], telemetry: { enabled: false } });
    const context = await auth.$context;
    // The public helper consumes this endpoint-context subset on the existing-account path.
    const endpointContext = { context, headers: new Headers(), request: new Request(origin) } as Parameters<typeof handleOAuthUserInfo>[0];
    const result = await handleOAuthUserInfo(endpointContext, {
      userInfo: { id: "subject-a", name: "A", email: "changed@example.test", emailVerified: true, image: null },
      account: { providerId: provider, accountId: "subject-a", accessToken: "fixture-fresh-access" },
      callbackURL: `${origin}/today`, disableSignUp: true,
    });

    expect(result.error).toBeNull();
    expect(result.isRegister).toBe(false);
    expect(result.data?.user.id).toBe("owner-a");
    expect(result.data?.session.userId).toBe("owner-a");
    expect(db.database.prepare("SELECT user_id FROM sessions").all()).toEqual([{ user_id: "owner-a" }]);
    expect(db.database.prepare("SELECT * FROM users ORDER BY id").all()).toEqual(usersBefore);
    expect(db.database.prepare("SELECT count(*) AS count FROM users").get()?.count).toBe(2);
    expect(db.database.prepare("SELECT * FROM learner_profiles").all()).toEqual(profileBefore);
    const account = db.database.prepare("SELECT * FROM accounts").all();
    expect(account).toHaveLength(1);
    expect(account[0]).toMatchObject({
      id: "fixture-account-a", provider_id: provider, account_id: "subject-a", user_id: "owner-a",
      refresh_token: null, refresh_token_expires_at: null, id_token: null, access_token_expires_at: null, scope: null,
    });
    expect(account[0].access_token).toBeTypeOf("string");
    expect(account[0].access_token).not.toBe("fixture-old-access");
    expect(account[0].access_token).not.toBe("fixture-fresh-access");
  });
});

describe("SQLite D1 raw array support", () => {
  it("preserves column order and duplicate labels", async () => {
    const db = fixture();
    await expect(db.prepare("SELECT 1 AS x, 2 AS x, 3 AS y").raw()).resolves.toEqual([[1, 2, 3]]);
  });
  it("preserves binding and row order", async () => {
    const db = fixture();
    await expect(db.prepare("SELECT ? AS x, ? AS x UNION ALL SELECT ?, ?").bind("fixture-first", 2, null, 4).raw())
      .resolves.toEqual([["fixture-first", 2], [null, 4]]);
  });
  it("fails closed when native ordered arrays are unavailable", async () => {
    const db = fixture();
    const feature = Object.getOwnPropertyDescriptor(StatementSync.prototype, "setReturnArrays");
    expect(feature).toBeDefined();
    // Remove only the native capability; queries still use the real SQLite statement.
    Object.defineProperty(StatementSync.prototype, "setReturnArrays", { ...feature, value: undefined });
    try {
      await expect(db.prepare("SELECT 1 AS x, 2 AS x").raw()).rejects.toThrow(/^SQLITE_RAW_ARRAYS_UNSUPPORTED$/);
    } finally { Object.defineProperty(StatementSync.prototype, "setReturnArrays", feature!); }
  });
  it("retains the existing row byte limit including duplicate columns", async () => {
    const db = fixture();
    await expect(db.prepare("SELECT zeroblob(1000000) AS x, zeroblob(1000000) AS x").raw())
      .resolves.toEqual([[new Uint8Array(1_000_000), new Uint8Array(1_000_000)]]);
    await expect(db.prepare("SELECT zeroblob(1000001) AS x, zeroblob(1000000) AS x").raw())
      .rejects.toThrow(/^D1 row too large$/);
  });
});
