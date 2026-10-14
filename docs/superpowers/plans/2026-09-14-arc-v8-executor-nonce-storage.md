# Arc v8 Durable Nonce Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Execute after Task 2 passes SPEC and independent QUALITY. Local implementation and future deployment are approved; this task uses local synthetic databases only.

**Goal:** Make one signed message's replay rejection survive service reconstruction and an actual database close/reopen.

**Architecture:** The shared D1 adapter implements Task 2's required atomic nonce-store port. Identical additive nonce-table DDL is installed independently in the Sites and executor databases; neither service receives the other database binding. No endpoint is enabled here. Nonce rows are retained in this unit, which is permitted by the approved design; an eventual bounded cleanup policy must preserve all still-valid signatures before deletion is introduced.

**Tech Stack:** Existing TypeScript/Zod, D1 SQL, Drizzle schema/generator, node:sqlite and Vitest. No dependencies or live resources.

---

### Task 3: Atomic D1 nonce claims and additive migrations

**Files:**
- Create `app/server/research/executor/d1-nonce-store.ts`: one atomic insert, safe validation and fail-closed persistence result.
- Modify `db/schema.ts`: append the nonce table definition below. Preserve all existing definitions and constraints.
- Generate `drizzle/0007_research_bridge_nonces.sql`, `drizzle/meta/0007_snapshot.json` and updated `drizzle/meta/_journal.json` with the installed Drizzle CLI. The only schema addition is the nonce table; stop and investigate any unrelated generated change.
- Create `worker/research-executor/migrations/0000_research_bridge_nonces.sql`: copy the generated one-table SQL byte for byte, so both independently deployed databases use the same nonce contract.
- Modify `tests/helpers/sqlite-d1.ts`: retain the current default in-memory behavior, allow an explicitly supplied test database filename, and append migration 0007 to `createResearchD1`'s migration list.
- Create `tests/server/research-executor-nonce-store.test.ts`: actual SQL uniqueness, complete auth-to-D1 integration and close/reopen persistence.
- Evidence in `outputs/local-durable-executor-20260914/task3-*` only; fixture databases in unique task3 directories beneath the same output folder.

- [x] **Step 1: Write behavioral RED.** Export the adapter API with a temporary safe failure stub. Initially create only this bare schema at the executor migration path so the database can prepare statements but does not yet enforce the new constraints:

```sql
CREATE TABLE research_bridge_nonces (
  scope TEXT NOT NULL, nonce TEXT NOT NULL,
  expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY (scope, nonce)
);
```

The first valid adapter claim must fail visibly against the stub. Direct invalid SQL insert assertions must also fail against the intentionally missing checks. Missing files/imports or unprepared SQL are not the claimed behavioral RED. Before RED, the test-only helper may gain filename support by replacing its initialized property with:

```ts
readonly database: DatabaseSync;
constructor(filename = ":memory:") { this.database = new DatabaseSync(filename); }
```

Keep all existing helper methods and in-memory defaults unchanged. Do not generate the final Sites migration or constraints before observing RED.

```ts
// @vitest-environment node
import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { D1BridgeNonceStore } from "../../app/server/research/executor/d1-nonce-store";
import { SqliteD1 } from "../helpers/sqlite-d1";

function createNonceDb() {
  const db = new SqliteD1();
  db.database.exec(readFileSync(resolve("worker/research-executor/migrations/0000_research_bridge_nonces.sql"), "utf8").replaceAll("--> statement-breakpoint", ";"));
  return db;
}

it("lets only one of concurrent service instances claim the same nonce", async () => {
  const db = createNonceDb();
  try {
    const first = new D1BridgeNonceStore(db);
    const second = new D1BridgeNonceStore(db);
    const input = { scope: "site-to-executor:synthetic-1", nonce: "12".repeat(16),
      now: 1_800_000_000_000, expiresAt: 1_800_000_120_001 };
    const results = await Promise.all(Array.from({ length: 20 }, (_, index) =>
      (index % 2 === 0 ? first : second).claim(input)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(db.database.prepare("SELECT count(*) AS n FROM research_bridge_nonces").get()).toMatchObject({ n: 1 });
    expect(await new D1BridgeNonceStore(db).claim(input)).toBe(false);
  } finally { db.close(); }
});

it("enforces nonce shape inside SQL even if the adapter is bypassed", () => {
  const db = createNonceDb();
  try {
    expect(() => db.database.prepare(`INSERT INTO research_bridge_nonces
      (scope,nonce,expires_at,created_at) VALUES (?,?,?,?)`)
      .run("site-to-executor:synthetic-1", "BAD", 1_800_000_120_001, 1_800_000_000_000)).toThrow();
  } finally { db.close(); }
});
```

