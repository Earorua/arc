# 独立产品课程观测差异审阅（只读）

日期：2026-11-07。范围：冻结 v2 原文／课程参考与实际 `mapMaterialItemTerms` / `mapMaterialItems` 组件输出之间的差异解释。先读独立协议、原文与课程语义，再读产品输出和实现。未更改产品、参考、契约、历史结果；未调用模型、联网、部署、迁移、push 或 commit。

结论：**138 个 topic 差异不是 138 个同类产品缺陷。** 它们分成以下八个互斥组；另有 256 条均没有 `taskCoverage` 产品字段。后者是测量／能力缺口，不是已观察到 256 次错误宣称 full。此次没有实际 service、API 或 planner 场景成绩。

| 组 | 数量 | 当前实际结果 → 独立期望 | 优先级与解释 |
| --- | ---: | --- | --- |
| 单一主题的上下文对应 | 94 | uncovered → mapped/contextual | P1 语义覆盖；其中 6 条还受输入缺少文档上下文限制 |
| 复合任务的多个主题 | 7 | uncovered → mapped，两个 skill ID | P1 组合语义／结果表达；不是二选一歧义 |
| 未消解的替代课程集合 | 5 | uncovered → ambiguous，两个 skill ID | P1 候选保留；不得替用户任取一个 |
| 名称依据政策差异 | 5 | 同一 mapped/skill ID，literal → contextual | P2 依据／解释差异，不能报告为错课 |
| CSS 别名扩大了课程对应 | 2 | mapped/web-platform/literal → uncovered | P1 课程边界过宽，独立完整目录未支持该别名／任务范围 |
| 非学习职责分类 | 2 | uncovered → non-learning | P2；会议记录没有课程不等于它是学习缺口 |
| 发现课程与采用意向的边界 | 12 | non-learning → uncovered 或 mapped | P1 观测接口分层，P2 展示语义；不能据此宣称计划错误采用 |
| 显式空词列表的观测表示 | 11 | 无 term 输出 → literal:null/non-learning | P2 采集表示；没有证据说原事实被删除 |

计数的母体是 256 个账目位置。`resume-01-field-3` 与 `resume-01-additional-1` 对同一来源／词共享 facet，故唯一实际来源＋词位置是 **255**。这次单词控制逐一运行，不是 256 个完整真实候选，也不是模型召回率。118/256 是包含 status、skill ID 集合和 basis 的精确比较，不能当作产品质量百分比。

## 1. 实际复核与可信边界

审阅脚本把每条控制换成 `origin:'extracted'`，绑定冻结资料的 document/version/text ID 和准确 UTF-16 sourceRef。全部 256 条经 `confirmedMaterialItemSchema` 与 `validateMaterialSourceRef` 校验，并独立断言全文切片等于唯一完整原句。实际 mapper 的 term 和 item 输出均与父任务原报告逐值一致。12 条 constraint 的纯函数 `learningIntentItemIds` 变体也逐值一致。

这证明原来的 `origin:'user', sourceRef:null` 不影响这些函数的观察结果；**仍然不证明 extraction 过滤、review service 或完整确认生命周期允许这些标签**。`review-service.ts:43–73` 要求词来自相同 extraction/source/prior 或明确原词修正；新建手动资料没有这些凭据。`extraction-validator.ts:45` 还会按投影过滤标签。将 schema 合法写成 service 合法会夸大证据。父任务负责实际 extraction 投影链，本审阅没有重复它。

参考保持固定：原文 SHA `e512e3fca67fd9133cae4e9186cb054c3044d79b090d567daaba24cb85bd9ef9`；课程账目 SHA `c602035d36fba77a36287149891b775c2ed9420d64612f0cbd76309fc02d6bcf`；课程完整快照 SHA `bf458308b5811f60b61f6e5fa24f6910642a7276615f0b212d930d04868d9676`。脚本也验证两份原语料摘要。所有已使用关系的 topic/task 支持引文都逐条解引用冻结对象；共有 47 个不同精确引文，全部相等。没有从产品结果生成 expected。

## 2. 单主题 94 条：实际根因和独立课程依据

`skill-mapper.ts:84–90` 对存在 `skillLabels` 的输入只接受整个词与名称／别名规范化后相等；复合词不能依其中的名称先提出主题。未匹配再进入 `contextual-skill-mapping.ts`，后者只有 UI token/component、关系建模、日志／追踪、testing 四类狭窄规则。其允许词形、语境词和分句限制同时影响召回。

