# Arc v8 Task15 Cloud Smoke Implementation Plan

**2026-09-21 最新：long 与 after-R2 已验收；after-D1 已接单但未按期恢复，实际捕获 Workers Free CPU 超限。Task15及完整公开发布仍未完成。**

用户 after-D1 启动 ExitCode:0；固定 job ...0153 的原始结果已在 D1/R2 保存，模拟 Provider1/Repair0。原生日志记录08:49:29Z定时执行 outcome=exceededCpu、cpuTime10ms；仅证明这一条真实CPU超限，不将全部缺失Cron结束记录归为同一原因。原execution截止09:01:23.736Z（北京时间17:01:23.736）已过；09:02:14–42Z八项成功只读查询仍显示researching、无结果投递/import/package/已结算/expiry recovery，有未确认的acceptance-delivery记账行。第九项Cron容量查询fetchFailed保留。不能把时钟过期当作已落库失败，也不能延长原deadline将本轮判为Ready成功。

after-R2 ...0152 独立审查PASS_WITH_OBSERVATION_LIMITS：自然Cron恢复、Ready/phase5/单次结算与tombstone匹配；未直接拍到R2存在且D1缺失的瞬间。long ...0151的19分30.042秒、客户端退出后运行、结算清理和新进程status证据继续有效。合并的两故障清单项仍未完成，云端清单保持5/8。

用户先前选择Free直到实测遇限；现已提供实际CPU超限证据并询问是否升级Workers Paid（账户最低USD5/月、超额另计）或先评估Free优化。用户已明确选择“升级 Workers Paid，继续验证（推荐）”，升级授权已取得；实际购买与生效尚待用户Dashboard操作及核验。浏览器控制连接失败，未访问或点击付款页面；无需再次请求该套餐的消费授权。保留原任务和证据，不重跑start、不清理身份或改deadline。后续先按用户选择解决CPU容量并处理原任务超时收尾；新的成功演练需受审延续方案。Cron每分钟与隔离ACCEPT_NEW仍保持，不额外发起任务；关闭时必须采用保留Secrets的新false配置，既有工作settle/stopped后再关Cron。

完整证据与恢复入口：outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20260921/long-run/cpu-limit-current-progress.md、cpu-limit-handoff.json、after-r2-completion.json和after-d1-cpu-evidence-review.md/json。真实Provider请求0，第18次未授权；冻结bundle/部署、生产Site/数据/DNS未变。公开站点仍v10且Research关闭；signed replay/owner验证、Sites一致备份与隔离恢复、受保护部署、Tasks16/17仍待。目标保持active，本轮有实质诊断进展；以下冲突状态均为历史。


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each implementer is followed by independent SPEC and then a different QUALITY reviewer.

**Goal:** Prepare and locally verify a deployable, isolated zero-Provider composition of the accepted Research Workflow, then collect separate cloud lifetime and Cron recovery evidence after account prerequisites are resolved.

**Architecture:** A fail-closed build alias injects synthetic Provider and fixed service-binding transports into the unchanged production Workflow/runtime. A paired smoke Site Worker uses the production bridge/import/admission graph with empty isolated storage. Cloud and local timing are separate build compositions; cloud timing is fixed at 19m30s through the actual adapter.

**Tech Stack:** Existing TypeScript/Zod, esbuild, Vitest, installed Miniflare/Workerd, D1/R2/Workflow bindings, and accepted HMAC/nonce helpers. No dependency installation.

---

## Adoption and scope

Root adopts this plan after complete reading and API/source self-review; the original candidate remains in E. Independent design review r2 accepted `docs/superpowers/specs/2026-09-20-arc-v8-cloud-smoke-design.md`, SHA256 `e036e15a7b45e18eeebc88731a563b5dcd602df2017e9e3bb826a9645d591180`; the receipt is `E/task15-smoke-design-acceptance.json`. No implementation is claimed by adoption. Existing local implementation, SBD/TDD and deployment authorization does not need a new generic approval. This plan adds no paid Provider permit or plan-purchase authority.

`W` is the current `v8-openrouter-research-beta` worktree. `E` is `outputs/local-durable-executor-20260914`. All commands below run from W using installed `node_modules`; commands are future execution instructions, not results from this planning task.

