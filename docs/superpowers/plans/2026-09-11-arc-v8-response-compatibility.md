# Arc v8 Response Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax for tracking.

**Goal:** 修复官方可选引用标题和双路径搜索用量的本地兼容性，保留完整来源/候选/费用门槛。
**Architecture:** Adapter 仅在缺标题时派生来源域名标签，保留原 URL。用量解析与有限诊断共用双路径选择，任何已提供非法值或冲突仍保守处理。
**Tech Stack:** TypeScript, Zod, Vitest, local node:sqlite/D1 harness, existing Vinext/Worker build.

用户 2026-09-11 明确“批准”设计，无需再确认本地实施。权威 worktree/分支/HEAD 沿用恢复检查点；九次实测许可已消耗。只用合成数据，不读 Key/env/原始响应，不做 Git stage/commit/push/merge、生产或 Sites 写入。用户保留现有工作树及本地范围的要求优先于技能默认新建/提交/发布流程。

基线：51 份原未提交成果；6 份源/测试快照及 18 份受保护哈希在 ignored outputs/local-response-compatibility-20260911。先前635项验收不重做；发生新改动才运行相应回归。原第九次 Summary 保持原字节。

### Task 1: 双路径搜索用量与有限诊断

**Files:** Modify app/server/research/result-diagnostic.ts; tests/server/provider-result-diagnostic.test.ts; tests/server/live-result-diagnostics.test.ts. scripts/live-research/validation.ts only if type/wiring adjustment required. No Adapter title change in this task.

- [x] RED: Add tests for details-only usage accepted and new diagnostics. Example using existing validUsage:
```ts
const wire = { ...validUsage, server_tool_use: undefined,
  server_tool_use_details: { web_search_requests: 2 } };
expect(parseOpenRouterUsage(wire, false)).toEqual({ success: true, data: safeUsage });
expect(projectProviderResultDiagnostic({ choices: [{ finish_reason: "stop" }], usage: wire }, false, null))
  .toMatchObject({ webSearchUsage: { container: "missing", requests: "unavailable" },
    webSearchUsageDetails: { container: "object", requests: "valid" }, webSearchUsageSource: "details" });
```
Run: node node_modules/vitest/vitest.mjs run tests/server/provider-result-diagnostic.test.ts
Expected RED: usage rejected or new diagnostic fields absent. Fix only test setup errors until assertion fails for missing behavior.

- [x] GREEN: one selector within result-diagnostic.ts for both aliases; reuse existing count schema/classifier. A complete core decision can use this structure (adapt identifiers to existing helpers):
```ts
type SearchSource = "legacy" | "details" | "both" | "missing" | "invalid" | "conflict";
function chooseSearchCount(legacy: unknown, details: unknown): { source: SearchSource; value: number | undefined } {
  const containers = [legacy, details];
  const present = containers.map((container) => container !== undefined);
  if (!present[0] && !present[1]) return { source: "missing", value: undefined };
  const parsed = containers.map((container) => providerUsageSchema.shape.webSearchRequests.safeParse(
    container !== null && typeof container === "object" && !Array.isArray(container)
      ? (container as Record<string, unknown>).web_search_requests : undefined));
  if (present.some((exists, index) => exists && !parsed[index]!.success)) return { source: "invalid", value: undefined };
  if (present[0] && present[1]) {
    const left = parsed[0]; const right = parsed[1];
    if (!left?.success || !right?.success) return { source: "invalid", value: undefined };
    return left.data === right.data ? { source: "both", value: left.data } : { source: "conflict", value: undefined };
  }
  const index = present[0] ? 0 : 1;
  const selected = parsed[index];
  return selected?.success ? { source: index === 0 ? "legacy" : "details", value: selected.data } : { source: "invalid", value: undefined };
}
```
Usage not record => invalid/unavailable diagnosis. Only Repair with both containers absent defaults to 0; any provided malformed alias blocks selection, including when other alias valid. Both counts same choose once, unequal => conflict. Never read total tool calls for inference, never sum aliases. All token/cost/range rules unchanged. Prefer a shared selector/classifier that avoids duplicate untrusted reads; supplied snippet specifies decisions, not mandated structure.

- [x] Expand RED/GREEN coverage: old/new/same/conflict, both sides invalid/null/array/empty, no-search-count with total tool counts, absent containers, Repair new explicit count, 0/10 valid; negative/fraction/NaN/Infinity/11/string invalid. Reuse direct parse tests for values JSON cannot carry. Add fixed webSearchUsageDetails + webSearchUsageSource to diagnostic types/projectors. Existing webSearchUsage still means legacy container. Strict projection validates both nested shapes, source consistency, fresh copies, unknown-property stripping, getters/callback throws and rejected Promise isolation. Both valid can only source both/conflict; legacy/details requires one valid+other missing; missing both missing; unavailable usage means both unavailable/source invalid.
- [x] SQLite integration tests: details-only valid aggregate actually settles and reaches Ready using existing valid titles; alias conflict/malformed remains conservative-hold; owner, single POST/Repair0, cleanup invariants remain. Do not invent changed run-state policy when usage null.
- [x] Verify: node node_modules/vitest/vitest.mjs run tests/server/provider-result-diagnostic.test.ts tests/server/live-result-diagnostics.test.ts tests/server/openrouter-provider.test.ts tests/server/kimi-local-validation.test.ts tests/server/live-research-validation.test.ts
Then node node_modules/typescript/bin/tsc --noEmit --incremental false and targeted eslint for changed TS.
- [x] Self-review, record precise RED/GREEN evidence, then independent specification review; fix/review any findings; only then independent quality/security review. Root owns docs/checklists; no commits.