| 主题／数量 | 具体复现例 | 独立课程内容位置与实际任务边界 |
| --- | --- | --- |
| sql／32 | `resume-01-field-1`：`SQL 汇总查询`、`汇总查询` | registry `/tracks/6/templates/0/buildTask` 是 additive relational schema；`/tracks/6/templates/2/buildTask` 是 safe join＋integrity constraints。主题有对应，汇总查询 task=none，不能因 SQL 字样声称汇总任务 full。 |
| observability／17 | `resume-07-field-1`：`API error logs`、`inspect API error logs`、`runbook` | registry `/tracks/11/templates/0/objective` 是 structured events/counters/correlation fields；`/tracks/11/templates/1/rubric/2` 说明 telemetry 回答 named incident question。API runbook 操作只有 partial。当前 signal regex 只接受一个可选修饰语，`API error logs` 有两个。 |
| design-systems／12 | `resume-02-field-1`：`键盘焦点顺序`；`resume-02-field-3`：`按钮状态`、`组件说明` | registry `/tracks/3/templates/0/completionCriteria/0` 精确要求 “Keyboard behavior and focus order match the state contract.”；焦点窄任务 full；词形未被 UI regex 接受。 |
| testing／11 | `resume-05-field-2`：`unit tests`；`resume-01-field-2`：`测试`、`清洗规则写入测试` | registry `/tracks/8/templates/0/objective` 是 focused behavior test→observe failure→minimum fix；`/tracks/8/templates/2/buildTask` 是 contract boundary＋discriminating mutation。日期 formatter 具体范围未教，只有 partial。`testingTerm` 没有 unit 前缀或单独中文“测试”，且 Python/dbt 不在其 software context 白名单。 |
| react／6 | `resume-02-field-1`：`React 表单`；`jd-08-field-1`：`React 组件状态设计` | registry `/tracks/2/templates/0/objective`、`buildTask` 明确表单状态、可访问错误反馈和重复提交保护。前者窄表单任务 full；未限定原型不能自动 full。 |
| cloud-delivery／5 | `supplement-04-field-2`：`记录回滚步骤`、`回滚步骤` | registry `/tracks/10/templates/0/completionCriteria/1`：“Rollback triggers, steps, and data compatibility are explicit.”。只支持记录清单的 partial；不证明个人操作 Kubernetes。当前四类 matcher 没有发布／回滚关系。 |
| typescript／4 | `jd-02-field-1`：`实现界面逻辑`、`TypeScript 实现界面逻辑` | registry `/tracks/1/templates/0/buildTask` 模型化 UI action/result；`/tracks/1/templates/2/buildTask` 穷尽渲染三分支 union。只有界面逻辑的 typed-boundary 子集，partial。 |
| web-platform／4 | `jd-05-field-1`：`semantic HTML`、`semantic HTML forms` | registry `/tracks/0/templates/0/steps/0/label`：“Build a labeled form and record the native event sequence”；completionCriteria/0 要 accessible name/native submit。窄语义表单任务 full。 |
| product-thinking／3 | `jd-04-field-1`：`define product metrics`、`product metrics`、含 retention cohorts 的组合 | registry `/tracks/14/templates/2/completionCriteria/0` 是 user/behavior change/observable signal；rubric/1 是 goals/non-goals/measures/gates。只有 measures 定义子集，partial；retention cohort 分析仍未覆盖。 |

这里的 94 条都是当前“没有对应”的实际观察；它们有共同实现瓶颈，但不能把 94 个词直接做成生产 lookup。应保留全部任务／工具修饰、否定、人物和来源范围；不能仅加入更宽的 substring 命中。

**输入语境限制（其中 6 条）：** `supplement-02-field-2` 的完整事实为 “I can explain the difference between a trace and a log.”，包含 `trace`、`a trace`、`log`、`a log`、`the difference between a trace and a log`、`a trace and a log` 六种允许词。原资料上一条提到 OpenTelemetry，但 mapper 只收到这一个事实；即使同次传入多个 item，其实现也没有跨 item 语义关系。当前 domain guard 因缺少 API/runtime/software 等语境拒绝，不能仅凭这一句判定为错误的生产否决。独立参考期待的狭窄信号区别由 registry `/tracks/11/templates/2/objective` 和 `/steps/0/label` 支持；要忠实满足它，需要带来源的文档局部语境／关联事实，或明确对 trace＋log 组合概念进行可审阅消歧。不能删除现有防止纸质日志／木材等错域映射的限制。