Preserve all accepted production files, existing migration files, package/lock files, existing tests, existing build outputs and Git state. Root first records new-file ownership and protected hashes. No real credential access, installs, account operations, production migrations, paid Provider/Repair, Git commits or pushes during local subtasks. New evidence is written under `E/task15-smoke/` using unique names. A missing installed capability is reported without installing or silently reducing verification.

**Source correction already agreed with Root:** `D1ResearchRepository.findFreshPackage` is global across owners (`d1-repository.ts:272`), so distinct owners alone do not prevent cache hits. Use distinct fixed role inputs and matching candidate role names/IDs for all three scenarios, plus distinct owners; keep the exact production configuration fingerprint. Validate all candidate variants locally. Do not change cache semantics, add scenario suffixes to policy fingerprints, delete existing packages, or allocate extra Site databases per case.

## File ownership and interfaces

Only the following new files belong to local implementation; existing files are read-only references.

| Subtask | New files owned |
|---|---|
| 15.1 | `worker/research-executor-smoke/{environment,scenarios,timing,evidence,transports}.ts`; `worker/research-executor-smoke/migrations/0000_smoke_evidence.sql`; `tests/server/research-cloud-smoke-transports.test.ts` |
| 15.2 | `worker/research-executor-smoke/site-entry.ts`; `tests/helpers/research-cloud-smoke-fixture.ts`; `tests/server/research-cloud-smoke-control.test.ts` |
| 15.3 | `worker/research-executor-smoke/{runtime,executor-entry}.ts`; `worker/research-executor-smoke/tsconfig.json`; `scripts/build-research-executor-smoke.mjs`; `tests/fixtures/research/cloud-smoke-local-{timing,executor-entry}.ts`; `tests/server/research-cloud-smoke-build.test.ts` |
| 15.4 | `scripts/test-research-cloud-smoke.mjs`; `tests/server/research-cloud-smoke-composition.test.ts`; extend only the new helper from 15.2 for native paired-Worker persistence |

Do not create deployable Wrangler resource manifests during these local tasks. After verified account inventory exists, the operational phase owns `worker/research-executor-smoke/wrangler.executor.jsonc` and `wrangler.site.jsonc`; they must point to reviewed prebuilt cloud artifacts with no source rebuild. No placeholder resource IDs or secrets.

Public smoke-module contracts are deliberately small:

```ts
type SmokeScenarioId = "long" | "after-r2" | "after-d1";
type SmokeTiming = Readonly<Record<SmokeScenarioId,
  Readonly<{ headersMs: number; bodyMs: number }>>>;
type SmokeScenario = Readonly<{
  id: SmokeScenarioId; ownerId: string; otherOwnerId: string;
  mutationId: string; requestId: string; jobId: string;
  role: string; roleId: string; locale: "en-US";
}>;
```

`scenarios.ts` exports `SCENARIOS`, strict `parseScenarioId(input)`, `scenarioForJob(job)`, and `candidateForScenario(id)`. `scenarioForJob` accepts the accepted `BridgeJob`, validates fixed identity/role/locale and returns its scenario; it does not trust a client-selected job. `environment.ts` defines `SmokeExecutorEnvironment = ExecutorEnvironment & { SMOKE_SITE: Fetcher }` and `SmokeSiteEnvironment = ResearchProductionEnvironment & { SMOKE_SITE_DB: D1Database; SMOKE_EXECUTOR: Fetcher; SMOKE_CONTROL_KEY_ID?: string; SMOKE_CONTROL_SECRET_HEX?: string }`.

`evidence.ts` owns bounded evidence only: scenario start identity, immutable fault markers, Provider invocation/Repair/rejection counters, and Cron start/end events. It does not implement business lifecycle, acceptance, leases, import, quota, or budget. Evidence tables are created separately in each smoke D1 as needed; no cross-database transaction is claimed. Evidence reads return a bounded typed projection, not SQL or raw rows.

`transports.ts` exports `createBridgeFetch(binding, peerOrigin, target)` with `target: "site" | "executor"`, `createSyntheticProviderFetch({ currentJob, evidence, timing })`, and `waitForSmokeDelay(ms, signal)`. `currentJob(): BridgeJob` must fail until this runtime invocation has read exactly one matching real job. No transport calls global fetch or falls back to another transport.

