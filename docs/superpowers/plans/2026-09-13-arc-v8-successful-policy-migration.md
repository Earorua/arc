# Arc v8 Successful Policy Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Move the already successful Kimi request policy into the website's server factory with an explicit selector, exact legacy fingerprint compatibility, and verified historical recovery/planning behavior.

**Architecture:** A small credential-free execution policy separates fixed request semantics from local-only diagnostics. The production environment parser selects the new policy atomically; the existing Provider transport, schema, repositories, quality rules and planner remain the execution path. Local validation stays fixed and independent of production activation.

**Tech Stack:** TypeScript, Zod, Vitest fake timers, Node SQLite D1 adapter, React/Vinext/Sites local build.

---

## Approved scope and working rules

User explicitly approved the reviewed design on 2026-09-13. Design: ../specs/2026-09-13-arc-v8-successful-policy-migration-design.md (approved bytes SHA256 cec3a4f98ff80fcbf58a97b7b97198d04cf93d58a4377ae0d166bcef26cf58d9).

Authoritative directory: C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta. Branch codex/v8-openrouter-research-beta; HEAD 7090153b4acad7b12df6a7ee4d675b46c41871dc. Existing 433-row handoff verified before edits. Preserve all dirty work.

Use existing worktree/dependencies. No Git staging/commit/merge/push, remote calls, production/Sites changes, real runtime env/Key/body reads, or paid verification. Reading/modifying the versioned empty .env.example is specifically in scope; do not characterize this as no environment-file reads. Attempt17 is consumed; no Attempt18. The current design approval is sufficient for this entire local implementation; do not ask again for the same workflow.

All evidence goes under outputs/local-successful-policy-migration-20260913. Each implementer writes actual RED/GREEN receipts and changed-file hashes. Review exact current files against pre-task byte snapshots, not HEAD (which predates other dirty work). Fresh SPEC reviewer then independent QUALITY/security reviewer must pass before the next implementation task. Root handles plans/checkpoints and final build. No parallel implementation agents.

## File boundaries

- Create app/server/research/execution-policy.ts: seven immutable server fields and strict selector resolution, no JSON import, credentials, diagnostics, IO, or launcher.
- Modify app/server/research/openrouter-provider.ts: optional trusted researchProfile selector, fixed execution profile, shared complete prompt/request path; local diagnostic identity remains local.
- Modify app/server/research/service-factory.ts: optional environment selector, atomic validation, legacy/new stable policy selection and Provider/lease wiring.
- Modify worker-configuration.d.ts and .env.example: optional server binding and commented opt-in documentation; defaults disabled.
- Create tests/server/research-execution-policy.test.ts and tests/server/research-policy-migration.test.ts: Provider/timeout and factory/history integration respectively. If integration size warrants, use tests/server/research-policy-migration-integration.test.ts as the separate D1 integration suite.
- Modify tests/server/research-environment.test.ts only for selector comment/binding/admin projection coverage.
- Existing local profile JSON, launcher, Provider versions, recovery hook/pages, contracts/validator, repositories and schema are protected. Do not change them without a concrete reproduced necessity and root review.

## Task 1: Shared fixed execution policy and complete Provider request parity

**Files:** Create execution-policy.ts and research-execution-policy.test.ts; modify openrouter-provider.ts only.

- [x] **1. Write Provider RED through the existing exported class.** Use synthetic-dummy-credential and imported validResearchCandidate/validAnnotations. The unknown config field is supplied through a variable so existing TypeScript accepts the test before implementation. Compare two independently captured requests, including URL/method/headers and parsed complete body:

```ts
const newConfig = {
  OPENROUTER_API_KEY: "synthetic-dummy-credential",
  ARC_AI_MODEL_RESEARCH: "moonshotai/kimi-k3",
  ARC_AI_MODEL_ECONOMY: "test/economy-fixed",
  researchTimeoutMs: 1_200_000,
  researchProfile: "kimi-low-output32k-v3",
};
const productionFetch = vi.fn<typeof fetch>(async () => successResponse());
const localFetch = vi.fn<typeof fetch>(async () => successResponse());
const production = new OpenRouterResearchProvider(newConfig, { fetch: productionFetch });
const local = createKimiLocalValidationProvider({ key: newConfig.OPENROUTER_API_KEY, fetch: localFetch });
await production.research({ role: "Data Product Manager", locale: "en-US" });
await local.research({ role: "Data Product Manager", locale: "en-US" });
expect(JSON.parse(productionFetch.mock.calls[0]![1]!.body as string))
  .toEqual(JSON.parse(localFetch.mock.calls[0]![1]!.body as string));
```

