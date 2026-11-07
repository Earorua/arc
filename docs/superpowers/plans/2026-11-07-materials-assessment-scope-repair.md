# 多类型资料：能力范围与独立质量契约离线修复

> **For agentic workers:** Use `superpowers:subagent-driven-development` for implementation and independent specification/code review. Follow `systematic-debugging` and `test-driven-development`; all execution in this plan is offline.

**Goal:** 修正协助、自评及职责待确认的作用范围，保留可核对事实，并为下一轮验收准备独立版本的逐字段契约。

**Architecture:** 继续使用现有单事实、单引用和可选水平提示契约。明确协助不能从另一项任务借给当前技能；显式能力和缺失职责使用现有核对提醒。提取、所选课程映射和用户采用分层验收，旧语料、评分器及历史成绩保持不变。

**Tech Stack:** TypeScript、Zod、Vitest、Node、Miniflare/workerd；本机隔离验证与出站拦截。

## 已核对的依据

- v2.1 §6.2：原文能定位不等于解释正确；高影响解释须用户核对。
- §6.3：工具线索不能直接赋予独立能力；模糊熟悉程度应保留措辞并结合任务提问。
- §6.4：conceptual/guided/uncertain 只是可选建议，事实确认与自评采用分离；不能自动输出 independent/verified。
- 暂停点源码 `c7c55ea`、文档 `38c5fde` 的完整验证已保存，不覆盖旧报告。

只读复现确认：`我用 React 实现了原型，交互测试由结对伙伴协助。` 的尾句被 `guidedSkillScope` 错当成前句 React 的指导证据。同义英语原句恰好没有命中，不构成语义问题已解决的证据。`本人是否编写查询待确认。` 不被缺失信息规则识别；原 resume-12 的 missing-information 来自同句工作时间缺失，掩盖了职责遗漏。

## 1. 修复范围及提醒

Files:
- Modify: `worker/document-executor/source-review-evidence.ts`
- Test: `tests/server/document-source-review-evidence.test.ts`
- Test: `tests/server/document-source-span-provider.test.ts`（或独立同层集成测试）

- [x] 先添加失败用例：尾随的交互测试协助不能赋予 React guided；另一人的工具与任务不能赋予本人水平；显式“本人是否编写查询待确认”产生来源准确的 missing-information。
- [x] 保留正例：明确自己在指导下实施同一任务仍可保留 guided，明确熟悉某技能仍可保留 conceptual。
- [x] 针对 resume-12 保留“能完成报表”和“查询由导师提供、只改日期”两段事实；能力主张引导单独核对，显式职责缺失引导补充。两句话可以同时成立，不因共有 SQL 一词生成冲突或 uncertain。
- [x] 对具有人称/个人简介范围的显式能力陈述使用 confirm-self-assessment；另一人物、团队、招聘要求、示例引用、假设、否定和未来意向不能成为个人水平依据。普通经历不一律加提醒。
- [x] 对合法学习 constraint 中明确第一人称“尚未实践＋肯定练习意愿”保留核对，不赋 hint、不改自评；不要将 hint 的类别限制扩大到这一类已有核对语义。一般岗位要求、constraint familiarity 和时间地点仍不生成个人能力核对。
- [x] 必要时只剥离明确个人简介等结构标题以识别正文；保留整个原文引用，不剥离另一个人的归属或自由叙述。
- [x] 分句保留整句示例、假设、否定和转述主体，不能因逗号产生脱离限定的个人声明。覆盖英语无 and 的明确双任务、个人标题中的省略人称能力声明以及 independently 在动词前后的限制表达。
- [x] 每条事实仍只有一个可选 hint；当不同词或同词的不同任务受不同限定时，不把局部水平扩展到整条。明确的个人局部指导/阅读仍应有核对提醒，即使整条 hint 为空。提醒保留完整句子，让用户查看具体任务。无需增加数据库或 wire schema。
- [x] 若既有新测试把另一任务协助错误归给前缀技能，记录原因后修正该测试，并补真正同任务指导的保护用例。冻结原 gold 和评分器不得修改。
- [x] 验证 v2 解码→站点草稿保留准确原文、词、提醒与空/有效提示；v1 历史路径不变。核对事实不自动写入能力自评。

