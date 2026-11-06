# B2 合成简历与岗位 JD 质量评测授权单

**单号 `B2-KIMI-20261106-R1`，待持有人批准。** 本轮要验证 Kimi 能否把简历经历、技能和 JD 要求提取成带原文引用的候选项，让用户直接核对。评测用 12 份合成简历和 12 份合成 JD，当前真实评测进度为 **0/24**。批准范围限定于这一次本机质量评测。6 份补充资料、真实用户资料、云资源、迁移、部署及公开发布分别审批。

## 批准的对象

| 项目 | 本轮约定 |
| --- | --- |
| 数据 | 依次处理 `resume-01…09`、`jd-01…09`、`resume-10…12`、`jd-10…12`。共 18 份普通样例、6 份边界样例。只向模型发送固定系统提示、资料类型和带 ID 的原文分段。金标准和评分器留在本机。 |
| 处理方 | `materials-b2` 专用工作区及普通 key，经 OpenRouter 调用 Moonshot AI。请求模型 `moonshotai/kimi-k3.1-pro`，只允许标准端点 `moonshotai/mxfp4`，关闭回退。 |
| 回执 | 聊天回执须匹配请求模型。generation 回执须匹配 `moonshotai/kimi-k3.1-pro-20261023`、`Moonshot AI` 及唯一成功端点 `a3fafaac-f097-4ef1-86b3-842854dad5c6`，并对齐同一回执 ID、token 与费用。 |
| 次数 | 最多 **24 次推理 POST**，单进程串行，每份最多一次。每个已发请求最多 **3 次只读 generation GET**，全轮最多 72 次。付费重试为 0。 |
| 时间 | 从持有人明确批准的时刻起 **2 小时**。每次交给传输层前检查截止时间，到期停止新 POST。已发请求按原限时完成回执核验与结算。单次模型 HTTP 最多 180 秒，每份回执查询合计最多 30 秒，冻结套件总限时 85 分钟。 |
| 输出 | 24 行逐份评分、来源与边界检查、处理时延、实际路由和费用，以及因停发而待评测的样例清单。结果供判断是否进入 B3。 |

B1 已用一笔合成推理确认短模型名与日期版本的对应关系。原有三次自动查询当时未取得可用回执，随后由同一专用 key 只读查询成功。故本轮首份也可能已经计费、随后因回执未核验而停发。[B1 实际结果](../../verification/2026-11-05-materials-b1-single-receipt-result.md)

## 费用与隐私

