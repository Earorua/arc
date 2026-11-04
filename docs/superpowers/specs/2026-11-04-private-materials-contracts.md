# 私有资料阶段 0 冻结契约

版本：2026.11.1；日期：2026-11-04；产品设计：v2.1。本文是阶段 0 的接口和机制交接，尚未创建阶段 1 产品服务、页面、应用迁移或线上绑定。

## 1. 主路径和用户控制

默认推荐“保存并 AI 分析”，先展示处理方、实际发送版本、用途和允许动作。后台生成候选，核对页预填，用户修改并确认才产生正式事实。人工填写只用于拒绝外发、失败、额度不足或临时不可用时兜底。

事实确认与能力自评采用分开：批量采用普通事实不授予 independent；缺少技能线索不等于 unseen。用户可以明确选择对一组未知技能采用 uncertain，现有自评默认保留。普通自评和学习记录与私有经历分开，删除资料不删除学习进度。

## 2. 契约实现与调用边界

| 文件 | 边界 |
| --- | --- |
| app/contracts/documents.ts | 资料/版本/候选/确认/草稿/选择，纯引用与草稿竞争校验 |
| app/contracts/documents-api.ts | 严格请求/响应、错误、体积与幂等摘要 |
| app/contracts/material-planning.ts | 输入快照、语义指纹和失效回放判定 |
| app/server/documents/policy.ts | 独立配额和关闭优先的配置解析 |
| app/server/documents/repository.ts | 所有者隔离仓储及事务输入；只声明接口，不实现存储 |
| app/server/documents/provider.ts | 内存中的分析输入/结果；不是 Workflow DTO |
| worker/document-executor/job-state.ts | 纯任务状态转换/发送判定 |
| worker/document-executor/workflow-policy.ts | 无正文的有界引用、零重试付费步骤 |
| tests/fixtures/documents/workflow-probe.ts | 本地运行时探针，不能部署为正式执行器 |
| tests/fixtures/documents/transaction-probe.sql | SQLite 机制样例，不是应用迁移 |

所有 HTTP 对象 strict；owner 来自会话，客户端不能传 ownerId、R2 key、模型端点、费用或执行身份。未知字段拒绝。端点完整字段以 documents-api.ts 为准；阶段 1 的 route factory 必须用对应 schema，不能只在浏览器验证。

## 3. API 与作用域

| 接口 | 行为 |
| --- | --- |
| GET/POST /api/documents | 元数据列表 / 保存文本；保存不隐含外发 |
| GET/DELETE /api/documents/[documentId] | 同 owner 私有详情 / 立即撤销并返回清理任务 |
| POST /api/documents/[documentId]/versions | 不可变新文本版本，expectedRevision |
| GET/PUT /api/documents/[documentId]/review-draft | 私有预填核对草稿，CAS 修正 |
| POST /api/documents/[documentId]/confirmations | 检查 reviewRevision 与文本版本，生成不可变确认 |
| POST /api/material-selections | draft 或 current-goal 显式选择 |
| GET/PUT /api/material-selections/[selectionId] | 读取 / expectedRevision 更新 |
| POST /api/document-consents | 精确文本版本、用途、providerPolicy 和 privacyPolicy |
| POST /api/document-consents/[consentId]/revoke | 未来发送失去资格；已发送请求保守结算 |
| POST /api/document-jobs | 幂等入队；允许的新尝试可关联 previousJobId |
| GET /api/document-jobs/[jobId] | 只读，不能因轮询启动/重发模型 |
| POST /api/document-jobs/[jobId]/cancel | 取消未来生效，不承诺撤回已发送字节 |
| POST/GET /api/planning/material-contexts | 创建私有上下文 / 按 ID 受权读取 |
| POST /api/planning/material-replans | 当前未完成集合的合法重排提案 |
| 现有 /api/planning/generate、replans/accept、discard | 阶段 1 局部接入，不放宽现有来源和任务集合约束 |
| GET /api/document-deletions/[deletionJobId] | 区分已撤销、清理中、失败、完成 |

HTTP 错误冻结：400 输入形状；401 会话；403 同源/用途；404 不存在或非 owner；409 CAS/幂等冲突；410 自己已失效上下文；413 字节上限；422 引用语义；429 配额/队列；503 未就绪。旧 planning 错误映射保留。未来 route 负责流式累计体积、会话、CSRF/no-store，阶段 0 的 schema 并不替代这些 HTTP 实现。

作用域互斥：

