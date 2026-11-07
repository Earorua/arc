# 独立候选评分输入协议

状态：已实现的离线候选协议，`materials-quality-candidate-v2.1`。独立复审与资产冻结结果见[候选审阅凭据](candidate-review-verification.json)。本协议为下一轮独立质量审阅准备，不修改历史 Gate，不代表模型已通过。

## 1. 输入和信任边界

评分器读取一个 JSON 批次，包含 `schemaVersion`、`provenance`、`documents`，以及可选的 `courseObservations`、`planObservations`。省略后两个观测轴只允许得到原文轴结果，完整 `passed` 必须为 false；不能自动填入标准答案。

`provenance` 记录 `kind`（`constructed-control`、`model-extraction` 或 `product-observation`）和说明文字。这是输入方声明，不能替代模型回执、构建摘要或实际产品运行证据。由标注构造的正例只能检验评分软件。

每个文档的形状与现有质量采集数据一致：

```json
{
  "documentId": "resume-01",
  "documentVersionId": "resume-01-version-1",
  "textVersionId": "resume-01-text-1",
  "candidates": [{
    "id": "candidate-1",
    "kind": "experience",
    "text": "2024年在青桔实验室参与销售报表项目，按导师示例编写 SQL 汇总查询。",
    "source": {
      "segmentId": "resume-01-segment-1",
      "quote": "2024年在青桔实验室参与销售报表项目，按导师示例编写 SQL 汇总查询。"
    },
    "requirementLevel": null,
    "skillLabels": ["SQL 汇总查询"],
    "selfLevelHint": "guided"
  }],
  "reviewPoints": []
}
```

上述仅展示字段，不是完整通过样例：该文档还需要其他事实和规定提醒。模型无需返回 legacy field ID、课程标准答案或通过声明。评分器以独立来源匹配候选，并自行找到相应参考字段；输入不能用伪造 ID 取得分数。

source-spans-v2 的 `skillTerms` 是原词，现有解码候选中的对应字段名是 `skillLabels`。采集适配只能保留/重命名实际结果，记录已有文档版本，不得补词、修正 hint、补提醒或以课程 ID 替换词。原始模型输出与解码结果的质量应分别标明，不能混作同一测量。

## 2. 原文轴

- 恰好包含冻结的 30 份文档，拒绝重复、遗漏和未知文档。按四个分组逐份报告，84 个旧字段与 2 个增补项分别统计。
- 独立检查完整来源的版本、唯一段落、UTF-16 位置和原文；text 必须与允许的完整来源句一致。人物、否定、年份、任务和责任不能通过改写消失。
- 每个旧事实最多匹配一个候选。只有已登记的 `resume-01` 学习主题增补可以与指定旧事实共享同一候选；另一增补必须保留独立来源。额外或重复事实不得通过。
- 必需词组逐一满足；可用已登记的完整合并短语覆盖多组。只接受有限原词集合及已登记 optional 词，额外泛称或课程标签不能替代任务词。
- hint、主/次 JD 的分类、未决冲突和精确 code＋source 提醒分别核验；未登记的提醒不能凭“谨慎”自动通过。资源链接和教练建议仍为 requirement＋unspecified，其来源角色从独立标注推导。
- 每文档关键项召回至少 0.9、适用 JD 分类至少 0.9、来源合法率 1；各轴共同通过。字段、额外事实和提醒错误也独立阻断通过，达到数值阈值不能抵消这些错误。零分母为 not-applicable，仍检查风险提醒、无伪事实及其他适用轴。
- 每文档候选/提醒各最多 100 个，候选词最多 8 个，每词最多 100 UTF-16 单元，text/quote 最多 1000；候选/提醒合并 JSON 最多 128 KiB。批次入口先限制 UTF-8 文件大小（8 MiB），再解析。不得接受 Infinity、非 JSON 对象、未知结构字段或格式外等级。

## 3. 课程轴

`courseObservations` 是站点观测数组，不要求提取模型输出课程信息。每条以 `documentId`、`candidateId`、`literal` 关联实际候选词，并报告 `topic`（status、skillIds、basis）及 `taskCoverage`（status）。没有学习词的候选以 `literal:null` 显式报告 non-learning/not-applicable。

评分器从已审课程账目获取期望，不能在待测结果上运行产品映射来补答案。实际保留的每个词恰有一条观测，不能通过删除候选词减少课程错误。shared facet 不要求重复课程观测。遗漏/重复观测、非法 ID、擅自消歧、错误依据、未覆盖误报 mapped、partial/none 误报 full 均失败。

