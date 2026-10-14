# Arc v8 Kimi Quality Output Budget Implementation Plan

> **2026-09-12 RESUMED:** All three tasks SPEC then QUALITY READY. Root31files1252tests, nonincremental type/lint, current local build/artifact verification and default offline PowerShell passed. Final integration review READY; concrete handoff prepared, awaiting new thirteenth real-request authorization.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a local Research candidate with 32768 output-token headroom, complete substantive pedagogy, coherent20/21/22-minute execution limits and truthful receipts, while retaining all source, quality, billing and isolation checks.

**Architecture:** A strict eight-field local profile feeds a private local execution policy, the PowerShell launcher and validation fingerprint/Summary. Standard Research/Repair stay unchanged. Local transport diagnostics become v2 for the longer clock; v1 projection retains its historical bound. One POST and all finite resource/fee controls remain enforced.

**Tech Stack:** TypeScript/Zod4, existing PowerShell/Node24 launcher, Vitest4, injected fetch/streams, temporary SQLite, existing Sites/Vinext build.

---

用户已批准原设计并要求提高token上限、质量与稳定完成优先。最终规范为 `../specs/2026-09-11-arc-v8-kimi-output-budget-design.md`，当前32k/20分钟调整属于用户批准范围，不再问执行模式或重复设计批准。金额仍为此前USD5；第十二次许可消耗，无新的真实GET/POST/Probe/Repair许可。只读公开文档不属于推理请求。

使用当前权威linked worktree，分支codex/v8-openrouter-research-beta、HEAD7090153b4acad7b12df6a7ee4d675b46c41871dc；不建新工作树、不读Key/env/原始正文，不进行生产/Git写入/Sites保存部署。依赖仅允许新增Task3明确列出的已安装版本直接声明，不安装/下载/更新包。用户明确子代理实施覆盖Sites默认不让子代理改文件的建议；Root独占构建与生命周期。技能默认commit步骤用本地快照和哈希替代。

## File ownership and baseline

Root已保存 `outputs/local-output-budget-20260911/baseline-hashes.json`：原33项冻结候选匹配，再加入本次安全Summary、launcher相关测试和实质多技能fixture，共37项完整快照。第十二次历史清单保持不变。

Task1 owns:
- `app/server/research/local-validation-profile.json`: fixed eight-field profile.
- `app/server/research/openrouter-provider.ts`: private local policy, token budget/quality prompt/new deadline and diagnostic version.
- `app/server/research/transport-diagnostic.ts`: v1/v2 bounded projection.
- `scripts/live-research/run.ps1`: raw profile gate and launch text/deadline.
- `tests/server/kimi-output-budget.test.ts` (new), `kimi-local-validation.test.ts`, `kimi-launcher-policy.test.ts`, `live-launcher-output.test.ts`, `research-transport-diagnostic.test.ts`, `openrouter-transport-observation.test.ts`.

Task2 owns:
- `scripts/live-research/validation.ts`: local declaration/fingerprint/Summary, same guarded validation path.
- `tests/server/live-output-budget.test.ts` (new), `live-research-validation.test.ts`, `research-request-contract.test.ts`.
- Existing local-policy expectations in `live-research-failure-summary.test.ts`, `live-transport-diagnostics.test.ts`, `openrouter-response-compatibility.test.ts`, `research-search-policy.test.ts`, `live-result-diagnostics.test.ts` may be updated only if they specifically fail due to approved profile/prompt/version/deadline changes; preserve each underlying invariant and report exact changes.

Root owns spec/plan/operations/checkpoint, all snapshot manifests and final checks. Protected: contracts, shared provider versions/limits/search policy, standard service factory, validators, guard, fixture content, production flags/config/migrations. runner.mjs remains protected in Task1/2; only Task3 explicitly changes it with package manifests. Task1 freezes validation until Task2; no simultaneous implementation agents.

## Task1: Local profile, execution and launcher

- [x] **RED: prove actual outbound budget differs from the current12000.** In the new node-environment test, inject fetch so no real network can occur:

```ts
// @vitest-environment node
import { expect, it, vi } from "vitest";
import { createKimiLocalValidationProvider } from "../../app/server/research/openrouter-provider";
it("uses the approved 32768 output budget on the real local request builder", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({
    model: "moonshotai/kimi-k3", choices: [{ finish_reason: "length" }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0.1,
      server_tool_use: { web_search_requests: 2 } },
  }));
  await createKimiLocalValidationProvider({ key: "synthetic-output-budget", fetch })
    .research({ role: "Data Product Manager", locale: "en-US" }).catch(() => undefined);
  expect(fetch).toHaveBeenCalledOnce();
  expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string).max_tokens).toBe(32768);
});
```

