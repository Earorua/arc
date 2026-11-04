# 私有资料 Gate 1B 验收实施计划

**依据 v2.1 · 验收计划第 1 版 · 定稿时 Gate 1A 已通过，Gate 1B 尚未开始。**

**执行进度（2026-11-04）**　B0 已完成，B1 正在核验 Kimi K3.1 Pro 标准路由。下文 0.50 USD 是原候选的单轮预算建议。Kimi 第一轮改为拟议 2.00 USD、最多 24 份合成简历/JD，实际推理授权仍为 0 USD。B3 的合成模式还需把第三个私有 Worker、其 SQLite Durable Object 迁移和费用纳入隔离环境授权。后续执行以当前候选和分别签署的各轮范围为准。[B1 核验](../../verification/2026-11-04-materials-gate-1b-b1-review.md) · [发布进度](../../verification/2026-11-04-materials-public-release-progress.md)

**目标**　用合成简历和岗位 JD 证明用户可以让 AI 预填，核对并修改事实，随后根据已确认的资料得到有实际变化、可追溯的学习计划。人工填写覆盖拒绝外发、额度不足或分析失败的情形。

**执行安排**　第一轮通过正式 HTTP 适配器验证 24 份样例的模型质量。第一轮通过后，第二轮在隔离验收环境用同一批资料走真实登录、Worker、用户核对与规划链路。现有资格报告只保留评分和回执，无法直接重建浏览器草稿。分两轮可以分别取得模型原始评分和实际产品体验的证据，同时维持现有的报告数据保留范围。

**预算建议**　每轮最多 24 次推理、0.50 USD，两轮合计最多 48 次、1.00 USD。两轮分别登记授权。当前实际推理请求 0，验收环境部署和远程迁移均为 `NOT RUN`。本文的勾选框供后续执行时使用。

## 1. 起点、阶段与工期

候选工作在 `codex/materials-phase-1-offline-20261104` 分支，起始提交为 `2caa51d56a41f60b837425ffa56dea4fbbecbd47`，阶段 1 实现及 Research 修复仍有本地未提交改动。上次全仓离线回归为 335 个文件、7,273 项通过，页面渲染 5/5，类型检查和构建通过，lint 有 4 个既有警告。资格登记中的 24 份真实结果均为 `NOT RUN`。[阶段 1 验收报告](../../verification/2026-11-04-materials-phase-1-results.md) · [真实模型资格记录](../reports/2026-11-04-private-materials-model-qualification.md)

| 阶段 | 开始条件 | 阶段交付与退出条件 | 推理上限 | 预计人日 |
| --- | --- | --- | ---: | ---: |
| B0 离线准备 | 阶段 0 契约和阶段 1 离线成果可用 | 候选版本冻结，六项准备工作有离线证据，全仓回归通过 | 0 | 2–4 |
| B1 配置核验 | B0 候选固定 | 确认端点、上游、隐私、价格、密钥分布，形成可签署的第一轮配置 | 0 | 0.5 |
| B2 模型质量 | B1 通过且取得第一轮限额授权 | 24 份评分、实际路由、用量和费用记录齐全，达到逐文档门槛 | 24 | 0.5 |
| B3 隔离环境 | B2 通过，目标资源、迁移和隔离部署范围获准 | 两个 Worker、真实登录、私有存储、定时维护和故障矩阵通过 | 0 | 1–2 |
| B4 用户流程 | B3 通过且取得第二轮限额授权 | 18 份普通样例从预填页完成核对，6 份边界处理正确，取得一组合法规划差异 | 24 | 0.5–1 |
| B5 清理与签收 | 两轮记录或中止现场已封存 | 对账、物理清理、回退证据齐全，逐项判定 Gate | 0 | 0.5 |

合计约 **5–8.5 人日**，假设已有测试账户和可用的审核人员。平台审批等待、端点不支持所需参数、硬崩溃恢复需要重新设计，以及模型未达标后的新轮次均需另行排期。工程负责人保管候选与运行证据，产品验收人核对预填和路线差异，预算负责人确认请求数、金额、资源范围及有效期。

固定验收依据为 [v2.1 设计](../specs/2026-09-11-arc-private-materials-personalized-planning-design.zh-CN.md)、[阶段 0 的 P0-08](2026-11-04-arc-private-materials-phase-0.md)、[资料契约](../specs/2026-11-04-private-materials-contracts.md)、[阶段 1 的 Gate 1B 条目](2026-11-04-arc-private-materials-phase-1.md) 和[运行手册](../runbooks/2026-11-04-private-materials-phase-1.md)。

## 2. 模型、隐私和费用

### 候选端点

