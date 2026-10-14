# Arc v8 候选字段诊断：本地实施证据

状态：**2026-09-11 本地诊断全部完成：两项先规格后质量/安全双审及最终独立整合审查均 READY，root 635 项整合测试、类型/lint/build 通过。** 不含新的真实请求、生产改动或发布。

设计：`../superpowers/specs/2026-09-11-arc-v8-candidate-field-diagnostics-design.md`。
计划：`../superpowers/plans/2026-09-11-arc-v8-candidate-field-diagnostics.md`。

## Root 最终整合证据

冻结源码后于 **2026-09-11 14:31:57 +08** 运行 14 文件 **635/635**，9.56 s，退出 0。测试全部使用合成 Provider 与本地临时 SQLite，没有真实 Provider 请求。测试集为 research-candidate-diagnostic、live-candidate-diagnostic、provider-result-diagnostic、openrouter-provider、kimi-local-validation、provider-failure-diagnostic、live-result-diagnostics、live-research-validation、live-research-failure-summary、research-orchestrator、research-environment、research-budget、d1-research-budget-repository、research-planning-integration；命令为 `node node_modules/vitest/vitest.mjs run` 加这 14 个 `tests/server/<name>.test.ts` 路径。

Root 的 `node node_modules/typescript/bin/tsc --noEmit --incremental false`、对下表八文件运行的 `node node_modules/eslint/bin/eslint.js`、`git diff --check` 全部退出 0。同一次离线测试的 spawn 权限按既有方式处理，没有新付费许可或真实调用。

后续只读复核该整合测试生成的落盘摘要 `outputs/live-research/summary-2026-09-11T06-32-06-557Z.json`，SHA256 `4aace64ec816446092ad0658b3aa72fbe3b6068524ec6ba06cde3dd5b933de56`，确认 offline-dry-run / passed、realRequestCount=0、合成 Research 1 次、Repair 0；candidate accepted，webSearchUsage object/valid，Ready、owner/重复拒绝、激活、规划和销毁均 true。该摘要证明新增字段已通过现有输出链路落盘，不是第九次真实请求，也不提供真实费用证据。复核没有重跑脚本或测试。

当前安装的 Sites helper `node C:/Users/XF/.codex/plugins/cache/openai-bundled/sites/0.1.66/scripts/build-site.mjs` 运行既有 package build，五阶段成功、退出 0。产物 `dist/server/index.js` 最终导出 `worker_entry_default as default`，该对象有 `async fetch(request, env, ctx)`；38 个客户端文件、15 个迁移元数据文件，产物 hosting.json 的 project_id、DB、PROOF_ASSETS 与源 manifest 一致。此为构建/产物检查，不是部署或新的生产运行验收。测试仅出现既有 SQLite experimental warning；build 的路由静态分类提示和 npm 更新提示不影响成功，未升级依赖。

本轮八文件指纹与构建后字节完全一致，17 个受保护文件全部匹配（合计 25 项）；Adapter 另与本轮前置快照核对一致，SHA256 `9d73fcedf0d0050cdb510c469e33856dd9f7189e4e71d56e3e7692729ba8124f`。历史真实 Summary、profile、launcher、runner、契约、预算/存储和生产 factory 未改。未提交工作树仍为 48 份预期成果。

| 本轮文件 | 最终 SHA256 |
| --- | --- |
| app/server/research/provider.ts | 715baaa6eb31e062c6f9fb6098085e4656666c3cb7a42b359597acf6d50966cb |
| app/server/research/orchestrator.ts | b8756597029b7974bca228048bed1e73d2765845eee2b3edd99ce30fed447e97 |
| app/server/research/result-diagnostic.ts | 2af34fd5e6fd81f5a0f891e4a64a49e2843d274aa665cc6e1fcc056bc730c6f2 |
| scripts/live-research/validation.ts | 9e98eaf087244b113532aacf2e09974bc891c56a8b8655d6acd5f104dab90fe9 |
| tests/server/research-candidate-diagnostic.test.ts | 7a88076eb8724b12d800c3691da985ee4f300d872020a7ef7aea9d57bce47432 |
| tests/server/live-candidate-diagnostic.test.ts | 1e9f7a73ae2f57b84641521c4f52da47e857d4f9cd242e9119bf149ba568bce6 |
| tests/server/provider-result-diagnostic.test.ts | 3af14c4f5ab3844f9eac82f244b65abb686b1fdf519c1e02660a235f56dabaf3 |
| tests/server/live-result-diagnostics.test.ts | ebb5267e9aa48045300adeed3d36e3ac018d8a5bda710cef490fce95a968dee1 |