successResponse uses Response.json with model moonshotai/kimi-k3, stop, JSON.stringify(validResearchCandidate), annotations mapped to url_citation and usage cost0.1/search2. Also assert exact low,32768, complete quality-v2 text and absence of legacy atomic/no-checkpoints instruction. Compare all request headers except AbortSignal object identity.

- [x] **2. Observe real RED.** Run:
```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-execution-policy.test.ts --maxWorkers=1
```
Expected pre-implementation failure: production rejects1200000 as unavailable, preventing full parity; no module-not-found or accidental real fetch.

- [x] **3. Implement the immutable server tuple and strict resolver.** Production resolver returns undefined for absent, null for invalid, a fixed frozen tuple for exact selector. Use this small module:
```ts
export const KIMI_RESEARCH_EXECUTION_POLICY = Object.freeze({
  profileId: "kimi-low-output32k-v3",
  model: "moonshotai/kimi-k3",
  reasoningEffort: "low",
  maxOutputTokens: 32_768,
  outputPolicyVersion: "kimi-complete-quality-v2",
  researchTimeoutMs: 1_200_000,
  activeTtlMs: 1_260_000,
} as const);
export type KimiResearchExecutionPolicy = typeof KIMI_RESEARCH_EXECUTION_POLICY;
export function resolveResearchExecutionPolicy(profile: unknown):
  KimiResearchExecutionPolicy | undefined | null {
  if (profile === undefined) return undefined;
  return profile === KIMI_RESEARCH_EXECUTION_POLICY.profileId
    ? KIMI_RESEARCH_EXECUTION_POLICY : null;
}
```
Add researchProfile?: string to OpenRouterResearchConfig. Resolve it for research and repair; null rejects unavailable/false/false before fetch. New policy requires exact model and timeout; repair unconditionally refuses before fetch even if called directly. Legacy undefined keeps all defaults and payloads.

In executeOpenRouter replace request-semantic dependence on localProfile with executionProfile (the seven-field type). Keep local diagnostic profile/identity separate in private dependencies so transport-v3/elapsed bounds and all local observations behave exactly as before. Local factory still validates JSON, requires injected fetch and disallows repair; pass the validated tuple through the same execution-profile path. Do not add production diagnostic hooks or transport implementation.

Use executionProfile?.maxOutputTokens/outputPolicyVersion/reasoningEffort/researchTimeoutMs for the same request fields. Preserve the full current local prompt via researchPolicy, rather than concatenating to standard policy. No wire-version or quality-schema edits.

- [x] **4. Add remaining RED-driven edge coverage, then GREEN.** Parameterize unknown/blank/nonstring selectors, wrong model/timeouts and direct repair to assert unavailable with charged=false and0 fetch. Assert local seven server fields exactly equal the immutable tuple while launcher is absent from it; keep local eight-field JSON validation tests.

