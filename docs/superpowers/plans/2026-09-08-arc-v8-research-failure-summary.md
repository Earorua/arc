# Arc v8 Research failure summary implementation plan

> **2026-09-08 后续设计更新：** 本摘要修复早已完成。恢复后以两个无认证公开元数据 GET 核实 Kimi 默认 max、支持 low，形成 `docs/superpowers/specs/2026-09-08-arc-v8-kimi-budget-timeout-design.md`。后续工作从该可审阅设计继续；不重做本计划，也不将下方当时未知的推理支持情况沿用为当前结论。新设计尚未实施，未新增真实请求许可。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development, TDD, independent specification review, then independent quality/security review. This is a local diagnostic repair; no live requests.

**Goal:** Preserve the existing safe Research failure category in the local validation summary so a 200 response followed by timeout is distinguishable from invalid output.

**Architecture:** The orchestrator already returns a strict, provider-neutral `failureCategory` for Failed runs. Project that existing enum into `ValidationSummary`; do not alter the adapter, transport, domain state or budget decisions. Reproduce request and body stalls with fake timers through the actual validation/adapter/orchestrator chain.

**Tech Stack:** Existing TypeScript, Vitest fake timers, injected synthetic fetch and disposable in-memory SQLite; no dependencies.

## Evidence and root cause

The authorized Kimi complete Research attempt produced `summary-2026-09-08T13-52-03-953Z.json` (989 bytes; SHA256 `4969ecaff86d720a54a99fe658afc1b4622655784d66e8ca1d90729fecf4a62b`). UTC start 13:52:03.953, saved 13:54:04.8135985, approximately 120.861 seconds later; key preflight took 814 ms. Key and Research HTTP statuses are 200. Outcome incomplete/research-failed, Failed run, no actual model/usage/citations/skills/planning, one Key GET plus one Research POST, no Repair, disposable budget conservative-hold and databaseDisposed true. This permit is consumed, bringing total observed inference attempts to six (five failures/incomplete, one minimal Kimi success).

The timing is consistent with the configured 120-second Research deadline after key preflight; it is not conclusive proof of timeout because the saved summary omits the classification and the disposable database is gone. Do not rewrite the historical report or infer zero billing from a missing receipt. The user's initial Activity cost USD 0.158 / Routing Overhead 1.24 s was later identified as a **server-tool child inference**, with exact usage USD 0.1581398. This is user-provided platform evidence, not an independently queried client usage or settlement receipt or the complete parent aggregate. See the sanitized metadata below. No authenticated follow-up or retry is authorized.

Source trace: `OpenRouterResearchProvider` carries its request/body deadline through the body read; `ResearchOrchestrator.providerFailure` maps typed errors to the existing strict public failure enum. `runValidation` receives that Failed public view but discards `failureCategory` when creating its summary. This loss is the diagnosed local defect. The live upstream cause still needs evidence.

