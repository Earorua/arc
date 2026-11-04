# Kimi 标准端点单笔回执取证草案

2026-11-04。原工单已收到两封技术答复。OpenRouter 没有这条标准路由可分享的合成回执，公开示例使用其他模型及虚构值。本工作区没有历史记录。供应方也没有提供 Moonshot 自动缓存的最长保留期或文档化关闭方式。OpenRouter 对自身 ZDR 的定义允许短暂的内存隐式缓存。普通客服不能给出这条路由的合同承诺。[B1 核验](../../verification/2026-11-04-materials-gate-1b-b1-review.md) · [ZDR 中的缓存条款](https://openrouter.ai/docs/guides/features/zdr) · [Moonshot 缓存说明](https://openrouter.ai/docs/guides/best-practices/prompt-caching)

## 持有人可以作出的两个决定

- **仅为固定合成样例核验技术字段。** 若持有人接受这一个合成句可能经过保留时长未公布的上游缓存，可单独批准下表的单笔取证。通过该步只说明这一笔的回执、路由和账单字段是否可核对。B2、真实用户资料及公开发布分别审阅。
- **先取得书面隐私边界。** 若公开的缓存与保留条款不足以发送该样例，保留零调用。供应方给出的正式渠道是企业联系表。需明确适用主体、工作区、模型与端点，以及上游缓存介质、时长、训练用途和例外情况。正式条款到手后再决定是否取证。企业询证是单独的对外联系。[企业联系表](https://openrouter.ai/enterprise/form) · [数据处理协议](https://openrouter.ai/data-processing-agreement)

当前模型预算授权为 **0 USD**。现有 key 的 2.00 USD 累计上限与本次签批分别登记。

## 单笔草案

| 项目 | 唯一允许的范围 |
| --- | --- |
| 用途与输入 | 验证元数据、路由和费用。资料类型为 `supplement`，正文恰为 `SYNTHETIC: I practiced SQL joins using a toy database.`。UTF-8 无换行摘要为 `a55f4e0bb88852f445eefde1699a819634f4bcc742249fae69161ca53db96a23`。使用冻结产品候选 `7052aedd8a49` 的系统提示及分段逻辑。 |
| 请求 | 工作区 `materials-b2`，模型 `moonshotai/kimi-k3.1-pro`，provider tag 仅 `moonshotai/mxfp4`。沿用标准端点价格上限、严格 ZDR、拒绝收集、禁用回退、非流式 JSON 和无工具设置。工作区已关闭正文日志。 |
| 金额 | 输入最多 16,000 token，每百万 2.00 USD。输出最多 4,096 token（含思考），每百万 10.00 USD。按全价顶格预留 72,960 microUSD，即 **0.072960 USD**。拟批 **0.075 USD 总额、最多一次推理**。 |
| 时间与计数 | 单次授权有唯一 ID，授权回复后 2 小时内有效。专用进程实际启动后限 15 分钟，取两者较早的截止时间，均记录绝对 UTC。仅发一次 POST。该请求返回 ID 后，最多 3 次同源只读 generation GET，共用 30 秒。 |
| 费用与失败 | POST 交接前，独占进程先将本次授权、不可复用的发送名额与全额预留持久化。第二进程、重启或超时均不能获得第二个发送名额。若可能已发出且费用不明，保留预留，结束本轮。已知实收逐笔记录。 |
| 密钥与留存 | 持有人仅在本机专用进程中提供已保存的 key。受控目录只保存授权、摘要、必要的回执元数据、时间和账本。原始聊天正文、思考过程和凭据均不进入报告。向客服分享实际 generation ID 需另行决定。 |

单笔入口固定使用 `kimi-standard-receipt-v1`。完整请求体为 2,472 字节，SHA-256 为 `33277377b7611f2ad2b944ef7180331acd258f0fdf3df44aff684dddffd2ce20`。首次发送前核对请求字节、八个冻结依赖和本机工具摘要。B2 入口仍绑定完整 24 份语料和自己的授权格式。[单笔入口](../../verification/materials-gate-1b-b1/single-receipt-probe.mjs) · [B2 授权校验](../../../scripts/materials-qualification-runner.ts)

## 持有人批准后的本机操作

1. 记录持有人明确同意这一个合成句、缓存边界和 0.075 USD 上限的回复编号及 UTC 时间。从该回复起计两小时。当前没有这笔授权。
2. 在已登录的 `materials-b2` 工作区核对专用 key 的名称、2 USD 累计限额和已指派的 `materials-b2-zdr`。从该行的密钥详情或活动链接取得 64 位小写十六进制 key 标识。按官方说明，该值是密钥的 SHA-256。在自己的 PowerShell 7 终端运行下方第一条命令，在隐藏输入框录入这个标识。工具再做一次带工作区别名的摘要，只在本机保存。若页面无法提供可独立核对的标识，暂停在此步。[工作区密钥](https://openrouter.ai/workspaces/materials-b2/keys) · [官方指纹说明](https://openrouter.ai/docs/guides/overview/auth/oauth#deep-link-to-the-users-key)
3. 在同一台机器、同一系统账号运行第二条命令取得未签批模板。操作者将模板内的 `ownerApprovalRef`、`syntheticCacheAccepted`、`approvedAt` 和 `expiresAt` 填为真实决定和绝对时间，写入系统用户目录下 `.arc-materials/gate-1b/materials-b2/receipt-probe/authorization.json`。使用已登记的工作区密钥绑定值，逐项匹配已审入口。本地账本位于该目录下的同名 runId 子目录，所有工作树共用同一名额。账本、授权及密钥指纹均在 Git 工作树之外。
4. 持有人在自己的终端运行第三条命令。预检通过后，在隐藏输入框输入已保存的专用 key。运行器先在本机匹配指纹，凭据仅经专用子进程环境交接。工作区指纹、密钥值及授权文件均无需粘贴进聊天。专用进程的 15 分钟包含启动器等待输入的时间。已占用的 runId 不得清理后重试。[本机启动器](../../verification/materials-gate-1b-b1/invoke-single-receipt.ps1)

```powershell
pwsh -NoProfile -File ./docs/verification/materials-gate-1b-b1/invoke-single-receipt.ps1 -RegisterWorkspaceKey
node --import tsx ./docs/verification/materials-gate-1b-b1/single-receipt-probe.mjs --describe
pwsh -NoProfile -File ./docs/verification/materials-gate-1b-b1/invoke-single-receipt.ps1
```

## 怎样判断结果

已使用假凭据和模拟传输，从两个不同工作树的实际命令行入口同时使用同一份授权。两者合计向模拟传输交接一次 POST 和一次元数据 GET，换用另一个假 key 在占用名额前被拒绝。强制终止进程、丢失写入确认、写最终账单失败、时钟停滞和传输忽略取消均有离线覆盖。两边费用金额不同则逐笔保存两项观察，保留 72,960 microUSD 的预留；任一可信金额超过 0.075 USD 即标记超限。推理 POST 被重定向或返回非 200 时，本轮结束并保留全额预留，响应正文中的 ID 和报价不入账。元数据 GET 返回 HTTP 202 或 503 后只能重查同一笔。若 HTTP 200 回执内的尝试报告了状态，却没有一次为 200（如 503、202），则忽略该回执的费用。仍有可信聊天费用时按其实收结算，否则保留全额预留。磁盘只保存回执 ID 摘要。真实回执与真实质量样例数均为 0。[入口验证](../../verification/materials-gate-1b-b1/single-receipt-entry-verification.json) · [独立进程演练](../../verification/materials-gate-1b-b1/receipt-journal-process-verification.json)

1. 核对聊天与 generation 的 ID 对应、两个模型标识、唯一成功尝试、供应商及标准端点 UUID `a3fafaac-f097-4ef1-86b3-842854dad5c6`。费用或端点证据缺失，记录实际缺失处并结束。
2. 比较原生 prompt 和总 completion token、两个费用 JSON 数值，并标明 reasoning token 与时延字段有无。若两处都提供 reasoning 细分，比较其数值并核对各自未超过总输出。微美元取整前的费用差异也要记录。可从两份响应建立只含允许字段的本机文件，按原始 JSON 数值回放，维持两个 ID 的对应关系。
3. 记录当前 key 的实际读取结果、实收和剩余额度。单笔结果单独归档，B2 的 24 份语料均需独立运行。两批顶格预留合计为 **1.824000 USD**，B2 启动前按届时余额、价格和凭据重新核算。
4. 本地回放只比较输入字段。样例从何处取得、日期、同一笔请求的来历、账户权限和上游保留条款分别留证。供应方给的通用示例、合成回放或未知到期日均不能用来放行真实用户数据。

## 只读回放

在工作树根目录运行。JSON 顶层为 `chat` 与 `generation`，前者保留 ID、模型、可选供应商和 usage，后者保留 `data` 中审计用的 ID、模型、供应商、尝试列表、原生 token、总费及时延。字段名以测试夹具为例，先去除正文等非允许字段。共享占位符不能独立证明实际两份回执同源。

```powershell
node --import tsx --test docs/verification/materials-gate-1b-b1/replay-redacted-pair.test.mjs
node --import tsx docs/verification/materials-gate-1b-b1/replay-redacted-pair.mjs './private/redacted-pair.json'
```

入口只读取本地 JSON，固定 B1 草案和冻结回执校验器的 SHA-256。报告含输入文件摘要，不回显 generation ID。退出码 0 表示字段兼容，1 表示字段不兼容，2 表示输入或冻结摘要无效。已经用模拟响应验证费用取整、路由缺失、错误模型、回退、非预期字段和 reasoning 差异，取证入口的真实请求为 0。[回放工具](../../verification/materials-gate-1b-b1/replay-redacted-pair.mjs) · [离线对照](../../verification/materials-gate-1b-b1/replay-redacted-pair.test.mjs) · [验证记录](../../verification/materials-gate-1b-b1/receipt-replay-verification.json)
