# Arc v8 Task13 Independent Executor Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan sequentially, one fresh implementer per subtask, TDD, then fresh SPEC review and a different independent QUALITY/security review. Root supplies the complete bounded subtask and owns acceptance. Root adopted the r2 contract corrections and r3 local-before-remote expiry correction. Independent plan review must be READY at these exact bytes before source implementation. Accepted subtask implementation is tracked below; whole Task13 remains incomplete until final integration acceptance.

**Goal:** Implement the existing top-level Task13: independent Worker/Workflow, both authenticated bridge adapters, and autonomous bounded recovery without repeating Provider execution.

**Architecture:** Reuse the accepted job, begin, nonce, receipt stores and Site admission/import repositories. Add narrow HTTP adapters, runtime orchestration and separate recovery journals; preserve the immutable execution identity and the Task12 import journal. Only the independent Workflow can call `OpenRouterResearchProvider.research`; Cron performs short maintenance and the Site remains the authority for ownership, publication and accounting.

**Tech Stack:** Existing TypeScript, Zod, WebCrypto, D1/native SQLite, private R2, Wrangler 4.92.0, workers-types 4.20260702.1, Miniflare 4.20260515.0, Vitest and installed esbuild. No dependency installation/update.

---

## Authorization, workspace and task boundary

Work only in `C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta` (`W`). Evidence directory `E` is `outputs/local-durable-executor-20260914`. User authorization in `E/authorization.json` approves local implementation, subsequent deployment, and sequential subagents/TDD/SPEC/different QUALITY. The master design's historical “unapproved” introduction is superseded. No generic approval or execution-workflow question is required.

Prerequisite: Root accepts Task12's final native integration and independent reviews before Task13 source implementation. This prerequisite was satisfied during draft self-review: actual `E/task12-completion.json` records local completion and Root confirmed chunkd9d35c,23/23 plan boxes and24 source identities. Root then owns the final copy of this plan and obtains independent plan review. This plan does not modify Task12 evidence.

The roadmap stays **17 top-level Tasks**. The seven internal subtasks below all belong to Task13. Task14 owns public browser submission, public factory selection, fast `backgroundAccepted` DTO, owner/session recover/get wiring, frontend and complete two-sided browser end-to-end acceptance. Task15 owns actual account/resource identities, secrets, backup/migrations/deployment and deployed zero-Provider drills. Task16 requires a new concrete paid-attempt permit. Task17 owns source/GitHub backup and public opening. Public/latest Site10 Research remains closed throughout this task.

Do not read real keys or local environment-secret files; call real Provider/Repair; make external network/account/resource requests; install dependencies; mutate Git; deploy; touch production D1/R2; or invent resource IDs. Local Miniflare transport is intercepted and contains synthetic values only. Keep Kimi low/32768, `kimi-low-output32k-v3`, model `moonshotai/kimi-k3`, Provider 1200000 ms, execution lease 1260000 ms, unchanged local launcher 1320000 ms, Repair0. Do not import the local validation launcher/provider wrapper into the runtime.

Precedence: the accepted Task10 plan and `SiteAdmissionCoordinator.reconcileBeforeBegin` conservatively CLOSE uncertain pending admission, reread, and release only existing original reservations. They never fill missing reservations or promote a both-valid partial admission. That accepted contract supersedes the older optional promotion sentence in the master design.

## Inspected existing contracts (reuse, not rewrite)

| Module | Actual contract |
| --- | --- |
| `app/server/research/executor/auth.ts` | `signBridgeMessage({context,body,keyId,keyBytes,now})`; `verifyBridgeMessage({...same,headers,nonces})`. Context contains direction, kind, method, fixed path, HTTPS audience origin, jobId/`collection`, response status/null. Replay scope is **direction:keyId**, shared by request/response and audience; preserve it. |
| `executor/body.ts` | `readBridgeBody(message,{maxBytes,timeoutMs,signal?})`; maximum read timeout 30000 ms; actual stream-byte limits request4096/status4096/outbox16384/result1048576. `decodeBridgeJson` rejects invalid UTF-8. |
| `executor/connection-config.ts` | `readResearchBridgeConnection(environment)` returns siteOrigin/executorOrigin and independent siteToExecutor/executorToSite credentials with `copyKeyBytes()`. It rejects equal channel secrets. |
| `executor/job.ts` | `parse/encode/decodeBridgeJob`, `hashBridgeJob`. Complete immutable job includes protocol/executor/jobId/runId/requestId/input/config fingerprints/policyId/role/locale/createdAt/queueExpiresAt. No owner or URL field. |
| `executor/begin.ts` | `BridgeBeginReply={grant,observedAt,remainingMs}`; `matchBridgeBeginReply(reply,job)` then `assertBridgeProviderBudget(reply,elapsedMs)`. Deduct full request RTT **and subsequent local D1 work**; never reset elapsed at grant persistence. |
| `worker/research-executor/d1-job-store.ts` | `new D1BridgeJobStore(db)`; `accept(job,acceptedAt)`, `get(jobId)`, `recordWorkflowAccepted(job,workflowId,observedAt)`, `recordBegin(job,grant)`, `claimDispatch(job,grant,claimedAt):Promise<boolean>`, `closeUnclaimed(job,closedAt)`. Only a positively acknowledged `true` claim authorizes one dispatch; rereading `claimed` after lost acknowledgement never does. |
| `worker/research-executor/receipt-store.ts` | `new ExecutorReceiptStore(db,bucket)`; `save(receipt,fixedAt)`, `recover(jobId,fixedAt)`, `acknowledge(jobId,receiptHash,observedAt)`, `cleanup(jobId,now)`. Result carries metadata/fixedAt/siteAcknowledgedAt/cleanupRequestedAt/bodyRemovedAt/bodyState/receipt. Each operation already has a cumulative 5 s bound; cleanup uses conditional R2 tombstones, not unconditional deletion. |
| `site-execution-repository.ts` / `site-begin-repository.ts` | `SiteExecutionIdentity={ownerId,runId,requestId,jobId,requestHash}`. `executions.read(ownerId,runId)`. `begin.begin({...identity,newExecutionAllowed})`. Identity is resolved locally from Site DB. |
| `site-admission.ts` | `reconcileBeforeBegin(identity)` rejects `beganAt !== null`. Never use it to reconcile a begun execution. |
| `site-import.ts` | `SiteImportCoordinator.complete(identity,receipt)` / `.reconcileMetadata(identity,metadata)`, both returning `{run,receiptHash,accounting}` after durable effects and proofs. No invented public resume method. Reconcile existing journal with its stored metadata if body retrieval is unavailable. |
| `budget.ts` | `readReservation(ownerId,id)`, `readBucket(id)`, `settle(ownerId,id,{kind:'actual',actualMicros}|{kind:'not-charged'}|{kind:'unknown'})`. Unknown preserves reserved bucket amounts; later actual can settle held amounts. Final settled/released disagreement is conflict. |
| `openrouter-provider.ts` | `new OpenRouterResearchProvider(config,{fetch?,onFailureDiagnostic?})`; `.research({role,locale})`; errors are `ResearchProviderError(code,retryable,charged,{actualModel,usage})`. Outcome serialization omits `candidate`, trace and diagnostics. |
| Tests | Native `SqliteD1`, `createSiteAdmissionFixture`, `createSiteImportFixture`, `validReceipt`, valid-candidate fixtures, existing Miniflare R2 tests. SQL clock in admission fixture can differ from app clock. |

Existing executor migrations are exactly `0000_research_bridge_nonces.sql`, `0001_research_executor_jobs.sql`, `0002_research_executor_results.sql`, under `worker/research-executor/migrations/`. Site migrations are under `drizzle/`, through `0010_research_site_imports.sql`. Do not apply one database's migration set to the other.

## File map and new API contract

All paths below are relative to W. New source files, unless marked Modify:

| Unit | Paths and responsibility |
| --- | --- |
| Wire types and transport | `app/server/research/executor/bridge-contract.ts` (strict new DTO codecs/route selection); `app/server/research/executor/http-transport.ts` (signed fixed-origin request/response); `app/server/research/executor/executor-client.ts`; `worker/research-executor/site-client.ts`. |
| Site recovery persistence | `drizzle/0011_research_site_bridge.sql`; Modify `drizzle/meta/_journal.json`, `db/schema.ts`, `tests/helpers/sqlite-d1.ts`; narrowly additive Modify `tests/db/migration-safety.test.ts` and `tests/db/schema.test.ts` for0011/idx11 and the three new tables while preserving all old assertions and SQL hashes; `app/server/research/site-bridge-repository.ts` (types); `app/server/research/d1-site-bridge-repository.ts` (owner lookup/acceptance/scans); `app/server/research/site-expiry.ts`; `app/server/research/d1-site-expiry-repository.ts` (post-begin SQL authority). |
| Site private entry | `app/server/http/research-bridge-routes.ts`; `app/server/research/site-bridge-factory.ts`; `app/api/internal/research-bridge/[operation]/route.ts`. Do not modify public research route factories or service-factory in Task13. |
| Executor runtime | `worker/research-executor/environment.ts`, `runtime.ts`, `bootstrap.ts`, `execute-job.ts`, `workflow-policy.ts`, `workflow.ts`, `http-routes.ts`, `index.ts`. |
| Maintenance | `worker/research-executor/migrations/0003_research_executor_maintenance.sql`; `worker/research-executor/maintenance-store.ts`, `delivery.ts`, `maintenance.ts`. |
| Build and runtime check | `worker/research-executor/tsconfig.json`, `worker/research-executor/wrangler.local.jsonc`, `scripts/build-research-executor.mjs`, `scripts/test-research-workflow-runtime.mjs`, `tests/fixtures/research/workflow-runtime-entry.ts`. No deploy-ready production resource file. |
| Tests | `tests/server/research-bridge-transport.test.ts`, `tests/server/research-bridge-contract.test.ts`, `tests/db/site-bridge-migration.test.ts`, `tests/server/d1-site-bridge-repository.test.ts`, `tests/server/site-expiry.test.ts`, `tests/api/research-bridge-routes.test.ts`, `tests/server/research-executor-runtime.test.ts`, `tests/server/research-executor-maintenance.test.ts`, `tests/server/research-executor-private-integration.test.ts`, `tests/helpers/research-bridge-fixture.ts`. |

The shared contract file exports the following **new** types. DTO parsers must be strict Zod objects, reject unknown keys, snapshot canonical JSON, enforce UTF-8 size and all described equality relations. Import the existing BridgeJob, grant/receipt/metadata types, not copies.

```ts
export type BridgeIdentity = Readonly<{ jobId: string; requestHash: string }>;
export type AcceptedProof = BridgeIdentity & Readonly<{
  workflowId: string; workflowAcceptedAt: number;
}>;
export type UnsentProof = BridgeIdentity & Readonly<{
  state: 'closed'; closedAt: number; grant: BridgeBeginGrant | null;
}>;
export type ExecutorStatus = BridgeIdentity & Readonly<{
  accepted: AcceptedProof | null;
  dispatchState: 'unclaimed' | 'claimed' | 'closed';
  unsent: UnsentProof | null;
  metadata: BridgeReceiptMetadata | null;
  bodyState: 'available' | 'missing' | 'removed' | null;
}>;
export type ReceiptNotice = BridgeIdentity & Readonly<{ receiptHash: string }>;
export type ImportAcknowledgement = ReceiptNotice & Readonly<{
  accounting: 'held' | 'settled' | 'released';
}>;
export type BridgeErrorBody = Readonly<{
  code: 'not-found' | 'closed' | 'conflict' | 'unauthorized' | 'invalid-message' | 'temporary';
}>;
export type ScanCursor = Readonly<{ createdAt: number; jobId: string }> | null;
export type JobPage = Readonly<{ jobs: readonly BridgeJob[]; next: ScanCursor }>;
export type MaintenanceReply = Readonly<{ visited: number; failed: number }>;
```

UUID/hash/time syntax uses the existing exact bounds; workflowId MUST equal jobId; acceptedAt is not a replacement for workflowAcceptedAt. Unsent must come from an authenticated response after D1 irreversibly changed dispatch_state to closed; closedAt equals stored dispatchAt, grant equals original stored grant/null. No 404 or absence can construct it. Status schema also checks nested job/hash/grant identity, `closed` iff unsent non-null, metadata implies claimed, and bodyState non-null iff metadata non-null. `JobPage.jobs` length <=10 and encoded page <=16384; never truncate bytes. `MaintenanceReply` counts are 0..10. Collection routes have no query parameters.

Expose synchronous syntax-only `parseAcceptedProof(input)`, `parseUnsentProof(input)`, `parseExecutorStatus(input)`, `parseReceiptNotice(input)`, `parseImportAcknowledgement(input)`, `parseJobPage(input)`, `parseMaintenanceReply(input)`, `parseBridgeErrorBody(input)`; input is unknown and result is a bounded owned snapshot of its named type. These parsers take **no expected-job argument** and never imply semantic identity matching. `encodeBridgeDto(value,limit)` returns canonical owned bytes after enforcing the limit. No transport DTO contains owner, public package, raw error text or arbitrary URL.

Add the following separately named asynchronous semantic matchers in `bridge-contract.ts`. Every matcher synchronously snapshots **all** caller inputs, expected job via existing `parseBridgeJob`, and expected notice/grant via their strict parsers **before its first await**. It hashes only those owned values with existing `hashBridgeJob`; BridgeJob has no requestHash member. Matchers are pure validation: no network, nonce writes or business mutations. All nested identities/hash/grants must match the same snapshotted job; grant.beganAt is in `[job.createdAt,job.queueExpiresAt)`, grant.executionExpiresAt=beganAt+1260000. A non-null original frozen grant, when supplied to the result matcher, must match every field. Nullable unsent grant remains permitted only for the actual closed proof semantics below.