课程关系和任务覆盖是不同轴。歧义集合中的覆盖若按 `union-of-cited-content` 声明，只表示明确标出的课程内容合起来支持该范围；不保证每个候选课程单独满足全部任务。输入阶段是未作人工选择的自动对应结果；人工消歧后需另行按所选范围验证，不能把自动歧义结果改写成已验证的人工选择。

课程对象、完整来源文件、导出对象摘要及所有引用必须与已审参考一致。不同蓝图/版本、删减注册表或自行更换参考文件须停止评价，不能在新目录上沿用旧覆盖标准。

## 4. 采用与计划轴

`planObservations` 由独立场景的 `caseId`、`inputSha256` 与实际 `result` 组成。场景参考包含固定 before 状态、明确 action 和必须满足的结果约束；观测必须绑定该输入摘要。评分器不接受候选自行提供的任意 before/action 来替换测试条件，也不在内部运行产品规划器生成真值。

结果使用有界、可复核的状态投影：自评、Proof、当前任务集合与内容/依赖/工时、完成记录、未完成顺序、时间预算、资料选择/重点、主 JD 要求，以及预览应用状态。投影保留会影响不变量的具体字段，不能只提供 `protectedDataUnchanged:true` 一类声明。

固定夹具有 14 个场景，覆盖 13 类必需场景及一个显式接受预览正例：仅确认事实；单项采用 guided；拒绝批量 independent；单项明确 independent；未采用学习意向；明确采用软重点；撤回重点；删除资料；逐词排除；同岗位替换主 JD；明确接受当前主 JD 预览；次要 JD 不产生硬要求；未决冲突不自动裁定；过期预览拒绝。该 14 项分母完全独立于原 30 文档/84 字段分母。

共同检查：任务集合不增删，未完成任务顺序完整且满足依赖，预算不超限，完成记录/工时/内容/依赖/Proof 不变。自评仅允许本次明确选择的技能按指定等级变化；学习重点不授予能力，主 JD 分类权威不被次要资料或教练建议替代。删除/撤回/排除的作用不能重新出现，合法替换主 JD 保留其他资料。合成任务使用冻结目录的单元 ID、版本和分钟数；React 的 Web Platform 与 TypeScript 前置条件具有显式完成任务和 Proof。内容为人工编写的最小合成任务投影，不声称复现产品生成器的完整路线选择。

`selectedMaterials` 和 `mainJdRequirements` 始终表示当前计划已采用的上下文。替换主 JD 只生成 `preview.proposedContext`、`proposedOrder` 和 `proposedSchedule`，当前上下文/顺序/排程仍保留 A；`accept-current-primary-jd-preview` 的明确接受动作才将 C 的上下文、顺序、排程一起采用。预览绑定 `baseRevision`、`materialContextSha256` 和 ID。过期例中 preview base revision 为 2、当前 revision 为 3，而动作的 expectedRevision 为 3；因此它确实检验旧预览，不仅是过期调用参数。

每个观测严格为：

```json
{
  "caseId": "fact-confirm-only",
  "inputSha256": "从 planning-reference-cases.json 读取该场景的固定摘要",
  "result": {
    "applyState": "accepted",
    "rejectionCode": null,
    "state": {}
  }
}
```

上例 `state:{}` 仅示意封装，实际输入必须提供下表全部状态字段。每个 `inputSha256` 按 `{before,action}` 的 UTF-8 canonical JSON（对象键排序、数组顺序保留）计算；候选不能自带另一份 before/action。夹具保存明确的预期 key 变更；其余完整 key 投影必须逐值保持，评分器没有规划或采用结果生成函数。

| state 字段 | 必须提供的具体内容 |
| --- | --- |
| `revision`, `jobId` | 状态修订数、同岗位标识 |
| `selfAssessments` | `{skillId,level}` 数组，level 仅为 unseen/conceptual/guided/independent/uncertain；完整保留未选技能，verified 不属于自评，验证证据单列 Proof |
| `proofs` | `{id,taskId,skillId,artifact,digest,verifiedAt}` 数组 |
| `tasks` | `{id,skillId,unitId,unitVersion,content,dependencies,estimatedMinutes,status}`，包含完成和未完成任务 |
| `completedRecords` | `{taskId,completedAt,spentMinutes,proofIds}` 数组 |
| `order` | 全部未完成 task ID 的有序数组 |
| `budget`, `schedule` | `{minutesPerWeek,weeks}`；`{week,taskIds}` 数组 |
| `selectedMaterials` | `{documentId,versionId,role,jobId}` 数组，role 为 primary-jd/secondary-jd/resume/supplement |
| `focus`, `excludedTerms`, `deletedMaterialIds` | 已明确采用 `{documentId,literal,skillIds}`；被排除 `{documentId,literal}`；已删除资料 ID |
| `mainJdRequirements`, `conflicts` | 主 JD `{documentId,skillId,level}`；`{id,documentId,skillId,status,alternatives}` 未决冲突账目 |
| `audit` | 完整 `{id,action,targetId}` 事件序列 |
| `preview` | `{id,baseRevision,materialContextSha256,proposedContext,proposedOrder,proposedSchedule,applied,rejectionCode}` |