The production-named exports from smoke `runtime.ts` retain the accepted factory argument/return contracts. `site-entry.ts` exports its default Worker only. The build script exports `buildSmoke({profile, reportName})`, where profile is exactly `"cloud" | "local"`, plus its same-named CLI. The driver has exactly `local`, `start` and `status` modes; none provisions resources or reads account OAuth state.

## Subtask 15.1 — Fixed scenarios and sealed transports

Read `openrouter-provider.ts`, `execution-policy.ts`, `executor/{auth,body,connection-config}.ts`, `tests/fixtures/research/valid-candidate.ts`, and the fixed-role correction above.

- [x] Add RED tests for these exact constants and the three candidate variants:

```ts
const expected = [
  ["long", "Data Product Manager", "data-product-manager"],
  ["after-r2", "Senior Data Product Manager", "senior-data-product-manager"],
  ["after-d1", "Lead Data Product Manager", "lead-data-product-manager"],
] as const;
expect(SCENARIOS.map(s => [s.id, s.role, s.roleId])).toEqual(expected);
expect(new Set(SCENARIOS.map(s => s.ownerId)).size).toBe(3);
expect(new Set(SCENARIOS.map(s => s.jobId)).size).toBe(3);
for (const scenario of SCENARIOS) {
  const candidate = candidateForScenario(scenario.id);
  expect(candidate.role.name).toBe(scenario.role);
  expect(candidate.role.id).toBe(scenario.roleId);
  expect(validateResearchCandidate(candidate, validAnnotations,
    fixture.execution.validationContext).ready).toBe(true);
}
```

Use `createSiteImportFixture()` solely to supply the accepted validation context for this unit test and dispose its database in `finally`. Clone the valid fixture before changing role name/id; preserve skills, resources, templates, evidence and annotations. Fixed fixture UUIDs are `00000000-0000-4000-8000-000000000151`, `...152`, `...153`; fixed owners/mutations/requests use `task15-long`, `task15-after-r2`, `task15-after-d1` suffixes. These are synthetic job identities, never cloud resource IDs.

- [x] Run `node node_modules/vitest/vitest.mjs run tests/server/research-cloud-smoke-transports.test.ts`; retain the actual RED. Add `// @vitest-environment node` to the new server test.
- [x] Implement strict scenario parsing and fixed timing. Both timing modules export `SMOKE_TIMING: SmokeTiming`. Cloud `long` is `{headersMs:1_140_000, bodyMs:30_000}`; both fault cases use `{headersMs:10, bodyMs:10}`. The cloud module has no environment/body override. Local timing arrives only through the later local build alias.
- [x] Implement cancellation without CPU polling. The delay primitive follows this exact lifecycle, including already-aborted signals:

```ts
export function waitForSmokeDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (!Number.isSafeInteger(ms) || ms < 0 || ms > 1_170_000) {
    return Promise.reject(new Error("Invalid smoke delay"));
  }
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort);
      reject(new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
```

The synthetic fetch uses the adapter's provided signal, validates the exact OpenRouter POST URL, `redirect: manual`, bounded JSON body, bound job role/locale, fixed model/low/32768/privacy/search configuration and absence of Repair. It records an invocation effect only after validation, waits for headers, then supplies a bounded JSON `ReadableStream` whose body wait is cancellable. Return the accepted OpenRouter response shape with fixture citations and fixed synthetic usage: 10 prompt tokens, 20 completion tokens, 30 total tokens, cost 0.000001 credits and 2 web-search requests. Accepted parsed cost must equal 1 microcredit. Cancel/abort must clear timers and prevent a late body enqueue. No logs contain Authorization or candidate content.

- [x] Add behavioral RED/GREEN for unknown target, missing binding, wrong method/path/audience/role, Repair-shaped body, duration field injection, missing/current-job mismatch, two invocations with different jobs, header abort, body cancellation and shared adapter deadline. Stub global fetch to throw and assert it remains unused. Pass the real `OpenRouterResearchProvider` through the synthetic fetch for request/body validation; do not handwrite a second model adapter. Use fake timers for the 1,200,000 ms timeout test and restore them.
- [x] Implement fixed service-binding routers with the exact accepted Site/executor path allowlists, no redirects and signal propagation. Reject before calling the binding when origin/path/query/method is wrong. Reuse protocol body limits.
- [x] Implement smoke evidence SQL with bounded fields, unique scenario/job identity and atomic increment/insert semantics; an exception after its durable effect is not counted as rollback. Add a meaningful concurrent increment test and reject oversized evidence values. No raw response/body storage in evidence tables.
- [x] Re-run the focused test, then independent SPEC → different QUALITY; Root freezes this task's new source hashes.