Fake timers: stalled headers to1200000; body stall; headers at1199000 then body must time out after1000 rather than get a fresh deadline; fully buffered success at1199999; late header/body resolution aftertimeout. Attach rejection handlers before advancing time. Assert safe timeout/charged unknown, signal abort, cancel/release where a reader was acquired, zero pending timers and one fetch/no repair. Do not wait actual20minutes. Preserve existing deadline code unless a new RED demonstrates a required repair.

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-execution-policy.test.ts tests/server/openrouter-provider.test.ts tests/server/kimi-local-validation.test.ts tests/server/kimi-output-budget.test.ts tests/server/openrouter-transport-observation.test.ts tests/server/openrouter-response-preflight.test.ts tests/server/openrouter-response-format.test.ts --maxWorkers=1
```

- [x] **5. Self-review, freeze actual evidence, SPEC then QUALITY.** No Git commit. Report exact test totals and errors/warnings honestly. Review all Task1 files against pre-task snapshot; do not rerun unrelated historical suites.

## Task 2: Environment selection, exact legacy fingerprint and factory wiring

**Files:** Modify service-factory.ts, worker-configuration.d.ts, .env.example, research-environment.test.ts. Create research-policy-migration.test.ts.

- [x] **1. Capture legacy baseline before factory edits.** Use the existing readResearchProductionConfiguration with a fixed synthetic environment, capture configFingerprint as a literal into the new test and actual baseline receipt. Also capture a second legacy policy changing a nonsecret budget/timeout. Never derive expected values from the new policy at assertion time. Old OpenRouter request tests already pin legacy payload.

Synthetic baseline environment:
```ts
const legacyEnvironment = {
  ARC_ENVIRONMENT: "test", BETTER_AUTH_URL: "https://arc.example",
  ARC_AI_ENABLED: "true", ARC_AI_RESEARCH_ENABLED: "true",
  ARC_AI_USER_DAILY_QUOTA: "3", ARC_AI_RATE_LIMIT_PER_MINUTE: "2",
  ARC_AI_MODEL_RESEARCH: "test/research-fixed",
  ARC_AI_MODEL_ECONOMY: "test/economy-fixed",
  ARC_AI_RESEARCH_TIMEOUT_MS: "20000", ARC_AI_REPAIR_TIMEOUT_MS: "10000",
  ARC_AI_RESEARCH_CACHE_DAYS: "14",
  ARC_AI_SITE_DAILY_BUDGET_MICROS: "20000000",
  ARC_AI_SITE_MONTHLY_BUDGET_MICROS: "100000000",
  ARC_AI_RESEARCH_MAX_COST_MICROS: "1200", ARC_AI_REPAIR_MAX_COST_MICROS: "300",
  ARC_AI_IP_HASH_SALT: "synthetic-test-salt-value",
  OPENROUTER_API_KEY: "synthetic-dummy-credential",
};
const newEnvironment = {
  ...legacyEnvironment, ARC_AI_RESEARCH_PROFILE: "kimi-low-output32k-v3",
  ARC_AI_MODEL_RESEARCH: "moonshotai/kimi-k3",
  ARC_AI_RESEARCH_TIMEOUT_MS: "1200000",
  ARC_AI_RESEARCH_MAX_COST_MICROS: "5000000",
  ARC_AI_REPAIR_MAX_COST_MICROS: "0",
};
```
Use vi.mock("cloudflare:workers", () => ({env:{}})) if the existing alias is insufficient; never import actual runtime env.

- [x] **2. Add and observe config RED.** NewEnvironment returns nonnull with1200000, lease1260000/profile selector; invalid profile values must returnnull even when all legacy fields otherwise pass. Admin projection enabledtrue for new and false forinvalid, with only enabled property. Run new suite and research-environment.test.ts; expect new profile currently null, invalid selector currently ignored.

- [x] **3. Implement atomic selection.** Environment type/schema gains ARC_AI_RESEARCH_PROFILE optional literal. Expand Research decimal parser to1200000 but explicitly branch legacy<=120000 and new exact1200000. Validate new model exactly fixed tuple, repairMaximumMicros0, researchMaximumMicros>0<=5000000; preserve all existing budget/key/URL/salt/switch/model formatting rules.
```ts
const executionProfile = resolveResearchExecutionPolicy(parsed.data.ARC_AI_RESEARCH_PROFILE);
if (executionProfile === null) return null;
if (executionProfile) {
  if (parsed.data.ARC_AI_MODEL_RESEARCH !== executionProfile.model
    || parsed.data.ARC_AI_RESEARCH_TIMEOUT_MS !== executionProfile.researchTimeoutMs
    || budget.repairMaximumMicros !== 0
    || budget.researchMaximumMicros > 5_000_000) return null;
} else if (parsed.data.ARC_AI_RESEARCH_TIMEOUT_MS > 120_000) return null;
const policy = executionProfile ? {
  ...POLICY,
  profileId: executionProfile.profileId,
  outputPolicyVersion: executionProfile.outputPolicyVersion,
  reasoningEffort: executionProfile.reasoningEffort,
  researchMaxTokens: executionProfile.maxOutputTokens,
  repairMaxTokens: 0,
  activeTtlMs: executionProfile.activeTtlMs,
} : POLICY;
```
Keep exact stablePolicy legacy object and nested serialization unchanged. New policy contains explicit profile/output/reasoning plus existing search/privacy/bytes/versions/budgets. Timeouts/models remain included at their existing stablePolicy keys. Launcher must not appear. Add optional profile identity to safe configuration and activeTtlMs (legacy60000/new1260000); pass validated researchProfile into Provider only for selected profile, and use configuration.activeTtlMs in orchestrator config. Preserve recovery-only service construction regardless of malformed new-call configuration.

- [x] **4. Binding/example documentation and fail-closed tests.** Add ARC_AI_RESEARCH_PROFILE?: string to Worker Env. Add only a comment to .env.example:
```dotenv
# Optional ARC_AI_RESEARCH_PROFILE=kimi-low-output32k-v3 requires moonshotai/kimi-k3, Research timeout1200000, Repair budget0, and Research reservation<=5000000; omit for legacy behavior.
```
Do not add an uncommented empty selector/default enable. Assert invalid undefined-vsblank distinctions,0/120001legacy, exact1200000new, nonstring, wrongmodel, repair!=0, >5M, missingKey/salt/origin/switch/budget rejection and no createProvider/getD1 for unavailable new calls. Test key/salt changes leave fingerprint unchanged while meaningful budget/quota changes isolate. Existing admin type delegates factory, no independent parser needed.

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-policy-migration.test.ts tests/server/research-environment.test.ts tests/server/research-execution-policy.test.ts --maxWorkers=1
```

