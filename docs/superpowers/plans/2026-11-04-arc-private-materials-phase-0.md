# Arc 私有资料：阶段 0 详细实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 固定“AI 自动分析简历/JD → 用户核对修改 → 个性化规划”的主路径契约、质量评测和后台任务边界，将人工填写作为兜底，为阶段 1 的必交 AI 能力提供可执行基础。

**Architecture:** 网站负责登录、私有资料和规划事务；独立资料 Worker / Workflow 负责受控模型调用。阶段 0 使用合成资料和假 Provider，在本地验证状态机及运行时；不接入正式产品入口、不部署、不调用真实模型。

**Tech Stack:** 当前仓库的 TypeScript、Zod、Vitest、Node SQLite、Cloudflare Workers / Workflows、D1、R2；沿用现有工具链，不在本阶段升级依赖。

---

## 1. 文档状态与执行基线

- 日期：2026-11-04，Asia/Shanghai；本次按 v2.1 的 AI 优先要求修订。
- 正常流程以 AI 预填为主，用户核对修改；人工填写仅作拒绝外发、失败、额度不足或服务不可用时的兜底。阶段 0 的假 Provider 验证不等于真实模型质量合格。
- 依据：[v2.1 设计方案](C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/.worktrees/ui-warm-precision/docs/superpowers/specs/2026-09-11-arc-private-materials-personalized-planning-design.zh-CN.md)，重点对应第 5–6、9–12、16.1、17–18 节。
- 后续计划：[阶段 1：AI 分析与个性化规划闭环](C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/.worktrees/ui-warm-precision/docs/superpowers/plans/2026-11-04-arc-private-materials-phase-1.md)。
- **状态：阶段 0 已完成；Gate 0 通过。**最终验证为 14 个测试文件、318 项通过，TypeScript 与本次改动的 ESLint 通过。详见 [验收结果](C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/.worktrees/ui-warm-precision/docs/verification/2026-11-04-materials-phase-0-results.md)。
- 本计划中的阶段 0 Create / Modify 已落实为隔离契约和本地探针；阶段 1 未开始，未部署、未调用真实模型。
- APP_ROOT：[ui-warm-precision](C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/.worktrees/ui-warm-precision)。下文代码路径均相对此目录。
- 核对的分支：`codex/refine-home-copy-hierarchy-20261030`；HEAD：`63d7b2ee5533fe8e8a6e3077f30198f8cfd3d753`。
- 实施分支：`codex/materials-phase-0-20261104`；沿用原应用工作树，本地保留供审阅。
- 最近应用发布提交为 `b913e8182c293b11e473291adccff429ff99bbd6`；[10 月 30 日验收记录](C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/.worktrees/ui-warm-precision/docs/verification/2026-10-30-home-copy-hierarchy.md)是发布记录依据，不能替代执行当天的线上核对。
- 应用迁移目前截至 `0013_learning_agents.sql`。新增迁移拟为 `0014_private_materials.sql`；若执行时编号已占用，先统一更新两份计划及测试引用，再生成迁移。
- 原外层研究工作树不作为应用实施目录。现有未提交修改应保留；仅提交本任务明确列出的文件。

## 2. 阶段目标和交付顺序

| 任务 | 交付物 | 前置 | 预估工作量 |
| --- | --- | --- | --- |
| P0-01 | 最新基线及影响面记录 | 无 | 0.25–0.5 人日 |
| P0-02 | AI 候选、预填核对、来源与作用域契约 | P0-01 | 0.75–1.25 人日 |
| P0-03 | HTTP 契约、错误码、配额、开关 | P0-02 | 0.5 人日 |
| P0-04 | 数据表、事务及删除依赖设计 | P0-02、03 | 0.5–1 人日 |
| P0-05 | 独立 Workflow 的假 Provider 验证 | P0-03、04 | 1–2 人日 |
| P0-06 | 上下文指纹、回放、旧请求兼容方案 | P0-02、04 | 0.5–1 人日 |
| P0-07 | 确定性规划规则与固定验收样例 | P0-06 | 0.5–1 人日 |
| P0-08 | AI 评测集、质量准入、阶段评审和交接 | P0-01 至 07 | 1–1.5 人日 |

合计约 **5–9 人日**，用于安排依赖，不作为交付时限承诺。阶段 0 结束时应有 AI 主路径契约、固定质量评测集、离线恢复验证和评审记录；完整用户功能及真实模型准入由阶段 1 完成。

阶段 0 不包含 PDF/DOCX/OCR、联网抓取、向伙伴注入资料摘要、新增课程或学习单元、改变已有路线任务集合、生产迁移和生产发布。

## 3. 文件职责地图

