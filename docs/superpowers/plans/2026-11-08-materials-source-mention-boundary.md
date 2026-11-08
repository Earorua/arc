# 来源原词定位与肯定证据接口拆分

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提供独立的来源原词定位接口，保留否定语句提到的工具／任务，并修复中文名词尾和个人简介标题的词边界；既有肯定证据接口继续拒绝否定能力。

**Architecture:** 在现有grounded matcher内共享字素位置、技术名、命名空间和已审等价词校验，将否定语法判断与词法定位分开。先完成独立库接口与原生运行时验证；生产调用方仍使用原肯定接口，待下一批同时具备逐词能力／实践采用约束后再切换，避免中间版本把否定主题当作实践。该步骤不表示三个生产投影缺口或整个Gate已修复。

**Tech Stack:** TypeScript、Vitest、Intl.Segmenter、本地workerd；统一使用已有断网包装器。复用当前独立工作树，基线源码 `5345317`、证据提交 `07097aa`。

## 已确认的根因与边界

完整依据为[三条投影过滤审阅](../../verification/materials-product-observations/evidence/product-course-independent-projection-filter-20261107.md)。此前实际生产投影267例中，有三个已接受提名词被过滤；完整事实、来源和提醒仍保留。这不是模型调用或完整产品验收。

1. `必须掌握键盘可访问性的基本检查。` 中的 `键盘可访问性` 尾端位于ICU词片段“性的”内部。应识别名词性词尾与结构助词“的”的边界，不能放开所有中文内部位置。
2. `I cannot yet configure a Kubernetes cluster myself.` 中的任务两端合法，但被肯定证据的否定前缀保护排除。来源提名应保留任务；能力、实践和等级不得因此采纳。
3. `简介：熟悉 SQL，可独立完成报表。` 的准确合并短语被标题冒号当作namespace边界。只扩展常规个人标题，不允许任意`x:Tool`截取。

原字段与等价词清单、8词和100个UTF-16单位限制保持。引用仍返回原文拼写，不扩展缩写，不从未提名的正文自动增加词，也不把活动关联变成更广的课程概念。完整事实的否定和主体判断仍由后续采用层处理。

## Task 1：独立词法接口、中文边界及兼容性

**Files:** 修改 `app/lib/materials/grounded-skill-terms.ts`；新增 `tests/lib/materials/material-skill-mentions.test.ts`，必要时在现有 `tests/lib/materials/grounded-skill-terms.test.ts` 补充肯定边界测试。此次不改消费者、公开契约、模型配置或冻结评分器。

- [ ] 先加入调用新增导出接口的红例并记录失败。接口为：

```typescript
export function findMaterialSkillMention(text: string, label: string): string | null;
export function groundMaterialSkillMentions(quote: string, terms: readonly string[]): string[];
```

核心对照：

```typescript
const quote = "I cannot yet configure a Kubernetes cluster myself.";
const term = "configure a Kubernetes cluster";
expect(groundMaterialSkillMentions(quote, [term])).toEqual([term]);
expect(findMaterialSkillMention(quote, term)).toBe(term);
expect(groundMaterialSkillTerms(quote, [term])).toEqual([]);
expect(findMaterialSkillEvidence(quote, term)).toBeNull();
```

- [ ] 在同一matcher内以内部模式或明确策略分开否定保护与共同的语法／词法保护；禁止复制整份matcher。两种模式都保留完整字素、英语词边界、完整技术名、namespace、唯一原文拼写、已审等价词和词数／长度限制。`find*`允许已审等价词定位；`ground*`必须先定位实际提名词，再规范化，不允许提名正文没有的规范词来反推。
- [ ] 新mention模式仅跳过附着的否定前后缀／否定列表判定；不把“not know X”或“不会X”作为技能标签，完整否定保留在事实中。React/Excel动词歧义、IT代词、Go/R/C语言语境、清洗活动对象限制仍沿用。原肯定接口的否定行为不变。
- [ ] 在已有完整字素／端点校验下，补充中文名词性尾“性”与紧随结构助词“的”的词尾规则。应要求多字汉字词、最后的“性”以及“的”后的实际名词成分，继续校验词首；用可访问性、可维护性、可靠性等异名与技术名／非名词反例验证，不针对单个课程词开特例。若证据不支持这条形态规则，应先报告具体反例再调整设计，不全局放开中文内部边界。
- [ ] 常规个人标题支持与已有来源核对一致的 `简介／个人简介／自我介绍／个人技能／个人能力／profile／personal profile／my profile／personal summary／my summary`；只在行首或既有列表标记后识别。保留已有JD标题，拒绝团队归属、报告前缀、URI、任意namespace以及名称内部截断。
- [ ] 测试三条实际句子、其他中英文否定列表／等价词／混合肯否定句、没有提名不加词、大小写不同来源歧义、NFKC／组合字素／ligature、长词与8词上限；复跑全部既有grounded matcher测试，旧否定断言不得改成通过。

```powershell
node work/grounded-verification/run.mjs mention-boundary-author-20261108-red node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/lib/materials/material-skill-mentions.test.ts
node work/grounded-verification/run.mjs mention-boundary-author-20261108-green node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/lib/materials/material-skill-mentions.test.ts tests/lib/materials/grounded-skill-terms.test.ts
```

- [ ] 先完成独立规格审查，再完成独立质量审查；修复审阅发现后重新复核。作者只改授权文件与自己的ignored work探针，根任务统一提交。

## Task 2：调用边界与运行时验证

**Files:** 在 `work/grounded-verification/` 新建带 `mention-boundary-20261108` 前缀的只读验证脚本及结果，最终按原字节归档到新的证据目录；不修改旧原生脚本或结果。

- [ ] 根任务复跑两组库测试与现有文档提取／审阅专项。新接口尚未接入生产，因此此次只证明词法能力可用，完整投影三个缺口仍作为下一批待办。
- [ ] 使用本地workerd和相同导入代码执行中英文、字素与namespace对照；Node和workerd观察结果逐值一致。探针结果与包装器日志使用不同文件名，不覆盖旧记录。
- [ ] 按本次文件范围完成类型、Lint检查；若抽取新共享文件，核验执行器本地打包可包含它。无源码／契约变化时不重复上批全仓构建，集成采用层后再完成完整回归。
- [ ] 确认原课程、语料、候选参考、计分器和已有肯定接口消费者未被改写。当前旧课程依赖绑定已因上批planning契约而失配，继续如实记录，不在本批重置。
- [ ] 本地保存源码、红绿日志、两阶段审查、运行时对照和恢复入口，继续下一批“逐词肯定证据采用＋生产调用方切换”的离线实施；不推送、不部署、不远程迁移、不调用真实模型。

## 后续集成必须满足的验收条件

这些不是本库步骤的通过结论。接入新mention接口之前，必须同时补充：提供方解码→服务端投影→核对／人工补词保留原文主题；否定、他人、示例、条件、未来意图不能自动产生自评提示或实践优先级；正负混合事实按实际词和职责范围采用，不能用一个肯定词替另一个否定词背书；修订事实后不保留失去证据的旧提示。用户明确学习意图、明确接受计划、自评审核、来源／版本／删除保护继续独立生效。完整课程覆盖与能力采用入口仍为后续工作。