Also connect actual `signBridgeMessage`/`verifyBridgeMessage` to this adapter with synthetic keys, one valid signature twice, and verify the second call rejects with `replay`; altered signatures create no nonce rows. Use a filename-backed `SqliteD1` connection, load the executor migration once, claim then close it, open the same file in a new connection without reapplying schema and reject the same nonce. Open a separate new database and show the corresponding valid claim is independent, proving the stores are not accidentally sharing memory.

Test keys and bodies are synthetic. Use unique output subdirectories from `mkdtempSync` under the task evidence folder, validate resolved paths remain beneath that folder before deleting, close every connection, and delete only the exact test-created database and its known journal/WAL/SHM files, followed by the empty directory. Do not recursively delete a computed directory. Never read runtime environment files or real database paths.

- [x] **Step 2: Run and inspect RED.**

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-executor-nonce-store.test.ts --reporter=json --outputFile=outputs/local-durable-executor-20260914/task3-red.json
```

Save actual missing-behavior assertions for both the stub adapter and absent SQL checks. A local process launch failure is infrastructure, not behavioral RED. Obtain a narrow same-command local retry if required; no install, remote migration or live database commands.

- [x] **Step 3: Generate the final additive schema and implement the adapter.** After RED, append this complete table definition to `db/schema.ts`, using its existing imports and `nonnegativeSafeInteger` helper:

```ts
export const researchBridgeNonces = sqliteTable("research_bridge_nonces", {
  scope: text("scope").notNull(),
  nonce: text("nonce").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.scope, table.nonce] }),
  index("research_bridge_nonces_expiry_idx").on(table.expiresAt),
  check("research_bridge_nonces_scope_check", sql`length(${table.scope}) BETWEEN 18 AND 49
    AND length(CAST(${table.scope} AS BLOB)) = length(${table.scope})
    AND substr(${table.scope},1,17) IN ('site-to-executor:', 'executor-to-site:')
    AND substr(${table.scope},18) NOT GLOB '*[^A-Za-z0-9_-]*'`),
  check("research_bridge_nonces_nonce_check", sql`length(${table.nonce}) = 32
    AND length(CAST(${table.nonce} AS BLOB)) = 32
    AND ${table.nonce} NOT GLOB '*[^0-9a-f]*'`),
  check("research_bridge_nonces_time_check", sql`${nonnegativeSafeInteger(table.createdAt)}
    AND ${nonnegativeSafeInteger(table.expiresAt)}
    AND ${table.expiresAt} > ${table.createdAt}
    AND ${table.expiresAt} - ${table.createdAt} <= 150001`),
]);
```

The SQL constraints reject malformed scope/nonce, noninteger or unsafe time, and invalid retention spans independently of the TypeScript adapter. The 150001ms maximum is the 120000ms signature window plus 30000ms future skew plus one millisecond inclusive-boundary retention. It is not an execution lease or a new Provider limit.

```powershell
node node_modules/drizzle-kit/bin.cjs generate --name research_bridge_nonces
```

Inspect actual new SQL and metadata: only one added table with its composite primary key, index and checks; all previous tables/migrations unchanged. Preserve source hashes of existing migration files. Replace the initial executor schema stub with this generated SQL byte for byte. Append `"0007_research_bridge_nonces.sql"` after 0006 in `createResearchD1`'s explicit migration list. Add the Sites-schema parity/preservation checks after generation; these are migration artifact checks, not a substitute for the initial behavioral SQL RED.

Implement the atomic adapter using this complete baseline, tightening issues demonstrated by tests or self-review:

```ts
import { z } from "zod";
import { BridgeAuthError, type BridgeNonceStore } from "./auth";

