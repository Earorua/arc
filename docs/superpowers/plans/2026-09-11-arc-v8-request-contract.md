# Arc v8 Request Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把同源完整输出契约加入 Research 系统消息，提升提示版本，完成零真实请求的严格契约、缓存和完整流程验证。

**Architecture:** Task1 在现有共享 Adapter 中加入同源契约文本并将 promptVersion 升为v2。用户实施期间选择10次搜索/50结果/USD5，追加Task2统一提示、请求、fingerprint和最终验收，提升搜索配置版本。Repair系统提示、质量/来源/用量与存储不变。

**Tech Stack:** TypeScript、Zod 4、Vitest、Node SQLite、现有 Sites 本地构建工具。

---

已批准设计：`../specs/2026-09-11-arc-v8-request-contract-design.md`。权威 worktree 为 `C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta`，分支 `codex/v8-openrouter-research-beta`，HEAD `7090153b4acad7b12df6a7ee4d675b46c41871dc`。保留 57 份已有成果，不创建新 worktree，不重做旧任务。

禁止真实 Provider/Key/原始正文读取、Repair/重试、生产配置/D1/R2、Git 暂存/提交/推送/合并、Sites 保存或部署。技能默认 commit/执行方式询问由这些已明确授权边界覆盖；直接采用已批准的子代理流程。

## 文件与保护

Task1应用仅修改 `app/server/research/openrouter-provider.ts` 与 `app/server/research/provider.ts`。测试主要新增 `tests/server/research-request-contract.test.ts`，扩展 `tests/server/openrouter-response-compatibility.test.ts` 的现有完整SQLite helper；必要时在既有provider/kimi/fake-provider或routes/repository测试中更新受影响期望。Task2另允许修改 `app/server/research/service-factory.ts` 与 `scripts/live-research/validation.ts`，其新增测试文件为 `tests/server/research-search-policy.test.ts`；不改历史固定fixture版本或真实结果。

前置八份文件快照位于 ignored `outputs/local-request-contract-20260911/*.before.txt`；`before-hashes.json` 为基线。Task1的 `protected-hashes.json` 冻结20项；Task2开始前由Root保留Task1最终候选，并生成仅移除service-factory与validation的18项保护清单，其余来源/候选/存储/费用/profile/launcher/runner/transport/usage解析与第八/九/十次Summary继续冻结。Root管理文档/快照。

### Task 1：完整请求契约、版本及离线流程

- [x] **读取局部上下文与捕获旧请求字节。** 阅读现有 Adapter、provider versions、compatibility 测试 helper、service-factory、validation、d1 cache lookup。用测试注入的 fetch 截获标准与 Kimi 请求，只记录 UTF-8 body 字节数及版本；使用 synthetic-dummy-credential，不输出 body/headers，不调用 runner 或真实 fetch。作为修改前比较基线写到本地 ignored 验证日志。

- [x] **RED：新增缺少可信契约块的行为测试，运行并报告确切失败。** 以下为完整最小测试，可作为新文件首项；后续标准入口使用相同断言：

```ts
// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { researchCandidateSchema } from "../../app/contracts/research";
import { createKimiLocalValidationProvider } from "../../app/server/research/openrouter-provider";
import { fixtureResponse } from "../../scripts/live-research/validation";

afterEach(() => vi.unstubAllGlobals());
it("places the complete output contract in the trusted Research message", async () => {
  vi.stubGlobal("fetch", async () => { throw new Error("outbound-denied"); });
  const injected = vi.fn<typeof globalThis.fetch>(async () => fixtureResponse());
  await createKimiLocalValidationProvider({ key: "synthetic-dummy-credential", fetch: injected })
    .research({ role: "Data Product Manager", locale: "en-US" });
  const body = JSON.parse(injected.mock.calls[0]![1]!.body as string);
  const marker = "\nOUTPUT_CONTRACT_JSON:\n";
  const policy = body.messages[0].content as string;
  expect(policy).toContain(marker);
  const embedded = JSON.parse(policy.slice(policy.indexOf(marker) + marker.length));
  expect(embedded).toEqual(z.toJSONSchema(researchCandidateSchema, { target: "draft-7" }));
  expect(embedded).toEqual(body.response_format.json_schema.schema);
  expect(body.response_format.json_schema.strict).toBe(true);
  expect(injected).toHaveBeenCalledOnce();
});
```

Run: `node node_modules/vitest/vitest.mjs run tests/server/research-request-contract.test.ts`。
预期 RED 是缺少 OUTPUT_CONTRACT_JSON，不是导入/启动错误。再加入期望 promptVersion v2 的断言，观察 v1 失败。Windows EPERM 启动错误可按明确零外网测试范围请求工具沙箱升级，不把启动失败当 RED。

- [x] **GREEN：最小实现。** 保留原 RESEARCH_POLICY 的全部句子，在最后一个句子后追加下面文本；同一 CANDIDATE_JSON_SCHEMA 同时供 response_format 与 JSON 文本使用，Repair 不追加：