## Subtask 15.2 — Protected fixture start and read-only status

Read `site-bridge-factory.ts`, `public-operation-scope.ts`, `site-admission.ts`, `d1-repository.ts`, `executor/executor-client.ts`, and the accepted public fixture's schema/user seed patterns. Keep its Node/SQLite/Miniflare machinery out of deployable code.

- [x] Add RED using two isolated SQLite D1 test databases and synthetic HMAC secrets. The new helper must expose `signedStart(id)`, `signedStatus(id)`, `siteSnapshot(id)` and `dispose()`; status responses are read-only, while snapshots are test-host SQL readers. Never seed admitted, claimed, grant, result or Ready rows.
- [x] Test unsigned requests; wrong control/bridge key and key ID; same nonce; wrong method/path/audience; Origin-bearing requests; streamed body over 4,096 bytes; unexpected owner/job/URL/policy/duration fields; and unknown scenario. Require zero start effects and bounded safe errors.
- [x] Run `node node_modules/vitest/vitest.mjs run tests/server/research-cloud-smoke-control.test.ts` and retain RED.
- [x] Implement default Site Worker routing: fixed private bridge paths go to `createProductionSiteBridgeHandler({environment,getD1,fetch})`; fixed control routes use accepted sign/verify/body/nonce helpers with a third distinct control key ID and secret. No new authentication protocol, session or identity provider. All other paths return a safe 404. Control request/response caps are 4,096 bytes.
- [x] Implement start with an initial `PublicOperationScope` and guarded D1, a stable scenario row before submit, synthetic user/cohort seed, and repository creation using `createJobId: () => scenario.jobId`. Build the command from the real policy reader:

```ts
const selection = readResearchPolicyConfiguration(environment);
if (!selection || selection.executor !== "cloudflare-workflow-v1") throw new Error("Smoke unavailable");
const configuration = selection.configuration;
const command = {
  ownerId: scenario.ownerId, mutationId: scenario.mutationId, requestId: scenario.requestId,
  rawRole: scenario.role, normalizedRoleKey: scenario.role.toLowerCase(), locale: scenario.locale,
  inputFingerprint: fingerprint([scenario.role.toLowerCase(), scenario.locale]),
  configFingerprint: configuration.configFingerprint,
  policy: { cacheDays: configuration.cacheDays, userDailyQuota: configuration.userDailyQuota,
    dailyBudgetMicros: configuration.budget.dailyBudgetMicros,
    monthlyBudgetMicros: configuration.budget.monthlyBudgetMicros,
    maximumMicros: configuration.budget.maximumMicros },
};
```

Call real `createRemoteOrReplay`, then `admitNew` for the newly created identity. Submit using accepted `ExecutorBridgeClient` and record/verify the accepted proof through the real bridge repository. Never call `begin` directly. Replay only the same identity; any ambiguous submit is left for normal independent maintenance, with repeated start limited to observing its existing acceptance. Preserve original queue deadline and reservation/lease semantics.

- [x] Enforce one active scenario through atomic smoke-suite bookkeeping, distinct fixed owners and roles, and unmodified configuration fingerprint. The next fixed scenario becomes eligible only after the preceding run is terminal and its smoke effects/accounting are settled; a failed prerequisite returns a safe conflict rather than creating a replacement. No reset/restart/delete endpoint.
- [x] Implement status using guarded SELECTs and existing read-only acceptance readers only. Return scenario ID, safe run/acceptance state, bounded Site identity hashes/counters and timestamps. Do not call `RemoteResearchReader.get/recover`, importer, submit, maintenance or Provider; those may mutate. **Do not call the production executor `status` endpoint before Cron proof either: its `receipts.recover` can fix the R2-only gap.** Site status reads only Site storage and must not gain an executor D1 binding. Account-authenticated cloud evidence separately uses inventory-bound read-only executor D1/R2 queries and native Workflow instance status. Control status never becomes an arbitrary database inspector.
- [x] Add RED/GREEN for concurrent duplicate start and dropped first response: one run/job/mutation, one quota/budget reservation, no deadline change, accepted boolean only from persisted proof, owner mismatch hidden. Add sequential three-scenario admission tests after each previous valid package exists; all three must be uncached and have the same exact production fingerprint. Add a delayed D1 case proving scope fencing prevents new late writes. Preserve partial-admission recovery semantics; do not invent reservation completion.
- [x] Re-run control plus transport tests, then independent SPEC → different QUALITY.

