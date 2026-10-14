# Arc v8 Kimi 推理预算与多轮搜索等待设计

状态：用户于 2026-09-09 回复“批准”，已批准本地实施；没有新的真实请求许可。实施计划：`../plans/2026-09-09-arc-v8-kimi-budget-timeout.md`。

实施进展、审查修正和当前授权以该实施计划及 `../../operations/v8-resume-checkpoint.md` 的最新入口为准。用户随后创建了首版公开发布持续目标；本文仍只定义其中已批准的本地候选切片，不将本文历史“仅本地”边界当作整个持续目标的终点。

## 1. 要解决的问题

Kimi 最小调用已成功，完整 Research 的 Key 和 POST 也返回 HTTP 200，但本地约 120.861 秒后只保存 incomplete/research-failed，没有最终研究包或 usage 回执。用户提供的同一父请求下两条子推理分别显示：

- Sail Research：原生输出 12,000 tokens，其中 reasoning 11,334（94.45%）；native finish 为 length，normalized finish 为 tool_calls；生成 94.864 秒，子费用 USD 0.1581398。
- DeepInfra：Exa 10 个搜索结果；生成 232.585 秒，cancelled true，两个 finish 字段均 null；子费用 USD 0.11268125，其中 web USD 0.014。

这是推理与真实搜索运行过的证据，不能当作父请求完整成功、总耗时或聚合费用。原摘要遗漏失败分类，无法追溯确证其 timeout；上一轮已修复该诊断缺口，498 项回归和先规格后质量双审通过。本设计不重做该修复或 Tasks 1–12。

本次目标是为后续一次受控验证准备一个 Kimi 本地执行方案，让模型减少默认的过度推理，并给多阶段搜索和最终生成留出有上限的等待时间。最终仍必须通过既有研究包、来源、owner、规划与费用验收；不以延长等待代替质量检查。

## 2. 新核对的公开能力证据

2026-09-08 UTC 15:37:15，本机对两个固定公开 URL 分别做了一次不带认证的 GET，均 HTTP 200：

