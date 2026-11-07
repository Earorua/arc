# 多类型资料：冻结质量标注与实现差异复核

日期：2026-11-07。基线为本地提交 `3bb035e`。本轮接续已完成的[原文提取与核对修复](2026-11-07-materials-grounded-repair.md)，逐项检查 24 份原 B2 合成资料及 6 份补充资料，共 84 个标注字段。

本报告区分实现遗漏、需要所选课程蓝图的映射，以及原标注缺少依据的地方。**没有修改原语料、原评分器或已封存的 R2/P1 结果，也没有将离线模拟回放当成真实模型质量通过。** 此处的后续验收建议尚未替换已定稿的 Gate 1B 计划。

## 复核依据与方法

- [v2.1 产品方案](../superpowers/specs/2026-09-11-arc-private-materials-personalized-planning-design.zh-CN.md)第 5.3、6.2–6.4、7.1–7.2 节：AI 自动预填，用户核对；自评独立采用；保留实际来源、限定语和经历归属；技能映射依据具体蓝图；岗位要求不等于个人能力。
- [Gate 1B 计划](../superpowers/plans/2026-11-04-private-materials-gate-1b-acceptance.md)第 5 节：逐文档 90% 关键项召回、90% 适用 JD 分类、100% 保留来源合法率；18 份普通和 6 份边界全部满足标准；同义表述的修订只可用于独立编号的新轮次。
- [逐字段复核程序](materials-quality-contract/audit.mjs)核验两份冻结语料和评分器的原 SHA-256，对每条来源分别比较类别、技能词、自评、要求优先级和提醒。原 v1 标注控制组必须全部通过。

该程序先使用已知标注构造模拟回复，v2 的技能短语由当前可支持词汇查找。它只能证明当前规则与标注的兼容程度，不能测量模型能否找到事实、能否正确提名原词，更不能证明 AI 召回率。未被这份模拟回复提名的具体原词，仍可能由真实模型识别。各环节的真实能力必须由新的独立评测确认。

## 已确认的实现遗漏

1. 常见的 `任职必备：`、`必须：`、`加分：` 以及 `Must test…` 被当成优先级不明确；其对应的列表标题也存在遗漏。
2. 原文中技能紧贴冒号时，Unicode 分词可能把标题与技能合成一词；会丢掉 `Required：React` 等实际存在的技能。完整事实引用唯一时，同一技能重复出现也不应被当成事实来源不唯一。
3. 明确的教程、导师、评审指导或概念阅读出现在句中、组织背景后或不同语序时，能力建议会被过窄的句首规则清空。应保留实际指导证据，同时继续排除他人操作、将来计划、引用示例和不属于该技能的水平描述。
4. 已识别出的要求矛盾没有同步清除必备／加分优先级；未解决的矛盾不应变成硬性规划约束。
5. `my available time is unknown` 等明示缺失，以及 `ADMIN OVERRIDE` 一类注入前缀需要按实际语义识别。
6. 旗舰课程已经有 `分布式追踪 → observability`，英文等价词 `distributed tracing` 却显示未覆盖。该修复仅适用于对应蓝图，并更新映射版本；其他岗位不会继承这份词表。

这些是代码应修复的问题，不能通过删掉样例或更改预期把它们掩盖。最终修复范围与验证结果见本报告的验证记录。

本轮保留有依据的指导、阅读和明确能力限制，并继续排除引用示例、他人操作、将来计划与被否定的指导关系。对同一技能同时标为必备和仅加分的来源，保留冲突提醒并将优先级置为待核对；不同公司、岗位或条件下的陈述不能拼成冲突。新增直接等价词包括增量加载、组件测试及 dashboard 的词形，课程映射版本更新为 `2026.11.4`。

