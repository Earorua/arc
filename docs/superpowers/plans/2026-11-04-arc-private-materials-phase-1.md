# Arc 私有资料：阶段 1 详细实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让登录用户通过“粘贴简历/JD → 明确允许 → AI 自动分析和预填 → 核对修改 → 预览 → 保存/接受”得到可执行、可追溯的个性化学习计划，人工填写仅在拒绝外发或异常时兜底。

**Architecture:** AI 分析是阶段 1 必交主路径，由独立资料 Worker / Workflow 提取候选并预填服务端核对草稿；用户核对修改并明确采用自评后进入确定性规划。人工与 AI 共用确认/映射契约，人工仅作兜底。私有上下文按版本冻结，首次生成扩展优先级，已有路线仅合法重排，资料关联与计划保存使用同一应用 D1 事务。

**Tech Stack:** 现有 React、TypeScript、Zod、Vitest、Drizzle、Cloudflare Workers / Workflows、D1、私有 R2；不引入文件解析库或向量数据库。

---

## 1. 文档状态、依据和实施边界

- 日期：2026-11-04，Asia/Shanghai。**已执行阶段 1 离线开发与测试；真实模型、远程迁移和部署未执行。阶段 1 整体准入仍未完成。**
- 总体依据：[v2.1 方案](C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/.worktrees/ui-warm-precision/docs/superpowers/specs/2026-09-11-arc-private-materials-personalized-planning-design.zh-CN.md)。
- 前置：[阶段 0 计划与 Gate 0](C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/.worktrees/ui-warm-precision/docs/superpowers/plans/2026-11-04-arc-private-materials-phase-0.md)。P0 冻结的配额、字段、错误码和状态机适用于本文。
- APP_ROOT：[最新 ui-warm-precision 应用目录](C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/.worktrees/ui-warm-precision)。所有相对文件路径均以此为根。
- 设计核对基线：`63d7b2ee5533fe8e8a6e3077f30198f8cfd3d753`；本轮执行基线为已完成阶段 0 的 `2caa51d`，分支 `codex/materials-phase-1-offline-20261104`，改动位于上述 APP_ROOT。
- 下文保留原实施任务、建议命令和拆分提交安排作为设计依据；实际文件组织、已执行命令、测试数量及限制以[本轮结果报告](../../verification/2026-11-04-materials-phase-1-results.md)为准。离线 SQLite/Miniflare 已执行迁移验证，未运行远程迁移。
- v2.1 本身仍是设计草案；本文补充的配额、状态、具体路径和任务顺序作为实施默认决策，执行前由阶段 0 固化。

**本轮实施记录：** P1-01～P1-14 的离线代码及回归已落地；P1-15 完成固定候选、评测器、组件和本地运行时验证，真实模型 24 项均为 NOT RUN；P1-16 已形成运行/回退手册，云端检查保留。真实资格记录实际位于 `docs/superpowers/reports/2026-11-04-private-materials-model-qualification.md`，运行手册位于 `docs/superpowers/runbooks/2026-11-04-private-materials-phase-1.md`。Research 三个套件的基线哈希问题已按 Git 历史与字节差异核实并修复，严格校验保留；无排除全仓回归为 335 个文件、7,273 项全部通过，详见[修复记录](../../verification/2026-11-04-research-smoke-baseline-repair.md)。Gate 1B 仍为 NOT RUN，阶段 1 整体准入未完成。

**阶段内交付：**

1. 登录用户私人资料列表、粘贴文本、版本、AI 预填核对、确认与删除。
2. 必交的 AI 结构化分析、来源定位、有界后台排队和真实模型准入；未允许外部处理时 Provider 调用数为 0。
3. 主简历/主 JD/补充资料的显式选择，含无 goalId 的创建草稿。
4. 映射已有技能、标记未覆盖和冲突、明确采用用户自评。
5. 首次生成的私有优先级与目标范围保护；当前路线的 exact-set 重排提案。
6. 预览、采用、放弃、失效提示、错误恢复、费用与删除竞态处理。
7. 用户拒绝、分析失败、额度不足或服务不可用时的手动兜底；保留 AI 已成功结果和用户修改，迟到候选不自动覆盖。

阶段 2 的 PDF/DOCX/TXT/MD 上传、OCR、链接抓取不进入首版 UI；资料全文/摘要不接入 planner/tutor。导入不自动授予 independent、verified 或公开 Proof。

## 2. 里程碑与任务依赖

| 任务 | 交付 | 依赖 | 建议拆分提交 |
| --- | --- | --- | --- |
| P1-01 | 迁移、所有者约束、仓储事务 | Gate 0 | schema / migration / repository |
| P1-02 | 文本保存、版本、私有读取 | 01 | text / storage / API |
| P1-03 | AI 结果核对草稿、确认和技能映射 | 02、P0 候选样例 | review draft / confirmation / mapping |
| P1-04 | 草稿与目标资料选择 | 01、03 | selection / scope recovery |
| P1-05 | 允许记录、预算、串行待发队列和任务 API | 02 | consent / budget / job |
| P1-06 | 独立执行器与持久工作流 | 05、P0-05 | bridge / workflow / recovery |
| P1-07 | 必交 AI Provider、候选校验和预填衔接 | 03、06 | provider / validator / prefill |
| P1-08 | 规划上下文与预览凭据 | 03、04、07 | context / projection / API |
| P1-09 | 确定性优先级与范围保护 | 08 | pure rules / path builder |
| P1-10 | 首次生成与原子关联 | 08、09 | generate / atomic binding |
| P1-11 | 当前路线提案、接受/放弃 | 08、09 | proposal / decision guards |
| P1-12 | 私有解释和历史只读展示 | 10、11 | explanations / read projection |
| P1-13 | 四步 AI 默认操作、核对与兜底 UI | 02–12 | client / AI review / fallback |
| P1-14 | 完整删除、撤销和清理恢复 | 01–12 | revoke / cleanup / race tests |
| P1-15 | AI 质量、端到端、兜底和兼容验收 | 07、13、14 | offline / real qualification / regression |
| P1-16 | 功能开关、交付与上线准备 | 15 | runbook / release gate |

- **M1：AI 分析基础就绪。**01–07 完成，合成输入经假 Provider 生成可核对候选，任务/费用/来源机制通过；这是内部技术里程碑，不是独立发布版。
- **M2：AI 主路径离线闭环就绪。**08–15 的本地集成、四步 UI、规划、兜底及删除通过，正常样例从预填页完成；真实模型未验证时仍标记未完成准入。
- **M3：阶段 1 完成、可进入发布流程。**补齐 P1-15 的真实端点评测及 P1-16 两道验收门槛；生产部署按后续授权执行。
- 粗估：整体约 **18–28 人日**，AI 基础、核对草稿、真实质量验证和人工兜底都计入必要工作；人工流程不再作为可替代的提前完成版本。

关键路径：01 → 02 → 03 → 05 → 06 → 07 → 08 → 09 → 10/11 → 12 → 13 → 14 → 15 → 16。04 在 03 后准备资料作用域，并在 08 前完成；10、11 分别实现首次生成与已有路线重排。可利用固定候选提前开发规则和界面，但 05–07 不再是可跳过的增强支线；真实 AI 未准入时不得宣布阶段 1 完成。

## 3. 文件职责地图

### 3.1 新增领域和服务模块

| 操作 | 路径 | 职责 |
| --- | --- | --- |
| Modify（依赖 P0 产物） | `app/contracts/documents.ts`、`app/contracts/documents-api.ts`、`app/contracts/material-planning.ts` | 补齐实现所需的有界输出，不放宽 strict |
| Modify（依赖 P0 产物） | `app/server/documents/repository.ts`、`app/server/documents/policy.ts`、`app/server/documents/provider.ts` | 冻结接口、配额与 Provider 契约 |
| Create | `app/server/documents/d1-repository.ts` | 所有者隔离、CAS、配额和幂等持久化 |
| Create | `app/server/documents/text.ts` | 换行规范化、大小和定位 |
| Create | `app/server/documents/storage.ts` | 专用私有 R2 读写与补偿 |
| Create | `app/server/documents/service.ts` | 资料创建/版本/读取用例 |
| Create | `app/server/documents/review-service.ts` | AI 候选预填、核对草稿 CAS、迟到结果保护 |
| Create | `app/server/documents/confirmation-service.ts` | 核对草稿与来源核验、不可变确认 |
| Create | `app/server/documents/selection-service.ts` | 草稿和当前目标资料选择 |
| Create | `app/server/documents/consent-service.ts` | 精确文本版本和用途允许/撤销 |
| Create | `app/server/documents/budget-repository.ts` | 原子预留、结算、未知费用 |
| Create | `app/server/documents/job-service.ts` | 任务创建/查询/串行准入/取消/恢复 |
| Create | `app/server/documents/extraction-validator.ts` | 模型候选验证和引用回读 |
| Create | `app/server/documents/context-builder.ts` | 版本冻结和预览摘要 |
| Create | `app/server/documents/deletion-service.ts` | 立即撤销、依赖失效和清理编排 |
| Create | `app/server/documents/runtime.ts` | 服务实例和专用绑定装配 |
| Create | `app/server/documents/executor-bridge.ts` | 网站与执行器的私有协议 |
| Create | `app/lib/materials/skill-mapper.ts` | 已有技能映射、歧义/未覆盖 |
| Create | `app/lib/materials/planning-priority.ts` | 依赖闭包和稳定拓扑优先级 |
| Create | `app/lib/materials/explanations.ts` | 结构化解释模板，无模型调用 |
| Create | `app/server/planning/material-commit.ts` | 原子规划提交的资料 guard / 关联 SQL |

