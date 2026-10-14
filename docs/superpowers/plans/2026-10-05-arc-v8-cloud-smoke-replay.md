# Arc v8 Fixed Cloud Smoke Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved, fixed six-step signed replay to the isolated smoke Site, proving same-job idempotency and owner isolation through production clients and readers, with local evidence suitable for subsequent independent review.

**Architecture:** A small smoke-only contract module owns the closed request, approval, and safe response schemas. A read-only admission module binds operator evidence to current Site state, and a replay module composes production repositories, bridge client, and public reader inside the existing control scope. The operator driver sends six separate signed requests in order, stopping at the first unsuccessful or uncertain result; the native test executes those requests against the actual paired Worker artifacts.

**Tech Stack:** TypeScript, Zod 4, Cloudflare Workers/D1/service bindings, existing bridge HMAC/nonces, production `RemoteResearchReader`, Vitest, Node operator driver, PowerShell secure-input launcher, esbuild and Miniflare.

---

## Approved scope and current facts

This plan is **approved scope, ready for local execution**. It is not an implementation-complete claim. The governing specification is `docs/superpowers/specs/2026-09-21-arc-v8-cloud-smoke-replay-design.md`, independently reviewed PASS, SHA-256 `fa5e7c81fb575a94d03a314d260f521f15b05d484210fcc5c491b30264e858aa`. Its opening candidate/Paid-pending wording records the earlier state; the current user instruction authorizes this local implementation and lifts the earlier deferrals. Do not ask for the same design approval again.

Work in `C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta`, branch `codex/v8-openrouter-research-beta`. The roughly 311 existing dirty files belong to earlier work. Do not stage, commit, reset, clean, or rewrite unrelated changes. The skill's generic commit checkpoints are replaced here with saved local evidence and review checkpoints.

Fresh native evidence on October 5 establishes that the original long/151 and after-r2/152 packages expired at **2026-10-05T00:00:00.000Z**. Original after-d1/153 is failed/interrupted, legally settled and cleaned up. Current Paid status does not make those runs eligible. This implementation must reject expired packages and unsuccessful runs before bridge/reader activity; it must never change original timestamps, grant, deadline, state, IDs, or retention records to manufacture success. A later successful replay needs a separately inventoried fresh resource epoch and that epoch's own evidence. The same three scenario names remain the compile-time closed set; no arbitrary scenario/job/owner configuration is added.

Local execution includes synthetic fixtures, tests, type/lint/build checks, SPEC review, then a distinct QUALITY/security review. This plan does not itself authorize provisioning, deployment, remote queries, remote Cron invocation, secret acquisition, or any real OpenRouter request. Do not edit the checked-in cloud Wrangler bindings or activate an approval roster during local implementation. Task15 and release acceptance remain open after local completion.

Root's October 5 baseline is 148/148 passing across five existing cloud-smoke suites (82.84s), recorded in `outputs/local-durable-executor-20261005/replay/baseline-smoke.log`; focused smoke TypeScript validation also passed. Root saved 12 existing source/test snapshots in `outputs/local-durable-executor-20261005/replay/before/` with `source-before.json`. Use those snapshots to isolate this change from pre-existing dirty work. These are Root-reported baseline results; the plan author did not execute tests.

## Source map and contracts

| File | Responsibility / change |
| --- | --- |
| Create `worker/research-executor-smoke/replay-contract.ts` | Closed request and response schemas, bounded operator approval schema, exported fixed steps and safe hash helper. No DB/network capabilities. |
| Create `worker/research-executor-smoke/replay-admission.ts` | Read-only current-state gate; approved scenario + exact identities + fresh package + settled, single effects. No start/admission/import invocation. |
| Create `worker/research-executor-smoke/replay.ts` | One fixed step per call; production client/reader composition, outer and inner guards, signals, safe projection. |
| Modify `worker/research-executor-smoke/environment.ts` | Optional `SMOKE_REPLAY_APPROVAL_JSON` and `SMOKE_REPLAY_INVENTORY_SHA256`, both ordinary smoke configuration. |
| Modify `worker/research-executor-smoke/site-entry.ts` | Add one signed control path, reuse existing control authentication/body/scope/error response; preserve start/status behavior. |
| Modify `tests/helpers/research-cloud-smoke-fixture.ts` | Add signed replay helper and local-only approval construction; native replay must enter built Site. |
| Create `tests/server/research-cloud-smoke-replay.test.ts` | Approval, current-state, exact proof, owner/privacy, guard, timeout, disconnection and retention cases. |
| Modify `tests/server/research-cloud-smoke-control.test.ts` | Endpoint authentication, strict body, nonce and request limits for replay. |
| Modify `scripts/test-research-cloud-smoke.mjs` | New replay branch, six bounded independent requests, safe per-step report, roster/inventory verification, all-path key zeroing. |
| Modify `scripts/run-research-cloud-smoke.ps1` | Permit replay mode; preserve masked input and bounded child lifetime. |
| Modify `tests/server/research-cloud-smoke-composition.test.ts` | Actual paired Worker replay; no-retry/nonce/driver report cases. |
| Modify `tests/server/research-cloud-smoke-launcher.test.ts` | Replay mode contract, invalid arguments rejected before secret prompt, no secret arguments/logs. |
| Modify `scripts/build-research-executor-smoke.mjs` and `tests/server/research-cloud-smoke-build.test.ts` | Require smoke Site replay graph; exclude its path/config/modules from production graph. |
| Modify `worker/research-executor-smoke/tsconfig.json` | Include the new replay test and existing composition/launcher tests in smoke type validation. |

Production files below are reused, not edited: `app/server/research/{remote-public-reader,public-operation-scope,site-bridge-factory,d1-repository,d1-site-execution-repository,d1-site-bridge-repository}.ts`, `app/server/research/executor/{executor-client,http-transport,auth,body,d1-nonce-store,bridge-contract,receipt,job}.ts`. No changes to production budgets, auth protocol, provider policy, executor public routing, production Wrangler configuration or schemas/migrations are needed.

Define these smoke-only names once and use them consistently:

```ts
export const SMOKE_REPLAY_STEPS = [
  "submit", "status", "owner-a-recover", "owner-a-get", "owner-b-recover", "owner-b-get",
] as const;
export type SmokeReplayStep = typeof SMOKE_REPLAY_STEPS[number];
export type SmokeReplayRequest = Readonly<{ scenarioId: SmokeScenarioId; step: SmokeReplayStep }>;
export type SmokeReplayApproval = Readonly<{
  scenarioId: SmokeScenarioId; jobId: string; requestHash: string;
  receiptHash: string; receiptMetadataSha256: string;
  runHash: string; packageHash: string;
  acceptedAt: number; beganAt: number; executionExpiresAt: number;
}>;
export type SmokeReplayRoster = Readonly<{
  schemaVersion: "arc-smoke-replay-approval-v1";
  inventorySha256: string; nativeEvidenceSha256: string;
  scenarios: readonly SmokeReplayApproval[];
}>;
```

All hashes above are lowercase 64-hex SHA-256, not the production noncryptographic planning `fingerprint()`. `runHash`/`packageHash` hash the raw ID UTF-8 bytes; `receiptMetadataSha256` hashes production `canonicalJson(parseBridgeReceiptMetadata(...))`. Each approval represents operator acceptance of independent native evidence, not a remote attestation that the Site can verify itself. The roster's `inventorySha256` hashes the exact bytes of the existing verified isolation inventory file; `nativeEvidenceSha256` hashes the exact reviewed, safe native evidence record bytes. The driver compares that inventory digest, and later deployment verification must compare actual bindings and deployed vars. This avoids implying that a configured hash proves an actual binding by itself.

The roster uses one top-level evidence digest covering the finite per-scenario evidence collection. Strict Zod objects reject extra keys at every level. At most three entries, unique scenario IDs, each job ID equal to its `SCENARIOS` entry, complete integer times and valid hashes. Empty/absent roster refuses every replay; no implicit defaults. Reject UTF-8 byte length above 4096 before JSON parsing. Check `acceptedAt <= beganAt`, `beganAt < executionExpiresAt`, and the exact production grant through `parseBridgeBeginGrant` plus stored job matching. No raw owner/mutation/run/package IDs, URLs, content, keys, arbitrary durations or production configuration fingerprints are accepted in replay requests.

Safe replies are strict discriminated unions (`step` discriminator) with literal `schemaVersion: "arc-smoke-replay-v1"`, `scenarioId`, `step`, and `completed`:

* `submit` / `status`: `completed: true`, `identity: { jobId, requestHash, runHash, packageHash }`, `original: { acceptedAt, beganAt, executionExpiresAt, queueExpiresAt }`, `receipt: { receiptHash, metadataSha256, bodyState: "available" | "removed" }`, and checks `{ approvalMatched: true, settled: true, acceptedProofMatched: true, grantMatched: true, receiptMatched: true }`.
* owner A steps: `completed: true`, the same safe `identity`, checks `{ approvalMatched: true, settled: true, runMatched: true, packageMatched: true, ready: true, backgroundAccepted: true }`. No view, summary text, role text, planningData, candidate or package body.
* owner B steps: only common version/scenario/step plus `{ completed: boolean, isNull: boolean }`, with `completed === isNull`. An unexpected non-null result is a signed failure (`false/false`), with no returned view or identity fields.

All replies remain at most 4096 UTF-8 bytes. Guard/precondition/transport failures use the existing signed `{ code: "unavailable" }` form; the operator marks an inconclusive response **unknown**, never “no writes occurred.” There is no resettable replay progress table and no resume/skip endpoint.

## Task 1: Strict approval contract and current-state admission

**Files:** Create `worker/research-executor-smoke/replay-contract.ts`, `worker/research-executor-smoke/replay-admission.ts`, `tests/server/research-cloud-smoke-replay.test.ts`; modify `worker/research-executor-smoke/environment.ts`, `tests/helpers/research-cloud-smoke-fixture.ts`.

- [x] **Step 1: Write a RED contract test with actual boundary examples.** Add `// @vitest-environment node`. Export `smokeReplayRequestSchema`, `smokeReplayReplySchema`, `type SmokeReplayReply = z.infer<typeof smokeReplayReplySchema>`, `parseSmokeReplayRequest(value: unknown)`, `parseSmokeReplayRoster(json: unknown, inventorySha256: unknown)`, `parseSmokeReplayReply(value: unknown)` and `smokeReplayHash(value: string): Promise<string>` from the contract module. Validation failures throw an error whose public rendering remains the control unavailable form. Use this concrete request test:

```ts
it("accepts only one of the six fixed replay steps and no supplied identity", () => {
  expect(parseSmokeReplayRequest({ scenarioId: "long", step: "submit" }))
    .toEqual({ scenarioId: "long", step: "submit" });
  for (const body of [
    { scenarioId: "long", step: "reset" },
    { scenarioId: "long", step: "submit", ownerId: "owner-task15-long" },
    { scenarioId: "long", step: "submit", jobId: SCENARIOS[0]!.jobId },
    { scenarioId: "new", step: "status" },
  ]) expect(() => parseSmokeReplayRequest(body)).toThrow();
});
```

Add roster cases for absent/empty, invalid JSON, 4097 bytes, multibyte overflow, extra nested/top-level keys, duplicate scenarios, four entries, unknown scenario, wrong fixed job, invalid/missing hash/time, mismatched inventory digest and invalid grant interval. A compact valid three-entry roster must fit 4096 bytes and parse. Test the limit with whitespace padding to exactly 4096 and 4097 bytes; do not confuse JavaScript character count with byte count. Response tests reject unknown keys, content/owner fields, wrong branch keys, nonliteral successful checks and inconsistent B booleans.

