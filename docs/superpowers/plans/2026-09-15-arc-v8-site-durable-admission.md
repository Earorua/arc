# ARC V8 Site Durable Admission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist a remote research run and immutable outbox atomically, admit its existing quota and budget safely, and close/reconcile it before begin without leaked reservations or synchronous recovery interference.

**Architecture:** Add an explicit mode marker and remote quota key to Site research runs, and one Site execution table that also serves as the outbox. Extend the existing D1 creation transaction and accounting primitives, with a small unrouted admission coordinator and an atomic cached-package shortcut. Keep remote transport, begin grants, result import, and deployment separate.

**Tech Stack:** TypeScript, Zod, Cloudflare D1 SQLite batches, Drizzle schema/migrations, Vitest, existing real-SQLite D1 test adapter.

---

**Status: implementation plan under the already-approved design; clarification review pending.** This is Task10 within `docs/superpowers/specs/2026-09-14-arc-v8-durable-research-executor-design.md`. The parent verified Task9 specification and quality PASS on the same final seven source files, 408 current type inputs, and all 1,090 handoff files with zero mismatches; see `outputs/local-durable-executor-20260914/resume-task10-verification.json`. Task9 is complete and is not repeated here. The original full-plan review PASS remains frozen at its original plan hash; the three execution clarifications in this revision need a fresh parent-arranged review before implementation. This document is neither implementation evidence nor review approval. Preserve Task9 files, checkpoint artifacts, `task10-plan-before-clarifications.md`, and `task10-plan-review-initial.json`.

Work in the existing worktree. The already-approved design supplies product decisions; this task needs no new product-choice approval. During implementation follow the parent task's established review/commit procedure; do not introduce Git mutations or remote actions merely because the planning skill normally recommends commits. All commands below are local. Do not read keys or secret environment files, call a Provider, provision resources, publish, or route the new coordinator.

Execute Tasks 1–8 sequentially with a fresh implementer for each subtask, then fresh specification review followed by quality review on that subtask's final files. Fixes return to that implementer and both reviews must PASS on the same final hashes before the next subtask. Keep all implementation boxes unchecked until the corresponding work is actually verified. The parent owns acceptance type-scope evidence and typecheck execution, including the Task1 checkpoint and final Task8 commands; implementers hand off files and do not duplicate those commands or the already-captured baseline.

## Fixed boundary and invariants

- Sites retains session/owner/origin/cohort/rate/cache/quota/budget/quality/planning authority. Callers of the new private coordinator must supply policy/gate decisions from Sites; the coordinator is not an HTTP handler or an authorization replacement.
- Persist `execution_mode='synchronous'` by default. Remote mode is exactly `cloudflare-workflow-v1`. Unknown/null/missing modes fail closed; never infer synchronous mode from a missing execution row or current switches.
- Run, new mutation alias, and execution/outbox are one D1 batch. Alias/direct/active joins return the winner's original run/request/job/context/deadlines. Do not add executor mode to public DTOs, fingerprints, alias JSON, or the existing active uniqueness key. Never fabricate a configuration fingerprint using a pseudo Provider key.
- Remote Retry creates a new run/request/job only when the source permits Retry and its fingerprint equals the current fingerprint supplied by trusted policy. Enforce this in the repository, not only in the old orchestrator. A replay of the Retry mutation returns its original identities.
- Reuse `parseBridgeJob`, `encodeBridgeJob`, and `hashBridgeJob`. Job UUID generation is separate from existing repository `createId`, whose historical fixtures legitimately return `research-run-1`.
- Queue TTL is 120,000 ms. Provider timeout is 1,200,000 ms; future begin lease is 1,260,000 ms. Reservation expiry is original creation time + 1,380,000 ms. Queued run active expiry is the original queue expiry. No replay, policy reload, or midnight transition renews either deadline.
- Snapshot all eight validation versions, package ID, observed date, and expiry date at remote creation. Import will consume that snapshot later. Use Task9's `RESEARCH_CONFIGURATION_VERSIONS`; do not duplicate the version object.
- Remote repair maximum is zero. Research/total maximum is positive and at most 5,000,000 micros, not necessarily exactly 5,000,000. Preserve uncapped actual-fee settlement primitives for later import.
- Normal admission reserves quota, then budget, then performs an actual SQL admitted CAS validating both reservations. Recovery of an uncertain/partial admission only reads and finalizes existing reservations; it never creates a missing reservation.
- Pre-begin closure atomically closes admission and terminalizes the queued run. Re-read reservations after that closure before releasing them. A begun execution is not proven unsent by Site state or missing audit rows.
- Remote known-unsent budget release uses `releaseRemoteBeforeBegin` with an actual-SQL closed/no-begin/exact-identity/status-reserved fence. Only an exactly matching already-released reservation is idempotent; held or settled reservations conflict. The coordinator never substitutes generic `settle(..., {kind:"not-charged"})` for this operation.
- Every remote reservation INSERT contains its immutable-identity/open-queued predicate. A preliminary read is not a fence. Lifecycle batches must throw inside SQL when a required companion CAS loses, so D1 rolls back the entire batch.
- Cache Ready requires zero quota/budget reservations and zero Provider calls. Include a small atomic cached attachment that closes the execution before returning Ready.
- Remote factory stays disabled/null. No new routes, network, auth changes, Workflow calls, workflow acknowledgements, begin grant implementation, result import/publication, Cron scheduling, frontend changes, or `backgroundAccepted` claims. The old normalized result-publication batch issue is owned by the later import unit, not repaired generally here.

## File map before implementation

Paths are relative to this worktree root.

| File | Change and responsibility |
| --- | --- |
| `docs/superpowers/plans/2026-09-15-arc-v8-site-durable-admission.md` | Approved-design implementation plan, three clarifications, and implementation checkboxes. |
| `drizzle/0008_research_site_executions.sql` | New migration: two run columns, execution/outbox table, indexes, immutable/monotonic triggers. |
| `drizzle/meta/_journal.json` | Append index 8/tag `0008_research_site_executions`, version `6`, breakpoints true, current local timestamp. Preserve prior entries. |
| `db/schema.ts` | Reflect new columns/table/checks/indexes. SQL triggers remain migration-owned. |
| `app/server/research/repository.ts` | Required private run mode/key, explicit remote creation/retry/cache contracts, ordinary create excludes new private fields. |
| `app/server/research/d1-repository.ts` | Share current creation/alias resolution; append execution insert in the same batch; strict run classification; remote cache transaction; synchronous write guards. |
| `app/server/research/site-execution-repository.ts` | Small private DTO/parser/SQL-clock/identity contract and same-batch execution insertion helper contract. No transport. |
| `app/server/research/d1-site-execution-repository.ts` | Stored execution validation, create statement builder, actual admitted CAS, atomic pre-begin close. |
| `app/server/research/site-admission.ts` | Normal cache/quota/budget/admitted sequence and read-only-reservation recovery/settlement sequence. No route/factory imports. |
| `app/server/research/package-validator.ts` | Export the existing bounded context parser and reuse it in validation. |
| `app/server/entitlements/d1-research-quota-sql.ts` | Narrow extraction of existing ledger integrity SQL and exact-live research reservation predicate. |
| `app/server/entitlements/repository.ts` | Explicit remote quota admission command/method, retaining ordinary admission. |
| `app/server/entitlements/d1-entitlement-repository.ts` | Reuse extracted SQL; guarded remote insertion and legacy remote-key exclusion. |
| `app/server/research/budget.ts` | Explicit remote budget reserve and known-unsent release contracts; preserve generic settlement/read contracts. |
| `app/server/research/d1-budget-repository.ts` | Guard actual remote reserve INSERT; positive synchronous guard in ordinary reserve; exact remote replay; fenced known-unsent release using the existing bucket-release chain. |
| `app/server/research/orchestrator.ts` | Exclude persisted remote records before synchronous execute/replay/catch/reconciliation. |
| `tests/helpers/sqlite-d1.ts` | Add migration 0008 to the standard local DB list; preserve native database exposure and batch semantics. |
| `tests/helpers/site-admission-fixture.ts` | Task1 existing-schema clock/seed/repositories/commands/counters/control points; add remote capabilities only in their owning Tasks 3–6. |
| `tests/server/site-admission-fixture.test.ts` | Task1 node/real-SQLite clock, owner isolation, and delayed-write control-point infrastructure checks; no remote behavior dependency. |
| `tests/server/d1-site-execution-repository.test.ts` | Real-SQLite schema, creation/replay, admitted/close/cache CAS and reopen tests. |
| `tests/server/site-admission.test.ts` | Coordinator order, durable rereads, partial reconciliation, cache and lost-ack tests. |
| `tests/server/d1-entitlement-repository.test.ts` | Existing quota integrity plus remote/legacy insertion guards and midnight races. |
| `tests/server/d1-research-budget-repository.test.ts` | Remote reserve/release guards, deadline, accounting, replay, held/settled conflicts, actual delayed SQL, and rollback behavior. |
| `tests/server/d1-research-repository.test.ts` | Synchronous behavior, mode parsing, SQL mutation exclusions, cache integrity regression. |
| `tests/server/research-recovery.test.ts` | Original alias/direct/Retry recovery compatibility and remote classification. |
| `tests/server/research-orchestrator.test.ts` | Remote exclusion with current switches/configuration unavailable; preserve synchronous settlement. |
| `tests/server/research-package-validator.test.ts` | Context parser safety and snapshot stability. |
| `tests/db/site-execution-migration.test.ts` | Migration preservation, upgrades containing old rows, constraints, indexes, triggers, rollback assertion. |
| `tests/db/schema.test.ts` | Narrow exported-table inventory update, including already-existing `research_bridge_nonces`. |
| `tests/db/migration-safety.test.ts` | Narrow SQL/journal inventory update through 0008; retain historical hash/snapshot assertions. |