### 3.2 现有接入点

| Modify | 修改边界 |
| --- | --- |
| `db/schema.ts`、`drizzle/meta/_journal.json` | 新增资料表，不改写旧迁移 |
| `app/contracts/planning-api.ts` | 可选 materials 引用及严格交叉校验，旧分支保留 |
| `app/lib/planning/path-builder.ts` | 可选私有 overlay；无 overlay 沿用原行为 |
| `app/server/planning/service.ts`、`app/server/planning/repository.ts` | 生成/重排接收服务端验证后的上下文及提交 guard |
| `app/server/planning/d1-planning-repository.ts` | 资料关联、guard 与计划写入同一 batch |
| `app/server/http/planning-route-factories.ts` | 装配材料服务，原错误和限额语义保持 |
| `app/components/setup/setup-flow.tsx`、`app/components/setup/adaptive-setup-flow.tsx` | 现有四步和创建恢复接入 |
| `app/components/setup/target-step.tsx`、`app/components/setup/skill-audit-step.tsx` | JD、简历和确认入口 |
| `app/components/setup/setup-draft.ts` | 仅存服务端引用，兼容旧草稿 |
| `app/components/workspace/workspace-shell.tsx`、`app/components/workspace/plan-diff-review.tsx`、`app/components/workspace/plan-history.tsx` | 私有资料入口、候选状态、历史依据 |
| `app/lib/planning-client.ts`、`app/lib/use-planning-workspace.ts` | 预览凭据、过期处理、状态刷新 |
| `build/cloudflare-target.ts`、`worker/index.ts` | 本地专用绑定/环境类型，不变更正式部署目标 |

Create 迁移：`drizzle/0014_private_materials.sql`、`drizzle/meta/0014_snapshot.json`。编号执行前按 P0 复核。

### 3.3 新增 API 与 UI

网站路由文件全部采用现有“薄 route + 可注入 route factory”方式：

~~~text
app/api/documents/route.ts
app/api/documents/[documentId]/route.ts
app/api/documents/[documentId]/versions/route.ts
app/api/documents/[documentId]/confirmations/route.ts
app/api/documents/[documentId]/review-draft/route.ts
app/api/material-selections/route.ts
app/api/material-selections/[selectionId]/route.ts
app/api/document-consents/route.ts
app/api/document-consents/[consentId]/revoke/route.ts
app/api/document-jobs/route.ts
app/api/document-jobs/[jobId]/route.ts
app/api/document-jobs/[jobId]/cancel/route.ts
app/api/document-deletions/[deletionJobId]/route.ts
app/api/planning/material-contexts/route.ts
app/api/planning/material-contexts/[contextVersionId]/route.ts
app/api/planning/material-replans/route.ts
app/server/http/document-route-factories.ts
app/server/http/material-planning-route-factories.ts
app/lib/documents-client.ts
app/lib/use-material-selection.ts
app/components/materials/material-text-panel.tsx
app/components/materials/material-library.tsx
app/components/materials/material-confirmation.tsx
app/components/materials/material-selection-summary.tsx
app/components/materials/material-job-status.tsx
app/components/materials/material-context-review.tsx
app/components/materials/materials.css
~~~

### 3.4 独立执行器

~~~text
worker/document-executor/index.ts
worker/document-executor/environment.ts
worker/document-executor/http-routes.ts
worker/document-executor/site-client.ts
worker/document-executor/d1-job-store.ts
worker/document-executor/result-store.ts
worker/document-executor/execute-job.ts
worker/document-executor/workflow.ts
worker/document-executor/runtime.ts
worker/document-executor/maintenance.ts
worker/document-executor/provider-http.ts
worker/document-executor/wrangler.local.jsonc
worker/document-executor/migrations/0000_document_executor.sql
~~~

AI 质量验证另建 `vitest.materials-qualification.config.ts`、`tests/qualification/document-model.qualification.ts` 和 `docs/verification/2026-11-04-materials-model-qualification.md`，复用 P0 的 `tests/fixtures/documents/quality-corpus.json`、`tests/helpers/document-quality-evaluation.ts`。资格套件不匹配常规 `tests/**/*.test.{ts,tsx}`，不会因运行日常测试而触发真实模型。

沿用 P0 创建的 `job-state.ts`、`workflow-policy.ts`。独立执行器本地配置只使用本地资源标识，不复用 Research Executor DB、任务 bucket 或私钥。生产配置另经发布流程生成。

## 4. 共用实施和测试规则

- 每个任务先补行为测试，确认因缺少目标行为失败，再实现，再跑同组测试；禁止只断言内部函数被调用。
- 所有新服务接收 ownerId 作为**已认证服务上下文**，不从 request body 提取 owner；DTO strict。
- 日常测试只用合成简历、JD、固定日期和假 Provider。真实资格套件仅在单独明确启用且模型/预算范围已获授权时运行，仍只用合成资料。统一敏感标记：`PRIVATE-MATERIAL-SENTINEL-7f91`。
- 使用真实 SQLite 验证外键、唯一约束、事务回滚和并发条件，参考 `tests/helpers/sqlite-d1.ts`；Mock D1 只能补充调用边界测试。
- `node:sqlite` / Miniflare 测试标注 `// @vitest-environment node`。新资料数据库测试 helper 要应用 0000–0014；现有 `createResearchD1` 目前只到 0012，不可误认为其已包含 0013。
- 增加 `tests/helpers/materials-d1.ts`：复用 `SqliteD1`，顺序应用应用迁移，注入固定时钟，并在 afterEach 关闭数据库。
- 每个任务完成后仅提交本任务文件，推荐提交说明列在任务末尾；不自动提交其他人已有修改。
- 本文的类型代码表示目标接口/关键规则，不代表源码已存在。跨模块的完整实现以明确输入输出、事务顺序和失败行为为约束，不在文档中复制现有整份大文件。

## 5. P1-01：新增迁移和同 owner 仓储

**Files:** Modify `db/schema.ts`、迁移元数据；Create `drizzle/0014_private_materials.sql`、`app/server/documents/d1-repository.ts`、`tests/helpers/materials-d1.ts`、`tests/db/documents-migration.test.ts`、`tests/server/document-repository.test.ts`。

- [ ] 在空数据库和带 0013 旧数据的数据库分别运行新迁移测试；预期新表尚不存在而失败。
- [ ] 按 P0-04 表清单添加 Drizzle 定义；手动审查生成 SQL，不覆盖 0000–0013。
- [ ] documents 以 `(owner_id,id)` 唯一；版本、确认、selection entries 使用复合外键，不能只靠 globally unique ID 推断 owner。
- [ ] 将 document state / job state / budget state 设置明确 CHECK；JSON 有字节约束，引用可查询字段独立列出。新增 document_review_drafts（owner/textVersion 唯一、extractionId、origin、revision），document_jobs 增加 execution_slot、queuedAt、queueExpiresAt；execution_slot=1 时对 owner 建唯一索引，费用未明仍占位。
- [ ] 实现 revision/generation 条件写入、owner+scope+mutation 唯一键及 bodyDigest 比较。
- [ ] 用相同 SQLite 事务注入末尾 guard 失败，断言前面的 plan/link/selection 写入全部回滚。
- [ ] 运行下方测试全部通过，提交 `feat: add private material persistence and ownership constraints`。

~~~powershell
npm run test:unit -- tests/db/documents-migration.test.ts tests/server/document-repository.test.ts tests/db/migration-safety.test.ts
~~~

**必须包含的数据库测试：**

| 输入/竞争 | 预期 |
| --- | --- |
| owner A 的 selection 引用 owner B 的 confirmation | 外键失败，事务无部分写入 |
| 相同 mutationId + 相同摘要 | 返回同一资源 ID，版本/配额不增加 |
| 相同 mutationId + 不同正文/选择 | 409，既有结果不覆盖 |
| 第 31 份资料 / 第 11 个文本版本 | 条件写入失败；不先写后超限 |
| 两请求抢最后一个配额 | 至多一个成功 |
| 旧 revision 写确认/选择 | 409，无新版本残留 |

复合关联约束示意，最终 SQL 的列名与 schema 保持一致：