11 月 6 日 15:51（北京时间）复核公开模型、端点及 ZDR 目录。标准端点每百万输入 token 为 **2.00 USD**，输出含思考 token 为 **10.00 USD**，缓存读取为 **0.20 USD**。预算按输入全价计算。[端点价目](https://openrouter.ai/api/v1/models/moonshotai/kimi-k3.1-pro/endpoints) · [公开快照摘要](../../verification/materials-gate-1b-b2/2026-11-06-authorization-preflight.json)

| 金额 | 用途 |
| ---: | --- |
| **0.336–0.672 USD** | 情景估算。若每份使用 2,000–4,000 输入和 1,000–2,000 总计费输出 token，24 份合计为此区间。实际费用按回执汇总。 |
| **0.072960 USD/份** | 按 16,000 输入和 4,096 输出上限计算的发送前预留。单次配置上限为 0.075 USD。 |
| **1.751040 USD** | 24 份全部按顶格预留所需额度。启动前，专用 key 剩余额度和可用 Credits 均须至少覆盖此金额。 |
| **2.00 USD** | 本轮请求批准的总上限。既有 key 的生命周期限额也是 2.00 USD，两者共同约束支出。充值或调高限额须另行决定。 |

B1 已结算 **0.019506 USD**。若此后只有这笔支出，key 理论剩余 **1.980494 USD**，覆盖全轮顶格预留后还有 **0.229454 USD**。11 月 4 日账户余额曾核实足够，**本次准备只复核了公开价目，执行时以账户后台的实际余额和 key 剩余额度为准**。[工作区与费用记录](../../verification/2026-11-04-materials-gate-1b-b1-review.md#7-专用账户与后继候选跟进)

专用 key 须继续指派给 `materials-b2-zdr`，`All other models` 选择严格 `ZDR only` 并排除 Safety Retention。正文日志、训练、公开提示、外部追踪、平台响应缓存和 Moonshot BYOK 都须关闭。请求固定 `zdr=true`、`data_collection=deny`、`allow_fallbacks=false`。**本次需要持有人接受的隐私边界**是上游仍可对这 24 份合成资料使用内存隐式缓存。Moonshot 的最长保留期限及关闭方式尚未得到供应方确认。工单 `T-10233` 的结论、平台安全审查例外及全球网关适用范围已记录。[OpenRouter ZDR 政策](https://openrouter.ai/docs/guides/features/zdr) · [上游缓存说明](https://openrouter.ai/docs/guides/best-practices/prompt-caching) · [账户与工单记录](2026-11-04-materials-kimi-account-evidence.md)

## 签发与本机执行

| 绑定项 | 审阅值 |
| --- | --- |
| 源码候选 | `2bcff0964d1238b10bf8acc3196a15b8479edbe4`，tree `4005dfba35753467e23bd3e71eaafa39222479be` |
| 待审设置文件 SHA-256 | `e77ac7703652018d0d1c6247a75f7cdfd5b3ab1780cdf94c9b8ef0d3ab863c72` |
| 本单预检附件 SHA-256 | `ce04ca6bed58a582f4ed81b84d7396ad200450395abaedbdee16cadf84c8fd34` |
| 配置摘要 | `ec56126eff54568bbd9960ad050c7311b137cb0ac44c2f42e0ea506c6c81718f`，按批准后 `qualified=true` 的配置投影计算 |
| 语料 SHA-256 | `69e5ddd1005f12abf24483e10dd235629ef309ba3a84e922166963ccd9aed750` |
| 拟用 runId | `materials-b2-kimi-2bcff09-r1`，本次已查验正式账本位置可用 |
| 唯一执行目录 | `C:/Users/XF/.codex/worktrees/materials-receipt-accounting/ui-warm-precision` |
| 本机账本 | 上述目录下 `work/materials-qualification/materials-b2-kimi-2bcff09-r1/ledger.jsonl`，结束时同目录生成 `result.json` |

待审设置当前为 `qualified:false`，批准人、批准时间由正式审批记录提供，runId 和授权字段尚未签发。附件保留公开目录响应摘要、每份实际请求体的 SHA-256 和复核计数。[待审设置](../../verification/materials-gate-1b-b1/b2-settings.canonical-model.review.json) · [冻结源码清单](../../verification/materials-canonical-model-fix/candidate.json) · [预检附件](../../verification/materials-gate-1b-b2/2026-11-06-authorization-preflight.json)

持有人明确批准后，操作人按以下顺序执行。

1. 在已登录后台只读复核专用 key、有效护栏、日志/缓存/BYOK 设置与可用额度。在本机再次比对源码、语料、配置、端点和价目。记录核验时间及脱敏结果。条件有变时停止签发并提交差异。
2. 把持有人回复编号、实际批准时刻、截止时刻、本单所在 Git 提交及预检附件摘要写入独立的受限审批记录。由待审 JSON 派生正式设置，仅填写顶层 `runId`、`qualification.qualified`、`authorization.id`、`authorization.runId`、`authorization.approvedAt`、`authorization.expiresAt` 六处。记录正式文件字节 SHA-256，并在启动前再次比对。正式设置与私有账本保存在 Git 忽略或仓库外的受限位置。
3. 冻结运行器按工作目录隔离账本。因此授权只绑定表中的本机绝对路径和 runId。操作人在同一用户配置目录的 `.arc-materials/gate-1b/materials-b2/quality-approvals/` 为该 runId 以排他新建方式登记一次启动标记（`FileMode.CreateNew`），再从指定工作目录启动。标记或运行目录已存在时，保留记录并进入对账。换检出目录、进程中断或过期都不能重置名额。
4. 持有人在本机 PowerShell 隐藏输入 `materials-b2` key。操作人按 B1 已登记的工作区指纹在内存中核对，匹配后仅向该次子进程注入专用 key、复核后的 settings 和启用标记。入口为 `vitest.materials-qualification.config.ts` 中唯一的资格用例。进程结束后清除凭据环境。审批材料和公开报告只保留必要元数据，公开回执 ID 使用摘要。[资格入口](../../../tests/qualification/document-model.qualification.ts) · [独占账本实现](../../../scripts/materials-qualification-journal.ts)

正式签发和隐藏输入均属于获批后的操作。本次已通过 37 项离线专项，并使用过期的内存测试设置和模拟传输逐一核对 24 份请求体、路由和日期版本回执。在独立临时账本中验证重复启动被拒绝，正式 runId 处于未使用状态。

## 通过与停发标准

- **质量通过**要求 18/18 份普通样例都可预填，6/6 份边界样例通过。每份适用样例的关键项召回率至少 90%，JD 必备/加分分类正确率至少 90%，保留条目的来源合法率为 100%。同时检查原文引用、需用户核对的高影响项及禁止输出。
- **账务通过**要求 24 次推理对应 24 个唯一、已核验且已结算的回执，所有评分行齐全，`heldMicroUsd=0`、`stoppedReason=null`、`passed=true`。原始账本与结果私下封存，汇报实际金额、逐份状态及失败原因。[资格运行器](../../../scripts/materials-qualification-runner.ts) · [评分器](../../../tests/helpers/document-quality-evaluation.ts)
- **立即停发**适用于过期、预留或落盘失败、回执缺失/重复、模型或端点不符、费用冲突/超界等情况。可归属且确定的费用据实结算，未知项保留预留，并报告尚未发送的样例。仅抽取质量落线且回执与费用已核验时，继续收集同轮余下样例，整轮保留失败结论。

## 持有人回复

按定稿的 Gate 1B 计划，B2 使用独立的付费轮次与资料范围。若同意本单，可直接回复以下文字。批准时间以实际回复为准，密钥只在本机输入。[定稿验收计划](../plans/2026-11-04-private-materials-gate-1b-acceptance.md)

> 批准 B2-KIMI-20261106-R1。仅授权这 24 份合成简历和 JD，在材料所列 Kimi 标准端点上最多推理 24 次，每份最多 3 次只读回执查询。总额上限 2.00 美元，从本次回复起 2 小时内可发起推理。我接受这 24 份合成资料的上游隐式缓存边界。请在账户与启动前核验通过后执行。