- [x] **5. Self-review and exact-source SPEC then QUALITY.** Save legacy literal capture and final evidence. No Git operations, production variables or local launcher changes.

## Task 3: D1 cache, historical recovery and full planning integration

**Files:** Create tests/server/research-policy-migration-integration.test.ts. Production storage/validator/planner are protected and expected unchanged.

- [x] **1. Build real in-memory D1 test harness with production service factory.** Use createResearchD1/seedUser from tests/helpers/sqlite-d1, validResearchCandidate/validAnnotations, deterministic now/createId and synthetic env from Task2. Inject createProvider(config) => new OpenRouterResearchProvider(config,{fetch:syntheticFetch}); do not replace repository, validator, orchestrator, budget or planner. Reuse canonical fixture wiring from existing factory/recovery/planning suites.

Wire format:
```ts
const syntheticFetch = vi.fn<typeof fetch>(async () => Response.json({
  model: "moonshotai/kimi-k3",
  choices: [{ finish_reason: "stop", message: {
    content: JSON.stringify(validResearchCandidate),
    annotations: validAnnotations.map(({type,url,title}) => ({
      type, url_citation: {url,title},
    })),
  }}],
  usage: {prompt_tokens:10,completion_tokens:20,total_tokens:30,cost:0.1,
    server_tool_use:{web_search_requests:2}},
}));
```
Use synthetic cost suitable for the configured reservation for legacy/new fixture cases. Only transport is fake. Wrap each actual DB in try/finally close; no live D1 bindings.

- [x] **2. Cache and request/factory chain assertions.** Start legacy ready, switch factory to newEnv for same role+locale and newmutation; fetch count increments (no oldcache). Newprofile subsequent same-role newmutation/legitimate owner cache hit adds no fetch/reservation; assert persisted configFingerprint,1260000 lease and package identity. Query budget/quota rows with existing SQL shape; inspect actual headers/body matches Task1 semantics. Capture validation failure before Task2 implementation if convenient; after completed Task2, these are integration regression checks rather than pretend RED.

- [x] **3. Historical matrix.** Create old ready/failed/active/expired records through existing repository/orchestrator test APIs. Under new profile and both disabled/invalid config, recovery service can get/recover historical state with stored IDs/fingerprints. Wrongowner returnsnull at get/recover service level (existing route translates to404); do not change that contract. Old active expiry retains original deadline and becomes failed on read, cannot revive with longerprofile. Finalized quotas and known settled cost remain; late known-cost receipts can settle only and cannot publish an expiredrun. Cross-profile Retry returnsCONFLICT with0 additional fetch, no new reservation, no rewritten oldrun.