~~~sql
CREATE TABLE material_selection_entries (
  owner_id TEXT NOT NULL,
  selection_id TEXT NOT NULL,
  slot TEXT NOT NULL CHECK (slot IN ('resume','jd','supplement')),
  document_id TEXT NOT NULL,
  document_version_id TEXT NOT NULL,
  confirmation_id TEXT NOT NULL,
  PRIMARY KEY (owner_id, selection_id, document_id),
  FOREIGN KEY (owner_id, selection_id)
    REFERENCES material_selections (owner_id, id),
  FOREIGN KEY (owner_id, document_id, document_version_id, confirmation_id)
    REFERENCES document_confirmations
      (owner_id, document_id, document_version_id, id)
);
CREATE UNIQUE INDEX material_selection_main_slot
  ON material_selection_entries (owner_id, selection_id, slot)
  WHERE slot IN ('resume','jd');
~~~

supplement ≤ 3 由同事务检查限制；复合 confirmation 外键目标必须有对应 UNIQUE 定义。

## 6. P1-02：文本版本、私有存储和资料 API

**Files:** Create `app/server/documents/text.ts`、`storage.ts`、`service.ts`、`runtime.ts`、`app/server/http/document-route-factories.ts`；创建 documents/详情/versions 路由；Create `tests/server/document-text.test.ts`、`tests/server/document-storage.test.ts`、`tests/api/documents.test.ts`。

- [ ] 为换行、BOM、中文、emoji、超限、NUL、空正文写失败测试；为跨 owner 读取、非同源写入、流式超限编写 API 测试。
- [ ] 运行 `npm run test:unit -- tests/server/document-text.test.ts tests/server/document-storage.test.ts tests/api/documents.test.ts`，确认目标行为缺失。
- [ ] 实现下方纯文本准备函数；存储规范化正文和固定位置索引，所有后续引用基于这个版本。按最多 2,000 个 UTF-16 单元划分连续片段，边界不得截断代理对；segmentId/start/end 服务端生成，拼接片段须精确还原正文。Provider 只发送一次带 segmentId 的片段正文，避免全文和片段双份计费。
- [ ] D1 先创建写入意图和保守配额预留，服务端生成 R2 key，再写对象，最后 CAS 激活 ready 版本。
- [ ] R2 成功、D1 激活失败时登记对象清理；请求退出后维护任务可发现未激活对象。对象写入不能在删除后自动把资料改回 ready。
- [ ] 路由读取正文时再次验证 owner/lifecycle；返回纯文本数据，禁用缓存，不返回 R2 key/public URL。
- [ ] 跑同组测试，通过后提交 `feat: support private versioned text materials`。

~~~ts
import { DOCUMENT_LIMITS } from "./policy";

export function prepareDocumentText(input: string): string {
  const text = input.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
  if (!text.trim() || text.includes("\0")) throw new Error("INVALID_TEXT");
  if (Array.from(text).length > DOCUMENT_LIMITS.codePointsPerText
    || new TextEncoder().encode(text).byteLength > DOCUMENT_LIMITS.textBytes) {
    throw new Error("TEXT_TOO_LARGE");
  }
  return text;
}
~~~

~~~ts
import { expect, it } from "vitest";
import { prepareDocumentText } from "../../app/server/documents/text";

it("keeps source offsets stable after normalization", () => {
  const text = prepareDocumentText("\uFEFF经历\r\nA😀B");
  expect(text).toBe("经历\nA😀B");
  expect(text.slice(4, 6)).toBe("😀");
});
it("rejects a body above the code point quota", () => {
  expect(() => prepareDocumentText("字".repeat(50_001))).toThrow("TEXT_TOO_LARGE");
});
~~~

**验收：**刷新可恢复已保存文本；仅浏览器内尚未保存的编辑离开前提示。正文、displayName、摘录不进入 analytics/操作日志；quota 失败没有孤儿可读版本。

## 7. P1-03：AI 预填核对草稿、确认和技能映射

**Files:** Create `app/server/documents/review-service.ts`、`app/server/documents/confirmation-service.ts`、`app/server/documents/extraction-validator.ts`、`app/lib/materials/skill-mapper.ts`、confirmations/review-draft route；Create `tests/server/document-review-draft.test.ts`、`tests/server/document-confirmation.test.ts`、`tests/lib/materials/skill-mapper.test.ts`。

- [ ] 先用 P0 的有效 AI 候选写“自动预填”“草稿刷新恢复”“修改后迟到候选不覆盖”“批量确认不授予 independent”“人工兜底 Provider=0”的失败用例；补充伪造 sourceRef 和高影响冲突。
- [ ] 运行 `npm run test:unit -- tests/server/document-review-draft.test.ts tests/server/document-confirmation.test.ts tests/lib/materials/skill-mapper.test.ts`，预期新核对行为缺失而失败。
- [ ] 服务端验证 segmentId 和短引用，对唯一匹配生成 sourceRef，再回读同 owner/textVersion 的区间；原提取候选只读。首次有效结果创建 review draft，用户修改经 expectedRevision 保存草稿，最终确认才生成不可变 confirmation。
- [ ] 实现核对草稿的 origin=ai/manual/mixed 与 extractionId/textVersion 绑定；手动新增条目标记 origin=user，sourceRef 可空。草稿已编辑时新提取结果仅作为待采用候选；用户明确替换才更新，保留对应修正来源。
- [ ] skill mapper 只接收当前有效 blueprint + registry；按精确 ID、版本化别名、用户手选映射，歧义项不靠模糊分数自动采用。
- [ ] 输出 `mapped / ambiguous / uncovered / non-learning`；mapped 仍须有完整合法 track。用技能词自动提出已有技能映射和 selfLevelHint，用户核对；主 JD 的 must/preferred 与用户能力等级分别存储。
- [ ] 普通事实允许批量确认，能力建议有独立采用动作；没有线索的技能可由用户明确批量选 uncertain。independent 仅接受对应技能的显式用户选择，不可由批量 AI 采用产生。
- [ ] 重跑通过，提交 `feat: confirm material facts and map existing skills`。

关键引用校验规则：

~~~ts
export function readSourceSpan(text: string, start: number, end: number): string {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
    || start < 0 || end <= start || end > text.length) {
    throw new Error("SOURCE_RANGE_INVALID");
  }
  const splitsPair = (offset: number) =>
    offset > 0 && offset < text.length
    && /[\uD800-\uDBFF]/u.test(text[offset - 1]!)
    && /[\uDC00-\uDFFF]/u.test(text[offset]!);
  if (splitsPair(start) || splitsPair(end)) throw new Error("SOURCE_RANGE_INVALID");
  return text.slice(start, end);
}
~~~

**明确冲突规则：**

- 既有自评与资料候选冲突：既有自评保持；用户明确采用新自评才更新创建草稿。
- 当前路线的自评变化若需要增删任务：标记“当前重排无法应用此变化”，不创建假成功提案。
- 同一 JD 必备/加分冲突：未确认解决前，该项不进入 priority overlay；其他已确认项仍可使用。
- 未提及技能：保留已有自评，不默认为 unseen；新用户可明确批量采用 uncertain，避免逐个填写空白等级，但不能默认代选。
- 第三方经历真假：不自动验证，不生成 Proof。

## 8. P1-04：资料选择草稿与目标绑定状态

**Files:** Create `app/server/documents/selection-service.ts`、material-selections 两个 route；Create `tests/server/material-selection.test.ts`、`tests/api/material-selections.test.ts`。

- [ ] 写 draft 无 goalId、错误 previousGoalId、跨 owner、slot 重复、旧 revision、绑定后重复提交测试。
- [ ] 运行 `npm run test:unit -- tests/server/material-selection.test.ts tests/api/material-selections.test.ts`，确认失败。
- [ ] 将 scope=draft 与 scope=goal 分开，draft 状态为 open/bound/expired，绑定时记录 boundGoalId 和 generation mutationId。
- [ ] 每次显式采用新资料版本/确认版本递增 selectionRevision，失效所有尚未提交的关联 context 和 preview。
- [ ] 资料库新增版本仅提示“有更新可采用”，不自动更换其他目标的选择；已删除/禁用版本永远不可继续采用。
- [ ] generation 成功前不写正式 goal_document_links；成功绑定逻辑交由 P1-10 同事务完成。
- [ ] 回归通过，提交 `feat: add owner-scoped material selection drafts`。

目标 DTO（schema 在 P0-02/P0-03 中定义）：

~~~json
{
  "mutationId": "select-attempt-1",
  "scope": {
    "kind": "draft",
    "draftId": "setup-draft-1",
    "previousGoalId": null
  },
  "entries": [{
    "slot": "jd",
    "documentId": "document-jd-1",
    "documentVersionId": "document-version-1",
    "confirmationId": "confirmation-1"
  }]
}
~~~

**验收：**activation 请求中断或 generate 重试，不把资料挂到原活动目标；相同成功 mutation 返回相同绑定结果。已绑定 selection 不允许通过改写 draftId 重新使用，复用资料需创建新的 selection。

## 9. P1-05：允许记录、预算和任务 API

