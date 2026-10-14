# Arc v8 第十二次真实 Research：length 结果

2026-09-11：用户报告“已运行”后，Root 只读取得新安全 Summary，并重核分支、HEAD 和 33 项冻结候选/保护指纹一致。**第十二次许可已消耗；完整 Research 未通过。没有第十三次、Repair、重试或额外探测许可。** 原等待执行回执的阻塞已解除，完整首版发布目标继续，未完成。

## 可核对证据

- Summary：`outputs/live-research/summary-2026-09-11T12-30-22-364Z.json`，2155 bytes。
- SHA256：`E8646D9A0FC3E74134662EEA857F06637F112B0A37C2E1A083A0FD0F7CC2F03D`。
- Research 开始：2026-09-11 12:30:23.255 UTC，即北京时间 20:30:23.255。
- 分支：`codex/v8-openrouter-research-beta`；HEAD：`7090153b4acad7b12df6a7ee4d675b46c41871dc`。有意未提交候选通过 `outputs/local-transport-observation-20260911/twelfth-candidate-hashes.json` 定位，不能只凭 HEAD 重建。

| 项目 | 实际结果 |
| --- | --- |
| 模型 | requested/actual 均为 moonshotai/kimi-k3 |
| 请求 | Key HTTP 200；Research HTTP 200；GET 1 / Research POST 1 / Repair 0 |
| 耗时 | Research 216417 ms，低于本地 600000 ms deadline |
| 结果 | incomplete / research-failed；run failed / invalid-result |
| 精确拒绝 | providerResultDiagnostic：rejected / finish-not-stop / recognized length |
| 费用 | usage.costMicros 242346；reservation settledMicros 242346，即 USD 0.242346；预留上限 USD 5 |
| 用量 | prompt 31730 / completion 13572 / total 45302；搜索 7 次；details 搜索计数有效，usageIssueCodes 空 |
| 候选与质量 | candidate diagnostic null；run quality null；未进入完整候选/质量验收 |
| 激活与规划 | 未 Ready，freshAccountActivated false，planningGenerated false |
| 保护检查 | audit 1；错误 owner 读取被拒；第二次 Research 被拒；临时数据库已销毁 |

## 能确认与不能确认的结论

当前 adapter 只有在响应流完成、未超过 524288-byte 上限、严格 UTF-8 解码及外层 JSON/object 检查通过后，才会进入 `readResponse`。本次明确记录 `finish-not-stop / length`，因此已通过这些传输检查。传输诊断 null 是对象级语义拒绝的预期行为；不能单独凭 null 推断网络成功，也不能据此改写第十一次根因未知的历史。

`length` 检查位于 content、annotations、candidate schema 和 package quality 校验之前。Summary 中的技能/引用计数 0、quality false/空 issue 不是远端完全没生成内容或教学质量差的证据；这些阶段尚未完成。当前拒绝并保留可信费用结算的行为正确，不应接受截断内容或自动续写。

本次有限证据指向输出长度结束，不支持用增加超时、响应字节上限或更换 Key 修复。当前请求 `max_tokens: 12000`，但 Summary 只保留外层 usage；没有逐轮输出或 reasoning token 拆分。不能把 completion 13572 当作最终可见 JSON 的 token 数，也不能断言服务商忽略了 12000 上限。具体触发的上游限制和足够的替代上限仍需验证。

契约需要每个技能至少一个 learn、恰好一个 calibrate 与一个 reinforce 单元；生成候选的每个单元有 15 个必填字段（存储模板另加 version，不属于模型生成字段）。完整课程的输出负担较大。现有字段要求与本次 length 共同支持“输出预算压力”的工作假设，但不证明任何合格课程都必然超过 12000 token。

## 后续本地设计

候选设计见 `../superpowers/specs/2026-09-11-arc-v8-kimi-output-budget-design.md`：比较扩大且明确分配输出预算、只压缩表达、分阶段生成。推荐先准备本地专用 24000-token / 完整简洁输出候选，保留搜索 10/50、USD 5、low、600/660/720 秒和全部 schema/来源/质量/费用/隔离门槛。新行为待用户审阅批准；尚未实施或取得第十三次许可。

Root 系统排查与独立只读审查 `twelfth_length_audit` 结论一致。新设计初审 1 个 P2/2 个 P3 已对照源码修正并复审 READY，待用户批准；审阅不授权实现或付费。审查未修改源码或调用 Provider。本轮不重复已经完成的 860 项/类型/lint/build，不把历史本地检查当作新候选验证。没有生产、Git 写入或 Sites 操作，公开 Research 状态未改变。

## 主资料核对

- [OpenRouter 参数](https://openrouter.ai/docs/api_reference/parameters)：max_tokens 是生成上限；并非成功、费用或耗时保证。
- [OpenRouter Server Tools](https://openrouter.ai/docs/guides/features/server-tools)：一次客户端请求可由服务端反复执行工具并调用模型，工具步数预算与输出限制是不同控制项。所读文档未确定本次逐轮 token 分配，故保留未知。
- [OpenRouter Finish reason / usage](https://openrouter.ai/docs/api_reference/overview)：标准化 finish_reason 与原生计数信息；不通过另发鉴权请求追查本轮。
- [推理参数](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)：支持和映射因模型而异；不能把文档对其他模型的 low 百分比精确套用到 Kimi。当前不新增 reasoning.max_tokens。

本轮公开资料读取不带 Key、不产生推理；模型 endpoints 元数据未成功取得，不宣称当前路由保证接受 24000 或保证在现有期限完成。