Read-only dependencies: `executor/job.ts`, `executor/begin.ts`, `execution-policy.ts`, `production-policy.ts`, existing source/package integrity helpers, `tests/fixtures/research/valid-candidate.ts`. Do not edit Task9 production-policy/connection/service-factory tests or `.env.example`. No generated snapshot or Drizzle configuration change is required to execute hand-authored local migration 0008; do not run `db:generate`. A later migration-generation task must account for the hand-authored migration before generating from snapshots.

## Private API and stored schema decisions

Use these names consistently. All public method inputs are bounded plain-JSON snapshots before their first await; reject accessors, exotic prototypes, symbols, oversize data, and unsafe integers using existing `readBoundedResearchJson` conventions. Owners remain authenticated caller inputs, never request-body controls. Use the accounting-compatible owner/request maximum of 160 and quota-key maximum of 128 for new remote inputs, while leaving old synchronous bounds unchanged.

```ts
type ResearchExecutionMode = "synchronous" | "cloudflare-workflow-v1";
// Add to ResearchRunRecord; parse both from every SELECT * run row.
type RunExecutionFields = {
  executionMode: ResearchExecutionMode;
  remoteQuotaKey: string | null;
};
// Add both fields to CreateResearchRunCommand's existing Omit list.

type RemoteCreationPolicy = Readonly<{
  cacheDays: number;                 // integer 1..365
  userDailyQuota: number;            // integer 1..100000
  dailyBudgetMicros: number;         // positive safe integer
  monthlyBudgetMicros: number;       // positive safe integer
  maximumMicros: number;             // 1..5000000, repair is always zero
}>;
type CreateRemoteResearchRunCommand =
  Omit<CreateResearchRunCommand, "activeExpiresAt"> & {
    policy: RemoteCreationPolicy;
  };
type CreateRemoteResearchRetryCommand = {
  ownerId: string; runId: string; requestId: string; mutationId: string;
  currentConfigFingerprint: string; policy: RemoteCreationPolicy;
};
type SiteExecutionIdentity = Readonly<{
  ownerId: string; runId: string; requestId: string;
  jobId: string; requestHash: string;
}>;
type SiteExecutionRecord = SiteExecutionIdentity & Readonly<{
  job: BridgeJob;
  validationContext: ResearchValidationContext;
  quotaKey: string; policy: RemoteCreationPolicy;
  reservationExpiresAt: number;
  admissionState: "pending" | "admitted" | "closed";
  version: number;
  quotaReservationId: string | null;
  budgetReservationId: string | null;
  admittedAt: number | null;
  closedAt: number | null;
  closeReason: "cached" | "denied" | "expired" | "interrupted" | null;
  beganAt: number | null;            // future begin marker; this unit never sets it
  createdAt: number; updatedAt: number;
}>;
type RemoteCreationResult = {
  run: ResearchRunRecord; replayed: boolean;
  // null only if existing alias/direct/active winner is synchronous.
  execution: SiteExecutionRecord | null;
};
type SiteAdmissionResult = Readonly<{
  run: ResearchRunRecord; execution: SiteExecutionRecord;
}>;
```

Repository additions (private server contracts; ordinary methods retain their signatures):

```ts
interface RemoteResearchCreationRepository {
  createRemoteOrReplay(command: CreateRemoteResearchRunCommand): Promise<RemoteCreationResult>;
  createRemoteRetry(command: CreateRemoteResearchRetryCommand): Promise<RemoteCreationResult>;
  attachRemoteCachedPackage(command: SiteExecutionIdentity & {
    expectedRunVersion: number; expectedExecutionVersion: number;
    package: ResearchPackage;
  }): Promise<SiteAdmissionResult>;
}
interface SiteExecutionRepository {
  read(ownerId: string, runId: string): Promise<SiteExecutionRecord | null>;
  markAdmitted(command: SiteExecutionIdentity & {
    expectedVersion: number;
    quotaReservationId: string; budgetReservationId: string;
  }): Promise<SiteExecutionRecord>;
  closeBeforeBegin(command: SiteExecutionIdentity & {
    reason: "denied" | "expired" | "interrupted";
  }): Promise<SiteAdmissionResult>;
}
// D1SiteExecutionRepository(db, runs: Pick<ResearchRepository, "getRun">)
// uses the supplied run reader for strict mode/public-record parsing. Import
// ResearchRepository as a type only; do not introduce a runtime repository cycle.
// D1ResearchRepository can construct this reader with (db, this).
// buildSiteExecutionInsert(db, initial: SiteExecutionRecord): D1PreparedStatement
// is a standalone export from d1-site-execution-repository.ts. Require pending,
// version=0, all lifecycle markers/IDs null and createdAt=updatedAt.
// D1ResearchRepository options additionally accept createJobId?: () => string;
// default crypto.randomUUID, independently of the historical createId callback.
type RemoteResearchQuotaAdmission = SiteExecutionIdentity & {
  userId: string; purpose: "role-research"; idempotencyKey: string;
  units: 1; dailyQuota: number; period: EntitlementPeriod;
};
// D1EntitlementRepository.admitRemoteResearch -> ResearchQuotaDecision.
// D1ResearchBudgetRepository.reserveRemote -> BudgetDecision.
type RemoteBudgetReserveCommand = BudgetReserveCommand & SiteExecutionIdentity;
type RemoteBudgetReleaseBeforeBeginCommand = SiteExecutionIdentity & {
  reservationId: string;
};
// In budget.ts, add a separate private remote interface; do not expand the
// existing ResearchBudgetRepository requirements for synchronous implementations.
interface RemoteResearchBudgetRepository {
  reserveRemote(input: RemoteBudgetReserveCommand): Promise<BudgetDecision>;
  releaseRemoteBeforeBegin(input: RemoteBudgetReleaseBeforeBeginCommand): Promise<BudgetReservation>;
}
// D1ResearchBudgetRepository implements both interfaces. Identity is imported
// type-only from site-execution-repository.ts; no runtime dependency cycle.
type SiteAdmissionGate = Readonly<{
  newCallsAllowed: boolean; cohortEnabled: boolean; rateAllowed: boolean;
}>;
type SiteAdmissionDependencies = {
  research: ResearchRepository & RemoteResearchCreationRepository;
  executions: SiteExecutionRepository;
  entitlements: Pick<D1EntitlementRepository,
    "admitRemoteResearch" | "readResearchReservation" | "finalize">;
  budget: Pick<D1ResearchBudgetRepository,
    "reserveRemote" | "findReservation" | "releaseRemoteBeforeBegin">;
  now?: () => number;
};
// SiteAdmissionCoordinator(dependencies: SiteAdmissionDependencies)
// admitNew(identity: SiteExecutionIdentity, gate: SiteAdmissionGate): Promise<SiteAdmissionResult>
// reconcileBeforeBegin(identity: SiteExecutionIdentity): Promise<SiteAdmissionResult>
```

