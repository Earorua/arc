# Arc v8 Native Fetch Diagnostic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax for tracking. 用户已批准此执行方式，无需再询问；沿用权威worktree，不创建分支或提交Git。

**Goal:** 在本地guard替换原生fetch异常前保留安全固定类别，并可靠写入私有Summary。

**Architecture:** scripts层纯分类/严格投影，guard可选非await观察器，validation再次投影。原异常、旧Provider/v3诊断、公开业务和请求策略保持，clear/finally关闭观察防止晚到错误修改已返回回执。

**Tech Stack:** TypeScript、Node原生fetch、Vitest、既有临时SQLite验证器。

---

用户2026-09-13已批准设计docs/superpowers/specs/2026-09-13-arc-v8-native-fetch-diagnostic-design.md。347项交接一致，当前分支codex/v8-openrouter-research-beta，HEAD7090153b4acad7b12df6a7ee4d675b46c41871dc。第十六次已消耗；无第十七次、Repair、重试、真实Key/env/正文读取、Git或生产/Sites写入。

证据目录outputs/local-native-fetch-20260913；before中保存transport.ts/validation.ts快照，before-handoff-hashes.json保存本次状态修改前完整基线。旧脏工作树有大量已完成成果，不能重置。

文件职责：
- 新scripts/live-research/fetch-diagnostic.ts：NativeFetchDiagnostic类型、buildNativeFetchDiagnostic和projectNativeFetchDiagnostic纯函数。
- 改scripts/live-research/transport.ts：createGuardedTransport的可选onResearchFetchDiagnostic及clear截止；SafeValidationError不变。
- 改scripts/live-research/validation.ts：researchNativeFetchDiagnostic默认null、executeOne注入及finally接收截止。
- 新tests/server/native-fetch-diagnostic.test.ts：纯分类/严格投影安全矩阵。
- 新tests/server/guarded-fetch-diagnostic.test.ts：真实guard边界和观察生命周期。
- 新tests/server/live-native-fetch-diagnostic.test.ts：实际runValidation/临时SQLite、费用/旧v3非干扰及晚到拒绝。

## Task 1: 有限分类和guard观察

- [x] 1. 先写RED测试；至少有一个测试直接使用当前guard注入UND_ERR_HEADERS_TIMEOUT，预期回调收到固定类别，捕获原safe error不变。缺失模块或回调触发应产生真实RED并保存退出码/输出到task1-red.txt。

```ts
import { describe, expect, it, vi } from 'vitest';
import { createGuardedTransport } from '../../scripts/live-research/transport';
const key = 'synthetic-native-fetch-key';
const keyData = { data: { limit: 5, limit_remaining: 5, limit_reset: null,
  usage: 0, is_management_key: false, byok_usage: 0 } };
it('observes native failure before safe replacement', async () => {
  const observation = vi.fn();
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    if (init?.method === 'GET') return Response.json(keyData);
    throw new Error('CANARY-private-message', { cause: { code: 'UND_ERR_HEADERS_TIMEOUT' } });
  });
  const transport = createGuardedTransport(key, fetch, { onResearchFetchDiagnostic: observation });
  await transport.inspectKey();
  await expect(transport.fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${key}` }, body: '{}',
  })).rejects.toMatchObject({ name: 'SafeValidationError', code: 'transport-denied' });
  expect(observation).toHaveBeenCalledExactlyOnceWith({ version: 'native-fetch-diagnostic-v1', kind: 'headers-timeout' });
  expect(JSON.stringify(observation.mock.calls)).not.toContain('CANARY');
  transport.clear();
});
```

Run: `node node_modules/vitest/vitest.mjs run tests/server/native-fetch-diagnostic.test.ts tests/server/guarded-fetch-diagnostic.test.ts --maxWorkers=1`

- [x] 2. 实施纯函数。精确kind/code表以批准设计为准，共9类，ETIMEDOUT必须是system-timeout。公开接口固定如下；实现时不得把原始异常作为字段或闭包返回。

```ts
export type NativeFetchDiagnosticKind = 'connect-timeout' | 'headers-timeout' | 'body-timeout'
  | 'socket' | 'dns' | 'tls' | 'abort' | 'system-timeout' | 'other';
