# OpenRouter 403 客服说明草稿

此说明尚未发送。可由用户通过 [OpenRouter 官方支持页面](https://openrouter.ai/support) 提交。只包含已核对的脱敏事实，不附加 Key、环境文件、完整提示、原始错误或诊断输出目录。用户的账户身份由其登录支持渠道提供。

## 2026-09-08 第六次尝试：完整 Kimi Research HTTP 200，但客户端未完成

**Full-request follow-up:** At **13:52:03 UTC on 2026-09-08** (21:52:03 GMT+8), I ran one separately authorized complete Research request with `moonshotai/kimi-k3`, strict JSON Schema, up to two Exa fast searches and 12,000 output tokens, retaining the same privacy constraints. Key preflight returned HTTP 200 in 814 ms; the single inference POST returned HTTP 200. About 120.861 seconds after local start, the client saved an incomplete/failed summary without an actual-model or usage receipt and without a validated research package or plan. The configured Research deadline was 120 seconds; the timing is consistent with that deadline, but the original summary omitted its failure category, so timeout is not conclusively recorded. No automatic client retry or repair followed. No authenticated follow-up request was made by the agent. This draft remains unsent.

**Activity child observations:** I subsequently supplied two records sharing a parent/request relationship, both marked `spawned_by: server-tools:web_search`. These are child inference records, not the parent's final receipt. The first, created **13:52:10.38 UTC**, was served by Sail Research with Kimi K3's dated version, native completion **12,000**, native reasoning **11,334**, normalized finish `tool_calls`, native finish `length`, generation time **94,864 ms**, cancelled false, and usage **USD 0.1581398**. It showed DigitalOcean 429 followed by Sail Research 200 in platform routing. The second, created **13:53:47.229 UTC**, was served by DeepInfra with the same model version; generation time **232,585 ms**, cancelled true, both finish reasons null, native completion **3,865**, native reasoning **0**, Exa **10 search results**, and usage **USD 0.11268125**, comprising upstream **0.09868125** and web **0.014**. The child generation times and costs do not establish total parent duration or aggregate billing. Please examine the **13:52–13:58 UTC** window for parent outcome, downstream cancellation propagation, truncation handling and aggregate charges. The actual generation/Key/account identifiers and full metadata are not included in this draft.

## 2026-09-08 第五次尝试：Kimi K3 最小请求成功

最新对照成功：四次先前 POST 为 403，第五次 Kimi 最小 POST 为 200。原失败记录继续保留，不再描述为“所有推理都失败”。本草稿尚未发送。

**Successful model comparison:** At **12:48:19 UTC on 2026-09-08** (20:48:19 GMT+8), I ran one separately authorized minimal comparison with **`moonshotai/kimi-k3`** through the same local launcher and OpenRouter chat-completions endpoint. The fixed public sentence, 512-token output cap, non-streaming mode, no tools/schema, and `require_parameters: true`, `data_collection: deny`, `zdr: true` were retained. Key preflight returned HTTP 200 in 2,396 ms, followed by exactly one inference POST returning **HTTP 200**. Requested and actual model both reported `moonshotai/kimi-k3`; visible output matched the expected OK. The usage receipt reported 127 prompt tokens, 27 completion tokens, 154 total tokens, and **USD 0.000682**. No automatic client retry or repair followed. This shows that the local minimal client can complete a Kimi request under these constraints; it does not identify the cause of the earlier Sol/Astra 403 responses. Credential identity and egress were not independently compared across attempts. Please use this successful **12:48–12:49 UTC** window alongside the earlier failure windows when investigating model/provider-specific authorization or routing behavior. No post-run account balance or final billing query was made.

## 2026-09-08 第四次尝试：最小请求补充

截至本节历史记录，共有三次完整 Research 和一次最小推理，四次 POST 均为 403；最新第五次 Kimi 成功见上方。本节与下方第三次补充、原始两次草稿一起提供历史；没有这些失败请求的新事后 Activity 或最终费用确认。本草稿尚未发送。

**Minimal-request comparison:** At **12:20:25 UTC on 2026-09-08** (20:20:25 GMT+8), I made one separately authorized minimal request to `/api/v1/chat/completions` using **`openai/gpt-6-astra`**. It sent only the public sentence **“Reply exactly OK.”**, with `max_tokens: 512` and `stream: false`, no tools or JSON response schema. The request retained `require_parameters: true`, `data_collection: deny`, and `zdr: true`. Key preflight returned HTTP 200 in 1,720 ms, followed by exactly one inference POST returning HTTP 403. Parsed numeric `error.code` was 403; `error.metadata.error_type` was missing or null. A local fixed-category message classifier returned unrecognized; this does not mean the service omitted a message. Raw error text was not retained. No automatic client retry or repair followed. The client has no actual-model, visible output, token or cost receipt. Please investigate the **12:20–12:21 UTC on 2026-09-08** window and identify the rejection reason, whether an upstream provider was reached, and any recorded charge. Please also check whether inference permissions, guardrails or the retained routing/privacy requirements explain why key preflight succeeds while inference is rejected. This experiment does not by itself establish the cause.

## 2026-09-08 第三次尝试补充

下方原始英文草稿保留两次 Sol 的历史观察。提交时将本节英文补充一并附上；截至本节记录已有三次推理请求失败，最新第四次见上方。此后没有核对新的 Activity 费用，不能把旧截图的 0 美元沿用为此次最终结算。

**Additional attempt:** At **17:15:12 UTC on 2026-09-07** (01:15:12 GMT+8 on 2026-09-08), I ran one separately authorized comparison using **`openai/gpt-6-astra`**. The local diagnostic model changed from Sol to Astra; the prompt and inference request options listed below remained unchanged. The key preflight returned HTTP 200 in 995 ms, followed by exactly one inference POST returning HTTP 403. The parsed numeric `error.code` was 403, and the allowlisted `error.metadata.error_type` observation was missing (absent or null). There was no automatic client retry or repair. The client has no actual-model or usage receipt for this attempt. Please also investigate the **17:15–17:16 UTC on 2026-09-07** window and confirm its rejection reason, upstream reachability and recorded charge, if any. The same status across the two requested models does not establish the cause.

## 原始两次 Sol 草稿（历史事实保留）

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
