# Arc V8 Site Begin Grant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Issue one durable Site begin grant for an admitted remote Research run, atomically start its original execution lease, and replay that grant without renewing time or allocating resources.

**Architecture:** Extend the existing Site execution row with its immutable execution deadline. A separate private D1 begin repository reuses the existing execution reader, quota integrity SQL and budget predicate, commits the execution/run pair in one batch, then constructs the already-defined bridge reply from durable fields and database observation time. Transport and Provider dispatch remain separate units.

**Tech Stack:** TypeScript, Zod, existing D1 SQLite batch adapter, Drizzle migration inventory, Vitest, existing bridge begin codec and execution policy.

---

This is Task11 under the approved `2026-09-14-arc-v8-durable-research-executor-design.md`. Task10 is complete: `outputs/local-durable-executor-20260914/task10-subtask8-completion.json`, 909/909 tests, 417 current type inputs, SPEC then independent QUALITY PASS on the same 29 files. The completed Task10 plan hash is `e5117e6f649c7eabf192580a87d4315a6c8d7b4526f8aa0f44f2d3bdd746a8af`. Its completed source snapshots are in `task10-completed-sources.json` (27 reused unchanged copies, two new copies). Do not recreate the accepted baseline or redo Tasks1–10.

The user has already approved local implementation and later deployment; this plan introduces no new product choice. This unit is local only: no real credentials, Provider/network requests, Git mutations, production migration, Sites operations or deployment. Keep the service factory remote-disabled. Task5 already implements the bridge begin grant/reply codecs, identity matching, and full-RTT Provider-budget check; reuse those unchanged. Task11 does not issue `dispatch-claimed`, complete/import a result, enable a route, or claim remote acceptance.

Use three sequential fresh implementers, each followed by fresh SPEC then independent QUALITY on final source hashes. Root owns the full current-input typecheck and plan checkbox changes. Existing user workflow overrides generic skill suggestions to commit or ask for an execution-mode choice again. Before each subtask Root captures only its exact current source scope/absent paths, preserving existing evidence. A passing prior test report is reusable only while all its tested source identities remain unchanged.

## Fixed contract and decisions

1. The internal caller supplies authenticated Site ownership/identity and a trusted `newExecutionAllowed` flag; it is not a request-body authorization field. A future signed handler will resolve the stored owner itself. This unit remains unrouted and does not replace session/service authentication.
2. A fresh grant requires an exact owned remote run/execution, admitted state, both original live reservations, queued active run, no began/closed marker, and actual database time strictly before the original queue deadline. Check the full existing quota parent/child integrity and reserved budget/bucket relationship at the SQL write. A prior admitted observation is insufficient.
3. Use database time, never a caller-supplied start/deadline or an application-clock override. Set `began_at` once and `execution_expires_at = began_at + 1260000`. In the same batch set the run to researching and its active expiry to that deadline; increment both versions once. Preserve job bytes, request/hash, validation context, quota/budget identities, admission time and original reservation expiry.
4. Both paired updates require actual SQL assertions, so a zero-row companion update rolls back the other row. A post-commit JavaScript changes-count check cannot provide rollback. No reservation creation/finalization, budget settlement, source audit or Provider call occurs.
5. Retry of an already committed begin returns its original grant with newly observed remaining time, even if new execution has since been disabled. It does not renew the lease, set another marker or create a new grant. This is reading an already issued permission, not authorization to dispatch twice; the executor's existing persistent dispatch CAS remains required.
6. Replay may observe a coherent already-terminal run or an expired execution and return the original grant with remaining time clamped to zero. It never changes terminal state or restores active expiry. Missing/corrupt grant fields or identity conflict fail closed. If the database clock precedes the original begin time, report unavailable rather than forging observation time.
7. `newExecutionAllowed=false` with no recorded grant rejects without writes. Do not couple this operation to pre-begin closure or release; existing reconciliation owns those. Closed, pending, synchronous, missing, expired-unbegun and foreign executions cannot acquire begin.
8. Provider timeout remains 1200000 ms; the receiver still subtracts full monotonic RTT and requires 30000 ms result margin. A delayed or replayed reply can be insufficient and must not cause a shorter Provider budget or renewed grant.
9. All initial and post-batch pair observations use at most two strict read attempts (one additional read-only attempt). A competing begin can commit between the existing reader's run and execution SELECTs, or between a separate outer run read and that reader. Neither a torn read nor an unavailable read permits a write. Persistent inconsistency fails closed; command parsing, NOT_FOUND and identity/gate CONFLICT are not retried. No mutation is retried.