**分句不是可以直接删除的限制：** `resume-12-field-2` 的 SQL 在前半句、日期参数在后半句；`resume-09-field-2` 的 React 与伙伴协助测试也跨中文逗号。当前分句设计有防止跨主体、否定借词的理由。应建模同一完整事实内的任务关系，并保留“导师提供成品 SQL／本人只替换参数”等限制；不能把全句合并后推成整条能力证据。

## 3. 多主题、歧义与依据：三个独立问题

**组合多主题 7 条：** `resume-05-field-2` 的 `unit tests for a TypeScript date formatter`（1）；`resume-09-field-2` 的 `交互测试`、`React prototype，交互测试`（2）；`jd-02-field-3` 的 `React 组件测试`、`组件测试`（2）；`jd-05-field-2` 的 `test asynchronous TypeScript behavior`、`asynchronous TypeScript behavior`（2）。期望分别是 TypeScript＋testing 或 React＋testing 的 mapped 集合，它们共同描述相关主题，不要求从两者中只挑一个。

当前这七条实际都是 uncovered，**没有观察到其被返回 ambiguous**。不过 `skill-mapper.ts:92` 将任何自动命中数大于一的结果直接标成 ambiguous，显示后续只增加别名／主题命中还不够。需要表达“组合所需的多个主题”与“同一意图的替代解释”之间的区别。`jd-05-field-2` 是特别清晰的边界：topic 包含 TypeScript 和 testing，task 的 supportedScope 只有 testing 方法；TypeScript schema/narrowing 不支持 async 行为测试。不得把两个 topic 都算作任务覆盖。

**替代集合 5 条：** `resume-02-field-2` 的 `WCAG`、`表单标签`、`表单标签说明`、`WCAG 的表单标签说明`；`jd-08-field-2` 的 `accessible form labels`。独立期望均保留 web-platform＋design-systems 两候选。前者是 WCAG 阅读 partial，后者窄标签任务在引用内容并集下 full。web-platform 的上述 labeled-form 证据与 design-systems `/tracks/3/templates/1/objective` 的 accessible-name/semantic-role 审阅证据各有范围。`union-of-cited-content` 不能解释为任选一个候选都教完全部任务，人工选择后须重新限制覆盖。

**basis-only 5 条：** `resume-07-field-3` 与 `jd-09-field-3` 的 `distributed tracing`；`jd-03-field-2` 的 `自动化测试`；`jd-05-field-1` 的 `HTML`；`supplement-02-field-1` 的 `OpenTelemetry`。当前 status 和 skillIds 都正确，只有产品 alias 表称 literal，冻结独立账目称 contextual。独立 literalAliases 只冻结 SQL、TypeScript、React 名称关系；产品 `FLAGSHIP_ALIASES` 更宽且 `skill-mapper.ts:86` 统一记 literal。应审阅并携带名称关系或内容语境的依据，不能把这五条当成课程选择错误，也不能仅在 collector 把所有 literal 重写成 contextual。

**CSS 两条是另一类：** `resume-05-field-1`（CSS grid）与 `jd-05-field-3`（CSS animation）的 `CSS` 词被 web-platform 全局别名接收。冻结完整目录没有支持 CSS 的独立名称关系，也没有 grid/animation 教学任务；期望 uncovered/none。其他带修饰的 CSS grid/animation 词当前恰为 uncovered，不应倒推这个错误别名有效。修复须依课程范围审阅，不应修改原文词或课程标准来消除差异。

## 4. 采用边界、非学习职责与空词

**constraint 12 条：** `resume-01-field-3`＋共享增补各 1；`resume-03-field-3` 2；`resume-05-field-3` 2；`resume-06-field-3` 2；`resume-08-field-3` 1；`resume-10-field-2` 3。mapper 在 `skill-mapper.ts:67–71` 对未采用的 constraint 一律输出 non-learning，独立课程轴却询问其课程对应，完全不要求采用。显式纯函数 intent 变体后，7 条成为期望 uncovered；5 条（两项 deployment exercise、三项 JOIN／重复行）仍然 uncovered，而独立期望分别为 cloud-delivery／sql contextual，对应的任务范围均不能据主题映射升级为 full。

