# Arc v8 Executor Receipt Persistence and Cleanup Implementation Plan

> Required workflow: approved subagent-driven development, behavioral TDD, implementer self-review, SPEC then independent QUALITY/security. Begin after Task7 passes both reviews. This implements the already approved durable-executor design; no external resource or paid request is authorized by this plan.

**Goal:** Persist one normalized private receipt per claimed job, recover after either R2 or D1 acknowledgement is lost, and remove private content while preserving permanent outcome/fee identity and excluding delayed writers.

**Architecture:** R2 owns the initial complete immutable receipt. Executor D1 subsequently fixes a bounded summary and actual receipt hash. A fixed small R2 tombstone replaces the body during cleanup after D1 metadata is durable. Keeping this object identity prevents an already delayed create-only writer from restoring content after cleanup; deleting the object would reopen that race. This removes the private body, not the permanent deduplication evidence. Workflow, Site publication, callback transport and scheduled scanning remain subsequent integrations.

**Stack:** Existing strict receipt/grant/job codecs, D1 prepared SQL, direct private R2 binding and existing bounded stream reader. Real local SQLite and installed Miniflare R2 in tests. No dependency installation, real services, keys, Provider calls or Git writes.

## Task8: Recoverable private receipt and permanent accounting record

Files:

- Modify `app/server/research/executor/receipt.ts` only to add bounded metadata primitives by reusing existing schemas; preserve all existing receipt behavior.
- Modify `tests/server/research-executor-receipt.test.ts` to test those additions.
- Create `worker/research-executor/receipt-store.ts`.
- Create `worker/research-executor/migrations/0002_research_executor_results.sql`.
- Create `tests/server/research-executor-receipt-store.test.ts`.
- Evidence only under `outputs/local-durable-executor-20260914/task8-*`.

Do not change previous migrations, Site schema, job store, Provider policy, test helper, entrypoints or hosting configuration. Production constructors never execute DDL. Test databases apply only the three executor migrations. No Site tables or runtime secret lookup.

### Contract A: Strict bounded metadata without content

Add `BridgeReceiptMetadata`, `parseBridgeReceiptMetadata(input: unknown)` and `summarizeBridgeProviderReceipt(input: unknown): Promise<BridgeReceiptMetadata>` to the existing receipt module. Metadata shape:

```ts
type BridgeReceiptMetadata = Readonly<{
  grant: BridgeBeginGrant;
  receiptHash: string; // actual SHA-256 of the complete canonical receipt
  producedAt: number;
  latencyMs: number;
  outcome:
    | Readonly<{
        kind: "response";
        actualModel: string | null;
        usage: Readonly<ProviderUsage> | null;
      }>
    | BridgeProviderErrorOutcome;
}>;
```

The response metadata schema must be derived from the existing response schema with content/annotations omitted; reuse the existing error, model, usage, grant and time schemas. Do not fabricate placeholder content to pass full receipt validation and do not duplicate Provider rules. Hash is exactly64 lowercase ASCII hex. Metadata objects are strict, canonical JSON is at most4096 actual UTF-8 bytes, and parsing captures owned data before reading fields. Freeze the entire returned graph. All malformed metadata gives the existing safe `BridgeReceiptError("invalid-message")`.

The summarizer synchronously snapshots the whole valid receipt before its first await, computes the actual existing receipt hash, and derives every metadata field from that snapshot. It cannot accept a separate claimed hash, cost, outcome or grant. Real costs remain uncapped by the USD5 admission budget. The standalone metadata parser verifies the bounded format, not content it does not have; document this distinction. It must never report that a hash has been recomputed from a metadata-only record.

### Contract B: Executor result migration

`research_executor_results` has a nonnull TEXT `job_id` primary key of length36 referencing `research_executor_jobs(job_id)`; nonnull64-lower-hex TEXT `receipt_hash`; nonnull TEXT `metadata_json` containing a JSON object of1..4096 actual BLOB bytes; nonnull safe integer `fixed_at`; nullable safe integer `site_acknowledged_at`, `cleanup_requested_at`, and `body_removed_at`. All integer fields are0..MAX_SAFE_INTEGER with storage-type CHECKs. `body_removed_at` is null unless `cleanup_requested_at` is nonnull, and if present equals the original `cleanup_requested_at`. Add no TTL or delete/reset cascade. No content or annotations go into D1.