| 操作 | 精确路径 | 单一职责 |
| --- | --- | --- |
| Create | `docs/verification/2026-11-04-materials-phase-0-baseline.md` | 基线、命令结果、已存在风险 |
| Create | `docs/superpowers/specs/2026-11-04-private-materials-contracts.md` | 冻结领域/API/表结构/状态机决策 |
| Create | `docs/verification/2026-11-04-materials-phase-0-results.md` | 假 Provider 证据与退出检查 |
| Create | `app/contracts/documents.ts` | 资料、版本、引用、候选、确认、选择 |
| Create | `app/contracts/documents-api.ts` | 公共资料接口严格输入输出 |
| Create | `app/contracts/material-planning.ts` | 规划私有引用、上下文、预览凭据 |
| Create | `app/server/documents/policy.ts` | 配额、功能开关和启用条件 |
| Create | `app/server/documents/repository.ts` | 所有者隔离仓储接口及事务输入 |
| Create | `app/server/documents/provider.ts` | Provider 输入/输出及费用状态接口 |
| Create | `worker/document-executor/workflow-policy.ts` | 有界引用与付费步骤策略 |
| Create | `worker/document-executor/job-state.ts` | 无框架依赖的任务转换规则 |
| Create | `tests/helpers/materials-fixture.ts` | 合成资料、固定时钟、ID 和故障控制 |
| Create | `tests/fixtures/documents/quality-corpus.json` | 24 份合成简历/JD、原文片段和期望字段 |
| Create | `tests/helpers/document-quality-evaluation.ts` | 基于固定标注计算召回、分类、引用及失败结果 |
| Create | `tests/server/document-quality-evaluation.test.ts` | 评测口径的通过/失败边界 |
| Create | `tests/contracts/documents.test.ts` | AI 候选、核对草稿、严格 schema、引用和版本测试 |
| Create | `tests/contracts/material-planning.test.ts` | 作用域和个性化请求契约测试 |
| Create | `tests/server/document-policy.test.ts` | 开关和预算配置隔离 |
| Create | `tests/server/document-job-state.test.ts` | 并发/取消/未知费用状态测试 |
| Create | `tests/server/document-workflow-probe.test.ts` | 本地 Miniflare / Workflows 探针 |
| Create | `tests/fixtures/documents/workflow-probe.ts` | 只使用假 Provider 的独立 Workflow 入口 |
| Create | `tests/helpers/document-workflow-fixture.ts` | 本地运行时重启、持久记录检查和外网阻断 |
| Create | `tests/db/materials-transaction-probe.test.ts`、`tests/fixtures/documents/transaction-probe.sql` | 独立 SQL 机制与故障回滚探针，不是正式迁移 |
| Create | `tests/server/materials-fixture.test.ts` | 旧引擎基线和冻结规划样例合法性 |

参考但本阶段不修改：[规划服务](C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/.worktrees/ui-warm-precision/app/server/planning/service.ts)、[D1 规划仓储](C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/.worktrees/ui-warm-precision/app/server/planning/d1-planning-repository.ts)、[路径构建器](C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/.worktrees/ui-warm-precision/app/lib/planning/path-builder.ts)、[事件归约器](C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/.worktrees/ui-warm-precision/app/lib/planning/event-reducer.ts)、[Setup 草稿](C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/.worktrees/ui-warm-precision/app/components/setup/setup-draft.ts)、[现有 Research Workflow](C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/.worktrees/ui-warm-precision/worker/research-executor/workflow.ts)。

## 4. 先冻结的实施决策

### 4.1 用户场景

| 场景 | 资料作用域 | 提交条件 | 失败后的状态 |
| --- | --- | --- | --- |
| 首次创建，无 goalId | owner + draftId + selectionRevision | activation 恢复锁、预览凭据和生成事务共同校验 | 资料仍在私人库，草稿保留；不绑定其他目标 |
| 已有路线，创建新目标 | owner + draftId，记录 previousGoalId | Ready Research、原活动目标、资料快照同时有效 | 原目标和原计划继续可用 |
| 当前路线重排 | owner + goalId + workspaceId + revision | 当前未完成任务 exact-set，依赖合法 | 不覆盖活动计划 |
| 历史计划 | owner + archived goalId | 只读，来源已删时显示依据不可用 | 不激活历史，不切换当前目标 |
| 无资料 / 匿名路径 | 无私有上下文 | 沿用现有有效请求 | 不要求创建资料草稿 |

资料解析成功不能替代 Ready Research。新的资料版本不会自动替换某目标已选版本；用户采用新版本时递增 selectionRevision，旧预览失效。

### 4.2 首版配额与字段限制

以下为实施默认值，应在 P0-03 固化为常量；运行时可收紧，不得由客户端放宽。

| 对象 | 默认限制 |
| --- | --- |
| 每用户资料库 | 30 份未清理完的资料；删除中仍计入存储配额 |
| 每资料保留文本版本 | 10 个；正文修改或另存允许发送文本均计数 |
| 总保留正文 | 每用户 1,000,000 个 Unicode 码点；原始/编辑后副本均计数 |
| 单文本 | 50,000 个 Unicode 码点且 UTF-8 ≤ 256 KiB |
| 创建文本请求体 | ≤ 512 KiB，流式累计计数，不只信 Content-Length |
| 每次选择 | 主简历 ≤ 1，主 JD ≤ 1，补充 ≤ 3；可以为 0 |
| 单资料候选或确认 | ≤ 100 条，序列化 ≤ 128 KiB；单条正文 ≤ 1,000 字符 |
| 规划上下文 | 结构化序列化 ≤ 256 KiB，不含全文 |
| 同时模型任务 | 每用户最多 1 个外部执行或费用未明占位；另有最多 5 个已授权待发任务 |
| 待发队列 | 按 createdAt/jobId 排序，最长等待 30 分钟；仅确认未发送的过期任务可释放预留 |
| Workflow 参数/输出 | 参数仅 jobId、contractVersion；输出仅有界状态与结果引用，≤ 4 KiB |
| 模型 token | 最大输入 16,000、最大输出 4,096；输入含系统指令和 schema；超限要求另存缩短文本，不静默截断 |
| 模型时间 | HTTP 调用上限 180 秒，付费 Workflow 步骤上限 4 分钟；超时按是否已发送区分 |

文本只统一 BOM/换行；不做改变原意的 Unicode 兼容折叠。定位采用**规范化文本的 UTF-16 半开区间 [start, end)**，与 JS slice 一致；字符配额按 Unicode 码点计数。两种计数必须分别命名。

### 4.3 开关与预算

