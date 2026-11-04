# Arc 私有资料 v2.1：阶段 0 验收结果

日期：2026-11-04。**结论：阶段 0 已完成，Gate 0 通过。AI 主路径契约和离线机制就绪；真实质量、端点、预算及产品体验仍待阶段 1 验证。本次在此停止。**

执行分支：`codex/materials-phase-0-20261104`。工作区和起始状态见 [执行基线](C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/.worktrees/ui-warm-precision/docs/verification/2026-11-04-materials-phase-0-baseline.md)。详细接口、存储及状态交接见 [冻结契约](C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/.worktrees/ui-warm-precision/docs/superpowers/specs/2026-11-04-private-materials-contracts.md)。

## 1. 完成的交付物

| 任务 | 实际产出 | 结论 |
| --- | --- | --- |
| P0-01 | APP_ROOT、HEAD、原改动、迁移序号、发布记录与现有流程基线；初始 137 项回归 | 通过 |
| P0-02 | 资料/文本版本/AI 候选/核对草稿/确认/选择作用域；同 owner 和版本引用、草稿 CAS、迟到保护、自评单独采用 | 通过 |
| P0-03 | 21 项接口的 strict 请求响应定义、有限错误码、有界数据、幂等摘要、独立配置及默认关闭 | 通过 |
| P0-04 | 18 张表的职责与约束设计、仓储接口、R2 补偿/删除协议、三类提交栅栏；37 项 SQLite 探针 | 通过；未创建正式迁移 |
| P0-05 | 真实本地 Miniflare Workflows + 持久化 D1 的假 Provider 探针；24 项状态/运行时测试 | 通过；未调用真实模型 |
| P0-06 | 私有输入快照、SHA-256 指纹、规划/映射/解释版本、删除后回放判定、旧请求兼容 | 通过 |
| P0-07 | 4 技能、12 个既有模板、240 分钟基线；7 类固定任务 ID/顺序/保护集样例 | 通过；个性化排序引擎尚未实现 |
| P0-08 | 24 份合成资料、固定标注的一对一评测器、逐文档门槛、模型资格表及两轮独立审查 | 通过；真实模型成绩未测 |

新增模块尚未接入现有产品路由。用户此时还不能在网站导入或自动分析简历/JD；这些交付物为阶段 1 提供可运行的验证基础和确定的接口边界。

## 2. 最终验证

主代理在审查修复完成后执行以下合并回归：

~~~powershell
npm run test:unit -- tests/contracts/documents.test.ts tests/contracts/material-planning.test.ts tests/server/document-policy.test.ts tests/server/document-job-state.test.ts tests/server/document-workflow-probe.test.ts tests/server/document-quality-evaluation.test.ts tests/server/materials-fixture.test.ts tests/db/materials-transaction-probe.test.ts tests/contracts/planning-api.test.ts tests/components/setup-draft.test.ts tests/components/research-setup-activation.test.tsx tests/lib/planning/agent-replanned.test.ts tests/server/planning-history.test.ts tests/lib/planning/fingerprint.test.ts
~~~

**结果：14 个文件，318 项通过，0 失败，exit 0，23.03 秒。**其中阶段 0 新增 8 个测试文件、172 项；既有关键流程回归 6 个文件、146 项。

| 检查 | 结果 | 覆盖范围 |
| --- | --- | --- |
| 新增契约和策略 | 82 项通过 | 严格字段、所有权/版本、长度、幂等、快照、解释版本、配置隔离 |
| SQLite 提交探针 | 37 项通过 | owner/version 复合外键、slot 唯一、失效 guard、故障回滚、相邻版本竞争 |
| 任务状态与 Workflow | 24 项通过 | 持久发送栅栏、恢复、队列、费用未知、撤销/删除/取消及激活竞态 |
| 合成质量评测器 | 23 项通过 | 逐份召回/分类、唯一引用、UTF-16 边界、禁止输出、重复、缺项 |
| 规划验收样例 | 6 项通过 | 合法 blueprint/registry、旧引擎基线、固定任务集合/依赖/工时 |
| 既有关键流程 | 146 项通过 | Setup、Research 激活恢复、历史、exact-set 重排、旧 API/指纹 |
| TypeScript | `npx --no-install tsc --noEmit --incremental false`：exit 0 | 全项目静态类型检查 |
| ESLint | 新增/本次修改的全部 TypeScript 文件：exit 0，无 lint 警告 | 契约、接口、探针、辅助函数和测试 |

