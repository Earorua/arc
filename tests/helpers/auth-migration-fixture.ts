import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeEach, afterEach, expect, vi } from "vitest";
import { env } from "cloudflare:workers";
import { runWithEndpointContext, runWithRequestState } from "@better-auth/core/context";
import { betterAuth } from "better-auth";
import { handleOAuthUserInfo } from "better-auth/oauth2";
import { serializeSignedCookie } from "better-call";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema";
import { createProductionAccountLinkHandlers } from "../../app/server/account-link/http";
import { buildAuthOptions } from "../../app/server/auth/runtime";
import { requireArcUser } from "../../app/server/auth/session";
import { createResearchD1, type SqliteD1 } from "./sqlite-d1";

export const ORIGIN = "https://arc.example.test";
export const NOW = 1_800_000_000_000;
export const THEN = NOW - 10_000;
export const OLD_SECRET = "synthetic-c3-old-secret-offline-fixtures-only";
export const NEW_SECRET = "synthetic-c3-new-secret-offline-fixtures-only";
export type Provider = "google" | "github";

export function fixtureEnvironment(secret = NEW_SECRET) {
  return {
    ARC_ENVIRONMENT: "production",
    BETTER_AUTH_URL: ORIGIN,
    BETTER_AUTH_SECRET: secret,
    GOOGLE_CLIENT_ID: "synthetic-google-id",
    GOOGLE_CLIENT_SECRET: "synthetic-google-secret",
    GITHUB_CLIENT_ID: "synthetic-github-id",
    GITHUB_CLIENT_SECRET: "synthetic-github-secret",
  };
}

export function makeAuth(db: SqliteD1, secret = NEW_SECRET) {
  const database = drizzle(db as unknown as D1Database, { schema });
  return betterAuth({
    ...buildAuthOptions(fixtureEnvironment(secret), database),
    secrets: [{ version: 1, value: secret }],
    telemetry: { enabled: false },
  });
}

export type Fixture = { db: SqliteD1; auth: ReturnType<typeof makeAuth> };
const handlerSequences = new WeakMap<Fixture, number>();
type FixtureTable = "users" | "accounts" | "sessions" | "verifications"
  | "learner_profiles" | "career_goals" | "proof_items" | "proof_assets"
  | "research_runs" | "account_link_intents";

export function rows(f: Fixture, table: FixtureTable) {
  return f.db.database.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
}

export function preservedRows(f: Fixture) {
  return {
    users: rows(f, "users"),
    // Cleanup's exact preservation is covered by C1. Real login refreshes
    // account updated_at and credentials; retain every identity field here.
    accountIdentities: f.db.database.prepare(
      "SELECT id,account_id,provider_id,user_id,password,created_at FROM accounts ORDER BY id",
    ).all(),
    business: {
      learner_profiles: rows(f, "learner_profiles"),
      career_goals: rows(f, "career_goals"),
      proof_items: rows(f, "proof_items"),
      proof_assets: rows(f, "proof_assets"),
      research_runs: rows(f, "research_runs"),
    },
  };
}

export async function cleanupFixture(f: Fixture) {
  const moduleUrl = pathToFileURL(resolve(process.cwd(), "scripts/cloudflare-migration/rehearse-auth-cleanup.mjs"));
  const { rehearseAuthCleanup } = await import(moduleUrl.href);
  return rehearseAuthCleanup(f.db.database, NOW);
}

