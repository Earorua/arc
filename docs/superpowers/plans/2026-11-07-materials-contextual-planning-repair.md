# 多类型资料：上下文映射和学习重点离线修复

> 基于已批准的 v2.1 设计 §7.1、§8.3、§15.4，修复既定能力的缺口。使用 writing-plans 和 subagent-driven-development 组织实现和独立复核。无需扩大真实调用或发布授权。

## 目标与边界

用户确认的原文技能词可以对应所选课程；一条事实内修正一个对应关系不会丢掉其他词。教练建议、学习目标等事实经单独勾选后，可以作为本轮学习重点，提高已有任务的安排优先级。事实确认、学习重点采用、能力自评仍是三个独立动作。

本轮只做离线开发和验证。模型、费用、部署、远程迁移均为零。原语料、原评分器、90%/90%/100% 门槛以及真实 R2/P1 失败结果保持历史原貌。新代码通过本地测试不等于模型通过 Gate。

## 设计决定

1. **上下文映射位于课程映射层。** 保留抽取原文词；不把 `UI tokens` 改写为经历中的 `design-systems`。精确名称/版本化别名优先，其后使用所选旗舰蓝图与注册表明确支持的上下文规则。研究蓝图不继承旗舰规则。无证据的泛化词仍未覆盖或待核对。
2. **选择按已保留的词保存。** 增加 `termMappings: { confirmationId, itemId, skillLabel, skillIds }[]`；空 `skillIds` 表示明确不用于本轮映射。旧 `skillMappings` 继续兼容只含文本的历史/人工事实，同一事实不能混用两类覆盖。新增映射只接受确认事实中仍保留的词、所选确认版本和当前蓝图 ID。
3. **学习重点需显式采用。** 增加 `learningIntents: { confirmationId, itemId }[]`。仅非主 JD 的 `constraint` 或 `requirement` 可采用。未采用的约束不参与学习排序，非主 JD 建议不被当成岗位必备/加分。混合时间和主题的事实只采用映射主题，不修改日程预算。
4. **优先级保持可解释。** 主 JD 的明确必备/加分优先级不会被新增学习重点覆盖；没有该类主 JD 分类时，采用的重点使用现有练习层 tier 3。既有经历优先规则保留。重点不进入 mandatory，不修改能力自评、Proof、任务集合、已完成任务、依赖或每日工时。
5. **预览给出逐词结果和真实依据。** 新预览包含 `mappingDetails`（已保留词的索引、状态、课程 ID、literal/contextual/manual 依据），等价结果按索引分组以保留原 JSON 字节限制；界面按对应原词显示。事实引用标记是否可选为学习重点。tier 3 分别标注经历和学习重点来源，不能把教练建议解释成已确认经历。未采用的建议、主动不映射的词和未覆盖内容均可见。
6. **版本和恢复。** mapping 版本升至 `2026.11.5`，规划策略升至 `2026.11.2`，解释版本升至 `2026.11.3`。选择排序不影响指纹，空数组与缺省等价；实质选择、原文确认版本、课程版本均参与指纹。历史预览从保存快照读取，不重新映射。修改选择立即使旧预览引用失效；私有选择不写入浏览器持久 setup refs。

不采用全局同义词扩张（会跨岗位误推课程），也不新增一次模型规划请求（既定阶段采用确定性排序）。跨句能力的任务范围判断仍需独立质量契约；不能仅因两句都提到 SQL 就制造矛盾。

## 实施顺序

### 1. 词级映射（独立实现）