`admitNew` is only invoked by a future trusted caller for a newly created remote run. Replay/get/recovery use `reconcileBeforeBegin`, never `admitNew`; no recovery creates reservations. Repeated normal calls after `admitted` return stored state without writes; after `closed` return stored terminal state. A pending execution with either existing reservation is treated as partial/uncertain admission and reconciled, not completed by reserving a missing counterpart. A caller that lost admission acknowledgement must enter recovery.

`read` returns null only for a genuinely absent owner run or a synchronous run. If an owned run is remote but its execution is missing/corrupt/mismatched, throw `ResearchRepositoryError("RESEARCH_UNAVAILABLE")`. Reject foreign owner access without returning any foreign data. Use existing `CONFLICT`, `NOT_FOUND`, and `RESEARCH_UNAVAILABLE` error vocabulary, without raw SQL/errors or Provider content.

Execution table name: `research_site_executions`. Exact columns:

| Column | Definition/invariant |
| --- | --- |
| `run_id` | TEXT PRIMARY KEY, FK to research_runs.id, restrictive delete. |
| `user_id` | TEXT NOT NULL; composite owner/run FK to existing research_runs(user_id,id). |
| `request_id` | TEXT NOT NULL UNIQUE; equals run.request_id. |
| `job_id` | TEXT NOT NULL UNIQUE; strict UUID parser on write/read. |
| `request_hash` | TEXT NOT NULL; 64 lowercase hex; recomputed SHA-256 equals canonical stored job. |
| `job_json` | TEXT NOT NULL; bounded valid JSON, byte bound BRIDGE_BODY_LIMITS.request. Exact canonical string from encodeBridgeJob. |
| `validation_context_json` | TEXT NOT NULL; bounded valid JSON, 4096 bytes maximum; strict existing context parser. |
| `quota_key` | TEXT NOT NULL; deterministicId("research-quota", [owner,run,request]); matches run.remote_quota_key. UNIQUE(user_id,quota_key). |
| `cache_days`, `user_daily_quota` | INTEGER NOT NULL, ranges 1..365 and 1..100000. |
| `daily_budget_micros`, `monthly_budget_micros`, `maximum_micros` | INTEGER NOT NULL; positive safe integers; maximum <=5000000. Frozen policy values. |
| `queue_expires_at` | INTEGER NOT NULL; created_at +120000. |
| `reservation_expires_at` | INTEGER NOT NULL; created_at +1380000. |
| `admission_state` | TEXT NOT NULL DEFAULT 'pending'; pending/admitted/closed. |
| `version` | INTEGER NOT NULL DEFAULT 0; nonnegative safe integer. Every lifecycle mutation increments once. |
| `quota_reservation_id`, `budget_reservation_id` | TEXT nullable, both null or both non-null; set by admitted CAS only and never replaced. |
| `admitted_at` | INTEGER nullable; present with both reservation IDs, retained on later closure. |
| `closed_at`, `close_reason` | Both null until closed, then time and cached/denied/expired/interrupted. |
| `began_at` | INTEGER nullable. Future begin must require admitted, queue-valid, same immutable job. This unit leaves null and cannot close if non-null. |
| `created_at`, `updated_at` | INTEGER NOT NULL safe timestamps; immutable created_at, updated_at >= created_at. |

Run additions are `execution_mode TEXT NOT NULL DEFAULT 'synchronous'` with allowed-value CHECK, and `remote_quota_key TEXT` with a cross-column CHECK: synchronous iff key is null; remote iff key is bounded nonempty text (8..128). Add unique partial index `(user_id,remote_quota_key) WHERE remote_quota_key IS NOT NULL`. Use `ALTER TABLE ADD COLUMN` only; do not rebuild or rewrite old run rows. Add an immutable-fields trigger on run mode/key and on execution identity/job/context/policy/expiry/creation columns. Execution lifecycle trigger prevents closed→open, admitted→pending, replacement/removal of established reservation IDs/admitted_at/began_at, and closure after began_at. Check state/marker consistency and safe integer arithmetic, with creation <= MAX_SAFE_INTEGER-1380000. Index `(admission_state,queue_expires_at,run_id)` for later bounded maintenance; do not implement cursors here.

The execution insert validates run owner/request/mode/quota key, queued state/slot, and run creation/deadline equality in SQL. JSON identity fields must equal redundant columns (`jobId`, `runId`, `requestId`, `createdAt`, `queueExpiresAt`), and reads additionally validate input/config/role/locale against the run. Immutability must be enforced in actual SQLite, not just readonly TypeScript types. Mutation of the public run's lifecycle remains possible through the explicitly guarded methods.

## Task 1: Reuse captured baseline and establish independent test infrastructure

**Exact writable files:** create `tests/helpers/site-admission-fixture.ts` and `tests/server/site-admission-fixture.test.ts` only. Read `tests/helpers/sqlite-d1.ts`, the three existing D1 repository constructors, `CreateResearchRunCommand`, and existing repository tests; do not edit production sources, the standard adapter, schema, or migrations in this subtask. Both new files must run/typecheck against the existing through-0007 schema before Task2 or Task3 exists.

**Already captured evidence, not new work:** Task9's final dual PASS is recorded in `outputs/local-durable-executor-20260914/resume-task10-verification.json`. The parent's eight-file baseline is `task10-baseline.json` with interpretation in `task10-baseline-analysis.json`: 418 total, 415 pass, 3 pre-existing inventory failures, 0 pending. The three failures are the migration-file inventory, journal-index inventory, and exported-table inventory omitting already-present 0007/nonce data. Do not rerun the unchanged baseline or call it new behavioral RED. Task2 narrowly fixes these inventories while preserving historical hashes and snapshot-link assertions.

- [x] Create `createSiteAdmissionFixture` using only current types and repositories: `createResearchD1`, `seedUser`, `D1ResearchRepository`, `D1EntitlementRepository`, `D1ResearchBudgetRepository`, `CreateResearchRunCommand`, and `fingerprint`. Use `NOW=Date.parse("2026-09-15T12:00:00.000Z")`; seed owner-a and owner-b. Each repository gets its own deterministic counter and `now: () => appNow`. Expose only `db`, `research`, `quota`, `budget`, `command`, `setSqlNow`, `setAppNow`, `readCounts`, and the local control-point helper in this phase. `command` returns the existing synchronous command type, with a new request/mutation sequence each time and the supplied owner. Count only existing run/alias/quota/budget tables. Do not import or synthesize `SiteExecutionRecord`, `RemoteCreationPolicy`, remote repository methods, a coordinator, execution counts, or remote fixture objects yet.

```ts
let appNow = NOW;
let sqlNow = NOW;
let commandSequence = 0;
const setAppNow = (value: number) => { appNow = value; };
const setSqlNow = (value: number) => { sqlNow = value; };
db.database.function("unixepoch", { varargs: true }, (...args) => {
  if (args.length === 0) return Math.floor(sqlNow / 1000);
  if (args.length === 1 && args[0] === "subsec") return sqlNow / 1000;
  throw new Error("Unexpected SQL clock call in this fixture");
});
const command = (ownerId = "owner-a"): CreateResearchRunCommand => {
  const sequence = ++commandSequence;
  return {
    ownerId, requestId: `request-${sequence}`, mutationId: `mutation-${sequence}`,
    rawRole: "Data Product Manager", normalizedRoleKey: "data product manager",
    locale: "en-US", inputFingerprint: fingerprint(["data product manager", "en-US"]),
    configFingerprint: fingerprint(["synthetic-current-config"]),
    activeExpiresAt: appNow + 120_000,
  };
};
```