`preview.proposedContext` 完整包含 selectedMaterials、focus、excludedTerms、deletedMaterialIds、mainJdRequirements 和 conflicts 六个字段。其摘要绑定这个具体上下文。失效但未应用的历史预览可以保留供审计；过期后不得改变当前计划或再次采用已删除/撤回/排除的重点。

这些构造场景检验评分器识别结果的能力。只有采集器在固定输入下运行实际产品并提供完整结果，才形成产品观测证据；没有该执行记录不能称产品已经通过这些新场景。

## 5. 输出与操作限制

报告分别列出 source、course、planning 的 passed/failed/not-evaluated、文档/字段/词/场景级原因、固定分母和四组结果。完整通过要求所有必需输入齐全且各轴通过。不能用平均值或原文轴通过抵消课程/采用失败。

CLI 对输入错误、参考漂移和候选失败返回非零；报告带独立版本/引用摘要，并始终注明 `qualificationApproved:false`、历史结果未更改。所有计算均为本机确定性检查，不使用 LLM judge，不访问任何资料外链，不产生推理费用。

## 6. 机器入口、边界和指标

从仓库根目录运行，标签必须为本轮唯一值，避免覆盖历史日志：

```powershell
node work/grounded-verification/run.mjs candidate-v2-review-unique --test docs/verification/materials-quality-v2/candidate-evaluator.test.mjs
node work/grounded-verification/run.mjs candidate-v2-score-unique docs/verification/materials-quality-v2/evaluate-candidates.mjs C:/absolute/path/candidate.json
```

CLI 只接受一个文件路径，不接受参考目录或参考文件覆盖参数；UTF-8 文件先有界读取最多 8 MiB + 1 字节，超过 8 MiB、非 UTF-8、非 JSON 或非法结构退出 2。候选失败和证据不完整退出 1，三个轴共同通过退出 0。stdout 总是一个 JSON 报告；错误仅带有限 code/path，不输出环境变量、堆栈或文件正文调试数据。包装器剥离凭据、禁止出站；评分模块本身没有网络客户端。

程序接口：

```js
import { loadReviewedReferences, evaluateCandidateBatch } from "./candidate-evaluator.mjs";
const references = await loadReviewedReferences(); // 可传 root 字符串，仅用于离线副本漂移验证
const report = evaluateCandidateBatch(input, references); // 同输入同输出，纯同步函数
```

loader 返回深冻结参考和不可伪造的本进程加载凭据；克隆、替换或自行构造的 references 均拒绝。固定 source/course/snapshot/两份既有审阅凭据/课程工具/规划夹具哈希在 `candidate-references.mjs` 中。三份原输入、两份依据文档及全部 85 个课程依赖先校验原始字节，随后才调用已固定的本地课程数据捕获工具核对完整对象和 16 技能/48 单元。旧 scorer 只读原始字节计算 SHA，不导入、不执行。历史 authoring 状态保持原样，独立审阅凭据解决其工作流状态；不把 pending 字段改成新 Gate 通过。

结构边界：所有层拒绝未知 key。文档/候选/版本/source ID 为 1–256 个 UTF-16 单元并匹配小写字母数字及中间连字符格式；候选 ID 在文档内唯一，文档 ID 在批次内唯一。每文档候选和提醒各至多 100 项，合并 JSON 至多 128 KiB；词至多 8 个且不重复、每词 100 UTF-16 单元；正文和引文各至多 1000。课程观测至多 24000 项、每项至多 16 个课程 ID；规划观测至多 100 项但完整通过要求固定 14 项各一次。具体状态数组有界（通常至多 100 项，技能自评 16、资料 10、排程 52）。纯函数入口也拒绝循环引用、访问器、稀疏数组、非普通对象、Proxy（含嵌套及已撤销代理）、undefined/BigInt/Symbol/function、NaN/Infinity 和深度超过 32 的值。Proxy 在任何反射或对象检查前由 Node 原生类型检查拒绝；不会执行输入的 trap/getter/toJSON。异常处理不读取或强制转换未知抛出值。