- 修改 `app/lib/materials/skill-mapper.ts`，新增 `contextual-skill-mapping.ts`；补充 `tests/lib/materials/skill-mapper.test.ts` / 独立上下文测试。
- 先写失败用例：Figma/UI token → design-systems；关系表建模 → sql；运行日志/追踪 → observability；上下文不足、财务建模、OAuth token、普通组件、研究蓝图不误映射。
- 提供逐词解析 API，保留现有聚合 API；选定一个词不影响其余词；空保留列表不回扫原文；空人工选择表示 omitted。
- 仅完整且 ready 的指定蓝图/注册表版本启用规则；别名旧版本继续兼容。原始文本不变。
- 离线专项：`node work/grounded-verification/run.mjs contextual-mapper node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/lib/materials/skill-mapper.test.ts tests/lib/materials/contextual-skill-mapping.test.ts`。

### 2. 契约与计划服务

- 修改 `app/contracts/material-planning.ts`、`app/server/documents/context-builder.ts`、`app/lib/materials/planning-priority.ts`、`app/lib/materials/explanations.ts`。
- 在 `tests/contracts/material-planning.test.ts`、`tests/server/material-mappings.test.ts`、新的 `tests/server/material-learning-intents.test.ts` 和优先级测试先覆盖失败路径。
- 严格限制数组与 JSON 字节数、重复引用、已删除词、未知课程、未选确认版本、跨用户引用、混用覆盖。所有选择进入不可变快照及指纹。
- 约束只有单独采用后才允许映射；建议未采用时输出未应用原因。mappingDetails 与 issue 按既有有界约束聚合。
- 主 JD 分类优先；重点作为软优先级，单独解释来源；保存/读回/生成/重排采用现有事务防护。
- 测试不同选择产生不同指纹，排列/空数组不改变指纹；历史预览原样读回；不修改能力和完成状态。

### 3. 用户核对流程

- 修改 `app/components/materials/material-context-review.tsx` 和 `material-confirmation.tsx`；补充组件测试。
- 非 JD 建议不再要求选必备/加分。高影响提醒继续逐项核对。
- 逐词展示自动映射、所依据的课程、未覆盖/歧义和显式不采用；保留旧无词事实的整条手动选择。
- 非 JD 建议/学习意向提供“作为本轮学习重点”勾选；选择变更后使旧预览失效，重新预览才可采用。
- 测试恢复、过时响应、移除资料、禁用状态；原文/选择不写入 localStorage。

### 4. 集成和验收

- 增加只含教练建议的用例，证明采用后改变合法待办顺序；未采用不影响、主 JD 优先、取消/删除/完成保护正确。不能让同文经历掩盖建议未生效。
- 独立审查先检查与 v2.1 的一致性，再检查实现质量，修复后重验相关路径。
- 代码冻结后运行全仓 Vitest（已知两个 Research 原生套件独立串行）、附加 Node、类型、Lint、标准构建、页面渲染及涉及的 Node/workerd 一致性。
- 原 Research 默认并发连接问题未证明修复，继续单独记录；不把串行通过描述成默认并发已修复。
- 输出新的验收报告和源码清单，更新恢复入口；旧报告不覆盖。最终仍需独立新版本质量契约、重新授权的模型评估和上线验收。

## 通过标准

- 逐词映射保留所有未修改词；删除的词不恢复；关系有可核对来源且不跨蓝图泄漏。
- 仅用户明确采用的建议参与现有任务排序；没有自动能力升级、mandatory、新任务或工时变化。
- 所有来源与选择均有快照和指纹，隔离/过期/撤回保护通过；前端不可能采用选择变更前的旧引用。
- 历史请求、无资料流程、已有重排和恢复测试通过，所有新增证据明确标为离线。

## 执行记录

- 设计阶段：已核对 v2.1 及两个独立只读审查，确认上述三类实际缺口；本文件是既定离线修复的实施细化。
- 实现及独立复审完成；上下文映射收紧为同一肯定子句、明确技术域依据。保留了原文、逐词选择、独立学习重点、历史快照和 UI 异步失效保护。原评分门槛和语料未修改。
- 最终验证及剩余事项见[本批验收报告](../../verification/2026-11-07-materials-contextual-planning-repair.md)。跨句能力范围与独立版本的质量契约不冒充本批已解决项。
