# Gate 1B：B1 单笔合成取证结果

2026-11-05，Asia/Shanghai。**普通 key 读取与配对回执技术核验通过；完整 Gate 1B 尚未通过，B2 尚未开始。** 累计仍为 1 次合成推理、0.019506 USD。额外只读查询与离线修复没有新增推理或费用，没有部署、远程迁移或发送真实用户资料。

## 最新结论：独立的只读查询已完成

持有人回复“现在运行命令并输入密钥”，在本机再次隐藏输入同一专用 key 后，独立程序于 **20:25:48.387—20:25:49.762** 对已有回执执行一次 GET，返回 **HTTP 200**。普通 key 读取自身回执的权限已由实际 API 响应证明。

- generation API 的模型为 `moonshotai/kimi-k3.1-pro-20261023`；chat 仍是 `moonshotai/kimi-k3.1-pro`。
- 只有一个成功 provider response：HTTP 200、`Moonshot AI`、标准端点 UUID `a3fafaac-f097-4ef1-86b3-842854dad5c6`。
- ID 摘要、输入 553、完成 1,840、reasoning 1,745 token 及费用 0.019506 USD 均一致；latency 2,379 ms，generation time 62,886 ms。
- 累计读取为原 3 次自动 GET 加本次 1 次人工发起 GET；没有新增推理。原发送名额和 `metadata-readonly/api-read-v1` 的只读名额均已消耗，不能清空目录重试。

[实际 API 脱敏证据](materials-gate-1b-b1/2026-11-05-readonly-api-result.json) · [真实配对元数据](materials-gate-1b-b1/2026-11-05-receipt-pair.redacted.json)

同一组回执在未修改的冻结程序中复现为 `model-mismatch`。官方模型目录明确将 alias 对应到该日期版本。修复新增显式 `receiptRoute.generationModel`：chat 仍精确匹配请求模型，generation 精确匹配审定版本，没有去掉日期后缀或放宽其他校验。新字段进入配置摘要和授权比对，生产与补充资料入口锁定该版本。[旧程序回放](materials-gate-1b-b1/2026-11-05-frozen-pair-replay.json) · [官方目录](https://openrouter.ai/api/v1/model/moonshotai/kimi-k3.1-pro) · [目录摘录](materials-gate-1b-b1/2026-11-05-model-identity-catalog.json)

修复后的产品校验器离线回放得到 **`verified` / `compatible`**，费用及 reasoning 对账一致，网络请求为 0。回放本身不证明来源、不授予推理权限；来源来自前述实际 API 读取。原始付费运行的 `unverified`、账本、旧配置及程序哈希不变。[新回放](materials-gate-1b-b1/2026-11-05-canonical-pair-replay.json) · [可复跑入口](materials-gate-1b-b1/replay-canonical-pair.mjs) · [修复验收报告](2026-11-05-materials-canonical-model-fix.md)

## 尚未完成的范围

新待审配置仍为 `qualified:false`，授权标识及时间留空。B2 的 24 份合成简历/JD、6 份补充资料、B3/B4 隔离环境和生产发布都未执行。上游隐式缓存的最长保留期限及关闭方式仍未公布；对这一个合成句的接受不扩展到其他语料或真实用户资料。[新待审配置](materials-gate-1b-b1/b2-settings.canonical-model.review.json)

当前仅可标记 **B1 回执技术证据 PASS**；不得据此标记完整 Gate 1B、真实质量评测或公开发布完成。以下是保留的原始过程记录。

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

[账户页面的脱敏摘录](materials-gate-1b-b1/2026-11-05-account-ui-receipt.json)保留当时来源为网页的标记，不冒充 API 原始响应。当时尚未证明的普通 key 读取权限和 API 模型字段，现已由上文独立 GET 补齐。

## 尚未确定的原因

固定取证工具未保存每次失败 GET 的 HTTP 状态码，因此不能从现有结果区分记录可用时间、临时网络/服务异常、权限等原因。官方 API 文档列出了 401、404、429 等不同错误，但不能据此推断本次实际状态。[generation API 文档](https://openrouter.ai/docs/api/api-reference/generations/get-generation)

网页记录或延后 API 读取成功，不表示当时的自动查询已成功，也不证明未来每笔都能在现有自动读取窗口取得回执。没有修改旧账本、把原始 `unverified` 改成通过，或凭猜测调整重试间隔。

## 已完成的只读入口（不再重复执行）

独立的[只读程序](materials-gate-1b-b1/read-existing-receipt.mjs)与[PowerShell 隐藏输入入口](materials-gate-1b-b1/read-existing-receipt.ps1)已经由持有人运行。它仅对已核对 ID 的 `GET /api/v1/generation` 读取一次，不包含推理 POST、不发送资料正文、没有新增推理费用。

入口核对相同专用 key 的指纹、原已完成请求及 Generation ID 摘要；仍验证 16 个固定文件。它使用独立的 `metadata-readonly/api-read-v1` 目录记录读取次数、HTTP 状态及脱敏字段，不覆盖原取证结果，不自动重试。读取限时 30 秒、响应上限 128 KiB、禁止重定向。实际 API 模型标识按原样保留，不把 canonical ID 自动改成短模型名。

5 项离线测试通过，覆盖仅 GET 一次、重复执行拒绝、密钥/ID 绑定、HTTP 失败不保留正文、错误回执及超大响应拒绝；PowerShell 语法检查通过。[测试](materials-gate-1b-b1/read-existing-receipt.test.mjs) · [验证记录](materials-gate-1b-b1/2026-11-05-readonly-helper-verification.json)

此前手动输入命令已完成使命。B2、补充资料评测、隔离环境和公开发布继续沿用各自的验收与授权要求；任何后续未核验回执或费用不明都会停止发送，不自动重做付费推理。