- [x] **Step 2: Run RED and retain only its bounded failure evidence.**

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-cloud-smoke-replay.test.ts
```

Expected initial failure: new imports/functions absent. After those exist, each new behavior case must fail for its intended missing contract/gate, not fixture setup errors.

- [x] **Step 3: Implement strict schemas and environment fields.** Use Zod `.strict()` throughout and owned/frozen snapshots. The parser's size-first core is:

```ts
if (typeof json !== "string" || new TextEncoder().encode(json).byteLength > 4096) {
  throw new Error("Smoke unavailable");
}
const roster = rosterSchema.parse(JSON.parse(json));
if (roster.inventorySha256 !== hashSchema.parse(inventorySha256)
  || new Set(roster.scenarios.map(item => item.scenarioId)).size !== roster.scenarios.length
  || roster.scenarios.some(item => item.jobId !== SCENARIOS.find(s => s.id === item.scenarioId)!.jobId)) {
  throw new Error("Smoke unavailable");
}
```

Environment additions are exactly:

```ts
SMOKE_REPLAY_APPROVAL_JSON?: string;
SMOKE_REPLAY_INVENTORY_SHA256?: string;
```

Neither field is added to production environment types or production configuration.

- [x] **Step 4: Write a RED gate test against real fixture state, then implement the read-only gate.** Export:

```ts
export type SmokeReplayAdmission = Readonly<{
  scenario: SmokeScenario; approval: SmokeReplayApproval; run: ResearchRunRecord;
  execution: SiteExecutionRecord; accepted: AcceptedProof; metadata: BridgeReceiptMetadata;
}>;
export function requireSmokeReplayAdmission(options: Readonly<{
  environment: SmokeSiteEnvironment; scenarioId: SmokeScenarioId;
  scope: PublicOperationScope;
}>): Promise<SmokeReplayAdmission>;
```

The gate parses roster first, selects exactly one approval, then uses `createGuardedD1(environment.SMOKE_SITE_DB, scope.ensure)` and production research/execution/bridge repositories. Find the run by the original owner/mutation/role/locale/fingerprint and `retryOfRunId: null`, read its original `execution.job`, and production acceptance. Never reconstruct a fresh job. Every awaited action, hash included, is scheduled by `scope.run(() => ...)`.

Reuse the relationships in `site-entry.ts`'s `settledJoin` as a **new replay-only SELECT**, leaving the existing start sequence untouched. Select only identity/metadata/count fields, not candidate/package JSON. Bind the fixed scenario, original identities and approval hashes; require all of:

| Gate | Exact condition |
| --- | --- |
| Observation | One matching `smoke_scenarios` row; fixed job/owner/mutation/request all match repositories. |
| Run/execution | Same owner/run/request/job/requestHash; `execution_mode='cloudflare-workflow-v1'`, original quota key, Ready; `active_slot IS NULL` and `active_expires_at IS NULL`; admitted execution, no closure. |
| Receipt/import | Exactly one import, `phase=5`, its run/owner/request/job/requestHash and receipt hash match; parse `receipt_metadata_json` with production parser; metadata grant and SHA-256 match approval. |
| Package | Same package as run/import resolution; role/locale/config identity joins match; one package; `expires_at > Date.now()` and `expires_at > siteSqlNow`, using `siteSqlNow` from `app/server/research/site-execution-sql.ts`. Equality at expiry rejects. Hash of package ID matches roster. |
| Acceptance/grant | Exactly one acceptance; `matchAcceptedProof(accepted, execution.job)`; exact acceptedAt, beganAt, executionExpiresAt; valid stored grant; recomputed `hashBridgeJob` equals stored and roster requestHash. |
| Accounting | One quota reserved and one accepted row for the exact reservation/owner/quota key; no rejected/failed terminal quota row; one budget reservation for the exact run/request and linked reservation ID, status settled and `settled_micros=1`; one accepted role-research audit tied to the import's audit request; no duplicate scenario run/import/audit. |
| Identity digest | SHA-256 of stored run ID and package ID exactly equal approval. Metadata hash includes its complete parsed immutable metadata. |

Use exact count assertions rather than only `EXISTS`. Parse SQL scalar results into a strict schema, reject null/unexpected row shapes. The gate is read-only and must finish before creating a bridge client or `RemoteResearchReader`. No Provider/Workflow count is asserted from Site-only evidence; those effects are the independently reviewed native evidence plus before/after snapshots in Task 5.

Extend the local fixture with `approveReplay(id: SmokeScenarioId): Promise<SmokeReplayRoster>`. It is **test-only**, requires a genuinely started, Workflow-completed and independently Cron-imported scenario, reads the local Site receipt metadata/acceptance and hashes actual identities, then sets the two new environment fields using a fixed synthetic inventory digest and a synthetic native-evidence digest. It must not mark a failed/unsettled fixture approved by default. Return the roster so negative tests can deliberately corrupt config. Production has no approval-generation endpoint.

```ts
it("rejects a package at its original expiry before any executor request", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const f = fixture();
  await f.signedStart("long"); await f.runWorkflow("long");
  vi.setSystemTime(Date.now() + 30_001); await f.runCron();
  await f.approveReplay("long");
  const row = f.siteDb.database.prepare(
    "SELECT expires_at FROM research_packages WHERE id=(SELECT package_id FROM research_runs WHERE user_id=?1 AND mutation_id=?2)"
  ).get(SCENARIOS[0]!.ownerId, SCENARIOS[0]!.mutationId) as { expires_at: number };
  vi.setSystemTime(row.expires_at);
  const scope = new PublicOperationScope(() => performance.now());
  const before = f.siteSnapshot("long"); const traffic = [...f.traffic];
  try {
    await expect(requireSmokeReplayAdmission({ environment: f.environment, scenarioId: "long", scope })).rejects.toThrow();
    expect(f.siteSnapshot("long")).toEqual(before); expect(f.traffic).toEqual(traffic);
  } finally { scope.finish(); }
});
```

`fixture()` in this test file registers the existing `createResearchCloudSmokeFixture()` for async `afterEach` disposal and restores timers/mocks, as in `research-cloud-smoke-control.test.ts`. Add mutation cases for each gate row above, including failed original after-d1, not started, still running, phase4, unsettled accounting and incorrect receipt identity. Alter only disposable local fixture records where schema constraints permit; immutable-trigger cases should use controlled read substitution instead of dropping production triggers. No historical cloud records are edited.

- [x] **Step 5: Run GREEN and inspect the new diff.** Re-run the Task 1 Vitest command. Expected: all contract/current-state tests pass, no outbound fetch, no mutation beyond fixture setup. Save the RED/GREEN summaries in ignored local evidence. No Git staging or commit.

## Task 2: Guarded production composition and six fixed operations

**Files:** Create `worker/research-executor-smoke/replay.ts`; extend `tests/server/research-cloud-smoke-replay.test.ts`. Reuse `worker/research-executor-smoke/transports.ts` without weakening its allowed paths or private-binding-only behavior.

- [x] **Step 1: Write RED for same-request preflight and the six operation mapping.** Export:

```ts
export function runSmokeReplay(options: Readonly<{
  environment: SmokeSiteEnvironment; connection: ResearchBridgeConnection;
  request: SmokeReplayRequest; scope: PublicOperationScope;
}>): Promise<SmokeReplayReply>;
```

`SmokeReplayReply` is inferred from Task 1's exported strict reply schema. Call `requireSmokeReplayAdmission` first for **every** step. Test a completed approved fixture and assert the `submit` trace suffix is exactly status then submit:

```ts
const beforeCreates = f.workflowCreates();
const beforeTraffic = f.traffic.length;
const scope = new PublicOperationScope(() => performance.now());
try {
  const result = await runSmokeReplay({ environment: f.environment,
    connection: readResearchBridgeConnection(f.environment)!,
    request: { scenarioId: "long", step: "submit" }, scope });
  expect(result).toMatchObject({ step: "submit", completed: true });
  expect(f.traffic.slice(beforeTraffic).filter(path => path.startsWith("executor:")))
    .toEqual(["executor:/internal/research-bridge/status", "executor:/internal/research-bridge/submit"]);
  expect(f.workflowCreates()).toBe(beforeCreates);
} finally { scope.finish(); }
```

Intercept the existing private binding in separate tests to return production-signed but missing/mismatched status acceptance, unclaimed/closed status, receipt mismatch, wrong grant, wrong acceptedAt, bodyState missing, rejection and stalled response. Every case must leave the submit count at zero. A previous successful status in another request does not bypass this preflight.

- [x] **Step 2: Run RED.**

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-cloud-smoke-replay.test.ts
```