export function fixtureHarness() {
  const databases: SqliteD1[] = [];
  let dbDescriptor: PropertyDescriptor | undefined;
  let deniedFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dbDescriptor = Object.getOwnPropertyDescriptor(env, "DB");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    deniedFetch = vi.fn(async () => { throw new Error("SYNTHETIC_AUTH_NETWORK_DENIED"); });
    vi.stubGlobal("fetch", deniedFetch);
  });
  afterEach(() => {
    try {
      expect(deniedFetch).not.toHaveBeenCalled();
    } finally {
      if (dbDescriptor) Object.defineProperty(env, "DB", dbDescriptor);
      else Reflect.deleteProperty(env, "DB");
      vi.unstubAllGlobals();
      vi.useRealTimers();
      vi.restoreAllMocks();
      for (const db of databases.splice(0)) db.close();
    }
  });

  async function fixture({ linkedBoth = false } = {}): Promise<Fixture> {
    if (databases.length !== 0) throw new Error("SYNTHETIC_AUTH_ONE_DATABASE_PER_TEST");
    const db = createResearchD1();
    databases.push(db);
    Object.defineProperty(env, "DB", { configurable: true, writable: true, enumerable: true, value: db });

    for (const owner of ["a", "b"] as const) {
      db.database.prepare("INSERT INTO users(id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,1,?,?)")
        .run(`owner-${owner}`, owner, `owner-${owner}@example.test`, THEN, THEN);
      db.database.prepare("INSERT INTO learner_profiles(id,user_id,state_version,created_at,updated_at) VALUES (?,?,3,?,?)")
        .run(`profile-${owner}`, `owner-${owner}`, THEN, THEN);
      db.database.prepare(`INSERT INTO career_goals(id,user_id,role_id,level,weekly_minutes,target_weeks,status,active_slot,created_at,updated_at)
        VALUES (?,?,?,'junior',120,8,'active',1,?,?)`)
        .run(`goal-${owner}`, `owner-${owner}`, "synthetic-role", THEN, THEN);
      db.database.prepare("INSERT INTO proof_items(id,user_id,goal_id,title,kind,created_at,updated_at) VALUES (?,?,?,?,'artifact',?,?)")
        .run(`proof-${owner}`, `owner-${owner}`, `goal-${owner}`, "Synthetic proof", THEN, THEN);
      // Synthetic private metadata only; there is no asset file or public share.
      db.database.prepare(`INSERT INTO proof_assets(id,user_id,proof_id,object_key,filename,content_type,size_bytes,created_at)
        VALUES (?,?,?,?,'file.txt','text/plain',7,?)`)
        .run(`asset-${owner}`, `owner-${owner}`, `proof-${owner}`, `synthetic/owner-${owner}/proof/file.txt`, THEN);
      db.database.prepare(`INSERT INTO research_runs(id,user_id,request_id,mutation_id,raw_role,normalized_role_key,locale,
        input_fingerprint,config_fingerprint,state,created_at,updated_at)
        VALUES (?,?,?,?,'Synthetic role','synthetic-role','en-US','synthetic-input','synthetic-config','failed',?,?)`)
        .run(`research-${owner}`, `owner-${owner}`, `research-request-${owner}`, `research-mutation-${owner}`, THEN, THEN);
    }
    const accounts: Array<readonly [Provider, "a" | "b"]> = [["google", "a"], ["google", "b"]];
    if (linkedBoth) accounts.push(["github", "a"]);
    for (const [provider, owner] of accounts) {
      db.database.prepare(`INSERT INTO accounts(id,account_id,provider_id,user_id,access_token,refresh_token,id_token,
        access_token_expires_at,refresh_token_expires_at,scope,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(`${provider}-${owner}`, `subject-${provider}-${owner}`, provider, `owner-${owner}`,
          "synthetic-old-access", "synthetic-old-refresh", "synthetic-old-id", NOW + 60_000, NOW + 120_000,
          "synthetic-scope", THEN, THEN);
    }

    const auth = makeAuth(db);
    await auth.$context;
    return { db, auth };
  }
  return { fixture };
}

type LoginValues = {
  subject?: string;
  email?: string;
  accessToken?: string;
  refreshToken?: string;
  disableSignUp?: boolean;
};

export async function login(f: Fixture, provider: Provider = "google", owner: "a" | "b" = "a", values: LoginValues = {}) {
  const context = await f.auth.$context;
  // The installed public declarations differ in their plugin-context generics.
  // Both receive this same real context and the endpoint subset used here.
  const endpoint = { context, headers: new Headers(), request: new Request(ORIGIN) } as
    Parameters<typeof handleOAuthUserInfo>[0] & Parameters<typeof runWithEndpointContext>[0];
  const subject = values.subject ?? `subject-${provider}-${owner}`;
  // Use public request/endpoint scopes so Arc's real account-create hooks run.
  // This helper is an identity seam, not a complete provider callback proof.
  return runWithRequestState(new WeakMap(), () => runWithEndpointContext(endpoint, () => handleOAuthUserInfo(endpoint, {
    userInfo: { id: subject, name: owner, email: values.email ?? `owner-${owner}@example.test`, emailVerified: true, image: null },
    account: {
      providerId: provider,
      accountId: subject,
      accessToken: values.accessToken ?? "synthetic-fresh-access",
      refreshToken: values.refreshToken,
    },
    callbackURL: `${ORIGIN}/today`,
    disableSignUp: values.disableSignUp ?? true,
  })));
}

export async function sessionCookie(f: Fixture, token: string, secret = NEW_SECRET) {
  const { authCookies } = await f.auth.$context;
  const cookie = await serializeSignedCookie(authCookies.sessionToken.name, token, secret, authCookies.sessionToken.attributes);
  return cookie.split(";", 1)[0];
}

export async function loginCookie(f: Fixture, owner: "a" | "b" = "a") {
  const result = await login(f, "google", owner);
  expect(result.error).toBeNull();
  expect(result.data?.user.id).toBe(`owner-${owner}`);
  expect(result.data?.session.userId).toBe(`owner-${owner}`);
  expect(result.data?.session.token).toBeTypeOf("string");
  return sessionCookie(f, result.data!.session.token);
}

export function arcHandlers(f: Fixture) {
  // Operational events require UUIDs. Keep IDs distinct even when a test
  // creates multiple handler wrappers for the same fixture.
  const nextId = () => {
    const sequence = (handlerSequences.get(f) ?? 0) + 1;
    handlerSequences.set(f, sequence);
    return `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
  };
  return createProductionAccountLinkHandlers({
    requireUser: (headers) => requireArcUser(headers, (sessionHeaders) => f.auth.api.getSession({
      headers: sessionHeaders,
      query: { disableCookieCache: true, disableRefresh: true },
    })),
    getD1: () => f.db as unknown as D1Database,
    getAuth: () => f.auth,
    readEnvironment: () => fixtureEnvironment(),
    createRequestId: nextId,
    createId: nextId,
    now: () => new Date(NOW),
  });
}

export function cookiePairs(headers: Headers) {
  return headers.getSetCookie().map((cookie) => cookie.split(";", 1)[0]).join("; ");
}