```ts
matchAcceptedProof(input:unknown, expectedJob:BridgeJob):Promise<AcceptedProof>;
matchUnsentProof(input:unknown, expectedJob:BridgeJob):Promise<UnsentProof>;
matchExecutorStatus(input:unknown, expectedJob:BridgeJob):Promise<ExecutorStatus>;
matchReceiptNotice(input:unknown, expectedJob:BridgeJob):Promise<ReceiptNotice>;
matchImportAcknowledgement(input:unknown, expectedJob:BridgeJob,
  expectedNotice:ReceiptNotice):Promise<ImportAcknowledgement>;
matchBridgeMetadata(input:unknown, expectedJob:BridgeJob):Promise<BridgeReceiptMetadata>;
matchResultReceipt(input:unknown, expectedJob:BridgeJob, expectedNotice:ReceiptNotice,
  expectedGrant:BridgeBeginGrant):Promise<BridgeProviderReceipt>;
```

`matchExecutorStatus` validates each nested accepted/unsent/metadata identity and cross-field relation; metadata is syntax+job/grant matched but cannot reconstruct a body hash. `matchReceiptNotice` verifies both jobId and asynchronous job requestHash. `matchImportAcknowledgement` additionally requires receiptHash exactly equal the supplied matched notice. `matchResultReceipt` snapshots all four inputs first, verifies notice/job identity and original grant, calls existing `matchBridgeProviderReceipt(receipt,expectedGrant)`, awaits `hashBridgeProviderReceipt(receipt)` and requires exact expectedNotice.receiptHash; no result leaves this boundary on a merely well-shaped hash. `matchBridgeMetadata` verifies nested grant and retained receiptHash syntax; only the trusted result store/accepted import journal confers bodyless metadata authority.

Transport `BridgeTransport` is created with `{connection,nonces,fetch,wallNow,monoNow}` and exposes this exact generic method, returning the fully decoded/matched value rather than raw bytes:

```ts
type BridgeOperation = 'submit'|'status'|'close'|'result'|'acknowledge'
  |'begin'|'accepted'|'complete'|'metadata'|'maintenance'|'outbox';
type PreparedBridgeRequest = Readonly<{jobId:string;body:Uint8Array}>;
type BridgeRequest<T> = Readonly<{
  target:'site'|'executor'; operation:BridgeOperation;
  prepare:()=>PreparedBridgeRequest|Promise<PreparedBridgeRequest>;
  decode:(bytes:Uint8Array)=>T|Promise<T>;
  signal?:AbortSignal;
}>;
request<T>(input:BridgeRequest<T>):Promise<T>;
```

At method entry start the single5000ms monotonic deadline and validate target/operation against the fixed table **before invoking prepare, signing or fetching**. For example executor+begin is protocol failure with prepare/sign/fetch counters0. Snapshot call options and callback references synchronously. The transport chooses fixed URL/method/path/direction/audience/credential; callers cannot supply URL/path/headers. Then run pure `prepare` (including asynchronous job/proof hashes), copy returned body, check UUID/collection routing, size and remaining time, sign, fetch, read bounded bytes, authenticate signed response status, classify authenticated errors, and await `decode` (schema/nested-identity/result hashes) before final deadline check and return. Each await uses the same outer deadline/abort guard; no stage creates a fresh5s budget. `prepare`/`decode` must not start side effects; a digest that resolves after timeout may finish internally but cannot lead to signing/fetch/domain effects or return an accepted result. Abort fetch/stream on timeout and fence every subsequent await continuation. Auth verification may already have atomically claimed a nonce; this is not business authority.

`BridgeTransportError` carries only `kind:'temporary'|'authentication'|'protocol'|'conflict'|'not-found'|'closed'`. `temporary` means timeout/transport failure or a **verified**5xx/typed temporary response; unsigned/tampered status is authentication failure. Transport runs no retries. Clients synchronously snapshot their full job and other arguments before calling request; all asynchronous preparation and response matching is performed inside its callbacks, under this deadline. No matcher/hash is awaited before entering transport or after it resolves.

Existing `verifyBridgeMessage` has internal crypto awaits and no AbortSignal parameter. Pass a `BridgeNonceStore` wrapper whose `claim(input)` checks the same deadline immediately before calling the real nonce store and awaits it under the same remaining bound; this prevents a new nonce write starting after a delayed verifier digest exceeds the deadline. It cannot retract a nonce D1 write already started before timeout, and the plan must not claim that it can. Successful authentication may persist a nonce before DTO/schema/semantic validation rejects; tests assert those nonce effects separately from **zero business mutations** to runs, jobs, quotas, budgets, imports, receipts or Provider before authenticated semantic validation succeeds. Preserve the existing auth implementation and direction:keyId scope unchanged.

| Receiver / operation | Fixed path / method | Body and successful response |
| --- | --- | --- |
| Executor / submit | `/internal/research-bridge/submit` POST | BridgeJob → 202 AcceptedProof. Job-only acceptance returns signed503 temporary until same-ID Workflow acceptance is proved. |
| Executor / status | `/internal/research-bridge/status` POST | BridgeIdentity → 200 ExecutorStatus; signed404 means absence only. |
| Executor / close | `/internal/research-bridge/close` POST | BridgeIdentity → 200 UnsentProof only after `closeUnclaimed`; claimed → signed409 conflict. |
| Executor / result | `/internal/research-bridge/result` POST | ReceiptNotice → 200 existing encoded BridgeProviderReceipt; missing/removed body → signed404, retrieve metadata via status. |
| Executor / acknowledge | `/internal/research-bridge/acknowledge` POST | ReceiptNotice → 200 ReceiptNotice after existing store acknowledgement. |
| Site / begin | `/api/internal/research-bridge/begin` POST | BridgeIdentity → 200 existing encoded BridgeBeginReply. |
| Site / accepted | `/api/internal/research-bridge/accepted` POST | AcceptedProof → 200 same AcceptedProof only after exact Site persistence. |
| Site / complete | `/api/internal/research-bridge/complete` POST | ReceiptNotice → 200 ImportAcknowledgement after fetching fixed result and shared import. |
| Site / metadata | `/api/internal/research-bridge/metadata` POST | BridgeReceiptMetadata (<=4096) → 200 ImportAcknowledgement after shared reconciliation. |
| Site / maintenance | `/api/internal/research-bridge/maintenance` POST | `{}` / context jobId `collection` → 200 MaintenanceReply. Site owns persistent scan cursor. |
| Site / outbox | `/api/internal/research-bridge/outbox` POST | `{}` / context jobId `collection` → 200 JobPage. Site owns persistent scan cursor; no caller cursor manipulation. |

Job path identity is in signed context and body; because fixed paths do not contain UUID, use `x-arc-bridge-job-id` as a bounded routing hint, require UUID/collection before signature verification, and require exact equality with parsed body afterward. This header is never authority by itself. Requests containing search/hash, unsupported operation/method, unexpected Origin/session-based fallback, or wrong configured origin fail closed. Service HMAC is the authentication mechanism; browser cookies cannot substitute for it. Responses use same channel direction/method/path, `kind:'response'`, audience equal to original request target origin and exact HTTP status, per existing auth semantics. Response verification occurs before status interpretation or JSON decode.

Client methods are fully defined below; every per-job client carries the **complete** BridgeJob, not a partial BridgeIdentity. These client signatures do not change the wire DTO table. All take optional trailing `options:{signal?:AbortSignal}` and return `Promise` of the table success type.

```ts
type BridgeClientOptions=Readonly<{signal?:AbortSignal}>;
// ExecutorBridgeClient
submit(job:BridgeJob, options?:BridgeClientOptions):Promise<AcceptedProof>;
status(job:BridgeJob, options?:BridgeClientOptions):Promise<ExecutorStatus>;
close(job:BridgeJob, options?:BridgeClientOptions):Promise<UnsentProof>;
result(job:BridgeJob, notice:ReceiptNotice, expectedGrant:BridgeBeginGrant, options?:BridgeClientOptions):Promise<BridgeProviderReceipt>;
acknowledge(job:BridgeJob, notice:ReceiptNotice, options?:BridgeClientOptions):Promise<ReceiptNotice>;
// SiteBridgeClient
begin(job:BridgeJob, options?:BridgeClientOptions):Promise<BridgeBeginReply>;
accepted(job:BridgeJob, proof:AcceptedProof, options?:BridgeClientOptions):Promise<AcceptedProof>;
complete(job:BridgeJob, notice:ReceiptNotice, options?:BridgeClientOptions):Promise<ImportAcknowledgement>;
metadata(job:BridgeJob, metadata:BridgeReceiptMetadata, options?:BridgeClientOptions):Promise<ImportAcknowledgement>;
maintenance(options?:BridgeClientOptions):Promise<MaintenanceReply>;
outbox(options?:BridgeClientOptions):Promise<JobPage>;
```

submit prepare encodes the snapshotted job; status/close/begin prepare derive BridgeIdentity using awaited hashBridgeJob(job). Other prepare callbacks match the supplied proof/notice/metadata against the snapshotted job before encoding. Metadata derives the expected acknowledgement notice from its owned grant job/hash and receiptHash. Each decode callback uses the corresponding matcher above; begin uses existing `matchBridgeBeginReply(decodeBridgeJson(bytes),job)` under the same deadline; result uses matchResultReceipt with original grant. accepted additionally compares the returned proof to the exact prepared proof; acknowledge compares exact returned notice. Collection methods prepare collection+`{}` and decode strict bounded collection types. No client silently converts errors to unsent/success/acceptance. Server callers obtain full jobs from local owned execution/job records; no hidden client lookup is needed.

## Subtask 13.1 — strict wire adapters with bounded signed responses

**Files:** the four wire/client files above and two transport/contract test files; no existing codec/auth changes.

- [x] Write failing tests using `createSiteAdmissionFixture().createRemote()` for genuine BridgeJob values and two separate native SQLite nonce databases. Test valid roundtrip, status tampering200→503, changed body, method/path/audience/direction/job substitution, same nonce across kinds, wrong credential, oversized/trickled UTF-8 streams, misleading Content-Length, redirect refusal and cancellation. Add delayed-digest barriers: mutate caller proof/job/notice/grant/receipt while the first hash is pending and require original owned snapshot behavior; mismatched expected job/requestHash, nested accepted/unsent/metadata grant, original result grant and recomputed receiptHash must reject. Synthetic credentials must be generated in tests; no key value appears in runtime source.
- [x] Run `npm run test:unit -- tests/server/research-bridge-contract.test.ts tests/server/research-bridge-transport.test.ts`; record actual missing-module/assertion RED, not an infrastructure error.
- [x] Implement schemas, pure async matchers, fixed route table and generic transport. Its one5000ms deadline includes async request preparation/job/proof hashes, signing, fetch headers, stream read, signature/nonce verification, strict decode/nested matching and asynchronous result-body hash. Pass a derived AbortSignal to fetch/reader and check remaining monotonic time after every awaited stage. `redirect:'error'`, `cache:'no-store'`, JSON Content-Type, Cache-Control no-store. Cap outgoing bytes before signing. Use result1048576/outbox16384/other4096. Return sanitized errors without raw body/logging. Test executor+begin and site+submit reject before prepare/sign/fetch; delayed prepare digest crossing5s produces fetch0; combined prepare+HTTP+response hash crossing5s rejects without resetting the budget; delayed decode cannot cause later business mutations after caller timeout.

```ts
// Core signed response verification; route and credential come from the fixed table.
await verifyBridgeMessage({
  context: { direction: route.direction, kind: 'response', method: 'POST',
    path: route.path, audience: targetOrigin, jobId, status: response.status },
  body: bytes, keyId: credential.keyId, keyBytes: credential.copyKeyBytes(),
  headers: response.headers, nonces, now: wallNow,
});
// Only now classify authenticated errors, or await input.decode(bytes) under
// the SAME remaining deadline; then check it again before returning T.
```

- [x] Test native nonce row count and exact scope, not just verifier mocks:

```ts
expect(nonceDb.database.prepare('SELECT DISTINCT scope FROM research_bridge_nonces').all())
  .toEqual([{ scope: 'site-to-executor:testSite' }]);
expect(providerFetch).not.toHaveBeenCalled();
expect(new TextEncoder().encode(JSON.stringify(parsedPage)).byteLength).toBeLessThanOrEqual(16384);
```

- [x] Rerun the two new files plus existing `research-executor-auth.test.ts`, `research-executor-body.test.ts`, `research-executor-byte-identity.test.ts`, `research-executor-configuration.test.ts`. Fresh SPEC followed by different QUALITY; Root freezes only accepted file bytes. No Git commit in this task.

## Subtask 13.2 — Site acceptance, scans and post-begin terminal reconciliation

**Files:** Site persistence files/migration/schema/helper listed above; Create `tests/db/site-bridge-migration.test.ts`, `tests/server/d1-site-bridge-repository.test.ts`, `tests/server/site-expiry.test.ts`; additive-only Modify `tests/db/migration-safety.test.ts` and `tests/db/schema.test.ts` as specified below. Existing Task12 business modules and migrations remain frozen.

**Necessary integration addition:** neither acceptance persistence nor begun-expiry/unsent recovery exists in accepted modules. Add separate tables and coordinators, preserving existing admission/import implementations, immutable begin timestamps and `execution.version`. Do not make generic `ResearchRepository.transition` accept remote records.

Add migration0011 with the following tables. Exact safety checks in implementation: all timestamps and versions are integer0..MAX_SAFE_INTEGER; nullable timestamps enforce that bound; UUID36 and lowerhex64; JSON TEXT/object/UTF8<=4096; recovery reason enum; FK restrict; immutable identity/proof/terminal fields cannot change or be deleted. Sidecar updates must not alter original execution versions. Add each table to `db/schema.ts`, journal idx11/tag0011 and the native helper's explicit migration list. No Drizzle generator or snapshot fabrication.