- `ARC_DOCUMENTS_ENABLED`：资料入口与新建/编辑；默认 false。
- `ARC_DOCUMENT_ANALYSIS_ENABLED`：创建新的外部分析；默认 false。
- `ARC_DOCUMENT_PLANNING_ENABLED`：新个性化预览/生成/重排；默认 false。
- 三个开关都不控制已存在资料的删除与任务状态查询。
- 第一阶段不实现伙伴资料投影和文件上传路由，不能通过普通配置误开启。
- 分析配置必须独立提供 provider/model/路由策略/价格版本/用户日上限/全局日上限/单次费用上限。缺任何一项都关闭分析并提示主路径未就绪，手动仅供兜底，不满足阶段 1 完成条件。
- 代码中的默认关闭是发布保护；通过阶段 1 验收后的正常用户流程必须以 AI 分析为默认主操作。
- 费用统一用非负整数 `microUSD`；不使用浮点金额，不借 Research 或 Agent 的 quota 表、开关、密钥和额度。
- 日预算按服务端 UTC 日期结算，界面按用户时区展示重置时间。未知费用预留不因跨日自动释放，也继续占用每用户分析并发位。
- 价格和真实模型资格没有在本文核实；真实发送保持关闭，不能填入猜测价格后上线。

### 4.4 来源与确认契约

以下为 P0-02 的最小完整契约核心。全部对象使用 strict；更完整的 API 对象按第 5 节字段表实现，不接受任意扩展属性。

~~~ts
import { z } from "zod";

export const materialIdSchema = z.string().max(256)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
export const materialRevisionSchema = z.number().int().nonnegative();

export const materialSourceRefSchema = z.object({
  documentId: materialIdSchema,
  documentVersionId: materialIdSchema,
  textVersionId: materialIdSchema,
  start: z.number().int().min(0).max(100000),
  end: z.number().int().min(1).max(100000),
}).strict().refine(v => v.end > v.start);

export const confirmedMaterialItemSchema = z.object({
  id: materialIdSchema,
  kind: z.enum(["experience", "skill-claim", "requirement", "constraint"]),
  text: z.string().trim().min(1).max(1000),
  origin: z.enum(["extracted", "user"]),
  sourceRef: materialSourceRefSchema.nullable(),
  requirementLevel: z.enum(["must", "preferred", "unspecified"]).nullable(),
}).strict().superRefine((item, ctx) => {
  if (item.origin === "extracted" && item.sourceRef === null)
    ctx.addIssue({ code: "custom", message: "Extracted items require a source" });
  if (item.kind !== "requirement" && item.requirementLevel !== null)
    ctx.addIssue({ code: "custom", message: "Only requirements have a requirement level" });
});

export const documentCandidateSchema = z.object({
  id: materialIdSchema,
  kind: z.enum(["experience", "skill-claim", "requirement", "constraint"]),
  text: z.string().trim().min(1).max(1000),
  requirementLevel: z.enum(["must", "preferred", "unspecified"]).nullable(),
  skillLabels: z.array(z.string().trim().min(1).max(100)).max(8),
  selfLevelHint: z.enum(["conceptual", "guided", "uncertain"]).nullable(),
  source: z.object({
    segmentId: materialIdSchema,
    quote: z.string().min(1).max(1000),
  }).strict(),
}).strict().superRefine((item, ctx) => {
  if (item.kind !== "requirement" && item.requirementLevel !== null)
    ctx.addIssue({ code: "custom", message: "Only requirements have a requirement level" });
  if (!["experience", "skill-claim"].includes(item.kind) && item.selfLevelHint !== null)
    ctx.addIssue({ code: "custom", message: "Only experience or skill claims have a self-level hint" });
});

export const materialSelectionEntrySchema = z.object({
  slot: z.enum(["resume", "jd", "supplement"]),
  documentId: materialIdSchema,
  documentVersionId: materialIdSchema,
  confirmationId: materialIdSchema,
}).strict();

export const materialSelectionRefSchema = z.object({
  selectionId: materialIdSchema,
  selectionRevision: materialRevisionSchema,
}).strict();

export const materialScopeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("draft"),
    draftId: materialIdSchema,
    previousGoalId: materialIdSchema.nullable(),
  }).strict(),
  z.object({
    kind: z.literal("goal"),
    goalId: materialIdSchema,
    workspaceId: materialIdSchema,
    baseVersionId: materialIdSchema,
    revision: materialRevisionSchema,
  }).strict(),
]);
~~~

跨字段约束交给服务端仓储验证：同 owner、documentVersion 属于 document、textVersion 属于 documentVersion、区间可回读、confirmation 属于相同版本。`sourceRef` 不携带 ownerId、URL、R2 key，也不是公共 Proof evidence。

确认经历和确认自评是两次明确动作。AI 预填事实、技能词和 selfLevelHint，建议不能直接写入 audit。independent/verified 不在模型输出允许范围；用户可批量采用已展示的普通事实与明确自评提示，但 independent 必须在对应技能上单项选择。

模型用 segmentId + quote 引用服务端片段，网站验证后产生准确的 sourceRef；不要求模型计算全文偏移。核对草稿记录 documentVersionId/textVersionId/extractionId、origin=ai/manual/mixed、items、selfAssessmentHints、revision 和 updatedAt；用户修改通过 CAS 保存。首次有效结果可初始化空草稿，已编辑草稿收到新结果只提示候选可用，不自动覆盖。

### 4.5 默认交互和兜底

1. 粘贴文本，查看待发送范围及处理方；主按钮为“保存并 AI 分析”，仅保存/手动整理作为次级操作。
2. 用户明确允许后，保存、记录允许、创建持久任务由客户端顺序编排；重试恢复已存回执，不重复创建任务。
3. 展示等待/分析状态，完成后直接展示预填核对页；正常样例不先出现空白结构化表单。
4. 将 JD 必备/加分、经历职责、歧义映射和自评冲突集中提示；确认后的条目才进入规划。
5. 无资料线索的技能保留已有自评；没有既有自评时，可由用户明确批量采用 uncertain，不静默判为 unseen。
6. 用户拒绝、服务不可用、分析失败或额度不足时进入手动兜底，保留已有资料/候选/修改。结果未知时不重发，迟到结果不覆盖人工草稿。

## 5. 阶段 1 接口冻结表

每个写请求都包含 `mutationId`；服务端以 session 解析 owner，任何客户端传入 ownerId 均作为未知字段拒绝。版本化对象不做原位覆盖。

