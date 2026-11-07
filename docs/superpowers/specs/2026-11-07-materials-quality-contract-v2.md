# 多类型资料质量验收契约 v2：独立审阅候选

状态：`proposal`，编号 `materials-quality-v2-20261107-draft-1`。本文件不是新 Gate 批准，没有真实模型成绩；原 Gate 和 R2/P1 失败记录继续有效。范围为原 24 份 B2＋6 份补充合成资料，不新增真实用户资料。

## 1. 不变的历史与验收门槛

| 冻结输入 | SHA-256 |
| --- | --- |
| `tests/fixtures/documents/quality-corpus.json` | `69e5ddd1005f12abf24483e10dd235629ef309ba3a84e922166963ccd9aed750` |
| `tests/fixtures/documents/supplement-quality-corpus.json` | `9775b595f4b44563beb9e3b7f9249b171e731658b454e0f26279d2b46db213d7` |
| `tests/helpers/document-quality-evaluation.ts` | `6297b7bdd112833cbd8a58b3bd63f6cbaf46d86b77cbab760744fe66babec351` |

保留全部 84 个旧字段及其原始期望。独立契约另行记录更正和依据，不编辑以上文件。旧评分器可以继续输出兼容性诊断，不能将其失败改名为通过，也不能把离线构造候选当成真实模型召回。

每份资料的关键项召回至少 **90%**、适用岗位要求分类至少 **90%**、来源合法率 **100%**。18 份普通＋6 份边界全部逐份报告；补充资料的 3 份普通＋3 份边界单独报告。任何高影响归属、否定、来源或未决冲突错误均不得靠平均值抵消。

依据为已批准 v2.1 的 §6.2–6.4、§7.1、§8：来源定位不保证解释正确；建议与自评采用分离；课程映射依当前蓝图；用户显式采用的补充建议才影响已有计划。

## 2. 分层记录与独立评分

1. **原文事实。** 保留人物、动作、对象、肯定/否定、时间、条件、责任与任务范围；每条原文完整引用只出现一次。原文事实召回不能要求课程上位标签已经存在。
2. **原词。** 独立标注有意义的工具/技能/学习主题及允许的直接词形或译词。不能以当前 grounding 输出生成标准答案；不凭 `unit` 不存在的文本补出“单元测试”。
3. **建议与提醒。** 一条事实一个可选 hint；只有所有相关词和任务都得到同一水平证据支持时才适用于整条。局部明确指导/阅读仍可核对，不能扩展为整项技能的能力。必须逐来源列出 required、allowed-optional、forbidden 提醒。
4. **课程对应。** 固定完整 `ai-native-full-stack-engineer@2026.08.1` 与 `ai-native-full-stack-engineer-units@2026.08.1`，另冻结对象摘要。逐词检查课程 ID、mapped/ambiguous/uncovered/non-learning 状态及 literal/contextual/manual 依据；不会将“对应课程”解释为已经具备整项能力。
5. **采用与计划。** 事实确认、自评采用、学习重点采用分别检查。非主 JD 建议不能自动提升主 JD 的 mandatory；不能改变已完成任务、工时、任务内容、依赖、Proof 或现有自评。

判定轴分别报告，最后取共同通过：来源正确不能补偿错误含义，课程正确不能补偿原文遗漏。字段匹配一对一，重复候选、无关新增事实、未允许的提醒不能获得额外分数。

旧 36 条 requirement 包含 34 条 must/preferred。新契约拟将课程引用 `jd-11-field-3` 与教练建议 `supplement-01-field-2` 从岗位分类分母移出：原 JD 有 31 条明确分类，次要岗位有 1 条，分别报告；另外 2 个未决冲突保持 unspecified，不能被自动裁定。该分母变动必须随新契约单独审阅，不追溯改变旧结果。

不新增生产 wire kind。资源引用和教练建议可继续使用现有 requirement＋unspecified，独立验收元数据记录 `resource-reference`、`learning-advice` 等来源角色。

## 3. 全部旧字段的审阅账目

下表保留每个 legacy ID。课程列是待独立课程审阅的关系，不是从当前程序输出回填的新 gold。L＝拟采用的直接名称/别名关系，最终须独立冻结别名依据；C＝须有语境与课程内容依据，U＝目录无完整对应或证据不足，N＝非学习型内容。名称能对应某技能不证明其每项任务已有课程。部分课程对应不抹掉剩余范围。