- draft：draftId + previousGoalId 或 null，无 goalId 也能保存资料选择。
- goal：goalId + workspaceId + baseVersionId + revision，必须当前活动目标。
- history：只读，不能复用资料选择动作激活历史。
- first creation：activation → generate 锁保持，绑定只在 generation 成功的同一事务发生。
- new goal：Ready Research 和 previousGoalId 同时成立，失败保持旧活动目标。
- no-material/guest：旧请求对象和指纹输入不新增空哨兵字段。

## 4. 文本、来源与核对

50,000 Unicode 码点 / 256 KiB 单正文，512 KiB 请求，128 KiB 候选/确认，256 KiB 上下文；30 份资料、每份 10 个保留文本版本、账号总量 1,000,000 码点。每目标主简历 ≤1、主 JD ≤1、补充 ≤3。

文本 BOM/换行规范化后，定位为 UTF-16 [start,end)，不得截断代理对。分段由服务端完成，模型仅返回 segmentId + quote；该短引用须在本段唯一匹配，服务端再产生同 owner/文档/版本的 sourceRef。定位正确不等同语义真实。

review draft 绑定文本/提取版本、origin 和 revision；原提取不原位修改，用户新增条目标为 user。迟到结果只可初始化未编辑的匹配草稿，不能覆盖人工编辑。来源、同 owner、generation、confirmation 对应关系每次写入/提交都须重新检查。

## 5. 物理存储与唯一约束

正式 SQL 迁移安排在阶段 1，当前只固定下列设计。所有含 owner 的关联都采用复合键，不依赖 ID 难猜。

| 表 | 必需字段与约束 |
| --- | --- |
| documents | owner/id、kind、displayName、currentVersionId、lifecycle、revision、generation；owner/id 唯一 |
| document_versions | owner/document/id、contentHash、objectKey、bytes/codePoints、storageState、createdAt；复合 FK |
| document_text_versions | owner/document/version/id、parserVersion、textHash、objectKey、编辑来源；不可变 |
| document_extractions | owner/id/jobId/textVersionId、schema/model/policy 版本、有界候选和问题 |
| document_review_drafts | owner/textVersion 唯一、extractionId、items、selfAssessmentHints、origin、revision |
| document_confirmations | owner/document/version/id 唯一、textVersion、extraction/manual 来源、有界事实、reviewRevision |
| material_selections | owner/id、scope、revision、open/bound/expired、boundGoalId、generationMutationId |
| material_selection_entries | owner/selection/document 唯一；主 JD/简历 partial unique；复合 confirmation FK |
| goal_document_links | owner/goal/document、version、confirmation、slot、用途、enabled；主 slot 唯一 |
| planning_context_versions | owner/id、scope/selection/revision、依赖清单、版本摘要、结构化投影、策略版本、lifecycle、expiresAt |
| document_usage_links | owner/document/version/confirmation/context、consumerType、consumerId；索引支持撤销传播 |
| document_processing_consents | owner/id、textVersion、purpose、providerPolicy/privacyPolicy、allowedAt/revokedAt |
| document_jobs | owner/id、版本/consent、state/dispatch、revision/generation、queuedAt/expiresAt、executionSlot、receipt/result/errorRef |
| document_budget_reservations | owner/job 唯一、priceVersion、reserved/actualMicroUsd、reserved/settled/held-unknown/released、receiptId |
| document_budget_counters | owner 或 global + UTC day 唯一，整数累计；条件预留 |
| document_mutations | owner/endpoint/mutation 唯一、bodyDigest、结果 ID/有界回执；不存正文响应 |
| document_storage_operations | owner/id/objectRef、write/delete 意图、generation、状态/重试；写前登记 |
| document_deletion_jobs | owner/id/document、撤销代次、未清理引用、阶段/错误/重试 |

执行器另用专用 D1、专用私有结果 R2、独立签名域与密钥；不绑定整个应用 DB、Proof bucket 或 Research DB。Workflow 输入/输出只含 ID、状态和结果引用；原文仅在授权私有存储和分析内存中流动。

## 6. 三种规划提交事务

所有事务都在应用 D1 的同一个 batch 中完成，最后以约束失败的 guard 保证失败整批回滚。生产 guard 在现有 planning repository 上扩展，不能先保存 plan 再另一个事务写资料关联。