Run `node node_modules/vitest/vitest.mjs run tests/server/kimi-output-budget.test.ts`; expected assertion failure12000 vs32768, not spawn/import failure. Save RED output. If sandbox blocks Vite/esbuild spawn, request the same scoped offline command escalation, not a live runner.

- [x] **Implement fixed profile and private execution selection.** Exact JSON:

```json
{
  "profileId": "kimi-low-output32k-v2",
  "model": "moonshotai/kimi-k3",
  "reasoningEffort": "low",
  "maxOutputTokens": 32768,
  "outputPolicyVersion": "kimi-complete-quality-v1",
  "researchTimeoutMs": 1200000,
  "activeTtlMs": 1260000,
  "launcherTimeoutMs": 1320000
}
```

Zod.strict validates fixed literals, finite integers and time order; getter freezes a fresh projection. Private execution policy explicitly carries a local profile rather than selecting by model. The executable selection is equivalent to:

```ts
const local = policy.localProfile;
const maxTokens = repair ? 8_000 : local?.maxOutputTokens ?? 12_000;
const maximumTimeoutMs = local ? local.researchTimeoutMs : 120_000;
const systemPolicy = repair ? REPAIR_POLICY : local ? LOCAL_RESEARCH_POLICY : RESEARCH_POLICY;
```

Only local factory populates localProfile after strict validation. Keep standard request bytes, versions, prompt, timeout ceiling and Repair intact, including standard provider configured with Kimi. Preserve snapshotted key, malformed-input rejection, injected fetch requirement and local Repair refusal.

- [x] **Add local quality-policy text before OUTPUT_CONTRACT_JSON.** Keep original base instructions and exact schema suffix; use a fixed mapping from `kimi-complete-quality-v1` to static instructions. Policy must require planning all seven sections, complete role/core-skill coverage, substantive steps/exercises/proof/rubrics, only remove repetition, valid unique short IDs/references, at least one learn and exactly one calibrate/reinforce per skill, optional extra learn when educationally useful. No hidden skill cap, forced short units, fabricated sources, empty shells or partial JSON. Do not inject local control fields into standard messages. Validate schema suffix equality via existing tests. Do not add new dynamic prompt inputs or shared version bump.

- [x] **RED/GREEN longer deadline and versioned finite observation.** Extend tests to observe an unresolved local request still pending at600000 and rejecting once at1200000 with cancellation and no second fetch; do both pre-header and body-read paths. Keep standard max120000 unchanged. V2 observer uses version `transport-diagnostic-v2` and a1320000 clamp. Projector accepts v1 with old720000 bound and v2 with1320000, rejects unknown versions/out-of-range/accessors; preserve ten fields and cross-field/byte rules. A minimal version selector for projection is:

```ts
const maximumElapsed = version === "transport-diagnostic-v1" ? 720_000
  : version === "transport-diagnostic-v2" ? 1_320_000 : null;
if (maximumElapsed === null) return null;
```

Use this selected bound for all three elapsed fields. Emit v2 only for the explicit new local policy; optional standard observation stays dormant. Test v1 limit720000/720001 and v2 limit1320000/1320001 separately. Update actual local observer expectations; retain old v1 fixtures for compatibility tests.

- [x] **RED/GREEN PowerShell raw gate and lifecycle.** Update current raw-pair quantifier from `{5}` to `{7}`, exact eight property names, numeric maxOutputTokens32768, policy/profile exact strings and1200000/1260000/1320000. Preserve JSON grammar, noBOM/strictUTF8, duplicate/case/type/extra rejection before prompt or child start. Update encoded-string/scientific-number positive fixtures and existing scaled-time child/output-drain tests coherently. Launcher says32768,20-minute Provider,22-minute total; offline sayszero real requests. Unchanged probe512/no search and other modes bypass local profile as before.

- [x] **GREEN, self-review and snapshot.** Run task tests plus standard-provider boundary suite:

```powershell
node node_modules/vitest/vitest.mjs run tests/server/kimi-output-budget.test.ts tests/server/kimi-local-validation.test.ts tests/server/kimi-launcher-policy.test.ts tests/server/live-launcher-output.test.ts tests/server/research-transport-diagnostic.test.ts tests/server/openrouter-transport-observation.test.ts tests/server/openrouter-provider.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js app/server/research/openrouter-provider.ts app/server/research/transport-diagnostic.ts tests/server/kimi-output-budget.test.ts tests/server/kimi-local-validation.test.ts tests/server/kimi-launcher-policy.test.ts tests/server/live-launcher-output.test.ts tests/server/research-transport-diagnostic.test.ts tests/server/openrouter-transport-observation.test.ts
```