原生运行时检查还发现 `urn:DuckDB` 在 Node 与 workerd 的 Unicode 分词结果不同。实现显式拒绝命名空间片段，并保留 `岗位摘要：SQL`、`Job summary: PhaseDock` 等已识别标题后的真实词。完整事实引用唯一时，词在该事实内重复出现可以保留；完整事实在原文重复造成来源不唯一时仍拒绝。

## 技能词逐项判断

下表覆盖基线中 34 个技能集合有差异的字段。E 表示实现或直接等价表达问题；M 表示需要在具体蓝图中审阅的分类关系；A 表示标注增加了原文没有说明的限定。同一行可能同时包含两种关系。

| 字段 | 原文依据 → 冻结标注 | 判断 |
| --- | --- | --- |
| resume-02-1 | 修复键盘焦点顺序 → accessibility | M：是一项可访问性实践，不是整个能力的同义词。 |
| resume-02-3 | 按钮状态、组件说明 → UI components | E，需上下文：此处有 UI 语境，不能把任意“组件”均译成 UI。 |
| resume-03-1 | 数据管道中设置 dbt 测试 → data testing | M：保留具体工具与任务，再按蓝图分类。 |
| resume-03-2 | 增量加载 → incremental loading | E：直接双语等价。 |
| resume-03-3 | 学习仓库模型 → data modeling | M：学习目标，不能作为已有建模能力。 |
| resume-04-1 | funnel dashboard → dashboards、analytics | E：dashboard 词形；M：漏斗仪表盘到分析领域。 |
| resume-06-1 | t-test、比较两个均值 → statistics | M：具体统计任务到上位课程类别。 |
| resume-06-3 | 想练习 experiment planning → experimentation | M：学习目标，不能变成已进行实验。 |
| resume-07-1 | 检查 API error logs → observability | M：具体日志任务到可观测性。 |
| resume-08-3 | dashboard storytelling → data storytelling | M：具体场景，dashboard 不与 data 全局等价。 |
| resume-09-1 | Figma 中的 UI tokens → design tokens | E，需设计语境；不能泛化到鉴权或模型 token。 |
| resume-09-3 | 阅读 analytics event naming 文档 → analytics instrumentation | M：事件命名与埋点有关，阅读不等于完成埋点。 |
| jd-01-2 | 漏斗分析 → analytics | M：具体技能到课程类别。 |
| jd-02-2 | 键盘可访问性检查 → accessibility | “可访问性”本身是 E；完整实践到总类别是 M，须保留键盘检查限定。 |
| jd-02-3 | 组件测试 → component testing | E：直接双语等价。 |
| jd-03-1 | 设计 SQL 数据模型 → data modeling | E，需动作＋数据对象；收到模型不等于亲自建模。 |
| jd-03-2 | 数据管道的自动化测试 → data testing | M：也可能涉及编排代码或集成测试，不能固定为唯一近义词。 |
| jd-04-1 | 定义产品指标、retention cohorts → analytics | M：任务到课程领域；原文 retention 可直接保留。 |
| jd-04-2 | 交流实验结果的不确定性 → experimentation | M：与实验、统计沟通均相关，需要蓝图上下文。 |
| jd-05-2 | 测试异步 TypeScript 行为 → unit testing | A：未说明是单元、集成还是端到端测试。 |
| jd-06-1 | model warehouse tables → data modeling | E，需数据表建模动作；不能类推到实体模型或预测模型。 |
| jd-06-2 | metric lineage → data lineage | M：指标血缘是具体对象，不能全局替换 metric/data。 |
| jd-08-1 | Required：React → React | E：冒号分词遗漏。 |
| jd-08-2 | accessible form labels → accessibility | M：表单标签实践到课程领域。 |
| jd-09-1 | API logs、记录 incidents → observability | M：也可能对应事件响应；保留原任务。 |
| jd-09-2 | Python 脚本测试与异常处理 → unit testing | A：没有 unit 限定，且异常处理主题未被该标注体现。 |
| jd-09-3 | have：distributed tracing → distributed tracing | E：冒号分词遗漏。 |
| resume-10-2 | 理解 JOIN 重复行 → SQL | M：在该文档 SQL 语境下映射，保持学习目标身份。 |
| resume-11-2 | 审阅清单、会议记录 → documentation | M：记录工作不证明实施了团队迁移。 |
| jd-10-1 | write tested SQL transformations → data testing | M：不能从 tested 补造具体测试层级或实施人。 |
| jd-11-1 | have：Kubernetes → Kubernetes | E：冒号分词；课程是否覆盖是另一个判断。 |
| jd-11-2 | Required：SQL analytics → SQL | E：冒号分词；analytics 本来就在原文中。 |
| supplement-02-2 | 解释 trace 与 log 的区别 → observability | M：概念实践到可观测性领域，不是整个领域的能力证明。 |
| supplement-06-1 | SQL 必备和 SQL 仅加分 → SQL | E：重复同词不使整句引用失效；优先级仍需保留冲突。 |