Register the SQL clock after migration/seed; the zero-argument form also supports later INSERT defaults. No test-clock parameter or alternate function name enters production SQL. Use a local promise control point with `entered`, `resume`, and `wait` to pause before a real statement runs, never inside an open SQLite transaction:

```ts
export function createControlPoint() {
  let enter!: () => void;
  let resume!: () => void;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  const resumed = new Promise<void>((resolve) => { resume = resolve; });
  return { entered, resume, wait: async () => { enter(); await resumed; } };
}
```

- [x] Add three infrastructure checks to `tests/server/site-admission-fixture.test.ts` with `// @vitest-environment node` and afterEach database cleanup: real SQLite subsecond time changes only with `setSqlNow`; ordinary `createOrReplay`/`getRun` proves owner-b cannot read owner-a's run; a local control point pauses a prepared real SQL UPDATE, verifies the stored value before resume, then verifies the actual write after resume. These validate the harness; no extra tests are needed merely to mirror the ID factory. For the last check use an existing seeded user and the actual D1 statement:

```ts
const point = createControlPoint();
const write = (async () => {
  await point.wait();
  await fixture.db.prepare("UPDATE users SET name=?1 WHERE id=?2")
    .bind("resumed", "owner-a").run();
})();
await point.entered;
expect(fixture.db.database.prepare("SELECT name FROM users WHERE id=?")
  .get("owner-a")).toEqual({ name: "owner-a" });
point.resume();
await write;
expect(fixture.db.database.prepare("SELECT name FROM users WHERE id=?")
  .get("owner-a")).toEqual({ name: "resumed" });
```

- [x] Run the minimal independent harness check and focused lint; hand off the two files for the parent's current-input typecheck before Tasks2/3. Record exact command/results and both file hashes as Task1 infrastructure evidence, separate from later behavioral RED/GREEN. Expected: three harness tests pass, lint passes, current-input typecheck passes with no Task2/3 files required.

```powershell
node node_modules/vitest/vitest.mjs run tests/server/site-admission-fixture.test.ts
npm exec -- eslint tests/helpers/site-admission-fixture.ts tests/server/site-admission-fixture.test.ts
# Parent only; these labels must not already exist.
node outputs/local-durable-executor-20260914/verify-type-scope.mjs task10-subtask1-acceptance
node node_modules/typescript/bin/tsc --project outputs/local-durable-executor-20260914/tsconfig.acceptance.json --noEmit --incremental false
```

The scope verifier must preserve every current root-config input and identical compiler options, excluding only historical `outputs` inputs. If a repeated check is needed after changes, the parent chooses a fresh label such as `task10-subtask1-acceptance-r2`; never overwrite evidence or weaken the config. Task1 gets its own SPEC then QUALITY reviews; no whole-API stub unit precedes the behavior subtasks.

## Task 2: Add schema and strict mode classification

**Files:** migration 0008, journal, schema.ts, repository.ts, d1-repository.ts parseRun, standard SQLite migration list, schema/migration tests.

- [x] Establish the migration file/schema as infrastructure, then write executable constraint tests upgrading a SQLite DB seeded through 0007 with an ordinary run. Assert old run has synchronous/null and unchanged public fields; insert explicit remote/key row and exercise constraints. Constraint RED tests must demonstrate accepted invalid writes or incorrect preserved values, not a missing migration file/column/table. Record infrastructure setup separately from behavior-driven RED/GREEN evidence.

```ts
expect(db.database.prepare(
  "SELECT execution_mode,remote_quota_key FROM research_runs WHERE id=?",
).get("historical-run")).toEqual({
  execution_mode: "synchronous", remote_quota_key: null,
});
expect(() => db.database.prepare(
  "UPDATE research_runs SET execution_mode=? WHERE id=?",
).run("unexpected", "historical-run")).toThrow();
```

- [x] Implement the exact schema decisions above. Use migration statement breakpoints around whole triggers (do not split trigger bodies on their semicolons). Preserve 0000..0007 bytes. Update the local test migration list and journal with entry 8. Update only inventories in existing schema/migration tests through 0008, preserving 0005→0006 snapshot-link assertions and earlier SQL hashes. Do not create an 0008 snapshot or invoke generation.
- [x] Add required run fields to strict parsing; exempt both from ordinary create command derivation so existing callers require no new values. Reject mode/key inconsistency at runtime as well as SQL. Add tests for old ordinary creation and malicious unknown/missing mode using a controlled row-read test adapter; no fallback default in parseRun.

```ts
const executionMode = parseContract(
  z.enum(["synchronous", "cloudflare-workflow-v1"]), row.execution_mode,
);
const remoteQuotaKey = parseContract(
  z.string().min(8).max(128).nullable(), row.remote_quota_key,
);
if ((executionMode === "synchronous") !== (remoteQuotaKey === null)) {
  throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
}
```

- [x] Run `npm run test:unit -- tests/db/site-execution-migration.test.ts tests/db/schema.test.ts tests/db/migration-safety.test.ts tests/server/d1-research-repository.test.ts`. Expected: constraints and backward-compatible run reads pass; unsafe rows fail closed.

## Task 3: Snapshot immutable jobs and create/replay them atomically

**Files:** validation parser, Site execution contracts/implementation, research repository contracts/implementation, `tests/helpers/site-admission-fixture.ts`, creation and parser tests.

Task3 fixture clarification: include `tests/server/site-admission-fixture.test.ts` to verify its new remote capabilities, preserving its three existing tests. Permit only an optional `filename = ":memory:"` argument in `tests/helpers/sqlite-d1.ts`, passed to its existing `SqliteD1` constructor, so the required file-reopen test genuinely uses a disk database without duplicating the migration list. Preserve default behavior, migration list and batch semantics. These are local test infrastructure changes within the approved persistence acceptance; they add no production feature or new API behavior. The subtask implementation/reviews cover these two files as well.

Introduce only this task's callable creation/Retry/read/builder seams after Task2's schema and required run fields exist and after the context parser step below. Before each behavior RED, add its exact contract and a callable implementation that safely throws `ResearchRepositoryError("RESEARCH_UNAVAILABLE")`; do not implement admission/closure/coordinator stubs. Add fixture `executions`, `remoteCommand`, and execution counts only with these real types/read capabilities. Later snippets use `fixture.remoteCommand()` for remote creation; retain Task1 `command()` for synchronous fixtures. `remoteCommand` removes `activeExpiresAt` from the synchronous command and adds policy `{cacheDays:30,userDailyQuota:3,dailyBudgetMicros:20000000,monthlyBudgetMicros:100000000,maximumMicros:5000000}`. Introduce the independent job UUID counter here (`00000000-0000-4000-8000-` plus twelve digits), and use existing `RESEARCH_CONFIGURATION_VERSIONS` for the snapshot. Do not declare a class implements a later full interface until its required methods exist; staged fixtures use the current concrete methods or exact `Pick` contracts.

- [x] Export the existing context parsing operation and replace the duplicate inline parse in `validateResearchCandidate` with it:

```ts
export function parseResearchValidationContext(input: unknown): ResearchValidationContext {
  try { return Object.freeze(contextSchema.parse(readBoundedResearchJson(input))); }
  catch { throw new ResearchValidationContextError(); }
}
```

Test reject unknown fields/accessors, invalid date order, and wrong versions. Snapshot mutating caller input before a delayed await must not alter stored metadata. The parser is the same validation contract used by existing candidate validation.

- [x] Add callable-seam RED tests for one remote create and stored snapshot. After successful creation require one run/alias/execution, queued public state, 120000-ms queue, 1380000-ms reservation horizon, UUID job, all eight versions, deterministic package/quota keys, canonical bytes and SHA-256. Observed date derives from the single creation time; expiry derives from that same time plus cacheDays.

```ts
const created = await fixture.research.createRemoteOrReplay(fixture.remoteCommand());
expect(created.execution?.job.runId).toBe(created.run.id);
expect(created.execution?.job.requestId).toBe(created.run.requestId);
expect(created.execution?.reservationExpiresAt).toBe(created.run.createdAt + 1_380_000);
expect(created.execution?.validationContext).toMatchObject(RESEARCH_CONFIGURATION_VERSIONS);
expect(created.run.executionMode).toBe("cloudflare-workflow-v1");
```