| 方法和路径 | 输入要点 | 输出要点 |
| --- | --- | --- |
| GET /api/documents | cursor、limit ≤ 30 | 私有元数据列表，无正文 |
| POST /api/documents | kind、displayName、text、mutationId | documentId、documentVersionId、textVersionId、revision |
| GET /api/documents/[documentId] | 可选 versionId | 同 owner 详情、纯文本、版本状态 |
| POST /api/documents/[documentId]/versions | expectedRevision、text、mutationId | 新不可变版本 |
| GET/PUT /api/documents/[documentId]/review-draft | GET 以 textVersionId 查询；PUT 含 textVersionId、extractionId、expectedRevision、items、selfAssessmentHints、mutationId | 服务端私有核对草稿及新 revision |
| POST /api/documents/[documentId]/confirmations | documentVersionId、textVersionId、reviewRevision、expectedRevision、items、mutationId | confirmationId、新 revision |
| POST /api/material-selections | scope、entries、mutationId | selectionId、selectionRevision |
| GET /api/material-selections/[selectionId] | 无正文参数 | 当前引用与版本状态 |
| PUT /api/material-selections/[selectionId] | expectedRevision、entries、mutationId | 新 selectionRevision |
| POST /api/document-consents | textVersionId、purpose=analysis、policyVersion、providerPolicyId、mutationId | consentId；不启动模型 |
| POST /api/document-jobs | textVersionId、consentId、mutationId、可选 previousJobId | jobId、queued 状态；只在明确新分析时使用 previousJobId，禁止未知费用绕过 |
| GET /api/document-jobs/[jobId] | 无 | 状态、有限错误码、可读取的 extractionId |
| POST /api/document-jobs/[jobId]/cancel | expectedRevision、mutationId | 取消状态；不承诺撤回已发出的请求 |
| POST /api/document-consents/[consentId]/revoke | mutationId | 同步撤销未来发送资格，关联运行取消请求 |
| POST /api/planning/material-contexts | selectionRef、scope、source、audit、availability、target、planningDate、selectedScope、mutationId | contextVersionId、previewToken、结构化预览 |
| POST /api/planning/generate | 现有输入 + 可选 materials 引用 | 现有结果；私有说明经单独受权读取 |
| POST /api/planning/material-replans | goal scope、selectionRef、contextVersionId、previewToken、mutationId | 现有 proposed 结果 |
| GET /api/planning/material-contexts/[contextVersionId] | 无 | 有效上下文的私有说明；已失效不返正文 |
| DELETE /api/documents/[documentId] | expectedRevision、mutationId | deletionJobId、revoked / cleanup-pending |
| GET /api/document-deletions/[deletionJobId] | 无 | revoked / cleaning / failed / completed |

新材料接口错误码：400 严格 schema/无效请求；401 未登录；403 同源/用途校验失败；404 不存在或非 owner；409 版本/幂等冲突；410 自己曾拥有但现已失效的上下文；413 字节上限；422 引用/映射语义不合法；429 并发或配额；503 功能未就绪。旧 planning 接口保留现有错误映射，不全面改为 422。

所有响应 `Cache-Control: private, no-store`；写操作沿用现有会话与同源校验方式。正文不进入 URL、日志、错误对象或 tracing attributes。分页、状态轮询和详情读取也有所有者校验。

## 6. P0-01：核对基线并固定影响面

**Files:** Create 基线记录；Read 第 3 节列出的既有模块、`package.json`、`db/schema.ts`、`build/cloudflare-target.ts`、`drizzle/meta/_journal.json`。

- [x] 进入 APP_ROOT，记录 `git branch --show-current`、`git rev-parse HEAD`、`git status --short`，保留原有改动清单。
- [x] 用 `rg --files drizzle` 核实迁移序号；核对 `package.json` 的 Node 下限和本地 `node --version`。
- [x] 对照 10 月 30 日发布记录，分别记录“本地提交”“发布记录”“尚未实时验证”的状态。
- [x] 在基线文档逐项登记四步 Setup、创建恢复、uncertain、历史只读、exact-set 重排、Research 来源验证、伙伴现有上下文边界。
- [x] 执行以下局部基线回归，记录实际通过/失败。已有失败单列，不归咎于未来资料改动。
- [x] 基线文档与独立 SQL 探针共同提交为 `e54a7ad`；未混入先前设计文档和阶段 1 计划。

~~~powershell
npm run test:unit -- tests/contracts/planning-api.test.ts tests/components/setup-draft.test.ts tests/components/research-setup-activation.test.tsx tests/lib/planning/agent-replanned.test.ts tests/server/planning-history.test.ts
~~~

预期：上述现有行为通过；失败则先定位是不是环境/既有问题。这里不执行 deploy、远程迁移、真实研究或模型请求。

## 7. P0-02：定义严格契约与作用域

**Files:** Create `app/contracts/documents.ts`、`app/contracts/material-planning.ts`、`tests/contracts/documents.test.ts`、`tests/contracts/material-planning.test.ts`；更新新增契约规格文档。

- [x] 先加入以下失败测试及第 4.1 节五种作用域的 schema 用例；补充 AI 输出 independent 被拒、核对草稿 revision 冲突、迟到结果不覆盖人工修改的契约用例。
- [x] 运行 `npm run test:unit -- tests/contracts/documents.test.ts tests/contracts/material-planning.test.ts`；预期新模块尚未实现而失败。
- [x] 实现第 4.4 节核心 schema；为资料、AI 候选、review draft、确认、selection 添加明确版本、状态和有界数组；固定第 4.5 节主流程与兜底交互。
- [x] 将原文候选、用户补充、用户自评分开建模；确认条目禁止携带任意 audit 覆盖数据。
- [x] 增加数组唯一性、slot 数量、最大序列化体积和材料引用组合校验。
- [x] 重跑测试，预期全部通过；提交上述精确文件，建议说明：`feat: define strict private material contracts`。