### Private API

Create `app/server/research/site-begin-repository.ts`:

```ts
import type { BridgeBeginReply } from "./executor/begin";
import type { SiteExecutionIdentity } from "./site-execution-repository";

export type SiteBeginCommand = SiteExecutionIdentity & Readonly<{
  newExecutionAllowed: boolean;
}>;

export interface SiteBeginRepository {
  begin(command: SiteBeginCommand): Promise<BridgeBeginReply>;
}
```

`D1SiteBeginRepository(db, runs, executions)` receives `Pick<ResearchRepository, "getRun">` and `Pick<SiteExecutionRepository, "read">` as type-only interfaces. Snapshot the complete command before the first await using `readBoundedResearchJson` and a strict schema: existing owner/request bounds 160, existing Research run-ID schema, UUID job, lowercase 64-hex request hash, and boolean gate. Reject unknown fields, accessors, exotic objects, symbols and unsafe identifiers. There is no optional clock constructor or input deadline.

Use existing `ResearchRepositoryError` vocabulary: malformed input/storage failure/malformed durable data or backward SQL clock -> `RESEARCH_UNAVAILABLE`; no owned run -> `NOT_FOUND`; mismatched identity, denied fresh begin or incompatible coherent lifecycle/accounting -> `CONFLICT`. Do not leak raw SQL or foreign rows.

### Stored deadline

Add nullable `execution_expires_at` to `research_site_executions` and `executionExpiresAt: number | null` to the private record. Pending/admitted-unbegun/closed rows have null. Begun rows have the exact original `began_at + 1260000`, within the original reservation expiry and safe integer bounds. The grant's protocol/job/hash already come from immutable stored job identity, so no duplicate grant JSON or new grant table is needed.

Migration `0009_research_site_begin_grants.sql` first adds the nullable column with a value check, then backfills only pre-existing non-null began markers using the fixed original policy, and finally adds pair/immutability triggers. No synchronous run, job identity, context, quota, budget, began time or active expiry is rewritten. Backfill increments that execution's version once to respect the existing lifecycle trigger; impossible version/overflow or malformed pre-existing evidence must fail rather than manufacture permission. No row with null began_at gains authorization during migration.

```sql
ALTER TABLE research_site_executions ADD COLUMN execution_expires_at INTEGER
  CHECK (execution_expires_at IS NULL OR (
    typeof(execution_expires_at)='integer' AND began_at IS NOT NULL
    AND began_at<=9007199253480991
    AND execution_expires_at=began_at+1260000
    AND execution_expires_at<=reservation_expires_at
  ));
--> statement-breakpoint
UPDATE research_site_executions
SET execution_expires_at=began_at+1260000, version=version+1
WHERE began_at IS NOT NULL;
```

Use `Number.MAX_SAFE_INTEGER - 1260000` as the source of the SQL bound when checking the literal above. New insert guard rejects any non-null deadline (the existing insert guard already requires pending/no begin). A new BEFORE UPDATE trigger aborts when the null/non-null begin/deadline pair disagrees, the exact duration or reservation bound disagrees, or a previously non-null deadline is changed/cleared. Preserve the original lifecycle trigger and migrations0000..0008 byte-for-byte. The migration's pair trigger also prevents setting began_at alone. Represent the new column/value check in Drizzle; trigger-only lifecycle constraints remain migration-owned.

The strict execution reader reads/validates the new field. For active begun runs compare active expiry to the stored deadline, rather than rebuilding authority from the current clock. Validate exact policy duration before using it. Existing synthetic begun fixtures must now set both fields together, preserving all their original assertions; the migration0008-specific test remains deliberately scoped to schema0008 and need not be converted into a current-schema test.

## File map