- [x] Capture the actual Task12 baselines of the two existing tests before edits (completion hashes: migration-safety `c7113941788b899a29e5f2d6dc428643853029f429aee1617588effe078879ba`; schema `ccba6de1fa5f54758a995fa914830e295fb86f2027384e07d89d5a614ac7988c`). Root verifies exact additive diffs. In migration-safety retain every existing `priorHashes` value/check, all0000–0010 allowlist entries and existing journal/snapshot assertions; append only `0011_research_site_bridge.sql`, index11, and `{version:'6',tag:'0011_research_site_bridge',breakpoints:true}`. Update the test description's upper bound to0011. Retain actual old SQL files byte-for-byte, including0009/0010, under protected-file evidence. In schema test retain every current table name and assertion, append `research_site_acceptances`, `research_site_recoveries`, `research_site_scan_cursors`; the existing exact exportedTableNames length check remains. Add only relevant new-table identity/column/FK assertions, using new schema exports `researchSiteAcceptances`, `researchSiteRecoveries`, `researchSiteScanCursors`. Both files are explicitly in13.2 regression; no repeat whole-Task12 review is required.

```ts
expect(journal.entries[11]).toMatchObject({
  version:'6',tag:'0011_research_site_bridge',breakpoints:true,
});
expect(getTableName(schema.researchSiteAcceptances)).toBe('research_site_acceptances');
expect(getTableName(schema.researchSiteRecoveries)).toBe('research_site_recoveries');
expect(getTableName(schema.researchSiteScanCursors)).toBe('research_site_scan_cursors');
```

```sql
CREATE TABLE research_site_acceptances (
  job_id TEXT PRIMARY KEY REFERENCES research_site_executions(job_id),
  request_hash TEXT NOT NULL,
  workflow_id TEXT NOT NULL CHECK(workflow_id=job_id),
  workflow_accepted_at INTEGER NOT NULL,
  recorded_at INTEGER NOT NULL,
  CHECK(length(job_id)=36 AND length(request_hash)=64)
);
CREATE TABLE research_site_recoveries (
  job_id TEXT PRIMARY KEY REFERENCES research_site_executions(job_id),
  request_hash TEXT NOT NULL,
  execution_version INTEGER NOT NULL,
  run_version INTEGER NOT NULL,
  terminal_hash TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('expired-unknown','executor-unsent')),
  unsent_json TEXT,
  terminal_at INTEGER NOT NULL,
  quota_done INTEGER NOT NULL DEFAULT 0 CHECK(quota_done IN (0,1)),
  budget_done INTEGER NOT NULL DEFAULT 0 CHECK(budget_done IN (0,1)),
  version INTEGER NOT NULL DEFAULT 0,
  CHECK((reason='executor-unsent')=(unsent_json IS NOT NULL))
);
CREATE TABLE research_site_scan_cursors (
  name TEXT PRIMARY KEY CHECK(name IN ('maintenance','outbox')),
  after_created_at INTEGER,
  after_job_id TEXT,
  version INTEGER NOT NULL DEFAULT 0,
  CHECK((after_created_at IS NULL)=(after_job_id IS NULL))
);
INSERT INTO research_site_scan_cursors(name) VALUES ('maintenance'),('outbox');
CREATE INDEX research_site_scan_idx ON research_site_executions(created_at,job_id);
```

`research_site_executions.job_id` already has a unique index; verify foreign_key_check using actual0011 test. Immutable guard prevents deleting acceptances/recoveries or altering job/request/execution/run version, terminalAt/reason/proof; exception: a recovery may monotonically upgrade `expired-unknown` to `executor-unsent` with verified proof, reset only budget_done to0, retain original terminalAt/runVersion and increment recovery.version. This enables eventual release after an initially unknown expiry. A proof cannot downgrade to unknown.

Define interfaces in `site-bridge-repository.ts`:

```ts
export interface SiteBridgeRepository {
  lookup(identity: BridgeIdentity): Promise<{ identity: SiteExecutionIdentity; execution: SiteExecutionRecord }>;
  recordAcceptance(proof: AcceptedProof): Promise<AcceptedProof>;
  readAcceptance(identity: SiteExecutionIdentity): Promise<AcceptedProof | null>;
  nextScan(name: 'maintenance'|'outbox'): Promise<SiteExecutionIdentity | null>;
}
export type SiteRecovery = Readonly<{
  identity: SiteExecutionIdentity; executionVersion: number; runVersion: number;
  terminalHash: string;
  reason: 'expired-unknown'|'executor-unsent'; unsent: UnsentProof|null;
  terminalAt: number; quotaDone: boolean; budgetDone: boolean; version: number;
}>;
export interface SiteExpiryRepository {
  terminate(identity: SiteExecutionIdentity, proof: UnsentProof|null): Promise<SiteRecovery|null>;
  read(identity: SiteExecutionIdentity): Promise<SiteRecovery|null>;
  mark(identity: SiteExecutionIdentity, stage:'quota'|'budget', expectedVersion:number): Promise<SiteRecovery>;
}
```

`D1SiteBridgeRepository(db,research,executions)` implements lookup by `SELECT user_id,run_id,request_id,job_id,request_hash FROM research_site_executions WHERE job_id=?`; require exact supplied hash; then call actual owner-aware `executions.read`/`research.getRun` and match full job/config/run/execution identity. Never accept remote owner. `recordAcceptance` requires lookup, proof equality and inserts once; catch lost insert acknowledgement by exact reread, different proof conflict. Site acceptance is independent from whether new calls are currently enabled. `readAcceptance` requires owner-aware identity match; Task14 can derive `backgroundAccepted` from it later.

`nextScan` uses SQL keyset `(created_at,job_id)`, LIMIT1, persistent version-CAS; moves cursor **before** handing out an item. End-of-range wraps cursor to null once; no unbounded loop. On malformed row, advance by raw validated sortable columns and count visited, return sanitized failure rather than stalling forever. Maintenance selects pending, prebegin expired/closed needing reservation reconciliation, begun active at/after SQL deadline, pending recovery stages, import phase<5, **and expired-unknown recoveries with an original conservative-held budget even when quota_done=budget_done=1**. Outbox selects admitted+unbegun+SQL-unexpired only. Actual operations revalidate after selection. Site outbox endpoint checks current new-call gate and returns an empty page when closed. New inserts sort behind or ahead and are eventually seen after wrap.

Accounting stages and uncertainty resolution are different facts. No new recheck flag is needed: durable `p.reason='expired-unknown'` plus the exact original budget's `conservative-hold` status is persistent recheck eligibility. No authenticated claimed observation suppresses these future checks; claimed-with-no-receipt remains held and fairly revisited. Matching irreversible unsent upgrade changes reason and releases the budget; real receipt settlement/release changes the original budget status, naturally removing this eligibility branch. A real receipt whose accounting remains unknown does not falsely resolve uncertainty.

The maintenance selector is concretely the following query (bind cursor after_created_at/after_job_id or bothNULL). It is discovery only, not release authority; all effect paths use the strict repository guards already defined. The recheck branch intentionally has **no stage-done filter**:

```sql
SELECT e.user_id,e.run_id,e.request_id,e.job_id,e.request_hash,e.created_at
FROM research_site_executions e
JOIN research_runs r ON r.id=e.run_id AND r.user_id=e.user_id AND r.request_id=e.request_id
WHERE r.execution_mode='cloudflare-workflow-v1'
 AND (?1 IS NULL OR e.created_at>?1 OR (e.created_at=?1 AND e.job_id>?2))
 AND (
   e.admission_state='pending'
   OR (e.began_at IS NULL AND (
     (e.admission_state='admitted' AND e.queue_expires_at<=CAST(ROUND(unixepoch('subsec')*1000) AS INTEGER))
     OR (e.admission_state='closed' AND e.close_reason IN ('denied','expired','interrupted'))))
   OR (e.began_at IS NOT NULL AND r.state IN ('researching','validating')
     AND e.execution_expires_at<=CAST(ROUND(unixepoch('subsec')*1000) AS INTEGER))
   OR EXISTS(SELECT 1 FROM research_site_recoveries p
     WHERE p.job_id=e.job_id AND p.request_hash=e.request_hash
       AND (p.quota_done=0 OR p.budget_done=0))
   OR EXISTS(SELECT 1 FROM research_site_imports j
     WHERE j.job_id=e.job_id AND j.request_hash=e.request_hash AND j.phase<5)
   OR EXISTS(SELECT 1 FROM research_site_recoveries p
     JOIN ai_budget_reservations b ON b.id=e.budget_reservation_id
       AND b.run_id=e.run_id AND b.request_id=e.request_id
     WHERE p.job_id=e.job_id AND p.request_hash=e.request_hash
       AND p.execution_version=e.version AND p.run_version=r.state_version
       AND p.reason='expired-unknown' AND p.unsent_json IS NULL
       AND r.state='failed' AND r.active_slot IS NULL AND r.active_expires_at IS NULL
       AND b.maximum_reserved_micros=e.maximum_micros AND b.expires_at=e.reservation_expires_at
       AND b.status='conservative-hold' AND b.settled_micros=0)
 )
ORDER BY e.created_at,e.job_id LIMIT 1;
```

`D1SiteExpiryRepository(db,research,executions)` creates recovery and terminal run in a single D1 batch with mandatory `changes()=1` assertion after each effect. Full current run/execution/accounting snapshot comparisons, original quota/budget IDs and bounds are required, following Task12 publication's guarded SQL pattern. The authoritative expiry predicate and terminal update are:

```sql
UPDATE research_runs AS r SET state='failed',state_version=state_version+1,
  retryable=1,active_slot=NULL,active_expires_at=NULL,package_id=NULL,
  quality_json=NULL,candidate_json=NULL,error_code='interrupted',
  public_failure_category='timeout',updated_at=?1
WHERE r.id=?2 AND r.user_id=?3 AND r.request_id=?4
  AND r.execution_mode='cloudflare-workflow-v1'
  AND r.state_version=?5 AND r.state IN ('researching','validating')
  AND r.state_version<9007199254740991
  AND EXISTS(SELECT 1 FROM research_site_executions e
    WHERE e.run_id=r.id AND e.user_id=r.user_id AND e.request_id=r.request_id
      AND e.job_id=?6 AND e.request_hash=?7 AND e.version=?8
      AND e.admission_state='admitted' AND e.began_at IS NOT NULL
      AND e.execution_expires_at=e.began_at+1260000
      AND r.active_expires_at=e.execution_expires_at AND r.remote_quota_key=e.quota_key
      AND (?9=1 OR CAST(ROUND(unixepoch('subsec')*1000) AS INTEGER)>=e.execution_expires_at))
  AND NOT EXISTS(SELECT 1 FROM research_site_imports j WHERE j.run_id=r.id AND j.phase>=2);
SELECT CASE WHEN changes()=1 THEN 1 ELSE json('') END;
```

`?9=1` is never a caller-provided boolean: it is derived inside the trusted repository only after strict authenticated `UnsentProof` matching original job+grant, plus immutable proof persistence in the same batch. Use `?1` as observed SQL timestamp for terminal bytes and require actual SQL time >= that observation in the mutation. Also compare observed run fields and accounting snapshot, using <=100 bindings and existing quota SQL helpers. For early unsent closure use `error_code='interrupted'`, `public_failure_category='service-unavailable'`; for deadline use timeout. The SQL block above is the expiry branch; keep branches explicit. Existing failed run is preserved exactly; ready/needs-review is never replaced. A phase0/1 import and expiry may race: version/CAS chooses one terminal; the losing party rereads and resumes via Task12; phase>=2 resolved import is never overwritten. No change to execution.admissionState, closeReason or version.

`SiteExpiryCoordinator(dependencies:SiteExpiryDependencies)` exposes `reconcile(identity,proof:UnsentProof|null):Promise<void>`; the exact dependency type is below. Actual result paths first call complete/reconcileMetadata. If journal exists, call `importer.reconcileMetadata(identity,journal.metadata)` to let accepted journal authority finish; never synthesize a receipt. With no journal, call terminate; if active/unexpired and no proof it returns null and performs no accounting. When a matching recovery already exists, terminate does not rerun terminal run CAS: it validates the original terminalHash/execution.version and, on a newly verified irreversible unsent proof, CAS-upgrades expired-unknown→executor-unsent, persists proof, and resets only budget_done to0 even if both stages were1. Unknown replay does not reset stages. For a durable recovery, reread exact original quota and budget; finalize quota `failed,0` iff it is unfinalized, preserve exact existing failed finalization, reject accepted/rejected contradictions. Settle unknown on original budget if still reserved; leave actual settled receipt accounting intact. Only matching irrevocable unsent proof permits `not-charged`. A concurrently captured real journal takes precedence: invoke its coordinator and do not release on absence alone. Stage markers are recovery-version CAS after effect, with exact reread after lost acknowledgement. Terminal/identity evidence plus original reservation identities are rechecked before each effect. Late actual receipt uses unchanged Task12 journal and settles held fees without reviving the run. Completing the accounting markers never disables the distinct persistent unknown-recheck selector above.

**Unsent grant distinction:** grant=null is valid only in the signed irreversible executor closed proof for exact original jobId/requestHash (the hash binds the complete Site-owned BridgeJob). This covers Site begin committed but its reply never persisted on executor. It is never inferred from status absence,404,grant absence alone or a Workflow error. A non-null proof grant must equal Site's frozen protocol/jobId/requestHash/beganAt/executionExpiresAt in every field. Include native lost-begin-reply→executor close with nullgrant→original reservation release, plus close-versus-claim races in both orders. Neither branch invents a new deadline or grant.

