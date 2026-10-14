# Arc v8 Public Research Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect public Research submit, status and recovery to the accepted durable executor, preserving synchronous compatibility and proving leave/return recovery through the real local two-sided chain.

**Architecture:** A structural domain service contract permits synchronous and remote composition without making the HTTP layer the domain's type authority. Remote writes use the existing creation/admission/bridge primitives; owner-verified reads reconcile only their original execution through existing import/expiry authorities. The public boolean is derived exclusively from a matching persisted Site acceptance proof.

**Tech Stack:** TypeScript, Zod, Vitest/Testing Library, Vinext/React, D1 repositories exercised with file-backed SQLite, local persistent Miniflare R2, signed private HTTP handlers, installed Workerd/Workflow and the actual OpenRouter adapter with synthetic transport.

---

## Adoption status and prerequisites

This plan was adopted by Root on 2026-09-20 after complete self-review and independent plan review PASS with no findings. The reviewed draft and exact adoption mapping are retained in E/task14-plan-adoption.json. Task13 is accepted locally; Task14 implementation is now authorized within the scope below.

- Task13 prerequisite complete: final independent SPEC and different QUALITY both PASS, Root completion task13-completion.json binds55 accepted sources and27/27 steps. Its53-file/1803-test,470-input type,50-file lint and native passes are Task13 evidence, not Task14 verification.
- Plan prerequisite complete: Root self-review plus independent task14-plan-review.json PASS. Implement this adopted plan; retain draft/review provenance.
- Root captures Task14's allowed path baseline/protected sources and per-subtask scope before edits. Execute the six subtasks below sequentially with a fresh implementer, independent SPEC, then a different QUALITY reviewer. Retain actual RED/GREEN evidence and source identities. No commits or pushes in Task14.

Authority: `docs/superpowers/specs/2026-09-14-arc-v8-durable-research-executor-design.md`, `outputs/local-durable-executor-20260914/authorization.json`, latest `docs/operations/v8-resume-checkpoint.md`, and completed Tasks1–13. The historical design approval/account/deployment restrictions are superseded by authorization/checkpoint. Its optional promotion of partial admission is also superseded: accepted `SiteAdmissionCoordinator` closes pending identity, rereads and releases only existing proven-unsent reservations; do not implement promotion or create missing reservations during recovery.

Scope ends at local public integration and two builds. Actual Cloudflare account/resources/secrets, migration backup and protected zero-Provider/20-minute cloud smoke belong to Task15; a new paid permit and real UAT belong to Task16; GitHub/public activation/release belong to Task17. Preserve the development banner and deployed Site state. Do not read real credentials, install dependencies or call real Provider/Repair.

## Verified API map and file responsibility

Current facts were independently read from source, not inferred from preparation notes:

| Existing file | Actual capability / consequence |
| --- | --- |
| `app/server/research/production-policy.ts` | `readResearchPolicyConfiguration`, `resolveResearchExecutor`: undefined defaults synchronous; only explicit `cloudflare-workflow-v1` selects remote; blank/unknown rejected. Already freezes the complete Kimi profile and remote fingerprint. Reuse unchanged. |
| `app/server/research/service-factory.ts` | `createNewCallService` and `createRecoveryService` currently return concrete `ResearchOrchestrator`; trusted configuration excludes remote and reads the Provider key only on synchronous path. Recovery omits `readRemoteExecution`. Runtime currently offers `environment/getD1/createProvider/now/createId`, no bridge fetch/monotonic override. |
| `app/server/http/research-route-factories.ts` | `ResearchRouteService = Pick<ResearchOrchestrator, "start" | "get" | "retry" | "recover">`; public success is HTTP200, already enforced by client. Auth, Origin, sec-fetch-site, body bounds, cohort, owner and account/IP rate rules are already present. |
| `app/server/http/research-eligibility-route.ts` | `createResearchEligibilityDependencies().configured` calls `readResearchProductionConfiguration`; its current synchronous-only/key requirement must be fixed by the shared configuration reader. |
| `app/server/research/repository.ts`, `d1-repository.ts` | `createRemoteOrReplay(CreateRemoteResearchRunCommand)`, `createRemoteRetry(CreateRemoteResearchRetryCommand)` return `{run,replayed,execution}`; recovery uses `findRecoveryRun(RecoverResearchRunCommand)`. `getPublicRun` already parses all four strict DTO variants, so a schema default needs no serializer/DB migration. |
| `app/server/research/site-admission.ts` | `admitNew(identity,{newCallsAllowed,cohortEnabled,rateAllowed})`, `reconcileBeforeBegin(identity)`; cache is checked before reserving. Existing partial reservations cause reconcile/close, not new reservation. |
| `app/server/research/site-bridge-factory.ts` | `createGuardedD1(db,guard)` and `createSiteBridgeOperations(db,guard,wallNow)` compose actual admission/import/expiry repositories. `SiteBridgeOperations` currently originates in HTTP; avoid expanding that dependency into the new domain service. |
| `app/server/research/site-bridge-repository.ts` | `lookup({jobId,requestHash})`, `recordAcceptance(proof)`, `readAcceptance(identity)`, `nextScan("maintenance"|"outbox")`. Public reads must never call `nextScan`. |
| `app/server/research/executor/executor-client.ts` | `submit(job,{signal})`, `status(job,{signal})`, `result(job,notice,originalGrant,{signal})`, `close(job,{signal})`; strict signed response parsing/matching lives here and in `bridge-contract.ts`. |
| `app/server/research/site-import.ts`, `site-expiry.ts` | `SiteImportCoordinator.complete(identity,receipt)` / `reconcileMetadata(identity,metadata)` and `SiteExpiryCoordinator.reconcile(identity,proof|null)` own completion/accounting; SQL repositories own deadline and terminal CAS. Import journal is read using `importJournal.read(identity)`. |
| `app/server/research/orchestrator.ts` | Legacy start/get/retry/recover normalization and replay exist. Remote `observeRemote` checks execution owner/run/request/quotaKey and avoids legacy `stateVersion` no-Provider inference. Do not rewrite synchronous execution/recovery. |

