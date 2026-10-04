# Authentication Migration Runtime Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete C3's synthetic, offline acceptance of preserved identity, fresh credentials, invalidated imported authentication state, and Arc account-link protections through the installed libraries.

**Architecture:** Keep the existing C1 cleanup and C2 characterization unchanged. Add focused Node-environment tests sharing a narrowly scoped fixture that uses native in-memory SQLite, the existing SqliteD1, actual Drizzle, buildAuthOptions, Better Auth public APIs and Arc production account-link handlers. Synthetic state manipulation is confined to explicit adversarial fixture setup; no identity, account lookup, join, session reader, repository, or Arc hook is replaced with a mock.

**Tech Stack:** Installed better-auth 1.6.24 / @better-auth/core 1.6.25, @better-auth/drizzle-adapter 1.6.24, drizzle-orm 0.45.2, better-call public cookie API, Vitest, Node 24.14.1 native SQLite.

---

## Authority, working directory, and execution rules

Work only in `C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-cloudflare-migration`, branch `codex/v8-cloudflare-migration`. The drafting baseline is `f37b3f210cb1d16ace7ab4a03420486523216c63`. Parent requirements are `docs/superpowers/specs/2026-10-04-auth-migration-rehearsal-design.md` and `docs/superpowers/specs/2026-09-22-arc-cloudflare-migration-design.md`; C1/C2 evidence and source audit are in `docs/superpowers/plans/2026-10-04-auth-migration-rehearsal.md`.

This refines approved tests, not product design. Do not change production source, migrations, dependencies, engines, auth settings, public routes, or actual resources. Do not read `.env`, private/Wrangler auth files, secrets, or real user data. Do not build, deploy, call a provider, use an HTTP listener, push, or perform cloud writes. Five Dashboard secrets and live-login verification remain user/external prerequisites. Tests contain explicit synthetic credentials, explicit secret rotation configuration, disabled telemetry, a fixed Date clock, and a deny-and-assert global fetch guard. SQLite experimental warnings are acceptable; unexpected network use is a failure.

Execute one bounded task at a time with a fresh implementer, then an independent SPEC review, then a distinct QUALITY/security review. Reviews must examine actual changes and actual command results. Workers do not commit; root handles a reviewed commit/authorized backup separately. Do not skip review because changes only affect tests.

TDD here distinguishes a **harness RED** (a newly imported helper does not yet exist) from runtime acceptance. Existing correct behavior may pass on the first valid execution. Preserve that result truthfully; never break production, disable hooks, mock joins, or invent a runtime RED. If an assertion reveals a production defect, report it for review and leave that acceptance gap open. Repair a demonstrated fixture/API mismatch narrowly without relaxing the intended assertion.

Run all commands below from the working directory. Before beginning, inspect `git status --short` and `git rev-parse HEAD`; keep unrelated files intact. No applicable `AGENTS.md` was found in this worktree or its ancestor chain during drafting.

## File map and ordered tasks

| Task | File | Responsibility |
| --- | --- | --- |
| C3.1 | Create `tests/helpers/auth-migration-fixture.ts` and `tests/server/auth-migration-identity.test.ts` | Isolated real-library fixture; linked provider identity, missing mappings, rejected orphan ownership |
| C3.2 | Create `tests/server/auth-migration-credentials.test.ts` | Real token cryptography and actual get-session signature/database controls |
| C3.3 | Create `tests/helpers/auth-migration-oauth.ts` and `tests/server/auth-migration-oauth-state.test.ts` | Actual social-start state/cookie generation and consumed/reset callback rejection |
| C3.4 | Create `tests/helpers/auth-migration-link.ts` and `tests/server/auth-migration-link-reset.test.ts` | Actual Arc credential/start/continue behavior and internal proof denial |
| C3.5 | Create `tests/server/auth-migration-link-callback.test.ts` | Actual callback finish hooks, cross-owner isolation and fresh flow control |
| C3.6 | Update this plan's execution receipt only | Integrated test/type/lint gate and final sequential reviews |

The existing `tests/server/auth-migration-runtime.test.ts`, `tests/server/auth-migration-cleanup.test.ts`, and `tests/helpers/sqlite-d1.ts` remain unchanged. Do not duplicate or replace C2's native raw-array implementation. A helper below is fixture construction, not an operational import runner.

## C3.1: Real fixture and identity acceptance

**Files:** Create `tests/helpers/auth-migration-fixture.ts`; create `tests/server/auth-migration-identity.test.ts`.

- [x] **Step 1: Add the identity acceptance file below.** It references the new helper. The first run can fail because that helper is absent; label this harness RED, not an auth failure.

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  cleanupFixture, fixtureHarness, login, preservedRows, rows,
} from "../helpers/auth-migration-fixture";

const harness = fixtureHarness();

describe("auth migration identity acceptance", () => {
  it("retains two linked providers, both owners, and exact business identities", async () => {
    const f = await harness.fixture({ linkedBoth: true });
    const before = preservedRows(f);
    expect(await cleanupFixture(f)).toMatchObject({ socialAccountsCleared: 3 });
    for (const provider of ["google", "github"] as const) {
      const result = await login(f, provider, "a", { email: "owner-b@example.test" });
      expect(result.error).toBeNull();
      expect(result.isRegister).toBe(false);
      expect(result.data?.user.id).toBe("owner-a");
      expect(result.data?.session.userId).toBe("owner-a");
    }
    expect(rows(f, "sessions").map((row) => row.user_id)).toEqual(["owner-a", "owner-a"]);
    expect(preservedRows(f)).toEqual(before);
    expect(rows(f, "users")).toHaveLength(2);
    expect(rows(f, "accounts")).toHaveLength(3);
  });

  it.each([
    ["owner-a@example.test", "account not linked"],
    ["new-owner@example.test", "signup disabled"],
  ])("rejects missing subject mapping for %s without identity substitution", async (email, error) => {
    const f = await harness.fixture();
    await cleanupFixture(f);
    const before = preservedRows(f);
    const accountsBefore = rows(f, "accounts");
    const result = await login(f, "google", "a", { subject: "missing-subject", email });
    expect(result.error).toBe(error);
    expect(result.data).toBeNull();
    expect(rows(f, "sessions")).toEqual([]);
    expect(rows(f, "accounts")).toEqual(accountsBefore);
    expect(preservedRows(f)).toEqual(before);
  });

  it("refuses an orphan mapping before any email fallback can count as continuity", async () => {
    const f = await harness.fixture();
    // Only this isolated adversarial fixture disables FK enforcement to create bad import data.
    f.db.database.exec("PRAGMA foreign_keys = OFF");
    f.db.database.prepare("UPDATE accounts SET user_id = ? WHERE id = ?")
      .run("missing-owner", "google-a");
    f.db.database.exec("PRAGMA foreign_keys = ON");
    const before = preservedRows(f);
    const accountsBefore = rows(f, "accounts");
    await expect(cleanupFixture(f)).rejects.toThrow(/^AUTH_REHEARSAL_FOREIGN_KEYS$/);
    expect(preservedRows(f)).toEqual(before);
    expect(rows(f, "accounts")).toEqual(accountsBefore);
    expect(rows(f, "sessions")).toEqual([]);
    // No auth call follows rejected preconditions: an email match is not owner evidence.
  });

  it("classifies default signup for a changed subject as failed preservation", async () => {
    const f = await harness.fixture();
    await cleanupFixture(f);
    const before = preservedRows(f);
    const result = await login(f, "google", "a", {
      subject: "unmapped-new-subject", email: "unmapped-new@example.test", disableSignUp: false,
    });
    expect(result.error).toBeNull();
    expect(result.isRegister).toBe(true);
    expect(result.data?.user.id).toBeTypeOf("string");
    expect(result.data?.user.id).not.toBe("owner-a");
    expect(result.data?.user.id).not.toBe("owner-b");
    const newId = result.data?.user.id;
    expect(result.data?.session.userId).toBe(newId);
    expect(rows(f, "users")).toHaveLength(3);
    expect(rows(f, "accounts")).toHaveLength(3);
    expect(rows(f, "accounts").find((row) => row.account_id === "unmapped-new-subject"))
      .toMatchObject({ user_id: newId, provider_id: "google" });
    const after = preservedRows(f);
    expect(after.users.filter((row) => row.id !== newId)).toEqual(before.users);
    expect(after.accountIdentities.filter((row) => row.user_id !== newId)).toEqual(before.accountIdentities);
    expect(after.business).toEqual(before.business);
    // The login can succeed while identity preservation fails. This is a diagnostic counterexample.
    expect(result.data?.user.id === "owner-a").toBe(false);
  });
});
```

- [x] **Step 2: Run the focused harness RED.**

```powershell
npm run test:unit -- tests/server/auth-migration-identity.test.ts
```

Expected at this stage: import resolution failure for the absent fixture helper. Record actual output. This is the only anticipated missing-helper RED in C3; subsequent tasks characterize installed behavior.

- [x] **Step 3: Create the complete fixture helper below.** It installs and restores only the test clock, fetch, and synthetic `env.DB`. It never reads other environment properties. Each test creates one fixture; old/new auth instances may share that same fixture DB.

```ts
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { handleOAuthUserInfo } from "better-auth/oauth2";
import { runWithEndpointContext, runWithRequestState } from "@better-auth/core/context";
import { serializeSignedCookie } from "better-call";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema";
import { buildAuthOptions } from "../../app/server/auth/runtime";
import { requireArcUser } from "../../app/server/auth/session";
import {
  createProductionAccountLinkHandlers,
  type AccountLinkProductionRuntime,
} from "../../app/server/account-link/http";
import { createResearchD1, type SqliteD1 } from "./sqlite-d1";