~~~ts
import { describe, expect, it } from "vitest";
import { materialSourceRefSchema } from "../../app/contracts/documents";

describe("private source references", () => {
  const source = {
    documentId: "doc-a", documentVersionId: "version-a",
    textVersionId: "text-a", start: 0, end: 4,
  };
  it("accepts a version-bound half-open range", () => {
    expect(materialSourceRefSchema.parse(source)).toEqual(source);
  });
  it("rejects caller owner and storage keys", () => {
    expect(materialSourceRefSchema.safeParse({
      ...source, ownerId: "user-b", objectKey: "private/body",
    }).success).toBe(false);
  });
  it("rejects empty ranges", () => {
    expect(materialSourceRefSchema.safeParse({ ...source, end: 0 }).success).toBe(false);
  });
});
~~~

**验收：**未知字段、交叉版本、重复 slot、过大条目必须有明确失败样例；未知能力保持未知，缺少简历信息不能产生“能力不足”的默认值。

## 8. P0-03：冻结接口、错误和功能开关

**Files:** Create `app/contracts/documents-api.ts`、`app/server/documents/policy.ts`、`tests/server/document-policy.test.ts`；补充两个契约测试文件。

- [x] 为 `ARC_DOCUMENTS_ENABLED=false`、分析配置缺失、误传 Research 密钥名、负数预算和正文超限编写表驱动失败测试。
- [x] 运行 `npm run test:unit -- tests/server/document-policy.test.ts tests/contracts/documents.test.ts`，预期新增行为失败。
- [x] 将第 5 节逐个落实为 strict request / response schema，不使用 `z.any()` 接收正文或任务状态。
- [x] 用以下模式固定独立开关和限制；实现分析配置读取时，只读取显式的 document 配置键。
- [x] 为每个写请求定义 owner + endpoint + mutationId 的请求摘要规则；同键异载荷返回 409，不返回旧成功响应。
- [x] 重跑测试通过；将错误码、配置名及配额写入契约文档后提交。

~~~ts
export const DOCUMENT_LIMITS = Object.freeze({
  documentsPerOwner: 30,
  textVersionsPerDocument: 10,
  codePointsPerText: 50_000,
  codePointsPerOwner: 1_000_000,
  textBytes: 256 * 1024,
  requestBytes: 512 * 1024,
  structuredBytes: 128 * 1024,
  contextBytes: 256 * 1024,
  concurrentAnalysisPerOwner: 1,
  queuedAnalysisPerOwner: 5,
  queuedAnalysisTtlMs: 30 * 60 * 1000,
});

export function documentFlags(env: Readonly<Record<string, unknown>>) {
  return Object.freeze({
    documents: env.ARC_DOCUMENTS_ENABLED === "true",
    analysis: env.ARC_DOCUMENT_ANALYSIS_ENABLED === "true",
    planning: env.ARC_DOCUMENT_PLANNING_ENABLED === "true",
  });
}
~~~

**验收：**关闭资料模型分析不影响 Research、planner/tutor；没有 model/price/budget 配置时分析关闭但人工录入不报模型错误。

## 9. P0-04：确定数据模型、提交栅栏和删除链路

**Files:** Create `app/server/documents/repository.ts`；更新契约规格文档。阶段 0 先审查 SQL 与接口，正式应用迁移在 P1-01 创建。

- [x] 固定以下物理表，不把原始正文放入既有规划 generation/event JSON。
- [x] 为 owner + document/version/confirmation 的复合外键和唯一约束编写 SQL 样例。
- [x] 写明 R2 写入与 D1 提交之间的补偿规则，以及删除后迟到写入的回收方式。
- [x] 对首次生成、已有目标提案、接受提案分别列出一个 D1 batch 内的所有检查和写入。
- [x] 用 SQLite 小样验证“末尾 guard 失败时整个 batch 回滚”，采用 `tests/helpers/sqlite-d1.ts`；此处验证机制，不假称生产表已经创建。
- [x] 将表职责、字段上限和事务边界提交为契约文档；建议说明：`docs: freeze material persistence and commit guards`。

| 网站应用 D1 表 | 内容与关键约束 |
| --- | --- |
| documents | owner、kind、revision、lifecycle、generation；同 owner 隔离 |
| document_versions | 不可变正文元数据、textVersion 指针、存储状态、字符/字节配额 |
| document_text_versions | 规范化/允许发送文本引用、parserVersion、文本摘要 |
| document_extractions | textVersion、jobId、AI 候选及有界问题列表 |
| document_review_drafts | 同 owner/textVersion 的预填核对草稿、extractionId、origin、revision；正文只存服务端 |
| document_confirmations | 只追加确认内容、source text version、origin |
| material_selections | scope、selectionRevision、state、boundGoalId |
| material_selection_entries | 明确 slot、版本和 confirmation；跨 owner 外键禁止 |
| goal_document_links | 已成功关联的采用版本；主 JD/简历唯一 |
| planning_context_versions | 输入快照、策略/映射版本、指纹、状态、过期时间 |
| document_usage_links | 文档→确认→上下文→计划/候选的依赖索引 |
| document_processing_consents | 精确文本版本、purpose、policy、撤销状态 |
| document_jobs | owner、jobId、发送状态、revision、generation、队列时间/到期、execution_slot、结果/错误引用；每 owner 最多一个执行/费用未明占位 |
| document_budget_reservations | jobId 唯一、整数预留/实际/未知费用 |
| document_budget_counters | 用户/全局 UTC 日用量，事务内条件预留 |
| document_mutations | owner + scope + mutationId 唯一、bodyDigest、无正文回执 |
| document_storage_operations | R2 写入/清理意图、引用、重试和保守配额 |
| document_deletion_jobs | 删除进度、已撤销状态和未完成清理引用 |

独立资料执行器 D1 仅保存任务 claim、发送栅栏、回执摘要、投递状态及维护记录。执行器不绑定整个应用 D1、不绑定 Proof R2、不取得 Research/Agent 密钥。网站通过专用双向 service binding 提供有限资料任务接口；执行器结果正文放在专用私有任务 R2，网站取回验证后清理。