Expected: replay export absent, then intended operation/guard assertions fail until implemented.

- [x] **Step 3: Implement composition with intersected capabilities and lifetimes.** Build both direct client and reader executor from the real `ExecutorBridgeClient(new BridgeTransport(...))`. Each factory begins and ends with its composed guard. Direct methods receive `{ signal: scope.signal }`. Reader gets its existing internal scopes; do not modify production reader's API or budgets. Its factory guard is:

```ts
const compose = (inner: () => void) => () => { scope.ensure(); inner(); scope.ensure(); };
```

`createReadRepositories(inner)` creates guarded D1 and exposes explicit read-only wrappers implementing `PublicReadRepositories`: `research.getRun/getPublicRun/findRecoveryRun`, `executions.read`, `bridge.lookup/readAcceptance`. Return these method-only objects, not whole class instances with hidden mutation methods. `createOperations(inner)` calls `createSiteBridgeOperations(rawSiteDb, compose(inner), Date.now)`. `legacy.get/recover` always throw `ResearchRepositoryError("RESEARCH_UNAVAILABLE")`; no synchronous service or Provider is created.

Reader executor factory wraps `createBridgeFetch(environment.SMOKE_EXECUTOR, connection.executorOrigin, "executor")` as follows (the Request signal is the reader/bridge signal):

```ts
const guardedFetch: typeof fetch = async (input, init) => {
  guard();
  if (!(input instanceof Request) || init !== undefined) throw new Error("Smoke unavailable");
  const signal = AbortSignal.any([scope.signal, input.signal]);
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const response = await bindingFetch(new Request(input, { signal }));
  try { guard(); return response; }
  catch (error) { void response.body?.cancel().catch(() => undefined); throw error; }
};
```

`new D1BridgeNonceStore(createGuardedD1(rawSiteDb, guard))` ensures response authentication nonce writes obey both guards. `scope.run` wraps each direct method and each `reader.get/recover` call. Any late continuation rechecks outer scope before creating a factory, transporting, reading or mutating. The refresh factory stays read-only even though the work factory can create existing reconciliation operations. Request cancellation fences all factories and both D1 nonce paths; no extra 4500ms window is created.

- [x] **Step 4: Implement exact proof matching and safe projection.** For submit, within the same outer scope:

```ts
const prior = await scope.run(() => executor.status(admission.execution.job, { signal: scope.signal }));
requireOriginalStatus(prior, admission);
const accepted = await scope.run(() => executor.submit(admission.execution.job, { signal: scope.signal }));
if (canonicalJson(accepted) !== canonicalJson(admission.accepted)
  || canonicalJson(accepted) !== canonicalJson(prior.accepted)) throw new Error("Smoke unavailable");
```

Define the module-local `requireOriginalStatus(value: ExecutorStatus, admission: SmokeReplayAdmission): void` to require `dispatchState === "claimed"`, `unsent === null`, exact non-null acceptance, exact non-null metadata equal to parsed Site import metadata, original grant and receipt hash, and `bodyState` available or removed. A status response parsed by the client already matches its original job; still compare complete canonical persisted acceptance/metadata. Status step calls the same matcher after one `executor.status`. Submit's response uses the verified preflight metadata and the matched returned acceptance, without claiming a new post-submit status observation.

For A and B use precisely:

```ts
const selection = { kind: "start", role: admission.scenario.role,
  locale: admission.scenario.locale, mutationId: admission.scenario.mutationId };
```

`owner-a-recover` -> `reader.recover(ownerId, selection)`; `owner-a-get` -> `reader.get(ownerId, admission.run.id)`; B uses `otherOwnerId` with that same selection or A's actual run ID. A must have matching original run ID, Ready state, original package ID, `backgroundAccepted === true`, then project only Task 1's safe booleans/hashes. B projects only null/failure booleans, including deliberately injected unexpected views carrying canary body data. Run the final object through `parseSmokeReplayReply` and byte-limit encoding before control signing.

