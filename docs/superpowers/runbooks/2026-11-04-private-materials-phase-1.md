# 私有资料阶段 1：资格验证与运行手册

日期：2026-11-04。范围：v2.1 阶段 1 的本地离线实现、后续资格准入和发布准备。**本文不授权联网、付费模型、远程迁移或部署。当前真实模型资格为 NOT RUN，Gate 1B 未通过。**

## 1. 代码与证据边界

以 `docs/superpowers/plans/2026-11-04-arc-private-materials-phase-1.md` 和 P0 冻结契约为依据。应用增量迁移为 `drizzle/0014_private_materials.sql`；独立执行器迁移为 `worker/document-executor/migrations/0000_document_executor.sql`。不改写旧迁移。

当前离线测试使用合成资料、假传输和真实 SQLite；不得把其 18/18 普通样例、6/6 边界结果登记为真实模型成绩。真实资格记录见 `../reports/2026-11-04-private-materials-model-qualification.md`。最终构建、浏览器及 Gate 1A 结论以主实施报告为准，本文不提前宣称通过。

## 2. 两个 Worker 与私有资源

| 侧 | 本地名称/绑定 | 用途 |
| --- | --- | --- |
| 应用 Worker | `arc-local-only`；命名入口 `DocumentSite` | 会话/所有者校验、资料/允许/预算/规划事务、私有回执 |
| 应用 D1 | `DB` → `arc-local-only-db` | 应用 0000–0014 迁移，资料与计划同一数据库事务 |
| 应用 R2 | `DOCUMENT_ASSETS` | 私有原文与文本对象；不与公开资源或 Proof bucket 混用 |
| 应用 → 执行器 | `DOCUMENT_EXECUTOR` → `arc-document-executor-local`，入口 `DocumentExecutorEntrypoint` | 已签名的启动/取消/查询 |
| 执行器 Worker | `arc-document-executor-local` | 单次模型发送栅栏、持久工作流、结果传递与回收 |
| 执行器 D1 | `DOCUMENT_EXECUTOR_DB` | 独立发送、回执、写入意图和 nonce 状态 |
| 执行器 R2 | `DOCUMENT_JOB_ASSETS` → `arc-document-results-local` | 临时私有候选/结果对象 |
| 执行器 Workflow | `DOCUMENT_WORKFLOW` / `DocumentWorkflow` | 只传 jobId/contractVersion；不将正文写入工作流历史 |
| 执行器 → 应用 | `DOCUMENT_SITE` → `arc-local-only`，入口 `DocumentSite` | 已签名 claim/input/result/status/cancel |

执行器本地配置为 `worker/document-executor/wrangler.local.jsonc`；只含本地资源标识。应用本地绑定由 `build/cloudflare-target.ts` 生成。不得复用 Research 执行器数据库、结果 bucket、API key 或签名密钥。公网 fetch 不提供内部资料协议；两侧只能经命名服务入口访问。

本地初始化也先核对目标明确为 local；示例命令仅用于后续本地验证，本文编写期间未执行：

```powershell
# 应用：使用实际生成的本地 site 配置路径，绝不替换成生产配置。
npx wrangler d1 migrations apply arc-local-only-db --local --config <local-site-config>
# 独立执行器：仅本地数据库。
npx wrangler d1 migrations apply arc-document-executor-local --local --config worker/document-executor/wrangler.local.jsonc
npm run dev
npx wrangler dev --local --config worker/document-executor/wrangler.local.jsonc
```

同时启动时核对服务名和命名入口；仅进程成功启动不等于双向服务绑定、cron 或持久恢复已验证。启动前核对两侧使用同一组本地持久化目录，随后通过合成任务验证 claim → input → result → 核对草稿；单测假绑定通过不能替代这一步。

## 3. 开关、允许和密钥

`ARC_DOCUMENTS_ENABLED`、`ARC_DOCUMENT_ANALYSIS_ENABLED`、`ARC_DOCUMENT_PLANNING_ENABLED` 默认关闭。文件上传与 Agent 资料投影保持关闭。模型功能还需要精确匹配的配置、独立资格记录、双向绑定与签名密钥；仅打开功能开关不会赋予模型资格。

`ARC_DOCUMENT_BRIDGE_SECRET` 两侧一致，独立于 Research、账号和 Provider key，至少 32 个字符；通过秘密存储或已确认被 Git 忽略的本地秘密文件注入，不能放到 wrangler vars、仓库或日志。签名校验绑定协议域、方向、POST 路径、时间、nonce 和正文 SHA-256；有效窗口为 60 秒，nonce 持久防重放。两侧时钟和密钥轮换必须一起验证。