- [x] RED: new migration preserves all preexisting rows; cannot insert invalid proof/hash/time/JSON; owner substitution rejected; acceptance acknowledgement loss produces one row; queued-only outbox excludes expired/begun/closed; cursor skips corrupt payload and wraps.
- [x] RED: begun at expiry uses SQL clock at mutation (advance it after preread); preserves unknown reserved totals; valid close proof releases original budget once; signed404/timeout/claimed/error never releases; lost terminal/quota/budget acknowledgement converges; late actual >5000000 settles full amount with failed run unchanged; expiry versus publication never produces orphan package or altered terminal quota. Native selector test sets expired-unknown/conservative-hold and both markers1, closes/reopens DB, and requires nextScan('maintenance') to return that exact identity after bounded cursor wrap; settled/released counterparts must leave this branch. Add the runtime restart/transient-failure chain specified13.7.

```ts
const f = await createSiteImportFixture();
f.setSqlNow(f.execution.executionExpiresAt!);
await expiry.reconcile(f.identity, null);
expect((await f.research.getRun(f.identity.ownerId, f.identity.runId))?.state).toBe('failed');
expect((await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!))?.status)
  .toBe('conservative-hold');
await realImport.complete(f.identity, validReceipt(f.execution, 6_250_000));
expect((await f.research.getRun(f.identity.ownerId, f.identity.runId))?.state).toBe('failed');
expect(f.db.database.prepare('SELECT count(*) n FROM research_packages').get()).toEqual({ n: 0 });
expect((await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!))?.settledMicros)
  .toBe(6_250_000);
```

`expiry` is the new coordinator assembled with this same native fixture, and `realImport` is the accepted Task12 composition shown in `tests/server/site-import-integration.test.ts`, not a mock. The fixture exports `setSqlNow` and `setAppNow`; the first changes the actual SQLite clock independently.

**Concurrent accounting rule:** expiry recovery is not a second receipt journal. It never inserts `ai_runs`, sets a receipt hash, fabricates usage or captures a Provider receipt. After any failed `settle(unknown)` call, reread the original reservation and existing import journal: a matching settled/released result belongs to the real import and must neither be downgraded nor rejected solely because it differs from the expiry intent. Resume/verify that import with stored metadata; mark the sidecar's budget stage satisfied without changing its terminal run snapshot. A reserved/conservative-hold balance is still unfinished unless the requested durable effect is proved. For an unsent upgrade, reread before `not-charged`; a concurrent real receipt/claimed evidence is an integrity conflict, never authority to release. If an earlier recovery already finalized quota failed, Task12 late-result publication preserves that failed run/quota and only settles original-reservation fees. Add native barriers at terminal CAS, quota effect and budget effect to test expiry versus capture/resolve/settle in both orders, including lost acknowledgements. Test executor `closeUnclaimed` versus `claimDispatch` with independent callers: exactly one irreversible state wins; only the closed winner can yield an accepted proof.

Recovery `terminal_hash` is SHA256 of canonical final ResearchRunRecord, computed before the terminal batch using observed SQL timestamp and stored with it; require lowercasehex64. Every replay/marker rereads actual run, checks hash, then SQL-compares all observed run fields as the accepted publication guard does, so same-version corruption cannot pass. Include terminal_hash in immutable columns. A real import preserving the failed terminal uses the identical snapshot/hash.

Define the coordinator dependencies as an exact new type, not a hybrid imported interface:

```ts
export type SiteExpiryDependencies = Readonly<{
  repository: SiteExpiryRepository;
  bridgeRepository: SiteBridgeRepository;
  importer: Pick<SiteImportCoordinator,'reconcileMetadata'>;
  importJournal: Pick<SiteImportRepository,'read'>;
  entitlements: Pick<Required<EntitlementRepository>,'readResearchReservation'>
    & Pick<EntitlementRepository,'finalize'>;
  budget: Pick<ResearchBudgetRepository,'readReservation'|'readBucket'|'settle'>;
}>;
```

Use `importJournal.read(identity)` and `importer.reconcileMetadata(identity,journal.metadata)` with those exact property names in factory/tests. The `mark` SQL must prove the effect at write time, not merely accept a prior effect result. Bind job/hash/owner/run/request/expected recovery version/original reservation IDs/bucket IDs/execution version and current terminal snapshot. The common join is recovery p→execution e on job/hash→run r on run/user/request; require r failed/active_slot NULL/active_expires_at NULL, r.state_version=p.run_version, e.version=p.execution_version, e admitted, e original begin deadline, original quota/budget IDs and immutable proof JSON. The marker uses `UPDATE ... SET <stage>_done=1,version=version+1 WHERE version=?expected AND <stage>_done=0 AND EXISTS(<proof>)`; zero changes are success only after exact fully proved reread, never unconditional success.

For quota proof prepend existing `researchQuotaLedgerCte`; require no `researchQuotaInvalidRowsSql('e.user_id','e.quota_key')`, one original reserved group and exactly one terminal failed/units0 row:

```sql
EXISTS(SELECT 1 FROM ledger_groups g JOIN quota_ledger q ON q.reservation_id=g.reservation_id
 WHERE g.reservation_id=e.quota_reservation_id AND g.reserved_user=e.user_id
   AND g.reserved_key=e.quota_key AND g.reserved_purpose='role-research'
   AND g.reserved_units=1 AND g.reserved_count=1 AND g.terminal_count=1
   AND q.user_id=e.user_id AND q.idempotency_key=e.quota_key
   AND q.purpose='role-research' AND q.entry_kind='failed' AND q.units=0)
```

Budget proof joins original `ai_budget_reservations b` and day/month buckets, verifies owner via r, b.run_id=e.run_id/request_id=e.request_id/id=e.budget_reservation_id, original maximum/expiry, distinct original day/month IDs, correct site scopes/period kinds/period starts from b.created_at and safe sums. Then require this exact state disjunction; ordinary reserved is never proof of completed unknown settlement:

```sql
(
 (p.reason='expired-unknown' AND b.status='conservative-hold' AND b.settled_micros=0
   AND d.reserved_micros>=b.maximum_reserved_micros AND m.reserved_micros>=b.maximum_reserved_micros)
 OR (p.reason='executor-unsent' AND p.unsent_json IS NOT NULL
   AND b.status='released' AND b.settled_micros=0
   AND NOT EXISTS(SELECT 1 FROM research_site_imports j WHERE j.run_id=e.run_id))
 OR EXISTS(SELECT 1 FROM research_site_imports j
   WHERE j.run_id=e.run_id AND j.user_id=e.user_id AND j.request_id=e.request_id
     AND j.job_id=e.job_id AND j.request_hash=e.request_hash
     AND j.execution_version=e.version AND j.phase>=4
     AND json_extract(j.resolution_json,'$.state')='failed'
     AND json_extract(j.resolution_json,'$.runVersion')=p.run_version
     AND json_extract(j.resolution_json,'$.terminalHash')=p.terminal_hash
     AND ((json_extract(j.settlement_json,'$.kind')='actual' AND b.status='settled'
       AND b.settled_micros=json_extract(j.settlement_json,'$.actualMicros'))
       OR (json_extract(j.settlement_json,'$.kind')='not-charged'
         AND b.status='released' AND b.settled_micros=0)
       OR (json_extract(j.settlement_json,'$.kind')='unknown'
         AND b.status='conservative-hold' AND b.settled_micros=0
         AND d.reserved_micros>=b.maximum_reserved_micros
         AND m.reserved_micros>=b.maximum_reserved_micros)))
)
```

Validate the journal via its strict existing reader/coordinator before binding its canonical JSON in the actual marker predicate; match receipt_metadata_json/settlement_json/resolution_json and version so concurrent substitution after preread fails. Stage already1 replay still verifies this current proof; a late real settlement therefore satisfies the final branch and cannot be rejected/downgraded by expiry replay. Tests force actual budget commit before lost mark acknowledgement and before expiry reread, requiring unchanged bucket totals, same terminalHash and completed sidecar marker.

When an import journal is found at coordinator entry, complete its metadata reconciliation first, then reread an existing recovery sidecar and advance any missing quota/budget markers using these actual proofs. Do not return early and leave a permanently pending sidecar after a completed import. If there is no sidecar, no new recovery journal is necessary. A completed journal whose budget is settled/released leaves unknown-recheck eligibility; conservative-held uncertainty remains fairly discoverable regardless of accounting marker completion. Do not suppress it on an authenticated claimed-with-no-receipt observation.

- [x] Run `npm run test:unit -- tests/db/site-bridge-migration.test.ts tests/server/d1-site-bridge-repository.test.ts tests/server/site-expiry.test.ts tests/server/site-admission.test.ts tests/server/d1-site-begin-repository.test.ts tests/server/site-import.test.ts tests/server/d1-site-import-publication.test.ts tests/db/migration-safety.test.ts tests/db/schema.test.ts`; SPEC then independent QUALITY.

## Subtask 13.3 — private Site bridge routes and shared result handoff

**Files:** Site route/factory files and `tests/api/research-bridge-routes.test.ts`; extend new `tests/helpers/research-bridge-fixture.ts` only. Existing public factory/DTO/browser files remain unchanged.

`createSiteBridgeHandler(dependencies): (request:Request)=>Promise<Response>` handles the six fixed Site operations. Dependencies are `{connection,nonces,createOperations:(guard:()=>void)=>SiteBridgeOperations,executor:ExecutorBridgeClient,newExecutionAllowed:()=>boolean,wallNow,monoNow}`. Only the thin production factory obtains injected runtime `environment` and `getD1`; it constructs existing `D1ResearchRepository`, `D1SiteExecutionRepository`, `D1SiteBeginRepository`, `D1SiteImportRepository`, `D1SiteImportPublication`, `D1AiRunSink`, `D1EntitlementRepository`, `D1ResearchBudgetRepository`, nonce store and new sidecars. Pass the same existing expiry repository and budget repository through the readonly `recovery`/`budget` capabilities; `expiry` remains the expiry-effect coordinator. It does **not** construct any Provider. `createProductionSiteBridgeHandler({environment,getD1,fetch?,wallNow?,monoNow?})` returns a fail-closed handler when bridge connection is absent.

The exact request-scoped operation bundle is:

```ts
type SiteBridgeOperations = Readonly<{
  bridge: SiteBridgeRepository;
  begin: SiteBeginRepository;
  admission: SiteAdmissionCoordinator;
  imports: SiteImportCoordinator;
  importJournal: SiteImportRepository;
  expiry: SiteExpiryCoordinator;
  recovery: Pick<SiteExpiryRepository, "read">;
  budget: Pick<ResearchBudgetRepository, "readReservation">;
  outboxEligibility: Readonly<{
    isEligible(identity: SiteExecutionIdentity, expectedVersion: number): Promise<boolean>;
  }>;
}>;
```

`outboxEligibility` is a readonly capability implemented in the owned production factory over the same request-guarded D1. After the selected owner-aware lookup, its fixed SQL query must match the complete original owner/run/request/job/hash identity and expected execution version, join the matching remote run, and require admitted, unbegun and queue_expires_at strictly greater than the actual SQL clock. Missing/ineligible rows return false; malformed results or failed reads fail closed. It never admits, begins, scans or mutates. Outbox performs its existing initial current-gate check and exactly one nextScan, then owned lookup, awaited eligibility read, and a fresh current-gate check immediately before returning zero or one job. This is a fresh local decision, not a guarantee of atomic eligibility through network delivery.

Export `createSiteBridgeOperations(db: D1Database, guard: () => void, wallNow: () => number): SiteBridgeOperations` from the existing production factory file. Production and forced-discovery tests use this same fresh construction. The forced client may wrap only bridge.nextScan to offer one fixed candidate; all effects/observations and nested repositories retain the same guarded production graph and the production policy predicate. No runtime test hook, raw business fallback or accepted13.2 change is permitted.

The handler starts one request deadline at entry, then after canonical route/context checks calls synchronous `createOperations(guard)` exactly once. Construction executes no SQL. The same request guard used around handler awaits must permanently reject after deadline, cancellation, wall-timer expiry or final completion; a static injected monotonic clock cannot defeat the timer fence. There is no direct unguarded business-dependency fallback, shared mutable guard, private-dependency inspection or accepted-source change.

The production factory constructs the real repositories/coordinators per request over one guarded D1 adapter in `site-bridge-factory.ts`. All nested business dependencies—including internally constructed research/execution/import/publication/audit/quota/budget/expiry repositories—use that same guarded DB. Every D1 operation checks the guard immediately before delegation and after its awaited result. Statement `bind` preserves the guard on each returned statement; execution methods `first/all/run/raw` are guarded as supported. Native `batch` validates every statement belongs to that same request adapter and unwraps only those owned statements before one guarded atomic delegation. Raw/cross-request statements and unguarded methods/handles must not escape; unused `exec/withSession/dump` may fail closed. Already-dispatched statements/batches may finish ambiguously, including the entire native atomic batch, but a late acknowledgement cannot start any subsequent read, write, marker or downstream effect. Pure computation need not be interrupted. Different requests retain independent guards. Existing guarded nonce verification and executor transport AbortSignal/deadline behavior remain unchanged.

`app/api/internal/research-bridge/[operation]/route.ts` exports dynamic force-dynamic and POST, wiring `env` from cloudflare:workers and `getD1` exactly as existing factories. Routing only accepts the complete canonical path list; dynamic route is not arbitrary operation dispatch. Safe 404/405 for anything else. Bounded body read and authentication precede business mutations; successful verification can claim a nonce before DTO rejection. After syntax parsing, perform local read-only owner/job lookup and the corresponding async full-job matcher, then recheck handler deadline before any business effect. A receiver/operation mismatch fails before auth/nonce handling. Sign bounded error responses where configuration and routing context are valid; otherwise return generic no-store401/503 without detail. Never reinterpret unsigned failure as valid domain status on the client.

