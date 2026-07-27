# Arc. Beta Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task in the current task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the device-local Arc. showcase into a public-account and cloud-state foundation with Google/GitHub identity, D1/R2 persistence, safe migration, mock-first AI controls, and production-grade recovery without regressing the public sample.

**Architecture:** Preserve the existing Vinext/React edge-deployed modular monolith. UI and route handlers call focused application services; identity, D1, R2, and AI live behind ports so the same product can move from Sites-managed Cloudflare resources to an owner-controlled Cloudflare account. Anonymous use remains device-local, while authenticated use makes D1 authoritative and keeps a bounded offline queue.

**Tech Stack:** TypeScript 5.9, React 19.2, Next.js 16.2.12 compatibility layer, Vinext 0.0.50, Vite 8.1.5, Cloudflare Workers, D1, R2, Drizzle ORM 0.45, Better Auth 1.6.24, Zod 4.4.3, Vitest 4, Testing Library, GitHub Actions, OpenAI Sites.

---

## Scope and source of truth

Implement against `docs/superpowers/specs/2026-07-28-arc-beta-foundation-design.md`. Where older Arc. documents differ, the 2026-07-28 specification wins for authentication, server-key ownership, quotas, and beta sequencing.

Current authoritative platform references:

- Better Auth Next.js route and server-session integration: <https://better-auth.com/docs/integrations/next>
- Better Auth social providers and security defaults: <https://better-auth.com/docs/basic-usage> and <https://better-auth.com/docs/reference/security>
- Better Auth Drizzle adapter: <https://better-auth.com/docs/beta/adapters/drizzle>
- Drizzle on Cloudflare D1: <https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1>
- Cloudflare D1 prepared statements and migrations: <https://developers.cloudflare.com/d1/worker-api/prepared-statements/> and <https://developers.cloudflare.com/d1/reference/migrations/>

## File map

### Configuration

- Modify `package.json` and `package-lock.json`: pin authentication and validation dependencies and add focused verification scripts.
- Create `.env.example`: document local and hosted runtime configuration without secrets.
- Modify `.openai/hosting.json`: declare `DB` and `PROOF_ASSETS` logical bindings.
- Modify `worker/index.ts`: type the new runtime bindings and apply response-level safety headers.
- Create `docs/operations/sites-oauth-feasibility.md`: record the verified hosting decision and callback contract.

### Contracts and persistence

- Modify `db/schema.ts`: define auth, learner, migration, proof, quota, AI-run, and operational tables.
- Create `db/d1.ts`: expose the raw D1 binding for prepared statements and batches.
- Preserve `db/index.ts`: keep Drizzle access for typed schema and auth adapter usage.
- Generate `drizzle/0000_beta_foundation.sql` plus Drizzle metadata: version the initial beta schema.
- Create `app/contracts/cloud-state.ts`: Zod request/response schemas shared by clients and route handlers.
- Create `app/server/cloud/repository.ts`: persistence port.
- Create `app/server/cloud/service.ts`: import, workspace, setup, completion, and idempotency rules.
- Create `app/server/cloud/d1-cloud-repository.ts`: owner-scoped D1 adapter.

### Identity

- Create `app/server/auth/policy.ts`: provider, callback, origin, and runtime configuration rules.
- Create `app/server/auth/runtime.ts`: Better Auth instance backed by D1/Drizzle.
- Create `app/server/auth/session.ts`: optional and required Arc. session helpers.
- Create `app/lib/auth-client.ts`: Better Auth React client.
- Create `app/api/auth/[...all]/route.ts`: same-origin Better Auth handler.
- Create `app/api/auth/providers/route.ts`: public provider-availability endpoint.
- Create `app/sign-in/page.tsx`: branded Google/GitHub entry surface.
- Create `app/components/account/account-menu.tsx`: anonymous, pending, and signed-in account states.
- Delete `app/chatgpt-auth.ts`: remove the unused ChatGPT identity helper from the Arc. product.

### Cloud-state UI

- Create `app/lib/cloud-client.ts`: typed browser API client.
- Create `app/lib/offline-queue.ts`: bounded, idempotent browser mutation queue.
- Create `app/lib/use-arc-state.ts`: local/cloud state selection and synchronization status.
- Create `app/components/sync/migration-banner.tsx`: explicit import consent and reconciliation result.
- Modify `app/components/brand/site-header.tsx` and `app/components/workspace/workspace-shell.tsx`: add independent Arc. account controls and synchronization state.
- Modify Setup, Path, Today, Stack, and Proof pages to consume the Arc. state hook.

### API, AI controls, proof, and operations

- Create `app/server/http/api-response.ts`: stable error categories and request IDs.
- Create `app/server/http/rate-limit.ts`: D1-backed endpoint rate-limit reservations.
- Create `app/server/http/cloud-route-factories.ts`: injectable authenticated route handlers.
- Create `app/server/observability/events.ts`: sanitized structured operational events.
- Create `app/api/workspace/route.ts`: authenticated snapshot and setup writes.
- Create `app/api/migrations/local-state/route.ts`: authenticated idempotent import.
- Create `app/api/learning/events/route.ts`: authenticated completion mutation.
- Create `app/server/entitlements/policy.ts`: per-user quota, global budget, rate, and kill-switch decisions.
- Create `app/server/ai/contracts.ts`, `gateway.ts`, and `mock-provider.ts`: typed provider boundary and deterministic implementation.
- Create `app/api/intelligence/preview/route.ts`: protected contract exercise without paid AI.
- Create `app/server/proof/storage.ts`, `repository.ts`, `d1-proof-repository.ts`, and `public-view.ts`: private R2 bytes, owner-scoped metadata, and allowlisted publication.
- Create `app/api/proofs/upload/route.ts`, `app/api/proofs/[id]/asset/route.ts`, `app/api/proofs/[id]/sharing/route.ts`, and `app/api/public/proofs/[token]/route.ts`: owner-only assets plus selective, revocable public proof views.
- Create `app/server/admin/policy.ts`, `repository.ts`, and `d1-admin-repository.ts`: allowlisted minimal operational reads.
- Create `app/api/admin/health/route.ts` and `app/admin/page.tsx`: protected service, AI, quota, failure, and migration health surface.

### Tests and documentation

- Add focused tests under `tests/server`, `tests/db`, `tests/api`, and `tests/components`.
- Update existing page tests to cover anonymous fallback and authenticated cloud behavior.
- Update `README.md`: describe the implemented beta foundation honestly.
- Preserve `.github/workflows/ci.yml`: the existing unit, lint, build, and rendered-HTML gates remain mandatory.

---

### Task 1: Establish dependencies, runtime policy, and the OAuth feasibility gate

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `.env.example`
- Create: `app/server/auth/policy.ts`
- Create: `tests/server/auth-policy.test.ts`
- Create: `docs/operations/sites-oauth-feasibility.md`

- [x] **Step 1: Restore the current dependency baseline and run the existing unit suite**

Run:

```powershell
npm ci
npm run test:unit
```

Expected: the current suite passes before beta work begins. Record the fresh passing count and duration in the execution log before continuing; do not rely on a count copied from an earlier branch.

- [x] **Step 2: Write the failing runtime-policy tests**