| legacyFieldId | 必须保留的事实、范围或更正 | 旗舰课程关系候选 |
| --- | --- | --- |
| resume-01-field-1 | 按导师示例编写 SQL 汇总查询；指导限该实践 | SQL L→sql |
| resume-01-field-2 | Python、清洗空值、清洗规则测试；普通使用不推出 guided | Python/清洗 U；测试 C→testing |
| resume-01-field-3 | 每周四小时及数据分析基础学习意向；旧空标签不抹掉目标 | 时间 N；分析主题 U |
| resume-02-field-1 | React 表单维护、按评审反馈修复焦点；局部指导不覆盖全部 React | React L→react；焦点 C→design-systems |
| resume-02-field-2 | WCAG 标签阅读、未独立审计；概念范围限阅读 | 表单标签 C→web-platform / design-systems，可显式多候选；不声称完整 WCAG 审计覆盖 |
| resume-02-field-3 | 与设计师协作、按钮状态、组件说明；协作不等于指导 | 仅明确 UI 语境 C→design-systems |
| resume-03-field-1 | dbt 测试、数据管道演练、同事指导 | dbt U；测试 C→testing |
| resume-03-field-2 | 增量加载概念、未负责生产部署 | 增量加载 U；否定职责保留。课程虽有部署内容，此句不自动生成部署实践或学习重点 |
| resume-03-field-3 | 本季度学习仓库模型、不准备管理岗位 | 主题 U；非已有能力 |
| resume-04-field-1 | 漏斗 dashboard 原型、受监督实习 | U；guided 限原型实践 |
| resume-04-field-2 | SQL joins 对账、依据评审意见 | SQL L→sql |
| resume-04-field-3 | 周二、周四晚上可学习 | N |
| resume-05-field-1 | CSS grid 及资深开发者评审；限定布局任务 | CSS 名称关系待冻结；现有 web-platform 单元没有 grid 练习，此任务范围 U |
| resume-05-field-2 | TypeScript 日期格式化器 unit tests、提供的示例 | TypeScript L→typescript；unit tests L→testing |
| resume-05-field-3 | 作品集缺端到端部署练习；不是已部署经历 | 软件部署语境 C→cloud-delivery，需单独采用 |
| resume-06-field-1 | 教程 t-test、比较两个均值；不改写成泛称 statistics | U |
| resume-06-field-2 | 课堂讲解 sampling bias；只限概念表达 | U |
| resume-06-field-3 | 未设计真实实验、想练 experiment planning | U；否定和目标同时保留 |
| resume-07-field-1 | 按 runbook 检查 API error logs | 日志 C→observability |
| resume-07-field-2 | Python log parser；导师帮助边界情况不覆盖整个 Python 实现 | Python/parser 实现 U；日志处理的受限 observability 关系另审阅 |
| resume-07-field-3 | distributed tracing 仅阅读 | L→observability；保留阅读范围 |
| resume-08-field-1 | spreadsheet pivot tables 汇总虚构订单；无指导证据 | U |
| resume-08-field-2 | 同伴 review 下改 SQL CTE | SQL L→sql |
| resume-08-field-3 | dashboard storytelling 学习意向、仅周末 | 主题 U；时间 N |
| resume-09-field-1 | Figma、UI tokens、练习项目；无指导证据 | Figma U；UI tokens C→design-systems |
| resume-09-field-2 | 本人实现 React 原型、伙伴协助交互测试；不赋 React 实现 guided | React L→react；交互测试关系单独核对 |
| resume-09-field-3 | analytics event naming 文档阅读、尚未埋点 | U；不补已实施埋点能力 |
| resume-10-field-1 | 跟随教程编写 SQL；注入文本不是操作指令 | SQL L→sql |
| resume-10-field-2 | 理解 JOIN 重复行的学习目标 | 明确 SQL 语境 C→sql，采用前无重点效果 |
| resume-11-field-1 | 六人团队 Kubernetes 迁移、减少停机 40%；团队成果 | Kubernetes U；不自动 uncertain |
| resume-11-field-2 | 本人仅审阅迁移清单并做会议记录，两个动作分别保留 | 迁移清单 C→cloud-delivery；会议记录范围另保留，不泛化成集群实施或 guided |
| resume-11-field-3 | 目前不能独立配置集群；明确限制不是“不确定” | Kubernetes U；单独能力核对 |
| resume-12-field-1 | 熟悉 SQL、可独立完成报表；核对任务范围 | SQL L→sql；不赋 independent/uncertain |
| resume-12-field-2 | 导师提供全部 SQL、本人只改日期参数 | SQL L→sql；不推断完全不会或指导编写 |
| resume-12-field-3 | 工作时间未填、是否本人编写查询待确认 | N；显式缺失提醒 |
| jd-01-field-1 | must：SQL 联表、指标口径检查 | SQL L→sql；保留指标范围 |
| jd-01-field-2 | must：解释漏斗结果和业务限制 | U |
| jd-01-field-3 | preferred：Python 自动化检查 | Python U |
| jd-02-field-1 | must：TypeScript 界面逻辑 | L→typescript |
| jd-02-field-2 | must：键盘可访问性基本检查 | C→design-systems，保留基本检查范围 |
| jd-02-field-3 | preferred：React 组件测试 | React L→react；测试 C→testing |
| jd-02-field-4 | 每周两天指定办公室 | N |
| jd-03-field-1 | must：设计 SQL 数据模型，保留动作及对象 | SQL L→sql；数据模型 C→sql |
| jd-03-field-2 | must：维护数据管道自动化测试 | 自动化测试 L→testing；管道限定保留 |
| jd-03-field-3 | preferred：dbt 增量模型 | U |
| jd-03-field-4 | 不要求管理团队 | N；否定保留 |
| jd-04-field-1 | must：定义产品指标、调查 retention cohorts | 指标定义 C→product-thinking；retention cohorts U，两个任务不合并成泛称 |
| jd-04-field-2 | must：交流实验结果不确定性 | U；不补设计/运行实验要求 |
| jd-04-field-3 | preferred：可视化工具 dashboards | U |
| jd-05-field-1 | must：semantic HTML forms | HTML L→web-platform |
| jd-05-field-2 | must：test asynchronous TypeScript behavior | TypeScript L→typescript；测试 C→testing；不补 unit |
| jd-05-field-3 | preferred：CSS animation | CSS 名称关系待冻结；现有 web-platform 单元没有 animation 练习，此任务范围 U |
| jd-05-field-4 | 虚构 UTC+2 范围远程 | N |
| jd-06-field-1 | must：用 SQL 建模 warehouse tables | SQL L→sql；关系部分 C→sql，仓库范围保留 |
| jd-06-field-2 | must：metric lineage、ownership 文档 | U；不把 metric 全局替换为 data |
| jd-06-field-3 | preferred：Python 质量监控脚本 | Python U |
| jd-06-field-4 | 无 on-call 工作 | N；否定保留 |
| jd-07-field-1 | must：SQL 窗口计算 | SQL L→sql |
| jd-07-field-2 | must：analytics 解释收入波动 | U；analytics 确在原文 |
| jd-07-field-3 | preferred：spreadsheet 核对表 | U |
| jd-08-field-1 | must：React 组件状态设计，冒号不吞词 | React L→react；不因“状态”二字额外要求 design-systems |
| jd-08-field-2 | must：accessible form labels | C→web-platform / design-systems，可显式多候选 |
| jd-08-field-3 | preferred：Figma design tokens 协作 | Figma U；design tokens C→design-systems |
| jd-08-field-4 | 项目十二周、每周十小时 | N；不自动改用户学习预算 |
| jd-09-field-1 | must：interpret API logs、document incidents | 日志 C→observability；事件记录职责保留 |
| jd-09-field-2 | must：Python 脚本测试、异常处理 | Python U；测试 C→testing；不补 unit |
| jd-09-field-3 | preferred：distributed tracing 阅读经验 | L→observability；不变为生产职责 |
| jd-10-field-1 | must：write tested SQL transformations | SQL L→sql；tested 不等于本人写自动化测试 |
| jd-10-field-2 | preferred：dashboards 交流结果 | U |
| jd-11-field-1 | must：Kubernetes cluster operations | 提取保留，映射阶段 U |
| jd-11-field-2 | must：SQL analytics，两词均保留 | SQL L→sql；analytics U |
| jd-11-field-3 | 推荐课程链接、明确不受信；resource-reference、unspecified | N；惰性链接不进入注册表 |
| jd-12-field-1 | 摘要 must、清单 preferred 两来源及未明优先关系 | SQL L→sql；未决前 unspecified |
| jd-12-field-2 | 远程地点、薪酬、经验年限缺失 | N；不能补默认值 |
| supplement-01-field-1 | 模拟面试 SQL 空值边界遗漏 | SQL L→sql；不代表整个面试失败 |
| supplement-01-field-2 | 教练建议优先练 SQL 空值；learning-advice、unspecified | SQL L→sql；显式采用后才软优先 |
| supplement-02-field-1 | 导师帮助下 OpenTelemetry 追踪一次失败请求 | L→observability；guided 限该任务 |
| supplement-02-field-2 | 能解释 trace 与 log 区别；仅概念范围 | C→observability；课程包含 signals 选择，不能推成完整运维能力 |
| supplement-03-field-1 | 未来两周、每周最多 90 分钟 | N；不得永久套用上限 |
| supplement-03-field-2 | 两周以后时间未知 | N；missing-information |
| supplement-04-field-1 | 团队完成 Kubernetes 迁移 | U；team-attribution |
| supplement-04-field-2 | 本人仅记录回滚步骤、未操作集群 | 回滚步骤 C→cloud-delivery；仅记录，不得补个人集群操作 |
| supplement-06-field-1 | 次要岗位内部 SQL 必备/仅加分矛盾 | SQL L→sql；unspecified、不覆盖主 JD |
| supplement-06-field-2 | 次要岗位 TypeScript preferred | L→typescript；保留次要来源权威 |