Task 2 独立质量/安全审查 READY，无 P1/P2/P3，确认形状枚举、严格新副本、旧观察器异常边界和费用/Repair 行为保持。最终独立整合审查也 **READY，无实质正确性、安全、回归或范围问题**；已读取八文件及前置快照，并独立核对 Adapter 未变。上述源码本地验收完成，不能据此认定真实 API 故障已修复。

后续可审阅的单次真实验证候选见 `v8-candidate-field-live-validation-2026-09-11.md`，尚未获准或运行。该准备文档新增后工作树共 49 份预期未提交成果；代码八文件及旧 Summary 字节保持不变。

## 恢复基线

权威目录为既有 v8-openrouter-research-beta worktree；分支 `codex/v8-openrouter-research-beta`、HEAD `7090153b4acad7b12df6a7ee4d675b46c41871dc`。42 份既有未提交成果保留。此次工作不再因设计确认暂停，用户关于 Logs 的问题单独协助。

Root 只读 Sites 元数据：active/public/owner、最新 version 10；本轮没有部署。当前 portable execution profile configured=false，没有更改项目结构、依赖或环境配置。

七份实现相关源/测试快照位于 ignored `outputs/local-candidate-diagnostics-20260911/`，文件名为仓库路径 `/` 换成 `--` 加 `.before.txt`；不是原始 Provider 响应。实现和审查按此基线隔离本轮差异，不能直接用 HEAD diff 冒充只有本轮改动。

| 文件 | 开始前 SHA256 |
| --- | --- |
| provider.ts | cb8069c97a4fb0c1b19e9802121a9eef5eeafa5b76894abd89a634a6fc70f80d |
| orchestrator.ts | 26e51ea42565d2c3dc1fe6a300e49b7005731ee16c265b1f9c78468da0ca16e9 |
| result-diagnostic.ts | c3dc9cf23a8a66d27de77b8e9f9a22e57e75779593de044bf2262ec4e0aa2932 |
| openrouter-provider.ts | 9d73fcedf0d0050cdb510c469e33856dd9f7189e4e71d56e3e7692729ba8124f |
| validation.ts | 1d5bdc8d3036b1a625a2bc3e9e546e374b9286e0abe999277302c0cd8737e98e |

## 实施与审查过程

以下记录保留各阶段当时的状态；最新结果以本页顶部为准。

Task 1 独立实现子代理首个有效 RED：2026-09-11 12:29:16 +08，`node node_modules/vitest/vitest.mjs run tests/server/research-candidate-diagnostic.test.ts`，1 test failed，缺 evidence 时预期 observer 被调用一次、实际 0。首次沙箱内 Vite spawn EPERM 不计为 RED；通过获准的同一离线命令观察到了真正断言失败。正在最小 GREEN 和后续分支 TDD，尚未验收。

后续里程碑（实现者回报，完整 root 整合尚未开始）：12:34:00 解析器/投影单文件 29/29 GREEN；覆盖 folded path segment、prototype 名称问题码及超过 16 项先拒绝投影。12:35:23 本地集成首轮 4/4 RED，Summary 缺新增字段；合法 fence 的原业务结果仍 ready/passed。缺 evidence 的原行为是 failed/research-failed、公共质量默认空，已纠正测试首稿误设 needs-review 的假设。有效 usage 的失败请求可按原规则结算，只有无效/缺失 usage 才保守持留；不改变这些规则来满足断言。

