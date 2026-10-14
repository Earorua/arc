# Arc v8 响应格式兼容修复：本地验证记录

状态：**2026-09-11 本轮本地兼容性修复完成。** Task 1/2 TDD、自审、独立规格后质量/安全审查全部 READY；Root 最终771项回归/类型/lint/build和25项指纹通过，最终独立整合审查 READY，无实质P1/P2/P3。真实完整Research与公开发布目标仍未完成，无第十次许可。设计为 `../superpowers/specs/2026-09-11-arc-v8-response-compatibility-design.md`，执行计划为 `../superpowers/plans/2026-09-11-arc-v8-response-compatibility.md`。

## 基线与边界

- 权威 worktree：`C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta`。
- 分支 `codex/v8-openrouter-research-beta`，HEAD `7090153b4acad7b12df6a7ee4d675b46c41871dc`。原 51 份未提交成果保留，不建新 worktree、不暂存/提交/推送/合并。
- 六份前置源/测试快照与 before-hashes.json、18 项 protected-hashes.json 位于 ignored `outputs/local-response-compatibility-20260911/`；快照后缀 .before.txt 不进入 TypeScript 编译。
- 第九次真实 Summary SHA256 `f2a28987bc03fecad5af41b3c5bd921053d76983eacfc0515eac2a3d67cae45d` 原字节保留；九次许可均消耗，无第十次。原三项合成调查仅证明兼容缺口，不是本轮 TDD 或真实验收。
- 本地实现由子代理顺序执行；每项先 RED/GREEN、自审，再独立规格审查，随后质量/安全审查，最终 root 整合。本轮只使用合成响应及一次性 SQLite，不读真实 Key/env/原始响应、不发 Provider 请求、不操作生产或 Sites。

## 证据登记

| 工作 | 当前状态 |
| --- | --- |
| Task 1 双路径用量与诊断 | 实现者最终五文件362/362、类型/lint及自审通过，三个文件冻结 |
| Task 1 规格审查 | READY，无P1/P2/P3 |
| Task 1 质量/安全审查 | READY，无实质P1/P2/P3 |
| Task 2 缺标题映射与完整流程 | 实现者五文件267/267、类型/lint和自审通过；三个文件冻结 |
| Task 2 规格审查 | READY，无P1/P2/P3；冻结3+Task 1三项+保护18项匹配 |
| Task 2 质量/安全审查 | READY，无P1/P2/P3 |
| Root 相关回归、类型/lint/build、指纹 | 16文件771/771、非增量类型、六文件lint、五阶段build、25项指纹与产物核对通过 |
| 最终独立整合审查 | READY，无实质P1/P2/P3；25项指纹重新匹配 |

## Root 最终验证（2026-09-11）

16:03:04 +08 启动相关回归，12.38秒，**16文件771/771通过**。测试仅用合成Provider响应和临时SQLite；没有新增真实调用。覆盖 provider-result-diagnostic、live-result-diagnostics、openrouter-provider、kimi-local-validation、live-research-validation、openrouter-response-compatibility、research-source-audit、research-planning-integration、research-candidate-diagnostic、live-candidate-diagnostic、provider-failure-diagnostic、live-research-failure-summary、research-orchestrator、research-environment、research-budget、d1-research-budget-repository。命令为 `node node_modules/vitest/vitest.mjs run` 后接上述 tests/server 下测试文件。

Root 非增量 `node node_modules/typescript/bin/tsc --noEmit --incremental false`、对本轮六文件的 eslint、`git diff --check` 均退出0。测试只有既有 SQLite experimental warning。质量审查期间执行只读回归，源文件保持冻结；若审查要求改动则必须重新验证受影响部分。