仅对**精确 textVersionId、analysis purpose、providerPolicyId、policyVersion、generation**的有效用户允许进行发送。模型 key 用独立 `ARC_DOCUMENT_PROVIDER_API_KEY`，不退回 Research key。队列每 owner 串行；may-have-sent/费用未知占位不允许自动重新发送或释放费用。

既有资料读取/删除、已保存工作区和普通学习事件不因关闭新建功能而失效。维护必须继续：应用维护负责队列、存储回收和删除任务；执行器 `ARC_DOCUMENT_MAINTENANCE_ENABLED=true` 保持有界扫描、结果补投和清理。正式 cron 是否安装并实际触发须在授权环境单独确认。

## 4. 独立真实模型资格套件

入口：`vitest.materials-qualification.config.ts` → `tests/qualification/document-model.qualification.ts`。普通 `vitest.config.ts` 仅匹配 `tests/**/*.test.{ts,tsx}`，不会发现此文件。独立配置禁止 fileParallelism 和 retry，仅一个 worker；固定顺序执行同一份 24 文档语料，每份至多一次请求。单次 HTTP 最多 180 秒；整个顺序套件的上界单独放宽，不能通过增加重试获得成功。

必须先有新一轮明确授权，授权注明固定 endpoint、model、provider、路由、隐私依据、价格版本、两种 token 单价、总预算、24 请求上限、语料 SHA-256、runId 和到期时间。未授权时不运行下面命令。

配置只来自三个专用环境变量：

- `ARC_DOCUMENT_QUALIFICATION_ENABLED=true`：必须显式设置；缺失直接失败，不 skip 后记通过。
- `ARC_DOCUMENT_PROVIDER_API_KEY`：只在运行时秘密环境提供。
- `ARC_DOCUMENT_QUALIFICATION_SETTINGS`：已审阅 JSON。顶层为 `{runId, config, qualification, authorization}`，不得含 API key。

`config` 必须提供生产 `documentAnalysisConfigurationSchema` 的全部非 secret 字段：provider/model/endpoint/providerPolicyId/routingPolicy/priceVersion、userDailyMicroUsd/globalDailyMicroUsd/maxJobMicroUsd、maxInputTokens/maxOutputTokens/httpTimeoutMs。不得留空、默认选模型、自动改 endpoint、增加 fallback 或降低隐私政策。

`qualification` 为已审阅的**传输/价格准入声明**，不是模型质量成绩：`qualified:true`、完全相同的 endpoint/model/providerPolicyId/priceVersion/routingPolicy，两种 `*MicroUsdPerMillionTokens`，以及 `inputTokenBound:"utf8-bytes-plus-4096"`。

`authorization` 要求：id、runId、endpoint、model、provider、providerPolicyId、priceVersion、routingPolicy、inputMicroUsdPerMillionTokens、outputMicroUsdPerMillionTokens、maxRequests=24、totalBudgetMicroUsd、corpusSha256、privacyEvidence、pricingEvidence、approvedAt、expiresAt。所有对应字段必须精确匹配配置；证据 URL 必须 HTTPS 且无账户信息、查询凭证或 fragment；设置存在不替代审批者对依据的核验。总预算不能超过显式 user/global 上限。

语料文件为 `tests/fixtures/documents/quality-corpus.json`，当前 SHA-256：`69e5ddd1005f12abf24483e10dd235629ef309ba3a84e922166963ccd9aed750`。原有 source segment ID、UTF-16 坐标与文本不变；runner 只增加覆盖标题/换行的传输 gap segments，使生产适配器的全文连续分段约束成立。

获授权后由操作者执行：

```powershell
# settings 文件和 key 由操作者从已审阅的私有来源注入；此处不提供默认模型或 endpoint。
$env:ARC_DOCUMENT_QUALIFICATION_SETTINGS = Get-Content -Raw -LiteralPath <approved-settings-json>
$env:ARC_DOCUMENT_QUALIFICATION_ENABLED = 'true'
# ARC_DOCUMENT_PROVIDER_API_KEY 必须已通过秘密环境提供。
npx vitest run --config vitest.materials-qualification.config.ts
```

