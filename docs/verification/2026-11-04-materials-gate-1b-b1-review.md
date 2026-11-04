# Gate 1B · B1 核验记录：Kimi K3.1 Pro

2026-11-04 · **B1 `BLOCKED`** · B2 `NOT RUN` · 本轮真实推理 0 次、费用 0 USD、部署 0 次、远程迁移 0 次

**当前候选已改为 Kimi K3.1 Pro 标准版，经 OpenRouter 锁定 Moonshot AI。** Kimi 于 10 月 23 日宣布 K3.1 Pro 系列已上线，核验时它也是 OpenRouter 的 `moonshotai/` 目录中最新的模型。选择标准版保留最新模型能力，同时按较低的标准端点费率审阅。旧 Azure 方案已归档。本记录取代原计划中的模型与预算候选，B0 冻结提交仍是本次对照基准。[Kimi 官方发布](https://www.kimi.com/en/blog/kimi-k3-1-pro) · [10 月 23 日上线记录](https://www.kimi.com/code/docs/en/kimi-code/whats-new.html) · [定稿计划](../superpowers/plans/2026-11-04-private-materials-gate-1b-acceptance.md) · [Azure 历史记录](2026-11-04-materials-gate-1b-b1-azure-review.md)

**当前需要持有人决定如何取得单笔回执，以及可接受的上游缓存边界。** 专用 key 已绑定严格 ZDR 护栏，累计限额为 2.00 USD。官方回函确认了普通 key 的读取权限和标准端点价格。第二封回函明确，支持方没有该路由的合成回执可提供，上游自动缓存没有公开的最长保留时间或文档化关闭方式。可选择仅用一条固定合成资料进行单独限额取证，或先向企业渠道取得书面隐私边界。两轮质量评测与生产发布均待独立放行。[单笔取证范围、费用及条件](../superpowers/runbooks/2026-11-04-materials-kimi-single-receipt.md) · [账户核验](../superpowers/runbooks/2026-11-04-materials-kimi-account-evidence.md)

## 1. 已核实的候选与端点

B1 单笔取证已完成离线演练。两个本机工作树对同一份模拟授权只交接一次模拟推理，换用其他密钥在占用预算前被拒绝。专用入口会核对回执的原始费用，冲突或费用来源不可信时保留预留。单笔完成后只判断该端点与普通 key 的实际可用性。质量评测之前另须关闭通用产品候选上的费用冲突结算问题。[单笔离线验证](materials-gate-1b-b1/single-receipt-entry-verification.json) · [发布进度](2026-11-04-materials-public-release-progress.md)

请求地址为 `https://openrouter.ai/api/v1/chat/completions`，模型 ID 为 `moonshotai/kimi-k3.1-pro`，目录永久标识为 `moonshotai/kimi-k3.1-pro-20261023`。以下两条记录的 `provider_name` 均为 `Moonshot AI`。官方供应商页的 `id` 与模型首页同一记录的 `stats.endpoint_id` 逐条相等。两条都在 ZDR 目录，均标有 `safety_retention=false`、`supports_implicit_caching=true`。[模型详情](https://openrouter.ai/api/v1/model/moonshotai/kimi-k3.1-pro) · [端点目录](https://openrouter.ai/api/v1/models/moonshotai/kimi-k3.1-pro/endpoints) · [供应商页](https://openrouter.ai/moonshotai/kimi-k3.1-pro/providers) · [ZDR 目录](https://openrouter.ai/api/v1/endpoints/zdr)

| 端点 tag | 上游模型与回执 UUID | 输入 / 输出 USD 每百万 token | 处置 |
| --- | --- | ---: | --- |
| **`moonshotai/mxfp4`** | `kimi-k3.1-pro` · `a3fafaac-f097-4ef1-86b3-842854dad5c6` | **2.00 / 10.00** | 唯一候选，缓存读取 0.20 USD/百万 |
| `moonshotai/highspeed` | `kimi-k3.1-pro-highspeed` · `da2df19f-c004-433f-a41f-2c6ecd346f5e` | 4.00 / 20.00 | 不纳入白名单或回退 |

标准端点价格记录 ID 为 `29acc64e-ba27-4486-871f-49aaf5449675`。草案中 `provider.only`、`provider.order` 对应的名单均只含 `moonshotai/mxfp4`，并保留 `allow_fallbacks=false`、`require_parameters=true`、`data_collection=deny` 和 `zdr=true`。使用 `receiptRoute.providerName="Moonshot AI"` 与标准端点 UUID 联合校验。[模型页](https://openrouter.ai/moonshotai/kimi-k3.1-pro) · [公开证据快照](materials-gate-1b-b1/public-evidence.json)

## 2. 冻结适配器兼容性与回执

| 检查 | 结论与放行条件 |
| --- | --- |
| 温度参数 | B0 固定发送 `temperature=0`，与 Kimi 固定温度 1.0 的原生契约冲突。后继候选对通过资质校验的指定 Kimi 模型和单一标准 tag 省略温度字段，离线测试核验实际构造的 HTTP 请求。其他模型和路由沿用原有行为。[Kimi 快速指南](https://platform.kimi.ai/docs/guide/kimi-k3-1-pro-quickstart.md) · [传输测试](../../tests/server/document-generation-audit.test.ts) |
| 输出上限与严格过滤 | 标准端点的 `supported_parameters` 列有 `max_tokens`。后继候选对该路由发送 `max_tokens=4096`，使用唯一供应商、禁止回退，并保留 `require_parameters=true`、`zdr=true` 和价格上限。真实路由的接受情况与实际截断表现留给获准的评测。[端点目录](https://openrouter.ai/api/v1/models/moonshotai/kimi-k3.1-pro/endpoints) · [OpenRouter 参数说明](https://openrouter.ai/docs/api_reference/parameters) |
| JSON 与思考 token | Kimi 给出了本型号的 `response_format.type=json_object` 示例。冻结适配器以非流式请求读取最终 `message.content`。Kimi 原生始终开启思考，默认 `max`。OpenRouter 模型目录虽列有 effort `none`，本次按原生约束审阅。4,096 上限按思考加可见输出合计核算，不承诺能给最终 JSON 留足空间。只保存验收所需字段，若因 `length` 截断，保留失败结果。[JSON 模式](https://platform.kimi.ai/docs/guide/use-json-mode-feature-of-kimi-api) · [模型限制](https://platform.kimi.ai/docs/guide/kimi-k3-1-pro-quickstart.md) · [推理 token 计费](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) |
| **普通 key 的读取权限已获书面确认，实际字段仍待证** | 客服确认关闭正文日志时，普通 key 可读取自有请求的元数据。需要同一标准路由的脱敏配对样例，或能覆盖具体字段的供应方书面证明。核对聊天和 generation 的模型名是否均为无日期请求 ID，ID 是否对应且唯一，`provider_name` 是否为 `Moonshot AI`，是否恰有一条成功响应且其 `endpoint_id` 为目标 UUID。分别核对输入、含思考的完成 token、费用以及实际可用的时延字段。客服明确无法从文档确定两个模型标识及 `endpoint_id`，建议提供实际 generation ID 后协助核对。[回执接口](https://openrouter.ai/docs/api/api-reference/generations/get-request-%26-usage-metadata-for-a-generation) · [校验器](../../worker/document-executor/generation-receipt.ts) |

## 3. 隐私与缓存审核

- **上游和地区。** OpenRouter 给标准端点标注 `retainsPrompts=false`、`training=false`、`trainingOpenRouter=false` 和 `safetyRetention=false`。其供应商记录列出总部及数据中心为新加坡，端点的 `provider_region`、`declared_region` 却均为空。该配置使用全球网关。若要求逐请求或端到端新加坡驻留，还需合同或特定区域路由证据。[端点记录](https://openrouter.ai/moonshotai/kimi-k3.1-pro/providers) · [供应商登记](https://openrouter.ai/api/v1/providers)
- **合同范围。** 官方支持指出标准端点在 ZDR 名单中，未标记 Safety Retention。公开条款保留对被标记内容进行儿童安全审查、报告和法律保存的例外。客服给出的合同依据是 OpenRouter DPA 和供应商政策，未出具路由专属保证。Kimi 国际条款也涉及企业安排与内容保留。若验收要求书面保证或确定的缓存期限，需要能覆盖本请求链的证明。[OpenRouter DPA](https://openrouter.ai/data-processing-agreement) · [ZDR 政策](https://openrouter.ai/docs/guides/features/zdr) · [供应商政策](https://openrouter.ai/providers) · [Kimi 国际服务条款](https://platform.kimi.ai/docs/agreement/modeluse) · [Kimi 国际隐私政策](https://platform.kimi.ai/docs/agreement/userprivacy)
- **账户策略。** Moonshot 属于 OpenRouter 的 **All other models** 组。第 7 节已读回专用 key 的严格 ZDR 指派、正文日志、工作区预设及追踪状态。OpenRouter 将内存隐式缓存排除在自身的留存定义之外，第二封回函说明没有公开的 Moonshot 最长 TTL 或文档化关闭开关。须分别记录持有人对固定合成样例、真实用户私有资料的决定，同时考虑平台抽样匿名分类、在途筛查及法定保留例外。[ZDR 分组和缓存](https://openrouter.ai/docs/guides/features/zdr) · [平台数据收集](https://openrouter.ai/docs/guides/privacy/data-collection) · [筛查公告](https://openrouter.ai/blog/announcements/csam-screening/)
- **资料边界。** 只申请发送 24 份冻结合成简历/JD，仅发送固定系统提示、资料类型和带 ID 的分段。金标准、评分器和用户真实资料留在本地。B4 启动前还需核对产品允许页展示的处理方为 OpenRouter / Moonshot AI，并核对当期的隐私披露。[冻结语料清单](materials-gate-1b-b0/candidate.json) · [用户允许页](../../app/components/materials/material-text-panel.tsx)

## 4. 新预算草案

官方回函与标准端点价目均为输入 2.00、输出 10.00、缓存读取 0.20 USD/百万 token。思考 token 按输出计价。客服确认自动缓存写入免费，当前该端点未列其他计价项目。通用 Moonshot 缓存指南给出了不同的读取折扣倍率，本轮按模型专属价目估算，并以实际获准请求的回执对账。上游缓存时长仍未确定。估算按输入全价预留，未使用缓存折扣。[标准端点价目](https://openrouter.ai/api/v1/models/moonshotai/kimi-k3.1-pro/endpoints) · [Moonshot 缓存说明](https://openrouter.ai/docs/guides/best-practices/prompt-caching)

| 一轮 24 次 | 计算结果 |
| --- | ---: |
| 每份 2,000–4,000 输入、1,000–2,000 **总计费输出** token 的情景 | **0.336–0.672 USD** |
| 每份按 16,000 输入、4,096 输出顶格预留 | **72,960 microUSD/次** |
| 24 份顶格预留，仅按上述公开文本费项 | **1.751040 USD** |
| 拟议单次上限与整轮授权额 | **0.075 USD/次，2.00 USD/轮** |

每次预留为 `ceil((16000×2000000 + 4096×10000000)/1000000) = 72960` microUSD。旧草案的 15,000 microUSD 单次上限会被冻结费用函数拒绝，0.50 USD 的整轮额度也无法覆盖顶格运行。**2.00 USD 是新的待批上限，本次授权金额为 0 USD。** 如果计费口径或费用项目变化，先重新核价。缓存折扣按实收记，已知费用据实结算，未知费用保留预留。充值手续费、税费、B3 云费及 B4 的第二轮授权另行登记。[冻结费用函数](../../worker/document-executor/provider-http.ts)

## 5. 待确认的配置、证据和授权

| 项目 | 拟定配置和需要取得的证据 |
| --- | --- |
| 工程与冻结 | Kimi 首个后继 `306c9b0b326a` 修正了传输和同意页。集成候选 `fa9c9ae3a3e9` 加入资料采用、替换、取消关联及私有模拟服务。已从该版本冻结含普通用户准入和公开站点打包工具的后继 `7052aedd8a493a5fae2c1e4a6ecbf32e702eeeef`，tree `1d73935f8a0c68bc5187f7e1118941ef00498161`。未来签发 B2 时须明确实际执行的冻结提交、配置与语料摘要，变更后重新核验。[最新源码清单](materials-production-release-candidate/candidate.json) · [集成候选](materials-release-integration-candidate/candidate.json) |
| 运行配置 | 本地待审 `providerPolicyId=materials-openrouter-kimi-k31-pro-mxfp4-zdr`，路由政策及价格版本均为 `2026.11.3`，`max_price={prompt:2,completion:10,request:0}`。输入上限 16,000，输出 4,096，单笔 HTTP 180 秒，单机串行、每份最多一次 POST。每笔回执最多 3 次只读 GET，共用 30 秒。任何未核实路由或费用均停止后续发送。 |
| 隐私与账户 | 已核实专用 key 限额和护栏、正文日志、账户余额及 BYOK 状态，并取得普通 key 读取自身元数据和缓存写费的书面答复。尚缺第 2 节的配对字段证据、上游缓存保留边界和持有人隐私决定。本轮获准后，独占运行进程才使用专用 key。 |
| 预算与授权 | 请确认是否接受**单次 75,000 microUSD、用户日额/全局日额/整轮额各 2,000,000 microUSD** 的草案，以及专用 key 2.00 USD 的不重置上限。B1 前置证据通过后，另由预算负责人批准是否启动 B2，绑定新且未占用的 runId、授权 ID、独占运行机、受限持久账本、最终 settings 和语料摘要。最多 24 次 POST，实际批准时填写 UTC `approvedAt`，`expiresAt` 建议为 2 小时后。 |

草案保留原四个顶层字段。`qualification.qualified=false`，runId、授权 ID 和时间均为空。B1 保持评测开关关闭。只有在未来获准的专用进程中，才注入审定的 `ARC_DOCUMENT_QUALIFICATION_SETTINGS` 并开启 `ARC_DOCUMENT_QUALIFICATION_ENABLED`。冻结语料 SHA-256 为 `69e5ddd1005f12abf24483e10dd235629ef309ba3a84e922166963ccd9aed750`。正式授权使用实际新候选、已复核配置的摘要和独立账本 `work/materials-qualification/<runId>/ledger.jsonl`，旧申请和草案摘要均不授予执行权。[未签署配置草案](materials-gate-1b-b1/b2-settings.review.json) · [授权解析器](../../scripts/materials-qualification-runner.ts)

## 6. 核验记录

- [公开证据快照](materials-gate-1b-b1/public-evidence.json)保留 30 份官方公开 GET 的 URL、UTC 时点、状态和解压后响应体 SHA-256。抓取时间为 2026-11-04 08:20:50–08:23:32 UTC，原始响应在本地忽略目录 `work/gate1b-b1-kimi-public/`。快照 SHA-256 为 `3b0b2f767cd50aa5c437f322581feb3af8d1ceb45589d68d184804e15ddd8c1b`。
- [Kimi 草案](materials-gate-1b-b1/b2-settings.review.json) SHA-256 为 `d65903a51fd52ce85bb4e54bc769d324343a3f908c2c38699373f02297aa1834`。冻结解析器接受非秘密配置字段，在默认关闭时或模拟开启且提供内存占位凭据时均拒绝未签草案。费用函数复算 72,960 microUSD，并拒绝旧单次上限。
- 以普通 Vitest 配置重跑传输、授权护栏与账本三个离线套件，**3/3 文件、29/29 项通过**。这些检查验证本地保护逻辑。Kimi 真实质量结果仍为 **0/24**。

## 7. 专用账户与后继候选跟进

| 账户现场核验项 | 2026-11-04 的观察 |
| --- | --- |
| 工作区与历史回执 | 已创建独立 `materials-b2`。新建时普通 API keys 列表为空，本工作区没有可复用的历史配对回执。 |
| 日志、预设与账户正文改进 | 工作区 **Observability** 显示 **Input & output logging** 关闭，**Traces** 提示选择第一个目的地。**Presets** 为空。账户 **Allow 1% data discount in workspaces** 关闭，付费端点训练许可关闭。 |
| 两层缓存 | 平台响应缓存需专用请求头或启用缓存的预设，本轮冻结传输和专用工作区均未启用。供应方另确认 Moonshot 自动缓存写入免费，模型专属读取价为 0.20 USD/百万 token。上游自动缓存的保留时长未公布，不能从客户端或单次账单验证。[平台响应缓存](https://openrouter.ai/docs/guides/features/response-caching) · [上游缓存](https://openrouter.ai/docs/guides/best-practices/prompt-caching) · [冻结传输](../../worker/document-executor/provider-http.ts) |
| 零保留与 BYOK | 持有人已保存专用护栏 **materials-b2-zdr**。重新打开已保存策略核实 **All other models** 开启、**ZDR only** 选中、**Allow Safety Retention** 未选，付费或免费训练及免费公开提示词均关闭。详情显示 **Other ZDR = Enabled**、**Free training = Disabled**，**Assignments** 列有且仅有专用 key。该护栏接受任意地区，属于路由控制。工作区 **BYOK-only routing** 关闭，Moonshot AI 显示 **Not configured**。上游缓存和合同适用范围仍待书面核实。 |
| 费用与 key | 账户持有人已私下保存密钥。刷新工作区普通 **API keys** 列表后，唯一一行显示 **1 guardrail**、`$2 TOTAL`、`0%`、已用 `$0.000`、从未使用。按列表可用总额为 **2.00 USD**。此项来自登录后台读回。账户 Credits 页另核实可用余额覆盖一轮 **1.751040 USD** 预留。 |
| 供应方证据 | 官方两次回复均已归档。按持有人授权，12:40:59 UTC 在原线程请求既有的脱敏配对样例及缓存边界。12:43:19 UTC 客服确认无该标准路由的样例可分享，实际模型字符串和端点 ID 只能在本方该路由请求记录中核对。通用接口示例使用其他模型及虚构值。未得到上游自动缓存的最长时限、关闭方式或路由专属书面保证。正式 ZDR 确认须走企业联系渠道。[已发取证邮件](../superpowers/runbooks/2026-11-04-materials-kimi-account-evidence.md#本轮工单的后续取证) · [企业渠道](https://openrouter.ai/enterprise/form) |

本机忽略目录 `work/materials-gate-1b/account-review/` 保存账户观察及六张截图的摘要。`B1-OR-20261104-01`、`B1-OR-20261104-02` 分别记录两封官方邮件的来源、UTC、技术结论和正文校验摘要，另存获准追问的发送及线程读回记录。账户持有人保管完整密钥。

首个 Kimi 后继 `306c9b0b326a` 使用普通离线 Vitest 配置完整运行，**341 个文件、7,378 项通过**。三个 Research 严格基线套件另跑 **131/131**，其断言和基线文件未进入后继变更。九个附加 Node 套件 **290/290**，构建后的 HTML 测试 **5/5**。TypeScript 无错误，ESLint 有四条既有警告、零错误。关闭态的站点和执行器组成 387 个文件，已逐项重新计算摘要并核对。原 B0 清单已比对保留。[首个后继的验证记录](materials-gate-1b-kimi-candidate/verification.json) · [对应构建清单](materials-gate-1b-kimi-candidate/artifact-index.json)

标准路由采用新的请求参数，已经通过资质校验的配置才会在同意页披露处理方、全球入口、临时缓存、抽样分类和筛查例外。相关政策或披露标识变化后，用户须重新勾选。实际账单、路由和输出质量仍需 B2 核验。公开发布还需经过隔离验收、生产准入与上线后检查。[发布进度](2026-11-04-materials-public-release-progress.md)