The metadata contains the complete original grant and thus actual request hash. Reads select only the known columns and treat each row as unknown. Reparse bounded metadata, check exact canonical encoding, job ID and receipt hash columns, all timestamp invariants, and complete metadata grant equality with the permanent job store record. A result belongs only to a job with original grant and `dispatchState === "claimed"`. Existing result metadata is immutable forever; later acknowledgement/cleanup changes only its own nullable markers. No wall-clock ordering between producedAt, fixedAt and Site times is assumed.

All result writes use conditional SQL with the exact job ID, original canonical job/hash/grant and claimed state, plus existing canonical result metadata/hash when changing a result marker. Initial result fixation is an INSERT SELECT from the matching claimed job with ON CONFLICT(job_id) DO NOTHING. Every run checks `success === true` and changes exactly0 or1. Readback validates identity and preserves first metadata/time. A same hash with different metadata is a conflict, not a replay.

### Contract C: Store API and errors

Export `BridgeReceiptStoreError` codes `invalid-message | conflict | not-found | unavailable` with constant message `Research bridge receipt store failure: ${code}` and no underlying cause, body, URL or SQL. Invalid caller input maps to invalid-message; different valid fixed identities to conflict; absent valid job or acknowledgement target to not-found; corrupt durable data, cryptographic failures and infrastructure failures to unavailable. Do not confuse an invalid stored object with invalid caller input.

`ExecutorReceiptStore` constructor receives `Pick<D1Database, "prepare">` and `Pick<R2Bucket, "get" | "put">`; internally reuse `D1BridgeJobStore`. Do not expose R2 delete or accept an arbitrary key/URL. Export this deeply readonly record:

```ts
type StoredExecutorReceipt = Readonly<{
  metadata: BridgeReceiptMetadata;
  fixedAt: number;
  siteAcknowledgedAt: number | null;
  cleanupRequestedAt: number | null;
  bodyRemovedAt: number | null;
  bodyState: "available" | "missing" | "removed";
  receipt: BridgeProviderReceipt | null;
}>;

class ExecutorReceiptStore {
  save(input: unknown, fixedAt: number): Promise<StoredExecutorReceipt>;
  recover(jobId: string, fixedAt: number): Promise<StoredExecutorReceipt | null>;
  acknowledge(jobId: string, receiptHash: string, observedAt: number): Promise<StoredExecutorReceipt>;
  cleanup(jobId: string, now: number): Promise<StoredExecutorReceipt | null>;
}
```

All public receipt snapshots and scalar validation happen before the first await. Scalar times are safe nonnegative integers; identifiers/hashes use existing validators or identical strict UUID/hash semantics. A closed/unclaimed job with a purported Provider receipt conflicts. Methods never grant dispatch, call begin, reset a job, infer unsent, assert quality, or publish a package. A result can be accepted after the Site execution deadline for accounting; no wall-clock expiry rejects a valid late receipt here.

Use a fixed key derived internally from the validated job: `research-receipts/v1/<jobId>/<requestHash>.json`. A private R2 object is either the existing canonical receipt, or this strict bounded tombstone:

```ts
{
  format: "arc-research-receipt-tombstone-v1";
  metadata: BridgeReceiptMetadata;
  removedAt: number; // original D1 cleanup_requested_at
}
```

Tombstones contain no content or annotations and are at most4096 actual UTF-8 bytes. Their full metadata must equal the immutable D1 metadata and removedAt the original cleanup intent. A tombstone without matching D1 result/cleanup intent is unavailable, never enough to create a new result or claim that accounting was fixed. Result/cleanup identities remain permanent. No new public serialization or body logging.