`supplement-05` 没有旧 goldField，仍是必须验收的第 30 份资料：空候选可以正确，但注入与不可信链接提醒必须保留，外链访问次数为零。

84 个旧锚点不是全部原子事实的穷尽清单。另列增补事实/关系，至少包含 `resume-01-field-3` 中的学习主题、`jd-12` 只有 review 来源的第二条相反要求。新增分母单独报告，不通过拆出容易项稀释旧困难项。

课程内容审阅依据：`flagship-unit-registry.ts` 的 web-platform 表单/键盘检查（11–49）、React 状态与行为验证（105–145）、design-systems 的语义及交互状态（174–181）、cloud-delivery 迁移/回滚清单（487–525）、observability signals 选择（561–569）、product-thinking measures/guardrails（675–709）。这些是本草案的可复核内容位置，冻结时还须记录文件摘要。HTML、CSS、unit tests、distributed tracing、OpenTelemetry 等别名的 L 依据不能仅由这三份课程数据文件推定，应另行独立审阅、冻结，必要时按 C 判定。

## 4. 明确的提醒变更

- resume-09：不保留旧 gold 对 React 的整条 guided 推断；帮助范围依具体任务，引用完整保留。
- resume-12：使用现有 confirm-self-assessment 核对能力主张，missing-information 标记显式职责待确认。保留两段事实；“完成报表”与“复用导师查询”能同时成立，不预设 conflicting-self-assessment。真正明确的自评矛盾仍用已有冲突 code。
- resume-11、supplement-04：团队归属独立核对；明确个人限制不能改写成 uncertain。
- jd-11：Kubernetes 是否未覆盖由固定课程映射判断；提取层不凭空生成 uncovered-skill。资源推荐不是岗位 preferred，不可信链接提醒保留。
- supplement-01：教练建议保留学习意向，不能自动冒充主 JD 的 preferred/must。
- jd-12、supplement-06：冲突双方或同句内部冲突都保留来源，未决时不形成硬要求。
- 注入与外链可以是同一来源上的两个不同风险，冻结每个必需 code＋来源；不能一条警告代替另一条，也不能任意追加。