| File | Responsibility |
| --- | --- |
| `drizzle/0009_research_site_begin_grants.sql` | Add deadline, bounded backfill, pair and immutable-deadline guards. |
| `drizzle/meta/_journal.json` | Append index9/version6/tag; preserve prior entries. |
| `db/schema.ts` | New nullable deadline and value check, no new table inventory. |
| `app/server/research/site-execution-repository.ts` | Add required private deadline field. |
| `app/server/research/d1-site-execution-repository.ts` | Initial/read/lifecycle deadline validation; narrowly reuse budget SQL helper in existing admitted CAS. |
| `app/server/research/d1-repository.ts` | Initial remote record sets executionExpiresAt:null; no other creation/publication change. |
| `app/server/research/site-execution-sql.ts` | Internal database-clock constant and exact reserved-budget predicate extracted from existing admitted UPDATE. |
| `app/server/research/site-begin-repository.ts` | Small private command/repository contract. |
| `app/server/research/d1-site-begin-repository.ts` | Actual begin batch, strict replay and SQL-time reply construction. |
| `tests/helpers/sqlite-d1.ts` | Add migration0009 to current-schema fixture list only. |
| `tests/helpers/site-admission-fixture.ts` | Add begin repository only in subtask2; reuse current SQL clock and native controls. |
| `tests/db/site-begin-migration.test.ts` | Upgrade preservation, constraints/triggers, original begun deadline preservation. |
| `tests/db/migration-safety.test.ts` | Inventory/journal through0009, retain old hashes/snapshots. |
| `tests/server/d1-site-execution-repository.test.ts` | Deadline parsing/corruption checks; minimal coherent future-begun fixture updates. |
| `tests/server/site-admission.test.ts` | Minimal future-begun fixture update, assertions unchanged. |
| `tests/server/d1-research-budget-repository.test.ts` | Minimal future-begun fixture update, release assertions unchanged. |
| `tests/server/research-orchestrator.test.ts` | Minimal future-begun fixtures, observation assertions unchanged. |
| `tests/server/d1-site-begin-repository.test.ts` | Native begin lifecycle, exact reservations, race/reopen/ack/replay tests. |

Root owns this plan and operations checkpoint/progress docs. Do not change Task5 codecs/tests, auth, service factory, execution policy, public contracts, frontend, Provider, ordinary accounting or historical migration snapshots. No `db:generate`, dependency installation or frontend build is required. If a required additional fixture is discovered, show its exact compiler/test failure and capture its prior bytes before the narrow scope expansion.

## Subtask 1: Persist and validate the original execution deadline

**Files:** migration0009/journal/schema, SiteExecutionRecord, its D1 reader/insertion helper, d1-repository initial record, sqlite fixture list, new migration test, migration-safety and the four listed existing begun-fixture test files. Do not create the begin repository yet.

- [x] Write native-SQLite migration tests against actual schema0008, seeded synchronous/pending/admitted/closed and coherent begun fixtures. Read the new migration only when it exists; first demonstrate the missing deadline behavior using SQLite schema/read assertions, not a missing-file/import failure. Capture the real behavioral RED before implementing migration. Example initial assertion:

```ts
const columns = db.database.prepare("PRAGMA table_info(research_site_executions)").all();
expect(columns.some((row) => row.name === "execution_expires_at")).toBe(true);
```

  Verify no new authorization for unbegun rows, original begun time plus exact 1260000 deadline, version increment only for backfilled begun rows, unchanged run/quota/budget/context bytes, and legacy synchronous compatibility. Test invalid deadline type/bounds/duration/null pairing, replacement and clearing. Run migration statements in the same actual local transactional batch used by the test fixture; do not infer hosted migration guarantees from it.
- [x] Implement migration/Drizzle/private-record changes as specified. Update initial remote record and insertion helper with `executionExpiresAt:null`; parser reads `row.execution_expires_at` and rejects malformed/missing fields and mismatched begun/deadline. Active run identity uses the stored deadline only after exact validation. Preserve all existing queue/reservation checks.

```ts
// Add to the existing stored shape and record construction.
executionExpiresAt: nullableTime,
// Lifecycle validation, alongside existing marker checks:
if ((value.beganAt === null) !== (value.executionExpiresAt === null)
  || value.beganAt !== null && (
    value.beganAt > Number.MAX_SAFE_INTEGER - KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs
    || value.executionExpiresAt !== value.beganAt + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs
    || value.executionExpiresAt > value.reservationExpiresAt
  )) throw new Error();
```

