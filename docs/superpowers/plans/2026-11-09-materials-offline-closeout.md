# 资料离线收尾与暂停实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development；每个源码修复先 RED、最小实现、独立规格审阅、独立质量审阅，再由根任务保存。最终统一全仓验收、GitHub 保存和暂停。

**Goal:** 完成用户指定的编号引用、自然中文指导实践和能力建议采用／持久化离线收尾；保存本地及 GitHub 后暂停，不进入模型、远程迁移或部署。

**Architecture:** 延续已批准 v2.1；新提取行为只对确切 v3 生效，旧记录和课程参考不重写。现有能力采用入口已经存在，只修复已复现的重新填写状态残留。各修复先专项审阅，全部最终源码冻结后只做一轮完整验收。

**Tech Stack:** TypeScript、React、Vitest、本地 SQLite、workerd/D1/R2、现有离线包装器。

## 1. 编号引用

- [x] 执行[编号条目计划](2026-11-09-materials-v3-numbered-statements.md)的边界库和实际 provider／服务端／核对持久化接入，分别完成两阶段审阅。源码分别为 `e48e5eb`、`6b49bce`。
- [x] 对正文引用和含编号的完整引用保留同样的个人证据终点；原始全文、UTF-16 来源及限定语保持。保留 v1/v2 原输出，拒绝孤立编号、跨条目和截断引文。
- [x] 本计划将编号 Task 3 的全仓验收安排在下方全部修复后统一执行。编号的专项、原生和兼容检查仍须完成；在最终全仓通过前不宣布整个离线收尾通过。

## 2. 自然中文指导实践

只读根因证据：`work/grounded-verification/guided-practice-diagnosis-20261109-01-results.json`，18 例、退出 0；详见同前缀 memo。`我在指导下清洗数据。` 的词义和个人实践均可识别，指导动作谓词却缺少“清洗”。相邻反例“清洗数据的计划尚未执行”会误读后面的“执行”，必须同时排除。

**Files:** `app/lib/materials/personal-assertion-scopes.ts`、`self-assessment-evidence.ts`、`skill-labels.ts`；`worker/document-executor/source-review-evidence.ts`、`source-span-extraction.ts`；`app/server/documents/extraction-validator.ts`；新增聚焦的库／provider／服务／界面回归测试。

- [x] 冻结起点并建立 RED：实际 v3 解码、独立服务端校验、保存重读及编辑保留应得到 `data cleaning`、`guided` 和有来源的核对提醒。wire 提名必须是原文 `清洗数据`，不能把规范英文名当原词。普通 v2 仍无提示，已有“练习清洗数据”对照仍有提示。
- [x] 增加默认关闭的内部 `sourceMentions` 选项，贯穿 `guidedSkillScope`、`supportsSelfLevelHintInScope`、`supportsMaterialSelfLevelHint`、`hasPersonalCapabilityQuestion` 以及 provider 的提示和独立提醒路径。确切 `source-spans-v3`／`SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION` 才传入 true；省略、v1、v2、未知近似标记保持原行为。现有经验判断继续调用默认模式。
- [x] 在现有中文指导分支识别实际动作，仅在 v3 对初始 `清洗…` 或 `对…清洗` 使用已有 `findMaterialSkillEvidence(action, "data cleaning")`；当前动作断言去掉句末标点和空白后，必须与完整命中的原文动作相同，不能忽略尚未分清归属的尾随分句。该分支优先于后方通用动词，防止跳到计划里的“执行”。保留指导、本人、否定、引用、条件及每个词的证据约束。不改全局 `practiceAction`，不以主题命中替代个人动作。

```ts
// Inside the existing Chinese guidance branch, after deriving action.
const cleaningHead = /^清洗|^对[^，,；;。!?！？]{1,80}清洗/u.test(action);
if (sourceMentions && cleaningHead) {
  const clause = action.replace(/[，,；;。.!?！？\s]+$/u, "").trim();
  const evidence = findMaterialSkillEvidence(clause, "data cleaning");
  return evidence !== null && evidence === clause;
}
// Existing default branch and its safeguards remain intact.
```

执行中追加的有证据修正：初版 61 项 GREEN 后，根任务的具体范围检查证明 `我在指导下清洗数据，记录了同事的 SQL 工作。` 会把 guided 扩给 SQL。原实现只比对首分句，后续却把整个 raw 当作指导范围。`guided-practice-20261109-scope-probe-01` 的 RED 和初版十二文件冻结保留。本批选择保守的完整动作检查，不新增通用分句器：这种未被既有规则分开的混合叙述保留事实／主题，但不生成 guided 或个人提醒；既有规则已分清的本人／其他断言仍按各自范围判断。重复清洗尾句也须拒绝借用等级。该限制只限定本轮自动建议，不把原文判定为没有经历，用户仍可人工自评。