- [x] **Step 5: Add guard/timeout RED cases, implement only missing fencing, then GREEN.** Use existing `createD1OperationBarrier` from `tests/helpers/research-bridge-fixture.ts`, timer-only fake timers, and a binding Promise barrier. Parameterize barriers at initial approval SELECT, reader work `getPublicRun`, reader refresh SELECT, request nonce SQL (Task 3), response nonce SQL and status transport. Enter barrier, advance 4500ms (or finish the outer scope), record 503/unknown, expire/release it, drain one `setImmediate`, then assert `lateStarts() === 0`, no later transport, no submit and no late reader mutation. Already-dispatched native SQL may commit; tests assert no new operation starts, not impossible rollback.

Exercise outer abort while the reader's own work/refresh guard is still live, inner reader abort while outer is still live, and cancellation after status resolves but before submit schedules. Verify no-op guards never appear in production replay composition. For retention, remove the already-acknowledged local receipt body using production cleanup/retention APIs (or fixture clock advancement plus maintenance), retain its real tombstone, then expect status and all four owner steps unchanged while package remains fresh. Do not delete metadata, fabricate a replacement receipt or extend expiry.

Re-run the Task 2 command. Expected: all cases pass with Provider1/Repair0 and one Workflow creation remaining unchanged across replay. Save evidence; do not commit.

## Task 3: Signed smoke Site control endpoint

**Files:** Modify `worker/research-executor-smoke/site-entry.ts`, `tests/helpers/research-cloud-smoke-fixture.ts`, `tests/server/research-cloud-smoke-control.test.ts`, `tests/server/research-cloud-smoke-replay.test.ts`.

- [x] **Step 1: Write RED at the real Site fetch boundary.** Extend existing `makeRequest`/`signed` operation unions with `"replay"` and an optional body, and expose `signedReplay(id: SmokeScenarioId, step: SmokeReplayStep)`. It signs `{ scenarioId: id, step }`, verifies the signed reply with existing test nonce persistence, returns `{ status, body }` and does no retries. Test:

```ts
it("fails closed without approval and exposes no new executor capability", async () => {
  const f = fixture(); await f.signedStart("long");
  const traffic = [...f.traffic]; const before = f.siteSnapshot("long");
  const result = await f.signedReplay("long", "submit");
  expect(result).toEqual({ status: 503, body: { code: "unavailable" } });
  expect(f.traffic).toEqual(traffic); expect(f.siteSnapshot("long")).toEqual(before);
  expect(Object.hasOwn(f.environment, "EXECUTOR_DB")).toBe(false);
  expect(Object.hasOwn(f.environment, "EXECUTOR_RECEIPTS")).toBe(false);
});
```

- [x] **Step 2: Run RED.**

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-cloud-smoke-control.test.ts tests/server/research-cloud-smoke-replay.test.ts
```

Expected: replay route returns 404 instead of a signed unavailable or valid result.

- [x] **Step 3: Integrate the one route inside existing control lifecycle.** Expand `control`'s path union and fetch allowlist to include only `/_smoke/replay`. Retain method/origin/query/auth/audience/jobId guards, request `readBridgeBody` 4096/4500ms, nonce store and response signer. Replace only the post-auth branch:

```ts
let value: unknown;
if (path === "/_smoke/replay") {
  const parsed = smokeReplayRequestSchema.safeParse(decodeBridgeJson(body));
  if (!parsed.success) throw new ControlError(400);
  value = await scope.run(() => runSmokeReplay({ environment, connection, request: parsed.data, scope }));
} else {
  const parsed = bodySchema.safeParse(decodeBridgeJson(body));
  if (!parsed.success) throw new ControlError(400);
  const scenario = SCENARIOS.find(s => s.id === parsed.data.scenarioId)!;
  if (path === "/_smoke/start") await scope.run(() => start(environment, connection, db, scenario, scope));
  value = await scope.run(() => status(db, scenario));
}
return await signedResponse(context, key, value, 200, scope);
```

Export `smokeReplayRequestSchema` alongside Task 1's parser to share the same validation. Do not catch replay failure and fall back to start/status. The existing 500ms response-only scope after fencing has no DB capability; preserve it. Ensure control key bytes are zeroed after either success or error signing and on all exits after key construction; a small outer `try/finally` may wrap the current work/error-response phases. Do not clear before signing the error response.

- [x] **Step 4: Extend the complete boundary matrix and run GREEN.** Repeat existing wrong key bytes/ID, bridge key confusion, wrong audience/direction/method/job scope, query/origin/unknown path, unsigned/path-swapped/replayed nonce cases specifically for replay. Include extra `owner`, `ownerId`, `job`, `jobId`, `run`, `url`, `sql`, `duration`, `body`, `configFingerprint`; request missing/unknown step; streamed bytes 4096/4097 and stalled body; no roster; good roster but failed/unsettled/expired state. Refused authenticated attempts may consume their nonce but must have no business/bridge/reader effects. Response signing remains bounded and raw exception/database/provider strings never escape.

Test request disconnection with `AbortController`, including during status-before-submit and during reader refresh; expect no next scheduled action. Re-run Task 3's command. The existing start/status tests must still pass unchanged in meaning. Save local evidence and inspect diff without staging.

## Task 4: Six-request driver, safe reports and secure launcher

**Files:** Modify `scripts/test-research-cloud-smoke.mjs`, `scripts/run-research-cloud-smoke.ps1`, `tests/server/research-cloud-smoke-composition.test.ts`, `tests/server/research-cloud-smoke-launcher.test.ts`, `tests/helpers/research-cloud-smoke-fixture.ts` (host helper exports only).

- [x] **Step 1: Add driver RED tests using the existing `setup`, `reply`, `driver` and synthetic input helpers in composition tests.** Permit mode `replay`, with existing flags plus required replay-only `--approval PATH`. All other modes retain their present flags. Reject caller `--step`, arbitrary URL, owner/job/run, duration, retries, secrets and unknown switches. `--approval` points to a pre-existing <=4096-byte roster file inside the existing ignored smoke evidence root; it is read only, not generated from state by the driver. Read inventory exact bytes once and return their SHA-256 from `cloudInventory` without changing its strict inventory schema.

Extend the local driver test `setup()` to write a strict synthetic roster matching its inventory digest, retain the current deployable artifact/source checks, and return `approvalPath`, `roster`, `saveApproval()`. Export Task 1's request/reply/roster parsers and fixed steps from the bundled host helper. A driver success test returns six production-signed strict replies derived from one approval and checks:

```ts
expect(paths).toEqual(Array(6).fill("/_smoke/replay"));
expect(bodies).toEqual(SMOKE_REPLAY_STEPS.map(step => ({ scenarioId: "long", step })));
expect(new Set(requestNonces).size).toBe(6);
expect(result).toMatchObject({ status: "passed", accepted: false,
  lastCompletedStep: "owner-b-get", cloudElapsedProved: false });