Save RED/GREEN evidence, task snapshots and final hashes under ignored evidence directory; no commit. Expect relevant tests/type/lint exit0. Report pre-existing or deliberately Task2-dependent exact local Summary failures without weakening assertions or expanding scope.

- [x] Independent SPEC review; fix with meaningful RED/GREEN when needed, then re-review until READY.
- [x] Independent QUALITY/SAFETY review only after SPEC READY; close findings before Task2.

## Task2: Fingerprint, Summary and complete local validation

- [x] **RED actual receipt and coherent policy.** Use existing guarded-validation synthetic fetch helpers: one fake Key response and one fake completion wrapping `validResearchCandidate`/`validAnnotations`. All networking injected. Assert new fields on actual returned Summary; first failure must show missing fields/old declaration, not startup errors:

```ts
expect(summary.researchPolicy).toMatchObject({
  profileId: "kimi-low-output32k-v2", maxOutputTokens: 32768,
  outputPolicyVersion: "kimi-complete-quality-v1",
  researchTimeoutMs: 1_200_000, activeTtlMs: 1_260_000, launcherTimeoutMs: 1_320_000,
});
```

Run `node node_modules/vitest/vitest.mjs run tests/server/live-output-budget.test.ts`; preserve actual RED.

- [x] **Implement same-source output receipt/fingerprint.** Add two fields to researchPolicy Pick and frozen projection; keep mode-specific null/UTC semantics. LIVE_POLICY.timeoutMs becomes1200000 (may derive from the validated profile if module-load failure behavior remains deliberate). Replace output fingerprint hardcoded12000 with actual fixed profile policy:

```ts
output: {
  maxTokens: profile.maxOutputTokens,
  outputPolicyVersion: profile.outputPolicyVersion,
  strictJsonSchema: true,
},
```

Profile still included in fingerprint. Expose existing pure `validationFingerprint` as a module-only test seam if necessary; it cannot grant runtime overrides. Test maxOutputTokens, outputPolicyVersion and each time field independently for sensitivity using typed trusted synthetic descriptors; actual runValidation must still accept only strict fixed profile. No Key in descriptor/fingerprint/Summary.

- [x] **GREEN end-to-end positive and negative.** Reuse substantive multi-skill fixture rather than duplicate a one-skill shell. Actual adapter→usage→package/source/quality validation→SQLite→owner isolation→activation→deterministic planning must pass with new policy/onePOST/noRepair. Assert captured request and Summary derive the same profile; assert fingerprint stored in run/package corresponds to new descriptor through existing repository inspection seams. Separately fake `length`+trusted usage: failed, settled exactfee, noactivation/planning, audit1, secondResearchDenied, zeroRepair, databaseDisposed; no attempt to parse/repair truncated content. Use fake clock timeout1200000 to prove v2 diagnostic survives actual Summary reprojection rather than becoming null.

- [x] **Preserve existing invariants during test updates.** Standard Research/Repair wire contracts and strict schema equality stay exact. Update only local byte counts/policy/time expectations in existing request-contract tests; keep schema marker suffix pureJSON and contract/fingerprint sensitivity through storage. Retain v1 diagnostics compatibility, response/content byte rejection, privacy/search/charges/cancellation/idempotency/owner gates.

- [x] **Run Task2 regression/type/lint; save evidence and hashes.**

```powershell
node node_modules/vitest/vitest.mjs run tests/server/live-output-budget.test.ts tests/server/live-research-validation.test.ts tests/server/research-request-contract.test.ts tests/server/live-research-failure-summary.test.ts tests/server/live-transport-diagnostics.test.ts tests/server/openrouter-response-compatibility.test.ts tests/server/research-search-policy.test.ts tests/server/live-result-diagnostics.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js scripts/live-research/validation.ts tests/server/live-output-budget.test.ts tests/server/live-research-validation.test.ts tests/server/research-request-contract.test.ts
```

- [x] Independent SPEC READY then independent QUALITY/SAFETY READY, fix/review loops before completion.

## Task3: Native local Research connection deadline

Root source investigation and4 pure loopback requests confirmed native headers/body300s defaults and supported per-request override. This is a newly discovered mismatch with approved20-minute stability requirement, not a proven historical failure cause. Read-only design assessment completed; scope is explicit in updated spec. Start only after Task2 SPEC andQUALITY READY.

