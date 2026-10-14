# Arc v8 Site Result Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. A fresh implementer owns each subtask; SPEC precedes a different independent QUALITY/security reviewer.

**Goal:** Finish backend-executor Task12: locally validate one immutable remote receipt, publish its result at most once, and durably resume audit/quota/budget accounting after interruption.

**Architecture:** The website remains the quality and publication authority. A private import journal fixes the original receipt metadata and locally normalized decision; a separate D1 publication transaction binds that journal to the exact begun execution and actual SQL deadline. One internal coordinator resumes the same stages for future callback and owner recovery adapters without calling Provider, reserving again, or using the old synchronous execute catch.

**Tech Stack:** Existing TypeScript/Zod, D1 prepared statements and atomic batches, native SQLite D1 fixture, Vitest, existing candidate/source/package validators, audit sink, quota and budget repositories. No new dependency.

---

2026-09-16. This is a concrete continuation of the approved 2026-09-14 durable-executor design and recorded `authorization.json`; it does not require another generic implementation approval. Task11 is complete, 13/13, with 999 passing tests and final independent SPEC/QUALITY. This plan is initially a draft for independent plan review; do not start implementation before that review is READY.

## Scope and stable rules

- Reuse the current authoritative worktree and dirty authorized changes. Do not recreate worktrees, redo Tasks1–11, reset/stash/clean, or run Git mutations for this local unit.
- No actual credentials, Provider/Repair calls, production D1/R2, resource creation, Sites candidate/deployment, or paid attempt. Later deployment is already approved, but actual account/resource setup and a new paid test remain separately scoped.
- Keep Kimi low/32768, Provider1200000ms, execution lease1260000ms and launcher1320000ms. No policy, privacy, prompt, schema-quality relaxation or new admission gate changes.
- No routes, HTTP authentication, remote dispatch, factory enablement, Cron scanner, Worker/Workflow entrypoint, or frontend change here. Later adapters will both call the same private coordinator after authenticating and resolving trusted owner identity.
- Existing synchronous `transition`, `saveValidation`, `readyUpdate`, and their CAS authority remain synchronous-only. Shared code may describe or validate package data; it must not generalize their authorization to remote mode.
- New-admission flags are absent from completion. Turning off new work cannot prevent receipt import or cost reconciliation for already-begun work.
- Existing provider receipt codecs, current strict Site execution reader, audit final-record equality, quota parent/terminal validation and budget safe sums remain authoritative.

## File responsibilities and exact scope

New production files:

| File | Responsibility |
| --- | --- |
| `app/server/research/research-content.ts` | Exact existing outer JSON-fence extraction, shared by ordinary production and local remote validation. |
| `app/server/research/d1-publication.ts` | Existing strict package/quality/candidate serialization and normalized insert templates; no run authorization or transitions. |
| `app/server/research/site-import-repository.ts` | Private import decision, journal, resolution and repository interfaces. |
| `app/server/research/site-import-validation.ts` | Pure receipt-to-local-decision, frozen audit, settlement and bounded durable decision parsing. |
| `app/server/research/d1-site-import-repository.ts` | Strict owner-bound journal reads, first receipt CAS, audit/accounting stage proof CAS and completion cleanup. |
| `app/server/research/d1-site-import-publication.ts` | Atomic remote run/package/journal resolution with actual SQL-time guards. |
| `app/server/research/site-import.ts` | One bounded completion/resume coordinator over existing effects and journal stages. |
| `drizzle/0010_research_site_imports.sql` | New import journal, lifecycle checks and immutable-field triggers; no backfill of results or changes to old tables. |

Narrow existing modifications: `app/server/research/d1-repository.ts` and `orchestrator.ts` only shared data/fence extraction; `db/schema.ts`, `drizzle/meta/_journal.json`, `tests/helpers/sqlite-d1.ts`, `tests/db/migration-safety.test.ts` for migration0010. No old migration changes. Existing `site-execution-sql.ts` and quota SQL helpers can be imported without broadening their begin/admission semantics.

New tests: `tests/server/site-import-validation.test.ts`, `tests/db/site-import-migration.test.ts`, `tests/server/d1-site-import-repository.test.ts`, `tests/server/d1-site-import-publication.test.ts`, `tests/server/site-import.test.ts`, `tests/server/site-import-integration.test.ts`; shared fixture `tests/helpers/site-import-fixture.ts` composes the current real `createSiteAdmissionFixture`, audit sink and new import repositories. Existing synchronous repository/orchestrator tests receive only meaningful compatibility assertions needed for extracted shared code. Final planner integration uses existing activation/learning repository APIs directly, without changing their production implementation.

Root records the exact per-subtask scope before dispatch. A newly discovered necessary path requires a documented reason and refreshed scope, not silent broadening. Evidence lives in `outputs/local-durable-executor-20260914/` under unique `task12-*` labels. Reuse exact prior source snapshots; do not copy historical output trees.

## Private contracts and stage semantics

Define these types in `site-import-repository.ts`; import the existing domain types rather than creating parallel public DTOs:

```ts
export type SiteImportPhase = 0 | 1 | 2 | 3 | 4 | 5;
// 0 received, 1 audit-recorded, 2 run-resolved,
// 3 quota-resolved, 4 budget-resolved, 5 complete.

export type SiteImportDecision =
  | Readonly<{ kind: "ready"; package: ResearchPackage; quality: ResearchQualityReport }>
  | Readonly<{ kind: "needs-review"; quality: ResearchQualityReport; candidate: ResearchCandidate | null }>
  | Readonly<{ kind: "failed"; quality: ResearchQualityReport | null;
      errorCode: string; failureCategory: ResearchPublicFailureCategory; retryable: boolean }>;

export type SiteImportResolution = Readonly<{
  state: "ready" | "needs-review" | "failed";
  runVersion: number;
  packageId: string | null;
  terminalHash: string;
  quotaStatus: "accepted" | "rejected" | "failed";
  resolvedAt: number;
}>;

export type SiteImportRecord = SiteExecutionIdentity & Readonly<{
  mode: "body" | "metadata-only";
  configFingerprint: string;
  validationContext: ResearchValidationContext;
  executionVersion: number;
  metadata: BridgeReceiptMetadata;
  audit: ResearchAiRunRecord;
  settlement: BudgetSettlement;
  decisionHash: string;
  decision: SiteImportDecision | null;
  phase: SiteImportPhase;
  version: number;
  resolution: SiteImportResolution | null;
  createdAt: number;
  updatedAt: number;
}>;

export type SiteImportResult = Readonly<{
  run: ResearchRunRecord;
  receiptHash: string;
  accounting: "settled" | "released" | "held";
}>;

export interface SiteImportRepository {
  read(identity: SiteExecutionIdentity): Promise<SiteImportRecord | null>;
  captureBody(identity: SiteExecutionIdentity, receipt: unknown): Promise<SiteImportRecord>;
  captureMetadata(identity: SiteExecutionIdentity, metadata: unknown): Promise<SiteImportRecord>;
  markAudit(identity: SiteExecutionIdentity, receiptHash: string): Promise<SiteImportRecord>;
  markQuota(identity: SiteExecutionIdentity, receiptHash: string): Promise<SiteImportRecord>;
  markBudget(identity: SiteExecutionIdentity, receiptHash: string): Promise<SiteImportRecord>;
  finish(identity: SiteExecutionIdentity, receiptHash: string): Promise<SiteImportRecord>;
}

export interface SiteImportPublication {
  resolve(identity: SiteExecutionIdentity, receiptHash: string): Promise<SiteImportRecord>;
}
```

`SiteImportCoordinator.complete(identity: SiteExecutionIdentity, receipt: unknown)` and `.reconcileMetadata(identity: SiteExecutionIdentity, metadata: unknown)` both return `Promise<SiteImportResult>`. These are internal methods; they do not accept an owner from a browser body or a remote Ready decision. Do not expose caller expected versions, dates, charged totals, phase flags or a force-publish boolean.

Identity parsing uses the current five-field bounds, descriptor-safe snapshot and strict object schema. Snapshot identity and receipt/metadata synchronously before the first await, using the existing bridge codec for the large receipt. Do not pass a receipt content string through `readBoundedResearchJson`'s8192-per-string envelope limit. Parse large normalized package/candidate members separately from the small decision envelope so adding an envelope does not reduce their existing depth limit.

Each owned run/execution/journal observation is coherent or unavailable. Use the Task11 pattern: one initial complete observation and at most one fresh complete read-only retry for typed `RESEARCH_UNAVAILABLE`; no retry on missing owner, identity mismatch or unsafe command. A mixed pre/post-stage snapshot is not corruption proof. Persistent contradictory records fail closed after that bounded reread. An invocation performs at most one mutation attempt for each reached phase; a retry observes the same original journal, never reserves or dispatches again.

### Frozen body decision and audit

The stored Site execution must be admitted, unclosed and begun, with an exact original grant and full valid remote identity. Require canonical grant equality through `matchBridgeProviderReceipt`; job ID or request hash alone is insufficient. Fixed validation context comes from that execution, including original package ID and dates. Do not use `orchestrator.validationContext()` or current deployment versions.

`prepareSiteImport(execution, receipt)` returns `{ decision, audit, settlement }` and is pure. Snapshot the small execution structure safely before accessing its fields; parse its frozen context and check exact original grant. The repository independently validates its durable representations; remote response content is never itself a package or a Ready assertion. New pure helper signatures are:

```ts
export type PreparedSiteImport = Readonly<{
  decision: SiteImportDecision;
  audit: ResearchAiRunRecord;
  settlement: BudgetSettlement;
}>;
export function prepareSiteImport(execution: SiteExecutionRecord, receipt: unknown): PreparedSiteImport;
export function parseSiteImportDecision(input: unknown, context: ResearchValidationContext): SiteImportDecision;
export function serializeSiteImportDecision(input: unknown, context: ResearchValidationContext): string;
export function hashSiteImportDecision(input: unknown, context: ResearchValidationContext): Promise<string>;
```

The listed signatures describe the exported functions implemented in subtask1, not overload declarations left without a body. Serialization validates first and emits canonical JSON within the journal decision bound; hashing digests those exact UTF8 bytes. The decision parser checks frozen package ID/versions/dates, quality date, exact ready quality/package equality, failure-code/category/retryable combinations and safe nullable candidate according to the rules below. It never interprets a remote Ready flag.

```ts
const validation = validateResearchCandidate(
  candidateFromContent(extractResearchJson(receipt.outcome.content)),
  receipt.outcome.annotations,
  execution.validationContext,
);
const requestId = deterministicId("research-attempt", [
  execution.ownerId, execution.runId, execution.requestId, "role-research",
]);
```

For response receipts, existing candidate/source/reference/quality rules decide the result. Ready requires strict package integrity, exact frozen context/versions and quality equality. Enforce the existing **1,900,000 UTF8-byte package**,16384-byte quality and1048576-byte candidate limits. A ready package above its byte limit becomes failed `result-too-large`/`invalid-result`, retryable false, with no stored package. Quality failure with a valid safe candidate becomes needs-review; a safe candidate above its persistence limit becomes needs-review with candidate null. Missing/unsafe/incomplete candidate becomes failed `invalid-result`, retryable true, retaining only safe failed quality. Never persist raw content, annotations, transport JSON, prompt or arbitrary diagnostics in the journal.

Response audit: provider `openrouter`, purpose `role-research`, original context prompt/input/output versions, exact safe integer receipt latency, returned validated actualModel (nullable and bounded; do not invent a new routing-model allowlist), usage unchanged, charged true. Status accepted only for local ready, otherwise rejected with `invalid-result`. This audit describes the fixed local validation outcome, not whether deadline publication subsequently won. It remains immutable even if a late ready-quality result is denied publication.

