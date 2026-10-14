# Arc v8 OpenRouter 响应格式兼容修复

状态：**2026-09-11 用户已明确“批准”，本地实施及全部审查/验证完成；无第十次真实许可。** 不重复索取本地设计批准。执行计划为 `../plans/2026-09-11-arc-v8-response-compatibility.md`，完成证据为 `../../operations/v8-response-compatibility-validation-2026-09-11.md`。本方案修正官方契约和本地对照证明的兼容性缺口，不声称已确定第九次所有失败字段，也不代替真实 Ready/费用/规划验收；第九次证据见 `../../operations/v8-ninth-response-result-2026-09-11.md`。

设计审查：Root 自审和独立只读设计审查均 READY，无 P1/P2/P3。已明确缺省标题不覆盖坏标题、双路径不掩盖非法值、费用与来源安全不放宽，以及合成证据不等于第九次根因。批准后的实施状态见执行计划和本轮本地验证记录；尚无新实测。

## 事实、目标与路线

第九次返回 HTTP 200 / stop，但引用解析先拒绝，候选观察尚未执行；旧搜索用量容器缺失。用户仍看不到 Logs 输出，无法重放原始响应。官方嵌套引用允许省略 title；官方 Chat SDK 使用 server_tool_use_details.web_search_requests，旧指南使用 server_tool_use.web_search_requests。Root 在既有 Provider 工厂中，以零真实请求的三个合成对照复现了缺标题拒绝和新路径用量丢失。

可选路线：

1. **推荐：修正这两项已证实的响应兼容性问题。** 请求、模型、候选质量和安全契约保留；本地 TDD 和双审即可推进，之后另行验证真实结果。
2. 继续等待 Logs 或客服提供原始响应：可更直接识别第九次根因，但目前资料不可取得，仍留下已知本地缺口。
3. 再换模型、重新调用或让自动 Repair 补齐：需要新的费用许可，且不解决解析器已经确认的不兼容；本轮不采用。

## 1. 可选引用标题的边界映射

修改 OpenRouter Adapter 的嵌套 url_citation 读取处，继续只信任 Provider 提供的引用 URL。不支持未确认的扁平结构，不丢弃坏的 url_citation，不从模型候选、资源表或搜索摘要补引用。

- 提供 title 时沿用既有 schema：trim 后 1..500 字符。null、非字符串、空白或过长标题仍拒绝；不截断或悄悄替换已提供的异常值。
- 只有 title 未提供（undefined）时才生成显示标签：先按既有 URL 字符串契约取值，再调用现有 canonicalizePublicCitationUrl，最后取其规范化 hostname。内部 title 使用该 hostname；它是来源域名标签，不冒称网页原始标题，不提高 sourceTier。
- hostname 已受现有公共 HTTPS/域名/长度政策约束，满足内部 title 上限。缺标题分支 URL 不合法时仍 invalid-transport，并保留已解析的费用审计信息。完整标题分支沿用原下游来源审计顺序。
- 规范化 URL 只用于计算 hostname 标签；返回的 annotation.url 仍为原 URL 字符串经既有 schema trim 后的值。不得提前删除 fragment/跟踪参数等内容来绕过下游 readBoundedResearchJson 的安全检查。
- 内部 ProviderCitationAnnotation 和 AuditedSource 契约保持非空 title；正常标题和 URL 输出行为保留。来源归属仍由 canonical URL 匹配决定，citationHash 继续只基于 canonical URL；重复引用仍由既有确定性规则选择代表标题。
- 不改变 annotations 数组 256 上限、外层/正文大小限制、候选解析、来源匹配、公共 HTTPS、注入/秘密检查、Repair 约束或持久化结构。

## 2. 两种搜索计数路径

在 result-diagnostic.ts 中让 usage 解析和诊断共用一个确定性搜索计数选择器。输入仅为 response.usage，识别两条固定路径：旧 server_tool_use.web_search_requests、新 server_tool_use_details.web_search_requests。容器 undefined 视为未提供；null、数组或非对象视为不合法。已提供的容器必须含有限整数 0..10 的 web_search_requests。

| 情况 | 结果 |
| --- | --- |
| 仅一个容器提供，计数合法 | 采用该计数 |
| 两个容器均提供、均合法且相等 | 采用该相同值，不相加 |
| 两个计数均合法但不同 | 冲突，用量不完整，保守持留 |
| 任意已提供容器或计数不合法 | 用量不完整，即使另一条合法也不掩盖问题 |
| 两个容器均未提供，Research | 用量不完整，不补 0 |
| 两个容器均未提供，Repair | 保留无搜索 Repair 专用缺省 0 |