- [x] Update only listed synthetic begun fixtures to set `execution_expires_at=?1+1260000` in the same existing marker UPDATE; add null to the explicit pending record literal. Retain future-begin denial, accounting and sync-observation assertions. Add read-path malformed deadline cases by intercepting the persisted read result, because valid migration triggers must prevent ordinary corruption writes.
- [x] Run the targeted schema/reader/fixture compatibility tests, explicit changed-TS lint, and Root's full-current-input typecheck under a new `task11-subtask1-acceptance` label. Record source scope and failures accurately, then obtain fresh SPEC and QUALITY. Do not claim begin behavior is implemented in this schema-only subtask.

```powershell
npm run test:unit -- tests/db/site-begin-migration.test.ts tests/db/site-execution-migration.test.ts tests/db/migration-safety.test.ts tests/db/schema.test.ts tests/server/d1-site-execution-repository.test.ts tests/server/site-admission.test.ts tests/server/d1-research-budget-repository.test.ts tests/server/research-orchestrator.test.ts tests/server/d1-research-repository.test.ts
```

## Subtask 2: Issue or replay the grant through one atomic database batch

**Files:** new private contract and D1 begin repository, internal SQL helper, narrow admitted-CAS extraction, fixture constructor and new begin repository test.

- [x] Add the callable `begin` interface and safe implementation that snapshots/validates input and throws `RESEARCH_UNAVAILABLE` without mutation. Add the fixture instance. Write an executable success test using real `createRemote`, quota/budget reserves and `markAdmitted`; observe behavioral RED at begin, not missing APIs.

```ts
function identity(execution: SiteExecutionRecord): SiteExecutionIdentity {
  const { ownerId, runId, requestId, jobId, requestHash } = execution;
  return { ownerId, runId, requestId, jobId, requestHash };
}

const f = createSiteAdmissionFixture(); // Close through the test's afterEach registry.
const now = Date.parse("2026-09-16T00:00:00.000Z");
f.setAppNow(now);
f.setSqlNow(now);
const created = await f.createRemote();
const reservations = await f.reserveAdmission(created.execution);
await f.executions.markAdmitted({ ...identity(created.execution), expectedVersion: 0, ...reservations });
const reply = await f.begin.begin({ ...identity(created.execution), newExecutionAllowed: true });
expect(reply.grant).toMatchObject({
  jobId: created.execution.jobId,
  requestHash: created.execution.requestHash,
  beganAt: now,
  executionExpiresAt: now + 1_260_000,
});
expect(await f.research.getRun(created.run.ownerId, created.run.id))
  .toMatchObject({ state: "researching", activeExpiresAt: reply.grant.executionExpiresAt });
```

  Add denial tests for false gate, pending/closed/synchronous/missing/foreign records, wrong identity, missing/terminal/corrupt-parent quota and wrong/released/held/settled/expired budget, exhausted versions, exact SQL queue deadline, and malformed command. Check unchanged counts and both rows/buckets on denial.
- [x] Extract the existing admitted UPDATE's exact reserved budget EXISTS expression into `siteReservedBudgetSql(executionAlias, reservationIdSql)` in the internal SQL helper, with the same day/month/owner/request/max/expiry/safe-value predicates. Only trusted code literals are SQL fragment arguments. Export the same actual SQL clock expression there. Existing admitted CAS still uses the identical predicate and ledger CTE; no generic accounting or quota SQL behavior changes.
- [x] Implement bounded command parsing, strict owned run/execution read and equality of all five identity fields. Snapshot and validate the command once before any await, outside read recovery. Within the new begin repository, wrap each complete strict pair observation with the bounded helper below; use it on the initial path as well as after the one possible batch. Do not weaken the existing execution reader or swallow its corruption checks.

