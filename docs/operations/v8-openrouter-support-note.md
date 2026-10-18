# OpenRouter 403 客服说明草稿

此说明尚未发送。可由用户通过 [OpenRouter 官方支持页面](https://openrouter.ai/support) 提交。只包含已核对的脱敏事实，不附加 Key、环境文件、完整提示、原始错误或诊断输出目录。用户的账户身份由其登录支持渠道提供。

**Subject:** Personal account: two inference HTTP 403 responses despite successful key checks

Hello OpenRouter Support,

Please help identify two inference rejections on my personal account.

- On 2026-09-06, my local test started at 04:23:53 UTC. The key preflight returned HTTP 200, followed by one POST to `/api/v1/chat/completions` for `openai/gpt-5.6-sol`, which returned HTTP 403. No automatic retry or repair request followed.
- I could not find a corresponding Activity entry for the first attempt. My account has available credit. After the second attempt, my Activity Overview (GMT+8, Past 1 Month) showed total spend USD 0.00, requests 0 and token volume 0; Top API Keys and Top Apps showed no data in that window.
- At 05:49:11 UTC, a separate read-only check started. `/api/v1/key` and `/api/v1/models/user` both returned HTTP 200, and the exact model ID was listed. The per-key limit and remaining allowance were both USD 5; reported usage and BYOK usage were both USD 0 at that check.
- At 09:57:33 UTC on the same date, I started one separately authorized diagnostic attempt with the same requested model. Its key preflight returned HTTP 200 in 1,390 ms, then one inference POST again returned HTTP 403. The parsed JSON error had numeric `error.code: 403`; an allowlisted observer recorded `error.metadata.error_type` as missing (absent or null), rather than an unknown string. No automatic retry or repair followed either attempt. The client has no actual-model or usage receipt for either failure.
- The inference request used strict JSON Schema, `require_parameters: true`, `data_collection: deny`, `zdr: true`, and `openrouter:web_search` with Exa fast and at most two searches.

Could you identify the specific rejection reason for the requests around **04:23–04:24 UTC** and **09:57–09:58 UTC on 2026-09-06**, clarify whether they reached an upstream provider, and confirm whether any charge was recorded? The client retained only allowlisted status/category fields, not raw error bodies or provider generation IDs. I have not included my API key, prompts or raw logs.

Thank you.

## 使用边界

以上 0 美元为 05:49 的 Key 聚合观察，不是两次请求最终结算结论；本地预留 released/settled 0 也不能证明 Provider 零扣费。两次 Research 均未通过。第二次的 `missing` 仅表示标准类型缺失或 null，不是 guardrail、地区限制或其他具体原因的证明。[官方错误文档](https://openrouter.ai/docs/api_reference/errors-and-debugging) 的标准类型字段和 403 示例支持这种区分，但没有诊断本账户。

第二次 Key 预检为 200、Research 为 403；本轮事后撤销状态尚未确认，撤销后可按实际情况告知客服。用户截图只覆盖 Activity 的当前 Overview 范围，未独立检查 Explore 明细，也不等同于最终结算。项目本地 run ID 不是 OpenRouter generation ID，因此没有将其冒充为服务商请求标识。只提交上方英文正文；不要附加本地输出目录或未经筛选的诊断材料。
