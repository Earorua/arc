# 独立课程覆盖审阅与候选评分器实施计划

> **For agentic workers:** Use `superpowers:subagent-driven-development` for implementation, specification review, and subsequent code-quality review. Continue the approved v2.1 design and the unfinished Task 2 of the assessment-scope plan. All work is offline.

**Goal:** 完成可复核的课程覆盖标注和独立候选评分器，保留原文层、历史 Gate 与真实评测结论。

**Architecture:** 原文标注作为只读输入；另存课程对象快照、逐词课程关系及实际任务覆盖依据。评分器只读取冻结标注和待评测数据，不调用产品 grounding/mapping 生成期望。原文、课程和采用/计划轴分别报告，缺少任一轴证据不能取得完整通过。

**Tech Stack:** 本机 Node.js、现有 esbuild（仅打包课程数据导出对象）、JSON、Node test runner、ESLint；隔离环境与出站拦截。

## 边界与冻结输入

- 不修改原文标注 `annotations.draft.json`（SHA `e512e3fca67fd9133cae4e9186cb054c3044d79b090d567daaba24cb85bd9ef9`）、其两个依据文档或三份原始语料/评分器。
- 不修改产品行为，不部署、不迁移、不调用模型。需要真实质量验证时另行准备授权。
- 新资产放在 `docs/verification/materials-quality-v2/`；独立课程作者不得读取产品映射、grounding、模型/解码/审计输出。先冻结课程事实，再观察候选。
- 课程引用中的外链不访问。别名缺少本地证据时使用有限语境关系或未覆盖，不能以常识补成已核验别名。

## Task 1：课程对象和覆盖账目

Files: create `course-reference.snapshot.json`, `course-annotations.draft.json`, `course-authoring-notes.md`, `capture-course-reference.mjs`, `validate-course-annotations.mjs`, `course-annotations.test.mjs` in the asset directory.

- [ ] 读取并冻结完整 `app/data/flagship-role.ts`、`flagship-blueprint.ts`、`flagship-unit-registry.ts` 文件及其三个导出对象。记录打包依赖文件和对象 SHA；快照重新生成须与当前对象逐值相同。
- [ ] 对全部 84 个旧字段和 2 个增补项建立独立账目。逐个允许原词给出唯一政策；没有学习词的字段也保留显式 non-learning 账目。合并短语可以覆盖多个语义组，但不能把未覆盖部分吞掉。
- [ ] 分开记录 `mapped/ambiguous/uncovered/non-learning`、具体 skill ID、`literal/contextual` 依据，以及 `full/partial/none/not-applicable` 任务覆盖。课程证据用对象 JSON pointer＋精确引文；未覆盖范围必须写明。名称匹配不等于任务完整覆盖。
- [ ] 核查 CSS grid/animation、Kubernetes、Python/dbt/分析任务、SQL 窗口/仓库任务、TypeScript 异步测试、UI tokens、表单标签双候选、OpenTelemetry/trace/log、迁移清单/回滚记录和学习意向。引用材料不授予能力、不提升主 JD 权威。
- [ ] 先写结构/坏例测试并记录失败，再实现校验器。坏例至少包含丢字段/词、重复词、非法课程 ID、伪造对象引文、版本/对象哈希变化、残缺注册表和没有证据的完整覆盖。
- [ ] 独立规格审阅通过后做工具质量审阅；修复真实问题并复审，保存结果与限制。

Run from repository root (use unique wrapper labels):

```powershell
node work/grounded-verification/run.mjs course-v2-tests --test docs/verification/materials-quality-v2/course-annotations.test.mjs
node work/grounded-verification/run.mjs course-v2-validate docs/verification/materials-quality-v2/validate-course-annotations.mjs
```

## Task 2：候选输入协议和独立评分

Files: create `candidate-protocol.md`, `candidate-evaluator.mjs`, focused helper modules as needed, `candidate-evaluator.test.mjs`, and `evaluate-candidates.mjs` in the same directory.

