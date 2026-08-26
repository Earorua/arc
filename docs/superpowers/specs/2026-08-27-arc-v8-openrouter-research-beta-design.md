# Arc. v8 OpenRouter Research Beta 设计规格

**日期：** 2026-08-27

**状态：** 书面规格已获用户批准；进入详细实施计划与 TDD 执行

**对应目标：** 整站完成流程目标 2 / 路线图 Phase 4

**公开生产基线：** Arc. v7.2 / Sites version 9，本规格不授权部署

## 1. 目的

为已认证且获准的用户提供非 Flagship 岗位 Research Beta：Arc. 使用 OpenRouter 获取带来源的岗位、技能、资源和可执行学习单元候选，经过严格结构、领域、来源、预算和安全门槛后，交给现有确定性路径与排程引擎生成个人路线。

本功能不是一个泛用聊天入口。模型只生成受约束的研究包；依赖排序、时间预算、七日排程、学习事件、Proof 状态和 `Verified` 仍由现有确定性内核负责。

## 2. 已有基线

- Phase 1 已提供 `RoleBlueprint`、资源注册表、图与资源策略验证器，以及六张非个人岗位情报表。
- Phase 2 已提供确定性路径、七日排程、Setup、Today、重排和本地/云端规划契约。
- Phase 3 已提供 Proof 版本、评审状态、证据投影和 Proof-backed Stack。
- 当前 `/api/intelligence/preview` 使用 `MockAiProvider`，只返回确定性维度预览；它不是 Live Research Beta。
- 当前 Setup 和 `GeneratePlanningRequest` 只接受 Flagship `ai-native-full-stack-engineer`。
- 当前 `ai_runs`、`quota_ledger`、feature cohort 和 D1 端点限流是安全骨架，但尚不具备真实 Provider、成本账本、研究状态、结果缓存或任意岗位规划接线。

## 3. 范围

### 3.1 包含

- 服务端 OpenRouter Adapter 与 provider-neutral 研究接口；
- 固定 Research / Economy 任务模型配置；
- OpenRouter Web Search Server Tool、严格结构化输出和最多一次格式修复；
- 岗位、技能、资源、阶段和学习单元模板组成的版本化研究包；
- 来源规范化、去重、引用绑定、覆盖与时效审计；
- Research Run 状态、持久化恢复、缓存、幂等和并发去重；
- 账户、IP、时间窗口、任务、用户日配额及全站日/月成本门槛；
- Research Beta Setup 体验，以及 `Ready` 研究包进入现有确定性规划内核的所有者边界；
- 无密钥、禁用、超时、429、余额不足、无 Provider、无效输出和不合格来源的可验证降级；
- 管理员聚合健康数据扩展，但不包含生产启用；
- 无真实密钥的完整自动化与本地 Fake Provider 人工验收；
- 经单独授权后的一次预算有界真实请求验证；
- 本地合并、GitHub 普通备份和恢复检查点。

### 3.2 不包含

- 浏览器 BYOK、用户选择模型、聊天式研究或多 Agent；
- AI 直接决定依赖顺序、日历排程、学习进度或授予 `Verified`；
- AI Proof Review、Planning 模型建议或 Review 模型接入；
- 抓取任意网页正文、保存完整搜索正文或构建通用爬虫；
- 生产 D1 迁移、R2 写入、生产 Secret、生产变量、功能旗标、Sites 候选或公开部署；
- 把 Research Beta 结果自动加入公共岗位目录。

## 4. 选择的架构

采用**请求驱动、D1 可恢复流水线**，不引入新的 Queue 或 Workflow 绑定。

```text
Setup / Research Beta UI
  -> authenticated Research API
  -> rate, cohort, idempotency and budget gates
  -> Research Orchestrator
       -> OpenRouter Adapter
       -> structured transport parser
       -> source normalizer and audit
       -> Research Package validator
       -> D1 Research Repository
  -> owner-bound Ready package resolver
  -> existing deterministic Path + Planning engines
```

单次 POST 在有界执行时间内完成研究和验证，同时在每个阶段写入 D1。页面关闭、网络中断或边缘执行终止后，GET 可以恢复状态；过期的非终态运行只能通过显式安全重试继续。实现不假设请求结束后仍有后台任务运行。

未选择的方案：

- Cloudflare Queue / Workflow 更适合长时任务，但会引入新的运行设施、绑定和发布面；目标 2 暂不需要。
- 纯同步且不持久化的 API 无法可靠处理页面关闭、重试和重复扣费，不满足规格。

## 5. 模块边界

### 5.1 Research Contracts