- [x] Refactor private `create` minimally to accept an optional already-validated remote policy and build a remote candidate only after no alias/direct/active winner exists. Keep original alias JSON and conflict handling. For remote, choose run ID with existing `createId`, take one creation timestamp, independently generate UUID, parse/hash the job, and build context from current version constant and that timestamp. Validate/snapshot all command/policy values before awaits. Hashing failure leaves no writes.

```ts
const job = parseBridgeJob({
  protocol: BRIDGE_AUTH_PROTOCOL, executor: BRIDGE_EXECUTOR_MODE,
  jobId: createJobId(), runId: id, requestId: command.requestId,
  inputFingerprint: command.inputFingerprint,
  configFingerprint: command.configFingerprint,
  policyId: KIMI_RESEARCH_EXECUTION_POLICY.profileId,
  role: command.rawRole, locale: command.locale,
  createdAt, queueExpiresAt: createdAt + BRIDGE_QUEUE_TTL_MS,
});
const requestHash = await hashBridgeJob(job);
const validationContext = parseResearchValidationContext({
  ...RESEARCH_CONFIGURATION_VERSIONS,
  packageId: deterministicId("research-package", [command.ownerId, id, command.requestId]),
  observedAt: new Date(createdAt).toISOString().slice(0, 10),
  expiresAt: new Date(createdAt + policy.cacheDays * 86_400_000).toISOString().slice(0, 10),
});
```

The D1 execution insertion builder receives the immutable validated candidate and returns a `D1PreparedStatement`; it does not execute a separate batch. The new batch is `[insertRunWithModeAndKey, insertAlias, insertExecution, assertOneChanged]`. The assertion below rejects an INSERT SELECT that matched zero rows. A success read must load and validate the original execution. On collision/lost acknowledgement, re-read alias/direct/active winner; never construct or attach a new job to that winner. Existing synchronous winners are returned with `execution:null` and are not converted.

```sql
SELECT CASE WHEN changes()=1 THEN 1 ELSE json('') END AS lifecycle_assertion
```

- [x] Implement remote Retry source validation before creation: owner exists, terminal retryable source, new request ID, source fingerprint equals supplied current fingerprint. Use the same private creation path and original replay resolution. Existing ordinary `createRetry` retains synchronous behavior but may not create a synchronous replacement by silently consuming a remote source; direct callers must use the remote entry point for remote sources.
- [x] Add failure-at-each-statement tests, lost-ack-after-commit, same mutation race, active-equivalence race, alias replay after changed input metadata, direct replay, mixed-mode winner, wrong owner/job/hash, mutable command trap, and explicit Retry new identities/current fingerprint. Reopen a file-backed DB with a new repository instance and assert exact original job/context/expiry without process memory.
- [x] Run `npm run test:unit -- tests/server/d1-site-execution-repository.test.ts tests/server/research-package-validator.test.ts tests/server/research-recovery.test.ts tests/server/d1-research-repository.test.ts`. Expected: one immutable winning execution, no orphans and unchanged historical recovery.

## Task 4: Reuse quota integrity and fence actual reservation writes

**Files:** entitlement SQL helper/repository/contracts, budget contracts/repository, `tests/helpers/site-admission-fixture.ts`, their focused tests.

Immediately before each new reserve behavior RED, add only its `admitRemoteResearch` or `reserveRemote` callable seam and command contract using Task3's stored identity/schema/parser. Safe seams throw the corresponding repository unavailable error without mutations. Add exact stored quota/budget command builders and reservation readers to the fixture here. Its methods must now call actual creation/read code from Task3; no fabricated remote stub fixture is accepted. Known-unsent release belongs to Task5, once atomic close is available.

- [x] Extract existing `ledgerGroups`, `invalidLedgerRow`, `groupJoin`, exact/research scope construction, identifier trimming/UTF-16 checks without changing their SQL semantics. The new helper exports `researchQuotaLedgerCte`, `researchQuotaInvalidRowsSql(ownerSql,keySql,periodStartSql?,periodEndSql?)`, and `researchQuotaLiveReservationSql(ownerSql,keySql,reservationIdSql)`; arguments are developer-owned SQL column/placeholder expressions only. No untrusted text interpolation or generic query DSL. The live predicate combines full exact-scope relationship integrity, exactly one reserved row with units=1/purpose role-research, matching reservation ID, and no terminal child. Existing admission still uses its original period-wide integrity and capacity logic.
- [x] Run existing `tests/server/d1-entitlement-repository.test.ts` before adding behavior; extraction alone must preserve all tests. Then add RED tests that close an execution immediately before the actual quota INSERT and prove no new reserved row. Add a remote-key legacy admission bypass test after deleting the execution in a controlled corruption fixture; the run marker alone still excludes insertion.
- [x] Implement `admitRemoteResearch` using the existing validated INSERT SELECT, adding an `EXISTS` join of run and execution that matches owner/run/request/job/hash/key/policy, remote mode, queued run/slot, pending admission, no began/closed marker, and actual database time strictly before queue expiry. Require `dailyQuota` equals frozen execution.user_daily_quota. Use actual SQL time for ledger created_at and ensure it belongs to the supplied UTC-day period. A write delayed past midnight must not use yesterday's capacity. SQL-time expression:

```sql
CAST(ROUND(unixepoch('subsec') * 1000) AS INTEGER)
```

Export `siteOpenAdmissionSql` from `d1-site-execution-repository.ts` with arguments that are a fixed object of developer-owned SQL expressions for owner/run/request/job/hash. Its result is an `EXISTS` SQL expression; all request values are separately bound parameters. Reuse it in both accounting implementations, never execute a preliminary check as authority. Both actual reservation statements must include the entire condition. Keep the helper narrow to immutable execution identity/open queued state; quota and budget retain their own accounting SQL. The D1 module imports accounting DTOs only as types and the extracted quota SQL as a runtime helper, avoiding an accounting-repository runtime cycle.

Legacy ordinary quota insertion gets an independent key exclusion inside its actual INSERT:

```sql
AND NOT EXISTS (
  SELECT 1 FROM research_runs r
  WHERE r.user_id=?1 AND r.remote_quota_key=?2
)
```

Also exclude/reject legacy replay for those keys before returning an allowed decision. This key-only API cannot positively join every historical synchronous quota key to a run; the immutable run marker is its independent exclusion. Never replace this predicate with an execution-table join. Other legacy purposes continue using their existing `reserve` method; it already rejects role-research.

- [x] Implement `reserveRemote` with a bounded snapshot of RemoteBudgetReserveCommand, matching frozen caps/max and exact original expiry in the actual INSERT. Preserve unique request ownership and both bucket increments. Use SQL clock for run/queue/expiry and current bucket-period admissibility; if application-selected day/month becomes stale before the INSERT, reject instead of allocating to old periods. Replay returns the exact existing reservation only after owner/run/request/max/expiry match; no new Provider authority is inferred from a replay. It may be read after expiry for reconciliation, but markAdmitted cannot accept it then.

Ordinary `reserve` must require `execution_mode='synchronous'` both in its initial validation and actual INSERT predicate, including its replay branch. Leave generic `settle`, `findReservation`, and actual overrun behavior unchanged. Remote reconciliation uses `findReservation` plus Task5's narrow `releaseRemoteBeforeBegin`; later import retains generic actual-fee settlement, including fees above the reservation.

- [x] Preserve INSERT→day increment→month increment adjacency because increments use `changes()`. Append this assertion only after the chain, binding the freshly generated attempt reservation ID. Its absence branch allows a guarded zero-insert denial; if this attempt owns a reservation, the month increment must have succeeded, which also requires success of the preceding day increment. No reservation owned by this attempt survives a failed increment. Guard remote bucket creation with the same execution fence. A denied INSERT leaves balances/version unchanged; new empty buckets in an otherwise open but capacity-denied attempt are harmless. Test post-insert failure rollback as well as post-pre-read closure.