Task 1 恢复实现者最终回报：另补一个真实 RED，严格投影曾接受空 issues 配 truncated=true；最小修正要求截断诊断保留满 16 项。最终候选单文件 38/38、五文件 207/207 GREEN，非增量类型/定向 lint/diff check 通过，17 项受保护指纹一致。当前进入独立规格审查，缓存短路和标准工厂的诊断专用测试缺口由审查核对；结构上缓存提前返回、标准工厂没有接入观察器。

Task 2 在 Task 1 规格和质量安全均通过后开始；最终 root 运行相关整合验证与既有 build，再独立整合审查。Task 1 审查前六项指纹保存于 task1-review-hashes.json；Task 2 三个相关文件的新增前置快照后缀为 .before-task2.txt，仍只含源码/测试。

Task 1 首轮独立规格审查 NOT READY：两项 P2 均为明确测试要求缺失（fresh-cache 不发出诊断、standard factory 不接入或构造诊断）。审查确认代码结构与方案一致，但现有直接 parser 无观察器测试不能代替工厂行为测试。已退回原实现者，在既有本地集成测试内补充真实 SQLite/工厂的合成用例；生产文件保持不变，通过后同一规格审查者复审，再启动质量/安全审查。

两项补测已由实现者完成：实际 SQLite fresh-cache 路径验证零候选构造/观察、原 provider/audit/budget/quota 与 owner 隔离/销毁；实际标准工厂创建服务的合成成功请求验证没有候选诊断构造且 Ready/结算正常。补测首轮 7/8，错误断言忽略既有 Repair 容量预留与 reserved/accepted 两条 quota 记录；仅校正测试假设，生产代码未改，不把这一失败当作产品缺陷 RED。随后单文件 8/8、五文件 209/209、非增量类型/定向 lint/diff check 通过。同一规格审查者复审 **READY，两项 P2 关闭**；已进入独立质量/安全审查。

## 实施续作记录与暂停历史

Task 2 独立规格审查 **READY，无 P1/P2/P3**。已核对三文件与 before-task2 快照、完整形状矩阵、原费用/Repair 行为和本地 SQLite 集成；之后启动独立质量/安全审查。Root 固定本轮八文件指纹于 integration-candidate-hashes.json，另复核 17 个受保护文件全部匹配。

Task 2 实现者最终回报 DONE，无遗留疑虑：扩展 RED 为 54 failed / 76 passed，随后 Provider 与 local diagnostics 两文件 130/130；要求的五文件回归 **303/303**，最终非增量类型与三文件定向 lint 退出 0。仅改 helper 和两个测试，Adapter 未改。覆盖完整 usage/container/count 形状矩阵（NaN/Infinity 直接输入）、严格枚举/组合、嵌套 getter、新副本/canary、Repair 原缺省 0 与原始形状 missing 并存，以及实际本地 SQLite 缺搜索回执的持留/规划/owner/销毁行为。Root 已读取 helper 与测试差异，现由独立规格审查者核对；完整整合/build 尚未开始。

Task 2 首个有效行为 RED：provider-result-diagnostic.test.ts 共 58 项，1 failed / 57 passed；缺失 server_tool_use 的 usage 预期新增 webSearchUsage={container:missing, requests:unavailable}，实际字段不存在。首次沙箱 Vite spawn EPERM 不算 RED；同一离线命令经执行权限处理后得到真实断言失败。终端 runner 直接序列化安全 Summary，无须改变启动器或留存原始响应。

Task 1 独立质量/安全审查 **READY，无 P1/P2/P3**：已核对六文件、前置快照与相关契约，确认可信路径与代码白名单、回调异常隔离、仅首次解析观察和原业务/结算权威保持。Task 1 双审完成后派发新的 Task 2 实现者，只扩展搜索次数形状字段与相关测试。