提交前统一新建 Markdown/JSON 的 LF 换行，并再次执行质量评测与规划样例两组测试：29 项通过，exit 0；`git diff --cached --check` 通过。

Node SQLite 的 ExperimentalWarning 是运行时提示；npm 的更新提示未执行。没有升级依赖。未运行生产构建、全量测试集、浏览器端到端测试或部署；本阶段新增模块与生产入口隔离，验证范围如上。

## 3. Workflow 的实际运行证据

最终合并回归输出：

~~~json
{
  "argumentCount": 26,
  "stepOutputCount": 40,
  "maxReferenceBytes": 101,
  "privateMatches": 0,
  "unexpectedNetworkRequests": 0,
  "persistedCells": 2394,
  "persistedArguments": 26,
  "persistedStepOutputs": 62,
  "runtimeRestarts": 2
}
~~~

参数和输出既检查探针镜像记录，也检查停止运行时后落盘的 Workflow SQLite 单元。2,394 是该次运行扫描的单元数，不是任务数；101 字节是该次最大引用 DTO。持久存储内部记录数量可能随本地运行时调度变化。

| 场景 | 观测结果 |
| --- | --- |
| 相同 job 与竞争执行实例 | 持久发送次数为 1，结果回执为 1 |
| 同用户 JD 后跟简历 | 串行执行；前任务结算后后台推进下一项 |
| 发送后运行时重启、无回执 | 保持费用未知、执行占位和预留，不重新发送 |
| 已保存回执但投递失败 | 重启后仅重新投递，发送次数保持 1 |
| 费用未知与等待队列 | 保留未知费用占位，最多 5 个等待任务；仅未发送的到期/取消任务释放预留 |
| 取消/删除/撤权/修订后迟到 | 激活为 0，进入清理；费用单独结算 |
| 资格读取后、激活写入前失效 | 四类受控交错均使 CAS 失败并进入清理 |
| 付费步骤抛错 | 零自动重试，错误使用有限固定文本 |
| 未发送基础设施错误 | 再试必须重查资格；撤权后不发送 |
| 有候选、无费用回执 | 候选可待核对，费用仍未知；不释放占位 |
| 畸形候选 / 确定未发送 | 畸形不激活；确定未发才释放预留 |
| 正文与网络 | Workflow 参数/结果/错误中合成私有标记匹配 0；出站请求 0 |

限制：这是本地假 Provider 的协议验证。重启采用 Miniflare dispose/recreate，并显式执行恢复检查，不是操作系统断电实验；4 分钟步骤超时只校验配置，未实际等待超时。探针使用专用测试表和简化候选形状，不能替代正式提取验证、真实计费、R2 清理或外部服务 exactly-once 保证。

## 4. 数据事务与审查修复

SQLite 探针验证末尾约束失败会撤销同 batch 的结果、资料关联、selection 绑定、workspace 变更及回执。正式 0014 迁移和应用 D1 adapter 未创建。

独立规格审查与代码审查曾发现以下问题，均已修复并复核：

| 问题 | 修复与证据 |
| --- | --- |
| workspace 已经处于目标 revision 时，零行 CAS 可能通过末尾 guard | guard 绑定本批成功 CAS 写入的 mutation marker；generation/proposal/accept 三项先失败，再通过 |
| 资格读取和激活之间失效，CAS 零行却未排入清理 | `UPDATE … RETURNING` 检查实际激活；取消/删除/撤权/修订四项先失败，再通过 |
| 快照没有独立解释规则版本 | 增加必填 `explanationVersion`，验证缺失/非法值拒绝以及版本变化改变 SHA-256 |
| accept 回执不能表达既有接受端点 | 新增内部 accept 身份类型，保留单独回执命名空间；不新增 HTTP 处理器 |