**New file boundaries (proposed names, not existing APIs):**

- `app/server/research/service.ts`: structural four-method `ResearchService` contract using existing `ResearchGateContext` and `ResearchRunPublicView`; no HTTP import.
- `app/server/research/site-bridge-operations.ts`: move only the existing `SiteBridgeOperations` type to this domain file; HTTP imports/re-exports it, existing composition imports it. No executable logic moves.
- `app/server/research/public-operation-scope.ts`: one service-operation deadline, cancellation and write fence, including mandatory owner/identity reads and local mutations as well as optional remote work. HTTP authentication/rate-limit work and unchanged synchronous delegation are outside this remote-service bound; do not describe it as a bound on the entire HTTP stack.
- `app/server/research/remote-public-reader.ts`: owner-first get/recover, local journal/expiry, bounded single-execution pull, acceptance enrichment and legacy-read delegation.
- `app/server/research/remote-public-service.ts`: remote start/retry plus delegation to the reader; no Provider capability.
- New focused tests use `tests/server/remote-public-reader.test.ts`, `tests/server/remote-public-service.test.ts`, `tests/server/public-operation-scope.test.ts`, `tests/server/research-service-factory.test.ts` and `tests/server/research-public-integration.test.ts`.
- `tests/helpers/research-public-fixture.ts`: actual public factory/handlers plus the persistent two-sided harness; synthetic auth/clock/transport only. Existing private fixture's mandatory pre-created/admitted run cannot be the public start under test.

Allow existing `site-bridge-factory.ts`/`research-bridge-routes.ts` edits only for the domain type move and carefully scoped composition reuse; no broad protected-module refactor. No new SQL tables, stored mode semantics, Provider policy or schema migration.

## Subtask 14.1 — Strict public compatibility contract

**Modify:** `app/contracts/research.ts`, `app/server/http/research-route-factories.ts`.
**Create:** `app/server/research/service.ts`.
**Tests:** `tests/contracts/research-contracts.test.ts`, `tests/api/research-routes.test.ts`; update only affected fixture outputs in `tests/lib/research-client.test.ts`, `tests/lib/use-role-research.test.tsx`, `tests/components/role-research-panel.test.tsx`, `tests/components/research-recovery-interaction.test.tsx`, `tests/components/research-setup-activation.test.tsx`, `tests/components/adaptive-setup-flow.test.tsx`, `tests/components/setup-flow.test.tsx`, `tests/pages/setup.test.tsx` after exact inventory confirms use.

- [x] Inventory typed DTO literals with `rg -n 'ResearchRunPublicView|ResearchSuccessEnvelope|planningData:|state: "queued"' app tests`; include inferred nested `RoleResearchController.run` fixtures, not merely direct type imports. Freeze the actual output-fixture edit list. Wire-format legacy fixture cases intentionally remain without the field.
- [x] Add RED for missing-field default on every variant, strict boolean (reject null/string/number), unknown property rejection, HTTP200 queued result and safe keys. Example existing schema call:

```ts
const queued = { id: "research-run-1", role: "Data Product Manager", locale: "en-US", state: "queued", retryable: false };
expect(researchRunPublicViewSchema.parse(queued).backgroundAccepted).toBe(false);
for (const backgroundAccepted of [null, "true", 1]) {
  expect(researchRunPublicViewSchema.safeParse({ ...queued, backgroundAccepted }).success).toBe(false);
}
expect(researchRunPublicViewSchema.safeParse({ ...queued, jobId: "private-job" }).success).toBe(false);
```

- [x] Run `node node_modules/vitest/vitest.mjs run tests/contracts/research-contracts.test.ts tests/api/research-routes.test.ts`; preserve actual expected failure on absent default/field behavior.
- [x] Add `backgroundAccepted: z.boolean().default(false)` to `publicRunIdentityShape`. Keep `ResearchRunPublicView` as schema **output**, strict variants and existing envelope limits. Add explicit `backgroundAccepted: false` to typed output fixtures; never make output optional, cast away missing properties or weaken Zod/tsconfig.
- [x] Define the domain contract and replace only the HTTP service alias:

```ts
import type { ResearchRunPublicView } from "../../contracts/research";
import type { ResearchGateContext } from "./orchestrator";
export interface ResearchService {
  start(ownerId: string, input: unknown, context: ResearchGateContext): Promise<ResearchRunPublicView>;
  get(ownerId: string, runId: string): Promise<ResearchRunPublicView | null>;
  retry(ownerId: string, runId: string, mutationId: string, context: ResearchGateContext): Promise<ResearchRunPublicView>;
  recover(ownerId: string, input: unknown): Promise<ResearchRunPublicView | null>;
}
```

`ResearchRouteService` becomes a compatibility alias of `ResearchService`. Existing `ResearchOrchestrator` already structurally satisfies it. Leave `D1ResearchRepository.getPublicRun` alone: its existing parse supplies false.
- [x] Re-run focused tests and all fixtures actually changed, then SPEC → different QUALITY. Check no public job/hash/URL/receipt/body/secret field was added and no status202 change slipped in.

## Subtask 14.2 — Bounded owner-first reading and local reconciliation

**Create:** `app/server/research/public-operation-scope.ts`, `app/server/research/remote-public-reader.ts`, `app/server/research/site-bridge-operations.ts`, `tests/server/public-operation-scope.test.ts`, `tests/server/remote-public-reader.test.ts`.
**Modify narrowly:** `app/server/http/research-bridge-routes.ts`, `app/server/research/site-bridge-factory.ts` for moving the existing type, not private handler behavior.
**Reuse:** `SiteImportCoordinator`, `SiteExpiryCoordinator`, `D1SiteExecutionRepository`, `D1SiteBridgeRepository`, existing legacy recovery service.

**SPEC-14.2-1 repair scope (2026-09-20):** Also narrowly modify `app/server/research/d1-site-execution-repository.ts`, `app/server/research/site-execution-repository.ts`, and `app/server/research/site-admission.ts` to distinguish a validated lifecycle read skew / already-begun observation from unrelated local errors. Preserve existing public error codes and all SQL admission/lease/accounting authority. Only emit a specific internal lifecycle marker after validating immutable identity, canonical job/hash and execution lifecycle. The reader may reread once only for this explicit provenance and matching identity/version evidence, never for arbitrary unavailable/conflict/storage errors coinciding with a stateVersion advance. Both snapshot and unbegun-admission catch paths must fail closed on independent errors. Before implementation, retain focused RED for a real acceptance SELECT failure concurrent with terminal import, an independent admission failure concurrent with begin, and conflict/immutable mismatch concurrent with advancement. Preserve genuine begin/terminal and bounded-deadline coverage. Add unchanged `tests/server/d1-site-execution-repository.test.ts` and `tests/server/site-admission.test.ts` to the six-file regression union (eight files). Scope now ten paths, of which these three are newly editable; original seven-file and RED records remain historical evidence. Root strict types, independent SPEC re-review, then different QUALITY are required.

- [x] Define the proposed reader API as a class `RemoteResearchReader` with `get(ownerId,runId)` and `recover(ownerId,input)` returning `Promise<ResearchRunPublicView|null>`. Dependencies include `createReadRepositories(guard)` returning `{research: ResearchRepository, executions: SiteExecutionRepository, bridge: Pick<SiteBridgeRepository,"lookup"|"readAcceptance">}`, `legacy: Pick<ResearchService,"get"|"recover">`, `createOperations(guard): SiteBridgeOperations`, `createExecutor(guard): ExecutorBridgeClient|null`, and `monoNow`. Factory closures must create guarded repositories and a **guarded D1 nonce store**, including initial owner/identity reads, not an unguarded response nonce writer. The final read-only refresh uses a distinct guarded repository composition and no executor capability. The narrow bridge read dependency was clarified during implementation on 2026-09-20: it is required to verify persisted identity/acceptance in the final read-only phase without exposing `recordAcceptance`, nonce writes or mutable operations. This does not expand behavior or the seven-file implementation scope.
- [x] Add RED tests with actual SQLite for owner-B hidden before any execution/network lookup; existing mutation normalization/retry-source matching; changed job/hash/request/quota/fingerprint rejected; remote stateVersion1 never treated as synchronous unsent; legacy recovery delegated; persisted acceptance true only for the exact run/job/hash. Spy on forbidden `begin`, `submit`, `admitNew`, `nextScan` and Provider capabilities and require zero calls on every read.
- [x] Add RED scope tests for a never-resolving initial owner read, status body, status consuming most of the budget before result, late close result, pending nonce claim and delayed DB acknowledgement. Start one **4500ms work phase at remote-service entry**, including mandatory owner/identity reads, local reconciliation and all optional network/import work, not 4500ms per request. Use monotonic remaining time, an `AbortController`, and a closed flag. A wall-clock timer returns on time even if fetch/DB ignores abort. `wait` rechecks guard after completion; `finish` aborts/fences in `finally`; guarded D1 disallows scheduling writes after expiration. Reserve at most500ms afterwards for a separate read-only refresh, so this service operation takes at most5000ms of configured waiting. A write already handed to SQLite may finish; recovery must reread its real durable result rather than claim rollback. No known verified snapshot means unavailable on timeout, never an invented queued result. Once an owned synchronous record is proven, close this scope before unchanged legacy delegation; this bound is not a rewrite of legacy synchronous behavior.
- [x] Run `node node_modules/vitest/vitest.mjs run tests/server/public-operation-scope.test.ts tests/server/remote-public-reader.test.ts`; retain RED.
- [x] Implement owner-first sequence, with no duplicate SQL authority:

```ts
// Open the one work scope before initial DB access; obtain an owner-authorized record.
// For recover use researchRecoverRequestSchema, NFKC/trim/space normalization,
// fingerprint([normalizedRoleKey, locale]) and findRecoveryRun, as legacy does.
if (!run) return null;
if (run.executionMode === "synchronous") return legacy.get(ownerId, run.id);
// Read Site execution, then reread owned run to resolve concurrent begin/terminal reads.
// Assert owner/run/request/quotaKey, input/config fingerprint, role/locale,
// original job hash and frozen lease relationship using current repository validation.
// Only then read a public snapshot and persisted matching acceptance.
// Continue the SAME scope using createOperations(scope.ensure); do not reset its timer.
```

Local mandatory identity/public reads fail closed on corruption/unavailability; optional transport failure never fabricates a terminal state. For validated `beganAt === null`, invoke `admission.reconcileBeforeBegin(identity)` only: pending closes, admitted live stays queued, expired unbegun closes/releases existing proof; no new admission or submit. For begun runs, read `importJournal.read(identity)` first and resume `imports.reconcileMetadata(identity,journal.metadata)` when present, before `expiry.reconcile(identity,null)` lets SQL decide actual expiry. This lifecycle order was corrected during implementation on 2026-09-20: the existing import repository deliberately rejects unbegun/queued executions, so journal-first applies to begun work, as in accepted private maintenance. Preserve that authority; a concurrent begin still uses the single bounded authoritative reread.

With a valid connection and no completed local journal, one signed `status(job,{signal})` may discover a result. Match `metadata` using `matchBridgeMetadata`; reconstruct `parseBridgeBeginGrant` exclusively from persisted `job.protocol/jobId/requestHash/beganAt/executionExpiresAt`; require exact frozen-grant equality. For `bodyState === "available"`, construct `parseReceiptNotice({jobId,requestHash,receiptHash})`, fetch `result(job,notice,grant,{signal})`, call `imports.complete(identity,receipt)`. For unavailable/cleaned body use matched metadata with `reconcileMetadata` (fee-only rules stay in existing import/publication, including SQL-expiry requirements; a still-live bodyless result fails closed rather than bypassing those rules).

If status has `unsent`, validate via `matchUnsentProof` and original grant. Only after SQL expiry/recovery demonstrates expired-unknown and original conservative-hold reservation, may an `unclaimed` status without proof cause one bounded `close(job,{signal})`; match its proof and call `expiry.reconcile(identity,proof)`. Never close live work. 404, timeout, claimed state and Workflow errors are not unsent. No remote acknowledgement is necessary for public correctness; accepted Cron/callback delivery will acknowledge/clean the receipt.

After work, reread the owner's run/public view and matching acceptance with a separate **500ms read-only final scope**, making the work phase plus final refresh at most5000ms. Missing connection or a recognized transport timeout can return the last verified local snapshot; a final refresh timeout may do so only when no newer contradictory evidence was observed. Explicit local identity/hash/grant mismatch, malformed persisted row, or DB error fails closed with unavailable/conflict, never becomes a false-success fallback. A concurrent legitimate begin/terminal transition is not identity corruption: reread once within the same remaining work budget and follow the authoritative current mode/lease; never combine a pre-begin run with a later grant or restart the timer. If a mutation may have committed after the scope ended, the next read reconciles its journal. Missing connection/gates closed still permit all provable local history and local expiry. Do not chain unlimited fallback attempts. No collection maintenance or global cursor access.
- [x] Acceptance enrichment is one strict parse of `{...view, backgroundAccepted: proof !== null}` after `readAcceptance(identity)` and `matchAcceptedProof(proof,execution.job)`; never use `status.accepted`, queued state, Workflow ID or absence of error as proof. Missing proof means false; malformed/mismatched persisted identity is unavailable, not true.
- [x] Run focused reader/scope tests plus `tests/server/site-expiry.test.ts`, `tests/server/site-import.test.ts`, `tests/server/research-recovery.test.ts`, `tests/api/research-bridge-routes.test.ts`. SPEC → different QUALITY checks SQL authority, timeout/nonce fencing, terminal non-resurrection and independent late cost.

## Subtask 14.3 — Remote start/retry with durable acceptance

**Create:** `app/server/research/remote-public-service.ts`, `tests/server/remote-public-service.test.ts`.
**Dependencies:** `ResearchRepository & RemoteResearchCreationRepository`, `SiteExecutionRepository`, `SiteAdmissionCoordinator`, matching bridge acceptance repository, executor client creation under the request scope, `RemoteResearchReader`, trusted `ResearchProductionConfiguration`, `now/createRequestId` and current-new-call gate. No Provider interface or key appears in this module.