- [ ] 协议区分真实提取候选（text/kind/source/skillLabels/selfLevelHint/requirementLevel）和站点课程/采用观测；不要求模型生成评分器私有的真值 ID。文档/文本版本和完整原文来源必须随输入固定。适配仅重命名与补齐已知文档标识，不能纠正输出。
- [ ] 首先以人工构造输入写正反例；记录实际 RED，再实现纯函数 `evaluateCandidateBatch(input, references)`。正例构造函数只放测试，不作为评分器的补默认路径。
- [ ] 原文轴独立核验全文/分段/UTF-16 唯一定位、版本、JSON/数组上限、一对一匹配、完整文本、必需词组/允许组合词、hint、主/次 JD 分类、required/optional/forbidden 提醒。重复、额外事实、额外提醒、额外词均不能获得通过；不能信任候选传来的 legacy ID 或通过声明。
- [ ] 固定 30 文档/84 旧字段和 2 个单列增补；共享增补仅允许已声明的学习主题 facet。逐文档阈值 0.9/0.9/1；零分母报告 not-applicable，supplement-05 仍须检查风险提醒和无伪事实。
- [ ] 课程轴按已审有限原词对应，核验状态、候选课程集合、依据和任务覆盖；无课程输出是未评测，非法课程、全清空、遗漏词、将 partial/none 报 full 均失败。原文正确不能抵消课程失败。
- [ ] 采用/计划轴读取显式 before/action/after 观测，检查事实确认不自动写自评、学习重点必须显式采用、非主 JD 不能变硬要求；未采用/撤回/删除/排除词和过期预览不影响计划；已完成任务、工时、内容、依赖、Proof 与不相关自评保持。输入缺少必需场景不得取得完整通过。这是观测校验，不在评分器内模拟产品生成器。
- [ ] 分层结果包含具体 document/field/term/error；不以平均分抵消严重来源、人物、否定、冲突错误。CLI 错误与候选失败均非零退出；报告必须声明 synthetic/offline 与未批准新 Gate。

采用/计划场景的输入和动作必须是独立固定的参考夹具，并以摘要绑定观测；不能由候选自报任意 before/action 再自行证明不变。最少场景为：只确认事实、单项采用 guided、批量 independent 拒绝、单项明确 independent、未采用学习意向、明确采用软重点、撤回重点、删除资料、逐词排除、同岗位替换主 JD、次要 JD 不产生硬要求、未决冲突不自动裁定、过期预览拒绝。每个结果同时检查完整未完成任务集合、依赖次序、预算和受保护的完成记录/Proof；仅被本次明确自评采用选中的技能允许发生等级变化。场景参考数据可以使用最小合成任务集合，不声称它们是实际产品运行。

附加语境对照（不同项目/年份，UI/OAuth/LLM tokens，关系/财务建模，API/纸质日志和不同测试层级）用于检查完整来源不可偷换、原词不可泛化及有限课程政策不可越界；不能将这些对照混入原 30 文档召回分母。不同蓝图、残缺注册表必须使参考加载失败，而不是换目录后继续沿用旧标注。

Required semantic mutations: 丢否定、换人物/版本/引用、删工具或任务、重复/新增事实、教练建议升 must、丢/乱加提醒、非法课程、部分覆盖冒充完整、未采用学习目标改变顺序。正例包含 guided、conceptual、null hint＋局部能力核对、同词不同任务、原文中的非学习时间与资源链接。

## Task 3：验证、冻结和恢复入口

Files: create `candidate-review-verification.json` and `docs/verification/2026-11-07-materials-course-candidate-evaluator.md`; update the assessment plan, public-release progress, and pause/recovery entry.

- [ ] 评分器规格审查→代码质量审查，补充独立故障注入，不以构造正例证明模型质量。
- [ ] 根任务复跑原文结构/26 坏例、新课程验证/测试、新评分器测试及相关 ESLint。无产品源码变化时不重复声称全仓重新通过；引用已冻结产品批次的既有全仓证据。
- [ ] 保存全部资产、原输入、课程文件/对象、评分器、当前提取提示词的 SHA 和运行日志/出口计数；新候选可审阅冻结不等于新 Gate 批准，构建和真实运行资格另行验证。
- [ ] 更新报告与恢复入口，列出真实评估、环境/发布验收等剩余项；本轮真实调用/费用/部署/迁移均为零。仅按本次授权做本机提交，不自动推送。

Verification examples:

```js
assert.equal(evaluateCandidateBatch(validSyntheticBatch, references).passed, true);
const changed = structuredClone(validSyntheticBatch);
changed.documents[0].candidates[0].text = 'An invented personal claim';
assert.equal(evaluateCandidateBatch(changed, references).passed, false);
```

以上例子中的构造输入由测试固定数据提供，不能由被测产品输出回填期望。两层标注须先经独立审阅；发现产品差距应如实报告，不能为适配实现而放宽标准。