评测器还补充了重复短引用和代理对边界失败用例，统一复用正式来源契约。最终两位独立审查者均确认无剩余阶段 0 阻塞项。

## 5. 固定的规划验收样例

基础数据：foundation、ui、sql、analytics；sql 依赖 foundation，analytics 依赖 sql。每项有 learn/calibrate/reinforce 模板，共 12 个；基线四个 learn 各 60 分钟，共 240 分钟。

以下“目标顺序”是阶段 1 必须实现的冻结预期；阶段 0 仅运行旧引擎验证基线与样例合法性。

| 场景 | 首次生成的目标顺序 / 保留规则 |
| --- | --- |
| 无资料 | foundation → ui → sql → analytics，保持原 ID 和顺序 |
| JD analytics must | foundation → sql → analytics → ui；前置继承优先级 |
| 简历职责采用 UI guided | ui → foundation → sql → analytics；不自动提升为 independent |
| sql uncertain | foundation → sql calibrate → sql learn → analytics → ui；完成 calibrate 仍保留 learn |
| 未覆盖/冲突 | 保持原任务集合；Kubernetes 为 uncovered，SQL 冲突待核对，资料中的 URL 不新增课程 |
| 用户单独选择 analytics independent + must | foundation → sql → analytics calibrate → ui；遵循现有 independent 规则 |
| JD analytics preferred | foundation → sql → analytics → ui；按 ready 集合应用 preferred 层级 |

样例同时固定首次生成的字面任务 ID 和当前路线重排的未完成 ID 集合。已完成项不重排，不能用 calibrate 替换 learn。目标日期样例的保护集合 foundation+sql+analytics 需要 180 分钟、可用 75 分钟，预期明确不可行，不删必备项凑日期。

## 6. 质量门槛与未验证项

24 份资料全部为明确标注的虚构文本：12 简历 + 12 JD；其中 18 普通样例和 6 边界样例，覆盖中文、英文、混合文本及注入、冲突、缺失、目录外要求和团队经历误判。

评测按预标注语义与唯一原文引用一对一匹配，重复候选不增加召回。普通样例逐份关键项召回至少 90%；普通 JD 分类至少 90%，遗漏计错；所有保留候选来源合法率 100%。无标注项记不适用，不用总体平均掩盖某份失败。新增释义须在下一轮评测前人工审阅标注，不能从模型输出自动扩充标准答案。

`canPrefill` 仅是离线“可预填”代理指标，不能证明用户已在真实页面完成核对。合成正确输出用于验证评测器，不是模型成绩。

| 项目 | 本次状态 |
| --- | --- |
| 假 Provider、合成候选、错误注入 | 已验证 |
| 真实模型/端点/路由资格 | 未选择、未调用、未验证 |
| 实际 token、价格、费用与时延 | 未测；测试费用为合成整数 |
| 真实 AI 的 18/18 普通预填与 6/6 边界质量 | 未测 |
| 用户核对页、手动兜底恢复 | 契约已定，页面未实现 |
| 正式数据库、私有 R2、执行器绑定、删除闭环 | 设计已定，生产实现未开始 |
| 个性化生成、提案、接受与现有产品入口 | 预期与事务边界已定，生产接入未开始 |
| PDF/DOCX/OCR、联网导入、Agent 资料投影 | 后续阶段，不在本次范围 |

## 7. Gate 0 与停止点

阶段 0 的全部门槛通过：基线、AI 主路径与兜底契约、来源/权限、事务机制、Workflow 恢复、引用式历史、指纹与兼容、规划样例、质量评测器及交接均有证据。

这允许后续启动阶段 1 的离线开发，不授权本次继续实施。真实 AI 质量/端点/预算未验证仍是阶段 1 最终验收和主入口开放的阻塞项，不能用人工兜底解除。

**本次没有进入阶段 1，没有部署、远程迁移或真实模型调用。**分支和工作树保留本地供后续审阅；既有 v2.1 设计文档改动及阶段 1 计划不纳入本次代码提交。