- [x] Add RED using actual `createRemoteOrReplay`/`createRemoteRetry` and admission repositories: fresh queued start; replay of same mutation; active alias replay; retry of original terminal run with unchanged role/input; changed fingerprint rejected; cached Ready reserves no quota/budget and makes no submit; partial-admission close/reread; denied/expired admission; ambiguous submit/acceptance acknowledgement loss. Replayed operations must not call `admitNew` or `submit`; accepted outbox/Cron owns resubmission of the original job.
- [x] Run `node node_modules/vitest/vitest.mjs run tests/server/remote-public-service.test.ts`; retain RED.
- [x] Implement `RemoteResearchService implements ResearchService`. Start uses existing strict request parsing, owner text validation and exact legacy normalization; call `createRemoteOrReplay` with server-generated requestId, normalized role/input fingerprint, current config fingerprint and:

```ts
const policy = {
  cacheDays: configuration.cacheDays,
  userDailyQuota: configuration.userDailyQuota,
  dailyBudgetMicros: configuration.budget.dailyBudgetMicros,
  monthlyBudgetMicros: configuration.budget.monthlyBudgetMicros,
  maximumMicros: configuration.budget.maximumMicros,
};
```

Retry verifies owner first and uses `createRemoteRetry({ownerId,runId,requestId,mutationId,currentConfigFingerprint:configuration.configFingerprint,policy})`; repository remains authority for terminal/retryable/source identity. Do not change an existing run's stored executor mode or config.
- [x] Start the same4500ms work/500ms final-read scope before owner lookup or creation, and construct all mutation/admission/acceptance repositories behind its guard. For a newly created run only, call `admitNew` with actual session gate and current `newCallsAllowed`. If ready/closed, return its local DTO. If admitted/live, make **one** signed short `submit(execution.job,{signal})`; validate returned proof, `recordAcceptance(proof)`, then **reread and verify** `readAcceptance(identity)` before exposing true. Creation, admission, submit and acceptance share one remaining budget, including guarded nonce/repository writes. If submit or record acknowledgement is ambiguous, return the original provable queued/active DTO only if no newer contradiction is known (false unless matching proof can actually be read); leave the admitted outbox identity intact for independent Cron, do not create another job, retry Provider or claim unsent. Unknown creation/admission result or failed required local identity reads map to `RESEARCH_UNAVAILABLE` and existing pending-mutation recovery; never synthesize success from a timed-out write.
- [x] Writes return a local snapshot without invoking the optional reader status/result phase; start never waits for Provider. Expose a private/local-view helper shared with the reader rather than calling public `get` and accidentally chaining another 4500ms scope. The public HTTP route remains200 for queued/active/Ready. Active Provider execution may race ahead after durable acceptance; the service promises no Provider wait, not that every real response state must always remain queued.
- [x] GREEN tests assert immutable original job/hash, at most one reserve each, one submit for a genuinely new admission, original fixed reservation/queue deadlines, false without persisted proof, no external call on cache. Reuse admission/expiry tests for storage faults rather than reproducing their implementations. SPEC → different QUALITY.

## Subtask 14.4 — Production factory and eligibility selection

**14.4 compatibility-test scope amendment (2026-09-20):** Also narrowly update `tests/server/research-policy-migration.test.ts`. The actual first11-file regression was351/353; the only two failures dereference a private `ResearchOrchestrator.config` after the factory correctly returns the structural mode-aware service. Replace those two private-field assertions with actual SQLite creation/lease behavior, preserving exact Provider arguments and1260000/60000ms deadlines. Do not expose a private config shim or weaken compatibility. Root captured the original protected test, current candidate and failed evidence before edits; six editable paths,503 protected,479 current type inputs. Original RED and failed GREEN remain historical evidence; final GREEN/lint use new r2 reports.

**Modify:** `app/server/research/service-factory.ts`, `app/server/http/research-eligibility-route.ts` only if needed to use the shared configuration reader.
**Create:** `tests/server/research-service-factory.test.ts`.
**Extend tests:** `tests/api/research-eligibility.test.ts`, `tests/api/research-routes.test.ts`, `tests/server/research-executor-configuration.test.ts` only for newly exposed integration behavior.

- [x] Add RED for remote selection at every production public entry: config read, rateLimitPerMinute, eligibility, createNewCallService, createRecoveryService, start/get/retry/recover. Use a **throwing getter with a call counter**, and a throwing `createProvider` spy. Also test omitted selection retains prior synchronous fingerprint/provider arguments, blank/unknown selection fails before DB/Provider/external request, incomplete bridge/profile rejects new calls, closed gates do not hide reads.

```ts
const keyRead = vi.fn(() => { throw new Error("Site must not read Provider key"); });
const environment = { ...TEST_PRODUCTION_ENVIRONMENT };
Object.defineProperty(environment, "OPENROUTER_API_KEY", { get: keyRead });
const createProvider = vi.fn(() => { throw new Error("Site must not construct Provider"); });
const factory = createResearchServiceFactory({ environment, getD1: () => db, createProvider,
  fetch: bridgeFetch, now: wallNow, monoNow });
expect(factory.createNewCallService()).not.toBeNull();
expect(factory.rateLimitPerMinute()).toBeGreaterThan(0);
expect(keyRead).not.toHaveBeenCalled();
expect(createProvider).not.toHaveBeenCalled();
```