### Task 2: 可选标题映射与完整本地流程

**Files:** Modify app/server/research/openrouter-provider.ts and tests/server/openrouter-provider.test.ts. Create tests/server/openrouter-response-compatibility.test.ts for combined real Adapter/SQLite integration. Do not edit Task 1 files except issue reported to root first.

- [x] RED: replace the old missing-title rejection expectation with a bounded acceptance test; keep all other malformed-title cases. Use existing harness, wire and choice fixtures:
```ts
const annotations = [{ type: "url_citation", url_citation: { url: "https://example.com/guide?utm_source=demo#part" } }];
const { provider } = harness(Response.json(wire(choice({ content: "{}", annotations }))));
expect((await provider.research(request)).annotations).toEqual([{
  type: "url_citation", url: "https://example.com/guide?utm_source=demo#part", title: "example.com"
}]);
```
Run node node_modules/vitest/vitest.mjs run tests/server/openrouter-provider.test.ts
Expected RED: invalid-transport on missing title. Preserve old green work.

- [x] GREEN: import canonicalizePublicCitationUrl into Adapter. At nested url_citation mapping, validate URL with existing field schema, use hostname only for title===undefined. One exact mapping pattern:
```ts
const citation = record(annotation.url_citation);
let title = citation?.title;
if (title === undefined) {
  const parsedUrl = providerCitationAnnotationSchema.shape.url.safeParse(citation?.url);
  if (!parsedUrl.success) { observe("annotations-invalid"); return fail("invalid-transport"); }
  try { title = new URL(canonicalizePublicCitationUrl(parsedUrl.data)).hostname; }
  catch { observe("annotations-invalid"); return fail("invalid-transport"); }
}
const parsed = providerCitationAnnotationSchema.safeParse({ type: "url_citation", url: citation?.url, title });
```
Then retain existing parsed.success/fail and annotations.push behavior. Canonicalization only derives hostname: returned URL stays original schema-trimmed string. Supplied null/nonstring/empty/blank/overlong title still rejects; no title replacement/truncation for those cases; no candidate-derived facts, flat citation support or filtering of bad URL citations.

- [x] Expanded RED/GREEN: valid titled behavior unchanged; missing URL, HTTP/private/local/credential URL, secret params, limits, null/blank/number/long title reject; canonical hostname (case/trailing dot/punycode as existing policy) and original URL fragments/params retained. Ensure downstream unsafe fragment/UTM markup or secret text is rejected, not erased by label derivation. Preserve arrays, content/outer bytes, charged/audit metadata.
- [x] New combined integration file uses actual runValidation({ executeOne:true, key:"synthetic-fixture-key", fetch: injectedSyntheticFetch }) with one synthetic Key GET and one synthetic POST from fixtureResponse(), deletes citation titles and moves count to details alias. Test reports Ready, trusted usage+settled reservation, ownerWrongReadRejected, secondResearchRejected, freshAccountActivated, planningGenerated, planningUnitCount>0, databaseDisposed, Repair0. All outbound application global fetch blocked; synthetic mode is not real Provider evidence.
- [x] Regression integration: unreferenced candidate URL, unsafe title/URL/fragment, malformed candidate and usage conflict still rejected/needs-review/conservative-hold according to existing rules. No new Repair or retry. Test standard and local Adapter entry points; preserve request body/model/low/timeouts/privacy/schema.
- [x] Verify targeted Task 2 tests, source-audit, research-planning-integration, then tsc and changed-file eslint. Do not run build (root owns final).
- [x] Self-review, report RED/GREEN, independent spec then quality/security review; address findings before root final. No commits.

### Root 整合与交接

- [x] 核对两项实际 diff、所有规格/质量问题已关闭、18 项受保护指纹。
- [x] 独立最终整合审查（只读）与 root 相关回归、非增量类型/定向 lint。相关回归包含上述文件及 research-candidate-diagnostic、live-candidate-diagnostic、research-orchestrator、research-environment、research-budget、d1-research-budget-repository、research-planning-integration；不重跑无关 UAT。
- [x] Root 单独运行 node C:/Users/XF/.codex/plugins/cache/openai-bundled/sites/0.1.66/scripts/build-site.mjs，核对默认 Worker fetch、客户端产物、原迁移元数据与 hosting 声明。只做本地 build。
- [x] 记录本轮 RED/GREEN、审查、最终源码指纹、安全合成摘要和局限到 docs/operations/v8-response-compatibility-validation-2026-09-11.md，更新 checkpoint/goal/gates。
- [x] 若全部本地验收通过，准备精确一次新的实测候选及预算，由用户单独授予第十次许可。不得自动调用 Provider，也不得把本地通过记作完整公开发布成功。