**Files:** Create `consent-service.ts`、`budget-repository.ts`、`job-service.ts`（均位于 `app/server/documents/`）；创建 document-consents、revoke、document-jobs、job 查询/cancel 路由；Create `tests/server/document-budget.test.ts`、`tests/server/document-jobs.test.ts`、`tests/api/document-jobs.test.ts`。

- [ ] 写未允许发送调用数为 0、允许版本不一致、撤销允许、并发抢预算、重复 job、unknown-cost 不释放的失败测试。
- [ ] 运行 `npm run test:unit -- tests/server/document-budget.test.ts tests/server/document-jobs.test.ts tests/api/document-jobs.test.ts`。
- [ ] consent 绑定 owner/textVersion/purpose/providerPolicy/privacyPolicy；文本变化必须新建允许记录。
- [ ] 同一事务验证允许、用户队列上限和幂等摘要，预留用户/全局预算并创建 queued job；最多 5 个待发，返回 202。排队不占外部执行位，后续 claim 事务只给每用户一个任务 execution_slot=1；已发送且费用未明的任务继续占位。
- [ ] 按 queuedAt/jobId 串行启动；首任务入队和前任务结算后均触发服务端推进，维护任务兜底。claim 同事务重查文档 generation/lifecycle、允许记录、策略版本、队列有效期、预算预留和执行位。待发超过 30 分钟时仅在 not-sent 下释放预留并标记 queue-expired，不自动重新创建；UI 提供重新分析或手动兜底。
- [ ] 费用上限按已验证价格版本和输入/输出 token 上限计算，整数向上取整；未配置 token 计数或安全上界时禁止发送。
- [ ] 查询只读；取消和 revoke 不创建新任务、不清除未知费用、不保证外部请求撤回。客户端的“保存并 AI 分析”恢复保存/consent/job 的已有回执；同一旧任务结果未明时，新 mutationId 或 previousJobId 也不能绕过发送限制。
- [ ] 运行同组测试通过，提交 `feat: reserve independent document analysis budgets`。

预算状态转换：

~~~text
reserved + confirmed-not-sent -> released
reserved + known-success/failure-cost -> settled(actualMicroUsd)
reserved + possibly-sent-no-receipt -> held-unknown
held-unknown + authoritative-receipt -> settled(actualMicroUsd)
held-unknown + confirmed-no-charge -> released
cancelled/revoked + unknown-cost -> held-unknown
~~~

`held-unknown` 禁止定时器自动全额释放。结算更新必须同时验证 reservation 当前状态与 receipt ID 唯一；重复回执不可重复扣费。若供应商不能确认历史状态，保留审计和运营处理入口，不向用户自动再发一次收费请求。

**验收：**关分析开关后新请求拒绝，状态查询/撤销仍可用；未发送任务可安全释放，已发送任务继续按实际或未知费用结算。

## 10. P1-06：专用私有桥接、执行器与持久 Workflow

**Files:** 创建第 3.4 节的执行器文件（provider-http 留给 P1-07）；Create `app/server/documents/executor-bridge.ts`；Modify 本地 build 绑定及 `worker/index.ts`；Create `tests/server/document-executor-auth.test.ts`、`document-workflow.test.ts`、`document-executor-runtime.test.ts`。

- [ ] 先写“公开网络不可调用私有桥接”“Research 签名不可用于资料”“重复 Workflow/进程重启不二次发送”的失败测试。
- [ ] 运行 `npm run test:unit -- tests/server/document-executor-auth.test.ts tests/server/document-workflow.test.ts tests/server/document-executor-runtime.test.ts`。
- [ ] 固定独立签名域 `arc-document-bridge-v1`、独立密钥、时间窗和 nonce 表；仅开放预定义 claim/input/result/status/cancel 操作。
- [ ] 网站发往执行器的任务消息只含 jobId 和 contractVersion，服务绑定不允许调用任意 URL。
- [ ] 仅取得 execution_slot 的任务创建/进入付费 Workflow；执行器经授权按 jobId 获取允许文本及片段索引，在内存内组装 Provider 请求。正文不进入 Workflow 参数、步骤返回、异常或运行时日志。
- [ ] 发送前写持久发送栅栏；付费步骤 retries.limit=0；收到结果先持久化私有结果及回执，再做可重试投递。
- [ ] 维护任务分为“恢复未启动任务”“投递已存结果”“清理结果对象”；三者均不得重发 may-have-sent 的外部调用。独立执行器 `index.ts` 提供 scheduled 入口，目标配置为每 5 分钟扫描一次；每批最多 10 个任务，带游标和执行时间上限，本地测试直接触发该入口，不调用远程 cron。
- [ ] 用 Miniflare 重跑 P0 故障矩阵，并验证 JD/简历串行、浏览器关闭后下一份仍推进、unknown-cost 暂缓后续发送、人工兜底可继续，通过后提交 `feat: add isolated durable document workflow`。

Workflow 输入与输出：

~~~ts
import { z } from "zod";

export const documentWorkflowInputSchema = z.object({
  jobId: z.uuid(),
  contractVersion: z.literal("2026.11.1"),
}).strict();

export const documentWorkflowOutputSchema = z.object({
  jobId: z.uuid(),
  state: z.enum(["recorded", "already-claimed", "closed", "cost-unknown"]),
  resultRef: z.string().max(256).nullable(),
}).strict();
~~~

`resultRef` 仅为不透明 ID，不能是可公开访问 URL；返回前校验为纯字段对象并限制 UTF-8 序列化字节数。实例 ID 必须等于 jobId。

**独立绑定清单：**

| 网站 | 执行器 |
| --- | --- |
| DOCUMENT_EXECUTOR 服务绑定 | DOCUMENT_SITE 私有回调绑定 |
| DOCUMENT_ASSETS 私有正文 bucket | DOCUMENT_JOB_ASSETS 私有结果 bucket |
| 应用 DB 的 document 表 | DOCUMENT_EXECUTOR_DB |
| document 专用桥接密钥 | 同协议的独立配对密钥 |
| 资料开关和费用配置 | DOCUMENT_WORKFLOW、资料模型密钥/端点 |

执行器不获得应用 DB、Proof bucket 或 Research DB 的全量绑定。若现有 Worker 入口无法提供纯内部回调，新增明确导出的服务绑定入口，公开 fetch 分支拒绝桥接路径；不能把有正文的回调开放到普通公开 API。

## 11. P1-07：必交 AI 适配器、候选验证与预填

**Files:** Create `worker/document-executor/provider-http.ts`；Modify P0 `app/server/documents/provider.ts`、`app/server/documents/extraction-validator.ts`、`app/server/documents/review-service.ts`；Create `tests/server/document-provider.test.ts`、`tests/server/document-extraction.test.ts`；复用 P0 质量标注和评测器。

- [ ] 先写简历/JD 核心字段、must/preferred、技能词、selfLevelHint 和可定位短引用的成功预填测试，再写提示注入、额外字段、伪造引用、超时、超大响应和费用回执缺失的失败测试。
- [ ] 运行 `npm run test:unit -- tests/server/document-provider.test.ts tests/server/document-extraction.test.ts`。
- [ ] 实现由配置指定的单一受控端点；首版禁止工具、搜索和自动 URL 抓取，禁止未经资格验证的模型回退。
- [ ] 系统指令将资料视为待提取数据；按 P0 的 documentCandidateSchema 输出经历/职责、岗位要求、必备/加分、技能词和来源。selfLevelHint 只允许 conceptual/guided/uncertain/null；输出中不接受 owner、文件路径、可执行指令、完整 audit、independent 或 verified。
- [ ] 响应流累计计数，达到 128 KiB 即中止；输出修复不额外调用模型。失败保留原文本，可继续人工确认。
- [ ] 网站再次验证 textVersion/owner/segmentId/quote/条目上限，生成 sourceRef；合法候选自动初始化尚未编辑的核对草稿，状态为待用户核对，不改变 selection、audit 或当前计划。已编辑草稿收到新结果只标记可采用。
- [ ] 假 Provider 测试通过后提交 `feat: validate bounded document extraction candidates`。

输出目标示例：

~~~json
{
  "schemaVersion": "2026.11.1",
  "items": [{
    "id": "candidate-1",
    "kind": "requirement",
    "text": "能够编写 SQL 查询",
    "requirementLevel": "must",
    "skillLabels": ["SQL"],
    "selfLevelHint": null,
    "source": { "segmentId": "segment-2", "quote": "熟练使用 SQL" }
  }]
}
~~~

Provider 输出 segmentId + 原文短引用，网站查找唯一匹配后产生准确 start/end，并从真实 job 绑定 documentId/documentVersionId/textVersionId。不得让模型自行声明文件身份或猜全文坐标。原文找不到/多处无法消解时拒绝候选；文本版本变化或删除后旧候选不得激活。

**模型准入：**使用 P0-08 的 24 份标注、逐文档门槛和独立预算，在 P1-15 补齐真实端点证据。此任务的假 Provider 通过仅代表集成代码就绪；未通过真实模型质量、隐私路由和费用验证时主入口保持未就绪，人工兜底不能替代阶段 1 的完成条件。