`TEST_PRODUCTION_ENVIRONMENT` is the existing synthetic remote fixture in `tests/helpers/research-bridge-fixture.ts`. `db/bridgeFetch/wallNow/monoNow` are the fixture's existing real-SQLite/synthetic transport/clock bindings; the runtime additions below deliberately make this construction valid.
- [x] Run `node node_modules/vitest/vitest.mjs run tests/server/research-service-factory.test.ts tests/api/research-eligibility.test.ts tests/api/research-routes.test.ts`; retain RED.
- [x] Change factory return annotations to `ResearchService`/`ResearchService|null`. Add **only** `fetch?: typeof fetch` and `monoNow?: () => number` to `ResearchServiceFactoryRuntime`; existing `now` is the bridge wall clock. Keep server-generated random jobId from the actual D1 repository; no browser controls or unnecessary runtime knobs.
- [x] `readResearchProductionConfiguration` first selects credential-free policy; remote requires valid `readResearchBridgeConnection` and existing salt validation and returns `selection.configuration` without touching `OPENROUTER_API_KEY`. Synchronous branch retains existing secret/salt checks and projection exactly. Use that same reader for rateLimitPerMinute and eligibility; do not use object spreading of the environment with a throwing key getter. New service construction selects remote before Provider construction. New-call gates are rechecked by admission and existing signed begin; no weaker substitute configuration.
- [x] `createRecoveryService` always creates a mode-aware read composition independently of new-call selection and credentials. Build the existing disabled-Provider legacy recovery orchestrator as the legacy delegate; route remote runs to `RemoteResearchReader`. Read valid bridge connection independently of new-call flags and allow null executor when unavailable. Supply `readRemoteExecution` to any legacy orchestrator path that can still encounter a remote alias, or ensure all get/recover records are dispatched by stored mode before delegation. Its start/retry methods remain unavailable in recovery-only composition. Use actual `createSiteBridgeOperations` and guarded D1 repositories; protected nonce claim must share the optional scope fence.
- [x] GREEN covers actual start/get/retry/recover handler factories with synthetic authenticated users, actual owner checks, unchanged origin/sec-fetch-site/strict request rejection, account and IP rate limits, cohort and bounded bodies. Assert client payload containing executor/model/URL/owner controls fails strict parsing. SPEC → different QUALITY checks synchronous exact compatibility, no key access including eligibility and no HTTP↔domain cycle.

## Subtask 14.5 — Factual accepted-background guidance and recovery behavior

**Modify:** `app/components/setup/role-research-panel.tsx`.
**Tests:** `tests/components/role-research-panel.test.tsx`, `tests/components/research-recovery-interaction.test.tsx`, `tests/lib/research-client.test.ts`, `tests/lib/use-role-research.test.tsx`, `tests/pages/setup.test.tsx`.
**Read/retain:** `app/lib/research-client.ts`, `app/lib/use-role-research.ts`, `app/lib/research-recovery-storage.ts`, `app/setup/page.tsx`; edit only if a focused RED demonstrates necessary propagation, not for unrelated cleanup.

- [x] Add RED that guidance appears for each active server run with true; absent for false, omitted legacy wire DTO, submission with no run, terminal runs and ambiguous response. Proposed copy: `Research is running in the background. You can leave this page and return to check its progress.` Avoid a guaranteed completion promise. Assert retained role/run/owner identity and no private data in rendered text.
- [x] Add recovery interaction RED around a dropped POST response: existing pending mutation remains, remount uses recover with original mutation, owner/epoch change ignores stale completion, no automatic start/retry, explicit replacement still required. A successful queued200 should end POST waiting and follow existing poll behavior; it must not be misclassified as an unusable response.
- [x] Run `node node_modules/vitest/vitest.mjs run tests/components/role-research-panel.test.tsx tests/components/research-recovery-interaction.test.tsx tests/lib/research-client.test.ts tests/lib/use-role-research.test.tsx tests/pages/setup.test.tsx`; retain RED for new guidance.
- [x] Implement the narrow predicate using the **run** state, not broad `busy/restoring` UI flags:

```tsx
const backgroundAccepted = run?.backgroundAccepted === true
  && (run.state === "queued" || run.state === "researching" || run.state === "validating");
// Inside the existing live status block:
{backgroundAccepted && <p>Research is running in the background. You can leave this page and return to check its progress.</p>}
```

Preserve pending storage schema, confirmation/owner/epoch semantics, focus/live region, Flagship fallback, development banner and use-this-research activation.
- [x] GREEN focused tests, then SPEC → different QUALITY including keyboard and owner-switch behavior. No UI redesign.

## Subtask 14.6 — Full public local integration, browser UAT and acceptance