```sql
SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM ai_budget_reservations WHERE id=?1
) OR changes()=1 THEN 1 ELSE json('') END AS lifecycle_assertion
```
- [x] Run `npm run test:unit -- tests/server/d1-entitlement-repository.test.ts tests/server/d1-research-budget-repository.test.ts tests/server/research-budget.test.ts tests/server/entitlements.test.ts`. Expected: existing accounting tests pass, delayed writes are fenced, midnight uses actual insertion day, actual fees can still exceed reservations.

## Task 5: Implement admitted CAS, atomic close, and fenced known-unsent release

**Files:** Site execution repository, `app/server/research/budget.ts`, `app/server/research/d1-budget-repository.ts`, `tests/helpers/site-admission-fixture.ts`, `tests/server/d1-site-execution-repository.test.ts`, `tests/server/d1-research-budget-repository.test.ts`.

Add callable `markAdmitted`, `closeBeforeBegin`, and `releaseRemoteBeforeBegin` seams immediately before their respective behavioral RED steps, using the real schema, parsers, and creation/reservation methods now available. Extend fixture lifecycle/control-point helpers alongside those tests. Safe Site seams throw `ResearchRepositoryError("RESEARCH_UNAVAILABLE")`; the budget seam throws `ResearchBudgetError("BUDGET_UNAVAILABLE")`. No safe seam may reserve, settle, or call Provider.

- [x] Write RED tests for markAdmitted with both valid durable reservations and for missing/terminal/wrong-ID/corrupt-parent quota, wrong owner/request/expiry/max budget, released/held budget, closed/begun/expired execution, and exhausted state version. Reuse existing ledger corruption fixtures; do not replace full integrity validation with a simple `NOT EXISTS terminal` check.
- [x] Implement markAdmitted as one actual UPDATE with the ledger CTE and exact live predicate from Task4. Match immutable identity, pending execution/version, queued run/slot, no began/closed marker, SQL clock < queue expiry, budget reserved/unexpired/exact immutable expiry/max, coherent day/month bucket identities/balances, and exact quota relationship. Set both reservation IDs, admitted_at=SQL clock, admission_state='admitted', version+1, updated_at. Public run remains queued. Repeated admitted call returns only the exact same IDs and immutable execution; terminal or mismatching retries conflict. Post-CAS re-read is observation, not authority.

```sql
UPDATE research_site_executions
SET admission_state='admitted', quota_reservation_id=?6,
    budget_reservation_id=?7, admitted_at=CAST(ROUND(unixepoch('subsec')*1000) AS INTEGER),
    version=version+1, updated_at=CAST(ROUND(unixepoch('subsec')*1000) AS INTEGER)
WHERE run_id=?1 AND user_id=?2 AND request_id=?3 AND job_id=?4
  AND request_hash=?5 AND admission_state='pending' AND version=?8
```

Append the full open/queued/deadline, exact-live-quota and exact-budget predicates described above to this statement. The supplied IDs are binding candidates only; earlier successful accounting reads do not suffice.

- [x] Write RED close tests where run update intentionally loses after execution closure would otherwise succeed. Implement one batch: update execution closed conditional on no began marker and open pending/admitted state; immediate assertOneChanged; update the paired queued run to failed/version+1, clear active slot/expiry, set retryable=1 and bounded error/category; immediate assertOneChanged. Map expired→`interrupted`/`timeout`, denied→`admission-denied`/`service-unavailable`, interrupted→`interrupted`/`service-unavailable`. Store close_reason separately. Do not derive unsent from stateVersion.

```ts
await db.batch([
  closeExecutionStatement,
  db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('') END AS lifecycle_assertion"),
  failQueuedRunStatement,
  db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('') END AS lifecycle_assertion"),
]);
```

The paired run update must match owner/request/remote mode, queued state and the just-closed immutable execution. Closure intentionally works after queue expiry and with current switches off. A missing/corrupt execution cannot be closed as proof of unsent. Catch storage ambiguity by re-reading exact run/execution: return a coherent already-closed pair; reject begun/foreign/incoherent state. Do not call ordinary transition or synchronous catch recovery. No release occurs inside this method.
- [x] Test races both orders: admission wins then closure closes it; closure wins then admission cannot reopen; quota/budget commits before closure then is discoverable; closure commits first then delayed INSERT cannot allocate. Exercise reopen and ack loss with original closed_at/reason retained. Test future began_at fixtures prevent closure/release, without implementing begin.

- [x] Add the private `RemoteBudgetReleaseBeforeBeginCommand`/`releaseRemoteBeforeBegin` contract specified above and executable RED tests for a closed known-unsent reservation, exact already-released replay, identity/reservation mismatch, open/begun/cached execution, and conservative-hold/settled conflicts. Snapshot bounded input before awaits. Use `ResearchBudgetError("CONFLICT")` for incompatible identity/lifecycle/accounting state; absent owned reservation is `NOT_FOUND`, malformed durable state is `BUDGET_UNAVAILABLE`. The success result is the existing `BudgetReservation`, with released status and zero settled micros. Release works after reservation expiry because closure, rather than a renewed deadline, proves unsent.

- [x] Implement release by reusing the existing settlement bucket validation and transition→day decrement→month decrement chain. Keep generic `settle` and all its signatures/status/actual-fee behavior unchanged. The new transition must constrain the actual UPDATE, not only its preceding reads:

```sql
UPDATE ai_budget_reservations
SET status='released', settled_micros=0,
    updated_at=CAST(ROUND(unixepoch('subsec')*1000) AS INTEGER)
WHERE id=?1 AND run_id=?2 AND request_id=?3
  AND status='reserved' AND settled_micros=0
  AND EXISTS (
    SELECT 1 FROM research_site_executions e
    JOIN research_runs r ON r.id=e.run_id AND r.user_id=e.user_id
    WHERE e.run_id=?2 AND e.request_id=?3 AND e.user_id=?4
      AND e.job_id=?5 AND e.request_hash=?6
      AND r.request_id=e.request_id AND r.execution_mode='cloudflare-workflow-v1'
      AND r.remote_quota_key=e.quota_key
      AND e.admission_state='closed' AND e.closed_at IS NOT NULL
      AND e.began_at IS NULL AND e.close_reason IN ('denied','expired','interrupted')
      AND r.state='failed' AND r.active_slot IS NULL AND r.active_expires_at IS NULL
      AND ai_budget_reservations.maximum_reserved_micros=e.maximum_micros
      AND ai_budget_reservations.expires_at=e.reservation_expires_at
      AND (e.budget_reservation_id IS NULL OR e.budget_reservation_id=?1)
  )
```

Bindings are reservationId/runId/requestId/ownerId/jobId/requestHash from the bounded command. Append the existing exact day/month bucket relationship, original periods, sufficient reserved balance, safe arithmetic and version predicates to this actual transition; decrement the stored reservation's two bucket IDs and exact immutable maximum with actualMicros=0. Preserve `changes()` adjacency: no assertion or read between the transition and its two bucket updates. A successful batch must report one changed row for each of these three statements. On a zero transition the two decrements write zero rows and the assertion below aborts the batch; reread the same exact closed/no-begin/owner/run/request/job/hash/reservation/max/expiry relationship. Only status released with zero settled micros is idempotent; held/settled are conflicts, never overwritten. A released row with a different immutable relationship is not an idempotent success.

Use the minimal existing-chain rollback proof: validate exact idempotent released state before attempting the mutation; every mutation batch requires its final month decrement `changes()=1` via `SELECT CASE WHEN changes()=1 THEN 1 ELSE json('') END AS lifecycle_assertion`. The month decrement requires the day decrement to change one row, and the day decrement requires the fenced transition to change one row. A zero-transition or lost-companion batch therefore throws and rolls back; exact reread then decides idempotent released versus conflict/unavailable. A pre-existing released row alone cannot waive the assertion after a failed companion update. This keeps the chain intact without adding a schema/table or changing generic settlement; a post-commit JavaScript result check is insufficient.

```ts
await db.batch([
  fencedReservedToReleased,
  decrementDay,
  decrementMonth,
  db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('') END AS lifecycle_assertion"),
]);
// On success or ambiguous/zero-CAS failure: exact immutable closed-state reread.
// Return only its released reservation; propagate conflict/unavailable otherwise.
```