Root 单独运行 `node C:/Users/XF/.codex/plugins/cache/openai-bundled/sites/0.1.66/scripts/build-site.mjs`。默认沙箱第一次因 Vite 子进程 spawn EPERM 失败；随后明确仅本地build的自动审批通过，原命令五阶段完成、退出0，无代码或依赖修改。产物 dist/server/index.js 导出 worker_entry_default as default，含 async fetch(request, env, ctx)；dist/client 共38文件（包含 .assetsignore 和 .vite/manifest.json；rg默认不列隐藏文件时为36），dist/.openai/drizzle 15文件；产物 hosting 与源 JSON 完全一致，project_id appgprj_6a6678d3e3848191a352778c6db1e7b1、D1 DB、R2 PROOF_ASSETS。既有路由静态分类提示不影响构建，本轮没有发布。

构建后25项核对全部匹配：本轮冻结六文件、18项保护文件、validation.ts前置快照。六项指纹保存在 integration-candidate-hashes.json；第八/九次真实Summary、profile、launcher、runner、transport、生产工厂、来源/候选/存储/预算契约与部署声明均保持原字节。最终独立整合审查随后 READY，无实质P1/P2/P3；独立逐文件核对六项最终差异、批准设计与计划、25项指纹及整合断言，只读、不重跑测试。下一次实测候选 v8-response-compatibility-live-validation-2026-09-11.md 已准备并完成本地验收，尚无第十次许可。


## 本轮最终六文件指纹

| 文件 | SHA256 |
| --- | --- |
| app/server/research/result-diagnostic.ts | f366336308489aa0cb2ce7ada83ae190feeff4735b45b939af566e799e33b4b1 |
| app/server/research/openrouter-provider.ts | a95271f918c57e12b3014f56e47e28cc53077e7b0efe1a516c5763864eca1c47 |
| tests/server/provider-result-diagnostic.test.ts | c0819bf4637a8219d90765224361a355ccb720a31f83ab6e212651f953eaa314 |
| tests/server/live-result-diagnostics.test.ts | 76508558550b61d202b93db14448a8788c5273bc9791c359c5ea5d48b20746da |
| tests/server/openrouter-provider.test.ts | d6194c8b52a6efe5c1e64ccb7ea3d4e2a74c55eb7acfb13407a52d9cff4c49b9 |
| tests/server/openrouter-response-compatibility.test.ts | e3e44b4c4f587233c8cfa29329cae9af8410a8b5fada2b23f846ae455bbb07ab |

Root测试产生的新安全摘要为 `summary-2026-09-11T08-03-15-939Z.json`，SHA256 `c99a1e8aa8ba1b3c4f39ef4fa20f3228de4ef0f85a63a35b517da0f9a8e57e7d`；mode=offline-dry-run、outcome=passed、realRequestCount=0、Repair=0、disposed=true。这是离线测试产物，不是第十次真实执行。其字段/结算来自合成输入，不能当成实际Provider成功或扣费证明。

## TDD 与逐项审查记录

Task 1 首个 RED：实现者在修改生产代码前执行 `node node_modules/vitest/vitest.mjs run tests/server/provider-result-diagnostic.test.ts`。初次沙箱 spawn EPERM 后，以明确离线测试的执行权限完成；75 项中仅新增 details-alias 断言失败，预期 parse success + safeUsage，实际 success:false（test 第44行）。这证明失败来自缺失兼容行为，不是测试装载错误。尚未记为 Task 1 完成。

Task 1 中间 GREEN：Provider 诊断单文件91/91。扩展后实现者五文件360/360，命令覆盖 provider-result-diagnostic、live-result-diagnostics、openrouter-provider、kimi-local-validation、live-research-validation；非增量 tsc 和三个改动 TS 文件 eslint 均退出0。此为实现者检查回报；完整双审和 Root 最终验证仍待完成。

Task 1 最终实现者检查：自审补齐独立 unavailable 对象等隔离覆盖后，五文件362/362，非增量类型和三个文件 lint 再次通过；18项保护指纹全部不变。只改 result-diagnostic.ts、provider-result-diagnostic.test.ts、live-result-diagnostics.test.ts，validation.ts 无需改动。Root 已读取选择器/严格投影及关键用例，冻结指纹保存 task1-review-hashes.json。details-only 合成流程 Ready+settled；非法/冲突用量沿原业务状态为 Ready+conservative-hold、usage null，不能记作完整费用验收。