Official [OpenRouter error documentation](https://openrouter.ai/docs/api_reference/errors-and-debugging), checked 2026-09-08, explains that HTTP 200 can precede the final model response and errors can occur after headers; a non-streaming response can also fail after 200. This supports the distinction between status and completed result, not a diagnosis of this specific request.

## Task: preserve the safe category with offline regression

**Modify:** `scripts/live-research/validation.ts` only.

**Create:** `tests/server/live-research-failure-summary.test.ts`.

Root owns docs and final verification. Preserve all other runtime files, existing tests, historical JSON and real-key secrecy. Do not alter model, request body, privacy/search/schema limits, timeouts, routing, response parsing, budget settlement, unused-key preflight, retry/Repair or production state.

- [x] Write tests first using `runValidation` and actual services with injected synthetic fetch. Assert a default offline Ready and a key-only outcome have `failureCategory: null`. For an immediate HTTP 200 fixture body that stalls, fake-time advance 120,000 ms must end with `failureCategory: "timeout"`, HTTP 200, incomplete/Failed, usage null, conservative-hold, no activation/planning, one GET+POST, zero Repair, cancellation and disposal. A stalled request before headers also yields timeout, with HTTP status null. Malformed HTTP 200 JSON yields `invalid-result`, not timeout. Preserve safe canary exclusion and zero automatic retries. Do not sleep two real minutes or use global network.
- [x] Observe RED from the missing summary category with runtime source unchanged; startup EPERM is not valid RED. If fixture timing assumptions are wrong, correct the test host and re-observe RED before source edits.
- [x] Add the existing enum type/schema to the imports and summary shape, initialize to null, and assign only a validated existing category on Failed:

```ts
// Import researchPublicFailureCategorySchema and type ResearchPublicFailureCategory.
failureCategory: ResearchPublicFailureCategory | null;
// Initial summary:
failureCategory: null,
// Immediately after recording runId/runState:
if (run.state === "failed") {
  const category = researchPublicFailureCategorySchema.safeParse(run.failureCategory);
  if (category.success) summary.failureCategory = category.data;
}
```

Never copy raw Error messages, provider body/header details or arbitrary category strings. The seven existing categories are timeout, rate-limited, allowance-reached, service-unavailable, content-rejected, invalid-result and internal. Do not change the existing overall reason or live acceptance criteria. Reports written earlier lack this field; no migration or retroactive change is made.

- [x] GREEN: `npm run test:unit -- tests/server/live-research-failure-summary.test.ts tests/server/live-research-validation.test.ts` and targeted lint. Root runs the new file plus the previous nine-file 494-test regression, nonincremental TypeScript, lint/diff and source preservation checks.
- [x] Independent specification review, then independent quality/security review. Resolve material findings, record hashes and results. No valid-key CLI or actual default launcher rerun is needed solely for this added summary field; the existing runner generically serializes it and fixture tests cover its value.
- [x] Save checkpoint and live-evidence state. The repair improves future diagnostics and does not establish the past real failure's cause or authorize another model call. User-provided Activity child records now inform the next local repair design; do not infer parent acceptance or a new paid permit.

## Baseline

HEAD `7090153b4acad7b12df6a7ee4d675b46c41871dc`, branch `codex/v8-openrouter-research-beta`, 19 intentional uncommitted files before this plan/test; expected total 21 after this slice.

Validation SHA256 before repair: `08f118d97372e81aef68e4991ad19210ec6edf2d59e1b20c0916f36376a9f424`. Existing launcher `72af6004cbd6636305aa567696d76c2237fa81ecfccf502f279319444ab4373c`, runner `47305aa27df034bea1e669016bb8b2d83338425e4e67da476d050a2b4858a226`, transport `1eb21e6eaf07ba9bb6d7c61bd060b03bf767775a046b87b9c7a1838442ff8a00`, adapter `cefcebc65ca658596e46785fa14499804d6668bed7227376751b7f29d8a8a37d` and orchestrator must remain unchanged. No commits/push/master/production/Sites changes.

## Verification evidence

Implementer valid RED: **4 tests / 4 failed, 1.34 seconds**; all failed because the existing summary omitted the requested category. An initial sandbox child-process EPERM was not counted as RED. Final focused GREEN after a test-only signal-holder typing correction: **2 files / 57 tests passed, 7.28 seconds**; nonincremental TypeScript, targeted ESLint and diff check passed.

Root fresh regression: **10 files / 498 tests passed, 10.79 seconds**. It comprises the new failure-summary file plus live-research-validation, live-account-check, openrouter-provider, research-environment, research-planning-integration, live-launcher-output, minimal-probe-transport, live-minimal-probe and provider-failure-diagnostic. Nonincremental TypeScript, two-file ESLint and diff check also passed. Tests use only injected fixtures, fake timers and disposable local databases, with no real Key or Provider request. Existing launcher/runner/transport/minimal-probe/error-explanation/adapter/orchestrator/factory and both existing validation/account tests retain their pre-slice hashes. The two historical real Kimi summaries also retain their exact hashes.

| File | Final SHA256 |
| --- | --- |
| scripts/live-research/validation.ts | `a49a276e736e425d30b066266670d3339dfe15d6f00e357d3abb70e9a752d696` |
| tests/server/live-research-failure-summary.test.ts | `fabf369c8ee6eb0592120ba1179d15c8d9159582b2476fb9e28f533a2734d664` |

Only the local summary projection changed runtime behavior; the original report remains unmodified and cannot gain a retrospectively inferred category. Independent specification review **READY**, then independent quality/security review **READY**, with no actionable findings. Spec review independently reversed only category additions in memory and recovered the exact pre-slice validation hash; quality review confirmed both final file hashes. Checkpoint and release evidence are saved. This diagnostic slice is complete; runtime API/Research acceptance is not.

## Subsequent Activity evidence: child inference, not parent acceptance

The user supplied Activity metadata. Only selected non-sensitive fields are retained here; do not copy Key metadata, hashes/labels, account/workspace IDs or the full object into the repository or support attachment.

| Observation | User-provided value |
| --- | --- |
| Created UTC | 2026-09-08T13:52:10.38Z |
| Relationship | parent present; spawned_by server-tools:web_search; generation_type inference |
| Model / served by | moonshotai/kimi-k3-20260715 / Sail Research |
| Generation / latency / router latency | 94,864 / 1,095 / 1,236 ms |
| Native prompt / completion / reasoning | 823 / 12,000 / 11,334 tokens |
| Normalized prompt / completion | 816 / 12,658 tokens; not the native tokenizer counts |
| Finish reasons | normalized tool_calls; native length |
| Streamed / cancelled | true / false, on this child record |
| Child usage / upstream usage | USD 0.1581398 / USD 0.1581398 |
| Provider routing statuses | DigitalOcean 429, then Sail Research 200 |
| Search results / web usage | null; these child nulls do not establish zero searches or zero tool charges |

This establishes that a Kimi child generated tokens and reached the native 12,000-token cap, with reasoning accounting for 94.45% of native completion. It does not establish the parent's success, cancellation, complete duration, final structured output, search count, or total billed usage. Keep normalized tool_calls and native length distinct. A child streamed flag does not contradict the unchanged local stream:false request; server-side orchestration is not the client's wire mode. Routing fallback inside OpenRouter does not increase the observed client POST count.

Official [reasoning documentation](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) states that reasoning tokens count as output tokens; supported reasoning controls vary by model. Official [server-tool documentation](https://openrouter.ai/docs/guides/features/server-tools) and [web search flow](https://openrouter.ai/docs/guides/features/server-tools/web-search) describe server-side tool/model loops. These support investigating reasoning allocation and multi-stage duration, without proving the precise parent failure. Current adapter sends max_tokens:12000, no explicit reasoning control; its configured local timeout remains 120 seconds and the launcher/active TTL remain 180 seconds. No parameter changed in this slice.

The subsequent response to the parent-metadata question was another **child with the same parent/request relationship**, not the parent. Its sanitized observations are below; identity values and Key/account/workspace metadata are deliberately not retained.

| Second child observation | User-provided value |
| --- | --- |
| Created UTC / served by | 2026-09-08T13:53:47.229Z / DeepInfra, provider HTTP 200 |
| Relationship / model | same parent and request as first child; server-tools:web_search / moonshotai/kimi-k3-20260715 |
| Generation / latency / router latency | 232,585 / 1,568 / 299 ms |
| Native prompt / completion / reasoning | 15,300 / 3,865 / 0 tokens |
| Normalized prompt / completion | 3,565 / 4,008 tokens |
| Cancelled / streamed / finish reasons | true / true / normalized and native both null |
| Search engine / result count | exa / 10 |
| Child usage / upstream / web | USD 0.11268125 / USD 0.09868125 / USD 0.014 |

This adds evidence of real search results and a cancelled downstream generation lasting longer than the configured local deadline. It does not show who initiated cancellation, how long propagation took, whether the parent completed, or the parent's aggregate billing. Do not label the child duration as total Research duration or sum displayed parent/child amounts as final billing without establishing aggregation rules. The two known child usage values are distinct observations; neither is the whole-request client receipt.

## Next local design, not a newly authorized live experiment

There is sufficient evidence to prepare a repair direction without repeatedly asking the user for more Activity exports. Prioritize model-supported reasoning allocation (the first child used 94.45% of native output on reasoning) and coordinated multi-stage timing/cancellation (the second child recorded 232.585 seconds and cancellation). Exact Kimi effort/token-budget support has not been established by the generic reasoning docs; do not invent a supported value or assume hiding reasoning reduces its consumption. Check fixed-model/endpoint support before specifying a request change.

Review adapter deadline, local orchestrator active TTL and PowerShell child lifetime together; also keep production factory's separate shorter limits explicit. Any extended local validation design must remain bounded and must not silently alter the production contract, application lease, model/privacy/search limits, Ready validation or budget settlement. Use fixture TDD for late completion, interruption and cost unknown states before a further controlled live attempt. Do not merely increase max_tokens or one timeout. No additional paid request, secret read, production activation, commit/push or deployment is authorized by this metadata. Current code is unchanged beyond the reviewed failure-summary projection.
