# Kimi 下一轮合成质量验收：最小缺口审计

日期：2026-11-19。范围：首个文本资料版本，原有 24 份简历/JD + 6 份补充资料。本次只读检查现有源码、冻结资料、审阅记录及 work 下的较新采集材料；只新增本文，未运行测试、调用 API、修改产品源码或重新采集原生场景。

结论：保留 **24 份与 6 份各自的授权、账本和限额**，补齐真实输出留存、只读导出和当前绑定评分入口即可。无需另造通用 30 份计费系统，也无需更改旧 gold 或重跑已验收的 14 场景。

## 已有能力与最小改动

| 环节 | 已有实现及具体位置 | 缺口与建议 |
| --- | --- | --- |
| 24 份采集 | `scripts/materials-qualification-runner.ts` 的 `runDocumentQualification` / `runAuthorizedDocuments`；`materials-qualification-inputs.ts` 的 `qualificationInput` / `qualificationSegments`；`materials-qualification-journal.ts` 的持久化 checkpoint | provider 已返回真实 `outcome.candidate`，但随后仅保存旧评分。增加一个受冻结执行源约束的采集出口，在下一次推理前持久化真实候选、原始 assistant content、实际 finish/解码状态、资料三重身份、请求正文摘要、回执及费用绑定。参照 6 份的原始 response clone 采集；不得重建“理想输出”。 |
| 6 份采集 | `scripts/collect-materials-supplements.ts` 的 `inspectSupplementSettings`、`freezeChat`、`collect`、`supplementCaptureBinding`；`materials-supplement-ledger.ts` 的 `capture` / `finishAttempt` / `captures` | 已留存原始正文与真实 decoded extraction，包括 null，并把其摘要与回执、资料身份绑定。只补只读导出到统一离线输入的适配；保留原始账本。`sourceSpanPolicy` 已支持当前 extractive-v3，无需为换政策重写此采集器。 |
| 实际产品观察 | `validateDocumentExtraction`；`mapMaterialItemTerms` / `mapMaterialItems`；`createCourseTaskCoverageEvaluator`；`context-builder.ts:233,266-274` 的实际调用和分组方式 | 新增有限的离线观察适配：原始模型候选用于来源质量；另保存验证投影、被移除词及产品实际映射/任务覆盖。采用冻结当前 blueprint、registry、source 与明确的无人工改写基线。不能把映射结果倒填成模型 skillLabels，不能丢弃无法表示的词来提高分数。 |
| 当前评分入口 | `materials-quality-v2/candidate-input.mjs` 的 `validateCandidateInput`；`candidate-source.mjs` 的 `verifySourceLedger` / `evaluateSource`；`candidate-course.mjs` 的 `evaluateCourse` | 新增单独、带版本的当前绑定入口，复用这些已审阅的纯评分函数与未变的标准。旧 `loadReviewedReferences` 绑定原 85 份依赖，当前拒绝是正确行为；不得降低其校验、伪造 WeakSet 凭据或转向历史目录冒充当前源。 |

24 份的采集失败必须在结算已能归属的费用后停止后续发送；未知费用继续冻结预留。现有每份最终 checkpoint 屏障、重复回执阻断、once-only 启动标记、串行执行和预算预留应保留。旧评分产生的非零退出码不得触发自动重发：应分别报告“采集/结算完成”和“新质量评分结果”。历史 R2 未留候选，不能拿旧账单补出新模型质量。

原始资料固定为现有 24 份 corpus `69e5ddd1…ed750` 与 6 份 corpus `9775b595…13d7`，身份及全文从冻结文件读取。损坏、截断或 null 输出必须保留失败状态；缺失观察不得由 `candidate-controls.mjs`、gold 或已知期望值补齐。

## 当前课程及规划证据如何接入