Error receipt: failed decision using the existing provider category mapping (timeout→timeout; rate→rate-limited; balance→allowance-reached; filtered→content-rejected; invalid-transport→invalid-result; missing-key/unavailable→service-unavailable) and original retryable bit. Audit failed with its original permitted provider error code, usage/model/charged unchanged. Reject the inconsistent combination charged false with a nonzero reported cost before any journal/audit write, matching the current audit contract.

```ts
const settlement: BudgetSettlement = outcome.kind === "error" && outcome.charged === false
  ? { kind: "not-charged" }
  : outcome.usage === null
    ? { kind: "unknown" }
    : { kind: "actual", actualMicros: outcome.usage.costMicros };
```

Unknown charged with trustworthy usage still yields actual cost. Zero actual usage settles0; it is not evidence of an unsent request. Do not cap trustworthy actual fees at the original USD5 reserve. Do not reject billing evidence because producedAt differs from the website clock or latency exceeds the policy; exact original grant and safe bounded receipt are the trust boundary.

### Metadata-only path

Metadata is supplied only by a future authenticated bridge adapter. The metadata codec validates syntax and identity, not the response body hash. An existing journal with the same receipt hash **and canonical metadata** resumes its original mode, decision and audit; it never reruns validation or replaces the first outcome.

A new metadata-only response journal is allowed only for a begun run already failed or at/after its actual SQL execution deadline. An active unexpired run returns unavailable without writes: missing body is not permission to fail early. Its decision is failed `interrupted`/`timeout`, retryable true for a newly expired run; an already-failed run retains its exact original terminal state. Its audit is failed `unavailable`, charged true, with original metadata usage/model/latency/versions. It can reconcile fees but can never publish. If full content later arrives with the same hash and metadata, the first metadata-only decision stays authoritative. A different receipt hash or altered metadata conflicts.

For error metadata, reconstruct the content-free original error receipt and recompute its hash before using the body/error path. Error metadata contains all original error fields; a mismatching declared hash conflicts. For response metadata, no fabricated body or invented hash verification.

### Journal storage and invariants

Migration0010 creates `research_site_imports`. Columns:

```sql
run_id TEXT PRIMARY KEY REFERENCES research_site_executions(run_id),
user_id TEXT NOT NULL REFERENCES users(id),
request_id TEXT NOT NULL,
job_id TEXT NOT NULL UNIQUE,
request_hash TEXT NOT NULL,
config_fingerprint TEXT NOT NULL,
validation_context_json TEXT NOT NULL,
execution_version INTEGER NOT NULL,
mode TEXT NOT NULL,
receipt_hash TEXT NOT NULL,
receipt_metadata_json TEXT NOT NULL,
audit_json TEXT NOT NULL,
settlement_json TEXT NOT NULL,
decision_hash TEXT NOT NULL,
decision_json TEXT,
phase INTEGER NOT NULL DEFAULT 0,
version INTEGER NOT NULL DEFAULT 0,
resolution_json TEXT,
created_at INTEGER NOT NULL,
updated_at INTEGER NOT NULL,
UNIQUE(user_id,request_id)
```

Use SQLite CHECKs for safe integer types/ranges, mode enum, phase0..5, lowercase64-hex hashes, bounded nonempty identity, canonical JSON-object shape/byte caps where expressible, timestamps `created_at<=updated_at`. Context≤4096, metadata≤4096, audit≤4096, settlement≤256, resolution≤4096, decision≤1,950,000 UTF8 bytes. These retain the existing domain caps while total selected row stays below the fixture's2,000,000-byte D1 row bound. Migration SQL must use `length(CAST(value AS BLOB))`, not character length, for byte bounds. No result backfill and no fabricated journal for existing tasks.

New rows must be phase0/version0 with nonnull decision and null resolution. Triggers freeze all identity, mode, context, grant/receipt metadata, audit, settlement and decision hash fields. Updates must advance exactly one phase and one safe version; timestamp cannot decrease. Resolution is null before phase2 and set exactly once at1→2, then immutable. Decision bytes are immutable until4→5 may clear them to null; phase5 requires null and prohibits restoration. Journal identity survives temporary normalized-decision cleanup. No deletion API or automated retention job is added.

Use SHA-256 over canonical decision JSON for `decisionHash`; recompute it when reading a nonnull snapshot. Read each domain payload with its existing strict schema/byte limits and exact frozen context. A phase5 read verifies the original metadata/audit/settlement and terminal resolution without revalidating a missing decision under future rules. No journal JSON appears in public DTOs.

The first INSERT SELECT checks the actual owned run/execution/grant identity and immutable serialized context/config, execution version, admitted/unclosed/begun lifecycle and SQL time not before begin. For a new body row, current run must be researching/validating or already failed; ready/needs-review require an existing matching journal. For new metadata response, additionally require failed or SQL expiry. Initial receipt identity cannot be fixed for a pending, cached, unbegun, synchronous or foreign run. On uniqueness conflict or uncertain INSERT acknowledgement, read the exact existing row. Accept only all five identity fields, original grant, hash and canonical metadata; never overwrite any first fields.

### Durable effects and stage proofs

| Phase transition | Effect and durable proof |
| --- | --- |
| 0→1 | Existing audit sink records the exact frozen audit once. Strict read equals all saved fields. Marker CAS also binds the stored ai_runs columns and exact canonical usage envelope; no caller boolean can advance it. |
| 1→2 | Separate publication repository resolves the run and journal atomically. Publication/terminal snapshot proof described below. |
| 2→3 | Existing entitlement finalize uses original reservation and terminal quota status. Re-read validates parent/full ledger, exact reservation ID/status/units. Marker SQL binds the exact terminal ledger to the journal's owner/key/reservation and status. |
| 3→4 | Existing budget settle uses the original reservation/buckets and immutable settlement. Strict reads verify owner/run/request/reservation/bucket relation and status/amount; marker SQL rechecks those original identities/status/amount and safe bucket facts. |
| 4→5 | Revalidate original terminal resolution and all prior durable effects; one CAS clears only the large decision JSON. Small receipt/audit/decision hash, resolution and accounting evidence remain. |