```ts
async function readCoherentPair<T>(readStrictPair: () => Promise<T>): Promise<T> {
  try {
    return await readStrictPair();
  } catch (error) {
    if (!(error instanceof ResearchRepositoryError)
      || error.code !== "RESEARCH_UNAVAILABLE") throw error;
  }
  // One additional read only. The callback contains no mutation or grant issuance.
  return readStrictPair();
}
```

  Each `readStrictPair` invocation starts fresh: obtain the owned run via `getRun`, then the strictly parsed execution via `read`, and validate the outer pair together before returning it. A missing owned run is NOT_FOUND; synchronous mode or command identity mismatch is CONFLICT. A missing execution for an owned remote run is unavailable. Validate run owner/id/request/mode/quotaKey, input/config fingerprints, role/locale and createdAt against the parsed immutable execution/job, plus active/terminal expiry and lifecycle correspondence. A queued active run requires an unbegun execution and the original queue expiry; researching/validating requires a begun admitted execution and its stored deadline; terminal runs require null active expiry. An already-closed execution cannot accompany an active run. Contradictory outer snapshots are unavailable and receive only the same single complete reread, not an independent nested retry. All five command identity fields are checked on every successful observation. Storage errors map to safe unavailable as usual. If the additional observation is still unavailable, malformed or contradictory, propagate failure with zero begin/accounting writes. Do not retry NOT_FOUND, identity mismatch, gate denial or malformed input.

  A coherent recorded grant returns read-only even when the gate is now false. Otherwise require the true gate and queued/admitted/unbegun pair, then construct the atomic batch using the pre-read versions only as CAS tokens; all eligibility is revalidated at actual SQL execution. A race after the coherent observation is resolved by the batch CAS and original-grant recovery, never by another mutation attempt.

```ts
const sqlNow = siteSqlNow;
const bindings = [command.runId, command.ownerId, command.requestId,
  command.jobId, command.requestHash, execution.version, run.stateVersion];
const beginExecutionUpdate = db.prepare(`${researchQuotaLedgerCte}
UPDATE research_site_executions AS e
SET began_at=${sqlNow},execution_expires_at=${sqlNow}+1260000,
    version=version+1,updated_at=${sqlNow}
WHERE e.run_id=?1 AND e.user_id=?2 AND e.request_id=?3
  AND e.job_id=?4 AND e.request_hash=?5 AND e.version=?6
  AND e.version<9007199254740991
  AND e.admission_state='admitted' AND e.began_at IS NULL
  AND e.execution_expires_at IS NULL AND e.closed_at IS NULL AND e.close_reason IS NULL
  AND e.admitted_at IS NOT NULL AND ${sqlNow}>=e.admitted_at
  AND ${sqlNow}<e.queue_expires_at AND ${sqlNow}+1260000<=e.reservation_expires_at
  AND EXISTS(SELECT 1 FROM research_runs r WHERE r.id=e.run_id AND r.user_id=e.user_id
    AND r.request_id=e.request_id AND r.execution_mode='cloudflare-workflow-v1'
    AND r.remote_quota_key=e.quota_key AND r.state='queued' AND r.active_slot=1
    AND r.state_version=?7 AND r.state_version<9007199254740991
    AND r.active_expires_at=e.queue_expires_at)
  AND ${researchQuotaLiveReservationSql("e.user_id", "e.quota_key", "e.quota_reservation_id")}
  AND ${siteReservedBudgetSql("e", "e.budget_reservation_id")}`).bind(...bindings);

const beginRunUpdate = db.prepare(`UPDATE research_runs AS r
SET state='researching',state_version=state_version+1,
  active_expires_at=(SELECT execution_expires_at FROM research_site_executions WHERE run_id=?1),
  updated_at=(SELECT began_at FROM research_site_executions WHERE run_id=?1)
WHERE r.id=?1 AND r.user_id=?2 AND r.request_id=?3
  AND r.execution_mode='cloudflare-workflow-v1' AND r.state='queued' AND r.active_slot=1
  AND r.state_version=?7 AND r.state_version<9007199254740991
  AND EXISTS(SELECT 1 FROM research_site_executions e
    WHERE e.run_id=r.id AND e.user_id=r.user_id AND e.request_id=r.request_id
      AND e.job_id=?4 AND e.request_hash=?5 AND e.quota_key=r.remote_quota_key
      AND e.version=?6+1 AND e.admission_state='admitted'
      AND e.began_at IS NOT NULL AND e.execution_expires_at=e.began_at+1260000
      AND e.closed_at IS NULL AND e.close_reason IS NULL
      AND r.active_expires_at=e.queue_expires_at)`).bind(...bindings);
```

  `siteSqlNow` is exactly `"CAST(ROUND(unixepoch('subsec') * 1000) AS INTEGER)"`, exported by the internal helper. The quota helper is the existing extraction; the budget helper contains the full predicate extracted without weakening from Task10. The run/execution values in bindings are the validated initial durable pair, not caller versions. These two statements must execute only in the following single batch.