计划以 `openai/gpt-4.1-mini` 经 OpenRouter 的 Azure 上游估价，推理地址为 `https://openrouter.ai/api/v1/chat/completions`。2026-11-04 查阅的目录列出了 Azure 基础端点和较高价格的区域变体。基础 slug 会匹配符合条件的变体。B1 要冻结实际允许的 tag、模型 ID、支持参数和适用价格。若配置和供应方证据无法唯一判定获准路由，即停止在 B1。[模型端点目录](https://openrouter.ai/api/v1/models/openai/gpt-4.1-mini/endpoints) · [路由规则](https://openrouter.ai/docs/guides/routing/provider-selection)

Azure 目录列出 `max_completion_tokens`，当前适配器发送 `max_tokens` 并要求 `require_parameters=true`。B0 用当前端点的参数契约验证映射，缺乏等价性依据时改用经支持的字段，离线验证请求仍有相同输出上限。保留精确响应模型校验。B1 如发现模型 ID 或返回契约已变化，先重新审阅配置。[模型端点目录](https://openrouter.ai/api/v1/models/openai/gpt-4.1-mini/endpoints)

隐私审核要看具体端点及专用 key 生效的账户策略。OpenRouter 文档说明强制 ZDR 会排除 OpenAI 第一方直供，Azure 可作为候选。适用模型组与 guardrail 应采用严格 ZDR 设置，核对 Safety Retention、缓存和当期保留例外，并关闭请求与响应正文日志、外部工具和插件。把处理方、使用目的及适用的保留条件与用户允许页核对，留存无密钥的配置快照。[OpenRouter ZDR 说明](https://openrouter.ai/docs/guides/features/zdr)

### 推理预算

代码按整数 microUSD 预留。1 USD 等于 1,000,000 microUSD。单次预留取 `ceil((最大输入 token × 输入单价 + 最大输出 token × 输出单价) / 1,000,000)`，其中单价均以“microUSD / 百万 token”表示。按 16,000 输入和 4,096 输出计算，先逐次向上取整，再乘请求数。[价格目录](https://openrouter.ai/openai/gpt-4.1-mini) · [项目预留计算](../../../worker/document-executor/provider-http.ts)

| 场景 | 输入 / 输出 USD 每百万 token | 每次预留 microUSD | 24 次预留 USD | 48 次预留 USD |
| --- | ---: | ---: | ---: | ---: |
| 基础 Azure 报价 | 0.40 / 1.60 | 12,954 | 0.310896 | 0.621792 |
| 较高 Azure 变体报价 | 0.44 / 1.76 | 14,249 | 0.341976 | 0.683952 |

**预计消耗**　若每份平均输入 2,000–4,000、输出 1,000–2,000 token，按较高一档价格，24 次约 **0.063–0.127 USD**，48 次约 **0.127–0.253 USD**。这些 token 数是情景假设。按配置顶格计算，两轮预留约 **0.622–0.684 USD**。第一轮即停时，第二轮支出为零。实际消耗由每笔 `usage.cost` 和供应方账单确认，缓存折扣按实记录。[用量计费字段](https://openrouter.ai/docs/cookbook/administration/usage-accounting)

建议每轮 `maxJobMicroUsd=15000`、`totalBudgetMicroUsd=500000`，在隔离账户内设置 `userDailyMicroUsd=globalDailyMicroUsd=500000`。每轮另设 0.50 USD 的专用 key 额度。逐笔检查「已结算金额 + 未决预留 + 本次最坏预留 ≤ 该轮授权额」，并同时检查请求数。两轮账本分开。遇到提价、额外请求费、超额回执或所需套餐发生变化，停止发送并重算。真实费用超出预留时也要如实入账。

| 其他费用 | 如何估算与处理 |
| --- | --- |
| OpenRouter 充值与税费 | 已有余额按推理用量扣减。新购 credits 的 Standard / Business 平台手续费分别为 5.5% / 8%，最低交易额、手续费及税费以结算页为准，单独列账。[平台价格](https://openrouter.ai/pricing) |
| Cloudflare | 已有适用套餐且共享额度充足时，小规模验收的增量费用可为 0。若需新开 Workers Paid，另计约 5 USD/月基础费，以及实际超额的 CPU、请求、Workflow 步骤/存储、D1 行读写和 R2 存储/操作。B3 前记录现有套餐、余量和云费上限，B5 记录实际增量。模型的 1 USD 预算只覆盖推理。[Workers 与 D1](https://developers.cloudflare.com/workers/platform/pricing/) · [Workflows](https://developers.cloudflare.com/workflows/reference/pricing/) · [R2](https://developers.cloudflare.com/r2/pricing/) |

## 3. B0 离线准备

**输入**　当前工作树、阶段 1 离线报告、冻结语料、评分器和运行手册。**交付**　可以复现的候选版本、下表的测试记录及一份无秘密的候选清单。表内新增能力均属后续实施工作。

| 工作项 | 涉及文件 | 完成与验证方法 |
| --- | --- | --- |
| ① 冻结语料与候选 | `tests/fixtures/documents/quality-corpus.json`、`tests/helpers/document-quality-evaluation.ts`、`scripts/materials-qualification-runner.ts` | 在最终离线修正后记录候选提交，或包含未跟踪文件的可重建快照。记录 lockfile、prompt/适配器、评分器、语料、两端产物和两组迁移的 SHA-256。基线 HEAD 单独记录。排除已有用户设计稿的无关变更。复核 9 普通简历、9 普通 JD、3 边界简历、3 边界 JD。 |
| ② 核验传输和真实上游 | `worker/document-executor/provider-http.ts`、`scripts/materials-qualification-runner.ts`、`tests/qualification/document-model.qualification.ts` | 将与已审阅单价一致的路由价格上限和支持的 token 参数纳入请求契约。按唯一回执核验供应方的实际模型、上游及费用，在确认本次记录后才允许下一次发送。每个回执最多 3 次只读元数据查询，合计最多 30 秒。记录处理开始/结束、实际路由和审计结果。用合成 HTTP 响应验证正确路由、错误上游、重复回执、无元数据以及查询超时。 |
| ③ 固定验收资源与密钥边界 | `build/cloudflare-target.ts`、`worker/document-executor/wrangler.local.jsonc`、`app/server/documents/policy.ts`、两侧 `runtime.ts` | 现有资料绑定仅随 local 配置生成。增加专用资料验收目标与两个 Worker 的配置生成/校验，拒绝本地占位 ID、生产或 Research 资源以及缺失的反向入口。当前两侧解析分析政策都要求 API key。本计划选择拆分不含秘密的站点政策校验与执行器凭据校验。验证站点仅凭批准的元数据即可预留，执行器缺专用 key 时实际发送 0，两侧配置摘要一致。拟修改的两个运行时为 `app/server/documents/runtime.ts` 和 `worker/document-executor/runtime.ts`。 |
| ④ 锁住第二轮实际发送次数 | `worker/document-executor/execute-job.ts`、`worker/document-executor/d1-job-store.ts`、执行器迁移与 `tests/server/document-executor-runtime.test.ts` | 在隔离验收模式下，将授权绑定到 runId、测试 owner、24 个 case 的文本摘要和生成后的 textVersionId。在实际出站前，以持久事务检查有效期、冻结的配置与剩余名额，唯一占用 `(runId,caseId)`，并保留原有 job 单次发送检查。第 25 次、重复 case、新建 job 绕过、并发、过期、进程重启或账本写失败都应得到零额外发送。跨日和刷新均不重置整轮限额。 |
| ⑤ 完成崩溃清理的恢复证明 | `app/server/documents/deletion-service.ts`、`app/server/documents/service.ts`、`app/server/documents/storage.ts`、`worker/document-executor/result-store.ts`、`worker/document-executor/maintenance.ts` | 分开检查应用端原文写入者和执行器结果写入者。执行器已有 Workflow 终态恢复路径。重点补齐应用写入者在 R2 PUT 成功、终止登记前崩溃的处置。只允许受控恢复使用与 operationId、generation 对应的终止证明，或能同时阻止旧写入和处理在途 PUT 的隔离机制。注入迟到写、并发维护和第二次清理，证据不足时保持 `cleanup-pending`，证据成立后删除并读回所有登记对象为空。整条路径须在 B3 再演练。 |
| ⑥ 准备 UI 取证和故障夹具 | `tests/materials-uat/start.mjs`、`tests/helpers/document-executor-fixture.ts`、`tests/components/materials-ai-flow.test.tsx`、`tests/server/materials-e2e.test.ts` | 准备只驱动验收站点真实登录及页面操作的记录表/脚本，UI 测试一页对应一个 case。保留既有假 Provider harness 作故障对照。预演 18 次预填核对、6 项边界、同输入成对规划和删除回收。脱敏文件只记录 ID、计数、哈希、状态、时延和差异。 |

- [ ] 固定提取输出 `outputSchemaVersion=2026.11.1`、Workflow `contractVersion=2026.11.1` 与当前映射版本 `2026.11.2`，分别登记实际模型政策和价格政策的版本。重算语料 SHA-256，须等于 `69e5ddd1005f12abf24483e10dd235629ef309ba3a84e922166963ccd9aed750`。按资格运行器分段序列化后的「UTF-8 字节数 + 4,096」单文档最大为 4,750，24 份合计 112,234。这是输入保护值，计算费用使用配置上限。
- [ ] 只在离线证据中使用固定假回执。运行下列现有专项，新增行为须另有针对性的失败和通过证据，特别是实际路由核验、第 25 次发送、硬崩溃写入者恢复。
- [ ] 最终候选跑完全仓、类型检查、lint、生产构建和渲染。记录实际文件数、通过数和退出码，保留三个 Research 套件与其严格哈希检查。候选清单绑定此次实际测试结果。

```powershell
node node_modules/vitest/vitest.mjs run tests/server/document-provider.test.ts tests/server/document-model-qualification-guards.test.ts tests/server/document-qualification-journal.test.ts tests/server/document-executor-runtime.test.ts tests/server/document-deletion-races.test.ts tests/build/cloudflare-target.test.ts --maxWorkers=4
node node_modules/vitest/vitest.mjs run --reporter=dot --maxWorkers=8
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run lint
npm test
```

应用端硬崩溃若只能证明「等待已超时」或「目前读不到对象」，⑤记为阻塞。恢复实现必须证明已发出的写入也不会在清理完成后重新生成对象。发布新版本、数据库手工置位和截图中的空 bucket 都无法单独提供这项证明。

## 4. B1 配置核验与授权记录

### 独立质量评测进程

| 项目 | 配置和核验方法 |
| --- | --- |
| 三个环境变量 | `ARC_DOCUMENT_QUALIFICATION_ENABLED` 仅在获准执行的进程中设为 `true`。`ARC_DOCUMENT_QUALIFICATION_SETTINGS` 注入已复核的 JSON。`ARC_DOCUMENT_PROVIDER_API_KEY` 从该轮专用秘密环境注入，settings 与报告均不含 key。 |
| `config` | `provider` 可用展示名 `OpenRouter / Azure`，`model`、`endpoint` 采用第 2 节候选。登记 `providerPolicyId`、`routingPolicy`、`priceVersion`、`userDailyMicroUsd`、`globalDailyMicroUsd`、`maxJobMicroUsd`、`maxInputTokens=16000`、`maxOutputTokens=4096`、`httpTimeoutMs=180000`。 |
| `routingPolicy` | 包含 `policyVersion`、唯一获准的 `providerOrder`、`allowFallback=false` 和 `dataPolicy="zdr-only"`。HTTP 请求须体现单一允许路由、`allow_fallbacks=false`、`require_parameters=true`、`data_collection="deny"`、`zdr=true`。保留 JSON 对象输出、非流式和禁止跟随重定向。 |
| `qualification` | 传输及价格审阅通过后才填写 `qualified=true`，并填写精确 `endpoint`、`model`、`providerPolicyId`、`priceVersion`、`routingPolicy`、`inputMicroUsdPerMillionTokens`、`outputMicroUsdPerMillionTokens`、`inputTokenBound="utf8-bytes-plus-4096"`。基础报价对应整数 400000 / 1600000，较高报价对应 440000 / 1760000。该字段只记录传输准入，模型质量由 B2 评定。 |
| `authorization` | 必填 `id`、`runId`、`endpoint`、`model`、`provider`、`providerPolicyId`、`priceVersion`、`routingPolicy`、上述两种单价、`maxRequests=24`、`totalBudgetMicroUsd`、`corpusSha256`、`privacyEvidence`、`pricingEvidence`、`approvedAt`、`expiresAt`。与 config/qualification 对应值逐项相同。依据用无查询串、账户信息或片段的 HTTPS URL。 |
| 顶层与格式 | 现有 settings 顶层仅为 `{runId, config, qualification, authorization}`。ID 使用小写字母、数字和连字符，版本使用 `YYYY.MM.N`。配置摘要、审批人、代码/目标资源摘要、实际允许的上游与所选端点目录快照放在独立授权附件，保留 strict schema。 |

- [ ] B1 当天从官方目录和专用 key 的设置核对端点、别名或版本、数据政策、参数与单价，记录时点、审批人和快照摘要。先将实际可用路由收窄至已核验的范围。若同名 Azure 变体的价格或隐私条件不同，使用可确证的具体 tag 或可唯一限定的路由与价格条件。
- [ ] 确认回执查询可取得本 key 的 `provider_name`、`model`、请求 ID、token、费用与时延。保存可追溯到允许上游的证据。若元数据只显示供应商名且仍有多个不等价端点，须取得可辨识的路由证据再放行。取证范围限于元数据。[回执元数据接口](https://openrouter.ai/docs/api/api-reference/generations/get-request-&-usage-metadata-for-a-generation)
- [ ] 第一轮授权绑定独占运行机、持久账本、获批 settings 摘要和语料摘要。`approvedAt` 取实际批准时刻，`expiresAt` 建议在 2 小时后。第二轮另设 runId、测试账户、隔离站点、批准时刻和建议 4 小时窗口。每次发送前再次检查到期、剩余预算和名额。
- [ ] B2 授权范围是一次本地运行器评测。B3 单独登记目标资源、迁移、部署窗口及云费，B4 单独登记 UI 轮的请求和预算。若只有一次 24 请求的授权，完成 B2 后将 B4 记为 `NOT RUN`。

### 隔离环境配置清单

以下绑定名对应现有代码。实际账号、资源名、ID、域名、构建哈希和迁移版本须登记在 B3 的目标清单，并在远程操作前交叉核对。

| 位置 | 必须配置 |
| --- | --- |
| 应用 Worker | 独立 HTTPS 验收 origin、`BETTER_AUTH_URL`、会话及已启用 OAuth 渠道的测试凭据与回调。仅验收账户可访问。`DB` 指向验收应用 D1，`DOCUMENT_ASSETS` 指向私有资料 R2，站点需要的 `PROOF_ASSETS` 指向独立资源。`DOCUMENT_EXECUTOR` 指向验收执行器的 `DocumentExecutorEntrypoint`。 |
| 执行器 Worker | `DOCUMENT_EXECUTOR_DB` 指向专用 D1，`DOCUMENT_JOB_ASSETS` 指向专用临时结果 R2，`DOCUMENT_WORKFLOW` 绑定 `DocumentWorkflow`，`DOCUMENT_SITE` 指向应用的 `DocumentSite`。公网入口应返回 404。 |
| 两侧策略 | `ARC_DOCUMENT_PROVIDER`、`ARC_DOCUMENT_MODEL`、`ARC_DOCUMENT_PROVIDER_ENDPOINT`、`ARC_DOCUMENT_PROVIDER_POLICY_ID`、`ARC_DOCUMENT_ROUTING_POLICY`、`ARC_DOCUMENT_PRICE_VERSION`、`ARC_DOCUMENT_PROVIDER_QUALIFICATION`。比对两侧的模型、预算、路由和版本摘要。 |
| 两侧预算与边界 | `ARC_DOCUMENT_USER_DAILY_MICRO_USD`、`ARC_DOCUMENT_GLOBAL_DAILY_MICRO_USD`、`ARC_DOCUMENT_MAX_JOB_MICRO_USD`、`ARC_DOCUMENT_MAX_INPUT_TOKENS`、`ARC_DOCUMENT_MAX_OUTPUT_TOKENS`、`ARC_DOCUMENT_HTTP_TIMEOUT_MS`。数值见第 2 节。付费步骤 4 分钟、重试 0。 |
| 秘密、允许与开关 | 两侧注入同一专用 `ARC_DOCUMENT_BRIDGE_SECRET`，至少 32 字符。完成 B0 密钥拆分后，仅付费进程或执行器持有该轮 `ARC_DOCUMENT_PROVIDER_API_KEY`。初始将 `ARC_DOCUMENTS_ENABLED`、`ARC_DOCUMENT_ANALYSIS_ENABLED`、`ARC_DOCUMENT_PLANNING_ENABLED` 关闭，按 B3/B4 的测试范围启用。 |
| 维护与存储 | 两个资料 bucket 关闭公共访问，确认原文和临时结果分别落到预期 bucket。两侧定时维护实际触发，参考本地配置每 5 分钟一次。`ARC_DOCUMENT_MAINTENANCE_ENABLED=true` 控制执行器维护。保留队列、取消通知、回执补投和删除清理能力。 |

## 5. B2 第一轮模型质量

**输入**　B0 候选、B1 授权、专用 key 和固定的 24 份合成资料。**执行入口**　`vitest.materials-qualification.config.ts` 只发现 `tests/qualification/document-model.qualification.ts`，使用一个 worker，测试重试 0。

- [ ] 核对运行目录在应用根目录，指定的 runId 从未占用。将审批后不含 key 的 settings 放入受限且由 Git 忽略的 `work/materials-gate-1b/quality-approved.json`。单独的临时执行进程从秘密存储取得专用 key。
- [ ] 仅在这轮授权生效后执行下面的独立命令。第一份样例即第一次真实请求。依语料文件顺序执行普通 `resume-01` 至 `resume-09`、普通 `jd-01` 至 `jd-09`、边界 `resume-10` 至 `resume-12` 和边界 `jd-10` 至 `jd-12`。每份最多发送一次，预留先落盘，再发送。出站用户数据只含资料类型与带 ID 的原文分段，金标准、期望核对项和评分器留在本机。一轮内不得更改 prompt、评分器、金标准、模型或路由。
- [ ] 每笔用生产来源校验器检查实际候选和 reviewPoints，再对照冻结的 acceptedForms、skillLabels、segmentId、原文引用和语义字段做一对一匹配。记录原始评分后才进行用户侧核对。未登记的同义改写保留失败记录，下一轮才能采用重新审阅的标注。
- [ ] 对每笔核对模型、实际路由、唯一回执、输入/输出 token 和 microUSD，记录发送、返回、元数据核验时间。直接运行器没有产品队列，排队时延填 `N/A`。B4 再测真实排队。当前套件总超时为 73 分钟。若 B0 把每份最多 30 秒的回执查询计入同一测试，整体上限应配套为 85 分钟，单笔模型 HTTP 仍限 180 秒。
- [ ] 封存 `work/materials-qualification/<runId>/ledger.jsonl` 与 `result.json`，核对 `mode=authorized-live`、请求 24、唯一且已结算回执 24、`heldMicroUsd=0`、`stoppedReason=null`、`passed=true`、`normalPrefillCount=18` 和 `edgePassCount=6`。核对 24 行逐项结果后再进入 B3。

```powershell
# 后续获准的 B2 专用进程。API key 已通过秘密环境注入。
$gate1bSettingsPath = Join-Path (Get-Location) 'work/materials-gate-1b/quality-approved.json'
if (-not $env:ARC_DOCUMENT_PROVIDER_API_KEY) { throw '缺少本轮专用 key' }
try {
    $env:ARC_DOCUMENT_QUALIFICATION_SETTINGS = Get-Content -Raw -LiteralPath $gate1bSettingsPath
    $env:ARC_DOCUMENT_QUALIFICATION_ENABLED = 'true'
    node node_modules/vitest/vitest.mjs run --config vitest.materials-qualification.config.ts
    if ($LASTEXITCODE -ne 0) { throw '资格评测未通过，请保留本轮账本' }
} finally {
    Remove-Item Env:\ARC_DOCUMENT_QUALIFICATION_ENABLED -ErrorAction SilentlyContinue
    Remove-Item Env:\ARC_DOCUMENT_QUALIFICATION_SETTINGS -ErrorAction SilentlyContinue
}
```

**逐文档判定**　每份普通样例关键项召回 ≥90%，每份适用 JD 的必备/加分正确率 ≥90%，遗漏算错。无适用标注的指标记 `N/A`。所有保留候选的来源合法率为 100%。18 份普通样例均可预填，6 份边界均符合下表。每个高影响问题有合法来源，并交由用户处理。已结算但质量落线的样例可以继续收集该轮余下样例，整轮结论为 `FAIL`，B4 不启动。[P0-08 评测器](../../../tests/helpers/document-quality-evaluation.ts)

| 边界文档 | B2 检查模型输出，B4 检查用户实际看到的结果 |
| --- | --- |
| `resume-10` | 标出简历中的注入文本及需确认的自评，只有用户能确认能力 |
| `resume-11` | 区分团队成果和个人贡献，保留归属与自评核对项 |
| `resume-12` | 冲突自评和缺失信息均可定位，用户可以逐项处理 |
| `jd-10` | 标出 JD 中的注入指令，执行工具、访问链接次数为 0 |
| `jd-11` | 标注未覆盖技能及不可信链接，只可选择蓝图中已有技能 |
| `jd-12` | 两处冲突要求各有引用，缺失信息可见，用户决定必备/加分 |

## 6. B3 隔离环境与故障演练

**输入**　通过的 B2 记录、B0 双 Worker 产物与允许的目标资源清单。**验收人**　工程负责人和验证环境操作者。此阶段以受控假传输注入故障，真实推理计数应为零。

- [ ] 对经授权的验收账户核对站点、执行器、两个 D1、私有 R2、Workflow、服务入口、cron、OAuth 回调和密钥绑定。先预检配置渲染结果和迁移清单，实际资源与审批清单一一对应后再进行隔离部署。保存平台部署 ID、两端产物摘要和数据库版本。
- [ ] 用合成旧数据检查应用从 0013 增量到 `drizzle/0014_private_materials.sql`，新库检查完整迁移链。执行器应用 `worker/document-executor/migrations/0000_document_executor.sql` 及 B0 新增的增量迁移。验证外键、唯一约束、原子回滚和旧规划读取。
- [ ] 在隔离站点用两个测试账户完成真实登录，核对 origin、会话与所有者隔离。执行 `申请允许 → 排队 → claim/input → 结果投递 → 草稿`。核对双向签名、60 秒时间窗、持久 nonce 和真实 Workflow 实例，截取一次两端 cron 的实际维护回执。
- [ ] B3 使用 `DOCUMENT_PROVIDER_TRANSPORT` 接到私有合成响应服务，隔离真实模型凭据并封禁通用 fetch 外发。验证移除该绑定会在出站前拒绝，防止运行时默认 fetch 到达付费端点。测试正常链路后依次执行下表故障，记录开始状态、合成发送计数、真实推理计数 0、最终状态和清理回执。B4 开始前再按已审阅的配置差异切换到固定真实端点和本轮专用 key。

| 注入点 / 操作 | 应观察到的行为与证据 |
| --- | --- |
| 未允许、错误 owner、旧 textVersionId/generation、purpose 或政策不符 | 拒绝读取、claim 或发送。检查两侧状态、出站计数 0，并核对另一账户看不到原文和历史依据 |
| 重复提交、重放签名、错密钥、过期签名、访问公网内部路径 | 正常幂等恢复。重放和无效签名被拒，公网内部路径 404。同一任务最多发送一次 |
| 同 owner 同时提交简历和 JD，关闭浏览器或应用重启 | 一个执行位，后续任务串行。等待超过 30 分钟的确定未发任务按契约结束，队列上限 5。回执恢复后每文档发送次数仍正确 |
| 输入已取回，撤销/取消先于发送 | 出站 0，释放确定未发的预留。取消通知失败进入 outbox，维护补投有效 |
| 发送中超时、断线或进程崩溃 | 记录 may-have-sent，未知费用占位跨重启/跨日保留，阻止额外发送。可核实迟到回执时只结算一次 |
| 结果已落 R2，投递失败后重启 | 从已登记结果恢复投递，发送计数仍为 1。用户先修改草稿或已撤销/删除时，迟到结果不能覆盖草稿或恢复资格 |
| 删除与写入竞态、R2 删除失败，或 PUT 后登记前硬崩溃 | tombstone/generation 立即禁用引用、预览与接受。无终止证据保持 `cleanup-pending`。取得 B0 的写入终止/隔离证明后重做删除与读回，确认旧写入不能复活对象才记 `completed` |
| 停用新分析/新规划、费用不足、用户拒绝外发 | 已保存路线和手动整理可继续，用户能查看/删除自己的资料，必要的维护继续运行。计入兜底原因和次数 |
| 隐私与运行日志检查 | 在合成故障夹具放置 sentinel，检查浏览器持久化、公开响应/缓存、应用和执行器日志、Workflow 历史。私有正文、候选全文、摘录和密钥匹配数均为 0，私有 R2 内预期存在的对象单独检查 |

出现越权、无允许外发、重复发送、正文泄漏或删除后旧结果生效，即停发、保留回执、隔离候选并判 `FAIL`。若硬崩溃的恢复路径只能证明「安全地继续 pending」，记录这一安全行为，同时将整体清理验收记为 `BLOCKED`，直至证明和清理读回均可重现。

## 7. B4 第二轮从浏览器完成核对与规划

**输入**　通过的 B2 和 B3 证据、第二轮专用授权与额度、测试账户、同一批语料。先核对从 B3 切换到真实传输时的配置差异和构建哈希。候选代码、适配器、prompt 或评分依据若已变化，先确认影响并重新取得对应验证证据。

- [ ] **登记 24 份资料。** 每次通过产品的粘贴入口创建资料，登记 `caseId → owner/documentId/documentVersionId/textVersionId/generation` 和规范化合成文本摘要。每份在 UI 查看处理方、实际文本与用途，明确允许分析，记录 `consentId → jobId → receiptId`。按序处理，保留实际排队时间和处理时间。
- [ ] **核对真实发送内容。** 在受控边界用内存比对文本摘要、段落范围、textVersionId、purpose=analysis、providerPolicyId、policyVersion、generation 与允许记录，报告仅写匹配结果。B2 保留标注段 ID 并补齐传输间隙，产品按最多 2,000 个 UTF-16 单元生成自己的段 ID。B4 根据真实版本的原文位置与引用核对，禁止把 B2 的段 ID 或金标准复制进草稿。
- [ ] **完成 18 份普通样例。** 逐份记录首次显示时的非空预填条目数、可定位来源数、用户保留/修改/移除/新增数、核对提交与确认回执。至少实际修改一条事实、处理一项高影响提醒、单独选择或保留一项自评。18/18 都应从 AI 草稿完成，整份从空表重录的次数为 0。用户纠错前的 AI 表现与纠错后的确认结果分栏记录。
- [ ] **处理 6 份边界样例。** 按第 5 节的六行逐份操作，核对提醒和证据，测试高影响事项未处理时无法确认、处理后才可提交。无证据的独立掌握/已验证能力、擅自解决冲突、访问资料内链接、执行注入指令均直接判失败。
- [ ] **取得一组可解释的规划差异。** B0 预演时优先检查固定样例 `resume-05 + jd-05` 对应的 HTML/CSS/TypeScript 要求，并在真实运行前冻结能产生差异的样例、输入和断言。固定蓝图/注册表版本、自评、可用时间、日期、目标及所选范围。用同一组输入分别预览无资料路线和带真实确认资料的路线。记录至少一处合法的任务类型、顺序或范围差异，以及 `itemId → sourceRef → confirmationId → contextVersionId`。如果只有解释文案或指纹变化，该项失败。
- [ ] **验证保存、接受和放弃。** 首次路线原子保存资料关联。已有路线用固定进度比较重排前后任务 ID 集合、依赖和已完成事件。检查接受只改动合法的未完成顺序，放弃保留原路线，刷新可恢复回执。对源资料执行删除后，旧候选无法接受，已保存历史显示依据已删除。
- [ ] **结束发送窗口。** 第二轮授权耗尽、到期或任一停发条件触发即关闭验收出站，记录已发/未发 case 和原因。正常完成应有 24 份 UI 记录及 24 个可对账回执。核对、重预览、刷新、接受和放弃均复用现有结果，新增推理计数为 0。

产品验收人逐文档登记修改/忽略比例、采用人工兜底的原因及次数、任务失败率和等待时长。比例注明分子、分母及无适用条目时的 `N/A`。这些是体验观测数据。签收门槛仍使用 18/18、6/6、合法来源与实际规划变化。

## 8. 停发、对账和回退

| 触发条件 | 当场处理 | 恢复条件 |
| --- | --- | --- |
| 配置缺失、过期、摘要不符、名额耗尽、下次最坏预留将超额 | 在 HTTP 前停止。确定未发的预留才可释放，其余逐项标 `NOT RUN` | 核对现场，归档已使用的授权。需要新一轮时重新审批 runId、预算和有效期 |
| 配置无法证明所选路由、实际上游/模型不符、元数据取证超时 | 暂停两侧所有后续推理，隔离本条候选。已知费用照实结算，路由取证单独标未通过 | 只读核对供应方回执和策略，排除错误路由并重新冻结配置 |
| 网络超时、连接中断、回执缺失/重复、账本写失败、进程异常 | 停止整轮。末条只有 reserved 的记录按可能已发处理。无法确定费用时保留 `held-unknown`，封存已有账本及未运行清单 | 人工或供应方回执对账后更新处置记录。原 runId 目录保持独占，禁止删目录、换主机或补发同一文档来恢复成绩 |
| 账单与用量不符或实收超预留 | 停发并记真实已知费用，按 `round(usage.cost × 1,000,000)` 对账，单列缓存、舍入或异常差额 | 解释差额、复核价格与账户额度后再决定新轮次 |
| 质量失败但账目确定 | 第一轮已授权的其他文档可继续计分。冻结失败码、逐项分数与本轮版本，整轮 `FAIL` | 拟修订项先离线验证。更换模型、prompt、标注或评分器后须单独编号、重新预算和评测 |
| 越权、隐私泄漏、重复发送、敏感数据残留或删除后复活 | 立即关闭出站与新规划提交，隔离输出，保留最小审计与必要维护。记录影响的 case、对象与版本 | 修复对应原因并重跑相关离线、隔离环境验证。未解决的失败或阻塞保留在签收单 |

B5 先锁定出站名额，停新分析和新个性化提交，再关闭验收入口。逐项处理已排队未发任务、已发回执、取消 outbox 和清理任务。待两侧完成维护后再回收专用模型 key 和临时资源。保留兼容读取的应用版本、费用账本和必要的幂等记录。回退过程中保留迁移与删除代次。

## 9. B5 证据包与最终签收

运行证据按 runId 分开。资格运行器现有目录为 `work/materials-qualification/<runId>/`，其余证据建议存入处于访问控制和保留期限内的 `work/materials-gate-1b/<runId>/`。原始设置中不含秘密，归档件仍需脱敏。文档与截图只使用合成资料。运行日志、公开报告、Workflow 历史和浏览器持久化中正文/密钥匹配数应为 0。

| 交付件 | 最少可核查内容 |
| --- | --- |
| `candidate-manifest.json`、两份授权和一份云资源清单 | 候选提交或可重建快照、构建/配置/语料/迁移摘要、策略与价格依据、授权人、有效期、运行机和环境、次数与金额上限 |
| B2 的 `ledger.jsonl`、`result.json` 和补充路由/时延记录 | 每个 case 的状态、原始召回/分类/来源/预填、失败码、token、唯一回执、预留/实收、实际上游、处理时延、剩余未运行清单 |
| `environment-evidence.json` 和 `fault-matrix.md` | 两个 Worker 部署 ID 与双向入口、D1 迁移版本、私有 R2、Workflow、签名拒绝、维护 cron、重启/取消/费用未知/硬崩溃演练以及每项计数 |
| `ui-cases.jsonl` 和 `plan-diff.json` | 24 行真实 UI 记录，允许与实际输入的匹配、预填/核对/确认、修订与兜底统计、排队/处理耗时。至少一组路线前后任务 ID、依赖和来源链 |
| `reconciliation.json` 和 `cleanup.md` | 分轮汇总发送数、回执去重数、结算/未知金额与供应方账单，原文/派生数据/临时结果的删除范围、写入者终止或隔离证据、对象读回结果、回退状态 |

- [ ] **离线基线**　最终候选的 Gate 1A 回归、构建、类型检查、页面渲染全部通过。Research 严格校验有效。
- [ ] **真实质量**　B2 为 `authorized-live`，24/24 已完成，18/18 普通可预填、6/6 边界正确。逐文档应用 90% 召回、90% 适用 JD 分类和 100% 保留来源门槛。正常真实轮次失败、未执行和未核实费用均为 0。
- [ ] **允许与运行环境**　B3 的本地及隔离双 Worker、双向绑定、签名、Workflow、迁移、恢复与维护均有对应版本证据。B4 每笔发送与其 owner、允许版本、用途、隐私政策、模型、实际路由及预算一致。
- [ ] **产品体验**　B4 的 18 份普通样例从预填页完成、6 份边界处理正确，有明确用户确认、自评单独采用的证据。至少一个合法规划样例发生可追溯的实际变化，接受/放弃和已完成任务保护均通过。
- [ ] **费用与异常**　两轮各不超过 24 次及各自的获准金额。重试、并发与重启造成的额外付费发送为 0。正常真实账本无悬账。人工注入的 unknown 用独立故障记录证明保守占位和恢复。
- [ ] **清理与隐私**　清点并删除合成原文、文本、确认、私有上下文、候选与执行器结果。两侧写入者均可证明终止或隔离，删除对象逐个读回为空。旧候选与迟到响应均无法恢复已删除内容。监控和历史仅保留最小必要元数据。

**判定规则**　全部勾选且证据能对应同一候选及获准配置时，Gate 1B 记 `PASS`。观察到门槛违反记 `FAIL`。缺可核验路由、环境、对账或写入终止证据记 `BLOCKED`。尚未开展的项目记 `NOT RUN`。中途停止也须完成已发账目和现场清理。工程负责人核对运行证据和费用，产品验收人核对 24 行 UI 结果及规划差异。

实际执行完毕后，把判定、证据索引、费用、未执行项及原因写回阶段 1 验收报告、真实模型资格记录和 `verification-summary.json`。分别登记 Gate 1A、Gate 1B、验收环境及生产发布状态。Gate 1A 与 1B 都通过后，方可登记阶段 1 完成。生产发布按单独的发布范围办理。

**下一项工作**　B0 先登记当前候选和固定语料，再补齐传输取证、隔离配置、请求计数、硬崩溃恢复和 UI 记录。完成离线验证后，提交候选摘要与 B1 配置供第一轮资格评测审批。