Stage CAS uses exact owner/run/job/request/hash, receipt hash, observed journal version/phase and execution version/context. Each stage is idempotent: an already-advanced exact row is returned read-only after proof checks. A missing effect, contradictory proof or exhausted version is unavailable/conflict, never permission to skip. If an effect wrote successfully but its acknowledgement or stage CAS failed, the next invocation proves that effect and advances only the same marker. Stage code does not rewrite original audit, re-finalize with a different quota verdict, or replace a settled fee.

Quota status is accepted1 for Ready, rejected0 for needs-review, failed0 for failed. A pre-existing terminal quota must agree with the terminal resolution; otherwise fail closed without rewriting it. Late fees for an already-failed run use its existing failed quota outcome. Partial prior expiry reconciliation may leave quota reserved, which can then be finalized failed exactly once.

Budget actual means settled/exact actualMicros; not-charged means released0; unknown means conservative-hold with original maximum still reserved. A pre-existing conservative hold may be settled/released by the first trustworthy late receipt. The same immutable unknown receipt cannot later be rewritten into a different fee receipt; unknown completion returns accounting held and does not claim fees are known. A matching already-terminal fee record is replayed without another bucket delta. A conflicting terminal fee is unavailable/conflict and never overwritten.

## Atomic publication and expired/terminal recovery

Only `D1SiteImportPublication.resolve(identity,receiptHash)` can resolve a remote run in this unit. No remote flag on ordinary `saveValidation`. The publication reader first checks phase>=2 exact terminal resolution and returns it **before** applying freshness/deadline rejection. Repeated completed import must survive the original execution deadline and package cache expiry; use strict package audit-mode validation and exact saved terminal identity, not public `resolveReadyPackage()` which intentionally requires freshness.

For phase1, read original decision and a fresh strict owned context. If the run is already failed, atomically set only the journal resolution, preserving every terminal run field and its state version. Ready/needs-review without a matching committed resolution is unavailable. Active researching/validating can resolve only by an exact current run-version CAS. No intermediate `validating` mutation is needed: private remote publication resolves from researching/validating in one transaction.

An unexpired body decision ready/needs-review uses actual SQL-time live guard on every normalized INSERT and final run UPDATE:

```sql
r.id = :run AND r.user_id = :owner AND r.request_id = :request
AND r.execution_mode = 'cloudflare-workflow-v1'
AND r.remote_quota_key = e.quota_key
AND r.state IN ('researching','validating') AND r.active_slot = 1
AND r.state_version = :runVersion AND r.state_version < 9007199254740991
AND r.active_expires_at = e.execution_expires_at
AND e.job_id = :job AND e.request_hash = :requestHash
AND e.version = :executionVersion AND e.admission_state = 'admitted'
AND e.closed_at IS NULL AND e.close_reason IS NULL AND e.began_at IS NOT NULL
AND e.execution_expires_at = e.began_at + 1260000
AND e.validation_context_json = :frozenContext
AND e.job_json = :originalJob
AND SQL_NOW >= e.began_at AND SQL_NOW < e.execution_expires_at
AND j.phase = 1 AND j.version = :journalVersion
AND j.receipt_hash = :receiptHash AND j.decision_hash = :decisionHash
```

Here `SQL_NOW` is the already-defined `siteSqlNow` literal; the actual code uses positional binds and existing trusted SQL builders. Also bind journal identity/config/execution relation, original reservation IDs, full valid live quota ledger and `siteReservedBudgetSql` for new successful publication. These prevent success after accounting has already been terminally released or after an unrelated reservation wins. No application-clock override. A malformed/corrupt dependency never becomes an automatic timeout verdict.

Ready additionally requires strict matching package/frozen context and `package.expiresAt` strictly after SQL time. Use the same existing eight normalized inserts (blueprint, version, skills, edges, shared resources, links, package, source audits), with json_each and existing ≤100 binds/≤100000 SQL-byte limits. Keep `INSERT OR IGNORE` only for the existing canonical shared-resource semantics; do not apply it to packages or identity rows.

Existing fingerprint/config package rows must parse fully and match role/locale/config plus canonical package/quality and all stored metadata. The frozen package ID is part of content identity. Hash-only equality or a different ID is a conflict, never permission to attach another package or invent a replacement ID. Rebind the exact existing package JSON/quality/metadata in the final SQL guard so a pre-read cannot authorize a later substituted row.

Construct the mutation batch in this order:

```ts
const assertOne = () => db.prepare(
  "SELECT CASE WHEN changes()=1 THEN 1 ELSE json('') END AS import_assertion",
);
await db.batch([
  ...normalizedInserts, // zero for exact-existing, needs-review, or failed
  terminalRunUpdate,
  assertOne(),
  resolutionJournalUpdate,
  assertOne(),
]);
```

The journal update binds the exact terminal row just written, phase1/current version, all identity/context and stored decision hash, then writes phase2/version+1 and the fixed resolution. Read one safe SQL observation timestamp before constructing the transaction, require it at least the run's current updatedAt, and use that bound timestamp for the intended terminal run updatedAt and resolution resolvedAt. This lets JS calculate the exact terminalHash before the batch. SQL eligibility still evaluates the actual `siteSqlNow` inside every statement and also requires actual time at least that bound timestamp; the bound timestamp never authorizes an expired write. Hash the canonical full intended `ResearchRunRecord`; SQL proves the corresponding actual scalar/quality/candidate/package values, not a caller-supplied hash alone. For an already-terminal failed row hash its original fields unchanged. Do not put any statement between an UPDATE and its `changes()` assertion. JS inspection after a committed batch cannot substitute for in-transaction rollback.

If SQL clock crosses the deadline after pre-read or between inserts and the final run CAS, that batch must fail and roll back **all** normalized rows and markers. Recover by rereading the original journal/terminal facts, never by retrying the mutation in the same call. If still phase1/active, return unavailable so a later invocation can resolve the expired result. This is confirmation recovery, not a second Provider attempt.