## 5. 冻结前必须补齐的验收资产

本草案尚未完成机器评分冻结，不能作为付费运行准入材料使用。

- 将上表转为独立机器可读标注：逐字段原词/允许词形、整条 hint 的允许值、局部范围、精确 required/optional/forbidden 提醒、课程关系和采用条件。原文引用及旧值从冻结文件按 ID 核对，不能从候选输出生成。
- 第一位独立审阅者只看原文＋v2.1 核对事实/范围/来源权威；第二位只看固定完整蓝图/注册表核对课程关系。两轮冻结之后再观察候选输出。
- 独立评分器不能调用被测 grounding/mapping 来生成真值；来源定位需有独立校验。保留版本/唯一引用/一对一匹配和 JSON 上限检查。
- 故障注入必须能检测漏否定、换归属/来源、删词、重复事实、建议升为 must、删/乱加提醒、非法课程 ID、未采用目标影响排序；有效指导/阅读正例仍通过。
- 额外对照包括提供成品 SQL/指导本人编写、同词不同任务、不同项目和年份、UI/OAuth/LLM tokens、关系/财务建模、API/纸质日志、单元/集成/端到端测试、不同蓝图与残缺注册表、逐词排除、采用/撤回/删除/预览竞争。
- 新版本、输入列表、评分器、提示词、蓝图、注册表和构建产物全部记录 SHA。仅在冻结后准备新的模型轮次，重新核验账户、路由、价格并取得明确预算/缓存授权。

原累计 30 次真实推理、0.547151 USD 的历史记录不因本草案变化；本轮新增真实调用、费用、部署和远程迁移均为零。