export const ORIGIN = "https://arc.example.test";
export const NOW = 1_800_000_000_000;
export const THEN = NOW - 10_000;
export const OLD_SECRET = "synthetic-c3-old-secret-offline-fixtures-only";
export const NEW_SECRET = "synthetic-c3-new-secret-offline-fixtures-only";
export type Provider = "google" | "github";

export function fixtureEnvironment(secret = NEW_SECRET) {
  return {
    ARC_ENVIRONMENT: "production", BETTER_AUTH_URL: ORIGIN, BETTER_AUTH_SECRET: secret,
    GOOGLE_CLIENT_ID: "synthetic-google-id", GOOGLE_CLIENT_SECRET: "synthetic-google-secret",
    GITHUB_CLIENT_ID: "synthetic-github-id", GITHUB_CLIENT_SECRET: "synthetic-github-secret",
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
const fixtureSequences = new WeakMap<Fixture, number>();
type FixtureTable = "users" | "accounts" | "sessions" | "verifications"
  | "learner_profiles" | "career_goals" | "proof_items" | "proof_assets"
  | "research_runs" | "account_link_intents";

export function rows(f: Fixture, table: FixtureTable) {
  return f.db.database.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
}

export function preservedRows(f: Fixture) {
  return {
    users: rows(f, "users"),
    accountIdentities: f.db.database.prepare(`SELECT id,account_id,provider_id,user_id,
      password,created_at FROM accounts ORDER BY id`).all(),
    business: Object.fromEntries((["learner_profiles", "career_goals", "proof_items",
      "proof_assets", "research_runs"] as const).map((table) => [table, rows(f, table)])),
  };
}

export async function cleanupFixture(f: Fixture) {
  const moduleUrl = pathToFileURL(resolve(process.cwd(), "scripts/cloudflare-migration/rehearse-auth-cleanup.mjs"));
  const cleanup = (await import(moduleUrl.href)).rehearseAuthCleanup as
    (db: DatabaseSync, now: number) => Record<string, unknown>;
  return cleanup(f.db.database, NOW);
}

export function fixtureHarness() {
  const databases: SqliteD1[] = [];
  let savedDb: PropertyDescriptor | undefined;
  let deniedFetch: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    savedDb = Object.getOwnPropertyDescriptor(env, "DB");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    deniedFetch = vi.fn(async () => { throw new Error("SYNTHETIC_AUTH_NETWORK_DENIED"); });
    vi.stubGlobal("fetch", deniedFetch);
  });
  afterEach(() => {
    try { expect(deniedFetch).not.toHaveBeenCalled(); }
    finally {
      if (savedDb) Object.defineProperty(env, "DB", savedDb);
      else Reflect.deleteProperty(env, "DB");
      vi.unstubAllGlobals();
      vi.useRealTimers();
      vi.restoreAllMocks();
      for (const db of databases.splice(0)) db.close();
    }
  });
  return {
    async fixture({ linkedBoth = false }: { linkedBoth?: boolean } = {}): Promise<Fixture> {
      if (databases.length !== 0) throw new Error("ONE_AUTH_FIXTURE_PER_TEST");
      const db = createResearchD1();
      databases.push(db);
      Object.defineProperty(env, "DB", { configurable: true, enumerable: true, writable: true, value: db });
      for (const owner of ["a", "b"]) {
        db.database.prepare(`INSERT INTO users(id,name,email,email_verified,created_at,updated_at)
          VALUES (?,?,?,1,?,?)`).run(`owner-${owner}`, owner, `owner-${owner}@example.test`, THEN, THEN);
        db.database.prepare(`INSERT INTO learner_profiles(id,user_id,state_version,created_at,updated_at)
          VALUES (?,?,3,?,?)`).run(`profile-${owner}`, `owner-${owner}`, THEN, THEN);
        db.database.prepare(`INSERT INTO career_goals(id,user_id,role_id,level,weekly_minutes,target_weeks,
          status,active_slot,created_at,updated_at) VALUES (?,?,?,'junior',120,8,'active',1,?,?)`)
          .run(`goal-${owner}`, `owner-${owner}`, "synthetic-role", THEN, THEN);
        db.database.prepare(`INSERT INTO proof_items(id,user_id,goal_id,title,kind,created_at,updated_at)
          VALUES (?,?,?,'Synthetic proof','artifact',?,?)`)
          .run(`proof-${owner}`, `owner-${owner}`, `goal-${owner}`, THEN, THEN);
        db.database.prepare(`INSERT INTO proof_assets(id,user_id,proof_id,object_key,filename,content_type,
          size_bytes,created_at) VALUES (?,?,?,?,'file.txt','text/plain',7,?)`)
          .run(`asset-${owner}`, `owner-${owner}`, `proof-${owner}`, `synthetic/${owner}/file.txt`, THEN);
        db.database.prepare(`INSERT INTO research_runs(id,user_id,request_id,mutation_id,raw_role,
          normalized_role_key,locale,input_fingerprint,config_fingerprint,state,created_at,updated_at)
          VALUES (?,?,?,?,'Synthetic role','synthetic-role','en-US','input','config','failed',?,?)`)
          .run(`research-${owner}`, `owner-${owner}`, `request-${owner}`, `mutation-${owner}`, THEN, THEN);
      }
      const mappings: [Provider, string][] = [["google", "a"], ["google", "b"]];
      if (linkedBoth) mappings.push(["github", "a"]);
      for (const [provider, owner] of mappings) {
        db.database.prepare(`INSERT INTO accounts(id,account_id,provider_id,user_id,access_token,
          refresh_token,id_token,access_token_expires_at,refresh_token_expires_at,scope,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(`${provider}-${owner}`, `subject-${provider}-${owner}`,
          provider, `owner-${owner}`, "synthetic-old-access", "synthetic-old-refresh", "synthetic-old-id",
          NOW + 60_000, NOW + 120_000, "synthetic-scope", THEN, THEN);
      }
      const auth = makeAuth(db);
      await auth.$context;
      return { db, auth };
    },
  };
}

export async function login(
  f: Fixture, provider: Provider = "google", owner: "a" | "b" = "a",
  values: { subject?: string; email?: string; accessToken?: string; refreshToken?: string;
    disableSignUp?: boolean } = {},
) {
  const subject = values.subject ?? `subject-${provider}-${owner}`;
  const context = await f.auth.$context;
  // Installed public declarations differ in plugin-context generics; both
  // calls receive this same real context and the exercised endpoint subset.
  const endpoint = { context, headers: new Headers(), request: new Request(ORIGIN) } as
    Parameters<typeof handleOAuthUserInfo>[0] & Parameters<typeof runWithEndpointContext>[0];
  return runWithRequestState(new WeakMap(), () => runWithEndpointContext(endpoint, () => handleOAuthUserInfo(endpoint, {
    userInfo: { id: subject, name: owner, email: values.email ?? `owner-${owner}@example.test`,
      emailVerified: true, image: null },
    account: { providerId: provider, accountId: subject,
      accessToken: values.accessToken ?? "synthetic-fresh-access", refreshToken: values.refreshToken },
    callbackURL: `${ORIGIN}/today`, disableSignUp: values.disableSignUp ?? true,
  })));
}

export async function sessionCookie(f: Fixture, token: string, secret = NEW_SECRET) {
  const cookie = (await f.auth.$context).authCookies.sessionToken;
  return (await serializeSignedCookie(cookie.name, token, secret, cookie.attributes)).split(";", 1)[0];
}

export async function loginCookie(f: Fixture, owner: "a" | "b" = "a") {
  const result = await login(f, "google", owner);
  expect(result.error).toBeNull();
  expect(result.data?.user.id).toBe(`owner-${owner}`);
  expect(result.data?.session.userId).toBe(`owner-${owner}`);
  if (!result.data) throw new Error("SYNTHETIC_LOGIN_FAILED");
  return sessionCookie(f, result.data.session.token);
}

export function arcHandlers(f: Fixture) {
  const nextId = () => {
    const sequence = (fixtureSequences.get(f) ?? 0) + 1;
    fixtureSequences.set(f, sequence);
    return `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
  };
  const runtime: AccountLinkProductionRuntime = {
    requireUser: (headers) => requireArcUser(headers, (requestHeaders) => f.auth.api.getSession({
      headers: requestHeaders, query: { disableCookieCache: true, disableRefresh: true },
    })),
    getD1: () => f.db as unknown as D1Database,
    getAuth: () => f.auth,
    readEnvironment: () => fixtureEnvironment(),
    createRequestId: nextId,
    createId: nextId,
    now: () => new Date(NOW),
  };
  return createProductionAccountLinkHandlers(runtime);
}

export function cookiePairs(headers: Headers) {
  return headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
}
```

`preservedRows` intentionally excludes the accounts' `updated_at`: actual successful sign-in updates that field. C1 already verifies cleanup preserves it exactly. This helper asserts exact account IDs/provider subjects/owner/password/created time and exact business row values after login; token tests assert their own changing columns explicitly. Do not substitute a mere count check for these comparisons.

- [x] **Step 4: Run identity tests and type checking.**

```powershell
npm run test:unit -- tests/server/auth-migration-identity.test.ts
npx tsc --noEmit --incremental false
```

Expected: five cases pass (one linked-provider case, two missing-map cases, one orphan refusal, one default-signup counterexample), no fetch calls, no type errors. `rehearse-auth-cleanup.mjs:64` defines the exact `FOREIGN_KEYS` category. Do not weaken the refusal or allow OAuth fallback after failed preconditions.

`disableSignUp: true` is an explicit diagnostic guard in this helper, not application policy. Production currently allows signup for an unmapped provider subject with a new email. The false-guard control deliberately creates one additional synthetic user and records why that successful login would fail migration continuity. Public `@better-auth/core/context` request and endpoint scopes keep the real Arc account-create hooks active in this control; C2's smaller existing-account endpoint subset alone would not prove this path. This is still public-helper coverage, not successful provider callback coverage.

- [x] **Step 5: Obtain SPEC then QUALITY review for C3.1; record actual commands/results and findings.** Stop this worker after that task. Root may continue the next reviewed task; no worker commit.

**Executed C3.1 receipt (2026-10-04):** The missing-helper harness RED was observed and retained. The first actual-library run passed all five cases; the installed public context declarations then produced a generic type mismatch during type checking. The narrow intersection shown above resolves that declaration seam while preserving the same real context. Final focused tests were 5/5, typecheck and targeted lint exited 0. Root's ten-suite integration, including unchanged C1/C2 and existing authentication/account-link/schema protections, passed 231 tests. Independent SPEC PASS was followed by a distinct QUALITY/security and bounded four-file integration READY, with no actionable findings. No application, schema, engine, dependency or existing test changes were made.

The shared helper uses a fixture-scoped WeakMap sequence for UUID-shaped request/intent IDs across handler instances. Local evidence is under ignored `outputs/cloudflare-migration-20261004/c3-1/`. Frozen SHA256: helper `53534f3026aa13014ecdbe6f05ff44becab3f1dba9090ab458452646a0607ab6`; identity test `2ed5c79443334bd6c7d3ea4a31451e080f2bda5624b1e7c847d9d093d0fa0e0e`. Root separately handles the authorized reviewed commit/backup; this receipt does not mark C3.2–C3.6 or actual login complete.

## C3.2: Token encryption and session invalidation

**Files:** Create `tests/server/auth-migration-credentials.test.ts`. Use C3.1's helper unchanged.

- [x] **Step 1: Add these acceptance tests.** The old/new encryption configurations deliberately use the same envelope version. A wrong-key failure must be cryptographic, not an unknown-version or bare-string envelope parse failure.

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import {
  cleanupFixture, fixtureHarness, login, makeAuth, NEW_SECRET, NOW, OLD_SECRET,
  ORIGIN, preservedRows, rows, sessionCookie, THEN, type Fixture,
} from "../helpers/auth-migration-fixture";

const harness = fixtureHarness();

async function getSession(f: Fixture, cookie: string) {
  const response = await f.auth.handler(new Request(
    `${ORIGIN}/api/auth/get-session?disableCookieCache=true&disableRefresh=true`,
    { headers: { cookie } },
  ));
  expect(response.status).toBe(200);
  return response.json();
}

describe("auth migration token and session acceptance", () => {
  it.each([undefined, "synthetic-fresh-refresh"])("re-encrypts fresh tokens; refresh=%s", async (refreshToken) => {
    const f = await harness.fixture();
    const before = preservedRows(f);
    const oldContext = await makeAuth(f.db, OLD_SECRET).$context;
    const newContext = await f.auth.$context;
    expect(typeof oldContext.secretConfig).toBe("object");
    expect(typeof newContext.secretConfig).toBe("object");
    if (typeof oldContext.secretConfig === "string" || typeof newContext.secretConfig === "string") {
      throw new Error("SYNTHETIC_ROTATION_CONFIG_REQUIRED");
    }
    expect(oldContext.secretConfig.currentVersion).toBe(1);
    expect(newContext.secretConfig.currentVersion).toBe(1);
    expect(oldContext.secretConfig.keys.get(1)).toBe(OLD_SECRET);
    expect(newContext.secretConfig.keys.get(1)).toBe(NEW_SECRET);
    const oldAccess = await symmetricEncrypt({ key: oldContext.secretConfig, data: "synthetic-old-access" });
    const oldRefresh = await symmetricEncrypt({ key: oldContext.secretConfig, data: "synthetic-old-refresh" });
    await expect(symmetricDecrypt({ key: oldContext.secretConfig, data: oldRefresh }))
      .resolves.toBe("synthetic-old-refresh");
    f.db.database.prepare("UPDATE accounts SET access_token = ?, refresh_token = ? WHERE id = ?")
      .run(oldAccess, oldRefresh, "google-a");
    await cleanupFixture(f);
    const clean = rows(f, "accounts").find((row) => row.id === "google-a");
    expect(clean).toMatchObject({ access_token: null, refresh_token: null, scope: null });
    const result = await login(f, "google", "a", { accessToken: "synthetic-fresh-access", refreshToken });
    expect(result.error).toBeNull();
    expect(result.data?.user.id).toBe("owner-a");
    const account = rows(f, "accounts").find((row) => row.id === "google-a")!;
    expect(account.access_token).toBeTypeOf("string");
    const access = String(account.access_token);
    expect(access).not.toBe("synthetic-fresh-access");
    expect(access).not.toBe(oldAccess);
    await expect(symmetricDecrypt({ key: newContext.secretConfig, data: access })).resolves.toBe("synthetic-fresh-access");
    await expect(symmetricDecrypt({ key: oldContext.secretConfig, data: access })).rejects.toThrow();
    if (refreshToken === undefined) {
      expect(account.refresh_token).toBeNull();
    } else {
      expect(account.refresh_token).toBeTypeOf("string");
      await expect(symmetricDecrypt({ key: newContext.secretConfig, data: String(account.refresh_token) }))
        .resolves.toBe(refreshToken);
      await expect(symmetricDecrypt({ key: oldContext.secretConfig, data: String(account.refresh_token) }))
        .rejects.toThrow();
    }
    expect(account).toMatchObject({ id_token: null, access_token_expires_at: null,
      refresh_token_expires_at: null, scope: null });
    expect(preservedRows(f)).toEqual(before);
  });

  it("separates old signature rejection, deleted session rejection, and fresh owner acceptance", async () => {
    const f = await harness.fixture();
    f.db.database.prepare(`INSERT INTO sessions(id,token,user_id,expires_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?)`).run("imported-session", "synthetic-imported-token", "owner-a", NOW + 600_000, THEN, THEN);
    const imported = rows(f, "sessions");
    const oldSignature = await sessionCookie(f, "synthetic-imported-token", OLD_SECRET);
    expect(await getSession(f, oldSignature)).toBeNull();
    expect(rows(f, "sessions")).toEqual(imported);
    const currentSignature = await sessionCookie(f, "synthetic-imported-token");
    expect(await getSession(f, currentSignature)).toMatchObject({
      user: { id: "owner-a" }, session: { id: "imported-session", userId: "owner-a" },
    });
    expect(rows(f, "sessions")).toEqual(imported);
    expect(await cleanupFixture(f)).toMatchObject({ sessionsRemoved: 1 });
    expect(rows(f, "sessions")).toEqual([]);
    expect(await getSession(f, currentSignature)).toBeNull();
    const fresh = await login(f);
    expect(fresh.error).toBeNull();
    expect(fresh.data?.user.id).toBe("owner-a");
    if (!fresh.data) throw new Error("SYNTHETIC_LOGIN_FAILED");
    expect(fresh.data.session.token).not.toBe("synthetic-imported-token");
    const freshCookie = await sessionCookie(f, fresh.data.session.token);
    expect(await getSession(f, freshCookie)).toMatchObject({
      user: { id: "owner-a" }, session: { id: fresh.data.session.id, userId: "owner-a" },
    });
    expect(rows(f, "sessions")).toHaveLength(1);
    expect(rows(f, "sessions")[0].user_id).toBe("owner-a");
  });
});
```

- [x] **Step 2: Run the focused acceptance file.**

```powershell
npm run test:unit -- tests/server/auth-migration-credentials.test.ts
```

Expected: three cases pass and fetch remains uncalled. If installed behavior passes immediately, record first-run GREEN. Do not change authentication behavior to manufacture a RED. The synthetic signed session cookie exercises validation; it does not claim provider callback cookie issuance.

- [x] **Step 3: Run types and obtain independent SPEC then QUALITY review.**

```powershell
npx tsc --noEmit --incremental false
```

Expected: no type errors. Review especially the valid imported-token positive control before cleanup and matching envelope versions. Record results, then stop this worker without a commit.

**C3.2 execution record (2026-10-04):** First actual-library execution was GREEN, all three cases passed without a fixture or product failure. Typecheck and targeted lint exited 0. Root's focused C3.1/C3.2 integration passed eight tests in two files. The shared fixture is unchanged; only the new credentials test was added. The old/new keys share envelope version 1, and the same imported database token is accepted under the current signature before cleanup and rejected after deletion. Evidence is under ignored `outputs/cloudflare-migration-20261004/c3-2/`; test SHA256 is `b8156021ac18b355882c981108c088530535b6b05ca8d61c4114b90b4764b9db`. Independent SPEC PASS was followed by a distinct QUALITY/security and bounded three-file review READY, with no actionable findings. Root handles the authorized reviewed commit/backup separately. Synthetic cookie validation does not establish external callback issuance or actual cloud login.

## C3.3: Actual OAuth state creation and invalidation

**Files:** Create `tests/helpers/auth-migration-oauth.ts`; create `tests/server/auth-migration-oauth-state.test.ts`.

- [x] **Step 1: Add the test file below and run it before creating the new helper.** Missing helper is a harness RED only.

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  cleanupFixture, fixtureHarness, makeAuth, OLD_SECRET, preservedRows, rows,
} from "../helpers/auth-migration-fixture";
import { callback, signStateCookie, startSocial } from "../helpers/auth-migration-oauth";

const harness = fixtureHarness();

describe("auth migration actual OAuth state acceptance", () => {
  it.each(["google", "github"] as const)("consumes genuine fresh %s state without token exchange", async (provider) => {
    const f = await harness.fixture();
    const before = preservedRows(f);
    const start = await startSocial(f, provider);
    const response = await callback(f, provider, start.state, start.cookie, "error", "access_denied");
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/today");
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(rows(f, "verifications")).toEqual([]);
    expect(rows(f, "sessions")).toEqual([]);
    expect(preservedRows(f)).toEqual(before);
    const replay = await callback(f, provider, start.state, start.cookie, "code", "synthetic-never-exchange");
    expect(replay.status).toBe(302);
    expect(new URL(replay.headers.get("location")!).searchParams.get("error")).toBe("state_mismatch");
  });

  it.each(["google", "github"] as const)("rejects cleaned %s state before provider exchange even with a current-key cookie", async (provider) => {
    const f = await harness.fixture();
    const before = preservedRows(f);
    const old = { ...f, auth: makeAuth(f.db, OLD_SECRET) };
    const start = await startSocial(old, provider);
    expect(await cleanupFixture(f)).toMatchObject({ verificationsRemoved: 1 });
    expect(rows(f, "verifications")).toEqual([]);
    for (const cookie of [start.cookie, await signStateCookie(f, start.state)]) {
      const response = await callback(f, provider, start.state, cookie, "code", "synthetic-never-exchange");
      expect(response.status).toBe(302);
      expect(new URL(response.headers.get("location")!).searchParams.get("error")).toBe("state_mismatch");
      expect(rows(f, "verifications")).toEqual([]);
      expect(rows(f, "sessions")).toEqual([]);
      expect(preservedRows(f)).toEqual(before);
    }
  });
});
```

```powershell
npm run test:unit -- tests/server/auth-migration-oauth-state.test.ts
```

- [x] **Step 2: Create the helper, which sends only in-process Requests and never follows redirects.**

```ts
import { expect } from "vitest";
import { serializeSignedCookie } from "better-call";
import {
  cookiePairs, NEW_SECRET, ORIGIN, rows, type Fixture, type Provider,
} from "./auth-migration-fixture";

export async function signStateCookie(f: Fixture, state: string, secret = NEW_SECRET) {
  const cookie = (await f.auth.$context).createAuthCookie("state", { maxAge: 300 });
  return (await serializeSignedCookie(cookie.name, state, secret, cookie.attributes)).split(";", 1)[0];
}

export async function startSocial(f: Fixture, provider: Provider) {
  const response = await f.auth.handler(new Request(`${ORIGIN}/api/auth/sign-in/social`, {
    method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({ provider, callbackURL: `${ORIGIN}/today`,
      errorCallbackURL: `${ORIGIN}/today`, disableRedirect: true }),
  }));
  expect(response.status).toBe(200);
  const payload = await response.json() as { url: string; redirect: boolean };
  expect(payload.redirect).toBe(false);
  const authorization = new URL(payload.url);
  expect(authorization.protocol).toBe("https:");
  const state = authorization.searchParams.get("state");
  expect(state).toBeTypeOf("string");
  if (!state) throw new Error("SYNTHETIC_STATE_REQUIRED");
  const cookieName = (await f.auth.$context).createAuthCookie("state").name;
  const cookie = cookiePairs(response.headers);
  expect(cookie.split("; ").some((value) => value.startsWith(`${cookieName}=`))).toBe(true);
  const stored = rows(f, "verifications");
  expect(stored).toHaveLength(1);
  expect(stored[0].identifier).not.toBe(state);
  expect(JSON.parse(String(stored[0].value)).oauthState).toBe(state);
  return { state, cookie, verification: stored[0] };
}

export function callback(
  f: Fixture, provider: Provider, state: string, cookie: string,
  parameter: "error" | "code", value: string,
) {
  const url = new URL(`${ORIGIN}/api/auth/callback/${provider}`);
  url.searchParams.set("state", state);
  url.searchParams.set(parameter, value);
  return f.auth.handler(new Request(url, { headers: { cookie } }));
}
```

- [x] **Step 3: Re-run the focused file and types, then obtain SPEC and QUALITY reviews.**

```powershell
npm run test:unit -- tests/server/auth-migration-oauth-state.test.ts
npx tsc --noEmit --incremental false
```

Expected: four cases pass. The `access_denied` controls prove genuine state parsing/consumption works, while invalidated-state callbacks carry a code and must fail at state validation before any fetch. Do not accept a generic 4xx/5xx or a network-denial exception as state rejection evidence. Stop this worker after reviews; no commit.

**C3.3 execution record (2026-10-04):** The missing-helper harness RED exited 1 with zero collected cases, then the first valid actual-handler run passed all four cases. Types and targeted lint exited 0. Root's three-file C3.1/C3.2/C3.3 integration passed 12 tests. Genuine social-start state is consumed by the cancellation callback; replay and cleaned state return the exact `state_mismatch` result for both providers, including a current-key signed state cookie after cleanup. The protected fixture is unchanged. Evidence is under ignored `outputs/cloudflare-migration-20261004/c3-3/`; helper SHA256 `af5268e6560d188a2601c318d28f2b195dc3876d688aa6147fec3bf5eac18154`, test SHA256 `f47219e0902b92a4de93e7bf82f96e6a641cae05b0c66f6e3509024d85dfd780`. Independent SPEC PASS was followed by a distinct QUALITY/security and bounded four-file review READY, with no actionable findings. Root handles reviewed commit/backup separately. The initial npm run emitted an update notice of unknown cached/notifier provenance; later commands used offline mode with update notifications disabled. Runtime fetch guards passed; no process-wide network audit or successful external OAuth exchange is claimed.

## C3.4: Reset Arc credentials, internal proofs, and authoritative mappings

**Files:** Create `tests/helpers/auth-migration-link.ts`; create `tests/server/auth-migration-link-reset.test.ts`.

- [x] **Step 1: Add this focused link fixture helper.** It seeds data only in the current in-memory fixture. Native Arc crypto, repositories, handlers, hooks, sessions and account queries remain real. Seeded `consumed` and `completing` rows deliberately have past deadlines.

```ts
import type { AccountLinkStatus } from "../../app/server/account-link/contracts";
import { serializeAccountLinkCookie } from "../../app/server/account-link/cookie";
import { hashAccountLinkCredential } from "../../app/server/account-link/crypto";
import { NOW, ORIGIN, THEN, type Fixture } from "./auth-migration-fixture";

export const ACTIVE_STATES = ["pending_reauth", "verified", "consumed", "completing"] as const;

export async function seedIntent(f: Fixture, status: AccountLinkStatus, id = `old-${status}`) {
  const credential = `synthetic-credential-${id}`;
  const expired = ["consumed", "completing", "expired"].includes(status);
  f.db.database.prepare(`INSERT INTO account_link_intents(id,token_hash,user_id,source_provider,
    target_provider,status,expires_at,verified_at,consumed_at,completed_at,failure_code,created_at,updated_at)
    VALUES (?,?,?,'google','github',?,?,?,?,?,?,?,?)`).run(
    id, await hashAccountLinkCredential(credential), "owner-a", status,
    expired ? NOW - 1 : NOW + 600_000,
    status === "pending_reauth" ? null : THEN,
    ["consumed", "completing", "completed"].includes(status) ? THEN : null,
    status === "completed" ? THEN : null,
    status === "failed" ? "PREEXISTING_FAILURE" : null, THEN, THEN,
  );
  return { id, credential };
}

export function linkCookie(credential: string) {
  return serializeAccountLinkCookie(credential, 600).split(";", 1)[0];
}

export function arcRequest(route: "start" | "continue" | "status", cookie: string) {
  const headers = new Headers({ origin: ORIGIN, cookie });
  if (route === "start") headers.set("content-type", "application/x-www-form-urlencoded");
  return new Request(`${ORIGIN}/api/account-link/${route}`, {
    method: route === "status" ? "GET" : "POST", headers,
    ...(route === "start" ? { body: new URLSearchParams({ targetProvider: "github" }) } : {}),
  });
}
```

- [x] **Step 2: Add the acceptance file below.** Each parameterized case uses its own fixture, keeping per-route rate limits below their production thresholds.

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createSignedLinkContext, verifySignedLinkContext } from "../../app/server/account-link/crypto";
import {
  arcHandlers, cleanupFixture, cookiePairs, fixtureHarness, loginCookie,
  NEW_SECRET, NOW, OLD_SECRET, ORIGIN, preservedRows, rows,
} from "../helpers/auth-migration-fixture";
import { ACTIVE_STATES, arcRequest, linkCookie, seedIntent } from "../helpers/auth-migration-link";

const harness = fixtureHarness();

describe("auth migration Arc reset acceptance", () => {
  it.each(ACTIVE_STATES)("makes old %s inert while permitting a fresh missing-target start", async (status) => {
    const f = await harness.fixture();
    const old = await seedIntent(f, status);
    for (const historical of ["completed", "failed", "expired"] as const) {
      await seedIntent(f, historical, `history-${historical}`);
    }
    const imported = rows(f, "account_link_intents");
    expect(await cleanupFixture(f)).toMatchObject({ intentsFailed: 1 });
    const expected = imported.map((row) => row.id === old.id
      ? { ...row, status: "failed", failure_code: "AUTH_MIGRATION_RESET", updated_at: NOW } : row);
    expect(rows(f, "account_link_intents")).toEqual(expected);
    const session = await loginCookie(f);
    const before = preservedRows(f);
    const accountsBefore = rows(f, "accounts");
    const handlers = arcHandlers(f);
    const oldCookies = `${session}; ${linkCookie(old.credential)}`;
    const statusResponse = await handlers.status(arcRequest("status", oldCookies));
    expect(statusResponse.status).toBe(200);
    expect(await statusResponse.json()).toMatchObject({ stage: "failed", targetProvider: "github" });
    const continued = await handlers.continue(arcRequest("continue", oldCookies));
    expect(continued.status).toBe(409);
    expect(await continued.json()).toMatchObject({ error: { code: "CONFLICT" } });
    expect(rows(f, "account_link_intents")).toEqual(expected);
    expect(rows(f, "verifications")).toEqual([]);
    const fresh = await handlers.start(arcRequest("start", session));
    expect(fresh.status).toBe(303);
    const authorization = new URL(fresh.headers.get("location")!);
    expect(authorization.searchParams.get("state")).toBeTruthy();
    expect(cookiePairs(fresh.headers)).not.toBe("");
    const all = rows(f, "account_link_intents");
    expect(all.filter((row) => expected.some((prior) => prior.id === row.id))).toEqual(expected);
    const created = all.filter((row) => !expected.some((prior) => prior.id === row.id));
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ status: "pending_reauth", user_id: "owner-a",
      source_provider: "google", target_provider: "github" });
    expect(rows(f, "verifications")).toHaveLength(1);
    expect(JSON.parse(String(rows(f, "verifications")[0].value)).link.userId).toBe("owner-a");
    expect(rows(f, "accounts")).toEqual(accountsBefore);
    expect(preservedRows(f)).toEqual(before);
  });

  it.each(ACTIVE_STATES)("rejects old and current signed internal proofs for reset %s", async (status) => {
    const f = await harness.fixture();
    const old = await seedIntent(f, status);
    await cleanupFixture(f);
    const session = await loginCookie(f);
    const intentsBefore = rows(f, "account_link_intents");
    const accountsBefore = rows(f, "accounts");
    const businessBefore = preservedRows(f);
    const phase = status === "pending_reauth" ? "reauth" : "target";
    const provider = phase === "reauth" ? "google" : "github";
    for (const secret of [OLD_SECRET, NEW_SECRET]) {
      const proof = await createSignedLinkContext(secret, {
        kind: "internal", intentId: old.id, userId: "owner-a", provider, phase,
        issuedAt: NOW, expiresAt: NOW + 60_000, nonce: "synthetic-replay-proof",
      });
      if (secret === OLD_SECRET) {
        await expect(verifySignedLinkContext(NEW_SECRET, proof, "internal", NOW)).rejects.toThrow();
      } else {
        await expect(verifySignedLinkContext(NEW_SECRET, proof, "internal", NOW))
          .resolves.toMatchObject({ intentId: old.id, userId: "owner-a" });
      }
      await expect(f.auth.api.linkSocialAccount({
        headers: new Headers({ origin: ORIGIN, cookie: session, "x-arc-link-proof": proof }),
        body: { provider, disableRedirect: true },
      })).rejects.toMatchObject({ status: "FORBIDDEN", body: { code: "ARC_ACCOUNT_LINK_DENIED" } });
      expect(rows(f, "account_link_intents")).toEqual(intentsBefore);
      expect(rows(f, "accounts")).toEqual(accountsBefore);
      expect(rows(f, "verifications")).toEqual([]);
      expect(preservedRows(f)).toEqual(businessBefore);
    }
  });

  it("keeps a completing intent's inserted target authoritative after reset", async () => {
    const f = await harness.fixture({ linkedBoth: true });
    const old = await seedIntent(f, "completing");
    const importedMappings = preservedRows(f).accountIdentities;
    await cleanupFixture(f);
    const session = await loginCookie(f);
    const intentsBefore = rows(f, "account_link_intents");
    expect(intentsBefore.find((row) => row.id === old.id)).toMatchObject({
      status: "failed", failure_code: "AUTH_MIGRATION_RESET", expires_at: NOW - 1,
    });
    const listed = await f.auth.api.listUserAccounts({ headers: new Headers({ cookie: session }) });
    expect(listed.map((row) => [row.id, row.providerId]).sort()).toEqual([
      ["github-a", "github"], ["google-a", "google"],
    ]);
    expect(listed.every((row) => row.scopes.length === 0)).toBe(true);
    const response = await arcHandlers(f).start(arcRequest("start", session));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "CONFLICT" } });
    expect(rows(f, "account_link_intents")).toEqual(intentsBefore);
    expect(preservedRows(f).accountIdentities).toEqual(importedMappings);
    expect(rows(f, "verifications")).toEqual([]);
  });
});
```

- [x] **Step 3: Run the focused acceptance and type gates.**

```powershell
npm run test:unit -- tests/server/auth-migration-link-reset.test.ts
npx tsc --noEmit --incremental false
```

Expected: nine cases pass, no provider fetch, no changed historical rows, no revived reset intent. Fresh-start acceptance must reach actual Better Auth state insertion via Arc's internal proof hook. A generic 503 is an integration defect, not an acceptable rejection. Record first-run GREEN or genuine fixture/acceptance failure accurately.

- [x] **Step 4: Obtain SPEC then QUALITY review and stop this worker.** Review the exact historical row comparison, two independent proof-key controls, expired consumed/completing fixtures, and target mapping preservation. No commit.

**C3.4 execution record (2026-10-04):** All nine actual-library/Arc-handler cases passed on their first valid characterization run. Typecheck, targeted lint and whitespace checks passed. Root's C3.1–C3.4 focused integration passed 21 tests across four files. Historical rows remain exact; each reset active intent refuses continuation and both old/current-key proofs, while a fresh missing-target start reaches genuine OAuth state insertion. An already inserted target mapping stays authoritative after an expired completing intent is reset. No existing helper, application, dependency or schema was changed. Evidence is under ignored `outputs/cloudflare-migration-20261004/c3-4/`; helper SHA256 `e51c77da4b5eeb62cc1232ad5fb5eb5987acf9792348e7876049659e03ebef49`, test SHA256 `43aa53170a83c5e7aff4c179a69b20352749942aa409ba19a2f33276245f1b60`. Independent SPEC PASS was followed by a distinct QUALITY/security and bounded five-file review READY, with no actionable findings. Root handles the reviewed commit/backup separately. This is synthetic local acceptance, not a successful external account-link callback.

## C3.5: Actual callback finish hooks and owner isolation

**Files:** Create `tests/server/auth-migration-link-callback.test.ts`. Use C3.1/C3.3/C3.4 helpers unchanged.

This task intentionally stays offline. A valid `error=access_denied` callback traverses real state parsing and Arc's after hook without reaching provider exchange. A target-phase test begins with a synthetic verified grant; it proves the real continue path and callback settlement, not successful external reauthentication. C3.4 separately proves fresh start requires the source provider and creates signed state through the real hook. Together these are explicit local boundaries; live provider reauthentication remains a release gate.

For the adversarial reset-proof tests, preserve one genuine generated verification row, run cleanup, then deliberately reinsert that row only in the isolated fixture with a copied claim signed using the old or new fixture key. Give the request a fresh valid owner session, the original link credential, and a current-key state cookie. This deliberately neutralizes the already-proven session/state-deletion barriers so that Arc's proof and failed-intent checks are independently tested. **This reinsertion is hostile fixture setup, never cleanup logic or a proposed migration step.** Exact `ARC_ACCOUNT_LINK_DENIED`, consumed verification state, absent redirect, unchanged intent/account/business rows and zero fetch jointly establish the boundary; an arbitrary invalid-state response cannot satisfy the test.

**Source-checked transport distinction, pending runtime confirmation:** For callback **after-hook** denial, installed `better-auth/dist/api/dispatch.mjs` replaces the response with the after-hook APIError but retains the callback's original `result.status` (302). Installed `better-call/dist/to-response.mjs` gives `init.status` precedence over `APIError.statusCode`. Therefore these callback tests expect HTTP **302 with the exact denial body and no Location**, while direct **before-hook** bypass remains HTTP **403**. This is a pre-execution contract correction based on both source files, not a relaxation following an observed failure. A bare 302 never proves denial: the exact body, removed Location, consumed verification and unchanged DB assertions are mandatory. Record the actual transport result when run; do not change production code within C3.

- [ ] **Step 1: Add the complete integration file below.**

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readAccountLinkCookie } from "../../app/server/account-link/cookie";
import { createSignedLinkContext, verifySignedLinkContext } from "../../app/server/account-link/crypto";
import {
  arcHandlers, cleanupFixture, cookiePairs, fixtureHarness, loginCookie,
  NEW_SECRET, NOW, OLD_SECRET, ORIGIN, preservedRows, rows, THEN,
  type Fixture, type Provider,
} from "../helpers/auth-migration-fixture";
import { ACTIVE_STATES, arcRequest, linkCookie, seedIntent } from "../helpers/auth-migration-link";
import { callback, signStateCookie } from "../helpers/auth-migration-oauth";

const harness = fixtureHarness();

async function beginArc(f: Fixture, phase: "reauth" | "target") {
  const session = await loginCookie(f);
  const handlers = arcHandlers(f);
  let response: Response;
  let credential: string;
  if (phase === "reauth") {
    response = await handlers.start(arcRequest("start", session));
    const read = readAccountLinkCookie(new Headers({ cookie: cookiePairs(response.headers) }));
    if (!read) throw new Error("SYNTHETIC_LINK_CREDENTIAL_REQUIRED");
    credential = read;
  } else {
    // A synthetic verified grant is the precondition; no provider success is simulated.
    const verified = await seedIntent(f, "verified", "fresh-target-grant");
    credential = verified.credential;
    response = await handlers.continue(arcRequest("continue", `${session}; ${linkCookie(credential)}`));
  }
  expect(response.status).toBe(303);
  const state = new URL(response.headers.get("location")!).searchParams.get("state");
  if (!state) throw new Error("SYNTHETIC_STATE_REQUIRED");
  const verification = rows(f, "verifications").find((row) => JSON.parse(String(row.value)).oauthState === state);
  expect(verification).toBeDefined();
  if (!verification) throw new Error("SYNTHETIC_VERIFICATION_REQUIRED");
  const payload = JSON.parse(String(verification.value)) as {
    arcLinkContext: string; link: { userId: string; email: string };
    callbackURL: string; errorURL: string; oauthState: string; expiresAt: number;
  };
  const proof = await verifySignedLinkContext(NEW_SECRET, payload.arcLinkContext, "oauth", NOW);
  const provider: Provider = phase === "reauth" ? "google" : "github";
  expect(proof).toMatchObject({ kind: "oauth", userId: "owner-a", phase, provider });
  expect(payload.link.userId).toBe("owner-a");
  expect(payload.callbackURL).toBe(phase === "reauth" ? "/today?link=verified" : "/today?link=complete");
  expect(payload.errorURL).toBe(`/today?link=error&stage=${phase}`);
  expect(verification.identifier).not.toBe(state);
  const cookie = `${session}; ${cookiePairs(response.headers)}; ${linkCookie(credential)}`;
  return { state, verification, payload, proof, provider, credential, cookie };
}

describe("auth migration Arc callback acceptance", () => {
  it.each(["reauth", "target"] as const)("settles genuine %s state through real finish hooks without network", async (phase) => {
    const f = await harness.fixture();
    await cleanupFixture(f);
    const flow = await beginArc(f, phase);
    const before = preservedRows(f);
    const accountsBefore = rows(f, "accounts");
    const response = await callback(f, flow.provider, flow.state, flow.cookie, "error", "access_denied");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`/today?link=error&stage=${phase}`);
    expect(rows(f, "verifications")).toEqual([]);
    expect(rows(f, "account_link_intents").find((row) => row.id === flow.proof.intentId))
      .toMatchObject({ user_id: "owner-a", status: "failed", failure_code: "OAUTH_CANCELLED" });
    expect(rows(f, "accounts")).toEqual(accountsBefore);
    expect(preservedRows(f)).toEqual(before);
  });

  it.each(ACTIVE_STATES)("cannot finish reset %s with old-key or current-key OAuth proof", async (status) => {
    const f = await harness.fixture();
    await cleanupFixture(f);
    const phase = status === "pending_reauth" ? "reauth" : "target";
    const flow = await beginArc(f, phase);
    f.db.database.prepare(`UPDATE account_link_intents SET status = ?, expires_at = ?,
      verified_at = ?, consumed_at = ?, updated_at = ? WHERE id = ?`).run(
      status, ["consumed", "completing"].includes(status) ? NOW - 1 : NOW + 600_000,
      status === "pending_reauth" ? null : THEN,
      ["consumed", "completing"].includes(status) ? THEN : null, THEN, flow.proof.intentId,
    );
    const imported = rows(f, "account_link_intents");
    expect(await cleanupFixture(f)).toMatchObject({ intentsFailed: 1, verificationsRemoved: 1, sessionsRemoved: 1 });
    expect(rows(f, "verifications")).toEqual([]);
    const reset = imported.map((row) => ({ ...row, status: "failed", failure_code: "AUTH_MIGRATION_RESET", updated_at: NOW }));
    expect(rows(f, "account_link_intents")).toEqual(reset);
    const freshSession = await loginCookie(f);
    const accountsBefore = rows(f, "accounts");
    const sessionsBefore = rows(f, "sessions");
    const businessBefore = preservedRows(f);
    for (const secret of [OLD_SECRET, NEW_SECRET]) {
      const proof = await createSignedLinkContext(secret, flow.proof);
      await expect(verifySignedLinkContext(secret, proof, "oauth", NOW)).resolves.toEqual(flow.proof);
      if (secret === OLD_SECRET) {
        await expect(verifySignedLinkContext(NEW_SECRET, proof, "oauth", NOW)).rejects.toThrow();
      } else {
        await expect(verifySignedLinkContext(NEW_SECRET, proof, "oauth", NOW)).resolves.toEqual(flow.proof);
      }
      // Reinstate only this synthetic state record to challenge the independent Arc hook barrier.
      const saved = flow.verification;
      f.db.database.prepare(`INSERT INTO verifications(id,identifier,value,expires_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?)`).run(saved.id, saved.identifier,
        JSON.stringify({ ...flow.payload, arcLinkContext: proof }),
        saved.expires_at, saved.created_at, saved.updated_at);
      const cookies = `${freshSession}; ${await signStateCookie(f, flow.state)}; ${linkCookie(flow.credential)}`;
      const response = await callback(f, flow.provider, flow.state, cookies, "error", "access_denied");
      expect(response.status).toBe(302);
      expect(await response.json()).toMatchObject({ code: "ARC_ACCOUNT_LINK_DENIED" });
      expect(response.headers.get("location")).toBeNull();
      // State must have validated and been consumed; a state_mismatch redirect cannot pass here.
      expect(rows(f, "verifications")).toEqual([]);
      expect(rows(f, "account_link_intents")).toEqual(reset);
      expect(rows(f, "accounts")).toEqual(accountsBefore);
      expect(rows(f, "sessions")).toEqual(sessionsBefore);
      expect(preservedRows(f)).toEqual(businessBefore);
    }
  });

  it("denies another owner at callback and continue while preserving the real owner's pending intent", async () => {
    const f = await harness.fixture();
    await cleanupFixture(f);
    const flow = await beginArc(f, "reauth");
    const otherSession = await loginCookie(f, "b");
    const intentsBefore = rows(f, "account_link_intents");
    const accountsBefore = rows(f, "accounts");
    const businessBefore = preservedRows(f);
    const otherCookies = `${otherSession}; ${await signStateCookie(f, flow.state)}; ${linkCookie(flow.credential)}`;
    const handlers = arcHandlers(f);
    const status = await handlers.status(arcRequest("status", otherCookies));
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({ stage: null, targetProvider: null, expiresAt: null });
    const continued = await handlers.continue(arcRequest("continue", otherCookies));
    expect(continued.status).toBe(409);
    expect(await continued.json()).toMatchObject({ error: { code: "CONFLICT" } });
    const response = await callback(f, flow.provider, flow.state, otherCookies, "error", "access_denied");
    expect(response.status).toBe(302);
    expect(await response.json()).toMatchObject({ code: "ARC_ACCOUNT_LINK_DENIED" });
    expect(response.headers.get("location")).toBeNull();
    expect(rows(f, "verifications")).toEqual([]);
    expect(rows(f, "account_link_intents")).toEqual(intentsBefore);
    expect(rows(f, "accounts")).toEqual(accountsBefore);
    expect(preservedRows(f)).toEqual(businessBefore);
  });

  it("lists null scopes only for the session owner and rejects direct link bypass", async () => {
    const f = await harness.fixture({ linkedBoth: true });
    await cleanupFixture(f);
    const a = await loginCookie(f, "a");
    const b = await loginCookie(f, "b");
    const before = preservedRows(f);
    const accountsBefore = rows(f, "accounts");
    for (const [cookie, ids] of [[a, ["github-a", "google-a"]], [b, ["google-b"]]] as const) {
      const response = await f.auth.handler(new Request(`${ORIGIN}/api/auth/list-accounts?userId=owner-a`, {
        headers: { cookie },
      }));
      expect(response.status).toBe(200);
      const listed = await response.json() as Array<{ id: string; scopes: string[] }>;
      expect(listed.map((row) => row.id).sort()).toEqual(ids);
      expect(listed.every((row) => row.scopes.length === 0)).toBe(true);
    }
    for (const body of [
      { provider: "github", disableRedirect: true },
      { provider: "github", idToken: { token: "synthetic-forged-id-token" } },
    ]) {
      const response = await f.auth.handler(new Request(`${ORIGIN}/api/auth/link-social`, {
        method: "POST", headers: { cookie: a, origin: ORIGIN, "content-type": "application/json" },
        body: JSON.stringify(body),
      }));
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: "ARC_ACCOUNT_LINK_DENIED" });
    }
    expect(rows(f, "verifications")).toEqual([]);
    expect(rows(f, "account_link_intents")).toEqual([]);
    expect(rows(f, "accounts")).toEqual(accountsBefore);
    expect(preservedRows(f)).toEqual(before);
  });
});
```

- [ ] **Step 2: Run the focused file and types.**

```powershell
npm run test:unit -- tests/server/auth-migration-link-callback.test.ts
npx tsc --noEmit --incremental false
```

Expected: eight cases pass. The two phase controls must settle as `OAUTH_CANCELLED`; the four reset cases must consume restored state but deny both old/new proofs; the cross-owner and bypass cases must not mutate ownership. Record exact handler results; do not widen expected statuses or codes to make a failing case pass.

- [ ] **Step 3: Obtain independent SPEC then QUALITY review and stop this worker.** Reviewers must inspect genuine-state provenance, the request-state API boundary, current-key state cookie, fresh authenticated owner, and actual callback after hook. A callback response without unchanged owner/mapping evidence is insufficient. No commit.

## C3.6: Integrated gate and bounded completion receipt

**Files:** Update only this plan's execution receipt after the commands and reviews actually finish. Do not prefill passing totals or claim full migration readiness.

- [ ] **Step 1: Run all C1/C2/C3 auth and existing protection suites together.**

```powershell
npm run test:unit -- tests/server/auth-migration-cleanup.test.ts tests/server/auth-migration-runtime.test.ts tests/server/auth-migration-identity.test.ts tests/server/auth-migration-credentials.test.ts tests/server/auth-migration-oauth-state.test.ts tests/server/auth-migration-link-reset.test.ts tests/server/auth-migration-link-callback.test.ts tests/server/auth-runtime.test.ts tests/server/account-link-crypto.test.ts tests/server/account-link-service.test.ts tests/server/account-link-auth-hooks.test.ts tests/server/d1-account-link-repository.test.ts tests/api/auth-link-bypass.test.ts tests/db/schema.test.ts
```

Expected: all selected tests pass and the global fetch guards remain uncalled. Record the actual suite/test totals, including any initially failing runs and their explained fixture repair or unresolved production defect. Do not run the unrelated build, provider authentication, remote database operations, or full application release gates as part of this test-only task.

- [ ] **Step 2: Run type, focused lint, and whitespace checks.**

```powershell
npx tsc --noEmit --incremental false
npx eslint tests/helpers/auth-migration-fixture.ts tests/helpers/auth-migration-oauth.ts tests/helpers/auth-migration-link.ts tests/server/auth-migration-identity.test.ts tests/server/auth-migration-credentials.test.ts tests/server/auth-migration-oauth-state.test.ts tests/server/auth-migration-link-reset.test.ts tests/server/auth-migration-link-callback.test.ts
git diff --check
git status --short
git diff --stat
```

Expected: no type/lint/whitespace errors and only the planned test/helper/document files changed. Never print auth contexts, tokens, fixture row payloads, raw SQL errors or cookie/proof values into an execution summary. Assertion failures are local synthetic evidence; human summaries retain only check names, bounded error categories and counts.

- [ ] **Step 3: Perform the final integrated SPEC review, then a separate QUALITY/security review.** SPEC checks every matrix item below; QUALITY checks that the tests can fail for the intended reason, global state restoration, no hidden fallback mocks, fixed timestamps, scope accounting, no network, and unchanged production/dependency/schema/engine files. Address fixture/test defects within this scope; report production defects instead of silently changing auth behavior.

- [ ] **Step 4: Record only achieved evidence in the execution receipt.** Include command names, actual totals/results, review verdicts, any bounded API/fixture corrections, and remaining release gates. Explicitly state that synthetic public-helper login success is not a full OAuth callback success; cancellation callbacks prove state and Arc finish rejection/settlement without external exchange. Default-signup success for a changed subject/new email is a failed preservation scenario. C3 completion does not configure Secrets, establish original provider subject continuity, recover/export/restore real data, verify Paid status, enable Research, change DNS, or complete cutover. Root decides the reviewed commit/backup separately under existing authorization.

## Coverage and source evidence

| Required acceptance | Concrete execution |
| --- | --- |
| Both linked providers preserve one owner, account IDs and business identity | C3.1 actual `handleOAuthUserInfo` twice, changed email pointing at other owner, exact preserved rows |
| Missing mapping cannot be accepted as preserved identity | C3.1 exact helper errors, zero sessions/accounts created under guard; explicit default-signup counterexample; orphan precondition refusal |
| Fresh tokens use the new key; omitted refresh has no stale value | C3.2 actual `symmetricEncrypt`/`symmetricDecrypt`, matching rotation versions, old-key negative control, omitted/supplied refresh cases |
| Old signature versus deleted session versus fresh session | C3.2 actual `/get-session`, valid row before cleanup, old/new signatures separately, fresh helper-created original-owner session |
| Genuine OAuth state issuance, consumption and reset | C3.3 actual `/sign-in/social`, actual `/callback/{provider}`, both providers, hashed stored identifier, current-key state cookie replay, `access_denied` controls |
| All four old Arc intent states inert, including expired consumed/completing | C3.4 real handlers/repository and C3.5 callback after hook; exact reset/history rows remain |
| Old/new signed proof cannot resurrect reset intent | C3.4 actual `/link-social` middleware; C3.5 valid transport state consumed, exact Arc rejection and unchanged DB evidence |
| Preserved completing mapping remains authoritative | C3.4 both linked accounts listed under original owner; start returns existing-target conflict; no mapping removed/duplicated |
| Missing target can begin and continue a fresh flow | C3.4 fresh production `start`; C3.5 production `continue` from explicit synthetic verified grant plus real target callback settlement |
| Null scopes, cross-owner access and bypass | C3.4/C3.5 actual account list/handlers/callback, plus pre-existing direct-route bypass and hook/service/repository regression suites in C3.6 |
| Cleanup invariants and helper compatibility stay intact | Existing C1/C2 and schema regression suites included unchanged in C3.6 |

Read-only local source evidence, inspected during drafting:

- `app/server/auth/runtime.ts`: production options retain encrypted tokens, database state, hashed identifiers, Arc hooks and real Drizzle adapter; hook repository gets `env.DB` through `getD1` separately from injected Drizzle.
- `app/server/auth/session.ts`: `requireArcUser(headers, readSession)` supports the actual `auth.api.getSession` reader.
- `app/server/account-link/http.ts`: injectable `AccountLinkProductionRuntime`; actual start/continue invoke server-side `auth.api.linkSocialAccount` with an internal proof; actual limiter/event sink use the fixture D1.
- `app/server/account-link/auth-hooks.ts`: `loadBoundIntent`, authoritative session and credential validation; before hook requires the internal proof; after hook validates OAuth proof/owner/intent and settles cancellation.
- `app/server/account-link/service.ts` / `d1-repository.ts`: failed state cannot continue, current mappings stop a duplicate start, historical intent fields survive cleanup; service/queries are not substituted in the new tests.
- `node_modules/better-auth/dist/oauth2/link-account.mjs`: public helper errors are literal **`account not linked`** and **`signup disabled`**, not underscore codes. Ordinary callback routing converts helper text to URL error codes; these tests assert the helper's actual contract.
- `node_modules/better-auth/dist/db/internal-adapter.mjs:429`: provider subject/owner join precedes email fallback. C1 refuses orphaned ownership before auth; C3.1 never counts fallback from absent ownership as success.
- `node_modules/@better-auth/core/dist/context/index.d.mts`: public `runWithRequestState` and `runWithEndpointContext`; request-scoped `getOAuthState` otherwise throws. The helper uses both scopes to execute real account-create hooks on the explicit signup counterexample.
- `node_modules/better-auth/dist/state.mjs`: signed state cookie + hashed verification storage; verification lookup and signature precede consumption; callback state is parsed before provider exchange in `api/routes/callback.mjs`.
- `node_modules/better-auth/dist/api/routes/session.mjs`: signed token validation and authoritative DB lookup; `disableCookieCache` and `disableRefresh` suppress unrelated session refresh effects.
- `node_modules/better-auth/dist/api/routes/account.mjs`: null `scope` maps to `scopes: []`; account listing uses the authenticated session's user.
- `node_modules/better-auth/dist/crypto/index.mjs` and `@better-auth/core/dist/types/secret.d.mts`: `$ba$` envelope requires `SecretConfig`, with `keys`, `currentVersion`, optional `legacySecret`. Same-version old/new contexts distinguish cryptographic mismatch from version/encoding errors.
- `node_modules/better-call/dist/cookies.d.mts`: public `serializeSignedCookie(key, value, secret, options)`; cookie names/attributes are taken from the actual auth context.
- `node_modules/better-auth/dist/api/dispatch.mjs` and `node_modules/better-call/dist/to-response.mjs`: after-hook APIError response replacement retains the original callback status; the planned 302 denial has mandatory exact error body and absent Location. Direct before-hook denial is still 403.

## Draft self-review and execution receipt

Drafting is read-only except this plan. No acceptance test, runtime probe, build, commit, provider request or cloud write was executed by the plan author. Existing C1/C2 results belong to their recorded checkpoint, not this unexecuted C3 plan.

- [x] Checked both parent specs and mapped every remaining C3 requirement to a task above.
- [x] Inspected installed exports and relevant real source before selecting public APIs; no internal deep-import workaround or query mock is proposed.
- [x] Kept fixture secrets/rotation explicit, telemetry disabled, Date fixed, fetch denied, `env.DB` descriptor restored, and databases closed.
- [x] Distinguished diagnostic signup blocking from application default signup; captured the fresh-user counterexample explicitly.
- [x] Distinguished helper identity results, actual state/cookie validation, and actual Arc cancellation finish from successful external OAuth exchange.
- [x] Planned exact failure reasons with positive controls, unchanged DB evidence, and no acceptance of orphan fallback.
- [x] Kept production code, dependency versions, engine declarations, migrations and remote resources outside the edit map.
- [x] Checked code names/signatures across tasks and scanned the plan for incomplete implementation placeholders.
- [x] C3.1 actual result and independent reviews recorded by root.
- [x] C3.2 actual result and independent reviews recorded by root.
- [x] C3.3 actual result and independent reviews recorded by root.
- [x] C3.4 actual result and independent reviews recorded by root.
- [ ] C3.5 actual result and independent reviews recorded by root.
- [ ] C3.6 actual integrated results and final SPEC then QUALITY verdicts recorded by root.

The public API shapes are source-checked; handler transport integration remains to be executed. Predicted 200/302/303/403/409 statuses and exact denial codes above are acceptance expectations, not observed results. An installed-library discrepancy must be diagnosed and recorded; do not broaden assertions to accept whatever appears. Local authorization and the chosen subagent/review workflow are already established, so no new execution-choice or approval question is needed.