## Subtask 15.3 — Unchanged Workflow composition and build boundary

Read accepted `runtime.ts`, `workflow.ts`, `index.ts`, `receipt-store.ts`, `maintenance.ts` and existing `scripts/build-research-executor.mjs`. Do not edit them or overwrite their outputs.

- [x] Add build RED for missing/extra alias edges, unexpected runtime importer, unsupported profile, cloud inclusion of local fixture, and absence of `ResearchWorkflow`/default export. Run `node node_modules/vitest/vitest.mjs run tests/server/research-cloud-smoke-build.test.ts` and retain RED.
- [x] Implement runtime wrappers retaining the production exports. Project required environment fields explicitly and set adapter key to a compile-time synthetic sentinel; do not spread/read a possible real Provider key. All three factories receive the fixed bridge transport; execution receives the synthetic Provider transport. Do not forward arbitrary caller overrides.
- [x] Associate the transport with this invocation's real `jobs.get` result, not a global active scenario. The wrapper creates a fresh closure per factory invocation, rejects a second distinct job ID/hash or role mismatch, and allows rereads only of the same immutable identity. It never fabricates a job or dispatch grant. The minimal binding pattern is:

```ts
let observed: BridgeStoredJob | undefined;
const bindJob = (next: BridgeStoredJob | null) => {
  if (!next) throw new Error("Smoke job unavailable");
  scenarioForJob(next.job);
  if (observed && (observed.job.jobId !== next.job.jobId || observed.requestHash !== next.requestHash)) {
    throw new Error("Smoke job changed");
  }
  observed = next;
  return next;
};
const currentJob = () => {
  if (!observed) throw new Error("Smoke job not observed");
  return observed.job;
};
```

Validate canonical immutable job fields as well as the hash string before accepting a reread; retain real grant/dispatch changes. Ensure no synthetic Provider effect occurs before the production dispatch CAS. Tests must run two simultaneous runtime objects to catch accidental shared association.

- [x] Add execution-only fault adapters: for `after-r2`, await real conditional R2 put, persist the fault marker and throw before returning; for `after-d1`, await real receipt save, persist the marker and throw instead of returning its reference. Preserve bucket method receivers and required get/put/delete capabilities. Maintenance and HTTP factories get clean bindings, not fault wrappers. Keep the real receipt store, `runResearchJob`, paid-step policy and Workflow unchanged.
- [x] Implement smoke executor entry as a delegation to production Worker/Workflow, adding only durable Cron start/end markers. Capture the delegated `context.waitUntil` promise and attach completion evidence without changing work or inventing a scheduled success on failure. Never call maintenance from control status.
- [x] Implement the esbuild resolver with canonical paths: exactly the production `index.ts` and `workflow.ts` imports of the exact production runtime resolve to smoke runtime; only the smoke runtime's own original-runtime import bypasses the alias. Unexpected importers are errors. Hash protected inputs before and after build; report all edges and artifact hashes. Resolve relative imports normally after the specific rewrite.
- [x] For profile `cloud`, use smoke executor/site entries and literal cloud `timing.ts`. For profile `local`, alias only the smoke runtime's exact timing import to `tests/fixtures/research/cloud-smoke-local-timing.ts`, whose long wait is 50ms headers/25ms body and fault waits are 0ms. Local entry adds Miniflare-only `POST /__local/cron` (calls the delegated scheduled handler and awaits its captured promises) and `POST /__local/workflow-status` (fixed scenario selection, calls the native RESEARCH_WORKFLOW.get(id).status(), never receipt recovery). Neither route/source may exist in the cloud graph. No unsupported Miniflare host getWorkflow API is assumed. This local trigger proves the handler path, not autonomous cloud Cron scheduling.
- [x] Write `buildSmoke` reports/artifacts only under distinct `E/task15-smoke/build/{cloud,local}/` paths. Reports include `profile`, `deployable: profile === "cloud"`, alias edges, input hashes, exports, timing/policy, and no credential/config values. No runtime duration arguments. Build a production control graph into a separate evidence directory to prove it contains none of the smoke graph; do not modify the existing production build script. Do not reject the OpenRouter URL literal itself: it belongs to the real adapter; prove the injected capability is sealed.
- [x] Add a smoke `tsconfig.json` extending the existing strict root options with incremental false and explicit new entry/test files; do not weaken compiler flags. Run:

```powershell
node scripts/build-research-executor-smoke.mjs --profile cloud --report-name task15-cloud-artifact-local-check
node scripts/build-research-executor-smoke.mjs --profile local --report-name task15-short-local-artifact
node node_modules/vitest/vitest.mjs run tests/server/research-cloud-smoke-build.test.ts
node node_modules/typescript/bin/tsc --project worker/research-executor-smoke/tsconfig.json --noEmit --incremental false
```

Expected: both builds verified, cloud eligible/local ineligible, exactly the reviewed runtime rewrite/bypass edges, fixed cloud durations, unchanged production policy/source hashes, and zero type diagnostics. Then independent SPEC → different QUALITY.

## Subtask 15.4 — Local persistent native chain and bounded operator driver

- [x] Extend only the new helper to create the actual paired built Workers in Miniflare with named service bindings, native `RESEARCH_WORKFLOW`, separate Site/executor D1, private R2, `d1Persist`, `r2Persist`, and `workflowsPersist` under one owned local temporary directory. Apply actual Site `0000`–`0011` and executor `0000`–`0003` migrations plus smoke evidence schema only to these empty stores. Use `cf:false` and outbound rejection as an extra detector. It must expose `start(id)`, `status(id)`, `snapshot(id)`, `waitForWorkflowTerminal(id)`, `invokeScheduled()`, `reopen()`, and `dispose()` to this test/driver; snapshots are host-only SELECT/R2 readers. `waitForWorkflowTerminal` polls native instance status through the Workflow binding with a 60-second total limit; it never calls the production executor status endpoint. Do not add deployed debug endpoints.
- [x] Add native-chain RED/GREEN for each fixed scenario. Require the real Workflow output/reference, real adapter response, durable dispatch/result/receipt, true Site validation/import and expected synthetic accounting. In the fault cases, inspect the gap, invoke only the scheduled handler, and prove ready/accounted state before any owner recovery call. Example assertion sequence, using the helper contract above:

```ts
await harness.start("after-r2");
await harness.waitForWorkflowTerminal("after-r2");
const gap = await harness.snapshot("after-r2");
expect(gap.providerCalls).toBe(1);
expect(gap.dispatchState).toBe("claimed");
expect(gap.fault).toBe("after-r2");
expect(gap.resultCount).toBe(0);
expect(gap.r2ReceiptPresent).toBe(true);
await harness.invokeScheduled();
const recovered = await harness.snapshot("after-r2");
expect(recovered.providerCalls).toBe(1);
expect(recovered.importPhase).toBe(5);
expect(recovered.runState).toBe("ready");
expect(recovered.receiptHashMatched).toBe(true);
```

The helper's start waits only for acceptance; the test host boundedly awaits native Workflow terminal state before the gap assertion rather than using a fixed sleep. Define `snapshot` fields exactly as shown plus Repair/unexpected counts, begin/deadline, accounting and acceptance. Local tests control when the synthetic scheduled trigger occurs, so the gap is deterministic. Cloud Cron race handling remains separate. Add spies/capability denial proving both status and all pre-Cron snapshots never invoke executor `status`, `result`, `receipts.recover`, importer or maintenance.

