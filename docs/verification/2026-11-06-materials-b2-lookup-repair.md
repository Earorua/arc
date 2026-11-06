# B2 回执查询的离线修复与验收

**11 月 6 日，后继候选 `88d07bf921a4` 已通过离线验收。** 在模拟回执第 15 秒可见时，新候选能在第 20 秒核验同一笔推理，并把三次读取的结果写入账本。R2 真实质量评测仍为 **0/24**。[源码与可还原包](materials-gate-1b-b2/r2-candidate/candidate.json) · [机器验证记录](materials-gate-1b-b2/r2-candidate/verification.json)

## R1 揭示的问题

R1 首份聊天返回后 4.858 秒内用完 3 次 generation GET。旧代码在两次可重试响应后分别等待 1 秒和 2 秒，快速 HTTP 响应会让三次机会集中在窗口开头。账本只保留尝试次数和最终 `metadata-unavailable`。具体状态码、上游原因和当时的回执可用时刻仍缺乏证据。OpenRouter 文档列出了 404、429 等多种响应，本次查询策略按本地 30 秒时限设计。[封存的 R1 结果](2026-11-06-materials-b2-r1-result.md) · [OpenRouter generation API](https://openrouter.ai/docs/api/api-reference/generations/get-generation)

## 改动与边界

- 首次读取立即进行。快速可重试响应后的第 2、第 3 次读取分别以窗口第 10、第 20 秒为目标。慢响应后至少间隔 1 秒。有效的 `Retry-After` 可延后下一次读取，所需等待达到剩余窗口时立即结束。单笔仍最多 3 次 GET，共用 30 秒，付费 POST 最多一次。秒数与三种 HTTP-date 均通过测试。[查询器](../../worker/document-executor/generation-receipt.ts) · [HTTP 日期与等待上限](../../worker/document-executor/metadata-retry.ts) · [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#section-5.6.7)
- 每条新审计可保留最多 3 个 `metadataLookups`，记录本次 GET 起止毫秒偏移、HTTP 状态或 `null`、固定结果类别和可选的有界等待毫秒数。所有偏移和等待值封顶 30,000。旧版仅有计数的记录仍可读取，新增记录必须满足次数和时间顺序。正文、异常消息、URL 和原始标头留在审计字段之外。[审计契约](../../app/server/documents/provider-receipt.ts)
- `record` 表示拿到了可解析的记录。实际模型、唯一成功端点、token、精确费用与价格上限全部通过后，`audit.status` 才能是 `verified`。403、限流、重定向、传输错误、正文解析错误、异常 200、超时和取消都可分辨。迟到的响应体会取消，返回后的审计快照保持稳定。
- B2 在每份结算时将完整新审计写入持久检查点。核验失败会停发并隔离候选，可归属的费用据实结算，费用冲突或未知继续保留预留。补充资料采集器仍受单文档 **1 次 GET** 的独立限制，现可保留其实际 HTTP 状态。

## 证据

| 检查 | 本轮结果 |
| --- | --- |
| 首轮复现 | 旧实现中 12 项查询行为断言、2 项日志/采集断言失败。旧模拟在回执第 15 秒可见时耗尽读取名额。 |
| 专项 | 审计、资格运行、补充资料、模型身份、生产与验收准入 **6 套 170/170**。包含 404 后延迟可见、429 后遵循等待、逾窗停止、迟到成功和拒绝、输入取消、受限 GET 及下一份停发。 |
| 审查整改 | HTTP 200 的字符串/数组信封、两种旧式 HTTP 日期和超时后的异步拒绝均先复现再修复。中间回归有 4 项失败，最终固定源码全仓通过。独立审查无剩余重要问题。 |
| 全仓与静态检查 | **355 套、7,566/7,566**。附加 Node **290/290**，构建后页面 **5/5**。干净源目录类型检查退出 0，lint 0 错误、4 条既有 Research 警告。 |
| 实证兼容 | 使用 B1 的真实脱敏配对数据做离线回放，第一次模拟 GET 即 `verified`，网络请求和推理均为 0。[回放输出](materials-gate-1b-b2/r2-candidate/paired-replay.json) |
| 发布准备 | 关闭态构建 **390** 个文件，逐个复核哈希。另使用历史站点绑定与虚构资源在本机验证关闭态和模拟生产态打包，两端合计 4 次 Wrangler dry-run。真实时钟拒绝过期的测试授权，云部署、远程迁移和模型调用均为 0。[打包与 dry-run](materials-gate-1b-b2/r2-candidate/public-package-proof.json) |

源码包从 `2bcff0964d12` 基础提交在独立空库还原，严格 Git 完整性检查通过。干净构建的 915 个产品/测试/配置文件与新提交逐一匹配。产物树 SHA-256 为 `ed3f018c4cd972af6eeea4e0da60508ffc19ca52d8b44db4abc2818b0137c7a9`。

R1 私有封存账本与结果的摘要再次与原报告相符。本轮新增真实推理、已有回执的真实 GET 及推理费用均为 0。R1 和 B1 累计已结算 **0.055168 USD**。下一轮仍需实际验证该端点是否能在 30 秒内提供可核验元数据，并取得完整质量评分。[R2 授权单](../superpowers/runbooks/2026-11-06-materials-b2-r2-authorization.md)