Ownership: `scripts/live-research/runner.mjs`, new `scripts/live-research/native-transport.mjs`, new `tests/server/live-native-transport.test.ts`, `package.json`, `package-lock.json`. Existing Task1/2 tests unchanged unless a concrete reviewed invariant requires a correction. Root preserves all earlier manifests and creates Task3before and final protection manifests.

- [x] RED through actual isolated runner with only injected synthetic fetch and stdin: existing oneGET/onePOST fake length+trustedusage must fail to carry scoped dispatcher before implementation; require new scoped POST while nativeGET unchanged. Failure should demonstrate missing scoped transport, not merely missing module import. Preserve RED.
- [x] Add exact already installed `undici: 7.24.8` devDependency in manifest andlockroot only; existing resolved/integrity/package records stay byte-semantically unchanged. No install, lifecycle scripts or downloads. Verify installedversion/lockcoherence.
- [x] Implement side-effect-free local helper factory: initialize nativeResponse before dynamic public Undici import; strict validated1200000 fixeddeadline, per-instance Agent headers/body1200000, no retry/global mutation/Nodeinternals. Input fetch explicitly injected and no Key retained. Only exact Research POST receives dispatcher; GET preserves original options/nativefetch. Do not expand existing guard authority or runtime flags. Agent makes directResearchconnections, no proxy/env inspection/fallback.
- [x] Runner executeOne after existing strictgetter viaVite creates scope and injectsfetch; other modes/defaultoffline/malformedargs/invalidprofile do not createAgent. Keep globalfetch failclosed and all arguments/stdin/wxSummary behavior. Finally boundedAgentdestroy (finite fixedcleanup≤10s, handles latefailure) andVitecleanup independently, safefixedfailure/unsuccessfulexit. No cleanupfailure may skip the other cleanup.
- [x] Behavioral tests cover actualrunner success/semanticfailure/cleanup, exactGETnative andPOSTscoped preserving body/headers/signal/redirect/nativeResponse, strictdeadline rejection, no globaldispatcher identity change in cleanprocess, no realexternalrequest. Native local loopback tests verify delayedheaders/body completion with appropriateconfiguredlimits and callerabort inbothphases; ensure no outstanding sockets/timers and oneattempt, not retries. Use Rootscaledexperiment as supportingproof with token-independenttotalaborttests, not as substitute for helperpolicy/runnerwiring assertions. Stubbeddestroy tests include rejection and never-resolving cleanup with finitebound and latehandledrejection.
- [x] GREEN: new native test + Task2runValidation + live-account-check + live-minimal-probe + minimal-probe-transport + existinglauncher suites; typecheck and touchedlint; protectallout-of-scopefiles; savebefore/after/hash/evidence. No build bysubagent.
- [x] Independent SPEC READY after revision1; P2 body-read abort and P3 deletion boundary findings closed.
- [x] Independent QUALITY/SAFETY READY on 2026-09-12 after resume; no P1/P2/P3. Reviewer output32k_task3_quality_resume.

## Root integration and handoff

- [x] Verify protected hashes, union of Task1/Task2 tests plus orchestrator/routes/source/registry/planning/environment tests, final type and touched-file lint. Full command uses local node_modules binaries, no dependency download. Expand only for a new failure or concrete concern.
- [x] Read current Sites skill/environment instructions, execute local `node C:/Users/XF/.codex/plugins/cache/openai-curated-remote/sites/0.1.62/scripts/build-site.mjs`, verify Worker/default fetch/client/hosting/migration artifacts. Build is local, no Sites save/deploy.
- [x] Fresh default offline PowerShell rehearsal: no modes, exit0, passed, realRequestCount0, ready/planning/isolation/disposed verified. Summary 2026-09-12T03-54-48-534Z.
- [x] Final independent integration review against approved32k design and actual frozen candidate. Source/quality/fee checks must remain intact; no success claim from synthetic output alone.
- [x] Save operational validation record/checkpoint/goal/gates, exact final fingerprints and offline output. Prepare one concrete real validation candidate only after all local checks; ask for a new explicit single Research permission before providing a new execute command. Do not automatically execute or reuse consumed Key/authorization.

Plan self-review: all final spec requirements mapped; no new production/provider requests; accepted user adjustment replaces obsolete24k/600s values; task boundaries avoid simultaneous edits; diagnostic version compatibility covers changed deadline; standard behavior is independently checked. No code or acceptance changes outside this plan are implied.