Create `tests/server/auth-policy.test.ts` with these behaviors:

```ts
import { describe, expect, it } from "vitest";
import { readAuthPolicy } from "../../app/server/auth/policy";

describe("Arc auth policy", () => {
  it("exposes only Google and GitHub with same-origin callbacks", () => {
    const policy = readAuthPolicy({
      BETTER_AUTH_URL: "https://arc.example.com",
      BETTER_AUTH_SECRET: "s".repeat(32),
      GOOGLE_CLIENT_ID: "google-id",
      GOOGLE_CLIENT_SECRET: "google-secret",
      GITHUB_CLIENT_ID: "github-id",
      GITHUB_CLIENT_SECRET: "github-secret",
    });

    expect(policy.enabledProviders).toEqual(["google", "github"]);
    expect(policy.callbackUrls).toEqual({
      google: "https://arc.example.com/api/auth/callback/google",
      github: "https://arc.example.com/api/auth/callback/github",
    });
  });

  it("keeps auth disabled when credentials are incomplete", () => {
    const policy = readAuthPolicy({ BETTER_AUTH_URL: "https://arc.example.com" });
    expect(policy.enabledProviders).toEqual([]);
    expect(policy.isReady).toBe(false);
  });

  it("rejects non-https production origins", () => {
    expect(() => readAuthPolicy({
      ARC_ENVIRONMENT: "production",
      BETTER_AUTH_URL: "http://arc.example.com",
    })).toThrow("HTTPS");
  });
});
```

- [x] **Step 3: Run the focused test and verify the red state**

Run:

```powershell
npx vitest run tests/server/auth-policy.test.ts
```

Expected: FAIL because `app/server/auth/policy.ts` does not exist.

- [x] **Step 4: Install and pin the approved dependencies**

Run:

```powershell
npm install --save-exact better-auth@1.6.24 @better-auth/drizzle-adapter@1.6.24 zod@4.4.3
```

Expected: `package.json` and `package-lock.json` change; no prerelease package is installed.

- [x] **Step 5: Implement the runtime policy**

Create `app/server/auth/policy.ts` around these exact exported contracts:

```ts
import { z } from "zod";

export const authProviderSchema = z.enum(["google", "github"]);
export type AuthProvider = z.infer<typeof authProviderSchema>;

export type AuthEnvironment = Partial<Record<
  | "ARC_ENVIRONMENT"
  | "BETTER_AUTH_URL"
  | "BETTER_AUTH_SECRET"
  | "GOOGLE_CLIENT_ID"
  | "GOOGLE_CLIENT_SECRET"
  | "GITHUB_CLIENT_ID"
  | "GITHUB_CLIENT_SECRET",
  string
>>;

export function readAuthPolicy(source: AuthEnvironment) {
  const origin = source.BETTER_AUTH_URL?.replace(/\/$/, "") ?? "";
  if (source.ARC_ENVIRONMENT === "production" && !origin.startsWith("https://")) {
    throw new Error("Arc production authentication requires an HTTPS origin.");
  }
  const enabledProviders: AuthProvider[] = [];
  if (source.GOOGLE_CLIENT_ID && source.GOOGLE_CLIENT_SECRET) enabledProviders.push("google");
  if (source.GITHUB_CLIENT_ID && source.GITHUB_CLIENT_SECRET) enabledProviders.push("github");
  return {
    origin,
    enabledProviders,
    callbackUrls: {
      google: `${origin}/api/auth/callback/google`,
      github: `${origin}/api/auth/callback/github`,
    },
    isReady: Boolean(origin && (source.BETTER_AUTH_SECRET?.length ?? 0) >= 32 && enabledProviders.length > 0),
  };
}
```

- [x] **Step 6: Document non-secret environment names and the hosting decision record**

Create `.env.example` with empty OAuth credentials, a local origin, `ARC_ENVIRONMENT=development`, `ARC_AI_ENABLED=false`, finite quota/budget examples, and no real key values. Create `docs/operations/sites-oauth-feasibility.md` with pass/fail rows for catch-all routes, HTTPS callbacks, secure cookies, D1 availability, runtime secrets, Google callback, GitHub callback, and production smoke testing. Mark unverified live-provider rows as `blocked-on-owner-credential`, not as passed.

- [x] **Step 7: Verify policy, baseline, and production compilation**

Run:

```powershell
npx vitest run tests/server/auth-policy.test.ts
npm run test:unit
npm run lint
npm --script-shell="C:\Program Files\Git\bin\bash.exe" run build
```

Expected: all commands exit 0; the OAuth decision record states the exact remaining credential-dependent checks.

Execution evidence (2026-07-28): the clean baseline was 19 files / 68 tests in 15.04 s. After Task 1 it was 20 files / 71 tests in 12.25 s; lint and the five-stage Vinext production build passed. The Sites project was confirmed active, public, HTTPS, and capable of hosted environment-variable management; live Google/GitHub rows remain `blocked-on-owner-credential`. The repository's original Vite pin was upgraded to 8.1.5 after a read-only audit; Next.js was upgraded to the latest stable 16.2.12. Remaining audit findings are in build/development transitive packages not present in the generated Worker bundle and are recorded for continuing security review rather than force-fixed across breaking majors.

- [x] **Step 8: Commit the gate**

```powershell
git add package.json package-lock.json .env.example app/server/auth/policy.ts tests/server/auth-policy.test.ts docs/operations/sites-oauth-feasibility.md
git commit -m "chore: establish Arc beta auth gate"
```

---

### Task 2: Define the D1 schema and generated migration

**Files:**
- Modify: `.openai/hosting.json`
- Modify: `db/schema.ts`
- Create: `db/d1.ts`
- Create: `tests/db/schema.test.ts`
- Create: `drizzle/0000_beta_foundation.sql`
- Modify: `drizzle/meta/_journal.json`
- Create: `drizzle/meta/0000_snapshot.json`

- [x] **Step 1: Write schema contract tests**

Create `tests/db/schema.test.ts` and assert exported table names for `users`, `sessions`, `accounts`, `verifications`, `auth_rate_limits`, `learner_profiles`, `career_goals`, `learning_tasks`, `learning_events`, `proof_items`, `proof_assets`, `public_proof_shares`, `migration_runs`, `idempotency_records`, `quota_ledger`, `ai_runs`, `feature_flags`, `endpoint_rate_buckets`, and `operational_events`. Also assert that user-owned tables expose a `userId` column and that mutation IDs are represented by unique indexes.

```ts
import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "../../db/schema";

it("exports the beta foundation tables", () => {
  expect(Object.values(schema).filter((value) => typeof value === "object").map((table) => {
    try { return getTableName(table as never); } catch { return null; }
  })).toEqual(expect.arrayContaining(["users", "sessions", "career_goals", "learning_events", "quota_ledger"]));
});
```

- [x] **Step 2: Verify the schema test fails against the empty schema**

Run `npx vitest run tests/db/schema.test.ts`.

Expected: FAIL because the beta tables are not exported.

- [x] **Step 3: Implement the schema in focused groups**