**原子提交规则：**

1. 应用 D1 中锁定 owner、selection revision、所有资料 lifecycle/generation、confirmation、context、活动目标、workspace revision、Research source 版本。
2. 同一 batch 保存计划或候选、usage links、目标资料关联和幂等摘要。
3. 最后一条 guard 写入要求上述状态依然吻合；不吻合时触发约束失败，使整个 batch 回滚。只做服务层预读或只检查 UPDATE 的 changes 不足以保证原子性。
4. 对同一 mutation 的重试，先核对请求摘要和资料有效状态；删除后不能返回带已删除资料的缓存响应。
5. 删除事务先递增文档 generation、撤销确认/上下文、使 pending 提案不可接受、写清理任务，再异步清对象。清理失败保持“已撤销，清理中”。

guard 的可执行 SQLite 最小例子：

~~~sql
CREATE TABLE commit_guards (
  mutation_id TEXT PRIMARY KEY,
  passed INTEGER NOT NULL CHECK (passed = 1)
);
-- 在与业务写入相同的事务中执行；绑定 0 必须使整个事务失败。
INSERT INTO commit_guards (mutation_id, passed)
VALUES ('guard-example', 0);
~~~

正式实现使用该约束思想嵌入 `document_mutations` 或现有幂等记录，不为每次提交永久新增无业务意义的 guard 表。

## 10. P0-05：验证独立 Workflow 的单次发送与恢复

**Files:** Create `app/server/documents/provider.ts`、`worker/document-executor/job-state.ts`、`worker/document-executor/workflow-policy.ts`、`tests/helpers/materials-fixture.ts`、`tests/server/document-job-state.test.ts`、`tests/fixtures/documents/workflow-probe.ts`、`tests/server/document-workflow-probe.test.ts`。

- [x] 先创建下方 Provider 接口，再定义假 Provider 的成功、确定未发送失败、发送后失联、返回畸形候选、延迟返回五种模式；计数器持久化，不只保存在 JS 内存。
- [x] 先写重复执行、并发 claim、串行 JD/简历任务、待发过期、进程重启、取消/删除后迟到结果的失败测试；未知费用必须保留执行占位。
- [x] 运行 `npm run test:unit -- tests/server/document-job-state.test.ts tests/server/document-workflow-probe.test.ts`，预期新增模块未实现而失败。
- [x] 实现以下任务状态和发送判定；DB claim 与发送栅栏用条件写入，更新结果也检查 revision、generation、consent。
- [x] 在独立 Miniflare Workflows 探针中注入“发送后抛错”和“持久化结果后投递失败”，重启运行时继续查状态。
- [x] 检查 Workflow 参数、step 输出、失败消息与 status 中均无合成敏感标记；仅返回 jobId/状态/结果引用。
- [x] 重跑两组测试通过，记录实际运行时证据和限制，再提交精确文件。

~~~ts
// app/server/documents/provider.ts：仅运行时内存边界，不是 Workflow DTO。
export type DocumentProviderInput = Readonly<{
  textVersionId: string;
  text: string;
  segments: readonly Readonly<{ id: string; start: number; end: number }>[];
  kind: "resume" | "jd" | "supplement";
  providerPolicyId: string;
  outputSchemaVersion: "2026.11.1";
}>;
export type DocumentProviderOutcome =
  | Readonly<{ kind: "received"; candidate: unknown;
      inputTokens: number | null; outputTokens: number | null;
      actualMicroUsd: number | null; receiptId: string | null }>
  | Readonly<{ kind: "not-sent"; code: "configuration" | "aborted-before-send" }>
  | Readonly<{ kind: "unknown"; code: "timeout" | "connection-lost" | "invalid-receipt" }>;
export interface DocumentAnalysisProvider {
  analyze(input: DocumentProviderInput, signal: AbortSignal): Promise<DocumentProviderOutcome>;
}
~~~

`candidate` 进入网站验证器之前保持 unknown，不能直接进入规划。成功收到候选但缺少费用回执时，候选可进入待确认，费用仍为 held-unknown；任务执行状态与费用状态独立，不因有输出而假定费用已知。

~~~ts
export type DispatchState = "not-sent" | "may-have-sent" | "settled";
export type DocumentJobState =
  | "queued" | "running" | "succeeded" | "failed"
  | "cancel-requested" | "cancelled" | "revoked" | "cost-unknown";

export function mayDispatch(input: {
  state: DocumentJobState;
  dispatch: DispatchState;
  consentValid: boolean;
  generationMatches: boolean;
  budgetReserved: boolean;
  executionSlotOwned: boolean;
}): boolean {
  return input.state === "queued"
    && input.dispatch === "not-sent"
    && input.consentValid
    && input.generationMatches
    && input.budgetReserved
    && input.executionSlotOwned;
}

export const DOCUMENT_PAID_STEP_CONFIG = Object.freeze({
  retries: { limit: 0, delay: "1 second", backoff: "constant" },
  timeout: "4 minutes",
} as const);
~~~

~~~ts
import { expect, it } from "vitest";
import { mayDispatch } from "../../worker/document-executor/job-state";

it("does not resend an ambiguous external request", () => {
  expect(mayDispatch({
    state: "cost-unknown",
    dispatch: "may-have-sent",
    consentValid: true,
    generationMatches: true,
    budgetReserved: true,
    executionSlotOwned: true,
  })).toBe(false);
});
~~~

**必须得到的观测结果：**