## 12. P1-08：构建私有上下文和稳定预览

**Files:** Create `app/server/documents/context-builder.ts`、`app/server/http/material-planning-route-factories.ts`、material-contexts 两个 route；Create `tests/server/material-context.test.ts`、`tests/api/material-planning.test.ts`。

- [ ] 先写未选中/未确认/禁用/已删资料不进入上下文、跨 owner、输入改变后旧 preview 不可用等失败测试。
- [ ] 运行 `npm run test:unit -- tests/server/material-context.test.ts tests/api/material-planning.test.ts`。
- [ ] 服务端重读 selection、确认和 source，构建不可变 ContextInputSnapshot；不接收客户端给出的 skill priority 作为可信输入。
- [ ] 保留 audit 与 AI 候选、核对草稿、确认事实的区别；只有最终确认和明确采用的普通自评进入规划器。未确认 selfLevelHint 和 review draft 不参与生成，私有经历和摘录在可清理 sidecar 中。
- [ ] 同输入和策略版本生成相同 semanticFingerprint；随机 context ID/createdAt 不参与语义指纹。
- [ ] 生成限时 previewToken，并返回结构化规划投影与解释引用；建议预览有效期 30 分钟，失效后重建，不静默更新计划。
- [ ] 运行测试通过，提交 `feat: freeze private planning contexts and previews`。

快照字段必须包含：

~~~text
schemaVersion
ownerId（仅服务端存储）
scope + selectionId + selectionRevision
documents[{documentId, documentVersionId, textVersionId, confirmationId, generation}]
sourceReference（包括 Research content/config/blueprint/registry 版本）
audit + availability + target 的规范化内容摘要
planningDate + selectedScope
mappedRequirements + uncovered + unresolvedConflicts
mappingPolicyVersion + planningPolicyVersion + explanationVersion
base workspace/plan/revision（当前路线时）
semanticFingerprint + expiresAt + lifecycle
~~~

**缓存及删除：**以 owner+context ID 访问，不创建跨用户内容 hash 缓存。正文和解释不写入 planning mutation 的旧 response_json；document_mutations 仅保存结果 ID。引用失效时先校验生命周期再返回任何幂等结果。

## 13. P1-09：接入确定性优先级与范围保护

**Files:** Create `app/lib/materials/planning-priority.ts`；Modify `app/lib/planning/path-builder.ts`；Create `tests/lib/materials/planning-priority.test.ts`、`tests/lib/planning/material-path-builder.test.ts`；保留现有 path-builder/scheduler/fingerprint 测试。

- [ ] 先加入 P0-07 固定样例，断言任务顺序、任务集合、前置依赖和完整预计工时。
- [ ] 运行 `npm run test:unit -- tests/lib/materials/planning-priority.test.ts tests/lib/planning/material-path-builder.test.ts`，预期个性化样例尚不成立。
- [ ] 实现 ready 集合内稳定拓扑排序，并把高优先级目标的最小 rank 传播给前置节点。
- [ ] 扩展 `PathBuildInput` 的可选 materialOverlay，内容只含技能级 rank、必备技能 ID、context 语义指纹和规则版本；不得改变 blueprint 对象。
- [ ] `protectedCoreClosure` 的保护集加入 confirmed JD must 及其依赖；`nextDeferCandidate` 不得裁掉该集合。
- [ ] 有 overlay 时 path fingerprint 纳入语义指纹与规则版本；无 overlay 时继续使用原指纹输入对象，不加空字段。
- [ ] 同跑新旧路径、scheduler、fingerprint 测试，通过后提交 `feat: apply deterministic material planning priorities`。

核心排序函数目标实现：

~~~ts
export type PriorityNode = Readonly<{
  id: string;
  prerequisiteIds: readonly string[];
  rank: number;
  originalIndex: number;
}>;