`newExecutionAllowed` is true only when `readResearchPolicyConfiguration(environment)` selects remote and policy is enabled under existing validation. Recovery and callback factory creation depend only on valid connection/DB, not new-call gating and not OpenRouter key. Site begin uses local lookup, then actual `begin.begin({...identity,newExecutionAllowed:newExecutionAllowed()})`; repeated begin retains original grant per accepted module even after closure. The executor's own acceptance gate is separate.

Complete: authenticate notice→syntax parse→lookup owner/full job locally→await matchReceiptNotice(notice,execution.job)→construct original grant with `parseBridgeBeginGrant` from stored protocol/jobId/requestHash/beganAt/executionExpiresAt→`executor.result(execution.job,notice,originalGrant,{signal})`→call `imports.complete(identity,receipt)`→send only job/hash/accounting acknowledgement. result client itself matches original grant and recomputes receipt hash within its cumulative transport deadline, so the handler performs no extra post-transport hashing. Metadata: authenticate/syntax parse→lookup locally→await matchBridgeMetadata(metadata,execution.job) and compare non-null grant to Site frozen original grant→`imports.reconcileMetadata(identity,metadata)`→same bounded acknowledgement. accepted similarly awaits matchAcceptedProof(input,execution.job) before recordAcceptance. Do not return run/owner/package/body. A metadata acknowledgement receiptHash must equal the prepared metadata receiptHash. Callback failure never starts a Provider.

Maintenance executes at most10 visited candidates and4500ms monotonic work, starting no operation without enough remaining deadline. Persist progress before each item. Prebegin uses accepted conservative reconciliation. For each begun candidate, read its local import journal/recovery/budget; finish an existing journal through the shared importer first. **Before any optional executor status/close/result HTTP request, SQL-expired jobs without a real journal must run `expiry.reconcile(identity,null)` to terminalize/resume original unknown accounting locally. Existing recovery stages likewise resume first.** The repository's SQL-time predicate remains authoritative: a stale app observation cannot prematurely expire an unexpired job. Reread the resulting local recovery/budget; if local stages remain incomplete or the remaining deadline is exhausted, finish this visit without remote work and let the next durable scan resume. No remote response or error is a prerequisite for local expiry, and no catch/finally starts local business work after the handler deadline.

The readonly observation contract is explicit: for a begun candidate without a real journal, attempt `expiry.reconcile(identity,null)` without treating application wall time as expiry authority; SQL decides whether any recovery exists. Then read `recovery.read(identity)` and `budget.readReservation(identity.ownerId,execution.budgetReservationId)`, with deadline checks before and after each await. A successful void reconciliation does not establish expiry. Optional remote work requires a strict original recovery matching the locally read execution/run identity and execution version, `quotaDone && budgetDone`, `reason='expired-unknown'`, `unsent=null`, and an original reservation matching owner/id/run/request/maximum/expiry with `status='conservative-hold'` and `settledMicros=0`. Absent recovery, incomplete stages, other reasons, settled/released budget, mismatches or failed reads stop this visit's optional remote portion; durable scans retain discovery of unfinished work. These reads never authorize release, and require no changes to accepted13.2 interfaces or schema.

Only after this local progress, and while time remains, a persistent expired-unknown/conservative-held item calls `executor.status(execution.job,{signal})`, including when both accounting markers are1. Real result metadata is imported (body fetch uses `executor.result(execution.job,notice,originalGrant,{signal})`); a matched closed proof is passed to expiry, and matched unclaimed status permits `executor.close(execution.job,{signal})`. Before applying a returned proof, check the remaining deadline, relookup the original execution and validate nullable/non-null grant rules. `expiry.reconcile(identity,proof)` can then upgrade the existing sidecar without touching terminal run/execution bytes. If close committed but its response or local application exceeds the deadline, do not perform a late upgrade; next pass observes the same irreversible closed proof. Transient error, full-deadline timeout or signed404 leaves already durable local unknown accounting and recheck eligibility intact; claimed without receipt stays held and revisited. A404 never yields proof. All async matches are deadline guarded; transport's inner5s bound is further cut by the outer request/category signal. Started D1 writes may finish ambiguously after cancellation, but no subsequent business operation starts. For this implementation outbox returns **at most one actual job per call**, within protocol upper bound10/16384, without hidden admission/begin. Each persisted Site cursor advance corresponds to one attempted pickup, avoiding skipped page tails when a slow first job exhausts the Cron budget. End-of-scan is one bounded empty page; multiple calls may fill remaining10 visits within8s.

- [x] RED route tests reject wrong HMAC/path/owner-field/session-only/body limit before **business** effects; a valid signature followed by invalid DTO may create exactly the expected nonce row and no run/job/quota/budget/import/Provider effect. Test receiver/operation mismatch before signing/fetch and delayed verification before nonce claim. Response tampering fails client verification; closed gates permit accepted/complete/metadata/maintenance and block outbox/new begin; callback/repeated metadata converge to one native audit/quota/budget/package effect.

```ts
expect(await f.research.getRun('owner-b', f.identity.runId)).toBeNull();
expect(await f.siteClient.complete(f.execution.job, notice)).toMatchObject({ receiptHash: notice.receiptHash });
expect(await f.siteClient.complete(f.execution.job, notice))
  .toEqual(await f.siteClient.metadata(f.execution.job, metadata));
expect(f.siteDb.database.prepare("SELECT count(*) n FROM quota_ledger WHERE entry_kind<>'reserved'").get())
  .toEqual({ n: 1 });
expect(f.syntheticProviderCalls()).toBe(0); // preloaded receipt route test
```

Within the same five-file scope, add actual SQLite/synthetic-transport regression proof for an ahead application clock with SQL-unexpired work at mutation (no recovery, original active/reserved state retained, executor status/close fetch0); completed unknown markers with matching held budget remaining eligible; incomplete/released/settled observations skipping optional remote close; and deadline exhaustion during an observation preventing later business/remote work. Preserve all existing callback, authentication and shared-import assertions.

Add native tests through actual production construction with synthetic environment and transport: delay an internal expiry/import/admission repository read until after the deadline, then release it and instrument actual D1 starts to prove no subsequent business operation or Provider/fetch; delay the acknowledgement of an already committed native transaction past the deadline, permit its committed rows but prove no later accounting/publication/mark step and exactly-once recovery from a fresh request; run concurrent request contexts so expiring one cannot fence the other or authorize its own late continuation; and prove bound-statement/batch guard preservation, native atomicity and rejection of raw/cross-request statements. Real coordinators and actual DB-operation-start observations are required; outer call counters or fake coordinators do not establish this boundary.

SPEC regression additions: delay selector acknowledgement, then separately advance SQL time to the exact queue expiry and close the actual policy gate; each outbox response is empty, the cursor advances once, begin remains absent and executor/Provider calls remain zero. Reproduce the delayed second journal read through the forced helper and require zero actual D1 starts after its deadline.

Identify the actual post-reconciliation recovery/budget observation with native SQL tracing and barriers; at entry prove real reconciliation already completed its original unknown accounting. A test-only delegating phase wrapper may observe successful real coordinator completion to arm the native barrier, but may not replace its outcome or nested dependencies. For incomplete recovery, a concurrent real expiry repository upgrades a matching closed proof, producing native executor-unsent/quota_done1/budget_done0 before the final read; the handler skips optional work without a failed visit. For settled/released observations, a separate real budget repository settles/releases the original hold before the final budget read; require visited1/failed0 and no optional HTTP. Preserve earlier coordinator-failure containment tests separately. Delay the actual final recovery-read acknowledgement past4500ms and require no follow-up D1/HTTP, while an independent request retains its own guard. No synthetic marker projection, SQL rollback or trigger bypass supplies this evidence.

The session-only negative is a canonical private POST with a plausible session cookie and no valid service HMAC; require401, zero nonce claims, unchanged full native business state and zero executor/Provider effects. Existing path/origin/method/body negatives likewise assert full business snapshots and effect counters.

The helper must expose the named clients, real SQLite databases, fixed identities and counted synthetic fetch function; no `SiteImportCoordinator` mock. Run `npm run test:unit -- tests/api/research-bridge-routes.test.ts tests/server/site-expiry.test.ts tests/server/site-import.test.ts tests/server/research-executor-configuration.test.ts tests/api/research-routes.test.ts`. SPEC then independent QUALITY.

## Subtask 13.4 — executor HTTP, same-ID bootstrap and one paid step

**Files:** executor environment/runtime/bootstrap/execute-job/workflow-policy/workflow/http-routes/index files and `tests/server/research-executor-runtime.test.ts`; additionally, narrowly Modify `app/server/research/executor/http-transport.ts` and `app/server/http/research-bridge-routes.ts` only for the unavailable error classification below. This is11source paths (nine original new paths plus two accepted source corrections). Snapshot the two accepted files first; all other477 prior protected sources remain unchanged. Do not modify shared auth/nonce stores, codecs, protocol or signatures.

Define `ExecutorEnvironment` as ResearchBridgeEnvironment plus `EXECUTOR_DB:D1Database`, `EXECUTOR_RECEIPTS:R2Bucket`, `RESEARCH_WORKFLOW:Workflow<{jobId:string}>`, `ARC_RESEARCH_EXECUTOR_ACCEPT_NEW?:string`, `OPENROUTER_API_KEY?:string`. Runtime only reads these injected values. Acceptance is exactly string `true`; blank/unknown closed. Fixed provider config is independent of this gate for an already authorized job. Workflow payload contains only UUID and event.instanceId must equal it. Runtime constructors expose capabilities separately so Cron/router cannot accidentally call paid execution.

`ensureWorkflow(job, {jobs,workflow,site,wallNow}):Promise<AcceptedProof>`: jobs.accept first; create `{id:job.jobId,params:{jobId:job.jobId}}`; on creation acknowledgement loss/error, `workflow.get(job.jobId)` and `instance.status()` on the same ID. Never restart/terminate/new ID. A proved existing instance (including errored/complete/terminated) records `recordWorkflowAccepted(job,job.jobId,wallNow())`; unknown status/get error is temporary and leaves original job pending for a later same-ID check. Return original stored workflowAcceptedAt on replay. Only then call `site.accepted(job,proof)`; if its ack is lost, retry exact proof with the same complete job later. Submission returns202 only with durable executor Workflow proof; Site must independently persist it before public backgroundAccepted can ever become true.

The production HTTP runtime supplies request-scoped guarded D1 and R2 capabilities: check the same request deadline/abort before each nested operation and after its awaited result. An internal read finishing after expiry must not start a new write. An already-dispatched write may have committed and remains recoverable uncertainty. Guards must be isolated across concurrent requests. An internal `forRequest(guard,signal)` factory is permitted while preserving `createExecutorBridgeHandler(createHttpRuntime(env))`; Site acceptance receives that same outer signal. Accepted stores remain unchanged.

Classify only `BridgeAuthError` with code `unavailable` as infrastructure failure: both receiver handlers use bounded signed503/temporary within their remaining deadline, and the client transport maps its local unavailable error to temporary. Failed nonce persistence never authorizes business operations or success decoding, including acknowledgement loss after nonce commit. Signing a generic error grants no business authority and does not require a D1 nonce write. Preserve rejecting behavior for unauthorized/replay/expired/invalid-message/invalid-config. If signing/config/deadline itself fails, retain bounded fail-closed fallback; an unsigned or tampered response never becomes a trusted temporary response from HTTP status alone. No other transport/auth behavior changes.

Runtime route handler verifies signed request first. New submit accepts only when gate true, but existing exact job may bootstrap/query while gate false; use get + hash equality before gate decision. submit never waits for Provider. status calls stores.get/recover; result calls recover and hash matches notice before encoding body; acknowledge calls store.acknowledge. close calls jobs.closeUnclaimed(stored.job,wallNow()), returning proof only for persisted closed and original grant. Unknown job cannot be closed or claimed. Existing stores remain authority.

`workflow-policy.ts` exports the actual constant used by production and smoke:

```ts
export const PAID_STEP_CONFIG = Object.freeze({
  retries: { limit: 0, delay: '1 second' as const },
  timeout: '21 minutes' as const,
});
export type ExecutionReference = Readonly<{
  jobId: string; state:'recorded'|'already-claimed'|'closed'|'unavailable'; receiptHash:string|null;
}>;
```

`runResearchJob(jobId, dependencies):Promise<ExecutionReference>` dependencies are `{jobs,receipts,site,provider:Pick<ResearchProvider,'research'>,wallNow,monoNow}`. Validate stored job before beginning. Closed/claimed never calls begin/provider; claimed may recover receipt. Obtain begin with one monotonic start **before** calling `site.begin(stored.job)`; that client authenticates and matches reply/job inside its5s request deadline. Then budget check, record original grant, check again, claimDispatch, check budget again immediately before research and count all elapsed time from the original start. Do not repeat an async reply/job hash outside transport. Claim false or throw → never fetch, never reread claimed as permission. Budget failure before claim closes unclaimed; after acknowledged claim it is uncertain, produces no invented Provider receipt and leaves conservative claim. The strict post-claim budget check protects complete20minute policy even under slow D1.

```ts
const beginStarted = monoNow();
const reply = await site.begin(stored.job); // matching/hash is inside transport deadline
assertBridgeProviderBudget(reply, monoNow() - beginStarted);
await jobs.recordBegin(stored.job, reply.grant);
assertBridgeProviderBudget(reply, monoNow() - beginStarted);
const claimed = await jobs.claimDispatch(stored.job, reply.grant, wallNow());
if (!claimed) return { jobId, state: 'already-claimed', receiptHash: null };
assertBridgeProviderBudget(reply, monoNow() - beginStarted);
// There must be no other awaited local work between the final check and research.
const dispatchedAt = monoNow();
const result = await provider.research({ role: stored.job.role, locale: stored.job.locale });
const receipt = parseBridgeProviderReceipt({ grant: reply.grant, producedAt: wallNow(),
  latencyMs: Math.ceil(monoNow()-dispatchedAt), outcome: { kind:'response',
    content:result.content,annotations:result.annotations,actualModel:result.actualModel,usage:result.usage } });
const saved = await receipts.save(receipt, wallNow());
return { jobId, state:'recorded', receiptHash:saved.metadata.receiptHash };
```