1. [OpenRouter 模型元数据](https://openrouter.ai/api/v1/models)：精确 id 为 moonshotai/kimi-k3，reasoning 为 mandatory:false、default_enabled:true、default_effort:max、supported_efforts:[max,high,low]。没有 supports_max_tokens 字段。
2. [Kimi endpoint 元数据](https://openrouter.ai/api/v1/models/moonshotai/kimi-k3/endpoints)：Sail Research、DeepInfra、DigitalOcean 和 Moonshot AI 等 endpoint 声明 reasoning、reasoning_effort、tools、response_format 与 structured_outputs。DeepInfra 的 max_completion_tokens 为 16,384；保留现有 12,000 不需提高到该上限之外。

这两次只是公开元数据读取，不是 Key 预检、付费模型调用或搜索。没有读取真实凭据或使用认证头；没有保存整个模型目录或用户账户元数据。

[官方推理说明](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) 说明每个模型支持的 effort 和 token-budget 控制需分别判断，reasoning 计入输出；exclude 只隐藏推理输出，不减少模型推理。选用明确列出的 low，不发送未列出的 medium/minimal，不假设 reasoning.max_tokens 可为 Kimi 提供精确配额，也不关闭推理。公开能力声明不是某个账户、隐私条件和 endpoint 下必然成功的回执。

[官方 server tools](https://openrouter.ai/docs/guides/features/server-tools) 和 [web search](https://openrouter.ai/docs/guides/features/server-tools/web-search) 说明服务端负责工具和模型循环。12,000 是提交给生成步骤的 max_tokens 参数，不能宣称整个工具循环所有子推理合计最多 12,000 tokens。low 同样不是精确推理 token 硬上限，也不保证最终文本必定有足够空间。

[官方取消说明](https://openrouter.ai/docs/api_reference/streaming) 指出，远端停止处理/计费依赖流式请求和 Provider 支持；非流式请求不能把本地 abort 当作远端立即停费的保证。因此保留 non-streaming 时，超时只能承诺本地停止等待/读取，费用未知仍按保守规则处理。

## 3. 三条可行路线

| 路线 | 收益 | 代价与限制 |
| --- | --- | --- |
| **A：本地固定 low + 协调等待（推荐）** | 共用已验证的请求与解析逻辑，同时处理默认 max 推理和 120 秒本地等待不足；不改变线上入口 | 一次候选同时改变推理偏好和时限，用于功能验收，不是严格单变量因果实验；不能保证非流式远端即时取消 |
| B：只设置 low，保持 120 秒 | 改动小，可隔离推理偏好的影响 | 已观察到无推理的第二个子生成也用了 232.585 秒，仍可能丢失完整回执，需更多付费轮次才能排除等待不足 |
| C：改成流式聚合或后台持久任务 | 可以改善长任务体验与取消传播；后台任务可避免浏览器请求寿命依赖 | 需另行设计 SSE、最终 usage/来源聚合、错误事件及重放/恢复，改变既有非流式合同，范围显著更大；不作为本次最小修复 |

采用 A。保留同一 Kimi、现有预算与搜索上限，不增加模型候选、锁定 Provider、改变隐私路由或引入新依赖。本轮不把 C 的远端取消能力承诺归给 A。

## 4. 固定本地参数

候选标识为 **kimi-low-bounded-v1**。

| 项目 | 候选值 | 说明 |
| --- | --- | --- |
| Model | moonshotai/kimi-k3 | 同一固定模型 |
| Reasoning | {"effort":"low"} | 保留推理，使用已列出的 effort |
| max_tokens | 12,000 | 不提高原参数，不宣称工具循环总量上限 |
| Provider deadline | 600,000 ms（10 分钟） | 包含 POST 等响应头和完整响应体读取，使用同一个截止计时器 |
| Run active TTL | 660,000 ms（11 分钟） | 自创建 run 起算，为本地准入、Provider 及后处理保留余量，不做续租 |
| Launcher deadline | 720,000 ms（12 分钟） | 自启动 Node 子进程起算，包含 Vite、Key 预检、执行、保存、退出及输出转发 |
| Key 预检 | 现有 30,000 ms | 不延长；与研究时钟的起点不同 |
| 预算与请求 | USD 5；最多 Key GET 1 + Research POST 1 | 专用未使用且无周期重置的限额 Key；无客户端重试或 Repair |
| 搜索 | Exa fast，最多 2 次、每次最多 5、合计最多 10 结果 | 保留 max_characters:2000 和 max_tool_calls:2 |
| 隐私与格式 | deny / zdr / require_parameters；严格 JSON Schema；stream:false | 原安全与格式边界保留 |

600 秒是基于已观察到的多阶段时长选取的有限本地验证窗口，不是服务商 SLA。active TTL 比 Provider 期限多 60 秒，启动器还要覆盖 Key 30 秒以及启动/输出等工作；不同起点不能直接视作相同倒计时。仍可能因异常本地停顿或远端耗时超过窗口而失败，按现有规则停止并记录，不能自动延长或重试。

## 5. 实现边界和数据流

### 5.1 共用执行逻辑，分开构造入口

在 app/server/research/openrouter-provider.ts 内保留现有导出 OpenRouterResearchProvider 的标准 API、研究默认 20 秒/Repair 默认 10 秒和 timeout 1..120,000 ms 校验。把必要的底层执行组织为同模块私有 executor，继续只有一份请求构造、Schema、响应/UTF-8/字节限额检查、引用/usage 解析和截止逻辑。

新增明确命名的 createKimiLocalValidationProvider，只接受显式 key、必须注入的 fetch 及现有安全诊断回调。它固定 Kimi、low、600 秒；不给调用方任意模型、时限、推理数值或其他请求字段覆盖能力。它的 repair 方法立即拒绝，不触发 fetch。标准构造入口不得通过 unknown extra、环境字段或任意 deadlineOverride 选择本地路径。

生产 service-factory 继续只构造标准 OpenRouterResearchProvider。生产导入图不引入 scripts 或 tests；标准 factory/env/路由不识别本地 profile。共享内部执行器的改动需通过原 Provider 全部回归，不能复制一份弱化的 parser 或用 fetch wrapper 替换 signal、扣留响应来绕过原计时器。

### 5.2 一个非秘密参数文件

新增 app/server/research/local-validation-profile.json，存放已审查的固定值：profileId、model、reasoningEffort、researchTimeoutMs、activeTtlMs、launcherTimeoutMs。TS 本地 factory/validation 与 PowerShell 读取同一文件；它是版本化代码配置，不是环境文件或用户偏好。

只允许该固定 profile，不提供任意 CLI 路径、数字参数或 env 覆盖。读取端校验已批准字段和值、整数/有限数及时间先后关系；未知 profile、缺失/损坏/额外字段或超上限在 Key 提示及任何请求之前失败。不得用缺失文件时退回旧 profile 的方式静默执行另一实验。

预算、搜索与输出边界继续沿用现有固定约束，并由测试证明没有变化。仅生产标准路径不依赖此 JSON 来决定其时限；JSON 只参与本地构造和启动器策略选择。

### 5.3 本地入口与摘要

scripts/live-research/validation.ts 改为使用命名的本地 factory，默认 offline 和 -ExecuteOne 都走同一候选策略；offline 使用合成响应，真实请求仍为零。配置指纹改为包含候选 profile、low、时限和既有版本/约束的新值，不能继续冒用原 live-validation-kimi-k3-v1。

在安全摘要中增加本次研究策略标识与研究执行耗时：只保存固定 profile/effort/时限和有界非负 elapsedMs；真正进入研究调用前保持 null。默认离线运行虽有这些策略字段，但 mode 和 realRequestCount 明确标识合成验证。Key-only 或预检失败不伪造 Research 耗时。

elapsed 使用单调时钟，在研究调用的 finally 中记录，不记录任意 Error、headers、Provider 推理内容、凭据或账户 ID。继续保留已修复的 failureCategory 和原 usage/质量/规划验收逻辑。

scripts/live-research/run.ps1 对完整验证（包括无参数 offline）使用该候选的 720 秒总期限，在读取 Key 前校验 profile；提示明确 Kimi / low / 10 分钟 Provider 等待 / 12 分钟启动器上限 / USD 5 / 无重试。Key-only、账户检查和最小探测仍使用原 180 秒启动器期限，不顺带改变这些模式。

启动器继续同时读取 stdout/stderr，使用总预算的剩余时间完成转发，维持隐藏进程、masked Key、stdin 管道及退出码。若适配器已输出 timeout 摘要，正常转发该摘要；启动器硬终止只能给出安全失败，不捏造已完成的数据库清理/结算报告。

### 5.4 超时、迟到结果和费用

600 秒到期时取消本地请求/reader、释放 reader lock 和 timer，返回 timeout/charged unknown；无完整 Provider receipt 时仍 incomplete、无计划激活并保守对待费用。不得因为 abort 或子记录 cancelled:true 推导零费用/退款/远端已经停止。

TTL 660 秒不是第二次付费机会。若本地执行因停顿超过 TTL，沿用 state-version CAS 和既有迟到回执处理：合法迟到费用可用于审计/对账，不能恢复为 Ready、生成计划或追加 Repair。预算过期时间来自 run，但不会单凭到期自动释放未知费用。

本次无需改变 orchestrator 或预算仓库，现有 active TTL 上限为一小时，已支持该本地值。生产 factory 的环境时限是必填的 1..120 秒，而其活动租约固定 60 秒；20/10 秒是示例环境值和适配器回退默认，不能说 factory 自带这两个默认值。生产可能接受超过租约的现有配置问题单独记录为未来启用前条件，本次不改生产规则或变量。

## 6. 预期文件范围

| 文件 | 作用 |
| --- | --- |
| app/server/research/openrouter-provider.ts | 私有共用 executor；保持标准入口；新增固定本地 factory |
| app/server/research/local-validation-profile.json（新增） | 唯一非秘密本地参数数据 |
| scripts/live-research/validation.ts | 本地 factory、TTL/指纹、安全策略与耗时摘要 |
| scripts/live-research/run.ps1 | 按模式读取并校验 profile、协调总期限及提示 |
| tests/server/kimi-local-validation.test.ts（新增） | 本地策略、长请求、deadline、质量/预算/规划集成 |
| tests/server/openrouter-provider.test.ts | 标准入口与边界保持；本地构造拒绝路径 |
| tests/server/live-research-validation.test.ts | 新 profile/请求差异，保留原验收场景 |
| tests/server/live-research-failure-summary.test.ts | 对准新研究期限，保留两种 timeout 与 invalid-result 区分 |
| tests/server/live-launcher-output.test.ts | 夹具携带公开 profile 文件，保留双流/退出码验证 |
| tests/server/kimi-launcher-policy.test.ts（新增） | profile 损坏/模式隔离/总预算验证 |
| docs/operations 和本设计对应实施计划 | 保存候选、验证、指纹和下一次许可状态 |

runner.mjs 继续通用序列化，预计不需修改；若实施发现必须改动，先说明具体依赖并扩大针对性验证。service-factory、orchestrator、budget、数据库迁移、UI、依赖、hosting 配置和环境模板均不在本地候选修改范围。

## 7. TDD 与验收要求

1. 先观察有意义的 RED：新 factory 缺失、低推理字段缺失、旧 120 秒提前终止、旧 180 秒 TTL 阻止迟到但有效结果、启动器策略错误等；子进程 EPERM 不是 RED。测试不发真实网络，不等待十分钟。
2. 固定策略：实际序列化请求只有新增 reasoning:{effort:low}，原模型/max_tokens/search/schema/privacy 保留。校验标准构造仍拒绝 120,001/600,000 ms、无隐式 low，生产 factory/env 不接受本地 profile，Repair 无调用。
3. 通过真实 validation/adapter/orchestrator 与合成 fetch、假时钟，让有效完整响应在 330 秒到达：不在 120 或 180 秒提前终止；Ready、引用/技能、同 owner 激活/规划、数值费用和精确结算全部通过，真实网络为零。
4. 请求阶段和 HTTP 200 后响应体阶段分别在 600 秒仍未完成：timeout、取消/释放、unknown cost 保守处理、无计划/激活/Repair/重试。迟到响应不能被发布；不会增加第二个 POST。
5. 模拟超过 660 秒的本地 lease 停顿/恢复：保留既有迟到 receipt/CAS 语义，不能因扩大 Provider 窗口复活过期运行。复用或扩展既有 orchestrator 的迟到/回收场景，不改其合同。
6. 保留无效 JSON、截断 length、缺来源、分钟不符、错误模型、缺 usage、搜索为零或超限、费用超限等失败路径，避免低推理掩盖不合格输出。缺 receipt 不由 Activity 子记录或估价补全。
7. 启动器在 profile 校验失败时不提示 Key/不启动推理；其他模式时限不变。真实 PowerShell + 合成 child 验证双流、退出码和清理；期限测试可在测试副本中有界缩短常量，不给产品引入可修改 deadline 的环境开关。验证使用同一个总期限和剩余输出转发预算。
8. root 最终执行新增文件及 Provider、validation、failure-summary、environment、orchestrator、planning、launcher、transport 等相关回归，非增量类型和定向 lint；因共用应用 Adapter 源码改变，完成一次本地构建。没有发布或浏览器验收范围扩大。
9. 按已批准流程由独立子代理作规格审查，通过后进行质量/安全审查。保存最终指纹和实际默认 PowerShell 离线摘要，明确 synthetic usage 不是真实费用。无须为本次准备再做付费请求。

## 8. 授权、完成定义和后续顺序

用户本轮恢复的是修复设计。先完成书面设计供审阅；批准本地实施后，使用 writing-plans 写精确任务和测试，再沿用子代理/TDD/双审完成候选。不要重复询问已确定的实现工作流。

本地候选完成只意味着按设计生成正确请求、协调时限并通过离线边界测试，不代表 Kimi 在当前路由下满足全部研究验收，也不代表网站已具备上线 Research 条件。

六次旧客户端推理许可全部消耗。只有在候选通过本地验证和双审后，才提出具体的一次真实请求/预算范围；用户批准并自行隐藏输入新限额 Key 后执行。失败、超时、缺费用或 Needs review 都停止，不自动重试。当前没有第七次许可。

继续禁止读取真实 Key/env、生产变量/秘密/旗标/D1/R2 修改、master 合并、提交/推送、Sites 候选或部署。线上 v8 version 10 Research 保持关闭。文档保存到本地，不由设计技能的默认 commit 步骤扩大 Git 授权。

设计编写时分支为 codex/v8-openrouter-research-beta，HEAD 7090153b4acad7b12df6a7ee4d675b46c41871dc。21 份既有未提交文件全部保留，本设计新增一份文档；当时运行源码与上一轮通过 498 项回归的指纹一致，尚未实现本设计的参数变化。批准后的实际实现、验证和最新指纹见实施计划，不再沿用此历史状态判断当前源码。

## 9. 设计复核记录

Root 已完成范围、占位词、参数和边界的一致性自查。独立只读设计复核完整阅读本文并对照实际 adapter、factory、validation、launcher、orchestrator 及既有超时/迟到回执测试，结论 **READY：无需要阻止设计批准的实质性矛盾或实施缺口**。时钟起点、生产构造入口、非流式取消/计费限制和离线验收边界一致。审阅者没有运行测试、查询网络或修改文件。此结论只针对设计，不冒充实施后的规格/质量审查，也不替代用户对新候选的确认。