Use `sqliteTable`, `text`, `integer`, `primaryKey`, `uniqueIndex`, and `index` from `drizzle-orm/sqlite-core`. Auth tables must match Better Auth's user, session, account, and verification fields. Product tables must encode the approved invariants:

```ts
export const careerGoals = sqliteTable("career_goals", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  roleId: text("role_id").notNull(),
  status: text("status", { enum: ["active", "archived"] }).notNull(),
  activeSlot: integer("active_slot"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("career_goals_one_active_idx").on(table.userId, table.activeSlot),
  index("career_goals_user_idx").on(table.userId),
]);

export const learningEvents = sqliteTable("learning_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  taskId: text("task_id").notNull(),
  mutationId: text("mutation_id").notNull(),
  kind: text("kind", { enum: ["completed", "delayed", "skipped", "too_hard", "already_known"] }).notNull(),
  payloadJson: text("payload_json").notNull().default("{}"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("learning_events_user_mutation_idx").on(table.userId, table.mutationId)]);
```

Use timestamp-millisecond columns consistently. Store structured snapshots as validated JSON text, never unvalidated arbitrary request bodies.

`public_proof_shares` stores only an opaque token hash, an allowlisted published-field JSON document, and `revoked_at`; it never stores a raw bearer token. `endpoint_rate_buckets` has a unique `(scope, subject_hash, window_start)` key. `operational_events` contains only the sanitized fields defined in Task 7 and has no request-body or credential column.

- [x] **Step 4: Expose the raw D1 binding and logical resources**

Create `db/d1.ts` with `getD1()` using `env.DB`, and update `.openai/hosting.json` to:

```json
{
  "project_id": "appgprj_6a6678d3e3848191a352778c6db1e7b1",
  "d1": "DB",
  "r2": "PROOF_ASSETS"
}
```

- [x] **Step 5: Generate and inspect the migration**

Run:

```powershell
npm run db:generate -- --name=beta_foundation
```

Expected: one new SQL migration and matching Drizzle metadata. Inspect the SQL to confirm all required tables, foreign keys, owner indexes, and unique mutation constraints exist; no `DROP TABLE` or destructive statement is allowed in this initial migration.

- [x] **Step 6: Verify and commit the schema**

Run `npx vitest run tests/db/schema.test.ts`, `npm run test:unit`, and `npm run build`. Expected: all exit 0.

Execution evidence (2026-07-28): the schema and binding tests failed before implementation, then passed with 19 tables. The reviewed migration contains 19 `CREATE TABLE` statements, 18 foreign keys, 18 unique indexes, matching snapshot/journal metadata, and no `DROP TABLE`, `DROP COLUMN`, or `DELETE FROM`. The full suite reached 22 files / 76 tests; lint, `tsc --noEmit`, and the five-stage Vinext build passed. The repository also gained the Wrangler-compatible Cloudflare Worker type package and a test-only virtual-module alias so D1/R2 bindings are typechecked without changing production resolution.

```powershell
git add .openai/hosting.json db/schema.ts db/d1.ts drizzle tests/db/schema.test.ts
git commit -m "feat: define Arc beta persistence schema"
```

---

### Task 3: Build validated cloud-state contracts and pure application service

**Files:**
- Create: `app/contracts/cloud-state.ts`
- Create: `app/server/cloud/repository.ts`
- Create: `app/server/cloud/service.ts`
- Create: `tests/server/cloud-service.test.ts`

- [x] **Step 1: Write failing service tests with an in-memory repository**

Cover these exact cases: anonymous default is not imported automatically; valid local state imports after explicit consent; repeating a migration ID returns the first result; an existing active cloud goal is not silently replaced; a repeated completion mutation creates one event and one proof; cross-user repository results are rejected.

```ts
const request = {
  migrationId: "migration-1",
  state: completeDemoUnit(createDemoState(), flagshipRole.today),
};
const result = await service.importLocalState("user-1", request);
expect(result.importedCompletionCount).toBe(1);
expect(await service.importLocalState("user-1", request)).toEqual(result);
```

- [x] **Step 2: Verify red state**

Run `npx vitest run tests/server/cloud-service.test.ts`.

Expected: FAIL because the contracts and service do not exist.

- [x] **Step 3: Define shared Zod contracts**

`app/contracts/cloud-state.ts` must export these schemas and their `z.infer` types (`SetupAnswersInput`, `DemoStateInput`, `MigrationRequest`, `MigrationResult`, `WorkspaceMutation`, `CompletionMutation`, and `CloudSnapshot`):

```ts
export const setupAnswersSchema = z.object({
  roleId: z.string().min(1).max(160),
  level: z.enum(["new", "beginner", "intermediate", "advanced"]),
  weeklyMinutes: z.number().int().min(30).max(2400),
  targetWeeks: z.number().int().min(4).max(52),
}).strict();

export const proofItemSchema = z.object({
  id: z.string().min(1).max(160),
  title: z.string().min(1).max(240),
  kind: z.enum(["completion", "commit", "project", "note", "upload"]),
  skillIds: z.array(z.string().min(1).max(120)).max(32),
  verified: z.boolean(),
}).strict();

export const demoStateSchema = z.object({
  setup: setupAnswersSchema,
  completedUnitIds: z.array(z.string().min(1).max(160)).max(2000),
  proofs: z.array(proofItemSchema).max(200),
}).strict();

export const migrationRequestSchema = z.object({
  migrationId: z.string().min(8).max(128),
  consent: z.literal(true),
  state: demoStateSchema,
  conflictResolution: z.enum(["reject", "archive-import", "activate-import"]).default("reject"),
}).strict();

export const migrationResultSchema = z.object({
  migrationId: z.string(),
  status: z.enum(["imported", "already-imported", "conflict"]),
  activeGoalId: z.string().nullable(),
  importedCompletionCount: z.number().int().nonnegative(),
  importedProofCount: z.number().int().nonnegative(),
  availableResolutions: z.array(z.enum(["archive-import", "activate-import"])).max(2),
}).strict();

export const workspaceMutationSchema = z.object({
  mutationId: z.string().min(8).max(128),
  setup: setupAnswersSchema,
}).strict();

export const completionMutationSchema = z.object({
  mutationId: z.string().min(8).max(128),
  unitId: z.string().min(1).max(160),
  title: z.string().min(1).max(240),
  deliverable: z.string().min(1).max(500),
  skillIds: z.array(z.string().min(1).max(120)).max(32),
}).strict();

export const cloudSnapshotSchema = z.object({
  state: demoStateSchema,
  activeGoalId: z.string().min(1),
  revision: z.string().min(1),
}).strict();

export type CloudSnapshot = z.infer<typeof cloudSnapshotSchema>;

export type RepositorySnapshot = CloudSnapshot & {
  ownerId: string;
};
```

When an existing active cloud goal conflicts, the default `reject` path returns `status: "conflict"` without writing or recording a completed migration. The user may retry the same package ID with `archive-import` or `activate-import`; the latter archives the existing goal before activating the imported one. Once either final resolution succeeds, repeating that migration ID returns the stored result and never duplicates data.

- [x] **Step 4: Define the repository port and service**

The repository port exposes owner-scoped methods only:

```ts
export interface CloudRepository {
  getSnapshot(userId: string): Promise<RepositorySnapshot | null>;
  getMigrationResult(userId: string, migrationId: string): Promise<MigrationResult | null>;
  importState(userId: string, request: MigrationRequest): Promise<MigrationResult>;
  saveSetup(userId: string, mutationId: string, setup: SetupAnswers): Promise<RepositorySnapshot>;
  recordCompletion(userId: string, request: CompletionMutation): Promise<RepositorySnapshot>;
}
```

`CloudService` parses all external inputs through the Zod schemas before calling the port. It treats duplicate mutation IDs as successful idempotent replays, rejects a `RepositorySnapshot.ownerId` different from the requested user, and strips `ownerId` before returning the public `CloudSnapshot`.

- [x] **Step 5: Verify and commit**

Run the focused test and the full unit suite. Expected: all pass.

Execution evidence (2026-07-28): the service suite failed before the contracts existed, then passed all six migration, idempotency, conflict, completion, and ownership cases. The request schema now requires `consent: true`, making explicit import consent a server-side contract rather than only a UI convention. The full suite reached 23 files / 82 tests; lint and `tsc --noEmit` passed with no warnings.

```powershell
git add app/contracts/cloud-state.ts app/server/cloud tests/server/cloud-service.test.ts
git commit -m "feat: add validated cloud state service"
```

---

### Task 4: Implement the owner-scoped D1 repository

**Files:**
- Create: `app/server/cloud/d1-cloud-repository.ts`
- Create: `tests/server/d1-cloud-repository.test.ts`

- [x] **Step 1: Write a fake D1 prepared-statement harness and failing adapter tests**

The fake records SQL, bound values, and batch calls. Assert that every personal query binds `userId`; imports use one `batch()`; duplicate migration and mutation lookups happen before writes; active goals use `active_slot = 1`; archived goals use `NULL`.

- [x] **Step 2: Verify red state**

Run `npx vitest run tests/server/d1-cloud-repository.test.ts`.

Expected: FAIL because the D1 adapter does not exist.

- [x] **Step 3: Implement the adapter with prepared statements**

Use exactly one SQL statement per `prepare()` call and bind every external value. The import batch must create or reuse the learner profile, create the goal, insert unique events/proofs, and finalize the migration result. A representative owner-scoped read is:

```ts
const goal = await this.db.prepare(
  "SELECT id, role_id, status FROM career_goals WHERE user_id = ?1 AND active_slot = 1 LIMIT 1",
).bind(userId).first<GoalRow>();
```

Do not interpolate table names, IDs, JSON, or user values. Serialize only values already accepted by the shared Zod contracts.

- [x] **Step 4: Verify adapter and full suite**

Run the focused test, full unit suite, lint, and build. Expected: all exit 0.

Execution evidence (2026-07-28): seven adapter tests cover owner-bound reads, one-batch imports, pre-write replay checks, active/archive slots, public-only idempotency payloads, and a concurrent migration unique-key race. The adapter uses static prepared SQL with bound values and recovers the winning result only when a failed batch is followed by a completed migration record. The final full suite reached 24 files / 89 tests; lint, `tsc --noEmit`, and the Vinext production build passed.

- [x] **Step 5: Commit**

```powershell
git add app/server/cloud/d1-cloud-repository.ts tests/server/d1-cloud-repository.test.ts
git commit -m "feat: persist owner scoped Arc workspaces"
```

---

### Task 5: Add independent Google/GitHub identity and server-side session guards

**Files:**
- Create: `app/server/auth/runtime.ts`
- Create: `app/server/auth/session.ts`
- Create: `app/lib/auth-client.ts`
- Create: `app/api/auth/[...all]/route.ts`
- Create: `app/api/auth/providers/route.ts`
- Delete: `app/chatgpt-auth.ts`
- Create: `tests/server/auth-runtime.test.ts`
- Create: `tests/api/auth-providers.test.ts`

- [x] **Step 1: Write failing identity tests**

Assert that email/password login is disabled, only fully configured Google/GitHub providers appear, implicit cross-email linking is disabled, production cookies are secure, trusted origins contain only the configured Arc. origin, and `requireArcUser()` rejects an absent session with a stable `UNAUTHENTICATED` error.

- [x] **Step 2: Verify red state**

Run `npx vitest run tests/server/auth-runtime.test.ts tests/api/auth-providers.test.ts`.

Expected: FAIL because the identity modules and provider route do not exist.

- [x] **Step 3: Build a lazy Better Auth runtime**

`getAuth()` must read Cloudflare runtime values on first request, not at static build time. Configure `betterAuth` with the Drizzle adapter, plural schema mapping, `emailAndPassword.enabled = false`, Google/GitHub social providers, encrypted OAuth tokens, database-backed OAuth state, explicit trusted origin, secure production cookies, and disabled implicit linking.

Define the runtime helpers in the same module before `getAuth()`:

```ts
export class AuthUnavailableError extends Error {
  readonly code = "AUTH_UNAVAILABLE";
}

export function readRuntimeEnvironment(): AuthEnvironment {
  return {
    ARC_ENVIRONMENT: env.ARC_ENVIRONMENT,
    BETTER_AUTH_URL: env.BETTER_AUTH_URL,
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
    GITHUB_CLIENT_ID: env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: env.GITHUB_CLIENT_SECRET,
  };
}

export function buildSocialProviders(source: AuthEnvironment) {
  return {
    ...(source.GOOGLE_CLIENT_ID && source.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: source.GOOGLE_CLIENT_ID, clientSecret: source.GOOGLE_CLIENT_SECRET } }
      : {}),
    ...(source.GITHUB_CLIENT_ID && source.GITHUB_CLIENT_SECRET
      ? { github: { clientId: source.GITHUB_CLIENT_ID, clientSecret: source.GITHUB_CLIENT_SECRET } }
      : {}),
  };
}

const authSchema = { users, sessions, accounts, verifications, authRateLimits };
```

Import `env` from `cloudflare:workers`, `AuthEnvironment`/`readAuthPolicy` from `policy.ts`, and the named tables from `db/schema.ts`. The worker `Env` declaration in Task 10 must contain these same environment names so hosted and local typing stay aligned.

```ts
export function getAuth() {
  const source = readRuntimeEnvironment();
  const policy = readAuthPolicy(source);
  if (!policy.isReady) throw new AuthUnavailableError();
  return betterAuth({
    baseURL: policy.origin,
    secret: source.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), { provider: "sqlite", schema: authSchema, usePlural: true }),
    emailAndPassword: { enabled: false },
    account: {
      encryptOAuthTokens: true,
      storeStateStrategy: "database",
      accountLinking: { enabled: true, disableImplicitLinking: true, allowDifferentEmails: false },
    },
    rateLimit: { enabled: true, window: 60, max: 30, storage: "database", modelName: "authRateLimit" },
    trustedOrigins: [policy.origin],
    advanced: { cookiePrefix: "arc", useSecureCookies: source.ARC_ENVIRONMENT === "production" },
    socialProviders: buildSocialProviders(source),
  });
}
```

- [x] **Step 4: Mount the same-origin route and session helpers**

Create Better Auth handlers inside each request so `getAuth()` is never invoked at module evaluation/build time:

```ts
export async function GET(request: Request) {
  return toNextJsHandler(getAuth()).GET(request);
}

export async function POST(request: Request) {
  return toNextJsHandler(getAuth()).POST(request);
}
```

`app/server/auth/session.ts` must expose `getArcUser(headers)` and `requireArcUser(headers)` and return only Arc. user ID, display name, and email. Never authorize from client-supplied user IDs.

- [x] **Step 5: Expose provider availability and remove ChatGPT identity code**

`GET /api/auth/providers` returns `{ providers: AuthProvider[] }` and `Cache-Control: no-store`. Delete `app/chatgpt-auth.ts` and verify `rg -n "signin-with-chatgpt|oai-authenticated-user" app` returns no matches.

- [x] **Step 6: Verify and commit**

Run focused tests, full unit suite, lint, and build. Expected: all exit 0 without OAuth credentials because runtime initialization stays lazy.

Execution evidence (2026-07-28): identity tests cover social-only options, complete-provider filtering, 32-character minimum session secrets, encrypted OAuth tokens, database OAuth state/rate limits, disabled implicit linking, secure cookies, sanitized sessions, and stable unauthenticated errors. All ChatGPT identity helpers and reserved routes were removed. The final suite reached 26 files / 97 tests; lint, `tsc --noEmit`, and a credential-free production build passed with `/api/auth/:all+` and `/api/auth/providers` classified as dynamic API routes.

```powershell
git add app/server/auth app/lib/auth-client.ts app/api/auth app/chatgpt-auth.ts tests/server/auth-runtime.test.ts tests/api/auth-providers.test.ts
git commit -m "feat: add independent Arc social identity"
```

---

### Task 6: Add the branded account experience without a registration wall

**Files:**
- Create: `app/sign-in/page.tsx`
- Create: `app/components/account/sign-in-panel.tsx`
- Create: `app/components/account/account-menu.tsx`
- Modify: `app/components/brand/site-header.tsx`
- Modify: `app/components/workspace/workspace-shell.tsx`
- Create: `tests/components/sign-in-panel.test.tsx`
- Modify: `tests/components/site-header.test.tsx`

- [x] **Step 1: Write failing component tests**

Cover: public navigation remains accessible without an account; sign-in is a secondary action; configured provider buttons call `authClient.signIn.social` with `/today`; missing credentials show an honest preparation state; signed-in account menu displays the Arc. user and calls sign-out; no ChatGPT wording appears.

- [x] **Step 2: Verify red state**

Run the two component test files. Expected: FAIL because the account components do not exist.

- [x] **Step 3: Implement the sign-in surface**

`SignInPanel` accepts `providers`, `pending`, and an injectable `signIn` function. Each provider button uses:

```ts
await signIn({ provider, callbackURL: "/today", errorCallbackURL: "/sign-in?error=oauth" });
```

The page preserves Warm Precision, explains that Arc. accounts are independent, and offers a link back to the sample. It does not request a password or show a ChatGPT button.

- [x] **Step 4: Implement account controls and integrate them**

Use `authClient.useSession()` for anonymous, pending, and signed-in states. Add AccountMenu to both headers while preserving the existing primary “Build my path” action and the four workspace destinations.

- [x] **Step 5: Verify and commit**

Run focused tests, the full suite, and lint.

Execution evidence (2026-07-28): the component suite first failed because the account surfaces did not exist, then passed with exact same-origin Google/GitHub return paths, an honest no-provider state, anonymous and signed-in account controls, and no ChatGPT identity wording. The account loading marker was kept out of the workspace live-status channel after full-suite regression testing exposed duplicate status semantics. All 28 test files / 103 tests, ESLint, `tsc --noEmit`, and the five-stage Vinext production build passed. The Vinext launcher was also made cross-platform so the repository's npm scripts work on Windows while retaining the project-local Wrangler log path.

```powershell
git add app/sign-in app/components/account app/components/brand/site-header.tsx app/components/workspace/workspace-shell.tsx tests/components
git commit -m "feat: add Arc account experience"
```

---

### Task 7: Expose authenticated workspace, migration, and completion APIs

**Files:**
- Create: `app/server/http/api-response.ts`
- Create: `app/server/http/rate-limit.ts`
- Create: `app/server/http/cloud-route-factories.ts`
- Create: `app/server/observability/events.ts`
- Create: `app/server/observability/d1-events.ts`
- Create: `app/api/workspace/route.ts`
- Create: `app/api/migrations/local-state/route.ts`
- Create: `app/api/learning/events/route.ts`
- Create: `tests/api/workspace.test.ts`
- Create: `tests/api/local-migration.test.ts`
- Create: `tests/api/learning-events.test.ts`
- Create: `tests/server/rate-limit.test.ts`

- [x] **Step 1: Write failing API tests with injected session and repository factories**

Each route test must cover unauthenticated 401, malformed 400, owner-scoped success, duplicate mutation replay, rate-limit 429, and sanitized 500. Migration tests additionally cover oversized proof arrays and conflicting active goals. `tests/server/rate-limit.test.ts` covers per-scope windows, hashed subjects, expiry, and fail-closed database errors.

```ts
expect(response.status).toBe(401);
expect(await response.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
```

- [x] **Step 2: Verify red state**

Run the three API test files. Expected: FAIL because routes and response helpers do not exist.

- [x] **Step 3: Implement stable API responses and sanitized logging**

All API errors use:

```ts
type ApiErrorCode = "UNAUTHENTICATED" | "INVALID_INPUT" | "CONFLICT" | "RATE_LIMITED" | "UNAVAILABLE" | "INTERNAL";
type ApiErrorBody = { error: { code: ApiErrorCode; message: string; requestId: string } };
```

Operational events may include request ID, route, result code, latency, user surrogate, and counters. They must reject fields named `password`, `token`, `secret`, `apiKey`, `roleDescription`, or `fileBody`.

`events.ts` exports a strict `OperationalEvent` allowlist and `OperationalEventSink`; it hashes the authenticated user surrogate before creating an event. `d1-events.ts` inserts that already-sanitized value into `operational_events`. Unknown properties cause validation failure rather than being spread into logs or persistence.

Implement `D1RateLimiter.reserve({ scope, subject, limit, windowSeconds })` with a SHA-256 subject hash and an atomic D1 upsert against `endpoint_rate_buckets`. Return `{ allowed, retryAfterSeconds }`; never persist an email, OAuth token, IP string, or raw user ID in a rate bucket. The import route uses a conservative per-account limit and all later proof and AI routes reuse the same port.

- [x] **Step 4: Implement the routes**

- `GET /api/workspace`: return the authenticated cloud snapshot or an empty cloud workspace.
- `PUT /api/workspace`: parse `{ mutationId, setup }` and save setup idempotently.
- `POST /api/migrations/local-state`: parse `migrationRequestSchema` and return a reconciliation result.
- `POST /api/learning/events`: parse `completionMutationSchema` and return the new snapshot.

Construct `CloudService` with `D1CloudRepository(getD1())` inside server-only route factories. No route accepts `userId` from request JSON.

