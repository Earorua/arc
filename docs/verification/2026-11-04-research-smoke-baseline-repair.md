# Research smoke 基线哈希修复与全仓验收

日期：2026-11-04。范围：修复三个既有 Research 测试套件的基线哈希阻塞，保留严格构建校验，重跑全仓离线检查。本轮不部署、不运行远程迁移、不调用真实模型。

## 根因确认（修改之前）

首次复现命令：

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-cloud-smoke-build.test.ts tests/server/research-cloud-smoke-composition.test.ts tests/server/site-import-native-d1.test.ts --reporter=dot --maxWorkers=3
```

结果：3 个文件失败，106 项失败、21 项通过。三个套件共同调用 `buildSmoke`，在 `Reviewed input hash changed: app/server/research/openrouter-provider.ts` 处被阻断；未进入模型调用。

Git 历史和原始字节比对：

| 版本 | Provider 大小 | SHA-256 | 结论 |
| --- | --- | --- | --- |
| `cc38e02360003ab6b308877639f314a4fafb6efc`（2026-10-27） | 32,134 bytes | `5e762073cd357184f1925ecc412c9fcd8e06433351e4aba56b70ae8a43cc1a8d` | 构建器原固定值对应此版本 |
| `513d84f^` | 32,134 bytes | 同上 | 空白标题修复之前 |
| `513d84f6a6dbd775158b5b09972753f73fb47875`（2026-10-29） | 32,211 bytes | `d0c962c1ba0bcaf2e87119e40b982e0ebe6560d67ddcc662530b21db4ed7c54d` | 已有兼容性修复后的实际值 |
| 阶段 0 基线 `2caa51d`、当前 HEAD 与工作区 | 32,211 bytes | 同上 | 本轮及阶段 1 没有改动 Provider |

所有被比较的 Provider 字节均为 LF、无 CR。将旧版本仅应用下列两处差异，所得字节与当前文件完全相等：

1. 导入 `./citation-title` 的 `needsCitationTitleFallback`。
2. 将 `title === undefined` 判断替换为 `needsCitationTitleFallback(title)`。

该辅助函数仅对 undefined 或空白字符串返回 true；null、非字符串、超长标题及不安全回退 URL 仍被既有校验拒绝。已有设计与回归依据为 [2026-10-29 response recovery 记录](../operations/research-response-recovery-2026-10-29.md) 和 `tests/server/openrouter-response-compatibility.test.ts`；本轮重新核对并运行其合成回归，没有沿用旧生产回执来冒充新验证。

**根因是 10 月 29 日已提交的兼容性修复没有同步更新 smoke 构建器的固定基线。** 不是换行转换、阶段 1 引入变更或未经解释的内容差异。其余 5 个原有固定哈希全部与工作区匹配。

## 修复内容与校验边界

| 文件 | 修改 |
| --- | --- |
| `scripts/build-research-executor-smoke.mjs` | 将经逐字节复核的 Provider 固定值更新为上述 `d0c962…`；记录来源；新增辅助文件固定值 |
| `tests/fixtures/research/smoke-build-inputs.json` | 将 `citation-title.ts` 纳入构建前后受保护文件检查 |
| `tests/server/research-cloud-smoke-build.test.ts` | 在真实 cloud/local 构建中核对两个已审阅输入；新增 4 项未审阅改动拒绝测试 |

辅助文件的固定 SHA-256：

```text
bf1399f067b9fc5912203f68c8b8a887eea721b8d021c8f4ecf8dbeccf05d3c3
```

这一步将 Provider 新引入的判断依赖纳入固定基线。仅更新 Provider 哈希而遗漏该依赖，会使同一逻辑的一部分脱离原有固定检查。

保留的约束：

- 原始文件字节做 SHA-256 精确比较；没有自动更新期望值、忽略换行、关闭检查或接受任意哈希。
- 其他固定值不变；Worker 导出、严格 alias 边界、生产图隔离、21 分钟付费步骤与零重试、固定 timing 等断言不变。
- Provider/辅助文件在构建前变化时，必须在编译前拒绝；构建中变化时，必须在发布任何产物前拒绝。
- 失败目录只可留下不可部署的 `report.json`，不能留下 executor/site/production 产物。
- 测试仅在文件读取边界注入字节变化，不修改共享工作树文件；实际 esbuild 与 Workerd/Miniflare 仍参与其他正反向测试。
- 没有修改生产 Provider、辅助函数、模型配置、费用、授权、隐私策略或任何历史审阅/云端证据。

新增测试在修复前运行并观察失败；原有“输入被修改即拒绝”行为保留。当前修复是有据可查的固定基线更新，不是绕过校验。

## 验证结果

定向验证：原先失败的三个套件与 `openrouter-response-compatibility`、`research-annotation-diagnostic` 共 **5 个文件、229 项测试全部通过**，退出码 0（155.42 秒）。包含真实本地 esbuild/Workerd/Miniflare 组合、无外发断言和新增的 4 项篡改拒绝回归。

最终全仓验证已完成：

| 检查 | 结果 |
| --- | --- |
| 全仓 Vitest（无排除项） | **335 个文件、7,273 项全部通过**；退出码 0；本地 13:34:34 开始，215.73 秒结束 |
| TypeScript 非增量检查 | `npx tsc --noEmit --incremental false` 通过 |
| 修改文件 ESLint | 通过，无警告 |
| 全量 ESLint | 0 error、4 个既有 Research 未使用变量 warning |
| 生产构建及构建后页面渲染 | `npm test` 通过，渲染 5/5；未发布 |
| 生产 Provider 与辅助函数 | 与 HEAD 无差异；其余 5 个原有固定值保持不变 |

复现命令（应用根目录执行）：

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-cloud-smoke-build.test.ts tests/server/research-cloud-smoke-composition.test.ts tests/server/site-import-native-d1.test.ts tests/server/openrouter-response-compatibility.test.ts tests/server/research-annotation-diagnostic.test.ts --reporter=dot --maxWorkers=4
node node_modules/vitest/vitest.mjs run --reporter=dot --maxWorkers=8
npx tsc --noEmit --incremental false
npm run lint
npm test
```

Git 忽略的本地日志：`work/research-hash-before.log`（修复前复现）、`work/research-hash-guard-red.log`（先加拒绝测试、再修复的失败记录）、`work/research-hash-focused.log`（定向通过）、`work/research-hash-all-unit.log`（全仓通过）、`work/research-hash-typecheck.log`、`work/research-hash-lint.log`、`work/research-hash-all-lint.log`、`work/research-hash-build-rendered.log`。

普通测试不发现或运行独立的真实模型资格套件。已同步更新阶段 1 验收报告、机器可读汇总与最新本地构建产物哈希；原来 332 文件 / 7,142 项通过的排除运行只保留为历史记录。

## 验收边界

本轮修复只解除本地基线阻塞，不代表真实 Provider 资格、云端绑定、付费端到端或生产发布完成。资料阶段 1 的 Gate 1B 仍为 NOT RUN，剩余验证项继续见 [阶段 1 验收报告](2026-11-04-materials-phase-1-results.md)。

所有本轮实现保留在 `codex/materials-phase-1-offline-20261104` 本地工作树；既有阶段 1 源码和用户设计稿保留。没有合并、推送、部署或真实模型调用。

