# Arc. Secure Cross-Email Account Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a function-first Sites version 7 in which an Arc. user can safely link different-email Google and GitHub identities only after current-provider OAuth reauthentication and a five-minute, single-use server grant.

**Architecture:** Add an owner-scoped D1 intent state machine, high-entropy HttpOnly browser credential, domain-separated signed internal/OAuth contexts, and a server-only gateway in front of Better Auth. Better Auth remains responsible for provider OAuth state and the final account row, while Arc. hooks deny direct linking, prevent source reauthentication from creating a new identity, and settle intent callbacks. Build and test the complete backend path before replacing the version 6 account-menu interaction; visual polish follows functional verification.

**Tech Stack:** TypeScript 5.9, React 19, Next/Vinext 16 routes, Better Auth 1.6.24, Cloudflare Workers Web Crypto, D1, Drizzle ORM/Kit, Zod 4, Vitest, Testing Library, ESLint, Sites hosting.

---

## Plan boundary and execution order

This plan implements the single subsystem approved in `docs/superpowers/specs/2026-08-01-arc-secure-cross-email-account-linking-design.md`. It does not add account merging, password login, passkeys, provider transfer, or unrelated account settings.

The order is deliberate:

1. persistence and state invariants;
2. credentials and signed proof boundaries;
3. repository atomicity;
4. service and Better Auth enforcement;
5. browser-facing routes;
6. functional UI;
7. accessibility and presentation;
8. full verification and a saved, unpublished Sites version 7.

No public deployment occurs in this plan. Publishing version 7 remains a separately approved action.

## Locked file structure

| Path | Responsibility |
| --- | --- |
| `db/schema.ts` | Drizzle declaration for `account_link_intents` |
| `drizzle/0001_secure_account_linking.sql` | additive D1 migration |
| `app/server/account-link/contracts.ts` | providers, statuses, safe responses, stable errors, timing constants |
| `app/server/account-link/crypto.ts` | credential hashing and domain-separated internal/OAuth signed contexts |
| `app/server/account-link/cookie.ts` | host-only HttpOnly credential cookie serialization and parsing |
| `app/server/account-link/repository.ts` | intent repository port |
| `app/server/account-link/d1-repository.ts` | D1 compare-and-set implementation |
| `app/server/account-link/service.ts` | start, status, continue, and callback orchestration |
| `app/server/account-link/auth-hooks.ts` | Better Auth direct-call guard, source-create denial, callback settlement |
| `app/server/account-link/http.ts` | dependency-injected route handlers and safe error mapping |
| `app/api/account-link/start/route.ts` | begin source-provider reauthentication |
| `app/api/account-link/status/route.ts` | safe status projection |
| `app/api/account-link/continue/route.ts` | atomically consume grant and begin target OAuth |
| `app/api/auth/[...all]/route.ts` | explicit HTTP denial of direct `link-social` bypass |
| `app/components/account/account-link-panel.tsx` | confirmation and verified continuation controls |
| `app/components/account/account-menu.tsx` | provider discovery, account-link status, notices, and integration |
| `app/globals.css` | restrained account-link state styling after functionality passes |

Test files mirror these boundaries under `tests/db`, `tests/server`, `tests/api`, and `tests/components`.

### Task 1: Establish the clean baseline and additive D1 schema

**Files:**
- Modify: `db/schema.ts`
- Create: `drizzle/0001_secure_account_linking.sql`
- Create: `drizzle/meta/0001_snapshot.json`
- Modify: `drizzle/meta/_journal.json`
- Modify: `tests/db/schema.test.ts`

- [ ] **Step 1: Confirm the existing branch baseline before product changes**

Run:

```powershell
npm run test:unit
npm run lint
npx tsc --noEmit
git status --short --branch
```

Expected: 51 test files and 244 tests pass, ESLint and TypeScript exit 0, and the worktree contains no product-code changes. If the count has legitimately increased, record the new passing baseline rather than weakening a test.

- [ ] **Step 2: Write the failing schema assertions**

Add `"account_link_intents"` to `expectedTableNames`, add `schema.accountLinkIntents` to `userOwnedTables`, and extend the uniqueness test:

```ts
expect(indexNames(schema.accountLinkIntents)).toEqual(expect.arrayContaining([
  "account_link_intents_token_idx",
  "account_link_intents_user_target_idx",
  "account_link_intents_expiry_idx",
]));
```

- [ ] **Step 3: Run the schema test and verify RED**

Run:

```powershell
npm run test:unit -- tests/db/schema.test.ts
```

Expected: FAIL because `accountLinkIntents` is not exported.

- [ ] **Step 4: Add the Drizzle table**

Append to `db/schema.ts`:

```ts
export const accountLinkIntents = sqliteTable("account_link_intents", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sourceProvider: text("source_provider", { enum: ["google", "github"] }).notNull(),
  targetProvider: text("target_provider", { enum: ["google", "github"] }).notNull(),
  status: text("status", {
    enum: ["pending_reauth", "verified", "consumed", "completed", "failed", "expired"],
  }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
  consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  failureCode: text("failure_code"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
}, (table) => [
  uniqueIndex("account_link_intents_token_idx").on(table.tokenHash),
  index("account_link_intents_user_target_idx").on(
    table.userId,
    table.targetProvider,
    table.status,
  ),
  index("account_link_intents_expiry_idx").on(table.status, table.expiresAt),
]);
```

- [ ] **Step 5: Generate and inspect the migration**

Run:

```powershell
npm run db:generate -- --name secure_account_linking
Get-Content -Raw drizzle/0001_secure_account_linking.sql
```

Expected: the migration creates only `account_link_intents` and its indexes. It must not contain `DROP TABLE`, `DROP COLUMN`, changes to existing user data, or an update of existing OAuth accounts.

- [ ] **Step 6: Run schema verification and commit**

Run:

```powershell
npm run test:unit -- tests/db/schema.test.ts
git diff --check
git add db/schema.ts drizzle/0001_secure_account_linking.sql drizzle/meta/0001_snapshot.json drizzle/meta/_journal.json tests/db/schema.test.ts
git commit -m "feat: add account link intent schema"
```

Expected: schema tests pass and the commit contains only additive persistence changes.

### Task 2: Define the account-link contract and lifecycle

**Files:**
- Create: `app/server/account-link/contracts.ts`
- Create: `tests/server/account-link-contracts.test.ts`

- [ ] **Step 1: Write lifecycle tests first**

Create tests that assert provider parsing, public projection, timing, and transition rules:

```ts
import { describe, expect, it } from "vitest";
import {
  PENDING_REAUTH_TTL_MS,
  VERIFIED_GRANT_TTL_MS,
  accountLinkProviderSchema,
  canTransitionAccountLink,
  projectAccountLinkIntent,
} from "../../app/server/account-link/contracts";

describe("account-link contracts", () => {
  it("accepts only the configured social providers", () => {
    expect(accountLinkProviderSchema.parse("google")).toBe("google");
    expect(accountLinkProviderSchema.parse("github")).toBe("github");
    expect(() => accountLinkProviderSchema.parse("email-password")).toThrow();
  });

  it("locks the approved deadlines", () => {
    expect(PENDING_REAUTH_TTL_MS).toBe(10 * 60 * 1000);
    expect(VERIFIED_GRANT_TTL_MS).toBe(5 * 60 * 1000);
  });

  it("allows only the approved state transitions", () => {
    expect(canTransitionAccountLink("pending_reauth", "verified")).toBe(true);
    expect(canTransitionAccountLink("verified", "consumed")).toBe(true);
    expect(canTransitionAccountLink("consumed", "completed")).toBe(true);
    expect(canTransitionAccountLink("consumed", "verified")).toBe(false);
    expect(canTransitionAccountLink("completed", "verified")).toBe(false);
  });

  it("projects no secret or ownership-bearing fields", () => {
    expect(projectAccountLinkIntent({
      status: "verified",
      targetProvider: "google",
      expiresAt: new Date("2026-08-01T12:05:00.000Z"),
    })).toEqual({
      stage: "verified",
      targetProvider: "google",
      expiresAt: "2026-08-01T12:05:00.000Z",
    });
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
npm run test:unit -- tests/server/account-link-contracts.test.ts
```

Expected: FAIL because the account-link contract module does not exist.

- [ ] **Step 3: Implement the complete contract module**

Create `app/server/account-link/contracts.ts`:

```ts
import { z } from "zod";

export const accountLinkProviderSchema = z.enum(["google", "github"]);
export type AccountLinkProvider = z.infer<typeof accountLinkProviderSchema>;

export const accountLinkStatusSchema = z.enum([
  "pending_reauth",
  "verified",
  "consumed",
  "completed",
  "failed",
  "expired",
]);
export type AccountLinkStatus = z.infer<typeof accountLinkStatusSchema>;

export const accountLinkPhaseSchema = z.enum(["reauth", "target"]);
export type AccountLinkPhase = z.infer<typeof accountLinkPhaseSchema>;

export const startAccountLinkSchema = z.object({
  targetProvider: accountLinkProviderSchema,
}).strict();

export const safeAccountLinkStatusSchema = z.object({
  stage: accountLinkStatusSchema.nullable(),
  targetProvider: accountLinkProviderSchema.nullable(),
  expiresAt: z.iso.datetime().nullable(),
}).strict();

export type AccountLinkIntent = {
  id: string;
  tokenHash: string;
  userId: string;
  sourceProvider: AccountLinkProvider;
  targetProvider: AccountLinkProvider;
  status: AccountLinkStatus;
  expiresAt: Date;
  verifiedAt: Date | null;
  consumedAt: Date | null;
  completedAt: Date | null;
  failureCode: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export const PENDING_REAUTH_TTL_MS = 10 * 60 * 1000;
export const VERIFIED_GRANT_TTL_MS = 5 * 60 * 1000;
export const INTERNAL_PROOF_TTL_MS = 60 * 1000;

const transitions: Record<AccountLinkStatus, readonly AccountLinkStatus[]> = {
  pending_reauth: ["verified", "failed", "expired"],
  verified: ["consumed", "failed", "expired"],
  consumed: ["completed", "failed"],
  completed: [],
  failed: [],
  expired: [],
};

export function canTransitionAccountLink(from: AccountLinkStatus, to: AccountLinkStatus) {
  return transitions[from].includes(to);
}

export function projectAccountLinkIntent(
  intent: Pick<AccountLinkIntent, "status" | "targetProvider" | "expiresAt">,
) {
  return safeAccountLinkStatusSchema.parse({
    stage: intent.status,
    targetProvider: intent.targetProvider,
    expiresAt: intent.expiresAt.toISOString(),
  });
}

export class AccountLinkError extends Error {
  constructor(
    readonly code:
      | "NOT_CONFIGURED"
      | "NO_SOURCE_PROVIDER"
      | "ALREADY_CONNECTED"
      | "INVALID_INTENT"
      | "EXPIRED"
      | "REPLAYED"
      | "IDENTITY_MISMATCH"
      | "LINK_CONFLICT"
      | "OAUTH_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "AccountLinkError";
  }
}
```

- [ ] **Step 4: Run tests and commit**

Run:

```powershell
npm run test:unit -- tests/server/account-link-contracts.test.ts
git add app/server/account-link/contracts.ts tests/server/account-link-contracts.test.ts
git commit -m "feat: define account link lifecycle"
```

Expected: contract tests pass.

### Task 3: Implement credential, cookie, and signed-context boundaries

**Files:**
- Create: `app/server/account-link/crypto.ts`
- Create: `app/server/account-link/cookie.ts`
- Create: `tests/server/account-link-crypto.test.ts`

- [ ] **Step 1: Write failing security-boundary tests**

Cover deterministic hashing, tamper rejection, purpose separation, expiry, and cookie flags:

```ts
import { describe, expect, it } from "vitest";
import {
  createAccountLinkCredential,
  createSignedLinkContext,
  hashAccountLinkCredential,
  verifySignedLinkContext,
} from "../../app/server/account-link/crypto";
import {
  ACCOUNT_LINK_COOKIE,
  clearAccountLinkCookie,
  readAccountLinkCookie,
  serializeAccountLinkCookie,
} from "../../app/server/account-link/cookie";

const secret = "s".repeat(32);

describe("account-link security primitives", () => {
  it("creates a high-entropy credential and stores only a stable digest", async () => {
    const credential = createAccountLinkCredential();
    expect(credential).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(await hashAccountLinkCredential(credential)).toHaveLength(64);
  });

  it("rejects tampering, wrong purpose, and expiry", async () => {
    const now = 1_785_564_000_000;
    const token = await createSignedLinkContext(secret, {
      kind: "internal",
      intentId: "intent-1",
      userId: "user-1",
      provider: "google",
      phase: "target",
      issuedAt: now,
      expiresAt: now + 60_000,
      nonce: "nonce-1",
    });
    await expect(verifySignedLinkContext(secret, token, "internal", now + 1)).resolves.toMatchObject({
      intentId: "intent-1",
    });
    await expect(verifySignedLinkContext(secret, `${token}x`, "internal", now + 1)).rejects.toThrow();
    await expect(verifySignedLinkContext(secret, token, "oauth", now + 1)).rejects.toThrow();
    await expect(verifySignedLinkContext(secret, token, "internal", now + 60_001)).rejects.toThrow();
  });

  it("uses a host-only secure HttpOnly same-site cookie", () => {
    const serialized = serializeAccountLinkCookie("credential", 600);
    expect(serialized).toContain(`${ACCOUNT_LINK_COOKIE}=credential`);
    expect(serialized).toContain("Secure");
    expect(serialized).toContain("HttpOnly");
    expect(serialized).toContain("SameSite=Lax");
    expect(serialized).toContain("Path=/");
    expect(serialized).not.toContain("Domain=");
    expect(readAccountLinkCookie(new Headers({ cookie: `${ACCOUNT_LINK_COOKIE}=credential` }))).toBe("credential");
    expect(clearAccountLinkCookie()).toContain("Max-Age=0");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
npm run test:unit -- tests/server/account-link-crypto.test.ts
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement `crypto.ts` with Web Crypto**

Use SHA-256 for the high-entropy credential digest and HKDF-derived HMAC keys. The context schema must include `kind`, `intentId`, `userId`, `provider`, `phase`, `issuedAt`, `expiresAt`, and `nonce`. Derive with:

```ts
const keyMaterial = await crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(secret),
  "HKDF",
  false,
  ["deriveKey"],
);
const key = await crypto.subtle.deriveKey({
  name: "HKDF",
  hash: "SHA-256",
  salt: new TextEncoder().encode("Arc. account link v1"),
  info: new TextEncoder().encode("arc-account-link-internal-proof-v1"),
}, keyMaterial, { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign", "verify"]);
```

Define and export the exact payload type:

```ts
export type SignedLinkContext = {
  kind: "internal" | "oauth";
  intentId: string;
  userId: string;
  provider: AccountLinkProvider;
  phase: AccountLinkPhase;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};
```

Encode the strict Zod-validated JSON payload and signature as base64url segments separated by `.`. `verifySignedLinkContext` must use `crypto.subtle.verify`, require the expected `kind`, require `issuedAt <= now <= expiresAt`, and reject an internal proof whose lifetime exceeds `INTERNAL_PROOF_TTL_MS`. Export `SignedLinkContext`, `createAccountLinkCredential`, `hashAccountLinkCredential`, `createSignedLinkContext`, and `verifySignedLinkContext` with the signatures used by the tests.

- [ ] **Step 4: Implement `cookie.ts`**

Create a dependency-free cookie boundary:

```ts
export const ACCOUNT_LINK_COOKIE = "__Host-arc_link_intent";

export function serializeAccountLinkCookie(value: string, maxAgeSeconds: number) {
  return `${ACCOUNT_LINK_COOKIE}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

export function clearAccountLinkCookie() {
  return `${ACCOUNT_LINK_COOKIE}=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

export function readAccountLinkCookie(headers: Headers): string | null {
  const cookies = headers.get("cookie")?.split(";") ?? [];
  for (const cookie of cookies) {
    const [name, ...rest] = cookie.trim().split("=");
    if (name === ACCOUNT_LINK_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}
```

- [ ] **Step 5: Run tests, scan, and commit**

Run:

```powershell
npm run test:unit -- tests/server/account-link-crypto.test.ts
rg -n "localStorage|sessionStorage|document.cookie" app/server/account-link tests/server/account-link-crypto.test.ts
git add app/server/account-link/crypto.ts app/server/account-link/cookie.ts tests/server/account-link-crypto.test.ts
git commit -m "feat: secure account link credentials"
```

Expected: tests pass and the scan returns no browser storage or JavaScript cookie writes.

### Task 4: Build the D1 intent repository with atomic transitions

**Files:**
- Create: `app/server/account-link/repository.ts`
- Create: `app/server/account-link/d1-repository.ts`
- Create: `tests/server/d1-account-link-repository.test.ts`

- [ ] **Step 1: Define the repository port in the failing test**

Test these observable operations with a Fake D1 harness: create invalidates an older active user-target intent; find is user and digest scoped; verify updates only a non-expired `pending_reauth` row; consume changes exactly one `verified` row; terminal states cannot revive; settle records only sanitized codes.

The repository interface is:

```ts
export interface AccountLinkRepository {
  create(input: {
    id: string;
    tokenHash: string;
    userId: string;
    sourceProvider: AccountLinkProvider;
    targetProvider: AccountLinkProvider;
    expiresAt: Date;
    now: Date;
  }): Promise<AccountLinkIntent>;
  findByCredential(userId: string, tokenHash: string, now: Date): Promise<AccountLinkIntent | null>;
  findById(id: string): Promise<AccountLinkIntent | null>;
  markVerified(id: string, userId: string, now: Date, expiresAt: Date): Promise<AccountLinkIntent | null>;
  consume(id: string, userId: string, now: Date): Promise<AccountLinkIntent | null>;
  complete(id: string, userId: string, now: Date): Promise<boolean>;
  fail(id: string, userId: string, code: string, now: Date): Promise<boolean>;
}
```

- [ ] **Step 2: Run the repository test and verify RED**

Run:

```powershell
npm run test:unit -- tests/server/d1-account-link-repository.test.ts
```

Expected: FAIL because the repository modules do not exist.

- [ ] **Step 3: Implement row parsing and owner-scoped reads**

In `d1-repository.ts`, inject `D1Database` and map snake-case rows to `AccountLinkIntent`. `findByCredential` must first mark an expired active row with a conditional update, then select using both `user_id` and `token_hash`. It must never select by the token hash alone.

- [ ] **Step 4: Implement transactional create**

Use one `db.batch` to invalidate older `pending_reauth` or `verified` intents for the same user-target pair and insert the new row:

```sql
UPDATE account_link_intents
SET status = 'failed', failure_code = 'SUPERSEDED', updated_at = ?1
WHERE user_id = ?2 AND target_provider = ?3
  AND status IN ('pending_reauth', 'verified');
```

The following INSERT contains only the hashed credential and approved fields. The raw credential is never an argument to this repository.

- [ ] **Step 5: Implement compare-and-set transitions**

`markVerified` must use:

```sql
UPDATE account_link_intents
SET status = 'verified', verified_at = ?1, expires_at = ?2, updated_at = ?1
WHERE id = ?3 AND user_id = ?4
  AND status = 'pending_reauth' AND expires_at > ?1;
```

`consume` must use:

```sql
UPDATE account_link_intents
SET status = 'consumed', consumed_at = ?1, updated_at = ?1
WHERE id = ?2 AND user_id = ?3
  AND status = 'verified' AND expires_at > ?1;
```

Only `meta.changes === 1` may return the updated intent. `complete` accepts only `consumed`; `fail` accepts only active nonterminal states and stores a code matching `/^[A-Z][A-Z0-9_]{0,63}$/u`.

- [ ] **Step 6: Prove concurrency behavior and commit**

Run:

```powershell
npm run test:unit -- tests/server/d1-account-link-repository.test.ts
git add app/server/account-link/repository.ts app/server/account-link/d1-repository.ts tests/server/d1-account-link-repository.test.ts
git commit -m "feat: add atomic account link intents"
```

Expected: all repository tests pass, including the second consume returning `null`.

### Task 5: Implement the function-first account-link service

**Files:**
- Create: `app/server/account-link/service.ts`
- Create: `tests/server/account-link-service.test.ts`

- [ ] **Step 1: Write service tests with injected dependencies**

Test:

- start selects the one connected source provider and rejects an already connected target;
- start creates a pending intent, returns a source authorization URL, and returns the raw credential only to the HTTP cookie boundary;
- status returns only stage, target, and expiry;
- continue atomically consumes a verified grant before starting target OAuth;
- a failed or replayed consume never calls Better Auth;
- callback settlement validates user, provider, phase, cookie digest, signed OAuth context, status, and deadline;
- source success marks verified for exactly five minutes;
- target success marks completed;
- target conflict maps to `LINK_CONFLICT` without exposing provider text.

Use a dependency type with no global runtime access:

```ts
type AccountLinkServiceDependencies = {
  repository: AccountLinkRepository;
  listAccounts: (headers: Headers) => Promise<AccountLinkProvider[]>;
  startProviderLink: (input: {
    headers: Headers;
    provider: AccountLinkProvider;
    phase: AccountLinkPhase;
    intent: AccountLinkIntent;
    internalProof: string;
  }) => Promise<{ url: string; headers: Headers }>;
  createCredential: () => string;
  hashCredential: (value: string) => Promise<string>;
  createProof: (input: SignedLinkContext) => Promise<string>;
  verifyProof: (token: string, kind: "internal" | "oauth", now: number) => Promise<SignedLinkContext>;
  createId: () => string;
  now: () => Date;
};
```

- [ ] **Step 2: Run the service test and verify RED**

Run:

```powershell
npm run test:unit -- tests/server/account-link-service.test.ts
```

Expected: FAIL because `AccountLinkService` does not exist.

- [ ] **Step 3: Implement `start`**

`start(headers, userId, targetProvider)` must:

1. parse the target provider;
2. read connected accounts from the authoritative session context;
3. reject if target is already connected;
4. choose the configured connected provider other than the target as source;
5. create a random credential and hash it;
6. create a pending intent expiring at `now + PENDING_REAUTH_TTL_MS`;
7. create a 60-second internal proof with phase `reauth`;
8. call `startProviderLink` for the source;
9. return `{ intent, credential, authorizationUrl, authHeaders }`.

If provider-link start fails after intent creation, mark the intent `OAUTH_START_FAILED` before rethrowing.

- [ ] **Step 4: Implement `status` and `continue`**

`status(userId, credential)` hashes the credential, looks up the owner-scoped intent, and calls `projectAccountLinkIntent`. A missing credential returns the all-null safe status. The HTTP layer returns a terminal projection once, then clears the credential cookie; a later refresh therefore has neither a stale notice nor a reusable credential.

`continue(headers, userId, credential)` must find the intent, verify `verified`, atomically consume it, create a 60-second target proof, and only then call `startProviderLink`. If Better Auth start fails, mark the consumed intent failed; never transition it back to verified.

- [ ] **Step 5: Implement callback settlement**

Expose `settleCallback` with explicit inputs rather than passing a Better Auth middleware context into the domain service:

```ts
await service.settleCallback({
  headers,
  oauthContextToken,
  provider,
  linkUserId,
  outcome: { kind: "success" } | { kind: "error"; code: string },
});
```

It verifies the signed `oauth` context, hashes the HttpOnly credential, and binds the D1 row to `intentId`, `userId`, `provider`, and phase. Reauth requires the pending-intent deadline to remain valid. Target settlement requires a still-consumed intent and valid one-time Better Auth OAuth state; it does not reuse the already-consumed five-minute grant deadline. It then performs only these transitions:

- reauth success: `pending_reauth -> verified`, deadline `now + VERIFIED_GRANT_TTL_MS`;
- target success: `consumed -> completed`;
- recognized error: active state -> failed with a sanitized code;
- any mismatch: no success transition and `IDENTITY_MISMATCH`.

- [ ] **Step 6: Run service tests and commit**

Run:

```powershell
npm run test:unit -- tests/server/account-link-service.test.ts
git add app/server/account-link/service.ts tests/server/account-link-service.test.ts
git commit -m "feat: orchestrate secure account linking"
```

Expected: service tests pass and mocks prove Better Auth is not called after a failed consume.

### Task 6: Guard Better Auth and settle real OAuth callbacks

**Files:**
- Create: `app/server/account-link/auth-hooks.ts`
- Modify: `app/server/auth/runtime.ts`
- Modify: `tests/server/auth-runtime.test.ts`
- Create: `tests/server/account-link-auth-hooks.test.ts`

- [ ] **Step 1: Write failing runtime-policy tests**

Update the existing runtime test to require:

```ts
expect(options.account).toMatchObject({
  accountLinking: {
    enabled: true,
    disableImplicitLinking: true,
    allowDifferentEmails: true,
    updateUserInfoOnLink: false,
  },
});
expect(options.hooks?.before).toBeTypeOf("function");
expect(options.hooks?.after).toBeTypeOf("function");
expect(options.databaseHooks?.account?.create?.before).toBeTypeOf("function");
```

Write focused auth-hook tests proving:

- `/link-social` without a valid internal proof is rejected;
- the current session user, proof user, intent user, provider, phase, and intent status must match;
- browser-supplied `additionalData` is discarded and replaced with a signed server OAuth context;
- reauth callback context blocks creation of a previously unowned source provider account;
- target callback context allows Better Auth to create the target account;
- success and error callback locations call the correct settlement branch.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
npm run test:unit -- tests/server/auth-runtime.test.ts tests/server/account-link-auth-hooks.test.ts
```

Expected: FAIL because different-email linking is still disabled and hooks are absent.

- [ ] **Step 3: Implement the core before hook**

Use `createAuthMiddleware` and `getAuthoritativeSessionFromCtx` from `better-auth/api`. For paths other than `/link-social`, return without mutation. For `/link-social`:

1. read `x-arc-link-proof` from `ctx.headers`;
2. verify the 60-second `internal` proof;
3. read the authoritative Arc. session;
4. load the intent by proof `intentId`;
5. bind session user, intent user, request provider, proof provider, proof phase, and expected status (`pending_reauth` for source, `consumed` for target);
6. create an `oauth` signed context: reauth uses the pending intent's ten-minute deadline, while target uses `now + 10 minutes` to match Better Auth's bounded OAuth-state lifetime after the five-minute grant has already been consumed;
7. replace `ctx.body.additionalData` with `{ arcLinkContext: oauthToken }`.

Throw a stable Better Auth `APIError` for every denial. Never log the proof or additional data.

Use these server-issued result URLs so callback classification has one meaning:

- reauth success: `/today?link=verified`
- reauth error: `/today?link=error&stage=reauth`
- target success: `/today?link=complete`
- target error: `/today?link=error&stage=target`

No URL contains an intent ID, raw credential, signed context, provider account ID, or email.

- [ ] **Step 4: Prevent source reauthentication from adding an identity**

The account `create.before` database hook calls `getOAuthState()`, validates `arcLinkContext`, and returns `false` only when the validated context phase is `reauth`. This is critical: a user selecting a different, previously unowned GitHub or Google account during source verification must not attach it to the Arc. user. A reauth flow succeeds only through Better Auth's existing-account branch for an identity already owned by the same Arc. user.

For target phase, return `true` so Better Auth may create the final account subject to its unique `(provider_id, account_id)` constraint.

- [ ] **Step 5: Settle callback results in the after hook**

For `/callback/:id`, read `getOAuthState()`. If no `arcLinkContext` exists, leave ordinary sign-in unchanged. If the field exists but its signature, purpose, deadline, intent binding, or provider binding is invalid, fail closed. For a valid context:

- use `ctx.params.id` as provider;
- use `state.link.userId` as the Better Auth link owner;
- use `getAuthoritativeSessionFromCtx(ctx)` and require its current user to match both the state owner and intent owner;
- classify success only when the response `Location` matches the server-issued phase callback URL;
- map provider errors to sanitized `OAUTH_CANCELLED`, `LINK_CONFLICT`, `STATE_INVALID`, or `OAUTH_FAILED`;
- call `settleCallback`;
- replace the outward error query with Arc.'s generic result category when needed.

- [ ] **Step 6: Wire the runtime configuration**

In `buildAuthOptions`, create account-link hooks with `BETTER_AUTH_SECRET` and a lazy `getRepository` closure. The closure calls `getD1()` only while a link request is being processed, so ordinary option construction and existing unit tests do not require a live D1 binding. Then set:

```ts
accountLinking: {
  enabled: true,
  disableImplicitLinking: true,
  trustedProviders: ["google", "github"],
  allowDifferentEmails: true,
  updateUserInfoOnLink: false,
},
hooks: accountLinkHooks.hooks,
databaseHooks: accountLinkHooks.databaseHooks,
```

Do not upgrade Better Auth. Keep encrypted OAuth tokens, database state, trusted origins, secure production cookies, and rate limits unchanged.

- [ ] **Step 7: Run hook and runtime tests and commit**

Run:

```powershell
npm run test:unit -- tests/server/auth-runtime.test.ts tests/server/account-link-auth-hooks.test.ts
git add app/server/account-link/auth-hooks.ts app/server/auth/runtime.ts tests/server/auth-runtime.test.ts tests/server/account-link-auth-hooks.test.ts
git commit -m "feat: guard cross-email auth linking"
```

Expected: direct calls fail closed, source-create denial passes, and existing sign-in policy tests remain green.

### Task 7: Expose only the safe Arc. account-link gateway

**Files:**
- Create: `app/server/account-link/http.ts`
- Create: `app/api/account-link/start/route.ts`
- Create: `app/api/account-link/status/route.ts`
- Create: `app/api/account-link/continue/route.ts`
- Modify: `app/api/auth/[...all]/route.ts`
- Create: `tests/api/account-link.test.ts`
- Create: `tests/api/auth-link-bypass.test.ts`

- [ ] **Step 1: Write failing HTTP contract tests**

Test all routes through injected dependencies:

- unauthenticated start/status/continue return 401;
- a mutating request whose `Origin` does not exactly match the configured Arc. origin returns 403;
- start accepts form data containing only `targetProvider`;
- start returns a 303 provider redirect, Arc. credential cookie, and forwarded Better Auth state cookie;
- status returns only `stage`, `targetProvider`, and `expiresAt` with `Cache-Control: no-store`;
- a terminal status response returns its safe projection once and clears the Arc. credential cookie;
- continue returns 303 only after the service reports atomic consumption;
- expired/replayed continue returns a safe 409 and clears the Arc. credential cookie;
- direct HTTP `POST /api/auth/link-social` returns 403 and never reaches the Better Auth handler;
- rate limits fail closed: start allows 5 attempts per user per 10 minutes, continue allows 10 per user per 10 minutes, and status allows 60 reads per user per minute;
- request or response bodies never contain credential, token hash, proof, provider account ID, or email.

- [ ] **Step 2: Run the route tests and verify RED**

Run:

```powershell
npm run test:unit -- tests/api/account-link.test.ts tests/api/auth-link-bypass.test.ts
```

Expected: FAIL because the gateway routes do not exist.

- [ ] **Step 3: Implement dependency-injected handlers**

Export `createAccountLinkHandlers(deps)` from `http.ts`. Dependencies include `requireUser`, `service`, `readCredential`, cookie serializers, `RateLimiter`, configured Arc. origin, request ID creation, and sanitized event recording. Before a mutating operation, require `new URL(request.headers.get("origin") ?? "invalid:").origin === configuredOrigin`; do not trust a callback URL or origin supplied in the request body. Reserve the documented user-scoped rate bucket before calling the service and fail closed if D1 cannot reserve it. Map errors exactly:

| Domain code | HTTP | Browser-safe message |
| --- | ---: | --- |
| unauthenticated | 401 | `Sign in again to continue.` |
| invalid input | 400 | `Choose a valid sign-in method.` |
| invalid origin | 403 | `This request could not be verified.` |
| already connected | 409 | `That sign-in method is already connected.` |
| expired | 409 | `Verification expired. Start again.` |
| replayed or invalid intent | 409 | `Connection wasn't completed. Start again.` |
| rate limited | 429 | `Too many attempts. Wait before trying again.` |
| unavailable | 503 | `Connection could not start. Try again.` |
| unexpected | 500 | `Connection could not be completed. Nothing changed.` |

Every response uses `apiJson` or `apiError`, `Cache-Control: no-store`, and `X-Request-Id`.

- [ ] **Step 4: Preserve multiple Set-Cookie headers on redirects**

Create a small response helper in `http.ts` that copies all Better Auth response headers, appends the Arc. cookie, sets `Location`, `Cache-Control: no-store`, and returns status 303. Do not concatenate cookies with commas.

- [ ] **Step 5: Add the three route modules**

Each route is `dynamic = "force-dynamic"`, creates production dependencies from `getD1()`, `getAuth()`, `requireArcUser`, the repository, crypto functions, and operational event sink, then exports only its required method:

- `start/route.ts`: `POST`
- `status/route.ts`: `GET`
- `continue/route.ts`: `POST`

- [ ] **Step 6: Deny the legacy direct HTTP link endpoint**

Before forwarding `POST` in `app/api/auth/[...all]/route.ts`, test the normalized pathname:

```ts
export function isDirectAccountLinkRequest(request: Request) {
  return new URL(request.url).pathname === "/api/auth/link-social";
}

export async function POST(request: Request) {
  if (isDirectAccountLinkRequest(request)) {
    return new Response("Forbidden", {
      status: 403,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return toNextJsHandler(getAuth()).POST(request);
}
```

The server gateway uses `getAuth().api.linkSocialAccount` in-process and therefore does not traverse this public catch-all route. The Better Auth before hook remains the second enforcement layer.

- [ ] **Step 7: Run gateway tests and commit the functional backend**

Run:

```powershell
npm run test:unit -- tests/api/account-link.test.ts tests/api/auth-link-bypass.test.ts tests/server/account-link-service.test.ts tests/server/account-link-auth-hooks.test.ts
npx tsc --noEmit
git add app/server/account-link/http.ts app/api/account-link app/api/auth/[...all]/route.ts tests/api/account-link.test.ts tests/api/auth-link-bypass.test.ts
git commit -m "feat: expose secure account link gateway"
```

Expected: the complete backend start -> verify -> five-minute grant -> consume -> target link contract is testable without UI, and TypeScript passes.

### Task 8: Replace direct linking with the explicit two-stage UI

**Files:**
- Create: `app/components/account/account-link-panel.tsx`
- Modify: `app/components/account/account-menu.tsx`
- Modify: `tests/components/account-menu.test.tsx`
- Create: `tests/components/account-link-panel.test.tsx`

- [ ] **Step 1: Write failing interaction tests**

Require these behaviors:

- `Link Google` opens a confirmation panel instead of calling `authClient.linkSocial`;
- the panel says the user must verify the connected source provider;
- `Verify GitHub` is a POST form targeting `/api/account-link/start` with hidden `targetProvider=google`;
- a safe status response of `verified` renders `Identity verified` and a POST form targeting `/api/account-link/continue`;
- rendering or GET status never starts target OAuth;
- duplicate actions are disabled while the form is submitting;
- completed, expired, cancelled, conflict, and generic failures use approved copy;
- callback query parameters are removed with `history.replaceState` after the notice is captured;
- connected provider data refreshes after success.

- [ ] **Step 2: Run component tests and verify RED**

Run:

```powershell
npm run test:unit -- tests/components/account-menu.test.tsx tests/components/account-link-panel.test.tsx
```

Expected: FAIL because version 6 still calls `authClient.linkSocial` directly.

- [ ] **Step 3: Implement the focused panel**

`AccountLinkPanel` receives `sourceProvider`, `targetProvider`, `stage`, `expiresAt`, `onCancel`, and `onSubmit`. It renders one primary action:

```tsx
{stage === "verified" ? (
  <form action="/api/account-link/continue" method="post" onSubmit={onSubmit}>
    <strong>Identity verified</strong>
    <p>Continue within five minutes to connect {targetLabel}.</p>
    <button type="submit">Continue to {targetLabel}</button>
  </form>
) : (
  <form action="/api/account-link/start" method="post" onSubmit={onSubmit}>
    <input name="targetProvider" type="hidden" value={targetProvider} />
    <p>You're signed in with {sourceLabel}. Verify {sourceLabel} before linking {targetLabel}.</p>
    <button type="submit">Verify {sourceLabel}</button>
  </form>
)}
```

Add a secondary `Cancel` button. Do not put a credential, intent ID, proof, email, or callback state in the DOM.

- [ ] **Step 4: Refactor `AccountMenu`**

Remove `authClient.linkSocial` and `activeProvider`. Keep `listAccounts` for provider display. Add a safe GET to `/api/account-link/status`, parse it with `safeAccountLinkStatusSchema`, and derive the source from connected providers. Clicking `Link` sets the target and opens the panel.

Map URL outcomes through the safe status target rather than hard-coding one direction:

```ts
function accountLinkNotice(
  result: "complete" | "verified" | "expired" | "cancelled" | "conflict" | "error",
  target: AuthProvider | null,
) {
  if (result === "complete" && target) {
    return `${providerLabel(target)} connected. You can now sign in with either provider.`;
  }
  if (result === "verified") return "Identity verified. Continue within five minutes.";
  if (result === "expired") return "Verification expired. Start again.";
  if (result === "cancelled") return "Connection cancelled. Nothing changed.";
  if (result === "conflict") return "This sign-in method can't be connected to this account.";
  return "We couldn't connect this sign-in method. Nothing changed.";
}
```

Generate the success provider label from the safe target provider, not an email or callback error. Continue to delete `link`, `error`, and `error_description` from the URL after capture.

- [ ] **Step 5: Run UI tests and commit the functional experience**

Run:

```powershell
npm run test:unit -- tests/components/account-menu.test.tsx tests/components/account-link-panel.test.tsx
git add app/components/account/account-link-panel.tsx app/components/account/account-menu.tsx tests/components/account-menu.test.tsx tests/components/account-link-panel.test.tsx
git commit -m "feat: add verified account link flow"
```

Expected: UI tests pass, no component calls Better Auth linking directly, and target OAuth starts only through a user-submitted POST.

### Task 9: Add accessibility, privacy diagnostics, and restrained presentation

**Files:**
- Modify: `app/components/account/account-link-panel.tsx`
- Modify: `app/components/account/account-menu.tsx`
- Modify: `app/globals.css`
- Modify: `tests/components/account-link-panel.test.tsx`
- Modify: `tests/components/accessibility-contracts.test.tsx`
- Modify: `app/server/observability/events.ts`
- Modify: `tests/server/operational-events.test.ts`
- Modify: `docs/operations/sites-oauth-feasibility.md`

- [ ] **Step 1: Write failing accessibility and privacy tests**

Assert:

- confirmation panel has `role="dialog"`, `aria-modal="true"`, and an accessible heading;
- focus moves to the panel heading on open and returns to the `Link` trigger on cancel;
- result messages use `role="status"` or `role="alert"` appropriately;
- keyboard activation reaches verify, continue, cancel, and dismiss;
- reduced-motion CSS disables account-link transitions;
- sanitized operational events accept phase/result counters but reject counter names containing token, secret, email, user ID, account, or cookie;
- rendered UI contains no provider email from callback data.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
npm run test:unit -- tests/components/account-link-panel.test.tsx tests/components/accessibility-contracts.test.tsx tests/server/operational-events.test.ts
```

Expected: at least the focus and reduced-motion requirements fail.

- [ ] **Step 3: Implement focus and announcement behavior**

Use `useRef` and `useEffect` in the panel to focus a `tabIndex={-1}` heading after open. Pass the trigger element from `AccountMenu` and restore focus on cancel or dismissal. Use a status live region for verified/success and an alert live region for failure. Keep native forms and buttons.

- [ ] **Step 4: Add Warm Precision styling after behavior passes**

Extend the existing account styles with `.account-link-panel`, `.account-link-actions`, and `.account-link-deadline`. Preserve ivory, charcoal, hairline, and signal variables. Use no new visual dependency. Add:

```css
@media (prefers-reduced-motion: reduce) {
  .account-popover,
  .account-link-notice,
  .account-link-panel {
    animation: none;
    transition: none;
  }
}
```

Verify 44px minimum mobile actions and prevent the account popover from overflowing the viewport.

- [ ] **Step 5: Record operational outcomes without sensitive values**

Record only stable categories: `link_intent_created`, `link_source_verified`, `link_grant_consumed`, `link_completed`, `link_conflict`, `link_expired`, `link_replay_denied`, and `link_bypass_denied`. Use the existing hashed `userSurrogate`; counters may include `attempt: 1` but no user, provider account, email, credential, proof, cookie, intent, or callback payload. Extend `sensitiveFieldPattern` in `app/server/observability/events.ts` to reject these counter-name fragments:

```ts
const sensitiveFieldPattern = /(?:token|secret|password|api_?key|authorization|cookie|email|user_?id|role|proof|content|body|account|provider|callback|intent)/iu;
```

- [ ] **Step 6: Update hosted OAuth operations documentation**

In `docs/operations/sites-oauth-feasibility.md`, preserve the version 6 production evidence and add a clearly dated version 7 candidate section. State that cross-email support is implemented locally only after tests actually pass; do not mark hosted linking passed until production verification occurs.

- [ ] **Step 7: Run focused tests and commit**

Run:

```powershell
npm run test:unit -- tests/components/account-link-panel.test.tsx tests/components/accessibility-contracts.test.tsx tests/server/operational-events.test.ts
git add app/components/account/account-link-panel.tsx app/components/account/account-menu.tsx app/globals.css tests/components/account-link-panel.test.tsx tests/components/accessibility-contracts.test.tsx tests/server/operational-events.test.ts docs/operations/sites-oauth-feasibility.md
git commit -m "feat: finish account link recovery states"
```

Expected: accessibility/privacy tests pass and documentation distinguishes local candidate evidence from hosted evidence.

### Task 10: Full security verification and save unpublished Sites version 7

**Files:**
- Modify: `docs/superpowers/plans/2026-08-01-arc-secure-cross-email-account-linking.md`
- Modify only if evidence requires correction: `docs/operations/sites-oauth-feasibility.md`

- [x] **Step 1: Run the complete automated suite**

Run:

```powershell
npm run test:unit
npm run lint
npx tsc --noEmit
npm run build
npm test
```

Expected: all unit/component/API tests pass; ESLint and TypeScript exit 0; the five-stage Vinext build succeeds; rendered HTML tests pass. Record the final test file and test counts without replacing the previous 51/244 baseline history.

- [x] **Step 2: Run migration and secret-boundary scans**

Run:

```powershell
rg -n "DROP TABLE|DROP COLUMN|DELETE FROM users|UPDATE accounts" drizzle/0001_secure_account_linking.sql
rg -n "BETTER_AUTH_SECRET|GOOGLE_CLIENT_SECRET|GITHUB_CLIENT_SECRET|x-arc-link-proof|arcLinkContext|tokenHash" app --glob "*.tsx" --glob "*.css"
rg -n "localStorage|sessionStorage|document.cookie" app/server/account-link app/components/account
git diff --check
```

Expected: the migration scan returns no destructive match; client files contain no server secret/proof field; no browser-readable credential storage exists; Git whitespace check passes.

- [x] **Step 3: Perform local route smoke tests**

Start the app with the existing runtime harness and verify:

1. anonymous status/start/continue are rejected;
2. authenticated start produces source OAuth redirect and both required cookies;
3. direct `/api/auth/link-social` returns 403;
4. a fabricated verified URL does not create a grant;
5. status JSON contains only the three approved fields;
6. no GET navigation starts target OAuth.

Do not claim a provider callback passed from mocks alone.

- [x] **Step 4: Request a code review before release packaging**

Invoke `superpowers:requesting-code-review`. Address any correctness or security finding with `superpowers:receiving-code-review`, then rerun the focused and complete verification commands. Do not waive a finding about identity ownership, replay, expiry, cookie scope, direct bypass, or callback settlement.

- [x] **Step 5: Save, but do not publish, Sites version 7**

Invoke `sites:sites-building` to package the exact verified tree and `sites:sites-hosting` to save a new version for project `appgprj_6a6678d3e3848191a352778c6db1e7b1`. Confirm the version is saved and not public. Keep public version 6 and its prior rollback version untouched.

- [x] **Step 6: Record evidence and commit**

Append an execution-evidence paragraph to this plan with:

- final test counts;
- lint, TypeScript, build, rendered HTML, migration, and secret-scan results;
- review result;
- saved Sites version 7 identifier;
- explicit statement that public production remains version 6.

Run:

```powershell
git add docs/superpowers/plans/2026-08-01-arc-secure-cross-email-account-linking.md docs/operations/sites-oauth-feasibility.md
git commit -m "docs: record account link verification"
git status --short --branch
```

Expected: evidence is committed and the worktree is clean.

- [x] **Step 7: Stop at the deployment approval gate**

Report the saved version, verification evidence, known provider limitation that OAuth may reuse an existing Google/GitHub session, exact production test sequence, and version 6 rollback target. Ask for explicit public-deployment approval. Do not publish version 7 in the same action.

Execution evidence (2026-08-02): the final automated suite passed 60 test files and 510 tests; the focused account-link route/security smoke passed 6 files and 171 tests. ESLint and `tsc --noEmit` exited 0, the five-stage Vinext production build succeeded, and the rendered HTML suite passed 2/2. The additive migration scan, client secret/proof scan, browser-readable credential scan, and `git diff --check` all passed with no prohibited match. The independent release review initially found three Important issues—stale consumed-intent lockout, unreachable ownership-conflict copy, and cancellation that did not revoke the verified grant. Commit `65125a44ec7c7105aaaa16a09d87e81532cc0381` fixes all three with owner/target/status/time-bounded D1 compare-and-set recovery, a settled target-conflict redirect, and an owner/session/origin/cookie-scoped cancellation route; post-fix regression and line-by-line release review found no remaining release blocker. Sites version 7 was saved, not deployed, as `appgprj_6a6678d3e3848191a352778c6db1e7b1~appgver_692d37ca0724819198f151bda4d83846`, sourced from commit `22c5096eb840ce610e0b39df99475b27ccbd9c67`; that source commit preserves the Sites version 6 history and has the exact file tree of verified commit `65125a44ec7c7105aaaa16a09d87e81532cc0381`. Public production remains version 6. Its direct rollback artifact is `appgprj_6a6678d3e3848191a352778c6db1e7b1~appgver_954b8ee1fbb08191b91062090e87d5b2` at source commit `9d14a05a87b7f9c48e67f1082fbf9f86a10fe3c0`.

## Production verification after deployment approval

The user explicitly approved public deployment on 2026-08-02. Execution state:

1. [x] publish the exact saved version 7;
2. [x] confirm an existing Google and an existing GitHub sign-in still reach their correct Arc. users;
3. [x] from a one-provider test user, complete current-provider reauthentication;
4. [x] confirm `Identity verified` and the five-minute continuation state;
5. [ ] link an unowned different-email target identity when a safe test identity is available;
6. [ ] sign out and confirm both providers return to the same Arc. user and learning state;
7. [ ] exercise a target identity already owned by another Arc. user and confirm the generic no-merge result;
8. [ ] verify cancellation, stale grant, replay, and direct bypass leave data unchanged;
9. [ ] inspect sanitized Worker logs for expected account-link categories and absence of credentials/emails;
10. [ ] roll back to version 6 immediately on ownership mutation, bypass, replay, unintended account switch, inaccessible account, or critical UI failure.

Deployment evidence (2026-08-02): Sites deployment `appgdep_6a6f48344d848191bd34fe500e2e4d3a` succeeded for the exact saved version 7 artifact. The public `/today` page opened with the expected Arc. title. A read-only production log smoke observed successful 200 responses for the public page, core RSC routes, session/account-provider APIs, `/api/workspace`, and `/api/account-link/status`; a separate error-only query returned zero events. This completes deployment and non-destructive transport verification, but does not complete checklist steps 2–9 because no real provider authorization or identity ownership mutation was attempted. Version 6 remains available for immediate rollback as `appgprj_6a6678d3e3848191a352778c6db1e7b1~appgver_954b8ee1fbb08191b91062090e87d5b2`.

Authentication edge hardening evidence (2026-08-03): production inspection found Better Auth falling back to a shared per-path rate-limit bucket because its default client-IP header was unavailable, and an independent audit found that raw Better Auth OAuth exceptions could reach the runtime console. Test-first commit `fd28276249f40b2a443d0129d1c834b734e09af8` configures the Cloudflare-owned `cf-connecting-ip` header and fixed, detail-free auth log markers. The release snapshot passed 60 files / 511 tests, ESLint, the five-stage production build, and 2/2 rendered HTML tests. The exact tree was preserved in Sites source commit `242a7fdb14364ffadd66de59c656c9200ee08aa1`, saved as Sites version number 8 (`appgprj_6a6678d3e3848191a352778c6db1e7b1~appgver_86e9c4efe8e881918ecd579584e10e55`), and publicly deployed successfully as `appgdep_6a6f7a4710cc819191dd0d8af31b76dd`. Public route smoke returned 200 for `/today` and `/api/auth/get-session`, the protected account list returned the expected 401, and the error-only Worker query returned zero events. The general Worker log query returned no events after the smoke, so checklist step 9 remains open pending fresh observable runtime evidence. Sites version number 8 is an internal hosting sequence and is not the Arc. product v8 milestone.

Primary-provider retest evidence (2026-08-04): in separate private-window checks, the user signed in with the pre-existing GitHub identity and then the pre-existing Google identity. Each callback reached `/today` without an error result, displayed the expected Arc. account and existing learning state, and signed out cleanly. No `Link` control was opened and no account ownership mutation was attempted. The error-only Worker query remained empty; the general Worker query returned no events, so this completes checklist step 2 but does not complete the runtime-log requirement in step 9.

Current-provider reauthentication evidence (2026-08-04): from the pre-existing one-provider GitHub Arc. user, the user opened `Link Google`, observed the exact GitHub source-provider prompt, and reauthenticated with the same GitHub identity. The callback returned to the `Identity verified` state with the five-minute continuation window and `Continue to Google` action. The user then selected `Cancel` before target OAuth began; the UI reported `Connection cancelled. Nothing changed.`, the provider connections remained unchanged, and GitHub sign-out completed normally. This completes checklist steps 3 and 4 and the cancellation subcase of step 8. A separate unauthenticated direct-bypass probe was intercepted with a 403 at the Cloudflare edge before Arc. application handling could be established, so it is not recorded as application-layer bypass evidence; stale grant, replay, direct application bypass, and the rest of step 8 remain open. The general Worker query still returned no events, so step 9 also remains open.
