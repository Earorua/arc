# Arc v8 第九次实测：引用解析拒绝与搜索用量缺失

状态：**已执行，完整 Research 未通过。** 用户于 2026-09-11 回复“已运行”，Root 读取本次安全 Summary。第九次一次性许可已消耗，没有第十次、Repair 或自动重试许可；本轮继续只读调查和本地方案准备。

## 新鲜证据

- Summary：`outputs/live-research/summary-2026-09-11T06-56-46-414Z.json`，1836 bytes，SHA256 `f2a28987bc03fecad5af41b3c5bd921053d76983eacfc0515eac2a3d67cae45d`。原文件保持原字节。
- 时间：北京时间 2026-09-11 14:56:46 开始，14:59:45 落盘。Key HTTP 200 / 1213 ms；Research HTTP 200 / 177531 ms。固定 Kimi K3 low、600/660/720 秒候选。
- `providerResultDiagnostic`：rejected / annotations-invalid，finishReasonState recognized / finishReason stop。没有 `researchFailureDiagnostic`，本次不是已观察到的 HTTP/Provider 错误或本地超时。
- 搜索用量：usageIssueCodes 仅 web-search-requests；`webSearchUsage` 为 missing / unavailable，明确表示 `usage.server_tool_use` 未返回。它不描述其他路径，不证明搜索次数是零。
- 候选：`researchCandidateDiagnostic: null`，实际在引用解析处已抛错，未进入 orchestrator 的候选解析观察入口。不能从 null 推断正文合法或非法，也不能把它记成第八次相同的 invalid-schema。
- 本地 attempt/run：failed / invalid-transport；公开 failed / invalid-result；没有来源/技能/规划。公共 quality 默认空问题列表不表示通过。
- 最多一次 Key GET + 一次 Research POST（realRequestCount 2），Repair 0；owner 错读拒绝、第二次 Research 拒绝、数据库销毁均 true；未激活账号或生成计划。
- usage 聚合 null；预算 conservative-hold，maximumMicros 5000000 / settledMicros 0。charged true 说明响应 cost 被识别为正数，但摘要没有保留精确值；5 美元是预留上限，0 是未结算，均不能当成真实消费。

## 已定位的代码边界

`app/server/research/openrouter-provider.ts` 的 readResponse 在读取 content 后解析 `message.annotations`：非数组、超过 256 项，或任一 url_citation 的嵌套 `url_citation.url/title` 未通过本地 Schema，都会返回相同 annotations-invalid。当前 schema 要求 url 为 trim 后 1..2048 字符、title 为 trim 后 1..500 字符。本次摘要不足以区分这些情况；不能直接补标题、丢弃问题引用或放宽来源校验。

`app/server/research/result-diagnostic.ts` 的 projectUsage 只读 `usage.server_tool_use.web_search_requests`。Repair 专用缺省 0 不能用于 Research；引用数量、搜索结果数量和 tool_calls_executed 均不能直接替代真实搜索查询次数。

Root 复核 8 项候选和 17 项受保护源码/历史证据指纹，25 项全部匹配。分支 `codex/v8-openrouter-research-beta`，HEAD `7090153b4acad7b12df6a7ee4d675b46c41871dc`，本次运行前的 49 份未提交成果保留。635 项本地验收和双审仍是先前完成的证据，本轮未重复整套测试或修改接受行为。

## 取证与后续

用户确认 Logs 中这次请求**仍看不到输出内容**。Root 不读取 Key、扫描剪贴板/原始日志、开启日志配置或再次请求。官方 [Input & Output Logging](https://openrouter.ai/docs/guides/features/input-output-logging) 说明启用后可从 Logs 的 generation 详情查看 Completion；当前缺少正文的具体原因未确认，不能保证日志一定存在。

官方 [Web Search Server Tool](https://openrouter.ai/docs/guides/features/server-tools/web-search) 的 usage 示例仍使用 server_tool_use；但当前 [Chat Completions API](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion) 示例使用 server_tool_use_details。两处资料存在接口表述差异，需要继续对照官方 SDK/Schema 的字段定义，再设计兼容处理；未取得本次原响应前不声称新字段实际存在。

下一步先核对官方响应契约，并用合成输入验证已确认的本地兼容性缺口，再形成最小本地修复方案。保留严格候选/来源规则、完整可信 usage 与保守计费；不得用新诊断、HTTP 200 或模型 stop 替代完整 Ready/规划验收。完整首版公开发布目标恢复 active、未完成，当前没有生产/Git/Sites 写入。

## 官方契约与本地合成对照结果

独立只读调查确认两项事实：

- 官方 [ai-sdk-provider Chat schema](https://github.com/OpenRouterTeam/ai-sdk-provider/blob/main/src/chat/schemas.ts#L71-L89) 使用嵌套 url_citation，其中 title 可省略；[PR 364](https://github.com/OpenRouterTeam/ai-sdk-provider/pull/364) 包含该修正及非流式测试。没有足够官方证据支持扁平 Chat 引用，不能自行新增扁平格式猜测。
- 官方 [ChatUsage](https://github.com/OpenRouterTeam/typescript-sdk/blob/main/src/models/chatusage.ts#L151-L175) 接收 server_tool_use_details；[ServerToolUseDetails](https://github.com/OpenRouterTeam/typescript-sdk/blob/main/src/models/servertoolusedetails.ts) 定义其中可选的 web_search_requests。这个数与所有工具的 requested/executed 总数不同，不能相加或互相替代。

Root 在真实本地 Provider 工厂上做三项合成对照：通过既有 createOfflineVite 加载 fixtureResponse 和 createKimiLocalValidationProvider；global fetch 一律拒绝，注入的 fetch 只返回 Response.json 合成数据，使用固定假 Key。没有运行真实 launcher，没有新真实 Summary、账号请求或持久数据库；无源码修改。

| 单一变量 | 本地结果 |
| --- | --- |
| 原完整基线 | Provider accepted，candidate 和 usage 均存在 |
| 只删除第一条嵌套引用 title | annotations-invalid / invalid-transport |
| 只把搜索计数移动至 server_tool_use_details.web_search_requests=2 | Provider accepted、candidate 存在，但 usage null，旧容器 missing / unavailable |

三项均仅一次合成 fetch、零真实请求；进程退出 0，仅 SQLite experimental 提示。它们证明当前本地兼容性缺口，不是第九次真实响应重放，也不证明第九次有缺失 title 或新路径。下一项具体方案见 `../superpowers/specs/2026-09-11-arc-v8-response-compatibility-design.md`。

兼容性设计已完成 Root 自审和独立只读审查，均 READY，无 P1/P2/P3；尚待用户审阅具体本地行为变更。设计明确保留 schema trim 后的原 annotation.url，仅用规范化 URL 计算 hostname 标签，避免提前删除 fragment/参数绕过下游检查。本轮新增加结果与设计两份文档，当前 51 份预期未提交成果；应用源码和第九次 Summary 未变。没有活实现/测试进程或新的付费请求，完整目标仍 active；下次获得本地设计批准后按两项子代理/TDD/双审实施，不重复询问已消耗的第九次许可。
