# Arc v8 本地结果诊断验证记录

2026-09-11 第八次真实使用证据已收到：新三层诊断区分出 Provider accepted / stop、内部 invalid-schema、usage 仅 web-search-requests 问题。详见 `v8-kimi-schema-result-2026-09-11.md`。诊断功能有效区分阶段，但没有具体结构字段信息；完整 Research 仍未通过，不改变下文本地验收的范围或伪造真实通过。

状态：**2026-09-11 本地诊断验收完成。** 两项实施及各自规格/质量安全双审、root 测试/构建、最终独立整合审查均通过。用户于 2026-09-10 对安全诊断设计回复“确认”；本记录只覆盖本地实现、合成验证与独立审查。

设计：`../superpowers/specs/2026-09-10-arc-v8-result-diagnostics-design.md`。实施计划：`../superpowers/plans/2026-09-10-arc-v8-result-diagnostics.md`。

## Task 1：Provider 固定枚举观察

- 初始 RED：缺失 finish/usage 的合成 HTTP 200 原本不产生新诊断；1 failed，893 ms。沙箱启动 EPERM 不是 RED，使用获准的相同离线命令取得真实失败。
- 后续 RED 覆盖排序、token mismatch、非普通 choice 对象及组合错误。首次规格审查发现 P2：费用或搜索字段类型错误会阻止 Zod 总量 refinement，新诊断因而漏报同时存在的 token 总量不一致。
- 修复先观察组合 RED：2 failed / 55 passed，696 ms。继续复用单一权威 safeParse 的字段错误判断，不改变 usage 接受规则。
- 规格复审 READY：审查者另外验证 27 个只读断言，无剩余规格问题。
- 实现者四文件回归 303/303 passed，非增量类型检查、定向 ESLint 和 diff check 退出 0。
- Root 新鲜复跑相同四文件：2026-09-10 03:15:23（北京时间），303/303 passed，1.52 s。注入合成 fetch，无真实 Provider 请求。
- 质量与安全审查 READY，无 P1/P2/P3：核对精确源文件基线、费用转换、原分支顺序、标准类隔离、异常回调与安全投影，没有剩余问题。

四文件命令：

```text
node node_modules/vitest/vitest.mjs run tests/server/provider-result-diagnostic.test.ts tests/server/openrouter-provider.test.ts tests/server/kimi-local-validation.test.ts tests/server/provider-failure-diagnostic.test.ts
```

## Task 2：本地 Summary 投影

Task 2 在 Task 1 双审和 root 边界核对通过后，按 RED/GREEN、规格后质量审查接入三个 nullable 字段。

Task 2 初始 RED 已观察：一文件/一测试失败，仅缺少三个新增字段；原有 failed / invalid-result、usage null、conservative-hold、无规划和数据库销毁均已匹配。全部传输均为合成函数，一 GET + 一 POST；运行代码在取得 RED 之前未改动。

2026-09-11 恢复时旧实现句柄已不存在，root 核对现有文件和受保护指纹后由新实现子代理接手。保留原有有效 RED 和最小接线；恢复后初始 GREEN 为一文件/一测试通过，1.19 s。

Task 2 实现已于 2026-09-11 完成并冻结用于审查：

- 扩展后 46/46 用例通过，1.39 s；覆盖 Ready、Needs review、解析拒绝、无效候选、只缺 usage、额外读取/回调/审计 getter 失败及白名单投影。
- 有效后续 RED 为 44 passed / 2 failed：数字/对象形式的未知错误码被临时类型保护丢弃，违反“所有其他已存在值映射 unrecognized”。修正测试解释并先取得该 RED 后，删除不必要的早退；既有接受/计费逻辑未改。另一处初期失败是测试用 503 错当“确定未执行”，已将夹具改为既有 401 分支，没有更改生产分类。
- 六文件回归 307/307 passed，5.51 s；非增量 TypeScript 退出 0（12.28 s），定向 ESLint 退出 0（2.41 s），diff check 退出 0。
- Task 1 Provider 与测试指纹不变。Helper SHA256 `c3dc9cf23a8a66d27de77b8e9f9a22e57e75779593de044bf2262ec4e0aa2932`；validation `1d5bdc8d3036b1a625a2bc3e9e546e374b9286e0abe999277302c0cd8737e98e`；新测试 `6138758e5b79f3347d08b2ea3752849fa5910e98afba0352b2ebe867b039cf66`。

```text
node node_modules/vitest/vitest.mjs run tests/server/live-result-diagnostics.test.ts tests/server/provider-result-diagnostic.test.ts tests/server/live-research-validation.test.ts tests/server/live-research-failure-summary.test.ts tests/server/openrouter-provider.test.ts tests/server/kimi-local-validation.test.ts
```

