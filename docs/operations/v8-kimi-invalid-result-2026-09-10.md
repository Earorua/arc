# Arc v8 第七次 Kimi Research 结果调查

状态：真实验收未通过；本地诊断信息丢失已确认，真实响应具体拒绝点未确定。第七次许可已消耗，没有第八次、Repair、自动重试或认证诊断 GET 许可。

## 原始安全摘要

文件 `outputs/live-research/summary-2026-09-09T18-16-27-326Z.json`，1264 bytes，SHA256 `24bad7859f8c9c0471881609961aa9dfe08ee83ea80ff571a7c40cc31a4a4821`；保持原文件不变。

| 项目 | 结果 |
| --- | --- |
| 请求 | Kimi K3 / low，Provider 600 s / active TTL 660 s / launcher 720 s |
| 本地开始 | UTC 2026-09-09 18:16:27.326（北京时间 9 月 10 日 02:16） |
| Key / Research HTTP | 200 / 200 |
| Research 耗时 | 108876 ms |
| 流程 | incomplete / research-failed / failed / invalid-result |
| 模型 | requested / actual 均 moonshotai/kimi-k3 |
| 回执 | auditCount 1；usage null；researchFailureDiagnostic null |
| 费用处理 | conservative-hold；maximumMicros 5000000；settledMicros 0 |
| 调用数 | 一次 Key GET + 一次 Research POST；零 Repair |
| 功能 | owner 与重复请求拒绝通过；未激活、未生成计划；数据库已销毁 |

保守持留的 USD 5 是本地未知费用预算保留，不是实扣 USD 5 或实扣零。quality.issueCodes 空、引用/技能计数零是 Failed Summary 的默认值，不能据此认定供应商没有搜索/内容或质量合格。

## 用户提供的主请求 Activity（未经独立账户查询）

主请求 `gen-1788977795-enk9e3KZbNaIyCVc92LW`；UTC 2026-09-09 18:16:35.697；model `moonshotai/kimi-k3-20260715`，provider 显示 Moonshot AI。

- parent_generation_id、spawned_by 均为 null，streamed false，cancelled false。
- generation_time 105046 ms，finish_reason / native_finish_reason 均为 null。
- prompt / completion / native prompt / native completion / reasoning token 均显示 0；usage / usage_upstream 显示 0；provider_responses 为空。
- 未提供本次相关子请求的完整费用证据。主记录为零不证明完整服务端工具流程总费用为零；空 provider_responses 不证明完全没有联系到任何供应商。
- 该记录与本地时段/模型相符，支持“没有正常完成证据”。Activity 字段不能反推原始 HTTP 响应的确切 choices/usage 形状，也不能据此声称结束原因 null 就是 Adapter 拒绝点。

用户粘贴中的 API-key 元数据、账户、workspace 和 Key hash 未保存。没有读取真实 Key、额外查询账户或向客服发送信息。

## 代码追踪与本地对照

`openrouter-provider.ts` 在读取有界 UTF-8 JSON 后提取模型/usage，随后校验 choices、结束原因、content 和 annotations。当前摘要 actualModel 非空，排除了读取/UTF-8/JSON 外层失败及请求超时等没有模型审计信息的路径。HTTP/top-level/choice error 分支会设置固定错误诊断；当前 diagnostic null，代码与这一类路径不符。finish_reason error / content_filter 等分别映射其他公开分类。

`auditMetadata` 将缺失或不合法的 token/费用/搜索聚合回执投影为 usage null。`orchestrator.receiptSettlement` 将它变成 unknown / conservative-hold，**不会独立把候选设为 failed**。

`d1-repository.saveNeedsReview` 在候选为空、不安全或结构不完整时仍记录质量报告，但 Failed PublicView 不包含它。`validation.ts` 只在 Ready/Needs-review 填充质量字段。审计中的 failed / invalid-transport 与 rejected / invalid-result 也没有进入 Summary。因此不同层的拒绝会合并成同样的摘要。

Root 使用现有 `createOfflineVite`（config/env 加载关闭）、真实 `runValidation`/Adapter/一次性 SQLite，注入固定合成 Key 和响应；global fetch 显式拒绝所有外网。4 项对照全部断言通过，进程退出 0、约 1.58 秒；仅在内存构造响应，未写新实现或测试文件、未生成或覆写真实 Summary。

| 合成响应变化 | 实际本地结果 |
| --- | --- |
| 只删除 usage | Ready / 无 failureCategory / 质量通过 / usage null / conservative-hold |
| 删除 usage + finish_reason length | Failed / invalid-result / 空质量 / usage null / diagnostic null |
| 删除 usage + candidate 为 `{}` | 与上一行相同 |
| 删除 usage + citation title 为空 | 与上一行相同 |

后三项都能重现本次公开摘要形状；不能任选其中一种作为真实根因。也保留较窄的其他拒绝可能，如候选最终包大小超限。不能通过放宽 finish、Schema、引用或 usage 校验“修复”不完整结果。

## 官方契约核对与下一步

2026-09-10 查阅 [OpenRouter Chat Completions API](https://openrouter.ai/docs/api_reference/overview)：结束原因规范、非流式 usage 与原生 token 字段属于返回契约；`cost` 和 `server_tool_use` 为可选字段。这解释了 HTTP 200 与可用于 Arc 验收的完整结果不是同一条件，不证明本次的具体上游错误。

[Web Search 工具说明](https://openrouter.ai/docs/guides/features/server-tools/web-search) 描述服务端多次搜索、max_uses/max_total_results、max_tool_calls 和 usage.server_tool_use.web_search_requests。当前调用仍按既定工具参数，未发现足以证明应改模型名/地区/Key 或放宽限额的证据。

推荐先完成 `../superpowers/specs/2026-09-10-arc-v8-result-diagnostics-design.md` 中的本地固定枚举诊断。它只解决已复现的信息丢失，不声称解决真实 Provider 返回，也不自动新增付费试验。保持现有接受/计费/隐私边界及生产状态；取得具体响应证据后再决定是否修正兼容性、调整流程或请求新的一次有界实测。
