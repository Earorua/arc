# 多类型资料 v2.1：原文提取与核对流程离线修复

日期：2026-11-07（北京时间）。从暂停提交 `a73b609` 恢复，补齐 `8186858` 保存的在制实现。新提取协议名为 `source-spans-v2`，产品范围仍遵循 v2.1 方案。

**当前状态：本轮离线修复与验收完成。** 源码已保存为本地提交 `5e89f09351080aa66d54b99116f4d60d2d7d9a0d`。全仓回归、类型、Lint、构建、页面渲染和定向独立复审已通过。正式模型质量结论仍以已封存的 R2/P1 为准；本报告不放行真实评测或生产发布。

## 完成的修复

1. **技能词必须有原文支持。** 修复英文、中文、并列否定及引号包裹工具名的漏判。普通动词 `react`、`excel` 不再直接当作技术；小写同形词需要明确的工具、列表或技术名词上下文。保留 Unicode、多词工具名与合法列表。规范化只覆盖已经审阅的等价表达，例如 `清洗空值记录 → data cleaning`，不把任意近义词自动当成同一能力。
2. **个人自评不借用示例或他人经历。** 拒绝从完整文档引号中截取的独立断言；不能仅清空自评却让该条虚假个人事实继续影响计划。自评的每个技能必须位于实际断言中，转述、安排同事操作以及不同人物或不同限定语下的技能不共享水平提示。对“在同伴指导下实际练习”及引号包裹的工具名称保留正向对照。
3. **JD 分类按来源确定。** v2 使用原文明确措辞和适用标题确定必备／加分，局部明确表述覆盖标题；缺少依据、混合优先级、条件、否定或引用示例保留为“需要核对”。原文的 optional 不能被模型写成必备。标题继承不跨到其他公司或章节，补齐无项目符号条目的引用边界。重复引用同一事实，即使模型改变标签、等级或类别，也会被拒绝。
4. **新旧策略在服务端隔离。** 仅实际运行作业保存的 `provider_policy_id` 等于 `materials-openrouter-kimi-k31-pro-mxfp4-zdr-extractive-v2` 时，才能使用新的核对规则。投递事务再次检查该策略，客户端或模型输出不能选择规则。旧 v1 包封与历史无包封数据保留各自行为。
5. **补齐人工修词的正常入口。** 用户可在核对界面从原文补充 AI 漏掉的词；服务端验证原文、当前事实、条目身份和修订后保存。重新打开、确认并创建计划均使用这次修正。普通保存不能恢复已删除词，不能跨来源或版本补词，也不能把约束主题转为个人能力。每条最多八个词，能力自评仍需单独采用。

完整界面集成用例从空白资料开始，经过用户同意、固定模拟 AI 回复、真实应用服务与本机数据库、补词、重新打开、确认和计划生成。另用可选 PostgreSQL 的 JD 验证：补词后只有加分优先级，没有必备保护。以上均为本机合成输入，未调用真实模型。

## 验证与可复核依据

源码在干净副本中逐文件校验，非文档文件共 985 项，清单摘要为 `59087cc570a4dbfb7374b0e461e849fcc5c8d4993ab0109aa181ac135891b2e6`。检查过程使用临时用户目录、禁用外部凭据与发送开关，并记录 Node 出站拦截日志；本机 Worker 另配置出站拒绝服务。

| 检查 | 结果 |
| --- | --- |
| 最终全仓 Vitest | 364 个文件、8,118/8,118：两项串行套件 49/49，其余 362 个文件 8,069/8,069。 |
| 附加 Node 测试 | 源码冻结后 9 个文件串行运行，290/290，无失败或跳过。 |
| TypeScript | 干净源码完整 `tsc --noEmit` 退出码 0。 |
| ESLint | 干净源码完整检查：0 错误，4 条既有 Research 测试警告。 |
| 构建与页面 | 以本机验收配置执行标准 Vinext 构建通过，构建后页面检查 5/5。 |
| 原生 Worker | 使用项目兼容日期，Node 与本机 workerd 的 19 个案例结果一致；Worker 出站请求 0。 |
| 独立审查 | 站点／界面及生命周期 87 项通过；Worker 最终 61 项定向复审通过，所列问题全部关闭。 |

暂停时的 9 项失败已重新复现。后续修复保留先失败、后通过的记录，没有修改原冻结语料、评分器、费用校验或 Research 哈希门槛。首轮全仓运行包含仍在修复的 5 个技能列表回归；最终以冻结源码再次验证。另一次权限夹具运行在 D 盘临时目录因 `SetAccessControl` 抛出 `UnauthorizedAccessException` 而失败；相同最小程序在 C 盘成功，原测试与权限校验未改动，迁回 C 盘临时目录后两套件 49/49 通过。

