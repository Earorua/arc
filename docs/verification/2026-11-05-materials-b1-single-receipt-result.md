# Gate 1B：B1 单笔合成取证结果

2026-11-05，Asia/Shanghai。**推理已完成，费用已结算；B1 仍为 `BLOCKED`，B2 尚未开始。** 本次没有部署、远程迁移或发送真实用户资料。

## 实际结果

| 项目 | 结果 |
| --- | --- |
| 授权 | 持有人 19:28:06 确认改用 PowerShell，沿用一次合成推理、0.075 USD 上限及已接受的合成句缓存边界。实际执行窗口截至 19:45:40。 |
| 输入 | 固定合成 SQL 练习句。完整 key 由持有人在 PowerShell 隐藏输入，没有保存到报告或源码。 |
| 发送与读取 | **1 次推理 POST，3 次自动 generation GET**。发送名额已消耗，不得删除原运行目录后重试。 |
| 聊天回执 | `moonshotai/kimi-k3.1-pro`，`Moonshot AI`。输入 553，完成 1,840 token，其中 reasoning 1,745、缓存输入 0。 |
| 费用 | **19,506 microUSD = 0.019506 USD**；`settled`，未决预留 0，未超预算。553 × 2 + 1,840 × 10 = 19,506 microUSD。 |
| 时间 | 19:41:48.804 预留，19:42:53.234 记录聊天回执，19:42:57.904 结算。 |
| 自动核验 | `productionAudit=metadata-unavailable`、`comparison=unverified`。未取得可用的 generation API 响应；原结果保持不变。 |

[脱敏机器结果](materials-gate-1b-b1/2026-11-05-single-receipt-result.json)包含原始私有账本与结果文件的摘要。已核对授权一致性、5 条事件顺序、回执摘要、时限、请求计数、费用及 16 个固定程序文件。此项离线证据核对通过，不等于 B1 通过。

## 账户只读核对

随后在已登录的 `materials-b2` 工作区查看历史日志，未运行新的推理。账户显示只有 1 次请求；对应 Generation ID 的 SHA-256 与本机聊天回执完全一致。

- 网页记录的唯一 provider response 为 `Moonshot AI`、HTTP 200，endpoint ID 为审定标准端点 `a3fafaac-f097-4ef1-86b3-842854dad5c6`。
- 原生输入、完成、reasoning token 分别为 553、1,840、1,745；`usage=usage_upstream=0.019506`。latency 2,379 ms，generation time 62,886 ms。
- 网页使用带日期的 canonical model `moonshotai/kimi-k3.1-pro-20261023`；聊天响应使用短模型名。网页的 `generation_id`、`usage` 等字段也不同于 generation API 的 `data.id`、`total_cost`。
- I/O logging 仍未启用。报告只保存允许的回执元数据，实际 Generation ID 仅存于本机受控目录，未发送给官方支持。

[账户页面的脱敏摘录](materials-gate-1b-b1/2026-11-05-account-ui-receipt.json)明确标注来源为网页，不冒充 API 原始响应。它证明这笔请求的账户记录、标准端点和费用；**尚不能证明该普通 key 的 API 查询已成功，也不能证明 API 使用哪一种模型标识。**

## 尚未确定的原因

固定取证工具未保存每次失败 GET 的 HTTP 状态码，因此不能从现有结果区分记录可用时间、临时网络/服务异常、权限等原因。官方 API 文档列出了 401、404、429 等不同错误，但不能据此推断本次实际状态。[generation API 文档](https://openrouter.ai/docs/api/api-reference/generations/get-generation)

网页记录存在不表示当时的自动查询已成功。没有修改旧账本、把 `unverified` 改为通过，或放宽模型/路由校验。

## 下一步：只读一次已有回执

已准备独立的[只读程序](materials-gate-1b-b1/read-existing-receipt.mjs)与[PowerShell 隐藏输入入口](materials-gate-1b-b1/read-existing-receipt.ps1)。由持有人明确运行后，仅允许对已核对 ID 的 `GET /api/v1/generation` **读取一次**，不包含推理 POST、不发送资料正文、没有新增推理费用。

入口核对相同专用 key 的指纹、原已完成请求及 Generation ID 摘要；仍验证 16 个固定文件。它使用独立的 `metadata-readonly/api-read-v1` 目录记录读取次数、HTTP 状态及脱敏字段，不覆盖原取证结果，不自动重试。读取限时 30 秒、响应上限 128 KiB、禁止重定向。实际 API 模型标识按原样保留，不把 canonical ID 自动改成短模型名。

5 项离线测试通过，覆盖仅 GET 一次、重复执行拒绝、密钥/ID 绑定、HTTP 失败不保留正文、错误回执及超大响应拒绝；PowerShell 语法检查通过。[测试](materials-gate-1b-b1/read-existing-receipt.test.mjs) · [验证记录](materials-gate-1b-b1/2026-11-05-readonly-helper-verification.json)

在本机 PowerShell 运行下面的命令，看到 `READ ONLY` 提示后再隐藏输入 key。此次人工执行是对额外一次只读查询的明确选择；无需重开推理名额。

```powershell
& 'C:\Users\XF\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe' -NoProfile -File 'C:\Users\XF\.codex\worktrees\materials-receipt-accounting\ui-warm-precision\docs\verification\materials-gate-1b-b1\read-existing-receipt.ps1'
```

若取得 HTTP 200，核对实际 API 字段并离线回放，依据实证判断是否需要修正明确的模型标识映射；若仍失败，保存实际状态并停止。B2、补充资料评测、隔离环境和公开发布继续沿用各自的验收与授权要求。
