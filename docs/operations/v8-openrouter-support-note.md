# OpenRouter 403 客服说明草稿

此说明尚未发送。可由用户通过 [OpenRouter 官方支持页面](https://openrouter.ai/support) 提交。只包含已核对的脱敏事实，不附加 Key、环境文件、完整提示、原始错误或诊断输出目录。用户的账户身份由其登录支持渠道提供。

**Subject:** Personal account: inference HTTP 403, key and user-model catalog HTTP 200

Hello OpenRouter Support,

Please help identify an inference rejection on my personal account.

- On 2026-09-06, my local test started at 04:23:53 UTC. The key preflight returned HTTP 200, followed by one POST to `/api/v1/chat/completions` for `openai/gpt-5.6-sol`, which returned HTTP 403. No automatic retry or repair request followed.
- I could not find a corresponding entry in Activity. My account has available credit. The test key has not been revoked.
- At 05:49:11 UTC, a separate read-only check started. `/api/v1/key` and `/api/v1/models/user` both returned HTTP 200, and the exact model ID was listed. The per-key limit and remaining allowance were both USD 5; reported usage and BYOK usage were both USD 0 at that check.
- The inference request used strict JSON Schema, `require_parameters: true`, `data_collection: deny`, `zdr: true`, and `openrouter:web_search` with Exa fast and at most two searches.

Could you identify the specific permission, account policy, provider or other rejection category for the request around 04:23–04:24 UTC, and confirm whether any charge was recorded? The client retained HTTP status but not the raw error body or a provider generation ID. I have not included my API key, prompts or raw logs.

Thank you.

## 使用边界

以上 0 美元为当时 Key 聚合观察，不是最终结算结论。05:49 的成功仅指两项元数据 GET；实际 Research 仍未通过。说明基于当时仍有效的测试 Key 状态；如后来撤销，请在发送前更新该句。项目本地 run ID 不是 OpenRouter generation ID，因此没有将其冒充为服务商请求标识。
