# 资料变化但任务不变时的显式采用修复

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 同岗位换JD、首次采用资料、学习重点采用／撤回即使不改变任务顺序和日期，也能经预览与明确接受更新当前规划依据；真正无变化的请求仍不产生规划事件。

**Architecture:** 复用现有 `agent_replanned → replan_accepted / replan_discarded` 与资料事务旁表，不新增自动应用或独立授权接口。把“无需变化”的条件补齐为任务安排与当前已采用资料语义都相同；只有明确接受才切换 `goal_document_links`。新增只读、服务端的已采用语义比较，继续沿用现有所有权、来源、版本、过期、幂等和原子提交检查。

**Tech Stack:** TypeScript、现有Planning reducer、D1/SQLite、React、Vitest；全部通过已有断网包装器离线运行。

## 设计依据与边界

本项是已获准执行的v2.1方案§5.5及11月7日原生观测缺口的修复，沿用用户既定的明确接受流程。既有暂停请求已由11月8日恢复指令解除；仍不部署、不远程迁移、不调用真实模型、不推送。独立课程与评分器冻结参考不变，也不把本项通过表述为完整14场景或Gate通过。

已查实：`PlanningService.proposeMaterialReplanResponse` 在 unitOrder 和 diff 均不变时只调用 `recordNoChange`；该方法只记请求回执，不改变当前资料关联。原生探针已复现换JD、重点采用与撤回的问题。真正有任务变化的提案／接受事务可正常切换资料。

选择复用提案生命周期，避免增加另一套竞争控制与接受接口。自动保存新资料关联会绕过用户接受，不能使用；制造虚假任务顺序变化也不能使用。

资料语义比较要求：

- 仅比较当前owner、goal、workspace下 **enabled planning links**，其context必须有同一workspace的generation/accepted usage证明；待确认提案和历史失效关联不算当前采用。
- 比较精确来源依赖（slot、document/version、confirmation、text version、generation、confirmation digest）、显式skill/term mappings、learning intents、课程来源与内容版本、policy/mapping/explanation版本。更换等价文本JD仍是来源变化。
- 忽略预览ID/token、selection ID/revision、scope的draft/goal及planning revision等运输标识；忽略本次重排并未应用的audit/target，不让它们伪装成能力采用。日期与时间安排仍由现有任务差异检查处理。
- 集合排序不构成变化；缺省与空choices等价。部分资料经明确detach后，只比较仍enabled的依赖及其confirmation对应choices。无资料对无资料为无变化。
- 无法验证当前采用快照时，不能宣称两份资料相同。损坏记录不得被静默当作可信基线；已撤销／已清理来源的历史可能无法证明等价，允许重新建立待确认提案，不恢复其原文或撤销选择。
- `recordNoChange` 的最终批事务必须仍证明读取时的当前关联未变，避免比较后并发detach/delete/replacement导致虚假无变化；可复用或补充精确关联状态guard，不削弱现有guard。

## Task 1：服务器采用语义与原子提案

**Files:** 新增 `app/server/documents/adopted-context.ts`、`tests/server/material-context-only-adoption.test.ts`；修改 `app/server/documents/context-builder.ts`、`app/server/planning/service.ts`；必要的事务比较guard限定在上述helper与 `recordNoChange`。调整 `tests/server/material-replan-atomic.test.ts` 和 `tests/server/material-learning-intent-flow.test.ts` 中不正确的旧前提。

- [ ] 先用真实内存SQLite、现有服务和合法生成状态增加红例：首次无优先级资料应产生proposal；现有SQL主JD换React主JD且前置依赖使顺序不变，接受后关联换JD；学习重点采用／撤回在顺序不变时同样可接受。断言提议前后active links不变，accept后切换，discard后保留。
- [ ] 用真实完成事件和ProofService创建学习证据，比较完整Proof四表、全部PathUnit对象／依赖／分钟、已完成事件、保留的DailyUnit、audit和target。不是只比较task ID，也不以audit evidence代替Proof。
- [ ] 运行红例并保留断言失败记录：

```powershell
node work/grounded-verification/run.mjs context-adoption-red-20261108-a node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/server/material-context-only-adoption.test.ts
```