定义独立的输入、状态、研究包、来源审计、质量报告、Provider 响应和公共 API Schema。业务模块只依赖这些契约，不依赖 OpenRouter 响应形状。

### 5.2 Research Orchestrator

负责状态机、幂等、缓存、预算预留、Provider 调用、一次修复、验证、结算和终态写入。它不直接执行 SQL、HTTP 路由或 UI 逻辑。

### 5.3 OpenRouter Adapter

唯一允许知道 OpenRouter URL、请求头、tool 形状、provider routing、usage 和原始错误形状的模块。使用 Workers 可用的服务端 `fetch`，不把 Provider SDK 引入客户端或领域层。

### 5.4 Source Audit

把 OpenRouter `url_citation` annotations 转换为规范化来源记录；拒绝未在 annotation 中出现的模型生成 URL。它不主动下载或执行来源页面内容。

### 5.5 Research Package Validator

组合 Zod、Phase 1 图/资源验证器及 Research Beta 专用门槛，产出结构化 `qualityReport`。只有全部硬门槛通过才可成为 `Ready`。

### 5.6 Research Repository 与 Budget Repository

封装所有 D1 写入、所有者限定、CAS、缓存查找、预算预留和结算。路由和业务服务不得拼接研究 SQL。

### 5.7 Ready Package Resolver

规划服务只通过 `(authenticatedUserId, researchRunId)` 获取研究包。Resolver 同时验证所有者、终态、包版本、质量门槛和有效期；客户端不能上传或覆盖蓝图 JSON。

## 6. 研究输入与输出

### 6.1 输入

客户端只提交：

- 岗位名称，trim 后 2–160 字符；
- `zh-CN` 或 `en-US` locale；
- 客户端生成的幂等 mutation ID。

服务端生成规范化岗位键、Request ID、输入指纹、配置指纹、研究日期和来源策略。用户 ID、邮箱、技能审计、Proof、个人计划和设备状态不发送给模型。

### 6.2 Research Package

一个合格研究包包含：

- canonical `RoleBlueprint`：岗位摘要、技能、依赖、资源、阶段；
- `UnitRegistry`：覆盖全部技能的可执行单元模板，包括目标、步骤与分钟、主要资源、交付物、完成条件、Proof 要求和 Rubric；
- `sourceEvidence`：技能/资源到规范化 citation URL 的映射；
- `qualityReport`：每项硬门槛、计数、问题码和观察日期；
- 生成元数据：prompt、input、output、quality、model config 版本及内容指纹。

模型不得生成当前兼容字段 `RoleSkill.confidence`。服务端在构造 wire-compatible `RoleBlueprint` 时填入固定兼容值 `0.75`；该字段不用于研究资格、规划、Proof、Stack 或任何用户文案。

## 7. OpenRouter 请求策略

目标 2 使用稳定的 OpenAI-compatible Chat Completions 接口。业务层不依赖 Responses API Beta。

Research 请求必须包含：

- 服务端固定的 `ARC_AI_MODEL_RESEARCH`；
- `response_format.type = "json_schema"`、命名 schema 与 `strict: true`；
- `tools: [{ type: "openrouter:web_search", parameters: ... }]`；
- `max_uses = 2`、`max_total_results = 10` 及受限的单来源上下文；
- 顶层 `max_tool_calls` 硬上限；
- `provider.require_parameters = true`；
- `provider.data_collection = "deny"`；
- Research 默认 `provider.zdr = true`；
- 非流式响应、服务端超时和输出 token 上限。

不使用已弃用的 `:online` 或旧 Web Search Plugin。参考：

- <https://openrouter.ai/docs/guides/features/server-tools/web-search>
- <https://openrouter.ai/docs/guides/features/structured-outputs>
- <https://openrouter.ai/docs/guides/routing/provider-selection>

## 8. 一次受控修复

先做本地 JSON 提取、解析和 Schema 验证。只有输出携带足够原始字段、失败属于结构或格式问题、并且原 Research 请求已为修复预留预算时，才允许调用固定 `ARC_AI_MODEL_ECONOMY` 一次。

修复请求：

- 不启用 Web Search 或任何 tool；
- 只能重排、补齐可由原 payload 机械推导的结构；
- 不能新增技能事实、资源 URL、citation 或来源等级；
- 仍使用严格 Schema、数据策略、超时和输出上限；
- 修复后从传输、Schema、领域、来源到安全门槛全部重跑。

无 citation、虚假 URL、缺失核心内容、策略不合格或再次无效时不进行第二次修复。

## 9. 来源与质量门槛