| 故障注入 | 预期 |
| --- | --- |
| 同 jobId 重复创建 Workflow | 同一持久任务，最多一次本地发送尝试 |
| 两个执行实例竞争 | 只有一个获得发送栅栏 |
| 同用户先提交 JD 再提交简历 | 一个执行、一个等待；结算后后台推进，不依赖浏览器 |
| 等待超时或用户撤销待发任务 | 确认未发送后释放预留；unknown-cost 占位不释放 |
| 外部发送之后退出 | cost-unknown，预留保留，不自动重发 |
| 已保存结果但投递失败 | 仅重试结果投递；Provider 调用次数不增加 |
| consent 撤销/文档删除后迟到返回 | 结果不得生效，进入清理；费用仍按实际/未知结算 |
| 页面关闭/刷新 | 后端任务独立运行，查询不创建任务 |
| 未发送前的临时基础设施错误 | 可重试 claim/投递；重试仍须重新验证预算与资格 |
| Workflow 步骤失败 | 不由框架自动再次调用收费接口 |

这里证明的是“每个任务最多一次本地发送尝试 + 不明结果保守处理”。不承诺外部非幂等服务的全局 exactly-once，也不承诺撤销已传出的字节。

## 11. P0-06：冻结私有上下文、指纹与兼容方案

**Files:** 更新 `app/contracts/material-planning.ts`、`tests/contracts/material-planning.test.ts`、契约文档；记录规划服务、D1 仓储、path builder 的未来扩展点。

- [x] 定义 ContextInputSnapshot，包含 selectionRef、scope、sourceReference、版本依赖、完整 audit/availability/target 的规范化摘要、planningDate、selectedScope、策略版本。
- [x] 定义公开到当前用户的引用对象；不把完整上下文塞入现有 workspace、sourceContext 或公共 blueprint。
- [x] 为相同规范化输入相同指纹、确认变化指纹变化、删除后回放拒绝编写契约案例。
- [x] 固定语义指纹用 SHA-256；使用现有 canonicalJson 的规范化原则。现有 `p2-` 指纹继续用于原规划行为，不用它承担授权或不可猜测性。
- [x] 约定无资料路径不添加 undefined/null 哨兵字段，不改变旧 path ID 和 fingerprint。
- [x] 区分“已有计划读取/学习事件回放”与“按私有上下文重新生成”；前者只读保留的公共任务结构，后者必须检查 context 有效性。
- [x] 执行契约测试和现有 planning-api/fingerprint 测试，全部通过后提交。

~~~ts
import { z } from "zod";
import {
  materialIdSchema,
  materialSelectionRefSchema,
} from "./documents";

export const materialPlanningReferenceSchema = z.object({
  contextVersionId: materialIdSchema,
  selectionRef: materialSelectionRefSchema,
  previewToken: z.string().regex(/^[0-9a-f]{64}$/u),
}).strict();
~~~

`previewToken` 是服务端返回的规范化预览摘要，用于前后端一致性比较，不是授权凭证。仅凭 token 不可读取资料；提交仍要验证 owner、全部版本、活动目标和有效期。

语义指纹输入不包含随机 context ID、创建时间、展示排序等无关因素；包含 owner/scope、已选版本和策略版本。实际私有内容不通过这个摘要公开查询。

**回放决策：**

- 无 materials 的旧请求：完全按旧语义处理。
- 已提交的普通学习事件：不依赖已删资料正文，保留进度和历史。
- 携带失效 contextVersionId 的新生成/旧请求重试/接受资料候选：410 或既有接口对应的冲突状态，不复活上下文。
- 删除后现有计划页可以显示“资料依据已删除”，但不能用公共上下文静默伪造当时的个性化理由。
- Repository generation/event JSON 只保存不含私人经历的任务结构和普通已确认自评；私有说明必须在可清理的 sidecar 中。

## 12. P0-07：固定优先级算法和验收样例

**Files:** 更新 `tests/helpers/materials-fixture.ts`、契约规格文档、阶段 0 结果文档。此任务固定算法和样例，生产规划引擎在 P1-09 修改。

- [x] 从现有 path builder 测试抽取小型合法 blueprint/registry 合成样例，明确记录 unit 数量、依赖和工时。
- [x] 固定五类验收输入：无资料、仅 JD、仅简历确认、自评 uncertain、未覆盖/冲突。
- [x] 为首次生成与当前路线重排分别写出精确预期任务集合和顺序。
- [x] 固定下表优先级；只比较 ready 集合，不全局排序后修补依赖。
- [x] 固定 target-date 保护集为“原 core 及依赖 + 已确认 JD must 及依赖”；不可满足时显示不可行，不删除必备项凑日期。
- [x] 把样例预期结果写入结果文档，与阶段 1 测试一一对应后提交。

| ready 集合内层级 | 判定 |
| --- | --- |
| 0 | JD must，用户确认需学习：unseen / conceptual / guided |
| 1 | JD must，用户明确 uncertain；保留校准和学习顺序 |
| 2 | JD must，用户明确 independent；只使用原规则允许的校准 |
| 3 | 用户确认与职责相关的现有实践任务 |
| 4 | JD preferred |
| 5 | 其余既有任务 |

高优先级目标的前置依赖继承其最小层级，避免目标很急但前置被低优先级任务长期挡住；不改变依赖关系。平局按原稳定顺序和 ID。

**固定样例：**

- 角色具有 `foundation`、`sql`、`ui`、`analytics` 四项；analytics 依赖 sql，sql 依赖 foundation。
- 原顺序 foundation → ui → sql → analytics。
- 确认 JD 把 analytics 列为 must，用户确认 analytics 需要学习；新顺序 foundation → sql → analytics → ui。
- 若 sql 自评 uncertain，则 sql 校准和学习都保留，完成校准仍保留学习。
- 若已创建路线只能重排，其 unfinished ID 多重集合与原集合完全一致；不能把 sql learn 替换为 calibrate。
- JD 的 Kubernetes 在样例注册表不存在：输出 uncovered 条目，不产生 Kubernetes 课程/任务。
- 资料里包含课程 URL：只作为用户资料文字，不加入资源目录，也不触发联网请求。

## 13. P0-08：AI 评测集、质量准入与阶段交接