表中 `resume-02-1` 等为阅读简写，完整字段 ID 是 `resume-02-field-1`。M 类关系不能通过提取层全局换词解决；应保留具体原词、真实事实和技能范围，再在所选蓝图中映射。没有完整轨道或存在歧义时，仍需显示未覆盖或让用户选择。

## 需要单独审阅的标注与层次边界

**能力建议。** 产品允许 AI 给出待确认建议，也要求来源解释正确。`guided` 不能从普通“使用了 Python”“做了透视表”“与设计师协作”直接推出；团队完成迁移不能变成个人 `uncertain` 的自评证据。另一方面，明确的教程实践、导师指导、基础阅读等不应因语序不同而被程序抹掉。修复程序识别与审阅标注是两件独立的事。

**能力否定与不确定。** “我目前不能独立配置 Kubernetes”是明确的个人限制，不等于“不确定自己会不会”。应让用户核对这个限制，而不是为了匹配固定枚举而改写其含义；既有自评仍须独立采用，不能由事实确认直接覆盖。

**提醒集合。** 原标注有些只要求一条自评提醒，但新规则对每个有效水平建议都附带核对提醒；注入行同时含外部链接时，也可能合理产生两个不同提醒。下一版标注应逐条明确允许和要求的提醒与来源，既不能忽略遗漏，也不能允许任意额外警告。

**课程覆盖。** `jd-11` 的 Kubernetes 原文只说明岗位要求，未给出课程蓝图。提取阶段可保留该要求和不可信链接提醒，是否未覆盖必须以选中的蓝图与注册表确定。下一版验收应保留 `jd-11`，在“原文提取”和“固定蓝图映射”两个环节检查，不能删除这个边界或让模型凭空判断目录。原 Gate 的该项尚未变更。

该文档还有独立的分类差异：`jd-11-field-3` 描述 `Preferred course reference` 和不可信外链，旧标注是 `preferred`，当前规则保留为 `unspecified`。课程参考的推荐程度是否构成岗位加分要求必须分别判断；该项仍未满足原分类预期，不能仅用课程覆盖问题解释整份文档的失败。

**补充资料的建议。** 教练“建议优先练习”表示学习建议，并非公司 JD 的加分条件。当前模型结构将两类内容都放在 `requirement` 下；应先明确它在主 JD、补充建议和规划优先级中的语义，再确定标注，不能为了匹配 `preferred` 而混同来源权威。

**学习目标。** 原文中的“想学习仓库模型”等目前作为 `constraint` 保留，其主题不会被当作已有能力。是否另设学习意向、如何参与本轮任务排序，需要与既定目标和主 JD 规则一起核对；不得为了让技能映射命中而把它改成个人能力。

## 最终离线标注对照

30 份、84 个标注字段均进入对照，原 v1 控制组为 30/30。v2 的技能集合有 27 处差异，自评建议 10 处、要求优先级 2 处；另有 2 条预期提醒未匹配、10 条额外提醒。模拟输入中不存在类别差异或丢失事实；站点保留全部已经校验的词。这里预先提供了已知事实，不能据此推断模型召回率。