Research Beta 不向用户显示或依赖不透明的置信度百分比。`qualityReport` 使用可解释的规则：

1. 研究包及所有子项通过严格 Schema 和长度上限；
2. 技能 ID、资源 ID、阶段、前置关系和 Unit Registry 引用完整、无重复、无环；
3. 每项技能至少关联一个出现在 Provider citation annotations 中的公共 HTTPS 来源；
4. 每项 `core` 技能至少有一个 `primary` 或 `institutional` 来源；
5. 所有资源 URL 规范化后去重，禁止凭据、localhost、私有地址、非网页协议和非公开 DNS 后缀；
6. 付费或 mixed 的 primary 资源必须有免费 alternative；
7. 每项技能至少有一个单元模板，步骤分钟之和与单元预算一致，并具有可判定的完成条件、Proof 要求和 Rubric；
8. 每项来源保存本次观察日期；超出缓存有效期必须重新研究，不能只改日期；
9. 来源正文中的指令被视为不可信数据，不能改变系统提示、Schema、路由、预算或安全策略；
10. 输出不含 HTML 执行载荷、内部提示、Secret、模型控制字段或用户私密数据。

全部硬门槛通过进入 `Ready`。结构完整但来源覆盖、内容可执行性或政策规则未通过时进入 `Needs review`；传输失败、恶意/越界输出、无法解析或无法安全持久化进入 `Failed`。`Needs review` 与 `Failed` 都不能进入规划。

## 10. 状态、幂等、缓存与并发

```text
Queued -> Researching -> Validating -> Ready | Needs review | Failed
```

- 每次转换带 `stateVersion`，Repository 使用 CAS；冲突返回可恢复错误，不做最后写入覆盖。
- 同一用户、规范化岗位、locale 和研究配置只能存在一个活跃运行。
- 同一用户重复幂等键返回原运行与原响应语义，不创建重复 Provider 调用或预算预留。
- `Ready` 只表示该运行所有者可以用于规划，不表示公开发布。
- `Needs review` 保存受限候选与问题码供后续诊断，不暴露完整 Provider 内容。
- `Failed` 保存脱敏错误类别、是否可重试、Request ID 和时间，不保存原始错误。
- 已净化、非个人、同配置且未过期的 `Ready` 研究包可作为共享缓存；每位使用者仍需建立自己的 owner-bound Research Run。
- 用户身份、审计、Proof、计划和个人行为从不进入共享缓存键或缓存内容。
- 过期缓存不会静默续期。新的研究生成新的不可变包版本。

## 11. 数据模型

使用新的增量迁移 `0005_openrouter_research_beta.sql`；不改写 `0000`–`0004`。最终字段名可在详细计划中按现有 Drizzle 命名约定细化，但必须保留以下实体与约束：

- `research_runs`：owner、请求/配置指纹、幂等键、状态、state version、package 引用、脱敏错误、重试和时间；
- `research_packages`：非个人不可变研究包、内容指纹、配置版本、质量报告、有效期及 blueprint version 引用；
- `research_source_audits`：package、canonical URL、标题、域名、tier、观察日期、citation 内容哈希；不保存完整 excerpt；
- `ai_budget_buckets`：scope、period、reserved micros、settled micros 和版本；
- `ai_budget_reservations`：run/request、最大预留、实际成本、状态和到期时间。

复用：

- `role_blueprints`、`role_blueprint_versions`、skills、edges、resources 与 links 保存通过验证的规范化岗位情报；
- `ai_runs` 保存 provider、实际 model、purpose、版本、终态、latency 和受限 usage 摘要；
- `quota_ledger` 继续表示用户已接受结果配额，不代替站点真实成本账本；
- `endpoint_rate_buckets` 继续保存哈希后的限流 subject。

所有 owner-bound 查询必须同时限定会话解析出的 `userId`。研究表不得产生可枚举的公共读取端点。

## 12. API 契约

### 12.1 `POST /api/intelligence/research`

认证、输入验证、用户/IP 限流、cohort、幂等、缓存、并发和预算通过后，创建或复用运行并执行一个有界阶段。返回公共 Research Run view，不返回模型控制、内部成本或原始输出。

### 12.2 `GET /api/intelligence/research/{id}`

只允许所有者读取。返回状态、岗位摘要、来源计数/观察日期、质量问题码、重试能力及 `Ready` 公共包视图。

### 12.3 `POST /api/intelligence/research/{id}/retry`

只允许所有者对标记为可重试的终态运行提交新幂等键。重试产生新 attempt 或新运行版本，不能复用已经结算的预算预留发起隐藏调用。

### 12.4 Planning 扩展