**Files:** 完成新增契约规格和 `docs/verification/2026-11-04-materials-phase-0-results.md`；Create `tests/fixtures/documents/quality-corpus.json`、`tests/helpers/document-quality-evaluation.ts`、`tests/server/document-quality-evaluation.test.ts`。

- [x] 固定 24 份合成资料：12 份简历、12 份 JD。其中 18 份普通样例（各 9 份）覆盖中文、英文和混合文本；6 份边界样例（各 3 份）覆盖注入、冲突、缺失、目录外要求和团队经历误判。
- [x] 为每份样例标注关键事实/要求、must/preferred、可定位原文、预期技能词、自评核对点和应拒绝的候选；只使用虚构人物/公司与明确合成文本。
- [x] 写评测器失败测试：关键项遗漏、必备误标加分、错误引用、unsupported independent、普通样例无法预填，分别不能被总体平均分抵消。
- [x] 运行 `npm run test:unit -- tests/server/document-quality-evaluation.test.ts tests/contracts/documents.test.ts tests/server/document-workflow-probe.test.ts`；先确认新评测行为失败，再实现固定标注的一对一匹配和逐文档判定，重跑通过。
- [x] 固定下方质量准入门槛，记录其为目标值；本阶段用合成候选测试评测口径，不声称已取得真实模型成绩。
- [x] 记录模型资格表：精确 endpoint、策略/价格版本、输入上限、处理政策、固定路由、是否回退、用量/费用回执；后续真实调用只能在已授权范围内进行。
- [x] 检查两份计划和方案的 API、字段、状态、队列及核对交互一致，运行 P0 新增测试及基线回归。
- [x] 按 Gate 0 写交接结论；真实模型尚未验证时标为“AI 主路径契约和离线机制就绪，真实质量/端点/预算待阶段 1 验证”，不能把人工兜底标为产品已完成。

**阶段 1 必须达到的模型与体验门槛：**

| 项目 | 目标及判定口径 |
| --- | --- |
| 普通样例核对体验 | 18/18 均可从预填页核对完成，不从空表重录整份资料 |
| 关键项召回 | 每份普通样例对人工标注的关键项召回 ≥ 90%；零标注项的样例不计此项 |
| JD 必备/加分分类 | 每份普通 JD 的可分类标注项正确率 ≥ 90%，遗漏算错；无类别标注时记不适用 |
| 候选来源 | 进入核对页的保留候选 100% 通过结构、同版本片段及短引用验证 |
| 边界与权限 | 6/6 边界样例满足拒绝或需核对规则；未授权外发、跨 owner、无依据独立掌握、重复发送、删除后生效均为零容忍失败 |
| 运行证据 | 记录实际模型/路由/策略、输入输出 token、费用、排队/处理时延；未知费用按保守状态处理 |
| 人工兜底 | 拒绝、失败、额度不足、暂不可用均能继续；修改可恢复且不被迟到 AI 覆盖 |

按预先标注的来源片段和语义条目建立一对一匹配，不能用输出条目数冒充召回，也不通过额外 LLM 评分调用增加费用。真实模型最多每份样例一次初始调用；需再次验证时形成新的受控评测轮次及预算，不自动循环到通过。

### Gate 0：允许进入阶段 1 的条件

- [x] 已确认 APP_ROOT 与迁移序列，现有修改受到保护。
- [x] AI 候选、核对草稿、自评采用、来源、quota、API、作用域和版本已固定。
- [x] 默认 AI 操作、预填核对、重点冲突和手动兜底的状态/用例明确。
- [x] 同 owner 约束及原子关联/原子失效设计经本地 SQL 验证。
- [x] 独立 Workflow 探针通过排队、重复、崩溃、迟到、删除及投递恢复测试。
- [x] Workflow 参数/输出/错误无正文，Research/Agent 配置隔离。
- [x] 指纹、旧请求兼容、历史只读和删除后回放语义明确。
- [x] 首次生成与已有路线重排的验收样例明确。
- [x] 24 份合成评测及逐项门槛固定，质量评测器测试通过。
- [x] 结果文档区分通过、失败、未运行；假 Provider 不替代真实模型准入。
- [x] 可继续阶段 1 的离线开发；真实 AI 未验证会阻止阶段 1 最终完成和主入口开放，人工兜底不能解除该门槛。

## 14. 验收覆盖与执行纪律

| v2.1 验收项 | 本阶段产出 | 正式闭环位置 |
| --- | --- | --- |
| F03–F08 | 严格 schema、引用、确认及失败隔离契约 | P1-02、03、05、07 |
| F09–F11 | AI 主流程、预填核对、评测门槛和人工兜底 | P1-03、05–07、13、15–16 |
| P01–P05、P10、P11 | 固定输入、优先级与合法性案例 | P1-08 至 12 |
| P06–P09、P12–P14 | 作用域、事务、回放契约 | P1-08、10、11、14、15 |
| P15 | 来源边界不变 | P1-09、15 |
| S01–S05 | owner/正文边界、删除和浏览器草稿规则 | P1-01、02、04、13–15 |
| R01–R04、R06、R07 | 假 Provider + 本地运行时证据 | P1-05、06、07、14、15 |
| R05 | 清理状态和补偿协议 | P1-02、14 |
| U01 | 四步接入位置固定 | P1-13 |
| F01/F02 的文件部分、S04 文件攻击 | 阶段 2，不在此实现 | 保留 v2.1 的后续阶段 |
| S06/S07 | 阶段 1 禁止资料投影；完整 Agent 删除传播属阶段 3 | P1-15 检查未新增注入 |

本次执行保留了“行为测试失败 → 最小实现 → 对应测试通过”的证据；共享契约任务按依赖分组提交。两轮独立审查发现的问题均修复并再次通过测试。仅暂存任务列出的文件，不使用 `git add -A` 把原有改动一起提交。本文命令已在对应任务及最终合并回归执行；精确结果和未运行范围以验收结果文档为准。
