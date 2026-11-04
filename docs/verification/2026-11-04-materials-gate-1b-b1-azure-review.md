# Gate 1B · Azure 首轮 B1 核验（历史记录）

本记录保留首次核验时点与原草案。2026-11-04 用户已将候选改为 Kimi，请以[当前 B1 报告](2026-11-04-materials-gate-1b-b1-review.md)为准。


2026-11-04 · **B1 `BLOCKED`（公开核验完成，专用 key 的生效策略与回执能力待证）** · B2 `NOT RUN`

可以提交审批的候选是 `openai/gpt-4.1-mini` 经 OpenRouter 路由至 **Azure Sweden Central**。已从同一端点记录核对 tag、UUID、模型版本和价格，并核对公开 ZDR 分类。要放行 B1，还缺本轮账户设置以及冻结候选能接受的回执证据。第一轮预算也尚未授权。本次只匿名读取公开资料并运行本地离线检查，真实推理 **0 次**、推理费用 **0 USD**、部署和远程迁移均 **0 次**。[定稿计划 §2、§4](../superpowers/plans/2026-11-04-private-materials-gate-1b-acceptance.md) · [B0 验收结果](2026-11-04-materials-gate-1b-b0-results.md)

## 1. 核对到哪条端点

以下是 2026-11-04 **08:01:46–08:04:52 UTC** 公开抓取的结果。普通端点目录有三条，按本模型精确筛选 ZDR 目录后剩两条。基础 slug 可匹配区域变体，所以此次只提请批准区域 tag。未来推理地址为 `https://openrouter.ai/api/v1/chat/completions`。[端点目录](https://openrouter.ai/api/v1/models/openai/gpt-4.1-mini/endpoints) · [ZDR 目录](https://openrouter.ai/api/v1/endpoints/zdr) · [路由匹配规则](https://openrouter.ai/docs/guides/routing/provider-selection)

| 目录 tag | 端点证据 | 输入 / 输出 USD 每百万 token | 本轮处置 |
| --- | --- | ---: | --- |
| `azure/swedencentral` | `Azure` · `fd1475c4-5864-42c0-bca0-d78568a069cb` · ZDR 名单内，`safety_retention=false` | **0.44 / 1.76** | 唯一提交审批的路由 |
| `azure` | `Azure` · `1551aa56-4221-448a-b280-f862f73c27de` · ZDR 名单内，`safety_retention=false` | 0.40 / 1.60 | 基础标签匹配范围较宽，排除 |
| `openai` | 第一方直供，未列入本模型的 ZDR 目录 | 0.40 / 1.60 | 排除 |

**端点身份。** 普通目录没有回执用的 UUID。官方供应商页的模型标准变体记录同时给出 `provider_slug=azure/swedencentral`、`provider_region=swedencentral` 和该 UUID。模型首页同一记录的 `stats.endpoint_id` 也与 `id` 相等。公开价格记录版本为 `73463586-2633-4a5e-b033-21b504fafb47`。三项一起复核可区分同名 Azure 端点。[官方供应商页](https://openrouter.ai/openai/gpt-4.1-mini/providers) · [官方模型页](https://openrouter.ai/openai/gpt-4.1-mini) · [本次逐字段快照](materials-gate-1b-b1-azure-20261104/public-evidence.json)

**模型名。** 对外请求 ID 为 `openai/gpt-4.1-mini`，永久标识为 `openai/gpt-4.1-mini-2025-04-14`，区域端点另列上游名 `gpt-4.1-mini`。按带日期标识查询端点目录也返回无日期的 `data.id`。实际聊天响应和回执两处 `model` 的返回拼写，还需要回执证据核对。冻结校验器对两者均要求与请求配置逐字相同。[模型详情](https://openrouter.ai/api/v1/model/openai/gpt-4.1-mini) · [带日期的目录查询](https://openrouter.ai/api/v1/models/openai/gpt-4.1-mini-2025-04-14/endpoints) · [路由元数据说明](https://openrouter.ai/docs/guides/features/router-metadata) · [冻结回执校验器](../../worker/document-executor/generation-receipt.ts)

**参数。** 区域端点列出 `max_completion_tokens`、`temperature` 和 `response_format`。B0 适配器发送 `max_completion_tokens=4096`、`temperature=0`、`response_format.type=json_object`、`stream=false`，使用手动重定向策略并拒绝重定向结果。请求的 `provider.only` 和 `provider.order` 都只含区域 tag，同时设 `allow_fallbacks=false`、`require_parameters=true`、`data_collection=deny`、`zdr=true`。第一方、基础标签和自动回退均无名额。[端点目录](https://openrouter.ai/api/v1/models/openai/gpt-4.1-mini/endpoints) · [路由参数](https://openrouter.ai/docs/guides/routing/provider-selection) · [冻结传输适配器](../../worker/document-executor/provider-http.ts)

## 2. 隐私政策与待验的账户配置

| 层级 | 公开核验 | 账户持有人 / 产品验收人需核对 |
| --- | --- | --- |
| 端点与上游 | 选定端点标记 `retainsPrompts=false`、`training=false`、`trainingOpenRouter=false`、`safetyRetention=false`。微软描述了 Azure 通用的自动滥用监测、部分情形下的样本审查及获批客户的例外。 | 确认接受 OpenRouter 和微软 Azure 处理合成文本。若需特定租户合同证明或端到端欧盟驻留，另取证明。区域 tag 只标识上游，配置使用 OpenRouter 全球入口。[端点记录](https://openrouter.ai/openai/gpt-4.1-mini/providers) · [微软数据隐私](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy) · [区域路由](https://openrouter.ai/docs/guides/features/in-region-routing) |
| ZDR 生效范围 | ZDR 目录也收录允许 Safety Retention 的端点。本次两条 Azure 的该标记均为 false。对 OpenAI 模型组强制 ZDR 会排除第一方直供。请求中的 `zdr=true` 会沿用有效的账户和 guardrail 策略。在有 Safety Retention 选择的模型组，自助账户未选择时默认允许。 | 出具同一工作区、专用 key 和生效护栏的脱敏关联证明。证明 OpenAI 组实际强制 ZDR（`enforce_zdr_openai=true` 或生效的全局强制），且限制到本次获准的 Azure 端点。记录组织及成员策略。**All other models** 的 `allow_safety_retention_other` 适用于列名供应商之外的模型，可另选严格档，不能代替 OpenAI 组的证据。[ZDR 分组和例外](https://openrouter.ai/docs/guides/features/zdr) · [护栏字段定义](https://openrouter.ai/openapi.json) |
| 正文、训练和缓存 | OpenRouter 的私有输入输出日志及允许用正文改进产品是两个独立开关。平台仍有用量、计时等元数据。OpenRouter 还可能抽样将提示交给实行 ZDR 的模型分类，用于报告和排名。关闭正文改进授权时，分类结果匿名且不关联账户。该页未标明分类模型的上游。账户级 ZDR 会禁用 OpenRouter 响应缓存，单次请求设 ZDR 本身不足。区域目录另标 `supports_implicit_caching=true`，上游内存提示缓存属另一层。 | 两项正文 opt-in 均关闭，核对账户级 ZDR 与响应缓存的有效状态，无开启缓存的 preset 或请求头。确认是否接受隐式内存缓存及抽样分类。若要求只有指定 Azure 端点可接触正文，需先取得适用豁免或配置证明。记录账户/组织无会接收本轮正文的 Broadcast 目的地，运行不启用工具、插件、搜索或外部追踪。[数据收集](https://openrouter.ai/docs/guides/privacy/data-collection) · [响应缓存](https://openrouter.ai/docs/guides/features/response-caching) · [Broadcast](https://openrouter.ai/docs/guides/features/broadcast) |
| 保留例外与产品允许 | 10 月 27 日公开公告计划对包括 ZDR 的推理进行在途 CSAM 筛查。疑似命中可复核，适用时可依法报告、保存。核验日指南仍将该措施标为计划更新。 | 确认这些条件适用于本轮合成资料。现有允许页列明处理方、用途、发送当前文本及链接处理，未在这段文案列出缓存、保留例外。产品验收人在 B4 前核对正式披露，涉及文案变更时另行审阅候选。[筛查公告](https://openrouter.ai/blog/announcements/csam-screening/) · [ZDR 指南](https://openrouter.ai/docs/guides/features/zdr) · [当前允许页](../../app/components/materials/material-text-panel.tsx) |

## 3. 回执能力为何仍阻塞 B1

官方定义的 `GET /api/v1/generation?id=<回执ID>` 使用 Bearer 认证，能提供路由、用量、费用与时延。规范允许 `provider_responses`、`provider_name`、原生 token 数、时延为空。单条尝试的 `endpoint_id` 可缺失，`status` 可为空。聊天响应的费用也可缺失或为空。目录里的端点 UUID 已经查明，专用 key 能否读到符合下列条件的回执尚无实证。[回执元数据接口](https://openrouter.ai/docs/api/api-reference/generations/get-request-%26-usage-metadata-for-a-generation) · [官方 OpenAPI](https://openrouter.ai/openapi.json)

| 核对项 | 冻结候选需要的证据 |
| --- | --- |
| 同一请求、同一模型 | 聊天响应 ID 与元数据 `data.id` 相同且唯一。聊天 `model` 与 `data.model` 均逐字等于 `openai/gpt-4.1-mini`。 |
| 唯一上游 | `data.provider_name=Azure`，`provider_responses` 恰有一条，`status=200` 且 `endpoint_id=fd1475c4-5864-42c0-bca0-d78568a069cb`。若聊天或单条尝试也给出 provider，名称须一致。 |
| 用量、费用、时延 | `usage.prompt_tokens/completion_tokens` 与 `native_tokens_prompt/native_tokens_completion` 对应相等，`usage.cost` 和 `total_cost` 换算四舍五入至 microUSD 后相等，且满足按实际 token 计算的费用边界。计划要求另核实 `latency`、`generation_time` 是否可取，保留发送、接收和核验时间。 |

**无新增推理的补证方式。** 请账户持有人提供本 key 在所属工作区读取获准回执元数据的权限证据，并附同区域、同模型的一组既有聊天与元数据回执的脱敏字段。两份材料可使用同一回执 ID 的本地摘要来关联。也可提交供应方针对该 key 权限范围及上述字段和模型拼写的书面确认供复核。只需元数据，不需正文或密钥。通用示例、其他路由样本、单独一个供应商名或一张 key 余额截图都不能证明这些条件。如果实际返回带日期模型名、缺 UUID 或不可读取，保留阻塞并重新审阅配置或契约。若需修改实现，须重新冻结候选。[冻结核验逻辑](../../worker/document-executor/generation-receipt.ts) · [模型标识说明](https://openrouter.ai/docs/guides/overview/models)

## 4. 提请确认的配置和预算

| 项目 | 拟签值 |
| --- | --- |
| 候选、输入 | B0 提交 `87add0a010d601873f493a13cfa327deb5a5e657`，tree `b93efadeb38136f35f6c5a35de20a14c617fac1f`。24 份冻结合成简历/JD，语料 SHA-256 `69e5ddd1005f12abf24483e10dd235629ef309ba3a84e922166963ccd9aed750`。仅发送固定系统提示、类型及带 ID 的原文分段，金标准与评分器留在本机。 |
| 模型和政策 | 展示名 `OpenRouter / Azure`，模型和路由按 §1，`receiptRoute` 使用同一 Azure 名称和区域 UUID。拟用本地 `providerPolicyId=materials-openrouter-azure-swedencentral-zdr`，`routingPolicy.policyVersion=2026.11.2`、`priceVersion=2026.11.2`。这两个版本是待审的本地标识，供应方价格版本另见 §1。 |
| 运行上限 | 输入 16,000 token，输出 4,096 token，输入保护 `utf8-bytes-plus-4096`，HTTP 超时 180 秒。单机串行，最多 24 次付费 POST，每份最多一次。每笔回执最多 3 次只读 GET，共用 30 秒，整轮最多 72 次 GET。上一笔路由或费用未核实即停止后续发送，未知费用保留预留。 |
| 单价及价格过滤 | 区域输入 / 输出为 **440,000 / 1,760,000 microUSD 每百万 token**。请求 `provider.max_price={prompt:0.44,completion:1.76,request:0}`。区域标准文本价格明细只列输入、输出、缓存读取，目录未单列固定 `pricing.request`。预留按普通输入全价计算。缓存读取报价为 0.11 USD/百万 token，折扣按实际回执入账。若出现固定费、工具费、涨价或变更路由，先停并复核。[区域报价](https://openrouter.ai/api/v1/models/openai/gpt-4.1-mini/endpoints) · [价格限制单位](https://openrouter.ai/docs/guides/routing/provider-selection) |
| 预算 | 按 2,000–4,000 输入、1,000–2,000 输出 token 的情景，24 次约 **0.06336–0.12672 USD**。顶格每次 `ceil((16000×440000 + 4096×1760000)/1000000) = 14249` microUSD，24 次 **0.341976 USD**。建议每任务上限 15,000 microUSD，用户日额、全局日额、整轮总额各 500,000 microUSD。第一轮专用 key 限额 **0.50 USD**，本轮内不重置、不与其他工作共用。 |
| 凭据和运行机 | B2 专用普通 key 只注入独占、本地评测进程的 `ARC_DOCUMENT_PROVIDER_API_KEY`。站点、Research、B4 执行器不共用。未来该进程才注入签署后的 `ARC_DOCUMENT_QUALIFICATION_SETTINGS` 并开启 `ARC_DOCUMENT_QUALIFICATION_ENABLED`。新 runId 绑定私有持久目录 `work/materials-qualification/<runId>/` 的追加账本 `ledger.jsonl` 与 `result.json`。中止或重启后保留账本，新轮另办授权。 |

预算仅涵盖 B2 推理。请确认已有余额或单列购买 credits 的手续费和税费。B3 的云资源、部署和迁移另行审批，B4 的第二轮若执行，须另设 runId、key、预算和有效期。本次已批准的付费请求数及金额均为 **0**。[平台费用](https://openrouter.ai/pricing) · [专用 key 限额](https://openrouter.ai/docs/guides/overview/auth/management-api-keys)

## 5. 需要你确认或提供的四项

| 责任人 | 请提供的内容 | 当前状态 |
| --- | --- | --- |
| 配置与隐私批准人 | 确认唯一推理端点、UUID、本地政策版本和全球入口。决定是否接受 §2 的缓存、匿名输入分类及保留例外，仅批准 24 份合成文本作为资料范围。提供专用 key 对应账户与生效护栏的脱敏截图或受控记录编号，标明核对日期。 | 待确认、待证 |
| 账户持有人 | 提供 §3 的回执权限和字段证据。另给三类脱敏记录。① 专用普通 key 的 `is_management_key=false`、`limit=0.50`、`limit_remaining`、`limit_reset=null` 和有效预算，可取自持有人的 `/api/v1/key` 投影。② 从 Billing/Credits 核实可用余额，和 key 余量一起覆盖 0.341976 USD 顶格预留。③ 工作区设置证明未启用 BYOK，本轮独占该 key。`byok_usage=0` 只说明历史用量。提交时遮去密钥、账户标识和无关信息。[字段定义](https://openrouter.ai/openapi.json) | 待证 |
| 工程负责人 | 确认独占运行机代号、受限持久账本位置、未使用的 runId、证据保管人。绑定候选与语料摘要，复核官方端点、单价和政策仍一致。 | 待指定 |
| 预算批准人 | B1 证据通过后，再决定是否**单独授权 B2**。只批准一轮时填写授权 ID、审批人、24 次、0.50 USD、实际 `approvedAt`（UTC）及 `expiresAt`（建议 +2 小时），签署最终 settings 的 SHA-256。 | 未授权 |

草案只有 `runId`、`config`、`qualification`、`authorization` 四个顶层字段。当前 `qualified=false`，runId、授权 ID 和时间留空。前三项完成、配置和证据由负责人审阅后，方可登记 B1 通过。第四项单独签署最终配置，并另获启动指令后才可进入 B2。签名人、运行机与摘要登记在独立附件。草案 SHA-256 不能沿用作最终配置签名。[未签署配置草案](materials-gate-1b-b1-azure-20261104/b2-settings.review.json) · [冻结授权解析器](../../scripts/materials-qualification-runner.ts)

## 6. 证据与本地复核

| 记录 | 范围与结果 |
| --- | --- |
| [公开证据快照](materials-gate-1b-b1-azure-20261104/public-evidence.json) | 21 个官方公开 GET 响应各记 URL、UTC 时间、HTTP 状态和解压后响应体 SHA-256。附三条模型路由、两条 ZDR 命中、公开 UUID、端点费项和回执规范字段。完整响应留在本地 Git 忽略的 `work/gate1b-b1-public/`（按来源名取 `.body`）。快照 SHA-256 为 `3132f04823d2461a1d8b13da5844df10fc2a66d698ea241641cccc13ad6a3d4b`。 |
| [待审配置](materials-gate-1b-b1-azure-20261104/b2-settings.review.json) | UTF-8 文件 SHA-256 为 `71f83c04ffedbcd34390428eb79320c26e21d0fd4134865942003765558868ea`。冻结解析器接受非秘密配置字段，资格开关默认关闭时报 `qualification-disabled`。用内存占位凭据模拟开启时，解析器先检查凭据存在，再以 `qualification-settings-invalid` 拒绝未签草案。冻结费用函数另行复算出 14,249 microUSD/次。 |
| [B0 清单](materials-gate-1b-b0/candidate.json)与离线回归 | 重新核对候选 ref/tree 和清单中 18 个输入文件的 SHA-256（含语料、传输适配器、回执核验器、资格运行器和定稿计划）。以普通 Vitest 配置重跑 `document-provider`、`document-model-qualification-guards`、`document-qualification-journal` 三个离线套件，**3/3 文件、29/29 测试通过，退出码 0**。资格评测仍为 0/24。 |