保持现有 Flagship request 兼容，新增有辨识度的来源联合类型：

```text
{ source: "flagship", roleId: "ai-native-full-stack-engineer", ... }
{ source: "research", researchRunId: "...", ... }
```

Research 分支由 Ready Package Resolver 根据已认证 owner 获取蓝图与 Unit Registry。客户端不能提交 role package、模型、来源或 owner ID。

## 13. 预算、配额和限流

执行顺序：

```text
session -> input -> account/IP rate -> cohort -> idempotency/concurrency
-> atomic budget reservation -> provider -> validation -> settlement/release
```

必须分别覆盖：

- 每账户、每 IP 的分钟窗口；
- Research 任务级并发和调用上限；
- 每用户每日 `Ready` 结果配额；
- 全站每日和每月成本上限；
- 单次 Research + 可选 Repair 的最大成本预留；
- 管理员 kill switch 与 cohort。

未完成预留计入预算，避免并发超卖。用户配额只在新结果 `Ready` 时结算；缓存复用不产生 Provider 费用，也不得重复扣用户已接受配额。

站点成本账本与用户配额分离。Provider 已收费但结果失败时，用户 accepted quota 为零，站点账本仍记录实际成本。若响应没有可信实际成本，保守预留保持到有界对账或过期处理，不能立即当作零成本释放。

## 14. 安全与隐私

- `OPENROUTER_API_KEY` 只从服务端 Secret 读取，不出现在 D1、普通配置展示、日志、错误、响应、测试夹具、客户端 bundle 或 Git。
- 研究提示不包含 userId、邮箱、技能审计、Proof、计划或设备信息。
- 只保存必要的结构化候选、citation 元数据、哈希和聚合 usage；不保存完整提示、搜索正文、完整 excerpt 或原始 Provider error metadata。
- IP 在进入 D1 前按 scope 加盐哈希；API 不回显 IP。
- 所有外部文本经过 React 文本渲染和长度限制，不注入 HTML。
- Source Audit 不主动 fetch citation URL，因此目标 2 不新增 SSRF 抓取面。
- 未知错误返回稳定 Arc code、Request ID 和可执行恢复动作；不返回 stack、Provider slug 细节、余额或内部成本。
- 生产构建和源树必须执行 Secret / provider-boundary 扫描。

## 15. UX

Research Beta 嵌入现有 Setup 的岗位选择阶段，不把公共 `/intelligence` 样例页改造成付费操作页。

- Guest 继续拥有完整 Flagship 确定性路径；现有 legacy custom-role 本地路径不被破坏，但不冒充 Research Beta。
- 已登录且在 cohort 内的用户输入非 Flagship 岗位后，可以选择 `Research this role`。
- `Queued / Researching / Validating` 使用可访问的 live status，显示事实状态而非虚假百分比；刷新后从 API 恢复。
- `Ready` 展示岗位摘要、技能数、来源数、观察日期、质量门槛通过状态和 `Use this research`；随后使用生成的蓝图进入现有技能审计、可用时间、目标范围和 Build。
- `Needs review` 展示具体可理解的问题、允许时的 Retry，以及继续使用 Flagship；不能使用草稿生成路线。
- `Failed` 区分可重试和不可重试恢复动作，不暴露 Provider 原因。
- AI 禁用、无密钥、预算不足或 Provider 失败时始终保留 Flagship 入口和已有计划。
- 不向学习者展示 confidence、模型 ID、Provider、token 或成本。
- 状态、错误、键盘焦点、窄屏单列、44px 控件和 reduced motion 遵循现有 Editorial Precision 语言与可访问性约束。

## 16. 错误映射

内部至少区分：disabled、not-in-cohort、rate、quota、budget、concurrency、timeout、provider-rate、provider-balance、provider-unavailable、invalid-transport、invalid-structure、source-policy、domain-policy、storage、conflict。

公共 API 只暴露稳定类别：

- `UNAUTHENTICATED`；
- `INVALID_INPUT`；
- `NOT_FOUND`；
- `CONFLICT`；
- `RATE_LIMITED`；
- `ALLOWANCE_REACHED`；
- `RESEARCH_UNAVAILABLE`；
- `RESEARCH_NEEDS_REVIEW`；
- `INTERNAL`。

HTTP 429 必须给出有界 `Retry-After`。不可重试错误不显示 Retry 操作。任何错误都不能把不合格包交给规划服务。

## 17. 测试策略

### 17.1 契约与 Provider