- [x] Prove the SQL fence with a wrapper that pauses immediately before the release batch executes. After the method's preliminary read, introduce a held/settled state through controlled test SQL with coherent accounting, resume the actual batch, and assert conflict with the competing state, both bucket balances/versions, and lifecycle unchanged. Separately test mismatched identity and existing future began fixtures without bypassing lifecycle immutability to fabricate a lawful close→begin transition. Cover duplicate release/lost acknowledgement/file reopen, and an injected zero-row day or month decrement: the required final SQL assertion must roll back the reservation transition and any earlier bucket write. Snapshot balances before the tested attempt. No lawful hold writer after successful pre-begin closure was identified in the current unit; this adversarial contract test fulfills the plan's unconditional no-held-overwrite promise, not a claim of an existing business race or a wider accounting redesign.

- [x] Run `npm run test:unit -- tests/server/d1-site-execution-repository.test.ts tests/server/d1-research-budget-repository.test.ts tests/server/research-budget.test.ts`. Expected: atomic lifecycle/release, exact reservation validation, held/settled conflicts, no deadline revival or partial bucket state, and preserved generic uncapped actual-fee settlement.

## Task 6: Atomic remote cache shortcut and admission coordinator

**Files:** d1-repository remote cache method, Site coordinator, `tests/helpers/site-admission-fixture.ts`, their tests.

Add the callable remote cache seam immediately before cache RED; introduce `SiteAdmissionGate`, `SiteAdmissionDependencies`, and coordinator callable seams immediately before coordinator RED, now that every dependency exists. Add fixture `coordinator` and cache/coordinator helpers only here. Safe coordinator seams throw `ResearchRepositoryError("RESEARCH_UNAVAILABLE")` without Provider, accounting, or lifecycle writes. All new tests start from real persisted creation/reservations, not missing imports/tables or undefined methods.

- [x] Write RED cache tests using the existing valid candidate/package fixture, saved through an ordinary synchronous run. A remote run with a matching fresh package becomes Ready, closes its execution as cached, and leaves quota/budget/audit counts unchanged. Different owner may reuse the existing globally valid cache exactly as current policy permits; mismatched role/locale/config/package content, stale package, expired queue, pending reservations, or begun execution must reject.
- [x] Reuse `attachCachedPackage`'s stored package lookup, `assertCacheIdentity`, canonical equality, and integrity validation through a private shared validation helper. New remote attachment runs one batch: close pending execution with SQL clock queue-valid, no reservations for its quota key or run/request, no admitted/began marker; assert; update queued remote run Ready with existing package/quality, clear active fields, version+1, SQL-time package expiry check; assert. The last zero-row CAS rolls back the earlier close. No normalized package writes or general result-publication refactor is involved. Idempotent reread accepts only the same Ready package and cached closure.

- [x] Implement coordinator normal admission after a callable safe-stub RED. It reads/validates owned run+execution, returns existing terminal/admitted state, and checks existing reservations before proceeding. Pending with either reservation enters reconciliation. For a fresh pending execution: check fresh cache and use atomic remote cache method; otherwise require all three snapshotted gate flags; reserve quota with exact stored identity/key/policy and current UTC day; reserve budget with exact stored policy/deadline; reread existing reservations; perform markAdmitted. Denial or uncertain write acknowledgement closes/reconciles. Do not use `providerAttemptAllowed` or `replayed` alone as proof of remote permission; durable record predicates are authoritative.

```ts
const gate = Object.freeze(gateSchema.parse(readBoundedResearchJson(inputGate)));
const execution = await executions.read(identity.ownerId, identity.runId);
// Validate the complete supplied identity against execution before any accounting.
// Every creation/reservation command uses stored run/request/job/key/deadlines.
```

Cache may succeed even when new-call flags are off, provided identity/current owner access and cache integrity hold. No paid reservations happen in that branch. Gate denial uses pre-begin closure followed by reconciliation.

- [x] Implement `reconcileBeforeBegin` as a distinct operation. Read exact run/execution. If pending, close atomically first, then reread quota by immutable owner/key and budget by immutable owner/run/request; finalize only rows that exist (quota `failed`, zero accepted units; budget `releaseRemoteBeforeBegin({...storedIdentity,reservationId})`). Never call generic `settle(...,{kind:"not-charged"})` for remote closure. If admitted and queue-unexpired, verify existing reservations and return intact without creating anything; if expired, close then reread/release. Closed cached executions must have no reservations; any violation fails unavailable. Closed unsent executions resume each existing finalization independently and idempotently after interruption. A non-null began_at refuses unsent settlement; later executor unclaimed→closed proof is out of scope.

Partial finalization failure leaves closed lifecycle state intact and reports unavailable, so a later recovery resumes existing rows. A quota already accepted/rejected or a budget already settled/held where unsent closure expects fresh reservation is an accounting conflict, not permission to overwrite first terminal evidence. Do not invoke reserve/admit methods in this recovery method.

- [x] Use real-SQLite assertions plus spies to prove call order and forbidden calls, including no generic budget `settle` call during remote closure. Simulate loss of acknowledgement after quota INSERT, budget reserve batch, admitted UPDATE, closure batch, quota finalization, and `releaseRemoteBeforeBegin` batch. Ensure no second reservation, no changed deadlines, original terminal entries retained, and recovery completes known-unsent releases.

```ts
expect(quotaReserveSpy).not.toHaveBeenCalled();
expect(budgetReserveSpy).not.toHaveBeenCalled();
expect(storedExecution.admissionState).toBe("closed");
expect(await fixture.quota.readResearchReservation("owner-a", storedExecution.quotaKey))
  .toMatchObject({ finalStatus: "failed" });
```

- [x] Run `npm run test:unit -- tests/server/site-admission.test.ts tests/server/d1-site-execution-repository.test.ts tests/server/d1-research-repository.test.ts`. Expected: cache uses no paid resources, normal admission reaches queued/admitted, recovery never creates missing reservations, no routed service exists.

## Task 7: Exclude remote records from synchronous mutation and recovery

**Files:** orchestrator, d1-repository, existing orchestrator/recovery/repository tests.

- [x] Write RED tests calling ordinary orchestrator get/recover/start replay on persisted remote queued/admitted/closed/begun fixtures, including disabled current remote configuration. Spy on ordinary budget settlement/quota finalization and Provider; none may run. A missing execution row must not downgrade a remote run to synchronous.
- [x] Add mode checks before `execute` enters its try/catch and at the start of private `replay`, before expiry reclamation or reconcile. With no remote recovery delegate wired in this unit, return the existing public view for a coherent remote run through an explicit private remote observation path; fail unavailable for missing/corrupt execution. The observation uses Site execution repository validation and performs no remote maintenance from the old orchestrator. Do not make new remote routes available.

```ts
if (initial.executionMode === "cloudflare-workflow-v1") {
  // Validate persisted remote execution using an injected read-only reader.
  // Return existing public view, without sync expiry/reconcile/provider logic.
  return this.observeRemote(initial);
}
```

Add an optional private `readRemoteExecution` dependency to `ResearchOrchestratorDependencies`, required only when a remote row is observed. Existing factories remain unchanged and return unavailable on such observation if no reader exists; they must not silently return a sync result. Tests inject the real reader. This avoids wiring a functional remote runtime in Task10. In the generic catch, re-check stored mode before any fail transition; unknown mode is already rejected by parseRun.

- [x] Add positive `execution_mode='synchronous'` SQL predicates to ordinary transition, attachCachedPackage, saveNeedsReview, readyUpdate and all normalized readyStatements guard predicates. Reject remote input before constructing any ordinary normalized publication writes. Keep remote cache method explicit. Ordinary saveValidation cannot execute any package/blueprint writes for a remote run, even when the final update would return zero.
- [x] Run `npm run test:unit -- tests/server/research-orchestrator.test.ts tests/server/research-recovery.test.ts tests/server/d1-research-repository.test.ts tests/server/research-quality-orchestrator.test.ts tests/server/research-planning-integration.test.ts tests/server/research-policy-migration.test.ts tests/server/research-policy-migration-integration.test.ts tests/contracts/research-contracts.test.ts`. Expected: synchronous/historical/public/planning tests pass; remote observation never reaches synchronous paid or settlement paths.