Implement error boundary narrowly around the **actual research call**: ResearchProviderError becomes bounded outcome preserving code/retryable/charged/model/usage; unexpected thrown provider transport maps to unavailable/retryablefalse/chargedunknown. Store-save, begin, dispatch, budget and later workflow interruption are not Provider outcomes and cannot fabricate provider-failure receipts. Saving acknowledgement loss may return unavailable; independent Cron recovery remains sufficient. No automatic retry of research even if error.retryable=true. No repair method exposed to this orchestrator.

Production provider construction:

```ts
new OpenRouterResearchProvider({ OPENROUTER_API_KEY: environment.OPENROUTER_API_KEY,
  ARC_AI_MODEL_RESEARCH:'moonshotai/kimi-k3', researchProfile:'kimi-low-output32k-v3',
  researchTimeoutMs:1_200_000 }, { fetch: providerFetch });
```

`ResearchWorkflow extends WorkflowEntrypoint<ExecutorEnvironment,{jobId:string}>` calls `step.do('research-once',PAID_STEP_CONFIG,()=>runResearchJob(...))`. It returns the <=4096-byte ExecutionReference, never receipt/content. In13.4, after step success, read original stored job and call `site.complete(stored.job,{jobId,requestHash:stored.requestHash,receiptHash})` once with the returned non-null hash, bounded by a5s outer signal; swallow only sanitized delivery error, retaining durable receipt for Cron. In13.5 replace that post-step call with `deliverReceipt`; paid-step code does not change. Failure never re-enters paid step. If interruption occurs after R2 write or D1 result fixation but before step return, Workflow cannot be the sole recovery mechanism.

In13.4, `runtime.ts` exports `createExecutionRuntime(environment,overrides?)` and `createHttpRuntime(environment,overrides?)`. Overrides are `{bridgeFetch?:typeof fetch;providerFetch?:typeof fetch;wallNow?:()=>number;monoNow?:()=>number}` and are test-only dependency injection, never request-controlled. Execution runtime returns exactly the dependencies of `runResearchJob`; HTTP runtime returns `{jobs,receipts,site,ensureWorkflow,acceptNew,connection,nonces,wallNow,monoNow}`. `createExecutorBridgeHandler(createHttpRuntime(env))` returns the request handler. Shared runtime constructs both stores with EXECUTOR_DB and only EXECUTOR_RECEIPTS, never Site DB. In13.4, `index.ts` exports production ResearchWorkflow and default fetch; scheduled is added and connected in13.5. In13.5, add `createMaintenanceRuntime(environment,overrides?)` returning exactly the actual13.5 scheduler dependencies; no stub maintenance runtime, premature imports or dummy scheduled success is required in13.4. Every runtime that cannot validate connection/bindings fails closed with a bounded unavailable response; no fallback to the public synchronous service.

- [x] RED with two fresh orchestrators sharing real SQLite: one acknowledged CAS winner→one actual OpenRouter adapter invocation using injected synthetic HTTP; one repair spy→0; same job/different hash conflicts. Replay/restart-like second invocation remains Provider1 independently of fake Workflow state. Lost claim ack→Provider0. Lost create ack→same instance query and Site acceptance row; lost begin ack→original grant and reduced remaining time. Advance monotonic time across begin+D1 to leave <1230000 ms→Provider0, no new lease.
- [x] Inject failures after claim before fetch, fetch before receipt persistence, R2 put and result CAS; assert the exact durable row/result existence, safe uncertain state and no second request. Use real OpenRouter request JSON to assert fixed model/reasoning/token/search/privacy policy rather than mock provider parameters. Also use the real executor/Site factories, real bridge clients and native nonce stores to reproduce transient failures before commit and after commit/lost acknowledgement, including local response nonce verification. Assert temporary classification, zero business operations, correct nonce deltas, no success decoding after failed nonce verification, and unchanged tampered-HMAC/replay rejection. Keep those tests in the runtime test file.
- [x] Run `npm run test:unit -- tests/server/research-executor-runtime.test.ts tests/server/research-executor-job-store.test.ts tests/server/research-executor-receipt-store.test.ts tests/server/research-executor-begin.test.ts tests/server/research-bridge-transport.test.ts tests/api/research-bridge-routes.test.ts`; lint all11scope files and include all463 current type inputs with unchanged options; SPEC then different QUALITY. Preserve the original nine-path/479protected evidence as historical records.

## Subtask 13.5 — persistent autonomous maintenance and delivery

**Files:** executor0003 migration, maintenance-store/delivery/maintenance files; narrowly Modify `runtime.ts` to add the actual maintenance runtime, `workflow.ts` only to replace post-paid-step delivery with `deliverReceipt`, and `index.ts` to add scheduled composition; `tests/server/research-executor-maintenance.test.ts`. The accepted paid step, PAID_STEP_CONFIG, provider settings, original-grant budget checks and dispatch authority remain unchanged. Additionally, narrowly adapt `tests/server/research-executor-runtime.test.ts` only to apply the new0003 migration in its local executor fixture and to give its existing post-step delivery test a real original claimed job plus persisted matching receipt and a consistent local wall clock. Keep all existing tests and assertions; strengthen that delivery case with durable acknowledgement/ledger assertions as appropriate. Do not rewrite the paid-step mock/config/reference assertions, unrelated cases, shared fixtures or production authority. The old13.4 test only seeded an unclaimed job and a mocked recorded reference because delivery was previously a direct notification; the13.5 persistent delivery must instead use real stored receipt authority. This is9source paths (five new and four narrowly modified), with484 other prior protected sources and467 current type inputs. Capture the accepted test hash before editing; this fixture correction does not reopen13.4 acceptance or allow fallback notification without a receipt.

Use separate tables to avoid changing accepted job/result column decoders:

```sql
CREATE TABLE research_executor_delivery (
  job_id TEXT PRIMARY KEY REFERENCES research_executor_jobs(job_id),
  receipt_hash TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  stopped_code TEXT CHECK(stopped_code IN ('authentication','protocol','conflict')),
  completed_at INTEGER,
  version INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE research_executor_acceptance_delivery (
  job_id TEXT PRIMARY KEY REFERENCES research_executor_jobs(job_id),
  acknowledged_at INTEGER,
  next_attempt_at INTEGER NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  stopped_code TEXT CHECK(stopped_code IN ('authentication','protocol','conflict')),
  version INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE research_executor_maintenance_cursors (
  category TEXT PRIMARY KEY CHECK(category IN ('site','bootstrap','results')),
  after_accepted_at INTEGER,
  after_job_id TEXT,
  version INTEGER NOT NULL DEFAULT 0,
  pickup_turn INTEGER NOT NULL DEFAULT 0 CHECK(pickup_turn IN (0,1)),
  CHECK((after_accepted_at IS NULL)=(after_job_id IS NULL))
);
CREATE TABLE research_executor_maintenance_schedule (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  next_category INTEGER NOT NULL CHECK(next_category BETWEEN 0 AND 2),
  generation INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0
);
INSERT INTO research_executor_maintenance_cursors(category) VALUES('site'),('bootstrap'),('results');
INSERT INTO research_executor_maintenance_schedule(singleton,next_category) VALUES(1,0);
CREATE INDEX research_executor_job_scan_idx ON research_executor_jobs(accepted_at,job_id);
CREATE INDEX research_executor_delivery_due_idx ON research_executor_delivery(next_attempt_at,job_id);
```

Add exact hash/UUID/integer bounds/immutable identity and monotonically increasing version checks to these new tables. Delivery row receiptHash can never change; job identity and dispatch evidence never deleted. `attempt_count` saturates at31 for safe arithmetic; nextAttemptAt bounds are checked before addition. No body in these tables. Migration tests assert existing nonces/jobs/results bytes unchanged.

`ExecutorMaintenanceStore(db)` new public methods:

```ts
acquire(now:number):Promise<{generation:number;first:0|1|2}|null>;
next(category:'bootstrap'|'results',generation:number):Promise<string|null>;
recordAcceptance(jobId:string,observedAt:number):Promise<void>;
readAcceptanceDelivery(jobId:string):Promise<{acknowledgedAt:number|null;nextAttemptAt:number;stoppedCode:string|null}>;
ensureAcceptance(jobId:string,now:number):Promise<void>;
takePickupTurn(generation:number):Promise<'existing'|'pickup'>;
scheduleReceipt(metadata:BridgeReceiptMetadata):Promise<void>;
readDelivery(jobId:string):Promise<{receiptHash:string;attemptCount:number;nextAttemptAt:number;
  stoppedCode:'authentication'|'protocol'|'conflict'|null;completedAt:number|null;version:number}|null>;
defer(jobId:string,receiptHash:string,expectedVersion:number,now:number,
  failure:'temporary'|'authentication'|'protocol'|'conflict'):Promise<void>;
complete(jobId:string,receiptHash:string,expectedVersion:number,now:number):Promise<void>;
deferAcceptance(jobId:string,now:number,failure:'temporary'|'authentication'|'protocol'|'conflict'):Promise<void>;
```

Acquire is a single SQL CAS `UPDATE research_executor_maintenance_schedule SET generation=generation+1,next_category=(next_category+1)%3,lease_until=?1+30000 WHERE singleton=1 AND lease_until<=?1 AND generation<9007199254740991 AND ?1<=9007199254710991 RETURNING generation,next_category`; return first as `(returned.next_category+2)%3`. Unknown acquire ack means perform no work. Bind an observed SQL timestamp; also compare the actual SQL clock to the observation in the final query so stale callers cannot extend an expired lease. Do not release lease early; next minute can acquire. Generation and unexpired SQL lease fence cursor/rotation mutations; delivery markers use their own version/hash CAS and can also be written by immediate Workflow delivery without owning a Cron lease. Deadline checks prevent late continuation starting follow-up work. `ensureAcceptance` inserts its sidecar once with nextAttemptAt=now before an acceptance delivery; identity already exists in jobs. `takePickupTurn` atomically toggles bootstrap.pickup_turn under generation/lease/version CAS and returns the prior turn. `next` keyset scans/wraps fairly, persists cursor before processing malformed or failing jobs, retains no-provider authority. Results scan includes every claimed job, including jobs **without** a results row (R2 recovery gap), any results awaiting acknowledgement or cleanup, and retained metadata requiring accounting. Bootstrap scans accepted jobs with missing workflow acceptance or missing Site acceptance ack; includes existing jobs even while new gate closed.

`deliverReceipt(jobId,{jobs,receipts,store,site,wallNow,signal}):Promise<void>` reads original complete job through jobs.get(jobId), recovers/fixes receipt, idempotently schedules exact hash; if stopped/completed/not-yet-due, no callback. Missing/mismatched original job fails closed. First next_attempt_at=metadata.producedAt makes first attempt immediate. Before body deadline, `site.complete(stored.job,notice,{signal})` makes Site fetch fixed body; if body missing/removed or producedAt+86400000 passed, `site.metadata(stored.job,metadata,{signal})` only. All async input/output matching remains inside each client's cumulative transport deadline. Temporary failure increments count and sets `now + min(300000,1000*2^min(oldCount,9))`; attempt1→1s, attempt2→2s, ..., max5min. Permanent verified401/403/auth/protocol/hash conflict sets stopped_code; unknown HTTP classes are protocol errors except verified5xx/temporary. Persist failure before returning. Manual operational re-enable of same receipt is deferred to Task15 runbook, not a public route/new task.

On exact Site acknowledgement, first `receipts.acknowledge(jobId,hash,now)`, then mark delivery complete; lost acknowledgement/write ack can repeat exact import/ack without duplicating fees. Hash mismatch stops. Cleanup runs even when callback permanently stopped, using existing conditional tombstone after metadata fixation; at24h no further body publication attempts. Metadata-only retries continue beyond24h until completed/stopped, with conservative fee identity intact. Ack of accounting='held' can complete the exact recorded unknown outcome; it does not manufacture known fees. Existing receipt metadata is immutable.

`runExecutorMaintenance({jobs,receipts,store,site,bootstrap,delivery,acceptNew,wallNow,monoNow}):Promise<{visited:[number,number,number]}>` has one30s deadline and three **8s category subbudgets**, leaving6s for scheduling overhead. `bootstrap(job,signal)` delegates to ensureWorkflow; `delivery(jobId,signal)` delegates to deliverReceipt. Persist first-category rotation before work. Each category visits at most10 items; concurrency at most2 and every outbound request <=min(5000,categoryRemaining,wholeRemaining). Do not launch a third/next item when remaining budget is exhausted; in-flight cancellation cannot start new side effects. Cursor advances only for launched/visited items. Malformed/failed items count toward10. Site category calls Site maintenance once (its max10); bootstrap category uses `takePickupTurn` to alternate existing bootstrap and outbox pickup, total10, to prevent existing failures starving pickup. Existing-job processing calls ensureAcceptance then retries the exact original proof according to persisted nextAttemptAt/stoppedCode; a stopped acceptance does not stop results recovery. When closed only existing bootstrap runs, no new site.outbox. Results category performs recover→delivery→cleanup for each launched item, prioritizing progress through keyset rather than restarting at first row. If budget permits only recover, next cycle continues same durable state.