export type NativeFetchDiagnostic = Readonly<{
  version: 'native-fetch-diagnostic-v1'; kind: NativeFetchDiagnosticKind;
}>;
```

buildNativeFetchDiagnostic(value:unknown):NativeFetchDiagnostic检查直接错误然后最多一个自身数据cause；直接成功优先。不遍历数组/AggregateError.errors/深层cause/原型，不调用getter/toJSON/toString。使用Object.getOwnPropertyDescriptor读取code/name/cause，真实DOMException AbortError采用既有transport-diagnostic同等原生getter品牌检查。反射失败other。所有已批准码精确匹配，不用前缀正则或动态输出。

projectNativeFetchDiagnostic(value:unknown):NativeFetchDiagnostic|null只接受Object.prototype、恰好version/kind两个自身可枚举数据字段；拒绝symbols/accessors/extra/null或custom原型/非法枚举/反射异常。返回新冻结对象，序列化≤256 UTF8字节。对安全投影后的常量对象计算大小，不序列化输入。

- [x] 3. guard新增可选观察器，保留fetch参数和原异常语义。核心接入结构如下，notify函数内部捕获所有观察失败；观察器undefined时不分类。clear先关闭新观察并释放回调，继续原清Key/checked行为。

```ts
// In createGuardedTransport options:
onResearchFetchDiagnostic?: (diagnostic: NativeFetchDiagnostic) => unknown;
// Keep this mutable reference separate from options, and release it in clear().
let observer = options.onResearchFetchDiagnostic;
let observationOpen = true;
const observeFailure = (error: unknown) => {
  if (!observationOpen || typeof observer !== 'function') return;
  try {
    const diagnostic = projectNativeFetchDiagnostic(buildNativeFetchDiagnostic(error));
    if (diagnostic) void Promise.resolve(observer(diagnostic)).catch(() => undefined);
  } catch { /* Observation cannot change the existing safe error. */ }
};
// Only the existing native fetch catch changes:
try { response = await fetch(url, init); } catch (error) {
  if (url === KEY_URL) diagnostic.failure ??= 'network-error';
  else observeFailure(error);
  throw new SafeValidationError(url === KEY_URL ? 'key-check-failed' : 'transport-denied');
}
// In clear: observationOpen = false; observer = undefined; key = ''; checked = false;
```

- [x] 4. 扩展GREEN测试：完整白名单、direct/cause冲突优先、深层/aggregate/数组忽略、getter不调用、恶意Proxy安全回落、DOMException及伪造对象、严格投影形状/冻结/独立拷贝/≤256B、秘密哨兵；观察off/throw/reject/pending等价。覆盖Key失败、调用前guard拒绝、Response302拒绝、成功、body-reader失败无观察；native redirect:error拒绝为other；clear后晚拒绝不分类/不通知，无多余请求或计时器。运行上述两文件及tests/server/live-research-validation.test.ts、tests/server/live-transport-diagnostics.test.ts；再运行非增量tsc和这次4个TS文件lint。保存精确命令和GREEN结果，不以旧1632项代替新结果。
- [x] 5. 独立SPEC对照设计/代码/快照；关闭问题后由不同审查者做QUALITY/安全。两项通过前不开始Task2。不提交Git，记录任务结果和文件指纹。

## Task 2: 私有Summary和实际验证路径

- [x] 1. 写RED测试验证runValidation({executeOne:true,key:synthetic,fetch:injected})经过真实guard和Provider后旧v3仍other、新字段headers-timeout。保留GET1/POST1、Repair0、unknown/hold、owner隔离/重复拒绝/DB销毁。保存task2-red.txt。

```ts
import { expect, it, vi } from 'vitest';
import { runValidation } from '../../scripts/live-research/validation';
it('keeps native category in the private summary', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    if (init?.method === 'GET') return Response.json({ data: { limit: 5, limit_remaining: 5,
      limit_reset: null, usage: 0, is_management_key: false, byok_usage: 0 } });
    throw new Error('CANARY-private-message', { cause: { code: 'UND_ERR_HEADERS_TIMEOUT' } });
  });
  const result = await runValidation({ executeOne: true, key: 'synthetic-native-fetch-key', fetch });
  expect(result.researchNativeFetchDiagnostic).toEqual({ version: 'native-fetch-diagnostic-v1', kind: 'headers-timeout' });
  expect(result.researchTransportDiagnostic).toMatchObject({ version: 'transport-diagnostic-v3', phase: 'fetch',
    reason: 'fetch-error', nativeErrorKind: 'other' });
  expect(result).toMatchObject({ outcome: 'incomplete', runState: 'failed', realRequestCount: 2,
    researchRequestCount: 1, repairRequestCount: 0, usage: null,
    reservation: { status: 'conservative-hold', maximumMicros: 5000000, settledMicros: 0 },
    ownerWrongReadRejected: true, secondResearchRejected: true, databaseDisposed: true });
  expect(JSON.stringify(result)).not.toContain('CANARY');
});
```

Run: `node node_modules/vitest/vitest.mjs run tests/server/live-native-fetch-diagnostic.test.ts --maxWorkers=1`

- [x] 2. 在ValidationSummary添加researchNativeFetchDiagnostic:NativeFetchDiagnostic|null并初始化null；在try之前定义nativeFetchObservationOpen=true，executeOne=true时注入回调，finally第一行关闭该标志。回调检查标志后再次投影并赋值，异常被隔离。核心代码如下：

```ts
transport = createGuardedTransport(key!, options.fetch, {
  checkKeyOnly: options.checkKeyOnly,
  ...(options.executeOne === true ? { onResearchFetchDiagnostic: (diagnostic: NativeFetchDiagnostic) => {
    if (!nativeFetchObservationOpen) return;
    try { summary.researchNativeFetchDiagnostic = projectNativeFetchDiagnostic(diagnostic); }
    catch { /* Observation only. */ }
  } } : {}),
});
// finally entry: nativeFetchObservationOpen = false;
```

不修改现有计数/预算/业务/清理顺序，早return也经过finally。旧v1/v2/v3类型、标准Provider和生产factory不修改。

- [x] 3. GREEN集成覆盖新增connect/DNS/TLS/system-timeout和既有socket/headers类别；故意污染投影证明第二层拒绝、不泄漏；观察off/throw/reject/pending时运行结果及实际SQLite持久状态等价，Summary只新增固定分类。参考现有live-response-format.test.ts的DB快照/close检查，不复制大量fixture。默认离线、Key-only、成功、有HTTPResponse的redirect、body-reader拒绝保持null。通过受控Promise+虚拟时间使Provider20分钟deadline先结束、Summary返回后fetch才拒绝；保存返回前后完整Summary快照，DB已close、无未处理拒绝/额外计时器/请求，旧deadline未被改写。测试不得使用真实Key或网络。
- [x] 4. 运行新集成文件+三项当前task1/纯测试及既有live-research-validation、live-transport-diagnostics、live-response-format、live-output-budget；保存精确GREEN命令/输出；非增量tsc及所有本轮修改TS定向lint。只在新增字段导致必要兼容断言变化时修改旧测试，先报告Root。
- [x] 5. 独立SPEC通过后再独立QUALITY/安全；关闭反馈，记录任务完成与指纹。无Git写入。

## Task 3: Root整合验收与交接

- [x] 1. 核对全部应用源码、native dispatcher、run.ps1/profile/prompt相对基线未改，允许改动仅transport.ts、validation.ts、新fetch-diagnostic.ts、3个新测试及必要兼容测试/文档。请求字节由原请求构造源码指纹保持和guard参数转发测试证明；不能把代码未改当作真实网络稳定。
- [x] 2. 运行本地验证调用链相关18个套件（精确清单已记录outputs/local-native-fetch-20260913/root-suite-plan.json），覆盖guard、Summary、launcher、native transport和先前诊断集成；按实际改动选择，不机械重跑全部45文件。PowerShell逐项传参，不拼接可执行字符串：

```powershell
$arcTestFiles = (Get-Content -LiteralPath 'outputs/local-native-fetch-20260913/root-suite-plan.json' -Raw | ConvertFrom-Json).exactSuites
& node node_modules/vitest/vitest.mjs run @arcTestFiles --maxWorkers=1 --reporter=json --outputFile=outputs/local-native-fetch-20260913/root-vitest.json
```
- [x] 3. 运行`node node_modules/typescript/bin/tsc --noEmit --incremental false`及`node node_modules/eslint/bin/eslint.js`加本轮精确修改TS文件。完成Sites本地build（按当前sites-building技能的portable流程；无save/deploy），验证完整产物和15个迁移配对。默认终端演练只运行`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/live-research/run.ps1`，不带ExecuteOne/Probe/CheckKey，确认真实请求0及原Ready/规划/费用合成控制保持。
- [x] 4. 最终独立质量/安全审查核对候选、实际覆盖、请求与生产不变、非干扰/晚到拒绝。保存新Summary、本轮来源和构建指纹、完成状态与恢复点。第十六次实际结果保持，新的付费验证仅在具体候选可审阅后另获单次许可。完整公开发布目标仍未完成。

Root计划自审：设计所有边界均映射到Task1/2；Task3覆盖真实实现链、本地构建及恢复。模块接口/字段名一致，两个设计审查P2已落实到测试。用户已有子代理/TDD/双审授权，直接执行；无额外流程或Git确认。