```ts
await db.batch([
  beginExecutionUpdate,
  db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('') END AS begin_assertion"),
  beginRunUpdate,
  db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('') END AS begin_assertion"),
]);
```

  `beginRunUpdate` matches the same owner/run/request/mode/key, queued/active/version and the just-written execution (version=old+1, began non-null, deadline exact). Set state researching, state_version+1, active_expires_at from the stored execution deadline, updated_at from its began_at. It must NOT call the synchronous transition API. No await or standalone query between batch statements.
- [x] Implement response and ambiguity recovery. After either commit or uncertain batch error, reread the complete immutable owned execution/run pair; accept only an original recorded grant consistent with that pair. A still-queued run with a non-null began marker is not a coherent committed begin pair. If no grant exists, propagate safe conflict/unavailable without retrying the batch or allocating resources. Read SQL observation time with `db.prepare(\`SELECT ${siteSqlNow} AS observed_at\`).first()`; validate safe integer and observedAt>=beganAt. Build via `parseBridgeBeginReply`:

```ts
return parseBridgeBeginReply({
  grant: {
    protocol: stored.job.protocol,
    jobId: stored.jobId,
    requestHash: stored.requestHash,
    beganAt: stored.beganAt,
    executionExpiresAt: stored.executionExpiresAt,
  },
  observedAt,
  remainingMs: Math.max(0, stored.executionExpiresAt - observedAt),
});
```

  After commit or an uncertain batch error, use the same bounded coherent-pair reader (at most two complete read attempts for this observation). The total invocation has at most one batch even if both the initial and post-batch observations require their single additional read. The reader must narrow beganAt/deadline to non-null before constructing the reply. Same identity plus original began/deadline is the replay identity. Do not persist observedAt/remainingMs, include new wall-clock dates in grant identity, or renew original reservation expiry. Terminal runs must retain null active expiry; replay is read-only.
- [x] Test same-command concurrency, different command identities, lost acknowledgement after commit, no acknowledgement before commit, repeated reply after time advances and flag turns off, expired/terminal replay, SQL clock before begin, and caller mutation during read await. Deterministically pause caller A after the existing reader's actual run SELECT but before its execution SELECT; let caller B commit the actual begin batch, then resume A. Require A and B to return the same original grant, execution/run versions to increment only once, and A to perform zero batches after its read recovery. Separately pause after A's outer run read but before its execution reader to exercise outer snapshot mismatch. Add persistent malformed/contradictory reads that remain unavailable on both attempts: exact two attempts, zero mutations, no partial grant. NOT_FOUND/identity/unsafe-command failures must not invoke this retry. Use actual rows and spies to prove zero reserve/finalize/settle/Provider calls. Run the new begin tests plus existing admission/repository/budget/entitlement and Task5 begin codec tests, lint explicit changed TS, Root typecheck; obtain SPEC then QUALITY on final hashes.

## Subtask 3: Finish begin race matrix and integrated local acceptance

**Files:** only mapped tests and strictly necessary fixes to subtask1/2 sources; Root evidence/status docs. No transport or import implementation here.

- [x] Complete the native SQL matrix below. A paused batch wrapper must pause before the actual `db.batch`, not inside an open SQLite transaction. A delayed start loses to a real close or terminal accounting write at actual SQL. A begin winner prevents later pre-begin close/release; neither ordering permits two starts.