Run: `node work/grounded-verification/run.mjs assessment-scope-red node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/server/document-source-review-evidence.test.ts`

修复后使用新的唯一标签保存绿例和集成运行，不能覆盖红例。

## 2. 独立版本质量契约

Files:
- Create: `docs/superpowers/specs/2026-11-07-materials-quality-contract-v2.md`
- Create: 独立目录下的逐字段期望与机器校验；不得写入旧语料或覆盖历史回放产物。

- [x] 覆盖原 24 份 B2 和 6 份补充资料的全部 84 个字段，保留 legacy 字段 ID、原文来源与旧期望，逐项给出新期望和理由。
- [x] 区分原文提取、具体技能范围、课程映射、主 JD 来源权威、用户采用和计划结果。不能把课程 ID 当原文词，也不能让非 JD 教练建议自动变成岗位 preferred。
- [x] 对 jd-11 保留 Kubernetes 要求及不可信外链；是否课程未覆盖由固定蓝图/注册表检验。“Preferred course reference”作为资源引用处理，不伪装成公司加分条件。
- [x] 评分保持逐文档召回至少 90%、适用 JD 分类至少 90%、来源合法率 100%；精确检查必需/禁止的提醒、提示和映射，不通过全清空、跳过边界或动态学习输出放宽要求。
- [x] 使用独立版本与哈希；新契约冻结前做规格复审和评分器正反例。离线从标注构造的输入只能证明契约和软件行为，不能证明真实模型召回。
- [x] 新契约作为下一轮审阅候选，不自动替换原 Gate，不追溯改写真实 R2/P1 失败结果，也不签发真实模型授权。

## 3. 冻结、复核与交付

- [x] 先做独立规格审查，再做实现质量审查；修复发现的具体问题并重验相应路径。
- [x] 新增涉及的 Node/workerd 等价检查；外部请求计数为零。
- [x] 源码冻结后运行全仓分组 Vitest、附加 Node、标准类型/Lint/构建/页面检查。继续独立串行运行已知原生 Research 套件，并明确默认并行稳定性未获证明。
- [x] 保存新报告、源码清单和恢复入口；原语料与评分器 SHA 必须仍匹配原值。

第 1 节和本节对应产品源码 `67a1af32f7e680d9995552e1d9703c8597420eed`，完整验收见 `docs/verification/2026-11-07-materials-assessment-scope-repair.md`。全仓 369 文件/8,645 项、附加 Node 290 项及原生 39 项通过。首次干净副本 Research 的 77 项失败已确定为依赖目录链接越过来源边界；原工作树同源码 99/99 通过，未改校验或断言。

第 2 节的离线候选已完成：原文标注 SHA `e512e3fca67fd9133cae4e9186cb054c3044d79b090d567daaba24cb85bd9ef9` 保持不变；独立课程覆盖 30 文档、84＋2 字段、256 条关系，评分器区分原文、课程、采用/计划三轴并固定 14 个计划场景。课程 53/53、评分器 111/111、源结构坏例 26/26、独立规格 18 组及质量 7 组通过。课程与评分器本机提交分别为 `198dbfc`、`5d9fa48`。完整验收见 `docs/verification/2026-11-07-materials-course-candidate-evaluator.md`，冻结凭据见 `docs/verification/materials-quality-v2/candidate-review-verification.json`。新候选不替换原 Gate，实际产品观测采集与真实模型质量尚待验证。

本轮模型调用、费用、部署、远程迁移均为零。公开发布目标仍需新的真实质量验证和后续环境/发布验收；旧 B1/B2/P1 授权不能复用。