Repair 出现任一容器时也使用显式计数校验，不能忽略新容器继续默认为 0。token 合计、费用 creditsToMicros 舍入、计数范围和其余 providerUsageSchema 规则不变。不能读取 total tool calls、注释/结果数量或费用反算搜索次数；也不从某个子请求拼装整轮计费。

## 3. 有限诊断与可追踪性

保留现有 webSearchUsage 描述旧容器的语义，避免把历史 missing 重新解释为别的含义。在本地 ProviderResultDiagnostic 新增两个固定字段：

- webSearchUsageDetails：与既有 container/requests 枚举相同，描述新容器形状，不输出计数值。
- webSearchUsageSource：legacy / details / both / missing / invalid / conflict。仅选择器确认合法来源时输出前三项；两个容器未提供对应 missing（包括 Repair 的专用缺省）；无合法选择且不是冲突/缺失时为 invalid。

严格安全投影同时验证两个形状及来源选择的一致性。两条均 valid 时 source 只能 both 或 conflict；其他规则与选择表一致。诊断不携带原始 URL、标题、正文、任意属性名、费用或 token 值；回调抛错/异步拒绝和投影失败不能影响返回、费用、次数或清理。标准生产工厂仍不接入本地诊断观察器。旧 Summary 保持原字节，新字段不回写历史证据。

## 影响文件与保留范围

- app/server/research/openrouter-provider.ts：缺标题的边界映射，复用来源 URL 策略；标准类与 Kimi 本地入口共用相同解析修正。
- app/server/research/result-diagnostic.ts：共用搜索计数选择与安全投影。
- scripts/live-research/validation.ts：必要的诊断接线/类型兼容；保持默认离线、唯一调用和本地数据库销毁。
- 对应 Provider、诊断、本地完整流程、来源审计、预算与 Repair 回归测试；文档/证据。

不修改候选或数据库 schema，不修改 source-audit 的既有安全规则、orchestrator 状态/Repair 策略、生产工厂时限、profile、launcher、runner、请求 prompt/schema/body、依赖或部署配置。旧有效缓存包仍符合相同内部契约；本轮不删除、迁移或重写它们。所有新生成候选仍通过原质量、来源和计费门槛。

## TDD、双审与完成条件

采用既有子代理/TDD/先规格后质量安全流程，按两项实施：先双路径 usage 与诊断，再可选引用标题。每项先记录失败断言，再最小实现、自审、独立规格后质量安全审查；最后 root 整合。

必须覆盖：

- 旧、新、双路径相等与冲突；单侧合法另一侧 null/空对象/数组/错误计数；两个缺失；0/10 边界，负数、小数、NaN/Infinity、11、数字字符串；Repair 缺省和新容器显式记录。全工具计数存在但没有搜索数时仍不完整。
- 保留两个容器诊断、选择枚举、严格投影、fresh copy、未知字段不透出、getter/回调失败隔离。
- 嵌套正常标题行为保留；只有省略标题可生成 hostname 标签；null/空白/数字/过长标题仍拒绝。无 URL、非公共/非 HTTPS URL、秘密参数、超长/编码/注入及超大 annotations 不绕过现有验证。
- 缺标题+新用量路径的完整合成 SQLite 流程：合法候选 Ready、合法费用结算、owner 隔离、激活/规划和 finally 销毁；不得仅用 Provider accepted 代替完整本地流程。
- 不合法 URL 或不被 Provider 引用的资源仍拒绝；候选结构/教学质量不合格仍按原规则拒绝或 needs-review；非法/冲突用量保守持留，即使内容可用也不能记为完整费用验收。
- 标准和本地入口的请求模型/参数/次数/时限保持原值；默认离线零真实请求；没有新增 Repair、重试、日志正文或生产观察器。

最终运行受影响 Provider/来源/诊断/orchestrator/validation/预算回归、非增量类型、定向 lint 和既有 build，保存最终源码指纹、两项双审和整合结论。此后只可称本地兼容性修复完成；第九次根因和真实首版通过仍需新的实际证据，不自动追加付费请求。

## 许可与下一步

本方案的本地兼容性修复和合成验证已获批准。本轮无第十次许可，不读 Key、原始响应/剪贴板、不更改云端日志/生产变量/旗标/D1/R2、不进行 Git 提交/推送/合并或 Sites 保存/部署。完整首版公开发布持续目标保持原范围。