`app/server/http/cloud-route-factories.ts` exports `createWorkspaceHandlers(deps)`, `createMigrationHandler(deps)`, and `createLearningEventHandler(deps)`. `deps` contains `requireUser`, `createService`, `rateLimiter`, and `recordEvent`; production route modules pass D1/session implementations, while tests pass fakes. This is the only dependency-injection seam—route modules remain thin delegates and no global mutable test override is allowed.

- [x] **Step 5: Verify and commit**

Run focused tests, full tests, lint, and build.

Execution evidence (2026-07-28): five focused files first failed because the route factories, limiter, and observability modules did not exist, then passed 31 tests. The implemented routes authenticate before parsing personal input, derive the owner only from the session, validate strict bodies, preserve repository idempotency, expose stable request IDs and error codes, fail closed when D1 rate limiting is unavailable, and emit only hashed-user allowlisted operational events. Oversized proof arrays, explicit-consent failures, active-goal conflicts, duplicate mutations, rate limits, and secret-bearing internal errors are covered. The full suite reached 33 files / 134 tests; ESLint, `tsc --noEmit`, and the five-stage Vinext build passed with all three cloud APIs classified as dynamic routes.

```powershell
git add app/server/http app/server/observability app/api/workspace app/api/migrations app/api/learning tests/api tests/server/rate-limit.test.ts
git commit -m "feat: expose protected Arc cloud state APIs"
```

---

### Task 8: Integrate local-to-cloud consent and authoritative cloud state

**Files:**
- Modify: `app/lib/demo-store.ts`
- Create: `app/lib/cloud-client.ts`
- Create: `app/lib/offline-queue.ts`
- Create: `app/lib/use-arc-state.ts`
- Create: `app/components/sync/migration-banner.tsx`
- Modify: `app/setup/page.tsx`
- Modify: `app/path/page.tsx`
- Modify: `app/today/page.tsx`
- Modify: `app/stack/page.tsx`
- Modify: `app/proof/page.tsx`
- Modify: `app/components/workspace/workspace-shell.tsx`
- Create: `tests/lib/cloud-client.test.ts`
- Create: `tests/lib/offline-queue.test.ts`
- Create: `tests/components/migration-banner.test.tsx`
- Modify: `tests/pages/workspace-state.test.tsx`
- Modify: `tests/pages/setup.test.tsx`
- Modify: `tests/pages/today.test.tsx`

- [ ] **Step 1: Write failing client and UI tests**

Cover: anonymous pages retain current local behavior; a signed-in user loads D1 state; meaningful local data triggers an import prompt; default untouched state does not; import requires explicit click; dismissing keeps local bytes; a conflicting active goal presents archive/import choices; successful import switches source to cloud; failed synchronization keeps a retryable mutation; duplicate completion uses one mutation ID. Offline-queue tests additionally cover FIFO replay, mutation-ID deduplication, the 100-mutation cap, the 1 MiB serialized cap, preservation of older entries when full, and read-only rejection of a new mutation when either cap is reached.

- [ ] **Step 2: Verify red state**

Run the focused client, migration, and page tests. Expected: FAIL because cloud client and hook do not exist.

- [ ] **Step 3: Add meaningful-state detection and typed browser calls**

Add to `demo-store.ts`:

```ts
export function hasMeaningfulDemoState(state: DemoState): boolean {
  const defaults = createDemoState();
  return state.completedUnitIds.length > 0
    || state.proofs.length > 0
    || JSON.stringify(state.setup) !== JSON.stringify(defaults.setup);
}
```

`cloud-client.ts` uses same-origin `fetch`, `credentials: "include"`, shared Zod response parsing, and `crypto.randomUUID()` mutation IDs. It never sends a user ID.

Create `offline-queue.ts` with these stable contracts:

```ts
export const MAX_OFFLINE_MUTATIONS = 100;
export const MAX_OFFLINE_BYTES = 1024 * 1024;

export type OfflineMutation =
  | { id: string; kind: "save-setup"; payload: WorkspaceMutation; createdAt: string }
  | { id: string; kind: "complete-unit"; payload: CompletionMutation; createdAt: string };

export type EnqueueResult =
  | { accepted: true; queue: OfflineMutation[] }
  | { accepted: false; reason: "queue-full"; queue: OfflineMutation[] };

export function readOfflineQueue(storage?: Pick<Storage, "getItem">): OfflineMutation[];
export function enqueueOfflineMutation(mutation: OfflineMutation, storage?: Pick<Storage, "getItem" | "setItem">): EnqueueResult;
export function removeOfflineMutation(id: string, storage?: Pick<Storage, "getItem" | "setItem">): OfflineMutation[];
```

Parse stored entries through Zod and discard malformed entries. Calculate the UTF-8 byte length of the complete serialized next queue before writing. Deduplicate by `id`; never evict an older accepted mutation to fit a new one.

- [ ] **Step 4: Implement `useArcState`**

Return this stable shape:

```ts
type ArcStateSource = "restoring" | "local" | "cloud" | "offline-cloud";
type ArcStateController = {
  state: DemoState | null;
  source: ArcStateSource;
  migration: "none" | "available" | "importing" | "imported" | "failed";
  importLocal(resolution?: "reject" | "archive-import" | "activate-import"): Promise<void>;
  saveSetup(setup: SetupAnswers): Promise<boolean>;
  completeUnit(unit: LearningUnit): Promise<boolean>;
  retry(): Promise<void>;
};
```

Anonymous users call the existing guarded local store. Authenticated users load cloud state and use cloud mutations. A network failure after cloud activation yields `offline-cloud`; it never silently falls back to a divergent local authority.

On reconnect, `retry()` replays queued mutations in FIFO order using their original mutation IDs and removes an item only after the server returns an accepted/idempotent success. If the queue is full, `saveSetup` and `completeUnit` return `false`, leave the visible cloud snapshot unchanged, and expose a reconnect/read-only status; uploads are never copied into local storage.

- [ ] **Step 5: Add the import consent UI and update pages**

The banner summarizes the role, completed units, and proof count and offers “Import to Arc.” and “Not now.” It never auto-imports or deletes local storage. If the API returns a conflict, the banner adds explicit “Keep cloud goal; archive import” and “Archive cloud goal; activate import” actions; neither runs without a click. Update all five product pages to use the controller while preserving their existing anonymous test contracts and visual hierarchy.

- [ ] **Step 6: Verify and commit**

Run all focused tests, the full unit suite, lint, and build.

```powershell
git add app/lib app/components/sync app/components/workspace/workspace-shell.tsx app/setup app/path app/today app/stack app/proof tests
git commit -m "feat: synchronize Arc learning state"
```

---

### Task 9: Add entitlements and a deterministic AI provider gateway

**Files:**
- Create: `app/server/entitlements/policy.ts`
- Create: `app/server/entitlements/repository.ts`
- Create: `app/server/entitlements/d1-entitlement-repository.ts`
- Create: `app/server/ai/contracts.ts`
- Create: `app/server/ai/gateway.ts`
- Create: `app/server/ai/mock-provider.ts`
- Create: `app/api/intelligence/preview/route.ts`
- Create: `tests/server/entitlements.test.ts`
- Create: `tests/server/ai-gateway.test.ts`
- Create: `tests/api/intelligence-preview.test.ts`