When an active execution is already expired at the publication observation, choose a separate failed-resolution batch guarded by SQL_NOW>=original deadline. It sets `interrupted`/`timeout`, retryable true, package/quality/candidate null, clears the active slot and does not insert package rows. A local failed decision before expiry can publish its safe failure fields under the live identity/version/deadline guard without requiring a Ready package. Already-failed late imports only bind the unchanged existing terminal row. Never revive a failed run, renew a lease, or classify an infrastructure write failure as a provider failure.

Exact terminal replay validates canonical terminalHash, state/version/package and frozen reference/quality identity. Journal resolution never changes afterwards. Publication preserves the original execution row/begin/deadline and reservation IDs. A unique conflict or uncertain commit may recover an already-completed matching resolution; an exact package alone without the matching terminal run+marker is not completion.

## Subtask 1: Shared strict data helpers and pure local receipt validation

**Files:** new `research-content.ts`, `d1-publication.ts`, `site-import-repository.ts`, `site-import-validation.ts`, `tests/server/site-import-validation.test.ts`; narrow existing `d1-repository.ts`, `orchestrator.ts`, existing synchronous repository/orchestrator tests if required.

- [x] Add the new pure callable seam with safe unavailable behavior and executable behavioral RED. Use real fixture candidate/annotations and frozen context, not a fabricated remote Ready package. Assert exact frozen package ID/dates/versions and audit latency/usage. Example test body (use an explicit synthetic begun execution built from existing fixture data and strict schema):

```ts
const prepared = prepareSiteImport(execution, parseBridgeProviderReceipt({
  grant: originalGrant,
  producedAt: originalGrant.beganAt + 500,
  latencyMs: 487,
  outcome: { kind: "response", content: JSON.stringify(validResearchCandidate),
    annotations: validAnnotations, actualModel: "moonshotai/kimi-k3",
    usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300,
      costMicros: 12345, webSearchRequests: 0 } },
}));
expect(prepared.decision.kind).toBe("ready");
if (prepared.decision.kind !== "ready") throw new Error("expected ready fixture");
expect(prepared.decision.package.id).toBe(execution.validationContext.packageId);
expect(prepared.decision.package.observedAt).toBe(execution.validationContext.observedAt);
expect(prepared.audit).toMatchObject({ latencyMs: 487, charged: true, status: "accepted" });
expect(prepared.settlement).toEqual({ kind: "actual", actualMicros: 12345 });
```

- [x] Move the existing fence function verbatim and use it from the synchronous path and new validator. Move existing strict package/quality/candidate serialization/integrity/parser helpers into `d1-publication.ts` without changing semantics, bounds or ordinary CAS. Shared normalized-insert extraction can wait until subtask4; do not move unrelated run/cache/retry logic.