```ts
  + " Return one JSON instance matching the output contract below, not the schema itself. "
  + "The input role is the job title to research; the output role must be an object conforming to the contract. "
  + "Follow every required field, nested object, ID rule, enum, and reference. Do not use empty shells or fabricated content to fill substantive gaps. "
  + "\nOUTPUT_CONTRACT_JSON:\n" + JSON.stringify(CANDIDATE_JSON_SCHEMA);
```

`provider.ts` 仅把 `promptVersion: "research-prompt-v1"` 改为 `promptVersion: "research-prompt-v2"`。不更改其他版本；生产工厂/validation 源码无需改动即读取该值。共享 Repair user 消息版本同步 v2，REPAIR_POLICY、模型/无工具行为不变；Kimi Repair 仍在 fetch 前拒绝。

- [x] **扩展契约与边界验证。** 同一嵌入 JSON 对标准/Kimi 均与导出 schema 深度相等，逐项断言七个根 required、role object、skills category/importance enums、unitTemplates 完整定义以及所有本地 $ref 可解析（不存在 ref 时也保持深度相等检查）。恶意 role 中加入 marker 和 synthetic 哨兵，断言它们不进入系统消息；标准 Repair 只保留原系统策略且没有新增块。记录正常请求字节与旧值增量，仍小于 262144。复用既有超大请求测试方式降低注入的测试 limit 或构造合法边界输入，断言整个 body 被限制且 fetch 为零；不要加入新的生产测试开关。

- [x] **验证版本与缓存身份。** 用 Vitest 的版本模块 mock/resetModules 对同一个实际 service-factory 分别装载 v1、v2，其余合成配置一致，比较不同 configFingerprint；凭据轮换但版本相同仍相等。通过实际本地 runValidation + repository save/find 调用观测或 spy pass-through 核对临时 fingerprint 也随版本改变，审计 promptVersion 与出站 user 消息一致。使用已有一次性 SQLite repository helper 建立 v1 缓存；v1 同身份命中，v2 身份不命中。不得将生产函数替换成测试计算器后声称验证了实际工厂，不暴露新测试专用生产接口；mock/spy 全部清理。

- [x] **保留严格拒绝与完整合成流程。** 扩展已有 `validationRun` helper 的 details-only fixture，所有调用均注入合成 fetch。以下检查沿用该 helper 已有字段，合法计数 2 与 4 参数化；原有 malformed candidate / URL / usage 负例继续运行：

```ts
it.each([2, 4])("keeps reported search count %s and honest settlement", async (count) => {
  const { result, injectedFetch, applicationFetch } = await validationRun((payload) => {
    payload.usage.server_tool_use_details = { web_search_requests: count };
  });
  expect(result.usage?.webSearchRequests).toBe(count);
  expect(result.reservation).toMatchObject({ status: "settled", settledMicros: result.usage!.costMicros });
  expect(result.outcome).toBe(count === 2 ? "passed" : "incomplete");
  expect(result.freshAccountActivated).toBe(true);
  expect(result.planningGenerated).toBe(true);
  expect(result.planningUnitCount).toBeGreaterThan(0);
  expect(result.ownerWrongReadRejected).toBe(true);
  expect(result.secondResearchRejected).toBe(true);
  expect(result.databaseDisposed).toBe(true);
  expect(result.repairRequestCount).toBe(0);
  expect(injectedFetch).toHaveBeenCalledTimes(2);
  expect(applicationFetch).not.toHaveBeenCalled();
});
```

上述2/4测试仅验证Task1中间候选的原有计数逻辑；最终用户要求由Task2改为10次/50结果，届时4次合法候选必须通过，不能保留旧期望作为最终要求。用缺失role和字符串role两类fixture验证原invalid-type拒绝；unknown keys、错误技能枚举、缺教学/来源信息仍拒绝。Task1不修改候选/usage/schema/质量/最终次数门槛。

- [x] **定向验证与自审。** Run: `node node_modules/vitest/vitest.mjs run tests/server/research-request-contract.test.ts tests/server/openrouter-response-compatibility.test.ts tests/server/openrouter-provider.test.ts tests/server/kimi-local-validation.test.ts tests/server/live-research-validation.test.ts tests/server/fake-research-provider.test.ts tests/api/research-routes.test.ts tests/server/d1-research-repository.test.ts`；追加实际改过的测试文件。全部通过后运行 `node node_modules/typescript/bin/tsc --noEmit --incremental false` 及 `node node_modules/eslint/bin/eslint.js` 后接实际改过的 TS 文件。报告 RED/GREEN、字节增量、缓存/计数证据、文件列表、疑虑；Root 后续独立审查，不提交 Git。

### Task 2：用户追加的10次搜索/50结果统一策略

仅在Task1的独立规格和质量/安全审查通过后派新实现者。用户已明确选择本任务，无需再次询问。模型、low、600/660/720秒、12000输出token、USD5、一个客户端Research POST及Repair0保持不变。

