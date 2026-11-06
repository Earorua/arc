# B2 第二次质量评测授权单

**单号 `B2-KIMI-20261106-R2`，待持有人批准。** 申请使用候选 `88d07bf921a4` 重新评测 24 份冻结合成资料。**其中包括已在 R1 计费、评分为空的 `resume-01`**。R1 已按停发规则封存，本单须独立批准及签发。[R1 结果](../../verification/2026-11-06-materials-b2-r1-result.md) · [修复验收](../../verification/2026-11-06-materials-b2-lookup-repair.md)

| 决策项 | R2 约定 |
| --- | --- |
| 资料与用途 | 12 份合成简历、12 份合成 JD，含 18 份普通及 6 份边界样例。按原顺序发送固定系统提示、资料类型与原文分段。新候选在拦截传输下重新构造的 **24 份付费请求体 SHA-256 均与 R1 待审值一致**。金标准和评分器留在本机。 |
| 路由 | `materials-b2` 普通专用 key，OpenRouter / Moonshot AI。chat 锁定 `moonshotai/kimi-k3.1-pro`，generation 锁定 `moonshotai/kimi-k3.1-pro-20261023`，唯一 tag 为 `moonshotai/mxfp4`，成功端点 UUID 为 `a3fafaac-f097-4ef1-86b3-842854dad5c6`。关闭回退。 |
| 推理与查询 | 单进程串行，最多 **24 次推理 POST**，每份至多一次。每份最多 **3 次只读 generation GET**，整轮至多 72 次。首读立即，可重试时目标为第 10、第 20 秒，遵守服务端等待提示及 30 秒总限时。 |
| 时间 | 明确批准后 **2 小时内**可发起新推理，每次交付传输层前检查时限。单次模型 HTTP 最多 180 秒，整套评测最多 85 分钟。在途请求按原限时收尾结算。 |
| 费用 | 每百万输入/输出 token 分别 2.00/10.00 USD，输出含 reasoning。每份按 16,000 输入、4,096 输出顶格预留 **0.072960 USD**，单次配置上限 **0.075 USD**。全轮顶格预留 **1.751040 USD**，请求批准的总上限 **2.00 USD**。 |
| 情景估算 | 若每份使用 2,000–4,000 输入、1,000–2,000 总输出 token，24 份约 **0.336–0.672 USD**。已知 R1 首份实收 0.035662 USD，R2 按本轮实际回执结算。 |
| 隐私 | 启动前核对 `materials-b2-zdr` 严格 ZDR、排除 Safety Retention、关闭正文日志、训练、公开提示、外部追踪、平台响应缓存及 Moonshot BYOK。上游可使用内存隐式缓存，最长保留期及关闭方式尚无供应方保证。需持有人接受**本轮 24 份合成资料**的这个边界。 |
| 核验与停发 | 必须核对回执 ID、chat 与 generation 模型、唯一成功端点、用量及精确费用。每次 GET 保留脱敏的状态码、固定类别及相对耗时。任何回执未核验、费用不明、过期或账本故障均停止后续发送，可归属费用据实结算。仅质量落线而有完整回执时继续收集本轮余下结果。 |

11 月 6 日 17:09（北京时间）再次读取公开模型、标准端点与 ZDR 目录，tag、日期版本、价格和隐私分类均匹配。若专用 key 此后仅有本项目已知 0.055168 USD 支出，其 2.00 USD 生命周期限额理论剩余 **1.944832 USD**。启动前只读核对实际 key 剩余额度与可用 Credits，二者均须覆盖 1.751040 USD。充值及提额单独办理。[端点价目](https://openrouter.ai/api/v1/models/moonshotai/kimi-k3.1-pro/endpoints) · [ZDR 缓存边界](https://openrouter.ai/docs/guides/features/zdr) · [R2 脱敏预检](../../verification/materials-gate-1b-b2/2026-11-06-r2-authorization-preflight.json)

## 冻结对象与执行

| 项目 | 审阅值 |
| --- | --- |
| 产品提交 / tree | `88d07bf921a45dd33414436c718cfa039d97a849` / `101ec6bf574a81a31c52c5031c4ae4d3c77ba1bc` |
| R2 预检附件 SHA-256 | `923533efd83c91361116c14df817ba725f7a6c99af39fa46cb45e2a445d3fa1d` |
| 待审设置 SHA-256 | `e77ac7703652018d0d1c6247a75f7cdfd5b3ab1780cdf94c9b8ef0d3ab863c72`，当前 `qualified:false`、授权字段留空 |
| 签发配置投影 / 语料 SHA-256 | `ec56126eff54568bbd9960ad050c7311b137cb0ac44c2f42e0ea506c6c81718f` / `69e5ddd1005f12abf24483e10dd235629ef309ba3a84e922166963ccd9aed750` |
| 唯一拟用 runId | `materials-b2-kimi-timing-r2` |
| 唯一本机执行目录 | `C:/Users/XF/.codex/worktrees/materials-receipt-accounting/ui-warm-precision` |
| 账本位置 | 该目录下 `work/materials-qualification/materials-b2-kimi-timing-r2/ledger.jsonl` 和 `result.json`。本轮预检确认新账本及主机启动标记均未使用。 |

获批后，操作人复核账户、候选、费率和新名额，绑定实际批准消息、时间、截止点、本单 Git 提交与预检摘要。正式设置只填写 runId、资格位、授权标识及时间等原定六处，记录文件哈希。持有人在**自己常用的 PowerShell** 隐藏输入同一专用 key。指纹匹配后，以仓库外 `quality-approvals/` 下的排他启动标记占用本 runId，再启动冻结的单 worker 资格用例。初始输入失败可在原终端查看提示。已占用启动名额时封存并对账。[正式资格入口](../../../tests/qualification/document-model.qualification.ts) · [待审设置](../../verification/materials-gate-1b-b1/b2-settings.canonical-model.review.json) · [源码与构建证明](../../verification/materials-gate-1b-b2/r2-candidate/candidate.json)

整轮通过需 **24 个唯一、已核验且已结算的回执**，18/18 普通样例可预填，6/6 边界样例通过，适用关键项召回和 JD 分类正确率各至少 90%，保留来源合法率 100%，未决预留为 0。真实元数据若晚于本轮查询窗口，首份仍可能产生费用后停发。6 份补充资料、真实用户资料、B3/B4 云资源与生产发布另行授权。

## 持有人回复

> 批准 B2-KIMI-20261106-R2，允许在列明的 Kimi 标准端点重新提交这 24 份合成简历和 JD，包括 R1 的首份。最多 24 次推理、每份最多 3 次只读回执查询，总额不超过 2.00 美元，自本次回复起 2 小时内可发起推理。我接受本轮合成资料的上游隐式缓存边界，请在启动核验通过后执行。