- [ ] 实现单一职责的服务端比较与精确最终guard；`MaterialContextService` 提供比较结果给planning service。将原no-change分支改为以下逻辑（比较只在已确认任务无变化时执行）：

```typescript
if (tasksUnchanged) {
  const adopted = await materials.compareAdoptedContext(ownerId, verified.commit);
  if (adopted.matches) {
    await materials.recordNoChange(ownerId, request, verified.commit, unappliedChanges.length > 0, adopted);
    return { outcome: "no-change", message: "现有资料采用方式、任务顺序和日程无需变化。", unappliedChanges };
  }
}
```

`compareAdoptedContext` 返回有明确类型的只读匹配结果及最终guard所需的关联快照；不得接收客户端提供的等价断言。后续现有 `saveEvent` 提案与accept事务保持原有流程。

- [ ] 补齐真正无变化、重新生成等价预览、selection变化但语义相同、choices排列、来源版本变化、audit-only仍unapplied、其他owner/goal、过期、重试、同key不同body、并发完成／detach／删除、proposal与accept写失败回滚等反例。无变化请求不能加pending plan或规划事件；新语义提案重试不能重复接受。
- [ ] 原学习意图流程里的“加了补充资料但未采用重点”只表示任务无变化。若调用提议，应观察待确认资料提案并明确放弃／接受后再进行下一动作；不能继续宣称workspace完全不变。只有预览时仍完全不变。原已撤回草稿、当前仍为同一JD的无变化用例保留。
- [ ] 跑新服务器套件、原material replan/learning-intent/adopted refs/detach相关套件，先完成规格复审，再完成代码质量复审。

## Task 2：明确展示仅更新资料依据

**Files:** 修改 `app/components/workspace/plan-diff-review.tsx`；测试 `tests/components/materials-plan-diff.test.tsx`。

- [ ] 先增加同任务／同日期、但带materialContextFingerprint的真实reducer提案测试。界面必须清楚说明接受会更新资料依据，提供接受与保留两个动作；不能因diff全unchanged隐藏操作或自动提交。
- [ ] 从已有提案事件与完整路径／日程比较判断是否仅资料变化，不从“0个日期变化”推断整条路径没有顺序变化，也不依赖易迟到的私有history来允许接受。
- [ ] 对此类提案显示 `任务和日程保持不变。接受后将更新当前路线采用的资料与学习重点。`；按钮使用 `接受资料更新` 与 `保留当前资料与安排`，成功提示分别为 `已更新当前路线采用的资料。` / `已保留当前资料与安排。`。普通重排与显式传入acceptLabel的调用方兼容。
- [ ] 验证点击前无写动作、点击后使用现有candidate ID、放弃不采用、失败可重试、任务变化提案与非资料提案仍保留原语义。继续验证迟到history与账号切换保护。
- [ ] 服务器＋界面专项、类型、Lint、必要原生Worker验证与完整回归；证据使用新文件名，旧记录与基线不覆盖。

## Task 3：集成验证、报告与恢复入口

- [ ] 根任务独立复跑最终专项；依实际改动范围完成全仓Vitest分组、Node补充、类型/Lint/构建和页面验证。不以旧checkpoint测试替代新版本验证。
- [ ] 验证课程／评分器输入未改；新产品源码单独记录摘要，不重写历史991文件清单。若Research出现来源边界失败，先检查真实路径和依赖归属，不改校验或降低断言。
- [ ] 两阶段审查全部关闭后保存源码、本批报告与恢复入口。本地提交，继续目标而不声称整体完成；下一项仍为词语保留与课程任务覆盖等离线缺口。

## 执行记录

- 2026-11-08：当前HEAD `69cca9429ce5ef5d6708f99fe1dedc3091e8f86b`，工作树干净。基线3套件20/20，日志 `context-adoption-baseline-20261108-a`，摘要 `199e228f3f3b38b7ab3a42de3b6db64e60d4fedf573e6f56b47e39b5eb0143e7`，出站拦截计数0；原测试的首次资料无变化前提需纠正。本记录不是新模型质量证明。