- [x] Add meaningful replay/reopen coverage: preserve storage and Workflow identity across Miniflare disposal/recreation after execution terminal state; reconstruct readers and trigger scheduled recovery from the existing R2/D1 gap. Duplicate submit/get and original-mutation owner recovery after completed import keep counts/hashes/deadline stable. Wrong owner remains hidden. Clean up only verified owned local temporary paths.
- [x] Run `node node_modules/vitest/vitest.mjs run tests/server/research-cloud-smoke-composition.test.ts`; retain native RED/GREEN and concise assertions. Tests may need an explicit bounded 60-second timeout for native startup; do not expand application deadlines.
- [x] Implement `scripts/test-research-cloud-smoke.mjs local --report-name NAME` to run the short paired composition and export safe evidence. Build/import a Node host helper for existing signing/receipt helpers instead of duplicating HMAC. Cloud `start` and `status` require an existing verified isolation-inventory file and eligible artifact report; absence/mismatch refuses before network. Credentials enter through the parent-selected secure smoke-control channel, never account-secret discovery, URL arguments or logs. `start` may reconcile the same scenario's persisted acceptance within its short bounded window, then exits; it never waits 20 minutes. `status` is one bounded read in a fresh process. No provision, deploy, reset, retry-paid, arbitrary URL/SQL or duration option.
- [x] Fix the cloud CLI contract to `start|status --inventory E/task15-smoke/isolation-inventory.json --artifact-report E/task15-smoke/build/cloud/report.json --scenario long|after-r2|after-d1 --report-name SAFE_NAME`. Here `E` expands to the actual evidence directory at invocation; these files are produced only after their prerequisites exist. The inventory pins the control origin, account/resource identities and deployed artifact digests. Refuse a source `.ts` entry, a local artifact, or a digest mismatch. A timed-out acceptance check writes an unknown/pending result; it never reports accepted or generates a new scenario identity. Only actual persisted acceptance permits the long-run leave/return observation window to start.
- [x] Test driver malformed/missing inventory, cloud use of local artifact, digest mismatch, unknown scenario, missing control credential and response signature mismatch. Use in-process synthetic transport for driver tests; no account/network. Distinguish timeout/unknown acceptance from durable rejection, preserving the same scenario identity.
- [x] Run the final local union once after changes settle:

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-cloud-smoke-transports.test.ts tests/server/research-cloud-smoke-control.test.ts tests/server/research-cloud-smoke-build.test.ts tests/server/research-cloud-smoke-composition.test.ts tests/server/research-executor-runtime.test.ts tests/server/research-executor-maintenance.test.ts tests/server/site-import-validation.test.ts tests/server/research-bridge-transport.test.ts tests/server/research-public-integration.test.ts
node scripts/test-research-cloud-smoke.mjs local --report-name task15-local-native-acceptance
node node_modules/typescript/bin/tsc --project worker/research-executor-smoke/tsconfig.json --noEmit --incremental false
node node_modules/eslint/bin/eslint.js worker/research-executor-smoke tests/server/research-cloud-smoke-transports.test.ts tests/server/research-cloud-smoke-control.test.ts tests/server/research-cloud-smoke-build.test.ts tests/server/research-cloud-smoke-composition.test.ts tests/helpers/research-cloud-smoke-fixture.ts tests/fixtures/research/cloud-smoke-local-timing.ts tests/fixtures/research/cloud-smoke-local-executor-entry.ts scripts/build-research-executor-smoke.mjs scripts/test-research-cloud-smoke.mjs
```

Expected: current focused/regression tests pass, native local report passed with `cloudElapsedProved:false`, no global Provider egress, one synthetic invocation per case, Repair/unexpected zero, real Site import phase 5 and single accounting effects, stable replay/reopen evidence, zero types/lint diagnostics. Root verifies protected hashes and independent SPEC → different QUALITY. Mark only **local composition verified**, not Task15 complete.

Local native acceptance exposed the D1 expression-depth limit. The four production SQL compatibility corrections and one added native regression were reviewed with this subtask; authoritative originals, scope and evidence are retained in t15p4-root-sql-fix-scope-r3.json and t15p4-root-sql-correction-receipt.json. The original 533-file baseline is preserved:529 unchanged plus4 explicit reviewed exceptions. No cloud or production-data operation was performed.

## Separate cloud-run operational checklist

These are prerequisites/actions for Root after local acceptance, not guessed facts or workarounds for unavailable OAuth. They do not block the four local subtasks.

- [x] Confirm authenticated account, plan and Workflow/D1/R2/Cron/service-binding permissions; resolve any specific subscription spending decision separately. Inventory actual new smoke names/IDs, ownership and isolation from production. No Provider key is installed.
- [x] Record actual supported control origin/protection and configure three distinct HMAC key IDs/secrets through the agreed safe channel. Do not import production Site/Provider secrets. Generate exact manifests only from verified inventory with executor public routes/preview disabled and cloud prebuilt entries; no rebuild or local fixture inclusion.
- [x] Resolve paired binding deployment order on the real platform. If targets must preexist, deploy no-route 503 stubs only to the newly inventoried smoke names, with no Provider or writes, then replace with reviewed full bundles after resources/bindings exist. Verify artifact revisions/hashes and both directions before start.
- [x] Apply actual schema files to empty isolated D1s; verify ledgers and fixed scenario prerequisites. Enable one-minute executor Cron and bounded smoke start only. Confirm no routes or DB/R2 bindings target the production Site.
- [x] Run the long scenario with the cloud artifact. Preserve short accepted response and actual stored proof, then close/exit the initiating client. No polling/recover/connection during the 19m30s adapter wait. Later launch a fresh status process and inspect real Workflow/D1/R2 evidence through authenticated account tools. Require latency at least 1,170,000 ms and under 1,200,000 ms, 21-minute zero-retry step unchanged, synthetic Provider count 1/Repair 0, real Site import and accounting.
- [ ] Run short after-R2 and after-D1 scenarios. Actual cloud Cron, not driver control or a local trigger, must repair the durable gap and deliver the same receipt before owner recovery. Before proof, use only Site read-only control status, native Workflow instance status, and inventory-bound read-only executor D1/R2 queries; never call production executor status/result/recover. Preserve fault markers, Workflow output, Cron trace and hashes. Only after independent Cron completion may normal signed executor get/status and owner recovery be used for idempotency checks. If Cron races the raw gap snapshot, record that fact; do not invent the snapshot or equate fixture exceptions with platform crashes.
- [ ] Collect replay/owner/cleanup evidence, including receipt metadata/tombstone after body removal, without deleting deduplication identity. Disable fresh smoke starts; retain review evidence. Clean up only inventory-confirmed smoke resources after active work is settled/stopped.
- [ ] Report the exact coverage limit: cloud Workflow lifetime and independent recovery are proved only by this real run; upstream OpenRouter HTTP survival, paid model quality, real OAuth/learning/Proof, protected Sites deployment and public release remain separate. Production migrations 0007–0011 still require supported coordinated backup/restore and an isolated restore rehearsal. Successful smoke does not waive that gate.

Operational prerequisite evidence (2026-09-21): actual account authentication, isolated resource/deployment records and migrations are retained under `E/task15-smoke/cloud-ops-20260921/`. In particular, `activation/postactivation-bindings-r2.json` verifies exact active revisions, two/three Secret bindings, frozen code and paired resource bindings; `postactivation-runtime-metadata.json` verifies the 5/13 migration ledgers and empty pre-start scenarios; its R2 privacy read failure is resolved separately by `postactivation-r2-privacy-retry.json`. `cron-observation-01.json` records a real scheduled start/end. Workers Free is the user's confirmed plan selection; no purchase or upgrade was made, and these prerequisite checks do not establish long-workflow success. `long-run/acceptance-receipt.json` records the first actual signed acceptance at 07:41:08Z and the conservative no-poll interval through 08:01:45Z. The final four items remain open. `long-run/replay-owner-gap-audit.md` records an additional operational invocation gap for actual signed replay and full owner-A/B recovery; native SELECT evidence alone must not close that item.

## Root adoption self-review

- [x] Final reviewed design agrees on distinct role variants, unchanged policy fingerprint, invocation-local job association, signed fixed controls, fixed-cloud/short-local build separation, paired deployment order and independent Cron evidence.
- [x] Every new path belongs to one subtask; production source and artifacts remain protected; no invented resource ID, new platform/identity framework, Provider credential read, global-fetch fallback or automatic paid retry appears.
- [x] Task15 local/cloud states are separate in completion records; actual RED/GREEN/reviews/hashes are retained. Do not mark external prerequisites or long elapsed time as passed from this plan or local tests.

Root API checks: createSiteImportFixture supplies execution.validationContext, validateResearchCandidate returns ready, fixed mutation names satisfy the accepted schema, real createRemoteOrReplay/admitNew and fingerprint arguments match source. Installed Miniflare does not declare a host getWorkflow convenience method, so the existing native binding status pattern is exposed only by the local test entry above. It is excluded from cloud builds. Cloud driver credentials must use explicitly redirected, bounded stdin containing one64-hex control secret; refuse an interactive echoing stdin, credentials in arguments, or automatic OAuth/environment discovery. User-safe hidden input is configured at the operational phase. In local tests inject only synthetic input bytes; no real secret is read. Reuse the accepted signature verifier and a persistent, bounded local response nonce store for separate driver invocations; do not weaken nonce validation or claim CLI status is a production recovery authority.
