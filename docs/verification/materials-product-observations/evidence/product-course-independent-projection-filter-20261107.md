# 三条实际投影过滤的窄范围只读复核

日期：2026-11-07。只读取已完成的实际投影结果、冻结原文／课程参考与过滤实现，补充三条 label removal 的根因和证据解释。未修改旧审阅备忘录、旧脚本、产品、参考或 collector；未调用模型、联网、部署、迁移或提交。

结论：三条都是 schema 已接受、独立来源允许的提名词在生产 grounded projection 中消失，**不是非法输入被拒绝**。其中两条是词边界／标题边界假阴性；一条是“正向能力证据”与“原文提到的技能任务”共用过滤器造成的语义契约冲突。三条原事实全文、sourceRef 及已有提醒仍被保留，所以应称为结构化原词损失，不能称为事实全文丢失，也不能认为它们已经错误写入能力或计划。

## 1. 观察来源和限度

| 记录 | SHA-256 |
| --- | --- |
| `product-projection-synthetic-input-20261107.json` | `9aec876c545c3a93d75c3e0f84fed1ec758d6bc5fc3a44b2f5d2fd0feff0e247` |
| `product-projections-root-collection-results-20261107.json` | `ed90d13399e04d56ff8e29ef9b810bb737d88a342c53cc0a8f869934186059ad` |
| 窄词边界诊断 wrapper log `product-course-independent-filter-mechanism-20261107.log` | `a11a12be852b577078933f9522089922bd8ab3c65dbeecc22da7124c15526be3` |

前两份记录位于 `work/grounded-verification/`。结果含 267 个场景，全部 outcome=`projected`，恰有下述三个场景的 `removedLabels` 非空。`projected` 表示实际函数成功返回，不表示语义质量通过。

观察运行的 policy 为 `materials-openrouter-kimi-k31-pro-mxfp4-zdr-extractive-v2`，reviewProjection 为 `grounded-skill-labels-v2`。其来源是 authored fixture、不是 authenticated repository record；用户确认未执行，learning-intent 只是 component stimulus。报告的 `actualModelQualityEvaluated`、`actualProductIntegrationVerified`、`qualificationApproved` 均为 false，realModelCalls=0。

本复核仅增加一次三个指定事实的本地 `Intl.Segmenter('zh', {granularity:'word'})` 边界诊断，未添加宽探针或重跑整套服务。通过统一 wrapper 执行，exit=0、nonLoopbackDenials=0；其输出与已读生产分支一起定位过滤原因。它不是完整 service 生命周期验证。

共同调用链是 `extraction-validator.ts:45` → `supportsReviewedSkillLabel`（`skill-labels.ts:21–24`）→ `findMaterialSkillEvidence`（`grounded-skill-terms.ts:167–171`）。三个场景均有 `submittedLabels == validatedLabels == [原词]`，随后 `projectedLabels=[]`、`termMappings=[]`、`itemMappings=[]`。

## 2. `jd-02-field-2-term-2`：中文名词尾与语气助词被 ICU 合成词

- 完整原文：`必须掌握键盘可访问性的基本检查。`
- 被过滤词：`键盘可访问性`。
- 冻结 source 字段 `jd-02-field-2` 的 required task group 明确允许 `键盘可访问性的基本检查` 或 `键盘可访问性`；kind=requirement、level=must、actor=target-role、polarity=affirmative、hint=null。

实际运行的规范化原句中，词位于 UTF-16 `[4,10)`。起点 4 是 wordBoundary，终点 10 不是。ICU 分段为 `必须(0)`、`掌握(2)`、`键盘(4)`、`可(6)`、`访问(7)`、`性的(9)`、`基本(11)`、`检查(13)`、`。(15)`。因此词尾落在 ICU 片段 `性的` 的中间，`literalEvidence` 在 `grounded-skill-terms.ts:140` 直接跳过；不是否定、来源不唯一、课程目录或字段格式问题。

判断：**原词定位的词边界假阴性。** 该词是完整原文的准确子串，并无把另一个英文技术名称截断的风险；当前将所有中文短语端点强制绑定 ICU word segment，会误拒绝名词后紧接结构助词的合法提名。修复方向应审阅语言／形态边界策略，保留完整 grapheme、技术名称和命名空间保护；不能只硬编码这一条 expected，也不能无条件取消全部边界检查。

冻结课程关系仍为 `mapped/design-systems/contextual`，task=full 只覆盖“基本键盘可访问性检查”，不包括完整 WCAG 审计。投影恢复词以后，当前 mapper 是否能识别这层关系仍是另一项原有缺口，不能把修复原词保留当作映射和课程覆盖已经通过。

## 3. `resume-11-field-3-term-3`：否定能力不是不允许提到这个任务

- 完整原文：`I cannot yet configure a Kubernetes cluster myself.`
- 被过滤词：`configure a Kubernetes cluster`。
- 冻结 source 字段 `resume-11-field-3` 将此完整组合词同时覆盖 tool 与 task 两个 required group；actor=document-author、polarity=negative-capability、hint=null。`cannot yet` 和 `myself` 必须保留。