- [ ] **Step 1: Write failing entitlement and provider tests**

Cover global disabled, feature-cohort disabled, user quota exhausted, endpoint rate limit exceeded, global budget exhausted, allowed call, structured mock output, invalid provider output, one repair maximum, and no charge when no accepted artifact is produced.

- [ ] **Step 2: Verify red state**

Run the three focused test files. Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement deterministic entitlement decisions**

Use a discriminated result:

```ts
export type EntitlementDecision =
  | { allowed: true; reservationId: string }
  | { allowed: false; reason: "disabled" | "cohort" | "quota" | "rate" | "budget" };
```

Read numerical limits through Zod coercion with non-negative integer bounds. Configuration parse failure must fail closed. The repository obtains aggregate usage from `quota_ledger` and inserts reservations/final states idempotently.

`EntitlementRepository` exposes `readUsage(userId, purpose, period)`, `reserve(userId, purpose, idempotencyKey, units)`, and `finalize(reservationId, "accepted" | "rejected" | "failed", acceptedUnits)`. The D1 adapter binds `userId`, uses an idempotency key unique per user, and writes append-only ledger rows; it never updates an accepted charge into a second charge.

- [ ] **Step 4: Implement provider contracts and mock gateway**

```ts
export const roleResearchRequestSchema = z.object({
  requestId: z.string().uuid(),
  role: z.string().trim().min(2).max(160),
  locale: z.enum(["zh-CN", "en-US"]).default("zh-CN"),
}).strict();

export type RoleResearchRequest = z.infer<typeof roleResearchRequestSchema>;

export interface AiProvider {
  run(request: RoleResearchRequest): Promise<unknown>;
  repair(request: RoleResearchRequest, invalid: unknown): Promise<unknown>;
}

export const roleResearchPreviewSchema = z.object({
  role: z.string().min(2).max(160),
  mode: z.literal("deterministic-preview"),
  dimensions: z.array(z.string().min(1).max(120)).min(1).max(12),
  notice: z.string().min(1).max(240),
}).strict();

export type RoleResearchPreview = z.infer<typeof roleResearchPreviewSchema>;
```

The route reserves the shared D1 endpoint rate limit before asking the gateway to check entitlements. The gateway then validates output with Zod, invokes `repair` at most once, writes sanitized `ai_runs` and quota ledger states, and never accepts provider-created URLs or tools in this foundation preview.

- [ ] **Step 5: Expose the protected preview endpoint**

`POST /api/intelligence/preview` requires an Arc. session and a role string of 2-160 characters. It returns the deterministic preview only; it does not call OpenAI or consume a paid provider key.

- [ ] **Step 6: Verify and commit**

Run focused tests, full tests, lint, and build.

```powershell
git add app/server/entitlements app/server/ai app/api/intelligence/preview tests/server tests/api/intelligence-preview.test.ts
git commit -m "feat: guard Arc AI behind entitlements"
```

---

### Task 10: Add private proof storage and selective, revocable sharing

**Files:**
- Modify: `worker/index.ts`
- Create: `app/server/proof/storage.ts`
- Create: `app/server/proof/repository.ts`
- Create: `app/server/proof/d1-proof-repository.ts`
- Create: `app/server/proof/public-view.ts`
- Create: `app/api/proofs/upload/route.ts`
- Create: `app/api/proofs/[id]/asset/route.ts`
- Create: `app/api/proofs/[id]/sharing/route.ts`
- Create: `app/api/public/proofs/[token]/route.ts`
- Create: `tests/server/proof-storage.test.ts`
- Create: `tests/api/proof-assets.test.ts`
- Create: `tests/api/proof-sharing.test.ts`

- [ ] **Step 1: Write failing storage and route tests**

Cover owner-prefixed object keys, 5 MiB maximum, accepted types `text/plain`, `application/pdf`, `image/png`, and `image/jpeg`, denied executable/HTML types, unauthenticated denial, cross-user denial, private retrieval, missing object, and no public bucket URL in any response. Sharing tests cover explicit field selection, token hashing, no raw token at rest, owner-only create/revoke, revoked-token 404, cross-user denial, and proof that the public response never includes owner ID, email, notes, internal IDs, attachment URLs, or fields outside the allowlist.

- [ ] **Step 2: Verify red state**

Run the two focused test files. Expected: FAIL because proof storage does not exist.

- [ ] **Step 3: Implement the R2 adapter**

```ts
const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const ALLOWED_PROOF_TYPES = new Set(["text/plain", "application/pdf", "image/png", "image/jpeg"]);

export function proofObjectKey(userId: string, proofId: string, assetId: string) {
  return `${encodeURIComponent(userId)}/${encodeURIComponent(proofId)}/${encodeURIComponent(assetId)}`;
}
```

Store searchable ownership/type/size metadata in D1 before returning success. Retrieval first queries metadata by both proof ID and user ID, then gets the R2 object. Set `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, and `Cache-Control: private, no-store`.

Define an owner-scoped `ProofRepository` port with `getOwnedProof`, `createAssetMetadata`, `getOwnedAsset`, `upsertShare`, `revokeShare`, and `getActiveShareByTokenHash`. `D1ProofRepository` binds `userId` in every private query and writes metadata plus share changes idempotently. If metadata insertion fails after an R2 put, delete only the just-created explicit object key as compensation and return failure.

- [ ] **Step 4: Type the worker binding and implement routes**

Add `PROOF_ASSETS: R2Bucket` and the approved environment fields to `worker/index.ts`'s `Env`. Upload accepts one multipart `file` plus an existing proof ID; asset retrieval never accepts an object key from the caller. Upload and sharing mutations reserve their own scopes through the D1 rate limiter before reading a request body or writing state.

- [ ] **Step 5: Implement selective publication and revocation**

`public-view.ts` defines the only publishable keys:

```ts
export const publicProofFieldSchema = z.enum(["title", "kind", "skillIds", "verified"]);
export type PublicProofView = Partial<Pick<ProofItem, "title" | "kind" | "skillIds" | "verified">>;
```

`PUT /api/proofs/[id]/sharing` accepts one or more distinct allowlisted fields, verifies ownership, generates 32 cryptographically random bytes, stores only `SHA-256(token)` plus the filtered JSON view, and returns the raw URL-safe token once. `DELETE` revokes the share by proof ID and owner ID. `GET /api/public/proofs/[token]` hashes the token, returns only the stored allowlisted view for an unrevoked record, and uses `Cache-Control: public, max-age=60`; it never serves private R2 bytes. Invalid, unknown, or revoked tokens return the same 404 shape.

- [ ] **Step 6: Verify and commit**

Run focused tests, full tests, lint, and build.

```powershell
git add worker/index.ts app/server/proof app/api/proofs app/api/public/proofs tests/server/proof-storage.test.ts tests/api/proof-assets.test.ts tests/api/proof-sharing.test.ts
git commit -m "feat: secure and selectively share Arc proof"
```

---

### Task 11: Finish recovery, security controls, and the minimal operational surface

**Files:**
- Modify: `worker/index.ts`
- Modify: `app/server/http/api-response.ts`
- Modify: `app/server/observability/events.ts`
- Create: `app/server/admin/policy.ts`
- Create: `app/server/admin/repository.ts`
- Create: `app/server/admin/d1-admin-repository.ts`
- Create: `app/api/admin/health/route.ts`
- Create: `app/admin/page.tsx`
- Create: `app/components/sync/cloud-status.tsx`
- Modify: `app/globals.css`
- Create: `tests/server/observability.test.ts`
- Create: `tests/server/admin-policy.test.ts`
- Create: `tests/api/admin-health.test.ts`
- Create: `tests/pages/admin.test.tsx`
- Create: `tests/components/cloud-recovery.test.tsx`

- [ ] **Step 1: Write failing diagnostics and recovery tests**

Assert stable request IDs, secret-field redaction, session-expired recovery, import retry, offline-cloud status, quota message, kill-switch message, reduced-motion behavior, and visible keyboard focus for new controls. Admin tests assert exact email-allowlist matching, unauthenticated 401, authenticated non-admin 403, admin-only success, aggregate-only queries, and absence of learner content, email addresses, raw user IDs, role descriptions, proof text, or credentials from the response.

- [ ] **Step 2: Verify red state**

Run the focused observability, recovery, admin policy, API, and page files. Expected: FAIL because final recovery presentation, protected diagnostics, and redaction coverage are incomplete.

- [ ] **Step 3: Apply response-level safety controls**

The worker adds `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a request ID when absent. API responses add `Cache-Control: no-store`. Do not add a broad CSP until every existing font, image, and motion dependency has an explicit tested policy.