**Create:** `tests/helpers/research-public-fixture.ts`, `tests/server/research-public-integration.test.ts`, `tests/offline-uat/research-public-composition.ts`, `tests/offline-uat/research-public-recovery.test.mjs`.
**Narrow harness changes:** `tests/offline-uat/server.mjs` adds an explicit synthetic durable composition mode while preserving default offline behavior. Reuse `main.tsx`, `browser-runtime.tsx`, `security.ts`, existing actual setup/planning UI. If sharing persistent infrastructure is materially smaller, modify `tests/helpers/research-executor-private-fixture.ts` to extract only transport/storage plumbing into new `tests/helpers/research-executor-local-runtime.ts`; preserve all existing private tests and make public mode start with **no run/admission**. Freeze this choice in the subtask scope before editing.
**Read/reuse:** `tests/server/research-executor-private-integration.test.ts`, `tests/server/site-import-integration.test.ts`, `tests/server/research-planning-integration.test.ts`, `tests/components/research-setup-activation.test.tsx`, `tests/offline-uat/composition.ts`.

- [x] Add the new positive test first and demonstrate RED through actual public start: `createResearchStartHandler` using actual `createResearchServiceFactory` configured remotely, synthetic auth returning owner-A, actual D1 rate limiter/cohort and a throwing Site Provider-key getter. Use two distinct persistent SQLite files, real persistent local R2, actual signed Site/executor handlers, actual `createExecutionRuntime`/`runResearchJob`, `createMaintenanceRuntime`/`runExecutorMaintenance`, actual OpenRouter adapter with valid synthetic envelope. Synthetic Workflow scheduling persists instance identities and lets the test run its body independently **after** public POST returns; do not replace a production handler with a direct seed/admit call.
- [x] Proposed public fixture API is `createResearchPublicFixture()` returning `dispatch(request,owner)`, `siteDb`, `executorDb`, `runWorkflowBody(jobId)`, `runCron()`, `reopen()`, `dispose()`, clocks, counters and the existing private interceptor capabilities. Expose only synthetic aggregate diagnostics over loopback. Requests under test use public handlers and their session dependency; `owner` is test harness state, never a client JSON authorization control. Resolve the created job for subsequent test scheduling from owner-verified server records, never from a public DTO.
- [x] Run `node node_modules/vitest/vitest.mjs run tests/server/research-public-integration.test.ts`; retain initial RED and implement the harness only, repairing product sources only after a real focused RED and scope amendment.
- [x] Required assertions in the final positive flow:

```ts
const response = await fixture.dispatch(startRequest, "owner-a");
expect(response.status).toBe(200);
const { run } = await response.json();
expect(run.state).toBe("queued");
expect(run.backgroundAccepted).toBe(true);
expect(fixture.syntheticProviderCalls()).toBe(0);
// Discard response at the browser transport boundary; retain original pending mutation.
// Recreate browser UI state and both server runtime graphs from durable files/R2.
// Run independent Workflow/Cron; recover through public handler/client.
expect(recovered.run.id).toBe(run.id);
expect(recovered.run.state).toBe("ready");
expect(fixture.syntheticProviderCalls()).toBe(1);
expect(fixture.repairCalls()).toBe(0);
```

Supplement with actual SQL snapshots: one execution/job/dispatch, one accepted quota unit, one reservation settlement at trusted cost, one audit, one package, complete import journal. Callback and user pull race against the same persisted receipt; results/counters remain identical after graph rebuild and repeated get/recover. Owner-B returns404 before remote access. Feed the recovered package through actual CloudService research-setup activation, PlanningService/PlanningSourceResolver and newly constructed D1 readers on reopened storage; compose the accepted Task12 fixture chain rather than asserting only DTO Ready. Preserve original source package and owner mapping.
- [x] Failure matrix maps each row to new public assertions or a current accepted focused test: expired queued/unbegun, interrupted partial admission, submit response loss, acceptance write acknowledgement loss, gates closed, bridge config missing, status/result body stall and full-chain4500ms total budget, guarded nonce/write after timeout, claimed-but-no-receipt unknown hold, original frozen grant mismatch, late trusted cost without revival, owner hidden, changed retry fingerprint, no Site key getter, cache no quota/budget/Provider. Read/get must never submit/begin/admit or advance either global cursor; compare cursor rows before/after public calls. Keep existing Task13 crash/maintenance matrix as evidence for unchanged internals, do not rewrite it.
- [x] Browser harness must solve the existing origin split explicitly: private bridge configuration requires HTTPS origins while local UI serves `http://127.0.0.1`. Keep bridge production parser strict. In the test composition, use fixed synthetic HTTPS Site/executor origins for signed private transport; adapt **public** configuredOrigin to loopback at the harness boundary, and retain genuine browser Origin/sec-fetch-site validation there. No parser relaxation, broad asset allowlist or exposed private keys. Existing offline server only injects synthetic auth and uses in-memory/synchronous composition; its old recovery test is compatibility coverage, not durable public acceptance.
- [x] Run `node --test tests/offline-uat/research-public-recovery.test.mjs tests/offline-uat/research-recovery.test.mjs` with installed dependencies. Use actual browser tooling on the running loopback durable harness to submit, lose first response, close/recreate page state with retained localStorage, let independent runtime finish, reopen/recover, switch owner, activate recovered research and inspect resulting plan. Record screenshot paths and safe counters/IDs, request sequence and no extra Provider calls. Browser UAT is local/synthetic; it is not real login, Cloudflare deployment or a 20-minute cloud-runtime claim. Stop/clean only harness resources owned by the test, with validated absolute temporary paths.
- [x] Freeze final source manifest and run the **union once** of Task13's accepted 53 regression files and all Task14 changed/new contracts, service, API, hook, component, page and integration tests. Deduplicate the list before invoking installed Vitest; use JSON reports and record executable/args, exit codes, counts, skips and source hashes. A prior subtask run is not represented as a fresh whole-task run. Rerun only affected checks after fixes.
- [x] Type every current TS/TSX/MTS input with root strict options unchanged. Generate an evidence-only tsconfig under E extending `../../tsconfig.json`, `incremental:false`, and the root include patterns rebased to `../../`; exclude only historical `../../outputs/**` plus existing node_modules exclusion. Enumerate actual resolved inputs with TypeScript API, assert no current app/db/worker/tests source omitted, save input list/count, then run `node node_modules/typescript/bin/tsc --project outputs/local-durable-executor-20260914/task14-typecheck.json --noEmit --incremental false`. Do not hardcode historical470 or relax target/types/strict/skipLibCheck.
- [x] Lint explicit affected `.ts/.tsx/.mjs` files from the final manifest, recording the expanded argument array:

```powershell
$task14LintFiles = (Get-Content -LiteralPath 'outputs/local-durable-executor-20260914/task14-final-source-manifest.json' -Raw | ConvertFrom-Json).lintFiles
node node_modules/eslint/bin/eslint.js @task14LintFiles --format json --output-file outputs/local-durable-executor-20260914/task14-final-lint.json
```

- [x] Full local Site build belongs to Root as Site owner. At Task14 start Root reads the existing Site with `get_site`, then runs the following absolute scripts as **separate calls** in this checkout (build after final sources are frozen):

```text
node C:/Users/XF/.codex/plugins/cache/openai-curated-remote/sites/0.1.65/scripts/configure-execution-profile.mjs
node C:/Users/XF/.codex/plugins/cache/openai-curated-remote/sites/0.1.65/scripts/build-site.mjs
```

`build-site.mjs` invokes the existing package build script, which is `node scripts/run-vinext.mjs build`; do not run both redundantly. Preserve `.openai` identity, lockfile, dependencies, scripts and checkout. Only the ignored execution profile may be refreshed; if unsupported, keep existing configuration. Root has read the Sites building skill (reported Root call ee15c0). Its default asset-only delegation is superseded by the user's explicit approved code-subagent workflow; no repeat permission question. Root alone performs Sites/tool/lifecycle actions. Local Task14 scope and deferred Task15/17 publication supersede the skill's default immediate-publish flow. No create/save/deploy, resource or credential mutation in this stage.
- [x] Independent Worker build/type/runtime commands, each recorded to new Task14 reports:

```text
node scripts/build-research-executor.mjs --report-name task14-final-executor-build
node node_modules/typescript/bin/tsc --project worker/research-executor/tsconfig.json --noEmit --incremental false
node scripts/test-research-workflow-runtime.mjs --report-name task14-final-workflow-runtime
```

Build script currently writes its bundle/metafile into E/task13-build regardless of report name. Before rerunning, copy the exact accepted Task13 build outputs to a new immutable E/task13-accepted-build-archive directory and record both original paths/hashes and archive paths/hashes, then link this archive from Task14 provenance. Do not silently overwrite evidence and claim it is still the original accepted artifact. No build-script change is needed solely to relocate output. The runtime smoke's host-seeded acceptance is a known limitation; full public fixture/browser evidence above supplies public acceptance/accounting coverage.
- [x] Whole Task14 independent SPEC then different QUALITY review covers actual source identities, regression/native/browser evidence, failure matrix and scope. Root reads both outcomes, resolves concrete findings with focused RED/GREEN, verifies protected source identities and records completion. Update `docs/operations/v8-resume-checkpoint.md` only on Root acceptance; leave deployment/account/paid-request items explicitly with Tasks15–17.

## Draft self-review and remaining API decisions

All approved Task14 behavior is assigned: contracts/compatibility14.1, owner/local/remote reads and deadline14.2, immutable writes/admission/acceptance14.3, production/eligibility/no-key14.4, safe UI/pending mutation14.5, native/browser/full builds14.6. No additional user approval or execution-method question is needed under the existing authorization.

Concrete issues for Root plan review (routine implementation decisions, not architecture blockers):

1. `createSiteBridgeOperations` returns a type currently declared in HTTP; the minimal type-only move above resolves that layering concern without changing private handlers.
2. There is no reusable exported deadline helper or public single-run observer. Add the scoped helper/reader; don't expose collection `maintainOne` as user-get, and don't pretend per-request BridgeTransport5s bounds a status→result→import chain.
3. Existing private fixture seeds a remote admitted execution; choose extraction of its storage/transport plumbing or a separate public fixture, ensuring the public integration creates the first run through the factory/handler. Existing offline browser origins require the documented test-only public-origin adaptation.
4. `scripts/build-research-executor.mjs` has a fixed Task13 bundle output directory. Use the immutable Task13 archive specified in14.6 before final builds; no build-script change is needed merely for output location.

The draft's test code specifies boundary assertions and new interfaces/flow; implementers write the complete focused cases under the explicit TDD steps, retaining actual repository/handler/adapter integration.