- [x] site 的两次个人证据检查均启用确切 v3，第二次继续使用全文引用掩码；`retainedMaterialSelfAssessmentHints` 按确切 v3 转发选项，覆盖实际界面和 ReviewService。编号正文处理与本选项组合，不裁剪保存的事实或引文。
- [x] 正面包含“清洗了数据”“在导师指导下，我清洗数据”“我按指导清洗数据”“对原始数据进行清洗”。反例包括否定、未来、同事、报告、引用、条件、名词标题、未执行计划、设备／数据中心、其他词或另一任务借用等级。没有提名、提示为 null、删除提示／词／条目不得自动补回。要求／约束不能获得个人等级。
- [x] 保存 RED/GREEN、旧行为全量对照、实际持久化和两阶段独立审阅后提交。此项不新增任意中文谓词或课程技能。提交 `820a98a`；65 项聚焦和 1,329 项相邻回归通过，规格 11 场景加 7 检查、质量 12 组检查通过。十二文件冻结 SHA `3f264e37dd4a8d30ee035389f9f1a5eca9e6e2e84cce18ce48b668b9374a34a2`。

## 3. 能力采用与重置状态

只读诊断已验证真实 MaterialConfirmation → MaterialTextPanel → MaterialSetupSlot → AdaptiveSetupFlow → MaterialContextService → PlanningService → D1PlanningRepository 链路；采用可选，手动等级、公开证据引用和最终 audit 可保存重读。未调用 `adoptMaterialSelfAssessments` 库函数本身不构成缺陷。实际缺陷是“重新填写此岗位”未清除本轮核对标记和简历确认状态。

**Files:** `app/components/setup/adaptive-setup-flow.tsx`，实际组件回归测试，必要的共享测试夹具。

- [x] 将忽略目录中的实际采用／保存诊断提炼成稳定测试，不模拟按钮内部函数。先证明：采用 guided 后重新填写应恢复 unseen、核对框未选、继续按钮禁用；再点击未评估设为 uncertain 时，该技能也变为 uncertain。
- [x] 只在现有重新填写 handler 清除旧状态：

```ts
reviewedSkills.current.clear();
setMaterialAuditAcknowledged(null);
```

- [x] 保留原重置等级／时间／目标／草稿逻辑。核验事实确认不会采用、按钮只提供当前单一映射且有效的提示、明确采用后等级与既有证据保存、手动覆盖刷新后保持、创建计划和仓库重读的 audit 一致。已有恢复草稿的行为不在没有反例时重构。
- [x] 专项 GREEN、独立规格及质量审阅通过后保存，不新增采用按钮或额外确认门槛。提交 `2fad285`；正式 RED 为 4 通过／1 失败，三个重置断言共同失败；GREEN 5 项、9 文件 150 项相邻回归、规格／质量各自独立 5 项均通过。测试包含旧 v2 和确切 v3 的真实组件、上下文服务、规划服务和 D1 持久化；文档传输使用合成夹具，不声称完整 HTTP 规划传输通过。

## 4. 统一验收、保存与暂停

- [x] 运行 25 项旧 v3 原生完整链路和 Node 对照，以及本轮 17 项编号／中文原生对照（全部合成回复，包含编号与中文指导组合）。对应每次结果的全部依赖摘要必须与最终源码相符；若有后续改动影响依赖，重跑对应检查。
- [x] 旧 170 项行为、6 份已存旧记录完整返回和 8 张表只读对照；旧 26 份参考及 85 项课程依赖不变，不重写旧观察。
- [x] 新固定源码副本运行普通与串行 Vitest、类型／Lint／构建／页面；Research 来源校验在原工作树。附加 Node 的 290 项独占执行，保持原断言和超时，不与其他长验证并行。
- [x] 检查所有标准测试文件恰好覆盖一次，无未关闭审阅发现；最终独立集成审阅、归档原始失败及通过结果、源码身份和脚本。4 项既有 Lint 警告如未变，按既有警告报告。
- [x] 更新本地恢复入口、发布进度、最终报告；本地提交。核验 origin 为 `https://github.com/Earorua/arc.git`、当前资料分支的远端状态和 CI 触发条件，然后普通非强制推送，核对 GitHub SHA。应用／证据提交 `a8f60e2` 已推送并核验，实际回执另行同步。
- [x] 已保存用户的暂停指令、剩余步骤和准确恢复口令，全部开发／测试／审阅停止。最终文档同步核验后通过目标工具设为 `paused`；不再进入下一批工作。

模型调用、费用、远程迁移和部署仍为 0。授权仅新增 GitHub 保存；旧付费授权不续期。后续课程覆盖／新参考、完整 14 场景规划协议、主线界面整合、Kimi 质量复验和发布 Gate 留在暂停后的清单。