恢复后实现者复核：初次非增量类型与六文件定向 lint 均退出 0。新增异常数组下标回归先得到 4 个真实断言失败（-1、1.5、NaN、Infinity 被错误投影到 skills[].name），随后仅增加非负安全整数检查，回退最近可信父路径 skills。补充严格投影排序/去重/上限、无观察器不构造、构造失败隔离覆盖。实现者报告候选单文件 37/37、五文件 206/206 GREEN，修正后类型与 lint 再次退出 0；此处仍不是独立双审或 root 最终整合验收。

恢复复核：六项暂停源码及 17 项受保护文件指纹全部匹配。旧 agent 在本轮可用列表中已不存在，已由新实现子代理接手续作；以下暂停记录保留作为历史证据。

实现子代理已被中断并仅作停止回报，没有再改文件或启动测试。最后一次测试正常结束，没有已知活 exec session/测试进程；早期 yielded cell 8 已完成并关闭。

实现者给出的完整时间线（+08）：

- 12:29:16 首个 RED，1 failed：observer 应调用一次而实际 0。
- 12:30:42 首个 GREEN，1/1。
- 12:32:03 扩展 RED，7 failed / 22 passed：缺少界限诊断及 folded-path、prototype-code、cap 场景。
- 12:34:00 解析/投影 GREEN，29/29。
- 12:35:23 本地集成 RED，4/4 failed：主要为新增 Summary 字段缺失；随后校正原失败状态假设。
- 12:36:44 集成 GREEN，4/4。
- **12:38:06 五文件 GREEN，200/200，5.68 s**：`node node_modules/vitest/vitest.mjs run tests/server/research-candidate-diagnostic.test.ts tests/server/live-candidate-diagnostic.test.ts tests/server/research-orchestrator.test.ts tests/server/live-result-diagnostics.test.ts tests/server/live-research-validation.test.ts`。只有既有 Node SQLite experimental warnings。

类型检查、定向 lint、自审、完整需求覆盖核对、独立双审、root 整合/build均未完成。Root 保存时只核对工作树、文件/接线、哈希与 diff check，不把实现者 GREEN 记为 root 最终验收。恢复先完成这些 Task 1 待办，再进入 Task 2；需要改代码时重复受影响测试，不无故重跑全部旧验收。

暂停源码 SHA256（六文件，另存 ignored pause-hashes.json）：

| 文件 | 暂停 SHA256 |
| --- | --- |
| provider.ts | 715baaa6eb31e062c6f9fb6098085e4656666c3cb7a42b359597acf6d50966cb |
| orchestrator.ts | b8756597029b7974bca228048bed1e73d2765845eee2b3edd99ce30fed447e97 |
| result-diagnostic.ts | e498ef71d1ce4f98e78d0ad9d1cc0bd0665fce51babfed2cedabaf6ea2bd8203 |
| validation.ts | 9e98eaf087244b113532aacf2e09974bc891c56a8b8655d6acd5f104dab90fe9 |
| research-candidate-diagnostic.test.ts | d8aa58a0fb0160256b0f18bd00b24eeee6b2f5b0610e710200fdad81b8968e7c |
| live-candidate-diagnostic.test.ts | cdaf177d16c1324428bb8fb35216d3aab35585518639e9a678c3849fe983145d |

本次用户主动暂停，不撤销已明确批准的本地设计。原完整公开发布目标未完成；不因此创建新目标、误标 complete 或索取重复批准。

## 真实证据界限

第八次 Summary 保持原字节：`summary-2026-09-11T03-56-51-191Z.json`，SHA256 `d7d7adabc53d6deeb43295ddbd0220fc4406ad42a6d98667f73086c788ad2f24`。HTTP 200/stop、196252 ms，但 invalid-schema、usage null、保守持留且未规划。

用户后续截图显示 Logs 一条 11:57 AM / Kimi K3 / Parasail 记录，6252 input、6863 output、约 USD 0.12。截图无 generation ID/精确整轮聚合费用，不能据此修改结算，也不能推断未显示的搜索次数。用户随后明确表示刚刚自行开启 Input & Output Logging，界面提示只适用于未来新请求；第八次正文不能补回，离线重放历史正文的路径不可用。Root 没有更改该设置、要求重跑或新增真实请求，继续已批准的合成诊断实施。