| 文档指标 | 分子和固定/实际分母 |
| --- | --- |
| `legacyRecall` | 该文档通过全部字段检查的旧字段 / 该文档冻结旧字段数 |
| `criticalRecall` | 通过全部字段检查且历史 critical 为 true 的旧字段 / 冻结 critical 数；缺候选/文档仍在分母 |
| `jdClassification` | 版本有效、唯一事实匹配、kind/requirementLevel 正确的显式分类字段 / 冻结适用分类数（31 主 JD＋1 次 JD）；其余字段仍须检查分类正确性但不加入该分母 |
| `sourceValidity` | 全文和所指分段均唯一、UTF-16 边界及版本有效的候选/提醒来源 / 实际提供的候选/提醒来源数 |
| `additionalRecall` | 单列通过增补 / 该文档冻结增补数，总数始终 2 |

字段检查同时包含完整事实文本、source、版本、kind、requirementLevel、所有必需词组、未知词及 hint。提醒单列文档错误，不伪装成字段召回。主/次 JD 分类分开保留分类组，两个未决冲突锚点及资源/建议的 unspecified 规则仍独立阻断错误通过。sourceValidity 是实际输出的合法性指标，不是召回；空输出不能凭零分母过关。任何零分母返回 `{status:"not-applicable",numerator:0,denominator:0,value:null}`。四组报告固定 18/6/3/3 份文档，不取平均补偿。

报告 `status` 为 passed、failed、incomplete 或 error，三个轴分别为 passed、failed、not-evaluated。字段/词/场景均有定位错误；各轴汇总错误至多 200 条，`omittedErrors` 明示省略条数，不影响失败判定。`qualificationApproved:false`、`historyRewritten:false`、`actualModelQualityEvaluated:false`、`actualProductIntegrationVerified:false` 恒定保留。`provenanceVerified:false` 明确区分输入声明与可审计执行证据。

## 7. 文件职责与构造验证来源

- `candidate-evaluator.mjs` 只协调输入、三个轴和最终报告；`evaluate-candidates.mjs` 处理有界文件和退出码。
- `candidate-input.mjs` 定义独立严格输入形状；`candidate-common.mjs` 提供确定性 JSON、摘要和有限错误汇总。
- `candidate-references.mjs` 固定并验证参考；`candidate-source.mjs` 独立核验全文/分段/字段；`candidate-course.mjs` 核验真实候选词对应的课程观测；`candidate-planning.mjs` 检查固定场景和受保护投影。
- `planning-reference-cases.json` 为人工合成输入/动作及明确不变量，不来自产品规划器。`candidate-controls.mjs` **仅供测试**构造正例；运行评分器不导入此文件，也不补缺失观测。
- `candidate-evaluator.test.mjs` 包含完整正例、全部 255 个实际有限关系位置（共享 facet 不重复）、原文语义坏例、课程状态/依据/覆盖坏例、规划采用/撤回/删除/排除/过期坏例、输入边界、真实文件 CLI 和临时副本参考漂移检查。

实现先对空 API scaffold 运行 `candidate-v2-author-red-001`，观察正例及语义坏例的真实断言失败，再实现评分器。独立前置审阅发现主 JD 替换不能提前采用计划，另以 `candidate-v2-author-planning-red-002` 固定该失败，随后引入独立明确接受预览正例。全文跨分段唯一性的故障由 `candidate-v2-author-source-span-red-003` 先记录，再修复。后续 Green 与 lint 日志由本轮验证报告冻结；这些运行只证明构造评分软件的检查有效。

独立性记录：作者读取了冻结原文、课程账目、完整课程对象及批准设计；未读模型/解码/审计输出，未读产品 mapping/alias/planner 实现。一次为确定输入形状而对 `app/contracts/documents.ts` 执行的宽范围检索，意外显示了 186–230 行来源定位/草稿辅助代码；该偶然读取已及时告知父任务，不导入、不复制、不用于期望值推导。来源检查由冻结全文、分段、UTF-16 和独立坏例实现。未执行模型采集器、未部署、未迁移、未访问课程链接。

本协议还没有实际产品观测采集器。未来采集必须在相同固定 before/action 下运行产品并提交完整状态，不能从 constraints 构造结果再声称产品通过；也不能把 constructed-control 的评分结果当成模型质量、新 Gate、当前部署或构建资格。