这是观察调用语义和 mapper 表达层混合了 discovery 与 adoption，不能把“未采用学习意向影响排序”当作已观察缺陷。实际 `context-builder.ts:243–249,273` 已记录未采用集合并在 overlay 前跳过；`learningIntentEligible` 还要求非主 JD 的 constraint/requirement，服务会验证明确选择。正确方向是让课程发现可以保留结果，同时采用状态独立控制排序／自评；不应为取得课程轴结果自动采用全部 constraint。

**会议记录两条：** `resume-11-field-2` 的 `taking meeting notes`、`meeting notes` 返回 uncovered；独立期望是 non-learning。当前只有 constraint kind 有非学习分支，没有词级职责分类。原事实同时包含迁移清单审阅，组合短语的 cloud-delivery partial 只覆盖发布文档子集，不能吞掉会议记录职责，更不能把它改成集群实践。

**空词 11 条：** `resume-04-field-3`、`resume-12-field-3`、`jd-02-field-4`、`jd-03-field-4`、`jd-05-field-4`、`jd-06-field-4`、`jd-08-field-4`、`jd-11-field-3`、`jd-12-field-2`、`supplement-03-field-1`、`supplement-03-field-2`。显式 `skillLabels:[]` 在 `resolveMaterialTerms` 产生零 terms 是当前正常集合投影；其中 10 个 constraint 在 item API 仍有 non-learning 记录，resource-reference requirement 的 item API 也是空数组。输入事实／sourceRef 仍存在，不能把它称为事实丢失。

独立协议要求 null sentinel，因此 collector 必须报告此表示缺口。可以预先定义无 retained terms 的观测槽位，并记录原始 mapper 返回空集合；若要导出 non-learning/not-applicable，需要产品的明确分类或明确公布的 empty-retained-list 投影规则，不能从 gold 决定状态。不要将 `skillLabels:undefined` 的旧手动全文路径与显式空数组混同，也不要重新扫描文本恢复用户删除的词。

## 5. taskCoverage 与采集器的最小忠实契约

`MaterialTermMapping`（`skill-mapper.ts:17–23`）和 `mappingDetails` schema（`material-planning.ts:106–109`）都没有 taskCoverage。context-builder 仅按 item/status/skillIds/basis 合并 termIndexes。当前完整观察不能满足冻结课程轴；不能拿映射成功、任务存在、技能名称、别名、或 independently expected 去填 full/partial/none。

建议先做以下采集边界，保持冻结 evaluator 和 expected 不变：

1. 原始候选、实际解码／grounded projection、review draft/confirmation、mapping 输出、实际服务状态投影分别保存，携带源码／构建／输入摘要。没有调用哪一层，就明确不声称该层已验证。
2. 同一候选的源词逐一关联。观察端不能删词降低分母，也不能把过滤前单词假装成过滤后 retained 词；过滤损失属于单独源轴证据。shared facet 只产生一个实际课程观测。
3. 对 grouped `mappingDetails` 用真实 `termIndexes` 和 confirmedItems 还原词，校验每词恰一观测、未知 ID、重复和遗漏。null basis 仅按实际 status 做协议表示转换；不根据 expected 改 basis。manual 选择与自动 preselection 观察分开。
4. discovery 与 adopted-for-planning 分开。为读发现结果而调用纯函数 intent option，只能命名为该函数变体；不能当成服务已授权采用，也不能改变 plan state。
5. taskCoverage 当前缺失时，原始审计保存 missing 字段并把课程轴标为不完整／未评价；不要造一个冻结 wire shape 中不存在的 unknown，也不要为了运行 scorer 代填 none。若导出 evaluator 批次时省略整个课程轴，必须继续明确这不构成通过。待产品确实生成 coverage 后再逐项导出。
6. 课程对象身份／版本和完整内容摘要必须绑定；部分候选、部分 registry、未来 Research 目录不可复用此课程账目的结论。现有 mapper 的校验／目录范围限制应保留。

## 6. 建议的最小生产设计（尚未实现）