- 输入、公共状态、Research Package、quality report、usage 和错误 Schema；
- 精确 OpenRouter URL、headers、固定 model、strict schema、server tool、搜索硬上限、privacy routing 和 timeout；
- 未配置密钥时 fetch 为零；
- annotation 解析、URL 规范化、去重及未引用 URL 拒绝；
- 本地解析、一次 Repair、Repair 禁止 tools/新增来源和二次失败；
- Provider 429、余额、timeout、5xx、content filter、空 choice、invalid JSON 和超长响应。

### 17.2 质量黄金样本

- 合法岗位包完整通过；
- 缺技能来源、core 无高等级来源、虚假 URL、重复资源、依赖环、缺单元、分钟不守恒、无免费替代、提示注入和 XSS 样本进入正确终态；
- `RoleSkill.confidence` 只由服务端兼容适配器填充，quality/Planning 不读取它；
- 同一合法输入产生相同确定性 path 与 schedule。

### 17.3 D1 与并发

- `0005` 只增不减、外键、索引、唯一约束和回滚边界；
- owner isolation、CAS、幂等 replay、活跃运行去重、缓存有效期和 retry；
- 并发预算预留不超卖，结算/释放幂等，失败成本与用户配额分离；
- 临时 SQLite / local D1 smoke 从 `0000` 顺序应用到 `0005`，`foreign_key_check` 为空。

### 17.4 API 与规划接线

- 未登录、跨用户读取/重试、客户端 owner 注入、非法 researchRunId；
- 账户/IP/任务/cohort/预算 gate 在 Provider 前生效；
- `Ready` 所有者可以规划，`Needs review`、`Failed`、过期、跨用户和篡改版本不能规划；
- Flagship API、Setup、Planning、Today、Proof 和 Stack 保持回归。

### 17.5 UI 与人工验收

- 登录与 Guest 分流；
- 四类状态、刷新恢复、Retry、Use、Flagship fallback；
- 键盘顺序、焦点、live region、错误语义、320px 单列和 1440px 桌面；
- Fake Provider 本地完整流：研究任意岗位 -> Ready -> 技能审计 -> Build -> Path -> Today；
- Needs review、Failed、AI disabled 和 budget exhausted 分别验收。

常规测试一律使用 Stub/Fake，不读取真实密钥、不联网、不产生费用。

## 18. 完成与验证门槛

目标 2 的离线工程门槛：

```powershell
npm run test:unit
npm exec tsc -- --noEmit
npm run lint
npm run build
node --test tests/rendered-html.test.mjs
git diff --check
```

还必须完成：

- 迁移静态测试和本地 D1 smoke；
- Research/Planning/owner/budget/security 聚焦套件；
- 源树与 `dist` Secret 扫描；
- Flagship 路径 provider/outbound-fetch 负面扫描；
- 两轮独立代码审查及修复；
- 320px / 1440px 本地浏览器人工验收；
- 用户本地验收签字；
- 本地 fast-forward 合并、分支/worktree 安全清理、GitHub 普通推送及远端哈希核对；
- 恢复检查点记录精确提交和所有未执行的生产动作。

## 19. 真实请求与生产授权门槛

真实密钥创建或读取、任何付费 OpenRouter 请求、生产 Secret/变量、生产功能旗标、生产 D1 迁移、R2 生产写入、Sites 候选保存和公开部署均不是本规格批准的隐含结果。

离线实现、Fake 验证和本地 UAT 完成后，必须在执行点单独请求一次真实请求授权。若未获授权，目标停在真实请求门槛，并准确记录“无线上证据”；不得伪造或用普通网络测试替代。

获得授权时，真实验证也必须：

- 使用明确的低成本固定模型与一次 Research 请求；
- 预先声明最大搜索次数、输出 token 和预算；
- 使用非个人测试岗位，不发送用户数据；
- 不保存或打印 Secret；
- 验证后记录脱敏的请求状态、实际模型、usage 汇总、质量结果和成本上界；
- 不因此修改生产变量、功能旗标或部署。

## 20. 成功定义

目标 2 只有在以下事实均成立时才能完成：

- 认证且获准用户的任意岗位研究能通过 Fake 和经授权的最小真实请求形成可追溯研究包；
- 每个可用研究结果都有来源、质量报告、模型审计和成本审计；
- 只有 owner-bound `Ready` 结果能进入现有确定性规划闭环；
- 重复请求幂等、并发不超卖、失败不消耗用户 accepted quota；
- Provider 不可用时 Flagship 全闭环无回归；
- 密钥、完整提示、私密输入、原始错误和内部成本没有泄漏；
- 自动化、构建、本地 D1、人工验收、审查、合并、GitHub 备份和恢复检查点全部完成；
- 公开生产仍未改变。