Each public storage operation has a fixed5000ms monotonic bound covering its binding calls and complete stream reads. Binding calls do not expose cancellation, so a timeout means uncertain outcome, not rollback. Race every awaited binding with the remaining deadline, check expiry before each later mutation and after awaited results, and cancel a body stream that arrives after timeout. Drain with `readBridgeBody`, intrinsic byte limit1048576 and remaining timeout; never call unbounded `.json()`, `.text()` or `.arrayBuffer()`, and never trust `size`, ETag, metadata or Content-Length as proof of body size/identity. A timer must not leave an async chain proceeding to new writes after its deadline. Clear timers/listeners when settled. Existing reader/body error details are translated to unavailable.

### Contract D: Save, recover, acknowledgement and cleanup

**save:** Snapshot and validate the receipt, load/match the stored claimed job and complete original grant, and summarize the receipt using actual SHA-256. Read the current D1 result first. If it exists, require the exact same metadata and return its current body state without uploading or recreating anything. This includes records whose body is missing or removed.

If no result exists, conditionally put the canonical owned receipt bytes with `{ onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json" } }`. No unconditional overwrite and no delete. A thrown/timeout write is unavailable; a later recover reads the same fixed key. Whether put returns an object or null, GET and fully verify what is actually persisted before fixing D1. Require the exact same complete canonical receipt and actual hash as the caller snapshot; another first valid receipt conflicts. An absent object after acknowledged put is unavailable. Fix the first D1 metadata/time only after successful full verification, then reread. If GET now finds a tombstone after the initial D1 lookup was empty, reread D1: another writer/cleaner may have fixed the original metadata and cleanup intent in the interim. Only an exact match with that durable record permits returning retained metadata/removed state; never recreate content or fix metadata from a tombstone alone. Never infer a successful original put from its ETag alone.

**recover:** Validate/load the permanent claimed job. If there is no D1 result, GET the unique fixed key; absent object returns null (unknown, not unsent). A complete valid receipt matching the original grant is hashed/summarized and conditionally fixes D1 using the supplied observation time. Corrupt/mismatched objects fail closed. A tombstone with no D1 metadata is unavailable. If D1 already exists, check the fixed object: a matching full receipt yields available plus the frozen receipt; absence yields missing plus metadata; a matching tombstone yields removed plus metadata and may complete the matching body_removed_at marker after a lost confirmation. A differently hashed receipt or mismatched tombstone is unavailable/conflict as appropriate and never overwrites D1. No Provider execution is involved in either path.

**acknowledge:** The caller uses this only after an actual authenticated Site acknowledgement for this exact hash, including a fully processed non-Ready outcome. Validate hash and require existing fixed metadata. Conditionally set site_acknowledged_at only if null; preserve the first time on replay and after cleanup. A different valid hash conflicts. A lost write acknowledgement is unavailable, and replay safely recovers the same marker. This method neither fabricates Site acknowledgement from status nor deletes content itself.

**cleanup:** First recover the same fixed receipt if needed, so content-only interrupted saves gain verified metadata before removal. No object/result returns null without changing dispatch. A result is eligible when site_acknowledged_at is present OR now is at least metadata.producedAt +86400000. An already durable cleanup_requested_at always permits resuming that cleanup, even if the local clock later rolls back. Clock rollback may delay a new cleanup intent; it does not reset identity or revoke an existing intent. If ineligible return the current record.

For an eligible result, CAS cleanup_requested_at once to the first supplied now, reread and preserve that value. This durable intent and metadata must exist before replacing content. Re-read and validate the fixed object. If it is a matching receipt, replace with the exact canonical tombstone using `onlyIf: { etagMatches: object.etag }`; if absent, create that tombstone with the same create-only condition. If already the exact tombstone, perform no write. After a conditional race, one bounded read may establish that another cleaner stored the same tombstone; otherwise fail unavailable for later maintenance rather than looping. Fully read/verify the tombstone, then conditionally fix body_removed_at to original cleanup_requested_at and reread. A lost tombstone/marker acknowledgement is recovered idempotently. Do not change result hash, usage, grant or dispatch state.