type Claim = Parameters<BridgeNonceStore["claim"]>[0];
const claimSchema = z.object({
  scope: z.string().regex(/^(site-to-executor|executor-to-site):[A-Za-z0-9_-]{1,32}$/u),
  nonce: z.string().regex(/^[0-9a-f]{32}$/u),
  now: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 150_001),
  expiresAt: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
}).strict().refine(value => value.expiresAt > value.now && value.expiresAt - value.now <= 150_001);

export class D1BridgeNonceStore implements BridgeNonceStore {
  constructor(private readonly db: Pick<D1Database, "prepare">) {}

  async claim(input: Claim): Promise<boolean> {
    const parsed = claimSchema.safeParse(input);
    if (!parsed.success) throw new BridgeAuthError("invalid-config");
    const value = parsed.data;
    try {
      const result = await this.db.prepare(`INSERT INTO research_bridge_nonces
        (scope,nonce,expires_at,created_at) VALUES (?1,?2,?3,?4)
        ON CONFLICT (scope,nonce) DO NOTHING`)
        .bind(value.scope, value.nonce, value.expiresAt, value.now).run();
      const changes = result.meta?.changes;
      if (result.success !== true || (changes !== 0 && changes !== 1)) {
        throw new BridgeAuthError("unavailable");
      }
      return changes === 1;
    } catch {
      throw new BridgeAuthError("unavailable");
    }
  }
}
```

There is no preliminary SELECT, conflict replacement, deletion, lease renewal, or new nonce generation. One atomic SQL statement decides ownership. A persisted row always rejects that scope+nonce even if its expiry is past; this conservative behavior remains safe if a receiver clock moves backward. Database exceptions or indeterminate mutation metadata never authorize a request and never leak SQL or underlying exception text. A caller encountering an ambiguous write uses a newly signed network retry; it cannot reuse the consumed nonce.

- [x] **Step 4: Run GREEN and meaningful regression coverage.** In addition to concurrency, reconstruction and file reopen, cover distinct scope/keyId/nonce, copied inputs, earliest and latest retention boundaries, invalid scope/uppercase nonce/extra keys/unsafe time, database failure and abnormal mutation metadata. Exercise both actual migration files independently and compare their byte hashes. Direct invalid SQL inserts must fail the schema constraints. Existing tables/data must survive applying the additive migration, with foreign keys enabled.

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-executor-nonce-store.test.ts tests/server/research-executor-auth.test.ts tests/server/research-executor-body.test.ts tests/server/d1-research-repository.test.ts --reporter=json --outputFile=outputs/local-durable-executor-20260914/task3-green.json
node node_modules/eslint/bin/eslint.js app/server/research/executor/d1-nonce-store.ts tests/server/research-executor-nonce-store.test.ts tests/helpers/sqlite-d1.ts db/schema.ts
```

The repository regression filename above was resolved with `rg --files tests/server`. Root performs current-source nonincremental typecheck with the unchanged compiler options and a new exact scope manifest.

- [x] **Step 5: Self-review, SPEC, then independent QUALITY/security.** Capture actual generator/RED/GREEN/lint results, source/SQL/metadata hashes and previous-migration preservation. Confirm there is no automatic runtime schema creation, no secret/account data stored, and no replay authorization on storage failure. Verify actual close/reopen test evidence, not just constructing a new JavaScript adapter. No local D1/SQLite result establishes a production migration or full distributed-system acceptance. Mark this unit complete only after both sequential reviews pass.

## Root plan self-review

This task supplies the durable implementation explicitly deferred by Task 2 and prepares both independent database deployments without enabling endpoints. Identity, begin/dispatch/outbox/result/import ledgers remain in the next source-grounded ledger plan; they are not replaced by this nonce table. Sites publication-clock and transaction rollback changes remain in the Site integration unit. The current schema imports and helper signatures were read; all migration files are additive and the generator must show no unrelated changes. Retaining nonce rows is deliberately conservative, and no cleanup is introduced without its own window-preservation proof.