默认报告位于已被 Git 忽略的 `work/materials-qualification/<runId>/`。该目录独占创建；存在即拒绝，重跑失败测试或重启进程不会再发同一轮。`ledger.jsonl` 在每次发送前 fsync 最坏费用预留，发送后 fsync 结算或 held-unknown。`result.json` 只保存模型/策略/版本、文档 ID、逐项分数、token、费用和回执等元数据，不保存原文、候选全文、摘录、key 或请求体。

遇到超时、未知费用、重复/无效回执、路由不符或价格超过预留上界，立即停止后续发送，保留占位及未运行列表。已结算但质量不达标可以继续同一已授权轮次余下文档；不自动修复输出，不重问同文档。进程中断后 ledger 中未结算的 reserved 一律作为可能已发送处理；必须先人工/供应方回执核对，不能删除目录后用旧授权重试。

评价只使用实际 Provider 返回并经正式 source validator 验证的候选和 reviewPoints。普通样例逐文档关键召回与必备/加分分类均至少 90%，保留引用合法率 100%；18 份普通可预填，6 个边界全部通过。核对问题须带来源，模型不能自行赋予 resolved 状态。未经用户处理的高影响问题阻止确认。测试中的 oracle 仅验证评测器/接口，不得成为真实观察。

## 5. 删除、取消与故障恢复

删除先在应用 D1 原子增加 generation 并 tombstone，撤销允许、核对草稿、确认、上下文和候选资格，记录待清理任务；只在明确 not-sent 时释放预留。所有迟到确认/分析回执/预览/生成/接受都重新校验 generation 与生命周期。不会把旧响应恢复成新的有效资料。

清理原文/文本、候选、selfAssessmentHints、reviewPoints、确认、私有解释/上下文以及两侧暂存结果。completed 只能在所有登记写入者已证实终止、所有对象删除并读回不存在之后标记；租约超时不等于写入终止。R2 删除失败按有界退避重试；期间保持不可引用，并显示清理状态。

硬崩溃限制：若写入者在 R2 写入成功后、登记终止证明前进程消失，当前实现会保守保持 `cleanup-pending`，不会仅凭租约超时宣称删除完成。此情形没有可安全自动补造终止证明的恢复入口；后续目标环境验证需建立写入者停止的运维证据与受控恢复流程。未取得该证据前不得强改完成标志，亦不得向用户承诺固定时间内完成物理清理。

取消与撤销允许的私有通知记录在持久 outbox 中；通知失败由有界维护扫描重试，按 owner/job 或 owner/consent 精确停止未来发送。已可能发送的任务仍保留预算占位，迟到回执结算后清理临时结果。关闭资料规划开关阻止新的资料候选接受，但允许普通候选、放弃动作及已提交成功回执恢复。

保留普通用户自评、完成事件、公开来源目录、原计划任务结构以及最低费用/幂等审计。资料删除只使候选无效，不直接改写 canonical planning events；已有候选仍可放弃，不能接受。历史显示“依据已删除”，不返回失效摘录或私有旧说明。

## 6. 回退与后续发布检查

回退顺序：先关新分析和新个性化提交，再关资料入口；已发任务、unknown-cost、回执补投、对象回收和删除维护继续。保留可读取新字段/新表的兼容版本；不 down migration，不删除仍被引用的表、费用账本或对象，不将 generation/tombstone 退回，不恢复旧候选资格。

后续发布须另获范围授权并逐项记录实际证据：

1. Gate 1A 主实施报告、生产构建提交与产物可核验；Gate 1B 的 24 份真实记录完成，失败/未运行项为零。
2. 应用 0014 与执行器 0000 的 owner 外键、旧数据升级、同事务回滚在目标环境验证；目标数据库 ID 与本地/Research 完全区分。
3. 两个私有 R2、两个 Worker、独立 D1、Workflow、双向命名入口、维护 cron 和签名密钥均按清单配置；公网内部路径仍返回 404。
4. 精确 provider endpoint/model/routing/privacy/pricing 与本轮资格记录一致；独立 key、预算、允许页面和实际发送文本版本一致。
5. 以合成任务验证单次发送、断线恢复、回执重放、未知费用、迟到结果不覆盖编辑、删除竞争与对象读回清理。
6. 关闭开关的兼容路径、读取历史、已有学习事件、旧接受入口资料 guard、当前 revision N+1 接受和删除后放弃可用。
7. 日志/工作流历史/响应缓存无正文；告警只含最小 ID、状态、费用与错误码；权限失配、超额和清理失败可定位。

**当前结论：真实 AI 准入未执行，阶段 1 不宣称完全完成；生产部署和远程验证均待后续授权。**