expect(result.steps.map((item: { step: string }) => item.step)).toEqual(SMOKE_REPLAY_STEPS);
```

`accepted: false` deliberately preserves the distinction between replay completion and fresh dispatch acceptance; CLI success for replay uses `status === "passed"`. The driver must not use the old `backgroundAccepted` convenience flag to claim native/cloud acceptance.

- [x] **Step 2: Run RED.**

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-cloud-smoke-composition.test.ts -t "bounded operator driver"
node node_modules/vitest/vitest.mjs run tests/server/research-cloud-smoke-launcher.test.ts
```

Expected: replay arguments rejected / launcher unsupported / no step report. Do not invoke the real launcher or provide credentials during these tests.

- [x] **Step 3: Implement a separate `replayControl` branch, never enter the start retry loop.** Use one new nonce and a fresh request deadline for each step, fixed path/audience/job scope, existing signing/verification helper, `redirect: "error"`, 4096-byte response reader, and persistent `responseNonces(inventory)`. Each request's transport + read + authentication is bounded by one 5000ms monotonic deadline; abort and clear timer in `finally`. Authentication/nonces completing after deadline must not permit another request. Do not expand Worker 4500/500ms budgets or launcher 60000ms deadline.

```js
const steps = [];
let lastCompletedStep = null;
for (const step of helper.SMOKE_REPLAY_STEPS) {
  const startedAt = Date.now();
  const result = await requestReplayStep(step);
  steps.push({ step, startedAt, finishedAt: Date.now(), ...result });
  if (result.result !== "completed") {
    return { status: result.result, accepted: false, scenarioId: options.scenarioId,
      lastCompletedStep, steps, cloudElapsedProved: false };
  }
  lastCompletedStep = step;
}
return { status: "passed", accepted: false, scenarioId: options.scenarioId,
  lastCompletedStep, steps, cloudElapsedProved: false };
```

Define the local `requestReplayStep(step)` result as `{ result: "completed", reply: strictSafeReply }`, `{ result: "rejected", httpStatus: 400 | 401 | 409 }`, `{ result: "failed", code: "isolation-failed" }`, or `{ result: "unknown", code: safeFixedCode }`. All transport, unsigned/invalid/oversize/mismatched response and 5xx cases are unknown; no exception text or raw bytes are persisted. A signed B `false/false` is failed. Persist each completed result before starting the next request using an exclusively created `step-N.json` in this run's newly owned directory, then the aggregate report; the per-step file contains only these projections. If persistence fails, stop before another request. Include last completed step in partial/failure reports; never discard already validated steps in the outer catch.

Parse the roster using the exact inventory digest before reading the control secret or sending requests. In each A/bridge response compare safe identity/times/receipt fields that are present to the selected approved entry; compare queueExpiresAt consistently between submit/status. Reject cross-scenario/step/body/capability data even if correctly signed. Include only inventory digest, native-evidence digest and approval-file digest in replay evidence, not arbitrary approval-file fields. Existing artifact/source/binding checks remain mandatory. The roster is independently deployed plain config; matching the local file alone is not deployment proof.

- [x] **Step 4: Move credential zeroing to an outer finally and adjust the launcher.** The current driver creates its directory and bundles its helper after credential acquisition, outside the narrow existing cleanup scope. Cover all paths:

```js
let keyBytes = null;
try {
  // Validate args, inventory, artifact and replay approval before credential acquisition.
  keyBytes = configuration ? await credential(capabilities.input) : null;
  // Own report directory; create helper; run chosen mode; write safe reports.
} catch (error) {
  // Existing fixed safe failure projection, retaining completed replay step evidence.
} finally {
  keyBytes?.fill(0);
}
```

Zero temporary redirected input byte buffers in `credential` after decoding/conversion, including malformed/oversize input and stream failure; avoid leaving accumulated Buffer chunks uncleared. Strings are not promised physically erasable. Add focused test spies that capture the actual Uint8Array passed to signing and verify all zero bytes after success, response rejection, setup/helper/report-file failure, transport failure and reused report directory. Test input buffers separately. Do not add a key-disclosing test hook to runtime or report.

PowerShell adds `[string]$Approval` and allows `@('start', 'status', 'replay')`. Require existing file only in replay mode, reject it in other modes, resolve it before prompting, and append only `--approval` plus its validated path to child arguments. Preserve `Read-Host -AsSecureString`, pipe-only credential delivery, zero/free BSTR, `CreateNoWindow`, no key argument/env var, proxy validation and the 60-second child bound. No runtime prompt is added to local tests.

- [x] **Step 5: Add stop-on-every-position cases and GREEN.** For each of six steps, supply a timeout, disconnected/throwing transport, signed rejection, unsigned reply, oversized reply or wrong step reply and assert exactly N requests, preceding steps retained, no start/status fallback and no duplicate step. Across separate driver invocations replay a captured response nonce and require refusal/unknown before the next step. Test unknown response fields carrying `secret-never-echo` and candidate data are rejected and absent from all files/stdout projections. Re-run Task 4 commands; expected launcher, existing start/status driver contracts and new replay tests all pass. Save bounded evidence.

## Task 5: Actual paired artifacts, production exclusion and review handoff