| 对照组 | 普通样例通过 | 边界样例通过 | 旧评分器严格字段匹配 |
| --- | --- | --- | --- |
| 原 B2 24 份 | 1/18 | 1/6 | 48/74 |
| 6 份补充资料 | 1/3 | 3/3 | 9/10 |

字段匹配并不包含整份资料的全部验收条件，不能用该数字替代逐文档通过。两组整体仍未通过原冻结标准；上述结果仅属于标注兼容性诊断，不计入真实 B2/P1 成绩。逐字段数据将在本轮验证记录中归档。

## 尚未关闭的语义工作

- `resume-12` 的“可独立完成报表”与“SQL 由导师提供、本人只改日期参数”尚缺可靠的跨句职责与自评冲突处理。应展示需要核对的具体范围，不能用共有 `SQL` 一词就判定任意两段经历冲突。该边界仍未达到原 Gate 预期。
- `resume-09-field-2` 的同伴帮助针对交互测试，不能无条件用于 React 实现能力。需要把辅助范围和技能范围对应起来。
- `UI components`、设计语境下的 `UI tokens`、明确的数据建模动作等上下文等价项尚未全部实现；本轮只补了无歧义的直接译词与词形。不能将这些剩余项一概归因于标注。
- 具体实践到较宽课程能力的映射、学习意向与教练建议的规划作用仍需按既定蓝图和来源优先级完善。原词被保留并不等于它已正确影响计划。

以上工作与真实模型验证均未被本轮回归通过代替。本候选还不是可直接公开发布的完成版本。

## 验证记录

本批源码提交为 `7297dcce6bf64150eb99c97c0bc58c9c7c6cf315`，在分支 `codex/materials-replan-recovery-20261106` 本地保存。本次未推送、部署或执行远程迁移。985 个非文档文件在工作树与独立干净副本逐字节一致，清单摘要为 `c3bfa5aa7455533cf34f41c0b3c635b5ffb1894677af773f127fe087904d72a6`。

| 检查 | 最终结果与范围 |
| --- | --- |
| 全仓 Vitest | 364 个文件、8,339 项分组通过：2 个敏感套件 50/50，2 个原生 Research 套件独占串行 99/99，其余 360 个文件以 4 个 worker 运行，8,190/8,190。没有跳过用例。 |
| 附加 Node 检查 | 9 个文件串行执行，290/290，无失败、取消或跳过。 |
| 类型与 Lint | 干净副本 `tsc --noEmit` 退出码 0；ESLint 0 错误，4 条既有 Research 测试警告。 |
| 构建与页面 | 以本机验收配置完成标准 Vinext 构建，随后页面渲染检查 5/5。 |
| 原生运行时 | Node 与本机 workerd 的 28 个案例一致，Worker 出站请求 0。 |
| 独立复审 | 最终相关套件 657/657；另检查 30 个词法边界案例和 32 个提示边界案例。采集器测试改动另经静态复审，无阻断意见。 |
| 期限与回执专项 | 96/96，包含确定性的过期回复、原文保留、提取拒绝、预留冻结和禁止重发检查。此项与全仓有重叠，不额外累加总数。 |

**测试夹具的超时问题。** 最初一次采集器运行明确返回 `timeout`；另一条归档篡改测试未检查采集是否成功，因此旧日志不能证明其失败与超时同因。现已在篡改前断言六份采集完成、预留为零，并断言确实修改一行，再保留原有拒绝回放检查。隔离执行后，另一个磁盘回调仍出现失败，不能靠反复重跑解决。仅该离线集成夹具的 HTTP 预算从 1 秒调整为 5 秒，并新增推进时钟越过期限的确定性用例；生产配置和期限、费用及来源校验均未放宽。