新增评分入口应先核验原始参考资产、3 份冻结输入和 2 份依据文件，以及复用评分函数的审阅摘要；再调用 `materials-native-acceptance/verify-integrated-course-binding.mjs::verifyIntegratedCourseBinding` 检查实际当前文件。同步核验 `integrated-course-review-receipt.json` 所绑定的 spec/quality PASS 和文件摘要，不能仅接受外部传入的 `valid:true`。

当前 integrated binding 为 `materials-integrated-course-binding-20261119`，摘要 `0abfafdde4125cabf7a2b56aea7497b2e1dbd75b9c8406896fa42566af858d6a`；已审阅链限定五处角色展示翻译，48 个教学单元保持不变，覆盖 85 份依赖。新入口使用这条明确的绑定链，而非修改旧 `candidate-references.mjs` 的历史信任根。

来源/课程分数从本轮真实模型候选和当前产品函数计算；规划另行绑定已验收的 `planning-result.md`、原始 manifest/check、独立审阅及 `planning-integration-reuse-review.md`。后者已证明 146 份导入文件中 143 份未变、另 3 份仅为已审阅展示/解释版本差异；最终仍须核对该限定差异。保持“行为证据复用”的表述，不声称历史原生运行使用了当前字节，也不生成旧规划参考所期待的 after-state 来冒充原生观察。无需重跑原生矩阵。

旧 `collect-projections.ts` 仅接受 `constructed-control`、使用 extractive-v2，并始终报告 `native-task-coverage-absent`；不能只改标签就当本轮采集器。可以复用其身份、原始输出与投影分离的设计，实际调用当前 v3 验证及任务覆盖函数。遇到词汇/状态无法无损映射进 v2 观察协议时，应明确报告缺口，不据 gold 选择状态。

旧纯评分器的 `actualModelQualityEvaluated:false`、`provenanceVerified:false` 等字段保持原意。新包装报告单独给出真实传输证据、来源/课程成绩、原生规划复用与完整性结果；在所有必要证据齐全前不得声称 Gate 或发布通过。

## 授权前的有限准备

1. 实现并独立审阅上述采集出口、只读导出和当前绑定评分适配。仅增加其新边界需要的定向检查：实际候选与原始输出/回执绑定、null/截断/采集写入失败、身份或摘要篡改、当前绑定漂移、丢词/缺观察拒绝。复用已有计费/授权测试；只有影响对应路径才运行相关套件，不重跑无关全仓或 14 场景。
2. 冻结新的执行 commit、工具及请求正文摘要，准备新的 24/6 settings、issuance 和独立启动记录。历史 R2 host 可作为核对模式；不得复用其旧授权、源清单或启动标记，也不得执行历史命令。
3. 准备授权时列明当前 extractive-v3 政策、同一 Kimi 标准路由、禁止 fallback、严格 ZDR 与隐式缓存边界、30 份原有合成文本及费用/时间上限。公开端点材料已由 root 保存在 `kimi-20261119-public*.json`；公开费率为输入 $2/M、输出 $10/M，generation 仍为 20261023。账户、专用 key 余额/限额和 guardrail 仍需新鲜只读核验，密钥留本机隐藏输入。
4. 维持既有分拆上限时，可提交 24 份最多 $2.00、6 份最多 $0.45，合计硬上限 $2.45；若沿用每份 16000 输入 + 4096 输出预留，则 30 份预留合计 $2.188800。每份硬上限仍为 $0.075；最终以冻结配置计算值为准，不能以历史实际费用代替硬限额。

**具体操作风险：** 24 份既有 R2 路径允许每份最多 3 次只读回执查询；6 份 collector 当前严格只允许 1 次。R2 记录中首次查询 24/24 都曾返回 404，因此照旧使用 6 份限制可能在首份即停止。应在新授权前明确选择保留此边界，或单独批准并审阅一个仅扩充只读回执重试的有限改动；不能在执行中悄悄增加查询次数。无论哪一种，都不增加推理重试或自动重新跑整批。

以上是下一轮授权材料所需的缺口建议，尚未实施新采集/评分适配；旧付费授权均不因本文恢复有效。