**Files:** Modify `tests/helpers/research-cloud-smoke-fixture.ts`, `tests/server/research-cloud-smoke-composition.test.ts`, `scripts/build-research-executor-smoke.mjs`, `tests/server/research-cloud-smoke-build.test.ts`, `worker/research-executor-smoke/tsconfig.json`.

- [x] **Step 1: Replace the native fixture's host-side replay oracle with signed built-Site requests and write RED.** `createNativeResearchCloudSmokeFixture` currently builds production reader/client on the Node host, uses a no-op guard for direct client calls, and never calls owner-A get. Remove that replay path from acceptance. Keep read-only native snapshot capability for independent evidence.

Add native `approveReplay(id)` to derive a roster from a successfully settled **local** snapshot (including independently invoked scheduled recovery for fault scenarios), read Site immutable receipt metadata/acceptance, set only the smoke Site's two plain bindings, and reload/reopen Miniflare with the same owned persisted D1/R2/Workflow identities. No business record seeding, reset, migration repeat, clock/lease edit, or alternate source entrypoint. Approval is test orchestration, not a new Worker endpoint. Preserve receipts and Workflow storage across the reconfiguration. Add signed `replayStep(id, step)` using actual built Site worker fetch, with per-response signature/nonce verification. `replay(id)` becomes exactly the fixed six signed steps and stops on any noncompleted result.

Extend `runNativeSmokeSuite` results with safe `replaySteps`; update its assertions:

```ts
const beforeReplay = await harness.snapshot(scenario.id);
await harness.approveReplay(scenario.id);
const replay = await harness.replay(scenario.id);
assert.deepEqual(replay.steps.map(item => item.step), SMOKE_REPLAY_STEPS);
assert.equal(replay.steps.every(item => item.completed), true);
assert.equal(replay.steps.find(item => item.step === "owner-b-recover")!.isNull, true);
assert.equal(replay.steps.find(item => item.step === "owner-b-get")!.isNull, true);
const afterReplay = await harness.snapshot(scenario.id);
assert.deepEqual(identity(afterReplay), identity(beforeReplay));
assert.equal(afterReplay.providerCalls, 1);
assert.equal(afterReplay.repairCalls, 0);
assert.deepEqual(afterReplay.accounting, beforeReplay.accounting);
assert.equal(harness.egress(), 0);
```

The native `replay` result is `{ steps: SmokeReplayReply[], after: Awaited<ReturnType<typeof snapshot>> }`; remove former `submitted`, `executorStatus`, `recoveredRunId` and `wrongOwnerHidden` host-oracle assertions. Derive existing suite summary fields `wrongOwnerHidden` and `originalMutationRecovered` from the strict signed B and A checks to preserve consumers, while recording the actual six replies. Keep all old independent native count/identity assertions.

Before approval, fault-gap replay must return unavailable without producing recovery/import; independent Cron must still do that work. After restart, actual request and response nonce persistence remains effective. Add a separate built-pair rejection case for absent/wrong roster; complete success for all three scenarios uses fresh locally created packages. The expired-package rejection case remains in the disposable in-process gate fixture, where only the deterministic fixture wall-clock advances. Do not change real native Worker timestamps to manufacture acceptance.

Record `observedAt` per native snapshot and individual storage observation times for job, run/execution/import/accounting, receipt and Workflow status. The comparison is not an atomic cross-store snapshot. Compare original job/request hash, accepted proof/grant/deadlines, receipt hash/metadata hash, terminal state, Provider1/Repair0, one run/package/import/audit, one reserved/accepted quota effect and budget totals. Allow legitimate body removal/tombstone timestamps to advance; metadata and counters remain equal. Do not include candidate/provider/package bodies in durable report projections.

Name the timestamp map `observations` and update existing whole-snapshot equality assertions to compare a helper `snapshotState(value)` that returns all snapshot fields except `observedAt` and `observations`. Keep timestamps in the evidence record; equality of observations taken at different times is neither expected nor asserted. Retention-allowed fields receive explicit comparisons rather than disappearing from the evidence.

- [x] **Step 2: Run native RED and build-boundary RED.**

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-cloud-smoke-composition.test.ts -t "built native smoke composition"
node node_modules/vitest/vitest.mjs run tests/server/research-cloud-smoke-build.test.ts
```

Expected new RED: native signed replay/approval API missing or incomplete actual six-step evidence. Test timeout may remain the existing 180000ms suite envelope; do not expand product request deadlines. For build RED, require `report.site.inputs` to contain `worker/research-executor-smoke/replay.ts` and `app/server/research/remote-public-reader.ts`, and production inputs/text to exclude the new modules/config literals.

- [x] **Step 3: Implement exact build assertions and typecheck inclusion.** Add to the existing production forbidden text check:

```js
/__local\/|\/_smoke\/|synthetic-task15|SMOKE_REPLAY_APPROVAL_JSON|SMOKE_REPLAY_INVENTORY_SHA256|arc-smoke-replay-v1/u
```

The existing production graph input check already rejects all `research-executor-smoke` inputs; retain it and assert the new modules are present only in the smoke Site graph. Preserve all reviewed production source hashes, runtime alias edge checks, cloud-only timing policy, paid-step retry0 and private binding capability report. Do not update a pinned production hash merely to make a build pass. Add all new/changed smoke test files to the dedicated `tsconfig.json` files array, including replay, composition and launcher tests; keep strict compiler settings.

Also inspect the normal production website build output for replay route/config strings. The production Executor control graph alone does not prove exclusion from the main Site build.

- [x] **Step 4: Run the exact local acceptance commands, once meaningful RED/GREEN work is complete.** Commands run from the worktree root. These are local commands, not cloud deployment. Use a fresh safe report name if an exclusively created output already exists; never overwrite/delete earlier evidence.

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-cloud-smoke-transports.test.ts tests/server/research-cloud-smoke-control.test.ts tests/server/research-cloud-smoke-replay.test.ts tests/server/research-cloud-smoke-build.test.ts tests/server/research-cloud-smoke-composition.test.ts tests/server/research-cloud-smoke-launcher.test.ts tests/server/remote-public-reader.test.ts tests/server/research-bridge-transport.test.ts tests/server/research-public-integration.test.ts tests/server/research-executor-runtime.test.ts tests/server/research-executor-maintenance.test.ts tests/server/site-import-validation.test.ts
node node_modules/typescript/bin/tsc --project worker/research-executor-smoke/tsconfig.json --noEmit --incremental false
node node_modules/eslint/bin/eslint.js worker/research-executor-smoke tests/server/research-cloud-smoke-transports.test.ts tests/server/research-cloud-smoke-control.test.ts tests/server/research-cloud-smoke-replay.test.ts tests/server/research-cloud-smoke-build.test.ts tests/server/research-cloud-smoke-composition.test.ts tests/server/research-cloud-smoke-launcher.test.ts tests/helpers/research-cloud-smoke-fixture.ts tests/fixtures/research/cloud-smoke-local-timing.ts tests/fixtures/research/cloud-smoke-local-executor-entry.ts scripts/build-research-executor-smoke.mjs scripts/test-research-cloud-smoke.mjs
node scripts/build-research-executor-smoke.mjs --profile local --report-name task15-replay-local-20261005
node scripts/build-research-executor-smoke.mjs --profile cloud --report-name task15-replay-cloud-candidate-20261005
node scripts/test-research-cloud-smoke.mjs local --report-name task15-replay-native-20261005
npm run build
rg -n --glob '*.js' --glob '*.json' --glob '*.mjs' '/_smoke/replay|SMOKE_REPLAY_APPROVAL_JSON|SMOKE_REPLAY_INVENTORY_SHA256|arc-smoke-replay-v1' dist
```