export function prioritizeReadyNodes(
  nodes: readonly PriorityNode[],
  completed: ReadonlySet<string> = new Set(),
): string[] {
  const byId = new Map(nodes.map(node => [node.id, node]));
  if (byId.size !== nodes.length) throw new Error("DUPLICATE_NODE");
  const ranks = new Map(nodes.map(node => [node.id, node.rank]));
  for (const node of nodes) {
    if (!Number.isInteger(node.rank) || node.rank < 0 || node.rank > 5)
      throw new Error("INVALID_RANK");
    for (const dependency of node.prerequisiteIds) {
      if (!byId.has(dependency) && !completed.has(dependency))
        throw new Error("MISSING_DEPENDENCY");
    }
  }
  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false;
    for (const node of nodes) {
      for (const dependency of node.prerequisiteIds) {
        if (!byId.has(dependency)) continue;
        const rank = Math.min(ranks.get(dependency)!, ranks.get(node.id)!);
        if (rank !== ranks.get(dependency)) {
          ranks.set(dependency, rank);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  const seen = new Set(completed);
  const remaining = new Map(byId);
  const result: string[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining.values()]
      .filter(node => node.prerequisiteIds.every(id => seen.has(id)))
      .sort((left, right) =>
        ranks.get(left.id)! - ranks.get(right.id)!
        || left.originalIndex - right.originalIndex
        || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    const next = ready[0];
    if (!next) throw new Error("DEPENDENCY_CYCLE");
    result.push(next.id);
    seen.add(next.id);
    remaining.delete(next.id);
  }
  return result;
}
~~~

~~~ts
import { expect, it } from "vitest";
import { prioritizeReadyNodes } from "../../../app/lib/materials/planning-priority";

it("pulls mandatory work forward without bypassing prerequisites", () => {
  expect(prioritizeReadyNodes([
    { id: "foundation", prerequisiteIds: [], rank: 5, originalIndex: 0 },
    { id: "ui", prerequisiteIds: [], rank: 5, originalIndex: 1 },
    { id: "sql", prerequisiteIds: ["foundation"], rank: 5, originalIndex: 2 },
    { id: "analytics", prerequisiteIds: ["sql"], rank: 0, originalIndex: 3 },
  ])).toEqual(["foundation", "sql", "analytics", "ui"]);
});
~~~

**必须满足：**

- 首次生成可以依据用户明确采用的自评选择已有 learn/calibrate；independent 不由提取器自动赋值。
- uncertain 的 calibrate + learn 都保留，完成 calibrate 不删 learn。
- 未覆盖项只显示说明，不新增伪任务和资源。
- 截止期不够时保留完整路线与不可行提示，不缩短任务工时、不压缩每日预算。
- 同一个 context、策略、planningDate、事件输入，得到相同 path/plan 结果。
- 已有无资料回归的任务 ID、指纹和行为一致。

## 14. P1-10：首次生成、创建恢复与原子关联

**Files:** Modify `app/contracts/planning-api.ts`、`app/server/planning/service.ts`、`repository.ts`、`d1-planning-repository.ts`、`app/server/http/planning-route-factories.ts`；Create `app/server/planning/material-commit.ts`、`tests/server/material-generation.test.ts`、`tests/server/material-generation-atomic.test.ts`；扩展 `tests/components/research-setup-activation.test.tsx`。

- [ ] 写首次创建、activation 中断、generate 同键重试、旧 previousGoalId、资料删除竞争的失败测试。
- [ ] 运行 `npm run test:unit -- tests/server/material-generation.test.ts tests/server/material-generation-atomic.test.ts tests/components/research-setup-activation.test.tsx`。
- [ ] 在现有请求 union 的相应分支加入 `materials?: MaterialPlanningReference`，同时校验它与 source/audit/availability/target/planningDate/selectedScope 的一致性。
- [ ] 生成前按 contextVersionId 回读服务端冻结输入，使用 P1-09 的同一纯规则生成并核对 previewToken；不相信客户端给出的 path。
- [ ] `SavePlanningGenerationCommand` 增加服务端构造的 materialCommit；仓储同 batch 运行 guard、保存 plan、绑定 selection、创建 goal links/usage、保存 mutation digest。
- [ ] 保留现有 Research Ready/包内容版本/previousGoalId guard，不先关联资料再单独保存计划。
- [ ] 重跑同组测试及旧 planning-api、planning-service、planning-history 测试，通过后提交 `feat: atomically bind materials during plan creation`。

仓储新增输入的目标形状：

~~~ts
export type MaterialGenerationCommit = Readonly<{
  contextVersionId: string;
  selectionId: string;
  selectionRevision: number;
  scopeKind: "draft";
  draftId: string;
  documentGenerations: readonly Readonly<{
    documentId: string;
    generation: number;
  }>[];
  requestDigest: string;
  previewToken: string;
}>;
~~~

ownerId/goalId 来自既有仓储 scope，不从上述 DTO 另取一套身份。SQL guard 还必须从数据库验证确认、选择条目和上下文的关联，不能只检查调用方提交的 documentGenerations 数组。

**原子性测试要断言数据库最终状态：**

| 竞争点 | 期望 |
| --- | --- |
| preview 后更换主 JD | 409，无计划/goal link 半成品 |
| 保存前删除任一已选资料 | 整批失败；旧目标仍 active |
| 保存时另一个标签页创建了新目标 | previousGoalId guard 失败；不再切换 |
| 同 mutation 两请求并发 | 只生成一个目标/一个工作区，关联一致 |
| D1 batch 第 N 步故障 | 没有“计划成功、资料没关联”或相反状态 |
| 已成功保存但响应丢失 | 重试读取同一成功结果，不重复 activation 或费用 |
| 成功后资料删除再重试旧生成 | 不返回私有旧快照；用户可通过 workspace 读取保留计划 |

预览 TTL 约束尚未提交的请求；已成功提交后的响应恢复不得重新创建计划。恢复时仍检查 owner、请求摘要和资料撤销状态；失效时转已有 workspace 读取路径，不用旧正文恢复上下文。

## 15. P1-11：当前路线合法重排与提案确认

**Files:** 创建 material-replans route；Modify `app/server/planning/service.ts`、`repository.ts`、`d1-planning-repository.ts`、`material-commit.ts`；Create `tests/server/material-replan.test.ts`、`tests/server/material-replan-atomic.test.ts`；扩展 `tests/lib/planning/agent-replanned.test.ts`、`tests/api/planning.test.ts`。

- [ ] 写顺序变化但任务集合不变、完成任务保护、非法新增/删除、接受前进度变化、资料撤销等失败测试。
- [ ] 运行 `npm run test:unit -- tests/server/material-replan.test.ts tests/server/material-replan-atomic.test.ts tests/lib/planning/agent-replanned.test.ts tests/api/planning.test.ts`。
- [ ] 从活动路径和 completed 集合取得 unfinished；用 P1-09 在该集合中排序，不重新展开整条路径。
- [ ] 复用 `agent_replanned` 的现有归约校验和 proposed 结果；通过新的服务端入口附上 materialCommit，不启动 AI 规划调用。
- [ ] 同一事务记录候选 sidecar：contextVersionId、activeBasePlanId、candidatePlanVersionId、inputRevision、proposalRevision、有效状态。
- [ ] 所有接受入口，包括原 `/api/planning/replans/accept`，由仓储检查候选是否依赖材料；若依赖，则校验 owner/selection/context/文档 generation 和当前 revision。
- [ ] 放弃依然使用原 discard 事件；即使资料已删除也能放弃，不要求先恢复资料。
- [ ] 回归通过，提交 `feat: propose and validate material-based plan reorders`。

**revision 特别约定：**生成提案前 context 记录 inputRevision=N；保存提案后 workspace 可能为 N+1。接受时比较 sidecar 的 proposalRevision 与当前 revision，不能直接用 inputRevision，否则合法候选会全部被误拒绝。任何后续学习事件改变 revision，旧候选均须重算。

**用户结果：**

- 顺序和日程没有变化：返回 no-change 说明，不制造空 pending 版本。
- 新自评需要替换 learn/calibrate 或新增技能：显示“当前路线重排不支持此任务变化”，仍可按现有规则处理顺序；不得宣称所有资料影响都已应用。
- 已有 pending 提案：先按现有界面接受或放弃，不静默覆盖；可显示资料候选的基于版本。
- 接受前：activePlanVersionId 和完成记录不变。
- 接受后：仅采用合法候选；原版本保留只读。
- 资料删除后：候选资格标为失效，accept 返回冲突；不直接篡改 canonical planning events 或指针，discard 继续可用。

## 16. P1-12：可追溯说明与历史只读

**Files:** Create `app/lib/materials/explanations.ts`；完善 material-contexts 详情读取；Modify `app/components/workspace/plan-diff-review.tsx`、`plan-history.tsx`；Create `tests/lib/materials/explanations.test.ts`、`tests/server/material-history.test.ts`。

- [ ] 写说明无资料不补事实、来源已删不返回摘录、历史查询不激活目标的失败测试。
- [ ] 运行 `npm run test:unit -- tests/lib/materials/explanations.test.ts tests/server/material-history.test.ts`。
- [ ] 以规则 ID、skillId/unitId、confirmation item ID、sourceRef 组成决策记录，使用固定模板输出说明。
- [ ] 显示“顺序调整/范围保护/用户自评采用/未覆盖/当前无法应用”及日程影响，不给虚假匹配百分比。
- [ ] 私有摘录只经 context 详情 API 读取，说明不复制进公共 course metadata、Proof 或普通 Agent prompt。
- [ ] 历史页展示该计划曾采用的版本；资料删除后只显示“依据已删除”，不显示失效原文。
- [ ] 回归通过，提交 `feat: explain private material planning decisions`。

目标输出示例：

~~~json
{
  "ruleId": "mandatory-gap-first-v1",
  "changeKind": "reordered",
  "skillId": "sql",
  "unitIds": ["sql-learn-1"],
  "reasonItemIds": ["confirmed-jd-item-1"],
  "message": "已将 SQL 学习任务提前：主 JD 将其列为必备项，你的本次自评确认需要学习；前置任务仍保留。",
  "sourceAvailability": "available"
}
~~~

删除后的 projection 必须由固定模板返回 unavailable 说明，不仅把 sourceRef 删掉却保留包含简历内容的 message。当前 scope 的 selection 变化使未提交预览失效；已提交历史使用冻结版本读取，直到资料自身撤销或删除。

## 17. P1-13：四步 AI 默认操作、结果核对和人工兜底

**Files:** 创建第 3.3 节的 client/hook/materials 组件；修改第 3.2 节的 Setup/草稿/工作区文件；Create `tests/lib/documents-client.test.ts`、`tests/lib/use-material-selection.test.tsx`、`tests/components/materials-setup.test.tsx`、`tests/components/materials-ai-flow.test.tsx`、`tests/components/material-library.test.tsx`；扩展现有 setup-draft/activation 测试。

- [ ] 先写“主按钮为保存并 AI 分析”“正常流程直接预填”“用户只核对修改即可生成”“高影响冲突须处理”“拒绝外发 Provider=0”“人工草稿不被迟到结果覆盖”的组件测试，补充四步不变、刷新恢复和 A→B→A。
- [ ] 运行 `npm run test:unit -- tests/lib/documents-client.test.ts tests/lib/use-material-selection.test.tsx tests/components/materials-setup.test.tsx tests/components/materials-ai-flow.test.tsx tests/components/material-library.test.tsx tests/components/setup-draft.test.ts`，确认新增 AI 主操作与预填行为先失败再实现。
- [ ] goal 步的 JD 面板默认自动提取并预填岗位/必备/加分要求；foundation 步的简历面板默认自动提取经历、技能词和自评提示；time 步沿用时间设置；confirm 步集中展示采用资料、影响和未覆盖项。可以整体跳过导入，但进入资料功能后不把空白手动表单设为默认。
- [ ] 私人资料库通过工作区单一入口打开基础列表，支持查看/新版本/重新确认/选用/删除，文件上传按钮不渲染。原文和摘录使用 React 文本节点显示，不使用 dangerouslySetInnerHTML、不渲染资料内原始 HTML、不自动抓取资料中的链接。
- [ ] 服务端 capability 可用时，主操作“保存并 AI 分析”先明确展示处理方、用途和实际文本，再按已确认动作编排保存/consent/job。未同意时不发送；仅保存和“改为手动整理”为次级入口。capability 暂不可用时说明原因并提供兜底，不伪装已分析。
- [ ] 已授权排队/分析由后台推进，完成即进入核对页；按重点冲突、普通候选分组，普通信息可批量采用，自评建议另行明确确认。未提及技能可显式批量选 uncertain，independent 只允许单项选择。
- [ ] 核对更改自动保存到服务端 review draft，显示保存状态；手动兜底保留已成功候选和编辑。迟到或重新分析的候选只提示可比较/替换，不能重置用户填写。
- [ ] 浏览器草稿只保存 refs；切换 owner/source/draft/goal 时中止请求并清空正文内存，epoch 递增以拒绝 A→B→A 的旧响应。
- [ ] 首次创建恢复沿用 activation → generate 状态，不额外触发研究；generate 使用已确认的 previewToken 和 mutationId。
- [ ] 组件测试通过后，本地浏览器优先走“JD + 简历 → AI 预填 → 仅核对修改 → 规划”，再走拒绝/失败/额度不足兜底、刷新恢复、过期预览、删除与键盘操作。记录实际结果后提交 `feat: add AI-first material review to setup`。

浏览器允许保存的新增部分：

~~~json
{
  "materialSelection": {
    "selectionId": "selection-1",
    "selectionRevision": 3
  },
  "materialPreview": {
    "contextVersionId": "context-1",
    "previewToken": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
}
~~~

不得把资料正文、原文摘录、确认事实、公司隐私字段或展示名称塞入 localStorage、URL、buildAttempt.key、普通 evidence.note。现有本地 audit 只保存用户主动确认的普通技能等级与原有允许字段。

**状态和文案：**

| 状态 | 主要操作 |
| --- | --- |
| 未导入 | 粘贴资料 / 从私人资料库选择 / 跳过 |
| 待允许分析 | 查看实际发送范围；主操作“保存并 AI 分析”，次级“仅保存/手动整理” |
| 已授权等待中 | 显示串行队列状态，可取消；后台自动推进 |
| AI 完成待核对 | 直接展示预填结果；修改、忽略或确认，重点处理冲突 |
| 模型进行中 | 显示真实后台状态，可取消；关闭页面可稍后查看 |
| 分析失败/额度不足/暂不可用 | 保留正文与已有候选，显示原因并提供手动兜底 |
| 费用结果未知 | 保留回执查询，不自动重发；可手动继续，迟到候选不覆盖修改 |
| 手动草稿收到 AI 结果 | 提示新候选可核对，用户明确采用后再替换 |
| 预览过期或版本冲突 | 重新核对并预览，保留已存资料 |
| 已撤销、清理中 | 不可继续引用，显示清理状态 |
| 资料有新版本 | 用户选择是否采用，当前选择不静默变化 |

**浏览器隔离测试：**在 A 发出详情/确认/预览后切换 B，再切回 A；旧响应即使 ownerId 再次一致，也因 epoch 或 scope revision 不匹配被丢弃。服务器查询依然验证 owner，客户端 epoch 只防 UI 污染，不替代授权。

## 18. P1-14：删除、撤销、迟到写入和清理恢复

**Files:** Create `app/server/documents/deletion-service.ts`、document-deletions route；完善 DELETE document route；完善 `worker/document-executor/maintenance.ts`、存储补偿和 material-commit guard；Create `tests/server/document-deletion.test.ts`、`tests/server/document-deletion-races.test.ts`、`tests/api/document-deletion.test.ts`。

- [ ] 先写“删除与生成竞争”“删除与 Provider 返回竞争”“R2 删除失败”“结果对象先写后崩溃”“重复删除”测试。
- [ ] 运行 `npm run test:unit -- tests/server/document-deletion.test.ts tests/server/document-deletion-races.test.ts tests/api/document-deletion.test.ts`。
- [ ] 删除第一事务：核验 owner/revision，增加 generation，tombstone document，撤销 consent、review draft、context/候选资格及待发任务，记录全部依赖和清理任务；仅确认未发送才释放预算，unknown-cost 保留占位。
- [ ] 同步返回 revoked/cleanup-pending；此后任何正文读取、确认、上下文创建、模型发送 claim、候选接受均拒绝。
- [ ] 清理 raw/text、候选、核对草稿及 selfAssessmentHints、确认、私有解释、上下文、执行器结果、暂存对象、私有缓存；费用账本保留最低必要 ID/状态/金额。
- [ ] 每次迟到 R2 写入都需携带 generation：提交失败即进入对象回收；维护扫描发现已 tombstone 对象仍存在时继续删除。
- [ ] 用指数退避和有界批次重试清理；提供状态查询，未成功删除全部已登记对象不能显示 completed。完成前还须确认所有已知写入意图及执行器写入已终止，并读回验证对象不存在；仅租约过期不能当作写入已经结束的证据，无法确认时保持 cleanup-pending。
- [ ] 回归通过，提交 `feat: revoke and clean private material dependencies`。

**不可删除/不可误改的现有数据：**

- 已确认并单独保存的普通技能自评和学习完成事件。
- 不含私有原文的计划任务结构与时间安排。
- Research 公共包、Proof 原有记录、与本资料无关的普通 Agent 聊天。
- 最小费用审计、请求幂等墓碑和删除完成记录；其中不得保留正文、名称或摘录。

**必须清掉的派生副本：**

- 任何以文档/确认/context 来源登记的私有说明、模型候选和结构化正文。
- 指向该资料且尚未采用的个性化上下文及提案资格。
- 网站和执行器两侧暂存结果；响应缓存不能绕过 lifecycle 校验。
- 如果将来有 Agent 资料投影，须按阶段 3 增加运行级清理；阶段 1 不实现该投影，因此不扫描并猜测用户手动粘贴的普通聊天副本。

取消与删除是不同操作：取消停止该任务的未来生效，不自动删除整个资料；删除撤销所有该资料版本及其派生使用。单纯设置 lifecycle=deleted 或只删除 R2 key 都不算完成。

## 19. P1-15：AI 质量、端到端、人工兜底与兼容验收

**Files:** Create `tests/server/materials-e2e.test.ts`、`tests/server/materials-privacy.test.ts`、`tests/components/materials-recovery.test.tsx`、`vitest.materials-qualification.config.ts`、`tests/qualification/document-model.qualification.ts`、`docs/verification/2026-11-04-materials-model-qualification.md`、`docs/verification/2026-11-04-materials-phase-1-results.md`；复用 P0 质量样例/评测器及 P1-13 AI 界面测试。

- [ ] 使用两个 owner、一个已存目标和一个创建草稿，先执行 AI 默认提取、预填、核对修改、规划的主流程，再验证人工兜底和下表其他流程；检查持久化最终状态，不只看 HTTP 200。
- [ ] 通过 P0-08 的固定 24 份样例验证离线评测器及核对体验；普通样例逐文档门槛、来源和边界项分别输出，不以平均分掩盖失败。
- [ ] 在已有模型/预算授权范围内单独运行第 19.3 节真实资格套件；记录实际端点、策略、token、费用和质量结论。未获执行范围或尚未验证时记录“真实 AI 准入未完成”，不得用手动路径或假结果填通过。
- [ ] 对日志、错误响应、Workflow 输入/输出和 storage draft 搜索敏感 sentinel，必须为 0 次非授权泄露。
- [ ] 验证未选择资料、全部功能开关关闭、没有模型配置时，旧功能仍可使用。
- [ ] 跑新增资料测试，再跑下方现有回归组；发现相关回归后修复并重跑对应组。
- [ ] 代码完成后运行 lint、类型检查和 build；未完成本地环境配置时记录阻碍，不填通过。
- [ ] 完成本地浏览器人工验收记录；保存 fixture、环境、命令和结果。
- [ ] 提交 `test: verify private materials planning and recovery`；不在这一步部署。

### 19.1 端到端验收矩阵

| 编号 | 流程 | 可验证结果 | 对应 v2.1 |
| --- | --- | --- | --- |
| E01 | 不导入任何资料完成原 Setup | 原路径、历史和匿名能力保持 | P09、U01 |
| E02 | 粘贴简历/JD，允许后 AI 预填，用户仅核对修改 | 无空表重录，确认后完整生成且有来源 | F09、F10、P01 |
| E03 | 主 JD 必备技能 + 明确能力缺口 | 顺序改变、依赖/预算合法 | P01、P02、P05 |
| E04 | 模型试图输出 independent，或用户批量采用普通候选 | 越权字段拒绝，批量采用不授予 independent，Proof 不改变 | F10、P03 |
| E05 | uncertain 校准完成 | 后续学习保留 | P10 |
| E06 | 目录外要求、非学习要求、歧义映射 | 明确未覆盖/需确认，不伪造课程 | F06、P04、P15 |
| E07 | 资料更新后当前路线重排 | unfinished exact-set、接受前活动计划不变 | P07、P11 |
| E08 | 预览后更新资料/自评/时间/学习事件 | 旧 preview/proposal 被拒绝 | P06 |
| E09 | 首次 activation 断网，刷新，再 generate | 同目标同关联，不挂旧目标 | P14 |
| E10 | 新目标生成失败或 Research 不 Ready | 原目标保持，资料不绕过门槛 | P12 |
| E11 | 查看历史计划和已删依据 | 只读，当前目标不变 | P13 |
| E12 | owner B 请求 A 的每类 ID | 404/拒绝，无信息侧漏 | S01、S02 |
| E13 | A→B→A 与迟到响应 | 不污染当前视图、草稿无正文 | S05 |
| E14 | 重复 job/Workflow/结果回执 | 无重复发送/激活/扣费 | R01、R02 |
| E15 | 发送后失联，再刷新/重试 | held-unknown，不重发不释放 | R03 |
| E16 | 删除与保存/返回/接受同时发生 | 不复活，既有学习工作区可用 | P08、R04 |
| E17 | R2 删除失败后重试 | revoked 可见、completed 仅在真实清理后 | R05 |
| E18 | 一份资料分析失败 | 其他资料和现有计划不受损 | F08 |
| E19 | 关闭资料分析/独立额度耗尽 | Research、planner、tutor 正常 | R06 |
| E20 | 隐私 sentinel + 注入/HTML | 不执行指令/HTML，不进入公开缓存/伙伴 | S03、S04、S06、R07 |
| E21 | 拒绝外部分析，主动手动整理 | Provider=0，人工兜底可生成 | F03、F11 |
| E22 | 分析失败/额度不足/服务关闭 | 保留成功候选和编辑，可手动继续 | F08、F11 |
| E23 | 手动改完后 AI 结果迟到或重新分析完成 | 不覆盖草稿，可明确采用新候选 | F10、F11 |
| E24 | 未提及技能与已有自评混合 | 保留已有值，用户可明确批量选 uncertain，未默判不会 | F06、F10、P10 |
| E25 | 同时提交 JD/简历并关闭浏览器 | 服务端串行推进，重试不重复，费用未明阻止后续发送 | R01、R02、R03 |
| E26 | 真实 AI 运行固定质量集 | 每项达到 P0-08 门槛，有模型/来源/费用证据 | F04、F09、F10 |

日常故障注入使用假 Provider；E26 使用独立真实资格套件。AI 主路径与人工兜底均是本阶段必测内容，只有全部完成才能通过最终 Gate。文件布局、MIME/ZIP/OCR 测试归阶段 2；Agent 资料运行清理归阶段 3。

### 19.2 精确回归命令

以下均在 APP_ROOT 执行；不附带远程配置。

~~~powershell
npm run test:unit -- tests/contracts/planning-api.test.ts tests/contracts/planning.test.ts tests/lib/planning/path-builder.test.ts tests/lib/planning/scheduler.test.ts tests/lib/planning/fingerprint.test.ts tests/lib/planning/agent-replanned.test.ts tests/lib/planning/event-reducer.test.ts
npm run test:unit -- tests/components/setup-draft.test.ts tests/components/research-setup-activation.test.tsx tests/components/adaptive-setup-flow.test.tsx tests/components/setup-resume.test.tsx tests/components/setup-completion.test.tsx tests/pages/setup-time-edit.test.tsx
npm run test:unit -- tests/server/planning-service.test.ts tests/server/d1-planning-repository.test.ts tests/server/planning-history.test.ts tests/server/research-planning-integration.test.ts tests/server/agent-context.test.ts tests/server/learning-agents.test.ts tests/server/research-package-validator.test.ts
npm run test:unit -- tests/server/materials-e2e.test.ts tests/server/materials-privacy.test.ts tests/server/document-quality-evaluation.test.ts tests/server/document-review-draft.test.ts tests/components/materials-ai-flow.test.tsx tests/components/materials-recovery.test.tsx
npm run lint
npx tsc --noEmit
npm run build
~~~

预期：选定测试全部通过、lint/typecheck/build exit 0。若测试文件在实施期间重命名，先更新命令，不接受“0 个匹配测试”作为通过。是否再跑全量测试依本次实际改动与仓库要求决定；不运行现有会触发付费或远程环境的脚本。

### 19.3 真实模型资格验证（单独执行）

此套件不随常规单元测试执行。真实端点、独立资料密钥、价格版本、总评测上限和调用范围在后续执行时明确提供；本次文档调整不执行任何真实请求。

配置文件使用独立 include，不继承会把普通测试合并进来的 include：

~~~ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: {
    "cloudflare:workers": fileURLToPath(new URL("./tests/mocks/cloudflare-workers.ts", import.meta.url)),
  } },
  test: {
    environment: "node",
    include: ["tests/qualification/document-model.qualification.ts"],
    testTimeout: 240_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
~~~

- [ ] 资格套件入口要求 `ARC_DOCUMENT_QUALIFICATION_ENABLED=true`，并核对独立 provider policy、价格和总预算；缺失时报明确错误，不自动 skip 后算通过。
- [ ] 固定顺序执行 24 份合成资料，通过 P1-07 的正式适配器发送；每份最多一次初始请求，测试不配置 retry/concurrent，不触发自动输出修复。
- [ ] 每次预留最坏费用并记录真实回执；达到总预算、出现未知费用或端点策略不符时停止后续发送，记录未执行项。
- [ ] 调用 P0 评测器逐文档计算关键项召回、JD 分类、引用及边界结果；保留模型/路由/策略版本和计数，不记录私人正文。
- [ ] 18 份普通样例均能预填完成核对；逐文档召回和 JD 分类达到 90%，保留候选引用合法率 100%，6 份边界全部符合预期。指标是验收目标，不是当前已测结果。
- [ ] 输出资格记录，区分通过、失败、未执行及原因。任何必要项未完成都保留 Gate 1B 未通过；修正后新的评测轮次有独立预算记录。

在上述条件已具备时运行：

~~~powershell
npx vitest run --config vitest.materials-qualification.config.ts
~~~

预期：24 份样例全部取得符合策略的结果，质量和安全门槛通过，费用有回执或明确保守状态；存在未知费用导致中止时不能整体判通过。此验证与生产发布分开，生产绑定仍在正式发布时再核对。

## 20. P1-16：功能开关、交付和上线准备

**Files:** Create `docs/operations/private-materials-rollout.md`；完善阶段 1 验证记录；检查 `policy.ts`、本地绑定和独立执行器配置。

- [ ] 将 M1/M2 的 build commit、迁移文件、离线测试结果与 M3 的真实模型资格记录写入运行手册；未满足 AI 门槛时明确写“阶段 1 未完成”，人工兜底不作为替代交付。
- [ ] 验证开关关闭时页面不提供尚未启用的入口；已有资料查看/删除和已存计划读取保持。
- [ ] 形成生产变更清单：应用迁移、私有 bucket、独立 Worker/D1/Workflow、双向服务绑定、独立 secret/预算、维护任务。
- [ ] 演练回退：先关闭新分析和新个性化提交，再关闭入口；已开始任务/未知费用/清理任务继续维护。
- [ ] 确认不执行 down migration、不删除仍被引用的表/对象、不回退到无法读取新增数据的版本。
- [ ] 输出阶段验收结论与发布前缺项；只有未来获得发布范围授权时才执行云端步骤。
- [ ] 提交 `docs: prepare private materials rollout and rollback`。

### Gate 1A：AI 主路径离线集成与兜底

- [x] 独立分析任务、来源校验和核对草稿正常；资料/版本/选择具备所有者隔离。
- [x] 默认主操作为 AI 分析，固定模拟普通样例直接预填，用户不从空表整理简历/JD。
- [x] 用户核对修改可恢复；高影响冲突必须处理，independent 不被批量采用自动授予。
- [x] 首次生成原子关联，旧请求兼容；已有路线只重排 unfinished，接受/放弃和并发正确。
- [x] 四步 UI、创建恢复、历史只读、uncertain 和阶段 1 来源接入回归通过；Research 基线阻塞已修复，无排除全仓 335 文件 / 7,273 项通过。
- [x] 队列、取消、unknown-cost、删除、迟到结果和清理通过，浏览器无正文草稿；无法证明硬崩溃写入者终止时保守 pending 的限制已记录。
- [x] 拒绝、失败、额度不足或服务不可用时手动兜底有效，已存修改不会被迟到 AI 覆盖。
- [x] 验证记录含实际浏览器和自动测试结果；假 Provider 成绩不写成真实模型成绩。

### Gate 1B：真实 AI 准入与阶段 1 完成

- [ ] Gate 1A 全部通过。
- [ ] 独立 Worker / Workflow 的绑定和恢复在本地及已授权验证环境中得到证据；生产发布另行核验。
- [ ] 实际发送版本、purpose、providerPolicy 与允许记录一致。
- [ ] 单次发送栅栏、回执恢复、unknown-cost 和删除竞态通过。
- [ ] 真实 endpoint、隐私/路由、价格版本和独立预算具备可核验记录。
- [ ] 24 份真实模型合成样例满足 P0-08 的逐项质量/来源/边界门槛，正常流程无需空表重录。
- [ ] AI 确认信息确实改变至少一个合法规划样例，并有明确来源和用户确认。
- [ ] R2/核对草稿/执行器结果清理及监控维护可运行，日志与 Workflow 无正文。
- [ ] 两道 Gate 均通过才可标阶段 1 完成；仅人工可用或仅假 Provider 通过均不满足。
- [ ] 正式上线还需按后续授权执行发布；本计划没有部署或真实调用的已完成声明。

## 21. 交付清单与完成定义

最终实施交付应包含：

1. 阶段 0 固化的契约规格、阶段 1 代码及增量迁移。
2. AI 自动分析、预填核对、明确自评采用与个性化规划的端到端证据。
3. 独立分析的假 Provider 证据、24 份真实模型合成样例评测及端点/隐私/预算准入记录。
4. 删除/取消/未知费用/原子提交四组故障注入结果。
5. 人工兜底、用户修改恢复、旧功能回归和上线/回退手册，清楚区分主路径、降级状态和后续文件功能。
6. 明确列出的剩余限制：文件导入、伙伴资料投影、任务集合变更、更多资料格式仍按 v2.1 后续阶段实施。

**完成标准是 AI 主路径可用并产生可验证的规划变化：**用户提供简历/JD，明确允许后由 AI 自动预填，用户核对修改即可完成规划；真实模型质量和来源门槛通过，至少一个固定样例改变合法任务类型、顺序或范围。人工兜底和旧功能继续可用，删除及版本竞争不破坏已有进度。仅完成人工表单、接通假 Provider 或展示分析文案，均不算阶段 1 完成。