This protocol deliberately keeps a small tombstone at the same path forever. A delayed create-only receipt writer then cannot reintroduce private content after cleanup, including if it read D1 before result fixation or was paused inside its put. The delayed writer must not overwrite the tombstone or fabricate a second result. Removing the tombstone itself is outside this application contract.

## Implementation and verification sequence

- [x] Step1 — Create the actual additive migration and safe throwing store stubs, then record behavioral RED. Start with real-SQL/R2 save/read, full metadata derivation, first outcome conflict, content-only recovery, cleanup and delayed-writer assertions. Missing tables/modules/process-spawn errors are infrastructure failures, not RED.

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-executor-receipt-store.test.ts tests/server/research-executor-receipt.test.ts --reporter=json --outputFile=outputs/local-durable-executor-20260914/task8-red.json
```

- [x] Step2 — Implement metadata schemas/snapshot/hash additions, migration validation, strict D1 row parsing, fixed private R2 read/write and immutable first-result operations above. Keep the existing Task6 receipt codec semantically unchanged and use its actual cryptography.
- [x] Step3 — Implement bounded recovery, acknowledgement and permanent tombstone cleanup with the exact phase/race semantics above. No timers or background loops beyond each bounded operation; no callback or cron scheduler yet.
- [x] Step4 — Complete real local fault tests and record GREEN/lint/current type verification.

Required tests:

1. Existing receipt tests remain passing. New metadata tests reject extra/private/raw-error fields, invalid grant/model/usage/hash/time and byte overflow; derive uncapped cost and exact actual hash, preserve nested ownership, and snapshot before async mutation. No synthetic content used to validate metadata.
2. Real SQLite applies all three executor migrations only; no Site tables and no changed previous migration hashes. Direct SQL probes reject malformed metadata/type/time marker combinations. Corrupt row wrappers test impossible schema violations without replacing actual SQL state/concurrency.
3. Actual Miniflare R2 is private with cf:false, compatibility date supported by the installed runtime, no real resource binding or credentials. Normal tests use in-memory storage; the explicit complete disposal/reopen test uses file persistence as described below. Actual conditional writes preserve the first result; competing same/different receipts cannot replace it. Independent crypto verifies canonical hashes. Do not substitute an in-memory map for R2 conditional semantics.
4. Inject failure after actual R2 put, D1 result insert, acknowledgement write, cleanup intent write, tombstone put and body-removed write commit but before confirmation. A new store instance resumes the original receipt/metadata/timestamps, with zero Provider calls and no result replacement. At least one complete R2+SQLite persistence reopen uses explicitly scoped local fixture paths and disposes both runtimes/connections before reopening/cleanup; verify the persisted metadata and body/tombstone remain.
5. Stop after R2 write before D1 fixation; a separate recovery store fixes the original valid result without access to the original in-memory receipt. Stop after D1 fixation before return; recovery preserves it. Missing result remains unknown and accepts a later matching receipt; closed/unclaimed jobs cannot accept fabricated results. A claimed job after its Site deadline still accepts late accounting evidence.
6. Duplicate/parallel acknowledgement and cleanup preserve first markers and cost. Cleanup at24h boundary and before/after Site ack removes content only after verified metadata. Missing body with durable metadata still supports accounting and can gain the matching tombstone. Corrupt body/tombstone/hash/grant never yields fabricated success or overwrites trusted metadata.
7. Hold an actual R2 create-only put behind a controlled promise after save reads no D1 metadata; let another save fix the result and cleanup replace its body with a tombstone; release the delayed put. The final fixed key stays a tombstone, the metadata/fees stay identical, and no second Provider call occurs. Also race two cleaners and cleanup with a same-result save. Use wrappers that call the actual binding, not fake CAS results.
8. Stream reads enforce actual bytes even if size/byteLength metadata lies; malformed UTF8/JSON, padded overlimit JSON, slow/trickling body and get/put waits time out safely. Fake timers or injected suspended wrappers verify5000ms overall operation bound, timer cleanup and no later new D1/R2 mutations after timeout. Binding operations already in flight may still complete; replay must handle their ambiguous result. A late-arriving body is cancelled.
9. Results return owned/frozen metadata/receipt graphs; input mutation cannot change stored bytes. No stdout/log content, keys, raw exceptions or provided URLs. Errors remain safe and bounded. D1 summary/tombstone can be used for accounting but never claims to reproduce content or prove quality.

Normal real file fixtures are created under `outputs/local-durable-executor-20260914/task8-db-*`. **Narrow persistence exception, clarified2026-09-15:** the complete R2+SQLite disposal/reopen fixture may use `mkdtemp(join(os.tmpdir(), "arc-v8-task8-"))` because the installed Windows workerd fails disk R2 operations at the long workspace path, while the actual short-temp reopen probe passes. Only this test/probe may use that dedicated unique temp directory; never use shared .wrangler state or a preexisting directory. Both runtimes and SQLite connections must be closed/disposed before reopening the same files, and all runtime instances/connections must be disposed in finally. Before cleanup, verify resolved absolute fixture identity, its immediate parent equals the resolved temporary root, and its basename has the exact dedicated prefix. Enumerate and delete only descendants created by this fixture, checking containment for every target and rejecting links; remove empty directories deepest-first. No broad recursive deletion, computed cross-shell deletion, or deletion of the temp root. Evidence/reports remain under the Task8 outputs prefix, without private content. Root's final check must confirm no matching Task8 fixture directories remain in either location. Save actual limitations: this paired observation supports a local path limitation, not production R2/D1 or browser/Workflow proof.

The pre-clarification plan is preserved verbatim as `task8-plan-before-persistence-exception.md` with original SHA-256 `acc888bb0aaf47461b118c7c72a8fe704e2c22d3750a0c13817c0084636aa962`. The actual short-temp probe is `task8-persistence-probe.json` (1 selected test passed). An extended-path runner attempt ended before execution because automatic approval review exceeded its deadline; it is not evidence of a workerd hang or an unsafe-action rejection. This clarification changes only the local fixture path; it does not reduce persistence/reopen acceptance or authorize actual resources/keys/Provider/Git operations.

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-executor-receipt-store.test.ts tests/server/research-executor-receipt.test.ts tests/server/research-executor-job-store.test.ts tests/server/research-executor-begin.test.ts tests/server/research-executor-job.test.ts --reporter=json --outputFile=outputs/local-durable-executor-20260914/task8-green.json
node node_modules/eslint/bin/eslint.js app/server/research/executor/receipt.ts worker/research-executor/receipt-store.ts tests/server/research-executor-receipt.test.ts tests/server/research-executor-receipt-store.test.ts --format json --output-file outputs/local-durable-executor-20260914/task8-lint.json
```