Expected: Vitest all selected suites pass, TypeScript and ESLint exit0, both smoke build reports passed with correct deployability, native local suite passed with all six signed replies per scenario and outboundAttempts0, production website build exit0. The final `rg` must return **exit1 with no matches**; exit2 is a search error, not proof of exclusion. Confirm `dist` exists and is the actual output of `scripts/run-vinext.mjs build` before accepting the exclusion search; if the current build reports a different output directory, use that printed directory and record it. The dedicated typecheck is the required scoped check; do not “fix” unrelated dirty-tree failures. If any command fails, record the actual failure and resolve relevant causes before claiming local completion. Do not claim tests ran from this planning document.

- [x] **Step 5: Independent reviews and bounded next-stage evidence.** Root executes serial implementation tasks, SPEC review against the approved design plus October 5 facts, then a **different** QUALITY/security reviewer. Verify approval cannot invent successful after-d1 history, expiry is fail-closed, same-request preflight guards submit, reader work/refresh and nonce guards intersect, both Worker artifacts are exercised, driver stops without retries and every error path zeroes key byte buffers. Resolve findings and rerun only affected tests plus required final gates.

Create local safe evidence under `outputs/local-durable-executor-20261005/replay/` containing command/time/result, touched file hashes, current artifact/source digests and review disposition. Retain original artifact reports in the builder's existing immutable output tree. No secrets or content bodies enter notes. Do not stage/commit. Handoff says local replay implementation status and remaining cloud prerequisites, not “Task15 complete.”

For the subsequent cloud stage under the user's existing authorization to continue, Root first inventories the fresh isolated resource epoch, verifies actual Site D1 and private executor service binding plus actual deployment artifact/config, records native terminal/Cron evidence, creates a finite <=4096-byte roster, and verifies the exact deployed plain config matches it. No original expired/failed scenario is included. Only then may cloud steps within that authorization use the fresh inventory and control credential channel. These are concrete evidence and resource checks, not a request to repeat generic design approval. Actual-model execution still requires its separate actual-model permission. Native before/after comparisons remain independently required; driver `passed` alone cannot grant cloud acceptance. This paragraph records prerequisites, performs no cloud action, and grants no new authority beyond the user's existing instruction.

## Self-review coverage

| Approved requirement | Task / evidence |
| --- | --- |
| Exactly one smoke-only path; closed scenario/step/body; C signature, audience, persistent nonce, byte cap | Tasks 1, 3; control attack matrix. |
| Independent evidence approval, default deny, <=3 entries/4096 bytes, inventory/epoch binding | Tasks 1, 4, 5; parser negatives and native approval orchestration. |
| Exact original job/run/request/acceptance/grant/receipt plus Ready and settled single effects | Tasks 1, 2; gate matrix and proof comparison tests. |
| Original packages expired; original after-d1 failed; no timestamp rewrite | Task 1 expiry/failure rejection, scope facts, Task 5 fresh-epoch handoff. |
| Same-request status-before-submit; no new Workflow/Provider/Repair | Task 2 exact traffic, Task 5 actual paired native snapshots. |
| All six methods, A original recovery/get, B same selection and real A run ID | Tasks 2, 5; production reader inside built Site. |
| Guard every D1/nonce/factory/continuation; combine signals; refresh read-only; legacy fail closed | Tasks 2, 3; timed barriers and abort/late-start assertions. |
| No budget widening, private binding only, no global fetch, no public executor/Provider | Tasks 2, 5; unchanged production code and deny-egress fixtures/build checks. |
| Safe bounded replies, B non-null failure with no body, unknown timeout semantics | Tasks 1–4; strict projection/canary/body-limit/partial-report cases. |
| Six separate signed requests, no retry/fallback/skip; durable response nonce; local key buffers cleared | Task 4; every-position failure tests and outer-finally tests. |
| Tombstone-safe status/owner reads, immutable counts and observed timestamps | Tasks 2, 5; production retention and native snapshots. |
| Both actual built Workers; exclude smoke endpoint/config from production executor and Site | Task 5; graph, native and production build checks. |
| TDD → local gates → SPEC → distinct QUALITY → inventory/cloud evidence | Tasks 1–5; no cloud action inside this local plan. |

Self-review found no uncovered approved requirement. No execution option question is necessary: Root's instructed handoff is serial subagent-driven implementation with SPEC then distinct QUALITY review. The only unavailable evidence is deliberately external to local implementation: a later fresh, independently inventoried successful cloud epoch.