| Case | Required assertion |
| --- | --- |
| Each begin batch statement/assertion fails | Both execution and run unchanged; no grant/deadline orphan. |
| Final run CAS changes zero | Entire batch rolls back the prior execution begin. |
| Close commits before delayed begin batch | No grant; original closed terminal pair and accounting retained. |
| Begin commits before close | Original grant remains; pre-begin close/release rejects, no unsent inference. |
| Quota terminal/corrupt-parent after pre-read | Actual begin SQL rejects, rows and balances unchanged. |
| Budget held/settled/released/wrong relation after pre-read | Actual begin SQL rejects, first accounting outcome retained. |
| SQL clock crosses queue deadline after pre-read | No begin at equality/after; application clock cannot authorize. |
| Grant issued near end of queue | Full original1260000ms lease starts once; no shortened Provider budget. |
| Two concurrent begin calls / lost acknowledgement | One version increment and exact same grant, current remaining time only. |
| Competing begin between the reader's run and execution SELECTs | B commits while A is paused; A's bounded strict reread returns B's original grant, one increment per row, no A batch or accounting writes. |
| Competing begin between outer run read and execution reader | Reject contradictory outer pair, reread the complete pair once, return original grant without mutation. |
| Persistent malformed or contradictory pair | Initial observation plus one read-only retry both fail; bounded unavailable, no grant, no begin/accounting writes. |
| Gate disabled after original begin | Same original grant readable, no renewal or accounting writes. |
| Reopen file DB/new repositories | Original job/context/grant/deadlines survive and replay without mutation. |
| Expired or terminal original grant | No resurrection or lease renewal; expired remainingMs0. |
| Reply delayed by transport RTT | Existing Task5 budget guard rejects when full1200000+30000 no longer remains. |
| Wrong owner/job/hash and unsafe command | No foreign data/grant or state/accounting writes. |
| Migration/current-reader compatibility | Old modes/public DTOs and Task10 cache/close/admission guards retained. |

- [x] Run final focused tests together: all Task10 final20 files plus new `tests/db/site-begin-migration.test.ts`, `tests/server/d1-site-begin-repository.test.ts`, and existing `tests/server/research-executor-begin.test.ts`. Include additional meaningful regression only for an actual newly modified dependency. Do not repeat the unchanged old baseline before implementation or run frontend build/package `test`.
- [x] Run ESLint using an explicit list derived from this plan's actually changed `.ts` files. Root executes the current-input scope verifier and nonincremental compiler, recording command, exit and new source hashes under unique labels. Keep all current inputs and compiler options; exclude only historical outputs as before.

```powershell
node outputs/local-durable-executor-20260914/verify-type-scope.mjs task11-final-acceptance
node node_modules/typescript/bin/tsc --project outputs/local-durable-executor-20260914/tsconfig.acceptance.json --noEmit --incremental false
```

- [x] Root independently checks final source identities, actual passing full test names for every matrix row, current type inputs and untouched Task5/Task9/public/factory/policy/historical migration files. Obtain final integrated SPEC then independent QUALITY. Only after both PASS update plan/progress and proceed to the next approved integration unit. Preserve first RED and any infrastructure failures with accurate classifications.

## Plan self-review

- Approved design coverage: atomic one-time Site begin, actual database-time eligibility, full execution lease, replay without renewal, conservative known-unsent boundary and immutable result identity are covered; dispatch/import/routes/Cron remain subsequent units.
- Existing decisions reused: Task5 protocol/time codecs and policy are unchanged; Task10 immutable identity, reservation expiry, owner checks, quota integrity and accounting rules remain authoritative.
- Schema compatibility: the only new field is an original execution deadline. Bounded backfill uses existing began markers only; no grant is created for pending or closed records. Existing synthetic begun fixtures change setup, never their safety assertions.
- Type consistency: SiteExecutionRecord gains a required nullable field; all initial/parsed/literal instances are mapped. Begin command has no caller clock/deadline; returned type is the existing BridgeBeginReply.
- Atomicity: real D1 batch contains two updates and two in-SQL assertions; observation/replay never substitutes for the actual grant CAS.
- Read consistency: initial and post-batch observations use one shared bounded strict reread policy, including internal two-query and outer-pair interleavings. Persistent corruption remains unavailable; recovery never retries a mutation or relaxes ownership, identity or lifecycle validation. Original review and reviewed plan bytes remain in `task11-plan-review.json/.md` and `task11-plan-before-pause.md`.
- Authorization/workflow: existing approved design covers this unit; no new paid attempt, production operation, account purchase or remote-enable permission is inferred. Sequential subagents/TDD/SPEC then QUALITY remain mandatory.