Site/outbox scans have their own Site cursors; executor site cursor has no owner data. Cursor advancement acknowledges an attempt, not success: safe at-least-once replay happens after wrap. Progress persists across process restarts. Permanent delivery errors stop that delivery but cannot stop cleanup or cursor rotation. Short recurring scheduled handler is `scheduled(_event,env,ctx){ctx.waitUntil(runExecutorMaintenance(createMaintenanceRuntime(env)));}` with `*/1 * * * *`; it never invokes runResearchJob/Provider.

- [x] RED native ledger tests: closed acceptance gate, no browser and paid step retries disabled; cut after R2-write before D1 fixation and after D1-CAS before step return. Next independent maintenance fixes/imports same hash, Provider counter stays1. Recreate runtime/store from the same persisted DB/R2 to prove no in-memory cursor/receipt dependency.
- [x] RED uncertainty-liveness test: completed expired-unknown quota/budget markers plus conservative-held original budget remain in Site maintenance's persistent selector. First status or close temporary failure, then recreate both runtimes and restore original unclaimed executor; later Cron obtains same-job signed close proof, releases once and preserves terminalHash/execution.version/failed run bytes with Provider0. Repeat with claimed/no-receipt: held, eligible on later passes, no forged proof. This is the exact native restart chain in13.7, not a mocked coordinator-only assertion.
- [x] Seed >20 items per category, permanent malformed first row, temporary timeout rows, closed/expired pending Site admissions and uncertain post-begin rows. At most10/category/30s overall/2 simultaneous transport; repeated invocations advance to tail, rotation persists after recreation, categories still get turns when one consumes8s. Test bootstrap/pickup alternating turn and disabled pickup.
- [x] Test callback retries1s→300s, nextAttempt persistence/reopen, permanent auth/conflict stop, cancelled request and lost Site ack, cleanup at24h despite failed callback, retained fees after tombstone and impossible late resurrection. Assert original bucket IDs and actual amounts, one final quota, one immutable receipt hash, conditional R2 tombstone.
- [x] Run `npm run test:unit -- tests/server/research-executor-maintenance.test.ts tests/server/research-executor-runtime.test.ts tests/server/research-executor-receipt-store.test.ts tests/server/site-expiry.test.ts tests/server/site-admission.test.ts`; lint all8 TypeScript scope files, verify the ninth SQL migration separately, and retain467 current type inputs with unchanged options; fresh SPEC and different QUALITY.

## Subtask 13.6 — independent local build and actual Workerd zero-retry smoke

**Files:** independent config/scripts/runtime fixture paths above. No dependency or root Site build config change. Do not modify global Vitest cloudflare mock to pretend it supports Workflows.

**Native-runtime compatibility amendment (2026-09-20):** Actual installed Workerd rejects Request redirect:error before outbound transport and adds a nonenumerable Symbol.dispose function to step.do result objects. Root reproduced both failures with synthetic-only probes. Subtask13.6 additionally owns narrow corrections in `app/server/research/executor/http-transport.ts` and `worker/research-executor/workflow.ts`, with regression tests in the existing `tests/server/research-bridge-transport.test.ts` and `tests/server/research-executor-runtime.test.ts`. Use native-supported manual redirect handling and reject redirects without following Location; normalize only the exact bounded primitive execution reference while handling the verified platform disposal metadata, rejecting other symbols/accessors/extra fields. Preserve job/hash/size validation, signatures/deadlines, paid policy and retries. Capture RED before each fix, run both owning test files plus affected executor maintenance/receipt/expiry/admission regressions, actual uninstrumented Workerd smoke, isolated/full-current types, explicit seven-file lint and sequential independent SPEC/QUALITY over all nine scope files. Original493-source baseline is retained; four existing source snapshots are in the versioned compatibility amendment and remaining489 stay protected. This is a required local compatibility fix within existing authorization, not a new paid/network/deployment permission.

**Native fetch receiver addendum (2026-09-20):** A real Workerd synthetic-only probe additionally proves object-method invocation of native fetch throws Illegal invocation; free-function invocation succeeds. Detach shared BridgeTransport fetch before calling it. Extend13.6 scope only to `app/server/research/openrouter-provider.ts` for the same detachment plus native-supported manual mode, preserving its existing redirected/all3xx rejection, cancellation, diagnostics, billing and zero-retry behavior. Include existing `tests/server/openrouter-provider.test.ts`, `tests/server/openrouter-transport-observation.test.ts`, and `tests/server/openrouter-response-compatibility.test.ts`; add actual receiver/redirect regressions and update only the shared POST redirect expectations. The separate key-preflight GET remains redirect:error. All model/request/schema/budget/timeout/privacy logic remains unchanged. Total13scope files/eight existing snapshots/five original additions,485 protected,468 type inputs,11 explicit lint files. Regression acceptance now includes the six executor/Site files above plus seven existing Provider, response/transport and diagnostic suites (openrouter-provider, openrouter-transport-observation, openrouter-response-preflight, openrouter-response-format, openrouter-response-compatibility, provider-result-diagnostic, provider-failure-diagnostic). Capture Provider-specific RED before its edit. No credentials, real request, dependency, resource or deployment scope change.