- [ ] **Step 4: Complete user recovery presentation**

Use a single reusable status surface with `role="status"` for non-blocking states and `role="alert"` for failed writes. Every failure offers one concrete action: sign in again, retry, reconnect, adjust quota timing, or continue with the deterministic sample.

- [ ] **Step 5: Implement the protected minimal admin surface**

`policy.ts` parses `ARC_ADMIN_EMAILS` as a comma-separated, trimmed, lowercase, exact-match allowlist; empty or malformed configuration denies access. It must not support domains or wildcard entries. `repository.ts` exposes only this aggregate shape:

```ts
export type AdminHealthSnapshot = {
  service: "ok" | "degraded";
  ai: { enabled: boolean; callsToday: number; acceptedToday: number; budgetUnitsToday: number };
  migrations: { pending: number; failed24h: number; completed24h: number };
  failures: Array<{ requestId: string; route: string; code: string; occurredAt: string }>;
};
```

`D1AdminRepository` reads only `feature_flags`, aggregates from `ai_runs`/`quota_ledger`/`migration_runs`, and the latest already-sanitized `operational_events`; it never joins `users`, `proof_items`, learner snapshots, or OAuth tables. `/api/admin/health` obtains the server-side Arc. session, checks the exact email allowlist, and returns `Cache-Control: private, no-store`. `/admin` shows five restrained Warm Precision cards—service, AI switch, usage, migrations, recent failures—and no mutation controls or user-content browser.

- [ ] **Step 6: Verify and commit**

Run focused tests, full tests, lint, and build.

```powershell
git add worker/index.ts app/server/http app/server/observability app/server/admin app/api/admin app/admin app/components/sync/cloud-status.tsx app/globals.css tests/server/observability.test.ts tests/server/admin-policy.test.ts tests/api/admin-health.test.ts tests/pages/admin.test.tsx tests/components/cloud-recovery.test.tsx
git commit -m "feat: harden and operate Arc beta"
```

---

### Task 12: Complete documentation, migration review, and release readiness

**Files:**
- Modify: `README.md`
- Modify: `docs/operations/sites-oauth-feasibility.md`
- Modify: `docs/superpowers/plans/2026-07-28-arc-beta-foundation.md`
- Verify: `.github/workflows/ci.yml`
- Verify: `drizzle/0000_beta_foundation.sql`

- [ ] **Step 1: Update the public technical narrative**

README must distinguish:

- public anonymous sample;
- independent Arc. accounts;
- D1 cloud authority after sign-in;
- explicit local import;
- mock-first AI gateway with live AI still disabled;
- owner-only server secrets;
- quota, budget, and kill-switch boundaries;
- credential-dependent OAuth production status.

Do not claim cross-device OAuth production success until both providers pass a real hosted callback.

- [ ] **Step 2: Run the full local verification suite**

```powershell
npm run test:unit
npm run lint
npm --script-shell="C:\Program Files\Git\bin\bash.exe" run build
node --test tests/rendered-html.test.mjs
git diff --check
```

Expected: every command exits 0. Record the fresh test count and build output in the handoff; do not reuse earlier counts.

- [ ] **Step 3: Inspect the generated migration and secret boundary**

Run:

```powershell
rg -n "DROP TABLE|DROP COLUMN|DELETE FROM" drizzle
rg -n "clientSecret|BETTER_AUTH_SECRET|OPENAI_API_KEY|GOOGLE_CLIENT_SECRET|GITHUB_CLIENT_SECRET" app worker public
```

Expected: the initial migration contains no destructive statement. Secret names may occur only in server-only configuration code; no literal credential value or client bundle/public asset contains a secret.

- [ ] **Step 4: Commit documentation and plan progress**

```powershell
git add README.md docs/operations/sites-oauth-feasibility.md docs/superpowers/plans/2026-07-28-arc-beta-foundation.md
git commit -m "docs: prepare Arc beta foundation release"
```

- [ ] **Step 5: Push a review branch and open a draft pull request**

```powershell
git push -u origin feature/arc-beta-foundation
```

Open a draft PR titled `feat: build Arc public beta foundation`. Include the acceptance checklist, test evidence, migration summary, current OAuth credential status, and rollback plan. Wait for CI; fix failures on the feature branch.

- [ ] **Step 6: Validate hosted resource wiring without secrets**

Save a Sites preview version with `DB` and `PROOF_ASSETS` logical bindings. Confirm public editorial routes and the deterministic sample still work. Confirm `/api/auth/providers` honestly reports no provider until hosted credentials exist. Do not enable production login buttons with incomplete credentials.

- [ ] **Step 7: Credential-dependent OAuth validation**

When the owner supplies Google/GitHub client IDs and secrets, configure hosted secrets, register exactly these callbacks, and test each provider:

```text
https://arc-precision-path.jiahe-xu.chatgpt.site/api/auth/callback/google
https://arc-precision-path.jiahe-xu.chatgpt.site/api/auth/callback/github
```

Verify sign-in, sign-out, session refresh, cancelled login, invalid state rejection, explicit provider linking, and absence of ChatGPT identity. If Sites cannot complete these flows with secure same-origin cookies, select the already-approved owner-controlled Cloudflare auth branch and keep the browser contract unchanged.

- [ ] **Step 8: Production release gate**

Merge and publish only after CI, migration review, both hosted OAuth flows, cross-user denial tests, import idempotency, cloud refresh persistence, private proof retrieval, quota controls, and rollback readiness all pass. Preserve the previous Sites version as the rollback target.

---

## Execution choice

The user already selected continuous inline execution. Use `superpowers:executing-plans` in this task, execute in small batches, keep this checklist current, and pause only for owner credentials, paid resources, irreversible data operations, or a required change to the approved product direction.