```ts
export function extractResearchJson(content: string): string {
  const value = content.trim();
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```$/u.exec(value);
  return fence ? fence[1] : value;
}
```

- [x] Implement the pure decision/audit/settlement classification above and strict durable decision parse/serialize/hash functions. Export `prepareSiteImport`, `parseSiteImportDecision`, `serializeSiteImportDecision` and `hashSiteImportDecision`; each accepts only the named existing/private types or unknown for parsing, no callbacks that can declare Ready. Add frozen context mismatch, fenced/unfenced, invalid schema, unsafe source, failed quality, safe oversized candidate, UTF8 package overflow, all error categories/charged combinations, null/zero/large known cost, unknown usage, caller accessors/mutation, stable cross-midnight context and no rawbody persistence cases. Use lower-level strict decision classification fixtures for persistence caps not reachable within the smaller Provider content limit; do not enlarge the existing transport limit just to reach them.
- [x] Run new validation tests plus existing package-validator/source-audit/repository/orchestrator compatibility, changed-TS lint and Root current-input nonincremental typecheck. Record actual first RED and final command/results, then fresh SPEC and independent QUALITY. No journal/migration or completion claim in this subtask.

```powershell
npm run test:unit -- tests/server/site-import-validation.test.ts tests/server/research-package-validator.test.ts tests/server/research-source-audit.test.ts tests/server/d1-research-repository.test.ts tests/server/research-orchestrator.test.ts
```

## Subtask 2: Journal schema, strict reader and first receipt capture

**Files:** migration0010, schema/journal metadata, helper migration inventory/safety test, new import repository and fixture, new migration/repository tests, private contracts only as strictly needed.

- [x] Write a real migration RED for `research_site_imports` and a capture behavior RED through a callable fail-closed repository seam. Keep existing Task11 migration0008→0009 tests intact. The new migration test applies0000..0009 first, seeds ordinary/remote/terminal rows and accounting, then applies0010 and proves all pre-existing data untouched and new table empty.

```ts
expect(db.database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='research_site_imports'").get())
  .toBeDefined();
const first = await f.imports.captureBody(f.identity, f.receipt);
expect(first).toMatchObject({ phase: 0, version: 0, mode: "body" });
expect(first.metadata.receiptHash).toBe(await hashBridgeProviderReceipt(f.receipt));
expect(await f.imports.captureBody(f.identity, f.receipt)).toEqual(first);
expect(f.db.database.prepare("SELECT COUNT(*) AS n FROM research_site_imports").get()).toEqual({ n: 1 });
```

- [x] Implement the exact schema/checks/triggers listed above, append only journal entry10, and update only current migration inventory. Add native illegal insert/update tests for immutable identity/receipt/context, phase jump/regress/same-phase mutation, unsafe integer/version overflow, null-resolution lifecycle, decision replacement/early clearing/restoration, UTF8 bounds and invalid JSON. Root records migration bytes; do not run db:generate.
- [x] Implement owner-bound strict reads and first capture. The only local decision construction in captureBody is `prepareSiteImport` over a strictly parsed immutable original receipt. Snapshot receipt before the first await, read coherent owned context, check existing row before recomputing local validation, hash and persist one INSERT SELECT under exact current SQL identity. Existing-journal replay compares original receipt metadata/hash and returns saved decision without changing it. Metadata-only behavior follows the defined deadline/body rules. Use SQL time for journal timestamps; do not refresh receipt producedAt or latency.

```ts
const ownedIdentity = parseSiteImportIdentity(identity);
const ownedReceipt = parseBridgeProviderReceipt(receipt);
// Both snapshots above happen before any await.
const context = await readImportContext(ownedIdentity);
const matched = matchBridgeProviderReceipt(ownedReceipt, context.grant);
const metadata = await summarizeBridgeProviderReceipt(matched);
const receiptHash = metadata.receiptHash;
```

`parseSiteImportIdentity(input:unknown):SiteExecutionIdentity` and private `readImportContext(identity:SiteExecutionIdentity)` are implemented in this subtask with the strict identity/coherent-read rules above; the latter returns owned run, execution, original grant and nullable journal. Use existing `summarizeBridgeProviderReceipt` from receipt.ts. Hash helpers return lowercase SHA-25664; grant fields are the persisted protocol/job/hash/began/deadline.

- [x] Exercise native concurrency/lost acknowledgement before and after INSERT, same receipt through new repository instances/reopened file DB, differing hash or metadata, foreign/missing/synchronous/cached/pending/unbegun identities, accessor inputs, mutation during await, exact SQL-expiry boundary for metadata, invalid stored snapshot/digest/metadata and transient versus persistent mixed reads. Require0 audit/package/quota/budget/Provider effects at phase0. Run migration/repository/validation plus existing migration-safety/schema/site-execution regressions, explicit lint, Root types, SPEC then QUALITY.

```powershell
npm run test:unit -- tests/db/site-import-migration.test.ts tests/db/migration-safety.test.ts tests/db/schema.test.ts tests/server/d1-site-import-repository.test.ts tests/server/site-import-validation.test.ts tests/server/d1-site-execution-repository.test.ts
```

## Subtask 3: Audit and accounting proof markers

**Files:** `d1-site-import-repository.ts`, new repository tests and fixture. No publication/coordinator routing yet.

- [x] Add behavioral REDs proving stage markers cannot advance without their actual durable effects. Record the frozen audit using the real sink and then show0→1 succeeds; write a conflicting audit under the same attempt identity and require no marker mutation. For later-stage tests create terminal resolution fixtures through direct synthetic SQL only in the test harness and label them as stage tests, not publication acceptance.

```ts
await expect(f.imports.markAudit(f.identity, captured.metadata.receiptHash)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
await f.audits.record(captured.audit);
expect(await f.imports.markAudit(f.identity, captured.metadata.receiptHash))
  .toMatchObject({ phase: 1, version: 1, audit: captured.audit });
expect(await f.imports.markAudit(f.identity, captured.metadata.receiptHash))
  .toMatchObject({ phase: 1, version: 1 });
```

- [x] Implement stage-specific strict pre-read proofs plus one SQL CAS with exact durable-effect predicates. Do not offer a generic public `advancePhase(phase,proof:true)`. Audit compares the exact current ai_runs record and its canonical stored usage envelope including modelKnown. Quota uses the existing full ledger CTE/parent checks. Budget reads original reservation and both strict buckets; marker checks matching immutable settlement/status/amount and safe bucket state. Each CAS binds the saved journal phase/version/hash and exact context. An uncertain write rereads the journal and effects; return only a proven advanced same record, otherwise unavailable without another marker mutation attempt.

```ts
const result = await db.prepare(`UPDATE research_site_imports AS j
  SET phase=1,version=version+1,updated_at=${siteSqlNow}
  WHERE j.run_id=?1 AND j.user_id=?2 AND j.receipt_hash=?3
    AND j.phase=0 AND j.version=?4 AND j.version<9007199254740991
    AND EXISTS(SELECT 1 FROM ai_runs a WHERE a.user_id=j.user_id
      AND a.request_id=?5 AND a.purpose='role-research'
      AND a.provider=?6 AND a.model=?7 AND a.prompt_version=?8
      AND a.input_schema_version=?9 AND a.output_schema_version=?10
      AND a.status=?11 AND a.usage_json=?12 AND a.latency_ms=?13
      AND a.error_code IS ?14)`).bind(
  record.runId, record.ownerId, record.metadata.receiptHash, record.version,
  record.audit.requestId, record.audit.provider, record.audit.model ?? "unknown",
  record.audit.promptVersion, record.audit.inputSchemaVersion, record.audit.outputSchemaVersion,
  record.audit.status, canonicalJson({ usage: record.audit.usage,
    charged: record.audit.charged, modelKnown: record.audit.model !== null }),
  record.audit.latencyMs, record.audit.errorCode,
).run();
```

Add the common exact job/request/hash/execution/context clauses described above to the stage SQL builder; they are not replaced by only the short example's owner/run/hash. Build marker predicates from trusted literals and positional offsets, never untrusted SQL text. `finish` requires phase4 and all proofs, sets phase5 and decision_json=NULL in one CAS. Strict phase>=target replay still proves effects.

- [x] Test every effect-write/marker-write boundary before and after commit, concurrent same marker, altered audit latency/usage/version/model, wrong quota parent/reservation/status/units, released/conflicting cost, hold→actual, overflow/corrupt buckets, effect ahead of marker, and no early cleanup. Verify all counts and original accounting buckets. Run repository/validation/audit/quota/budget regressions, lint, Root types, SPEC then QUALITY.

```powershell
npm run test:unit -- tests/server/d1-site-import-repository.test.ts tests/server/site-import-validation.test.ts tests/server/d1-research-run-recorder.test.ts tests/server/d1-entitlement-repository.test.ts tests/server/d1-research-budget-repository.test.ts
```

## Subtask 4: Atomic remote publication and terminal resolution

**Files:** new `d1-site-import-publication.ts`, shared `d1-publication.ts` normalized insert extraction, narrow `d1-repository.ts` call-site replacement; new publication tests and fixture. Existing synchronous authorization is protected.

- [x] Add a callable resolve seam returning unavailable and a native success RED after real capture+audit+markAudit. Assert ready run, phase2 journal, exactly one normalized package and unchanged quota/budget before accounting. Add separate real failed-quality/invalid/error cases.

```ts
const captured = await f.imports.captureBody(f.identity, f.receipt);
await f.audits.record(captured.audit);
await f.imports.markAudit(f.identity, captured.metadata.receiptHash);
const resolved = await f.publication.resolve(f.identity, captured.metadata.receiptHash);
expect(resolved).toMatchObject({ phase: 2, resolution: { state: "ready", quotaStatus: "accepted" } });
const savedRun = await f.research.getRun(f.identity.ownerId, f.identity.runId);
expect(savedRun).toMatchObject({ state: "ready", packageId: f.execution.validationContext.packageId, activeExpiresAt: null });
expect(f.db.database.prepare("SELECT COUNT(*) AS n FROM research_packages").get()).toEqual({ n: 1 });
```

- [x] Extract the existing eight insert templates without changing their payload/IDs/shared-resource semantics. Define an internal typed statement builder accepting a validated package, role/locale/config, timestamp and trusted gate builder; its return excludes terminal run UPDATE. Ordinary repository supplies its unchanged synchronous guard and app timestamp, then its unchanged readyUpdate. Remote repository supplies the exact SQL-time/journal/execution/quota/budget guard. The gate accepts only code-built fragments with positional binds, never request text.
- [x] Implement the atomic publication/failed-resolution/replay algorithms specified above. Bind complete existing package identity; exact package collision differs from exact committed replay. Each UPDATE assertion executes immediately in the transaction. Failed-preservation path updates only journal with an exact existing terminal-row predicate. Actual timeout path and live decision failure path have distinct SQL time predicates. Recover only by a bounded coherent reread, with no second batch in the same resolve call.
- [x] Run native fault tests at every batch statement, actual final run CAS zero via a real SQLite trigger, journal CAS zero, clock crossing between initial read and batch and between inserts/finalCAS, already-failed race, same receipt concurrency, exact-existing package, corrupt/foreign/fingerprint collision, SQL quota/budget invalidation after pre-read, version exhaustion, metadata-only denied publication and terminal replay after deadline/cache expiry. Require rollback of every normalized table on any lost CAS,0 extra accounting effects, exact begin/lease unchanged. Stress64skills/2016edges within bind/SQL/row limits. Run publication/repository/validation/synchronous regressions, lint, Root types, SPEC then QUALITY.

```powershell
npm run test:unit -- tests/server/d1-site-import-publication.test.ts tests/server/d1-site-import-repository.test.ts tests/server/site-import-validation.test.ts tests/server/d1-research-repository.test.ts tests/server/research-orchestrator.test.ts
```

## Subtask 5: Bounded completion coordinator and recovery

**Files:** new `site-import.ts`, new coordinator tests, fixture. Dependencies are only imports/publication/research/audits/entitlements/budget; no Provider, Repair, reserve, clock-renewal or gates in the dependency interface.

- [x] Add full-chain behavioral RED through the actual fixture and a fail-closed callable coordinator seam. Both body and metadata entrypoints feed the same internal `resume(record)` method. The receipt and identity are snapshotted before awaiting repository capture; no effect is invoked from the constructor.

```ts
const result = await f.coordinator.complete(f.identity, f.receipt);
expect(result).toMatchObject({ run: { state: "ready" }, accounting: "settled" });
expect(await f.imports.read(f.identity)).toMatchObject({ phase: 5, decision: null });
const replay = await f.coordinator.complete(f.identity, f.receipt);
expect(replay).toEqual(result);
expect(f.counts()).toMatchObject({ packages: 1, audits: 1, quotaTerminal: 1 });
```

- [x] Implement forward-only stages. Use strict actual effect reads to distinguish confirmation loss from noncommit. Effects are idempotent but a mismatch is never swallowed. Bound work to at most one attempt per reached stage in a single call; no unbounded loop or network retries.

```ts
if (record.phase === 0) {
  // record() may commit then throw: exact read is authoritative in either case.
  await recordAuditOrRecoverExact(record);
  record = await imports.markAudit(identity, hash);
}
if (record.phase === 1) record = await publication.resolve(identity, hash);
if (record.phase === 2) {
  await finalizeQuotaOrRecoverExact(record);
  record = await imports.markQuota(identity, hash);
}
if (record.phase === 3) {
  await settleBudgetOrRecoverExact(record);
  record = await imports.markBudget(identity, hash);
}
if (record.phase === 4) record = await imports.finish(identity, hash);
return readCompletedResult(record);
```

Implement the named private helpers here. Each uses existing strict readers and canonical equality against frozen journal facts. Read quota before finalize; preserve an already matching terminal status and refuse a differing one. Read budget before settle; preserve matching settled/released outcomes and require exact actual cost. Unknown cannot downgrade an already-terminal cost; define a matching original terminal cost as unavailable if it contradicts the immutable settlement. An uncertain effect call is followed by one exact read, not a second effect call. `readCompletedResult` requires phase5, exact terminal resolution and all accounting proofs, then returns a private result with accounting held/settled/released. No generic catch mutates active run, final quota or fee state.

- [x] Test two concurrent entrypoints simulating callback and owner GET, repeated body vs metadata samehash, foreign owner/hash mismatch, every effect/marker loss before/after commit, new objects/file reopen, midnight crossing with original dates/buckets/latency/usage, decision cleanup replay, disabled-admission configuration absent from dependencies, and late known cost after a previous timeout/conservative hold. Metadata response before deadline remains unavailable/no mutation; after expiry settles cost without a package. Require matching error metadata hash and reject altered metadata. Run coordinator/import/audit/quota/budget regressions, lint, Root types, SPEC then QUALITY.

```powershell
npm run test:unit -- tests/server/site-import.test.ts tests/server/d1-site-import-publication.test.ts tests/server/d1-site-import-repository.test.ts tests/server/site-import-validation.test.ts tests/server/d1-research-run-recorder.test.ts tests/server/d1-entitlement-repository.test.ts tests/server/d1-research-budget-repository.test.ts
```

## Subtask 6: Final native integration and acceptance

**Files:** new `tests/server/site-import-integration.test.ts`, test-only additions to the mapped suite and strictly necessary fixes within this plan; Root evidence/docs. No route or deploy wiring.

- [x] Add the actual validator→D1normalizedpackage→existing activation/planner→newreader chain. Use synthetic provider receipts, real native repositories and strict existing source resolver. Prove ownerA can activate the imported original package and read its persisted plan through fresh instances; ownerB cannot import/read/activate it. Repeated completion and activation remain idempotent and original versions/dates/fingerprints stay fixed. Do not mock the quality validator, D1 publication, entitlement ledger or planner in this acceptance chain.
- [x] Complete and identify exact passing full test names for every row:

| Matrix | Required durable assertion |
| --- | --- |
| Valid receipt | One package, original frozen identity, one audit, one terminal quota, one cost delta. |
| Missing/unsafe/schema/quality-invalid content | Local classification, no Ready authority from remote, no rawbody persisted, Repair0. |
| Same/different receipt or owner | Same replays; different hash/metadata/owner cannot mutate. |
| Input mutation/accessors and stored corruption | Safe bounded snapshots and strict failure, no partial writes. |
| Audit/every marker loss | Exact same audit/phase recovery without duplicates or false completion. |
| Every publication batch failure/runCAS0/journalCAS0 | All normalized rows and both terminal facts roll back. |
| SQL deadline crosses after pre-read or midbatch | No late publication, no orphan package; subsequent same import can record timeout/fees. |
| Already-failed or quota terminal race | Terminal run/quota cannot revive or change verdict. |
| Existing/colliding/substituted package | Full canonical identity at actual SQL, no hash-only attachment. |
| Quota/budget changes after pre-read | Actual publication/proof CAS fails closed; original accounting preserved. |
| Quota/budget effect or acknowledgement loss | Original reservation IDs/day/month buckets, exactly one ledger/bucket effect. |
| Known late cost /0 /unknown /conflicting final cost | Exact settlement/release/hold semantics, no USD5 clipping or terminal overwrite. |
| Body removed; metadata-only | Bounded fees only, no new package; same fixed receipt can finish an existing body journal. |
| Concurrent callback/owner-style invocations | Same original result; effect can be ahead of marker without double accounting. |
| Mixed observations and persistent contradiction | One bounded whole-read retry, no relaxation or mutation retry. |
| Midnight, reopen, expired completed replay | Original dates/latency/usage/hash and terminal identity; cleanup never permits another job. |
| Activation/planner/newreader/two owners | Usable durable plan and owner isolation through actual modules. |
| Ordinary sync/cache/begin/accounting compatibility | Existing guards, public DTO and frozen policy preserved. |
| UTF8 row/parameter/SQL limits | Existing package1.9m/candidate1MiB limits, journal<2m total row,64skills/2016edges. |

- [x] Run the following focused final tests and save that explicit list. Do not wildcard the whole test tree or run full frontend build. New dependencies/failures can justify further named tests, unchanged prior suites need not be repeatedly rerun.

```powershell
npm run test:unit -- tests/server/site-import-integration.test.ts tests/server/site-import.test.ts tests/server/d1-site-import-publication.test.ts tests/server/d1-site-import-repository.test.ts tests/server/site-import-validation.test.ts tests/db/site-import-migration.test.ts tests/db/migration-safety.test.ts tests/db/schema.test.ts tests/server/research-package-validator.test.ts tests/server/research-source-audit.test.ts tests/server/d1-research-repository.test.ts tests/server/research-orchestrator.test.ts tests/server/d1-site-begin-repository.test.ts tests/server/d1-site-execution-repository.test.ts tests/server/site-admission.test.ts tests/server/d1-research-run-recorder.test.ts tests/server/d1-entitlement-repository.test.ts tests/server/d1-research-budget-repository.test.ts tests/server/research-planning-integration.test.ts tests/server/d1-planning-repository.test.ts tests/server/planning-service.test.ts
```
- [x] Run ESLint on the explicit actual changed TS files, then Root's unchanged-options full-current-input nonincremental typecheck under `task12-final-acceptance`. Exclude only historical outputs. Preserve RED/infrastructure failures accurately and actual passing report identities; do not claim a Vite spawn permission failure as behavioral RED.

```powershell
node outputs/local-durable-executor-20260914/verify-type-scope.mjs task12-final-acceptance
node node_modules/typescript/bin/tsc --project outputs/local-durable-executor-20260914/tsconfig.acceptance.json --noEmit --incremental false
```

- [x] Root checks final bytes, protected policy/provider/Task5/Task9/public/factory/oldmigration files, actual matrix assertions and source/test/type identities. Fresh final SPEC then different independent QUALITY must both PASS. Only Root checks completion boxes and updates checkpoint/progress. Preserve precise completed source snapshot references without duplicating historical trees. Task12 local completion does not claim deployed Research or finish the overall public-release goal.

## Root plan self-review

Coverage maps approved website completion and fault requirements to local validation/subtask1, immutable journal/subtask2, exact stage proofs/subtask3, database-time publication/subtask4, concurrent lost-ack and metadata accounting/subtask5, actual planner chain/finalmatrix/subtask6. Transport/auth, Cron/Workflow, real environment and paid tests remain subsequent integration units.

Receipt identity, first usage/latency/hash and frozen validation dates never regenerate. Decision data is normalized and bounded; complete cleanup preserves the durable dedup/fee facts. Cross-host producedAt is not mistaken for SQL publication permission. Actual SQL time, final runCAS and journalCAS share transaction authority; previously committed terminal replay is validated before expiry denial. Independent failures cannot trigger the old generic execute catch. Synchronous behavior stays guarded and covered.

Source self-review corrected the usage example to the actual promptTokens/completionTokens/totalTokens/costMicros/webSearchRequests contract and uses the existing summarizeBridgeProviderReceipt export. A bound SQL observation timestamp defines the terminal snapshot bytes while actual SQL time independently guards eligibility; there is no impossible precomputed hash of a future clock value. Actual test bodies use real APIs and fields; no invented platform identifiers or bypassed safety helpers.
