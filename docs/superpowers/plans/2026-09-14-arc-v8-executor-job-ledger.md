# Arc v8 Executor Job and Dispatch Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development, TDD and sequential SPEC then independent QUALITY. Implement only after Task6 is complete and independently reviewed. The overall design and local implementation are already approved.

**Goal:** Give each accepted executor job a permanent identity, original begin grant and atomic single-use dispatch or closed-unsent state in the executor's own D1.

**Architecture:** This unit is the persistent execution-ownership foundation. Workflow calls, Provider execution, Site state, R2 receipts, result metadata, maintenance cursors and public status remain later units. The database owns dispatch exclusivity; neither a Workflow instance identifier nor a read of an existing claimed state authorizes fetch.

**Tech Stack:** Existing D1 interface and real local SQLite test adapter, existing job/grant codecs and actual SHA-256, additive SQL migration. No dependency or network.

---

## Task7: Immutable executor identity and exclusive dispatch

**Files:**
- Create `worker/research-executor/d1-job-store.ts`.
- Create `worker/research-executor/migrations/0001_research_executor_jobs.sql`.
- Create `tests/server/research-executor-job-store.test.ts`.
- Evidence under `outputs/local-durable-executor-20260914/task7-*`.

Do not modify the Site schema, previous migrations, existing test helper, Provider or policies. Tests instantiate `SqliteD1` and explicitly execute the two executor migrations, without initializing Site tables. Production code never runs DDL.

- [x] **Step1: Capture behavioral RED.**