- [x] **RED：** 新增 `tests/server/research-search-policy.test.ts`，使用Task1相同注入fetch/完整fixture捕获标准和Kimi body，期望 `max_tool_calls:10`、`max_uses:10`、`max_results:5`、`max_total_results:50`、`max_characters:2000`，并要求系统提示包含最大10次且不要求用满。现有2/10参数必须失败。合成完整SQLite的合法count4期望passed，旧最终门槛必须失败。记录确切RED，不改旧真实Summary。

- [x] **GREEN：** 在 `provider.ts` 增加唯一共享不可变策略：
```ts
export const RESEARCH_SEARCH_POLICY = Object.freeze({
  policyId: "openrouter-web-search-exa-fast-v2",
  engine: "exa", mode: "fast", maxUses: 10, maxResults: 5,
  maxTotalResults: 50, maxCharacters: 2000,
});
```
把 `modelConfigVersion` 升为 `research-model-config-v2`。Adapter导入该策略，将Research请求工具配置改为：
```ts
tools: [{ type: "openrouter:web_search", parameters: {
  engine: RESEARCH_SEARCH_POLICY.engine, mode: RESEARCH_SEARCH_POLICY.mode,
  max_results: RESEARCH_SEARCH_POLICY.maxResults, max_uses: RESEARCH_SEARCH_POLICY.maxUses,
  max_total_results: RESEARCH_SEARCH_POLICY.maxTotalResults, max_characters: RESEARCH_SEARCH_POLICY.maxCharacters,
} }], max_tool_calls: RESEARCH_SEARCH_POLICY.maxUses
```
在schema marker之前追加可信静态配置说明：
```ts
+ `Make at most ${RESEARCH_SEARCH_POLICY.maxUses} search queries in total; use fewer when sufficient. Once that limit is reached, do not perform further searches.`
```
不得把该句追加到schema JSON之后，不给Repair加搜索工具/指令。原response_format与候选契约保持完整。

- [x] **缓存与验收同源：** `service-factory.ts` 导入共享策略，`POLICY.tool` 使用 `.policyId`，`POLICY.search` 使用完整策略。`validation.ts` 导入它，validationFingerprint的search使用完整策略，最终`summary.usage.webSearchRequests <= RESEARCH_SEARCH_POLICY.maxUses`，保持最小>0。无需改变已有providerUsage的0..10范围。默认合成fixture仍可返回2，最大值不代表固定用满次数。保持原计数/费用原值，无裁剪或估算。

- [x] **完整验证：** 合法candidate的details计数2/4/10均passed，实际count原样保留、结算正确、Ready/激活/规划/隔离/重复拦截/销毁、零Repair和恰好两次注入GET+POST。0、11、非法计数不能passed，11/非法沿用保守用量规则。候选字段/来源/教学错误即便count4处于新范围也必须失败。以新规则更新旧“more than two searches”测试，不删除边界负例，改为超过10和零次等合适边界。

- [x] **版本回归：** 实际标准factory与临时validation的fingerprint须区分Task1的promptv2/modelConfigv1/2次10结果与最终promptv2/modelConfigv2/10次50结果；真实SQLite旧身份缓存miss，新同身份仍hit。验证实际审计/出站版本一致，不凭手写哈希计算器替代实际服务调用。合法合成key轮换不改变非秘密配置身份。

- [x] **边界和体积：** 两个入口的请求/提示/策略最大值一致、无额外参数；Repair保持原系统策略/无工具、local Repair拒绝。更新最终正常请求UTF8测量与最初7905/7933的增量，完整schema及262144字节前置拒绝不变，不能声称请求字节等于tokens或预计费用。所有module mocks/spies清理。

- [x] **验证与审查：** 运行Task1定向回归加本任务新测试、类型和所有实际改过TS文件lint；记录RED/GREEN并自审，独立规格通过后质量/安全审查；不build、不提交。仅Root执行最后整合/构建。保留本任务不代表真实成功的局限；新真实请求须另获具体许可。

### Root 验证、审查与交接

- [x] Root分别核对Task1的20项与Task2的18项保护指纹；每项独立规格审查通过后才派独立质量/安全审查，实质问题修复并复审。
- [x] 独立最终整合审查；Root 运行上面定向文件和 provider-result-diagnostic、live-result-diagnostics、research-orchestrator、research-candidate-diagnostic、source-audit、research-planning-integration 的回归，非增量类型及受影响文件 lint。
- [x] Root 独立运行 `node C:/Users/XF/.codex/plugins/cache/openai-bundled/sites/0.1.66/scripts/build-site.mjs`；只本地 build，核对 Worker/客户端产物/迁移元数据/hosting 保护不变，不保存或发布。
- [x] 保存本轮证据与最终指纹到 `docs/operations/v8-request-contract-validation-2026-09-11.md`，更新checkpoint/goal/gates。明确新范围由用户选择10/50/USD5，历史第十次仍失败，新候选未实测、无第十一次许可和完整公开发布未完成；本次不交付付费执行命令。

Root计划自审：原七项行为映射Task1；用户追加10/50由Task2统一提示/请求/缓存/验收，Task1中间cap2不是最终要求。两项实现顺序执行并分别双审，未增加部署或真实网络范围。