| 提交 | 同批检查 | 同批写入 |
| --- | --- | --- |
| 首次/新目标 generation | owner、draft/selection revision、每个文档代次和生命周期、confirmation/context、audit/time/target 摘要、source Ready/内容版本/期限、previousGoalId | 目标变更、workspace/path/plan、selection bound、goal links、usage、摘要回执 |
| 当前目标 proposal | 上述资料检查 + 当前 workspace/basePlan/inputRevision + 未完成 exact-set/依赖 | 现有 agent_replanned 事件与 proposed plan、usage、候选 sidecar、回执；active plan 不变 |
| accept | candidate 属于 owner/current goal、pending candidate、activeBasePlan、proposalRevision、资料仍有效；不能拿 inputRevision 误比 | 原 accept 事件、active 指针、候选采用记录与回执 |
| discard | owner/current candidate 正确 | 原 discard 事件；即使来源已删也允许放弃，不要求恢复资料 |

已提交提案将 revision 从 N 更新为 N+1 时，sidecar 保存 inputRevision=N 与 proposalRevision=N+1。之后的学习事件、新选择和删除使旧候选不可接受。任何正常 accept 入口都要检查材料 sidecar，不能用老 API 绕过。

accept 继续使用现有接口，其私有回执身份使用独立 `POST /api/planning/replans/accept` 命名空间；不能冒充 generate 或 materialReplan 回执。事务探针还要求本批成功的 CAS 写入 `last_mutation_id`，末尾 guard 必须匹配它；仅见到目标 revision 不能证明本次提交成功。

SQLite 探针验证 owner/version FK、主 JD 唯一、三类事务中资料/selection/context/workspace/source 变化导致回滚、每条语句故障回滚。该探针是机制证据，不等于完整应用 schema、所有业务 CAS 或 R2 分布式事务已实现。

## 7. R2 补偿和删除优先

写正文前在 D1 记录写入意图/配额；R2 成功后以 generation+revision 激活。激活失败登记回收，不能删除后一条迟到写入自动恢复 active。

删除第一事务递增 generation、撤销 consent/草稿/context/候选资格、取消未发任务、记录清理范围。之后读取、确认、claim、预览、接受均拒绝。异步清理原文、确认、候选、核对草稿、解释、上下文、执行器结果、暂存和缓存；只保留必要费用审计与无正文墓碑。

清理失败显示“已撤销，清理中”；不提前显示彻底完成。已知写入意图和执行器写入必须已终止，并回读确认对象不存在；仅租约过期不能证明没有迟到写入。保留普通自评、已完成事件和无私有正文的任务结构。

## 8. 任务、费用与隔离

每用户一个外部执行/费用未明占位，另最多 5 个已授权待发任务；queuedAt/jobId 排序。待发最长 30 分钟，只在确定 not-sent 时释放；未知费用不因超时/跨日/取消/删除释放。

claim 同事务重查 consent、资料代次/lifecycle、策略、队列有效期、预算预留和执行占位。外部调用前持久化 may-have-sent 栅栏；付费步骤 retries.limit=0。收到结果先持久化私有回执，投递失败仅重试投递。结果不明保守保留，不用新 jobId 绕过。

模拟 Provider 模式包含成功、确定未发送、发送后失联、畸形候选、延迟返回。测试必须实测发送计数及重启后的状态；不承诺跨外部服务的 exactly-once。

配置默认关闭；缺任何 provider/model/route/privacy/price/token/timeout/budget 必需字段就不发送。Research 与 Agent 凭据/额度不作为回退。模型 token 上限 16,000/4,096、HTTP 180 秒、步骤 4 分钟；这些是拟定上限，不是实际模型价格或 SLA。

配置名冻结如下。独立开关只表达各子能力是否配置，阶段 1 还必须检查对应操作、会话、精确文本授权和任务资格，不能仅凭 `analysisEnabled` 放行发送。

| 配置 | 用途 |
| --- | --- |
| ARC_DOCUMENTS_ENABLED / ARC_DOCUMENT_ANALYSIS_ENABLED / ARC_DOCUMENT_PLANNING_ENABLED | 保存、分析、规划独立开关；默认 false |
| ARC_DOCUMENT_PROVIDER / ARC_DOCUMENT_MODEL / ARC_DOCUMENT_PROVIDER_ENDPOINT | 精确处理方、模型、HTTPS 端点 |
| ARC_DOCUMENT_PROVIDER_API_KEY / ARC_DOCUMENT_PROVIDER_POLICY_ID | 专用凭据和处理政策引用 |
| ARC_DOCUMENT_ROUTING_POLICY | 有版本的固定 providerOrder、allowFallback=false、dataPolicy=zdr-only |
| ARC_DOCUMENT_PRICE_VERSION | 价格资格表版本；不是实时计费证明 |
| ARC_DOCUMENT_USER_DAILY_MICRO_USD / ARC_DOCUMENT_GLOBAL_DAILY_MICRO_USD / ARC_DOCUMENT_MAX_JOB_MICRO_USD | 用户、全局、单任务整数预算上限 |
| ARC_DOCUMENT_MAX_INPUT_TOKENS / ARC_DOCUMENT_MAX_OUTPUT_TOKENS / ARC_DOCUMENT_HTTP_TIMEOUT_MS | 输入/输出和 HTTP 上限，不得超过本阶段固定的硬上限 |