Task 1 独立规格审查 READY，无P1/P2/P3：逐文件对照 before 快照确认共用选择器、非法别名优先、相等/冲突、Repair 缺省、token/cost保持、诊断一致性/安全投影和实际SQLite结算/持留覆盖；validation.ts原字节未变，未提前实施标题行为。随后独立质量/安全审查 READY，无实质P1/P2/P3；对照三个 before 快照及冻结指纹确认双路径校验、有限投影、回调隔离与结算断言符合设计。两位审查者均只读，不重复测试。

Task 2 首个 RED：新实现者修改生产代码前，运行 `node node_modules/vitest/vitest.mjs run tests/server/openrouter-provider.test.ts`；126 项中新增缺标题兼容测试失败1项、125项通过。失败为原 annotation schema 解析处 `ResearchProviderError: invalid-transport`，不是装载错误；Vite spawn EPERM 后仅提升离线测试执行权限。测试编辑前，两项所属旧文件与 before 快照指纹匹配。

Task 2 中间 GREEN：最小映射后 Provider 单文件126/126；扩展 Provider + 新兼容文件170/170（新增文件44项）。合成完整流程已覆盖缺标题+details用量的 Ready/结算/激活/规划。测试期校正了原行为假设：危险标题及编码 tracking/fragment 内容在 orchestrator 的 bounded annotation 边界以 invalid-transport、quality=null 拒绝；未引用候选仍 needs-review，坏候选仍 invalid-result/invalid-schema。没有为满足测试改变这些生产规则。最终检查/自审和双审仍待完成。

Task 2 最终实现者检查：五文件267/267（Provider、新兼容46项、source-audit、research-planning-integration、kimi-local-validation），非增量类型及三个所属文件 lint 均退出0。只改三个所属文件；对照 before 快照自审确认生产差异仅导入现有 URL helper 和缺标题分支，旧 Provider 测试仅替换一条缺标题拒绝用例。18项保护文件和Task 1冻结三项全部匹配。Root 已读最小生产差异与完整新集成文件，冻结三个指纹到 task2-review-hashes.json，开始独立规格审查；双审与最终整合尚未完成。

Task 2 独立规格审查 READY，无P1/P2/P3：确认只有 undefined 标题生成合法域名标签、原 URL 传到下游、正常与异常标题规则保留，两个入口和时限/请求/安全/费用边界覆盖完整；实际 runValidation 合成 GET/POST、SQLite Ready/结算/隔离/激活/规划/销毁以及回归路径符合设计。审查者重新确认三个 Task 2、三个 Task 1 和18项保护指纹匹配；仅只读审阅，未重跑测试。随后开始质量/安全审查。

Task 2 独立质量/安全审查 READY，无P1/P2/P3：原URL的危险 fragment/UTM 继续被下游检查，异常已提供标题仍拒绝；失败路径保留 charged/usage/actualModel。请求/时限/边界/来源/Repair未变；实际Adapter+SQLite+审计/规划测试不使用外部fetch。审查者再次确认 Task 2三项、Task 1三项和18项保护指纹全部匹配，仅只读，无修改或测试重跑。

最终回归覆盖双路径选择、保守计费、默认/显式 Repair 用量、真实 Adapter 引用映射、候选/来源安全、SQLite Ready/激活/规划/owner/销毁，以及原请求/时限策略。保留既有有效输入行为；对新受支持的输入验证确切结果，对非法/冲突输入验证原拒绝/持留政策。

生产工厂、来源/候选/数据库契约、profile、launcher、runner、依赖和 hosting 均须与 18 项基线指纹一致。构建沿用 package.json 的 Vinext 流程，root 单独调用既有 build-site.mjs，核对默认 Worker fetch 与原客户端/迁移/hosting 产物；构建不发布。

本轮检查和审查已全部通过，源码冻结。真实 Research、线上长任务、登录/恢复及完整公开发布门槛仍须独立实际证据。本轮未提交/推送/合并Git、保存Sites版本或部署，未操作生产；此前已完成的功能与验收保留。