## Task 8: Finish race matrix, local checks, and review handoff

**Files:** only tests/implementation already mapped. Do not add unrelated frontend changes or broad redesign.

- [x] Complete the following matrix with executable tests, using existing native SQLite adapter, controlled statement/run/batch wrappers, file reopen, and SQL-only clock control. Invoke a delayed statement after closure through its actual `run`/`batch`, not by mocking the repository to return a desired outcome. In a test wrapper, pause immediately before the matching quota INSERT's `run` or the budget reservation batch, run closure, then resume. This models the dangerous interleaving without holding a SQLite transaction open across an await.

| Case | Required assertion |
| --- | --- |
| Creation batch failure at each statement/assertion | No orphan run, alias, execution; no job attached to another winner. |
| Alias/direct/active/retry races | Same stored original identities/context; only valid Retry gets new identities; current-fingerprint conflict at repository. |
| Caller mutation during hash/read await | Canonical job and policy use initial bounded snapshot. |
| Wrong owner/run/request/job/hash/key and invalid identifiers | No foreign reads or reservations; no writes. |
| Close before delayed quota/budget actual INSERT | No late reserved rows or balance/version changes. |
| Delayed actual known-unsent budget release after held/settled injection | Actual status-reserved fence rejects; held/settled evidence and both bucket balances/versions remain unchanged; no generic settle fallback. |
| Known-unsent release identity/no-begin/replay and companion CAS loss | Exact closed immutable relationship required; same released row is idempotent; lost day/month decrement rolls back the whole release batch. |
| Reservation commit before close | Post-close reread discovers and releases; no missed reservation. |
| Both/one/neither reservation plus lost acknowledgements | Recovery never fills a missing counterpart; closes/releases existing rows idempotently. |
| markAdmitted versus close/terminal accounting/queue deadline | Only valid committed admission or closed lifecycle; no admitted invalid reservation, no reopen. |
| SQL clock crosses deadline after application precheck | Actual INSERT/CAS rejects; no runtime clock override in production SQL. |
| Creation before midnight, quota insert after midnight | New quota uses insertion day; stale-day delayed INSERT rejects. |
| Quota reserved before midnight, admit/begin observation after | Same reservation remains usable while queue-valid; no second quota. |
| Closure/cache final paired CAS zero | Entire batch rollback, including earlier execution update. |
| Reopen DB/new repositories and lost response acknowledgements | Original job/context/deadlines/markers persist; no in-memory authority. |
| Future began_at fixture | No Site unsent inference/release or grant reversion. |
| Missing execution, strict unknown mode, legacy quota/budget/sync APIs | No sync downgrade, bypass insertion, premature settlement, or ordinary package writes. |
| Cache hit and stale/cache mismatch | Ready+closed atomically, no paid rows/calls; stale/mismatched result cannot publish. |

- [x] Run all focused new and compatibility tests together:

```powershell
npm run test:unit -- tests/server/site-admission-fixture.test.ts tests/server/d1-site-execution-repository.test.ts tests/server/site-admission.test.ts tests/db/site-execution-migration.test.ts tests/server/d1-research-repository.test.ts tests/server/d1-research-budget-repository.test.ts tests/server/d1-entitlement-repository.test.ts tests/server/research-orchestrator.test.ts tests/server/research-recovery.test.ts tests/server/research-package-validator.test.ts tests/server/research-quality-orchestrator.test.ts tests/server/research-planning-integration.test.ts tests/server/research-policy-migration.test.ts tests/server/research-policy-migration-integration.test.ts tests/server/research-budget.test.ts tests/server/entitlements.test.ts tests/contracts/research-contracts.test.ts tests/db/schema.test.ts tests/db/migration-safety.test.ts tests/server/research-executor-nonce-store.test.ts
# Parent only; use this unique final-phase label, not a Task9/Task1 label.
node outputs/local-durable-executor-20260914/verify-type-scope.mjs task10-final-acceptance
node node_modules/typescript/bin/tsc --project outputs/local-durable-executor-20260914/tsconfig.acceptance.json --noEmit --incremental false
```

Expected: the scope verifier reports no missing/extra current inputs and identical compiler options; it excludes only historical `outputs` inputs from the current root config. The final label's evidence must not already exist (the verifier uses exclusive creation); after further changes use a new parent-owned label such as `task10-final-acceptance-r2`. Do not weaken either compiler configuration or manually omit current inputs. All selected tests and typecheck pass, or explicitly report pre-existing unrelated failures with baseline evidence. Do not rerun the unchanged eight-file baseline as separate work. Do not run the package `test` script: it builds the frontend and is unnecessary for this storage-only unit. Run focused ESLint on changed `.ts` files using `npm exec -- eslint <explicit changed TypeScript file paths>`; generate that explicit path list from the file map, excluding Markdown/SQL/JSON. No remote probes are needed.

- [x] Inspect changes for unchanged 0000..0007 migrations, Task9 files, fingerprints/public contracts, service factory remote-disabled behavior, settlement overrun support, and no routes/network/secret reads. Record tested files/commands and exact final hashes for specification and quality reviewers. Do not claim real Workflow acceptance, Provider execution, remote enablement, import correctness, or deployment from these tests.
- [x] Request the parent task's established specification review then quality review. Any fixes return to the same implementer with tests and new hashes; both PASS must apply to final files before the next implementation unit. Do not continue into begin/import automatically from a partial review.

## Plan clarification self-review

- Coverage: atomic creation/replay/Retry; explicit durable classification; independent legacy quota-key fence; original immutable job/context/deadlines; guarded normal quota and budget SQL; exact actual-SQL admitted validation; close-before-reread release; cache zero paid work; SQL rollback assertions; disabled-switch synchronous exclusion; insertion-day quota accounting; actual fee accounting preservation; reopen/lost-ack/race tests are mapped above.
- Type consistency: ordinary create excludes required private mode/key. Remote result permits null execution only for a synchronous existing winner. Coordinator receives a complete stored identity, not a request-supplied run/job selection. Its budget dependency is reserve/find/`releaseRemoteBeforeBegin`; generic settlement remains reusable by existing callers and later actual-fee import. The release command includes the complete immutable identity plus reservationId, and actual SQL/readback enforce the same relationship.
- Execution independence: Task1 writes exactly two mapped test-infrastructure files using only existing types/schema; its three real-SQLite tests, focused lint and parent-owned unchanged-options/current-input typecheck run before Tasks2/3. Creation, accounting, lifecycle/release and coordinator seams/fixture capabilities move to Tasks3, 4, 5 and 6 respectively. No whole-API stub phase or baseline rerun is required. Each subtask receives a fresh implementer and SPEC then QUALITY reviews.
- Acceptance commands: Task1 and final Task8 use separate exclusive evidence labels with the existing `verify-type-scope.mjs`, followed by the established acceptance project. The verifier proves every current root input remains included with identical compiler options and excludes only historical outputs; the parent runs these checks.
- Budget release promise: actual SQL rejects held/settled and requires exact closed/no-begin immutable identity, reservation owner/run/request/max/expiry and status reserved; exact already-released readback is idempotent. Existing bucket-release adjacency plus a final SQL assertion supplies whole-batch rollback. Delayed actual-SQL tests are an adversarial proof of the unconditional contract, not evidence that a lawful post-closure hold writer exists. No general accounting redesign is introduced.
- Implementation boundary: this unit can create/admit/close/cache/reconcile through direct private tests but cannot dispatch. Begin grant storage/CAS, executor proof after begin, result importer and normalized publication rollback, runtime factory/routes, and fair Cron scans remain separate approved units. No unresolved product choice is introduced.
- Known review attention: the shared quota SQL extraction must retain parent-linked corruption checks; the mode marker plus run quota key must survive missing execution data; two-row lifecycle transactions must assert SQL success; no helper may disturb the budget `changes()` chain; newly added triggers must agree with later begin monotonicity without granting begin here. These are review requirements, not claims already verified.