模型资格表在本阶段保持未认证，不填写臆测模型或实时价格：

| 资格项 | 阶段 0 记录 | 阶段 1 必须补齐 |
| --- | --- | --- |
| 精确 endpoint、model、provider | 未选定，未调用 | 有授权的具体组合与校验日期 |
| 隐私/路由策略 | 契约要求 ZDR、固定路由、禁止回退；未核实服务商承诺 | 实际处理/保留政策、允许路由和政策版本 |
| 价格 | 仅合成整数费用测试；未核实实时价格 | 价格版本、计价口径、token 与实际费用回执 |
| token / timeout | 16,000 / 4,096 / 180 秒；Workflow 步骤配置 4 分钟 | 实际端点支持度；输入预估误差及超时证据 |
| 质量 / 体验 | 固定评测器与合成输出通过不授予模型资格 | 每份文档的成绩、预填页核对、6/6 边界处理 |
| 运行证据 | 本地假 Provider 的计数和故障注入 | 每轮模型/路由/token/费用/排队与处理时延 |

## 9. 指纹与回放

语义指纹 SHA-256 包含 owner/scope、资料/确认/generation、sourceReference、audit/availability/target 语义输入、planningDate、selectedScope、映射/规划/解释版本。排除 context 随机 ID 和创建时间等运行元数据；集合排序规范化，不改变有意义的数组顺序。

快照字段 `policyVersion` 对应规划策略版本（阶段 1 计划中的 planningPolicyVersion），`mappingVersion` 对应 mappingPolicyVersion，`explanationVersion` 独立记录解释规则版本；三者均参与摘要。字段名的这一映射是交接约定，不允许遗漏解释版本或仅修改展示而继续复用旧 previewToken。

previewToken 是摘要而非权限凭证。失效 context 的新生成、候选接受、个性化回放应拒绝；不能通过旧 mutation response 重新取回删除内容。既有工作区的非私有任务/事件回放保持，来源说明可显示“已删除”。真实实现仍在阶段 1，本阶段仅验证输入快照和纯判定。

阶段 1 的接入点固定为：`app/server/planning/service.ts` 解析资料引用、生成预览与重排输入；`app/server/planning/d1-planning-repository.ts` 在原 generation/event batch 中接入资料栅栏和关联；`app/lib/planning/path-builder.ts` 在 ready 集合中应用优先级及依赖继承；`app/lib/planning/event-reducer.ts` 继续验证 exact-set、版本和学习事件；`app/components/setup/setup-draft.ts` 只持久化非私有引用及既有普通配置。阶段 0 未修改这些文件。

## 10. 样例、门槛与交接

planning fixture 固定 foundation→ui→sql→analytics 基线与 foundation→sql→analytics→ui 的未来优先级预期；uncertain 保留校准和学习、已完成不重排、Kubernetes 未覆盖。现有路径引擎可验证基线，材料排序引擎在阶段 1 才接入，不能把预期数组当作已实现能力。

质量集为 24 份合成资料：12 简历、12 JD；18 普通、6 边界，覆盖中英混合、注入、冲突、缺失、目录外要求及团队经历。评测按固定语义标注/引用一对一匹配，重复输出不增加召回，不能以整体平均掩盖某份失败。

阶段 1 目标：18/18 普通样例从预填页完成；每份普通关键项召回≥90%，JD 分类≥90%；保留候选来源合法率100%；6/6边界正确。模型、路由、策略、token、费用及时延必须实际记录。阶段 0 只验证评测器和假结果，真实成绩一律未测。

## 11. 版本和实施范围

- 新增契约未被现有 API、Setup、Research、Agent 或规划器接入。
- 网站接口实现、正式迁移、私有 bucket/Worker 绑定、真实模型及 UI 均属阶段 1。
- 资料任务作用域/表/接口变更必须更新本契约和测试；不放宽来源权威、owner 或 exact-set 验证。
- 当前任务到阶段 0 验收结束，不自动继续阶段 1。