新增期限用例最初误以为过期回复不会保存原文；核对既有 `freezeChat` 路径后，修正为“原始回复精确保留、解码结果不被采用、费用继续冻结、不能再发或回放”。这是修正测试对既有证据保留行为的理解，没有修改生产行为来满足错误断言。

**Research 并行稳定性仍需追踪。** 首次全仓并行运行中，两个既有 Research 套件分别遇到 Miniflare 同步代理的本地 HTTP 连接被对端关闭，以及桥接 `temporary` 错误。前者在签名接收流程成功后发生，缺少后续请求级 trace，日志没有对应 workerd 退出证据，根因尚未证实。并行运行是已知条件，不能据此断定是负载造成。两套件的生产代码和夹具没有修改；相同冻结源码独占复核 99/99 通过，再执行互补的全部 360 个文件通过。这证明上述分组调度下的验证结果，不能宣称默认并行稳定性已修复。

首次失败、修复前红例，以及因标题修正而停止的旧候选运行均保留摘要，没有把中断运行记为通过。相关日志的 SHA-256、退出码、完整文件清单与分组方式见[机器验证记录](materials-quality-contract/candidate-verification.json)。同时归档[源码清单](materials-quality-contract/source-manifest.json)、[逐字段对照](materials-quality-contract/field-audit.json)和[原生运行时对照](materials-quality-contract/native-runtime.json)。三个原冻结文件的 SHA-256 保持不变。

最终 Vitest 分组命令如下；Node、类型、Lint、构建和页面命令与[前一批报告](2026-11-07-materials-grounded-repair.md)相同。验证采用隔离临时目录、凭据剥离和出站拦截；构建使用 `tests/fixtures/build/materials-acceptance.json`，不连接远端资源。

```text
node node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/server/document-diagnostic-pilot-host.test.ts tests/server/materials-supplement-collection.test.ts
node node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/server/research-cloud-smoke-composition.test.ts tests/server/research-executor-private-integration.test.ts
node node_modules/vitest/vitest.mjs run --maxWorkers=4 --exclude tests/server/document-diagnostic-pilot-host.test.ts --exclude tests/server/materials-supplement-collection.test.ts --exclude tests/server/research-cloud-smoke-composition.test.ts --exclude tests/server/research-executor-private-integration.test.ts
node --import tsx docs/verification/materials-quality-contract/audit.mjs
node --import tsx docs/verification/materials-gate-1b-b2/grounded-terms/worker-check.mjs
```

本轮新增真实模型推理、模型费用、部署与远程迁移均为 0。历史累计 30 次推理、0.547151 USD，未决费用为零。旧 B1/B2/P1 授权均不能用于下一轮调用。

## 下一轮验收建议（尚未生效）

1. 保留全部 24＋6 份文档、原文、来源及旧评分结果。新建独立版本的标注差异表，逐条说明 E/M/A 的处理，不重写历史成绩。
2. 按“原文事实／具体技能词／能力建议／优先级／提醒／蓝图映射”分别冻结预期；最终仍执行逐文档和全体普通／边界门槛，分项统计不能替代总门槛。
3. 原词允许规范化的范围在评测前冻结，并使用未见技能名、同形词、否定、他人职责、不同蓝图等对照。不能让实现运行时读取标注，也不能以“所有提示都清空”满足质量标准。
4. 对课程分类关系固定真实可执行蓝图和版本，检验原词经确认后是否影响正确技能，目录外、非学习型限制、已移除词与已完成任务继续保护。
5. 形成可复核的新候选、合成输入清单、评分器和差异说明后，才准备新的真实评测授权。刷新端点、账户与价格证据；旧 B1/B2/P1 额度和授权不可复用。

本轮限定离线工作。公开发布仍需真实质量通过，以及 B3/B4 隔离环境与实际页面验收、B5 发布与发布后验证。没有新增模型、部署或远程迁移授权。