- [x] **4. Full learning flow and substantive failure.** Resolve new ready package with D1ResearchRepository, generate via real PlanningService + D1PlanningRepository and PlanningSourceResolver, activate through existing goal selection route/service as used in live-validation code, refresh via a fresh reader and assert source references/configFingerprint + authoredunits persisted. Switching profile later must not break locked package/planning reads. Synthetic invalid-quality candidate remains needs-review and Repair0. Use existing authored fixture; do not access Attempt17 response content.

- [x] **5. Run targeted integration regressions and review.**
```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-policy-migration-integration.test.ts tests/server/d1-research-repository.test.ts tests/server/research-recovery.test.ts tests/server/research-planning-integration.test.ts tests/server/research-orchestrator.test.ts --maxWorkers=1
```
If a new behavior defect is found, reproduce with failing assertion before minimal in-scope fix, notify root if it touches protected implementation. Then self-review, SPEC and independent QUALITY.

## Task 4: Final local acceptance and reviewed handoff

**Files:** operation report/checkpoint/plan; outputs evidence. No application edits expected.

Task3最终提交审查前已由Root检查全部当前类型输入与八项修改TS文件。若双审期间源码字节保持一致，Task4复用该本轮实际类型/lint回执并核对字节，不重复未受变化影响的检查；整合suite/build/默认离线仍按下列步骤实际执行。

- [x] **1. Run appropriate merged suite once.** Include new3suites, existing Provider/localprofile/transport/preflight/responseformat, productionenvironment, D1/recovery/planning/orchestrator/admin integration relevant to actual edits. Run node node_modules/typescript/bin/tsc --project outputs/local-successful-policy-migration-20260913/tsconfig.acceptance.json --noEmit --incremental false and targeted ESLint for modified/newTSfiles. Temporary acceptance config extends root and excludes only node_modules and outputs; root config otherwise includes1289 historical backup/artifactTSfiles. Verify with TypeScript config parser that every actual non-output source/test input from root is retained, so this checks current application and tests without compiling historical restoredcopies. Do not modify project tsconfig or prior backups. Record exact commands/exit codes; classify shell spawn denial separately from behavioralRED.
- [x] **2. Run Sites execution-profile discovery script then local build wrapper.** Run each command separately: node C:/Users/XF/.codex/plugins/cache/openai-curated-remote/sites/0.1.62/scripts/configure-execution-profile.mjs, then node C:/Users/XF/.codex/plugins/cache/openai-curated-remote/sites/0.1.62/scripts/build-site.mjs. The wrapper invokes the existing project build; never save candidate or deploy. Validate default Worker fetch export, source/build migration/hosting metadata pairs, current executable-source hashes, no local validation/diagnostic wiring in Worker or browser. Source code policy constants may be bundled; do not mistake harmless pure selectors for local runner/diagnostic invocation.
- [x] **3. Exactly once default offline launcher, no flags.** Shared Provider/factory change makes existing harness compatibility relevant. Run powershell -NoProfile -ExecutionPolicy Bypass -File scripts/live-research/run.ps1 with no live/probe flags; realrequests0. Read fresh Summary after process completion, verify ready/quality/activation/planning/owner/repeat/DBdisposal. Do not rerun paidAttempt17.
- [x] **4. Independent final integration QUALITY/security review.** Review exact final source + actual receipts/hashes against approved design. Resolve concrete issues with TDD and targeted rerun only. No blind whole-history retesting. Completed 2026-09-14: fresh policy_final_integration_review PASS, no actionable P1/P2/P3; independently verified source/build/type-input hashes and actual execution evidence. See final-integration-quality-review-20260914.json.
- [x] **5. Save checkpoint and handoff.** Mark this bounded migration localcomplete if evidence passes, keep full publicrelease goalactive/incomplete. Public execution/disconnect behavior, real login/Proof/persistence, production backup/restore, source integration/GitHub backup and concrete release remain separate unfulfilled requirements. No new paid/deploy approval is inferred. Checkpoint/report updated 2026-09-14; final-handoff-hashes.json and final-handoff-verification.json bind the reviewed unchanged candidate to the completed evidence.

## Self-review mapping

Design acceptance1→Task2;2/3→Task1 plusfactorychainTask3;4/5/6→Task3;7→Task4. Seven server fields separated from launcher, exact oldfingerprint, production diagnostics exclusion, fullprompt reuse and directrepairrefusal all assigned. No schema/repository/page expansion. Existing approved sequential execution choice is reused without another confirmation.