原词位置 `[13,43)` 的两端均是实际 wordBoundary。词前内容是 `i cannot yet `，命中 `deniedEnglishPrefix`（`grounded-skill-terms.ts:80`），随后经 `deniedListPrefix` 在 `supportsTerm:110` 返回 false。这符合现有“不能把否定语句当作正向技能证据”的过滤意图。

判断：**不是一个可以直接关闭否定保护的词法 bug，也不是无效原词；是正向证据过滤被用于完整原词保留的语义契约不匹配。** 独立原文层需要保留“目前不能自行做哪个任务”，课程发现也需要知道它是否目录外。保留这个任务提名不等于声称作者已经做过／具备该技能。实际结果保留了整句否定、confirm-self-assessment 和 team-attribution 提醒，但失去了结构化任务／工具关系；不能把空词重新定义为 non-learning 来通过。

必要边界：

1. 原文提名／来源定位与正向能力证据判断应分层；否定范围可随提名保留，不能在技能名单中将它变成肯定经历。
2. 不自动写入 independent、verified 或 uncertain，也不因明确限制默认覆盖用户当前自评；`yet` 的当前时间范围与 `myself` 的独立执行范围必须留存。
3. 下游 practice、self-assessment 与 learning-focus 采用必须按完整事实极性和用户明确动作判定。仅让词重新通过现有过滤，而继续把任意 skill-claim 都视为正向 practice，是不充分修复。
4. 冻结课程期望是 uncovered/none：Kubernetes 配置不在完整课程目录。不得用 cloud-delivery 的通用发布清单代替集群配置，也不得为补齐标签而赋予课程掌握等级。

该项应继续记作实际投影的语义保留缺口，同时记录否定保护本身在防止错误能力采用方面的用途。不能将“保留原词”与“接受能力主张”合成一个开关。

## 4. `resume-12-field-1-term-4`：简介标题被冒号防护误判

- 完整原文：`简介：熟悉 SQL，可独立完成报表。`
- 被过滤词：`熟悉 SQL，可独立完成报表`。
- 冻结 source 字段 `resume-12-field-1` 明确登记此合并短语覆盖 SQL 工具与完成报表任务两个 group；这是待核对的作者主张，hint=null。

NFKC 后词位于 `[3,17)`，两端均是实际 wordBoundary，前缀是 `简介:`。`chineseSkillHeading`（`grounded-skill-terms.ts:68`）列有“摘要／概述”等标题，但没有“简介”；因此 `skillHeadingPrefix` 不接受此前缀。`literalEvidence:145` 的 `before.endsWith(':') && !skillHeadingPrefix.test(before)` 将它作为 URI／namespace 式词前冒号而拒绝。

判断：**说明标题边界假阴性。实际触发原因不是 independent 能力保护。** 原句的“可独立完成报表”必须作为作者原话保留，但不表示系统可以采纳 independent hint／自评。扩大正文标题识别时仍需保持命名空间、URI 和技术名边界，不应全局放开任意冒号后的字符串。

本资料后文是“所有 SQL 由导师提供，我只替换了日期参数”和“本人是否编写查询待确认”。前后事实可以同时成立：能够完成报表不等于独立编写全部查询。因此需要保留 confirm-self-assessment 与 missing-information，不得自动添加已定论的自评冲突，也不能因看到“独立”就写入 independent/verified 或反向推断 uncertain。实际投影保留了全文和这两个已有提醒，未产生能力提示。

冻结课程关系为 mapped/sql/contextual，但 task=none；课程关系模型／安全 join 任务不支持这句报表工作的具体范围。恢复词后仍不能凭 SQL 对应把报表范围标 full。

## 5. 计数与 collector 应如何忠实报告

这三项不是原本没有学习词的那 11 个 null-term 控制。它们在原始提取和 schema validation 阶段都有明确原词，之后被生产 projection 删除。`projectedLabels:[]` 不能让这些预先登记的控制位置消失，也不能将它们重新归为 non-learning/not-applicable。

保留两条可审计的分母链：

1. 输入／源轴：仍列出三个已接受提名及其 source、允许语义组和 removedLabels。对于这一具体候选，过滤后所需的源词组不再满足；“其他替代表述可能通过”不能修复当前观察。
2. 输出／课程轴：记录实际 mapper 没有收到词、因此没有该词的 mapping 观测；缺失原因是 upstream projection removal。不得借删除词来减少课程错误，也不得用 gold 或原始词再次调用 mapper 之后假装那是这次生产投影的结果。

如果候选协议只允许“实际保留词”的课程观测，投影损失也必须在独立源轴或外层完整性账目中阻断通过；不能只评剩下的词后宣称端到端通过。已有原始结果中的 `labelRemovals` 正是区分“原始空词”与“投影后空词”的必要证据，应保留。此处无需修改冻结 evaluator 或减少原 84 字段／增补项／有限关系位置的分母。

267 个控制场景不是 267 个真实模型样例，也不是完整服务确认与计划采用场景；3 次原词删除不能换算为真实用户错误率。当前观察也没有 native taskCoverage，因此无论修复哪条过滤，完整课程与规划通过结论仍不能自动成立。

本复核没有更改这些三项独立期望，也没有建议为了通过而删除否定、责任限制、确认提醒或能力采用限制。