First create the real additive migration specified in Step2, keeping store methods as safe throwing stubs. Then write real-database tests for accept/get, exact replay, conflicting job, record begin, exclusive dispatch and close-before-dispatch. Execute against both real executor migrations, not a mocked SQL state machine. Safe stubs must fail successful-behavior assertions; missing modules, missing table and process launch errors are not behavioral RED. Step2 documents and verifies the schema established for this test setup; it does not defer table creation until after RED.

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-executor-job-store.test.ts --reporter=json --outputFile=outputs/local-durable-executor-20260914/task7-red.json
```

- [x] **Step2: Implement the additive executor migration.**

Table `research_executor_jobs` has:

| Column | Contract |
| --- | --- |
| `job_id` | TEXT primary key, nonnull, length36; application validates UUID |
| `request_hash` | nonnull TEXT, exactly64 lowercase ASCII hex |
| `job_json` | nonnull TEXT, valid JSON object, actual UTF-8/BLOB length1..4096; canonical complete job |
| `accepted_at` | nonnull integer0..MAX_SAFE_INTEGER, original executor-local acceptance time |
| `workflow_accepted_at` | nullable integer0..MAX_SAFE_INTEGER; first actual matching Workflow acceptance observation |
| `grant_json` | nullable TEXT; when present, valid JSON object, UTF-8/BLOB length1..4096; original canonical grant |
| `dispatch_state` | nonnull TEXT enum `unclaimed`, `claimed`, `closed`, initially `unclaimed` |
| `dispatch_at` | nullable safe integer; null iff state is `unclaimed`; first claim or close observation in executor clock |

SQL CHECKs enforce storage type as well as numeric/string bounds, state/timestamp consistency and nonnull grant for `claimed`. Use `length(CAST(... AS BLOB))` for byte limits. Hex checks combine exact length and absence of any character outside `[0-9a-f]`. JSON checks use `json_valid` and `json_type(...)= 'object'`. A `closed` row may have no grant or an original grant; both prevent any future claim. There is no expiration-driven delete, reset or transition back to `unclaimed`.

Do not compare executor timestamps to Site creation/begin/expiry times, or require monotonically increasing wall clock values after NTP adjustment. Later scheduling uses its own persistent DB clock/cursors. Site begin and the monotonic pre-fetch budget check remain timing authorities.

- [x] **Step3: Implement the strict store API and atomic operations.**

Export safe `BridgeJobStoreError` with codes `invalid-message | conflict | not-found | unavailable` and constant message `Research bridge job store failure: ${code}`. Never include input, SQL, underlying errors or content in failures.

Export deeply readonly `BridgeStoredJob`:

```ts
{
  job: BridgeJob;
  requestHash: string;
  acceptedAt: number;
  workflowAcceptedAt: number | null;
  grant: BridgeBeginGrant | null;
  dispatchState: "unclaimed" | "claimed" | "closed";
  dispatchAt: number | null;
}
```

`D1BridgeJobStore` accepts only `Pick<D1Database, "prepare">`. APIs:

```ts
accept(input: unknown, acceptedAt: number): Promise<BridgeStoredJob>
get(jobId: string): Promise<BridgeStoredJob | null>
recordWorkflowAccepted(input: unknown, workflowId: string, observedAt: number): Promise<BridgeStoredJob>
recordBegin(input: unknown, grant: BridgeBeginGrant): Promise<BridgeStoredJob>
claimDispatch(input: unknown, grant: BridgeBeginGrant, claimedAt: number): Promise<boolean>
closeUnclaimed(input: unknown, closedAt: number): Promise<BridgeStoredJob>
```

All input job/grant snapshots and scalar validation happen synchronously before the first await. Use `parseBridgeJob`, canonical JSON and actual `hashBridgeJob` on the owned snapshot. IDs and times validate before DB calls. No permissive object projection or credential lookup. Invalid inputs become `invalid-message`; crypto/database/invalid stored rows become `unavailable`; a valid different immutable identity or grant becomes `conflict`; a missing valid job is `not-found` except `get` returns null.

Every stored row is treated as unknown data: validate exact selected column shapes, parse bounded canonical job/grant JSON, recompute actual job hash, require selected `job_id` matches job ID and require all canonical strings match their parsed canonical encodings. Validate all row invariants again, even if the migration normally enforces them. An inconsistent/corrupt row must fail closed rather than become a new task. Freeze the returned record with the already frozen nested job/grant. Do not project unknown columns from a SELECT into trusted records; select the exact known columns.

A grant belongs to a job only when jobId and actual requestHash match and `job.createdAt <= grant.beganAt < job.queueExpiresAt`. Reuse `parseBridgeBeginGrant` for schema and exact lease duration; do not duplicate that schema or fabricate a refreshed begin reply. Later authenticated clients validate the signed begin response and monotonic budget before calling this store; the store is not a signature verifier or Provider scheduler.

Mutation statements include the exact immutable `job_id`, `request_hash` and `job_json` in their WHERE clauses. Grant-dependent mutations also include the exact persisted `grant_json`. On every run result require `success === true` and `meta.changes` exactly0 or1. Unexpected results/errors throw `unavailable`, never yield an optimistic claim.

**accept:** INSERT complete canonical job/hash/time with `ON CONFLICT(job_id) DO NOTHING`, then read. Exact same canonical job and hash returns existing state without changing acceptance time, Workflow evidence, grant or dispatch marker. Different valid job with the same ID conflicts. Always compare both bytes and hash; never accept hash alone. If read after insert yields missing/corrupt data, unavailable. A lost insert confirmation may be retried for the same identity only.

**get:** Validate UUID input, select and validate the record. A valid absent ID returns null. This is not proof of an unsent request and never creates data.

**recordWorkflowAccepted:** Require `workflowId === parsedJob.jobId`; the caller supplies it only after actual create/get acknowledgment for this same Workflow. Read and match job, then conditionally set `workflow_accepted_at` only if null. Read back; preserve the first value on replay, including after closed/claimed state. This evidence can be written after Workflow code already ran: dispatch does NOT require this field. No method invokes or restarts a Workflow.

**recordBegin:** Read and match job; validate provided grant against it. Same stored grant returns the row idempotently even when already claimed/closed; a different stored grant conflicts. If grant is absent, CAS set only while `dispatch_state='unclaimed' AND grant_json IS NULL`, then reread. If a close won before the grant write, conflict; do not attach a new grant to a closed job. Do not replace beganAt/deadline from local now or refresh grant on retries.

**claimDispatch:** Read and match job and the already persisted original grant, never implicitly record it. Execute a single conditional UPDATE from unclaimed to claimed with its first claimedAt. Return true only for the actual `changes=1` response from this invocation; return false for zero changes after a matched existing claimed/closed row. Missing/different grant conflicts. Do not use readback of claimed to turn an uncertain write into a winning true. A write that commits then throws is unavailable; subsequent same-job attempts are false. Only a true returned claim permits the later caller to proceed to the remaining-budget check/fetch.

**closeUnclaimed:** Read and match job, atomically unclaimed→closed with first closedAt, then read back. Repeated closed state preserves its first timestamp; a competing claimed state is returned unchanged. The caller may issue an unsent proof only if the returned durable state is closed. An unknown/null row, transient error or claimed state is never unsent. Close and claim race on the same state column; one permanently excludes the other.

Do not add generalized state setters, TTL deletion or a reset/retry method. Claimed-without-result is deliberately not a terminal Provider failure: the next receipt ledger unit must still accept a late matching outcome and record fees. Existing state alone never authorizes a second dispatch.

- [x] **Step4: Complete real SQL, crash and ownership coverage; run GREEN.**

Use real WebCrypto and independent Node crypto checks for the stored hash. Use safe synthetic jobs; no user data. Cover:

1. Exact replay preserves acceptance time and full state. Changes to each job identity field with the same job ID conflict; a distinct valid ID can be accepted independently. Mutate original input immediately after an async method call and prove only the original snapshot is persisted.
2. Standalone get missing, safe malformed inputs, row and nested frozen ownership, malformed JSON/canonical/hash/grant relationships fail unavailable with no caller text. Use wrapper D1 results for impossible corrupted-row/result metadata cases, not for concurrency/state behavior.
3. Workflow acceptance idempotence and first-time preservation. Wrong workflow ID conflicts. Record begin and claim before Workflow acknowledgment, then record acceptance; this required race remains valid.
4. Record begin immutable replay, mismatched hash/job/deadline, begin outside original Site queue window and missing job. A valid new original grant after closure must not reopen the job. A delayed same-grant replay after claim remains idempotent.
5. At least20 concurrent operations using two stores over real DB return exactly one true claim. Same job after file database close/reopen and a new store is still claimed. Additionally use two real SQLite connections to one temporary file (WAL/busy timeout as needed) to exercise shared persistence; describe the local synchronous limitation honestly, not as distributed D1 proof.
6. Concurrent close/claim yields exactly one permitted result: if claim true, final state claimed and no unsent proof; if final closed, all claims false. Closing before grant, after grant and after claim has the stated behavior. Clock rollback/late local clock values never reset state.
7. Failure after actual INSERT/Workflow evidence/grant/claim/close SQL commits but before acknowledgment. Replays of identity/evidence/grant/closure are safe; a lost claim response never authorizes a later true claim. Use an actual executing D1 wrapper that throws after the selected run completes. For dispatch demonstrate a synthetic counter increments only on true; lost-claim flow remains0 and never becomes2.
8. SQLite direct constraint probes for field types, bounds, state/grant/timestamp consistency; prior nonce migration and Site migration hashes unchanged. Invalid writes cannot leave partly transitioned rows. No Site tables, runtime DDL, new direct Provider import, Provider execution or network side effects. Reusing the existing job codec is required and may retain its existing transitive import of Provider request normalization.

Tests use `// @vitest-environment node`, actual file fixtures under the existing evidence directory and `finally` close both connections. Verify resolved fixture paths are inside the intended directory before deleting only the created files; no broad recursive cleanup. A root report must verify no temporary fixture directories remain.

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-executor-job-store.test.ts tests/server/research-executor-job.test.ts tests/server/research-executor-begin.test.ts tests/server/research-executor-receipt.test.ts --reporter=json --outputFile=outputs/local-durable-executor-20260914/task7-green.json
node node_modules/eslint/bin/eslint.js worker/research-executor/d1-job-store.ts tests/server/research-executor-job-store.test.ts --format json --output-file outputs/local-durable-executor-20260914/task7-lint.json
```

Root regenerates exact current type inputs with a fresh label and runs nonincremental noEmit. Validate only intended three files changed, retain original RED and actual final test/lint JSON, commands/exits and final source hashes. Do not re-run unrelated builds or old paid tests.

- [x] **Step5: Self-review, SPEC then independent QUALITY/security.**

Trace every true claim back to this invocation's successful atomic UPDATE and every unsent indication back to durable closed state. Review all input snapshot/DB-error/CAS races, immutable job+grant identity and absence of clock-based replay. Confirm result/fees/cleanup can be appended later without clearing dispatch identity. Mark done only after actual type/lint/GREEN evidence and both reviews pass. No real D1/R2/Workflow/Sites/Git/Provider operations in this unit.

## Root planning review and later integration

This plan uses only the executor's persistent identity/dispatch portion of the approved design. Separate receipt storage/first-result metadata, private object recovery/cleanup, Workflow lifecycle, three fair Cron scans, Site admission/import and browser recovery still require their own integration and failure tests. A boolean claim is intentionally nonrecoverable authority after an ambiguous acknowledgment; the application favors avoiding duplicate paid dispatch over automatic retry. The job record has no owner or Site secret and no public serialization API.

Before implementation, check completed Task6 exposes the exact standalone grant parser and retains Task5 signatures. The schema has no frozen future result fields, so the next additive migration can store verified receipt metadata without mixing private content into this small dispatch record. Durable maintenance cursors must later advance fairly across eligible jobs; no scan implementation is claimed here.