**Local caller compatibility addendum (2026-09-20):** Actual Provider regression exposed the Node validation guard rejecting shared POSTmanual. Preserve the standalone minimal-probe POSTerror caller by allowing both explicit non-following error/manual modes only for fixed Research POST, while key GET still requires error; retain all preflight, credential, endpoint, count and redirect-response rejection rules. Add only `scripts/live-research/transport.ts` and five existing test files: live-research-validation, kimi-local-validation, live-quality-diagnostic, live-response-preflight, research-policy-migration-integration (all tests/server/*.test.ts). Tests change only actual shared-adapter POST expectations and add guard regressions; GET, direct POSTerror fixtures, minimal/account/native transports and diagnostic policies remain unchanged. Latest scope totals19 files/14 existing snapshots/5 original new,479 protected/468 current type inputs/17 lint files. Adopt exact34 affected suites from E/task13-subtask6-required-regressions-r4.json for final regression, preserving all preceding failure reports. No new paid call or credentials: all validation paths remain synthetic-only in this task.

`scripts/build-research-executor.mjs` uses installed `esbuild.build` with entry `worker/research-executor/index.ts`, bundletrue/platformneutral/formatESM/targetes2022/external `cloudflare:*`, `metafile:true`, output `E/task13-build/executor/index.js`, no source maps containing secrets. Assert bundle inputs exclude Site HTTP/session/OAuth/cloud/proof/planning/publication and local launcher modules. Shared provider/schema/codecs are expected. Script writes metafile and bounded input list as evidence; no env file reads, secrets or remote resolver. `worker/research-executor/tsconfig.json` extends root, disables incremental, includes executor + transitive shared files, same strict settings and Cloudflare installed types, no invented Workflow overloads.

Local Wrangler config has `name:'arc-research-executor-local'`, mainindex.ts, compatibility_date2026-05-15, workers_devfalse, preview_urlsfalse, workflows binding RESEARCH_WORKFLOW/namearc-research-local/class_nameResearchWorkflow, crons everyminute. Define local D1/R2 binding names only through Miniflare test options. Do not invent production database_id/bucket resource values or run wrangler deploy/d1 remote. Build with local esbuild; this config documents local entry/class wiring for later Task15 exact configuration.

`scripts/test-research-workflow-runtime.mjs` imports installed Miniflare and esbuild, bundles test fixture (real production `PAID_STEP_CONFIG` and production Workflow export), uses `cf:false`, moduletrue, no external network and an outboundService that throws on any unrecognized URL. Per existing Miniflare type, configure:

```js
const mf = new Miniflare({ modules:true, scriptPath:bundlePath,
  compatibilityDate:'2026-05-15', cf:false,
  d1Databases:['EXECUTOR_DB'], r2Buckets:['EXECUTOR_RECEIPTS'],
  workflows:{ RESEARCH_WORKFLOW:{name:'arc-research-local',className:'ResearchWorkflow'},
    ZERO_RETRY_PROBE:{name:'arc-zero-retry-probe',className:'ZeroRetryProbe'} },
  outboundService: async () => { throw new Error('EXTERNAL_NETWORK_DISABLED'); },
});
```

Root's isolated platform spike has already passed with counter1/statuserrored/outbound0 (`E/task13-workflow-zero-retry-platform-probe.mjs` and `.json`, chunk02d7fe). Its10second timeout is probe-only and does not replace the following production-configuration acceptance.

Fixture imports/exports production ResearchWorkflow and defines **test-only** ZeroRetryProbe; its one step uses production `PAID_STEP_CONFIG`, atomically increments D1 test_counter then throws `Error('injected-after-effect')`. Fixture fetch exposes local `/probe/create` and `/probe/status` only to test runner. Create one probe id, await errored by local status polling (bounded60s), wait another1500ms, assert counter exactly1; get same id, verify still1. Read actual D1 via `mf.getD1Database('EXECUTOR_DB')`; no mocked `step.do`. This proves actual21minute configured step accepts limit0 and does not retry the failure, not that21minutes of wallclock elapsed.

The same script must then execute the **real production ResearchWorkflow**, not merely export it. Seed the real executor migrations and one exact job; bind generated synthetic bridge credentials and a synthetic Provider key (never real env reads). Its outboundService routes only fixed synthetic Site begin/accepted/complete paths and fixed OpenRouter origin/path into explicit local handlers; every other request throws and increments an unexpected-network counter. Those synthetic Site handlers use existing `matchBridgeBeginReply`/signing codecs and generate signed responses for the original job/grant; they are test-only and do not claim Site accounting coverage. The OpenRouter interception returns a synthetically encoded response using the existing valid candidate/citations and counts actual adapter requests. Create/get one production instance under the original UUID, wait for complete, assert real D1 dispatch_state='claimed', one immutable results row, real R2 receipt, tiny Workflow output, Provider transport count1 and repair0. Repeat same-ID create/get and verify count1; re-create runtime readers over persisted DB/R2 to inspect original hash. A production21minute config assertion checks the actual imported constant and bundled step invocation.13.4/13.7 add lost-CAS-ack/race coverage; this smoke proves production class→native claim→real adapter with synthetic transport actually executes in Workerd. No fake clock is used to claim a20minute run; long deployed walltime remains Task15.

Tests use D1 schema initialized through `mf.getD1Database`, existing migration text. Keep test routes out of production entry. Dispose Miniflare in finally. All temp paths must be below E/task13-runtime or an exact named tmpdir; verify resolved absolute path before recursive cleanup. No dependency for Cloudflare Vitest introspection is installed or needed.

- [x] RED build/runtime script exits nonzero when expected Workflow export/policy absent and records the failure reason accurately.
- [x] Run `node scripts/build-research-executor.mjs`; `node scripts/test-research-workflow-runtime.mjs`; `node node_modules/typescript/bin/tsc --project worker/research-executor/tsconfig.json --noEmit --incremental false`. Capture Workerd status/counter1/disposal and exact installed versions, zero external network counters. A missing runtime API must be fixed against installed types/source, not bypassed with fake step execution.
- [x] SPEC then different QUALITY review build separation, real runtime evidence and zero-network guard. No claim of account capacity/deployment/longtime wallclock proof.

## Subtask 13.7 — private whole-Task13 acceptance and review

**Files:** `tests/server/research-executor-private-integration.test.ts`, new helper only; necessary narrowly scoped fixes return to owning subtask review. Root updates authoritative final plan/checkpoint only after acceptance.

Create two independently persisted native SQLite databases and a real Miniflare R2 bucket. Assemble actual Site route handler and actual executor HTTP handler with real signing/nonces and a strict in-memory HTTPS router. Both fetch directions call real handlers with complete Request/Response byte streams; nothing reaches a network. The real OpenRouter adapter gets a dedicated counted synthetic HTTP transport using validCandidate/annotations fixtures; all other fetch calls throw. This is private backend integration, not Task14 browser end-to-end.

Helpers expose `siteDb`, `executorDb`, `siteClient`, `executorClient`, `siteHandler`, `executorHandler`, `runWorkflowBody(jobId)`, `runCron()`, `syntheticProviderCalls()`, `repairCalls()`, `setWallNow`, `setMonoNow`, `reopen`, `dispose`. `runWorkflowBody` invokes production paid-body service using actual native stores; actual Workflow runtime retry behavior is separately evidenced13.6. Build the admitted job with existing create/admission fixtures, then signed submit; record real Site acceptance; run independent execution after discarding the submit response/browser-equivalent caller. Synthetic valid result must reach Task12 complete and create the same locally validated package. Raw receipt/body never appears in Site bridge acknowledgements or any public DTO.

Required finite fault matrix (native SQL assertions for each):

| Cut/race | Required result |
| --- | --- |
| partial quota/budget admission; both reservations but no admitted marker | close+reread/release only existing, no promotion/new reservation; next closed-mode maintenance converges. |
| admitted before submit; queue expired before first Cron | outbox skips expired; Site maintenance terminalizes/reconciles; Provider0. |
| executor job insert before Workflow create; create response lost | samejob sameinstance bootstrap; no restart/newID; eventual Site acceptance proof. |
| Site acceptance insert ack lost | exact proof reread/one acceptance row; no false background proof inferred from queued. |
| begin reply loss/localD1 delay | original lease, total RTT deduction, full20minute requirement; Provider0 when insufficient. |
| concurrent dispatch / claim write ack lost | one acknowledged claim winner or no request for uncertain authority; reread claimed never grants. |
| crash after dispatch before fetch | retained unknown; no inferred unsent or automatic reexecution. |
| after R2put / after resultCAS before stepreturn | independent Cron imports samehash with Provider1 despite disabled paid retry. |
| active claimed job with no R2/result | observation only until deadline; no fake terminal receipt excluding future real receipt. |
| expired begun unclaimed, signed404, claimed, corrupt status | only authenticated irrevocable close proof releases; others held; no terminal revival. |
| temporary status/close error, unknown accounting both stages done, restart both runtimes | same original unclaimed job remains discoverable; later signed irreversible close upgrades sidecar/releases once, preserving failed run bytes/terminalHash/execution.version and Provider0; claimed/no-receipt remains held. |
| repeated status/close stalls consume the entire remaining maintenance deadline | local SQL expiry/unknown accounting finishes before optional HTTP; across runtime restart the failed run, completed markers and held original budget remain durable; no post-timeout business work or Provider re-entry; later available closed proof releases once. |
| callback/metadata concurrency and lost Site ack | singleaudit/package/quota/budget effects; immutable hash/latency/dates. |
| real late receipt with cost6250000 | exact cost settled despite failed run; no cap-to-budget, no package/revival. |
| body24h cleanup while delivery failed/stopped | metadata fixed before conditional tombstone; no late put resurrection; fee-only reconciliation persists. |
| poisoned first row, >20backlog/category, 8s category stall | <=10visits/category; persistent cursors/rotation/pickup fairness;30s whole/5s request/2concurrency. |
| both new-call switches closed / no browser | existing bootstrap, import, partial/expiry reconciliation and cleanup still run; new pickup/begin blocked. |
| private message changes owner, URL, identity, hash, status or bytes | auth/schema/identity failure before business mutations; successful auth nonce is separately asserted; no owner crossing/body exposure. |

For positive imported result, reuse `resolveReadyPackage(owner,run)` and actual accepted validator output assertions from Task12. Full activation/planner newreader chain already has Task12 native evidence and remains in final regression; no need to duplicate public frontend behavior now.

- [x] Implement the uncertainty-liveness case with actual persisted Site/executor SQLite files and real signed handlers. Seed original admitted+begun Site execution and matching executor unclaimed job; the same Workflow instance is already durably accepted/errored so maintenance cannot launch a paid step or create another instance. Parameterize initial injected outage at status and at close (status unclaimed succeeds for the latter). Advance both clocks to Site execution expiry; run bounded Cron until the Site category has visited the item, and require reason expired-unknown, quota_done=budget_done=1, original budget conservative-hold, Provider0. Save the complete failed research_runs row, execution.version, terminal_hash, original reservation IDs and bucket rows. Dispose and reopen **both** runtimes/databases, preserving cursor rows and existing immutable job/Workflow identity; remove only the synthetic transport outage. With both new-call switches still closed, later bounded Cron must select the completed unknown sidecar, obtain authenticated close proof (include nullable grant), CAS-upgrade reason executor-unsent, release original reservation once, and leave all saved run/execution/terminal evidence unchanged. One more Cron cycle must make no additional bucket/quota effect. Execute the same chain with an original dispatch-claimed job/no receipt: status cannot produce unsent, budget stays conservative-hold, the item stays eligible, and no Provider is re-entered.

```ts
// The fixture uses the actual production repositories/handlers and reopened
// file-backed SQLite. Only the HTTPS transport outage and clocks are injected.
const recoveryRow = () => f.siteDb.database.prepare(`SELECT reason,quota_done,budget_done,
  terminal_hash FROM research_site_recoveries WHERE job_id=?1`).get(f.identity.jobId);
expect(recoveryRow()).toMatchObject({reason:'expired-unknown',quota_done:1,budget_done:1});
const failedRow = f.siteDb.database.prepare('SELECT * FROM research_runs WHERE id=?1').get(f.identity.runId);
const terminalHash = (recoveryRow() as {terminal_hash:string}).terminal_hash;
const executionVersion = (await f.executions.read(f.identity.ownerId,f.identity.runId))!.version;
await f.reopen(); // closes both DBs/runtimes and rebuilds handlers with original files
for (let pass=1;pass<=3;pass++) { // one seeded candidate: visit, possible wrap, revisit
  f.setWallNow(f.execution.executionExpiresAt!+60_000*pass);
  await f.runCron();
  if ((recoveryRow() as {reason:string}).reason==='executor-unsent') break;
}
expect(recoveryRow()).toMatchObject({reason:'executor-unsent',quota_done:1,budget_done:1,terminal_hash:terminalHash});
expect(f.siteDb.database.prepare('SELECT * FROM research_runs WHERE id=?1').get(f.identity.runId)).toEqual(failedRow);
expect((await f.executions.read(f.identity.ownerId,f.identity.runId))!.version).toBe(executionVersion);
expect((await f.budget.readReservation(f.identity.ownerId,f.execution.budgetReservationId!))!.status).toBe('released');
expect(f.syntheticProviderCalls()).toBe(0);
expect(f.siteDb.database.prepare(`SELECT count(*) n FROM quota_ledger
  WHERE reservation_id=?1 AND entry_kind<>'reserved'`).get(f.execution.quotaReservationId)).toEqual({n:1});
```

The new integration helper exposes actual `executions`, `budget`, `execution` in addition to its already listed fields; reopen swaps referenced DB/repository/client instances while retaining immutable identity. `setWallNow` updates both injected wall clocks and both fixture SQLite unixepoch clocks, so lease/expiry and signatures agree after each minute. The test asserts the only bucket delta is subtraction of original maximum from reserved amounts in both original buckets, with settled amounts unchanged; repeat Cron/reopen causes zero further delta. Include equivalent exact held-bucket comparisons for claimed/no-receipt. Accounting-stage completion is deliberately proved **before** restart; a test leaving either marker0 does not cover this finding.

- [x] Add the full-deadline variant, parameterized at status and at close after a valid unclaimed status. Use controlled monotonic timers and an abort-aware transport stall lasting until the actual remaining4500ms handler deadline; do not substitute a quick rejection. At the transport-entry barrier, assert the real SQL run is already failed, original quota/budget markers are1, and the budget is conservative-hold. Release the timer to abort and assert no later business mutation or Provider request. Repeat across multiple Cron passes and close/reopen both runtimes while the outage persists: cursor progress remains bounded, the original failed-run bytes/execution.version/terminalHash are unchanged and budget remains held. Remove the outage; a later authenticated close proof releases the original reservation once. Also simulate close committed remotely but its signed response arriving after cancellation: no same-pass late local upgrade, next pass recovers exact closed proof. This validates operation order and deadline recovery, rather than merely asserting a short error path succeeds.

- [x] TDD run: `npm run test:unit -- tests/server/research-executor-private-integration.test.ts`; RED must fail meaningful durable assertion or missing production interface, then GREEN actual fixture.
- [x] Final targeted tests:

```powershell
npm run test:unit -- tests/server/research-bridge-contract.test.ts tests/server/research-bridge-transport.test.ts tests/db/site-bridge-migration.test.ts tests/server/d1-site-bridge-repository.test.ts tests/server/site-expiry.test.ts tests/api/research-bridge-routes.test.ts tests/server/research-executor-runtime.test.ts tests/server/research-executor-maintenance.test.ts tests/server/research-executor-private-integration.test.ts tests/server/research-executor-auth.test.ts tests/server/research-executor-body.test.ts tests/server/research-executor-byte-identity.test.ts tests/server/research-executor-job-store.test.ts tests/server/research-executor-receipt-store.test.ts tests/server/research-executor-begin.test.ts tests/server/research-executor-configuration.test.ts tests/server/site-admission.test.ts tests/server/d1-site-begin-repository.test.ts tests/server/site-import.test.ts tests/server/site-import-integration.test.ts tests/server/d1-site-import-publication.test.ts tests/server/d1-site-import-repository.test.ts tests/api/research-routes.test.ts tests/db/migration-safety.test.ts tests/db/schema.test.ts
node scripts/build-research-executor.mjs
node scripts/test-research-workflow-runtime.mjs
node outputs/local-durable-executor-20260914/verify-type-scope.mjs task13-final-acceptance
node node_modules/typescript/bin/tsc --project outputs/local-durable-executor-20260914/tsconfig.acceptance.json --noEmit --incremental false
node node_modules/typescript/bin/tsc --project worker/research-executor/tsconfig.json --noEmit --incremental false
```

- [x] Run ESLint on the explicit actual changed `.ts`/`.mjs` files, without whole-tree generated outputs. Root verifies full-current-input typecheck retains strict root options and excludes only `outputs/`, as the existing unchanged verification helper requires; put all new build output under E. The helper's actual label gate already accepts `task13-final-acceptance`, so no helper edit is needed. No new source/tests are excluded. Use exact test result identities; don't guess test counts in advance. No full Site frontend build in Task13; separate both-site builds/full browser acceptance belongs Task14.
- [x] Root snapshots actual source/test/config/migration hashes; checks protected accepted modules/public frontend/policy/provider/oldmigrations; reviews raw RED/GREEN/lint/type/build/runtime evidence and each native SQL fault assertion. Final whole-Task13 fresh SPEC then different QUALITY/security must both PASS. Fixes return to implementer and reviewers; no self-review substitution. Only Root checks Task13 completion/update progress. Task14–17 and public release remain incomplete.

## Plan self-review and explicit limitations

Coverage: transport/trust13.1; Site authority/acceptance/deadline13.2; signed private operations/shared import13.3; same-ID bootstrap/at-most-once dispatch13.4; autonomous recovery/backoff/fairness/retention13.5; real installed runtime/build13.6; native fault chain13.7. No product feature or new top-level task was added.

Necessary integration scope additions are explicit: two Site sidecar journals plus scan cursors, executor delivery/cursor/scheduler metadata, and private adapters/runtime. Accepted codec/auth/store/import modules are reused. New APIs in this plan are defined here and do not pretend to be existing exports. Existing runtime APIs were inspected in installed types; dynamic retry delays/introspection plugin were not assumed. Official references already verified in the inventory: [Workflows local development](https://developers.cloudflare.com/workflows/build/local-development/), [retries and settings](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/), [rules](https://developers.cloudflare.com/workflows/build/rules-of-workflows/). No fresh external requests were made for this plan.

Review emphasis: preserve separate provider-call versus storage-failure boundaries; no lost-CAS-ack authority; signed response status before classification; `direction:keyId` nonce scope; no execution.version mutation during sidecar progress; old Task10 conservative recovery precedence; permanent bad item cursor progress; category and bootstrap/pickup fairness; actual Workerd0retry proof; SQL-time expiry/publication race and late same-receipt accounting without revival. This plan is not a claim that the new runtime, SQL or tests have run.


## Prior Root self-review — 2026-09-20 (formal r1 history)

Root read the full first draft (33e28c/623038) and the final changed sections/self-review (c9935f/edeb87), checked actual fixture APIs and quota CTE fields (246f0f/edeb87), and confirmed type-scope helper already supports Task13 (0d95e4). Scope covers the approved private integration; no new product feature, top-level Task or credential workflow. Existing policy/Provider/codec/import authorization remains protected. Post-begin sidecars preserve frozen execution version and exact terminal bytes; actual receipt journals remain fee authority. Nullable-grant unsent proof is allowed only for the immutable authenticated closed original job, with explicit lost-begin and close/claim races.

Actual zero-retry platform experiment02d7fe is a prerequisite only; production Workflow and full native bridge/Cron faults remain mandatory implementation acceptance. Root corrected draft ambiguity around pickup fairness, precise stage proof SQL, late fee replay and real production Workerd execution. Full-current-input type options and historicaloutputs-only exclusion remain unchanged. Root did not run implementation tests or treat code snippets as compiled source. Independent plan review is still required before starting subtask13.1.

## r2 author response to independent review

T13-PLAN-01: synchronous syntax parsers now have one argument; separately named pure async matchers snapshot all inputs/expected job before their first await. All per-job clients receive complete BridgeJob; result also receives original frozen grant and expected notice. Generic transport owns prepare and decode callbacks under one5000ms deadline, including every hash. All later call sites and runtime delivery dependencies follow those signatures. Invalid target/operation fails before prepare/sign/fetch. Existing auth gets a deadline-checking nonce wrapper; successful nonce claim is explicitly distinguished from forbidden unauthenticated/unvalidated business effects, and in-flight D1 completion is not represented as revocable.

T13-PLAN-02: Site maintenance has an explicit durable SQL branch for expired-unknown+exact original conservative-held budget independently of stage markers. No claimed/no-receipt suppression flag exists. Existing-sidecar coordinator upgrade skips terminal rewrites and resets only budget_done; shared import remains authoritative for real receipts.13.2 selector tests,13.5 Cron acceptance and13.7 native temporary-status/close→both markers1→both runtimes reopened→later original unclaimed close/release tests cover discovery and eventual convergence, with Provider0 and preserved failedrun/terminalHash/execution.version. Claimed/no-receipt remains held and eligible.

T13-PLAN-03:13.2 and file map explicitly allow only additive updates of the two existing migration/schema tests, with Task12 baseline hashes,0011/idx11/tag and three table names. All old migration files/hashes/assertions remain protected; both tests already remain in focused and final regression. No Task12 business-module change or repeated whole-task independent review is requested.

This revision only responds to the three findings and two clarifications. It does not claim r2 reviewer READY, implementation tests, source changes or Task13 completion. Root must inspect/adopt the copy and obtain independent r2 plan review before implementation.


## Root r2 revision self-review — 2026-09-20

Root preserved the first formal plan at E/task13-plan-before-review-r2.md (50448f), independently read changed APIs/deadline rules and persistence changes (91f605/650c57/cd03f2), verified actual SQL columns and old migration/schema assertions (c6f932/50448f), and read final response and native restart matrix (85edca). Separate syntax parsing and asynchronous semantic matching now have consistent complete-job signatures; original grant and receipt hash validation stays within one transport deadline, including the guarded nonce boundary. Persistent expired-unknown/original-held eligibility no longer depends on accounting markers, and the restart test proves both markers completed before later proof release. Existing migration/schema test changes are explicitly additive-only. No accepted production code, policy, provider or Task12 business module changes. These are plan corrections, not implementation/test success. Independent r2 review remains required; first review reports are preserved.