Task 2 规格审查已 READY，无 P1/P2/P3，确认精确基线、投影边界及原业务路径保持。审查者另外执行 `node node_modules/vitest/vitest.mjs run tests/server/live-result-diagnostics.test.ts`，2026-09-11 10:49:03 得到 **单文件 51/51 passed，1.44 s**，并通过 36 条只读投影断言。51 是最终冻结文件的新鲜结果；上文 46 是实现者较早的报告，最终验收以本次及 root 566 项结果为准。质量/安全审查随后 READY，无 P1/P2/P3；确认额外只读观察的隔离、完整质量 schema、费用字段保持及测试真正覆盖异常点。

## Root 整合证据（冻结源码）

2026-09-11 10:47:20（北京时间）：12 文件、**566/566 测试通过，6.55 s**。覆盖全部相关 Provider/本地验证/诊断测试，以及 orchestrator、environment、预算、D1 预算仓储和 Research→planning。全部 Provider 传输为注入合成函数或默认离线夹具。

```text
node node_modules/vitest/vitest.mjs run tests/server/provider-result-diagnostic.test.ts tests/server/openrouter-provider.test.ts tests/server/kimi-local-validation.test.ts tests/server/provider-failure-diagnostic.test.ts tests/server/live-result-diagnostics.test.ts tests/server/live-research-validation.test.ts tests/server/live-research-failure-summary.test.ts tests/server/research-orchestrator.test.ts tests/server/research-environment.test.ts tests/server/research-budget.test.ts tests/server/d1-research-budget-repository.test.ts tests/server/research-planning-integration.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js app/server/research/openrouter-provider.ts app/server/research/result-diagnostic.ts scripts/live-research/validation.ts tests/server/provider-result-diagnostic.test.ts tests/server/live-result-diagnostics.test.ts
git -c core.safecrlf=false diff --check
```

以上类型检查、定向 lint 和 diff check 均退出 0。构建使用当前已安装 Sites `0.1.56` 的绝对路径 `build-site.mjs`，委派项目既有 `npm run build`，退出 0，命令执行 6.86 s；首次沙箱启动 EPERM 后，同一命令获准运行，没有安装或升级依赖。

构建产物：`dist/server/index.js` 2334099 bytes，SHA256 `bc50d91bb36eb715d8a85061480dabd59bc6fdfc6070d405004218333bc5527d`。静态检查确认默认导出对象包含 async fetch(request, env, ctx)；hosting metadata 存在、15 个迁移文件、38 个客户端文件。这是本地产物检查，不是生产迁移、部署或真实登录验收。

最终独立整合审查 **READY，无 P1/P2/P3**：复核五个冻结文件指纹、精确基线、计费与接受合同、新增只读观察的异常隔离、完整质量投影和故障测试；没有新问题需要重复运行测试或修改源码。

Root 最后核对 **21 项 SHA256 全部一致**：16 个原有受保护文件，以及本次冻结的 3 个运行时文件和 2 个测试文件。依赖 manifest/lock、hosting manifest、公共合同、标准 factory、orchestrator、D1 repository/budget 文件对 HEAD 均无新增变化。现为 40 份有意保留的未提交文件，旧成果没有重置或提交。

## 边界与后续

权威分支 `codex/v8-openrouter-research-beta`，HEAD `7090153b4acad7b12df6a7ee4d675b46c41871dc`，既有未提交成果保留。前置 17 项文件指纹检查全部一致，Task 2 仅允许修改其中的本地 validation 文件。Source-only baseline 存于忽略目录 `outputs/local-result-diagnostics-20260910/` 的 `.before.txt`，不含真实响应或密钥。

第七次真实摘要 `summary-2026-09-09T18-16-27-326Z.json` 的 SHA256 仍为 `24bad7859f8c9c0471881609961aa9dfe08ee83ea80ff571a7c40cc31a4a4821`。新诊断不能追补已经销毁的原始响应，也不证明真实 invalid-result 原因已修复。

七次真实推理许可已消耗；本轮没有第八次许可、真实 Key 读取、外网推理、Repair/重试、Git 提交/推送/合并、生产变量/旗标/D1/R2/Sites 保存或部署。完整首版公开发布目标尚未完成。

下一步为 `v8-kimi-diagnostics-live-validation-2026-09-10.md` 中的具体单次真实验证，等待用户新增许可；不重做本地实现或默认离线终端演练，不自动重复第七次命令。