已归档 [机器验证记录](materials-grounded-repair/verification.json)、[985 项源码清单](materials-grounded-repair/source-manifest.json)、[标注兼容性结果](materials-grounded-repair/annotation-compatibility.json)、[原生运行时结果](materials-grounded-repair/native-runtime.json) 和 [Worker 复审闭环](materials-grounded-repair/worker-review-closure.json)。源码提交后再次校验工作树及干净副本，均与清单一致。

可重跑程序为 [标注兼容性对照](materials-gate-1b-b2/grounded-terms/replay.mjs) 和 [Node／Worker 对照](materials-gate-1b-b2/grounded-terms/worker-check.mjs)。主要命令如下；原验证在上述隔离环境中执行，构建与类型检查使用干净源码副本。

```text
node node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/server/document-diagnostic-pilot-host.test.ts tests/server/materials-supplement-collection.test.ts
node node_modules/vitest/vitest.mjs run --maxWorkers=4 --exclude tests/server/document-diagnostic-pilot-host.test.ts --exclude tests/server/materials-supplement-collection.test.ts --reporter=dot
node --test --test-concurrency=1 tests/build/restricted-candidate-files.test.mjs tests/build/restricted-research-candidate.test.mjs tests/offline-uat/entry.test.mjs tests/offline-uat/http-clients.test.mjs tests/offline-uat/legacy-recovery.test.mjs tests/offline-uat/research-public-recovery.test.mjs tests/offline-uat/research-recovery.test.mjs tests/offline-uat/retained-compatibility.test.mjs tests/scripts/auth-tail.test.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js . --ignore-pattern dist --ignore-pattern .next
node scripts/run-vinext.mjs build
node --test tests/rendered-html.test.mjs
node --import tsx docs/verification/materials-gate-1b-b2/grounded-terms/replay.mjs
node --import tsx docs/verification/materials-gate-1b-b2/grounded-terms/worker-check.mjs
```

构建设置 `ARC_CLOUDFLARE_TARGET=tests/fixtures/build/materials-acceptance.json`。测试文件清单、日志摘要和退出码见机器验证记录，既有四条 Lint 警告均位于 Research 测试。

## 质量门槛仍未通过

30 份离线回放使用的是**冻结标注构造的模拟回复**，不是 Kimi 的预测。旧格式控制组为 24/24 与 6/6；v2 对照原冻结规则的结果为：

| 对照组 | 普通样例 | 边界样例 | 严格字段匹配 |
| --- | --- | --- | --- |
| 原 B2 24 份资料 | 1/18 | 0/6 | 42/74 |
| 六份补充资料 | 0/3 | 2/3 | 8/10 |

两组均能解码，站点没有进一步丢失已校验的技能词。这些数字说明当前规则与原标注尚有差距，不能据此宣布 AI 质量通过。

- 一部分标注要求更宽的分类词，例如把具体动作归入上位概念。当前有界等价词表不能替代课程蓝图的分类与映射。
- 一部分标注把普通操作经历直接设为需指导完成；新规则要求有明确的个人水平或指导依据。这需要逐条审阅标注与产品契约，不能用猜测补齐。
- `jd-11` 要求在资料提取阶段判断 Kubernetes 未被课程覆盖，但单份 JD 没有当前课程蓝图。独立对照中，同一 Playwright 要求在全栈蓝图映射为测试技能，在 Data Product Manager 蓝图未覆盖，证明覆盖判断依赖后续所选蓝图。文档明确陈述某课程缺口时仍会保留原文提醒。

原 B2、P1 的失败结果保持不变。任何标注或验收契约调整都应先形成独立、有差异说明的新版本，保留旧结果，之后才可准备新的冻结候选和真实评测授权。

## 下一步与授权边界

1. 逐条区分真实实现缺口、可审阅等价表达，以及应在课程映射阶段判断的内容，完成下一版质量验收契约。不得删除困难样例或追溯修改旧成绩。
2. 契约确定后冻结候选、配置、合成资料、价格和预算，再申请独立真实评测授权。旧 P1 一次性授权已消耗。
3. 质量通过后继续 B3/B4 隔离环境与页面验收、B5 发布准备及正式上线验证，分别遵守相应授权范围。

本次离线工作新增真实推理、部署和远程迁移均为 0，新增模型费用为 0。历史累计 30 次推理、0.547151 USD，未决费用为零。当前分支和工作树保留，公开发布目标尚未完成。