第一层保留源事实、原词以及带来源的局部语境和任务关系；人物、否定、工具、对象和任务修饰不能在拆词时丢失。准确名称关系可以确定性处理；复合主题、同句关系、跨句指代及歧义须由可审阅的语义关系处理，并对证据不足保留未决结果。不要把任意字符串匹配当成语义证明。

第二层从当前完整课程内容建立版本化的能力／任务描述，保存具体单元 objective/buildTask/steps/criteria 的引用。把 literal 名称关系、contextual 关系、复合主题集合及替代候选组区分开。覆盖输出必须按来源中的实际任务写 supported/uncovered scope，并标明哪个 skill 提供支持；主题有对应不等于具体任务有覆盖。未决覆盖必须显式留缺，不能默认 none 或 full。

第三层只依据用户已确认的采用动作生成 overlay。事实确认、课程发现、能力自评、学习重点、主 JD 权威各自独立；删除／撤回／逐词排除继续失效后续效果，完成记录、Proof、任务内容与工时继续受原契约保护。

这一设计服务任意合法资料，不是实现 256 个答案的查找表。冻结 30 文档可作独立回归；还需要不同表述、同词异域、不同任务、否定、跨主体、复合范围、未知技能和其他目录的持出例。只扩展当前四类 regex 可以修复一些明确子类，但不能据此宣称一般语义目标完成；新 AI 语义阶段若需要模型必须等待另行授权，本次没有调用。

## 7. 完整差异位置索引

结果 JSON 的 `differences` 保存全部 138 行，每行包含 document/field/literal、互斥组、原文及语义范围、实际输出、独立关系与 task supported/uncovered scope，以及课程账目 JSON pointer，可逐条复核。前文已列其余七组全部位置。单主题 94 行的位置与各位置差异数如下：

`jd-01-field-1(3)`, `jd-02-field-1(3)`, `jd-02-field-2(2)`, `jd-03-field-1(3)`, `jd-03-field-2(2)`, `jd-04-field-1(3)`, `jd-05-field-1(4)`, `jd-06-field-1(3)`, `jd-07-field-1(2)`, `jd-08-field-1(2)`, `jd-08-field-3(1)`, `jd-09-field-1(4)`, `jd-09-field-2(3)`, `jd-10-field-1(2)`, `jd-11-field-2(1)`, `resume-01-field-1(2)`, `resume-01-field-2(2)`, `resume-02-field-1(4)`, `resume-02-field-3(5)`, `resume-03-field-1(2)`, `resume-04-field-2(4)`, `resume-05-field-2(3)`, `resume-07-field-1(3)`, `resume-07-field-2(2)`, `resume-08-field-2(2)`, `resume-09-field-1(2)`, `resume-09-field-2(2)`, `resume-10-field-1(2)`, `resume-11-field-2(3)`, `resume-12-field-1(1)`, `resume-12-field-2(3)`, `supplement-01-field-1(2)`, `supplement-01-field-2(2)`, `supplement-02-field-1(2)`, `supplement-02-field-2(6)`, `supplement-04-field-2(2)`。

## 8. 本次证据与运行

| 文件／记录 | SHA-256／结果 |
| --- | --- |
| 父任务原观察 `product-observation-course-validated-results-20261107.json` | `121b7fc71fd285bb56e2a20964b3e11717d6bb3c9e7aa6a1da6460597a3a49c1` |
| 本审阅分类 `product-course-independent-classification-results-20261107.json` | `df00957f64a69dc0d32a692eaa7590c856d857eb03c94d571313bd598d58cba8` |
| wrapper `product-course-independent-classify-run-20261107` | exit 0；nonLoopbackDenials 0；256 source-bound schema parity；255 唯一位置；47 精确引文 |
| wrapper log | `09522de390d51913084acb5560a1adb67c78a4222d5a1bb09afa6f0119326825` |

上述文件及脚本 `product-course-independent-classify-20261107.ts` 均在忽略目录 `work/grounded-verification/`。运行命令：`node work/grounded-verification/run.mjs product-course-independent-classify-run-20261107 --import tsx work/grounded-verification/product-course-independent-classify-20261107.ts`。输出文件使用独立 basename，未覆盖 wrapper 元数据。

此处优先级是实现／观测工作排序，不是已观察生产事故分级。`actualProductIntegrationVerified=false`、`qualificationApproved=false`、真实模型调用与费用均为 0；历史失败与 Gate 保持原状。