Root regenerates exact current nonhistorical type inputs with a fresh label and runs the existing scoped acceptance tsconfig with --noEmit --incremental false, preserving compiler options. Record actual command exit/timing, final source hashes, original RED and final JSON reports. Tests are never replaced by a stale pre-edit report; check no fixture paths remain.

- [x] Step5 — Implementer self-review, fresh SPEC then independent QUALITY/security. Trace first-result authority, body-only recovery, safe late accounting, every cleanup phase and delayed create-only race. Verify all source/evidence hashes and actual type/test/lint outcomes. Complete only after both reviews pass. No unrelated full build or real request until a later integrated candidate requires it.

## Planning evidence and limitations

The direct binding API supports conditional put with null on failed conditions. The locally executed `r2-create-only-probe.json` confirms one winner among20 writes, unchanged original body, and recreation after delete. This is why simple object deletion plus a prior D1 lookup is insufficient for cleanup. API references: [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/), [direct binding consistency](https://developers.cloudflare.com/r2/reference/consistency/). The probe's initial spawn EPERM was infrastructure only; narrow local retry succeeded and disposed its simulator.

This plan does not implement the later signed result/metadata endpoints, Site import pipeline, publication deadline checks, three fair Cron cursors, Workflow runtime or actual deployment. The next maintenance integration must keep accounting retries after body removal, schedule only bounded work, and never restart the paid step. Cleanup markers are not unsent proof and a metadata-only record never supplies a course body.
